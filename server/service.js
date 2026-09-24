import { config, isLive } from './config.js';
import * as yt from './youtube.js';
import * as demo from './data/demo.js';
import { buildVideoRow, addOutlierScores, median, round, VIDEO_COLUMNS, durationToSeconds } from './metrics.js';
import { expandKeywords, extractPhrases, scoreKeyword, suggest } from './tools/keywords.js';
import { analyzeComments } from './tools/comments.js';
import { generateTitles, titleCapacity, TITLE_CATEGORIES } from './tools/titles.js';
import { generateHashtags } from './tools/hashtags.js';
import { spin, toVoiceoverScript } from './tools/spinner.js';
import { fetchTranscript, toParagraphs } from './tools/transcript.js';

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const need = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError(`${label} is required.`, 400);
  return text;
};

const clamp = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

let categoryNameCache = null;
async function categoryNames(region) {
  if (!isLive()) return demo.demoLibrary().categoryNames;
  if (categoryNameCache) return categoryNameCache;
  try {
    const list = await yt.videoCategories(region);
    categoryNameCache = Object.fromEntries(list.map((item) => [item.id, item.title]));
  } catch {
    categoryNameCache = demo.demoLibrary().categoryNames;
  }
  return categoryNameCache;
}

/** Attach channel stats to a set of videos so per-sub metrics can be computed. */
async function withChannelContext(videos, region) {
  const names = await categoryNames(region);
  const channelIds = [...new Set(videos.map((video) => video.snippet?.channelId).filter(Boolean))];
  let channels = [];
  if (isLive()) {
    try {
      channels = await yt.channelsByIds(channelIds);
    } catch {
      channels = [];
    }
  } else {
    channels = demo.demoLibrary().channels.filter((channel) => channelIds.includes(channel.id));
  }
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const rows = videos.map((video) => buildVideoRow(video, {
    channel: byId.get(video.snippet?.channelId),
    categoryNames: names,
  }));
  return addOutlierScores(rows);
}

export function summarize(rows) {
  if (!rows.length) return null;
  const views = rows.map((r) => r.views);
  const shorts = rows.filter((r) => r.isShort).length;
  return {
    videos: rows.length,
    totalViews: views.reduce((a, b) => a + b, 0),
    medianViews: Math.round(median(views)),
    averageViews: Math.round(views.reduce((a, b) => a + b, 0) / rows.length),
    medianDailyViews: round(median(rows.map((r) => r.avgDailyViews)), 1),
    medianEngagement: round(median(rows.map((r) => r.engagementRate)), 2),
    medianDurationSeconds: Math.round(median(rows.map((r) => r.durationSeconds))),
    shortsShare: Math.round((shorts / rows.length) * 100),
    estEarningsLow: round(rows.reduce((sum, r) => sum + r.estEarningsLow, 0), 2),
    estEarningsHigh: round(rows.reduce((sum, r) => sum + r.estEarningsHigh, 0), 2),
    adsLikelyShare: Math.round((rows.filter((r) => r.adsFound === 'Likely').length / rows.length) * 100),
    topOpportunity: [...rows].sort((a, b) => b.opportunity - a.opportunity)[0]?.title || null,
    bestPublishHour: mode(rows.map((r) => r.publishedHourUtc)),
    bestPublishDay: mode(rows.map((r) => r.publishedWeekday)),
  };
}

function mode(values) {
  const counts = new Map();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) { best = value; bestCount = count; }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Tool 1: Video Analyzer (keyword search -> full research table)
 * ------------------------------------------------------------------ */
export async function videoSearch(body = {}) {
  const q = need(body.q, 'A search keyword');
  const maxResults = clamp(body.maxResults, 5, 50, 25);
  const order = ['relevance', 'viewCount', 'date', 'rating', 'title'].includes(body.order) ? body.order : 'relevance';
  const region = (body.region || config.region).toUpperCase();
  const publishedAfter = windowToDate(body.publishedWithin);
  const videoDuration = ['short', 'medium', 'long'].includes(body.duration) ? body.duration : undefined;

  let videos;
  if (isLive()) {
    const { items } = await yt.searchVideos({
      q, maxResults, order, publishedAfter, regionCode: region,
      relevanceLanguage: config.language, videoDuration,
    });
    const ids = items.map((item) => item.id?.videoId).filter(Boolean);
    videos = await yt.videosByIds(ids);
  } else {
    videos = demo.demoSearch(q, { limit: maxResults, order, videoDuration });
  }

  const rows = await withChannelContext(videos, region);
  return {
    query: q,
    mode: isLive() ? 'live' : 'demo',
    columns: VIDEO_COLUMNS,
    rows,
    summary: summarize(rows),
  };
}

