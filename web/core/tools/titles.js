/**
 * Title generator.
 *
 * Templates use slots filled from the banks below, so the real capacity is
 * templates x slot combinations. `titleCapacity()` reports the exact number of
 * distinct titles available for a given keyword (well past 1,200).
 */

export const SLOT_BANKS = {
  number: ['3', '5', '7', '9', '10', '12', '15', '21'],
  year: [String(new Date().getFullYear()), String(new Date().getFullYear() + 1)],
  timeframe: ['7 Days', '30 Days', '24 Hours', 'One Weekend', '90 Days', 'A Single Evening'],
  audience: ['Beginners', 'Busy Professionals', 'Complete Beginners', 'Anyone Over 40', 'Creators', 'Side Hustlers'],
  adjective: ['Simple', 'Proven', 'Brutal', 'Underrated', 'Quiet', 'Unfair', 'Honest', 'Uncomfortable'],
};

/**
 * Optional tails. Appended to any template, which is how a 131-template bank
 * reaches thousands of distinct, usable titles. An empty string is included so
 * the clean version of every headline stays available.
 */
export const SUFFIX_BANK = [
  '',
  ' (Full Breakdown)',
  ' (No Fluff)',
  ' (Honest Review)',
  ' - What Actually Works',
  ' | Beginner Friendly',
  ' (Step by Step)',
  ' - Real Numbers',
  ' (Do This First)',
  ' | Full Guide',
  ' (Explained Simply)',
  ' - The Short Version',
];

