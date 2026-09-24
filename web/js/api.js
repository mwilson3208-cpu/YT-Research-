/**
 * Browser API layer.
 *
 * The hosted build has no server behind it. Instead of POSTing to /api/*, it
 * runs the exact same service functions in the page and lets them call the
 * YouTube Data API directly, which supports browser requests with an API key.
 *
 * The call() signature matches the Node build's client, so every tool view in
 * tools.js works unchanged in both builds.
 */
import * as service from '../core/service.js';
import { configure, settings, isLive } from '../core/settings.js';
import { cacheClear, cacheStats } from '../core/cache.js';

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

const KEY_STORAGE = 'vf:key';
const PREFS_STORAGE = 'vf:prefs';

/** The key is held in this browser only. It goes to Google and nowhere else. */
export function loadSavedSettings() {
  let apiKey = '';
  let prefs = {};
  try { apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch { /* storage blocked */ }
  try { prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE) || '{}'); } catch { /* ignore */ }
  configure({ apiKey, ...prefs, runtime: 'browser' });
  return { apiKey, ...prefs };
}

export function saveApiKey(apiKey) {
  const trimmed = String(apiKey || '').trim();
  configure({ apiKey: trimmed });
  try {
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private browsing: the key still works for this session, it just will not
    // survive a reload. Told to the user in the settings panel.
    return false;
  }
  return true;
}

export function savePrefs(prefs) {
  configure(prefs);
  try {
    localStorage.setItem(PREFS_STORAGE, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export const currentSettings = () => ({ ...settings });
export const hasKey = () => isLive();

const inFlight = new Map();

export async function call(endpoint, body = {}) {
  const key = `${endpoint}:${JSON.stringify(body)}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const handler = ROUTES[endpoint];
    if (!handler) throw new Error(`Unknown endpoint ${endpoint}`);
    const started = Date.now();
    try {
      const data = await handler(body);
      return { ok: true, elapsedMs: Date.now() - started, mode: isLive() ? 'live' : 'demo', data };
    } catch (error) {
      throw decorate(error);
    }
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Turn API and CORS failures into something a creator can act on. */
function decorate(error) {
  const reason = error.reason || '';
  if (reason === 'demo_mode') {
    error.message = 'This tool needs live YouTube data. Add your API key using the Settings button in the header.';
  }
  if (reason === 'quotaExceeded') {
    error.message = 'Your YouTube daily quota is spent. It resets at midnight Pacific. Clear your key in Settings to keep exploring with sample data.';
  }
  if (reason === 'network') {
    error.message = `${error.message} If you are on a school, office or VPN network, it may be blocking googleapis.com.`;
  }
  return error;
}

export const getStatus = () => call('/api/status');
export const clearCache = () => call('/api/cache/clear');
