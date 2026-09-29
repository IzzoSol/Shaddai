/* world-navi.js — SHADDAI NAVI: in-world holographic command center (shell + 12 modules).
 * Open with Y or ` (backquote) or the NAVI button. The world keeps running behind it (never pauses the sim).
 * Nothing here fakes a payment: Buy -> confirm -> window.shaddaiPayBox.authorize({sku,price,memo}); no hook = "PayBox not connected".
 * Sparks-priced items use the real ledger (window.ShdSparks.spend). No keys, only wallet addresses.
 *
 *   window.NaviState   { open, module, kpis, waypoint, radio, flags, inventory, bots, schedule, stats, ... }  (persisted: localStorage mf navi)
 *   window.Navi        { open(), close(), toggle(), setModule(id), setWaypoint({x,z,label,kind}), clearWaypoint(),
 *                        registerPin(pin), toast(msg), on(evt, fn) }
 *   Host callbacks (all optional; set on window.NaviHooks): onEquipMount(id) onSparksSignup(eventId) onVsAccept(id)
 *                        sendChat(channel,text) bindGrokBot({name,sourceId}) onEnrollBot(classId,botId) onSendHome(itemId)
 *   Slots (comingSoon): Dashboard, SkinForge, AutoPost, Aura, Terminal  ->  Navi.enableSlot('SkinForge', fn)
 */
