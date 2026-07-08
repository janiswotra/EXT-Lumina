// Yena content script (runs on LinkedIn, isolated world).
//
// Injects the Yena UI as an <iframe> served from the configured Yena domain.
// Because the iframe document is on the Yena origin, its scripts run under
// Yena's CSP and its API calls are SAME-ORIGIN — LinkedIn's CSP/CORS do not
// block them. (rules.json strips LinkedIn's CSP so the iframe is allowed, and
// strips X-Frame-Options on the Yena endpoint so it can be framed.)
//
// This script only: draws the ✦ toggle, creates the iframe, and bridges the
// LinkedIn page data (URL + profile section text) and the token into the iframe.

const KEYS = { domain: 'yena_inj_domain', token: 'yena_inj_token' };

// True only while this content script's extension context is still alive.
// After the extension is reloaded/updated, an already-injected old script keeps
// running; guarding on this avoids "Extension context invalidated" errors and
// the chrome-extension://invalid/ requests that stale getURL calls produce.
function contextValid() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

// The Yena host the UI is loaded from. The API token embeds the backend it
// belongs to (yena_sk_<random>_<domain>), so the domain is derived straight from
// the stored token. Until a token exists we bootstrap on the default host; a
// legacy stored override is honored only when there is no token.
const DEFAULT_DOMAIN = 'https://demo.yena.ai';

// Pull the domain suffix out of a token: yena_sk_<random>_<domain>.
function domainFromToken(token) {
  const seg = (token || '').trim().split('_').pop();
  return seg && seg.indexOf('.') > 0 ? seg : '';
}

function resolveDomain(token, override) {
  const td = domainFromToken(token);
  if (td) return 'https://' + td;                 // token is the source of truth
  if (override) return override.replace(/\/+$/, '');
  return DEFAULT_DOMAIN;
}

chrome.storage.local.get([KEYS.domain, KEYS.token], (res) => {
  init(resolveDomain(res[KEYS.token], res[KEYS.domain]));
});

