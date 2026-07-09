# Yena Candidate Clipper — extension source

Everything the extension is, in plain JS. `npm run build` (repo root) turns this
folder into `dist/` (load that in Chrome) + `yena-clipper.zip`.

| File | What it is |
|------|-----------|
| `contentScript.js` | The whole thing: injects the Shadow-DOM panel into LinkedIn, reads the profile text, calls the Yena API, renders the candidate. |
| `manifest.json` | MV3 manifest. Permissions: `storage` only. Content script on `*.linkedin.com`. |
| `popup.html` / `popup.js` | Toolbar popup — shows the version. The token is set inside the panel. |
| `icons/` | Extension icons. |

## How it works

1. **Read** — on a LinkedIn profile, the content script pulls the page **text**
   per section (matched by heading text, not CSS class) plus the avatar URL.
2. **Parse** — it `POST`s the text to `/api/v1/integrations/parse-linkedin-text`;
   Yena's AI returns a structured profile. Content-script `fetch()` isn't bound by
   LinkedIn's CSP, so no CSP stripping and no iframe are needed.
3. **Render** — the profile shows in a Shadow-DOM panel (style-isolated from
   LinkedIn). Add/Update posts to `/linkedin/profiles`.

The token embeds the backend domain (`yena_sk_<random>_<domain>`), so the right
Yena instance is targeted automatically. Token is stored in `chrome.storage.local`.

## Load it

`npm run build` in the repo root, then `chrome://extensions` → Developer mode →
**Load unpacked** → select `../dist/`. After changes: rebuild, hit the reload icon
on the card, then refresh the LinkedIn tab.
