/* world-city-actions.js — SHADDAI City v3 INTERACTION PANELS (Map v4, ?map=v4), 2026-09-27.
 *
 * world-city-v3.js fires onInteract(marker) when the player presses E at a marker. This module turns that into one
 * reusable DOM panel (obsidian #06080b · emerald #00ff9c · gold #e8c45c for SPARKS) with a per-family action view:
 *
 *   OBJ_SPARKS_KIOSK                          → economy  balance + catalog + purchase            (live)
 *   OBJ_HIRING_BOARD                          → hire     rates + hire an agent                   (live, SHAD-Credits)
 *   CLASS_*, CLASS_ART/MUSIC, OBJ_CLASS_BOARD → academy  catalog + quote (enrol: dashboard)      (live)
 *   NODE_SKILL_INSTALL                        → skills   market + run = "the seat" (3 s)         (live, SHAD-Credits)
 *   HUB_HOME_*                                → home     status / inhabit / rent / check-in      (status:'new')
 *   GATE_START, PIT_*                         → race     track + open heats + enter              (status:'new')
 *   STALL_*, BLD_GALLERY_SHOP, SLOT_GALLERY_* → bazaar   listing view, read-only                 (live)
 *   DEED_OFFICE, BUILDER_YARD                 → plots    counts from plots-v4.json, claim soon   (MCP-only today)
 *   everything else                           → copy prompt + "view on dashboard"
 *
 *   var actions = window.buildCityActions({ city?, hud?, copyUrl?, apiBase?, fetchImpl?, getUser?, hasSkill?,
 *                                           dashboardHref?, plotsUrl?, copy?, seatMs?, document?, keyTarget?, bindGlobal?,
 *                                           onOpen?(marker), onClose?(info) })
 *     → { open(marker) → Promise, close(), isOpen(), current(), dispose() }
 *   Also sets window.__onCityInteract = m => actions.open(m)   (unless opts.bindGlobal === false).
 *
 * Money rules (DOC_SPARKS / DOC_PAYMENTS), enforced here:
 *   • every spend shows its price and needs an explicit Confirm click; one fresh idempotency key (uuid) per click.
 *   • SPARKS is closed-loop. This file renders NO control that moves value out of the game, and every rendered string
 *     passes through clean(), which strips any such wording that could arrive from the network.
 *   • PayBox / x402 are pay-IN rails; they are only mentioned when a route answers 402.
 * Network: all calls go through fetchImpl (default fetch) with a 5 s timeout. Opening a panel only requests what that
 * panel shows; generic markers make no request at all (the copy file is fetched once and cached).
 */
