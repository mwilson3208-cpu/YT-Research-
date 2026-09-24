import { cached } from '../cache.js';
import { config } from '../config.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const MODIFIERS = [
  'how to', 'best', 'why', 'what', 'for beginners', 'tutorial', 'explained',
  'vs', 'review', 'tips', 'mistakes', 'ideas', 'examples', 'guide', 'checklist',
  '2026', 'at home', 'without', 'free', 'step by step', 'for seniors', 'script',
];
const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'should', 'does', 'is', 'do'];

/**
 * YouTube's own autocomplete endpoint. These are real searches typed by real
 * people, which is why it beats guessing keywords from a thesaurus.
 */
export async function suggest(seed, { language = config.language, region = config.region } = {}) {
  const term = String(seed || '').trim();
  if (!term) return [];
  const key = `suggest:${language}:${region}:${term.toLowerCase()}`;
  return cached(key, async () => {
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'youtube');
    url.searchParams.set('ds', 'yt');
    url.searchParams.set('hl', language);
    url.searchParams.set('gl', region.toLowerCase());
    url.searchParams.set('q', term);
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TubeAtlas/1.0' } });
      if (!response.ok) return [];
      const text = await response.text();
      return parseSuggestPayload(text);
    } catch {
      return [];
    }
  }, 6 * 60 * 60 * 1000);
}

/** The endpoint answers with JSONP: window.google.ac.h([...]) */
export function parseSuggestPayload(text) {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start === -1 || end === -1) return [];
  let payload;
  try {
    payload = JSON.parse(text.slice(start + 1, end));
  } catch {
    return [];
  }
  const list = Array.isArray(payload?.[1]) ? payload[1] : [];
  return list
    .map((entry) => (Array.isArray(entry) ? entry[0] : entry))
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
}

/**
 * Expand one seed into a large keyword set: raw suggestions, A-Z suffixes,
 * modifier prefixes/suffixes, and question phrasings.
 */
export async function expandKeywords(seed, { depth = 'standard', language, region } = {}) {
  const term = String(seed || '').trim().toLowerCase();
  if (!term) return { seed: '', keywords: [] };

  const variants = new Set([term]);
  if (depth !== 'quick') {
    for (const letter of ALPHABET) variants.add(`${term} ${letter}`);
    for (const modifier of MODIFIERS) {
      variants.add(`${modifier} ${term}`);
      variants.add(`${term} ${modifier}`);
    }
    for (const word of QUESTION_WORDS) variants.add(`${word} ${term}`);
  } else {
    for (const letter of ALPHABET.slice(0, 8)) variants.add(`${term} ${letter}`);
    for (const modifier of MODIFIERS.slice(0, 8)) variants.add(`${modifier} ${term}`);
  }

  const list = [...variants];
  const collected = new Map();
  const batchSize = 12;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((variant) => suggest(variant, { language, region })));
    for (const group of results) {
      for (const phrase of group) {
        const clean = phrase.toLowerCase().trim();
        if (!clean || clean.length < 3) continue;
        collected.set(clean, (collected.get(clean) || 0) + 1);
      }
    }
  }

  const keywords = [...collected.entries()]
    .map(([keyword, appearances]) => scoreKeyword(keyword, appearances, term))
    .sort((a, b) => b.score - a.score);

  return { seed: term, variantsProbed: list.length, keywords };
}

/**
 * Heuristic keyword scoring without extra API calls.
 * - appearances across autocomplete variants approximate demand
 * - word count approximates competition (long tail is easier to rank)
 * - question and intent markers flag ready-to-script topics
 */
export function scoreKeyword(keyword, appearances, seed) {
  const words = keyword.split(/\s+/).filter(Boolean);
  const isQuestion = QUESTION_WORDS.includes(words[0]);
  const hasIntent = /\b(how to|best|tutorial|review|vs|guide|tips|step by step|explained|for beginners)\b/.test(keyword);
  const containsSeed = keyword.includes(seed);

  const demand = Math.min(100, appearances * 14 + (containsSeed ? 12 : 0) + (words.length <= 3 ? 18 : 0));
  const competition = Math.max(5, Math.min(100, 105 - (words.length * 13) - (isQuestion ? 8 : 0)));
  const score = Math.round(Math.max(0, Math.min(100, (demand * 0.62) + ((100 - competition) * 0.38))));

  return {
    keyword,
    words: words.length,
    appearances,
    demand,
    competition,
    difficulty: competition >= 75 ? 'Hard' : competition >= 50 ? 'Medium' : 'Easy',
    score,
    isQuestion,
    hasIntent,
    type: isQuestion ? 'Question' : hasIntent ? 'Intent' : words.length >= 4 ? 'Long tail' : 'Head term',
    searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
  };
}

const STOP_WORDS = new Set(`a about above after again against all am an and any are aren't as at be because been before
being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few
for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his
how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off
on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such
than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those
through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's
which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves
just get got make video youtube like really thing things want know going'`.split(/\s+/).filter(Boolean));

export const isStopWord = (word) => STOP_WORDS.has(word);

/** Frequency ranking of words and n-grams across a set of strings. */
export function extractPhrases(texts, { minCount = 2, maxTerms = 60 } = {}) {
  const unigrams = new Map();
  const bigrams = new Map();
  const trigrams = new Map();

  for (const text of texts) {
    const words = String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const meaningful = words.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of meaningful) unigrams.set(word, (unigrams.get(word) || 0) + 1);
    for (let i = 0; i < words.length - 1; i += 1) {
      const pair = `${words[i]} ${words[i + 1]}`;
      if (STOP_WORDS.has(words[i]) && STOP_WORDS.has(words[i + 1])) continue;
      if (words[i].length < 3 && words[i + 1].length < 3) continue;
      bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
    }
    for (let i = 0; i < words.length - 2; i += 1) {
      const triple = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (words.slice(i, i + 3).every((w) => STOP_WORDS.has(w))) continue;
      trigrams.set(triple, (trigrams.get(triple) || 0) + 1);
    }
  }

  const rank = (map, type) => [...map.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([phrase, count]) => ({ phrase, count, type }));

  return {
    words: rank(unigrams, 'word'),
    pairs: rank(bigrams, 'pair'),
    triples: rank(trigrams, 'triple'),
  };
}
