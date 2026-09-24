/**
 * Content spinner.
 *
 * Rewrites source text into fresh phrasing you can narrate. It is a
 * transparent rules engine: a synonym bank, sentence openers, contraction
 * handling and structural reshuffling. No hidden model, so the output is
 * predictable and yours to edit.
 */

const SYNONYMS = {
  important: ['essential', 'critical', 'vital', 'key'],
  big: ['large', 'major', 'substantial', 'significant'],
  small: ['minor', 'modest', 'slight', 'compact'],
  good: ['strong', 'solid', 'effective', 'reliable'],
  bad: ['poor', 'weak', 'flawed', 'ineffective'],
  fast: ['quick', 'rapid', 'swift', 'speedy'],
  slow: ['gradual', 'sluggish', 'unhurried'],
  easy: ['simple', 'straightforward', 'painless'],
  hard: ['difficult', 'demanding', 'challenging'],
  help: ['support', 'assist', 'aid'],
  show: ['demonstrate', 'reveal', 'illustrate'],
  make: ['create', 'build', 'produce'],
  use: ['apply', 'employ', 'work with'],
  start: ['begin', 'launch', 'kick off'],
  find: ['discover', 'locate', 'uncover'],
  learn: ['pick up', 'study', 'absorb'],
  many: ['plenty of', 'numerous', 'a range of'],
  people: ['viewers', 'creators', 'listeners', 'folks'],
  video: ['clip', 'upload', 'episode'],
  money: ['income', 'revenue', 'earnings'],
  problem: ['issue', 'obstacle', 'sticking point'],
  result: ['outcome', 'payoff', 'return'],
  way: ['approach', 'method', 'route'],
  idea: ['concept', 'angle', 'premise'],
  think: ['believe', 'reckon', 'suspect'],
  need: ['require', 'have to have'],
  want: ['prefer', 'are after'],
  get: ['obtain', 'secure', 'land'],
  very: ['genuinely', 'seriously', 'really'],
  really: ['truly', 'honestly', 'genuinely'],
  best: ['strongest', 'top', 'leading'],
  first: ['to begin with', 'up front'],
  also: ['on top of that', 'as well'],
  because: ['since', 'given that'],
  however: ['that said', 'even so'],
  therefore: ['so', 'which means'],
  understand: ['grasp', 'get your head around'],
  explain: ['break down', 'walk through', 'unpack'],
  increase: ['raise', 'lift', 'grow'],
  decrease: ['reduce', 'cut', 'lower'],
};

const OPENERS = [
  'Here is the thing:',
  'Put simply,',
  'What this means is',
  'Look at it this way:',
  'The short version:',
  'In practice,',
  'Consider this:',
  'The point is,',
];

const CONTRACTIONS = [
  [/\bdo not\b/gi, "don't"],
  [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"],
  [/\bit is\b/gi, "it's"],
  [/\byou are\b/gi, "you're"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\bwe are\b/gi, "we're"],
  [/\bis not\b/gi, "isn't"],
];

const EXPANSIONS = CONTRACTIONS.map(([pattern, replacement]) => {
  const source = pattern.source.replace(/\\b/g, '');
  return [new RegExp(`\\b${replacement.replace("'", "'")}\\b`, 'gi'), source];
});

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

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchCase(original, replacement) {
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * @param {string} text source content
 * @param {object} options
 *  - intensity: 'light' | 'medium' | 'heavy' (share of eligible words swapped)
 *  - tone: 'neutral' | 'conversational' | 'formal'
 *  - addOpeners: sprinkle sentence openers for narration rhythm
 */
export function spin(text, { intensity = 'medium', tone = 'conversational', addOpeners = true, seed = 1 } = {}) {
  const source = String(text || '').trim();
  if (!source) return { original: '', spun: '', changes: 0, sentences: 0 };

  const rate = intensity === 'light' ? 0.3 : intensity === 'heavy' ? 0.85 : 0.55;
  const random = mulberry32(hash(source) ^ hash(String(seed)) ^ hash(intensity + tone));
  let changes = 0;

  const sentences = splitSentences(source);
  const rewritten = sentences.map((sentence, index) => {
    let out = sentence.replace(/\b([\p{L}']+)\b/gu, (word) => {
      const lower = word.toLowerCase();
      const options = SYNONYMS[lower];
      if (!options || random() > rate) return word;
      changes += 1;
      return matchCase(word, options[Math.floor(random() * options.length)]);
    });

    if (tone === 'conversational') {
      for (const [pattern, replacement] of CONTRACTIONS) {
        if (pattern.test(out)) { out = out.replace(pattern, replacement); changes += 1; }
      }
    } else if (tone === 'formal') {
      for (const [pattern, replacement] of EXPANSIONS) {
        if (pattern.test(out)) { out = out.replace(pattern, replacement); changes += 1; }
      }
    }

    if (addOpeners && index > 0 && index % 4 === 0 && random() > 0.35) {
      const opener = OPENERS[Math.floor(random() * OPENERS.length)];
      out = `${opener} ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
      changes += 1;
    } else if (/^[A-Z]/.test(sentence) && /^[a-z]/.test(out)) {
      // Contraction swaps such as "It is" -> "it's" must not eat the capital.
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
  });

  const spun = rewritten.join(' ');
  return {
    original: source,
    spun,
    sentences: sentences.length,
    changes,
    similarity: similarityPercent(source, spun),
    words: spun.split(/\s+/).filter(Boolean).length,
    readingTimeSeconds: Math.round((spun.split(/\s+/).filter(Boolean).length / 150) * 60),
  };
}

/** Rough word-overlap similarity, so you can see how far the spin moved. */
export function similarityPercent(a, b) {
  const setA = new Set(String(a).toLowerCase().match(/[\p{L}']+/gu) || []);
  const setB = new Set(String(b).toLowerCase().match(/[\p{L}']+/gu) || []);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return Math.round((shared / Math.max(setA.size, setB.size)) * 100);
}

/**
 * Turn source text into a voiceover-ready script: hook, beats, close,
 * with pacing marks a narrator can actually read.
 */
export function toVoiceoverScript(text, { title = '', wpm = 150 } = {}) {
  const sentences = splitSentences(text);
  if (!sentences.length) return { script: '', sections: [], durationSeconds: 0 };

  const hook = sentences[0];
  const body = sentences.slice(1, -1);
  const close = sentences.length > 1 ? sentences[sentences.length - 1] : '';
  const beatSize = Math.max(2, Math.ceil(body.length / 5));
  const beats = [];
  for (let i = 0; i < body.length; i += beatSize) {
    beats.push(body.slice(i, i + beatSize).join(' '));
  }

  const sections = [
    { label: 'HOOK (0:00 - 0:15)', text: hook },
    ...beats.map((beat, index) => ({ label: `BEAT ${index + 1}`, text: beat })),
  ];
  if (close) sections.push({ label: 'CLOSE / CTA', text: `${close} If this helped, subscribe for the next one.` });

  const words = text.split(/\s+/).filter(Boolean).length;
  const script = [
    title ? `TITLE: ${title}` : null,
    '',
    ...sections.flatMap((section) => [`[${section.label}]`, section.text, '']),
    '[PACING] Pause 0.4s at each line break. Read at a steady conversational pace.',
  ].filter((line) => line !== null).join('\n');

  return { script, sections, words, durationSeconds: Math.round((words / wpm) * 60) };
}
