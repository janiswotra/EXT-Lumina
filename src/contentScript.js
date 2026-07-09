// Yena content script — runs on LinkedIn in the extension's isolated world.
//
// No iframe, no page hosting, no CSP stripping. The whole UI lives here in a
// Shadow DOM (style-isolated, immune to LinkedIn's CSS + CSP), and all API calls
// go straight to the Yena backend with fetch() — content-script requests are NOT
// governed by the page's CSP, so nothing needs to be relaxed.
//
// Data flow (robust against LinkedIn redesigns):
//   1. grab the profile page TEXT (by section heading) + the avatar URL
//   2. POST it to /parse-linkedin-text — Gemini parses it into a clean profile
//   3. render that profile in the panel; save posts to /linkedin/profiles
// Because the backend AI reads text, obfuscated/rotating CSS classes don't break
// it, and no extra requests to LinkedIn are made (same footprint as browsing).

(function () {
  'use strict';
  if (window.__yenaInjected) return;
  window.__yenaInjected = true;

  var KEYS = { domain: 'yena_inj_domain', token: 'yena_inj_token' };
  var DEFAULT_DOMAIN = 'https://demo.yena.ai';

  function contextValid() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  function domainFromToken(t) { var seg = (t || '').trim().split('_').pop(); return seg && seg.indexOf('.') > 0 ? seg : ''; }
  // Resolve the backend origin. Priority:
  //   1. a localhost/127.0.0.1 override (explicit DEV target — always wins)
  //   2. the domain baked into the token (yena_sk_<random>_<domain>)
  //   3. any other stored override
  //   4. the default host
  // The localhost rule lets you point the extension at http://localhost:3000 for
  // local backend testing without the production token's domain overriding it.
  function resolveDomain(token, override) {
    override = (override || '').replace(/\/+$/, '');
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(override)) return override;
    var td = domainFromToken(token);
    if (td) return 'https://' + td;
    if (override) return override;
    return DEFAULT_DOMAIN;
  }

  // ---------------------------------------------------------------- state
  var DOMAIN = DEFAULT_DOMAIN;
  var API_BASE = DOMAIN + '/api/v1/integrations';
  var token = null;
  var overrideDomain = '';
  var me = null;

  function applyDomain() { DOMAIN = resolveDomain(token, overrideDomain); API_BASE = DOMAIN + '/api/v1/integrations'; }
  var sourceUrl = '';
  var loadedUrl = '';       // the profile the panel currently holds
  var ctxSections = {};

  var S = {
    open: false,
    view: 'loading',        // loading | auth | notProfile | profile
    profile: {},
    exists: false, assignment: null,
    jobs: [], stages: [],
    selJob: null, selStage: null,
    picker: '', search: '',
    // Everything that will be imported is shown expanded by default — the panel
    // is a review of exactly what lands in Yena, not a teaser.
    expanded: { exp: true, edu: true, skills: true, langs: true, certs: true, courses: true, orgs: true, recs: true },
    saving: false, success: false, message: '', kind: '', loadingMsg: 'Loading…',
  };

  // --------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isProfileUrl(u) { return u.indexOf('/in/') > -1 || u.indexOf('/sales/lead/') > -1 || u.indexOf('/sales/people/') > -1 || u.indexOf('/talent/profile/') > -1; }
  function txt(sel) { var e = document.querySelector(sel); return e ? e.innerText.trim() : ''; }
  function ensureArrays(p) {
    ['experiences', 'educations', 'skills', 'languages', 'certifications', 'courses', 'organizations', 'recommendations'].forEach(function (k) { if (!Array.isArray(p[k])) p[k] = []; });
    return p;
  }

  // ---- Page text extraction (the input for the AI parser) ----------------
  // Match sections by their <h2>/<h3> heading TEXT, not CSS class — text is what
  // survives LinkedIn redesigns. The backend drops any empty section.
  function sectionText(re) {
    var secs = document.querySelectorAll('main section');
    for (var i = 0; i < secs.length; i++) {
      var h = secs[i].querySelector('h2, h3');
      var head = h ? h.innerText : secs[i].innerText.slice(0, 40);
      if (re.test(head)) return secs[i].innerText.replace(/\n{3,}/g, '\n\n').trim();
    }
    return '';
  }
  function extractSections() {
    var first = document.querySelector('main section');
    var header = ((first && first.innerText) || (document.querySelector('main') || {}).innerText || '').slice(0, 4000);
    return {
      header: header,
      about: sectionText(/^about|summary/i).slice(0, 3000),
      experience: sectionText(/^experience/i).slice(0, 6000),
      education: sectionText(/^education/i).slice(0, 2500),
      certifications: sectionText(/licen|certificat/i).slice(0, 2000),
      skills: sectionText(/^skills/i).slice(0, 1500),
      languages: sectionText(/^languages/i).slice(0, 800),
      volunteering: sectionText(/volunteer/i).slice(0, 1500),
      recommendations: sectionText(/recommendation/i).slice(0, 3000),
      projects: sectionText(/^projects/i).slice(0, 2000),
      organizations: sectionText(/organization/i).slice(0, 1200),
      honors: sectionText(/honors|awards/i).slice(0, 1500),
      courses: sectionText(/^courses/i).slice(0, 1000),
    };
  }

  // ---- Avatar URL (the one field the text parse can't return) ------------
  function scrapeName() {
    var h1 = txt('main h1'); if (h1) return h1;
    var h2 = document.querySelector('main section h2');
    return h2 ? (h2.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function realPhoto(src) { return /^https?:\/\/[^ ]*licdn\.com/.test(src || ''); }
  // Find the avatar URL. `names` are candidate name strings (the AI-parsed first/
  // last name are cleaner than the raw <h2>, which can carry "| EMBA" suffixes).
  function scrapePhoto(names) {
    names = (names || []).filter(Boolean).map(function (n) { return String(n).toLowerCase(); });
    var old = document.querySelector('main img.pv-top-card-profile-picture__image, main img.pv-top-card__photo, main img[width="200"]');
    if (old && realPhoto(old.src)) return old.src;
    var imgs = document.querySelectorAll('main img');
    // 1) the avatar whose alt names this person: "View <name>'s profile"
    for (var i = 0; i < imgs.length; i++) {
      if (!realPhoto(imgs[i].src)) continue;
      var a = (imgs[i].alt || '').toLowerCase();
      if (/profile/.test(a) && names.some(function (n) { return n.length > 2 && a.indexOf(n) > -1; })) return imgs[i].src;
    }
    // 2) fallback: the hero photo (alt=""), identified by LinkedIn's URL marker,
    //    excluding the cover/background image which is also a licdn asset.
    var h2 = document.querySelector('main section h2');
    var scope = (h2 && h2.closest && h2.closest('section')) || document.querySelector('main') || document;
    var t = scope.querySelectorAll('img');
    for (var j = 0; j < t.length; j++) {
      if (realPhoto(t[j].src) && /displayphoto/i.test(t[j].src)) return t[j].src;
    }
    return '';
  }

  // Wait until the profile DOM is parseable (name present) before reading it —
  // opening a profile from the feed is an SPA navigation and the DOM lags.
  // Resolves false if the user navigated away while we waited.
  function waitForProfile() {
    return new Promise(function (resolve) {
      var tries = 0, url = location.href;
      (function tick() {
        if (!contextValid() || location.href !== url) return resolve(false);
        if (!isProfileUrl(url) || scrapeName() || tries++ >= 16) return resolve(true);
        setTimeout(tick, 300);
      })();
    });
  }

  // ------------------------------------------------------------------- api
  // Routed through the background service worker so cross-origin requests aren't
  // blocked by LinkedIn's CORS (a content-script fetch would be; see background.js).
  function api(path, options) {
    if (!token) return Promise.resolve({ ok: false, status: 401, data: null });
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({
          __yenaApi: true,
          url: API_BASE + path,
          method: (options && options.method) || 'GET',
          token: token,
          body: options && options.body,
        }, function (res) {
          if (chrome.runtime.lastError || !res) { resolve({ ok: false, status: 0, data: null, error: (chrome.runtime.lastError || {}).message || 'no response' }); return; }
          resolve(res);
        });
      } catch (e) { resolve({ ok: false, status: 0, data: null, error: String(e) }); }
    });
  }

  // ------------------------------------------------------------------ flow
  // The panel paints exactly twice: a spinner, then the finished profile. The AI
  // parse is the slow leg, so the status/jobs/stages/lists lookups ride alongside
  // it — resolving them after the profile rendered is what made the panel jump.
  async function run() {
    sourceUrl = location.href;
    loadedUrl = sourceUrl;
    if (!token) { S.view = 'auth'; render(); return; }
    S.view = 'loading'; S.loadingMsg = 'Connecting…'; S.message = ''; S.kind = ''; render();

    me = (await api('/extension/me')).data;
    if (location.href !== loadedUrl) return;
    if (!me) { S.view = 'auth'; S.message = 'Invalid or expired token.'; S.kind = 'error'; render(); return; }
    if (!isProfileUrl(sourceUrl)) { S.view = 'notProfile'; render(); return; }

    S.loadingMsg = 'Reading the profile…'; render();
    var ready = await waitForProfile();
    if (!ready || location.href !== loadedUrl) return;   // navigated away mid-wait

    var sections = extractSections();
    ctxSections = sections;
    S.selJob = S.selStage = null; S.assignment = null;
    S.loadingMsg = 'Yena AI is structuring the profile…'; render();

    var results = await Promise.all([
      api('/parse-linkedin-text', { method: 'POST', body: JSON.stringify({ sections: sections, profileUrl: sourceUrl }) }),
      checkStatus(), loadJobs(), loadStages(),
    ]);
    if (location.href !== loadedUrl) return;

    var pr = results[0];
    S.profile = ensureArrays((pr.ok && pr.data) ? pr.data : {});
    if (!S.profile.profilePictureUrl) S.profile.profilePictureUrl = scrapePhoto([S.profile.lastName, S.profile.firstName, scrapeName()]);
    if (!pr.ok) { S.message = (pr.data && pr.data.error) || 'Could not read this profile.'; S.kind = 'error'; }
    applyAssignment();
    S.view = 'profile';
    render();
  }

  async function checkStatus() {
    var r = await api('/linkedin/profiles/status?sourceUrl=' + encodeURIComponent(sourceUrl));
    S.exists = !!(r.ok && r.data && r.data.exists);
    if (r.ok && r.data && r.data.assignment) S.assignment = r.data.assignment;
    applyAssignment();
  }
  async function loadJobs() { var r = await api('/extension/jobs'); S.jobs = (r.ok && r.data && r.data.jobs) || []; applyAssignment(); }
  async function loadStages() { var r = await api('/extension/stages'); S.stages = (r.ok && r.data && r.data.stages) || []; applyAssignment(); }
  function applyAssignment() {
    if (!S.assignment) return;
    if (!S.selJob && S.assignment.jobId) S.selJob = S.jobs.find(function (j) { return String(j.id) === String(S.assignment.jobId); }) || null;
    if (!S.selStage && S.assignment.stageId) S.selStage = S.stages.find(function (s) { return String(s.id) === String(S.assignment.stageId); }) || null;
  }

  function toImport(p) {
    return {
      sourceUrl: p.linkedinUrl || sourceUrl, name: { firstName: p.firstName || '', lastName: p.lastName || '' },
      headline: p.headline || '', location: p.location || '', currentCompany: p.currentCompany || '',
      about: p.about || '', profilePictureUrl: p.profilePictureUrl || '', connectionDegree: p.connectionDegree || '',
      experience: p.experiences || [], education: p.educations || [], skills: p.skills || [],
      languages: p.languages || [], certifications: p.certifications || [], courses: p.courses || [],
      organizations: p.organizations || [], recommendations: p.recommendations || [],
    };
  }
  async function save() {
    S.saving = true; S.message = ''; render();
    var body = { profile: toImport(S.profile), sourceUrl: sourceUrl, sections: ctxSections };
    if (S.selJob) body.jobId = S.selJob.id;
    if (S.selStage) body.stageId = S.selStage.id;
    var r = await api('/linkedin/profiles', { method: 'POST', body: JSON.stringify(body) });
    S.saving = false;
    if (r.ok) { S.success = true; await checkStatus(); setTimeout(function () { S.success = false; render(); }, 2500); }
    else { S.message = (r.data && r.data.error) || 'Failed to save.'; S.kind = 'error'; }
    render();
  }

  function connect(t) {
    t = (t || '').trim(); if (!t) return;
    chrome.storage.local.set(makeSet(KEYS.token, t), function () {
      token = t;
      applyDomain();   // keeps a localhost dev override if one is set
      loadedUrl = ''; run();
    });
  }
  function logout() { chrome.storage.local.remove(KEYS.token, function () { token = null; me = null; S.view = 'auth'; S.profile = {}; render(); }); }
  function makeSet(k, v) { var o = {}; o[k] = v; return o; }

  // ================================================================ UI ===
  var hostEl, shadow, panel, fab;

  function mount() {
    hostEl = document.createElement('div');
    hostEl.id = 'yena-root';
    hostEl.style.cssText = 'all:initial';
    (document.body || document.documentElement).appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    fab = document.createElement('button');
    fab.className = 'y-fab';
    fab.title = 'Add to Yena';
    fab.innerHTML = MARK;
    fab.addEventListener('click', openPanel);
    shadow.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'y-panel';
    panel.style.display = 'none';
    shadow.appendChild(panel);

    // Click anywhere that isn't a selector or its dropdown -> close the dropdown.
    // Bound to the shadow root once, so it survives every re-render.
    shadow.addEventListener('click', function (e) {
      if (!S.picker) return;
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n && n.classList && n.classList.contains('y-sel-wrap')) return;
      }
      S.picker = ''; S.search = ''; render();
    });
  }

  function openPanel() {
    S.open = true;
    panel.style.display = 'flex';
    fab.style.display = 'none';
    if (location.href !== loadedUrl || !S.profile.firstName) run();
    else render();
  }
  function closePanel() { S.open = false; panel.style.display = 'none'; fab.style.display = ''; }

  function render() {
    // Still loading and the spinner is already up? Swap the message text only —
    // rebuilding the markup would restart the spin animation on every step.
    if (S.view === 'loading') {
      var msgEl = panel.querySelector('.y-load-msg');
      if (msgEl) { msgEl.textContent = S.loadingMsg; return; }
    }
    var body = panel.querySelector('.y-scroll');
    var top = body ? body.scrollTop : 0;
    var html;
    // Rendered inside the shell so the header stays put across load -> profile.
    if (S.view === 'loading') html = shell('<div class="y-center"><div class="y-spinner"></div><p class="y-muted y-load-msg">' + esc(S.loadingMsg) + '</p></div>');
    else if (S.view === 'auth') html = authHtml();
    else if (S.view === 'notProfile') html = shell('<div class="y-center y-empty"><p class="y-empty-title">Open a candidate profile</p><p class="y-muted">linkedin.com/in/…, Sales Navigator or Recruiter</p></div>');
    else html = shell(profileHtml(), footerHtml());
    panel.innerHTML = html;
    wire();
    var nb = panel.querySelector('.y-scroll');
    if (nb && top) nb.scrollTop = top;
  }

  function authHtml() {
    return '<div class="y-auth">' +
      '<div class="y-brand"><span class="y-logo">' + MARK + '</span><span class="y-brand-name">Yena</span></div>' +
      '<p class="y-auth-title">Connect to Yena</p><p class="y-muted y-auth-sub">Paste your Yena access token.</p>' +
      '<input data-el="token" type="password" placeholder="Access token…" class="y-input" />' +
      '<button data-act="connect" class="y-btn y-btn-blue">Connect</button>' +
      (S.message ? '<div class="y-err">' + esc(S.message) + '</div>' : '') + '</div>';
  }

  function header() {
    var ws = me && me.workspaceName ? '<span class="y-ws">' + esc(me.workspaceName) + '</span>' : '';
    var onProfile = S.view === 'profile';
    // The single source of status truth — this used to be duplicated above the avatar.
    var status = onProfile
      ? (S.exists ? '<div class="y-chip-status y-chip-green">' + ICON_CHECK + 'In Yena</div>'
                  : '<div class="y-chip-status y-chip-pink">' + ICON_STAR + 'Record Suggestion</div>')
      : '';
    return '<div class="y-header">' +
      '<div class="y-brand-row"><span class="y-logo y-logo-sm">' + MARK + '</span><span class="y-brand-name">Yena</span>' + ws + '</div>' +
      '<div class="y-header-actions">' + status +
        '<button data-act="logout" title="Disconnect" class="y-icon-btn y-icon-danger">' + ICON_LOGOUT + '</button>' +
        '<button data-act="close" class="y-icon-btn">' + ICON_X + '</button>' +
      '</div></div>';
  }
  function shell(body, footer) { return '<div class="y-shell">' + header() + '<div class="y-scroll">' + body + '</div>' + (footer || '') + '</div>'; }
  function initials() { return ((S.profile.firstName || '')[0] || '') + ((S.profile.lastName || '')[0] || ''); }

  function optionsFor(kind) {
    if (kind === 'job') return S.jobs.map(function (j) { return { id: j.id, label: j.title, sub: j.company }; });
    return S.stages.map(function (s) { return { id: s.id, label: s.name, color: s.color }; });
  }
  function selectedFor(kind) { return kind === 'job' ? S.selJob : S.selStage; }

  // A select2-style dropdown anchored under its selector: searchable, scrollable,
  // clearable. Closes on pick, on Escape, or on a click outside (see mount()).
  function dropdownHtml(kind) {
    var sel = selectedFor(kind);
    var ph = kind === 'job' ? 'Search jobs…' : 'Search stages…';
    var q = S.search.toLowerCase();
    var filtered = optionsFor(kind).filter(function (o) {
      return o.label.toLowerCase().indexOf(q) > -1 || (o.sub || '').toLowerCase().indexOf(q) > -1;
    });
    var list = filtered.length === 0
      ? '<div class="y-dd-empty">' + (optionsFor(kind).length ? 'No matches' : 'Nothing available') + '</div>'
      : filtered.map(function (o) {
          var on = sel && String(sel.id) === String(o.id);
          var dot = '<span class="y-dd-dot"' + (o.color ? ' style="background:' + esc(o.color) + '"' : '') + '></span>';
          return '<button data-pick="' + esc(o.id) + '" class="y-dd-item' + (on ? ' y-on' : '') + '">' + dot +
            '<span class="y-dd-body"><span class="y-dd-label">' + esc(o.label) + '</span>' + (o.sub ? '<span class="y-dd-sub">' + esc(o.sub) + '</span>' : '') + '</span>' +
            (on ? ICON_CHECK : '') + '</button>';
        }).join('');
    return '<div class="y-dd">' +
      '<div class="y-dd-search">' + ICON_SEARCH + '<input data-el="search" type="text" value="' + esc(S.search) + '" placeholder="' + ph + '" spellcheck="false" /></div>' +
      '<div class="y-dd-list">' + list + '</div>' +
      (sel ? '<button data-clear="' + kind + '" class="y-dd-clear">Clear selection</button>' : '') +
      '</div>';
  }

  function selectorBtn(kind, label, sel, primary) {
    var open = S.picker === kind;
    var val = sel ? (sel.title || sel.name) : null;
    var ph = kind === 'job' ? 'Select a job' : 'Select stage';
    return '<div class="y-sel-wrap">' +
      '<button data-picker="' + kind + '" class="y-selector ' + (primary ? 'y-selector-primary ' : '') + (open ? 'y-selector-open' : '') + '">' +
        '<span class="y-sel-dot ' + (primary ? 'y-sel-dot-orange' : '') + '"></span>' +
        '<span class="y-sel-body"><span class="y-sel-label">' + label + '</span><span class="y-sel-val ' + (val ? '' : 'y-sel-ph') + '">' + esc(val || ph) + '</span></span>' +
        '<span class="y-sel-chev' + (open ? ' y-open' : '') + '">' + ICON_CHEV_D + '</span>' +
      '</button>' + (open ? dropdownHtml(kind) : '') + '</div>';
  }
  function collapsible(key, title, count, inner) {
    if (!count) return '';
    var open = !!S.expanded[key];
    return '<div class="y-coll"><button data-toggle="' + key + '" class="y-coll-head"><span class="y-coll-title">' + title + ' <span class="y-count">' + count + '</span></span><span class="y-coll-chev ' + (open ? 'y-open' : '') + '">' + ICON_CHEV_D + '</span></button>' + (open ? '<div class="y-coll-body">' + inner() + '</div>' : '') + '</div>';
  }

  // One screen: exactly what will land in Yena, plus where it lands. No second
  // step — the panel is the review, and the footer button commits it.
  function profileHtml() {
    var p = S.profile;
    var avatar = '<div class="y-avatar">' + (p.profilePictureUrl ? '<img src="' + esc(p.profilePictureUrl) + '" alt="" />' : '<span>' + esc(initials()) + '</span>') + '</div>';

    function row(label, val, cls) { return val ? '<div class="y-row"><span class="y-label">' + label + '</span><span class="y-value ' + (cls || '') + '">' + esc(val) + '</span></div>' : ''; }
    var rows = row('Description', p.headline) + row('Location', p.location) +
      row('Company', p.currentCompany, 'y-value-badge') +
      row('Job title', p.experiences && p.experiences[0] ? p.experiences[0].title : '');

    var exp = function () { return (p.experiences || []).map(function (e) { return '<div class="y-item"><span class="y-item-dot"></span><div><p class="y-item-title">' + esc(e.title) + '</p><p class="y-item-sub">' + esc(e.company || '') + ' | ' + esc(e.startDate || '') + ' - ' + esc(e.endDate || 'Present') + '</p>' + (e.description ? '<p class="y-item-desc">' + esc(e.description) + '</p>' : '') + '</div></div>'; }).join(''); };
    var edu = function () { return (p.educations || []).map(function (e) { return '<div class="y-item"><span class="y-item-dot"></span><div><p class="y-item-title">' + esc(e.school) + '</p><p class="y-item-sub">' + esc(e.degree || '') + (e.field ? ' | ' + esc(e.field) : '') + (e.endDate ? ' | ' + esc(e.endDate) : '') + '</p></div></div>'; }).join(''); };
    var chips = function (arr) { return '<div class="y-chips">' + (arr || []).map(function (s) { return '<span class="y-chip">' + esc(typeof s === 'string' ? s : (s.name || '')) + '</span>'; }).join('') + '</div>'; };
    var certs = function () { return (p.certifications || []).map(function (c) { var n = typeof c === 'string' ? c : c.name; var by = typeof c === 'string' ? '' : [c.issuer, c.issueDate].filter(Boolean).join(' | '); return '<div class="y-item2"><p class="y-item-title">' + esc(n) + '</p>' + (by ? '<p class="y-item-sub">' + esc(by) + '</p>' : '') + '</div>'; }).join(''); };
    var courses = function () { return (p.courses || []).map(function (c) { var n = typeof c === 'string' ? c : c.name; var inst = typeof c === 'string' ? '' : c.institution; return '<div class="y-item2"><p class="y-item-title">' + esc(n) + '</p>' + (inst ? '<p class="y-item-sub">' + esc(inst) + '</p>' : '') + '</div>'; }).join(''); };
    var orgs = function () { return (p.organizations || []).map(function (o) { var n = typeof o === 'string' ? o : o.name; var r = typeof o === 'string' ? '' : o.role; return '<div class="y-item2"><p class="y-item-title">' + esc(n) + '</p>' + (r ? '<p class="y-item-sub">' + esc(r) + '</p>' : '') + '</div>'; }).join(''); };
    var recs = function () { return (p.recommendations || []).map(function (r) { return '<div class="y-item2"><p class="y-item-desc">' + esc(typeof r === 'string' ? r : (r.text || '')) + '</p></div>'; }).join(''); };

    return '<div class="y-fade">' +
      '<div class="y-c y-pt y-pb">' + avatar + '</div>' +
      '<div class="y-name-row"><h2 class="y-name">' + esc((p.firstName || '') + ' ' + (p.lastName || '')) + '</h2>' + (p.connectionDegree ? '<span class="y-deg">' + esc(p.connectionDegree) + '</span>' : '') + '</div>' +

      // Where it lands. Stage only matters once a job is chosen.
      '<div class="y-assign">' +
        selectorBtn('job', 'Add to Job', S.selJob, true) +
        (S.selJob ? selectorBtn('stage', 'Pipeline Stage', S.selStage, true) : '') +
      '</div>' +

      // What lands — every field that gets imported
      '<div class="y-rows">' + (rows || '<div class="y-muted y-c y-py">No details parsed.</div>') + '</div>' +
      '<div class="y-colls">' +
        (p.about ? '<div class="y-about"><h4 class="y-coll-title">About</h4><p class="y-about-txt">' + esc(p.about) + '</p></div>' : '') +
        collapsible('exp', 'Experience', (p.experiences || []).length, exp) +
        collapsible('edu', 'Education', (p.educations || []).length, edu) +
        collapsible('skills', 'Skills', (p.skills || []).length, function () { return chips(p.skills); }) +
        collapsible('langs', 'Languages', (p.languages || []).length, function () { return chips(p.languages); }) +
        collapsible('certs', 'Certifications', (p.certifications || []).length, certs) +
        collapsible('courses', 'Courses', (p.courses || []).length, courses) +
        collapsible('orgs', 'Organizations', (p.organizations || []).length, orgs) +
        collapsible('recs', 'Recommendations', (p.recommendations || []).length, recs) +
      '</div></div>';
  }

  function footerHtml() {
    var lbl = S.success ? (S.exists ? 'Updated Candidate' : 'Added to Yena') : (S.saving ? 'Saving…' : (S.exists ? 'Update Candidate' : 'Add to Yena'));
    var ico = S.success ? ICON_CHECK : (S.saving ? '<span class="y-spinner-sm"></span>' : ICON_PLUS);
    return '<div class="y-footer"><button data-act="save" ' + (S.saving ? 'disabled' : '') + ' class="y-btn y-btn-save ' + (S.success ? 'y-btn-green' : 'y-btn-orange') + (S.saving ? ' y-dim' : '') + '">' + ico + lbl + '</button>' + (S.message ? '<div class="y-err y-c">' + esc(S.message) + '</div>' : '') + '</div>';
  }

  // ------------------------------------------------------------------ wire
  function wire() {
    var q = function (s) { return panel.querySelector(s); };
    var all = function (s) { return panel.querySelectorAll(s); };
    var on = function (s, ev, fn) { var el = q(s); if (el) el.addEventListener(ev, fn); };
    on('[data-act="close"]', 'click', closePanel);
    on('[data-act="logout"]', 'click', logout);
    on('[data-act="connect"]', 'click', function () { connect((q('[data-el="token"]') || {}).value || ''); });
    on('[data-el="token"]', 'keydown', function (e) { if (e.key === 'Enter') connect(e.target.value); });
    on('[data-act="save"]', 'click', save);
    all('[data-picker]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-picker');
        S.picker = (S.picker === k) ? '' : k;   // clicking the open selector closes it
        S.search = '';
        render();
        var si = q('[data-el="search"]'); if (si) si.focus();
      });
    });
    on('[data-el="search"]', 'input', function (e) {
      S.search = e.target.value;
      render();
      var si = q('[data-el="search"]');
      if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    });
    all('[data-pick]').forEach(function (b) { b.addEventListener('click', function () {
      var id = b.getAttribute('data-pick');
      if (S.picker === 'job') { S.selJob = S.jobs.find(function (j) { return String(j.id) === id; }) || null; S.selStage = null; }
      else S.selStage = S.stages.find(function (st) { return String(st.id) === id; }) || null;
      S.picker = ''; S.search = ''; render();
    }); });
    all('[data-clear]').forEach(function (b) { b.addEventListener('click', function () {
      if (b.getAttribute('data-clear') === 'job') { S.selJob = null; S.selStage = null; }
      else S.selStage = null;
      S.picker = ''; S.search = ''; render();
    }); });
    all('[data-toggle]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-toggle'); S.expanded[k] = !S.expanded[k]; render(); }); });
  }

  // ------------------------------------------------------------- lifecycle
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.picker && S.open) { S.picker = ''; S.search = ''; render(); } });

  // Re-parse when LinkedIn SPA-navigates while the panel is open; self-clean if
  // the extension context was invalidated (reloaded/updated).
  var lastUrl = location.href;
  var poll = setInterval(function () {
    if (!contextValid()) { clearInterval(poll); if (hostEl) hostEl.remove(); return; }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (S.open) run();
    }
  }, 1200);

  // React live to the popup changing the token or the dev backend override, so
  // switching to http://localhost:3000 takes effect without reloading the tab.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (!changes[KEYS.domain] && !changes[KEYS.token]) return;
    if (changes[KEYS.token]) token = changes[KEYS.token].newValue || null;
    if (changes[KEYS.domain]) overrideDomain = changes[KEYS.domain].newValue || '';
    applyDomain();
    loadedUrl = '';
    if (S.open) run();
  });

  // -------------------------------------------------------------- bootstrap
  chrome.storage.local.get([KEYS.domain, KEYS.token], function (res) {
    token = res[KEYS.token] || null;
    overrideDomain = res[KEYS.domain] || '';
    applyDomain();
    mount();
  });

  // ===================================================== assets (inline) ===
  var MARK = '<svg viewBox="0 0 152 152" width="100%" height="100%" fill="none" aria-hidden="true">' +
    '<path d="M116.375 0H35.625C15.9499 0 0 15.9499 0 35.625V116.375C0 136.05 15.9499 152 35.625 152H116.375C136.05 152 152 136.05 152 116.375V35.625C152 15.9499 136.05 0 116.375 0Z" fill="#FF5A00"/>' +
    '<path d="M95.2162 18L97.7947 18.0615L97.856 18.1229H98.4086L98.47 18.1844L99.6364 18.3073L101.54 18.7376L103.565 19.4137C106.729 20.7127 109.359 22.5464 111.454 24.9149C113.255 26.8818 114.667 29.2379 115.69 31.9834L116.12 33.3356L116.673 35.9172V36.3474L116.795 36.9006V37.6382L116.857 37.6997V40.1583L116.795 40.2198L116.734 41.5105L116.366 43.6004L115.629 46.1204L103.535 79.742L100.097 89.5151L99.7285 90.3756L96.2906 100.149L95.9222 101.009L92.4843 110.782L92.1159 111.643L88.678 121.416L88.3097 122.276L87.5116 124.673C86.5211 127.288 85.058 129.429 83.1221 131.096C81.5464 132.51 79.6228 133.576 77.3513 134.293L76.1848 134.6L74.7728 134.784L74.7114 134.846H74.1589L74.0975 134.907H71.6419L71.5805 134.846L70.5368 134.784L69.002 134.477L67.59 134.047L66.0552 133.432C64.0293 132.49 62.3206 131.23 60.9291 129.652C59.6235 128.214 58.6003 126.493 57.8595 124.489L57.4297 123.075L57.1228 121.539L57.0614 120.494L57 120.432V118.035L57.0614 117.974V117.42L57.1228 117.359V116.929L57.307 115.945L57.7981 114.163L92.0546 18.3688L93.0675 18.1844H93.4972L93.5586 18.1229L95.1548 18.0615L95.2162 18Z" fill="#6C90EA"/>' +
    '<path d="M51.8083 34H53.3431L53.4045 34.0615H54.1412L54.2026 34.1229L55.1235 34.1844L57.0266 34.6147L58.3158 35.0449C60.5709 35.9423 62.4638 37.2024 63.9945 38.825C64.8172 39.7019 65.5539 40.6649 66.2046 41.7139L67.4325 44.234L67.8622 45.5248L68.2919 47.5531L68.3533 48.598L68.4147 48.6595V50.9337L68.3533 50.9952V51.6099L68.2919 51.6713L68.1078 53.085L67.5552 55.0519L60.8022 73.7374L57.1187 84.1865L56.9652 84.4017L39.4993 62.858L38.2101 61.0755C37.3465 59.7069 36.7121 58.1088 36.307 56.2812L36.1228 55.2363V54.8061L36.0614 54.7446V54.1914L36 54.1299V51.1796L36.0614 51.1181V50.5035L36.1228 50.442L36.2456 49.2742L36.6139 47.6146L37.0437 46.2009L37.7804 44.3569C38.8649 42.0008 40.2872 39.9826 42.0471 38.3026C43.3322 37.0487 44.8465 36.0243 46.59 35.2293L48.4318 34.5532L49.414 34.3073L50.4577 34.1229H50.8874L50.9488 34.0615H51.7469L51.8083 34Z" fill="white"/>' +
    '</svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  var ICON_LOGOUT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
  var ICON_STAR = '<svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor"><path d="M9.05 2.9c.3-.9 1.6-.9 1.9 0l1.07 3.3a1 1 0 00.95.68h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.97 8.7c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69z"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 4v16m8-8H4"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>';
  var ICON_CHEV_R = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
  var ICON_CHEV_D = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>';

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '.y-fab{position:fixed;right:14px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:13px;background:transparent;padding:0;cursor:pointer;z-index:2147483646;box-shadow:0 3px 14px rgba(255,106,38,.4);display:flex;align-items:center;justify-content:center;transition:transform .15s}',
    '.y-fab:hover{transform:translateY(-50%) scale(1.06)}',
    '.y-panel{position:fixed;top:0;right:0;width:min(430px,96vw);height:100vh;background:#fff;color:#181c25;z-index:2147483647;box-shadow:-8px 0 30px rgba(0,0,0,.14);flex-direction:column;font-size:14px;line-height:1.4}',
    '.y-shell{display:flex;flex-direction:column;height:100%}',
    '.y-scroll{flex:1;overflow-y:auto;scrollbar-width:none}.y-scroll::-webkit-scrollbar{display:none}',
    '.y-center{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:24px}',
    '.y-muted{color:#687182}.y-c{display:flex;justify-content:center}.y-py{padding:24px 0}.y-pt{padding-top:16px}.y-pb{padding-bottom:16px}',
    '.y-empty-title{font-size:16px;font-weight:600}',
    '.y-fade{animation:yfade .2s ease-out}@keyframes yfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    // loading
    '.y-spinner{width:34px;height:34px;border-radius:50%;border:3px solid #ffe0cf;border-top-color:#ff6a26;animation:yspin .7s linear infinite}',
    '.y-spinner-sm{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;animation:yspin .7s linear infinite}',
    '@keyframes yspin{to{transform:rotate(360deg)}}',
    '.y-load-msg{margin-top:14px;font-size:14px}',
    '@media (prefers-reduced-motion:reduce){.y-spinner,.y-spinner-sm{animation-duration:2.4s}.y-fade{animation:none}}',
    // header
    '.y-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid #e8ebf1;flex-shrink:0}',
    '.y-brand-row,.y-brand{display:flex;align-items:center;gap:8px;min-width:0}',
    '.y-logo{width:34px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.y-logo-sm{width:30px;height:30px}',
    '.y-brand-name{font-size:18px;font-weight:700;flex-shrink:0}',
    '.y-ws{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.y-header-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}',
    '.y-icon-btn{padding:7px;border:0;background:transparent;border-radius:8px;color:#687182;cursor:pointer;display:flex;transition:background .12s}',
    '.y-icon-btn:hover{background:#f5f7fa;color:#181c25}.y-icon-danger:hover{background:#fef2f2;color:#dc2626}',
    // auth
    '.y-auth{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 24px}',
    '.y-auth-title{font-size:18px;font-weight:600;margin-bottom:4px}.y-auth-sub{margin-bottom:16px}',
    '.y-input{width:100%;padding:11px 13px;border:1px solid #dde1e8;border-radius:11px;font-size:14px;outline:none;margin-bottom:12px}',
    '.y-input:focus{border-color:#4e76d9}',
    '.y-brand{margin-bottom:20px}',
    // buttons
    '.y-btn{width:100%;border:0;border-radius:11px;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;transition:background .15s,transform .1s}.y-btn:active{transform:scale(.98)}',
    '.y-btn-blue{background:#4e76d9;color:#fff}.y-btn-blue:hover{background:#3f63c0}',
    '.y-btn-orange{background:#ff6a26;color:#fff}.y-btn-orange:hover{background:#e85814}',
    '.y-btn-green{background:#059669;color:#fff}',
    '.y-btn-ghost{background:#fff;color:#181c25;box-shadow:inset 0 0 0 1px #dde1e8}.y-btn-ghost:hover{background:#f5f7fa}',
    '.y-dim{opacity:.6}',
    '.y-err{margin-top:10px;font-size:13px;color:#b91c1c;text-align:center}',
    // preview
    '.y-avatar{width:66px;height:66px;border-radius:18px;overflow:hidden;border:1px solid #e8ebf1;background:#f5f7fa;display:flex;align-items:center;justify-content:center}',
    '.y-avatar img{width:100%;height:100%;object-fit:cover}.y-avatar span{font-size:24px;font-weight:600}',
    // status chip — lives in the header, so it must stay compact and never wrap
    '.y-chip-status{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid;white-space:nowrap;flex-shrink:0}',
    '.y-chip-green{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}.y-chip-pink{background:#fdf2f8;border-color:#fbcfe8;color:#9d174d}',
    '.y-name-row{display:flex;align-items:center;justify-content:center;gap:8px;padding:0 16px 14px}',
    '.y-name{font-size:20px;font-weight:600}',
    '.y-deg{font-size:12px;font-weight:600;padding:1px 7px;border-radius:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}',
    '.y-rows{padding:6px 16px}',
    '.y-row{display:flex;flex-direction:column;gap:3px;padding:9px 0}',
    '.y-label{font-size:12px;font-weight:600;letter-spacing:.03em;color:#687182;text-transform:uppercase}',
    '.y-value{font-size:15px;font-weight:500;color:#181c25;word-break:break-word;line-height:1.5}',
    '.y-value-badge{align-self:flex-start;padding:3px 8px;border-radius:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}',
    // assignment + data sections
    '.y-assign{padding:4px 16px 16px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid #e8ebf1}',
    '.y-selector{display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-radius:12px;border:1px solid #dde1e8;background:#fafbfc;cursor:pointer;text-align:left;transition:border-color .15s,background .15s}',
    '.y-selector:hover{background:#f5f7fa}.y-selector-primary{background:#fff7ed;border-color:#fed7aa}',
    '.y-sel-dot{width:11px;height:11px;border-radius:99px;background:#687182;flex-shrink:0}.y-sel-dot-orange{background:#ff6a26}',
    '.y-sel-body{flex:1;min-width:0;display:flex;flex-direction:column}.y-sel-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#687182;margin-bottom:2px}',
    '.y-sel-val{font-size:15px;font-weight:500;color:#181c25}.y-sel-ph{color:#7e8799;font-weight:400}.y-sel-chev{color:#687182;display:flex;transition:transform .18s}',
    '.y-colls{padding:4px 16px 18px}',
    '.y-about{border-top:1px solid #e8ebf1;padding-top:14px;margin-bottom:8px}.y-about-txt{margin-top:8px;font-size:14px;color:#4a5364;line-height:1.6;white-space:pre-wrap}',
    '.y-coll{border-top:1px solid #e8ebf1}',
    '.y-coll-head{width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 0;border:0;background:none;cursor:pointer}',
    '.y-coll-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#687182}',
    '.y-count{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#f0f2f5;font-size:11px;margin-left:4px}',
    '.y-coll-chev{color:#687182;display:flex;transition:transform .2s}.y-open{transform:rotate(180deg)}',
    '.y-coll-body{padding-bottom:14px;display:flex;flex-direction:column;gap:8px}',
    '.y-item{display:flex;gap:10px;padding:9px 11px;background:#fafbfc;border:1px solid #e8ebf1;border-radius:9px}',
    '.y-item2{padding:9px 11px;background:#fafbfc;border:1px solid #e8ebf1;border-radius:9px}',
    '.y-item-dot{width:7px;height:7px;border-radius:99px;background:#2563eb;margin-top:6px;flex-shrink:0}',
    '.y-item-title{font-size:14px;font-weight:500;color:#181c25}.y-item-sub{font-size:13px;color:#687182;margin-top:2px}.y-item-desc{font-size:13px;color:#7e8799;margin-top:6px;line-height:1.5;white-space:pre-wrap}',
    '.y-chips{display:flex;flex-wrap:wrap;gap:6px}.y-chip{font-size:13px;color:#4a5364;background:#fafbfc;border:1px solid #e8ebf1;border-radius:7px;padding:4px 9px}',
    // footer
    '.y-footer{padding:16px 18px;border-top:1px solid #dde1e8;background:#fafbfc;flex-shrink:0}',
    '.y-btn-save{padding:14px;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,.08)}',
    // picker modal
    // select2-style dropdown, anchored under its selector
    '.y-sel-wrap{position:relative}',
    '.y-selector-open{border-color:#ff6a26;background:#fff}',
    '.y-dd{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:20;background:#fff;border:1px solid #dde1e8;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.15);overflow:hidden;animation:yfade .12s ease-out}',
    '.y-dd-search{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid #eef1f5}',
    '.y-dd-search svg{color:#7e8799;flex-shrink:0}',
    '.y-dd-search input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:14px;color:#181c25}',
    '.y-dd-list{max-height:232px;overflow-y:auto;padding:6px}',
    '.y-dd-item{display:flex;align-items:flex-start;gap:9px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:none;cursor:pointer;text-align:left}',
    '.y-dd-item:hover{background:#f5f7fa}.y-dd-item.y-on{background:#eff6ff}',
    '.y-dd-item svg{color:#2563eb;flex-shrink:0;margin-top:3px}',
    '.y-dd-dot{width:9px;height:9px;border-radius:99px;margin-top:5px;flex-shrink:0;background:#2563eb}',
    '.y-dd-body{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.y-dd-label{font-size:14px;font-weight:500;color:#181c25;word-break:break-word}',
    '.y-dd-sub{font-size:12px;color:#687182;margin-top:1px}',
    '.y-dd-empty{padding:20px;text-align:center;color:#687182;font-size:13px}',
    '.y-dd-clear{width:100%;padding:9px;border:0;border-top:1px solid #eef1f5;background:none;color:#687182;font-size:13px;cursor:pointer}',
    '.y-dd-clear:hover{background:#fef2f2;color:#dc2626}',
  ].join('');
})();
