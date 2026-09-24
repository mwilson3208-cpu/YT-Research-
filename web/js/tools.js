import { el, panel, stats, statTile, num, int, money, pct, date, notice, empty, copy, copyButton, chipList, toast, download, meter, scoreClass } from './util.js';
import { createTable } from './table.js';

const REGIONS = ['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'FR', 'ES', 'BR', 'MX', 'JP', 'KR', 'NG', 'ZA', 'PH', 'ID', 'IT', 'NL', 'SE', 'PL'];

const WINDOWS = [
  { value: '', label: 'Any time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 12 months' },
];

const ORDERS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'viewCount', label: 'View count' },
  { value: 'date', label: 'Newest first' },
  { value: 'rating', label: 'Rating' },
];

const regionField = () => ({ name: 'region', label: 'Region', type: 'select', options: REGIONS.map((r) => ({ value: r, label: r })), value: 'US' });

/* Shared renderers ------------------------------------------------- */

function summaryTiles(summary) {
  if (!summary) return null;
  return stats([
    statTile('Videos', int(summary.videos)),
    statTile('Median views', num(summary.medianViews)),
    statTile('Median views / day', num(summary.medianDailyViews)),
    statTile('Median engagement', pct(summary.medianEngagement, 2)),
    statTile('Est. earnings range', `${money(summary.estEarningsLow)} - ${money(summary.estEarningsHigh)}`, 'across all results'),
    statTile('Ads likely', `${summary.adsLikelyShare}%`, 'of results'),
    statTile('Shorts share', `${summary.shortsShare}%`),
    statTile('Best day / hour', `${summary.bestPublishDay || '-'} ${summary.bestPublishHour ?? '-'}:00 UTC`),
  ]);
}

function resultTable(data, filename) {
  return createTable({ columns: data.columns, rows: data.rows, filename });
}

function rankedList(items, renderRow, emptyText = 'Nothing found.') {
  if (!items || !items.length) return el('div', { class: 'panel-note', text: emptyText });
  return el('div', { class: 'list' }, items.map((item, index) => el('div', { class: 'list-row' }, [
    el('div', { class: 'rank', text: String(index + 1) }),
    el('div', { class: 'body' }, renderRow(item)),
  ])));
}

function phraseChips(phrases, label) {
  if (!phrases || !phrases.length) return null;
  return panel(label, 'Click any phrase to copy it', [
    chipList(phrases.map((p) => ({ label: p.phrase || p.tag || p.pair, count: p.count })), (item) => copy(item.label)),
  ]);
}

/* Tools ------------------------------------------------------------ */

