// Popup: show the version and let a developer point the extension at a local
// backend. The content script derives the backend domain from the token by
// default; a value here (stored as yena_inj_domain) overrides it — and a
// localhost/127.0.0.1 value always wins, for local testing.

document.getElementById('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;

var input = document.getElementById('domain');
var hint = document.getElementById('hint');
var DEFAULT_HINT = hint.innerHTML;

chrome.storage.local.get(['yena_inj_domain'], function (r) { input.value = r.yena_inj_domain || ''; });

function saveDomain() {
  var v = input.value.trim().replace(/\/+$/, '');
  if (v) chrome.storage.local.set({ yena_inj_domain: v }, flash);
  else chrome.storage.local.remove('yena_inj_domain', flash);
}
function flash() {
  hint.innerHTML = '<span class="saved">Saved — reopen the panel on LinkedIn.</span>';
  setTimeout(function () { hint.innerHTML = DEFAULT_HINT; }, 2000);
}

input.addEventListener('change', saveDomain);
input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { saveDomain(); input.blur(); } });
