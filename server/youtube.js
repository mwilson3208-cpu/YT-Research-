import { config, isLive } from './config.js';
import { cached } from './cache.js';

const API = 'https://www.googleapis.com/youtube/v3';

// Approximate quota cost per endpoint, so the UI can warn before a heavy run.
const QUOTA_COST = {
  search: 100,
  videos: 1,
  channels: 1,
  commentThreads: 1,
  playlistItems: 1,
  playlists: 1,
  videoCategories: 1,
};

const usage = { units: 0, calls: 0, byEndpoint: {}, startedAt: new Date().toISOString() };

export function quotaUsage() {
  return { ...usage, byEndpoint: { ...usage.byEndpoint }, dailyLimit: 10000, live: isLive() };
}

export class YouTubeError extends Error {
  constructor(message, status, reason) {
    super(message);
    this.name = 'YouTubeError';
    this.status = status || 502;
    this.reason = reason || 'youtube_error';
  }
}

function track(endpoint) {
  const cost = QUOTA_COST[endpoint] ?? 1;
  usage.units += cost;
  usage.calls += 1;
  usage.byEndpoint[endpoint] = (usage.byEndpoint[endpoint] || 0) + cost;
}

/**
 * Call a YouTube Data API v3 endpoint. Results are cached by endpoint+params.
 */
export async function ytFetch(endpoint, params = {}, { ttlMs } = {}) {
  if (!isLive()) {
    throw new YouTubeError('No YOUTUBE_API_KEY configured. Running in demo mode.', 503, 'demo_mode');
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const cacheKey = `yt:${endpoint}?${query.toString()}`;
  query.set('key', config.apiKey);

  return cached(cacheKey, async () => {
    track(endpoint);
    let response;
    try {
      response = await fetch(`${API}/${endpoint}?${query.toString()}`, {
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new YouTubeError(`Network error reaching YouTube: ${error.message}`, 502, 'network');
    }
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new YouTubeError('YouTube returned a non-JSON response.', 502, 'bad_response');
    }
    if (!response.ok) {
      const detail = body?.error?.errors?.[0] || {};
      const reason = detail.reason || 'youtube_error';
      const message = body?.error?.message || `YouTube API error (${response.status})`;
      throw new YouTubeError(message, response.status === 403 ? 403 : response.status, reason);
    }
    return body;
  }, ttlMs);
}

/** Chunk ids into groups of 50 (the API maximum per call). */
export function chunk(items, size = 50) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function searchVideos({
  q,
  maxResults = 25,
  order = 'relevance',
  publishedAfter,
  regionCode,
  relevanceLanguage,
  videoDuration,
  channelId,
  type = 'video',
  pageToken,
}) {
  const perPage = Math.min(50, Math.max(1, maxResults));
  const items = [];
  let token = pageToken;
  let nextPageToken = null;
  while (items.length < maxResults) {
    const data = await ytFetch('search', {
      part: 'snippet',
      q,
      type,
      order,
      maxResults: Math.min(perPage, maxResults - items.length),
      publishedAfter,
      regionCode,
      relevanceLanguage,
      videoDuration,
      channelId,
      pageToken: token,
    });
    items.push(...(data.items || []));
    nextPageToken = data.nextPageToken || null;
    token = data.nextPageToken;
    if (!token) break;
  }
  return { items: items.slice(0, maxResults), nextPageToken };
}

export async function videosByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = [];
  for (const group of chunk(unique)) {
    const data = await ytFetch('videos', {
      part: 'snippet,statistics,contentDetails,status,topicDetails',
      id: group.join(','),
      maxResults: 50,
    });
    out.push(...(data.items || []));
  }
  return out;
}

export async function channelsByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = [];
  for (const group of chunk(unique)) {
    const data = await ytFetch('channels', {
      part: 'snippet,statistics,contentDetails,brandingSettings,topicDetails,status',
      id: group.join(','),
      maxResults: 50,
    });
    out.push(...(data.items || []));
  }
  return out;
}

export async function channelByHandleOrId(input) {
  const resolved = await resolveChannelId(input);
  if (!resolved) return null;
  const [channel] = await channelsByIds([resolved]);
  return channel || null;
}

/** Accepts a channel id, @handle, /c/ or /user/ URL, or a plain channel name. */
export async function resolveChannelId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^UC[\w-]{22}$/.test(raw)) return raw;

  const urlMatch = raw.match(/youtube\.com\/(channel\/|@|c\/|user\/)([^/?#]+)/i);
  const handleMatch = raw.match(/^@([\w.-]+)$/);
  let term = raw;
  if (urlMatch) {
    if (urlMatch[1].toLowerCase() === 'channel/') return urlMatch[2];
    term = urlMatch[2];
  } else if (handleMatch) {
    term = handleMatch[1];
  }

  // A video URL resolves through the video's channel.
  const videoId = parseVideoId(raw);
  if (videoId) {
    const [video] = await videosByIds([videoId]);
    if (video) return video.snippet.channelId;
  }

  const { items } = await searchVideos({ q: term, type: 'channel', maxResults: 1 });
  return items[0]?.snippet?.channelId || items[0]?.id?.channelId || null;
}

export function parseVideoId(input) {
  const raw = String(input || '').trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function parsePlaylistId(input) {
  const raw = String(input || '').trim();
  if (/^(PL|UU|FL|OL|RD)[\w-]{10,}$/.test(raw)) return raw;
  const match = raw.match(/[?&]list=([\w-]+)/);
  return match ? match[1] : null;
}

export async function playlistVideoIds(playlistId, limit = 50) {
  const ids = [];
  let pageToken;
  while (ids.length < limit) {
    const data = await ytFetch('playlistItems', {
      part: 'contentDetails',
      playlistId,
      maxResults: Math.min(50, limit - ids.length),
      pageToken,
    });
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return ids.slice(0, limit);
}

export async function channelUploads(channelId, limit = 50) {
  const [channel] = await channelsByIds([channelId]);
  if (!channel) return { channel: null, videos: [] };
  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return { channel, videos: [] };
  const ids = await playlistVideoIds(uploadsId, limit);
  const videos = await videosByIds(ids);
  return { channel, videos };
}

export async function mostPopular({ regionCode, videoCategoryId, maxResults = 50 }) {
  const data = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails,status',
    chart: 'mostPopular',
    regionCode: regionCode || config.region,
    videoCategoryId: videoCategoryId || undefined,
    maxResults: Math.min(50, maxResults),
  });
  return data.items || [];
}

export async function videoCategories(regionCode) {
  const data = await ytFetch('videoCategories', {
    part: 'snippet',
    regionCode: regionCode || config.region,
    hl: config.language,
  }, { ttlMs: 24 * 60 * 60 * 1000 });
  return (data.items || [])
    .filter((item) => item.snippet?.assignable !== false)
    .map((item) => ({ id: item.id, title: item.snippet.title }));
}

export async function comments(videoId, { limit = 100, order = 'relevance' } = {}) {
  const out = [];
  let pageToken;
  while (out.length < limit) {
    const data = await ytFetch('commentThreads', {
      part: 'snippet',
      videoId,
      order,
      textFormat: 'plainText',
      maxResults: Math.min(100, limit - out.length),
      pageToken,
    });
    for (const thread of data.items || []) {
      const top = thread.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      out.push({
        id: thread.id,
        author: top.authorDisplayName,
        authorChannelUrl: top.authorChannelUrl,
        text: top.textDisplay || top.textOriginal || '',
        likes: Number(top.likeCount || 0),
        replies: Number(thread.snippet.totalReplyCount || 0),
        publishedAt: top.publishedAt,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, limit);
}
