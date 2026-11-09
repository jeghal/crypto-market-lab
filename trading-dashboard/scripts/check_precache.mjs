import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_WORKER_PATH = path.join(ROOT, 'service-worker.js');
const ENTRY_PATH = path.join(ROOT, 'script.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parsePrecacheUrls(serviceWorkerSource) {
  const start = serviceWorkerSource.indexOf('const PRECACHE_URLS = [');
  if (start < 0) throw new Error('PRECACHE_URLS array not found in service-worker.js');
  const end = serviceWorkerSource.indexOf('];', start);
  if (end < 0) throw new Error('PRECACHE_URLS array end not found in service-worker.js');
  const slice = serviceWorkerSource.slice(start, end);

  const urls = [];
  const re = /['"](\.\/[^'"]+)['"]/g;
  for (const match of slice.matchAll(re)) urls.push(match[1]);
  return urls;
}

function normalizePrecacheUrl(url) {
  return url.replace(/\\/g, '/');
}

function resolveImport(fromFilePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const baseDir = path.dirname(fromFilePath);
  const resolved = path.resolve(baseDir, specifier);
  const withExt = path.extname(resolved) ? resolved : `${resolved}.js`;
  return withExt;
}

function parseImports(jsSource) {
  const specs = new Set();
  const re = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of jsSource.matchAll(re)) specs.add(match[1]);
  return [...specs];
}

function isInsideRoot(filePath) {
  const rel = path.relative(ROOT, filePath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toPrecachePath(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  return `./${rel}`;
}

function collectImportedFiles(entryPath) {
  const visited = new Set();
  const queue = [entryPath];

  while (queue.length) {
    const current = queue.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const source = readText(current);
    for (const spec of parseImports(source)) {
      const resolved = resolveImport(current, spec);
      if (!resolved) continue;
      if (!isInsideRoot(resolved)) continue;
      if (!fs.existsSync(resolved)) continue;
      queue.push(resolved);
    }
  }

  return [...visited];
}

function main() {
  if (!fs.existsSync(SERVICE_WORKER_PATH)) {
    console.error(`Missing file: ${SERVICE_WORKER_PATH}`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(ENTRY_PATH)) {
    console.error(`Missing file: ${ENTRY_PATH}`);
    process.exitCode = 1;
    return;
  }

  const sw = readText(SERVICE_WORKER_PATH);
  const precacheUrls = parsePrecacheUrls(sw).map(normalizePrecacheUrl);
  const precacheSet = new Set(precacheUrls);

  const imported = collectImportedFiles(ENTRY_PATH);
  const importedPrecachePaths = imported
    .filter((f) => path.extname(f) === '.js')
    .map(toPrecachePath);

  const missing = importedPrecachePaths.filter((p) => !precacheSet.has(p));

  const missingFiles = [];
  for (const url of precacheUrls) {
    const filePath = path.resolve(ROOT, url.replace(/^\.\//, ''));
    if (!fs.existsSync(filePath)) missingFiles.push(url);
  }

  if (!missing.length && !missingFiles.length) {
    console.log('PRECACHE_URLS OK: all imported JS files are precached, and all precache entries exist.');
    return;
  }

  if (missing.length) {
    console.log('\nMissing from PRECACHE_URLS (imported by app):');
    for (const p of missing) console.log(`- ${p}`);
  }
  if (missingFiles.length) {
    console.log('\nMissing files on disk (listed in PRECACHE_URLS):');
    for (const p of missingFiles) console.log(`- ${p}`);
  }

  process.exitCode = 1;
}

main();
