// Yena injector — config popup.
// Stores the domain + token that the content script / injector use to load the
// hosted UI. Keeps the `yena_` storage prefix used by the rest of the project.

const KEYS = { domain: 'yena_inj_domain', token: 'yena_inj_token' };

const $ = (id) => document.getElementById(id);

const setStatus = (msg, kind = '') => {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${kind}`;
};

const normalizeDomain = (value) => String(value || '').trim().replace(/\/+$/, '');

const load = () => {
  chrome.storage.local.get([KEYS.domain, KEYS.token], (res) => {
    $('domain').value = res[KEYS.domain] || '';
    $('token').value = res[KEYS.token] || '';
    if (res[KEYS.domain]) setStatus('Configured', 'ok');
  });
};

$('save').addEventListener('click', () => {
  const domain = normalizeDomain($('domain').value);
  const token = $('token').value.trim();

  if (!/^https?:\/\/.+/.test(domain)) {
    setStatus('Enter a valid domain (https://…)', 'err');
    return;
  }

  chrome.storage.local.set({ [KEYS.domain]: domain, [KEYS.token]: token }, async () => {
    setStatus('Saved · checking…');
    try {
      const res = await fetch(`${domain}/api/v1/health`, { method: 'GET' });
      setStatus(res.ok ? 'Saved · connected' : `Saved · server responded ${res.status}`, res.ok ? 'ok' : 'err');
    } catch {
      setStatus('Saved · could not reach domain', 'err');
    }
  });
});

load();