/* ------------------------------------------------------------------ *
 * Tool 2: Shorts Analyzer
 * ------------------------------------------------------------------ */
export async function shortsSearch(body = {}) {
  const result = await videoSearch({ ...body, duration: 'short', maxResults: clamp(body.maxResults, 5, 50, 30) });
  // Belt and braces: YouTube's "short" filter means under 4 minutes, not 60s.
  const rows = result.rows.filter((row) => row.durationSeconds > 0 && row.durationSeconds <= 60);
  const usable = rows.length ? addOutlierScores(rows) : result.rows;
  const hookWords = extractPhrases(usable.map((row) => row.title.split(/\s+/).slice(0, 4).join(' ')), { minCount: 1, maxTerms: 15 });
  return {
    ...result,
    rows: usable,
    summary: summarize(usable),
    shortsInsights: {
      medianSeconds: Math.round(median(usable.map((row) => row.durationSeconds))),
      hookPhrases: hookWords.pairs.slice(0, 12),
      hashtagUse: Math.round((usable.filter((row) => row.hashtagCount > 0).length / Math.max(1, usable.length)) * 100),
      strictFilterApplied: rows.length > 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool 3: Trends Analyzer
 * ------------------------------------------------------------------ */
export async function trends(body = {}) {
  const region = (body.region || config.region).toUpperCase();
  const categoryId = body.categoryId ? String(body.categoryId) : '';
  const limit = clamp(body.maxResults, 10, 50, 50);

  const videos = isLive()
    ? await yt.mostPopular({ regionCode: region, videoCategoryId: categoryId, maxResults: limit })
    : demo.demoTrending({ videoCategoryId: categoryId, limit });

  const rows = await withChannelContext(videos, region);
  const phrases = extractPhrases(rows.map((row) => row.title), { minCount: 2, maxTerms: 30 });
  const tagCounts = new Map();
  for (const row of rows) for (const tag of row.tags) {
    const key = tag.toLowerCase();
    tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
  }

  const byFormat = { Short: 0, Standard: 0, Long: 0 };
  for (const row of rows) byFormat[row.format] += 1;

  return {
    region,
    categoryId: categoryId || null,
    mode: isLive() ? 'live' : 'demo',
    columns: VIDEO_COLUMNS,
    rows: [...rows].sort((a, b) => b.avgDailyViews - a.avgDailyViews),
    summary: summarize(rows),
    trendSignals: {
      risingPhrases: [...phrases.pairs, ...phrases.words].sort((a, b) => b.count - a.count).slice(0, 20),
      trendingTags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count })),
      formatMix: byFormat,
      freshWindowDays: round(median(rows.map((row) => row.publishAgeDays)), 1),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool 4: Channel Analyzer
 * ------------------------------------------------------------------ */
export async function channelAnalysis(body = {}) {
  const input = need(body.input, 'A channel URL, @handle, or channel ID');
  const limit = clamp(body.limit, 5, 200, 50);

  let channel;
  let videos;
  if (isLive()) {
    const channelId = await yt.resolveChannelId(input);
    if (!channelId) throw new HttpError('Could not find that channel.', 404);
    const result = await yt.channelUploads(channelId, limit);
    channel = result.channel;
    videos = result.videos;
  } else {
    channel = demo.demoChannel(input);
    videos = demo.demoChannelVideos(channel.id).slice(0, limit);
  }
  if (!channel) throw new HttpError('Could not find that channel.', 404);

  const rows = await withChannelContext(videos, body.region);
  const sorted = [...rows].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push((new Date(sorted[i].publishedAt) - new Date(sorted[i - 1].publishedAt)) / 86400000);
  }
  const tagCounts = new Map();
  for (const row of rows) for (const tag of row.tags) {
    const key = tag.toLowerCase();
    tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
  }
  const titlePhrases = extractPhrases(rows.map((row) => row.title), { minCount: 2, maxTerms: 25 });

  const subs = Number(channel.statistics?.subscriberCount || 0);
  const totalViews = Number(channel.statistics?.viewCount || 0);
  const videoCount = Number(channel.statistics?.videoCount || 0);

  return {
    mode: isLive() ? 'live' : 'demo',
    channel: {
      id: channel.id,
      title: channel.snippet?.title,
      description: channel.snippet?.description,
      customUrl: channel.snippet?.customUrl,
      country: channel.snippet?.country || null,
      publishedAt: channel.snippet?.publishedAt,
      thumbnail: channel.snippet?.thumbnails?.medium?.url || '',
      url: `https://www.youtube.com/channel/${channel.id}`,
      subscribers: subs,
      totalViews,
      videoCount,
      viewsPerVideo: videoCount ? Math.round(totalViews / videoCount) : 0,
      viewsPerSubscriber: subs ? round(totalViews / subs, 2) : null,
      keywords: channel.brandingSettings?.channel?.keywords || '',
    },
    columns: VIDEO_COLUMNS,
    rows: [...rows].sort((a, b) => b.views - a.views),
    summary: summarize(rows),
    cadence: {
      analyzedVideos: rows.length,
      medianDaysBetweenUploads: gaps.length ? round(median(gaps), 1) : null,
      uploadsPerMonth: gaps.length ? round(30 / Math.max(0.5, median(gaps)), 1) : null,
      bestPublishDay: mode(rows.map((row) => row.publishedWeekday)),
      bestPublishHourUtc: mode(rows.map((row) => row.publishedHourUtc)),
      shortsShare: Math.round((rows.filter((row) => row.isShort).length / Math.max(1, rows.length)) * 100),
    },
    strategy: {
      topTags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count })),
      titlePhrases: [...titlePhrases.pairs, ...titlePhrases.triples].sort((a, b) => b.count - a.count).slice(0, 15),
      medianTitleLength: Math.round(median(rows.map((row) => row.titleLength))),
      medianTagCount: Math.round(median(rows.map((row) => row.tagCount))),
      captionUsage: Math.round((rows.filter((row) => row.hasCaptions).length / Math.max(1, rows.length)) * 100),
      breakouts: [...rows].filter((row) => (row.outlierScore || 0) >= 2).sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 10)
        .map((row) => ({ title: row.title, url: row.url, views: row.views, outlierScore: row.outlierScore })),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool 5: Single Video Analyzer (deep dive)
 * ------------------------------------------------------------------ */
export async function videoAnalysis(body = {}) {
  const input = need(body.input, 'A video URL or ID');
  const videoId = yt.parseVideoId(input) || (isLive() ? null : demo.demoLibrary().videos[0].id);
  if (!videoId) throw new HttpError('Could not read a video ID from that input.', 400);

  const videos = isLive() ? await yt.videosByIds([videoId]) : demo.demoVideosByIds([videoId]);
  const video = videos[0] || (!isLive() ? demo.demoLibrary().videos[0] : null);
  if (!video) throw new HttpError('That video was not found (it may be private or deleted).', 404);

  const rows = await withChannelContext([video], body.region);
  const row = rows[0];

  // Compare against the channel's own recent work: is this a hit or a dud?
  let peers = [];
  try {
    if (isLive()) {
      const { videos: channelVideos } = await yt.channelUploads(video.snippet.channelId, 25);
      peers = channelVideos;
    } else {
      peers = demo.demoChannelVideos(video.snippet.channelId).slice(0, 25);
    }
  } catch {
    peers = [];
  }
  const peerRows = peers.length ? await withChannelContext(peers, body.region) : [];
  const peerMedian = peerRows.length ? median(peerRows.map((r) => r.views)) : 0;

  const description = video.snippet.description || '';
  return {
    mode: isLive() ? 'live' : 'demo',
    columns: VIDEO_COLUMNS,
    rows: [row],
    video: row,
    seoAudit: auditVideoSeo(row, description),
    benchmark: {
      channelMedianViews: Math.round(peerMedian),
      versusChannelMedian: peerMedian ? round(row.views / peerMedian, 2) : null,
      rankInRecentUploads: peerRows.length
        ? [...peerRows].sort((a, b) => b.views - a.views).findIndex((r) => r.videoId === row.videoId) + 1
        : null,
      peersAnalyzed: peerRows.length,
    },
    descriptionPreview: description.slice(0, 1200),
  };
}

function auditVideoSeo(row, description) {
  const checks = [];
  const add = (label, pass, advice) => checks.push({ label, pass, advice });

  add('Title length 40-70 characters', row.titleLength >= 40 && row.titleLength <= 70,
    `Currently ${row.titleLength}. Search truncates past about 70 characters.`);
  add('Tags used (8+)', row.tagCount >= 8,
    `Currently ${row.tagCount} tags. Tags are a minor ranking factor but free to use.`);
  add('Description 200+ characters', row.descriptionLength >= 200,
    `Currently ${row.descriptionLength}. The first 150 characters show in search results.`);
  add('Description has a link', row.descriptionLinks > 0, 'Add your offer, playlist, or sources.');
  add('Hashtags present (1-3)', row.hashtagCount >= 1 && row.hashtagCount <= 15,
    `Found ${row.hashtagCount}. Over 15 and YouTube ignores all of them.`);
  add('Captions available', row.hasCaptions, 'Captions add searchable text and lift watch time on muted autoplay.');
  add('Engagement above 2%', (row.engagementRate || 0) >= 2,
    `Currently ${row.engagementRate}%. Ask for the like inside the first 60 seconds.`);
  add('Timestamps in description', /\b\d{1,2}:\d{2}\b/.test(description),
    'Chapters improve retention and give you extra keyword surface.');

  const passed = checks.filter((check) => check.pass).length;
  return { checks, passed, total: checks.length, score: Math.round((passed / checks.length) * 100) };
}

/* ------------------------------------------------------------------ *
 * Tool 6: Comment Analyzer
 * ------------------------------------------------------------------ */
export async function commentAnalysis(body = {}) {
  const input = need(body.input, 'A video URL or ID');
  const limit = clamp(body.limit, 20, 300, 100);
  const videoId = yt.parseVideoId(input) || (!isLive() ? demo.demoLibrary().videos[0].id : null);
  if (!videoId) throw new HttpError('Could not read a video ID from that input.', 400);

  let list;
  if (isLive()) {
    try {
      list = await yt.comments(videoId, { limit });
    } catch (error) {
      if (error.reason === 'commentsDisabled') throw new HttpError('Comments are disabled on that video.', 409);
      throw error;
    }
  } else {
    list = demo.demoComments(videoId, limit);
  }
  if (!list.length) throw new HttpError('No comments found on that video.', 404);

  const videos = isLive() ? await yt.videosByIds([videoId]) : demo.demoVideosByIds([videoId]);
  const rows = videos.length ? await withChannelContext(videos, body.region) : [];

  return {
    mode: isLive() ? 'live' : 'demo',
    videoId,
    video: rows[0] || null,
    ...analyzeComments(list),
  };
}

/* ------------------------------------------------------------------ *
 * Tool 7: Tag Analyzer
 * ------------------------------------------------------------------ */
export async function tagAnalysis(body = {}) {
  const source = String(body.source || 'keyword');
  let videos = [];
  let label = '';

  if (source === 'video') {
    const videoId = yt.parseVideoId(need(body.input, 'A video URL or ID'));
    if (!videoId && isLive()) throw new HttpError('Could not read a video ID from that input.', 400);
    videos = isLive() ? await yt.videosByIds([videoId]) : demo.demoVideosByIds([videoId || demo.demoLibrary().videos[0].id]);
    label = videos[0]?.snippet?.title || body.input;
  } else if (source === 'channel') {
    const input = need(body.input, 'A channel URL, @handle, or channel ID');
    if (isLive()) {
      const channelId = await yt.resolveChannelId(input);
      const result = await yt.channelUploads(channelId, clamp(body.limit, 5, 100, 30));
      videos = result.videos;
      label = result.channel?.snippet?.title || input;
    } else {
      const channel = demo.demoChannel(input);
      videos = demo.demoChannelVideos(channel.id).slice(0, clamp(body.limit, 5, 100, 30));
      label = channel.snippet.title;
    }
  } else {
    const q = need(body.input, 'A keyword');
    label = q;
    if (isLive()) {
      const { items } = await yt.searchVideos({ q, maxResults: clamp(body.limit, 5, 50, 25), order: 'relevance' });
      videos = await yt.videosByIds(items.map((item) => item.id?.videoId).filter(Boolean));
    } else {
      videos = demo.demoSearch(q, { limit: clamp(body.limit, 5, 50, 25) });
    }
  }

  if (!videos.length) throw new HttpError('No videos found for that input.', 404);

  const rows = await withChannelContext(videos, body.region);
  const tagStats = new Map();
  const cooccurrence = new Map();

  for (const row of rows) {
    const tags = row.tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean);
    for (const tag of tags) {
      const entry = tagStats.get(tag) || { tag, videos: 0, totalViews: 0, words: tag.split(/\s+/).length };
      entry.videos += 1;
      entry.totalViews += row.views;
      tagStats.set(tag, entry);
    }
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = [tags[i], tags[j]].sort().join(' + ');
        cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
      }
    }
  }

  const tags = [...tagStats.values()].map((entry) => ({
    ...entry,
    averageViews: Math.round(entry.totalViews / entry.videos),
    usageRate: Math.round((entry.videos / rows.length) * 100),
    type: entry.words >= 3 ? 'Long tail' : entry.words === 2 ? 'Mid tail' : 'Broad',
  })).sort((a, b) => b.videos - a.videos || b.averageViews - a.averageViews);

  const titlePhrases = extractPhrases(rows.map((row) => row.title), { minCount: 2, maxTerms: 25 });

  return {
    mode: isLive() ? 'live' : 'demo',
    source,
    label,
    videosAnalyzed: rows.length,
    videosWithTags: rows.filter((row) => row.tagCount > 0).length,
    medianTagCount: Math.round(median(rows.map((row) => row.tagCount))),
    tags,
    highPerformingTags: [...tags].filter((tag) => tag.videos >= 2).sort((a, b) => b.averageViews - a.averageViews).slice(0, 20),
    tagPairs: [...cooccurrence.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([pair, count]) => ({ pair, count })),
    titlePhrases: [...titlePhrases.pairs, ...titlePhrases.triples].sort((a, b) => b.count - a.count).slice(0, 20),
    copyBlock: tags.slice(0, 20).map((tag) => tag.tag).join(', '),
    columns: VIDEO_COLUMNS,
    rows,
  };
}

