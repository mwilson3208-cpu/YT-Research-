import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTitles, titleCapacity, scoreTitle, TITLE_CATEGORIES } from '../server/tools/titles.js';
import { generateHashtags } from '../server/tools/hashtags.js';
import { spin, splitSentences, similarityPercent, toVoiceoverScript } from '../server/tools/spinner.js';
import { parseSuggestPayload, scoreKeyword, extractPhrases } from '../server/tools/keywords.js';
import { analyzeComments, scoreSentiment } from '../server/tools/comments.js';
import { parseTimedTextXml, toParagraphs, extractPlayerResponse, stamp } from '../server/tools/transcript.js';

/* ---- Titles ---- */

test('the title bank can produce more than 1,200 distinct titles', () => {
  const capacity = titleCapacity();
  assert.ok(capacity.titles > 1200, `capacity is only ${capacity.titles}`);
  assert.ok(capacity.templates >= 100);
  assert.ok(capacity.categories.length >= 10);
});

test('generated titles are unique and carry the keyword', () => {
  const { titles } = generateTitles('faceless youtube channel', { count: 120 });
  assert.equal(titles.length, 120);
  assert.equal(new Set(titles.map((t) => t.title)).size, 120, 'duplicate titles generated');
  const withKeyword = titles.filter((t) => /faceless youtube channel/i.test(t.title));
  assert.ok(withKeyword.length / titles.length > 0.9, 'most titles should contain the keyword');
});

