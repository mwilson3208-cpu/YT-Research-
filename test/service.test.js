import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../server/service.js';
import { demoLibrary, demoSearch, demoTrending, demoChannel, demoTranscript } from '../server/data/demo.js';
import { parseVideoId, parsePlaylistId, chunk } from '../server/youtube.js';

// These run in demo mode (no YOUTUBE_API_KEY in the test environment), which
// exercises the same service, metrics and scoring path as live mode.

test('the demo library is internally consistent', () => {
  const library = demoLibrary();
  assert.ok(library.channels.length >= 8);
  assert.ok(library.videos.length >= 70);
  const channelIds = new Set(library.channels.map((channel) => channel.id));
  for (const video of library.videos) {
    assert.ok(channelIds.has(video.snippet.channelId), 'orphan video');
    assert.ok(Number(video.statistics.viewCount) > 0);
    assert.match(video.contentDetails.duration, /^PT/);
  }
});

test('the demo library is deterministic across calls', () => {
  assert.equal(demoLibrary().videos[0].id, demoLibrary().videos[0].id);
  assert.equal(demoSearch('narration', { limit: 3 })[0].id, demoSearch('narration', { limit: 3 })[0].id);
});

test('demo search respects its limit and never returns nothing', () => {
  assert.equal(demoSearch('faceless', { limit: 5 }).length, 5);
  assert.ok(demoSearch('zzzzz-no-such-topic', { limit: 4 }).length > 0, 'should fall back rather than return empty');
});

test('status reports mode, columns and title capacity', async () => {
  const status = await service.status();
  assert.equal(status.mode, 'demo');
  assert.ok(status.columnCount >= 35);
  assert.ok(status.titleCapacity.titles > 1200);
  assert.ok(status.categories.length > 0);
});

test('video search returns rows, columns and a summary', async () => {
  const result = await service.videoSearch({ q: 'faceless channel', maxResults: 10 });
  assert.equal(result.rows.length, 10);
  assert.ok(result.columns.length >= 35);
  assert.ok(result.summary.videos === 10);
  assert.ok(result.summary.medianViews > 0);
  for (const row of result.rows) {
    assert.ok(row.opportunity >= 0 && row.opportunity <= 100);
    assert.ok(row.url.startsWith('https://www.youtube.com/watch?v='));
  }
});

test('video search rejects an empty query', async () => {
  await assert.rejects(() => service.videoSearch({ q: '  ' }), /required/i);
});

test('maxResults is clamped to the API maximum', async () => {
  const result = await service.videoSearch({ q: 'narration', maxResults: 9999 });
  assert.ok(result.rows.length <= 50);
});

test('shorts search returns only sub-60-second videos when any exist', async () => {
  const result = await service.shortsSearch({ q: 'facts' });
  assert.ok(result.rows.length > 0);
  if (result.shortsInsights.strictFilterApplied) {
    assert.ok(result.rows.every((row) => row.durationSeconds <= 60), 'a long video slipped through');
  }
  assert.ok(result.shortsInsights.medianSeconds > 0);
});

test('trends ranks by velocity and surfaces rising phrases', async () => {
  const result = await service.trends({});
  assert.ok(result.rows.length > 0);
  for (let i = 1; i < result.rows.length; i += 1) {
    assert.ok(result.rows[i - 1].avgDailyViews >= result.rows[i].avgDailyViews, 'trend rows are not sorted by velocity');
  }
  assert.ok(result.trendSignals.risingPhrases.length > 0);
  assert.ok('Short' in result.trendSignals.formatMix);
});

test('channel analysis returns profile, cadence and strategy', async () => {
  const result = await service.channelAnalysis({ input: 'Sidehustle Signal' });
  assert.ok(result.channel.subscribers > 0);
  assert.ok(result.rows.length > 0);
  assert.ok(result.cadence.analyzedVideos === result.rows.length);
  assert.ok(Array.isArray(result.strategy.topTags));
  assert.ok(result.strategy.medianTitleLength > 0);
});

test('channel comparison needs at least two channels', async () => {
  await assert.rejects(() => service.channelCompare({ channels: 'only one' }), /at least two/i);
  const result = await service.channelCompare({ channels: 'Sidehustle Signal\nVoice of Machines' });
  assert.equal(result.channels.length, 2);
  assert.ok(result.channels.every((entry) => entry.channel));
});

