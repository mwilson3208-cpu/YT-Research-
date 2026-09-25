# Viewforge

**Before you produce your next voiceover, know exactly what wins.**

Viewforge is a YouTube research console that reveals the top videos, channels, keywords and trends on the platform, so you create audio content people are already searching for. It runs in your browser, on your own machine, or inside Claude Desktop. It uses your own free YouTube API key and sends nothing to anyone but Google.

Built for creators running faceless channels: narration, documentary, sleep stories, explainers, podcast clips and Shorts.

---

## What you get

**15 built-in research tools**

| Tool | What it answers |
| --- | --- |
| Keyword Generator | What are people actually typing into YouTube search? |
| Trends Analyzer | What is climbing right now in my country and category? |
| Video Analyzer | What do the top videos for this keyword have in common? |
| Shorts Analyzer | Which sub-60-second formats are working, and what hooks do they open with? |
| Outlier Finder | Which topics carried a video that its channel size cannot explain? |
| Video Deep Dive | Is this video a genuine hit, and what did they do right? |
| Channel Analyzer | How often does this channel publish, when, and with what tags and title patterns? |
| Channel Comparison | Which of these channels is actually growing? |
| Comment Analyzer | What has my audience already asked me to make? |
| Tag Analyzer | Which tags sit behind the best performing videos in this niche? |
| Playlist Analyzer | Where does a series lose its audience? |
| Video to Text | Give me the full transcript of this video, with timestamps. |
| Content Spinner | Rewrite this into fresh narration and lay it out as a script. |
| Title Generator | Give me scored headline options for this topic. |
| Hashtag Tool | Which hashtags, in which order, and how many? |

**45 data points per video** — views, likes, comments, publish age, average daily views, estimated ad earnings, ad eligibility, engagement rates, views per subscriber, outlier and velocity multiples, opportunity score, duration, format, category, tag counts, title and description metrics, caption availability, language, licence and more. Every one is a sortable column and every one lands in the CSV export.

**Shorts analysis** — filters to genuine sub-60-second uploads and reports median length, hook phrases and hashtag habits.

**Video to text plus content spinner** — pull a transcript from any captioned video, then rewrite it into fresh phrasing and a structured voiceover script with hook, beats, close and pacing marks.

**5,244 title combinations** — 131 headline structures across 14 angles, each scored on length, power words and keyword placement. Plus a hashtag builder that respects YouTube's 3-visible and 15-maximum rules.

**Runs in any browser** — open one HTML file, or host it at your own URL. There is also a Node version for the two tools browsers restrict. Zero npm dependencies either way.

---

## Four ways to run it

Four ways, depending on how much setup you want. All four run the same research engine.

### 1. One file, no install

Download **[dist/viewforge.html](dist/viewforge.html)** and double-click it. It opens in Chrome, Safari, Edge or Firefox and runs completely offline — the whole app is inside that one file. Keep it in your Downloads folder and open it whenever you need it.

### 2. Host it at your own URL

The `web/` folder is a plain static site. Any of these work:

