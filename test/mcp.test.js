import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const SERVER = path.join(import.meta.dirname, '..', 'mcp', 'server.js');

/** Speak MCP over stdio the way Claude Desktop does, and collect the replies. */
function mcpSession() {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, YOUTUBE_API_KEY: '', VIEWFORGE_EXPORT_DIR: path.join(import.meta.dirname, '..', '.test-exports') },
  });
  const pending = new Map();
  let buffer = '';
  let stderr = '';
  let nextId = 1;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const resolve = pending.get(message.id);
      if (resolve) { pending.delete(message.id); resolve(message); }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        setTimeout(() => reject(new Error(`${method} timed out. stderr: ${stderr}`)), 30000).unref();
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    raw(line) { child.stdin.write(`${line}\n`); },
    stderr: () => stderr,
    close() { child.stdin.end(); child.kill(); },
  };
}

test('the server completes an MCP handshake', async () => {
  const session = mcpSession();
  try {
    const response = await session.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'claude-ai', version: '1.0.0' },
    });
    assert.equal(response.result.protocolVersion, '2024-11-05', 'must echo a protocol version it supports');
    assert.equal(response.result.serverInfo.name, 'viewforge');
    assert.ok(response.result.capabilities.tools, 'must advertise tools');
    assert.match(response.result.instructions, /Viewforge/);
    session.notify('notifications/initialized');
  } finally {
    session.close();
  }
});

test('an unknown protocol version falls back to the newest supported', async () => {
  const session = mcpSession();
  try {
    const response = await session.request('initialize', { protocolVersion: '1999-01-01', capabilities: {} });
    assert.equal(response.result.protocolVersion, '2025-06-18');
  } finally {
    session.close();
  }
});

test('tools/list advertises every tool with a usable schema', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const { result } = await session.request('tools/list');
    assert.ok(result.tools.length >= 16, `expected 16+ tools, got ${result.tools.length}`);
    for (const tool of result.tools) {
      assert.match(tool.name, /^viewforge_[a-z_]+$/, `bad tool name: ${tool.name}`);
      assert.ok(tool.description.length > 40, `${tool.name} needs a fuller description`);
      assert.equal(tool.inputSchema.type, 'object');
      for (const required of tool.inputSchema.required || []) {
        assert.ok(tool.inputSchema.properties[required], `${tool.name} requires ${required} but never declares it`);
      }
      for (const [name, schema] of Object.entries(tool.inputSchema.properties || {})) {
        assert.ok(schema.description, `${tool.name}.${name} has no description`);
      }
    }
    assert.equal(new Set(result.tools.map((t) => t.name)).size, result.tools.length, 'duplicate tool names');
  } finally {
    session.close();
  }
});

test('every tool runs end to end and returns readable text', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const calls = [
      ['viewforge_status', {}],
      ['viewforge_keywords', { seed: 'faceless channel', depth: 'quick', limit: 10 }],
      ['viewforge_search_videos', { q: 'narration', maxResults: 5, limit: 5 }],
      ['viewforge_outliers', { q: 'narration', limit: 5 }],
      ['viewforge_trends', { limit: 5 }],
      ['viewforge_shorts', { q: 'facts', limit: 5 }],
      ['viewforge_channel', { input: 'Sidehustle Signal', videos: 10, limit: 5 }],
      ['viewforge_video', { input: videoUrl }],
      ['viewforge_comments', { input: videoUrl, limit: 30 }],
      ['viewforge_tags', { source: 'keyword', input: 'narration', limit: 10 }],
      ['viewforge_titles', { keyword: 'faceless channel', count: 8 }],
      ['viewforge_hashtags', { topic: 'faceless channel' }],
      ['viewforge_transcript', { input: videoUrl }],
      ['viewforge_spin', { text: 'This is a very important video. You do not need many people to make good money.' }],
      ['viewforge_compare_channels', { channels: ['Sidehustle Signal', 'Voice of Machines'], videos: 10 }],
      ['viewforge_playlist', { input: 'PLdemo123456789', videos: 10, limit: 5 }],
    ];
    for (const [name, args] of calls) {
      const { result } = await session.request('tools/call', { name, arguments: args });
      assert.ok(!result.isError, `${name} errored: ${result.content?.[0]?.text}`);
      const text = result.content[0].text;
      assert.equal(result.content[0].type, 'text');
      assert.ok(text.length > 60, `${name} returned almost nothing`);
      assert.ok(!text.includes('undefined'), `${name} leaked "undefined" into its output`);
      assert.ok(!text.includes('[object Object]'), `${name} leaked "[object Object]"`);
    }
  } finally {
    session.close();
  }
});

test('a bad tool name is reported in-band, not as a protocol error', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const { result, error } = await session.request('tools/call', { name: 'viewforge_nope', arguments: {} });
    assert.equal(error, undefined, 'a missing tool should not be a JSON-RPC error');
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /no tool named/);
  } finally {
    session.close();
  }
});

test('a missing required argument comes back as a readable tool error', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const { result } = await session.request('tools/call', { name: 'viewforge_search_videos', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /required/i);
  } finally {
    session.close();
  }
});

test('unknown methods return -32601 and notifications stay silent', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const response = await session.request('does/not/exist');
    assert.equal(response.error.code, -32601);
    // A notification carries no id and must produce no reply; if it did, the
    // next request would receive the wrong frame.
    session.notify('notifications/cancelled', { requestId: 99 });
    const { result } = await session.request('ping');
    assert.deepEqual(result, {});
  } finally {
    session.close();
  }
});

test('malformed input does not kill the server', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    session.raw('{ this is not json');
    session.raw('');
    const { result } = await session.request('ping');
    assert.deepEqual(result, {}, 'the server should still be answering after bad input');
  } finally {
    session.close();
  }
});

test('resources and prompts probes get empty lists rather than errors', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    assert.deepEqual((await session.request('resources/list')).result, { resources: [] });
    assert.deepEqual((await session.request('prompts/list')).result, { prompts: [] });
  } finally {
    session.close();
  }
});

test('nothing but protocol frames reaches stdout', async () => {
  const session = mcpSession();
  try {
    await session.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    await session.request('tools/call', { name: 'viewforge_status', arguments: {} });
    // The banner and per-call logging must go to stderr; anything on stdout
    // that is not JSON would break the client's framing.
    assert.match(session.stderr(), /ready: \d+ tools/);
  } finally {
    session.close();
  }
});