test('video deep dive returns an SEO audit with a bounded score', async () => {
  const id = demoLibrary().videos[0].id;
  const result = await service.videoAnalysis({ input: `https://www.youtube.com/watch?v=${id}` });
  assert.ok(result.video.title);
  assert.equal(result.seoAudit.checks.length, result.seoAudit.total);
  assert.ok(result.seoAudit.score >= 0 && result.seoAudit.score <= 100);
  assert.equal(result.seoAudit.passed, result.seoAudit.checks.filter((check) => check.pass).length);
});

test('comment analysis returns sentiment totals that add up', async () => {
  const result = await service.commentAnalysis({ input: 'https://www.youtube.com/watch?v=abcdefghijk' });
  const { counts } = result.sentiment;
  assert.equal(counts.positive + counts.negative + counts.neutral, result.analyzed);
  assert.ok(result.comments.length === result.analyzed);
});

test('tag analysis works from a keyword, a video and a channel', async () => {
  for (const source of ['keyword', 'video', 'channel']) {
    const input = source === 'video'
      ? `https://www.youtube.com/watch?v=${demoLibrary().videos[0].id}`
      : source === 'channel' ? 'Voice of Machines' : 'narration';
    const result = await service.tagAnalysis({ source, input });
    assert.ok(result.videosAnalyzed > 0, `${source} returned no videos`);
    assert.ok(Array.isArray(result.tags));
  }
});

test('keyword research returns scored keywords with buckets', async () => {
  const result = await service.keywordResearch({ seed: 'faceless channel', depth: 'quick' });
  assert.ok(result.keywords.length > 0);
  assert.ok(result.keywords.every((k) => k.score >= 0 && k.score <= 100));
  assert.ok(Array.isArray(result.buckets.questions));
  assert.ok(Array.isArray(result.buckets.easyWins));
});

test('the outlier finder reports its filters and never returns nothing', async () => {
  const result = await service.outlierFinder({ q: 'narration', maxSubscribers: 50000, minViews: 1000 });
  assert.equal(result.filters.maxSubscribers, 50000);
  assert.ok(result.rows.length > 0);
  assert.ok(typeof result.reading === 'string');
});

test('playlist analysis totals runtime across its videos', async () => {
  const result = await service.playlistAnalysis({ input: 'PLdemoplaylist123' });
  assert.ok(result.playlist.videos > 0);
  assert.match(result.playlist.totalDuration, /\d+h \d+m/);
});

test('transcription falls back to the demo track offline', async () => {
  const result = await service.transcribe({ input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(result.demoTranscript, true);
  assert.ok(result.words > 100);
  assert.ok(result.paragraphs.length > 0);
  assert.ok(result.segments.every((segment) => segment.text));
});

test('the spinner endpoint returns copy plus a script', () => {
  const result = service.spinContent({
    text: 'This is a very important video. You do not need many people to make good money. It is easy to start.',
    title: 'Test',
  });
  assert.ok(result.spun.length > 0);
  assert.match(result.script, /\[HOOK/);
  assert.ok(result.estimatedNarrationSeconds > 0);
});

test('the spinner rejects oversized input', () => {
  assert.throws(() => service.spinContent({ text: 'a'.repeat(60001) }), /60,000/);
});

test('title and hashtag endpoints validate their input', () => {
  assert.throws(() => service.titles({}), /required/i);
  assert.throws(() => service.hashtags({}), /required/i);
  assert.ok(service.titles({ keyword: 'test', count: 5 }).titles.length === 5);
  assert.ok(service.hashtags({ topic: 'test' }).all.length > 0);
});

/* ---- URL parsing ---- */

test('video IDs are read from every YouTube URL shape', () => {
  const id = 'dQw4w9WgXcQ';
  for (const input of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/watch?v=${id}&t=42s`,
  ]) {
    assert.equal(parseVideoId(input), id, `failed on ${input}`);
  }
  assert.equal(parseVideoId('https://example.com'), null);
  assert.equal(parseVideoId(''), null);
});

test('playlist IDs are read from URLs and raw IDs', () => {
  assert.equal(parsePlaylistId('PLabcdefghijklmno'), 'PLabcdefghijklmno');
  assert.equal(parsePlaylistId('https://www.youtube.com/playlist?list=PLxyz1234567890'), 'PLxyz1234567890');
  assert.equal(parsePlaylistId('nonsense'), null);
});

test('id batching respects the API 50-item limit', () => {
  const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
  const groups = chunk(ids, 50);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].length, 50);
  assert.equal(groups[2].length, 20);
});

test('the demo transcript has sane timings', () => {
  const transcript = demoTranscript();
  assert.ok(transcript.segments.length > 10);
  for (let i = 1; i < transcript.segments.length; i += 1) {
    assert.ok(transcript.segments[i].start > transcript.segments[i - 1].start, 'timings must increase');
  }
});
