# Yena — Static Injector

The **static** half of the two-part extension. Tiny MV3 extension, pure JS, no
build. Load/publish this folder.

| Part | What it is |
|------|-----------|
| `static/` (this folder) | The extension: config popup + content script + CSP rules. |
| `app/` | The UI (plain HTML/JS/CSS), hosted on the Yena server, loaded in an iframe. |

## How it works (iframe — works under LinkedIn CSP)

1. **Configure** — open the extension popup, set the **domain** + **token**
   (saved to `chrome.storage.local`: `yena_inj_domain`, `yena_inj_token`).
2. **Inject** — on LinkedIn, `contentScript.js` draws the ✦ toggle and creates an
   `<iframe src="<domain>/api/v1/extension/main/index.html">`.
3. **Run** — the iframe document is on the **Yena origin**, so its scripts run
   under Yena's CSP and its API calls are **same-origin** — LinkedIn's CSP/CORS
   do not block them. This is what makes it work on LinkedIn.
4. **Bridge** — `contentScript.js` reads the LinkedIn DOM (URL + profile section
   text) and the token, and posts them into the iframe (`postMessage`). The iframe
   app (`app/app.js`) calls the Yena API and renders the panel.

## CSP handling (`rules.json`, `declarativeNetRequest`)

- Rule 1 strips LinkedIn's `Content-Security-Policy` (main/sub frame) so the Yena
  iframe is allowed to load.
- Rule 2 strips `X-Frame-Options` / `CSP` on `/api/v1/extension/` responses so the
  Yena page can be framed.

> Trade-off: stripping LinkedIn's CSP relaxes its protections while browsing
> LinkedIn. It is the simplest reliable way to embed the iframe; a more surgical
> CSP edit (only `frame-src`) could replace the blanket removal later.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → select this `static/`.
Then open the popup and set the domain + token.

## Hosting the UI

Host the `../app/` files at `<domain>/api/v1/extension/main/` (yena-ats `server.js`
serves `GET /api/v1/extension/:branch/<path>`). The Yena server must allow that
endpoint to be framed (rules.json strips XFO/CSP on it as a safety net).
