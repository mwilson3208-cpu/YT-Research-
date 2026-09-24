import { el, clear, notice, empty, toast, num, int } from './util.js';
import { call, getStatus, clearCache, loadSavedSettings, saveApiKey, savePrefs, currentSettings, hasKey } from './api.js';
import { TOOLS, TOOL_GROUPS } from './tools.js';

const state = {
  status: null,
  activeTool: null,
  results: new Map(),   // toolId -> last payload, so switching tabs keeps work
  inputs: new Map(),    // toolId -> last form values
};

const dom = {};

function init() {
  dom.nav = document.getElementById('nav');
  dom.main = document.getElementById('main');
  dom.modeBadge = document.getElementById('mode-badge');
  dom.quota = document.getElementById('quota');
  dom.topTitle = document.getElementById('top-title');
  dom.topSub = document.getElementById('top-sub');
  dom.sidebar = document.getElementById('sidebar');

  document.getElementById('menu-btn').addEventListener('click', () => dom.sidebar.classList.toggle('open'));
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('cache-btn').addEventListener('click', async () => {
    try {
      const result = await clearCache();
      toast(`Cache cleared (${result.data.cleared} entries)`);
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  dom.modeBadge.addEventListener('click', openSettings);
  dom.modeBadge.style.cursor = 'pointer';

  applyStoredTheme();
  loadSavedSettings();
  buildNav();
  window.addEventListener('hashchange', route);
  loadStatus().finally(() => {
    route();
    if (!hasKey()) maybeShowWelcome();
  });
}

function applyStoredTheme() {
  try {
    const stored = localStorage.getItem('vf:theme');
    if (stored) document.documentElement.dataset.theme = stored;
  } catch { /* storage blocked */ }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('vf:theme', next); } catch { /* ignore */ }
}

async function loadStatus() {
  try {
    const payload = await getStatus();
    state.status = payload.data;
    renderStatus();
  } catch (error) {
    dom.modeBadge.textContent = 'Startup failed';
    dom.modeBadge.className = 'badge bad';
    console.error(error);
  }
}

function renderStatus() {
  const status = state.status;
  if (!status) return;
  const live = status.mode === 'live';
  dom.modeBadge.className = `badge ${live ? 'live' : 'demo'}`;
  clear(dom.modeBadge).append(
    el('span', { class: 'dot' }),
    live ? 'Live YouTube data' : 'Demo data',
  );
  dom.modeBadge.title = live
    ? 'Connected to the YouTube Data API v3. Click to change your key.'
    : 'Running on sample data. Click to add your YouTube API key.';

  const quota = status.quota;
  if (live) {
    const used = quota.units;
    dom.quota.textContent = `Quota used: ${used.toLocaleString()} / ${quota.dailyLimit.toLocaleString()} units`;
    dom.quota.className = `badge ${used > quota.dailyLimit * 0.8 ? 'bad' : used > quota.dailyLimit * 0.5 ? 'warn' : ''}`;
  } else {
    dom.quota.textContent = `${status.demoLibrary.videos} sample videos - ${status.demoLibrary.channels} channels`;
    dom.quota.className = 'badge';
  }
}

function buildNav() {
  clear(dom.nav);
  for (const group of TOOL_GROUPS) {
    const tools = TOOLS.filter((tool) => tool.group === group);
    if (!tools.length) continue;
    dom.nav.append(el('div', { class: 'nav-group' }, [
      el('div', { class: 'nav-group-label', text: group }),
      ...tools.map((tool) => el('button', {
        class: 'nav-item',
        dataset: { tool: tool.id },
        onclick: () => { window.location.hash = `#/${tool.id}`; dom.sidebar.classList.remove('open'); },
      }, [
        el('span', { class: 'nav-icon', text: tool.icon }),
        el('span', { text: tool.name }),
      ])),
    ]));
  }
  dom.nav.append(el('div', { class: 'nav-group' }, [
    el('div', { class: 'nav-group-label', text: 'Reference' }),
    el('button', {
      class: 'nav-item',
      dataset: { tool: 'about' },
      onclick: () => { window.location.hash = '#/about'; dom.sidebar.classList.remove('open'); },
    }, [el('span', { class: 'nav-icon', text: '?' }), el('span', { text: 'How it works' })]),
  ]));
}

function route() {
  const id = (window.location.hash.replace(/^#\/?/, '') || TOOLS[0].id).split('?')[0];
  for (const button of dom.nav.querySelectorAll('.nav-item')) {
    button.classList.toggle('active', button.dataset.tool === id);
  }
  if (id === 'about') return renderAbout();
  const tool = TOOLS.find((entry) => entry.id === id) || TOOLS[0];
  state.activeTool = tool.id;
  renderTool(tool);
}

function renderTool(tool) {
  dom.topTitle.textContent = tool.title;
  dom.topSub.textContent = `${TOOLS.length} research tools - ${state.status?.columnCount ?? 44} data points per video`;

  const header = el('div', { class: 'tool-header' }, [
    el('h1', { text: tool.title }),
    el('p', { text: tool.blurb }),
  ]);

  const form = buildForm(tool);
  const results = el('div', { id: 'results' });

  clear(dom.main).append(header, form, results);

  const cached = state.results.get(tool.id);
  if (cached) drawResults(tool, cached, results);
  else results.append(empty('Nothing yet', `Fill in the form above and press Run ${tool.name}.`));
}

function buildForm(tool) {
  const saved = state.inputs.get(tool.id) || {};
  const grid = el('div', { class: 'form-grid' });
  const controls = new Map();

  for (const field of tool.fields) {
    let input;
    const value = saved[field.name] !== undefined ? saved[field.name] : field.value;

    if (field.type === 'select') {
      let options = field.options;
      if (options === 'categories') {
        options = [{ value: '', label: 'All categories' },
          ...(state.status?.categories || []).map((category) => ({ value: category.id, label: category.title }))];
      } else if (options === 'titleCategories') {
        options = [{ value: 'all', label: 'All angles' },
          ...(state.status?.titleCategories || []).map((category) => ({ value: category, label: category }))];
      }
      input = el('select', { name: field.name }, options.map((option) => el('option', {
        value: option.value,
        text: option.label,
        selected: String(option.value) === String(value ?? ''),
      })));
    } else if (field.type === 'textarea') {
      input = el('textarea', { name: field.name, placeholder: field.placeholder || '' });
      input.value = value ?? '';
    } else if (field.type === 'checkbox') {
      input = el('input', { type: 'checkbox', name: field.name });
      input.checked = value !== false;
    } else {
      input = el('input', {
        type: field.type === 'number' ? 'number' : 'text',
        name: field.name,
        placeholder: field.placeholder || '',
        min: field.min,
        max: field.max,
      });
      input.value = value ?? '';
    }

    controls.set(field.name, { input, field });

    if (field.type === 'checkbox') {
      grid.append(el('div', { class: 'field' }, [
        el('label', { text: ' ' }),
        el('label', { class: 'checkbox' }, [input, field.label]),
      ]));
    } else {
      grid.append(el('div', { class: `field ${field.wide ? 'wide' : ''}` }, [
        el('label', { text: field.label }),
        input,
        field.hint ? el('span', { class: 'field-hint', text: field.hint }) : null,
      ]));
    }
  }

  const runButton = el('button', { class: 'btn' }, `Run ${tool.name}`);
  grid.append(el('div', { class: 'field' }, [el('label', { text: ' ' }), runButton]));

  const form = el('form', { class: 'panel' }, [grid]);

  const submit = async (event) => {
    event?.preventDefault();
    const body = {};
    for (const [name, { input, field }] of controls) {
      if (field.type === 'checkbox') body[name] = input.checked;
      else if (field.type === 'number') body[name] = input.value === '' ? undefined : Number(input.value);
      else body[name] = input.value.trim();
      if (field.required && !String(body[name] ?? '').trim()) {
        input.focus();
        const results = document.getElementById('results');
        clear(results).append(notice('error', `${field.label} is required`, 'Fill that field in and run again.'));
        return;
      }
    }
    state.inputs.set(tool.id, body);
    await run(tool, body, runButton);
  };

  form.addEventListener('submit', submit);
  // Enter should run the tool from any single-line input.
  for (const [, { input, field }] of controls) {
    if (field.type !== 'textarea') {
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(event); });
    }
  }

  return form;
}

async function run(tool, body, button) {
  const results = document.getElementById('results');
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Working...';
  clear(results).append(el('div', { class: 'loading' }, [
    el('span', { class: 'spinner' }),
    el('span', { text: loadingMessage(tool) }),
  ]));

  try {
    const payload = await call(tool.endpoint, body);
    state.results.set(tool.id, payload);
    drawResults(tool, payload, results);
    renderStatus();
    loadStatus();
  } catch (error) {
    clear(results).append(errorNotice(error));
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function loadingMessage(tool) {
  const messages = {
    keywords: 'Probing YouTube autocomplete across A-Z and modifier variants...',
    trends: 'Pulling the most popular chart and scoring velocity...',
    videos: 'Searching, then fetching full statistics and channel context...',
    shorts: 'Finding sub-60-second uploads and reading their hooks...',
    transcript: 'Reading the caption track from the watch page...',
    comments: 'Reading comments and scoring sentiment...',
    channel: 'Loading uploads and working out the publishing pattern...',
    compare: 'Loading each channel in turn...',
  };
  return messages[tool.id] || 'Working...';
}

function errorNotice(error) {
  const hints = {
    demo_mode: 'Open Settings in the header and paste your YouTube API key.',
    quotaExceeded: 'The YouTube quota resets at midnight Pacific. Until then, clear your key in Settings to keep using sample data.',
    keyInvalid: 'That API key was rejected. Check it in the Google Cloud console and confirm YouTube Data API v3 is enabled.',
    accessNotConfigured: 'Enable "YouTube Data API v3" for this project in the Google Cloud console.',
    commentsDisabled: 'Pick a video that allows comments.',
  };
  return notice('error', error.message, hints[error.reason] || '');
}

function drawResults(tool, payload, container) {
  clear(container);
  const context = {
    sendToSpinner(text, title) {
      state.inputs.set('spinner', { text, title, intensity: 'medium', tone: 'conversational', addOpeners: true });
      window.location.hash = '#/spinner';
      toast('Transcript loaded into the Content Spinner');
    },
  };
  try {
    const nodes = tool.render(payload.data, context) || [];
    for (const node of [].concat(nodes)) if (node) container.append(node);
    container.append(el('div', { class: 'panel-note', style: 'margin-top:6px', text: `Completed in ${payload.elapsedMs} ms - ${payload.mode} mode` }));
  } catch (error) {
    console.error(error);
    container.append(notice('error', 'Could not render these results', error.message));
  }
}

function renderAbout() {
  dom.topTitle.textContent = 'How it works';
  dom.topSub.textContent = 'Data sources, scoring methods, and what each number means';
  const status = state.status;

  const section = (title, rows) => el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [el('div', { class: 'panel-title', text: title })]),
    el('div', { class: 'list' }, rows.map(([label, body]) => el('div', { class: 'list-row' }, [
      el('div', { class: 'body' }, [el('b', { text: label }), el('div', { class: 'meta', text: body })]),
    ]))),
  ]);

  clear(dom.main).append(
    el('div', { class: 'tool-header' }, [
      el('h1', { text: 'How Viewforge works' }),
      el('p', { text: 'Every number here is either straight from the YouTube Data API or calculated from it with a documented formula. Nothing is invented, and the two estimates in the tool are labelled as estimates.' }),
    ]),
    status ? el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('div', { class: 'stat-label', text: 'Mode' }), el('div', { class: 'stat-value', text: status.mode === 'live' ? 'Live' : 'Demo' })]),
      el('div', { class: 'stat' }, [el('div', { class: 'stat-label', text: 'Research tools' }), el('div', { class: 'stat-value', text: String(TOOLS.length) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'stat-label', text: 'Data points per video' }), el('div', { class: 'stat-value', text: String(status.columnCount) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'stat-label', text: 'Title capacity' }), el('div', { class: 'stat-value', text: int(status.titleCapacity.titles) })]),
    ]) : null,
    section('Where the data comes from', [
      ['YouTube Data API v3', 'Search, videos, channels, playlists, comment threads and the most-popular chart. Needs your own free API key.'],
      ['YouTube autocomplete', 'The Keyword Generator reads the same suggestion endpoint the YouTube search box uses. Browsers block that endpoint, so this hosted build falls back to a pattern bank and says so on screen.'],
      ['Watch page caption track', 'Video to Text reads the caption track the player itself loads. The Data API will not release caption bodies without the video owner’s permission.'],
      ['Sample library', 'With no API key set, an 8-channel, 72-video sample library runs through the identical code path so you can try every tool before signing up for anything.'],
    ]),
    section('The two estimates, stated plainly', [
      ['Estimated earnings', `Monetized views are assumed at 55% of total views, multiplied by an RPM band of $${status?.rpm.low ?? '0.50'} to $${status?.rpm.high ?? '6.00'} per 1,000 views, then adjusted by category. YouTube never publishes another channel’s revenue, so treat this as a range, not a figure.`],
      ['Ads found', 'The API does not expose whether a video runs ads. This column scores ad eligibility instead: length past the 8-minute mid-roll threshold, an advertiser-friendly category, standard licence, not made for kids, not a livestream. "Likely" means eligible, not confirmed.'],
    ]),
    section('Scores you will see', [
      ['Opportunity (0-100)', 'Combines views per day, views per subscriber, engagement rate and freshness. High means the topic is pulling traffic that a small channel could also reach.'],
      ['Outlier multiple', 'Views divided by the median views of the result set. 5x means the video pulled five times its peer group, which points at the topic rather than the channel.'],
      ['Velocity multiple', 'Same idea applied to views per day, so a three-year-old video cannot coast on lifetime totals.'],
      ['Keyword score', 'Autocomplete appearances approximate demand; word count approximates competition. Long tail scores easier because it is easier to rank.'],
      ['Title score', 'Length inside the 40-70 character window that survives truncation, presence of a number, power words, and how early your keyword appears.'],
    ]),
    section('Quota, and how to keep it', [
      ['You get 10,000 units a day', 'A search costs 100 units. Video, channel, playlist and comment lookups cost 1 each. So roughly 90 keyword searches a day on the free tier.'],
      ['Results are cached for 10 minutes', 'Re-running the same search inside that window costs nothing. The header shows units used this session.'],
      ['Sample mode costs nothing', 'Clear your key in Settings to explore every tool against the bundled sample library.'],
    ]),
  );
}


