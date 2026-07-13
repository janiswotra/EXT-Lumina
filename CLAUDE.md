# Yena Candidate Clipper — working notes for Claude

Chrome **Manifest V3** extension that adds an "Add candidate to Yena" panel to LinkedIn
profiles. Plain vanilla JS, **zero npm dependencies**, no framework, no bundler, no
TypeScript, no test suite. ~760 lines total. Keep it that way.

## Non-negotiables

- **Edit `src/`, never `dist/` or `yena-clipper.zip`.** Both are build output and are
  regenerated (and gitignored) by `npm run build`. A hook blocks writes to them.
- **The version lives in `package.json`.** `build.mjs` stamps it into
  `dist/manifest.json`. Editing the `version` in `src/manifest.json` does nothing — bump
  `package.json`, and keep `src/manifest.json` in sync only to avoid the build warning.
- **No dependencies.** `build.mjs` uses Node built-ins + the system `zip`. If a change
  seems to need a package, it almost certainly doesn't — say so before adding one.
- **ES5-flavoured JS in `src/`.** `var`, `function`, no modules, no optional chaining.
  It runs as a classic content script; match the surrounding style exactly.
- **Host permissions stay narrow** (`*.yena.ai`, `localhost`, `127.0.0.1`). Broad host
  permissions trigger Chrome Web Store review. `background.js:allowedHost()` must mirror
  `manifest.json:host_permissions` — change one, change the other.

## Architecture (what the code actually does)

```
LinkedIn profile page
  └─ contentScript.js  (isolated world, Shadow-DOM panel — no iframe, no CSP stripping)
       1. read the page TEXT by section heading + the avatar URL  (never by CSS class —
          LinkedIn's classes are obfuscated and rotate; text survives redesigns)
       2. chrome.runtime.sendMessage({__yenaApi, url, method, body, token})
            └─ background.js  service worker  ──fetch──▶  Yena backend
       3. AI returns a structured profile → render in the panel
       4. Add/Update → POST /linkedin/profiles
```

**All API calls go through the background service worker**, not straight from the content
script. In MV3 a content-script `fetch()` is bound by the *page's* CORS policy; a
service-worker `fetch()` to a host in `host_permissions` is not. `README.md` and
`src/README.md` still describe the older "content script fetches directly" design — the
code in `background.js` is the truth. Fix the docs when you touch them.

The access token is `yena_sk_<random>_<domain>` — the backend domain is **derived from
the token** (`resolveDomain()` in `contentScript.js`), with a `localhost` override in
`chrome.storage.local` winning for local backend testing. Token lives in
`chrome.storage.local`, never in the repo.

## Backend contract (yena-ats)

Token-authed via `x-api-key`, under `https://<domain>/api/v1/integrations`:

| Route | Purpose |
|-------|---------|
| `POST /parse-linkedin-text` | page text → AI → structured profile (preview) |
| `GET /extension/me` | workspace/identity for the token |
| `GET /linkedin/profiles/status?sourceUrl=` | already in Yena? |
| `GET /extension/jobs` · `/extension/stages` · `/extension/lists` | assignment options |
| `POST /linkedin/profiles` | add/update the candidate |

## Build & verify

```bash
npm run build     # src/ -> dist/ + yena-clipper.zip
```

There is no test suite and no linter. Verification is manual and it matters — a syntax
error or a bad selector only shows up in the browser:

1. `npm run build`
2. `chrome://extensions` → Developer mode → **Load unpacked** → `./dist`
   (already loaded: hit the reload icon on the card)
3. Reload a LinkedIn profile tab, open the ✦ panel, exercise the changed path.

Never report a `src/` change as working on the strength of "it builds" — the build is a
file copy and proves nothing. Say plainly what was and wasn't verified in the browser.

## Reactivity

The panel is hand-rolled state + re-render (`S` object → `render()` in
`contentScript.js`). After any mutation (add/update candidate, stage change), re-render
the affected view from the server response — don't leave the panel showing pre-mutation
state, and don't require reopening the panel to see the truth.
