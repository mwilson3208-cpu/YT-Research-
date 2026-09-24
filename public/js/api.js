/* Thin API client. Every tool endpoint takes JSON and returns { ok, data }. */

const inFlight = new Map();

export async function call(endpoint, body = {}) {
  // Deduplicate identical concurrent requests (double-clicked Run buttons).
  const key = `${endpoint}:${JSON.stringify(body)}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`Cannot reach the Viewforge server. Is it still running? (${error.message})`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Server returned an unreadable response (HTTP ${response.status}).`);
    }
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Request failed (HTTP ${response.status}).`);
      error.reason = payload.reason;
      error.status = response.status;
      throw error;
    }
    return payload;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

export const getStatus = () => call('/api/status');
export const clearCache = () => call('/api/cache/clear');
