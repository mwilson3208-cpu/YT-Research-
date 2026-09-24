import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  durationToSeconds, formatDuration, estimateEarnings, adSignal, buildVideoRow,
  addOutlierScores, median, opportunityScore, VIDEO_COLUMNS, humanAge,
} from '../server/metrics.js';

test('durationToSeconds parses every ISO-8601 shape YouTube returns', () => {
  assert.equal(durationToSeconds('PT1H2M3S'), 3723);
  assert.equal(durationToSeconds('PT58S'), 58);
  assert.equal(durationToSeconds('PT10M'), 600);
  assert.equal(durationToSeconds('PT2H'), 7200);
  assert.equal(durationToSeconds('P1DT2H'), 93600);
  assert.equal(durationToSeconds(''), 0);
  assert.equal(durationToSeconds(null), 0);
  assert.equal(durationToSeconds('garbage'), 0);
});

test('formatDuration renders hours only when present', () => {
  assert.equal(formatDuration(3723), '1:02:03');
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(5), '0:05');
});

test('earnings scale with views and stay a low-to-high band', () => {
  const small = estimateEarnings(1000, '27');
  const large = estimateEarnings(1000000, '27');
  assert.ok(large.low > small.low);
  assert.ok(large.high > large.low);
  // Education carries a higher RPM multiplier than music.
  assert.ok(estimateEarnings(100000, '27').high > estimateEarnings(100000, '10').high);
});

test('ad signal rates an 8-minute education video above a kids short', () => {
  const longform = adSignal({
    contentDetails: { duration: 'PT12M30S' },
    snippet: { categoryId: '27', liveBroadcastContent: 'none' },
    status: { madeForKids: false, license: 'youtube' },
  });
  const kidsShort = adSignal({
    contentDetails: { duration: 'PT30S' },
    snippet: { categoryId: '1', liveBroadcastContent: 'none' },
    status: { madeForKids: true, license: 'youtube' },
  });
  assert.equal(longform.label, 'Likely');
  assert.ok(longform.score > kidsShort.score);
  assert.ok(longform.reasons.length > 0);
});

const sampleVideo = (overrides = {}) => ({
  id: 'abc12345678',
  snippet: {
    title: 'How to Start a Faceless Channel',
    channelId: 'UC000000000000000000001',
    channelTitle: 'Test Channel',
    publishedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    categoryId: '27',
    tags: ['faceless', 'voiceover', 'narration'],
    description: 'A description with a link https://example.com and #hashtag',
    thumbnails: { medium: { url: 'https://img/1.jpg' } },
    liveBroadcastContent: 'none',
  },
  statistics: { viewCount: '100000', likeCount: '5000', commentCount: '400' },
  contentDetails: { duration: 'PT12M', definition: 'hd', caption: 'true' },
  status: { madeForKids: false, license: 'youtube', privacyStatus: 'public' },
  ...overrides,
});

test('buildVideoRow produces the full documented column set', () => {
  const row = buildVideoRow(sampleVideo(), {
    channel: { statistics: { subscriberCount: '50000', videoCount: '120', viewCount: '9000000' } },
    categoryNames: { 27: 'Education' },
  });
  assert.equal(row.views, 100000);
  assert.equal(row.likes, 5000);
  assert.equal(row.durationSeconds, 720);
  assert.equal(row.format, 'Long');
  assert.equal(row.isShort, false);
  assert.equal(row.category, 'Education');
  assert.equal(row.tagCount, 3);
  assert.equal(row.hasCaptions, true);
  assert.equal(row.descriptionLinks, 1);
  assert.equal(row.hashtagCount, 1);
  assert.equal(row.viewsPerSubscriber, 2);
  // 5,400 engagements on 100,000 views.
  assert.equal(row.engagementRate, 5.4);
  assert.ok(row.avgDailyViews > 0);
  assert.ok(row.estEarningsHigh > row.estEarningsLow);
});

test('a 45 second video is classed as a Short', () => {
  const row = buildVideoRow(sampleVideo({ contentDetails: { duration: 'PT45S' } }));
  assert.equal(row.isShort, true);
  assert.equal(row.format, 'Short');
});

test('missing statistics do not crash the row builder', () => {
  const row = buildVideoRow(sampleVideo({ statistics: { viewCount: '500' } }));
  assert.equal(row.likes, null);
  assert.equal(row.comments, null);
  assert.equal(row.likeRate, null);
  assert.equal(row.engagementRate, 0);
});

test('outlier score measures a video against the median of its peers', () => {
  const rows = [100, 100, 100, 500].map((views) => buildVideoRow(sampleVideo({
    statistics: { viewCount: String(views), likeCount: '1', commentCount: '1' },
  })));
  addOutlierScores(rows);
  assert.equal(rows[0].outlierScore, 1);
  assert.equal(rows[3].outlierScore, 5);
  assert.ok(rows.every((row) => row.opportunity >= 0 && row.opportunity <= 100));
});

test('median handles even, odd and empty inputs', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test('opportunity score stays inside 0-100 for extreme inputs', () => {
  const huge = opportunityScore({ avgDailyViews: 1e9, viewsPerSubscriber: 1e6, engagementRate: 100, publishAgeDays: 1 });
  const nothing = opportunityScore({ avgDailyViews: 0, viewsPerSubscriber: 0, engagementRate: 0, publishAgeDays: 4000 });
  assert.ok(huge <= 100 && huge > 80);
  assert.ok(nothing >= 0 && nothing < 20);
});

test('humanAge switches units sensibly', () => {
  assert.match(humanAge(0.5), /h$/);
  assert.match(humanAge(10), /d$/);
  assert.match(humanAge(90), /mo$/);
  assert.match(humanAge(800), /y$/);
});

test('the column dictionary advertises at least 35 data points', () => {
  assert.ok(VIDEO_COLUMNS.length >= 35, `only ${VIDEO_COLUMNS.length} columns`);
  const keys = new Set(VIDEO_COLUMNS.map((column) => column.key));
  assert.equal(keys.size, VIDEO_COLUMNS.length, 'duplicate column keys');
  for (const required of ['views', 'likes', 'comments', 'publishAgeDays', 'avgDailyViews', 'estEarningsLow', 'adsFound']) {
    assert.ok(keys.has(required), `missing advertised column: ${required}`);
  }
});

test('every column key is actually produced by buildVideoRow', () => {
  const row = buildVideoRow(sampleVideo(), {
    channel: { statistics: { subscriberCount: '10', videoCount: '2', viewCount: '30' } },
    categoryNames: {},
  });
  addOutlierScores([row]);
  for (const column of VIDEO_COLUMNS) {
    assert.ok(column.key in row, `column ${column.key} has no matching row field`);
  }
});
