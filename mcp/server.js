#!/usr/bin/env node
/**
 * Viewforge MCP server.
 *
 * Speaks the Model Context Protocol over stdio so Claude Desktop can call the
 * research tools directly. Hand-rolled JSON-RPC rather than the official SDK,
 * which keeps the whole project at zero npm dependencies: nothing to install,
 * nothing to break when a transitive dependency moves.
 *
 * stdout carries protocol frames only. Everything human-readable goes to
 * stderr, which Claude Desktop shows in its MCP log.
 */
import '../server/config.js';               // loads .env, then fills settings
import { config, isLive } from '../server/settings.js';
import { TOOLS, TOOL_INDEX } from './tools.js';
import { exportDir } from './export.js';

const NAME = 'viewforge';
const VERSION = '1.0.0';

// Protocol revisions this server understands. It echoes the client's version
// when it is one of these, and otherwise answers with the newest it knows.
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

const log = (...parts) => process.stderr.write(`[viewforge-mcp] ${parts.join(' ')}\n`);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const reply = (id, result) => send({ jsonrpc: '2.0', id, result });

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Tool failures are reported in-band so Claude can read and react to them. */
const toolError = (id, message) => reply(id, {
  content: [{ type: 'text', text: `Viewforge could not complete that: ${message}` }],
  isError: true,
});

async function handle(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : LATEST_PROTOCOL;
      log(`initialize from ${params?.clientInfo?.name || 'unknown client'} (protocol ${protocolVersion})`);
      log(isLive() ? 'YouTube API key found: live mode' : 'No YouTube API key: sample data mode');
      return reply(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: NAME, version: VERSION },
        instructions: [
          'Viewforge researches YouTube so the user knows what to make before they record.',
          'A good order of work: viewforge_keywords or viewforge_trends to find a topic,',
          'viewforge_outliers to confirm a small channel could win it, viewforge_channel or',
          'viewforge_video to study what already works, then viewforge_titles and',
          'viewforge_hashtags to package it. Pass exportCsv to save the full 45-column grid.',
          isLive() ? '' : 'No API key is set, so results come from a bundled sample library, not live YouTube.',
        ].filter(Boolean).join(' '),
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'ping':
      return reply(id, {});

    case 'tools/list':
      return reply(id, {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.schema,
        })),
      });

    case 'tools/call': {
      const tool = TOOL_INDEX.get(params?.name);
      if (!tool) return toolError(id, `there is no tool named "${params?.name}".`);
      const args = params?.arguments || {};
      const started = Date.now();
      try {
        const text = await tool.run(args);
        log(`${tool.name} ok in ${Date.now() - started}ms`);
        return reply(id, { content: [{ type: 'text', text }] });
      } catch (error) {
        log(`${tool.name} failed: ${error.message}`);
        return toolError(id, hint(error));
      }
    }

    // Advertised capabilities do not include these, but some clients probe
    // anyway. An empty list is friendlier than a protocol error.
    case 'resources/list':
      return reply(id, { resources: [] });
    case 'prompts/list':
      return reply(id, { prompts: [] });

    default:
      if (isNotification) return;
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

/** Turn API failures into something the user can act on. */
function hint(error) {
  const reason = error.reason || '';
  if (reason === 'demo_mode') {
    return 'this tool needs live YouTube data. Add YOUTUBE_API_KEY to the Viewforge entry in your Claude Desktop config, then restart Claude Desktop.';
  }
  if (reason === 'quotaExceeded') {
    return 'the YouTube daily quota is spent. It resets at midnight Pacific.';
  }
  if (reason === 'keyInvalid' || reason === 'accessNotConfigured') {
    return `${error.message} Check the key in the Google Cloud console and confirm YouTube Data API v3 is enabled for that project.`;
  }
  return error.message;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      log('ignored a malformed frame');
      continue;
    }
    Promise.resolve(handle(message)).catch((error) => {
      log(`handler crashed: ${error.stack || error.message}`);
      if (message.id !== undefined && message.id !== null) {
        replyError(message.id, -32603, `Internal error: ${error.message}`);
      }
    });
  }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

log(`ready: ${TOOLS.length} tools, ${isLive() ? 'live' : 'sample'} mode, region ${config.region}`);
log(`CSV exports go to ${exportDir()}`);