const TEMPLATES = [
  // Curiosity / open loop
  { c: 'Curiosity', t: 'The Truth About {kw} Nobody Tells You' },
  { c: 'Curiosity', t: 'What Really Happens When You Try {kw}' },
  { c: 'Curiosity', t: 'I Tried {kw} for {timeframe}. Here Is What Changed' },
  { c: 'Curiosity', t: 'Why {kw} Stopped Working (And What Replaced It)' },
  { c: 'Curiosity', t: 'The {adjective} Truth About {kw}' },
  { c: 'Curiosity', t: 'Nobody Talks About This Side of {kw}' },
  { c: 'Curiosity', t: 'The Hidden Cost of {kw}' },
  { c: 'Curiosity', t: '{kw}: What They Left Out' },
  { c: 'Curiosity', t: 'This Changes Everything About {kw}' },
  { c: 'Curiosity', t: 'The Real Reason {kw} Feels So Hard' },
  { c: 'Curiosity', t: 'What I Wish I Knew Before {kw}' },
  { c: 'Curiosity', t: 'The {kw} Detail Everyone Skips' },
  { c: 'Curiosity', t: 'Something Nobody Told Me About {kw}' },
  { c: 'Curiosity', t: 'Why Smart People Get {kw} Wrong' },
  { c: 'Curiosity', t: 'The Quiet Shift Happening in {kw}' },

  // Listicle
  { c: 'List', t: '{number} {kw} Rules That Actually Work' },
  { c: 'List', t: '{number} Mistakes Killing Your {kw}' },
  { c: 'List', t: '{number} {adjective} Lessons From {kw}' },
  { c: 'List', t: '{number} Signs You Are Ready for {kw}' },
  { c: 'List', t: '{number} {kw} Habits of People Who Win' },
  { c: 'List', t: '{number} Things I Stopped Doing With {kw}' },
  { c: 'List', t: '{number} {kw} Ideas You Can Use Today' },
  { c: 'List', t: '{number} Questions to Ask Before {kw}' },
  { c: 'List', t: '{number} {kw} Myths That Cost You Money' },
  { c: 'List', t: '{number} Minute Guide to {kw}' },
  { c: 'List', t: '{number} Levels of {kw} (Which Are You?)' },
  { c: 'List', t: '{number} {kw} Tools I Use Every Week' },
  { c: 'List', t: '{number} Red Flags in {kw}' },
  { c: 'List', t: '{number} {kw} Shortcuts That Feel Like Cheating' },
  { c: 'List', t: 'Top {number} {kw} Moments of {year}' },

  // How-to / tutorial
  { c: 'How-To', t: 'How to Start {kw} With Zero Experience' },
  { c: 'How-To', t: 'How to Master {kw} in {timeframe}' },
  { c: 'How-To', t: 'How to Fix {kw} Without Starting Over' },
  { c: 'How-To', t: '{kw}: A Step by Step Walkthrough' },
  { c: 'How-To', t: 'The Complete {kw} Guide for {audience}' },
  { c: 'How-To', t: 'How to Do {kw} the {adjective} Way' },
  { c: 'How-To', t: '{kw} Explained in Plain English' },
  { c: 'How-To', t: 'How I Would Learn {kw} If I Started Today' },
  { c: 'How-To', t: 'The Fastest Path to {kw}' },
  { c: 'How-To', t: 'How to Build a {kw} System That Runs Itself' },
  { c: 'How-To', t: '{kw} for {audience}: Start Here' },
  { c: 'How-To', t: 'How to Get Your First Result With {kw}' },
  { c: 'How-To', t: 'The {number} Step {kw} Framework' },
  { c: 'How-To', t: 'How to Scale {kw} Without Burning Out' },
  { c: 'How-To', t: 'Set Up {kw} in Under {number} Minutes' },

  // Contrarian
  { c: 'Contrarian', t: 'Stop Doing {kw} Like This' },
  { c: 'Contrarian', t: 'Everything You Know About {kw} Is Backwards' },
  { c: 'Contrarian', t: 'Why I Quit {kw} (And What I Do Instead)' },
  { c: 'Contrarian', t: '{kw} Is Overrated. Here Is Why' },
  { c: 'Contrarian', t: 'The Anti {kw} Method' },
  { c: 'Contrarian', t: 'Do the Opposite of This in {kw}' },
  { c: 'Contrarian', t: '{kw} Advice That Needs to Die' },
  { c: 'Contrarian', t: 'You Do Not Need {kw} to Win' },
  { c: 'Contrarian', t: 'Unpopular Opinion: {kw}' },
  { c: 'Contrarian', t: 'Why {adjective} Beats Perfect in {kw}' },

  // Authority / analysis
  { c: 'Authority', t: 'What {number} Years in {kw} Taught Me' },
  { c: 'Authority', t: 'I Analyzed {number} {kw} Case Studies. Here Is the Pattern' },
  { c: 'Authority', t: 'The {kw} Playbook Pros Use Quietly' },
  { c: 'Authority', t: 'Inside the Numbers Behind {kw}' },
  { c: 'Authority', t: '{kw} in {year}: What Actually Changed' },
  { c: 'Authority', t: 'The Economics of {kw}' },
  { c: 'Authority', t: 'A Realistic Look at {kw}' },
  { c: 'Authority', t: '{kw}: The Data Nobody Shows You' },
  { c: 'Authority', t: 'How the Best in {kw} Really Operate' },
  { c: 'Authority', t: 'The {kw} Breakdown You Have Been Waiting For' },

  // Story / narrative (strong for faceless voiceover)
  { c: 'Story', t: 'The Man Who Solved {kw}' },
  { c: 'Story', t: 'How One Decision Changed {kw} Forever' },
  { c: 'Story', t: 'The Rise and Fall of {kw}' },
  { c: 'Story', t: 'The Forgotten History of {kw}' },
  { c: 'Story', t: 'They Said {kw} Was Impossible. Then This Happened' },
  { c: 'Story', t: 'A Short Story About {kw}' },
  { c: 'Story', t: 'The Day {kw} Broke' },
  { c: 'Story', t: 'From Nothing to {kw} in {timeframe}' },
  { c: 'Story', t: 'The Strangest Case in {kw} History' },
  { c: 'Story', t: 'What Happened After {kw} Went Wrong' },
  { c: 'Story', t: 'The Last Person to Understand {kw}' },
  { c: 'Story', t: 'Two Roads, One Choice: {kw}' },

  // Money / results
  { c: 'Money', t: 'How Much You Can Really Make With {kw}' },
  { c: 'Money', t: '{kw}: My Honest Numbers' },
  { c: 'Money', t: 'Turning {kw} Into Monthly Income' },
  { c: 'Money', t: 'The Cheapest Way to Start {kw}' },
  { c: 'Money', t: '{kw} on a Zero Dollar Budget' },
  { c: 'Money', t: 'Is {kw} Still Worth It in {year}?' },
  { c: 'Money', t: 'What {kw} Costs Before It Pays' },
  { c: 'Money', t: 'I Spent {timeframe} on {kw}. Was It Worth It?' },

  // Comparison
  { c: 'Comparison', t: '{kw} vs the Old Way: Which Wins?' },
  { c: 'Comparison', t: 'Cheap {kw} vs Expensive {kw}' },
  { c: 'Comparison', t: 'Before and After {kw}' },
  { c: 'Comparison', t: 'DIY {kw} or Pay Someone? Honest Answer' },
  { c: 'Comparison', t: 'The Only {kw} Comparison You Need' },
  { c: 'Comparison', t: '{kw}: Beginner vs Pro Approach' },

  // Warning / risk
  { c: 'Warning', t: 'Do Not Start {kw} Until You Watch This' },
  { c: 'Warning', t: 'Warning: {kw} Is Changing Fast' },
  { c: 'Warning', t: 'The {kw} Trap Beginners Fall Into' },
  { c: 'Warning', t: 'Avoid These {number} {kw} Disasters' },
  { c: 'Warning', t: 'If You Do {kw}, Read This First' },
  { c: 'Warning', t: 'The Most Expensive {kw} Mistake' },

  // Question
  { c: 'Question', t: 'Is {kw} Actually Worth Your Time?' },
  { c: 'Question', t: 'Why Does {kw} Feel So Difficult?' },
  { c: 'Question', t: 'Can {audience} Really Learn {kw}?' },
  { c: 'Question', t: 'What If You Are Wrong About {kw}?' },
  { c: 'Question', t: 'How Long Does {kw} Actually Take?' },
  { c: 'Question', t: 'Who Should Never Try {kw}?' },

  // Shorts hooks (fast, punchy, under 60 chars where possible)
  { c: 'Shorts', t: '{kw} in {number} Seconds' },
  { c: 'Shorts', t: 'Stop Scrolling. {kw} Explained' },
  { c: 'Shorts', t: 'The {kw} Trick That Works' },
  { c: 'Shorts', t: 'Nobody Does This in {kw}' },
  { c: 'Shorts', t: '{kw}? Try This Instead' },
  { c: 'Shorts', t: 'One Rule for {kw}' },
  { c: 'Shorts', t: '{kw} Hack You Will Use Daily' },
  { c: 'Shorts', t: 'Watch This Before {kw}' },
  { c: 'Shorts', t: '{adjective} {kw} Tip' },
  { c: 'Shorts', t: 'Fix Your {kw} in {number} Seconds' },

  // Podcast / long-form audio
  { c: 'Podcast', t: '{kw}: A Deep Dive Conversation' },
  { c: 'Podcast', t: 'Everything We Got Wrong About {kw}' },
  { c: 'Podcast', t: 'A Long Talk About {kw}' },
  { c: 'Podcast', t: '{kw}, Explained Slowly' },
  { c: 'Podcast', t: 'The {kw} Episode You Will Replay' },
  { c: 'Podcast', t: '{number} Hours of {kw} Insight in {number} Minutes' },

  // Transformation
  { c: 'Transformation', t: 'From Confused to Confident in {kw}' },
  { c: 'Transformation', t: 'How {kw} Changed the Way I Work' },
  { c: 'Transformation', t: 'The {timeframe} {kw} Reset' },
  { c: 'Transformation', t: 'Rebuilding {kw} From Scratch' },
  { c: 'Transformation', t: 'What {kw} Looks Like When It Finally Clicks' },
  { c: 'Transformation', t: 'Small {kw} Changes, Big Results' },

  // Evergreen / SEO-forward
  { c: 'Evergreen', t: '{kw} for {audience} ({year} Guide)' },
  { c: 'Evergreen', t: 'Everything You Need to Know About {kw}' },
  { c: 'Evergreen', t: 'The Beginner Friendly {kw} Checklist' },
  { c: 'Evergreen', t: '{kw} Basics You Should Not Skip' },
  { c: 'Evergreen', t: 'A Calm Introduction to {kw}' },
  { c: 'Evergreen', t: '{kw}: Frequently Asked Questions Answered' },
];

