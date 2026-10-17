/* world-hud-v4.js — small DOM HUD for the 3D world (Map v4), 2026-09-27.
 *
 *   • VITALS (bottom-left): thin HP bar (emerald → gold < 35 → red < 15) + slimmer stamina bar; a subtle red edge flash
 *     whenever HP drops. A "PACK HUNTING" chip above them while wolves are hostile (wildlife.stats().hostile > 0).
 *   • BOSS (top-centre): dragon name + HP while a dragon engages (dragons 'telegraph' / 'attack' / 'hit' / 'hurt' events,
 *     or stats().attacker). Fades 1.5 s after 'defeated', or after 4 s without contact.
 *   • PINGS (right side): stacked toasts, max 4, 3 s each — `+5 SPARKS · Class complete`, `Plot PLOT-SW-0012 claimed`,
 *     `Art placed`. DISPLAY ONLY — no economy logic here; the dashboard/backend owns SPARKS.
 *   • PERF: DOM is written at most 10×/s and only when a value actually changed (cached per field). Respects
 *     prefers-reduced-motion (no flash, no transitions/animations). Scales down under 600 px width.
 *
 *   window.buildHudV4({ getHP: () => 0..100, getStamina: () => 0..1, dragons: api|null, wildlife: api|null,
 *                       parent?: Element (default document.body), reducedMotion?: bool (default: media query) })
 *     → { update(dt), ping(evt) → bool, setBoss(name|null, hp01), dispose() }
 *   ping(evt): { type, text?, sparks? } generic; also understands the city-v3 events
 *              {type:'plot', plot_id, state} and {type:'art', slot_id, filled}.
 *   window.buildHudV4.pure = { hpLevel, formatPing, fmtSparks }   (for tests)
 * See docs/HUD-V4.md for host wiring.
 */
