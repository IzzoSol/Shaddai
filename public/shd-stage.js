/* ══════════════════════════════════════════════════════════════════
   SHADDAI — STAGE (shd-stage.js)
   Which stage the signed-in person is in: guest | free | user | client.
   The answer comes from GET /api/stage/me (server-decided, session-scoped);
   nothing here is trusted — it only decides what to show. The server routes
   enforce the real gates.

   API
     SHDStage.state()              -> last known state (sync)
     SHDStage.refresh()            -> Promise<state>
     SHDStage.can(feature)         -> bool
     SHDStage.gate(feature, cb)    -> run cb if allowed, else show the lock card
     SHDStage.lock(feature)        -> show the lock card ("how to get access")
     SHDStage.apply()              -> mark [data-stage-feature="x"] elements locked
     SHDStage.guardView(map)       -> wrap showView so { viewId: feature } needs the feature

   Mark an element data-stage-feature="agent_builder" and, when the person
   lacks it, the element is dimmed with a lock and its click opens the lock
   card instead. Self-contained, no deps. Theme: obsidian / emerald / gold.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SHDStage) return;

  var HINTS = {
    user: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to unlock this.',
    client: 'This opens when a SHADDAI consultant starts an engagement with you. Ask for an assessment to get started.'
  };
  var LABELS = {
    agent_builder: 'The agent builder', workflows: 'Workflows', agent_office: 'Agent Office',
    task_history: 'Task history', publish_templates: 'Publishing templates', media_studio: 'Media Studio',
    client_portal: 'The client portal', client_chat: 'Client chat', client_tasks: 'Client tasks',
    client_files: 'Client files', client_invoices: 'Invoices'
  };
  var NEEDS_CLIENT = { client_portal: 1, client_chat: 1, client_tasks: 1, client_files: 1, client_invoices: 1 };

  var current = { stage: 'guest', features: [], loaded: false };
  var inflight = null;

  function headers() {
    var h = { 'Accept': 'application/json' };
    try { if (window.SHD_AUTH && SHD_AUTH.token) h['Authorization'] = 'Bearer ' + SHD_AUTH.token; } catch (e) {}
    try { var u = localStorage.getItem('shd_userid'); if (u && u.indexOf('guest') !== 0 && u !== 'local') h['x-user-id'] = u; } catch (e) {}
    return h;
  }

  function refresh(force) {
    if (inflight && !force) return inflight;
    inflight = fetch('/api/stage/me', { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(7000) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          current = { stage: d.stage, features: d.features || [], limits: d.limits, phase: d.phase,
                      engagementId: d.engagementId, isPaid: d.isPaid, isClient: d.isClient, loaded: true };
        } else current.loaded = true;
        return current;
      })
      .catch(function () { current.loaded = true; return current; }) // offline: stay at the lowest stage we know
      .then(function (s) {
        inflight = null; apply(); chip();
        try { window.dispatchEvent(new CustomEvent('shd-stage', { detail: s })); } catch (e) {}
        return s;
      });
    return inflight;
  }

  function can(f) { return current.features.indexOf(f) !== -1; }

  function css() {
    if (document.getElementById('shdStageCss')) return;
    var s = document.createElement('style'); s.id = 'shdStageCss';
    s.textContent =
      '#shdStageLock{position:fixed;inset:0;z-index:100070;display:none;place-items:center;background:rgba(6,8,11,.86);backdrop-filter:blur(8px);font-family:"Chakra Petch","IBM Plex Mono",sans-serif}' +
      '#shdStageLock.on{display:grid}' +
      '#shdStageLock .c{max-width:430px;margin:0 16px;text-align:center;padding:28px 26px;border:1px solid rgba(232,196,92,.45);border-radius:16px;background:linear-gradient(160deg,#0d1612,#06080b);color:#e9fff5;box-shadow:0 0 60px rgba(0,255,156,.12)}' +
      '#shdStageLock h2{font-size:21px;margin:0 0 8px;background:linear-gradient(90deg,#e8c45c,#00ff9c);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '#shdStageLock p{color:#8fb3a4;font-size:13px;line-height:1.55;margin:0 0 18px}' +
      '#shdStageLock button{font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#e8c45c,#00ff9c);color:#06080b}' +
      '#shdStageLock .x{background:none;border:1px solid rgba(232,196,92,.4);color:#8fb3a4;margin-left:8px}' +
      '.shd-stage-locked{position:relative;filter:grayscale(1) opacity(.55);cursor:not-allowed}' +
      '.shd-stage-locked::after{content:"\\1F512";position:absolute;top:4px;right:4px;font-size:10px}' +
      '#shdStageChip{position:fixed;left:12px;bottom:12px;z-index:9000;font:700 9px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;padding:6px 10px;border-radius:999px;border:1px solid rgba(232,196,92,.4);background:rgba(6,8,11,.85);color:#e8c45c}' +
      '#shdStageChip.client{color:#00ff9c;border-color:rgba(0,255,156,.45)}';
    document.head.appendChild(s);
  }

  function lock(feature) {
    css();
    var need = NEEDS_CLIENT[feature] ? 'client' : 'user';
    var el = document.getElementById('shdStageLock');
    if (!el) {
      el = document.createElement('div'); el.id = 'shdStageLock';
      el.innerHTML = '<div class="c"><h2></h2><p></p><div><button class="go"></button><button class="x">Not now</button></div></div>';
      el.addEventListener('click', function (e) { if (e.target === el || e.target.className === 'x') el.classList.remove('on'); });
      document.body.appendChild(el);
    }
    el.querySelector('h2').textContent = (LABELS[feature] || 'This feature') + ' is locked';
    el.querySelector('p').textContent = current.stage === 'guest'
      ? 'Sign in first, then SHADDAI will show you what is open to you.' : HINTS[need];
    var go = el.querySelector('.go');
    go.textContent = current.stage === 'guest' ? 'Sign in' : need === 'client' ? 'Ask for an assessment' : 'See plans';
    go.onclick = function () {
      el.classList.remove('on');
      try {
        if (current.stage === 'guest' && typeof window.showView === 'function') window.showView('settings');
        else if (need === 'user') window.open('/pricing.html', '_blank', 'noopener');
      } catch (e) {}
    };
    el.classList.add('on');
  }

  function gate(feature, cb) { if (can(feature)) { return cb && cb(); } lock(feature); }

  function block(e) {
    var f = e.currentTarget.getAttribute('data-stage-feature');
    if (can(f)) return;
    e.preventDefault(); e.stopPropagation(); lock(f);
  }
  function apply() {
    css();
    var nodes = document.querySelectorAll('[data-stage-feature]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], f = n.getAttribute('data-stage-feature');
      n.removeEventListener('click', block, true);
      if (can(f)) n.classList.remove('shd-stage-locked');
      else { n.classList.add('shd-stage-locked'); n.addEventListener('click', block, true); }
    }
  }

  function guardView(map) {
    var orig = window.showView;
    if (typeof orig !== 'function' || orig.__stageGuarded) return;
    var wrapped = function (v) {
      var f = map && map[v];
      if (f && current.loaded && !can(f)) { lock(f); return; }
      return orig.apply(this, arguments);
    };
    wrapped.__stageGuarded = true;
    window.showView = wrapped;
  }

  function chip() {
    css();
    var c = document.getElementById('shdStageChip');
    if (current.stage === 'guest' || !current.loaded) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'shdStageChip'; c.title = 'Your SHADDAI stage'; document.body.appendChild(c); }
    c.className = current.stage === 'client' ? 'client' : '';
    c.textContent = { free: 'Explorer', user: 'Builder', client: 'Client' }[current.stage] || current.stage;
  }

  window.SHDStage = { state: function () { return current; }, refresh: refresh, can: can, gate: gate, lock: lock, apply: apply, guardView: guardView };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { refresh(); }); else refresh();
  window.addEventListener('shd-auth-change', function () { refresh(true); });
})();
