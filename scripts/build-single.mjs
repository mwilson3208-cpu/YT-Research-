#!/usr/bin/env node
/**
 * Builds dist/viewforge.html: the whole app as one self-contained file.
 *
 * Browsers refuse to load ES modules over file://, so a folder of modules
 * cannot simply be double-clicked. This inlines every module into a tiny
 * registry inside one <script type="module">, which does run from file://.
 * The result is a single file you can keep in Downloads and open in any
 * browser, with no server and no install.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'dist', 'viewforge.html');
const ENTRY = 'js/app.js';

const MODULES = [
  'core/settings.js', 'core/cache.js', 'core/metrics.js', 'core/youtube.js',
  'core/service.js', 'core/data/demo.js',
  'core/tools/keywords.js', 'core/tools/titles.js', 'core/tools/hashtags.js',
  'core/tools/spinner.js', 'core/tools/transcript.js', 'core/tools/comments.js',
  'js/util.js', 'js/table.js', 'js/tools.js', 'js/api.js', 'js/app.js',
];

/** Resolve a relative specifier against the importing module's directory. */
function resolveSpecifier(fromId, specifier) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), specifier));
  if (!MODULES.includes(resolved)) {
    throw new Error(`${fromId} imports ${specifier}, which resolves to ${resolved} and is not in the module list.`);
  }
  return resolved;
}

const IMPORT_NAMESPACE = /^import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/;
const IMPORT_NAMED = /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/;
const EXPORT_LIST = /^export\s+\{([^}]+)\};?\s*$/;
const EXPORT_DECL = /^export\s+(async\s+function|function|class|const|let|var)\s+([\w$]+)/;

function transform(id, source) {
  const exported = new Map(); // exported name -> local name
  const lines = source.split('\n');
  const output = [];

  for (const line of lines) {
    const namespace = line.match(IMPORT_NAMESPACE);
    if (namespace) {
      output.push(`const ${namespace[1]} = __req(${JSON.stringify(resolveSpecifier(id, namespace[2]))});`);
      continue;
    }

    const named = line.match(IMPORT_NAMED);
    if (named) {
      // { a, b as c } -> { a, b: c }
      const bindings = named[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const alias = part.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
          return alias ? `${alias[1]}: ${alias[2]}` : part;
        })
        .join(', ');
      output.push(`const { ${bindings} } = __req(${JSON.stringify(resolveSpecifier(id, named[2]))});`);
      continue;
    }

    const list = line.match(EXPORT_LIST);
    if (list) {
      for (const part of list[1].split(',').map((entry) => entry.trim()).filter(Boolean)) {
        const alias = part.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
        if (alias) exported.set(alias[2], alias[1]);
        else exported.set(part, part);
      }
      continue; // the binding already exists in module scope
    }

    const declaration = line.match(EXPORT_DECL);
    if (declaration) {
      exported.set(declaration[2], declaration[2]);
      output.push(line.replace(/^export\s+/, ''));
      continue;
    }

    if (/^export\s/.test(line)) {
      throw new Error(`${id}: unsupported export form -> ${line.trim()}`);
    }
    output.push(line);
  }

  const assignments = [...exported.entries()]
    .map(([name, local]) => (name === local ? name : `${name}: ${local}`))
    .join(', ');

  return `__mod[${JSON.stringify(id)}] = (__exports, __req) => {\n${output.join('\n')}\n__assign(__exports, { ${assignments} });\n};`;
}

async function main() {
  const css = await fs.readFile(path.join(WEB, 'css', 'app.css'), 'utf8');
  const shell = await fs.readFile(path.join(WEB, 'index.html'), 'utf8');

  const factories = [];
  for (const id of MODULES) {
    const source = await fs.readFile(path.join(WEB, id), 'utf8');
    factories.push(transform(id, source));
  }

  const runtime = `
const __mod = {};
const __cache = {};
const __assign = Object.assign;
function __req(id) {
  if (__cache[id]) return __cache[id];
  const exports = {};
  __cache[id] = exports;
  const factory = __mod[id];
  if (!factory) throw new Error('Missing module: ' + id);
  factory(exports, __req);
  return exports;
}
${factories.join('\n')}
__req(${JSON.stringify(ENTRY)});
`.trim();

  // Take the shell's body, drop its external <link> and <script>, inline both.
  const body = shell
    .replace(/<link rel="stylesheet"[^>]*>/, '')
    .replace(/<script type="module"[^>]*><\/script>/, '')
    .match(/<body>([\s\S]*)<\/body>/)[1];

  const head = shell.match(/<title>([\s\S]*?)<\/title>/)[1];
  const description = (shell.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const icon = (shell.match(/<link rel="icon"[^>]*>/) || [''])[0];

  const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${head}</title>
<meta name="description" content="${description}">
${icon}
<style>
${css}
</style>
</head>
<body>
${body.trim()}
<script type="module">
${runtime}
</script>
</body>
</html>
`;

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`[build-single] dist/viewforge.html written (${kb} KB, ${MODULES.length} modules inlined)`);
}

main().catch((error) => {
  console.error(`[build-single] ${error.message}`);
  process.exit(1);
});