(function () {
  'use strict';
  var TICK = 0.1, TOAST_MAX = 4, TOAST_LIFE = 3, TOAST_OUT = 0.3, BOSS_IDLE = 4, BOSS_DEFEAT_HOLD = 1.5, FLASH = 0.35;
  var CONTACT_EVENTS = ['telegraph', 'attack', 'hit', 'hurt', 'interrupt', 'downed', 'defeated'];

  function clamp(v, lo, hi) { v = +v; if (!(v === v)) return lo; return v < lo ? lo : v > hi ? hi : v; }
  function hpLevel(hp) { hp = +hp; return hp < 15 ? 'crit' : hp < 35 ? 'warn' : 'ok'; }
  function fmtSparks(n) { n = Math.round(+n); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + ' SPARKS'; }
  function human(s) { s = String(s || '').replace(/[_-]+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  var PLOT_WORDS = { empty: 'released', claimed: 'claimed', built: 'built', listed: 'listed', lapsed: 'lapsed' };

  // evt → { sparks: 'text'|null, text: 'text', kind: css-safe } | null
  function formatPing(evt) {
    if (!evt || typeof evt !== 'object') return null;
    var type = String(evt.type || 'info');
    var amt = typeof evt.sparks === 'number' ? evt.sparks : (type === 'sparks' && typeof evt.amount === 'number' ? evt.amount : NaN);
    var sparks = isFinite(amt) && Math.round(amt) !== 0 ? fmtSparks(amt) : null;
    var text = typeof evt.text === 'string' && evt.text ? evt.text : '';
    if (!text) {
      if (type === 'plot') text = 'Plot ' + (evt.plot_id || '?') + ' ' + (PLOT_WORDS[evt.state] || human(evt.state) || 'updated');
      else if (type === 'art') text = evt.filled === false ? 'Art slot cleared' : 'Art placed';
      else if (typeof evt.label === 'string' && evt.label) text = evt.label;
      else if (typeof evt.reason === 'string' && evt.reason) text = human(evt.reason);
      else if (!sparks) text = human(type);
    }
    if (text.length > 80) text = text.slice(0, 79) + '…';
    if (!text && !sparks) return null;
    var kind = sparks ? (amt < 0 ? 'sink' : 'mint') : type.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'info';
    return { sparks: sparks, text: text, kind: kind };
  }

  var CSS = [
    '#hudV4{position:fixed;inset:0;z-index:22;pointer-events:none;--hv-bg:rgba(6,8,11,.78);--hv-ink:#06080b;--hv-em:#00ff9c;--hv-gold:#e8c45c;--hv-red:#ff3b5c;',
    '  font:600 10px/1.25 ui-monospace,"SFMono-Regular",Consolas,monospace;letter-spacing:.14em;color:rgba(225,240,232,.78);text-transform:uppercase}',
    '#hudV4 .hv-vitals{position:absolute;left:24px;bottom:44px;width:220px}',
    '#hudV4 .hv-bar{display:flex;align-items:center;gap:8px;margin-top:5px}',
    '#hudV4 .hv-lbl{width:22px;font-size:9px;opacity:.6}',
    '#hudV4 .hv-num{width:24px;text-align:right;font-size:9px;opacity:.75}',
    '#hudV4 .hv-track{position:relative;flex:1;height:5px;background:var(--hv-bg);border:1px solid rgba(0,255,156,.2);overflow:hidden;',
    '  clip-path:polygon(0 0,100% 0,calc(100% - 5px) 100%,0 100%)}',
    '#hudV4 .hv-fill{position:absolute;inset:0;transform-origin:0 50%;background:linear-gradient(90deg,rgba(0,255,156,.55),var(--hv-em));',
    '  box-shadow:0 0 8px rgba(0,255,156,.55);transition:transform .18s ease-out,background .3s}',
    '#hudV4 .hv-hp.warn .hv-fill{background:linear-gradient(90deg,rgba(232,196,92,.55),var(--hv-gold));box-shadow:0 0 8px rgba(232,196,92,.6)}',
    '#hudV4 .hv-hp.warn .hv-track{border-color:rgba(232,196,92,.35)}',
    '#hudV4 .hv-hp.crit .hv-fill{background:linear-gradient(90deg,rgba(255,59,92,.6),var(--hv-red));box-shadow:0 0 10px rgba(255,59,92,.7);animation:hvPulse 1s ease-in-out infinite}',
    '#hudV4 .hv-hp.crit .hv-track{border-color:rgba(255,59,92,.45)}',
    '#hudV4 .hv-hp.crit .hv-num{color:var(--hv-red);opacity:1}',
    '#hudV4 .hv-st .hv-track{height:3px;border-color:rgba(0,255,156,.12)}',
    '#hudV4 .hv-st .hv-fill{background:rgba(160,255,215,.75);box-shadow:none}',
    '#hudV4 .hv-st{transition:opacity .4s}',
    '#hudV4 .hv-st.full{opacity:.35}',
    '#hudV4 .hv-st.low .hv-fill{background:var(--hv-gold)}',
    '#hudV4 .hv-pack{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;margin-bottom:4px;font-size:9px;color:var(--hv-red);',
    '  background:var(--hv-bg);border:1px solid rgba(255,59,92,.35);opacity:0;transform:translateY(4px);transition:opacity .3s,transform .3s}',
    '#hudV4 .hv-pack.on{opacity:1;transform:none}',
    '#hudV4 .hv-pack i{width:6px;height:6px;border-radius:50%;background:var(--hv-red);box-shadow:0 0 6px var(--hv-red);animation:hvPulse 1.2s ease-in-out infinite}',
    '#hudV4 .hv-boss{position:absolute;top:64px;left:50%;width:min(460px,70vw);transform:translate(-50%,-6px);opacity:0;transition:opacity .45s,transform .45s}',
    '#hudV4 .hv-boss.on{opacity:1;transform:translate(-50%,0)}',
    '#hudV4 .hv-boss-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;color:var(--hv-gold);font-size:11px;text-shadow:0 0 10px rgba(232,196,92,.35)}',
    '#hudV4 .hv-boss-pct{font-size:9px;opacity:.75}',
    '#hudV4 .hv-boss .hv-track{height:6px;border-color:rgba(232,196,92,.3);clip-path:polygon(5px 0,100% 0,calc(100% - 5px) 100%,0 100%)}',
    '#hudV4 .hv-boss .hv-fill{background:linear-gradient(90deg,var(--hv-red),var(--hv-gold));box-shadow:0 0 10px rgba(232,196,92,.45)}',
    '#hudV4 .hv-boss.down .hv-boss-row{color:var(--hv-em)}',
    '#hudV4 .hv-toasts{position:absolute;right:18px;top:36%;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:320px}',
    '#hudV4 .hv-toast{padding:7px 12px;background:var(--hv-bg);border-left:2px solid var(--hv-em);font-size:10px;letter-spacing:.08em;text-transform:none;',
    '  color:rgba(235,245,240,.9);box-shadow:0 6px 18px -8px #000;animation:hvIn .25s ease-out;transition:opacity .3s,transform .3s}',
    '#hudV4 .hv-toast.mint,#hudV4 .hv-toast.sink{border-left-color:var(--hv-gold)}',
    '#hudV4 .hv-toast.out{opacity:0;transform:translateX(10px)}',
    '#hudV4 .hv-sp{color:var(--hv-gold);font-weight:700;letter-spacing:.12em}',
    '#hudV4 .hv-sep{opacity:.45}',
    '#hudV4 .hv-flash{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 110px rgba(255,40,70,.42);transition:opacity .35s ease-out}',
    '#hudV4 .hv-flash.on{opacity:1;transition:none}',
    '@keyframes hvPulse{0%,100%{opacity:1}50%{opacity:.55}}',
    '@keyframes hvIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}',
    '@media (max-width:600px){',
    '  #hudV4{font-size:8.5px}',
    '  #hudV4 .hv-vitals{left:12px;bottom:36px;width:150px}',
    '  #hudV4 .hv-boss{top:52px;width:80vw}',
    '  #hudV4 .hv-boss-row{font-size:9.5px}',
    '  #hudV4 .hv-toasts{right:8px;top:30%;max-width:62vw}',
    '  #hudV4 .hv-toast{font-size:9px;padding:5px 9px}',
    '}',
    '@media (prefers-reduced-motion:reduce){#hudV4 *{transition:none!important;animation:none!important}}',
    '#hudV4.hv-rm *{transition:none!important;animation:none!important}'
  ].join('\n');

  function buildHudV4(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('buildHudV4: no document');
    var getHP = typeof opts.getHP === 'function' ? opts.getHP : function () { return 100; };
    var getSt = typeof opts.getStamina === 'function' ? opts.getStamina : function () { return 1; };
    var dragons = opts.dragons || null, wildlife = opts.wildlife || null;
    var reduced = opts.reducedMotion != null ? !!opts.reducedMotion : (function () {
      try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    })();

    // ── DOM (built once) ──
    function el(tag, cls, parent, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
    var style = doc.getElementById ? doc.getElementById('hud-v4-style') : null, ownStyle = false;
    if (!style) { style = el('style'); style.id = 'hud-v4-style'; style.textContent = CSS; (doc.head || doc.body).appendChild(style); ownStyle = true; }
    var root = el('div', reduced ? 'hv-rm' : ''); root.id = 'hudV4';
    try { root.setAttribute && root.setAttribute('aria-hidden', 'true'); } catch (e) {}
    var flash = el('div', 'hv-flash', root);
    var boss = el('div', 'hv-boss', root);
    var bossRow = el('div', 'hv-boss-row', boss);
    var bossName = el('span', 'hv-boss-name', bossRow, '');
    var bossPct = el('span', 'hv-boss-pct', bossRow, '');
    var bossFill = el('div', 'hv-fill', el('div', 'hv-track', boss));
    var toastBox = el('div', 'hv-toasts', root);
    var vitals = el('div', 'hv-vitals', root);
    var pack = el('div', 'hv-pack', vitals); el('i', '', pack); var packTxt = el('span', '', pack, 'PACK HUNTING');
    var hpRow = el('div', 'hv-bar hv-hp ok', vitals); el('span', 'hv-lbl', hpRow, 'HP');
    var hpFill = el('div', 'hv-fill', el('div', 'hv-track', hpRow)); var hpNum = el('span', 'hv-num', hpRow, '100');
    var stRow = el('div', 'hv-bar hv-st full', vitals); el('span', 'hv-lbl', stRow, 'STA');
    var stFill = el('div', 'hv-fill', el('div', 'hv-track', stRow)); el('span', 'hv-num', stRow, '');
    (opts.parent || doc.body).appendChild(root);

    // ── state ──
    var t = 0, acc = TICK, writes = 0, disposed = false;
    var last = {};                  // field → last written value (DOM written only on change)
    var prevHP = null, flashUntil = -1;
    var B = null;                   // {id, name, hp01, last, defeatedAt}
    var toasts = [];                // {el, until, out}
    var unsub = [];

    function put(node, key, val, kind) {
      if (last[key] === val) return;
      last[key] = val; writes++;
      if (kind === 'text') node.textContent = val; else if (kind === 'class') node.className = val; else node.style[kind] = val;
    }
    function safe(fn, dflt) { try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

    // ── boss (dragons) ──
    function findDragon(id) {
      if (!dragons || id == null) return null;
      if (dragons.core && typeof dragons.core.byId === 'function') return dragons.core.byId(id);
      var list = dragons.dragons || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }
    function contact(id, hp01) {
      var d = findDragon(id);
      if (!B || B.id !== id) {
        if (d && d.defeated) return;                 // a bowed dragon never "engages"
        B = { id: id, name: (d && d.name) || String(id), hp01: 1, last: t, defeatedAt: null };
      }
      B.last = t;
      if (hp01 != null) B.hp01 = clamp(hp01, 0, 1); else if (d && d.hpMax > 0) B.hp01 = clamp(d.hp / d.hpMax, 0, 1);
    }
    function onDragonEvent(ev) {
      return function (e) {
        if (disposed || !e || e.id == null) return;
        if (ev === 'defeated') { if (B && B.id === e.id) { B.hp01 = 0; B.defeatedAt = t; } return; }
        if (ev === 'downed') { if (B && B.id === e.id) { B.hp01 = 0; B.last = t; } return; }
        contact(e.id, ev === 'hurt' && e.hpMax > 0 ? e.hp / e.hpMax : null);
      };
    }
    if (dragons && typeof dragons.on === 'function') {
      CONTACT_EVENTS.forEach(function (ev) {
        var fn = onDragonEvent(ev), u = dragons.on(ev, fn);
        unsub.push(typeof u === 'function' ? u : function () { if (dragons.off) dragons.off(ev, fn); });
      });
    }
    function bossVisible() {
      if (!B) return false;
      return B.defeatedAt != null ? (t - B.defeatedAt) < BOSS_DEFEAT_HOLD : (t - B.last) < BOSS_IDLE;
    }

    // ── render (≤ 10×/s, change-only) ──
    function render() {
      var hp = Math.round(clamp(safe(getHP, 100), 0, 100));
      put(hpFill, 'hpT', 'scaleX(' + (hp / 100) + ')', 'transform');
      put(hpNum, 'hpN', String(hp), 'text');
      put(hpRow, 'hpC', 'hv-bar hv-hp ' + hpLevel(hp), 'class');
      put(flash, 'fl', t < flashUntil ? 'hv-flash on' : 'hv-flash', 'class');

      var st = Math.round(clamp(safe(getSt, 1), 0, 1) * 100);
      put(stFill, 'stT', 'scaleX(' + (st / 100) + ')', 'transform');
      put(stRow, 'stC', 'hv-bar hv-st' + (st >= 100 ? ' full' : st < 20 ? ' low' : ''), 'class');

      if (wildlife && typeof wildlife.stats === 'function') {
        var h = +safe(function () { return wildlife.stats().hostile; }, 0) || 0;
        put(pack, 'pkC', h > 0 ? 'hv-pack on' : 'hv-pack', 'class');
        if (h > 0) put(packTxt, 'pkT', 'PACK HUNTING · ' + h, 'text');
      }

      if (dragons && typeof dragons.stats === 'function') {
        var att = safe(function () { return dragons.stats().attacker; }, null);
        if (att != null) contact(att, null);
        else if (B && B.defeatedAt == null) { var d = findDragon(B.id); if (d && d.hpMax > 0) B.hp01 = clamp(d.hp / d.hpMax, 0, 1); }
      }
      var vis = bossVisible();
      put(boss, 'bC', 'hv-boss' + (vis ? ' on' : '') + (B && B.defeatedAt != null ? ' down' : ''), 'class');
      if (B) {
        var pct = Math.round(B.hp01 * 100);
        put(bossName, 'bN', B.defeatedAt != null ? B.name + ' · defeated' : B.name, 'text');
        put(bossPct, 'bP', pct + '%', 'text');
        put(bossFill, 'bT', 'scaleX(' + (pct / 100) + ')', 'transform');
      }
      if (!vis && B && (B.defeatedAt != null || t - B.last > BOSS_IDLE + 1)) B = null;   // forget after the fade

      for (var i = toasts.length - 1; i >= 0; i--) {
        var q = toasts[i];
        if (t >= q.until) { removeToast(i); continue; }
        if (!q.out && t >= q.until - TOAST_OUT) { q.out = true; q.el.className += ' out'; writes++; }
      }
    }

    function removeToast(i) { var q = toasts[i]; toasts.splice(i, 1); if (q.el.parentNode) q.el.parentNode.removeChild(q.el); writes++; }

    // ── public ──
    function update(dt) {
      if (disposed) return;
      dt = clamp(dt, 0, 1); t += dt;
      var hpNow = +safe(getHP, prevHP == null ? 100 : prevHP);
      if (prevHP != null && hpNow < prevHP - 0.5 && !reduced) flashUntil = t + FLASH;   // caught every frame, drawn at the tick
      if (hpNow === hpNow) prevHP = hpNow;
      acc += dt;
      if (acc < TICK) return;
      acc = acc % TICK;
      render();
    }
    function ping(evt) {
      if (disposed) return false;
      var f = formatPing(evt); if (!f) return false;
      var node = el('div', 'hv-toast ' + f.kind);
      if (f.sparks) el('span', 'hv-sp', node, f.sparks);
      if (f.sparks && f.text) el('span', 'hv-sep', node, ' · ');
      if (f.text) el('span', 'hv-tx', node, f.text);
      toastBox.appendChild(node); writes++;
      toasts.push({ el: node, until: t + TOAST_LIFE, out: false });
      while (toasts.length > TOAST_MAX) removeToast(0);
      return true;
    }
    function setBoss(name, hp01) {
      if (disposed) return;
      if (name == null || name === '') { B = null; acc = TICK; return; }
      var id = '__manual:' + name;
      if (!B || B.id !== id) B = { id: id, name: String(name), hp01: 1, last: t, defeatedAt: null };
      B.last = t; B.hp01 = clamp(hp01 == null ? B.hp01 : hp01, 0, 1);
      if (B.hp01 <= 0 && B.defeatedAt == null) B.defeatedAt = t;
      acc = TICK;   // show on the next update
    }
    function dispose() {
      if (disposed) return; disposed = true;
      unsub.forEach(function (u) { try { u(); } catch (e) {} }); unsub = [];
      if (root.parentNode) root.parentNode.removeChild(root);
      if (ownStyle && style.parentNode) style.parentNode.removeChild(style);
      toasts = []; B = null;
    }
    return {
      update: update, ping: ping, setBoss: setBoss, dispose: dispose,
      _debug: function () { return { t: t, writes: writes, toasts: toasts.length, boss: B ? { id: B.id, name: B.name, hp01: B.hp01 } : null, bossVisible: bossVisible(), root: root }; }
    };
  }
  buildHudV4.pure = { hpLevel: hpLevel, formatPing: formatPing, fmtSparks: fmtSparks, TICK: TICK, TOAST_MAX: TOAST_MAX, TOAST_LIFE: TOAST_LIFE, BOSS_IDLE: BOSS_IDLE };
  if (typeof window !== 'undefined') window.buildHudV4 = buildHudV4;
})();
