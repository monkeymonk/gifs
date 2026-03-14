import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';

const GIF_DIR = 'gifs';
const OUT_FILE = join('_data', 'gifs.json');
const SUPPORTED_EXTS = new Set(['.gif', '.webm', '.mp4']);

function normalizeToken(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(value) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((entry) => parseScalar(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMetaYaml(text) {
  const result = {};
  let currentKey = null;
  let currentField = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const topLevelMatch = line.match(/^([^\s:#][^:]*)\s*:\s*$/);
    if (topLevelMatch) {
      currentKey = topLevelMatch[1].trim();
      currentField = null;
      result[currentKey] = {};
      continue;
    }

    if (!currentKey) {
      continue;
    }

    const fieldMatch = line.match(/^\s{2}([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (fieldMatch) {
      const [, field, rawValue] = fieldMatch;
      currentField = field;

      if (field === 'tags') {
        if (!rawValue.trim()) {
          result[currentKey].tags = [];
        } else {
          result[currentKey].tags = parseInlineArray(rawValue);
        }
      } else {
        result[currentKey][field] = parseScalar(rawValue);
      }
      continue;
    }

    const listItemMatch = line.match(/^\s{4}-\s*(.+)$/);
    if (listItemMatch && currentField === 'tags') {
      result[currentKey].tags ??= [];
      result[currentKey].tags.push(parseScalar(listItemMatch[1]));
    }
  }

  return result;
}

async function loadMeta(dir) {
  try {
    const content = await readFile(join(dir, '_meta.yaml'), 'utf8');
    return parseMetaYaml(content);
  } catch {
    return {};
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function scanDir(dir, items, categories) {
  const entries = await readdir(dir, { withFileTypes: true });
  const meta = await loadMeta(dir);

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '_meta.yaml') {
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDir(fullPath, items, categories);
      continue;
    }

    const ext = extname(entry.name).toLowerCase();
    if (!entry.isFile() || !SUPPORTED_EXTS.has(ext)) {
      continue;
    }

    const relPath = relative(GIF_DIR, fullPath);
    const relParts = relPath.split(sep);
    const fileName = relParts.pop();

    if (!fileName) {
      continue;
    }

    const baseName = basename(fileName, ext);
    const category = relParts[0] || 'misc';
    const subcategory = relParts[1] || null;
    const metaEntry = meta[baseName] || {};
    const fileStats = await stat(fullPath);

    const tags = unique([
      ...relParts.map(normalizeToken),
      ...baseName.split(/[-_ ]+/).map(normalizeToken),
      ...((metaEntry.tags || []).map(normalizeToken)),
    ]);

    categories.add(category);
    items.push({
      id: [...relParts, baseName].map(normalizeToken).filter(Boolean).join('-'),
      src: `/${join(GIF_DIR, ...relParts, fileName).split(sep).join('/')}`.replace(/^\//, ''),
      title: metaEntry.title?.trim() || humanize(baseName),
      category,
      subcategory,
      tags,
      bytes: fileStats.size,
      ext: ext.slice(1),
    });
  }
}

const items = [];
const categories = new Set();

try {
  await stat(GIF_DIR);
} catch {
  console.log(`No ${GIF_DIR}/ directory found — writing empty index`);
}
try {
  await scanDir(GIF_DIR, items, categories);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

await mkdir('_data', { recursive: true });
await writeFile(
  OUT_FILE,
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
      items,
    },
    null,
    2,
  ),
);

console.log(`Wrote ${items.length} items (${categories.size} categories) to ${OUT_FILE}`);
