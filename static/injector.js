// Yena injector — page-world script (web_accessible_resource).
// Loads the hosted build (index.html + assets) from the configured domain and
// injects it into the current page. The domain + channel come from the script
// element's data-* attributes set by contentScript.js.
//
// Endpoints (served by yena-ats server.js):
//   GET <domain>/api/v1/extension/<channel>/index.html
//   GET <domain>/api/v1/extension/<channel>/<asset>
//
// NOTE: on sites with a strict Content-Security-Policy (e.g. LinkedIn), the page
// may block inline scripts / cross-origin fetches injected this way. For those
// targets the robust path is an <iframe> served from <domain> (own CSP) plus a
// thin content-script bridge for DOM access. See static/README.md.

(async () => {
  const me = document.currentScript;
  const domain = me?.dataset?.domain;
  const channel = me?.dataset?.channel || 'main';
  if (!domain) {
    console.warn('[Yena] injector: no domain provided');
    return;
  }

  const CONTAINER_ID = 'yena-injected-root';
  if (document.getElementById(CONTAINER_ID)) return; // already injected

  const base = `${domain}/api/v1/extension/${channel}`;
  const resolveAsset = (ref) =>
    /^https?:\/\//.test(ref) ? ref : `${base}/${String(ref).replace(/^\.?\//, '')}`;

  try {
    const indexHtml = await (await fetch(`${base}/index.html`, { cache: 'no-cache' })).text();
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');

    // Mount the app's body markup.
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.innerHTML = doc.body.innerHTML;
    document.body.appendChild(container);

    // Inline the referenced stylesheets.
    for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
      const css = await (await fetch(resolveAsset(link.getAttribute('href')))).text();
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    // Inline the referenced scripts, in document order.
    for (const tag of doc.querySelectorAll('script[src]')) {
      const code = await (await fetch(resolveAsset(tag.getAttribute('src')))).text();
      const script = document.createElement('script');
      if (tag.type) script.type = tag.type;
      script.textContent = code;
      document.body.appendChild(script);
    }

    console.log('[Yena] injected hosted UI from', base);
  } catch (err) {
    console.error('[Yena] injector failed:', err);
  }
})();