test('generation is deterministic for the same seed and varies with a new one', () => {
  const a = generateTitles('ai voiceover', { count: 12, seed: 7 }).titles.map((t) => t.title);
  const b = generateTitles('ai voiceover', { count: 12, seed: 7 }).titles.map((t) => t.title);
  const c = generateTitles('ai voiceover', { count: 12, seed: 8 }).titles.map((t) => t.title);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('filtering by angle returns only that angle', () => {
  for (const category of TITLE_CATEGORIES) {
    const { titles } = generateTitles('sleep story', { count: 8, category });
    assert.ok(titles.length > 0, `no titles for ${category}`);
    assert.ok(titles.every((t) => t.category === category), `angle leak in ${category}`);
  }
});

test('Shorts titles stay short (no suffix padding)', () => {
  const { titles } = generateTitles('money facts', { count: 10, category: 'Shorts' });
  assert.ok(titles.every((t) => t.length <= 60), 'a Shorts title ran long');
});

test('title scoring rewards good length and penalises truncation', () => {
  const good = scoreTitle('7 Proven Ways to Start a Faceless Channel Today', 'faceless channel');
  const tooLong = scoreTitle('a'.repeat(140), 'faceless channel');
  assert.ok(good.score > tooLong.score);
  assert.ok(good.notes.length > 0);
});

test('an empty keyword returns no titles rather than throwing', () => {
  assert.deepEqual(generateTitles('').titles, []);
});

/* ---- Hashtags ---- */

test('hashtags come back grouped, deduplicated and under the limit', () => {
  const result = generateHashtags('faceless voiceover channel', { limit: 20 });
  assert.ok(result.primary.length > 0 && result.primary.length <= 3);
  assert.ok(result.all.length <= 20);
  assert.equal(new Set(result.all).size, result.all.length, 'duplicate hashtags');
  assert.ok(result.all.every((tag) => tag.startsWith('#') && !/\s/.test(tag)));
  assert.equal(result.titleLine.split(' ').length, result.primary.length);
});

test('Shorts mode leads with shorts reach tags', () => {
  const result = generateHashtags('history facts', { platform: 'shorts' });
  assert.ok(result.broad.some((tag) => tag.includes('shorts')));
});

test('punctuation and spacing never leak into a hashtag', () => {
  const result = generateHashtags("How to Start a Channel (2026): Don't Wait!");
  assert.ok(result.all.every((tag) => /^#[\p{L}\p{N}]+$/u.test(tag)), result.all.join(' '));
});

/* ---- Spinner ---- */

test('splitSentences keeps sentences intact', () => {
  const parts = splitSentences('One thing. Two things! Three? Four.');
  assert.equal(parts.length, 4);
});

test('spinning rewrites the text without emptying it', () => {
  const source = 'This is a very important video. You do not need many people to make good money. It is easy to start.';
  const result = spin(source, { intensity: 'heavy' });
  assert.notEqual(result.spun, source);
  assert.ok(result.changes > 0);
  assert.ok(result.spun.split(/\s+/).length >= source.split(/\s+/).length * 0.8);
});

test('heavier intensity moves further from the source than light', () => {
  const source = 'This is a very important and very good video about how to make money fast and find easy ideas that help people learn.';
  const light = spin(source, { intensity: 'light', addOpeners: false, seed: 3 });
  const heavy = spin(source, { intensity: 'heavy', addOpeners: false, seed: 3 });
  assert.ok(heavy.changes >= light.changes);
});

test('sentences keep their leading capital after contraction swaps', () => {
  const result = spin('It is easy to start. That is the truth. You do not need money.', { intensity: 'heavy', tone: 'conversational' });
  for (const sentence of splitSentences(result.spun)) {
    assert.match(sentence, /^[A-Z"']/, `lowercase sentence start: ${sentence}`);
  }
});

test('formal tone expands contractions instead of adding them', () => {
  const result = spin("It's easy and you're ready.", { tone: 'formal', addOpeners: false });
  assert.ok(!/\b(it's|you're)\b/i.test(result.spun), result.spun);
});

test('similarity is 100 against itself and lower after a spin', () => {
  const source = 'This is a very important video about money and people.';
  assert.equal(similarityPercent(source, source), 100);
  const result = spin(source, { intensity: 'heavy' });
  assert.ok(result.similarity < 100);
});

test('empty input returns an empty result rather than throwing', () => {
  const result = spin('');
  assert.equal(result.spun, '');
  assert.equal(result.changes, 0);
});

test('the voiceover script carries a hook, beats and a close', () => {
  const script = toVoiceoverScript('Hook line. Body one. Body two. Body three. Body four. Final close.', { title: 'Test' });
  assert.match(script.script, /\[HOOK/);
  assert.match(script.script, /\[BEAT 1\]/);
  assert.match(script.script, /\[CLOSE/);
  assert.ok(script.durationSeconds > 0);
});

/* ---- Keywords ---- */

test('the JSONP autocomplete payload is parsed into plain phrases', () => {
  const payload = 'window.google.ac.h(["cats",[["cats funny",0],["cats vs dogs",0]],{"k":1}])';
  assert.deepEqual(parseSuggestPayload(payload), ['cats funny', 'cats vs dogs']);
});

test('malformed autocomplete payloads return an empty list', () => {
  assert.deepEqual(parseSuggestPayload('not jsonp at all'), []);
  assert.deepEqual(parseSuggestPayload('window.google.ac.h(broken'), []);
  assert.deepEqual(parseSuggestPayload(''), []);
});

test('long tail keywords score easier than head terms', () => {
  const head = scoreKeyword('voiceover', 3, 'voiceover');
  const tail = scoreKeyword('how to do voiceover work from home for beginners', 3, 'voiceover');
  assert.ok(tail.competition < head.competition);
  assert.equal(tail.type, 'Question');
  assert.equal(head.type, 'Head term');
});

test('phrase extraction finds repeated pairs and skips stop words', () => {
  const phrases = extractPhrases([
    'how to start a faceless channel',
    'faceless channel ideas for beginners',
    'start a faceless channel today',
  ], { minCount: 2 });
  assert.ok(phrases.pairs.some((p) => p.phrase === 'faceless channel'));
  assert.ok(!phrases.words.some((w) => w.phrase === 'the'));
});

/* ---- Comments ---- */

test('repeated questions are grouped and their likes combined', () => {
  const result = analyzeComments([
    { id: 1, author: 'a', text: 'What mic do you use?', likes: 10, replies: 0, publishedAt: '2026-01-01' },
    { id: 2, author: 'b', text: 'What mic do you use??', likes: 25, replies: 0, publishedAt: '2026-01-02' },
    { id: 3, author: 'c', text: 'what MIC do you use', likes: 5, replies: 0, publishedAt: '2026-01-03' },
    { id: 4, author: 'd', text: 'How long does editing take?', likes: 8, replies: 0, publishedAt: '2026-01-04' },
  ]);
  assert.equal(result.contentIdeas.questionCount, 4, 'raw count keeps every instance');
  assert.equal(result.contentIdeas.uniqueQuestions, 2, 'near-identical questions collapse into one');
  const top = result.contentIdeas.questions[0];
  assert.equal(top.occurrences, 3);
  assert.equal(top.totalLikes, 40);
  assert.equal(top.likes, 25, 'the best-liked wording represents the group');
});

test('sentiment reads positives, negatives and negation', () => {
  assert.equal(scoreSentiment('I love this, it is great').label, 'positive');
  assert.equal(scoreSentiment('This is awful and misleading').label, 'negative');
  assert.equal(scoreSentiment('The video is about ten minutes long').label, 'neutral');
  assert.equal(scoreSentiment('This is not good').label, 'negative');
});

test('comment analysis separates questions from requests', () => {
  const result = analyzeComments([
    { id: 1, author: 'a', text: 'I love this, so helpful! Thanks', likes: 40, replies: 2, publishedAt: '2026-01-01' },
    { id: 2, author: 'b', text: 'This is misleading clickbait', likes: 5, replies: 0, publishedAt: '2026-01-02' },
    { id: 3, author: 'c', text: 'Can you make a video on faceless channel setup?', likes: 22, replies: 1, publishedAt: '2026-01-03' },
    { id: 4, author: 'd', text: 'How do you pick the voice? 3:20 was great', likes: 9, replies: 0, publishedAt: '2026-01-04' },
  ]);
  assert.equal(result.analyzed, 4);
  assert.equal(result.sentiment.counts.positive, 2);
  assert.equal(result.sentiment.counts.negative, 1);
  assert.equal(result.contentIdeas.questionCount, 2);
  assert.equal(result.contentIdeas.requestCount, 1);
  assert.equal(result.engagement.timestampMentions, 1);
  assert.equal(result.topComments[0].likes, 40);
});

/* ---- Transcript parsing ---- */

test('legacy timed-text XML is parsed and entity-decoded', () => {
  const segments = parseTimedTextXml('<text start="1.5" dur="2.0">Hello &amp; welcome</text><text start="3.5">line two</text>');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, 'Hello & welcome');
  assert.equal(segments[0].start, 1.5);
});

test('segments are grouped into timestamped paragraphs', () => {
  const segments = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, duration: 5, text: `line ${i}` }));
  const paragraphs = toParagraphs(segments, { secondsPerParagraph: 45 });
  assert.ok(paragraphs.length > 1);
  assert.equal(paragraphs[0].timestamp, '0:00');
  assert.ok(paragraphs.every((p) => p.text.length > 0));
});

test('stamp formats seconds as m:ss', () => {
  assert.equal(stamp(0), '0:00');
  assert.equal(stamp(65), '1:05');
  assert.equal(stamp(3599), '59:59');
});

test('player response extraction survives braces inside strings', () => {
  const html = `<script>var ytInitialPlayerResponse = {"a":"a } brace","b":{"c":1}};</script>`;
  const parsed = extractPlayerResponse(html);
  assert.equal(parsed.a, 'a } brace');
  assert.equal(parsed.b.c, 1);
});

test('missing player response returns null instead of throwing', () => {
  assert.equal(extractPlayerResponse('<html>nothing here</html>'), null);
});
