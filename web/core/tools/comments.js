import { extractPhrases } from './keywords.js';

// A compact lexicon tuned for YouTube comments, where sentiment is blunt.
const POSITIVE = new Set(`love loved loving great amazing awesome excellent perfect helpful thanks thank thankyou best
brilliant fantastic wonderful good nice beautiful clear useful appreciate appreciated subscribed subscribing legend goat
incredible outstanding superb solid works worked working respect underrated gem quality inspiring inspired motivated
saved lifesaver genius insightful spot-on accurate exactly agree agreed yes fire banger`.split(/\s+/).filter(Boolean));

const NEGATIVE = new Set(`hate hated awful terrible worst bad boring useless waste wasted wrong misleading clickbait
confusing confused unclear disappointed disappointing dislike annoying stop garbage trash nonsense scam fake stolen
copied lies lying false inaccurate poor cringe unwatchable ads spam robotic monotone loud quiet unsubscribed`.split(/\s+/).filter(Boolean));

const NEGATORS = new Set(['not', "don't", 'dont', 'never', 'no', "isn't", "wasn't", 'cannot', "can't", 'without']);
const INTENSIFIERS = new Set(['very', 'really', 'so', 'extremely', 'absolutely', 'incredibly', 'super']);

const REQUEST_PATTERNS = [
  /\b(please|pls|plz)\b.{0,60}\b(make|do|cover|explain|video|part\s?\d)/i,
  /\bcan you\b.{0,60}\b(make|do|cover|explain|show)/i,
  /\bwould love\b.{0,40}\b(video|episode|part)/i,
  /\bwhen (is|will).{0,30}(part|next|episode)/i,
  /\bdo a video (on|about)\b/i,
  /\bpart\s?\d+\b/i,
];

/**
 * Collapse comments that ask the same thing.
 *
 * Several people asking one question is the strongest topic signal in a
 * comment section, so repeats are counted rather than listed again: the
 * best-liked wording represents the group and carries the combined likes.
 */
function groupRepeats(comments) {
  const groups = new Map();
  for (const comment of comments) {
    const key = comment.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...comment, occurrences: 1, totalLikes: comment.likes });
      continue;
    }
    existing.occurrences += 1;
    existing.totalLikes += comment.likes;
    // Keep the wording that resonated most.
    if (comment.likes > existing.likes) {
      Object.assign(existing, comment, { occurrences: existing.occurrences, totalLikes: existing.totalLikes });
    }
  }
  return [...groups.values()].sort((a, b) => b.totalLikes - a.totalLikes || b.occurrences - a.occurrences);
}

export function scoreSentiment(text) {
  const words = String(text || '').toLowerCase().match(/[\p{L}']+/gu) || [];
  let score = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    let value = POSITIVE.has(word) ? 1 : NEGATIVE.has(word) ? -1 : 0;
    if (!value) continue;
    hits += 1;
    const prev = words[i - 1];
    const prev2 = words[i - 2];
    if (NEGATORS.has(prev) || NEGATORS.has(prev2)) value *= -1;
    if (INTENSIFIERS.has(prev)) value *= 1.5;
    score += value;
  }
  const label = score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral';
  return { score: Math.round(score * 100) / 100, label, matches: hits };
}

/**
 * Comment analyzer. The point is not a pretty sentiment pie chart; it is to
 * surface the questions and requests hiding in the comments, because those are
 * pre-validated topics for your next video.
 */
export function analyzeComments(comments, { topKeywords = 25 } = {}) {
  const enriched = comments.map((comment) => {
    const sentiment = scoreSentiment(comment.text);
    const isQuestion = /\?/.test(comment.text) || /^(how|what|why|when|where|which|who|can|does|is|do)\b/i.test(comment.text.trim());
    const isRequest = REQUEST_PATTERNS.some((pattern) => pattern.test(comment.text));
    const words = comment.text.split(/\s+/).filter(Boolean).length;
    return {
      ...comment,
      sentiment: sentiment.label,
      sentimentScore: sentiment.score,
      isQuestion,
      isRequest,
      words,
      hasTimestamp: /\b\d{1,2}:\d{2}\b/.test(comment.text),
    };
  });

  const total = enriched.length || 1;
  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const comment of enriched) counts[comment.sentiment] += 1;

  const phrases = extractPhrases(enriched.map((c) => c.text), { minCount: 2, maxTerms: topKeywords });
  const questions = groupRepeats(enriched.filter((c) => c.isQuestion));
  const requests = groupRepeats(enriched.filter((c) => c.isRequest));

  return {
    analyzed: enriched.length,
    sentiment: {
      counts,
      positivePercent: Math.round((counts.positive / total) * 100),
      negativePercent: Math.round((counts.negative / total) * 100),
      neutralPercent: Math.round((counts.neutral / total) * 100),
      netScore: Math.round(((counts.positive - counts.negative) / total) * 100),
    },
    engagement: {
      totalLikes: enriched.reduce((sum, c) => sum + c.likes, 0),
      totalReplies: enriched.reduce((sum, c) => sum + c.replies, 0),
      averageWords: Math.round(enriched.reduce((sum, c) => sum + c.words, 0) / total),
      timestampMentions: enriched.filter((c) => c.hasTimestamp).length,
    },
    contentIdeas: {
      questions: questions.slice(0, 20),
      requests: requests.slice(0, 20),
      questionCount: enriched.filter((c) => c.isQuestion).length,
      requestCount: enriched.filter((c) => c.isRequest).length,
      uniqueQuestions: questions.length,
      uniqueRequests: requests.length,
    },
    keywords: [...phrases.words, ...phrases.pairs].sort((a, b) => b.count - a.count).slice(0, topKeywords),
    topComments: [...enriched].sort((a, b) => b.likes - a.likes).slice(0, 15),
    mostCritical: enriched.filter((c) => c.sentiment === 'negative').sort((a, b) => b.likes - a.likes).slice(0, 10),
    comments: enriched,
  };
}