/* ------------------------------------------------------------------ *
 * Tool 8: Keyword Generator
 * ------------------------------------------------------------------ */
export async function keywordResearch(body = {}) {
  const seed = need(body.seed, 'A seed keyword');
  const depth = body.depth === 'quick' ? 'quick' : 'standard';

  let result = await expandKeywords(seed, { depth, language: config.language, region: config.region });

  // Autocomplete can be blocked by a firewall; fall back to the offline bank.
  if (!result.keywords.length) {
    const offline = demo.demoSuggest(seed);
    const counts = new Map();
    for (const phrase of offline) counts.set(phrase, 1);
    result = {
      seed,
      variantsProbed: offline.length,
      keywords: [...counts.entries()].map(([keyword, appearances]) => scoreKeyword(keyword, appearances, seed))
        .sort((a, b) => b.score - a.score),
      offline: true,
    };
  }

  const keywords = result.keywords.slice(0, clamp(body.limit, 20, 500, 200));
  return {
    mode: isLive() ? 'live' : 'demo',
    autocompleteSource: result.offline ? 'offline-bank' : 'youtube-autocomplete',
    seed,
    variantsProbed: result.variantsProbed,
    total: result.keywords.length,
    keywords,
    buckets: {
      questions: keywords.filter((k) => k.isQuestion).slice(0, 30),
      longTail: keywords.filter((k) => k.words >= 4).slice(0, 30),
      easyWins: keywords.filter((k) => k.difficulty === 'Easy').slice(0, 30),
      headTerms: keywords.filter((k) => k.words <= 2).slice(0, 20),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool 9: Outlier / Opportunity Finder
 * ------------------------------------------------------------------ */
export async function outlierFinder(body = {}) {
  const q = need(body.q, 'A niche or keyword');
  const maxSubscribers = clamp(body.maxSubscribers, 0, 100000000, 100000);
  const minViews = clamp(body.minViews, 0, 100000000, 10000);
  const result = await videoSearch({ ...body, q, order: 'viewCount', maxResults: clamp(body.maxResults, 10, 50, 50) });

  const candidates = result.rows
    .filter((row) => row.views >= minViews)
    .filter((row) => row.subscribers === null || row.subscribers <= maxSubscribers)
    .sort((a, b) => (b.viewsPerSubscriber || b.outlierScore || 0) - (a.viewsPerSubscriber || a.outlierScore || 0));

  return {
    ...result,
    rows: candidates.length ? candidates : result.rows,
    filters: { maxSubscribers, minViews, matched: candidates.length, scanned: result.rows.length },
    reading: candidates.length
      ? 'Videos where views dwarf subscriber count. The topic carried the video, so the topic is copyable.'
      : 'No videos passed the filters. Loosen the subscriber ceiling or lower the minimum views.',
  };
}

/* ------------------------------------------------------------------ *
 * Tool 10: Playlist Analyzer
 * ------------------------------------------------------------------ */
export async function playlistAnalysis(body = {}) {
  const input = need(body.input, 'A playlist URL or ID');
  const limit = clamp(body.limit, 5, 200, 50);
  let videos;
  let playlistId = yt.parsePlaylistId(input);

  if (isLive()) {
    if (!playlistId) throw new HttpError('Could not read a playlist ID from that input.', 400);
    const ids = await yt.playlistVideoIds(playlistId, limit);
    if (!ids.length) throw new HttpError('That playlist is empty or private.', 404);
    videos = await yt.videosByIds(ids);
  } else {
    const channel = demo.demoChannel(input);
    playlistId = playlistId || `UU${channel.id.slice(2)}`;
    videos = demo.demoChannelVideos(channel.id).slice(0, limit);
  }

  const rows = await withChannelContext(videos, body.region);
  const totalSeconds = rows.reduce((sum, row) => sum + row.durationSeconds, 0);
  return {
    mode: isLive() ? 'live' : 'demo',
    playlistId,
    columns: VIDEO_COLUMNS,
    rows,
    summary: summarize(rows),
    playlist: {
      videos: rows.length,
      totalSeconds,
      totalDuration: `${Math.floor(totalSeconds / 3600)}h ${Math.round((totalSeconds % 3600) / 60)}m`,
      medianViews: Math.round(median(rows.map((row) => row.views))),
      dropOffAfter: rows.findIndex((row, index) => index > 0 && row.views < rows[0].views * 0.25) + 1 || null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool 11: Channel Comparison
 * ------------------------------------------------------------------ */
export async function channelCompare(body = {}) {
  const inputs = (Array.isArray(body.channels) ? body.channels : String(body.channels || '').split(/[\n,]+/))
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 5);
  if (inputs.length < 2) throw new HttpError('Give at least two channels to compare.', 400);

  const results = [];
  for (const input of inputs) {
    try {
      const analysis = await channelAnalysis({ input, limit: clamp(body.limit, 5, 50, 25), region: body.region });
      results.push({
        channel: analysis.channel,
        summary: analysis.summary,
        cadence: analysis.cadence,
        topTags: analysis.strategy.topTags.slice(0, 8),
        breakouts: analysis.strategy.breakouts.slice(0, 3),
      });
    } catch (error) {
      results.push({ input, error: error.message });
    }
  }
  return { mode: isLive() ? 'live' : 'demo', channels: results };
}

/* ------------------------------------------------------------------ *
 * Tools 12-15: text utilities (no quota cost)
 * ------------------------------------------------------------------ */
export async function transcribe(body = {}) {
  const input = need(body.input, 'A video URL or ID');
  const videoId = yt.parseVideoId(input);
  if (!videoId && isLive()) throw new HttpError('Could not read a video ID from that input.', 400);

  let transcript;
  if (!isLive()) {
    // Demo mode has no real caption track, so serve the bundled one. Every
    // downstream feature (key phrases, SRT export, send-to-spinner) still works.
    transcript = finishTranscript(demo.demoTranscript(videoId || undefined));
  } else {
    try {
      transcript = await fetchTranscript(videoId, { language: body.language || config.language });
    } catch (error) {
      if (error.status === 502 || /Could not load the watch page/i.test(error.message)) {
        throw new HttpError(
          'Could not reach the YouTube watch page. That is usually a firewall, VPN or proxy blocking youtube.com rather than a problem with the video. Transcripts are read from the watch page because the Data API will not release caption text without the video owner\'s permission.',
          502,
        );
      }
      throw error;
    }
  }

  let video = null;
  try {
    const videos = isLive() ? await yt.videosByIds([videoId]) : [];
    if (videos.length) {
      const rows = await withChannelContext(videos, body.region);
      video = rows[0];
    }
  } catch { /* metadata is a nice-to-have here */ }

  const phrases = extractPhrases([transcript.text], { minCount: 3, maxTerms: 30 });
  return {
    ...transcript,
    demoTranscript: !isLive(),
    video,
    keyPhrases: [...phrases.pairs, ...phrases.triples].sort((a, b) => b.count - a.count).slice(0, 20),
  };
}

export function spinContent(body = {}) {
  const text = need(body.text, 'Some source text');
  if (text.length > 60000) throw new HttpError('Keep the source under 60,000 characters.', 413);
  const result = spin(text, {
    intensity: body.intensity,
    tone: body.tone,
    addOpeners: body.addOpeners !== false,
    seed: body.seed,
  });
  const script = toVoiceoverScript(result.spun, { title: body.title || '' });
  return { ...result, script: script.script, scriptSections: script.sections, estimatedNarrationSeconds: script.durationSeconds };
}

export function titles(body = {}) {
  const keyword = need(body.keyword, 'A keyword or topic');
  return generateTitles(keyword, {
    count: clamp(body.count, 5, 200, 40),
    category: body.category || 'all',
    seed: body.seed,
  });
}

export function hashtags(body = {}) {
  const topic = need(body.topic, 'A topic');
  return generateHashtags(topic, { platform: body.platform === 'shorts' ? 'shorts' : 'youtube', limit: clamp(body.limit, 5, 40, 30) });
}

export async function suggestions(body = {}) {
  const seed = need(body.seed, 'A seed keyword');
  const live = await suggest(seed);
  return { seed, suggestions: live.length ? live : demo.demoSuggest(seed), source: live.length ? 'youtube' : 'offline' };
}

/** Derive the same computed fields fetchTranscript returns, for demo data. */
function finishTranscript(base) {
  const text = base.segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    ...base,
    text,
    words,
    characters: text.length,
    readingTimeSeconds: Math.round((words / 150) * 60),
    paragraphs: toParagraphs(base.segments),
  };
}

/* ------------------------------------------------------------------ */
export async function status() {
  let categories = [];
  try {
    categories = isLive() ? await yt.videoCategories(config.region) : demo.DEMO_CATEGORIES;
  } catch {
    categories = demo.DEMO_CATEGORIES;
  }
  return {
    mode: isLive() ? 'live' : 'demo',
    region: config.region,
    language: config.language,
    rpm: { low: config.rpmLow, high: config.rpmHigh },
    quota: yt.quotaUsage(),
    categories,
    columnCount: VIDEO_COLUMNS.length,
    titleCapacity: titleCapacity(),
    titleCategories: TITLE_CATEGORIES,
    demoLibrary: isLive() ? null : {
      channels: demo.demoLibrary().channels.length,
      videos: demo.demoLibrary().videos.length,
    },
  };
}

function windowToDate(window) {
  const map = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 };
  const days = map[window];
  if (!days) return undefined;
  return new Date(Date.now() - days * 86400000).toISOString();
}

export { durationToSeconds };
