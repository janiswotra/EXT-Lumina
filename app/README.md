# Yena injected UI — plain HTML/JS/CSS

The UI that the `../static` injector loads into LinkedIn **inside an iframe**
served from the Yena domain. **No build, no Node, no framework** — three files.

| File | What it is |
|------|-----------|
| `index.html` | Iframe document. Loads `ui.css` + `app.js`. |
| `app.js` | Plain JS panel. Gets token + LinkedIn page data from the content script (postMessage), calls the Yena API (same-origin), renders the panel. |
| `ui.css` | Plain CSS. The panel fills the iframe. |

## How it runs

The static extension injects `<iframe src="<this>/index.html">` into LinkedIn.
Because the iframe is on the **Yena origin**:

- scripts run under Yena's CSP (not LinkedIn's), and
- `fetch()` to `/api/v1/integrations/...` is **same-origin** → no CSP/CORS block.

`app.js` does not read the LinkedIn DOM (cross-origin). It receives the page URL
+ profile section text + token from the content script via `postMessage`
(`source: 'yena-host'`), and posts back `READY` / `CLOSE`.

## Flow

✦ icon (in the LinkedIn page, drawn by the content script) → panel opens →
check if already saved → pick vacancy + stage → Add to Yena → re-verified.

API base = `location.origin + '/api/v1/integrations'` (the Yena domain the iframe
is served from). Parsing is delegated to the backend (`POST /parse-linkedin-text`
with the section text); a minimal name/headline read (from the content script) is
the fallback until that route is live.

## Hosting (auto-host)

Upload these files to `<domain>/api/v1/extension/main/` with the bundled
deploy script (no build, no deps — just Node):

```bash
node deploy.mjs --token <DEPLOY_TOKEN>
# or: node deploy.mjs --domain https://demo.yena.ai --token <TOKEN> --channel main
# env fallbacks: YENA_DOMAIN, EXTENSION_DEPLOY_TOKEN
```

It uploads `index.html`, `app.js`, `ui.css` (skips itself + docs) to
`POST <domain>/api/v1/extension/<channel>/<path>` (yena-ats `server.js`).
Then set the domain + token in the extension popup. See `../static/README.md`.
