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
  // ORDER (owner 2026-10-16: "organized and polished, not random buttons"): related modules sit together round the ring -
  // PLAY (map, modes, jobs) · OWN (items + mounts, shop, homes, wallet, sparks) · AGENTS + LEARN (agents, academy) · SOCIAL (chat, news, radio).
  // ZEROX signals are off the ring for now (owner: later); M.signals stays in the code.
  var MODULES = [
    { id: 'map', label: 'MAP', ic: '🗺' }, { id: 'modes', label: 'MODES', ic: '⚙' }, { id: 'jobs', label: 'JOBS', ic: '💼' },
    { id: 'inv', label: 'ITEMS', ic: '🎒' }, { id: 'market', label: 'SHOP', ic: '🛒' }, { id: 'plots', label: 'HOMES', ic: '⬡' },
    { id: 'wallet', label: 'WALLET', ic: '👛' }, { id: 'sparks', label: 'SPARKS', ic: '✦' },
    { id: 'bots', label: 'AGENTS', ic: '🤖' }, { id: 'academy', label: 'ACADEMY', ic: '🎓' },
    { id: 'chat', label: 'CHAT', ic: '💬' }, { id: 'markets', label: 'MARKETS', ic: '📈' }, { id: 'news', label: 'NEWS', ic: '📰' }, { id: 'radio', label: 'RADIO', ic: '📡' }
  ];
  var SLOTS = ['Dashboard', 'SkinForge', 'AutoPost', 'Aura', 'Terminal'];
  // Line icons (2026-10-15, owner Navi refs): one stroke style for every module, replaces the emoji.
  var IC = {
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    inv: '<path d="M4 8h16v12H4z"/><path d="M9 8V5h6v3M4 13h16"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    sparks: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
    markets: '<path d="M4 19h16M6 16l4-5 3 3 5-7"/><path d="M15 7h3v3"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4"/>',
    market: '<path d="M3 4h3l2.5 11h10L21 8H7"/><circle cx="10" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    bots: '<path d="M6 9h12v9H6z"/><path d="M12 5v4M9.5 13h.01M14.5 13h.01M9 16h6M3 12v3M21 12v3"/>',
    plots: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    wallet: '<path d="M4 7h15v12H4z"/><path d="M4 7l11-3v3M15 12h4v3h-4z"/>',
    academy: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    jobs: '<path d="M4 8h16v11H4z"/><path d="M9 8V5h6v3M4 13h16"/>',
    signals: '<path d="M4 20V14M9 20V10M14 20V6M19 20V3"/>',
    modes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  function icon(id) { return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[id] || IC.modes) + '</svg>'; }


  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  var saved = load();
  var S = window.NaviState = {
    open: false, module: saved.module || 'inv',
    kpis: { sparks: 0, paybox: null, agentRev: null },   // real values only: Sparks from the ledger; PayBox/agent revenue show a dash until the hook reports a number
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
  function pay() { var p = window.shaddaiPayBox, v = p && typeof p.balance === 'function' ? p.balance() : S.kpis.paybox; return v == null ? '—' : v; }
  function rev() { var v = S.stats.agentRevenue || S.kpis.agentRev; return v ? v : '—'; }
  function sparks() { return window.ShdSparks && window.ShdSparks.get ? window.ShdSparks.get() : S.kpis.sparks; }
  function toast(m) { if (window.__toast) window.__toast(m); else console.log('[navi]', m); }
  function low() { return /[?&]q=low/.test(location.search) || localStorage.getItem('shd_quality') === 'low'; }

  /* ---------------- styles ---------------- */
  var css = '' +
    '#navi{position:fixed;inset:0;z-index:9000;display:none;font-family:"Chakra Petch",Rajdhani,"Segoe UI",sans-serif;color:' + THEME.white + ';user-select:none}' +
    '#navi.on{display:block}#navi .bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(5,8,20,.55),rgba(5,8,20,.82));}' +
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
    '#navi button.b{background:rgba(27,108,255,.25);color:' + THEME.white + ';border:1px solid ' + THEME.cyan + ';padding:8px 12px;margin:6px 6px 0 0;font:600 13px "Chakra Petch",sans-serif;letter-spacing:.1em;cursor:pointer}' +
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
    '#navi input,#navi textarea,#navi select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.4);color:' + THEME.white + ';border:1px solid rgba(0,212,255,.45);padding:7px;font:14px "Chakra Petch",sans-serif;margin-top:6px}' +
    '#navi .modal{position:absolute;inset:0;background:rgba(2,6,16,.7);display:flex;align-items:center;justify-content:center;z-index:5}#navi .modal>div{width:min(90vw,420px);padding:18px;border:1px solid ' + THEME.gold + ';background:rgba(6,14,34,.96)}' +
    '#navi .bar{height:7px;background:rgba(255,255,255,.1);margin:3px 0 8px}#navi .bar i{display:block;height:100%;background:linear-gradient(90deg,' + THEME.blue + ',' + THEME.cyan + ')}' +
    '#navi .radar{width:100%;aspect-ratio:1;border-radius:50%;border:1px solid ' + THEME.cyan + ';background:radial-gradient(circle,transparent 30%,rgba(0,212,255,.15) 31%,transparent 32%,transparent 60%,rgba(0,212,255,.15) 61%,transparent 62%),repeating-linear-gradient(0deg,rgba(0,212,255,.07) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(0,212,255,.07) 0 1px,transparent 1px 22px);position:relative;overflow:hidden}' +
    '#navi .radar u{position:absolute;width:8px;height:8px;margin:-4px;border-radius:50%;background:' + THEME.gold + ';box-shadow:0 0 8px ' + THEME.gold + ';text-decoration:none}#navi .radar u.me{background:' + THEME.cyan + ';box-shadow:0 0 10px ' + THEME.cyan + '}' +
    '#naviBtn{position:fixed;right:14px;top:96px;z-index:8000;padding:9px 13px;font:700 12px "Chakra Petch",sans-serif;letter-spacing:.16em;color:' + THEME.cyan + ';background:rgba(5,14,34,.85);border:1px solid ' + THEME.cyan + ';cursor:pointer;box-shadow:0 0 14px rgba(0,212,255,.35)}' +
    '#naviWp{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:7999;display:none;padding:5px 14px;font:700 13px "Chakra Petch",sans-serif;letter-spacing:.12em;color:' + THEME.gold + ';background:rgba(5,14,34,.8);border:1px solid ' + THEME.gold + '}' +
    '#naviToasts{position:fixed;left:14px;bottom:70px;z-index:7998;display:flex;flex-direction:column;gap:4px;pointer-events:none}#naviToasts div{background:rgba(5,14,34,.85);border-left:3px solid ' + THEME.cyan + ';padding:5px 10px;font:14px "Chakra Petch",sans-serif;color:' + THEME.white + '}' +
    '@media(max-width:820px){#navi .plate{width:46vw;top:6%;bottom:36%;font-size:12px}#navi .orbwrap{display:none}#navi .hx{width:46px;height:52px;font-size:14px}#navi .hx.c{width:64px;height:72px}#navi .hx.n2{display:none}#navi .kpi{min-width:82px;padding:5px 8px}#navi .kpi span{font-size:15px}#navi .slots{display:none}}';
  css += '#navi .ic{width:22px;height:22px;display:block;margin-bottom:2px}#navi .hx .ic{width:24px;height:24px}#navi .hx.c .ic{width:34px;height:34px}#navi .node{color:' + THEME.cyan + '}#navi .node.act,#navi .node:hover{color:' + THEME.gold + '}' +
    '#navi .node:focus-visible,#navi .hx:focus-visible,#navi button.b:focus-visible,#navi .row:focus-visible{outline:2px solid ' + THEME.gold + ';outline-offset:3px}#navi .hx{color:' + THEME.white + '}';
  css += '' +
    /* NAVI 3D SKIN (2026-10-01): bevelled glass orbs, tilted glass plates, glossy hex row, solid-key buttons, floor grid, lit core. Pure CSS (no blur, no extra passes). */
    '#navi .stage{perspective:1500px}' +
    '#navi .bg:after{content:"";position:absolute;left:-20%;right:-20%;bottom:-6%;height:46%;background:repeating-linear-gradient(90deg,rgba(0,212,255,.16) 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,rgba(0,212,255,.16) 0 1px,transparent 1px 48px);transform:perspective(520px) rotateX(64deg);transform-origin:50% 100%;-webkit-mask-image:linear-gradient(to top,#000 10%,transparent 85%);mask-image:linear-gradient(to top,#000 10%,transparent 85%);pointer-events:none}' +
    '#navi .bg:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(40,120,255,.16),transparent 55%),radial-gradient(ellipse at 50% 100%,rgba(245,166,35,.1),transparent 50%);pointer-events:none}' +
    '#navi .core{background:radial-gradient(circle at 34% 26%,rgba(210,248,255,.8) 0,rgba(90,190,255,.4) 16%,rgba(14,40,92,.96) 56%,rgba(3,10,28,1) 100%);border:2px solid rgba(120,225,255,.9);box-shadow:0 14px 30px rgba(0,0,0,.55),0 0 44px rgba(0,212,255,.5),0 0 90px rgba(27,108,255,.28),inset 0 -16px 26px rgba(0,0,0,.6),inset 0 6px 14px rgba(255,255,255,.22)}' +
    '#navi .core:before{content:"";position:absolute;left:16%;top:5%;width:68%;height:34%;border-radius:50%;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0));opacity:.55;pointer-events:none}' +
    '#navi .ring{box-shadow:0 0 24px rgba(0,212,255,.18) inset,0 0 20px rgba(0,212,255,.16),0 16px 28px rgba(0,0,0,.35)}' +
    '#navi .node{background:radial-gradient(circle at 32% 24%,rgba(200,242,255,.55) 0,rgba(70,160,255,.26) 20%,rgba(8,24,56,.94) 62%,rgba(2,8,22,.98) 100%);border:1px solid rgba(130,225,255,.7);box-shadow:0 10px 16px rgba(0,0,0,.6),0 0 18px rgba(0,212,255,.3),inset 0 -9px 13px rgba(0,0,0,.55),inset 0 3px 7px rgba(255,255,255,.3);transition:transform .18s cubic-bezier(.2,.9,.3,1),box-shadow .18s,border-color .18s}' +
    '#navi .node:before{content:"";position:absolute;left:14%;top:5%;width:72%;height:38%;border-radius:50%;background:linear-gradient(rgba(255,255,255,.6),rgba(255,255,255,0));opacity:.5;pointer-events:none}' +
    '#navi .node>*{position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}' +
    '#navi .node:hover,#navi .node.act{transform:translateY(-4px) scale(1.14);border-color:' + THEME.gold + ';box-shadow:0 16px 22px rgba(0,0,0,.6),0 0 26px rgba(245,166,35,.6),0 0 60px rgba(245,166,35,.25),inset 0 -9px 13px rgba(60,30,0,.55),inset 0 3px 7px rgba(255,235,190,.35)}' +
    '#navi .node.act{animation:nvpulse 2.2s ease-in-out infinite}@keyframes nvpulse{50%{box-shadow:0 16px 22px rgba(0,0,0,.6),0 0 38px rgba(245,166,35,.85),0 0 80px rgba(245,166,35,.35),inset 0 -9px 13px rgba(60,30,0,.55),inset 0 3px 7px rgba(255,235,190,.35)}}' +
    '#navi .plate{background:linear-gradient(160deg,rgba(20,48,100,.88),rgba(5,12,32,.92) 60%,rgba(3,8,22,.95));border:1px solid rgba(110,215,255,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -40px 60px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,212,255,.08),0 0 30px rgba(0,212,255,.14)}' +
    '#navi .pl{transform:rotateY(8deg);transform-origin:0 50%}#navi .pr{transform:rotateY(-8deg);transform-origin:100% 50%}' +
    '#navi .plate:before{content:"";position:absolute;left:0;top:0;width:100%;height:46px;background:linear-gradient(rgba(255,255,255,.1),rgba(255,255,255,0));pointer-events:none}' +
    '#navi .plate h3{text-shadow:0 0 12px rgba(245,166,35,.55);border-bottom:1px solid rgba(245,166,35,.5)}' +
    '#navi .row{background:linear-gradient(90deg,rgba(0,212,255,.1),rgba(0,212,255,.02));border-left:3px solid rgba(0,212,255,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);transition:transform .14s,background .14s,border-color .14s}' +
    '#navi .row:hover,#navi .row.sel{transform:translateX(3px);background:linear-gradient(90deg,rgba(0,212,255,.26),rgba(0,212,255,.06));border-left-color:' + THEME.gold + '}' +
    '#navi .hx{position:relative;background:linear-gradient(180deg,rgba(140,230,255,.5),rgba(0,212,255,.2) 42%,rgba(8,30,74,.85));opacity:.92;transition:transform .18s cubic-bezier(.2,.9,.3,1),filter .18s}' +
    '#navi .hx:before{content:"";position:absolute;inset:3px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(180deg,rgba(14,40,92,.9),rgba(3,10,28,.95));z-index:-1}' +
    '#navi .hx:hover{transform:translateY(-4px);filter:drop-shadow(0 0 14px ' + THEME.cyan + ')}' +
    '#navi .hx.c{background:linear-gradient(180deg,rgba(255,235,190,.85),rgba(245,166,35,.5) 40%,rgba(120,60,0,.8));filter:drop-shadow(0 8px 12px rgba(0,0,0,.6)) drop-shadow(0 0 20px rgba(245,166,35,.7))}' +
    '#navi .hx.c:before{background:linear-gradient(180deg,rgba(30,70,150,.95),rgba(6,16,44,.98))}' +
    '#navi .kpi{background:linear-gradient(180deg,rgba(24,56,112,.94),rgba(4,12,32,.96));border:1px solid rgba(110,215,255,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.25),inset 0 -14px 20px rgba(0,0,0,.4)}' +
    '#navi .kpi span{text-shadow:0 0 16px currentColor}' +
    '#navi button.b{background:linear-gradient(180deg,rgba(60,140,255,.55),rgba(20,70,170,.5));border:1px solid rgba(130,225,255,.8);border-bottom-width:3px;border-radius:7px;box-shadow:0 6px 12px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .12s,box-shadow .12s,filter .12s;text-shadow:0 1px 2px rgba(0,0,0,.6)}' +
    '#navi button.b:hover{transform:translateY(-2px);filter:brightness(1.18);box-shadow:0 10px 16px rgba(0,0,0,.5),0 0 16px rgba(0,212,255,.35),inset 0 1px 0 rgba(255,255,255,.35)}#navi button.b:active{transform:translateY(1px);border-bottom-width:1px;box-shadow:0 2px 4px rgba(0,0,0,.5)}' +
    '#navi button.b.g{background:linear-gradient(180deg,rgba(255,200,90,.5),rgba(160,90,10,.5));border-color:rgba(255,215,130,.9)}' +
    '#navi .x{background:linear-gradient(180deg,rgba(60,140,255,.3),rgba(10,30,80,.5));border-radius:7px;border-bottom-width:3px;box-shadow:0 4px 10px rgba(0,0,0,.5)}' +
    '#navi .slots span{background:rgba(0,212,255,.05);border-radius:5px}' +
    '#navi .hx small{color:#d8f4ff;text-shadow:0 1px 3px #000,0 0 8px rgba(0,212,255,.6);font-weight:700}#navi .hx.n1,#navi .hx.n2{opacity:.95}' +
    'body.navi-open #hint,body.navi-open #helpChip,body.navi-open #naviBtn{display:none!important}';


  /* ---------------- DOM ---------------- */
  // HOLO ARC (owner ref 2026-10-23: panels floating in a curved arc off the palm, "swivel more three.js"): CSS-3D only - the plates
  // swing in on an arc, the orb ring tilts like a palm projection, the deck swivels with the pointer (vars --nvSw / --nvTilt).
  css += '#navi .stage{perspective:1100px;transform-style:preserve-3d}' +
    '#navi .orbwrap{transform:translate(-50%,-50%) rotateX(var(--nvTilt,14deg)) rotateY(var(--nvSw,0deg));transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.9,.3,1)}' +
    '#navi .plate.pl{transform:rotateY(calc(24deg + var(--nvSw,0deg))) translateZ(-30px);transform-origin:0 50%;transition:transform .35s cubic-bezier(.2,.9,.3,1);animation:nvfloatL 7s ease-in-out infinite}' +
    '#navi .plate.pr{transform:rotateY(calc(-24deg + var(--nvSw,0deg))) translateZ(-30px);transform-origin:100% 50%;transition:transform .35s cubic-bezier(.2,.9,.3,1);animation:nvfloatR 7s ease-in-out infinite}' +
    '#navi .plate{backdrop-filter:blur(6px) saturate(1.2);box-shadow:0 0 0 1px rgba(0,212,255,.35),0 0 34px rgba(0,212,255,.16),0 24px 60px rgba(0,0,0,.55)}' +
    '#navi .plate:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 30%,rgba(140,230,255,.10) 45%,transparent 60%);background-size:260% 100%;animation:nvsheen 6s linear infinite}' +
    '@keyframes nvfloatL{0%,100%{margin-top:0}50%{margin-top:-6px}}@keyframes nvfloatR{0%,100%{margin-top:-6px}50%{margin-top:0}}@keyframes nvsheen{from{background-position:200% 0}to{background-position:-60% 0}}' +
    '#navi .swivel{transform:translateX(-50%) rotateX(calc(var(--nvTilt,14deg) * .6))}' +
    '@media (prefers-reduced-motion:reduce){#navi .plate{animation:none}#navi .plate:before{animation:none}}';
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
    root.addEventListener('mousemove', function (e) {   // HOLO ARC swivel: pointer parallax (cheap: two CSS vars, no layout)
      var sw = ((e.clientX / innerWidth) - 0.5) * 18, tl = 14 - ((e.clientY / innerHeight) - 0.5) * 12;
      root.style.setProperty('--nvSw', sw.toFixed(1) + 'deg'); root.style.setProperty('--nvTilt', tl.toFixed(1) + 'deg');
    });
    elL = root.querySelector('#nvL'); elR = root.querySelector('#nvR'); elSw = root.querySelector('#nvSw'); elKp = root.querySelector('#nvKp');
    elNodes = root.querySelector('#nvNodes'); elCore = root.querySelector('#nvAgent');
    root.querySelector('#nvX').onclick = close;
    root.querySelector('.bg').onclick = function () { if (!modalEl) close(); };
    MODULES.forEach(function (m, i) {
      var a = (i / MODULES.length) * Math.PI * 2 - Math.PI / 2, n = document.createElement('div');
      n.className = 'node'; n.dataset.m = m.id; n.style.left = (50 + 50 * Math.cos(a)) + '%'; n.style.top = (50 + 50 * Math.sin(a)) + '%';
      n.innerHTML = icon(m.id) + '<small>' + m.label + '</small>'; n.title = m.label; n.setAttribute('role', 'button'); n.tabIndex = 0; n.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModule(m.id); } }; n.onclick = function () { setModule(m.id); }; elNodes.appendChild(n);
    });
    var sl = root.querySelector('#nvSlots');
    SLOTS.forEach(function (s) {
      var e = document.createElement('span'); e.textContent = s.toUpperCase(); e.style.display = 'none'; e.dataset.s = s;
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

  /* REAL INVENTORY (owner 2026-10-01 Navi upgrade): built live from the game systems — operatives you own (skins), mounts/boards you own, and the shared item bag (crops, perk kits). No demo data. */
  function realInventory() {
    var out = [], WO = window.WorldOperatives, WM = window.WorldMounts, IV = window.ShdInv, cur = window._playerCharacter;
    if (WO) WO.list().forEach(function (o) { if (o.owned) out.push({ id: 'op:' + o.code, cat: 'Skins', name: o.name, rarity: o.base ? 'Base operative' : 'Council operative', power: o.base ? 8 : Math.round(o.price / 100), tradable: false, equipped: cur === o.code, img: o.portrait }); });
    if (WM) WM.owned().forEach(function (m) { var d = WM.def(m.id); if (d) out.push({ id: 'mt:' + m.id, cat: 'Mounts', name: d.name, rarity: d.flying ? 'Flying · hp ' + m.hp : 'hp ' + m.hp, power: Math.round((d.price || 0) / 100), tradable: false, equipped: S.flags.mountedId === 'mt:' + m.id }); });
    if (IV) { var all = IV.all(); Object.keys(all).forEach(function (k) { var crop = /^crop-/.test(k); out.push({ id: 'it:' + k, cat: crop ? 'Consumables' : 'Gear', name: k.replace(/^crop-/, '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' x' + all[k], rarity: crop ? 'Harvest' : 'Kit', power: 0, tradable: false, equipped: false }); }); }
    return out;
  }
  M.inv = function () {
    S.inventory = realInventory();
    var cats = ['Skins', 'Skills', 'Mounts', 'Gear', 'Consumables', 'Quest'], out = [];
    cats.forEach(function (c) { var arr = S.inventory.filter(function (i) { return i.cat === c; }); if (arr.length) { out.push({ head: c + ' · ' + arr.length }); arr.forEach(function (i) { out.push({ id: i.id, t: i.name, s: i.rarity, tag: i.equipped ? 'EQUIPPED' : '' }); }); } });
    out.unshift({ id: 'mounts-store', t: 'Mounts & Travel', s: 'your rides, boards, ships, cars - buy, summon, stow (also the I key)', tag: 'OPEN' });
    return {
      title: 'ITEMS', list: out, empty: 'Your bag is empty. Visit the Market or finish a bounty.',
      detail: function (id) {
        if (id === 'mounts-store') return '<h3>Mounts &amp; Travel</h3><div>Mounts, hover cars, race ships and hoverboards: buy with Sparks, summon, stow. Boards: O to ride.</div><button class="b g" data-a="mounts">OPEN MOUNTS &amp; TRAVEL</button>';
        var it = S.inventory.filter(function (x) { return x.id === id; })[0]; if (!it) return '<div class="empty">Select an item.</div>';
        var home = S.flags.hasHome;
        return '<h3>' + esc(it.name) + '</h3><div>' + esc(it.cat) + ' · ' + esc(it.rarity) + '</div><div style="margin:8px 0">POWER ' + it.power + ' · ' + (it.tradable ? 'TRADABLE' : 'SOULBOUND') + '</div>' +
          (it.img ? '<div style="height:150px;border:1px solid rgba(0,212,255,.4);background:#050814 center/contain no-repeat url(' + it.img + ')"></div>' : '<div style="height:60px;border:1px dashed rgba(0,212,255,.4);display:flex;align-items:center;justify-content:center;color:#6f93b3">' + esc(it.cat) + '</div>') +
          '<button class="b" data-a="equip">' + (it.equipped ? 'UNEQUIP' : 'EQUIP') + '</button>' +
          '<button class="b g" data-a="home"' + (home ? '' : ' disabled title="No home yet"') + '>SEND TO HOME</button>' + (home ? '' : '<div class="empty">No home yet — claim a plot.</div>') +
          '<button class="b" data-a="drop"' + (it.tradable ? '' : ' disabled') + '>DROP</button>';
      },
      act: function (id, a) {
        if (id === 'mounts-store') { if (a === 'mounts') { var MR = window.__mountRide; close(); if (MR && MR.panel) MR.panel(); else toast('Mounts are not ready yet'); } return; }
        var it = S.inventory.filter(function (x) { return x.id === id; })[0]; if (!it) return;
        if (a === 'equip' && /^op:/.test(id)) { if (window.setPlayerCharacter) { window.setPlayerCharacter(id.slice(3)); toast('Switching to ' + it.name + '...'); } return; }
        if (a === 'equip' && /^mt:/.test(id)) { var R = window.__mountRide, mid = id.slice(3); if (R) { if (S.flags.mountedId === id) { R.stow(); S.flags.mountedId = null; } else { R.summon(mid, true); S.flags.mountedId = id; } } return; }
        if (a === 'equip' && /^it:/.test(id)) { toast('Use this at an office, the farm or the exchange.'); return; }
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
    // 2026-10-04 (owner: "get to things easier"): the big destinations are always on the map
    try { var hp = window.__hoverPark; if (hp && hp.entrance) out.unshift({ id: 'park', t: 'Hoverskate Park', kind: 'Park', x: hp.entrance.x, z: hp.entrance.z }); } catch (e) { }
    try { var ent = window.__entrances; if (ent) ent.forEach(function (q) { out.push({ id: 'door-' + q.code, t: q.code + ' Building', kind: 'Building', x: q.x + q.nx * 30, z: q.z + q.nz * 30 }); }); } catch (e) { }
    out.unshift({ id: 'academy', t: 'The Athenaeum (Academy)', kind: 'Academy', x: 3958.8, z: -3117.6 });
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
        var pp = window.__w3dDebug && window.__w3dDebug.playerPos, dots = '<u class="me" style="left:50%;top:50%"></u>';
        var p = pins.filter(function (x) { return x.id === id; })[0];
        // radar auto-zooms: fit the selected pin (or every pin) instead of a fixed ~100 m window that showed nothing
        var R = 400; if (pp) { var far = 0; (p ? [p] : pins).forEach(function (q) { far = Math.max(far, Math.abs(q.x - pp.x), Math.abs(q.z - pp.z)); }); R = Math.max(400, far * 2.3); }
        pins.forEach(function (q) { if (!pp) return; var dx = (q.x - pp.x) / R, dz = (q.z - pp.z) / R; if (Math.abs(dx) < .5 && Math.abs(dz) < .5) dots += '<u style="left:' + (50 + dx * 100) + '%;top:' + (50 + dz * 100) + '%' + (q === p ? ';background:#e8c45c;width:10px;height:10px' : '') + '"></u>'; });
        var dist = (p && pp) ? Math.round(Math.hypot(p.x - pp.x, p.z - pp.z) / (7 / 1.8)) : null;
        return '<h3>' + (p ? esc(p.t) : 'RADAR') + '</h3><div class="radar">' + dots + '</div>' + (p ? '<div style="margin-top:8px">' + esc(p.kind) + (dist != null ? ' · ' + dist + ' m away' : '') + (p.when ? ' · ' + esc(p.when) : '') + '</div>' +
          '<button class="b g" data-a="go">TRAVEL</button><button class="b" data-a="wp">SET WAYPOINT</button>' : '') + '<button class="b" data-a="clr">CLEAR</button>';
      },
      act: function (id, a) {
        if (a === 'clr') return clearWaypoint();
        var p = pins.filter(function (x) { return x.id === id; })[0]; if (!p) return;
        if (a === 'go') {   // TRAVEL: fast-travel next to the place (height comes from the terrain each frame); also leaves a waypoint
          var pp = window.__w3dDebug && window.__w3dDebug.playerPos; if (!pp) return;
          var I = window.__w3dDebug.interiors; if (I && I.isInside && I.isInside() && I.exit) try { I.exit(); } catch (e) { }
          pp.x = p.x; pp.z = p.z + 12; setWaypoint({ x: p.x, z: p.z, label: p.t, kind: p.kind }); toast('Travelled to ' + p.t);
          try { window.Navi.close(); } catch (e) { } return;
        }
        setWaypoint({ x: p.x, z: p.z, label: p.t, kind: p.kind });
      }
    };
  };

  // CHAT (2026-10-15): pick a display name once (stored locally, sent with every message), then talk on Nearby / Global /
  // Party / Agent. world-navi-chat.js relays the channels through /api/mp and feeds replies back via Navi.chatSet().
  var NAME_KEY = 'shd_display_name', NAME_RE = /^[A-Za-z0-9_ .-]{2,24}$/;
  function myName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
  M.chat = function () {
    var ch = S.chat.channel, log = S.chat.log[ch], name = myName();
    return {
      title: 'CHAT', list: ['Nearby', 'Global', 'Party', 'Agent'].map(function (c) { return { id: c, t: c, s: S.chat.log[c].length + ' msgs' }; }),
      empty: '', selId: ch,
      detail: function () {
        if (!name) return '<h3>Choose your name</h3><div style="opacity:.75;margin-bottom:8px">This is how other players and agents see you in chat. 2-24 letters, numbers, space, dot, dash or underscore.</div>' +
          '<input id="nvNameIn" placeholder="Your name" maxlength="24"><button class="b g" data-a="name">JOIN CHAT</button>';
        return '<h3>#' + esc(ch) + ' <small style="opacity:.6;font-weight:400">as ' + esc(name) + '</small></h3><div style="max-height:46vh;overflow:auto">' + (log.length ? log.map(function (m) { return '<div><em style="color:' + (m.me ? THEME.gold : THEME.cyan) + '">' + esc(m.u) + '</em>: ' + esc(m.t) + '</div>'; }).join('') : '<div style="opacity:.6">No messages yet. Say hi.</div>') +
          '</div><input id="nvChatIn" placeholder="Type message…" maxlength="240"><button class="b" data-a="send">SEND</button>';
      },
      act: function (id, a) {
        if (!a) { S.chat.channel = id; return; }
        if (a === 'name') {
          var ni = root.querySelector('#nvNameIn'), nv = ni && ni.value.trim();
          if (!nv || !NAME_RE.test(nv)) { toast('Name: 2-24 letters, numbers, space . - _'); return; }
          try { localStorage.setItem(NAME_KEY, nv); } catch (e) { }
          if (hooks().onName) hooks().onName(nv); toast('Welcome, ' + nv); return;
        }
        var el = root.querySelector('#nvChatIn'), t = el && el.value.trim(); if (!t) return;
        S.chat.log[ch].push({ u: name || 'you', t: t, me: true, at: Date.now() });
        if (S.chat.log[ch].length > 80) S.chat.log[ch].splice(0, S.chat.log[ch].length - 80);
        if (hooks().sendChat) hooks().sendChat(ch, t, name);
      }
    };
  };

  var SPARK_EVENTS = [
    { id: 'ev1', t: 'Dragons Colosseum · 1v1 Agent', s: 'Entry 50 ✦', pin: { x: 0, z: 1500, label: 'Colosseum Door', kind: 'Colosseum' } },
    { id: 'ev2', t: 'Cosmetic Wager Bracket', s: 'Entry: 1 skin', pin: { x: 0, z: 1500, label: 'Colosseum Door', kind: 'Colosseum' } }
  ];
  var RACE_ENTRY = { casual: 25, ranked: 50 };
  function raceRows() { var WR = window.WorldRace; return WR ? Object.keys(WR.CIRCUITS).map(function (k) { var c = WR.CIRCUITS[k]; return { id: 'race:' + k, t: '🏁 ' + c.name, s: c.laps + ' laps · ' + c.gates.length + ' gates' + (c.prime ? ' · PRIME' : ''), tag: 'RACE' }; }) : []; }
  function raceDetail(id) {
    var WR = window.WorldRace, c = WR.CIRCUITS[id.slice(5)], kinds = {}; c.gates.forEach(function (g) { kinds[g.kind] = (kinds[g.kind] || 0) + 1; });
    return '<h3>' + esc(c.name.toUpperCase()) + '</h3><div>' + c.laps + ' laps · rooms: ' + esc(c.rooms.join(' → ')) + '</div><div style="margin:6px 0">Gates: ' + Object.keys(kinds).map(function (k) { return kinds[k] + ' ' + k; }).join(' · ') + '</div>' +
      '<div class="empty">Score = time + capped trick bonus (8%) − wash 1.2 s − missed pad gate 0.8 s.' + (c.lavaKill ? ' Lava = DNF.' : '') + ' Ranked heats: no pocket vials (Pad Rush, Foil Sip). Crates and track pads only.</div>' +
      '<button class="b g" data-a="race-casual">ENTER CASUAL · ' + RACE_ENTRY.casual + ' ✦</button><button class="b g" data-a="race-ranked">ENTER RANKED · ' + RACE_ENTRY.ranked + ' ✦</button><div class="empty">Ghost of the record line = Sparks cosmetic, never a faster board.</div>';
  }
  M.sparks = function () {
    return {
      title: 'SPARKS · COLOSSEUM · RACES', list: SPARK_EVENTS.map(function (e) { return { id: e.id, t: e.t, s: e.s }; }).concat(raceRows()), empty: 'No sparks event this hour.',
      detail: function (id) {
        if (id && id.indexOf('race:') === 0 && window.WorldRace) return raceDetail(id);
        var e = SPARK_EVENTS.filter(function (x) { return x.id === id; })[0];
        var stats = '<h3>STATS</h3><div>Dragons slain ' + S.stats.dragonsSlain + ' · Trades ' + S.stats.trades + ' · Classes ' + S.stats.classes + ' · Record ' + S.stats.colosseum + '</div>';
        if (!e) return '<div class="empty">Pick an event. Sign-up routes you to the door — the fight does not start from the menu.</div>' + stats;
        return '<h3>' + esc(e.t) + '</h3><div>' + esc(e.s) + '</div><button class="b g" data-a="su">SIGN UP</button><button class="b" data-a="vs">VS REQUEST</button>' + stats;
      },
      act: function (id, a) {
        if (id && id.indexOf('race:') === 0 && (a === 'race-casual' || a === 'race-ranked')) {
          var ranked = a === 'race-ranked', cost = ranked ? RACE_ENTRY.ranked : RACE_ENTRY.casual, cid = id.slice(5), circ = window.WorldRace.CIRCUITS[cid];
          if (circ.prime && !(window.NaviState && window.NaviState.flags && window.NaviState.flags.riftTicket)) { toast('Rift Cut is Prime: you need a Rift Ticket (Academy).'); return; }
          if (!window.ShdSparks || !window.ShdSparks.spend(cost, 'race-entry', cid)) { toast('Not enough Sparks (' + cost + ')'); return; }
          S.schedule.push({ id: 'race-' + cid, t: circ.name + (ranked ? ' (ranked)' : '') }); if (hooks().onRaceEnter) hooks().onRaceEnter(cid, ranked); toast('Entered ' + circ.name + ' — head to the Forum gate'); return;
        }
        var e = SPARK_EVENTS.filter(function (x) { return x.id === id; })[0]; if (!e) return;
        if (a === 'su') { S.schedule.push({ id: e.id, t: e.t }); var cp = colosseumPin(); setWaypoint(cp ? { x: cp.x, z: cp.z, label: 'Colosseum Door', kind: 'Colosseum' } : e.pin); if (hooks().onSparksSignup) hooks().onSparksSignup(e.id); toast('Signed up. Navi will guide you to the door.'); }
        if (a === 'vs') toast('VS request: choose a target (coming with multiplayer roster).');
      }
    };
  };

  var NEWS = [{ id: 'n1', t: 'Colosseum bracket opens', s: 'Tournament' }, { id: 'n2', t: 'Arctic realm trailer drops', s: 'World' }, { id: 'n3', t: 'Train line 2 online', s: 'World' }];
  /* SIGNALS (owner 2026-10-01: Navi subscriptions): ZEROX call feed. The SERVER decides what you may see (free = delayed 3-call preview, paid = live feed with entry/stop/target);
   * this module only renders what the server returned. Auth: the session token (localStorage shd_token) if any. Never fakes data: offline = says so. */
  var SIG = { state: 'idle', data: null, at: 0 };
  function sigLoad() {
    if (SIG.state === 'loading' || (SIG.state === 'ready' && Date.now() - SIG.at < 30000)) return; SIG.state = 'loading';
    var h = {}; try { var tk = localStorage.getItem('shd_token'); if (tk) h.Authorization = 'Bearer ' + tk; } catch (e) { }
    var base = (window.SHADDAI_API_BASE || '').replace(/\/$/, '');
    fetch(base + '/api/navi/signals', { headers: h, cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { SIG.data = j && j.ok ? j : null; SIG.state = j && j.ok ? 'ready' : 'error'; SIG.at = Date.now(); render(); }).catch(function () { SIG.state = 'error'; SIG.at = Date.now(); render(); });
  }
  M.signals = function () {
    sigLoad(); var d = SIG.data, list = [];
    if (d && d.calls) d.calls.forEach(function (c, i) { list.push({ id: 'sg' + i, t: (c.symbol || c.name || '?') + (c.chain ? ' · ' + c.chain : ''), s: d.live ? (c.peakMult != null ? 'peak x' + (Math.round(c.peakMult * 10) / 10) : 'live') : (c.ageMin + ' min ago'), tag: d.live ? 'LIVE' : 'DELAYED' }); });
    return { title: 'SIGNALS · ' + (d ? (d.live ? 'LIVE' : 'FREE PREVIEW') : (SIG.state === 'loading' ? 'LOADING' : 'OFFLINE')), list: list, empty: SIG.state === 'error' ? 'Signals are offline right now.' : (SIG.state === 'loading' || SIG.state === 'idle' ? 'Loading ZEROX signals…' : 'No calls yet.'),
      detail: function (id) {
        var c = d && d.calls ? d.calls[+String(id).slice(2)] : null; if (!c) return '<div class="empty">' + (d && d.locked ? esc(d.upgrade.msg) : 'Select a call.') + '</div>';
        if (!d.live) return '<h3>' + esc(c.symbol || '?') + '</h3><div>' + esc(c.chain || '') + ' · called ' + c.ageMin + ' min ago' + (c.peakMult != null ? ' · peak x' + c.peakMult : '') + '</div><div class="empty" style="margin-top:10px">' + esc(d.upgrade.msg) + '</div><a class="b g" style="display:inline-block;text-decoration:none" href="' + esc(d.upgrade.path) + '" target="_blank">SEE PLANS</a>';
        var rows = [['Entry', c.entry], ['Stop', c.stop], ['Target', c.target], ['Peak', c.peakMult != null ? 'x' + c.peakMult : null], ['Source', c.source]].filter(function (r) { return r[1] != null && r[1] !== ''; }).map(function (r) { return '<div>' + r[0] + ': <b>' + esc(String(r[1])) + '</b></div>'; }).join('');
        return '<h3>' + esc(c.symbol || c.name || '?') + '</h3><div>' + esc(c.chain || '') + '</div><div style="margin:8px 0">' + rows + '</div><div class="empty">Signals are information, not advice. You confirm every trade yourself.</div>';
      },
      act: function () { } };
  };
  /* MARKETS + NEWS (2026-10-23): live free feeds through world-live-feeds.js (server-cached CoinGecko / alternative.me / Cointelegraph).
   * Offline = says so; nothing is invented. Information only, not advice. */
  function feed(k) { var F = window.WorldFeeds; return F ? F.get(k) : { state: 'offline', data: null }; }
  if (window.WorldFeeds) window.WorldFeeds.on(function () { if (typeof render === 'function') try { render(); } catch (e) { } });
  function fmt(n) { return n == null ? '-' : (n >= 1000 ? '$' + Math.round(n).toLocaleString() : '$' + (+n).toPrecision(4)); }
  M.markets = function () {
    var T = feed('tickers'), G = feed('fng'), R = feed('trending'), list = [];
    if (G.data) list.push({ id: 'mk-fng', t: 'Fear & Greed: ' + G.data.value, s: G.data.value_classification, tag: 'MOOD' });
    (T.data || []).forEach(function (c, i) { list.push({ id: 'mk' + i, t: c.symbol + '  ' + fmt(c.price), s: (c.change24h >= 0 ? '+' : '') + c.change24h + '% 24h', tag: c.change24h >= 0 ? 'UP' : 'DOWN' }); });
    (R.data || []).forEach(function (c, i) { list.push({ id: 'tr' + i, t: 'Trending: ' + c.symbol, s: c.name + (c.rank ? ' · rank ' + c.rank : ''), tag: 'HOT' }); });
    return { title: 'MARKETS · ' + (T.state === 'ready' ? 'LIVE' : T.state === 'offline' ? 'OFFLINE' : 'LOADING'), list: list,
      empty: T.state === 'offline' ? 'Markets are offline right now (server not reachable).' : 'Loading live markets…',
      detail: function (id) { var it = list.filter(function (x) { return x.id === id; })[0]; return it ? '<h3>' + esc(it.t) + '</h3><div>' + esc(it.s) + '</div><div class="empty" style="margin-top:10px">Live data: CoinGecko · alternative.me. Information, not advice.</div>' : '<div class="empty">Select a market.</div>'; },
      act: function () { } };
  };
  M.news = function () {
    var N = feed('news'), items = N.data || [];
    var list = items.length ? items.map(function (n, i) { return { id: 'nw' + i, t: n.title, s: (n.date || '').slice(0, 16) + ' · Cointelegraph' }; }) : NEWS.map(function (n) { return { id: n.id, t: n.t, s: n.s + ' · world' }; });
    return { title: 'NEWS · ' + (N.state === 'ready' ? 'LIVE' : N.state === 'offline' ? 'WORLD ONLY (feed offline)' : 'LOADING'), list: list, empty: 'Quiet on the wires.',
      detail: function (id) {
        if (/^nw/.test(id)) { var n = items[+id.slice(2)]; return n ? '<h3>' + esc(n.title) + '</h3><div>' + esc(n.date || '') + '</div><div class="empty" style="margin-top:10px">Source: Cointelegraph' + (n.link ? ' — ' + esc(n.link) : '') + '</div>' : ''; }
        var w = NEWS.filter(function (x) { return x.id === id; })[0]; return w ? '<h3>' + esc(w.t) + '</h3><div>' + esc(w.s) + ' (world bulletin)</div>' : '';
      }, act: function () { } };
  };

  var LISTINGS = [
    { id: 'l1', t: 'Stardust Trail · Hoverboard Skin', s: 'seller: orion', price: 1250, cur: 'PBC', cat: 'Skins' },
    { id: 'l2', t: 'Targeting Matrix · Bot Skill', s: 'seller: lira', price: 850, cur: 'SPK', cat: 'Skills' },
    { id: 'l3', t: 'Aureate Strider · Hoverboard', s: 'seller: nova', price: 2450, cur: 'PBC', cat: 'Mounts' }
  ];
  function openForm(title, fields, onSubmit) {
    modalEl = document.createElement('div'); modalEl.className = 'modal';
    modalEl.innerHTML = '<div><h3 style="margin:0 0 6px;color:' + THEME.gold + '">' + esc(title) + '</h3>' + fields.map(function (f) { return '<label style="font-size:12px;color:' + THEME.cyan + '">' + esc(f.label) + '</label><input data-f="' + f.key + '" placeholder="' + esc(f.ph || '') + '" ' + (f.num ? 'inputmode="numeric"' : '') + '>'; }).join('') +
      '<div id="nvFormErr" style="color:#ff5a6e;min-height:18px;font-size:13px"></div><button class="b g" id="nvOk">SUBMIT</button><button class="b" id="nvNo">CANCEL</button></div>';
    root.appendChild(modalEl); modalEl.querySelector('#nvNo').onclick = closeModal;
    modalEl.querySelector('#nvOk').onclick = function () { var v = {}; fields.forEach(function (f) { v[f.key] = modalEl.querySelector('[data-f="' + f.key + '"]').value; }); var r = onSubmit(v); if (r && r.ok === false) { modalEl.querySelector('#nvFormErr').textContent = r.why || 'Check the fields'; return; } closeModal(); render(); };
  }
  function spendFn() { return function (n, kind, id) { return window.ShdSparks ? window.ShdSparks.spend(n, kind, id) : false; }; }
  M.market = function () {
    var SC = window.WorldShowcase, rows = [], items = SC ? SC.list(null, { status: 'ok' }) : [];
    LISTINGS.forEach(function (l) { rows.push({ id: l.id, t: l.t, s: l.s, tag: l.price + ' ' + l.cur }); });
    items.forEach(function (i) { rows.push({ id: 'sc:' + i.id, t: i.title, s: SC.KINDS[i.kind].label + ' · ' + i.creator, tag: i.priceSparks ? i.priceSparks + ' SPK' : 'FREE' }); });
    if (SC) { Object.keys(SC.KINDS).forEach(function (k) { rows.push({ id: 'sub:' + k, t: '＋ Submit ' + SC.KINDS[k].label.toLowerCase(), s: 'shown in ' + SC.KINDS[k].where, tag: 'YOURS' }); });
      SC.ads.slots.forEach(function (a) { var st = SC.ads.state(a.id); rows.push({ id: 'ad:' + a.id, t: 'Ad space · ' + a.name, s: 'shaddai city', tag: st.free ? SC.TUNE.adPricePerDay + '/day' : 'TAKEN' }); }); }
    return {
      title: 'MARKET', list: rows, empty: 'Nothing listed right now.',
      detail: function (id) {
        if (id && id.indexOf('sub:') === 0) { var k = SC.KINDS[id.slice(4)]; return '<h3>SUBMIT ' + esc(k.label.toUpperCase()) + '</h3><div>Shown in the ' + esc(k.where) + '. Nothing appears or sells until it is reviewed.</div><button class="b g" data-a="submit">START</button>'; }
        if (id && id.indexOf('ad:') === 0) { var a = SC.ads.slots.filter(function (x) { return x.id === id.slice(3); })[0], st = SC.ads.state(id.slice(3)); return '<h3>' + esc(a.name) + '</h3><div>' + (st.free ? 'Free · ' + SC.TUNE.adPricePerDay + ' Sparks/day (7 / 14 / 30 days)' : 'Taken until ' + new Date(st.until).toLocaleDateString() + ' · ' + esc(st.status)) + '</div><div class="empty">Images are reviewed before they show. No hate, scams or impersonation.</div>' + (st.free ? '<button class="b g" data-a="buyad">BUY 7 DAYS</button>' : ''); }
        if (id && id.indexOf('sc:') === 0) { var it = SC.find(id.slice(3)); if (!it) return ''; return '<h3>' + esc(it.title) + '</h3><div>' + esc(SC.KINDS[it.kind].label) + ' by ' + esc(it.creator) + '</div><div style="margin:6px 0;font-size:12px;word-break:break-all">proof: ' + esc(it.fileHash || it.url) + '</div><div style="font-size:22px;color:' + THEME.gold + '">' + (it.priceSparks ? it.priceSparks + ' SPK' : 'FREE') + '</div><button class="b g" data-a="buysc">' + (it.priceSparks ? 'BUY' : 'GET') + '</button><div class="empty">' + SC.TUNE.burnPct + '% of every sale is burned, ' + SC.TUNE.housePct + '% goes to the house.</div>'; }
        var l = LISTINGS.filter(function (x) { return x.id === id; })[0]; if (!l) return '<div class="empty">Art · Books · Tracks · NFT showcases · Ad space · Skins · Skills. Trade terminal lives here too.</div>';
        return '<h3>' + esc(l.t) + '</h3><div>' + esc(l.s) + '</div><div style="height:110px;margin:8px 0;border:1px dashed rgba(0,212,255,.4);display:flex;align-items:center;justify-content:center;color:#6f93b3">PREVIEW</div><div style="font-size:22px;color:' + THEME.gold + '">' + l.price + ' ' + l.cur + '</div><button class="b g" data-a="buy">BUY</button>';
      },
      act: function (id, a) {
        if (!id) return;
        if (a === 'submit') { var kind = id.slice(4); openForm('Submit ' + SC.KINDS[kind].label, [{ key: 'title', label: 'Title' }, { key: 'priceSparks', label: 'Price in Sparks (0 = free)', ph: '0', num: true }, { key: 'fileHash', label: 'File hash (sha256) — proves what you sold' }, { key: 'url', label: 'Link (https, optional)' }], function (v) { var r = SC.submit({ kind: kind, title: v.title, priceSparks: v.priceSparks || 0, fileHash: v.fileHash, url: v.url }); if (r.ok) toast('Submitted — pending review'); return r; }); }
        else if (a === 'buysc') { var r = SC.buy(id.slice(3), spendFn()); toast(r.ok ? 'Yours: ' + r.item.title : r.why); }
        else if (a === 'buyad') { var sid = id.slice(3); openForm('Buy ad space · 7 days', [{ key: 'imageHash', label: 'Image hash (sha256)' }], function (v) { var r = SC.ads.buy(sid, { imageHash: v.imageHash, days: 7 }, spendFn()); if (r.ok) toast('Ad bought — pending review'); return r; }); }
        else if (a === 'buy') { var l = LISTINGS.filter(function (x) { return x.id === id; })[0]; if (l) confirmBuy(l); }
      }
    };
  };

  function confirmBuy(l) {
    modalEl = document.createElement('div'); modalEl.className = 'modal';
    var pb = !!(window.shaddaiPayBox && window.shaddaiPayBox.authorize), home = S.flags.hasHome;
    modalEl.innerHTML = '<div><h3 style="margin:0 0 8px;color:' + THEME.gold + '">CONFIRM PURCHASE</h3><div>' + esc(l.t) + '</div><div style="font-size:22px;margin:8px 0">' + l.price + ' ' + l.cur + '</div>' +
      '<div>PayBox balance: ' + pay() + '</div>' + (home ? '<label><input type="checkbox" id="nvHome" style="width:auto"> Deliver to home</label>' : '') +
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
  /* MODES: quick toggles (passive/fight) + a live read-out of the realm hazard you are standing in. More toggles slot in here (quality, audio, HUD hints). */
  M.modes = function () {
    var CM = window.WorldCombatMode, RZ = window.__realmZones, z = RZ && RZ.state ? RZ.state() : null, locked = CM && CM.locked(), pas = CM && CM.passive();
    // GAME MODES first (owner 2026-10-16: modes in the Navi, not an extra button): every mode from world-game-modes.js, launch on select
    var GS = (window.WorldGameModes && window.WorldGameModes.sections) ? window.WorldGameModes.sections() : [], gm = [];
    GS.forEach(function (sec, si) { gm.push({ head: sec.h }); sec.items.forEach(function (it, ii) { gm.push({ id: 'gm:' + si + ':' + ii, t: it.t, s: it.s, tag: 'PLAY' }); }); });
    if (gm.length) gm.push({ head: 'SETTINGS' });
    var rows = gm.concat([
      { id: 'passive', t: 'Passive mode', s: locked ? 'Locked: the Void forces fight' : (pas ? 'On: nobody can hurt you, you cannot fight' : 'Off: normal combat'), tag: pas ? 'ON' : 'OFF' },
      { id: 'buffs', t: 'Active buffs', s: (window.WorldBuffs && window.WorldBuffs.active().length) ? window.WorldBuffs.active().map(function (b) { return b.name + ' ' + b.left_s + 's'; }).join(' · ') : 'None. Eat or drink at the Colosseum kiosks.', tag: (window.WorldBuffs ? window.WorldBuffs.active().length : 0) || '' },
      { id: 'zone', t: 'Realm hazard', s: z && z.zone ? z.zone.replace('-', ' ') + (z.warn ? ' - ' + z.warn : ' - protected') : 'None here', tag: z && z.zone ? '!' : '' }
    ]);
    return {
      title: 'MODES', list: rows, empty: '',
      detail: function (id) {
        if (/^gm:/.test(id)) { var q = id.split(':'), it = GS[+q[1]] && GS[+q[1]].items[+q[2]]; return it ? '<h3>' + esc(it.t) + '</h3><div>' + esc(it.s || '') + '</div><button class="b g" data-a="play">PLAY</button>' : '<div class="empty">Select a mode.</div>'; }
        if (id === 'zone') { var g = RZ && RZ.gear ? RZ.gear() : null; return '<h3>Realm hazard</h3><div>' + esc(z && z.zone ? z.zone : 'none') + '</div><div>' + esc(z && z.warn ? z.warn : 'You are protected, or not in a hazard zone.') + '</div><div class="empty">Masks: gas ' + (g ? g.masks.gas : 0) + ' · lava ' + (g ? g.masks.lava : 0) + ' · arctic ' + (g ? g.masks.arctic : 0) + '. Clothing resist: fire ' + (g ? g.resist.fire : 0) + ' · cold ' + (g ? g.resist.cold : 0) + '. Learn and buy gear at the Academy and Upgrade Shop.</div>'; }
        return '<h3>Passive mode</h3><div>' + (locked ? 'The Void forces you to fight.' : pas ? 'PASSIVE: players and monsters cannot hurt you and you cannot fight.' : 'FIGHT: normal combat.') + '</div>' + (locked ? '' : '<button class="b g" data-a="tp">' + (pas ? 'TURN PASSIVE OFF' : 'TURN PASSIVE ON') + '</button>') + '<div class="empty">Also on the \ (backslash) key in case of danger.</div>';
      },
      act: function (id, a) { if (/^gm:/.test(id) && a === 'play') { var q = id.split(':'), it = GS[+q[1]] && GS[+q[1]].items[+q[2]]; if (it && it.run) { close(); try { it.run(); } catch (e) { toast('Could not start: ' + (e && e.message)); } } return; }
        if (a === 'tp' && CM) { var r = CM.toggle(); toast(r.locked ? r.reason : (r.passive ? 'Passive mode ON' : 'Fight mode ON')); } }
    };
  };
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
      title: 'WALLET', list: [{ id: 'w1', t: 'PayBox', s: 'balance ' + pay() }, { id: 'w2', t: 'Sparks', s: String(sparks()) }], empty: '',
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
    for (var d = -3; d <= 3; d++) { var NM = MODULES.length, m = MODULES[((i + d) % NM + NM) % NM], c = d === 0 ? 'c' : (Math.abs(d) === 1 ? 'n1' : (Math.abs(d) === 2 ? 'n2' : 'n2')); h += '<button class="hx ' + c + '" data-m="' + m.id + '" aria-label="' + m.label + '">' + icon(m.id) + '<small>' + m.label + '</small></button>'; }
    elSw.innerHTML = h; elSw.onclick = function (e) { var b = e.target.closest('.hx'); if (b) setModule(b.dataset.m); };
    var n = elNodes.children; for (var k = 0; k < n.length; k++) n[k].classList.toggle('act', n[k].dataset.m === S.module);
    elKp.innerHTML = '<div class="kpi gd"><b>SPARKS</b><span>' + sparks() + '</span></div><div class="kpi"><b>PAYBOX</b><span>' + pay() + '</span></div><div class="kpi"><b>AGENT REV</b><span>' + rev() + '</span></div>';
    var ab = S.bots.filter(function (b) { return b.id === S.flags.activeBot; })[0]; elCore.textContent = ab ? ab.name : 'NO ACTIVE BOT';
    SLOTS.forEach(function (s) { var e = root.querySelector('[data-s="' + s + '"]'); if (e) { e.classList.toggle('on', !!S.flags.slots[s]); e.textContent = s.toUpperCase(); e.style.display = S.flags.slots[s] ? '' : 'none'; } });
  }
  function setModule(id) { if (!M[id]) return; S.module = id; selected = null; persist(); render(); root.classList.add('spin'); setTimeout(function () { root && root.classList.remove('spin'); }, 260); }

  /* ---------------- open / close ---------------- */
  var wasLocked = false;
  var capped = null;
  function open() {
    if (!root) build(); if (S.open) return;
    var ti = window.__getQualityTier ? window.__getQualityTier() : 0, bg = root.querySelector('.bg');
    bg.style.backdropFilter = bg.style.webkitBackdropFilter = (ti >= 3 && !low()) ? 'blur(3px)' : 'none';   // full-screen blur only on HIGH+ (a fill-rate tax)
    if (ti > 2 && window.__setQualityTier) { capped = ti; window.__setQualityTier(2, 1e6); }              // Navi open: cap at MEDIUM; the world keeps running behind it
    wasLocked = !!document.pointerLockElement; if (wasLocked && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) { }
    S.open = true; root.classList.add('on'); document.body.classList.add('navi-open'); render(); requestAnimationFrame(function () { root.classList.add('show'); }); emit('open');
  }
  function close() {
    if (!S.open) return; closeModal(); S.open = false; document.body.classList.remove('navi-open'); root.classList.remove('show');
    if (capped != null && window.__setQualityTier) { window.__setQualityTier(capped, 6); capped = null; }   // give the tier back (the governor may re-drop it if the machine cannot hold it)
    setTimeout(function () { if (!S.open) root.classList.remove('on'); }, 280);
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

  function chatRerender(ch) {   // keep what the player is typing (and focus) across a re-render
    if (!root || S.module !== 'chat' || S.chat.channel !== ch) return;
    var el = root.querySelector('#nvChatIn'), v = el ? el.value : '', f = el && document.activeElement === el;
    render();
    var n = root.querySelector('#nvChatIn'); if (n) { n.value = v; if (f) { n.focus(); n.setSelectionRange(v.length, v.length); } }
  }
  window.Navi = {
    open: open, close: close, toggle: toggle, setModule: setModule, setWaypoint: setWaypoint, clearWaypoint: clearWaypoint,
    registerPin: function (p) { S.pins = S.pins.filter(function (x) { return x.id !== p.id; }); S.pins.push(p); },
    toast: function (m) { var c = document.getElementById('naviToasts'); if (!c) return; var d = document.createElement('div'); d.textContent = m; c.appendChild(d); while (c.children.length > 3) c.firstChild.remove(); setTimeout(function () { d.remove(); }, 4000); },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    enableSlot: function (name, fn) { S.flags.slots[name] = fn || function () { }; if (root) render(); },
    /* chat bridge: replace a channel's log with server messages [{u,t,me,at}] and re-render if CHAT is showing */
    chatSet: function (ch, msgs) { if (!S.chat.log[ch]) return; S.chat.log[ch] = msgs.slice(-80); chatRerender(ch); },
    chatPush: function (ch, m) { if (!S.chat.log[ch]) return; S.chat.log[ch].push(m); chatRerender(ch); },
    chatName: myName
  };
  toast = function (m) { window.Navi.toast(m); };
  if (document.body) build(); else addEventListener('DOMContentLoaded', build);
})();
