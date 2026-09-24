import { config } from './settings.js';

/** Parse an ISO-8601 duration (PT1H2M3S) into seconds. */
export function durationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return 0;
  const [, d, h, m, s] = match;
  return (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Math.round(Number(s || 0));
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function daysSince(dateString) {
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, (Date.now() - then) / 86400000);
}

/**
 * Category-aware RPM multipliers. Finance/business content earns far more per
 * 1,000 views than entertainment, so a flat RPM would mislead.
 */
const CATEGORY_RPM_MULTIPLIER = {
  '1': 0.8,   // Film & Animation
  '2': 1.4,   // Autos & Vehicles
  '10': 0.55, // Music
  '15': 0.7,  // Pets & Animals
  '17': 0.9,  // Sports
  '19': 1.1,  // Travel & Events
  '20': 0.75, // Gaming
  '22': 0.9,  // People & Blogs
  '23': 0.8,  // Comedy
  '24': 0.7,  // Entertainment
  '25': 1.2,  // News & Politics
  '26': 1.6,  // Howto & Style
  '27': 1.5,  // Education
  '28': 1.8,  // Science & Technology
  '29': 0.9,  // Nonprofits
};

const MONETIZATION_FRIENDLY = new Set(['2', '19', '22', '24', '25', '26', '27', '28', '17', '20']);

export function estimateEarnings(views, categoryId) {
  const multiplier = CATEGORY_RPM_MULTIPLIER[String(categoryId)] ?? 1;
  // Only a slice of views are monetized (ad blockers, non-ad markets, skips).
  const monetizedViews = views * 0.55;
  const low = (monetizedViews / 1000) * config.rpmLow * multiplier;
  const high = (monetizedViews / 1000) * config.rpmHigh * multiplier;
  return { low: round(low, 2), high: round(high, 2), rpmMultiplier: multiplier };
}

/**
 * Ad-eligibility signal.
 *
 * YouTube does not expose "this video is running ads" through its public API,
 * so this is an explicit heuristic: mid-roll eligible length, a monetizable
 * category, standard licence, not made for kids, and not a livestream.
 * Treated as a confidence score, never as a fact.
 */
export function adSignal(video) {
  const seconds = durationToSeconds(video.contentDetails?.duration);
  const categoryId = String(video.snippet?.categoryId || '');
  const madeForKids = Boolean(video.status?.madeForKids);
  const licensed = video.contentDetails?.licensedContent === true;
  const reasons = [];
  let score = 0;

  if (seconds >= 480) { score += 40; reasons.push('8+ min (mid-roll eligible)'); }
  else if (seconds >= 60) { score += 18; reasons.push('Pre/post-roll eligible'); }
  else { reasons.push('Short-form (Shorts ad pool)'); score += 8; }

  if (MONETIZATION_FRIENDLY.has(categoryId)) { score += 25; reasons.push('Advertiser-friendly category'); }
  if (!madeForKids) { score += 20; reasons.push('Not made for kids'); }
  else reasons.push('Made for kids (limited ads)');
  if (video.status?.license === 'youtube') { score += 10; reasons.push('Standard YouTube licence'); }
  if (licensed) { score += 5; reasons.push('Claimed/licensed content'); }
  if (video.snippet?.liveBroadcastContent && video.snippet.liveBroadcastContent !== 'none') {
    score -= 15; reasons.push('Live broadcast');
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 70 ? 'Likely' : score >= 45 ? 'Possible' : 'Unlikely';
  return { score, label, reasons };
}

export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function countLinks(text) {
  return (String(text || '').match(/https?:\/\/[^\s)]+/g) || []).length;
}

function extractHashtags(text) {
  return [...new Set((String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()))];
}

/**
 * Build the full research row for a video.
 * Returns 40+ fields; the UI exposes all of them as sortable columns.
 */