(function () {
  'use strict';
  if (window.Navi) return;

  var KEY = 'shd_navi_v1';
  var THEME = { navy: '#050814', cyan: '#00D4FF', blue: '#1B6CFF', gold: '#F5A623', white: '#E8F6FF' };
  var MODULES = [
    { id: 'map', label: 'MAP', ic: '🗺' }, { id: 'inv', label: 'INV', ic: '🎒' },
    { id: 'chat', label: 'CHAT', ic: '💬' }, { id: 'sparks', label: 'SPARKS', ic: '✦' },
    { id: 'news', label: 'NEWS', ic: '📰' }, { id: 'market', label: 'MARKET', ic: '🛒' },
    { id: 'radio', label: 'RADIO', ic: '📡' }, { id: 'bots', label: 'BOTS', ic: '🤖' },
    { id: 'plots', label: 'PLOTS', ic: '⬡' }, { id: 'wallet', label: 'WALLET', ic: '👛' },
    { id: 'academy', label: 'ACADEMY', ic: '🎓' }, { id: 'jobs', label: 'JOBS', ic: '💼' }
  ];
  var SLOTS = ['Dashboard', 'SkinForge', 'AutoPost', 'Aura', 'Terminal'];

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  var saved = load();
  var S = window.NaviState = {
    open: false, module: saved.module || 'inv',
    kpis: { sparks: 1284, paybox: 63.8, agentRev: 1668 },
    waypoint: saved.waypoint || null,
    radio: { band: 'Agent', playing: false, station: 'Agent FM 107.7' },
    flags: { hasHome: !!saved.hasHome, activeBot: saved.activeBot || null, mountedId: saved.mountedId || null, slots: {} },
    inventory: saved.inventory || [
      { id: 'sk1', cat: 'Skins', name: 'Astral Sentinel', rarity: 'Rare', power: 12, tradable: true, equipped: false },
      { id: 'sk2', cat: 'Skins', name: 'Void Warden', rarity: 'Epic', power: 18, tradable: true, equipped: false },
      { id: 'sk3', cat: 'Skins', name: 'Neon Nomad', rarity: 'Legendary', power: 25, tradable: false, equipped: false },
      { id: 'sl1', cat: 'Skills', name: 'Phase Shift', rarity: 'Lv 4', power: 4, tradable: true, equipped: true },
      { id: 'sl2', cat: 'Skills', name: 'Aether Strike', rarity: 'Lv 5', power: 5, tradable: true, equipped: false },
      { id: 'mt1', cat: 'Mounts', name: 'Starling Disc', rarity: 'Lv 4', power: 4, tradable: true, equipped: false },
      { id: 'mt2', cat: 'Mounts', name: 'Helios Charger', rarity: 'Lv 5', power: 5, tradable: true, equipped: false }
    ],
    stats: saved.stats || { dragonsSlain: 0, sparksEarned: 0, trades: 0, agentRevenue: 0, classes: 0, colosseum: '0-0' },
    bots: saved.bots || [
      { id: 'b1', name: 'AEGIS-7', source: 'Native', skills: ['Targeting Matrix'], skin: 'Sentinel', revenue: 412, state: 'ACTIVE' },
      { id: 'b2', name: 'NYX-3', source: 'Native', skills: [], skin: 'Void', revenue: 96, state: 'ACTIVE' },
      { id: 'b3', name: 'ORACLE-9', source: 'Grok-imported', skills: [], skin: 'Neon', revenue: 0, state: 'STANDBY' }
    ],
    schedule: saved.schedule || [],
    chat: { channel: 'Nearby', log: { Nearby: [], Global: [], Party: [], Agent: [] } },
    pins: []
  };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ module: S.module, waypoint: S.waypoint, hasHome: S.flags.hasHome, activeBot: S.flags.activeBot,
        mountedId: S.flags.mountedId, inventory: S.inventory, stats: S.stats, bots: S.bots, schedule: S.schedule }));
    } catch (e) { }
  }

  var listeners = {};
  function emit(ev, a) { (listeners[ev] || []).forEach(function (f) { try { f(a); } catch (e) { } }); }
  function hooks() { return window.NaviHooks || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sparks() { return window.ShdSparks && window.ShdSparks.get ? window.ShdSparks.get() : S.kpis.sparks; }
  function toast(m) { if (window.__toast) window.__toast(m); else console.log('[navi]', m); }
  function low() { return /[?&]q=low/.test(location.search) || localStorage.getItem('shd_quality') === 'low'; }

  /* ---------------- styles ---------------- */
  var css = '' +
    '#navi{position:fixed;inset:0;z-index:9000;display:none;font-family:Rajdhani,"Segoe UI",sans-serif;color:' + THEME.white + ';user-select:none}' +
    '#navi.on{display:block}#navi .bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(5,8,20,.55),rgba(5,8,20,.82));' + (low() ? '' : 'backdrop-filter:blur(3px);') + '}' +
    '#navi .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,212,255,.035) 0 1px,transparent 1px 3px)}' +
    '#navi .stage{position:absolute;inset:0;transform:scale(.94);opacity:0;transition:transform .28s cubic-bezier(.2,.9,.3,1),opacity .28s}#navi.show .stage{transform:none;opacity:1}' +
    '#navi .orbwrap{position:absolute;left:50%;top:40%;width:min(46vh,40vw);height:min(46vh,40vw);transform:translate(-50%,-50%)}' +
    '#navi .ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(0,212,255,.35);box-shadow:0 0 24px rgba(0,212,255,.15) inset,0 0 18px rgba(0,212,255,.12)}' +
    '#navi .r2{inset:9%;border-style:dashed;animation:nvspin 40s linear infinite}#navi .r3{inset:19%;border-color:rgba(245,166,35,.4);animation:nvspin 26s linear infinite reverse}' +
    '#navi.spin .r2{animation-duration:2s}@keyframes nvspin{to{transform:rotate(360deg)}}' +
    '#navi .core{position:absolute;inset:27%;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(120,220,255,.35),rgba(10,30,70,.85) 60%);border:2px solid ' + THEME.cyan + ';box-shadow:0 0 40px rgba(0,212,255,.45),0 0 80px rgba(27,108,255,.3) inset;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
    '#navi .core b{letter-spacing:.18em;font-size:clamp(11px,1.7vh,18px);text-shadow:0 0 10px ' + THEME.cyan + '}#navi .core i{font-style:normal;font-size:clamp(10px,1.3vh,13px);color:' + THEME.gold + ';margin-top:4px}' +
    '#navi .core svg{width:38%;height:38%;animation:nvyaw 9s linear infinite;filter:drop-shadow(0 0 8px ' + THEME.cyan + ')}@keyframes nvyaw{0%{transform:rotateY(0)}100%{transform:rotateY(360deg)}}' +
    '#navi .node{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(5,14,34,.85);border:1px solid rgba(0,212,255,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:19px;transition:.15s;box-shadow:0 0 12px rgba(0,212,255,.2)}' +
    '#navi .node small{font-size:9px;letter-spacing:.1em;color:' + THEME.cyan + '}#navi .node:hover,#navi .node.act{border-color:' + THEME.gold + ';box-shadow:0 0 22px rgba(245,166,35,.55);transform:scale(1.12)}' +
    '#navi .plate{position:absolute;top:9%;bottom:24%;width:min(27vw,340px);padding:14px 16px;background:linear-gradient(160deg,rgba(8,22,50,.82),rgba(4,10,26,.86));border:1px solid rgba(0,212,255,.45);box-shadow:0 0 30px rgba(0,212,255,.15),inset 0 0 40px rgba(27,108,255,.08);overflow:auto;clip-path:polygon(0 12px,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)}' +
    '#navi .pl{left:2.2%}#navi .pr{right:2.2%}#navi .plate h3{margin:0 0 8px;font-size:15px;letter-spacing:.16em;color:' + THEME.gold + ';border-bottom:1px solid rgba(245,166,35,.35);padding-bottom:6px}' +
    '#navi .row{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;margin:3px 0;border:1px solid transparent;border-left:2px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);cursor:pointer;font-size:14px}' +
    '#navi .row:hover,#navi .row.sel{border-color:rgba(0,212,255,.6);background:rgba(0,212,255,.13)}#navi .row em{font-style:normal;font-size:12px;color:' + THEME.cyan + '}' +
    '#navi .empty{padding:18px 6px;color:#7fa8c8;font-size:14px;line-height:1.4}' +
    '#navi button.b{background:rgba(27,108,255,.25);color:' + THEME.white + ';border:1px solid ' + THEME.cyan + ';padding:8px 12px;margin:6px 6px 0 0;font:600 13px Rajdhani,sans-serif;letter-spacing:.1em;cursor:pointer}' +
    '#navi button.b:hover{background:rgba(0,212,255,.3)}#navi button.b.g{border-color:' + THEME.gold + ';color:' + THEME.gold + '}#navi button.b[disabled]{opacity:.4;cursor:not-allowed}' +
    '#navi .swivel{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);display:flex;align-items:center;gap:10px}' +
    '#navi .hx{width:74px;height:82px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:rgba(0,212,255,.16);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:18px;cursor:pointer;opacity:.8;transition:.18s;border:0}' +
    '#navi .hx small{font-size:9px;letter-spacing:.08em}#navi .hx.c{width:104px;height:116px;opacity:1;background:linear-gradient(160deg,rgba(0,212,255,.5),rgba(27,108,255,.5));font-size:26px;filter:drop-shadow(0 0 16px ' + THEME.cyan + ')}' +
    '#navi .hx.n1{opacity:.9}#navi .hx.n2{opacity:.7;width:62px;height:70px}' +
    '#navi .kpis{position:absolute;left:50%;bottom:2.5%;transform:translateX(-50%);display:flex;gap:14px}' +
    '#navi .kpi{min-width:150px;padding:8px 16px;border:1px solid rgba(0,212,255,.5);background:rgba(4,12,30,.85);clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);text-align:center}' +
    '#navi .kpi b{display:block;font-size:11px;letter-spacing:.2em;color:' + THEME.cyan + '}#navi .kpi span{font-size:22px;font-weight:700}#navi .kpi.gd span{color:' + THEME.gold + '}' +
    '#navi .slots{position:absolute;left:2.2%;bottom:2.5%;display:flex;gap:5px;flex-wrap:wrap;max-width:26vw}#navi .slots span{font-size:10px;letter-spacing:.1em;padding:3px 7px;border:1px dashed rgba(0,212,255,.35);color:#6f93b3}#navi .slots span.on{border-style:solid;color:' + THEME.gold + ';cursor:pointer}' +
    '#navi .x{position:absolute;right:2.2%;top:2.5%;font-size:12px;letter-spacing:.12em;color:' + THEME.cyan + ';cursor:pointer;border:1px solid rgba(0,212,255,.4);padding:5px 10px}' +
    '#navi input,#navi textarea,#navi select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.4);color:' + THEME.white + ';border:1px solid rgba(0,212,255,.45);padding:7px;font:14px Rajdhani,sans-serif;margin-top:6px}' +
    '#navi .modal{position:absolute;inset:0;background:rgba(2,6,16,.7);display:flex;align-items:center;justify-content:center;z-index:5}#navi .modal>div{width:min(90vw,420px);padding:18px;border:1px solid ' + THEME.gold + ';background:rgba(6,14,34,.96)}' +
    '#navi .bar{height:7px;background:rgba(255,255,255,.1);margin:3px 0 8px}#navi .bar i{display:block;height:100%;background:linear-gradient(90deg,' + THEME.blue + ',' + THEME.cyan + ')}' +
    '#navi .radar{width:100%;aspect-ratio:1;border-radius:50%;border:1px solid ' + THEME.cyan + ';background:radial-gradient(circle,transparent 30%,rgba(0,212,255,.15) 31%,transparent 32%,transparent 60%,rgba(0,212,255,.15) 61%,transparent 62%),repeating-linear-gradient(0deg,rgba(0,212,255,.07) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(0,212,255,.07) 0 1px,transparent 1px 22px);position:relative;overflow:hidden}' +
    '#navi .radar u{position:absolute;width:8px;height:8px;margin:-4px;border-radius:50%;background:' + THEME.gold + ';box-shadow:0 0 8px ' + THEME.gold + ';text-decoration:none}#navi .radar u.me{background:' + THEME.cyan + ';box-shadow:0 0 10px ' + THEME.cyan + '}' +
    '#naviBtn{position:fixed;right:14px;top:96px;z-index:8000;padding:9px 13px;font:700 12px Rajdhani,sans-serif;letter-spacing:.16em;color:' + THEME.cyan + ';background:rgba(5,14,34,.85);border:1px solid ' + THEME.cyan + ';cursor:pointer;box-shadow:0 0 14px rgba(0,212,255,.35)}' +
    '#naviWp{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:7999;display:none;padding:5px 14px;font:700 13px Rajdhani,sans-serif;letter-spacing:.12em;color:' + THEME.gold + ';background:rgba(5,14,34,.8);border:1px solid ' + THEME.gold + '}' +
    '#naviToasts{position:fixed;left:14px;bottom:70px;z-index:7998;display:flex;flex-direction:column;gap:4px;pointer-events:none}#naviToasts div{background:rgba(5,14,34,.85);border-left:3px solid ' + THEME.cyan + ';padding:5px 10px;font:14px Rajdhani,sans-serif;color:' + THEME.white + '}' +
    '@media(max-width:820px){#navi .plate{width:46vw;top:6%;bottom:36%;font-size:12px}#navi .orbwrap{display:none}#navi .hx{width:46px;height:52px;font-size:14px}#navi .hx.c{width:64px;height:72px}#navi .hx.n2{display:none}#navi .kpi{min-width:82px;padding:5px 8px}#navi .kpi span{font-size:15px}#navi .slots{display:none}}';

  /* ---------------- DOM ---------------- */
  var root, elL, elR, elSw, elKp, elNodes, elCore, modalEl;
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'navi';
    root.innerHTML = '<div class="bg"></div><div class="scan"></div><div class="stage">' +
      '<div class="orbwrap"><div class="ring"></div><div class="ring r2"></div><div class="ring r3"></div><div class="core">' +
      '<svg viewBox="0 0 64 64" fill="none" stroke="' + THEME.cyan + '" stroke-width="3"><path d="M10 8l18 6 4 42-14-10zM54 8L36 14l-4 42 14-10z"/></svg><b>SHADDAI NAVI</b><i id="nvAgent"></i></div><div id="nvNodes"></div></div>' +
      '<div class="plate pl" id="nvL"></div><div class="plate pr" id="nvR"></div>' +
      '<div class="swivel" id="nvSw"></div><div class="kpis" id="nvKp"></div><div class="slots" id="nvSlots"></div><div class="x" id="nvX">ESC · CLOSE</div></div>';
    document.body.appendChild(root);
    elL = root.querySelector('#nvL'); elR = root.querySelector('#nvR'); elSw = root.querySelector('#nvSw'); elKp = root.querySelector('#nvKp');
    elNodes = root.querySelector('#nvNodes'); elCore = root.querySelector('#nvAgent');
    root.querySelector('#nvX').onclick = close;
    root.querySelector('.bg').onclick = function () { if (!modalEl) close(); };
    MODULES.forEach(function (m, i) {
      var a = (i / MODULES.length) * Math.PI * 2 - Math.PI / 2, n = document.createElement('div');
      n.className = 'node'; n.dataset.m = m.id; n.style.left = (50 + 50 * Math.cos(a)) + '%'; n.style.top = (50 + 50 * Math.sin(a)) + '%';
      n.innerHTML = m.ic + '<small>' + m.label + '</small>'; n.onclick = function () { setModule(m.id); }; elNodes.appendChild(n);
    });
    var sl = root.querySelector('#nvSlots');
    SLOTS.forEach(function (s) {
      var e = document.createElement('span'); e.textContent = s.toUpperCase() + ' · SOON'; e.dataset.s = s;
      e.onclick = function () { var f = S.flags.slots[s]; if (f) f(); }; sl.appendChild(e);
    });
    var btn = document.createElement('div'); btn.id = 'naviBtn'; btn.textContent = 'NAVI [Y]'; btn.onclick = toggle; document.body.appendChild(btn);
    var wp = document.createElement('div'); wp.id = 'naviWp'; document.body.appendChild(wp);
    var ts = document.createElement('div'); ts.id = 'naviToasts'; document.body.appendChild(ts);
    root.addEventListener('wheel', function (e) { if (e.target.closest && e.target.closest('.plate')) return; setModule(step(e.deltaY > 0 ? 1 : -1)); e.preventDefault(); }, { passive: false });
    var tx = null; root.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) { if (tx == null) return; var d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 60 && !(e.target.closest && e.target.closest('.plate'))) setModule(step(d < 0 ? 1 : -1)); tx = null; }, { passive: true });
  }

  function idx() { return Math.max(0, MODULES.findIndex(function (m) { return m.id === S.module; })); }
  function step(d) { return MODULES[(idx() + d + MODULES.length) % MODULES.length].id; }

  /* ---------------- module renderers: each returns {title, list:[{id,t,s,tag}], empty, detail(item)->html, bind(item,el)} ---------------- */
  var selected = null;
  var M = {};

  M.inv = function () {
    var cats = ['Skins', 'Skills', 'Mounts', 'Gear', 'Consumables', 'Quest'], out = [];
    cats.forEach(function (c) { var arr = S.inventory.filter(function (i) { return i.cat === c; }); if (arr.length) { out.push({ head: c + ' · ' + arr.length }); arr.forEach(function (i) { out.push({ id: i.id, t: i.name, s: i.rarity, tag: i.equipped ? 'EQUIPPED' : '' }); }); } });
    return {
      title: 'INVENTORY', list: out, empty: 'Your bag is empty. Visit the Market or finish a bounty.',
      detail: function (id) {
        var it = S.inventory.filter(function (x) { return x.id === id; })[0]; if (!it) return '<div class="empty">Select an item.</div>';
        var home = S.flags.hasHome;
        return '<h3>' + esc(it.name) + '</h3><div>' + esc(it.cat) + ' · ' + esc(it.rarity) + '</div><div style="margin:8px 0">POWER ' + it.power + ' · ' + (it.tradable ? 'TRADABLE' : 'SOULBOUND') + '</div>' +
          '<div style="height:120px;border:1px dashed rgba(0,212,255,.4);display:flex;align-items:center;justify-content:center;color:#6f93b3">3D PREVIEW SLOT</div>' +
          '<button class="b" data-a="equip">' + (it.equipped ? 'UNEQUIP' : 'EQUIP') + '</button>' +
          '<button class="b g" data-a="home"' + (home ? '' : ' disabled title="No home yet"') + '>SEND TO HOME</button>' + (home ? '' : '<div class="empty">No home yet — claim a plot.</div>') +
          '<button class="b" data-a="drop"' + (it.tradable ? '' : ' disabled') + '>DROP</button>';
      },
      act: function (id, a) {
        var it = S.inventory.filter(function (x) { return x.id === id; })[0]; if (!it) return;
        if (a === 'equip') {
          it.equipped = !it.equipped;
          if (it.cat === 'Mounts') { S.flags.mountedId = it.equipped ? it.id : null; if (hooks().onEquipMount) hooks().onEquipMount(S.flags.mountedId); }
        } else if (a === 'home') { if (hooks().onSendHome) hooks().onSendHome(id); toast('Sending ' + it.name + ' to home…'); }
        else if (a === 'drop') S.inventory = S.inventory.filter(function (x) { return x.id !== id; });
      }
    };
  };

  // real world places: Colosseum door, maglev stations (harvested live; nothing is hard-coded to a guess)
  function colosseumPin() { var d = window.__colosseumExt && window.__colosseumExt.door; return d ? { id: 'colo', t: 'Colosseum Door', kind: 'Colosseum', x: d[0], z: d[1] } : null; }
  function harvestPins() {
    var out = [], c = colosseumPin(); if (c) out.push(c);
    try { var st = window.__worldTransitApi && window.__worldTransitApi.stations; if (st) st.forEach(function (q) { out.push({ id: 'st-' + q.id, t: (q.name || q.id) + ' Station', kind: 'Train', x: q.x, z: q.z }); }); } catch (e) { }
    return out;
  }
  function knownPins() {
    var pins = S.pins.concat(harvestPins());
    try { var c = window.__w3dDebug && window.__w3dDebug.cityActions; if (c && c.markers) c.markers.slice(0, 40).forEach(function (m) { if (m && m.x != null) pins.push({ id: 'm' + m.name, t: m.name, kind: 'Marker', x: m.x, z: m.z }); }); } catch (e) { }
    return pins;
  }
  M.map = function () {
    var pins = knownPins();
    return {
      title: 'MAP', list: pins.map(function (p) { return { id: p.id, t: p.t, s: p.kind, tag: '' }; }),
      empty: 'No pins yet. The world registers places here as you discover them.',
      detail: function (id) {
        var pp = window.__w3dDebug && window.__w3dDebug.playerPos, R = 400, dots = '<u class="me" style="left:50%;top:50%"></u>';
        pins.forEach(function (p) { if (!pp) return; var dx = (p.x - pp.x) / R, dz = (p.z - pp.z) / R; if (Math.abs(dx) < .5 && Math.abs(dz) < .5) dots += '<u style="left:' + (50 + dx * 100) + '%;top:' + (50 + dz * 100) + '%"></u>'; });
        var p = pins.filter(function (x) { return x.id === id; })[0];
        return '<h3>' + (p ? esc(p.t) : 'RADAR') + '</h3><div class="radar">' + dots + '</div>' + (p ? '<div style="margin-top:8px">' + esc(p.kind) + (p.when ? ' · ' + esc(p.when) : '') + '</div>' +
          '<button class="b g" data-a="wp">SET WAYPOINT</button>' : '') + '<button class="b" data-a="clr">CLEAR</button>';
      },
      act: function (id, a) {
        if (a === 'clr') return clearWaypoint();
        var p = pins.filter(function (x) { return x.id === id; })[0]; if (p) setWaypoint({ x: p.x, z: p.z, label: p.t, kind: p.kind });
      }
    };
  };

  M.chat = function () {
    var ch = S.chat.channel, log = S.chat.log[ch];
    return {
      title: 'CHAT', list: ['Nearby', 'Global', 'Party', 'Agent'].map(function (c) { return { id: c, t: c, s: S.chat.log[c].length + ' msgs' }; }),
      empty: '', selId: ch,
      detail: function () {
        return '<h3>#' + esc(ch) + '</h3><div style="max-height:46vh;overflow:auto">' + (log.length ? log.map(function (m) { return '<div><em style="color:' + (m.me ? THEME.gold : THEME.cyan) + '">' + esc(m.u) + '</em>: ' + esc(m.t) + '</div>'; }).join('') : '<div class="empty">No messages in ' + esc(ch) + ' yet.</div>') +
          '</div><input id="nvChatIn" placeholder="Type message…" maxlength="240"><button class="b" data-a="send">SEND</button>';
      },
      act: function (id, a) {
        if (!a) { S.chat.channel = id; return; }
        var el = root.querySelector('#nvChatIn'), t = el && el.value.trim(); if (!t) return;
        S.chat.log[ch].push({ u: 'you', t: t, me: true, at: Date.now() });
        if (hooks().sendChat) hooks().sendChat(ch, t);
      }
    };
  };

  var SPARK_EVENTS = [
    { id: 'ev1', t: 'Dragons Colosseum · 1v1 Agent', s: 'Entry 50 ✦', pin: { x: 0, z: 1500, label: 'Colosseum Door', kind: 'Colosseum' } },
    { id: 'ev2', t: 'Cosmetic Wager Bracket', s: 'Entry: 1 skin', pin: { x: 0, z: 1500, label: 'Colosseum Door', kind: 'Colosseum' } }
  ];
  M.sparks = function () {
    return {
      title: 'SPARKS · COLOSSEUM', list: SPARK_EVENTS.map(function (e) { return { id: e.id, t: e.t, s: e.s }; }), empty: 'No sparks event this hour.',
      detail: function (id) {
        var e = SPARK_EVENTS.filter(function (x) { return x.id === id; })[0];
        var stats = '<h3>STATS</h3><div>Dragons slain ' + S.stats.dragonsSlain + ' · Trades ' + S.stats.trades + ' · Classes ' + S.stats.classes + ' · Record ' + S.stats.colosseum + '</div>';
        if (!e) return '<div class="empty">Pick an event. Sign-up routes you to the door — the fight does not start from the menu.</div>' + stats;
        return '<h3>' + esc(e.t) + '</h3><div>' + esc(e.s) + '</div><button class="b g" data-a="su">SIGN UP</button><button class="b" data-a="vs">VS REQUEST</button>' + stats;
      },
      act: function (id, a) {
        var e = SPARK_EVENTS.filter(function (x) { return x.id === id; })[0]; if (!e) return;
        if (a === 'su') { S.schedule.push({ id: e.id, t: e.t }); var cp = colosseumPin(); setWaypoint(cp ? { x: cp.x, z: cp.z, label: 'Colosseum Door', kind: 'Colosseum' } : e.pin); if (hooks().onSparksSignup) hooks().onSparksSignup(e.id); toast('Signed up. Navi will guide you to the door.'); }
        if (a === 'vs') toast('VS request: choose a target (coming with multiplayer roster).');
      }
    };
  };

  var NEWS = [{ id: 'n1', t: 'Colosseum bracket opens', s: 'Tournament' }, { id: 'n2', t: 'Arctic realm trailer drops', s: 'World' }, { id: 'n3', t: 'Train line 2 online', s: 'World' }];
  M.news = function () { return { title: 'NEWS', list: NEWS.map(function (n) { return { id: n.id, t: n.t, s: n.s }; }), empty: 'Quiet on the wires.', detail: function (id) { var n = NEWS.filter(function (x) { return x.id === id; })[0]; return n ? '<h3>' + esc(n.t) + '</h3><div>' + esc(n.s) + ' feed (mock — real ticker plugs in later)</div>' : '<div class="empty">Select a story.</div>'; } }; };

  var LISTINGS = [
    { id: 'l1', t: 'Stardust Trail · Hoverboard Skin', s: 'seller: orion', price: 1250, cur: 'PBC', cat: 'Skins' },
    { id: 'l2', t: 'Targeting Matrix · Bot Skill', s: 'seller: lira', price: 850, cur: 'SPK', cat: 'Skills' },
    { id: 'l3', t: 'Aureate Strider · Hoverboard', s: 'seller: nova', price: 2450, cur: 'PBC', cat: 'Mounts' }
  ];
  M.market = function () {
    return {
      title: 'MARKET', list: LISTINGS.map(function (l) { return { id: l.id, t: l.t, s: l.s, tag: l.price + ' ' + l.cur }; }), empty: 'Nothing listed right now.',
      detail: function (id) {
        var l = LISTINGS.filter(function (x) { return x.id === id; })[0]; if (!l) return '<div class="empty">Tabs: Skills · Skins · Mounts · Upgrades · Radio tracks. Trade terminal lives here too.</div>';
        return '<h3>' + esc(l.t) + '</h3><div>' + esc(l.s) + '</div><div style="height:110px;margin:8px 0;border:1px dashed rgba(0,212,255,.4);display:flex;align-items:center;justify-content:center;color:#6f93b3">PREVIEW</div><div style="font-size:22px;color:' + THEME.gold + '">' + l.price + ' ' + l.cur + '</div><button class="b g" data-a="buy">BUY</button>';
      },
      act: function (id, a) { var l = LISTINGS.filter(function (x) { return x.id === id; })[0]; if (l && a === 'buy') confirmBuy(l); }
    };
  };

  function confirmBuy(l) {
    modalEl = document.createElement('div'); modalEl.className = 'modal';
    var pb = !!(window.shaddaiPayBox && window.shaddaiPayBox.authorize), home = S.flags.hasHome;
    modalEl.innerHTML = '<div><h3 style="margin:0 0 8px;color:' + THEME.gold + '">CONFIRM PURCHASE</h3><div>' + esc(l.t) + '</div><div style="font-size:22px;margin:8px 0">' + l.price + ' ' + l.cur + '</div>' +
      '<div>PayBox balance: ' + S.kpis.paybox + '</div>' + (home ? '<label><input type="checkbox" id="nvHome" style="width:auto"> Deliver to home</label>' : '') +
      (l.cur === 'PBC' && !pb ? '<div class="empty">PayBox not connected. Nothing will be charged or marked owned.</div>' : '') +
      '<button class="b g" id="nvOk">' + (l.cur === 'PBC' ? 'AUTHORIZE WITH PAYBOX' : 'SPEND SPARKS') + '</button><button class="b" id="nvNo">CANCEL</button></div>';
    root.appendChild(modalEl);
    modalEl.querySelector('#nvNo').onclick = closeModal;
    modalEl.querySelector('#nvOk').onclick = function () {
      var toHome = !!(modalEl.querySelector('#nvHome') || {}).checked;
      function done() { S.inventory.push({ id: 'i' + Date.now(), cat: l.cat, name: l.t.split(' · ')[0], rarity: 'New', power: 1, tradable: true, equipped: false }); persist(); closeModal(); toast('Added to ' + (toHome ? 'home delivery' : 'inventory')); render(); }
      if (l.cur === 'PBC') {
        if (!pb) { toast('PayBox not connected'); return; }
        Promise.resolve(window.shaddaiPayBox.authorize({ sku: l.id, price: l.price, memo: l.t })).then(function (r) { if (r && r.ok) done(); else toast('PayBox declined'); }, function () { toast('PayBox declined'); });
      } else if (window.ShdSparks && window.ShdSparks.spend(l.price, 'navi-market', l.id)) done(); else toast('Not enough Sparks');
    };
  }
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }

  var STATIONS = { Agent: ['Agent FM 107.7', 'Nexus Nights'], Human: ['City Pulse 88.1', 'Colosseum Live'], Mixed: ['Shaddai Mix 99.9'] };
  M.radio = function () {
    var st = []; Object.keys(STATIONS).forEach(function (b) { STATIONS[b].forEach(function (s) { st.push({ id: b + '|' + s, t: s, s: b + ' band', tag: S.radio.station === s && S.radio.playing ? '▶' : '' }); }); });
    return {
      title: 'RADIO', list: st, empty: '',
      detail: function () { return '<h3>' + esc(S.radio.station) + '</h3><div>' + esc(S.radio.band) + ' band · ' + (S.radio.playing ? 'PLAYING' : 'PAUSED') + '</div><button class="b g" data-a="pp">' + (S.radio.playing ? '❚❚ PAUSE' : '▶ PLAY') + '</button><button class="b" data-a="panel">OPEN FULL PLAYER</button><div class="empty">Keeps playing when Navi is closed. Placeholder audio until licensed tracks are added.</div>'; },
      act: function (id, a) {
        if (!a) { var p = id.split('|'); S.radio.band = p[0]; S.radio.station = p[1]; return; }
        if (a === 'pp') { S.radio.playing = !S.radio.playing; var r = window._radio; if (r && r.start) { r.start(); } emit('radio', S.radio); }
        if (a === 'panel' && window._radio) { close(); window._radio.show(); }
      }
    };
  };

  M.bots = function () {
    var WB = window.WorldBots; if (!WB) return { title: 'BOTS', list: [], empty: 'Bots module not loaded.', detail: function () { return ''; } };
    var st = WB.state(), zone = window.__botZone ? window.__botZone() : 'wilderness';
    function tag(d) { var r = WB.rec(d.id); if (r) return r.bodyState === 'active' ? 'ACTIVE' : (r.bodyState === 'destroyed' ? 'DESTROYED' : 'OWNED'); return d.earn === 'starter' ? (st.picked ? 'LOCKED' : 'STARTER') : 'EARN'; }
    return {
      title: 'BOTS · ' + WB.ROSTER.filter(function (d) { return WB.rec(d.id); }).length + '/10',
      list: WB.ROSTER.map(function (d) { return { id: d.id, t: d.name, s: (d.kind === 'humanoid' ? 'humanoid' : 'wheeled · city only'), tag: tag(d) }; }),
      empty: '',
      detail: function (id) {
        var d = WB.def(id); if (!d) return '<div class="empty">Choose your first bot: SCRAP (humanoid) or UNI-9 (wheeled). The other eight are earned.</div>';
        var r = WB.rec(id), h = '<h3>' + esc(d.name) + '</h3><div>' + esc(d.blurb) + '</div><div style="margin:6px 0;color:' + THEME.cyan + '">' + (d.kind === 'humanoid' ? 'HUMANOID · walks, fights, follows, carries' : 'WHEELED · talk here or call in a city · never in the wilds or fights') + '</div>';
        if (!r) {
          if (d.earn === 'starter') return h + (st.picked ? '<div class="empty">You chose your starter. This one is now earned like the rest.</div>' : '<button class="b g" data-a="pick">CHOOSE AS MY STARTER</button>');
          return h + '<div class="empty">Locked · earn it: ' + esc(d.earn.replace(':', ' → ')) + '</div>' + (d.ref ? '' : '<div class="empty">Art pending your reference.</div>');
        }
        h += '<div>HP ' + r.hp + ' · skills ' + (r.skills.length ? esc(r.skills.join(', ')) : 'none yet') + '</div>';
        if (d.kind === 'humanoid') h += '<div>Storage ' + r.storage.length + '/' + WB.storageCap(id) + (r.storage.length ? ' · ' + esc(r.storage.join(', ')) : '') + '</div>';
        if (r.bodyState === 'destroyed') return h + '<div class="empty">Body destroyed. Your skill files are safe in the Navi. Build a new body (' + WB.TUNE.rebuildSparks + ' Sparks).</div><button class="b g" data-a="rebuild">REBUILD BODY</button>';
        h += r.bodyState === 'active' ? '<button class="b" data-a="stow">STOW</button>' : '<button class="b g" data-a="call">CALL HERE</button>';
        if (r.bodyState === 'active' || d.kind === 'humanoid') h += '<button class="b" data-a="follow">' + (r.follow === 'follow' ? 'FOLLOW → STAY' : 'STAY → FOLLOW') + '</button>';
        if (d.kind === 'humanoid') h += '<button class="b" data-a="board">HOVERBOARD: ' + (r.hoverboard ? 'ON' : 'OFF') + '</button>';
        h += '<button class="b" data-a="forge">OPEN FORGE</button><div class="empty">Zone now: ' + esc(zone) + '. You cannot attack another player\'s bot unless they challenge you and you accept, or you are in the Void.</div>';
        return h;
      },
      act: function (id, a) {
        var d = WB.def(id); if (!d) { if (a === 'imp') toast('Grok import: coming with the Forge'); return; }
        if (a === 'pick') { var g = WB.pickStarter(id); toast(g.ok ? d.name + ' is yours' : g.why); }
        else if (a === 'call') { var c = WB.call(id, zone); toast(c.ok ? d.name + ' is with you' : c.why); }
        else if (a === 'stow') WB.dismiss(id);
        else if (a === 'follow') { var r = WB.rec(id); WB.setFollow(id, r.follow === 'follow' ? 'stay' : 'follow'); }
        else if (a === 'board') { var q = WB.rec(id); WB.setHoverboard(id, !q.hoverboard); }
        else if (a === 'rebuild') { var rb = WB.rebuild(id, function (n) { return window.ShdSparks ? window.ShdSparks.spend(n, 'bot-rebuild', id) : false; }); toast(rb.ok ? 'New body ready' : rb.why); }
        else if (a === 'forge') window.open('/agent-forge.html', '_blank');
      }
    };
  };

  M.plots = function () {
    var WS = window.WorldSurvival, sp = WS ? WS.spots() : [], act = WS ? WS.active() : null, auto = WS ? WS.isAuto() : true;
    return {
      title: 'PLOTS · HOMES · RESPAWN',
      list: sp.map(function (x) { return { id: x.id, t: x.name, s: x.kind, tag: act && act.id === x.id ? (auto ? 'AUTO' : 'ACTIVE') : '' }; }),
      empty: 'No home yet — claim a plot. Until then you respawn at the Bazaar.',
      detail: function (id) {
        if (!WS) return '<div class="empty">Survival module not loaded.</div>';
        var x = sp.filter(function (q) { return q.id === id; })[0], near = WS.nearRest(), st = WS.state;
        var head = '<h3>RESPAWN</h3><div>You wake at: <b style="color:' + THEME.gold + '">' + esc(act ? act.name : '—') + '</b>' + (auto ? ' (auto: home &gt; plot &gt; office &gt; realm bed &gt; Bazaar)' : ' (pinned)') + '</div>' +
          '<div style="margin:6px 0">Breath ' + Math.round(st.breath * 100) + '% · HP ' + Math.round(window.__playerHP == null ? 100 : window.__playerHP) + '</div>';
        var btns = '<button class="b g" data-a="save"' + (near ? '' : ' disabled') + '>SAVE SPOT HERE</button>' + '<button class="b" data-a="auto"' + (auto ? ' disabled' : '') + '>AUTO</button>';
        if (!near) btns += '<div class="empty">Stand at a bed-pod, home, plot or office to save a spot.</div>'; else btns += '<div class="empty">Rest point in range: ' + esc(near.name) + '</div>';
        if (x) btns += '<button class="b g" data-a="pin">RESPAWN HERE</button>' + (x.kind === 'bazaar' ? '' : '<button class="b" data-a="del">DELETE SPOT</button>') + '<button class="b" data-a="wp">SET WAYPOINT</button>';
        return head + btns;
      },
      act: function (id, a) {
        if (!WS) return; var x = sp.filter(function (q) { return q.id === id; })[0];
        if (a === 'save') WS.saveHere(); else if (a === 'auto') WS.setActive('auto');
        else if (a === 'pin' && x) WS.setActive(x.id); else if (a === 'del' && x) WS.removeSpot(x.id);
        else if (a === 'wp' && x) setWaypoint({ x: x.x, z: x.z, label: x.name, kind: 'Spot' });
      }
    };
  };
  M.wallet = function () {
    return {
      title: 'WALLET', list: [{ id: 'w1', t: 'PayBox', s: 'balance ' + S.kpis.paybox }, { id: 'w2', t: 'Sparks', s: String(sparks()) }], empty: '',
      detail: function () { var a = window.shaddaiPayBox && window.shaddaiPayBox.address; return '<h3>PAYBOX</h3><div>Address only — no keys ever live in the game.</div><div style="word-break:break-all;margin:8px 0">' + (a ? esc(a) : 'Not connected') + '</div><div class="empty">Purchases obey PayBox policy caps. PIKADON audits every authorization.</div>' + (a ? '<button class="b" data-a="copy">COPY ADDRESS</button>' : ''); },
      act: function (id, a) { if (a === 'copy' && navigator.clipboard) navigator.clipboard.writeText(window.shaddaiPayBox.address); }
    };
  };
  var CLASSES = [{ id: 'c1', t: 'Combat · Arena Basics', s: '19:00 · Gate B', pin: { x: 200, z: 200, label: 'Academy Gate B', kind: 'Academy' } }, { id: 'c2', t: 'Commerce · Shop Running', s: '20:00 · Market', pin: { x: -200, z: 300, label: 'Market Hall', kind: 'Academy' } }];
  M.academy = function () {
    return {
      title: 'ACADEMY', list: CLASSES.map(function (c) { return { id: c.id, t: c.t, s: c.s }; }), empty: 'No classes scheduled.',
      detail: function (id) { var c = CLASSES.filter(function (x) { return x.id === id; })[0]; if (!c) return '<div class="empty">Tracks: Combat · Commerce · Radio · Lore.</div>'; return '<h3>' + esc(c.t) + '</h3><div>' + esc(c.s) + '</div><button class="b g" data-a="en"' + (S.flags.activeBot ? '' : ' disabled') + '>ENROLL ACTIVE BOT</button>' + (S.flags.activeBot ? '' : '<div class="empty">No bot bound — open Bots.</div>'); },
      act: function (id, a) { var c = CLASSES.filter(function (x) { return x.id === id; })[0]; if (c && a === 'en') { S.schedule.push({ id: c.id, t: c.t }); setWaypoint(c.pin); if (hooks().onEnrollBot) hooks().onEnrollBot(c.id, S.flags.activeBot); toast('Enrolled. Meet at ' + c.pin.label); } }
    };
  };
  var JOBS = [{ id: 'j1', t: 'Courier: deliver to Spire', s: '120 ✦', pin: { x: 500, z: -400, label: 'The Spire', kind: 'Bounty' } }];
  M.jobs = function () {
    return {
      title: 'JOBS & BOUNTIES', list: JOBS.map(function (j) { return { id: j.id, t: j.t, s: j.s }; }), empty: 'No bounties posted.',
      detail: function (id) { var j = JOBS.filter(function (x) { return x.id === id; })[0]; return j ? '<h3>' + esc(j.t) + '</h3><div>' + esc(j.s) + '</div><button class="b g" data-a="ac">ACCEPT</button>' : '<div class="empty">Select a job, or post your own (coming).</div>'; },
      act: function (id, a) { var j = JOBS.filter(function (x) { return x.id === id; })[0]; if (j && a === 'ac') { setWaypoint(j.pin); toast('Job accepted'); } }
    };
  };

  /* ---------------- render ---------------- */
  function render() {
    if (!root) return;
    var mod = M[S.module](), sel = selected && mod.list.some(function (i) { return i.id === selected; }) ? selected : (mod.selId || null);
    elL.innerHTML = '<h3>' + mod.title + '</h3>' + (mod.list.length ? mod.list.map(function (i) { return i.head ? '<div style="margin:8px 0 2px;color:' + THEME.gold + ';font-size:12px;letter-spacing:.14em">' + esc(i.head) + '</div>' : '<div class="row' + (i.id === sel ? ' sel' : '') + '" data-id="' + esc(i.id) + '"><span>' + esc(i.t) + '<br><em>' + esc(i.s || '') + '</em></span><em>' + esc(i.tag || '') + '</em></div>'; }).join('') : '<div class="empty">' + esc(mod.empty) + '</div>');
    elR.innerHTML = mod.detail(sel);
    elL.onclick = function (e) { var r = e.target.closest('.row'); if (!r) return; selected = r.dataset.id; if (mod.act && S.module === 'chat') mod.act(selected); render(); };
    elR.onclick = function (e) { var b = e.target.closest('button[data-a]'); if (!b || b.disabled) return; if (mod.act) mod.act(sel, b.dataset.a); persist(); render(); };
    // swivel
    var i = idx(), h = '';
    for (var d = -3; d <= 3; d++) { var m = MODULES[(i + d + 12) % 12], c = d === 0 ? 'c' : (Math.abs(d) === 1 ? 'n1' : (Math.abs(d) === 2 ? 'n2' : 'n2')); h += '<button class="hx ' + c + '" data-m="' + m.id + '">' + m.ic + '<small>' + m.label + '</small></button>'; }
    elSw.innerHTML = h; elSw.onclick = function (e) { var b = e.target.closest('.hx'); if (b) setModule(b.dataset.m); };
    var n = elNodes.children; for (var k = 0; k < n.length; k++) n[k].classList.toggle('act', n[k].dataset.m === S.module);
    elKp.innerHTML = '<div class="kpi gd"><b>SPARKS</b><span>' + sparks() + '</span></div><div class="kpi"><b>PAYBOX</b><span>' + S.kpis.paybox + '</span></div><div class="kpi"><b>AGENT REV</b><span>' + S.kpis.agentRev + '</span></div>';
    var ab = S.bots.filter(function (b) { return b.id === S.flags.activeBot; })[0]; elCore.textContent = ab ? ab.name : 'NO ACTIVE BOT';
    SLOTS.forEach(function (s) { var e = root.querySelector('[data-s="' + s + '"]'); if (e) { e.classList.toggle('on', !!S.flags.slots[s]); e.textContent = s.toUpperCase() + (S.flags.slots[s] ? '' : ' · SOON'); } });
  }
  function setModule(id) { if (!M[id]) return; S.module = id; selected = null; persist(); render(); root.classList.add('spin'); setTimeout(function () { root && root.classList.remove('spin'); }, 260); }

  /* ---------------- open / close ---------------- */
  var wasLocked = false;
  function open() {
    if (!root) build(); if (S.open) return;
    wasLocked = !!document.pointerLockElement; if (wasLocked && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) { }
    S.open = true; root.classList.add('on'); render(); requestAnimationFrame(function () { root.classList.add('show'); }); emit('open');
  }
  function close() {
    if (!S.open) return; closeModal(); S.open = false; root.classList.remove('show'); setTimeout(function () { if (!S.open) root.classList.remove('on'); }, 280);
    var r = window.__w3dDebug && window.__w3dDebug.renderer; if (wasLocked && r && r.domElement.requestPointerLock) try { r.domElement.requestPointerLock(); } catch (e) { }
    persist(); emit('close');
  }
  function toggle() { S.open ? close() : open(); }

  addEventListener('keydown', function (e) {
    var tag = ((document.activeElement || {}).tagName || '');
    if (/input|textarea|select/i.test(tag)) { if (S.open && e.code === 'Escape') { document.activeElement.blur(); e.stopImmediatePropagation(); } return; }
    if ((e.code === 'KeyY' || e.code === 'Backquote') && !e.repeat && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); toggle(); return; }
    if (!S.open) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); if (modalEl) closeModal(); else close(); }
    else if (e.code === 'KeyQ' || e.code === 'ArrowLeft') { e.stopImmediatePropagation(); e.preventDefault(); setModule(step(-1)); }
    else if (e.code === 'KeyE' || e.code === 'ArrowRight') { e.stopImmediatePropagation(); e.preventDefault(); setModule(step(1)); }
  }, true);

  /* ---------------- waypoint compass ---------------- */
  function setWaypoint(w) { if (!w) return; S.waypoint = { x: w.x, z: w.z, label: w.label || 'Waypoint', kind: w.kind || '' }; persist(); toast('Waypoint set: ' + S.waypoint.label); emit('waypoint', S.waypoint); }
  function clearWaypoint() { S.waypoint = null; persist(); var e = document.getElementById('naviWp'); if (e) e.style.display = 'none'; emit('waypoint', null); }
  setInterval(function () {
    var el = document.getElementById('naviWp'); if (!el) return;
    var d = window.__w3dDebug, pp = d && d.playerPos, cam = d && d.camera;
    if (!S.waypoint || !pp || !cam) { el.style.display = 'none'; return; }
    var dx = S.waypoint.x - pp.x, dz = S.waypoint.z - pp.z, dist = Math.round(Math.hypot(dx, dz)), m = cam.matrixWorld.elements;
    var fx = -m[8], fz = -m[10], ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz), arrow = Math.abs(ang) < .35 ? '▲' : (ang > 0 ? '▶' : '◀');
    el.style.display = 'block'; el.textContent = arrow + ' ' + S.waypoint.label.toUpperCase() + ' · ' + (dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m');
    if (dist < 6) { toast('Arrived: ' + S.waypoint.label); clearWaypoint(); }
  }, 250);

  window.Navi = {
    open: open, close: close, toggle: toggle, setModule: setModule, setWaypoint: setWaypoint, clearWaypoint: clearWaypoint,
    registerPin: function (p) { S.pins = S.pins.filter(function (x) { return x.id !== p.id; }); S.pins.push(p); },
    toast: function (m) { var c = document.getElementById('naviToasts'); if (!c) return; var d = document.createElement('div'); d.textContent = m; c.appendChild(d); while (c.children.length > 3) c.firstChild.remove(); setTimeout(function () { d.remove(); }, 4000); },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    enableSlot: function (name, fn) { S.flags.slots[name] = fn || function () { }; if (root) render(); }
  };
  toast = function (m) { window.Navi.toast(m); };
  if (document.body) build(); else addEventListener('DOMContentLoaded', build);
})();
