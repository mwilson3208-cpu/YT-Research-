/**
 * The tool surface Claude Desktop sees.
 *
 * Each entry declares a JSON Schema for its arguments and a run() that calls
 * the same service layer the web app uses, then formats the result as markdown
 * Claude can reason over.
 */
import * as service from '../server/service.js';
import { VIDEO_COLUMNS } from '../server/metrics.js';
import { toCsv, writeExport } from './export.js';
import { table, videoTable, summaryLines, phraseLine, num, money, truncate, heading, modeNote } from './format.js';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });

const EXPORT_ARG = bool('Also write the full grid, all 45 columns, to a CSV file and return its path. Default false.');
const REGION_ARG = str('Two-letter country code, e.g. US, GB, CA. Defaults to US.');

/** Shared tail for the tools that return a video grid. */
async function videoResult({ title, meta, data, args, csvName, extra = [] }) {
  const parts = [heading(title, meta)];
  if (data.summary) parts.push(summaryLines(data.summary));
  parts.push(...extra.filter(Boolean));
  parts.push('', videoTable(data.rows, args.limit || 20));
  if (data.rows.length > (args.limit || 20)) {
    parts.push(`\n_Showing ${args.limit || 20} of ${data.rows.length} rows. Raise \`limit\` or set \`exportCsv\` for the rest._`);
  }
  if (args.exportCsv) {
    const path = await writeExport(csvName, toCsv(VIDEO_COLUMNS, data.rows));
    parts.push(`\n**Full grid (${VIDEO_COLUMNS.length} columns, ${data.rows.length} rows):** ${path}`);
  }
  parts.push(modeNote(data.mode));
  return parts.join('\n');
}