/* ---------- Settings ---------- */

function openSettings() {
  const current = currentSettings();
  const keyInput = el('input', { type: 'text', placeholder: 'AIza...', spellcheck: 'false' });
  keyInput.value = current.apiKey || '';

  const regionInput = el('input', { type: 'text', maxlength: '2' });
  regionInput.value = current.region || 'US';
  const languageInput = el('input', { type: 'text', maxlength: '5' });
  languageInput.value = current.language || 'en';
  const rpmLowInput = el('input', { type: 'number', step: '0.05', min: '0' });
  rpmLowInput.value = String(current.rpmLow);
  const rpmHighInput = el('input', { type: 'number', step: '0.05', min: '0' });
  rpmHighInput.value = String(current.rpmHigh);

  const status = el('div', { class: 'field-hint' });

  const close = () => overlay.remove();

  const save = () => {
    const stored = saveApiKey(keyInput.value);
    savePrefs({
      region: (regionInput.value || 'US').toUpperCase().slice(0, 2),
      language: (languageInput.value || 'en').trim(),
      rpmLow: Number(rpmLowInput.value) || 0.5,
      rpmHigh: Number(rpmHighInput.value) || 6,
    });
    if (!stored && keyInput.value.trim()) {
      status.textContent = 'Saved for this session. Your browser blocked local storage, so you will need to paste it again after a reload.';
      toast('Key active for this session');
    } else {
      toast(keyInput.value.trim() ? 'API key saved in this browser' : 'Key cleared - back to sample data');
      close();
    }
    state.results.clear();
    loadStatus().then(route);
  };

  const dialog = el('div', { class: 'modal', onclick: (event) => event.stopPropagation() }, [
    el('div', { class: 'modal-head' }, [
      el('div', { class: 'panel-title', text: 'Settings' }),
      el('button', { class: 'btn ghost sm', onclick: close }, 'Close'),
    ]),
    notice('info', 'Your key stays in this browser',
      'It is saved in this browser only and sent straight to Google when you run a search. It never reaches any other server, and nobody else who opens this page can see it.'),
    el('div', { class: 'field' }, [
      el('label', { text: 'YouTube Data API v3 key' }),
      keyInput,
      el('span', { class: 'field-hint', text: 'Leave this empty to keep working with the bundled sample library.' }),
    ]),
    el('details', { class: 'howto' }, [
      el('summary', { text: 'How to get a free key (about 3 minutes)' }),
      el('ol', { class: 'howto-list' }, [
        el('li', {}, [ 'Open the ', el('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'Google Cloud console'), ' and create a project.' ]),
        el('li', {}, [ 'Open ', el('a', { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', target: '_blank', rel: 'noopener' }, 'YouTube Data API v3'), ' and press Enable.' ]),
        el('li', {}, [ 'Go to ', el('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener' }, 'Credentials'), ', choose Create credentials, then API key.' ]),
        el('li', { text: 'Copy the key and paste it above. Google gives you 10,000 free units a day.' }),
        el('li', { text: 'Optional: restrict the key to this page under Website restrictions, so nobody else can spend your quota.' }),
      ]),
    ]),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Default region' }), regionInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Language' }), languageInput]),
      el('div', { class: 'field' }, [el('label', { text: 'RPM low (USD)' }), rpmLowInput]),
      el('div', { class: 'field' }, [el('label', { text: 'RPM high (USD)' }), rpmHighInput]),
    ]),
    el('div', { class: 'field-hint', text: 'RPM sets the earnings estimate band, in dollars per 1,000 monetized views.' }),
    status,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn ghost', onclick: () => { keyInput.value = ''; save(); } }, 'Clear key'),
      el('button', { class: 'btn', onclick: save }, 'Save'),
    ]),
  ]);

  const overlay = el('div', { class: 'overlay', onclick: close }, [dialog]);
  document.body.append(overlay);
  keyInput.focus();
  document.addEventListener('keydown', function escape(event) {
    if (event.key === 'Escape') { close(); document.removeEventListener('keydown', escape); }
  });
}

function maybeShowWelcome() {
  try {
    if (localStorage.getItem('vf:welcomed')) return;
    localStorage.setItem('vf:welcomed', '1');
  } catch { /* storage blocked: show it, it is harmless */ }
  const main = dom.main;
  main.prepend(notice('info', 'You are running on sample data',
    'Every tool works right now against a bundled library of 8 channels and 72 videos. To research the real YouTube, add a free API key under Settings in the header.'));
}

document.addEventListener('DOMContentLoaded', init);
