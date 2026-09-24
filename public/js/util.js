/* Formatting + tiny DOM helpers shared by every tool view. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function num(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function int(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '-';
}

export function money(value) {
  if (value === null || value === undefined) return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (n >= 10000) return `$${num(n)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function date(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 10);
}

export function pct(value, digits = 1) {
  if (value === null || value === undefined) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '-';
}

export function scoreClass(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n >= 70) return 'good';
  if (n >= 40) return 'warn';
  return 'bad';
}

export function formatCell(value, type) {
  switch (type) {
    case 'int': return int(value);
    case 'float': return value === null || value === undefined ? '-' : Number(value).toFixed(2);
    case 'money': return money(value);
    case 'date': return date(value);
    case 'bool': return value === null || value === undefined ? '-' : (value ? 'Yes' : 'No');
    case 'score': return value === null || value === undefined ? '-' : String(Math.round(Number(value)));
    default: return value === null || value === undefined || value === '' ? '-' : String(value);
  }
}

/** RFC-4180-ish CSV escaping so Excel and Sheets both read it correctly. */
export function toCsv(columns, rows) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value) ? value.join('; ') : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((column) => escape(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(','));
  return [header, ...body].join('\r\n');
}

export function download(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer = null;
export function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', { class: 'toast' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

export async function copy(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = el('textarea', { style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); toast(label); } catch { toast('Copy failed - select the text manually'); }
    area.remove();
  }
}

export function copyButton(getText, label = 'Copy') {
  return el('button', { class: 'btn ghost sm', onclick: () => copy(getText()) }, label);
}

export function statTile(label, value, sub) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-value', text: value }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  ]);
}

export function stats(tiles) {
  return el('div', { class: 'stats' }, tiles.filter(Boolean));
}

export function panel(title, note, children) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', { class: 'panel-title', text: title }),
      note ? el('div', { class: 'panel-note', text: note }) : null,
    ]),
    ...[].concat(children),
  ]);
}

export function notice(kind, title, body) {
  return el('div', { class: `notice ${kind}` }, [
    el('div', {}, [el('b', { text: title }), body ? el('span', { text: body }) : null]),
  ]);
}

export function empty(title, body) {
  return el('div', { class: 'empty' }, [el('h3', { text: title }), el('div', { text: body || '' })]);
}

export function chipList(items, onClick) {
  return el('div', { class: 'chips' }, items.map((item) => el('button', {
    class: 'chip',
    onclick: onClick ? () => onClick(item) : undefined,
    title: onClick ? 'Click to copy' : undefined,
  }, [
    el('span', { text: item.label }),
    item.count !== undefined ? el('b', { text: String(item.count) }) : null,
  ])));
}

export function meter(value, max = 100) {
  const ratio = Math.max(0, Math.min(1, Number(value) / max));
  return el('div', { class: `meter ${scoreClass(Number(value) / max * 100)}` }, [
    el('i', { style: `width:${ratio * 100}%` }),
  ]);
}