export const TOOLS = [
  {
    name: 'viewforge_keywords',
    title: 'Keyword generator',
    description: 'Expand a topic into scored YouTube keywords using real autocomplete suggestions. Returns demand, competition and difficulty per keyword, plus buckets for question keywords, long tail and easy wins. Use this first when planning what video to make.',
    schema: {
      type: 'object',
      properties: {
        seed: str('The topic to expand, e.g. "faceless youtube channel".'),
        depth: str('"standard" probes A-Z plus modifiers, "quick" is faster.', { enum: ['standard', 'quick'] }),
        limit: int('How many keywords to return. Default 40.', { minimum: 5, maximum: 200 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['seed'],
    },
    async run(args) {
      const data = await service.keywordResearch({ seed: args.seed, depth: args.depth, limit: 300 });
      const limit = args.limit || 40;
      const rows = data.keywords.slice(0, limit);
      const parts = [
        heading(`Keywords for "${data.seed}"`, `${data.total} found from ${data.variantsProbed} probes`),
        data.autocompleteSource === 'offline-bank'
          ? '> Autocomplete was unreachable, so these are pattern-generated rather than live suggestions.'
          : '> Source: live YouTube autocomplete.',
        '',
        table([
          ['Keyword', (r) => r.keyword],
          ['Score', (r) => r.score],
          ['Demand', (r) => r.demand],
          ['Competition', (r) => r.competition],
          ['Difficulty', (r) => r.difficulty],
          ['Type', (r) => r.type],
        ], rows),
        '',
        `**Easy wins:** ${data.buckets.easyWins.slice(0, 8).map((k) => k.keyword).join(' | ') || 'none'}`,
        `**Questions:** ${data.buckets.questions.slice(0, 8).map((k) => k.keyword).join(' | ') || 'none'}`,
      ];
      if (args.exportCsv) {
        const csv = toCsv([
          { key: 'keyword', label: 'Keyword' }, { key: 'score', label: 'Score' },
          { key: 'demand', label: 'Demand' }, { key: 'competition', label: 'Competition' },
          { key: 'difficulty', label: 'Difficulty' }, { key: 'type', label: 'Type' },
          { key: 'words', label: 'Words' }, { key: 'searchUrl', label: 'Search URL' },
        ], data.keywords);
        parts.push(`\n**CSV:** ${await writeExport(`keywords-${data.seed}`, csv)}`);
      }
      parts.push(modeNote(data.mode));
      return parts.join('\n');
    },
  },

  {
    name: 'viewforge_search_videos',
    title: 'Video analyzer',
    description: 'Search YouTube for a keyword and return the full research grid: views, views per day, engagement, outlier multiple, opportunity score, estimated earnings and metadata for each result. Use this to see what is already winning for a topic.',
    schema: {
      type: 'object',
      properties: {
        q: str('The search keyword or phrase.'),
        order: str('Result ordering. Default relevance.', { enum: ['relevance', 'viewCount', 'date', 'rating'] }),
        publishedWithin: str('Only videos published in this window.', { enum: ['24h', '7d', '30d', '90d', '180d', '365d'] }),
        duration: str('Filter by length.', { enum: ['short', 'medium', 'long'] }),
        region: REGION_ARG,
        maxResults: int('How many videos to fetch from YouTube, 5 to 50. Default 25.', { minimum: 5, maximum: 50 }),
        limit: int('How many rows to show in the reply. Default 20.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['q'],
    },
    async run(args) {
      const data = await service.videoSearch(args);
      return videoResult({
        title: `Top videos for "${data.query}"`,
        meta: `${data.rows.length} results`,
        data, args, csvName: `videos-${data.query}`,
      });
    },
  },

  {
    name: 'viewforge_outliers',
    title: 'Outlier finder',
    description: 'Find videos whose view count far exceeds their channel size. These are topics that carried the video rather than brands that carried it, which makes them the topics a small channel can realistically copy. The highest-value search in the toolkit.',
    schema: {
      type: 'object',
      properties: {
        q: str('The niche or keyword to scan.'),
        maxSubscribers: int('Ignore channels bigger than this. Default 100000.', { minimum: 0 }),
        minViews: int('Ignore videos below this view count. Default 10000.', { minimum: 0 }),
        publishedWithin: str('Only videos published in this window.', { enum: ['24h', '7d', '30d', '90d', '180d', '365d'] }),
        limit: int('How many rows to show. Default 20.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['q'],
    },
    async run(args) {
      const data = await service.outlierFinder(args);
      return videoResult({
        title: `Outliers in "${args.q}"`,
        meta: `${data.filters.matched} of ${data.filters.scanned} scanned passed the filters`,
        data, args, csvName: `outliers-${args.q}`,
        extra: [`> ${data.reading}`],
      });
    },
  },

  {
    name: 'viewforge_trends',
    title: 'Trends analyzer',
    description: 'Show what is climbing on YouTube right now for a country and category, ranked by views per day rather than lifetime views. Returns rising title phrases and trending tags, which are the language to borrow for your next title.',
    schema: {
      type: 'object',
      properties: {
        region: REGION_ARG,
        categoryId: str('YouTube category id, e.g. 27 for Education, 28 for Science and Technology. Omit for all.'),
        limit: int('How many rows to show. Default 20.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
    },
    async run(args) {
      const data = await service.trends(args);
      return videoResult({
        title: `Trending in ${data.region}`,
        meta: 'sorted by views per day',
        data, args, csvName: `trends-${data.region}`,
        extra: [
          `**Rising phrases:** ${phraseLine(data.trendSignals.risingPhrases)}`,
          `**Trending tags:** ${phraseLine(data.trendSignals.trendingTags.map((t) => ({ phrase: t.tag, count: t.count })))}`,
          `**Format mix:** ${data.trendSignals.formatMix.Short} Shorts, ${data.trendSignals.formatMix.Standard} standard, ${data.trendSignals.formatMix.Long} long`,
        ],
      });
    },
  },

  {
    name: 'viewforge_shorts',
    title: 'Shorts analyzer',
    description: 'Find sub-60-second Shorts for a keyword and report their median length, opening hook phrases and hashtag habits. Use this when planning short-form content.',
    schema: {
      type: 'object',
      properties: {
        q: str('The search keyword or phrase.'),
        order: str('Result ordering. Default viewCount.', { enum: ['relevance', 'viewCount', 'date', 'rating'] }),
        publishedWithin: str('Only Shorts published in this window.', { enum: ['24h', '7d', '30d', '90d', '180d', '365d'] }),
        limit: int('How many rows to show. Default 20.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['q'],
    },
    async run(args) {
      const data = await service.shortsSearch(args);
      return videoResult({
        title: `Shorts for "${data.query}"`,
        meta: `median length ${data.shortsInsights.medianSeconds}s`,
        data, args, csvName: `shorts-${data.query}`,
        extra: [
          `**Hook phrases:** ${phraseLine(data.shortsInsights.hookPhrases)}`,
          `**Use hashtags:** ${data.shortsInsights.hashtagUse}% of them`,
        ],
      });
    },
  },

  {
    name: 'viewforge_channel',
    title: 'Channel analyzer',
    description: 'Reverse-engineer a channel: subscriber and view totals, upload cadence, favourite publishing day and hour, reused tags and title patterns, and every video that beat its own median. Accepts a channel URL, @handle or channel ID.',
    schema: {
      type: 'object',
      properties: {
        input: str('Channel URL, @handle, or channel ID.'),
        videos: int('How many recent uploads to analyze, 5 to 200. Default 50.', { minimum: 5, maximum: 200 }),
        limit: int('How many rows to show. Default 15.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['input'],
    },
    async run(args) {
      const data = await service.channelAnalysis({ input: args.input, limit: args.videos || 50 });
      const c = data.channel;
      return videoResult({
        title: c.title,
        meta: `${num(c.subscribers)} subscribers, ${num(c.totalViews)} total views, ${num(c.videoCount)} videos`,
        data, args: { ...args, limit: args.limit || 15 }, csvName: `channel-${c.title}`,
        extra: [
          `- Uploads per month: **${data.cadence.uploadsPerMonth ?? '-'}**, usually **${data.cadence.bestPublishDay ?? '-'} at ${data.cadence.bestPublishHourUtc ?? '-'}:00 UTC**`,
          `- Shorts share: **${data.cadence.shortsShare}%**, captions on **${data.strategy.captionUsage}%**`,
          `- Median title length **${data.strategy.medianTitleLength}** chars, median **${data.strategy.medianTagCount}** tags`,
          `**Tags they reuse:** ${phraseLine(data.strategy.topTags.map((t) => ({ phrase: t.tag, count: t.count })))}`,
          `**Title phrases they reuse:** ${phraseLine(data.strategy.titlePhrases)}`,
          data.strategy.breakouts.length
            ? `**Their breakouts:**\n${data.strategy.breakouts.slice(0, 5).map((b) => `- ${truncate(b.title, 70)} — ${num(b.views)} views, ${b.outlierScore}x their median`).join('\n')}`
            : null,
        ],
      });
    },
  },

  {
    name: 'viewforge_video',
    title: 'Video deep dive',
    description: 'Analyze one video: full metrics, an eight-point SEO audit with specific fixes, and a benchmark against the channel’s own recent uploads so you can tell a real hit from an average upload.',
    schema: {
      type: 'object',
      properties: { input: str('Video URL or 11-character video ID.') },
      required: ['input'],
    },
    async run(args) {
      const data = await service.videoAnalysis(args);
      const v = data.video;
      const parts = [
        heading(v.title, `${v.channelTitle} — ${v.url}`),
        [
          `- Views **${num(v.views)}** (**${num(v.avgDailyViews)}**/day), likes **${num(v.likes)}**, comments **${num(v.comments)}**`,
          `- Engagement **${v.engagementRate}%**, views per subscriber **${v.viewsPerSubscriber ?? '-'}**`,
          `- Published ${v.publishAgeLabel} ago, ${v.duration} long (${v.format}), category ${v.category || '-'}`,
          `- Estimated earnings **${money(v.estEarningsLow)} to ${money(v.estEarningsHigh)}**, ads **${v.adsFound}** (score ${v.adSignalScore})`,
        ].join('\n'),
      ];
      if (data.benchmark.peersAnalyzed) {
        parts.push(`\n**Against its own channel:** ${data.benchmark.versusChannelMedian}x the channel median of ${num(data.benchmark.channelMedianViews)} views, ranking #${data.benchmark.rankInRecentUploads} of ${data.benchmark.peersAnalyzed} recent uploads.`);
      }
      parts.push(`\n**SEO audit: ${data.seoAudit.passed}/${data.seoAudit.total} passed (${data.seoAudit.score}%)**`);
      parts.push(data.seoAudit.checks.map((c) => `- ${c.pass ? 'PASS' : 'FIX '} ${c.label}${c.pass ? '' : ` — ${c.advice}`}`).join('\n'));
      if (v.tags.length) parts.push(`\n**Tags (${v.tagCount}):** ${v.tags.join(', ')}`);
      parts.push(modeNote(data.mode));
      return parts.join('\n');
    },
  },

  {
    name: 'viewforge_comments',
    title: 'Comment analyzer',
    description: 'Read a video’s comments and pull out the questions and direct requests hiding in them, with sentiment totals and the words viewers use. Every question is a video idea the audience has already asked for.',
    schema: {
      type: 'object',
      properties: {
        input: str('Video URL or video ID.'),
        limit: int('How many comments to read, 20 to 300. Default 100.', { minimum: 20, maximum: 300 }),
      },
      required: ['input'],
    },
    async run(args) {
      const data = await service.commentAnalysis(args);
      const parts = [
        heading('Comment analysis', `${data.analyzed} comments${data.video ? ` on "${truncate(data.video.title, 60)}"` : ''}`),
        `- Sentiment: **${data.sentiment.positivePercent}% positive**, ${data.sentiment.negativePercent}% negative, net **${data.sentiment.netScore > 0 ? '+' : ''}${data.sentiment.netScore}**`,
        `- **${data.contentIdeas.questionCount} questions** (${data.contentIdeas.uniqueQuestions} distinct) and **${data.contentIdeas.requestCount} direct requests** found`,
        `- ${num(data.engagement.totalLikes)} likes across comments, ${data.engagement.timestampMentions} timestamp mentions`,
        '',
        '**Questions asked (ranked by likes):**',
        data.contentIdeas.questions.slice(0, 12).map((c, i) => `${i + 1}. ${truncate(c.text, 150)} _(${num(c.totalLikes)} likes${c.occurrences > 1 ? `, asked ${c.occurrences} times` : ''})_`).join('\n') || '_none_',
      ];
      if (data.contentIdeas.requests.length) {
        parts.push('', '**Direct requests:**',
          data.contentIdeas.requests.slice(0, 8).map((c, i) => `${i + 1}. ${truncate(c.text, 150)} _(${num(c.totalLikes)} likes${c.occurrences > 1 ? `, asked ${c.occurrences} times` : ''})_`).join('\n'));
      }
      parts.push('', `**Words viewers use:** ${phraseLine(data.keywords, 10)}`);
      if (data.mostCritical.length) {
        parts.push('', '**Criticism worth reading:**',
          data.mostCritical.slice(0, 5).map((c) => `- ${truncate(c.text, 140)}`).join('\n'));
      }
      parts.push(modeNote(data.mode));
      return parts.join('\n');
    },
  },

  {
    name: 'viewforge_tags',
    title: 'Tag analyzer',
    description: 'Pull the tags behind a keyword’s top videos, a single video, or a whole channel. Shows which tags sit on the highest-performing videos and which tags keep appearing together.',
    schema: {
      type: 'object',
      properties: {
        source: str('What to inspect. Default keyword.', { enum: ['keyword', 'video', 'channel'] }),
        input: str('A keyword, a video URL, or a channel URL/@handle, matching source.'),
        limit: int('How many videos to scan. Default 25.', { minimum: 5, maximum: 100 }),
      },
      required: ['input'],
    },
    async run(args) {
      const data = await service.tagAnalysis(args);
      const parts = [
        heading(`Tags for "${data.label}"`, `${data.videosAnalyzed} videos scanned, ${data.videosWithTags} had tags`),
        '',
        table([
          ['Tag', (r) => r.tag],
          ['Videos', (r) => r.videos],
          ['Usage', (r) => `${r.usageRate}%`],
          ['Avg views', (r) => num(r.averageViews)],
          ['Type', (r) => r.type],
        ], data.tags.slice(0, 25)),
        '',
        `**Highest average views:** ${data.highPerformingTags.slice(0, 8).map((t) => t.tag).join(', ') || 'none'}`,
        `**Pairs that co-occur:** ${data.tagPairs.slice(0, 8).map((p) => p.pair).join(' | ') || 'none'}`,
        `**Repeated title phrases:** ${phraseLine(data.titlePhrases)}`,
        '',
        `**Copy block:** \`${data.copyBlock}\``,
      ];
      parts.push(modeNote(data.mode));
      return parts.join('\n');
    },
  },

  {
    name: 'viewforge_titles',
    title: 'Title generator',
    description: 'Generate scored title options for a topic from 131 headline structures across 14 angles. Each is scored on length, power words and keyword placement. Use after picking a topic, before writing the script.',
    schema: {
      type: 'object',
      properties: {
        keyword: str('The topic to build titles around.'),
        category: str('Restrict to one angle, e.g. Curiosity, List, How-To, Story, Shorts. Default all.'),
        count: int('How many titles. Default 25.', { minimum: 5, maximum: 100 }),
        seed: int('Change this for a different set from the same topic.'),
      },
      required: ['keyword'],
    },
    async run(args) {
      const data = service.titles({ ...args, count: args.count || 25 });
      return [
        heading(`Titles for "${data.keyword}"`, `${data.titles.length} of ${num(data.capacity.titles)} possible`),
        '',
        table([
          ['Title', (r) => r.title],
          ['Score', (r) => r.score],
          ['Angle', (r) => r.category],
          ['Chars', (r) => r.length],
        ], data.titles),
        '',
        '_Scored on length (40-70 chars survives truncation), numbers, power words and keyword placement._',
      ].join('\n');
    },
  },

  {
    name: 'viewforge_hashtags',
    title: 'Hashtag generator',
    description: 'Build a hashtag set in the order YouTube actually uses: the three that show above the title first, then niche tags, then reach tags, staying under the 15-tag limit that voids them all.',
    schema: {
      type: 'object',
      properties: {
        topic: str('The video topic.'),
        platform: str('"youtube" for standard videos, "shorts" for Shorts.', { enum: ['youtube', 'shorts'] }),
      },
      required: ['topic'],
    },
    async run(args) {
      const data = service.hashtags(args);
      return [
        heading(`Hashtags for "${data.topic}"`),
        `**Above the title (first 3 only):** ${data.titleLine}`,
        `**Niche:** ${data.secondary.join(' ')}`,
        `**Long tail:** ${data.longTail.join(' ')}`,
        `**Reach:** ${data.broad.join(' ')}`,
        '',
        `**Full block:** ${data.block}`,
        '',
        data.notes.map((n) => `- ${n}`).join('\n'),
      ].join('\n');
    },
  },

  {
    name: 'viewforge_transcript',
    title: 'Video to text',
    description: 'Pull the full transcript from a video that has captions, with timestamps and key phrases. Use it to study how a winning video is structured, or as raw material for a new script.',
    schema: {
      type: 'object',
      properties: {
        input: str('Video URL or video ID.'),
        language: str('Two-letter caption language code. Default en.'),
        includeTimestamps: bool('Return timestamped paragraphs instead of plain text. Default false.'),
      },
      required: ['input'],
    },
    async run(args) {
      const data = await service.transcribe(args);
      const body = args.includeTimestamps
        ? data.paragraphs.map((p) => `**${p.timestamp}** ${p.text}`).join('\n\n')
        : data.text;
      return [
        heading('Transcript', `${num(data.words)} words, about ${Math.round(data.readingTimeSeconds / 60)} minutes to read, ${data.autoGenerated ? 'auto-generated' : 'human'} captions`),
        data.demoTranscript ? '> Sample transcript: no YouTube API key is configured.' : '',
        `**Key phrases:** ${phraseLine(data.keyPhrases)}`,
        '',
        body,
      ].join('\n');
    },
  },

  {
    name: 'viewforge_spin',
    title: 'Content spinner and script builder',
    description: 'Rewrite source text into fresh phrasing and lay it out as a voiceover script with a hook, beats, a close and pacing marks. Feed it a transcript or a rough draft.',
    schema: {
      type: 'object',
      properties: {
        text: str('The source text to rewrite.'),
        title: str('Working title for the script header.'),
        intensity: str('How much to rewrite. Default medium.', { enum: ['light', 'medium', 'heavy'] }),
        tone: str('Default conversational.', { enum: ['conversational', 'neutral', 'formal'] }),
      },
      required: ['text'],
    },
    async run(args) {
      const data = service.spinContent(args);
      return [
        heading('Rewritten', `${num(data.words)} words, ${data.changes} changes, ${data.similarity}% word overlap with the source, about ${Math.floor(data.estimatedNarrationSeconds / 60)}m ${data.estimatedNarrationSeconds % 60}s to narrate`),
        '',
        data.spun,
        '',
        '---',
        '',
        '**Voiceover script**',
        '',
        '```',
        data.script,
        '```',
      ].join('\n');
    },
  },

  {
    name: 'viewforge_compare_channels',
    title: 'Channel comparison',
    description: 'Put two to five channels side by side on subscribers, views per video, upload cadence, engagement and Shorts share. Useful before committing to a niche.',
    schema: {
      type: 'object',
      properties: {
        channels: { type: 'array', items: { type: 'string' }, description: 'Two to five channel URLs, @handles or IDs.' },
        videos: int('Recent uploads to analyze per channel. Default 25.', { minimum: 5, maximum: 50 }),
      },
      required: ['channels'],
    },
    async run(args) {
      const data = await service.channelCompare({ channels: args.channels, limit: args.videos || 25 });
      const good = data.channels.filter((entry) => !entry.error);
      const failed = data.channels.filter((entry) => entry.error);
      const parts = [heading('Channel comparison', `${good.length} channels`)];
      if (failed.length) parts.push(`> Could not load: ${failed.map((f) => `${f.input} (${f.error})`).join('; ')}`);
      parts.push('', table([
        ['Channel', (r) => r.channel.title],
        ['Subs', (r) => num(r.channel.subscribers)],
        ['Total views', (r) => num(r.channel.totalViews)],
        ['Videos', (r) => num(r.channel.videoCount)],
        ['Views/video', (r) => num(r.channel.viewsPerVideo)],
        ['Median views', (r) => num(r.summary?.medianViews)],
        ['Engage', (r) => `${r.summary?.medianEngagement ?? '-'}%`],
        ['Uploads/mo', (r) => r.cadence?.uploadsPerMonth ?? '-'],
        ['Shorts', (r) => `${r.cadence?.shortsShare ?? 0}%`],
      ], good));
      parts.push(modeNote(data.mode));
      return parts.join('\n');
    },
  },

  {
    name: 'viewforge_playlist',
    title: 'Playlist analyzer',
    description: 'Analyze a playlist as a set: total runtime, median views and where viewers drop off through a series.',
    schema: {
      type: 'object',
      properties: {
        input: str('Playlist URL or playlist ID.'),
        videos: int('How many videos to load. Default 50.', { minimum: 5, maximum: 200 }),
        limit: int('How many rows to show. Default 20.', { minimum: 1, maximum: 50 }),
        exportCsv: EXPORT_ARG,
      },
      required: ['input'],
    },
    async run(args) {
      const data = await service.playlistAnalysis({ input: args.input, limit: args.videos || 50 });
      return videoResult({
        title: 'Playlist',
        meta: `${data.playlist.videos} videos, ${data.playlist.totalDuration} total runtime`,
        data, args, csvName: 'playlist',
        extra: [`- Median views **${num(data.playlist.medianViews)}**${data.playlist.dropOffAfter ? `, sharp drop after video **${data.playlist.dropOffAfter}**` : ''}`],
      });
    },
  },

  {
    name: 'viewforge_status',
    title: 'Status',
    description: 'Report whether Viewforge is using live YouTube data or the sample library, how much API quota this session has spent, and which category ids are available for the trends tool.',
    schema: { type: 'object', properties: {} },
    async run() {
      const data = await service.status();
      return [
        heading('Viewforge status'),
        `- Mode: **${data.mode === 'live' ? 'Live YouTube data' : 'Sample library (no API key set)'}**`,
        `- Region **${data.region}**, language **${data.language}**, earnings band **$${data.rpm.low} to $${data.rpm.high}** per 1,000 monetized views`,
        `- Quota used this session: **${data.quota.units}** of ${data.quota.dailyLimit} units across ${data.quota.calls} calls`,
        `- ${data.columnCount} data points per video, ${num(data.titleCapacity.titles)} title combinations`,
        '',
        `**Category ids for the trends tool:** ${data.categories.map((c) => `${c.id}=${c.title}`).join(', ')}`,
        data.mode === 'demo'
          ? '\n> To research live YouTube, set YOUTUBE_API_KEY in the Viewforge entry of your Claude Desktop config, then restart Claude Desktop.'
          : '',
      ].join('\n');
    },
  },
];

export const TOOL_INDEX = new Map(TOOLS.map((tool) => [tool.name, tool]));