(function (root) {
  'use strict';
  var TIMEOUT_MS = 5000;
  var DEFAULT_COPY_URL = '/assets/world/city-copy-v4.json';
  var DEFAULT_PLOTS_URL = '/assets/world/plots-v4.json';
  var FORBIDDEN = /withdraw\w*|cash[\s-]?out\w*|redeem\w*|redemption|pay[\s-]?outs?\b/gi;
  var COMING_SOON = 'Coming soon. The spot is built; the service behind it opens shortly.';
  var PAY_IN = 'Not enough for this one. Top up at the SPARKS Kiosk: PayBox and x402 are pay-in only.';
  var SIGN_IN = 'Sign in to do that here.';
  var OFFLINE = "Can't reach the city ledger right now. Nothing was spent.";
  var CODE_TEXT = {
    HOME_OCCUPIED: 'Someone already lives here.', ALREADY_HOUSED: 'You already have a home in the city.',
    HOME_LAPSED: 'This home has lapsed. Move back in to relight it.', RENT_DUE: 'Settle the rent first.',
    NOT_TENANT: "This isn't your home.", CAPACITY_EXCEEDED: 'The home is full.',
    DAILY_CAP: "That's today's limit. Come back tomorrow.", HEAT_CLOSED: 'That heat has closed. Try the next one.',
    HEAT_FULL: 'Every pit is taken in that heat.', NOT_PURCHASABLE: "That item isn't sold for SPARKS.",
    NOT_FOUND: "That's no longer here.", SKILL_NOT_FOUND: "That skill isn't on the market any more."
  };

  // ── pure helpers (exported for tests) ──
  function clean(s) { return String(s == null ? '' : s).replace(FORBIDDEN, '').replace(/\s{2,}/g, ' ').trim(); }
  function familyKey(name) { return String(name || '').replace(/_[^_]*$/, '_*'); }
  function lookupCopy(copy, name) {
    if (!copy || !name) return null;
    if (copy[name] && typeof copy[name] === 'object') return copy[name];
    var fk = familyKey(name);
    return (fk !== name && copy[fk] && typeof copy[fk] === 'object') ? copy[fk] : null;
  }
  function fill(tpl, vars) {
    if (tpl == null) return null;
    return String(tpl).replace(/\{(\w+)\}/g, function (all, k) { return vars && vars[k] != null ? String(vars[k]) : all; });
  }
  function markerVars(m) {
    var name = String(m && m.name || ''), last = name.split('_').pop() || '';
    var num = /^\d+$/.test(last) ? String(parseInt(last, 10)) : null;
    var price = m && typeof m.sparks_price === 'number' ? m.sparks_price
      : (m && m.props && typeof m.props.rent_sparks_per_day === 'number' ? m.props.rent_sparks_per_day : null);
    return { n: num, letter: /^[A-Z]$/.test(last) ? last : null, price: price, skill: m && m.skill ? m.skill : null };
  }
  function family(m) {
    var n = String(m && m.name || ''), d = String(m && m.dashboard_id || (m && m.props && m.props.dashboard_id) || '');
    if (n === 'OBJ_SPARKS_KIOSK' || d === 'sparks') return 'kiosk';
    if (n === 'OBJ_HIRING_BOARD' || d === 'hiring') return 'hire';
    if (n === 'NODE_SKILL_INSTALL' || d === 'forge.install') return 'seat';
    if (/^CLASS_/.test(n) || n === 'OBJ_CLASS_BOARD' || /^academy\.(class|art|music|board)/.test(d)) return 'academy';
    if (/^HUB_HOME_/.test(n) || /^home\./.test(d)) return 'home';
    if (n === 'GATE_START' || /^PIT_/.test(n) || d === 'race.gate' || /^race\.pit\./.test(d)) return 'race';
    if (/^STALL_/.test(n) || /^SLOT_GALLERY_/.test(n) || n === 'BLD_GALLERY_SHOP' || /^stall\./.test(d) || /^culture\.gallery/.test(d)) return 'bazaar';
    if (n === 'DEED_OFFICE' || n === 'BUILDER_YARD' || /^plots\./.test(d)) return 'plots';
    return 'generic';
  }
  function routeIsNew(m, service) {
    var eps = (m && m.props && Array.isArray(m.props.endpoints)) ? m.props.endpoints : (m && Array.isArray(m.endpoints) ? m.endpoints : []);
    return eps.some(function (e) { return e && e.service === service && e.status === 'new'; });
  }
  function uuid() {
    try { if (root && root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  // HTTP result → { kind: 'ok'|'soon'|'payin'|'signin'|'offline'|'fail', text? }. Never returns raw server text.
  function outcome(res, isNew) {
    if (!res || res.status === 0) return { kind: 'offline', text: OFFLINE };
    var j = res.json && typeof res.json === 'object' ? res.json : null;
    if (res.ok && !(j && j.ok === false)) return { kind: 'ok' };
    if (res.status === 404 && (isNew || !j)) return { kind: 'soon', text: COMING_SOON };   // route not mounted yet
    if (res.status === 402) return { kind: 'payin', text: PAY_IN };
    if (res.status === 401) return { kind: 'signin', text: SIGN_IN };
    var code = j && (j.code || j.error);
    if (code && CODE_TEXT[code]) return { kind: 'fail', text: CODE_TEXT[code] };
    return { kind: 'fail', text: null };
  }
  function prettyId(s) {
    return String(s || '').replace(/^sc-/, '').split(/[-_.]/).map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
  }
  function unitLabel(unit, n) { return unit === 'SPARKS' ? 'SPARKS' : (n === 1 ? 'credit' : 'credits'); }

  var CSS = [
    '#city-actions{--ca-bg:#06080b;--ca-em:#00ff9c;--ca-gold:#e8c45c;--ca-ink:rgba(225,240,232,.86);--ca-dim:rgba(225,240,232,.55);',
    '  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;width:min(440px,calc(100vw - 32px));max-height:min(78vh,640px);',
    '  display:none;flex-direction:column;background:var(--ca-bg);color:var(--ca-ink);border:1px solid rgba(0,255,156,.35);border-radius:10px;',
    '  box-shadow:0 0 28px rgba(0,255,156,.14),0 18px 48px rgba(0,0,0,.6);font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto}',
    '#city-actions.open{display:flex}',
    '#city-actions .ca-head{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 6px}',
    '#city-actions .ca-title{flex:1;margin:0;font:700 17px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ca-em);letter-spacing:.02em}',
    '#city-actions .ca-x{background:none;border:1px solid rgba(0,255,156,.25);color:var(--ca-dim);border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:16px}',
    '#city-actions .ca-prompt{margin:0 16px 8px;color:var(--ca-dim)}',
    '#city-actions .ca-body{padding:4px 16px 8px;overflow:auto;flex:1}',
    '#city-actions .ca-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(0,255,156,.08)}',
    '#city-actions .ca-row .ca-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '#city-actions .ca-sub{color:var(--ca-dim);font-size:12px}',
    '#city-actions .ca-price{color:var(--ca-gold);font-weight:700;white-space:nowrap}',
    '#city-actions .ca-balance{font-size:22px;font-weight:800;color:var(--ca-gold);margin:2px 0 8px}',
    '#city-actions button.ca-btn{min-height:34px;padding:6px 12px;border-radius:6px;border:1px solid var(--ca-em);background:rgba(0,255,156,.08);',
    '  color:var(--ca-em);font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}',
    '#city-actions button.ca-btn.gold{border-color:var(--ca-gold);color:var(--ca-gold);background:rgba(232,196,92,.08)}',
    '#city-actions button.ca-btn.ghost{border-color:rgba(225,240,232,.25);color:var(--ca-dim);background:none}',
    '#city-actions button.ca-btn[disabled]{opacity:.45;cursor:default}',
    '#city-actions .ca-confirm{margin:8px 0;padding:10px;border:1px solid rgba(232,196,92,.45);border-radius:8px;background:rgba(232,196,92,.05)}',
    '#city-actions .ca-confirm .ca-actions{display:flex;gap:8px;margin-top:8px}',
    '#city-actions input.ca-input{width:100%;box-sizing:border-box;margin:4px 0 8px;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,255,156,.3);',
    '  background:#0b0f14;color:var(--ca-ink);font:500 14px system-ui,-apple-system,"Segoe UI",sans-serif}',
    '#city-actions .ca-bar{height:6px;border-radius:3px;background:rgba(0,255,156,.12);overflow:hidden;margin:8px 0}',
    '#city-actions .ca-bar i{display:block;height:100%;width:0;background:var(--ca-em);box-shadow:0 0 10px var(--ca-em);transition:width .2s linear}',
    '#city-actions .ca-msg{min-height:20px;margin:0 16px 6px;font-size:13px}',
    '#city-actions .ca-msg.ok{color:var(--ca-em)} #city-actions .ca-msg.err{color:#ff6b81} #city-actions .ca-msg.info{color:var(--ca-dim)}',
    '#city-actions .ca-foot{display:flex;justify-content:space-between;align-items:center;padding:8px 16px 12px;border-top:1px solid rgba(0,255,156,.1);font-size:12px;color:var(--ca-dim)}',
    '#city-actions .ca-foot a{color:var(--ca-em);text-decoration:none}',
    '#city-actions .ca-locked{color:var(--ca-gold)}',
    '@media (max-width:600px){#city-actions{left:0;right:0;top:auto;bottom:0;transform:none;width:auto;max-height:72vh;border-radius:12px 12px 0 0;font-size:15px}',
    '  #city-actions button.ca-btn{min-height:42px}}',
    '@media (prefers-reduced-motion:reduce){#city-actions .ca-bar i{transition:none}}'
  ].join('\n');

  function build(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var win = root || {};
    var apiBase = String(opts.apiBase || '').replace(/\/$/, '');
    var fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? function (u, i) { return fetch(u, i); } : null);
    var copyUrl = opts.copyUrl || DEFAULT_COPY_URL, plotsUrl = opts.plotsUrl || DEFAULT_PLOTS_URL;
    var seatMsOpt = opts.seatMs;
    var dashboardHref = opts.dashboardHref || function (id) { return '/#' + encodeURIComponent(id); };
    var keyTarget = opts.keyTarget || (typeof window !== 'undefined' ? window : null);

    var panel = null, elTitle, elPrompt, elBody, elMsg, elDash, styleEl = null;
    var activeConfirm = null, openMarker = null, seq = 0, copyCache = null, copyPromise = null, busy = false, disposed = false, wasLocked = false;

    function hud() { return opts.hud || (win.__hudV4 || null); }
    function ping(evt) { var h = hud(); if (h && h.ping) { try { h.ping(evt); } catch (e) {} } }
    function user() {
      var u = null;
      if (opts.getUser) { try { u = opts.getUser(); } catch (e) { u = null; } }
      if (!u) {
        u = {};
        try { var ls = win.localStorage; if (ls) { u.userId = ls.getItem('shd_userid') || ''; u.token = ls.getItem('shd_token') || ''; } } catch (e) {}
      }
      return { userId: u.userId || u.id || '', token: u.token || '' };
    }

    // ── network: every request goes through fetchImpl, 5 s timeout, never throws ──
    function api(method, path, body, o) {
      o = o || {};
      if (!fetchImpl) return Promise.resolve({ status: 0, ok: false, json: null });
      var u = user(), headers = { Accept: 'application/json' }, url = apiBase + path;
      if (u.token) headers.Authorization = 'Bearer ' + u.token;
      if (u.userId) headers['x-user-id'] = u.userId;                       // honoured by softAuth outside production only
      if (o.withUser && u.userId) url += (url.indexOf('?') < 0 ? '?' : '&') + 'userId=' + encodeURIComponent(u.userId);
      var init = { method: method, headers: headers };
      if (body) {
        var b = {}; for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) b[k] = body[k];
        if (u.userId && b.userId == null) b.userId = u.userId;               // dev fallback (economy/home/race resolveUserId)
        if (o.idem) b.idempotencyKey = o.idem;
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(b);
      }
      if (o.idem) headers['Idempotency-Key'] = o.idem;
      var ctrl = null;
      try { if (typeof AbortController !== 'undefined') { ctrl = new AbortController(); init.signal = ctrl.signal; } } catch (e) {}
      return new Promise(function (resolve) {
        var done = false;
        var t = setTimeout(function () { if (done) return; done = true; try { if (ctrl) ctrl.abort(); } catch (e) {} resolve({ status: 0, ok: false, json: null, timeout: true }); }, TIMEOUT_MS);
        function finish(v) { if (done) return; done = true; clearTimeout(t); resolve(v); }
        var p;
        try { p = Promise.resolve(fetchImpl(url, init)); } catch (e) { return finish({ status: 0, ok: false, json: null }); }
        p.then(function (r) {
          var st = +r.status || 0, ok = r.ok != null ? !!r.ok : (st >= 200 && st < 300);
          var read = typeof r.text === 'function' ? r.text().then(function (txt) { try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; } })
            : (typeof r.json === 'function' ? r.json().catch(function () { return null; }) : Promise.resolve(null));
          return read.then(function (j) { finish({ status: st, ok: ok, json: j }); });
        }).catch(function () { finish({ status: 0, ok: false, json: null }); });
      });
    }
    function loadCopy() {
      if (copyCache) return Promise.resolve(copyCache);
      if (opts.copy) { copyCache = opts.copy; return Promise.resolve(copyCache); }
      if (!copyPromise) {
        copyPromise = (fetchImpl ? rawGet(copyUrl) : Promise.resolve(null)).then(function (j) { copyCache = j || {}; return copyCache; });
      }
      return copyPromise;
    }
    function rawGet(url) {   // same-origin static JSON (copy, plots): same timeout + never throws
      return new Promise(function (resolve) {
        var done = false, t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, TIMEOUT_MS);
        function fin(v) { if (!done) { done = true; clearTimeout(t); resolve(v); } }
        try {
          Promise.resolve(fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } })).then(function (r) {
            if (!r || (r.ok === false)) return fin(null);
            var read = typeof r.text === 'function' ? r.text().then(function (x) { try { return JSON.parse(x); } catch (e) { return null; } }) : r.json();
            return read.then(fin, function () { fin(null); });
          }).catch(function () { fin(null); });
        } catch (e) { fin(null); }
      });
    }

    // ── DOM ──
    function el(tag, cls, text) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = clean(text);
      return e;
    }
    function add(parent, child) { parent.appendChild(child); return child; }
    function clear(e) { while (e && e.firstChild) e.removeChild(e.firstChild); }
    function btn(label, cls, onClick, act) {
      var b = el('button', 'ca-btn' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      if (act) b.setAttribute('data-act', act);
      b.addEventListener('click', function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); if (!b.disabled) onClick(ev); });
      return b;
    }
    function priceSpan(n, unit, suffix) { return el('span', 'ca-price', n + ' ' + unitLabel(unit, n) + (suffix || '')); }
    function ensurePanel() {
      if (panel || !doc || !doc.createElement) return panel;
      styleEl = el('style'); styleEl.textContent = CSS;
      (doc.head || doc.body).appendChild(styleEl);
      panel = el('div'); panel.id = 'city-actions';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false');
      var head = add(panel, el('div', 'ca-head'));
      elTitle = add(head, el('h2', 'ca-title'));
      var x = add(head, btn('×', 'ca-x', function () { close(); }, 'close'));
      x.className = 'ca-x'; x.setAttribute('aria-label', 'Close');
      elPrompt = add(panel, el('p', 'ca-prompt'));
      elBody = add(panel, el('div', 'ca-body'));
      elMsg = add(panel, el('div', 'ca-msg info'));
      var foot = add(panel, el('div', 'ca-foot'));
      add(foot, el('span', null, 'Esc or E to close'));
      elDash = add(foot, el('a', null, 'View on dashboard'));
      elDash.target = '_blank'; elDash.rel = 'noopener';
      // keep game keys (WASD, E) away from the host while typing inside the panel
      panel.addEventListener('keydown', function (e) { var t = e && e.target; if (t && /^(INPUT|TEXTAREA)$/.test(String(t.tagName).toUpperCase()) && e.key !== 'Escape' && e.stopPropagation) e.stopPropagation(); });
      doc.body.appendChild(panel);
      return panel;
    }
    function say(text, kind) {
      if (!elMsg) return;
      elMsg.className = 'ca-msg ' + (kind || 'info');
      elMsg.textContent = clean(text || '');
    }

    // ── per-open context ──
    function makeCtx(m, copy) {
      var mySeq = seq;
      var c = lookupCopy(copy, m.name) || {};
      var vars = markerVars(m);
      var ctx = {
        marker: m, copy: c, vars: vars, body: elBody,
        alive: function () { return !disposed && seq === mySeq && openMarker === m; },
        api: api, el: el, add: add, btn: btn, clear: clear, say: say, priceSpan: priceSpan,
        text: function (k, extra) { var v = {}, key; for (key in vars) v[key] = vars[key]; for (key in (extra || {})) v[key] = extra[key]; return clean(fill(c[k], v) || ''); }
      };
      // res → handled? Shows the friendly state. Returns the outcome.
      ctx.handle = function (res, isNew, failKey) {
        var o = outcome(res, isNew);
        if (o.kind === 'ok') return o;
        if (o.kind === 'soon') { ctx.soon(); return o; }
        var t = o.text || ctx.text(failKey || 'toast_fail') || "That didn't go through. Nothing was spent.";
        say(t, 'err'); ping({ type: 'error', text: clean(t) });
        return o;
      };
      ctx.soon = function (text) {
        if (!ctx.alive()) return;
        clear(elBody);
        add(elBody, el('p', 'ca-sub', text || COMING_SOON));
        say('', 'info');
      };
      // price confirm → run(idemKey) → Promise<res>. Returns nothing; UI flows through callbacks.
      ctx.confirmSpend = function (spec) {
        // spec: { label, price, unit ('SPARKS'|'credits'), suffix?, reason, run(idem) → Promise<res>, isNew?, onOk(res), anchor? }
        if (busy || !ctx.alive()) return;
        var box = el('div', 'ca-confirm');
        box.setAttribute('data-confirm', '1');
        var line = add(box, el('div'));
        add(line, el('span', null, spec.label + ' · '));
        add(line, priceSpan(spec.price, spec.unit, spec.suffix));
        var row = add(box, el('div', 'ca-actions'));
        var yes = add(row, btn('Confirm', 'gold', function () {
          if (busy || !ctx.alive()) return;
          busy = true; yes.disabled = true; no.disabled = true;
          var idem = uuid();   // fresh key per click: retries of THIS click replay, a new click is a new purchase
          say('Working…', 'info');
          Promise.resolve(spec.run(idem)).then(function (res) {
            busy = false;
            if (box.parentNode) box.parentNode.removeChild(box);
            if (!ctx.alive()) return;
            var o = ctx.handle(res, spec.isNew);
            if (o.kind !== 'ok') return;
            var j = res.json || {}, replay = j.replayed === true;
            var n = typeof spec.spent === 'function' ? spec.spent(j) : spec.price;
            if (!replay && n > 0) {
              if (spec.unit === 'SPARKS') ping({ type: 'sparks:sink', sparks: -n, text: clean(spec.reason) });
              else ping({ type: 'credits:sink', text: clean('−' + n + ' ' + unitLabel(spec.unit, n) + ' · ' + spec.reason) });
            }
            if (spec.onOk) spec.onOk(res);
          });
        }, 'confirm'));
        var no = add(row, btn('Cancel', 'ghost', function () { if (box.parentNode) box.parentNode.removeChild(box); say('', 'info'); }, 'cancel'));
        if (activeConfirm && activeConfirm.parentNode) activeConfirm.parentNode.removeChild(activeConfirm);
        activeConfirm = box;
        add(spec.anchor || elBody, box);
        say('Check the price, then confirm.', 'info');
      };
      return ctx;
    }

    function renderLocked(ctx) {
      clear(elBody);
      var t = ctx.text('locked') || ('Needs ' + ctx.marker.skill + '. Learn it at the Academy.');
      add(elBody, el('p', 'ca-locked', t));
    }

    // ── families ──
    var FAMILIES = {};

    FAMILIES.generic = function (ctx) {
      clear(ctx.body);
      if (!ctx.marker.dashboard_id) add(ctx.body, el('p', 'ca-sub', 'Nothing to do here yet. Look around.'));
      return Promise.resolve();
    };

    FAMILIES.kiosk = function (ctx) {
      clear(ctx.body);
      var bal = add(ctx.body, el('div', 'ca-balance', '…'));
      add(ctx.body, el('div', 'ca-sub', 'Your SPARKS balance'));
      var list = add(ctx.body, el('div'));
      return Promise.all([api('GET', '/api/economy/balance', null, { withUser: true }), api('GET', '/api/economy/catalog')]).then(function (r) {
        if (!ctx.alive()) return;
        var ob = outcome(r[0], false), oc = outcome(r[1], false);
        if (ob.kind === 'soon' && oc.kind === 'soon') return ctx.soon();
        if (ob.kind === 'ok' && r[0].json && typeof r[0].json.sparks_balance === 'number') bal.textContent = r[0].json.sparks_balance + ' SPARKS';
        else bal.textContent = ob.kind === 'signin' ? '—' : '—';
        if (ob.kind === 'signin') say(SIGN_IN, 'info');
        else if (ob.kind === 'offline') say(ctx.text('toast_fail') || OFFLINE, 'err');
        if (oc.kind !== 'ok') { add(list, el('p', 'ca-sub', oc.kind === 'soon' ? COMING_SOON : 'The catalogue is quiet right now.')); return; }
        var items = ((r[1].json && r[1].json.items) || []).filter(function (it) { return it && typeof it.sparks_price === 'number' && it.sparks_price > 0; }).slice(0, 12);
        if (!items.length) { add(list, el('p', 'ca-sub', 'Nothing on the shelf today.')); return; }
        items.forEach(function (it) {
          var row = add(list, el('div', 'ca-row'));
          var g = add(row, el('div', 'ca-grow'));
          add(g, el('div', null, it.name || prettyId(it.id)));
          if (it.kind || it.rarity) add(g, el('div', 'ca-sub', [it.kind, it.rarity].filter(Boolean).join(' · ')));
          add(row, priceSpan(it.sparks_price, 'SPARKS'));
          add(row, btn('Buy', null, function () {
            ctx.confirmSpend({
              label: 'Buy ' + (it.name || prettyId(it.id)), price: it.sparks_price, unit: 'SPARKS', reason: it.name || 'Kiosk',
              spent: function (j) { return typeof j.spent === 'number' ? j.spent : it.sparks_price; },
              run: function (idem) { return api('POST', '/api/economy/catalog/purchase', { catalogId: it.id, qty: 1 }, { idem: idem }); },
              onOk: function (res) {
                var j = res.json || {};
                if (j.requiresStripe) { say('That one finishes on the dashboard.', 'info'); return; }
                if (typeof j.balance === 'number') bal.textContent = j.balance + ' SPARKS';
                say(ctx.text('toast_ok') || 'Done.', 'ok');
              }
            });
          }, 'buy:' + it.id));
        });
      });
    };

    FAMILIES.hire = function (ctx) {
      clear(ctx.body);
      add(ctx.body, el('div', 'ca-sub', "What's the job?"));
      var task = add(ctx.body, el('input', 'ca-input'));
      task.type = 'text'; task.placeholder = 'e.g. draft a launch post'; task.maxLength = 280;
      task.setAttribute('data-field', 'task');
      var list = add(ctx.body, el('div'));
      return api('GET', '/api/hire/rates').then(function (res) {
        if (!ctx.alive()) return;
        var o = outcome(res, routeIsNew(ctx.marker, 'hire'));
        if (o.kind === 'soon') return ctx.soon();
        if (o.kind !== 'ok') { ctx.handle(res, false); return; }
        var rates = (res.json && res.json.rates) || {};
        Object.keys(rates).forEach(function (agent) {
          var base = +(rates[agent] && rates[agent].base) || 0;
          if (!(base > 0)) return;
          var row = add(list, el('div', 'ca-row'));
          var g = add(row, el('div', 'ca-grow'));
          add(g, el('div', null, agent));
          add(g, el('div', 'ca-sub', 'deposit up front, settled when the job is done'));
          add(row, priceSpan(base, 'credits'));
          add(row, btn('Hire', null, function () {
            var job = String(task.value || '').trim();
            if (!job) { say('Say what the job is first.', 'info'); if (task.focus) task.focus(); return; }
            ctx.confirmSpend({
              label: 'Hire ' + agent + ' (deposit)', price: base, unit: 'credits', reason: 'Hire ' + agent,
              run: function (idem) { return api('POST', '/api/hire/' + encodeURIComponent(agent), { task: job.slice(0, 280) }, { idem: idem }); },
              onOk: function () { say(ctx.text('toast_ok') || 'Contract set.', 'ok'); ping({ type: 'hire', text: clean(ctx.text('toast_ok') || 'Contract set.') }); }
            });
          }, 'hire:' + agent));
        });
        if (!list.firstChild) add(list, el('p', 'ca-sub', ctx.text('toast_fail') || 'No one on the board right now.'));
      });
    };

    FAMILIES.academy = function (ctx) {
      clear(ctx.body);
      var list = add(ctx.body, el('div'));
      return api('GET', '/api/academy/catalog').then(function (res) {
        if (!ctx.alive()) return;
        var o = outcome(res, routeIsNew(ctx.marker, 'academy'));
        if (o.kind === 'soon') return ctx.soon();
        if (o.kind !== 'ok') { ctx.handle(res, false); return; }
        var rows = ((res.json && (res.json.results || res.json.items || res.json.classes)) || []).slice(0, 8);
        if (!rows.length) { add(list, el('p', 'ca-sub', ctx.text('toast_fail') || 'The board is blank for now.')); return; }
        rows.forEach(function (c) {
          var row = add(list, el('div', 'ca-row'));
          var g = add(row, el('div', 'ca-grow'));
          add(g, el('div', null, c.name || prettyId(c.provider || c.id)));
          if (c.useWhen || c.description) add(g, el('div', 'ca-sub', c.useWhen || c.description));
          if (ctx.marker.name === 'OBJ_CLASS_BOARD') return;                   // the board is read-only
          var info = el('div', 'ca-sub');
          add(row, btn('Details', 'ghost', function () {
            api('POST', '/api/academy/quote', { provider: c.provider }).then(function (q) {
              if (!ctx.alive()) return;
              if (outcome(q, false).kind !== 'ok') { ctx.handle(q, false); return; }
              var j = q.json || {};
              info.textContent = clean((j.needsChannel ? 'Runs as a metered tab. ' : 'Single call. ') + (j.humanApprovalRequired ? 'Needs your approval before it runs.' : 'No approval step.'));
              if (!info.parentNode) add(g, info);
              // /api/academy/open_tab opens a metered payment tab (not SPARKS tuition), so it is NOT offered in the street
              // until SPARKS tuition exists (docs/CITY-ACTIONS.md, "mismatches").
              say('Enrolling with SPARKS tuition opens soon. Enrol on the dashboard for now.', 'info');
            });
          }, 'quote:' + (c.provider || c.id)));
        });
      });
    };

    FAMILIES.seat = function (ctx) {
      clear(ctx.body);
      var q = add(ctx.body, el('input', 'ca-input'));
      q.type = 'text'; q.placeholder = 'Find a learned skill'; q.setAttribute('data-field', 'q');
      var list = add(ctx.body, el('div'));
      var seatMs = seatMsOpt != null ? seatMsOpt : ((+ctx.marker.props.seat_anim_s || 3) * 1000);
      function search() {
        var query = String(q.value || '').trim();
        return api('GET', '/api/skills/market?limit=6' + (query ? '&q=' + encodeURIComponent(query) : '')).then(function (res) {
          if (!ctx.alive()) return;
          clear(list);
          var o = outcome(res, routeIsNew(ctx.marker, 'skills-market'));
          if (o.kind === 'soon') return ctx.soon();
          if (o.kind !== 'ok') { ctx.handle(res, false); return; }
          var skills = ((res.json && res.json.skills) || []).slice(0, 6);
          if (!skills.length) { add(list, el('p', 'ca-sub', 'No skill by that name. Learn it at the Academy first.')); return; }
          skills.forEach(function (s) {
            var price = +s.price_credits || 0, name = s.name || s.id;
            var row = add(list, el('div', 'ca-row'));
            var g = add(row, el('div', 'ca-grow'));
            add(g, el('div', null, name));
            add(g, el('div', 'ca-sub', [s.seller_agent, s.rarity].filter(Boolean).join(' · ')));
            add(row, priceSpan(price, 'credits'));
            add(row, btn('Seat', null, function () {
              ctx.confirmSpend({
                label: 'Seat ' + name, price: price, unit: 'credits', reason: 'Seat ' + name,
                run: function (idem) {
                  // "the seat moment": a 3 s progress bar runs alongside the request; the ping waits for both
                  var bar = add(ctx.body, el('div', 'ca-bar')), fill_ = add(bar, el('i'));
                  bar.setAttribute('data-seat', '1');
                  var t0 = Date.now(), tick = setInterval(function () {
                    var k = Math.min(1, (Date.now() - t0) / Math.max(1, seatMs));
                    fill_.style.width = Math.round(k * 100) + '%';
                    if (k >= 1) clearInterval(tick);
                  }, 100);
                  say('Seating ' + name + '…', 'info');
                  var wait = new Promise(function (r) { setTimeout(r, seatMs); });
                  var req = api('POST', '/api/skills/market/' + encodeURIComponent(s.id) + '/run', { input: {}, user: user().userId || undefined }, { idem: idem });
                  return Promise.all([req, wait]).then(function (both) {
                    clearInterval(tick); fill_.style.width = '100%';
                    if (bar.parentNode) bar.parentNode.removeChild(bar);
                    return both[0];
                  });
                },
                onOk: function () {
                  var t = ctx.text('toast_ok', { skill: name }) || ('Click. ' + name + ' is seated.');
                  say(t, 'ok'); ping({ type: 'skill:seated', text: t });
                }
              });
            }, 'seat:' + s.id));
          });
        });
      }
      add(ctx.body, btn('Find', 'ghost', function () { search(); }, 'search'));
      return search();
    };

    FAMILIES.home = function (ctx) {
      clear(ctx.body);
      var m = ctx.marker, homeId = m.props.home_id || m.dashboard_id, isNew = routeIsNew(m, 'home');
      var rentDay = typeof m.sparks_price === 'number' ? m.sparks_price : (+m.props.rent_sparks_per_day || 5);
      function load() {
        return api('GET', '/api/home/status', null, { withUser: true }).then(function (res) {
          if (!ctx.alive()) return;
          var o = outcome(res, isNew);
          if (o.kind === 'soon') return ctx.soon('Homes open soon. The lights are wired; the lease desk is not staffed yet.');
          if (o.kind !== 'ok') { ctx.handle(res, isNew); return; }
          clear(ctx.body);
          var s = res.json || {};
          if (typeof s.balance === 'number') add(ctx.body, el('div', 'ca-sub', 'Balance: ' + s.balance + ' SPARKS'));
          if (s.housed && s.home_id && s.home_id !== homeId) {
            add(ctx.body, el('p', null, 'You live at ' + prettyId(s.home_id) + '. One home at a time.'));
            return;
          }
          if (!s.housed) {
            add(ctx.body, el('p', null, 'This home is open to rent.'));
            var r = add(ctx.body, el('div', 'ca-row'));
            add(r, el('div', 'ca-grow', 'Rent'));
            add(r, priceSpan(rentDay, 'SPARKS', '/day'));
            add(r, btn('Move in', 'gold', function () {
              ctx.confirmSpend({
                label: 'Move in and pay today', price: rentDay, unit: 'SPARKS', suffix: '', reason: 'Rent · ' + (ctx.text('title') || prettyId(homeId)), isNew: isNew,
                spent: function (j) { return j.replayed ? 0 : rentDay; },
                run: function (idem) { return api('POST', '/api/home/inhabit', { homeId: homeId }, { idem: idem }); },
                onOk: function () { say('The lights are on. Welcome home.', 'ok'); load(); }
              });
            }, 'inhabit'));
            return;
          }
          var stateText = { lit: 'Lit. Rent is paid.', rent_due: 'Rent is due. Still lit for now.', lapsed: 'Lapsed. The windows are dim.' };
          add(ctx.body, el('p', null, stateText[s.state] || prettyId(s.state)));
          if (s.paid_through) add(ctx.body, el('div', 'ca-sub', 'Paid through ' + s.paid_through));
          if (s.state === 'lapsed') {
            add(ctx.body, btn('Move back in', 'gold', function () {
              ctx.confirmSpend({
                label: 'Relight this home', price: rentDay, unit: 'SPARKS', reason: 'Rent · ' + prettyId(homeId), isNew: isNew,
                run: function (idem) { return api('POST', '/api/home/inhabit', { homeId: homeId }, { idem: idem }); },
                onOk: function () { say('The lights are back.', 'ok'); load(); }
              });
            }, 'inhabit'));
            return;
          }
          var due = +s.rent_due || 0;
          if (due > 0) {
            var rr = add(ctx.body, el('div', 'ca-row'));
            add(rr, el('div', 'ca-grow', 'Rent due'));
            add(rr, priceSpan(due, 'SPARKS'));
            add(rr, btn('Pay rent', 'gold', function () {
              ctx.confirmSpend({
                label: 'Pay rent', price: due, unit: 'SPARKS', reason: 'Rent · ' + prettyId(homeId), isNew: isNew,
                spent: function (j) { return typeof j.spent === 'number' ? j.spent : due; },
                run: function (idem) { return api('POST', '/api/home/rent', { homeId: homeId }, { idem: idem }); },
                onOk: function () { say('Rent paid. The lights stay warm.', 'ok'); load(); }
              });
            }, 'rent'));
          }
          if (s.state === 'lit' && !s.checked_in_today) {
            add(ctx.body, btn('Check in', null, function (ev) {   // a capped grant, not a spend: no price, no confirm
              if (busy) return;
              busy = true;
              api('POST', '/api/home/checkin', { homeId: homeId }, { idem: uuid() }).then(function (res2) {
                busy = false;
                if (!ctx.alive()) return;
                if (ctx.handle(res2, isNew).kind !== 'ok') return;
                var g = +(res2.json && res2.json.granted) || 0, t = ctx.text('toast_ok') || 'Check-in logged.';
                say(t, 'ok');
                ping(g > 0 ? { type: 'sparks:mint', sparks: g, text: 'Home check-in' } : { type: 'home', text: t });
                load();
              });
            }, 'checkin'));
          } else if (s.checked_in_today) add(ctx.body, el('div', 'ca-sub', 'Checked in today.'));
        });
      }
      return load();
    };

    FAMILIES.race = function (ctx) {
      clear(ctx.body);
      var m = ctx.marker, isGate = m.name === 'GATE_START' || m.dashboard_id === 'race.gate', isNew = routeIsNew(m, 'race');
      return Promise.all([api('GET', '/api/race/track'), api('GET', '/api/race/heats?state=open')]).then(function (r) {
        if (!ctx.alive()) return;
        var ot = outcome(r[0], isNew), oh = outcome(r[1], isNew);
        if (ot.kind === 'soon' || oh.kind === 'soon') return ctx.soon('The Ring opens soon. The gate is built; heats are not running yet.');
        if (oh.kind !== 'ok') { ctx.handle(r[1], isNew); return; }
        clear(ctx.body);
        var tr = r[0].json || {};
        if (ot.kind === 'ok') add(ctx.body, el('div', 'ca-sub', 'The Ring · ' + (tr.direction || 'counter-clockwise') + ' · ' + ((tr.pits && tr.pits.length) || 8) + ' pits'));
        if (!isGate) add(ctx.body, el('div', 'ca-sub', 'Pit service opens soon. Pits are assigned free when you enter a heat.'));
        var heats = ((r[1].json && r[1].json.heats) || []).filter(function (h) { return h && h.state === 'open'; }).slice(0, 6);
        if (!heats.length) { add(ctx.body, el('p', null, 'No heat is open right now. Watch the Race Tower.')); return; }
        heats.forEach(function (h) {
          var fee = +h.entry_fee || (typeof m.sparks_price === 'number' ? m.sparks_price : 10);
          var row = add(ctx.body, el('div', 'ca-row'));
          var g = add(row, el('div', 'ca-grow'));
          add(g, el('div', null, 'Heat ' + h.heat_id));
          add(g, el('div', 'ca-sub', (h.pits_free != null ? h.pits_free : '?') + ' pits free · pool ' + (+h.pool || 0) + ' SPARKS'));
          add(row, priceSpan(fee, 'SPARKS'));
          if (!isGate) return;
          add(row, btn('Enter', 'gold', function () {
            ctx.confirmSpend({
              label: 'Enter heat ' + h.heat_id, price: fee, unit: 'SPARKS', reason: 'Race entry', isNew: isNew,
              run: function (idem) { return api('POST', '/api/race/heats/' + encodeURIComponent(h.heat_id) + '/enter', {}, { idem: idem }); },
              onOk: function (res) {
                var pit = String((res.json && res.json.pit) || ''), lane = (pit.match(/(\d+)$/) || [])[1];
                var t = ctx.text('toast_ok', { lane: lane ? parseInt(lane, 10) : '?' }) || "You're on the grid.";
                say(t, 'ok'); ping({ type: 'race', text: t });
              }
            });
          }, 'enter:' + h.heat_id));
        });
      });
    };

    // ?shops=1 (or opts.shops): real store menu from world-shops.js. Closed-loop SPARKS: buy = sink, sell = 40% refund.
    function shopsOn() {
      if (opts.shops != null) return !!opts.shops;
      try { return /[?&]shops=1(&|$)/.test(String((win.location && win.location.search) || '')); } catch (e) { return false; }
    }
    var shopCache = {};
    function renderShop(ctx, type) {
      var WS = win.WorldShops, m = ctx.marker, tab = 'buy', armed = null;
      var shop = shopCache[m.name] || (shopCache[m.name] = WS.create({ key: m.name, type: type, seed: m.name }));
      function refresh() {
        if (!ctx.alive()) return;
        clear(ctx.body);
        var bal = add(ctx.body, el('div', 'ca-balance', shop.balance() + ' SPARKS'));
        bal.setAttribute('data-shop-balance', '1');
        add(ctx.body, el('div', 'ca-sub', 'Your SPARKS balance · ' + prettyId(type)));
        if (shop.isBank()) { add(ctx.body, el('p', 'ca-sub', 'The ledger desk. Read-only: SPARKS stay in the city and are only spent here.')); return; }
        var tabs = add(ctx.body, el('div', 'ca-row'));
        add(tabs, btn('Buy', tab === 'buy' ? 'gold' : 'ghost', function () { tab = 'buy'; armed = null; refresh(); }, 'tab:buy'));
        add(tabs, btn('Sell', tab === 'sell' ? 'gold' : 'ghost', function () { tab = 'sell'; armed = null; refresh(); }, 'tab:sell'));
        var list = add(ctx.body, el('div'));
        if (tab === 'buy') {
          shop.stock().forEach(function (it) {
            var row = add(list, el('div', 'ca-row'));
            var g = add(row, el('div', 'ca-grow'));
            add(g, el('div', null, it.name));
            add(g, el('div', 'ca-sub', it.desc + ' · ' + it.qty + ' left'));
            add(row, priceSpan(it.price, 'SPARKS'));
            var can = it.qty > 0 && shop.balance() >= it.price;
            var b = add(row, btn(armed === it.id ? 'Confirm' : 'Buy', armed === it.id ? 'gold' : null, function () {
              if (armed !== it.id) { armed = it.id; say('Check the price, then confirm.', 'info'); refresh(); return; }
              armed = null;
              var r = shop.buy(it.id);
              say(r.msg, r.ok ? 'ok' : 'err');
              if (r.ok) ping({ type: 'sparks:sink', sparks: -r.price, text: clean('Shop · ' + it.name) });
              refresh();
            }, 'buy:' + it.id));
            if (!can) b.disabled = true;
          });
        } else {
          var own = shop.owned();
          if (!own.length) add(list, el('p', 'ca-sub', 'Nothing to sell. The shop pays 40% of the price.'));
          own.forEach(function (o) {
            var row = add(list, el('div', 'ca-row'));
            var g = add(row, el('div', 'ca-grow'));
            add(g, el('div', null, o.name));
            add(g, el('div', 'ca-sub', 'x' + o.count));
            add(row, priceSpan(o.refund, 'SPARKS'));
            add(row, btn('Sell', null, function () {
              var r = shop.sell(o.id);
              say(r.msg, r.ok ? 'ok' : 'err');
              if (r.ok && r.refund > 0) ping({ type: 'sparks:mint', sparks: r.refund, text: 'Shop refund' });
              refresh();
            }, 'sell:' + o.id));
          });
        }
      }
      refresh();
      return Promise.resolve();
    }

    FAMILIES.bazaar = function (ctx) {
      if (shopsOn() && win.WorldShops) {
        var st = win.WorldShops.typeForMarker(ctx.marker);
        if (st) return renderShop(ctx, st);
      }
      clear(ctx.body);
      var list = add(ctx.body, el('div'));
      return api('GET', '/api/bazaar/list').then(function (res) {
        if (!ctx.alive()) return;
        var o = outcome(res, routeIsNew(ctx.marker, 'bazaar'));
        if (o.kind === 'soon') return ctx.soon();
        if (o.kind !== 'ok') { ctx.handle(res, false); return; }
        var rows = ((res.json && res.json.listings) || []).slice(0, 8);
        if (!rows.length) add(list, el('p', 'ca-sub', ctx.text('toast_fail') || 'Nothing listed right now.'));
        rows.forEach(function (it) {
          var row = add(list, el('div', 'ca-row'));
          var g = add(row, el('div', 'ca-grow'));
          add(g, el('div', null, it.name || 'Untitled'));
          add(g, el('div', 'ca-sub', [it.kind, it.seller ? 'by ' + it.seller : ''].filter(Boolean).join(' · ')));
          if (+it.price > 0) add(row, priceSpan(+it.price, 'credits'));
        });
        add(ctx.body, el('p', 'ca-sub', 'Buying in the street opens soon. Browse and buy on the dashboard for now.'));
      });
    };

    FAMILIES.plots = function (ctx) {
      clear(ctx.body);
      var m = ctx.marker;
      function show(counts, total) {
        if (!ctx.alive()) return;
        clear(ctx.body);
        add(ctx.body, el('p', null, total + ' plots in the south-west district'));
        ['empty', 'claimed', 'built', 'listed', 'lapsed'].forEach(function (k) {
          var r = add(ctx.body, el('div', 'ca-row'));
          add(r, el('div', 'ca-grow', { empty: 'Open', claimed: 'Claimed', built: 'Built', listed: 'Listed', lapsed: 'Lapsed' }[k]));
          add(r, el('div', null, String(counts[k] || 0)));
        });
        if (m.name === 'BUILDER_YARD' && Array.isArray(m.props.catalogue)) {
          add(ctx.body, el('div', 'ca-sub', 'Building kits: ' + m.props.catalogue.map(prettyId).join(', ')));
        }
        var b = add(ctx.body, btn(m.name === 'BUILDER_YARD' ? 'Build · coming soon' : 'Claim · coming soon', 'ghost', function () {}, 'claim'));
        b.disabled = true;
        add(ctx.body, el('p', 'ca-sub', 'Claiming a plot in the city opens soon. The fee is set by plot size.'));
      }
      var st = null;
      try { st = opts.city && opts.city.stats ? opts.city.stats() : null; } catch (e) { st = null; }
      if (st && st.loaded && st.plotsByState) { show(st.plotsByState, st.plots); return Promise.resolve(); }
      return (fetchImpl ? rawGet(plotsUrl) : Promise.resolve(null)).then(function (j) {
        var rows = (j && (Array.isArray(j) ? j : j.plots)) || [], c = {};
        rows.forEach(function (p) { var s = p && p.state || 'empty'; c[s] = (c[s] || 0) + 1; });
        if (!rows.length) return ctx.soon('Plot records are loading. Try again in a moment.');
        show(c, rows.length);
      });
    };

    // ── open / close ──
    function onKey(e) {
      if (!openMarker || !e) return;
      var isEsc = e.key === 'Escape' || e.code === 'Escape';
      var isE = (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!isEsc && !isE) return;
      var t = e.target, tag = t && String(t.tagName || '').toUpperCase();
      if (isE && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable))) return;
      close();
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (keyTarget && keyTarget.addEventListener) keyTarget.addEventListener('keydown', onKey, true);

    function open(marker) {
      if (disposed || !marker || !doc) return Promise.resolve(false);
      if (openMarker && openMarker.name === marker.name) { close(); return Promise.resolve(false); }   // E again at the same marker toggles
      if (!ensurePanel()) return Promise.resolve(false);
      var m = marker; if (!m.props) m.props = {};
      seq++; openMarker = m; busy = false;
      // pointer-lock friendly: free the cursor so the panel can be clicked; the host may re-lock in onClose
      wasLocked = !!(doc.pointerLockElement);
      if (wasLocked && doc.exitPointerLock) { try { doc.exitPointerLock(); } catch (e) {} }
      elTitle.textContent = clean(m.title || m.name);
      elPrompt.textContent = '';
      clear(elBody); add(elBody, el('div', 'ca-sub', '…'));
      say('', 'info');
      var dash = m.dashboard_id || (m.props && m.props.dashboard_id);
      elDash.style.display = dash ? '' : 'none';
      if (dash) elDash.href = dashboardHref(dash);
      panel.className = 'open';
      panel.setAttribute('data-family', family(m));
      panel.setAttribute('data-marker', m.name);
      if (opts.onOpen) { try { opts.onOpen(m); } catch (e) {} }
      var mySeq = seq;
      return loadCopy().then(function (copy) {
        if (seq !== mySeq || disposed) return false;
        var ctx = makeCtx(m, copy);
        var title = ctx.text('title'); if (title) elTitle.textContent = title;
        elPrompt.textContent = ctx.text('prompt');
        if (m.skill && opts.hasSkill) {
          var has; try { has = opts.hasSkill(m.skills && m.skills.length ? m.skills : [m.skill], m); } catch (e) { has = undefined; }
          if (has === false) { renderLocked(ctx); return true; }
        }
        var fam = FAMILIES[family(m)] || FAMILIES.generic;
        return Promise.resolve(fam(ctx)).then(function () { return true; }, function () { if (ctx.alive()) ctx.soon(); return true; });
      });
    }
    function close() {
      if (!openMarker) return;
      var m = openMarker;
      openMarker = null; seq++; busy = false;
      if (panel) { panel.className = ''; clear(elBody); say('', 'info'); }
      if (opts.onClose) { try { opts.onClose({ marker: m, wasLocked: wasLocked }); } catch (e) {} }
    }
    function dispose() {
      close(); disposed = true;
      if (keyTarget && keyTarget.removeEventListener) keyTarget.removeEventListener('keydown', onKey, true);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      if (win.__onCityInteract === bound) win.__onCityInteract = undefined;
    }
    var api_ = { open: open, close: close, isOpen: function () { return !!openMarker; }, current: function () { return openMarker; }, dispose: dispose };
    var bound = function (m) { return api_.open(m); };
    if (opts.bindGlobal !== false && root) root.__onCityInteract = bound;
    return api_;
  }

  var PURE = { clean: clean, familyKey: familyKey, lookupCopy: lookupCopy, fill: fill, markerVars: markerVars, family: family,
    routeIsNew: routeIsNew, outcome: outcome, uuid: uuid, FORBIDDEN: FORBIDDEN, COMING_SOON: COMING_SOON, PAY_IN: PAY_IN };
  build.pure = PURE;
  if (root) root.buildCityActions = build;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; module.exports.build = build; }
})(typeof window !== 'undefined' ? window : null);
