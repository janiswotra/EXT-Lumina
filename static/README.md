# Yena — Static Injector

This is the **static** half of the two-part extension architecture (mirrors the
reference `extentionHTMLImport` + `extentionHTML` split):

| Part | What it is | Changes often? | Published? |
|------|-----------|----------------|------------|
| `static/` (this folder) | Tiny MV3 extension: config popup + content script + injector. Pure JS, **no build**. | Rarely | Yes — load/publish this |
| the app (repo root) | The React/Vite UI. Built and **hosted on the server**, not packaged. | Often | No — uploaded via `scripts/deploy.mjs` |

## Flow

1. **Configure** — open the extension popup, enter the **domain** (the Yena host)
   and **token**. Saved to `chrome.storage.local` (`yena_inj_domain`, `yena_inj_token`).
2. **Inject** — on LinkedIn, `contentScript.js` reads the domain and injects
   `injector.js` into the page (channel is hardcoded to `main`).
3. **Load** — `injector.js` fetches the hosted build and injects it:
   - `GET <domain>/api/v1/extension/main/index.html`
   - `GET <domain>/api/v1/extension/main/<asset>`
4. **Deploy** — `node scripts/deploy.mjs --domain <domain> --token <DEPLOY_TOKEN> --build`
   builds the app and `POST`s every file to `/api/v1/extension/main/<path>`.

The server endpoints live in `yena-ats/server.js` (`POST`/`GET /api/v1/extension/:branch/<path>`).
The upload token here is the **deploy token** (`EXTENSION_DEPLOY_TOKEN` on the server);
`GET` is public so the injector needs only the domain.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → select this `static/` folder.

## Channel

The build channel is hardcoded as `main` in `contentScript.js` and `scripts/deploy.mjs`.
Change it in those two spots if you need a separate channel.

## ⚠️ LinkedIn CSP / MV3 caveat

`injector.js` fetches and inlines remote scripts/styles into the page. On sites
with a strict Content-Security-Policy (LinkedIn sets one) the page can block the
cross-origin `fetch` (`connect-src`) and the injected inline scripts (`script-src`),
and Chrome Web Store policy forbids remote code in MV3.

This scaffold works as-is on permissive targets and unpacked/internal use. For a
robust LinkedIn build the recommended path is:

- Render the hosted UI inside an **`<iframe>`** whose `src` points directly at
  `<domain>/api/v1/extension/main/index.html` (the iframe document uses the Yena
  domain's own CSP, so its scripts run), and
- keep a **thin content script** for reading LinkedIn DOM, bridging data to the
  iframe via `postMessage`.

The token bridge in `contentScript.js` (`postMessage` `GET_TOKEN` → `TOKEN`) is
already set up for that hand-off.
