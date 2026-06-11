// Build → upload the hosted UI to the Yena extension hosting endpoint.
// Mirrors the reference project's removehash.js: walk the build output and POST
// each file to the server, keyed by channel.
//
// Usage:
//   node scripts/deploy.mjs --domain https://app.yena.ai --token <DEPLOY_TOKEN> [--build] [--dist dist-host] [--channel main]
//   --build runs `npm run build:host` first (the injectable UI bundle).
//
// Env fallbacks: YENA_DOMAIN, EXTENSION_DEPLOY_TOKEN
//
// Endpoint (server.js): POST <domain>/api/v1/extension/<channel>/<path>
//   header: x-deploy-token: <DEPLOY_TOKEN>
//   body:   raw file bytes

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep, extname } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);

const DOMAIN = (flag('domain') || process.env.YENA_DOMAIN || '').replace(/\/+$/, '');
const TOKEN = flag('token') || process.env.EXTENSION_DEPLOY_TOKEN || '';
const CHANNEL = flag('channel') || 'main';
const DIST = flag('dist') || 'dist-host';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

if (!/^https?:\/\/.+/.test(DOMAIN) || !TOKEN) {
  console.error('Missing config. Provide --domain and --token (or YENA_DOMAIN / EXTENSION_DEPLOY_TOKEN).');
  process.exit(1);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function upload(absPath) {
  const rel = relative(DIST, absPath).split(sep).join('/');
  const body = await readFile(absPath);
  const contentType = CONTENT_TYPES[extname(absPath).toLowerCase()] || 'application/octet-stream';

  const res = await fetch(`${DOMAIN}/api/v1/extension/${CHANNEL}/${rel}`, {
    method: 'POST',
    headers: { 'x-deploy-token': TOKEN, 'Content-Type': contentType },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${rel} → ${res.status} ${text}`);
  }
  console.log(`  ✓ ${rel} (${body.length} bytes)`);
}

(async () => {
  if (has('build')) {
    console.log('Building host bundle…');
    execSync('npm run build:host', { stdio: 'inherit' });
  }

  try {
    await stat(DIST);
  } catch {
    console.error(`Build output not found at "${DIST}". Run with --build or build first.`);
    process.exit(1);
  }

  const files = await walk(DIST);
  console.log(`Uploading ${files.length} files to ${DOMAIN}/api/v1/extension/${CHANNEL}/ …`);

  let failed = 0;
  for (const file of files) {
    try {
      await upload(file);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${err.message}`);
    }
  }

  console.log(failed ? `Done with ${failed} failure(s).` : 'Done.');
  process.exitCode = failed ? 1 : 0;
})();