function init(domain) {
  if (document.getElementById('yena-fab')) return;

  const FRAME_PATH = '/api/v1/extension/main/index.html';
  let currentDomain = domain.replace(/\/+$/, '');
  let frameOrigin = new URL(currentDomain).origin;

  // ✦ toggle button (lives in the LinkedIn page; styled inline).
  const fab = document.createElement('button');
  fab.id = 'yena-fab';
  fab.title = 'Add to Yena';
  fab.innerHTML = '<img src="' + chrome.runtime.getURL('icons/icon-128.png') + '" alt="Yena" style="width:40px;height:40px;border-radius:12px;display:block;" />';
  fab.style.cssText = [
    'position:fixed', 'right:14px', 'top:50%', 'transform:translateY(-50%)',
    'width:40px', 'height:40px', 'border:0', 'border-radius:12px', 'background:transparent',
    'cursor:pointer', 'z-index:2147483646', 'box-shadow:0 2px 12px rgba(0,0,0,.18)', 'padding:0',
  ].join(';');
  document.body.appendChild(fab);

  // Panel iframe (hidden until toggled).
  const frame = document.createElement('iframe');
  frame.id = 'yena-frame';
  frame.src = currentDomain + FRAME_PATH;
  frame.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'width:min(440px,96vw)', 'height:100%',
    'border:0', 'z-index:2147483647', 'display:none', 'background:#fff',
    'box-shadow:-8px 0 30px rgba(0,0,0,.12)', 'color-scheme:normal',
  ].join(';');
  document.body.appendChild(frame);

  // Point the iframe at a different Yena backend — used when a freshly entered
  // token's embedded domain differs from the one we bootstrapped on. Reloading
  // the frame re-runs its handshake, so the token + page data are re-sent there
  // same-origin. Returns true if a switch actually happened.
  function setDomain(newDomain) {
    newDomain = (newDomain || '').replace(/\/+$/, '');
    if (!newDomain || newDomain === currentDomain) return false;
    currentDomain = newDomain;
    frameOrigin = new URL(newDomain).origin;
    lastInitUrl = '';
    frame.src = currentDomain + FRAME_PATH;
    return true;
  }

  // Only (re)load data on first open and on profile navigation — toggling the
  // panel just shows/hides it, so its state and scroll position are preserved.
  let lastInitUrl = '';
  fab.addEventListener('click', () => {
    const show = frame.style.display === 'none';
    frame.style.display = show ? 'block' : 'none';
    fab.style.display = show ? 'none' : '';
    if (show && location.href !== lastInitUrl) postInit();
  });

  // Send the LinkedIn page data + token into the iframe.
  function sendInit() {
    if (!frame.contentWindow || !contextValid()) return;
    try {
      chrome.storage.local.get([KEYS.token], (res) => {
        if (!frame.contentWindow) return;
        frame.contentWindow.postMessage({
          source: 'yena-host',
          type: 'INIT',
          token: res[KEYS.token] || null,
          sourceUrl: location.href,
          profile: quickProfile(),
          sections: extractSections(),
        }, frameOrigin);
      });
    } catch (e) {
      /* extension context gone — ignore */
    }
  }

  // Opening a profile from the feed is an SPA navigation, so the profile DOM can
  // lag behind the URL change. Wait until the name is parseable before sending,
  // so the panel never shows empty data. Aborts if the user navigates away.
  function postInit() {
    lastInitUrl = location.href;
    const onProfile = () => /\/in\/|\/sales\/(lead|people)\/|\/talent\/profile\//.test(location.href);
    let tries = 0;
    const trySend = () => {
      if (!contextValid() || location.href !== lastInitUrl) return;
      if (!onProfile() || quickProfile().firstName || tries++ >= 12) sendInit();
      else setTimeout(trySend, 400);
    };
    trySend();
  }

  // Send a token update back to the iframe app.
  function postTokenSet(token) {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ source: 'yena-host', type: 'TOKEN_SET', token: token || null }, frameOrigin);
    }
  }

  // Messages from the iframe app.
  window.addEventListener('message', (e) => {
    if (e.origin !== frameOrigin || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.source !== 'yena-frame' || !contextValid()) return;
    try {
      if (d.type === 'READY' || d.type === 'REFRESH') postInit();
      else if (d.type === 'CLOSE') { frame.style.display = 'none'; fab.style.display = ''; }
      else if (d.type === 'SET_TOKEN') {
        const token = (d.token || '').trim();
        chrome.storage.local.set({ [KEYS.token]: token }, () => {
          const td = domainFromToken(token);
          // If the token points at a different backend, reload the frame there
          // (its API calls must be same-origin); otherwise just hand it the token.
          if (!(td && setDomain('https://' + td))) postTokenSet(token);
        });
      } else if (d.type === 'CLEAR_TOKEN') {
        chrome.storage.local.remove(KEYS.token, () => postTokenSet(null));
      }
    } catch (err) {
      /* extension context gone */
    }
  });

  // Re-push data when LinkedIn SPA-navigates while the panel is open.
  // Also self-cleans if the extension was reloaded (stale context).
  let lastUrl = location.href;
  const poll = setInterval(() => {
    if (!contextValid()) {
      clearInterval(poll);
      fab.remove();
      frame.remove();
      return;
    }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (frame.style.display !== 'none') postInit();
    }
  }, 1500);
}

// ---- LinkedIn DOM parser (isolated world, full DOM access) — INSTANT -----
// Reads the loaded profile page directly, so full data shows without waiting
// for the backend AI parse. AI is only used as a fallback when this is weak.
function txt(sel) { const el = document.querySelector(sel); return el ? el.innerText.trim() : ''; }

