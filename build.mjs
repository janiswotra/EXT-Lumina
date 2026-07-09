// Build the loadable/publishable extension: src/ (source) -> dist/ + zip.
//
// The architecture is unchanged — this is NOT a bundler. The extension is the
// tiny vanilla iframe injector; the UI lives in app/ on the Yena server. This
// script produces a clean, publish-ready build of src/:
//   1. copies src/ -> dist/ (skips dev-only files: README, _metadata)
//   2. stamps the version from package.json into dist/manifest.json (single
//      source of truth for the version number)
//   3. packages dist/ into yena-clipper.zip (ready for the Chrome Web Store)
//
// No npm dependencies — pure Node built-ins + the system `zip`. Run:
//   node build.mjs        (or: npm run build)

import { readdir, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');
const ZIP = join(ROOT, 'yena-clipper.zip');

// Files in src/ that should never ship in the packaged extension.
const SKIP = new Set(['README.md', '_metadata']);

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

// 1. Fresh output dir.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 2. Copy everything from src/ except the skip list.
const entries = await readdir(SRC, { withFileTypes: true });
for (const e of entries) {
  if (SKIP.has(e.name)) continue;
  await cp(join(SRC, e.name), join(OUT, e.name), { recursive: true });
}

// 3. Stamp the version from package.json into the built manifest.
const manifestPath = join(OUT, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = version;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 4. Package dist/ into a zip for the Chrome Web Store.
await rm(ZIP, { force: true });
execFileSync('zip', ['-r', '-q', '-FS', ZIP, '.'], { cwd: OUT });

console.log(`Built dist/ from src/  (version ${version})`);
console.log(`Packaged  yena-clipper.zip`);
console.log('Load unpacked: chrome://extensions -> Developer mode -> Load unpacked -> ./dist');
