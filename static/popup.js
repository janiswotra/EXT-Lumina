// Show the extension version. The domain is baked into the content script and
// the access token is set in the in-page panel, so the popup is info-only.
document.getElementById('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