// LinkedIn renders visible text in <span aria-hidden="true">; prefer it to skip
// the duplicated screen-reader text.
function vis(el) {
  if (!el) return '';
  const s = el.querySelector('span[aria-hidden="true"]');
  return ((s ? s.textContent : el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function sectionByAnchor(id) {
  const a = document.getElementById(id);
  return a ? a.closest('section') : null;
}
function topItems(sec) {
  if (!sec) return [];
  const ul = sec.querySelector('ul');
  return ul ? Array.prototype.filter.call(ul.children, (n) => n.tagName === 'LI') : [];
}
function entityLines(li) {
  return {
    bold: vis(li.querySelector('.t-bold')),
    normals: Array.prototype.map.call(li.querySelectorAll('span.t-14.t-normal:not(.t-black--light)'), vis).filter(Boolean),
    lights: Array.prototype.map.call(li.querySelectorAll('span.t-14.t-normal.t-black--light, .pvs-entity__caption-wrapper'), vis).filter(Boolean),
  };
}
function parseExperiences() {
  const out = [];
  topItems(sectionByAnchor('experience')).forEach((li) => {
    const L = entityLines(li);
    if (!L.bold) return;
    const company = (L.normals[0] || '').split(' · ')[0].trim();
    const dates = (L.lights[0] || '').split(' · ')[0].trim();
    const m = dates.split(/\s*[-–—]\s*/);
    out.push({ title: L.bold, company, startDate: (m[0] || '').trim(), endDate: (m[1] || '').trim(), location: L.lights[1] || '', description: '' });
  });
  return out;
}
function parseEducation() {
  const out = [];
  topItems(sectionByAnchor('education')).forEach((li) => {
    const L = entityLines(li);
    if (!L.bold) return;
    const deg = L.normals[0] || '';
    out.push({ school: L.bold, degree: deg, field: '', endDate: '' });
  });
  return out;
}
function parseSimpleList(id) {
  const out = [];
  topItems(sectionByAnchor(id)).forEach((li) => { const b = vis(li.querySelector('.t-bold')); if (b) out.push(b); });
  return out;
}
function parseAbout() {
  const sec = sectionByAnchor('about');
  if (!sec) return '';
  const el = sec.querySelector('.inline-show-more-text span[aria-hidden="true"], .display-flex.full-width span[aria-hidden="true"]');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function quickProfile() {
  const full = txt('main h1') || txt('h1');
  const parts = full.split(/\s+/);
  const img = document.querySelector('main img.pv-top-card-profile-picture__image, main img.pv-top-card__photo, main button img[width="200"], main img[width="200"]');
  const loc = txt('main .text-body-small.inline.t-black--light.break-words');
  const experiences = parseExperiences();
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    headline: txt('main .text-body-medium.break-words'),
    location: loc,
    connectionDegree: txt('main .dist-value') || txt('main span.dist-value'),
    currentCompany: experiences[0] ? experiences[0].company : '',
    about: parseAbout(),
    profilePictureUrl: img ? img.src : '',
    experiences,
    educations: parseEducation(),
    skills: parseSimpleList('skills'),
    languages: parseSimpleList('languages'),
    courses: [],
    linkedinUrl: window.location.href,
  };
}

function sectionByHeading(re) {
  const secs = document.querySelectorAll('main section');
  for (let i = 0; i < secs.length; i++) {
    const h = secs[i].querySelector('h2') ? secs[i].querySelector('h2').innerText : secs[i].innerText.slice(0, 40);
    if (re.test(h)) return secs[i].innerText.trim();
  }
  return '';
}

function extractSections() {
  const first = document.querySelector('main section');
  return {
    header: ((first && first.innerText) || (document.querySelector('main') || {}).innerText || '').slice(0, 4000),
    about: sectionByHeading(/about/i).slice(0, 3000),
    experience: sectionByHeading(/experience/i).slice(0, 5000),
    education: sectionByHeading(/education/i).slice(0, 2000),
  };
}
