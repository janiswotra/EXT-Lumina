// Background service worker — makes the Yena API calls on behalf of the content
// script. In Manifest V3 a content script's cross-origin fetch is subject to the
// page's CORS policy, but a service-worker fetch to a host in host_permissions is
// not. So the panel (content script) forwards every request here.

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.__yenaApi) return;
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
