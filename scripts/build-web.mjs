#!/usr/bin/env node
/**
 * Builds the static browser bundle in web/.
 *
 * The research engine (metrics, scoring, tools, demo data) is plain ES modules
 * with no Node built-ins, so the browser imports the very same files the server
 * uses. This script copies them into web/core/ keeping the directory shape, so
 * every relative import resolves without rewriting a single line.
 *
 * Output is a folder of static files. Drop it on any static host, or open
 * index.html through a local static server.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');

// Shared engine: server path -> web/core path (structure preserved).
const CORE_FILES = [
  'settings.js',
  'cache.js',
  'metrics.js',
  'youtube.js',
  'service.js',
  'data/demo.js',
  'tools/keywords.js',
  'tools/titles.js',
  'tools/hashtags.js',
  'tools/spinner.js',
  'tools/transcript.js',
  'tools/comments.js',
];

// Shared UI: identical in both builds.
const UI_FILES = [
  ['public/css/app.css', 'css/app.css'],
  ['public/js/util.js', 'js/util.js'],
  ['public/js/table.js', 'js/table.js'],
  ['public/js/tools.js', 'js/tools.js'],
];

const NODE_ONLY = /\b(?:from\s+['"]node:|require\s*\(|__dirname|process\.env)/;

async function copy(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  const source = await fs.readFile(from, 'utf8');
  await fs.writeFile(to, source);
  return source;
}

async function main() {
  let checked = 0;

  for (const relative of CORE_FILES) {
    const source = await copy(
      path.join(ROOT, 'server', relative),
      path.join(WEB, 'core', relative),
    );
    if (NODE_ONLY.test(source)) {
      throw new Error(`server/${relative} uses a Node-only API and cannot ship to the browser build.`);
    }
    checked += 1;
  }

  for (const [from, to] of UI_FILES) {
    await copy(path.join(ROOT, from), path.join(WEB, to));
    checked += 1;
  }

  console.log(`[build-web] copied ${checked} shared files into web/`);
  console.log('[build-web] web/js/api.js, web/js/app.js and web/index.html are browser-specific and were left alone.');
}

main().catch((error) => {
  console.error(`[build-web] ${error.message}`);
  process.exit(1);
});
