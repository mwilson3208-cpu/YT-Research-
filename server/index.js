import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, ROOT, isLive } from './config.js';
import { cacheClear, cacheStats } from './cache.js';
import * as service from './service.js';
import { YouTubeError } from './youtube.js';

const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const MAX_BODY_BYTES = 1024 * 1024;

// POST handlers. Every tool is one route so the client stays simple.
const ROUTES = {
  '/api/status': () => service.status(),
  '/api/keywords': (body) => service.keywordResearch(body),
  '/api/suggest': (body) => service.suggestions(body),
  '/api/trends': (body) => service.trends(body),
  '/api/videos': (body) => service.videoSearch(body),
  '/api/shorts': (body) => service.shortsSearch(body),
  '/api/video': (body) => service.videoAnalysis(body),
  '/api/channel': (body) => service.channelAnalysis(body),
  '/api/channels/compare': (body) => service.channelCompare(body),
  '/api/comments': (body) => service.commentAnalysis(body),
  '/api/tags': (body) => service.tagAnalysis(body),
  '/api/outliers': (body) => service.outlierFinder(body),
  '/api/playlist': (body) => service.playlistAnalysis(body),
  '/api/transcript': (body) => service.transcribe(body),
  '/api/spin': (body) => service.spinContent(body),
  '/api/titles': (body) => service.titles(body),
  '/api/hashtags': (body) => service.hashtags(body),
  '/api/cache/clear': () => ({ cleared: cacheClear(), cache: cacheStats() }),
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, relative);
  // Keep path traversal out of the static handler.
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const stats = await fsp.stat(resolved);
    if (stats.isDirectory()) return serveStatic(request, response, path.join(pathname, 'index.html'));
    const ext = path.extname(resolved).toLowerCase();
    response.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stats.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(resolved).pipe(response);
  } catch {
    // Unknown path: hand back the shell so client-side hash routing works.
    try {
      const shell = await fsp.readFile(path.join(PUBLIC_DIR, 'index.html'));
      response.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      response.end(shell);
    } catch {
      sendJson(response, 404, { error: 'Not found' });
    }
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (request.method === 'OPTIONS') {
    response.writeHead(204, { allow: 'GET, POST, OPTIONS' });
    response.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    const handler = ROUTES[pathname];
    if (!handler) return sendJson(response, 404, { error: `Unknown endpoint ${pathname}` });
    if (request.method !== 'POST' && request.method !== 'GET') {
      return sendJson(response, 405, { error: 'Use POST for tool endpoints.' });
    }
    try {
      const body = request.method === 'POST' ? await readBody(request) : Object.fromEntries(url.searchParams);
      const started = Date.now();
      const payload = await handler(body);
      return sendJson(response, 200, {
        ok: true,
        elapsedMs: Date.now() - started,
        mode: isLive() ? 'live' : 'demo',
        data: payload,
      });
    } catch (error) {
      const status = error.status || 500;
      const payload = {
        ok: false,
        error: error.message || 'Something went wrong.',
        mode: isLive() ? 'live' : 'demo',
      };
      if (error instanceof YouTubeError) {
        payload.reason = error.reason;
        if (error.reason === 'quotaExceeded') {
          payload.error = 'YouTube daily quota is spent. It resets at midnight Pacific. Demo mode still works: remove YOUTUBE_API_KEY from .env to explore offline.';
        }
        if (error.reason === 'demo_mode') {
          payload.error = 'This tool needs live YouTube data. Add YOUTUBE_API_KEY to .env and restart.';
        }
      }
      if (status >= 500) console.error(`[tube-atlas] ${pathname}:`, error);
      return sendJson(response, status, payload);
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  return serveStatic(request, response, pathname);
});

server.listen(config.port, () => {
  const line = '='.repeat(62);
  console.log(`\n${line}`);
  console.log('  TUBE ATLAS  -  YouTube research for faceless creators');
  console.log(line);
  console.log(`  URL          http://localhost:${config.port}`);
  console.log(`  Mode         ${isLive() ? 'LIVE (YouTube Data API v3)' : 'DEMO (bundled sample library)'}`);
  if (!isLive()) {
    console.log('  Add a key    cp .env.example .env  then set YOUTUBE_API_KEY');
  }
  console.log(`  Region       ${config.region}   Language ${config.language}`);
  console.log(`${line}\n`);
});

process.on('SIGINT', () => {
  console.log('\n[tube-atlas] shutting down');
  server.close(() => process.exit(0));
});

export default server;
