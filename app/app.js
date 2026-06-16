// Yena injected UI — plain JS, runs inside the Yena iframe (Yena origin).
// Markup ported verbatim from the original Preview / Sidebar / PickerModal so
// the visual format matches exactly.
//
// Data flow: instant quick scrape (from content script) -> fast AI enrich +
// status check -> full re-parse on save.

(function () {
  'use strict';

  var API_BASE = location.origin + '/api/v1/integrations';
  var ctx = { token: null, sourceUrl: '', sections: null };
  var me = null;

  var S = {
    view: 'loading',          // loading | auth | notProfile | preview | full
    profile: {}, fetching: true,
    exists: false, assignment: null,
    jobs: [], stages: [], lists: [],
    selJob: null, selStage: null, selList: null,
    picker: '',               // '', 'job', 'stage', 'list'
    search: '',
    expanded: { exp: true },
    saving: false, success: false, message: '', kind: '',
  };

  // ---------------------------------------------------------------- bridge
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.source !== 'yena-host') return;
    if (d.type === 'INIT') {
      ctx.token = d.token; ctx.sourceUrl = d.sourceUrl || ''; ctx.sections = d.sections || {};
      S.profile = Object.assign({ experiences: [], educations: [], skills: [], languages: [], certifications: [], courses: [], organizations: [], recommendations: [] }, d.profile || {});
      S.enriched = false; run();
    } else if (d.type === 'TOKEN_SET') { ctx.token = d.token || null; run(); }
  });
  function host(type, extra) { parent.postMessage(Object.assign({ source: 'yena-frame', type: type }, extra || {}), '*'); }

  // ------------------------------------------------------------------- api
  async function api(path, options) {
    if (!ctx.token) return { ok: false, status: 401, data: null };
    var res = await fetch(API_BASE + path, {
      method: (options && options.method) || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.token },
      body: options && options.body,
    });
    var data = null; try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data: data };
  }
  function isProfileUrl(u) { return u.indexOf('/in/') > -1 || u.indexOf('/sales/lead/') > -1 || u.indexOf('/sales/people/') > -1 || u.indexOf('/talent/profile/') > -1; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ------------------------------------------------------------------ flow
  async function run() {
    if (!ctx.token) { S.view = 'auth'; render(); return; }
    S.view = 'loading'; render();
    me = (await api('/extension/me')).data;
    if (!me) { S.view = 'auth'; S.message = 'Invalid token.'; S.kind = 'error'; render(); return; }
    if (!isProfileUrl(ctx.sourceUrl)) { S.view = 'notProfile'; render(); return; }

    S.fetching = false;
    if (S.view !== 'full') S.view = 'preview';
    render();

    // On open we ONLY check existence + show the data taken straight from the
    // page (DOM parse). No AI enrichment — that runs server-side on save.
    checkStatus().then(render);
    loadJobs().then(render);
    loadStages().then(render);
    loadLists().then(render);
  }

  async function checkStatus() {
    var r = await api('/linkedin/profiles/status?sourceUrl=' + encodeURIComponent(ctx.sourceUrl));
    S.exists = !!(r.ok && r.data && r.data.exists);
    var a = r.ok && r.data && r.data.assignment;
    if (a) { S.assignment = a; }
  }
  async function loadJobs() { var r = await api('/extension/jobs'); S.jobs = (r.ok && r.data && r.data.jobs) || []; applyAssignment(); }
  async function loadStages() { var r = await api('/extension/stages'); S.stages = (r.ok && r.data && r.data.stages) || []; applyAssignment(); }
  async function loadLists() { var r = await api('/extension/lists'); S.lists = (r.ok && r.data && r.data.lists) || []; }
  function applyAssignment() {
    if (!S.assignment) return;
    if (!S.selJob && S.assignment.jobId) S.selJob = S.jobs.find(function (j) { return String(j.id) === String(S.assignment.jobId); }) || null;
    if (!S.selStage && S.assignment.stageId) S.selStage = S.stages.find(function (s) { return String(s.id) === String(S.assignment.stageId); }) || null;
  }

  function toImport(p) {
    return {
      sourceUrl: p.linkedinUrl || ctx.sourceUrl, name: { firstName: p.firstName || '', lastName: p.lastName || '' },
      headline: p.headline || '', location: p.location || '', currentCompany: p.currentCompany || '',
      about: p.about || '', profilePictureUrl: p.profilePictureUrl || '', connectionDegree: p.connectionDegree || '',
      experience: p.experiences || [], education: p.educations || [], skills: p.skills || [],
      languages: p.languages || [], certifications: p.certifications || [], courses: p.courses || [],
      organizations: p.organizations || [], recommendations: p.recommendations || [],
    };
  }
  async function save() {
    S.saving = true; S.message = ''; render();
    // Send the profile link, the (manually editable) profile fields, the
    // dropdown selections, and the page section text. The backend uses the
    // fields as-is and parses the text for anything that's missing.
    var body = {
      profile: toImport(S.profile),
      sourceUrl: ctx.sourceUrl,
      sections: ctx.sections,
    };
    if (S.selJob) body.jobId = S.selJob.id;
    if (S.selStage) body.stageId = S.selStage.id;
    if (S.selList) body.listId = S.selList.id;
    var r = await api('/linkedin/profiles', { method: 'POST', body: JSON.stringify(body) });
    S.saving = false;
    if (r.ok) { S.success = true; await checkStatus(); setTimeout(function () { S.success = false; render(); }, 2500); }
    else { S.message = (r.data && r.data.error) || 'Failed to save.'; S.kind = 'error'; }
    render();
  }
  function logout() { ctx.token = null; me = null; host('CLEAR_TOKEN'); S.view = 'auth'; render(); }
  function connect(t) { if (t.trim()) host('SET_TOKEN', { token: t.trim() }); }

  // ---------------------------------------------------------------- render
  function root() { return document.getElementById('yena-app'); }
  function initials() { return ((S.profile.firstName || '')[0] || '') + ((S.profile.lastName || '')[0] || ''); }

  function render() {
    // Preserve the scroll position of the panel body across re-renders.
    var prev = root().querySelector('.scrollbar-none');
    var top = prev ? prev.scrollTop : 0;

    var html;
    if (S.view === 'loading') html = '<div class="h-screen flex items-center justify-center text-[#687182]">Loading…</div>';
    else if (S.view === 'auth') html = authHtml();
    else if (S.view === 'notProfile') html = shellHtml('<div class="h-full flex flex-col items-center justify-center text-center px-6 gap-1"><p class="text-base font-medium">Open a candidate profile</p><p class="text-sm text-[#9aa3b2]">linkedin.com/in/…, Sales Navigator or Recruiter</p></div>');
    else if (S.view === 'preview') html = shellHtml(previewBodyHtml());
    else html = shellHtml(fullBodyHtml(), footerHtml()) + pickerModalHtml();
    root().innerHTML = html;
    wire();

    var next = root().querySelector('.scrollbar-none');
    if (next && top) next.scrollTop = top;
  }

  function authHtml() {
    return '<div class="h-screen flex flex-col justify-center px-6">' +
      '<div class="flex items-center gap-2 mb-5"><div class="w-8 h-8 rounded-lg bg-[#ff6a26] flex items-center justify-center text-white font-bold">✦</div><span class="text-xl font-bold">Yena</span></div>' +
      '<p class="text-lg font-semibold mb-1">Connect to Yena</p><p class="text-sm text-[#687182] mb-4">Paste your Yena access token.</p>' +
      '<input data-el="token" type="password" placeholder="Access token…" class="w-full px-3 py-2.5 border border-[#dde1e8] rounded-xl text-sm outline-none focus:border-[#4e76d9] mb-3" />' +
      '<button data-act="connect" class="w-full py-3 rounded-xl bg-[#4e76d9] hover:bg-[#3f63c0] text-white font-semibold">Connect</button>' +
      (S.message ? '<div class="mt-3 text-sm text-[#b91c1c]">' + esc(S.message) + '</div>' : '') + '</div>';
  }

  // ---- Persistent shell (header never changes between preview/full) -----
  function headerHtml() {
    var ws = me && me.workspaceName ? '<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">' + esc(me.workspaceName) + '</span>' : '';
    var onProfile = S.view === 'preview' || S.view === 'full';
    var status = onProfile
      ? '<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border ' + (S.exists ? 'bg-[#eff6ff] border-[#bfdbfe]' : 'bg-[#fffbeb] border-[#fde68a]') + '"><div class="w-2 h-2 rounded-full animate-pulse ' + (S.exists ? 'bg-[#2563eb]' : 'bg-[#d97706]') + '"></div><span class="text-sm font-medium ' + (S.exists ? 'text-[#1e40af]' : 'text-[#92400e]') + '">' + (S.exists ? 'In Yena' : 'New Candidate') + '</span></div>'
      : '';
    return '<div class="px-6 py-4 border-b border-[#dde1e8] flex items-center justify-between shrink-0">' +
      '<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-xl bg-[#ff6a26] flex items-center justify-center shadow-sm text-white font-bold">✦</div><span class="font-semibold text-xl text-[#181c25]">Yena</span>' + ws + '</div>' +
      '<div class="flex items-center gap-2">' + status +
        '<button data-act="logout" title="Disconnect API Key" class="p-2 rounded-lg hover:bg-[#fef2f2] text-[#687182] hover:text-[#dc2626] transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg></button>' +
        '<button data-act="close" class="p-2 rounded-lg hover:bg-[#f5f7fa] text-[#687182] hover:text-[#181c25] transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
      '</div></div>';
  }

  function shellHtml(body, footer) {
    return '<div class="h-screen flex flex-col bg-white text-[#181c25] font-sans">' + headerHtml() +
      '<div class="flex-1 overflow-y-auto scrollbar-none">' + body + '</div>' + (footer || '') + '</div>';
  }

  // ---- Preview body (content only; shell provides the header) -----------
  function previewBodyHtml() {
    var p = S.profile, sk = S.fetching && !p.firstName;
    var statusBadge = S.exists
      ? '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium tracking-[-0.02em] bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46]"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>In Yena</div>'
      : '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium tracking-[-0.02em] bg-[#fdf2f8] border border-[#fbcfe8] text-[#9d174d]"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>Record Suggestion</div>';

    var avatar = '<div class="w-16 h-16 rounded-2xl overflow-hidden border border-[#e8ebf1] ' + (sk ? 'animate-shimmer bg-black/[0.04]' : 'bg-[#f5f7fa]') + '">' +
      (!sk ? (p.profilePictureUrl ? '<img src="' + esc(p.profilePictureUrl) + '" class="w-full h-full object-cover" alt="" />' : '<div class="w-full h-full flex items-center justify-center"><span class="text-2xl font-semibold text-[#181c25]">' + esc(initials()) + '</span></div>') : '') + '</div>';

    var row = function (label, valHtml) {
      return '<div class="flex items-start gap-3 py-2.5"><div class="w-5 h-5 flex items-center justify-center text-[#687182] shrink-0 mt-0.5"></div>' +
        '<div class="flex-1 min-w-0"><span class="text-sm font-medium tracking-[-0.01em] text-[#687182] uppercase block mb-1">' + label + '</span>' + valHtml + '</div></div>';
    };
    var rows = '';
    if (p.headline) rows += row('Description', '<span class="text-base font-medium tracking-[-0.02em] text-[#181c25] block break-words leading-relaxed">' + esc(p.headline) + '</span>');
    if (p.location) rows += row('Location', '<span class="text-base font-medium tracking-[-0.02em] text-[#181c25] block break-words leading-relaxed">' + esc(p.location) + '</span>');
    if (p.currentCompany) rows += row('Company', '<div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#eff6ff] border border-[#bfdbfe]"><span class="text-base font-medium tracking-[-0.02em] text-[#1e40af]">' + esc(p.currentCompany) + '</span></div>');
    if (p.experiences && p.experiences[0] && p.experiences[0].title) rows += row('Job title', '<span class="text-base font-medium tracking-[-0.02em] text-[#181c25] block break-words leading-relaxed">' + esc(p.experiences[0].title) + '</span>');
    rows += row('LinkedIn', '<a href="' + esc(p.linkedinUrl) + '" target="_blank" rel="noopener noreferrer" class="text-base font-medium tracking-[-0.02em] text-[#181c25] hover:text-[#2563eb] hover:underline underline-offset-2 block break-words">View Profile</a>');

    var ctaBase = 'w-full h-[40px] rounded-lg text-base font-semibold tracking-[-0.02em] transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]';
    var cta = S.exists
      ? '<button data-act="open-full" class="' + ctaBase + ' bg-white text-[#181c25] shadow-[0px_1px_2px_rgba(0,0,0,0.05),inset_0px_0px_0px_1px_#dde1e8] hover:bg-[#f5f7fa]"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>View in Yena</button>'
      : '<button data-act="open-full" class="' + ctaBase + ' bg-[#ff6a26] text-white shadow-[0px_1px_3px_rgba(255,106,38,0.2),0px_1px_2px_rgba(0,0,0,0.05)] hover:bg-[#e85814]"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>Add Person to Yena</button>';

    return '<div class="animate-fade-in-up">' +
      '<div class="flex justify-center py-4">' + statusBadge + '</div>' +
      '<div class="flex justify-center pb-4">' + avatar + '</div>' +
      '<div class="text-center px-4 pb-4"><div class="flex items-center justify-center gap-2"><h2 class="text-xl font-semibold tracking-[-0.02em] text-[#181c25]">' + esc(p.firstName) + ' ' + esc(p.lastName) + '</h2>' + (p.connectionDegree ? '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-[#eff6ff] border border-[#bfdbfe] text-sm font-medium text-[#1e40af]">' + esc(p.connectionDegree) + '</span>' : '') + '</div></div>' +
      '<div class="h-px bg-[#e8ebf1] mx-4"></div>' +
      '<div class="px-4 py-2">' + rows + '</div>' +
      '<div class="px-4 pt-2 pb-4">' + cta + '</div></div>';
  }

  // ---- Picker modal (verbatim from picker-modal.ts) -------------------
  function pickerModalHtml() {
    if (!S.picker) return '';
    var kind = S.picker;
    var title = kind === 'job' ? 'Choose Job' : kind === 'stage' ? 'Choose Stage' : 'Choose List';
    var ph = kind === 'job' ? 'Search jobs...' : kind === 'stage' ? 'Search stages...' : 'Search lists...';
    var sel = kind === 'job' ? S.selJob : kind === 'stage' ? S.selStage : S.selList;
    var opts = (kind === 'job' ? S.jobs.map(function (j) { return { id: j.id, label: j.title, sublabel: j.company }; })
      : kind === 'stage' ? S.stages.map(function (s) { return { id: s.id, label: s.name, color: s.color }; })
      : S.lists.map(function (l) { return { id: l.id, label: l.name, sublabel: l.count != null ? l.count + ' candidates' : '' }; }));
    var q = S.search.toLowerCase();
    var filtered = opts.filter(function (o) { return o.label.toLowerCase().indexOf(q) > -1 || (o.sublabel || '').toLowerCase().indexOf(q) > -1; });

    var list = filtered.length === 0
      ? '<div class="text-center py-8 text-base font-medium tracking-[-0.02em] text-[#4a5364]">None found</div>'
      : filtered.map(function (o) {
          var selected = sel && String(sel.id) === String(o.id);
          var dot = o.color ? '<span class="w-3 h-3 mt-1.5 rounded-full shrink-0" style="background-color:' + esc(o.color) + '"></span>' : '<span class="w-2.5 h-2.5 mt-2 rounded-full bg-[#2563eb] shrink-0"></span>';
          return '<button data-pick="' + esc(o.id) + '" class="w-full flex items-start min-h-[54px] gap-3 px-4 py-3 rounded-xl text-left transition-all duration-140 ' + (selected ? 'bg-[#eff6ff] border border-[#bfdbfe] text-[#181c25]' : 'hover:bg-[#f5f7fa] text-[#181c25]') + '">' + dot +
            '<div class="flex-1 min-w-0"><p class="text-[15px] leading-[1.32] font-semibold text-[#181c25] break-words pr-1">' + esc(o.label) + '</p>' + (o.sublabel ? '<p class="mt-1 text-[13px] leading-[1.4] font-medium text-[#687182] break-words pr-1">' + esc(o.sublabel) + '</p>' : '') + '</div>' +
            (selected ? '<svg class="w-4 h-4 text-[#2563eb] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' : '') + '</button>';
        }).join('');

    return '<div class="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">' +
      '<div class="absolute inset-0 bg-black/30 backdrop-blur-sm" data-act="picker-close"></div>' +
      '<div class="relative flex-1 flex flex-col m-4 mt-16 bg-white rounded-xl shadow-[0px_0px_0px_1px_#dde1e8,0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden animate-fade-in">' +
        '<div class="flex items-center justify-between px-4 py-3 border-b border-[#e8ebf1]"><h3 class="text-base font-semibold tracking-[-0.02em] text-[#181c25]">' + title + '</h3><button data-act="picker-close" class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#4a5364]">✕</button></div>' +
        '<div class="px-3 py-2.5 border-b border-[#e8ebf1]"><div class="relative flex items-center"><svg class="absolute left-2.5 w-4 h-4 text-[#4a5364]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
          '<input data-el="search" type="text" value="' + esc(S.search) + '" placeholder="' + ph + '" class="w-full h-[36px] pl-8 pr-3 bg-white rounded-lg text-base font-medium text-[#181c25] placeholder:text-[#7e8799] shadow-[inset_0px_0px_0px_1px_#dde1e8] focus:shadow-[inset_0px_0px_0px_1px_#2563eb] focus:outline-none" /></div></div>' +
        '<div class="flex-1 overflow-y-auto p-3 space-y-2">' + list + '</div>' +
        '<div class="px-4 py-2.5 border-t border-[#e8ebf1] flex items-center justify-end text-sm font-medium text-[#4a5364]"><span>ESC to close</span></div></div></div>';
  }

  // ---- Full sidebar (verbatim from sidebar.html) ----------------------
  function selectorBtn(kind, label, sel, primary) {
    var cls = 'w-full flex items-center justify-between px-4 py-4 rounded-xl border transition-all hover:bg-[#f5f7fa] active:scale-[0.99] ' + (primary ? 'bg-[#eff6ff] border-[#bfdbfe] hover:border-[#93c5fd]' : 'bg-[#fafbfc] border-[#dde1e8] hover:border-[#c5cad4]');
    var val = sel ? (sel.title || sel.name) : null;
    var placeholder = kind === 'job' ? 'Select a job' : kind === 'stage' ? 'Select stage' : 'Select a list (optional)';
    return '<button data-picker="' + kind + '" class="' + cls + '"><div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full ' + (primary ? 'bg-[#2563eb]' : 'bg-[#687182]') + '"></div>' +
      '<div class="text-left"><p class="text-sm text-[#687182] uppercase tracking-wider mb-1">' + label + '</p><p class="text-base font-medium ' + (val ? 'text-[#181c25]' : 'text-[#7e8799]') + '">' + esc(val || placeholder) + '</p></div></div>' +
      '<svg class="w-4 h-4 text-[#687182]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></button>';
  }
  function fieldRow(label, key, value) {
    return '<div class="flex items-start gap-3 py-3 border-b border-[#e8ebf1]"><div class="w-5 shrink-0 mt-0.5"></div>' +
      '<div class="flex-1 min-w-0"><span class="text-sm text-[#687182] uppercase tracking-wider block mb-1">' + label + '</span>' +
      '<input data-field="' + key + '" type="text" value="' + esc(value || '') + '" class="w-full text-base text-[#181c25] bg-white border border-[#dde1e8] rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb]" /></div></div>';
  }
  function collapsible(key, title, count, inner) {
    if (!count) return '';
    var open = !!S.expanded[key];
    return '<div class="border-t border-[#e8ebf1] pt-2">' +
      '<button data-toggle="' + key + '" class="w-full flex items-center justify-between py-2"><h4 class="text-sm font-semibold text-[#687182] uppercase tracking-wider">' + title + ' <span class="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#f0f2f5] text-xs">' + count + '</span></h4><svg class="w-4 h-4 text-[#687182] transition-transform ' + (open ? 'rotate-180' : '') + '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>' +
      (open ? '<div class="pb-4">' + inner() + '</div>' : '') + '</div>';
  }

  function fullBodyHtml() {
    var p = S.profile;
    var avatarInner = p.profilePictureUrl ? '<img src="' + esc(p.profilePictureUrl) + '" alt="Profile" class="w-full h-full object-cover" />' : '<span class="text-2xl font-bold text-[#181c25]">' + esc(initials()) + '</span>';

    var exp = function () { return '<div class="space-y-3">' + (p.experiences || []).map(function (e) { return '<div class="flex items-start gap-3 py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]"><div class="w-2 h-2 rounded-full bg-[#2563eb] mt-2 shrink-0"></div><div class="flex-1 min-w-0"><p class="text-base font-medium text-[#181c25]">' + esc(e.title) + '</p><p class="text-sm text-[#687182] mt-0.5">' + esc(e.company) + ' | ' + esc(e.startDate || '') + ' - ' + esc(e.endDate || 'Present') + '</p>' + (e.description ? '<p class="text-sm text-[#7e8799] mt-2 leading-relaxed whitespace-pre-wrap">' + esc(e.description) + '</p>' : '') + '</div></div>'; }).join('') + '</div>'; };
    var edu = function () { return '<div class="space-y-3">' + (p.educations || []).map(function (e) { return '<div class="flex items-start gap-3 py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]"><div class="w-2 h-2 rounded-full bg-[#2563eb] mt-2 shrink-0"></div><div class="flex-1 min-w-0"><p class="text-base font-medium text-[#181c25]">' + esc(e.school) + '</p><p class="text-sm text-[#687182] mt-0.5">' + esc(e.degree || '') + (e.field ? ' | ' + esc(e.field) : '') + '</p></div></div>'; }).join('') + '</div>'; };
    var chips = function (arr) { return '<div class="flex flex-wrap gap-1.5">' + (arr || []).map(function (s) { return '<span class="text-sm text-[#4a5364] bg-[#fafbfc] px-2 py-1 rounded-md border border-[#e8ebf1]">' + esc(s) + '</span>'; }).join('') + '</div>'; };
    var courses = function () { return '<div class="space-y-2">' + (p.courses || []).map(function (c) { var n = typeof c === 'string' ? c : c.name; var inst = typeof c === 'string' ? '' : c.institution; return '<div class="py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]"><p class="text-base font-medium text-[#181c25]">' + esc(n) + '</p>' + (inst ? '<p class="text-sm text-[#687182] mt-0.5">' + esc(inst) + '</p>' : '') + '</div>'; }).join('') + '</div>'; };

    return '<button data-act="back" title="Back to summary" class="flex items-center gap-1 px-6 pt-3 text-sm text-[#687182] hover:text-[#181c25] transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7"/></svg>Back</button>' +
        // profile header
        '<div class="px-6 py-6 border-b border-[#e8ebf1]"><div class="flex items-start gap-4"><div class="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563eb]/20 to-[#3b82f6]/15 p-0.5 shrink-0"><div class="w-full h-full rounded-full overflow-hidden bg-[#f5f7fa] flex items-center justify-center">' + avatarInner + '</div></div>' +
          '<div class="flex-1 min-w-0"><div class="flex items-center gap-2"><h3 class="text-2xl font-semibold text-[#181c25]">' + esc(p.firstName) + ' ' + esc(p.lastName) + '</h3>' + (p.connectionDegree ? '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-[#eff6ff] border border-[#bfdbfe] text-sm font-medium text-[#1e40af]">' + esc(p.connectionDegree) + '</span>' : '') + '</div><p class="text-base text-[#4a5364] mt-1 leading-relaxed">' + esc(p.headline) + '</p></div></div></div>' +
        // assignment
        '<div class="px-6 py-6 space-y-4 border-b border-[#e8ebf1]">' + selectorBtn('job', 'Add to Job', S.selJob, true) + (S.selJob ? selectorBtn('stage', 'Pipeline Stage', S.selStage, true) : '') + selectorBtn('list', 'Add to List', S.selList, false) + '</div>' +
        // fields
        '<div class="px-6 py-4">' + fieldRow('First Name', 'firstName', p.firstName) + fieldRow('Last Name', 'lastName', p.lastName) + (p.email ? '<div class="flex items-start gap-3 py-3 border-b border-[#e8ebf1]"><div class="w-5 shrink-0"></div><div class="flex-1 min-w-0"><span class="text-sm text-[#687182] uppercase tracking-wider block mb-1">Email</span><span class="text-base text-[#181c25] block break-words">' + esc(p.email) + '</span></div></div>' : '') + fieldRow('Company', 'currentCompany', p.currentCompany) + fieldRow('Location', 'location', p.location) + '</div>' +
        // collapsible
        '<div class="px-6 pb-6">' +
          (p.about ? '<div class="border-t border-[#e8ebf1] pt-4 mb-4"><h4 class="text-sm font-semibold text-[#687182] uppercase tracking-wider mb-3">About</h4><p class="text-base text-[#4a5364] leading-relaxed whitespace-pre-wrap">' + esc(p.about) + '</p></div>' : '') +
          collapsible('exp', 'Experience', (p.experiences || []).length, exp) +
          collapsible('edu', 'Education', (p.educations || []).length, edu) +
          collapsible('skills', 'Skills', (p.skills || []).length, function () { return chips(p.skills); }) +
          collapsible('langs', 'Languages', (p.languages || []).length, function () { return chips(p.languages); }) +
          collapsible('courses', 'Courses', (p.courses || []).length, courses) +
        '</div>';
  }

  function footerHtml() {
    var saveCls = 'w-full py-4 text-lg shadow-lg rounded-xl font-semibold text-white flex items-center justify-center gap-2 ' + (S.success ? 'bg-[#059669] hover:bg-[#047857]' : 'bg-[#ff6a26] hover:bg-[#e85814]') + (S.saving ? ' opacity-60' : '');
    return '<div class="px-6 py-5 border-t border-[#dde1e8] bg-[#fafbfc] shrink-0"><button data-act="save" ' + (S.saving ? 'disabled' : '') + ' class="' + saveCls + '">' +
      (S.success ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' + (S.exists ? 'Updated Candidate' : 'Added to Yena') : (S.saving ? 'Saving…' : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' + (S.exists ? 'Update Candidate' : 'Add to Yena'))) + '</button>' +
      (S.message ? '<div class="mt-2 text-sm text-center text-[#b91c1c]">' + esc(S.message) + '</div>' : '') + '</div>';
  }

  // ------------------------------------------------------------------ wire
  function wire() {
    var r = root();
    var q = function (s) { return r.querySelector(s); };
    var on = function (sel, ev, fn) { var el = q(sel); if (el) el.addEventListener(ev, fn); };

    on('[data-act="close"]', 'click', function () { host('CLOSE'); });
    on('[data-act="open-full"]', 'click', function () { S.view = 'full'; render(); });
    on('[data-act="back"]', 'click', function () { S.view = 'preview'; render(); });
    on('[data-act="logout"]', 'click', logout);
    on('[data-act="connect"]', 'click', function () { connect((q('[data-el="token"]') || {}).value || ''); });
    on('[data-el="token"]', 'keydown', function (e) { if (e.key === 'Enter') connect(e.target.value); });
    on('[data-act="save"]', 'click', save);

    r.querySelectorAll('[data-picker]').forEach(function (b) { b.addEventListener('click', function () { S.picker = b.getAttribute('data-picker'); S.search = ''; render(); var si = q('[data-el="search"]'); if (si) si.focus(); }); });
    q('[data-act="picker-close"]') && r.querySelectorAll('[data-act="picker-close"]').forEach(function (b) { b.addEventListener('click', function () { S.picker = ''; render(); }); });
    on('[data-el="search"]', 'input', function (e) {
      S.search = e.target.value;
      render();
      var si = q('[data-el="search"]');
      if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    });
    r.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () {
      var id = b.getAttribute('data-pick');
      if (S.picker === 'job') { S.selJob = S.jobs.find(function (j) { return String(j.id) === id; }) || null; S.selStage = null; }
      else if (S.picker === 'stage') S.selStage = S.stages.find(function (s) { return String(s.id) === id; }) || null;
      else S.selList = S.lists.find(function (l) { return String(l.id) === id; }) || null;
      S.picker = ''; render();
    }); });
    r.querySelectorAll('[data-toggle]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-toggle'); S.expanded[k] = !S.expanded[k]; render(); }); });
    r.querySelectorAll('[data-field]').forEach(function (i) { i.addEventListener('input', function () { S.profile[i.getAttribute('data-field')] = i.value; }); });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.picker) { S.picker = ''; render(); } });

  render();
  host('READY');
})();
