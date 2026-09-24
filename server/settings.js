/**
 * Runtime settings, shared by the Node server and the browser build.
 *
 * This module must stay free of Node built-ins: the browser imports it too.
 * The Node side fills it from .env (see config.js); the browser fills it from
 * the API key box in the UI.
 */

export const settings = {
  apiKey: '',
  region: 'US',
  language: 'en',
  rpmLow: 0.5,
  rpmHigh: 6,
  cacheTtlMs: 10 * 60 * 1000,
  // 'node' or 'browser'. Some endpoints (autocomplete, the watch page) are
  // reachable from a server but blocked by browser CORS rules, and the error
  // messages need to say which is which.
  runtime: 'node',
};

export function configure(partial = {}) {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined || value === null) continue;
    if (!(key in settings)) continue;
    settings[key] = value;
  }
  return settings;
}

export const isLive = () => String(settings.apiKey || '').trim().length > 0;

// Kept as a named export so existing imports read naturally.
export { settings as config };