- **GitHub Pages**: in this repo go to Settings, then Pages, and set Source to GitHub Actions. The included workflow builds and publishes on every push, giving you `https://<your-username>.github.io/YT-Research-/`.
- **Netlify**: drag the `web/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop). You get a URL in about ten seconds.
- **Vercel / Cloudflare Pages**: connect the repo. `vercel.json` and `netlify.toml` are already configured.

### 3. Run the Node version locally

```bash
git clone https://github.com/mwilson3208-cpu/YT-Research-.git
cd YT-Research-
node server/index.js
```

Then open **http://localhost:4173**. No `npm install` and no build step — the server uses only the Node standard library, and needs Node 20 or newer.

### 4. Let Claude Desktop run it for you

Viewforge installs as an MCP server, so you can ask Claude in plain language and it does the research. See [Use it inside Claude Desktop](#use-it-inside-claude-desktop) below.

---

The Node build and the Claude Desktop build are the most capable. Two tools work in both that browsers will not allow from a hosted page:

| | Browser build | Node build | Claude Desktop |
| --- | --- | --- | --- |
| 13 of the 15 tools | Yes | Yes | Yes |
| Keyword Generator | Pattern bank | Live autocomplete | Live autocomplete |
| Video to Text | Paste your own transcript | Automatic | Automatic |

Browsers block both endpoints for security reasons, which the app says on screen rather than failing quietly.

---

## Use it inside Claude Desktop

Viewforge ships an MCP server, so Claude Desktop can run the research itself. You ask in plain language and Claude calls the tools, reads the results and reasons over them.

> Use Viewforge to find outlier topics in sleep stories, then write me ten titles for the best one.

### Setup

```bash
git clone https://github.com/mwilson3208-cpu/YT-Research-.git
cd YT-Research-
node scripts/setup-desktop.mjs --key YOUR_API_KEY
```

Then quit Claude Desktop completely and reopen it. Viewforge appears in the tools menu.

The script finds your Claude Desktop config, backs it up, and adds a `viewforge` entry without touching any other MCP server you already run. Drop `--key` to start on sample data and add the key later.

| Command | What it does |
| --- | --- |
| `node scripts/setup-desktop.mjs` | Install, or update an existing install |
| `node scripts/setup-desktop.mjs --key AIza...` | Install and set your YouTube API key |
| `node scripts/setup-desktop.mjs --print` | Print the JSON to paste in by hand, changing nothing |
| `node scripts/setup-desktop.mjs --remove` | Remove Viewforge, leaving your other servers alone |

### The 16 tools Claude gets

`viewforge_keywords`, `viewforge_trends`, `viewforge_search_videos`, `viewforge_shorts`, `viewforge_outliers`, `viewforge_video`, `viewforge_channel`, `viewforge_compare_channels`, `viewforge_comments`, `viewforge_tags`, `viewforge_playlist`, `viewforge_transcript`, `viewforge_spin`, `viewforge_titles`, `viewforge_hashtags`, `viewforge_status`.

Results come back as compact tables rather than raw data, so Claude can reason over them instead of drowning in 45 columns. When you want the full grid, ask for the CSV: any table tool takes `exportCsv` and writes all 45 columns to your Downloads folder, then tells Claude the path. Set `VIEWFORGE_EXPORT_DIR` in the config `env` block to send exports somewhere else.

### Things worth knowing

- **All 16 tools work here, including the two the browser build restricts.** The MCP server runs on your machine, so it reaches YouTube autocomplete and fetches real transcripts.
- **Watch your quota.** Claude can fire several searches to answer one question, and each keyword search costs 100 of your 10,000 daily units. Ask `viewforge_status` at any time for the running total.
- **If Viewforge does not appear**, check Claude Desktop's MCP log. The server writes a startup line there saying how many tools it loaded and whether it found your API key.

---

## Adding your YouTube API key

Without a key, the app runs on a bundled sample library of 8 channels and 72 videos. Every tool works and every column populates. It is the fastest way to see what the tool does before setting anything up.

To research the real YouTube:

1. Open the [Google Cloud console](https://console.cloud.google.com/projectcreate) and create a project.
2. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
3. Under [Credentials](https://console.cloud.google.com/apis/credentials), choose Create credentials, then API key.
4. Add it to the app:
   - **Browser build**: press Settings in the header and paste it in. It is stored in that browser only and sent straight to Google. Restrict the key to your own page under Website restrictions so nobody else can spend your quota.
   - **Node build**: `cp .env.example .env`, then paste the key into `YOUTUBE_API_KEY`.

The header badge switches from "Demo data" to "Live YouTube data" and starts tracking quota.

---

## Configuration

All settings live in `.env`:

| Variable | Default | What it does |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | _(empty)_ | Your YouTube Data API v3 key. Empty means demo mode. |
| `PORT` | `4173` | Port the local server listens on. |
| `DEFAULT_REGION` | `US` | Country used by the trend and keyword tools. |
| `DEFAULT_LANGUAGE` | `en` | Language used for autocomplete and captions. |
| `RPM_LOW` | `0.50` | Low end of the earnings model, USD per 1,000 monetized views. |
| `RPM_HIGH` | `6.00` | High end of the same band. |

---

## Quota, and how to keep it

Google gives every project **10,000 quota units a day, free**.

| Action | Cost |
| --- | --- |
| Keyword search (Video Analyzer, Shorts, Outliers) | 100 units |
| Video, channel, playlist and comment lookups | 1 unit each |
| Trends Analyzer | 1 unit |
| Keyword Generator, Title Generator, Hashtag Tool, Content Spinner | 0 units |

So roughly 90 keyword searches a day on the free tier. Three things protect it:

- Results are **cached for 10 minutes**, so re-running the same search is free.
- The header shows **units used this session**, live.
- Four of the tools cost nothing at all, because they never touch the Data API.

If you run dry, the quota resets at midnight Pacific. Until then, clear `YOUTUBE_API_KEY` from `.env` and keep working in demo mode.

---

## How the numbers are calculated

Most columns come straight from the YouTube Data API. The derived ones are documented here and in the app's **How it works** page, because a research tool you cannot check is a research tool you cannot trust.

**Estimated earnings.** Monetized views are assumed at 55% of total views (ad blockers, non-ad markets, skipped pre-rolls), multiplied by an RPM band of $0.50 to $6.00 per 1,000 views, then adjusted by category — finance and technology earn multiples of what music does. YouTube never publishes another channel's revenue, so this is a range, not a figure.

**Ads found.** The API does not expose whether a video runs ads. This column scores ad *eligibility*: past the 8-minute mid-roll threshold, an advertiser-friendly category, standard licence, not made for kids, not a livestream. "Likely" means eligible, not confirmed. The reasons behind each score are in the response.

**Opportunity score (0-100).** Combines views per day, views per subscriber, engagement rate and freshness. High means the topic is pulling traffic that a small channel could also reach.

**Outlier multiple.** Views divided by the median views of the result set. 5x means the video pulled five times its peer group, which points at the topic rather than the channel. **Velocity multiple** applies the same idea to views per day, so an old video cannot coast on lifetime totals.

**Keyword score.** Autocomplete appearances approximate demand; word count approximates competition. Long tail scores easier because it is easier to rank.

**Title score.** Length inside the 40-70 character window that survives truncation, presence of a number, power words, and how early your keyword appears.

---

## Where the data comes from

- **YouTube Data API v3** for search, videos, channels, playlists, comment threads and the most-popular chart.
- **YouTube autocomplete** for the Keyword Generator. These are real searches, ranked by frequency, from the same endpoint the YouTube search box uses. If your network blocks it, the tool falls back to a pattern bank and says so.
- **The watch page caption track** for Video to Text. The Data API will not release caption bodies without the video owner's OAuth token, so the transcript is read from the track the player itself loads. Works on any video with captions, auto-generated included.
- **The bundled demo library** when no API key is set.

---

## Project layout

```
server/
  index.js          HTTP server, routing, static files
  config.js         .env loading and settings
  cache.js          10-minute result cache
  youtube.js        YouTube Data API client, quota tracking, URL parsing
  metrics.js        The 45 data points, scoring, column dictionary
  service.js        One function per tool; unifies live and demo mode
  tools/
    keywords.js     Autocomplete expansion, scoring, phrase extraction
    titles.js       131 templates, slot filling, title scoring
    hashtags.js     Hashtag sets and YouTube's display rules
    spinner.js      Synonym rewriting and voiceover script building
    transcript.js   Caption track extraction and parsing
    comments.js     Sentiment, questions, requests
  data/demo.js      Deterministic sample library
