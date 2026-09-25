import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const SCRIPT = path.join(import.meta.dirname, '..', 'scripts', 'setup-desktop.mjs');

/** Run the installer against a throwaway HOME so the real config is never touched. */
async function sandbox(initialConfig) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'viewforge-home-'));
  const dir = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Claude')
    : process.platform === 'win32'
      ? path.join(home, 'AppData', 'Roaming', 'Claude')
      : path.join(home, '.config', 'Claude');
  const file = path.join(dir, 'claude_desktop_config.json');
  if (initialConfig !== undefined) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, typeof initialConfig === 'string' ? initialConfig : JSON.stringify(initialConfig, null, 2));
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), YOUTUBE_API_KEY: '' };
  return {
    file,
    exec: (args = []) => run(process.execPath, [SCRIPT, ...args], { env }),
    read: async () => JSON.parse(await fs.readFile(file, 'utf8')),
    cleanup: () => fs.rm(home, { recursive: true, force: true }),
  };
}

test('--print changes nothing and shows a valid config block', async () => {
  const box = await sandbox();
  try {
    const { stdout } = await box.exec(['--print']);
    assert.match(stdout, /claude_desktop_config\.json/);
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    assert.ok(json.mcpServers.viewforge.command, 'must name a command');
    assert.match(json.mcpServers.viewforge.args[0], /mcp[\\/]server\.js$/);
    await assert.rejects(() => fs.access(box.file), 'print must not create the file');
  } finally {
    await box.cleanup();
  }
});

test('installing into a fresh machine creates the config', async () => {
  const box = await sandbox();
  try {
    await box.exec();
    const config = await box.read();
    assert.ok(config.mcpServers.viewforge);
    assert.equal(config.mcpServers.viewforge.env, undefined, 'no key given, so no env block');
  } finally {
    await box.cleanup();
  }
});

test('installing preserves other servers and unrelated settings', async () => {
  const box = await sandbox({
    mcpServers: { filesystem: { command: 'npx', args: ['-y', 'server-filesystem'] } },
    globalShortcut: 'Alt+Space',
  });
  try {
    await box.exec(['--key', 'AIzaTESTKEY0000000000000000000000000']);
    const config = await box.read();
    assert.deepEqual(config.mcpServers.filesystem, { command: 'npx', args: ['-y', 'server-filesystem'] });
    assert.equal(config.globalShortcut, 'Alt+Space');
    assert.equal(config.mcpServers.viewforge.env.YOUTUBE_API_KEY, 'AIzaTESTKEY0000000000000000000000000');
    await fs.access(`${box.file}.viewforge-backup`);
  } finally {
    await box.cleanup();
  }
});

test('reinstalling without a key keeps the key already configured', async () => {
  const box = await sandbox();
  try {
    await box.exec(['--key', 'AIzaKEEPME00000000000000000000000000']);
    await box.exec();
    const config = await box.read();
    assert.equal(config.mcpServers.viewforge.env.YOUTUBE_API_KEY, 'AIzaKEEPME00000000000000000000000000');
  } finally {
    await box.cleanup();
  }
});

test('--remove takes only Viewforge out', async () => {
  const box = await sandbox({ mcpServers: { other: { command: 'x' } } });
  try {
    await box.exec();
    await box.exec(['--remove']);
    const config = await box.read();
    assert.equal(config.mcpServers.viewforge, undefined);
    assert.ok(config.mcpServers.other, 'other servers must survive');
  } finally {
    await box.cleanup();
  }
});

test('a broken config file stops the installer instead of being overwritten', async () => {
  const box = await sandbox('{ "mcpServers": { oops, }');
  try {
    await assert.rejects(() => box.exec(), (error) => {
      assert.match(error.stderr, /not valid JSON/);
      return true;
    });
    const text = await fs.readFile(box.file, 'utf8');
    assert.match(text, /oops/, 'the original file must be left exactly as it was');
  } finally {
    await box.cleanup();
  }
});
