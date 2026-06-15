// Auto-host: upload this app/ folder to the Yena extension hosting endpoint,
// so the static injector can load it into LinkedIn (the iframe src).
//
// No build, no deps — just Node's built-ins. Run:
//   node deploy.mjs --token <DEPLOY_TOKEN>
//   node deploy.mjs --domain https://demo.yena.ai --token <TOKEN> --channel main
//
// Env fallbacks: YENA_DOMAIN, EXTENSION_DEPLOY_TOKEN
//
// Endpoint (yena-ats server.js): POST <domain>/api/v1/extension/<channel>/<path>
//   header: x-deploy-token: <DEPLOY_TOKEN>

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)); // the app/ folder
const SELF = basename(fileURLToPath(import.meta.url)); // deploy.mjs

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const DOMAIN = (flag('domain') || process.env.YENA_DOMAIN || 'https://demo.yena.ai').replace(/\/+$/, '');
const TOKEN = flag('token') || process.env.EXTENSION_DEPLOY_TOKEN || '';
const CHANNEL = flag('channel') || 'main';

// Only host the runtime files — skip this script and docs.
const SKIP = new Set([SELF, 'README.md']);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

if (!/^https?:\/\/.+/.test(DOMAIN) || !TOKEN) {
  console.error('Missing config. Provide --domain and --token (or YENA_DOMAIN / EXTENSION_DEPLOY_TOKEN).');
  process.exit(1);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (!entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

async function upload(absPath) {
  const rel = relative(ROOT, absPath).split(sep).join('/');
  const body = await readFile(absPath);
  const contentType = CONTENT_TYPES[extname(absPath).toLowerCase()] || 'application/octet-stream';

  const res = await fetch(`${DOMAIN}/api/v1/extension/${CHANNEL}/${rel}`, {
    method: 'POST',
    headers: { 'x-deploy-token': TOKEN, 'Content-Type': contentType },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${rel} -> ${res.status} ${text}`);
  }
  console.log(`  ok ${rel} (${body.length} bytes)`);
}

const files = await walk(ROOT);
console.log(`Uploading ${files.length} files to ${DOMAIN}/api/v1/extension/${CHANNEL}/ ...`);

let failed = 0;
for (const file of files) {
  try { await upload(file); }
  catch (err) { failed++; console.error(`  FAIL ${err.message}`); }
}

console.log(failed ? `Done with ${failed} failure(s).` : 'Done.');
process.exitCode = failed ? 1 : 0;