const SLOT_PATTERN = /\{(kw|number|year|timeframe|audience|adjective)\}/g;

function slotsUsed(template) {
  const found = new Set();
  for (const match of template.matchAll(SLOT_PATTERN)) found.add(match[1]);
  found.delete('kw');
  return [...found];
}

/** Exact number of distinct titles this bank can produce for one keyword. */
export function titleCapacity() {
  let base = 0;
  for (const { t } of TEMPLATES) {
    let combos = 1;
    for (const slot of slotsUsed(t)) combos *= SLOT_BANKS[slot].length;
    base += combos;
  }
  return {
    templates: TEMPLATES.length,
    baseHeadlines: base,
    suffixes: SUFFIX_BANK.length,
    titles: base * SUFFIX_BANK.length,
    categories: [...new Set(TEMPLATES.map((x) => x.c))],
  };
}

export const TITLE_CATEGORIES = [...new Set(TEMPLATES.map((t) => t.c))];

function titleCase(input) {
  const small = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'vs', 'at', 'by']);
  return String(input)
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Deterministic pseudo-random so the same seed gives a repeatable set. */
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

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Score a title on the factors that move click-through:
 * length that survives truncation, a number, a power word, emotional pull,
 * and front-loaded keyword placement.
 */
export function scoreTitle(title, keyword) {
  const length = title.length;
  let score = 50;
  const notes = [];

  if (length >= 40 && length <= 70) { score += 14; notes.push('Ideal length'); }
  else if (length < 40) { score += 4; notes.push('Short - fine for Shorts'); }
  else if (length <= 85) { score += 6; notes.push('Slightly long'); }
  else { score -= 10; notes.push('Will truncate in search'); }

  if (/\d/.test(title)) { score += 8; notes.push('Contains a number'); }
  if (/\?/.test(title)) { score += 5; notes.push('Question hook'); }

  const power = title.match(/\b(truth|secret|mistake|proven|stop|never|nobody|why|how|fastest|honest|real|hidden|warning|worst|best|free)\b/gi);
  if (power) { score += Math.min(12, power.length * 6); notes.push('Power words'); }

  const lowerTitle = title.toLowerCase();
  const lowerKeyword = String(keyword || '').toLowerCase();
  if (lowerKeyword && lowerTitle.includes(lowerKeyword)) {
    score += 10;
    notes.push('Keyword present');
    if (lowerTitle.indexOf(lowerKeyword) <= 20) { score += 5; notes.push('Keyword front-loaded'); }
  }
  if (/[A-Z]{4,}/.test(title)) { score -= 6; notes.push('Avoid all caps'); }

  return { score: Math.max(0, Math.min(100, Math.round(score))), notes };
}

