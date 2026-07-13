// Background service worker — makes the Yena API calls on behalf of the content
// script. In Manifest V3 a content script's cross-origin fetch is subject to the
// page's CORS policy, but a service-worker fetch to a host in host_permissions is
// not. So the panel (content script) forwards every request here.

// Mirrors manifest.json host_permissions, which are deliberately narrow (*.yena.ai,
// plus localhost in a dev build) to avoid Chrome Web Store's broad-permission review.
// A token pointing anywhere else can't be fetched, so say so plainly instead of
// failing with an opaque network error.
//
// The localhost rule is read off the manifest rather than hard-coded: `npm run build`
// strips the dev hosts for the store, `npm run build:dev` keeps them, and this stays
// in sync with whichever build is running.
var DEV_HOSTS = (chrome.runtime.getManifest().host_permissions || [])
  .some(function (h) { return h.indexOf('localhost') !== -1; });

function allowedHost(url) {
  try {
    var u = new URL(url);
    if (u.protocol === 'https:' && /(^|\.)yena\.ai$/i.test(u.hostname)) return true;
    if (DEV_HOSTS && u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) return true;
    return false;
  } catch (e) { return false; }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.__yenaApi) return;

  if (!allowedHost(msg.url)) {
    var host = '';
    try { host = new URL(msg.url).host; } catch (e) { host = msg.url; }
    sendResponse({ ok: false, status: 0, data: null, error: 'Backend not allowed: ' + host, blockedHost: host });
    return; // responded synchronously
  }

  fetch(msg.url, {
    method: msg.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-api-key': msg.token || '' },
    body: msg.body || undefined,
  })
    .then(async function (res) {
      var data = null;
      try { data = await res.json(); } catch (e) {}
      sendResponse({ ok: res.ok, status: res.status, data: data });
    })
    .catch(function (e) {
      sendResponse({ ok: false, status: 0, data: null, error: String(e) });
    });
  return true; // keep the message channel open for the async sendResponse
});
