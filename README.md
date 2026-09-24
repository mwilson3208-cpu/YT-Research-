# Tube Atlas

**Before you produce your next voiceover, know exactly what wins.**

Tube Atlas is a YouTube research console that reveals the top videos, channels, keywords and trends on the platform, so you create audio content people are already searching for. It runs on your own machine, uses your own free YouTube API key, and sends nothing anywhere else.

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

**Runs anywhere Node runs** — Windows, macOS and Linux, with zero npm dependencies.

---

## Quick start

```bash
git clone https://github.com/mwilson3208-cpu/YT-Research-.git
cd YT-Research-
node server/index.js
```

Open **http://localhost:4173**.

That is the whole install. There is no build step and nothing to `npm install` — the server uses only the Node standard library. You need Node 20 or newer.

### Demo mode

With no API key set, Tube Atlas runs against a bundled sample library of 8 channels and 72 videos. Every tool works, every column populates, every export runs. It is the fastest way to see what the tool does before you set up Google Cloud.

### Live mode

To research the real YouTube:

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. Enable **YouTube Data API v3** for that project.
3. Create an API key under **Credentials**.
4. Set it up:

```bash
cp .env.example .env
# open .env and paste your key into YOUTUBE_API_KEY
node server/index.js
```

The header badge switches from "Demo data" to "Live YouTube data" and starts tracking your quota.

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
  index.html        App shell
  css/app.css       Styling, light and dark
  js/app.js         Routing, forms, state
  js/tools.js       Tool definitions and result rendering
  js/table.js       Sortable grid, column presets, CSV export
  js/util.js        Formatting and DOM helpers
  js/api.js         Fetch wrapper
test/               80 tests, run with `npm test`
```

---

## Development

```bash
npm test          # 80 tests, no network required
npm run dev       # server with --watch for auto-restart
```

The test suite runs entirely in demo mode, so it needs no API key and no internet connection.

---

## Notes and limits

- **Tags are often hidden.** Many channels leave the tag field empty, and YouTube only returns tags to the video's owner in some cases. When the Tag Analyzer finds nothing, use the repeated title phrases it shows instead.
- **Comments can be disabled**, which the Comment Analyzer reports rather than failing silently.
- **Transcripts need captions.** Videos with captions turned off cannot be transcribed by any tool, including this one.
- **Estimates are estimates.** Earnings and ad eligibility are modelled, and labelled as such everywhere they appear.

## Licence

MIT. Use it commercially, modify it, ship it inside your own workflow.
