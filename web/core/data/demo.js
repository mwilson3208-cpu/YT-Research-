/**
 * Demo dataset.
 *
 * Shaped exactly like YouTube Data API v3 responses so demo mode runs through
 * the same metrics, scoring and table code as live mode. Deterministic: the
 * same seed always builds the same library, so screenshots and tests are stable.
 */

const CATEGORY_NAMES = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals',
  '17': 'Sports', '19': 'Travel & Events', '20': 'Gaming', '22': 'People & Blogs',
  '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style',
  '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism',
};

export const DEMO_CATEGORIES = Object.entries(CATEGORY_NAMES).map(([id, title]) => ({ id, title }));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS = [
  { id: 'UCdemoFaceless0000000001', title: 'Quiet Mind Narration', subs: 412000, videos: 318, niche: 'meditation', category: '22' },
  { id: 'UCdemoFaceless0000000002', title: 'Ledger & Lore', subs: 88400, videos: 141, niche: 'finance history', category: '25' },
  { id: 'UCdemoFaceless0000000003', title: 'The Sleepless Archive', subs: 1240000, videos: 502, niche: 'true stories', category: '24' },
  { id: 'UCdemoFaceless0000000004', title: 'Voice of Machines', subs: 26500, videos: 74, niche: 'ai tools', category: '28' },
  { id: 'UCdemoFaceless0000000005', title: 'Sidehustle Signal', subs: 153000, videos: 226, niche: 'side hustle', category: '26' },
  { id: 'UCdemoFaceless0000000006', title: 'Deep Focus Documentary', subs: 640000, videos: 187, niche: 'documentary', category: '27' },
  { id: 'UCdemoFaceless0000000007', title: 'Night Shift Audio', subs: 9200, videos: 41, niche: 'podcast', category: '22' },
  { id: 'UCdemoFaceless0000000008', title: 'Atlas of Odd Facts', subs: 372000, videos: 615, niche: 'facts', category: '27' },
];

const TOPIC_SEEDS = {
  meditation: ['Sleep Story: The Lighthouse Keeper', 'Rain on an Empty Cabin', '10 Minute Reset Before Bed', 'Body Scan for Racing Thoughts', 'Ocean Breathing Session'],
  'finance history': ['The Bank That Printed Its Own Collapse', 'How One Trader Broke a Currency', 'The Forgotten Panic of 1907', 'Why This Company Vanished Overnight', 'The Debt Nobody Wanted'],
  'true stories': ['The Passenger Who Never Boarded', 'Three Days in the Wrong Town', 'The Letter That Arrived 40 Years Late', 'She Called the Same Number for a Decade', 'The Cabin at the End of the Road'],
  'ai tools': ['I Replaced My Whole Workflow With 3 AI Tools', 'The AI Voice Setup I Actually Use', 'Stop Paying for These AI Subscriptions', 'Build a Faceless Channel Pipeline', 'AI Narration vs Human Narration'],
  'side hustle': ['The Faceless Channel Blueprint', 'How I Made My First $500 Narrating', '7 Side Hustles That Need No Camera', 'Selling Voiceovers Without a Studio', 'From Zero to 1000 Subscribers'],
  documentary: ['The City Built on a Mistake', 'Inside the Longest Bridge Project', 'The Engineer Who Warned Everyone', 'How a Single Map Redrew a Border', 'The Factory That Ran for 100 Years'],
  podcast: ['Long Talk: Why Creators Burn Out', 'The Slow Growth Episode', 'Audio Only: Building in Public', 'Late Night Notes on Discipline', 'One Hour on Consistency'],
  facts: ['21 Facts That Sound Fake', 'Why Airplane Windows Are Round', 'The Strangest Law Still on the Books', '15 Things Your Body Does While You Sleep', 'The Mistake That Named a Country'],
};

const TAG_POOL = {
  meditation: ['sleep story', 'meditation', 'relaxing narration', 'calm voice', 'insomnia help', 'bedtime story adults'],
  'finance history': ['financial history', 'economics explained', 'market crash', 'business documentary', 'money history'],
  'true stories': ['true story', 'storytime', 'mystery', 'unsolved', 'narration', 'documentary style'],
  'ai tools': ['ai tools', 'ai voice', 'text to speech', 'faceless youtube', 'automation', 'content workflow'],
  'side hustle': ['side hustle', 'faceless channel', 'make money online', 'voiceover work', 'passive income'],
  documentary: ['documentary', 'engineering', 'history documentary', 'narrated documentary', 'deep dive'],
  podcast: ['podcast', 'creator podcast', 'long form', 'audio episode', 'solo podcast'],
  facts: ['facts', 'did you know', 'interesting facts', 'trivia', 'educational shorts'],
};

