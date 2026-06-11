// Yena injector — content script (runs on LinkedIn, isolated world).
// Reads the configured domain from storage and injects injector.js into the
// page, passing the domain + channel. Also bridges the token to the page on
// request so it never has to sit in the DOM.

const CHANNEL = 'main'; // hosted build channel — matches scripts/deploy.mjs
const KEYS = { domain: 'yena_inj_domain', token: 'yena_inj_token' };

chrome.storage.local.get([KEYS.domain], (res) => {
  const domain = res[KEYS.domain];
  if (!domain) {
    console.log('[Yena] No domain configured — open the extension popup to set it.');
    return;
  }
  injectApp(domain);
});

function injectApp(domain) {
  if (document.getElementById('yena-injector-script')) return;
  const script = document.createElement('script');
  script.id = 'yena-injector-script';
  script.src = chrome.runtime.getURL('injector.js');
  script.dataset.domain = domain;
  script.dataset.channel = CHANNEL;
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Token bridge: the injected page app can request the token without it being
// exposed as a DOM attribute.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'yena-app' || data.type !== 'GET_TOKEN') return;
  chrome.storage.local.get([KEYS.token], (res) => {
    window.postMessage({ source: 'yena-ext', type: 'TOKEN', token: res[KEYS.token] || null }, '*');
  });
});
