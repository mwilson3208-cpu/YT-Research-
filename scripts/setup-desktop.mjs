#!/usr/bin/env node
/**
 * Wires Viewforge into Claude Desktop.
 *
 * Finds the Claude Desktop config for this platform, backs it up, merges in a
 * "viewforge" MCP server entry pointing at this checkout, and leaves every
 * other server alone.
 *
 *   node scripts/setup-desktop.mjs                 # install
 *   node scripts/setup-desktop.mjs --key AIza...   # install with an API key
 *   node scripts/setup-desktop.mjs --print         # show the JSON, change nothing
 *   node scripts/setup-desktop.mjs --remove        # take it back out
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'mcp', 'server.js');
const ENTRY = 'viewforge';

function configPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

async function readConfig(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(text);
    return { config: parsed && typeof parsed === 'object' ? parsed : {}, existed: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { config: {}, existed: false };
    // A hand-edited file with a stray comma should stop us, not be overwritten.
    throw new Error(`${file} exists but is not valid JSON (${error.message}). Fix or move it, then run this again.`);
  }
}

function buildEntry(apiKey) {
  const env = {};
  if (apiKey) env.YOUTUBE_API_KEY = apiKey;
  return {
    command: process.execPath,
    args: [SERVER],
    ...(Object.keys(env).length ? { env } : {}),
  };
}

async function main() {
  const file = configPath();
  const apiKey = typeof arg('key') === 'string' ? arg('key') : process.env.YOUTUBE_API_KEY || '';
  const entry = buildEntry(apiKey);

  if (arg('print')) {
    console.log(`Claude Desktop config lives at:\n  ${file}\n`);
    console.log('Add this inside the top-level "mcpServers" object:\n');
    console.log(JSON.stringify({ mcpServers: { [ENTRY]: entry } }, null, 2));
    return;
  }

  const { config, existed } = await readConfig(file);
  config.mcpServers = config.mcpServers || {};

  if (arg('remove')) {
    if (!config.mcpServers[ENTRY]) {
      console.log('Viewforge was not in your Claude Desktop config. Nothing to remove.');
      return;
    }
    delete config.mcpServers[ENTRY];
    await backup(file, existed);
    await write(file, config);
    console.log('Removed Viewforge. Restart Claude Desktop for it to take effect.');
    return;
  }

  const replacing = Boolean(config.mcpServers[ENTRY]);
  // Keep a key that is already configured unless a new one was supplied.
  if (replacing && !apiKey && config.mcpServers[ENTRY].env?.YOUTUBE_API_KEY) {
    entry.env = { YOUTUBE_API_KEY: config.mcpServers[ENTRY].env.YOUTUBE_API_KEY };
  }
  config.mcpServers[ENTRY] = entry;

  await backup(file, existed);
  await write(file, config);

  const others = Object.keys(config.mcpServers).filter((name) => name !== ENTRY);
  console.log(`${replacing ? 'Updated' : 'Added'} Viewforge in ${file}`);
  if (others.length) console.log(`Left your other servers untouched: ${others.join(', ')}`);
  console.log(`YouTube API key: ${entry.env?.YOUTUBE_API_KEY ? 'set' : 'not set (sample data mode)'}`);
  console.log('\nNext: quit Claude Desktop completely and reopen it.');
  console.log('Then ask it something like: "Use Viewforge to find outlier topics in sleep stories."');
}

async function backup(file, existed) {
  if (!existed) return;
  const copy = `${file}.viewforge-backup`;
  await fs.copyFile(file, copy);
  console.log(`Backed up your previous config to ${copy}`);
}

async function write(file, config) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  process.exit(1);
});
