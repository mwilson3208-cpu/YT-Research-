import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Files the build script copies from the server into the browser bundle.
const MIRRORED = [
  ['server/settings.js', 'web/core/settings.js'],
  ['server/cache.js', 'web/core/cache.js'],
  ['server/metrics.js', 'web/core/metrics.js'],
  ['server/youtube.js', 'web/core/youtube.js'],
  ['server/service.js', 'web/core/service.js'],
  ['server/data/demo.js', 'web/core/data/demo.js'],
  ['server/tools/keywords.js', 'web/core/tools/keywords.js'],
  ['server/tools/titles.js', 'web/core/tools/titles.js'],
  ['server/tools/hashtags.js', 'web/core/tools/hashtags.js'],
  ['server/tools/spinner.js', 'web/core/tools/spinner.js'],
  ['server/tools/transcript.js', 'web/core/tools/transcript.js'],
  ['server/tools/comments.js', 'web/core/tools/comments.js'],
  ['public/css/app.css', 'web/css/app.css'],
  ['public/js/util.js', 'web/js/util.js'],
  ['public/js/table.js', 'web/js/table.js'],
  ['public/js/tools.js', 'web/js/tools.js'],
];

const read = (relative) => fs.readFile(path.join(ROOT, relative), 'utf8');

test('the web bundle is in sync with its sources (run `npm run build:web`)', async () => {
  for (const [source, copy] of MIRRORED) {
    const [a, b] = await Promise.all([read(source), read(copy)]);
    assert.equal(b, a, `${copy} is stale - rebuild with: npm run build:web`);
  }
});

test('nothing in the browser core reaches for a Node built-in', async () => {
  for (const [, copy] of MIRRORED) {
    if (!copy.endsWith('.js')) continue;
    const source = await read(copy);
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from\s+['"]node:/.test(withoutComments), `${copy} imports a node: module`);
    assert.ok(!/\brequire\s*\(/.test(withoutComments), `${copy} uses require()`);
    assert.ok(!/\bprocess\.env\b/.test(withoutComments), `${copy} reads process.env`);
    assert.ok(!/\b__dirname\b/.test(withoutComments), `${copy} uses __dirname`);
  }
});

test('the browser entry points exist and reference the shared core', async () => {
  const html = await read('web/index.html');
  assert.match(html, /Viewforge/);
  assert.match(html, /\.\/js\/app\.js/, 'module script must use a relative path so it works in a subfolder');
  assert.match(html, /\.\/css\/app\.css/);
  assert.ok(!/src="\//.test(html), 'absolute asset paths break hosting under a subpath');

  const api = await read('web/js/api.js');
  assert.match(api, /from '\.\.\/core\/service\.js'/);
  assert.match(api, /runtime: 'browser'/, 'the browser build must declare its runtime');

  const app = await read('web/js/app.js');
  assert.match(app, /loadSavedSettings/);
  assert.match(app, /openSettings/);
});

test('the browser build never ships a hard-coded API key', async () => {
  for (const relative of ['web/js/api.js', 'web/js/app.js', 'web/index.html', 'web/core/settings.js']) {
    const source = await read(relative);
    assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(source), `${relative} contains what looks like a real API key`);
  }
});

test('both builds carry the same tool list', async () => {
  const [a, b] = await Promise.all([read('public/js/tools.js'), read('web/js/tools.js')]);
  const ids = (source) => [...source.matchAll(/^\s{4}id: '([\w-]+)',$/gm)].map((match) => match[1]);
  assert.deepEqual(ids(b), ids(a));
  assert.ok(ids(a).length >= 15, `expected 15+ tools, found ${ids(a).length}`);
});

/* ---- Single-file build ---- */

const SINGLE = 'dist/viewforge.html';

test('the single-file build exists and is genuinely self-contained', async () => {
  const html = await read(SINGLE);
  assert.match(html, /^<!doctype html>/i, 'the double-click build needs a full document');
  assert.match(html, /<title>Viewforge/);

  // Nothing may be fetched from disk or the network: file:// blocks both.
  const externalScripts = html.match(/<script[^>]+src=/gi) || [];
  assert.deepEqual(externalScripts, [], 'external scripts will not load from file://');
  const links = html.match(/<link[^>]+href="(?!data:)[^"]*"/gi) || [];
  assert.deepEqual(links, [], 'external stylesheets will not load from file://');

  assert.match(html, /<style>/, 'CSS must be inlined');
  assert.match(html, /<script type="module">/, 'the bundle must be an inline module');
});

test('every shared module is inlined in the single file', async () => {
  const html = await read(SINGLE);
  for (const id of [
    'core/settings.js', 'core/cache.js', 'core/metrics.js', 'core/youtube.js',
    'core/service.js', 'core/data/demo.js', 'core/tools/keywords.js',
    'core/tools/titles.js', 'core/tools/hashtags.js', 'core/tools/spinner.js',
    'core/tools/transcript.js', 'core/tools/comments.js',
    'js/util.js', 'js/table.js', 'js/tools.js', 'js/api.js', 'js/app.js',
  ]) {
    assert.ok(html.includes(`__mod["${id}"]`), `${id} was not inlined`);
  }
  assert.match(html, /__req\("js\/app\.js"\)/, 'the bundle must call its entry point');
});

test('no bare import or export survives the bundle', async () => {
  const html = await read(SINGLE);
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.ok(!/^\s*import\s+[{*\w]/m.test(script), 'an unresolved import would throw at load');
  assert.ok(!/^\s*export\s+/m.test(script), 'an export statement is invalid inside the registry');
});

test('the single file ships no API key', async () => {
  const html = await read(SINGLE);
  assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(html));
});
