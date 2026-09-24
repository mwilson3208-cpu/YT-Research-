#!/usr/bin/env node
/** Tiny static server for the web/ bundle, for local preview. */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORT = Number.parseInt(process.env.PORT || '4174', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stats = await fsp.stat(target);
    if (stats.isDirectory()) throw new Error('directory');
    response.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(response);
  } catch {
    const shell = await fsp.readFile(path.join(ROOT, 'index.html'));
    response.writeHead(200, { 'content-type': MIME['.html'] });
    response.end(shell);
  }
}).listen(PORT, () => console.log(`Viewforge static bundle: http://localhost:${PORT}`));
