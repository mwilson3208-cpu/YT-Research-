import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader so the app has zero dependencies.
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const num = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  apiKey: (process.env.YOUTUBE_API_KEY || '').trim(),
  port: Number.parseInt(process.env.PORT || '4173', 10),
  region: (process.env.DEFAULT_REGION || 'US').toUpperCase(),
  language: process.env.DEFAULT_LANGUAGE || 'en',
  rpmLow: num(process.env.RPM_LOW, 0.5),
  rpmHigh: num(process.env.RPM_HIGH, 6),
  cacheTtlMs: num(process.env.CACHE_TTL_MS, 10 * 60 * 1000),
};

export const isLive = () => config.apiKey.length > 0;