export const TOOLS = [
  {
    id: 'keywords',
    name: 'Keyword Generator',
    icon: 'KW',
    group: 'Discover',
    title: 'Keyword Generator',
    blurb: 'Pull real YouTube autocomplete phrases for your topic, then sort by demand, difficulty and intent. These are searches people are already typing, so you are writing scripts for traffic that already exists.',
    endpoint: '/api/keywords',
    fields: [
      { name: 'seed', label: 'Seed keyword', type: 'text', placeholder: 'faceless youtube channel', value: 'faceless youtube channel', wide: true, required: true },
      { name: 'depth', label: 'Depth', type: 'select', value: 'standard', options: [
        { value: 'standard', label: 'Standard (A-Z + modifiers)' },
        { value: 'quick', label: 'Quick (fewer probes)' },
      ] },
      { name: 'limit', label: 'Max keywords', type: 'number', value: 200, min: 20, max: 500 },
    ],
    render(data) {
      const nodes = [];
      if (data.autocompleteSource === 'offline-bank') {
        nodes.push(notice('warn', 'Using the offline keyword bank', data.offlineReason === 'browser-cors'
          ? 'YouTube does not allow its autocomplete endpoint to be read from a web page, so these keywords are pattern-generated rather than pulled from live suggestions. Everything else on this page is real data. Run the Node version from the repo for live autocomplete.'
          : 'YouTube autocomplete could not be reached from this machine (firewall or no connection). Results are pattern-generated instead of live.'));
      }
      nodes.push(stats([
        statTile('Keywords found', int(data.total)),
        statTile('Variants probed', int(data.variantsProbed)),
        statTile('Easy wins', int(data.buckets.easyWins.length), 'low competition'),
        statTile('Question keywords', int(data.buckets.questions.length), 'ready-made titles'),
        statTile('Long tail', int(data.buckets.longTail.length), '4+ words'),
      ]));

      const columns = [
        { key: 'keyword', label: 'Keyword', type: 'text' },
        { key: 'score', label: 'Score', type: 'score' },
        { key: 'demand', label: 'Demand', type: 'score' },
        { key: 'competition', label: 'Competition', type: 'score' },
        { key: 'difficulty', label: 'Difficulty', type: 'badge' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'words', label: 'Words', type: 'int' },
        { key: 'appearances', label: 'Autocomplete hits', type: 'int' },
      ];
      nodes.push(panel('All keywords', `${data.keywords.length} rows - sort, filter and export`, [
        createTable({ columns, rows: data.keywords, filename: `keywords-${data.seed.replace(/\s+/g, '-')}.csv`, storageKey: 'vf:cols:keywords' }),
      ]));

      nodes.push(el('div', { class: 'two-col' }, [
        panel('Easiest to rank', 'Long tail, low competition', rankedList(data.buckets.easyWins.slice(0, 12), (k) => [
          el('div', { text: k.keyword }),
          el('div', { class: 'meta', text: `Score ${k.score} - difficulty ${k.difficulty} - ${k.words} words` }),
        ])),
        panel('Question keywords', 'Each one is a title and a script outline', rankedList(data.buckets.questions.slice(0, 12), (k) => [
          el('div', { text: k.keyword }),
          el('div', { class: 'meta', text: `Score ${k.score} - ${k.difficulty}` }),
        ])),
      ]));

      nodes.push(panel('Copy block', 'Paste into your tag field or planning doc', [
        el('div', { class: 'table-toolbar' }, [copyButton(() => data.keywords.slice(0, 40).map((k) => k.keyword).join(', '), 'Copy top 40')]),
        el('div', { class: 'output mono', text: data.keywords.slice(0, 40).map((k) => k.keyword).join(', ') }),
      ]));
      return nodes;
    },
  },

  {
    id: 'trends',
    name: 'Trends Analyzer',
    icon: 'TR',
    group: 'Discover',
    title: 'Trends Analyzer',
    blurb: 'What is climbing right now, by country and category, ranked by views per day rather than raw views. Rising phrases and trending tags show you the language to put in your next title.',
    endpoint: '/api/trends',
    fields: [
      regionField(),
      { name: 'categoryId', label: 'Category', type: 'select', options: 'categories' },
      { name: 'maxResults', label: 'Results', type: 'number', value: 50, min: 10, max: 50 },
    ],
    render(data) {
      const nodes = [summaryTiles(data.summary)];
      nodes.push(el('div', { class: 'two-col' }, [
        phraseChips(data.trendSignals.risingPhrases, 'Rising title phrases'),
        phraseChips(data.trendSignals.trendingTags.map((t) => ({ phrase: t.tag, count: t.count })), 'Trending tags'),
      ]));
      nodes.push(panel('Format mix', 'What length is winning attention today', [
        stats([
          statTile('Shorts', int(data.trendSignals.formatMix.Short)),
          statTile('Standard (1-10 min)', int(data.trendSignals.formatMix.Standard)),
          statTile('Long (10 min+)', int(data.trendSignals.formatMix.Long)),
          statTile('Median age of trending video', `${data.trendSignals.freshWindowDays} days`),
        ]),
      ]));
      nodes.push(panel(`Trending in ${data.region}`, 'Sorted by views per day', [resultTable(data, `trends-${data.region}.csv`)]));
      return nodes;
    },
  },

  {
    id: 'videos',
    name: 'Video Analyzer',
    icon: 'VA',
    group: 'Discover',
    title: 'Video Analyzer',
    blurb: 'Search any keyword and get the full research grid: 44 columns per video including views per day, estimated earnings, engagement rates, outlier multiples and the metadata YouTube keeps out of sight.',
    endpoint: '/api/videos',
    fields: [
      { name: 'q', label: 'Keyword or phrase', type: 'text', placeholder: 'sleep story narration', value: 'faceless channel', wide: true, required: true },
      { name: 'order', label: 'Sort by', type: 'select', options: ORDERS, value: 'relevance' },
      { name: 'publishedWithin', label: 'Published', type: 'select', options: WINDOWS, value: '' },
      { name: 'duration', label: 'Length', type: 'select', value: '', options: [
        { value: '', label: 'Any length' },
        { value: 'short', label: 'Under 4 minutes' },
        { value: 'medium', label: '4 to 20 minutes' },
        { value: 'long', label: 'Over 20 minutes' },
      ] },
      regionField(),
      { name: 'maxResults', label: 'Results', type: 'number', value: 25, min: 5, max: 50 },
    ],
    render(data) {
      return [
        summaryTiles(data.summary),
        panel(`Results for "${data.query}"`, 'Every column is sortable. Use the column picker for all 44 data points.', [
          resultTable(data, `videos-${data.query.replace(/\s+/g, '-')}.csv`),
        ]),
      ];
    },
  },

  {
    id: 'shorts',
    name: 'Shorts Analyzer',
    icon: 'SH',
    group: 'Discover',
    title: 'YouTube Shorts Analyzer',
    blurb: 'Shorts move around 15 billion views a day. This filters results to genuine sub-60-second uploads and pulls out the hook phrases, lengths and hashtag habits of the ones that are working.',
    endpoint: '/api/shorts',
    fields: [
      { name: 'q', label: 'Keyword or phrase', type: 'text', placeholder: 'money facts', value: 'facts', wide: true, required: true },
      { name: 'order', label: 'Sort by', type: 'select', options: ORDERS, value: 'viewCount' },
      { name: 'publishedWithin', label: 'Published', type: 'select', options: WINDOWS, value: '30d' },
      { name: 'maxResults', label: 'Results', type: 'number', value: 30, min: 5, max: 50 },
    ],
    render(data) {
      const nodes = [];
      if (!data.shortsInsights.strictFilterApplied) {
        nodes.push(notice('info', 'No sub-60-second uploads in this result set', 'Showing everything YouTube classes as short (under 4 minutes) instead.'));
      }
      nodes.push(stats([
        statTile('Shorts analyzed', int(data.rows.length)),
        statTile('Median length', `${data.shortsInsights.medianSeconds}s`),
        statTile('Median views', num(data.summary?.medianViews)),
        statTile('Use hashtags', `${data.shortsInsights.hashtagUse}%`),
        statTile('Median engagement', pct(data.summary?.medianEngagement, 2)),
      ]));
      nodes.push(phraseChips(data.shortsInsights.hookPhrases, 'Opening hook phrases (first 4 words)'));
      nodes.push(panel('Shorts results', 'Sorted by views', [resultTable(data, `shorts-${data.query.replace(/\s+/g, '-')}.csv`)]));
      return nodes;
    },
  },

  {
    id: 'outliers',
    name: 'Outlier Finder',
    icon: 'OL',
    group: 'Discover',
    title: 'Outlier / Opportunity Finder',
    blurb: 'The highest-value search in the tool. It finds videos whose views dwarf the channel subscriber count, which means the topic carried the video, not the brand. Those topics are the ones you can copy.',
    endpoint: '/api/outliers',
    fields: [
      { name: 'q', label: 'Niche or keyword', type: 'text', placeholder: 'ai voiceover', value: 'narration', wide: true, required: true },
      { name: 'maxSubscribers', label: 'Max subscribers', type: 'number', value: 100000, min: 0, max: 100000000, hint: 'Ignore big channels' },
      { name: 'minViews', label: 'Min views', type: 'number', value: 10000, min: 0 },
      { name: 'publishedWithin', label: 'Published', type: 'select', options: WINDOWS, value: '' },
    ],
    render(data) {
      return [
        notice('info', 'How to read this', data.reading),
        stats([
          statTile('Matches', int(data.filters.matched), `from ${data.filters.scanned} scanned`),
          statTile('Sub ceiling', num(data.filters.maxSubscribers)),
          statTile('View floor', num(data.filters.minViews)),
          statTile('Best views / sub', data.rows[0]?.viewsPerSubscriber ? `${data.rows[0].viewsPerSubscriber}x` : '-'),
        ]),
        panel('Opportunities', 'Sorted by views per subscriber', [resultTable(data, 'outliers.csv')]),
      ];
    },
  },

  {
    id: 'video',
    name: 'Single Video Deep Dive',
    icon: 'VD',
    group: 'Analyze',
    title: 'Video Deep Dive',
    blurb: 'Paste any video URL and get its full metric set, an 8-point SEO audit, and a benchmark against the channel’s own recent uploads so you can tell a genuine hit from an average one.',
    endpoint: '/api/video',
    fields: [
      { name: 'input', label: 'Video URL or ID', type: 'text', placeholder: 'https://www.youtube.com/watch?v=...', wide: true, required: true },
    ],
    render(data) {
      const video = data.video;
      const nodes = [
        panel(video.title, video.channelTitle, [
          el('div', { class: 'two-col' }, [
            el('div', {}, [
              video.thumbnail ? el('img', { src: video.thumbnail, alt: '', style: 'width:100%;max-width:320px;border-radius:8px' }) : null,
              el('div', { style: 'margin-top:10px' }, [
                el('a', { href: video.url, target: '_blank', rel: 'noopener', text: 'Open on YouTube' }),
              ]),
            ]),
            el('dl', { class: 'kv' }, [
              el('dt', { text: 'Views' }), el('dd', { text: int(video.views) }),
              el('dt', { text: 'Views per day' }), el('dd', { text: int(video.avgDailyViews) }),
              el('dt', { text: 'Likes / Comments' }), el('dd', { text: `${int(video.likes)} / ${int(video.comments)}` }),
              el('dt', { text: 'Engagement' }), el('dd', { text: pct(video.engagementRate, 2) }),
              el('dt', { text: 'Published' }), el('dd', { text: `${date(video.publishedAt)} (${video.publishAgeLabel} ago)` }),
              el('dt', { text: 'Length' }), el('dd', { text: `${video.duration} (${video.format})` }),
              el('dt', { text: 'Est. earnings' }), el('dd', { text: `${money(video.estEarningsLow)} - ${money(video.estEarningsHigh)}` }),
              el('dt', { text: 'Ads found' }), el('dd', { text: `${video.adsFound} (score ${video.adSignalScore})` }),
              el('dt', { text: 'Subscribers' }), el('dd', { text: int(video.subscribers) }),
              el('dt', { text: 'Views per sub' }), el('dd', { text: video.viewsPerSubscriber ?? '-' }),
              el('dt', { text: 'Category' }), el('dd', { text: video.category || '-' }),
              el('dt', { text: 'Captions' }), el('dd', { text: video.hasCaptions ? 'Yes' : 'No' }),
            ]),
          ]),
        ]),
      ];

      if (data.benchmark.peersAnalyzed) {
        nodes.push(panel('Against this channel’s own recent uploads', `${data.benchmark.peersAnalyzed} videos compared`, [
          stats([
            statTile('Channel median views', num(data.benchmark.channelMedianViews)),
            statTile('This video', `${data.benchmark.versusChannelMedian}x median`),
            statTile('Rank', data.benchmark.rankInRecentUploads ? `#${data.benchmark.rankInRecentUploads} of ${data.benchmark.peersAnalyzed}` : '-'),
          ]),
        ]));
      }

      nodes.push(panel('SEO audit', `${data.seoAudit.passed} of ${data.seoAudit.total} checks passed (${data.seoAudit.score}%)`, [
        meter(data.seoAudit.score),
        el('div', { class: 'list', style: 'margin-top:12px' }, data.seoAudit.checks.map((check) => el('div', { class: `list-row ${check.pass ? 'pass' : 'fail'}` }, [
          el('span', { class: 'badge ' + (check.pass ? 'good' : 'warn'), text: check.pass ? 'PASS' : 'FIX' }),
          el('div', { class: 'body' }, [
            el('div', { text: check.label }),
            el('div', { class: 'meta', text: check.advice }),
          ]),
        ]))),
      ]));

      if (video.tags.length) {
        nodes.push(panel('Tags on this video', `${video.tagCount} tags`, [
          el('div', { class: 'table-toolbar' }, [copyButton(() => video.tags.join(', '), 'Copy tags')]),
          chipList(video.tags.map((tag) => ({ label: tag })), (item) => copy(item.label)),
        ]));
      }
      nodes.push(panel('Description', 'First 1,200 characters', [el('div', { class: 'output', text: data.descriptionPreview || '(empty)' })]));
      nodes.push(panel('All 44 data points', '', [resultTable(data, `video-${video.videoId}.csv`)]));
      return nodes;
    },
  },

  {
    id: 'channel',
    name: 'Channel Analyzer',
    icon: 'CH',
    group: 'Analyze',
    title: 'Channel Analyzer',
    blurb: 'Reverse-engineer any channel: upload cadence, best publishing day and hour, the tags and title patterns they reuse, and every breakout video that beat their own median.',
    endpoint: '/api/channel',
    fields: [
      { name: 'input', label: 'Channel URL, @handle or ID', type: 'text', placeholder: '@channelname', value: 'Sidehustle Signal', wide: true, required: true },
      { name: 'limit', label: 'Videos to analyze', type: 'number', value: 50, min: 5, max: 200 },
    ],
    render(data) {
      const channel = data.channel;
      const nodes = [
        panel(channel.title, channel.customUrl || channel.id, [
          stats([
            statTile('Subscribers', num(channel.subscribers)),
            statTile('Total views', num(channel.totalViews)),
            statTile('Videos', int(channel.videoCount)),
            statTile('Views per video', num(channel.viewsPerVideo)),
            statTile('Views per sub', channel.viewsPerSubscriber ?? '-'),
            statTile('Started', date(channel.publishedAt)),
            statTile('Country', channel.country || '-'),
          ]),
          el('div', { style: 'margin-top:10px' }, [el('a', { href: channel.url, target: '_blank', rel: 'noopener', text: 'Open channel on YouTube' })]),
        ]),
        panel('Publishing pattern', `Based on ${data.cadence.analyzedVideos} recent uploads`, [
          stats([
            statTile('Uploads per month', data.cadence.uploadsPerMonth ?? '-'),
            statTile('Days between uploads', data.cadence.medianDaysBetweenUploads ?? '-'),
            statTile('Favourite day', data.cadence.bestPublishDay || '-'),
            statTile('Favourite hour', data.cadence.bestPublishHourUtc !== null ? `${data.cadence.bestPublishHourUtc}:00 UTC` : '-'),
            statTile('Shorts share', `${data.cadence.shortsShare}%`),
          ]),
        ]),
        panel('Metadata habits', 'Copy what works for them', [
          stats([
            statTile('Median title length', `${data.strategy.medianTitleLength} chars`),
            statTile('Median tag count', int(data.strategy.medianTagCount)),
            statTile('Captions used', `${data.strategy.captionUsage}%`),
            statTile('Breakout videos', int(data.strategy.breakouts.length), '2x their median or better'),
          ]),
        ]),
        el('div', { class: 'two-col' }, [
          phraseChips(data.strategy.topTags.map((t) => ({ phrase: t.tag, count: t.count })), 'Tags they reuse'),
          phraseChips(data.strategy.titlePhrases, 'Title phrases they reuse'),
        ]),
      ];

      if (data.strategy.breakouts.length) {
        nodes.push(panel('Their breakout videos', 'These topics outperformed everything else they published', rankedList(data.strategy.breakouts, (video) => [
          el('a', { href: video.url, target: '_blank', rel: 'noopener', text: video.title }),
          el('div', { class: 'meta', text: `${int(video.views)} views - ${video.outlierScore}x their median` }),
        ])));
      }
      nodes.push(summaryTiles(data.summary));
      nodes.push(panel('Every analyzed upload', 'Sorted by views', [resultTable(data, `channel-${channel.title.replace(/\s+/g, '-')}.csv`)]));
      return nodes;
    },
  },

  {
    id: 'compare',
    name: 'Channel Comparison',
    icon: 'CC',
    group: 'Analyze',
    title: 'Channel Comparison',
    blurb: 'Put two to five channels side by side. Useful before you commit to a niche: you see who is actually growing, who publishes more, and who gets more out of each upload.',
    endpoint: '/api/channels/compare',
    fields: [
      { name: 'channels', label: 'Channels (one per line, 2 to 5)', type: 'textarea', placeholder: '@channelone\n@channeltwo', value: 'Sidehustle Signal\nVoice of Machines\nNight Shift Audio', wide: true, required: true },
      { name: 'limit', label: 'Videos each', type: 'number', value: 25, min: 5, max: 50 },
    ],
    render(data) {
      const good = data.channels.filter((entry) => !entry.error);
      const failed = data.channels.filter((entry) => entry.error);
      const nodes = [];
      if (failed.length) {
        nodes.push(notice('warn', 'Some channels could not be loaded', failed.map((f) => `${f.input}: ${f.error}`).join(' | ')));
      }
      if (!good.length) return [...nodes, empty('Nothing to compare', 'Check the channel names or URLs and try again.')];

      const columns = [
        { key: 'title', label: 'Channel', type: 'text' },
        { key: 'subscribers', label: 'Subs', type: 'int' },
        { key: 'totalViews', label: 'Total views', type: 'int' },
        { key: 'videoCount', label: 'Videos', type: 'int' },
        { key: 'viewsPerVideo', label: 'Views / video', type: 'int' },
        { key: 'medianViews', label: 'Median views', type: 'int' },
        { key: 'medianDailyViews', label: 'Views / day', type: 'int' },
        { key: 'medianEngagement', label: 'Engage %', type: 'float' },
        { key: 'uploadsPerMonth', label: 'Uploads / mo', type: 'float' },
        { key: 'shortsShare', label: 'Shorts %', type: 'int' },
        { key: 'estEarningsHigh', label: 'Est. $ high', type: 'money' },
      ];
      const rows = good.map((entry) => ({
        title: entry.channel.title,
        subscribers: entry.channel.subscribers,
        totalViews: entry.channel.totalViews,
        videoCount: entry.channel.videoCount,
        viewsPerVideo: entry.channel.viewsPerVideo,
        medianViews: entry.summary?.medianViews,
        medianDailyViews: entry.summary?.medianDailyViews,
        medianEngagement: entry.summary?.medianEngagement,
        uploadsPerMonth: entry.cadence?.uploadsPerMonth,
        shortsShare: entry.cadence?.shortsShare,
        estEarningsHigh: entry.summary?.estEarningsHigh,
        url: entry.channel.url,
      }));

      nodes.push(panel('Side by side', `${good.length} channels`, [
        createTable({ columns, rows, filename: 'channel-comparison.csv', storageKey: 'vf:cols:compare' }),
      ]));

      nodes.push(el('div', { class: 'three-col' }, good.map((entry) => panel(entry.channel.title, `${num(entry.channel.subscribers)} subscribers`, [
        el('dl', { class: 'kv' }, [
          el('dt', { text: 'Uploads / month' }), el('dd', { text: String(entry.cadence?.uploadsPerMonth ?? '-') }),
          el('dt', { text: 'Best day' }), el('dd', { text: entry.cadence?.bestPublishDay || '-' }),
          el('dt', { text: 'Median views' }), el('dd', { text: num(entry.summary?.medianViews) }),
          el('dt', { text: 'Shorts share' }), el('dd', { text: `${entry.cadence?.shortsShare ?? 0}%` }),
        ]),
        entry.topTags.length ? el('div', { style: 'margin-top:10px' }, [chipList(entry.topTags.map((t) => ({ label: t.tag, count: t.count })), (item) => copy(item.label))]) : null,
      ]))));
      return nodes;
    },
  },

  {
    id: 'comments',
    name: 'Comment Analyzer',
    icon: 'CM',
    group: 'Analyze',
    title: 'Comment Analyzer',
    blurb: 'Comments are a list of topics your audience has already asked for. This pulls out every question and request, scores sentiment, and shows the words viewers use, so your next script answers something real.',
    endpoint: '/api/comments',
    fields: [
      { name: 'input', label: 'Video URL or ID', type: 'text', placeholder: 'https://www.youtube.com/watch?v=...', wide: true, required: true },
      { name: 'limit', label: 'Comments to read', type: 'number', value: 100, min: 20, max: 300 },
    ],
    render(data) {
      const nodes = [
        stats([
          statTile('Comments analyzed', int(data.analyzed)),
          statTile('Positive', `${data.sentiment.positivePercent}%`),
          statTile('Negative', `${data.sentiment.negativePercent}%`),
          statTile('Net sentiment', `${data.sentiment.netScore > 0 ? '+' : ''}${data.sentiment.netScore}`),
          statTile('Questions asked', int(data.contentIdeas.questionCount), 'video ideas'),
          statTile('Direct requests', int(data.contentIdeas.requestCount), '"please make..."'),
          statTile('Total likes on comments', num(data.engagement.totalLikes)),
          statTile('Timestamp mentions', int(data.engagement.timestampMentions), 'retention signal'),
        ]),
        panel('Content ideas hiding in the comments', 'Questions viewers asked, ranked by likes', rankedList(data.contentIdeas.questions.slice(0, 15), (comment) => [
          el('div', { text: comment.text }),
          el('div', { class: 'meta', text: `${comment.author} - ${int(comment.likes)} likes - ${date(comment.publishedAt)}` }),
        ], 'No questions found in these comments.')),
      ];
      if (data.contentIdeas.requests.length) {
        nodes.push(panel('Direct requests', 'People telling you exactly what to make next', rankedList(data.contentIdeas.requests.slice(0, 12), (comment) => [
          el('div', { text: comment.text }),
          el('div', { class: 'meta', text: `${comment.author} - ${int(comment.likes)} likes` }),
        ])));
      }
      nodes.push(el('div', { class: 'two-col' }, [
        phraseChips(data.keywords, 'Words and phrases viewers use'),
        panel('Most liked comments', 'The tone that resonates', rankedList(data.topComments.slice(0, 8), (comment) => [
          el('div', { text: comment.text }),
          el('div', { class: 'meta', text: `${int(comment.likes)} likes - ${comment.sentiment}` }),
        ])),
      ]));
      if (data.mostCritical.length) {
        nodes.push(panel('Critical comments', 'Where the content lost people', rankedList(data.mostCritical.slice(0, 8), (comment) => [
          el('div', { text: comment.text }),
          el('div', { class: 'meta', text: `${int(comment.likes)} likes` }),
        ])));
      }
      const columns = [
        { key: 'author', label: 'Author', type: 'text' },
        { key: 'text', label: 'Comment', type: 'text' },
        { key: 'likes', label: 'Likes', type: 'int' },
        { key: 'replies', label: 'Replies', type: 'int' },
        { key: 'sentiment', label: 'Sentiment', type: 'badge' },
        { key: 'sentimentScore', label: 'Score', type: 'float' },
        { key: 'isQuestion', label: 'Question', type: 'bool' },
        { key: 'isRequest', label: 'Request', type: 'bool' },
        { key: 'words', label: 'Words', type: 'int' },
        { key: 'publishedAt', label: 'Posted', type: 'date' },
      ];
      nodes.push(panel('All comments', '', [
        createTable({ columns, rows: data.comments, filename: `comments-${data.videoId}.csv`, storageKey: 'vf:cols:comments' }),
      ]));
      return nodes;
    },
  },

  {
    id: 'tags',
    name: 'Tag Analyzer',
    icon: 'TG',
    group: 'Analyze',
    title: 'Tag Analyzer',
    blurb: 'See the tags behind any video, channel or keyword, which ones pair with the highest average views, and which pairs keep appearing together. Copy the set straight into your own upload.',
    endpoint: '/api/tags',
    fields: [
      { name: 'source', label: 'Look at', type: 'select', value: 'keyword', options: [
        { value: 'keyword', label: 'Top videos for a keyword' },
        { value: 'video', label: 'One video' },
        { value: 'channel', label: 'A whole channel' },
      ] },
      { name: 'input', label: 'Keyword, video URL, or channel', type: 'text', placeholder: 'sleep story', value: 'narration', wide: true, required: true },
      { name: 'limit', label: 'Videos to scan', type: 'number', value: 25, min: 5, max: 100 },
    ],
    render(data) {
      const nodes = [
        stats([
          statTile('Videos scanned', int(data.videosAnalyzed)),
          statTile('With tags', int(data.videosWithTags), `${Math.round((data.videosWithTags / Math.max(1, data.videosAnalyzed)) * 100)}% of them`),
          statTile('Unique tags', int(data.tags.length)),
          statTile('Median tags per video', int(data.medianTagCount)),
        ]),
      ];
      if (!data.tags.length) {
        nodes.push(notice('info', 'No tags exposed', 'These videos either use no tags, or the owners hid them. Use the title phrases below instead.'));
      }
      const columns = [
        { key: 'tag', label: 'Tag', type: 'text' },
        { key: 'videos', label: 'Videos using it', type: 'int' },
        { key: 'usageRate', label: 'Usage %', type: 'int' },
        { key: 'averageViews', label: 'Avg views', type: 'int' },
        { key: 'totalViews', label: 'Total views', type: 'int' },
        { key: 'words', label: 'Words', type: 'int' },
        { key: 'type', label: 'Type', type: 'badge' },
      ];
      nodes.push(panel('Every tag found', 'Sorted by how many videos use it', [
        el('div', { class: 'table-toolbar' }, [copyButton(() => data.copyBlock, 'Copy top 20 tags')]),
        createTable({ columns, rows: data.tags, filename: 'tags.csv', storageKey: 'vf:cols:tags' }),
      ]));
      nodes.push(el('div', { class: 'two-col' }, [
        panel('Highest average views', 'Tags on the best-performing videos', rankedList(data.highPerformingTags.slice(0, 12), (tag) => [
          el('div', { text: tag.tag }),
          el('div', { class: 'meta', text: `${num(tag.averageViews)} avg views across ${tag.videos} videos` }),
        ])),
        panel('Tags that appear together', 'Use them as a set', rankedList(data.tagPairs.slice(0, 12), (pair) => [
          el('div', { text: pair.pair }),
          el('div', { class: 'meta', text: `${pair.count} videos use both` }),
        ])),
      ]));
      nodes.push(phraseChips(data.titlePhrases, 'Repeated title phrases'));
      return nodes;
    },
  },

  {
    id: 'playlist',
    name: 'Playlist Analyzer',
    icon: 'PL',
    group: 'Analyze',
    title: 'Playlist Analyzer',
    blurb: 'Analyze any playlist as a set: total runtime, median views, and where viewers drop off. A useful way to see which episode in a series actually pulled the audience.',
    endpoint: '/api/playlist',
    fields: [
      { name: 'input', label: 'Playlist URL or ID', type: 'text', placeholder: 'https://www.youtube.com/playlist?list=...', wide: true, required: true },
      { name: 'limit', label: 'Videos to load', type: 'number', value: 50, min: 5, max: 200 },
    ],
    render(data) {
      return [
        stats([
          statTile('Videos', int(data.playlist.videos)),
          statTile('Total runtime', data.playlist.totalDuration),
          statTile('Median views', num(data.playlist.medianViews)),
          statTile('Drop-off after', data.playlist.dropOffAfter ? `video ${data.playlist.dropOffAfter}` : 'no sharp drop'),
        ]),
        summaryTiles(data.summary),
        panel('Playlist contents', 'In playlist order by default; sort any column', [resultTable(data, 'playlist.csv')]),
      ];
    },
  },

  {
    id: 'transcript',
    name: 'Video to Text',
    icon: 'VT',
    group: 'Create',
    title: 'Video to Text',
    blurb: 'Pull the full transcript out of any video that has captions, with timestamps and key phrases. Send it straight to the Content Spinner to turn it into fresh narration you can record.',
    endpoint: '/api/transcript',
    fields: [
      { name: 'input', label: 'Video URL or ID', type: 'text', placeholder: 'https://www.youtube.com/watch?v=...', wide: true, required: true },
      { name: 'language', label: 'Caption language', type: 'text', value: 'en', hint: 'Two-letter code' },
    ],
    render(data, context) {
      const nodes = [];
      if (data.demoTranscript) {
        nodes.push(notice('info', 'Demo transcript', 'No API key is set, so this is the bundled sample transcript. Add YOUTUBE_API_KEY to .env and the tool reads the real caption track from the video you paste.'));
      }
      nodes.push(
        stats([
          statTile('Words', int(data.words)),
          statTile('Characters', int(data.characters)),
          statTile('Read time', `${Math.round(data.readingTimeSeconds / 60)} min`),
          statTile('Language', data.language || '-'),
          statTile('Source', data.autoGenerated ? 'Auto-generated' : 'Human captions'),
          statTile('Segments', int(data.segments.length)),
        ]),
        panel('Actions', 'Move this text into your next script', [
          el('div', { class: 'table-toolbar' }, [
            copyButton(() => data.text, 'Copy full transcript'),
            el('button', {
              class: 'btn ghost sm',
              onclick: () => download(`transcript-${data.videoId}.txt`, data.text, 'text/plain;charset=utf-8'),
            }, 'Download .txt'),
            el('button', {
              class: 'btn ghost sm',
              onclick: () => download(`transcript-${data.videoId}.srt`, toSrt(data.segments), 'text/plain;charset=utf-8'),
            }, 'Download .srt'),
            el('button', {
              class: 'btn',
              onclick: () => context.sendToSpinner(data.text, data.video?.title || ''),
            }, 'Send to Content Spinner'),
          ]),
        ]),
      );
      if (data.availableLanguages.length > 1) {
        nodes.push(panel('Other caption tracks', 'Change the language field and run again', [
          chipList(data.availableLanguages.map((lang) => ({ label: `${lang.code}${lang.auto ? ' (auto)' : ''}` })), (item) => copy(item.label.split(' ')[0])),
        ]));
      }
      nodes.push(phraseChips(data.keyPhrases, 'Key phrases in this video'));
      nodes.push(panel('Transcript with timestamps', `${data.paragraphs.length} paragraphs`, [
        el('div', { class: 'output' }, data.paragraphs.map((para) => el('div', { class: 'transcript-line' }, [
          el('time', { text: para.timestamp }),
          el('span', { text: para.text }),
        ]))),
      ]));
      nodes.push(panel('Plain text', 'No timestamps', [el('div', { class: 'output', text: data.text })]));
      return nodes;
    },
  },

  {
    id: 'spinner',
    name: 'Content Spinner',
    icon: 'CS',
    group: 'Create',
    title: 'Content Spinner + Script Builder',
    blurb: 'Paste a transcript or any draft and rewrite it into fresh phrasing, then get it laid out as a voiceover script with a hook, beats, a close and pacing marks. Ready to hand to Fusion Voice.',
    endpoint: '/api/spin',
    fields: [
      { name: 'text', label: 'Source text', type: 'textarea', placeholder: 'Paste a transcript, a draft, or your notes...', wide: true, required: true },
      { name: 'title', label: 'Working title (optional)', type: 'text', placeholder: 'The Faceless Channel Blueprint' },
      { name: 'intensity', label: 'Rewrite intensity', type: 'select', value: 'medium', options: [
        { value: 'light', label: 'Light' },
        { value: 'medium', label: 'Medium' },
        { value: 'heavy', label: 'Heavy' },
      ] },
      { name: 'tone', label: 'Tone', type: 'select', value: 'conversational', options: [
        { value: 'conversational', label: 'Conversational (contractions)' },
        { value: 'neutral', label: 'Neutral' },
        { value: 'formal', label: 'Formal (no contractions)' },
      ] },
      { name: 'addOpeners', label: 'Add narration openers', type: 'checkbox', value: true },
    ],
    render(data) {
      return [
        stats([
          statTile('Words', int(data.words)),
          statTile('Sentences', int(data.sentences)),
          statTile('Changes made', int(data.changes)),
          statTile('Overlap with source', `${data.similarity}%`, 'lower means more rewritten'),
          statTile('Narration time', `${Math.floor(data.estimatedNarrationSeconds / 60)}m ${data.estimatedNarrationSeconds % 60}s`, 'at 150 wpm'),
        ]),
        panel('Rewritten copy', 'Read it once before you record. This is a rules engine, not a ghostwriter.', [
          el('div', { class: 'table-toolbar' }, [
            copyButton(() => data.spun, 'Copy rewritten text'),
            el('button', { class: 'btn ghost sm', onclick: () => download('spun-content.txt', data.spun, 'text/plain;charset=utf-8') }, 'Download .txt'),
          ]),
          el('div', { class: 'output', text: data.spun }),
        ]),
        panel('Voiceover script', 'Hook, beats, close, pacing marks', [
          el('div', { class: 'table-toolbar' }, [
            copyButton(() => data.script, 'Copy script'),
            el('button', { class: 'btn ghost sm', onclick: () => download('voiceover-script.txt', data.script, 'text/plain;charset=utf-8') }, 'Download script'),
          ]),
          el('div', { class: 'output mono', text: data.script }),
        ]),
      ];
    },
  },

  {
    id: 'titles',
    name: 'Title Generator',
    icon: 'TI',
    group: 'Create',
    title: 'Title Generator',
    blurb: 'A bank of 131 proven headline structures across 14 angles, filled with your keyword. Every title is scored on length, power words and keyword placement, so you pick on evidence rather than gut feel.',
    endpoint: '/api/titles',
    fields: [
      { name: 'keyword', label: 'Keyword or topic', type: 'text', placeholder: 'faceless youtube channel', value: 'faceless youtube channel', wide: true, required: true },
      { name: 'category', label: 'Angle', type: 'select', value: 'all', options: 'titleCategories' },
      { name: 'count', label: 'How many', type: 'number', value: 40, min: 5, max: 200 },
      { name: 'seed', label: 'Variation seed', type: 'number', value: 1, min: 1, max: 9999, hint: 'Change for a fresh set' },
    ],
    render(data) {
      const columns = [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'score', label: 'Score', type: 'score' },
        { key: 'category', label: 'Angle', type: 'badge' },
        { key: 'length', label: 'Chars', type: 'int' },
        { key: 'truncatesInSearch', label: 'Truncates', type: 'bool' },
        { key: 'notes', label: 'Why', type: 'text' },
      ];
      return [
        stats([
          statTile('Titles shown', int(data.titles.length)),
          statTile('Total capacity', int(data.capacity.titles), `${data.capacity.templates} structures x ${data.capacity.suffixes} variations`),
          statTile('Angles available', int(data.capacity.categories.length)),
          statTile('Best score', int(data.titles[0]?.score)),
        ]),
        panel('Generated titles', 'Sorted by score. Click Copy to take the whole list.', [
          el('div', { class: 'table-toolbar' }, [
            copyButton(() => data.titles.map((t) => t.title).join('\n'), 'Copy all titles'),
          ]),
          createTable({ columns, rows: data.titles, filename: 'titles.csv', storageKey: 'vf:cols:titles' }),
        ]),
        panel('Top 10 to test', '', rankedList(data.titles.slice(0, 10), (title) => [
          el('div', { text: title.title }),
          el('div', { class: 'meta', text: `Score ${title.score} - ${title.length} chars - ${title.notes.join(', ')}` }),
        ])),
      ];
    },
  },

  {
    id: 'hashtags',
    name: 'Hashtag Tool',
    icon: 'HT',
    group: 'Create',
    title: 'Hashtag Generator',
    blurb: 'Builds a hashtag set in the order YouTube actually uses it: the three that appear above your title first, then niche tags for relevance, then reach tags. Stays under the 15-tag limit that voids them all.',
    endpoint: '/api/hashtags',
    fields: [
      { name: 'topic', label: 'Topic', type: 'text', placeholder: 'faceless voiceover channel', value: 'faceless voiceover channel', wide: true, required: true },
      { name: 'platform', label: 'Format', type: 'select', value: 'youtube', options: [
        { value: 'youtube', label: 'Standard video' },
        { value: 'shorts', label: 'Shorts' },
      ] },
      { name: 'limit', label: 'Max hashtags', type: 'number', value: 30, min: 5, max: 40 },
    ],
    render(data) {
      const group = (label, list, note) => panel(label, note, [
        el('div', { class: 'table-toolbar' }, [copyButton(() => list.join(' '), `Copied ${list.length} hashtags`)]),
        list.length ? chipList(list.map((tag) => ({ label: tag })), (item) => copy(item.label)) : el('div', { class: 'panel-note', text: 'None' }),
      ]);
      return [
        panel('Paste above your title', 'YouTube only displays the first three', [
          el('div', { class: 'table-toolbar' }, [copyButton(() => data.titleLine, 'Copied')]),
          el('div', { class: 'output mono', text: data.titleLine || '(none)' }),
        ]),
        group('Primary (exact match)', data.primary, 'Highest relevance'),
        group('Niche tags', data.secondary, 'Relevance without the noise'),
        group('Long tail', data.longTail, 'Lower competition'),
        group('Reach tags', data.broad, 'Use sparingly'),
        panel('Full block', 'Paste at the bottom of your description', [
          el('div', { class: 'table-toolbar' }, [copyButton(() => data.block, 'Copied full block')]),
          el('div', { class: 'output mono', text: data.block }),
        ]),
        panel('Rules worth knowing', '', [
          el('div', { class: 'list' }, data.notes.map((note) => el('div', { class: 'list-row' }, [el('div', { class: 'body', text: note })]))),
        ]),
      ];
    },
  },
];

export const TOOL_GROUPS = ['Discover', 'Analyze', 'Create'];

function toSrt(segments) {
  const stamp = (seconds) => {
    const ms = Math.round((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms).padStart(3, '0')}`;
  };
  return segments.map((segment, index) => {
    const end = segment.start + (segment.duration || 2);
    return `${index + 1}\n${stamp(segment.start)} --> ${stamp(end)}\n${segment.text}\n`;
  }).join('\n');
}
