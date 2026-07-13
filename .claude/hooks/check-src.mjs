// PostToolUse hook — the only automated safety net this repo has.
//
// No linter, no type-checker, no tests: a syntax error in src/ ships silently and only
// surfaces as a dead panel in Chrome. So after every edit to src/:
//   *.js   -> `node --check` (parse only, no execution)
//   *.json -> JSON.parse
// and for manifest.json, verify host_permissions still mirror background.js:allowedHost.
// Exit 2 = report the problem back to Claude so it fixes it before moving on.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, isAbsolute, join } from 'node:path';

const input = await new Promise((resolve) => {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => resolve(raw));
});

let payload;
try { payload = JSON.parse(input || '{}'); } catch { process.exit(0); }

const file = payload?.tool_input?.file_path;
if (!file) process.exit(0);

const root = payload.cwd || process.cwd();
const rel = isAbsolute(file) ? relative(root, file) : file;
if (!rel.startsWith('src/')) process.exit(0);

const abs = isAbsolute(file) ? file : join(root, file);
const problems = [];

if (rel.endsWith('.js')) {
  try {
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`Syntax error in ${rel}:\n${String(e.stderr || e.message).trim()}`);
  }
}

if (rel.endsWith('.json')) {
  try {
    JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    problems.push(`${rel} is not valid JSON: ${e.message}`);
  }
}

// manifest.json host_permissions and background.js allowedHost() must agree — a mismatch
// means the service worker either blocks a host Chrome allows, or tries one it can't reach.
if (rel === 'src/manifest.json' || rel === 'src/background.js') {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
    const bg = readFileSync(join(root, 'src/background.js'), 'utf8');
    const hosts = (manifest.host_permissions || [])
      .map((h) => h.replace(/^https?:\/\//, '').replace(/^\*\./, '').replace(/\/\*$/, ''))
      .filter(Boolean);
    const missing = hosts.filter((h) => !bg.includes(h.replace(/\./g, '\\.')) && !bg.includes(h));
    if (missing.length) {
      problems.push(
        `manifest.json host_permissions include ${missing.join(', ')} but background.js:allowedHost() ` +
          `does not appear to match them. Keep the two in sync — see CLAUDE.md.`
      );
    }
  } catch {
    // one of the files is mid-edit or unreadable; the JSON check above already reported it
  }
}

if (problems.length) {
  console.error(problems.join('\n\n'));
  process.exit(2);
}