export function generateTitles(keyword, { count = 40, category = 'all', seed } = {}) {
  const kwRaw = String(keyword || '').trim();
  if (!kwRaw) return { keyword: '', titles: [], capacity: titleCapacity() };
  const kw = titleCase(kwRaw);
  const pool = category === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.c.toLowerCase() === String(category).toLowerCase());
  const templates = pool.length ? pool : TEMPLATES;
  const random = mulberry32(hashString(`${kwRaw}|${category}|${seed ?? ''}`));

  const seen = new Set();
  const titles = [];
  const maxAttempts = count * 40;
  let attempts = 0;

  while (titles.length < count && attempts < maxAttempts) {
    attempts += 1;
    const template = templates[Math.floor(random() * templates.length)];
    const headline = template.t.replace(SLOT_PATTERN, (_, slot) => {
      if (slot === 'kw') return kw;
      const bank = SLOT_BANKS[slot];
      return bank[Math.floor(random() * bank.length)];
    });
    // Shorts titles stay bare; length is the whole point there.
    const suffix = template.c === 'Shorts'
      ? ''
      : SUFFIX_BANK[Math.floor(random() * SUFFIX_BANK.length)];
    const text = `${headline}${suffix}`;
    if (seen.has(text)) continue;
    seen.add(text);
    const scored = scoreTitle(text, kwRaw);
    titles.push({
      title: text,
      category: template.c,
      length: text.length,
      score: scored.score,
      notes: scored.notes,
      truncatesInSearch: text.length > 70,
    });
  }

  titles.sort((a, b) => b.score - a.score);
  return { keyword: kwRaw, titles, capacity: titleCapacity() };
}
