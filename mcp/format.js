/**
 * Formatting for the MCP server.
 *
 * Claude reads these results, so they are compact markdown rather than raw
 * JSON. A 50-row, 45-column dump would bury the finding in the data; these
 * return the decision-relevant columns plus the conclusions, and point at the
 * CSV when the full grid is wanted.
 */

export function num(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n * 100) / 100);
}

export const money = (value) => (value === null || value === undefined ? '-' : `$${num(value)}`);

function escapeCell(value) {
  return String(value ?? '-').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim() || '-';
}

/** Render rows as a markdown table. `columns` is [[header, accessor], ...]. */
export function table(columns, rows) {
  if (!rows.length) return '_No rows._';
  const header = `| ${columns.map(([label]) => label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map(([, get]) => escapeCell(get(row))).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

export const truncate = (text, max = 70) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
};

/** The standard video table: what you need to judge a topic, nothing more. */
export function videoTable(rows, limit = 20) {
  return table([
    ['Title', (r) => truncate(r.title, 58)],
    ['Channel', (r) => truncate(r.channelTitle, 22)],
    ['Views', (r) => num(r.views)],
    ['Views/day', (r) => num(r.avgDailyViews)],
    ['Opp', (r) => r.opportunity],
    ['Outlier', (r) => (r.outlierScore ? `${r.outlierScore}x` : '-')],
    ['Subs', (r) => num(r.subscribers)],
    ['V/Sub', (r) => (r.viewsPerSubscriber ?? '-')],
    ['Engage', (r) => `${r.engagementRate}%`],
    ['Length', (r) => r.duration],
    ['Age', (r) => r.publishAgeLabel],
    ['Est. $', (r) => `${money(r.estEarningsLow)}-${money(r.estEarningsHigh)}`],
  ], rows.slice(0, limit));
}

export function summaryLines(summary) {
  if (!summary) return '';
  return [
    `- Median views: **${num(summary.medianViews)}**, median views/day: **${num(summary.medianDailyViews)}**`,
    `- Median engagement: **${summary.medianEngagement}%**`,
    `- Shorts share: **${summary.shortsShare}%**, ads likely on **${summary.adsLikelyShare}%**`,
    `- Combined estimated earnings: **${money(summary.estEarningsLow)} to ${money(summary.estEarningsHigh)}**`,
    summary.bestPublishDay ? `- Most common publish slot: **${summary.bestPublishDay}, ${summary.bestPublishHour}:00 UTC**` : null,
  ].filter(Boolean).join('\n');
}

export function phraseLine(phrases, limit = 12) {
  if (!phrases?.length) return '_none found_';
  return phrases.slice(0, limit).map((p) => `${p.phrase || p.tag || p.pair} (${p.count})`).join(', ');
}

export function heading(title, meta) {
  return meta ? `## ${title}\n_${meta}_` : `## ${title}`;
}

export function modeNote(mode) {
  return mode === 'demo'
    ? '\n\n> **Sample data.** No YouTube API key is configured, so these are figures from the bundled demo library, not the real YouTube. Set YOUTUBE_API_KEY to research live.'
    : '';
}
