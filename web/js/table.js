import { el, clear, formatCell, toCsv, download, toast, scoreClass, copy } from './util.js';

/**
 * The research grid.
 *
 * All 44 columns are available; a sensible subset shows by default and the
 * column picker lets you switch any of them on. Sorting, filtering and CSV
 * export all run client-side against the full row set.
 */

const DEFAULT_VISIBLE = new Set([
  'thumbnail', 'title', 'channelTitle', 'views', 'avgDailyViews', 'opportunity',
  'outlierScore', 'likes', 'comments', 'engagementRate', 'subscribers',
  'viewsPerSubscriber', 'estEarningsLow', 'estEarningsHigh', 'adsFound',
  'publishAgeLabel', 'duration', 'format', 'tagCount',
]);

const NUMERIC_TYPES = new Set(['int', 'float', 'money', 'score']);

export function createTable({ columns, rows, filename = 'viewforge-export.csv', storageKey = 'vf:cols' }) {
  const state = {
    sortKey: 'views',
    sortDir: 'desc',
    filter: '',
    visible: loadVisible(storageKey, columns),
  };

  const container = el('div', { class: 'table-block' });
  const toolbar = el('div', { class: 'table-toolbar' });
  const wrap = el('div', { class: 'table-wrap' });
  const count = el('span', { class: 'table-count' });

  const search = el('input', {
    type: 'text',
    placeholder: 'Filter rows by title, channel, tag...',
    oninput: (event) => { state.filter = event.target.value.toLowerCase(); render(); },
  });
  search.style.maxWidth = '280px';

  const colMenu = el('div', { class: 'col-menu hidden' });
  const colButton = el('button', {
    class: 'btn ghost sm',
    onclick: (event) => {
      event.stopPropagation();
      colMenu.classList.toggle('hidden');
    },
  }, `Columns (${columns.length})`);

  for (const column of columns) {
    const input = el('input', {
      type: 'checkbox',
      checked: state.visible.has(column.key),
      onchange: (event) => {
        if (event.target.checked) state.visible.add(column.key);
        else state.visible.delete(column.key);
        saveVisible(storageKey, state.visible);
        render();
      },
    });
    colMenu.append(el('label', {}, [input, column.label]));
  }
  document.addEventListener('click', (event) => {
    if (!colMenu.contains(event.target) && event.target !== colButton) colMenu.classList.add('hidden');
  });

  const presetSelect = el('select', {
    onchange: (event) => {
      applyPreset(event.target.value, state, columns);
      saveVisible(storageKey, state.visible);
      syncCheckboxes();
      render();
    },
  }, [
    el('option', { value: '', text: 'Column preset...' }),
    el('option', { value: 'default', text: 'Default (19 columns)' }),
    el('option', { value: 'all', text: `Everything (${columns.length} columns)` }),
    el('option', { value: 'money', text: 'Monetization focus' }),
    el('option', { value: 'seo', text: 'SEO / metadata focus' }),
    el('option', { value: 'growth', text: 'Growth + velocity focus' }),
    el('option', { value: 'minimal', text: 'Minimal' }),
  ]);
  presetSelect.style.maxWidth = '190px';

  toolbar.append(
    search,
    presetSelect,
    el('div', { class: 'grow' }),
    count,
    el('button', {
      class: 'btn ghost sm',
      onclick: () => {
        download(filename, toCsv(columns, visibleRows()));
        toast(`Exported ${visibleRows().length} rows with all ${columns.length} columns`);
      },
    }, 'Export CSV'),
    el('button', {
      class: 'btn ghost sm',
      onclick: () => copy(visibleRows().map((row) => row.url).filter(Boolean).join('\n'), 'Video URLs copied'),
    }, 'Copy URLs'),
    el('div', { class: 'col-toggle' }, [colButton, colMenu]),
  );

  container.append(toolbar, wrap);

  function syncCheckboxes() {
    const inputs = colMenu.querySelectorAll('input[type="checkbox"]');
    columns.forEach((column, index) => { inputs[index].checked = state.visible.has(column.key); });
  }

  function visibleRows() {
    let list = rows;
    if (state.filter) {
      list = list.filter((row) => {
        const haystack = `${row.title || ''} ${row.channelTitle || ''} ${(row.tags || []).join(' ')} ${row.category || ''} ${row.format || ''}`.toLowerCase();
        return haystack.includes(state.filter);
      });
    }
    const column = columns.find((c) => c.key === state.sortKey);
    const numeric = column ? NUMERIC_TYPES.has(column.type) : true;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (numeric) return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function render() {
    const active = columns.filter((column) => state.visible.has(column.key));
    const data = visibleRows();
    count.textContent = `${data.length} of ${rows.length} rows - ${active.length}/${columns.length} columns`;

    const thead = el('thead', {}, [
      el('tr', {}, active.map((column) => el('th', {
        class: `${NUMERIC_TYPES.has(column.type) ? 'num' : ''} ${state.sortKey === column.key ? 'sorted' : ''}`,
        title: `Sort by ${column.label}`,
        onclick: () => {
          if (state.sortKey === column.key) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
          else { state.sortKey = column.key; state.sortDir = 'desc'; }
          render();
        },
      }, `${column.label}${state.sortKey === column.key ? (state.sortDir === 'desc' ? ' ▼' : ' ▲') : ''}`)),
    )]);

    const tbody = el('tbody', {}, data.map((row) => el('tr', {}, active.map((column) => cell(row, column)))));
    clear(wrap).append(el('table', { class: 'data' }, [thead, tbody]));
  }

  render();
  return container;
}

function cell(row, column) {
  const value = row[column.key];

  if (column.type === 'thumb') {
    const inner = value
      ? el('img', { src: value, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : el('div', { class: 'thumb-fallback', text: 'NO IMG' });
    return el('td', { class: 'thumb-cell' }, [
      row.url ? el('a', { href: row.url, target: '_blank', rel: 'noopener' }, [inner]) : inner,
    ]);
  }

  if (column.type === 'link') {
    const href = row[column.linkKey];
    const text = value || '-';
    return el('td', { class: column.key === 'title' ? 'title-cell' : '' }, [
      href ? el('a', { href, target: '_blank', rel: 'noopener', title: text }, text) : text,
    ]);
  }

  if (column.type === 'score') {
    const n = Number(value);
    return el('td', { class: 'num' }, [
      el('div', { class: 'score-bar' }, [
        el('div', { class: 'score-bar-fill', style: `width:${Math.max(0, Math.min(100, n))}%` }),
        el('span', { text: Number.isFinite(n) ? String(Math.round(n)) : '-' }),
      ]),
    ]);
  }

  if (column.type === 'badge') {
    const map = { Likely: 'good', Possible: 'warn', Unlikely: '', Short: 'accent', Standard: '', Long: '' };
    return el('td', {}, [el('span', { class: `badge ${map[value] || ''}`, text: value || '-' })]);
  }

  if (column.type === 'float' && (column.key === 'outlierScore' || column.key === 'velocityScore')) {
    const n = Number(value);
    const klass = n >= 3 ? 'good' : n >= 1.5 ? 'warn' : '';
    return el('td', { class: 'num' }, [el('span', { class: klass ? `badge ${klass}` : '', text: Number.isFinite(n) ? `${n.toFixed(2)}x` : '-' })]);
  }

  const text = Array.isArray(value) ? value.join(', ') : formatCell(value, column.type);
  const td = el('td', { class: NUMERIC_TYPES.has(column.type) ? 'num' : '' }, text);
  if (Array.isArray(value) && value.length) td.title = value.join(', ');
  return td;
}

const PRESETS = {
  default: [...DEFAULT_VISIBLE],
  money: ['thumbnail', 'title', 'channelTitle', 'views', 'avgDailyViews', 'estEarningsLow', 'estEarningsHigh', 'estEarningsPerMonth', 'adsFound', 'adSignalScore', 'category', 'duration', 'format'],
  seo: ['title', 'channelTitle', 'views', 'tagCount', 'titleLength', 'titleWords', 'descriptionLength', 'descriptionLinks', 'hashtagCount', 'hasCaptions', 'category', 'defaultLanguage', 'duration'],
  growth: ['thumbnail', 'title', 'channelTitle', 'views', 'avgDailyViews', 'opportunity', 'outlierScore', 'velocityScore', 'viewsPerSubscriber', 'subscribers', 'engagementRate', 'publishAgeLabel', 'publishedAt', 'publishedWeekday', 'publishedHourUtc'],
  minimal: ['title', 'channelTitle', 'views', 'publishAgeLabel', 'duration'],
};

function applyPreset(name, state, columns) {
  if (!name) return;
  if (name === 'all') {
    state.visible = new Set(columns.map((column) => column.key));
    return;
  }
  state.visible = new Set(PRESETS[name] || PRESETS.default);
}

function loadVisible(storageKey, columns) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved) && saved.length) {
      const valid = new Set(columns.map((column) => column.key));
      const filtered = saved.filter((key) => valid.has(key));
      if (filtered.length) return new Set(filtered);
    }
  } catch { /* first run, or storage blocked */ }
  return new Set(DEFAULT_VISIBLE);
}

function saveVisible(storageKey, visible) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...visible]));
  } catch { /* private mode - column choice just will not persist */ }
}