public/
  index.html        App shell (Node build)
  css/app.css       Styling, light and dark
  js/app.js         Routing, forms, state
  js/tools.js       Tool definitions and result rendering
  js/table.js       Sortable grid, column presets, CSV export
  js/util.js        Formatting and DOM helpers
  js/api.js         Fetch wrapper
mcp/
  server.js         MCP server for Claude Desktop (stdio JSON-RPC, no SDK)
  tools.js          The 16 tools Claude sees
  format.js         Markdown formatting for Claude
  export.js         CSV export to disk
web/                Static browser bundle (built - do not edit core/ by hand)
dist/viewforge.html Whole app as one double-clickable file (built)
scripts/            Build and preview scripts
test/               106 tests, run with `npm test`
```

---

## Development

```bash
npm test            # 106 tests, no network required
npm run dev         # Node server with --watch for auto-restart
npm run build       # rebuild both browser bundles
npm run serve:web   # preview the static bundle on :4174
npm run mcp         # run the MCP server by hand (speaks JSON-RPC on stdin)
```

The research engine is shared. `server/` holds plain ES modules with no Node
built-ins, and `scripts/build-web.mjs` copies them into `web/core/` so the
browser runs the identical code. `scripts/build-single.mjs` then inlines
everything into `dist/viewforge.html`. Tests fail if a bundle goes stale, so
run `npm run build` after touching anything shared.

The test suite runs entirely in demo mode, so it needs no API key and no internet connection.

---

## Notes and limits

- **Tags are often hidden.** Many channels leave the tag field empty, and YouTube only returns tags to the video's owner in some cases. When the Tag Analyzer finds nothing, use the repeated title phrases it shows instead.
- **Comments can be disabled**, which the Comment Analyzer reports rather than failing silently.
- **Transcripts need captions.** Videos with captions turned off cannot be transcribed by any tool, including this one.
- **The browser build cannot read transcripts.** Browsers refuse to fetch the YouTube watch page from another site. Open the video on YouTube, press the three dots and Show transcript, copy it, and paste it into the Content Spinner. Or use the Node build, which does it for you.
- **Your API key is yours to protect.** In the browser build it lives in that browser's local storage and goes only to Google. Restrict it by website in the Google Cloud console before you put it on a public URL.
- **Estimates are estimates.** Earnings and ad eligibility are modelled, and labelled as such everywhere they appear.

## Licence

MIT. Use it commercially, modify it, ship it inside your own workflow.
