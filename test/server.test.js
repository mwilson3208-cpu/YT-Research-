import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.PORT = '4199';
const { default: server } = await import('../server/index.js');
const BASE = 'http://127.0.0.1:4199';

before(async () => {
  if (!server.listening) await once(server, 'listening');
});

after(() => server.close());

const post = async (path, body = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
};

test('the app shell is served at the root', async () => {
  const response = await fetch(`${BASE}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /Viewforge/);
  assert.match(html, /js\/app\.js/);
});

test('static assets are served with the right content types', async () => {
  for (const [path, type] of [
    ['/css/app.css', /text\/css/],
    ['/js/app.js', /javascript/],
    ['/js/tools.js', /javascript/],
    ['/js/table.js', /javascript/],
    ['/js/util.js', /javascript/],
    ['/js/api.js', /javascript/],
  ]) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status, 200, `${path} did not serve`);
    assert.match(response.headers.get('content-type'), type, `${path} wrong type`);
  }
});

test('unknown paths fall back to the shell for hash routing', async () => {
  const response = await fetch(`${BASE}/some/deep/route`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Viewforge/);
});

test('path traversal out of /public is refused', async () => {
  const response = await fetch(`${BASE}/../server/config.js`);
  const body = await response.text();
  assert.ok(!body.includes('YOUTUBE_API_KEY'), 'server source leaked through the static handler');
});

test('every tool endpoint answers successfully', async () => {
  const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const cases = [
    ['/api/status', {}],
    ['/api/keywords', { seed: 'faceless channel', depth: 'quick' }],
    ['/api/suggest', { seed: 'voiceover' }],
    ['/api/trends', {}],
    ['/api/videos', { q: 'narration', maxResults: 5 }],
    ['/api/shorts', { q: 'facts', maxResults: 5 }],
    ['/api/video', { input: videoUrl }],
    ['/api/channel', { input: 'Sidehustle Signal', limit: 10 }],
    ['/api/channels/compare', { channels: 'Sidehustle Signal\nVoice of Machines', limit: 5 }],
    ['/api/comments', { input: videoUrl, limit: 30 }],
    ['/api/tags', { source: 'keyword', input: 'narration', limit: 10 }],
    ['/api/outliers', { q: 'narration' }],
    ['/api/playlist', { input: 'PLdemo123456789', limit: 10 }],
    ['/api/transcript', { input: videoUrl }],
    ['/api/spin', { text: 'This is a very important video about money.' }],
    ['/api/titles', { keyword: 'faceless channel', count: 5 }],
    ['/api/hashtags', { topic: 'faceless channel' }],
  ];
  for (const [path, body] of cases) {
    const { status, json } = await post(path, body);
    assert.equal(status, 200, `${path} returned ${status}: ${json.error}`);
    assert.equal(json.ok, true, `${path} was not ok`);
    assert.ok(json.data, `${path} returned no data`);
    assert.ok(typeof json.elapsedMs === 'number');
  }
});

test('missing required fields return 400 with a readable message', async () => {
  for (const path of ['/api/videos', '/api/channel', '/api/titles', '/api/hashtags', '/api/spin']) {
    const { status, json } = await post(path, {});
    assert.equal(status, 400, `${path} should reject an empty body`);
    assert.equal(json.ok, false);
    assert.match(json.error, /required/i);
  }
});

test('unknown endpoints return 404', async () => {
  const { status, json } = await post('/api/does-not-exist');
  assert.equal(status, 404);
  assert.match(json.error, /Unknown endpoint/);
});

test('malformed JSON returns 400 rather than crashing', async () => {
  const response = await fetch(`${BASE}/api/titles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid JSON/);
});

test('oversized request bodies are rejected', async () => {
  const response = await fetch(`${BASE}/api/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(2 * 1024 * 1024) }),
  }).catch(() => null);
  // Either the server rejects it, or the socket closes; both are acceptable.
  if (response) assert.ok(response.status === 413 || response.status === 400, `got ${response.status}`);
});

test('the cache can be cleared over HTTP', async () => {
  await post('/api/videos', { q: 'narration', maxResults: 5 });
  const { status, json } = await post('/api/cache/clear');
  assert.equal(status, 200);
  assert.ok(typeof json.data.cleared === 'number');
});

test('GET works on tool endpoints via query parameters', async () => {
  const response = await fetch(`${BASE}/api/titles?keyword=test&count=6`);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.data.titles.length, 6);
});

test('out-of-range numbers are clamped rather than rejected', async () => {
  const low = await post('/api/titles', { keyword: 'test', count: 1 });
  const high = await post('/api/titles', { keyword: 'test', count: 99999 });
  assert.equal(low.json.data.titles.length, 5, 'count should clamp up to the minimum');
  assert.ok(high.json.data.titles.length <= 200, 'count should clamp to the maximum');
});

test('unsupported methods on static paths are refused', async () => {
  const response = await fetch(`${BASE}/`, { method: 'DELETE' });
  assert.equal(response.status, 405);
});