export function buildVideoRow(video, context = {}) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const details = video.contentDetails || {};
  const status = video.status || {};

  const views = Number(stats.viewCount || 0);
  const likes = stats.likeCount === undefined ? null : Number(stats.likeCount);
  const commentCount = stats.commentCount === undefined ? null : Number(stats.commentCount);
  const seconds = durationToSeconds(details.duration);
  const ageDays = daysSince(snippet.publishedAt);
  const ageDaysSafe = Math.max(1, ageDays);
  const avgDailyViews = views / ageDaysSafe;
  const channel = context.channel || null;
  const subscribers = channel ? Number(channel.statistics?.subscriberCount || 0) : null;
  const earnings = estimateEarnings(views, snippet.categoryId);
  const ads = adSignal(video);
  const tags = snippet.tags || [];
  const description = snippet.description || '';
  const engagements = (likes || 0) + (commentCount || 0);

  const row = {
    // Identity
    videoId: video.id,
    title: snippet.title || '',
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    channelTitle: snippet.channelTitle || '',
    channelId: snippet.channelId || '',
    channelUrl: snippet.channelId ? `https://www.youtube.com/channel/${snippet.channelId}` : '',

    // Timing
    publishedAt: snippet.publishedAt || null,
    publishAgeDays: round(ageDays, 1),
    publishAgeLabel: humanAge(ageDays),
    publishedHourUtc: snippet.publishedAt ? new Date(snippet.publishedAt).getUTCHours() : null,
    publishedWeekday: snippet.publishedAt
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(snippet.publishedAt).getUTCDay()]
      : null,

    // Core performance
    views,
    likes,
    comments: commentCount,
    avgDailyViews: round(avgDailyViews, 1),
    avgMonthlyViews: round(avgDailyViews * 30, 0),
    viewsPerSubscriber: subscribers ? round(views / subscribers, 3) : null,

    // Engagement quality
    engagementRate: views ? round((engagements / views) * 100, 3) : 0,
    likeRate: views && likes !== null ? round((likes / views) * 100, 3) : null,
    commentRate: views && commentCount !== null ? round((commentCount / views) * 100, 3) : null,
    likesPerComment: commentCount ? round((likes || 0) / commentCount, 2) : null,

    // Money
    estEarningsLow: earnings.low,
    estEarningsHigh: earnings.high,
    estEarningsPerMonth: round(((avgDailyViews * 30) / 1000) * 0.55 * ((config.rpmLow + config.rpmHigh) / 2) * earnings.rpmMultiplier, 2),
    adsFound: ads.label,
    adSignalScore: ads.score,
    adSignalReasons: ads.reasons,

    // Format
    durationSeconds: seconds,
    duration: formatDuration(seconds),
    format: seconds > 0 && seconds <= 60 ? 'Short' : seconds <= 600 ? 'Standard' : 'Long',
    isShort: seconds > 0 && seconds <= 60,
    definition: (details.definition || '').toUpperCase() || null,
    hasCaptions: details.caption === 'true' || details.caption === true,
    dimension: details.dimension || null,
    projection: details.projection || null,

    // Metadata / SEO
    categoryId: snippet.categoryId || null,
    category: context.categoryNames?.[snippet.categoryId] || null,
    tags,
    tagCount: tags.length,
    tagCharacters: tags.join('').length,
    titleLength: (snippet.title || '').length,
    titleWords: (snippet.title || '').trim().split(/\s+/).filter(Boolean).length,
    descriptionLength: description.length,
    descriptionLinks: countLinks(description),
    hashtags: extractHashtags(`${snippet.title || ''} ${description}`),
    defaultLanguage: snippet.defaultAudioLanguage || snippet.defaultLanguage || null,
    madeForKids: status.madeForKids ?? null,
    license: status.license || null,
    liveBroadcast: snippet.liveBroadcastContent || 'none',
    privacyStatus: status.privacyStatus || null,

    // Channel context
    subscribers,
    channelVideoCount: channel ? Number(channel.statistics?.videoCount || 0) : null,
    channelViews: channel ? Number(channel.statistics?.viewCount || 0) : null,
  };

  row.hashtagCount = row.hashtags.length;
  return row;
}

