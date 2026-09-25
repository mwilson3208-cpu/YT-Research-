import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * CSV export for the MCP server. Claude Desktop cannot hand you a download, so
 * exports are written to a folder you can open. Set VIEWFORGE_EXPORT_DIR to
 * choose where; it defaults to Downloads, falling back to the home directory.
 */
export function exportDir() {
  if (process.env.VIEWFORGE_EXPORT_DIR) return path.resolve(process.env.VIEWFORGE_EXPORT_DIR);
  return path.join(os.homedir(), 'Downloads');
}

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

const slug = (text) => String(text || 'export')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60) || 'export';

export async function writeExport(name, csv) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  let dir = exportDir();
  const file = `viewforge-${slug(name)}-${stamp}.csv`;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), csv, 'utf8');
  } catch {
    // Downloads may not exist or may not be writable; fall back to the home dir.
    dir = os.homedir();
    await fs.writeFile(path.join(dir, file), csv, 'utf8');
  }
  return path.join(dir, file);
}
