# Yena Candidate Clipper

A Chrome (MV3) extension that adds a one-click **"Add candidate to Yena"** panel to
LinkedIn profiles. It reads the profile page **text**, sends it to Yena's backend
where **AI structures it** into a clean candidate record, and shows that in a panel
injected into LinkedIn.

## Why this design

LinkedIn's markup is obfuscated and rotates constantly, so scraping fields by CSS
selector is fragile. Instead the extension is a thin pipe — think *"read the page
text → let Yena's AI parse it."* That's robust (text survives redesigns) and adds
**zero extra requests** to LinkedIn (same footprint as just browsing).

```
LinkedIn profile
   └─ content script (isolated world):
        1. read the page TEXT by section + the avatar URL
        2. POST /api/v1/integrations/parse-linkedin-text   (fetch, direct)
        3. AI returns a structured profile
        4. render it in a Shadow-DOM panel (no iframe)
        5. Add/Update → POST /api/v1/integrations/linkedin/profiles
```

- **No iframe.** The UI is a Shadow DOM injected by the content script — style- and
  CSP-isolated. Content-script `fetch()` is not subject to the page's CSP, so the
  API is called directly. Nothing about LinkedIn's CSP is modified.
- **No hosting.** There is nothing to deploy to a server; the extension is
  self-contained.
- **Token-scoped backend.** The access token embeds the Yena domain
  (`yena_sk_<random>_<domain>`), so the extension targets the right backend
  automatically.

## Repository layout

| Path | What it is |
|------|-----------|
| [`src/`](src/) | **The extension source.** `contentScript.js` (panel + logic), `popup.html/js`, `manifest.json`, icons. Edit this. |
| `dist/` | **The built extension** — output of `npm run build`. Load THIS in Chrome. Gitignored. |
| `yena-clipper.zip` | Web Store package, produced by the same build (repo root). Gitignored. |

Plain JS, no framework. The build ([`build.mjs`](build.mjs)) just copies `src/` to
`dist/` (minus dev files), stamps the version from `package.json` into the
manifest, and zips it. Don't edit `dist/` — the next build regenerates it.

## Getting started

```bash
# Build (src/ -> dist/ + yena-clipper.zip)
npm run build

# Load into Chrome
#   chrome://extensions -> Developer mode -> Load unpacked -> select ./dist
#   after each rebuild, hit the reload icon on the extension card, then F5 LinkedIn

# Publish: upload yena-clipper.zip (repo root) to the Chrome Web Store
```

Open the panel (✦ button on a LinkedIn profile), paste your Yena access token once
(stored in `chrome.storage.local`), and it's ready.

## Backend contract (yena-ats)

The extension calls these token-authed routes (`x-api-key: <token>`) under
`https://<domain>/api/v1/integrations`:

| Route | Purpose |
|-------|---------|
| `POST /parse-linkedin-text` | Text sections → AI → structured profile (preview) |
| `GET /extension/me` | Workspace/identity for the token |
| `GET /linkedin/profiles/status?sourceUrl=` | Is this profile already in Yena |
| `GET /extension/jobs` · `/extension/stages` · `/extension/lists` | Assignment options |
| `POST /linkedin/profiles` | Add/update the candidate |

Requirements: Node.js >= 18 (build only, no dependencies) and Chrome/Chromium.