const COMMENT_BANK = [
  'This is exactly what I needed, thank you so much!',
  'Your voice is incredibly calming, I fell asleep in ten minutes.',
  'Can you make a part 2 on this? Please!',
  'How do you pick the background music? It fits perfectly.',
  'Honestly the best narration channel on YouTube right now.',
  'The audio quality dropped around 4:32, just letting you know.',
  'This felt like clickbait, the title promised more than the video gave.',
  'I have listened to this three times already. Subscribed.',
  'Would love a video about the research process behind these.',
  'What software do you use for the voiceover? Sounds very natural.',
  'Not going to lie, the intro was too long for me.',
  'Please do a video on faceless channel setup from scratch.',
  'Amazing work, this deserves way more views.',
  'Is this AI or a real human voice? Genuinely cannot tell.',
  'The pacing is perfect. Most channels rush these stories.',
  'I disagree with the conclusion but the storytelling was solid.',
  'When is the next episode coming out?',
  'This helped me finally understand the topic, thanks!',
  'Too many ads in the middle, kind of ruined the flow.',
  'Been here since 10k subs. Great to see the growth.',
  'Could you cover the 1920s version of this story?',
  'Saved this to my watch later, brilliant stuff.',
  'The script writing on this channel is underrated.',
  'My kids listen to these at bedtime now.',
  'Where do you source the images? Want to do something similar.',
];

let cache = null;

export function demoLibrary() {
  if (cache) return cache;
  const random = mulberry32(20260924);
  const now = Date.now();

  const channels = CHANNELS.map((channel) => ({
    kind: 'youtube#channel',
    id: channel.id,
    snippet: {
      title: channel.title,
      description: `${channel.title} publishes narrated ${channel.niche} content for listeners. Demo data.`,
      customUrl: `@${channel.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
      publishedAt: new Date(now - (600 + Math.floor(random() * 1800)) * 86400000).toISOString(),
      country: ['US', 'GB', 'CA', 'AU'][Math.floor(random() * 4)],
      thumbnails: { default: { url: '' }, medium: { url: '' } },
    },
    statistics: {
      subscriberCount: String(channel.subs),
      videoCount: String(channel.videos),
      viewCount: String(Math.round(channel.subs * (48 + random() * 160))),
      hiddenSubscriberCount: false,
    },
    contentDetails: { relatedPlaylists: { uploads: `UU${channel.id.slice(2)}` } },
    brandingSettings: { channel: { keywords: (TAG_POOL[channel.niche] || []).join(' ') } },
    _niche: channel.niche,
  }));

  const videos = [];
  let counter = 0;
  for (const channel of channels) {
    const seeds = TOPIC_SEEDS[channel._niche];
    const perChannel = 9;
    for (let i = 0; i < perChannel; i += 1) {
      counter += 1;
      const base = seeds[i % seeds.length];
      const variant = i < seeds.length ? base : `${base} (Part ${Math.floor(i / seeds.length) + 1})`;
      const isShort = i % 3 === 2;
      const ageDays = 2 + Math.floor(random() * 700);
      const publishedAt = new Date(now - ageDays * 86400000).toISOString();
      const subs = Number(channel.statistics.subscriberCount);
      // Occasional breakout so outlier detection has something real to find.
      const breakout = random() > 0.85 ? 4 + random() * 9 : 0.15 + random() * 1.4;
      const views = Math.round(subs * breakout * (isShort ? 1.9 : 1) * (0.4 + random()));
      const likeRate = 0.02 + random() * 0.055;
      const commentRate = likeRate * (0.02 + random() * 0.09);
      const seconds = isShort
        ? 18 + Math.floor(random() * 42)
        : 240 + Math.floor(random() * 3300);
      const tags = shuffle(TAG_POOL[channel._niche] || [], random).slice(0, 4 + Math.floor(random() * 3));

      videos.push({
        kind: 'youtube#video',
        id: `demo${String(counter).padStart(7, '0')}`,
        snippet: {
          title: isShort ? `${variant} #shorts` : variant,
          description: `${variant}\n\nNarrated with Fusion Voice. Full write-up and sources below.\n\nhttps://example.com/sources\n\n#${(channel._niche || '').replace(/\s+/g, '')} #narration #voiceover`,
          channelId: channel.id,
          channelTitle: channel.snippet.title,
          publishedAt,
          categoryId: CHANNELS.find((c) => c.id === channel.id).category,
          tags,
          thumbnails: {
            default: { url: '' },
            medium: { url: '' },
          },
          defaultAudioLanguage: 'en',
          liveBroadcastContent: 'none',
        },
        statistics: {
          viewCount: String(views),
          likeCount: String(Math.round(views * likeRate)),
          commentCount: String(Math.round(views * commentRate)),
          favoriteCount: '0',
        },
        contentDetails: {
          duration: toIsoDuration(seconds),
          definition: 'hd',
          caption: random() > 0.35 ? 'true' : 'false',
          dimension: '2d',
          projection: 'rectangular',
          licensedContent: random() > 0.6,
        },
        status: {
          privacyStatus: 'public',
          license: 'youtube',
          madeForKids: false,
          embeddable: true,
        },
      });
    }
  }

  const commentsByVideo = new Map();
  for (const video of videos) {
    const count = 12 + Math.floor(random() * 26);
    const list = [];
    for (let i = 0; i < count; i += 1) {
      const text = COMMENT_BANK[Math.floor(random() * COMMENT_BANK.length)];
      list.push({
        id: `${video.id}-c${i}`,
        author: `listener_${Math.floor(random() * 9000) + 1000}`,
        authorChannelUrl: '',
        text,
        likes: Math.floor(random() ** 2 * 900),
        replies: Math.floor(random() ** 3 * 40),
        publishedAt: new Date(now - Math.floor(random() * 200) * 86400000).toISOString(),
      });
    }
    commentsByVideo.set(video.id, list.sort((a, b) => b.likes - a.likes));
  }

  cache = { channels, videos, commentsByVideo, categoryNames: CATEGORY_NAMES };
  return cache;
}

function toIsoDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s ? `${s}S` : ''}` || 'PT0S';
}

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const tokenize = (text) => String(text || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];

/** Keyword match against the demo library, ranked by relevance then views. */
export function demoSearch(query, { limit = 25, order = 'relevance', videoDuration, channelId } = {}) {
  const { videos } = demoLibrary();
  const terms = tokenize(query);
  let pool = videos;
  if (channelId) pool = pool.filter((video) => video.snippet.channelId === channelId);
  if (videoDuration === 'short') pool = pool.filter((v) => v.contentDetails.duration.match(/^PT([1-9]|[1-5]\d)S$/));
  if (videoDuration === 'long') pool = pool.filter((v) => /H/.test(v.contentDetails.duration) || /PT([2-9]\d|1\d\d)M/.test(v.contentDetails.duration));

  const scored = pool.map((video) => {
    const haystack = tokenize(`${video.snippet.title} ${video.snippet.description} ${(video.snippet.tags || []).join(' ')} ${video.snippet.channelTitle}`);
    const set = new Set(haystack);
    let relevance = 0;
    for (const term of terms) if (set.has(term)) relevance += 3;
    for (const term of terms) if (haystack.join(' ').includes(term)) relevance += 1;
    return { video, relevance };
  });

  const matched = terms.length ? scored.filter((entry) => entry.relevance > 0) : scored;
  const usable = matched.length ? matched : scored;

  const sorters = {
    relevance: (a, b) => b.relevance - a.relevance || Number(b.video.statistics.viewCount) - Number(a.video.statistics.viewCount),
    viewCount: (a, b) => Number(b.video.statistics.viewCount) - Number(a.video.statistics.viewCount),
    date: (a, b) => new Date(b.video.snippet.publishedAt) - new Date(a.video.snippet.publishedAt),
    rating: (a, b) => Number(b.video.statistics.likeCount) - Number(a.video.statistics.likeCount),
    title: (a, b) => a.video.snippet.title.localeCompare(b.video.snippet.title),
  };
  usable.sort(sorters[order] || sorters.relevance);
  return usable.slice(0, limit).map((entry) => entry.video);
}

export function demoVideosByIds(ids) {
  const { videos } = demoLibrary();
  const index = new Map(videos.map((video) => [video.id, video]));
  return ids.map((id) => index.get(id)).filter(Boolean);
}

export function demoChannel(input) {
  const { channels } = demoLibrary();
  const raw = String(input || '').trim().toLowerCase();
  return channels.find((channel) => channel.id.toLowerCase() === raw)
    || channels.find((channel) => channel.snippet.title.toLowerCase().includes(raw.replace(/^@/, '')))
    || channels.find((channel) => channel.snippet.customUrl.toLowerCase() === raw.replace(/^@/, `@`))
    || channels[0];
}

export function demoChannelVideos(channelId) {
  const { videos } = demoLibrary();
  return videos
    .filter((video) => video.snippet.channelId === channelId)
    .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
}

export function demoComments(videoId, limit = 100) {
  const { commentsByVideo, videos } = demoLibrary();
  const list = commentsByVideo.get(videoId) || commentsByVideo.get(videos[0].id) || [];
  return list.slice(0, limit);
}

export function demoTrending({ videoCategoryId, limit = 50 } = {}) {
  const { videos } = demoLibrary();
  let pool = [...videos];
  if (videoCategoryId) pool = pool.filter((video) => video.snippet.categoryId === String(videoCategoryId));
  if (!pool.length) pool = [...videos];
  return pool
    .map((video) => ({
      video,
      velocity: Number(video.statistics.viewCount) / Math.max(1, (Date.now() - new Date(video.snippet.publishedAt)) / 86400000),
    }))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, limit)
    .map((entry) => entry.video);
}

/** Offline stand-in for autocomplete, so the keyword tool works with no network. */
export function demoSuggest(seed) {
  const term = String(seed || '').trim().toLowerCase();
  if (!term) return [];
  const patterns = [
    '{t}', '{t} for beginners', 'how to {t}', 'best {t}', '{t} tutorial', '{t} explained',
    '{t} ideas', '{t} mistakes', '{t} 2026', '{t} step by step', 'why {t} fails',
    '{t} without a camera', '{t} with ai voice', '{t} script', '{t} checklist',
    '{t} vs traditional', 'is {t} worth it', '{t} income', '{t} tools', '{t} setup',
    '{t} niche ideas', 'free {t}', '{t} for seniors', '{t} case study', '{t} examples',
  ];
  return patterns.map((pattern) => pattern.replace('{t}', term));
}

/**
 * A demo caption track, so Video to Text and the Content Spinner are usable
 * offline. Live mode reads the real caption track from the watch page instead.
 */
const DEMO_TRANSCRIPT_LINES = [
  'Most people start a faceless channel the wrong way round.',
  'They pick a niche they like, record twenty videos, and then wonder why nothing lands.',
  'The channels that grow do the opposite. They research first and record second.',
  'So let me walk you through the order that actually works.',
  'Step one is demand. Before you write a script, you need proof that people are already searching for the topic.',
  'Autocomplete is the cheapest proof there is. Type your topic into the search box and read what comes back.',
  'Those suggestions are real searches typed by real people, ranked by how often they happen.',
  'Step two is competition. A topic with demand and no competition is usually a topic nobody can monetize.',
  'What you want is a topic with steady demand where the existing videos are beatable.',
  'Look for videos where the view count is far higher than the channel subscriber count.',
  'That gap tells you the topic carried the video, not the brand behind it.',
  'Those are the topics you can copy, because you do not need an audience to win them.',
  'Step three is format. Length is a strategic choice, not a habit.',
  'Under sixty seconds puts you in the Shorts feed, which is browse traffic and huge reach but weak intent.',
  'Past eight minutes you become eligible for mid-roll ads, which changes the economics per view.',
  'Pick the length that matches the job, then keep it consistent so the algorithm learns what you are.',
  'Step four is the title, and this is where most creators leave money on the table.',
  'Keep it between forty and seventy characters so search does not truncate it.',
  'Put the keyword near the front, include a number when it fits, and promise one specific outcome.',
  'Write ten titles, score them, and record the best one. Never record the first one you thought of.',
  'Step five is the script. Open with the payoff, not with your introduction.',
  'Nobody stays for a channel trailer. They stay because the first sentence promised something they want.',
  'Then deliver in beats. One idea, one example, one action, and move on.',
  'Step six is the audio itself, which for a faceless channel is the entire production.',
  'Consistent pace, clean levels, a short pause at every line break.',
  'If the narration is flat, the retention graph goes flat with it, no matter how good the research was.',
  'Step seven is the loop. After publishing, read your comments as a research tool.',
  'Every question in the comments is a video someone has already asked you to make.',
  'Every direct request is pre-validated demand from an audience you already have.',
  'That is the whole system. Research, format, title, script, audio, then listen and repeat.',
  'Do it in that order and you stop guessing what to make next.',
  'Do it backwards and you will keep producing content nobody was looking for.',
];

export function demoTranscript(videoId = 'demo0000001') {
  let cursor = 0;
  const segments = DEMO_TRANSCRIPT_LINES.map((text) => {
    const start = cursor;
    // Roughly 150 words per minute of narration.
    const duration = Math.max(2.4, (text.split(/\s+/).length / 150) * 60);
    cursor = Math.round((cursor + duration) * 10) / 10;
    return { start, duration: Math.round(duration * 10) / 10, text };
  });
  return {
    videoId,
    language: 'en',
    trackName: 'English (demo)',
    autoGenerated: false,
    availableLanguages: [{ code: 'en', name: 'English (demo)', auto: false }],
    segments,
  };
}
