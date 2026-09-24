import { config } from './config.js';

// Small in-memory LRU-ish cache. Keeps YouTube quota use down during a
// research session, where the same channel or keyword gets hit repeatedly.
const store = new Map();
const MAX_ENTRIES = 500;

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  // Refresh recency.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

export function cacheSet(key, value, ttlMs = config.cacheTtlMs) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export async function cached(key, producer, ttlMs) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  return cacheSet(key, value, ttlMs);
}

export function cacheStats() {
  return { entries: store.size, maxEntries: MAX_ENTRIES };
}

export function cacheClear() {
  const cleared = store.size;
  store.clear();
  return cleared;
}
