import { isStopWord } from './keywords.js';

/**
 * Hashtag sets that pull traffic on YouTube. Broad tags give reach, niche tags
 * give relevance, and YouTube only honours the first three above the title -
 * so the response separates them out.
 */
const BROAD = [
  'youtube', 'youtubeshorts', 'shorts', 'viral', 'trending', 'fyp', 'explore',
  'newvideo', 'subscribe', 'contentcreator', 'creator', 'video',
];

const NICHE_MAP = {
  voiceover: ['voiceover', 'voiceoverartist', 'narration', 'voiceacting', 'audiobook', 'aivoice', 'texttospeech'],
  faceless: ['facelesschannel', 'facelessyoutube', 'facelesscontent', 'automatedchannel', 'cashcowchannel'],
  podcast: ['podcast', 'podcastclips', 'podcasting', 'audioshow', 'longform'],
  money: ['sidehustle', 'onlinebusiness', 'passiveincome', 'makemoneyonline', 'digitalproducts'],
  ai: ['ai', 'aitools', 'artificialintelligence', 'automation', 'aicontent'],
  business: ['business', 'entrepreneur', 'smallbusiness', 'marketing', 'leadership'],
  finance: ['finance', 'investing', 'money', 'stocks', 'personalfinance'],
  health: ['health', 'wellness', 'fitness', 'nutrition', 'mentalhealth'],
  history: ['history', 'documentary', 'historyfacts', 'storytime', 'truestory'],
  tech: ['tech', 'technology', 'gadgets', 'software', 'coding'],
  education: ['education', 'learning', 'study', 'howto', 'tutorial'],
  motivation: ['motivation', 'mindset', 'discipline', 'selfimprovement', 'growth'],
  story: ['storytelling', 'storytime', 'truecrime', 'mystery', 'narrative'],
  book: ['book', 'writing', 'author', 'selfpublishing', 'booktube'],
};

function toTag(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .join('');
}

/**
 * Build a hashtag pack from a topic string.
 * Returns primary (the 3 that display above the title), secondary, broad reach,
 * long tail, and a ready-to-paste block.
 */
export function generateHashtags(topic, { platform = 'youtube', limit = 30 } = {}) {
  const raw = String(topic || '').trim();
  if (!raw) return { topic: '', primary: [], secondary: [], broad: [], longTail: [], block: '' };

  const words = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => word.length > 2 && !isStopWord(word));

  const exact = toTag(raw);
  const primary = [];
  if (exact) primary.push(exact);
  for (const word of meaningful.slice(0, 4)) if (!primary.includes(word)) primary.push(word);

  // Pair words for mid-length tags, the ones that actually get browsed.
  const longTail = [];
  for (let i = 0; i < meaningful.length - 1; i += 1) {
    longTail.push(`${meaningful[i]}${meaningful[i + 1]}`);
  }
  for (const word of meaningful) {
    longTail.push(`${word}tips`, `${word}forbeginners`, `how to ${word}`.replace(/\s/g, ''));
  }

  const niche = new Set();
  for (const [key, tags] of Object.entries(NICHE_MAP)) {
    if (words.some((word) => word.includes(key) || key.includes(word))) {
      tags.forEach((tag) => niche.add(tag));
    }
  }
  // Always give faceless-audio creators their core set as a fallback.
  if (niche.size === 0) {
    ['voiceover', 'narration', 'facelesschannel', 'contentcreation'].forEach((tag) => niche.add(tag));
  }

  const broad = platform === 'shorts' ? ['shorts', 'youtubeshorts', 'shortsfeed', ...BROAD] : BROAD;

  const dedupe = (list, taken) => {
    const out = [];
    for (const item of list) {
      const tag = toTag(item);
      if (!tag || tag.length < 3 || taken.has(tag)) continue;
      taken.add(tag);
      out.push(tag);
    }
    return out;
  };

  const taken = new Set();
  const primaryTags = dedupe(primary, taken).slice(0, 3);
  const secondaryTags = dedupe([...niche], taken).slice(0, 10);
  const longTailTags = dedupe(longTail, taken).slice(0, 12);
  const broadTags = dedupe(broad, taken).slice(0, 8);

  const all = [...primaryTags, ...secondaryTags, ...longTailTags, ...broadTags].slice(0, limit);

  return {
    topic: raw,
    platform,
    primary: primaryTags.map((t) => `#${t}`),
    secondary: secondaryTags.map((t) => `#${t}`),
    longTail: longTailTags.map((t) => `#${t}`),
    broad: broadTags.map((t) => `#${t}`),
    all: all.map((t) => `#${t}`),
    block: all.map((t) => `#${t}`).join(' '),
    titleLine: primaryTags.slice(0, 3).map((t) => `#${t}`).join(' '),
    notes: [
      'YouTube shows only the first 3 hashtags from your description above the title.',
      'Stay under 15 hashtags total. More than 15 and YouTube ignores all of them.',
      'Put your exact topic tag first, then niche tags, then reach tags.',
    ],
  };
}