export function median(values) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function humanAge(days) {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Outlier score = views vs the median of the comparison set.
 * 1.0 means typical; 5.0 means the video pulled 5x its peer group.
 * This is the single most useful column for spotting a topic worth modelling.
 */
export function addOutlierScores(rows) {
  const medianViews = median(rows.map((r) => r.views));
  const medianDaily = median(rows.map((r) => r.avgDailyViews));
  for (const row of rows) {
    row.outlierScore = medianViews ? round(row.views / medianViews, 2) : null;
    row.velocityScore = medianDaily ? round(row.avgDailyViews / medianDaily, 2) : null;
    row.opportunity = opportunityScore(row);
  }
  return rows;
}

/**
 * Opportunity score (0-100): how attractive this topic is to copy.
 * Rewards high daily velocity and strong engagement, rewards small channels
 * getting big numbers (proof the topic carries the video, not the brand).
 */
export function opportunityScore(row) {
  let score = 0;
  const velocity = row.avgDailyViews || 0;
  if (velocity >= 10000) score += 40;
  else if (velocity >= 2000) score += 32;
  else if (velocity >= 500) score += 24;
  else if (velocity >= 100) score += 14;
  else if (velocity >= 20) score += 6;

  const vps = row.viewsPerSubscriber;
  if (vps !== null && vps !== undefined) {
    if (vps >= 10) score += 30;
    else if (vps >= 3) score += 22;
    else if (vps >= 1) score += 14;
    else if (vps >= 0.3) score += 7;
  } else if (row.outlierScore >= 2) score += 18;

  const engagement = row.engagementRate || 0;
  if (engagement >= 8) score += 20;
  else if (engagement >= 4) score += 15;
  else if (engagement >= 2) score += 10;
  else if (engagement >= 1) score += 5;

  if (row.publishAgeDays <= 30) score += 10;
  else if (row.publishAgeDays <= 120) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Column dictionary the UI renders from. Order matters. */
export const VIDEO_COLUMNS = [
  { key: 'thumbnail', label: 'Thumb', type: 'thumb', width: 92 },
  { key: 'title', label: 'Title', type: 'link', linkKey: 'url', width: 320 },
  { key: 'channelTitle', label: 'Channel', type: 'link', linkKey: 'channelUrl', width: 170 },
  { key: 'views', label: 'Views', type: 'int' },
  { key: 'avgDailyViews', label: 'Views / Day', type: 'int' },
  { key: 'opportunity', label: 'Opportunity', type: 'score' },
  { key: 'outlierScore', label: 'Outlier x', type: 'float' },
  { key: 'velocityScore', label: 'Velocity x', type: 'float' },
  { key: 'likes', label: 'Likes', type: 'int' },
  { key: 'comments', label: 'Comments', type: 'int' },
  { key: 'engagementRate', label: 'Engage %', type: 'float' },
  { key: 'likeRate', label: 'Like %', type: 'float' },
  { key: 'commentRate', label: 'Comment %', type: 'float' },
  { key: 'likesPerComment', label: 'Likes / Comment', type: 'float' },
  { key: 'subscribers', label: 'Subs', type: 'int' },
  { key: 'viewsPerSubscriber', label: 'Views / Sub', type: 'float' },
  { key: 'estEarningsLow', label: 'Est. $ Low', type: 'money' },
  { key: 'estEarningsHigh', label: 'Est. $ High', type: 'money' },
  { key: 'estEarningsPerMonth', label: 'Est. $ / Month', type: 'money' },
  { key: 'adsFound', label: 'Ads Found', type: 'badge' },
  { key: 'adSignalScore', label: 'Ad Score', type: 'score' },
  { key: 'publishAgeLabel', label: 'Age', type: 'text' },
  { key: 'publishAgeDays', label: 'Age (days)', type: 'float' },
  { key: 'publishedAt', label: 'Published', type: 'date' },
  { key: 'publishedWeekday', label: 'Day', type: 'text' },
  { key: 'publishedHourUtc', label: 'Hour (UTC)', type: 'int' },
  { key: 'duration', label: 'Length', type: 'text' },
  { key: 'durationSeconds', label: 'Seconds', type: 'int' },
  { key: 'format', label: 'Format', type: 'badge' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'tagCount', label: 'Tags', type: 'int' },
  { key: 'titleLength', label: 'Title Chars', type: 'int' },
  { key: 'titleWords', label: 'Title Words', type: 'int' },
  { key: 'descriptionLength', label: 'Desc Chars', type: 'int' },
  { key: 'descriptionLinks', label: 'Desc Links', type: 'int' },
  { key: 'hashtagCount', label: 'Hashtags', type: 'int' },
  { key: 'hasCaptions', label: 'Captions', type: 'bool' },
  { key: 'definition', label: 'Quality', type: 'text' },
  { key: 'defaultLanguage', label: 'Language', type: 'text' },
  { key: 'madeForKids', label: 'Kids', type: 'bool' },
  { key: 'license', label: 'Licence', type: 'text' },
  { key: 'liveBroadcast', label: 'Live', type: 'text' },
  { key: 'channelVideoCount', label: 'Ch. Videos', type: 'int' },
  { key: 'channelViews', label: 'Ch. Views', type: 'int' },
  { key: 'videoId', label: 'Video ID', type: 'text' },
];
