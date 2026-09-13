/* ============================================================================
 * SHADDAI · shop-client.js — "THE MARKET" (window.Shop)  ·  TURTLE
 * ----------------------------------------------------------------------------
 * Self-contained, additive, ONE <script> include. Cyber-neon HUD storefront
 * where players spend Sparks (⬡) on décor / cosmetics / upgrades — and buy
 * PREMIUM items with real money via Stripe. Exposes window.Shop:
 *   open()              → open the full-screen Shop overlay
 *   close()             → close it
 *   renderInto(el)      → paint the catalog UI into any container
 *   refresh()           → re-pull balance + catalog + inventory, re-render
 *
 * BACKEND CONTRACT (matched exactly):
 *   GET  /api/economy/catalog             → { ok, items:[{id,name,kind,rarity,
 *                                              sparks_price,usd_price_cents,
 *                                              description,category}] }
 *   GET  /api/economy/balance?userId=     → { ok, sparks_balance }
 *   GET  /api/economy/inventory?userId=   → owned items
 *   POST /api/economy/catalog/purchase    {userId,itemId,idempotencyKey}
 *        → Sparks item:  { ok, item, sparksSpent, balance }
 *        → premium item: { requiresStripe:true, item }  (→ Stripe)
 *
 * Currency is ALWAYS "Sparks" (⬡) — never gold/coin/currency.
 * REUSES window.Economy (economy-client.js) for the balance chip + Stripe
 * unlock flow when present; degrades gracefully when it — or the economy
 * endpoints — are absent (clean "shop warming up" state, no console spam,
 * no thrown errors). All item text rendered via textContent / createElement
 * (XSS-safe). Scoped under `.shop-*`; injects its own CSS once.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.Shop) return;

  /* ---------------- config ---------------- */
  var CATEGORIES = [
    { key: 'all',      label: 'ALL',       kinds: null },
    { key: 'decor',    label: 'DÉCOR',     kinds: ['decor'] },
    { key: 'cosmetic', label: 'COSMETICS', kinds: ['cosmetic'] },
    { key: 'upgrade',  label: 'UPGRADES',  kinds: ['upgrade'] },
    { key: 'premium',  label: 'PREMIUM',   kinds: ['premium'] }
  ];
  var RARITY = {
    common:    { label: 'COMMON',    c: '#9fb4ad' },
    uncommon:  { label: 'UNCOMMON',  c: '#00ff88' },
    rare:      { label: 'RARE',      c: '#00E5FF' },
    epic:      { label: 'EPIC',      c: '#b98bff' },
    legendary: { label: 'LEGENDARY', c: '#ffc14d' },
    mythic:    { label: 'MYTHIC',    c: '#ff5db1' }
  };

  /* ---------------- state ---------------- */
  var _state = {
    loaded: false, error: false,
    items: [], owned: {}, balance: null,
    filter: 'all', busy: {}
  };
  var _mountEl = null;      // container currently rendered into
  var _overlay = null;      // full-screen overlay element

  /* ---------------- tiny helpers (never throw) ---------------- */
  function uid() {
    try { return (window.S && S.user && (S.user.id || S.user.email)) || 'demo'; }
    catch (e) { return 'demo'; }
  }
  function safeTimeout(ms) { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } }
  function jget(u) {
    return fetch(u, { signal: safeTimeout(7000) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function jpost(u, body) {
    return fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: safeTimeout(12000)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; })
                     .catch(function () { return { ok: r.ok, status: r.status, data: null }; });
    }).catch(function () { return { ok: false, status: 0, data: null }; });
  }
  function idemKey() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'ik_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);   // XSS-safe
    return e;
  }
  function fmtUsd(cents) {
    var n = (typeof cents === 'number' && isFinite(cents)) ? cents : 0;
    return '$' + (n / 100).toFixed(2);
  }
  function fmtSparks(n) {
    var v = (typeof n === 'number' && isFinite(n)) ? n : 0;
    try { return v.toLocaleString(); } catch (e) { return String(v); }
  }
  function notify(msg) {
    try { if (typeof window.notify === 'function') { window.notify(msg); return; } } catch (e) {}
  }

  /* ---------------- one-time CSS ---------------- */
  function injectCss() {
    if (document.getElementById('shopCss')) return;
    var s = document.createElement('style'); s.id = 'shopCss';
    s.textContent = [
      /* overlay */
      ".shop-overlay{position:fixed;inset:0;z-index:99990;display:flex;align-items:stretch;justify-content:center;padding:0;background:radial-gradient(120% 90% at 50% 0%,rgba(0,229,136,.09),transparent 55%),rgba(2,5,10,.86);backdrop-filter:blur(6px);animation:shopFade .28s ease both;font-family:'Rajdhani','Chakra Petch',sans-serif}",
      "@keyframes shopFade{from{opacity:0}to{opacity:1}}",
      ".shop-panel{position:relative;width:min(1180px,100%);max-height:100vh;margin:auto;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,rgba(8,15,20,.98),rgba(3,7,12,.99));border:1px solid rgba(0,229,136,.28);box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 0 90px rgba(0,229,136,.04)}",
      "@media(min-width:900px){.shop-panel{max-height:92vh;border-radius:18px}}",
      /* header */
      ".shop-head{position:relative;display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 20px 14px;border-bottom:1px solid rgba(0,229,136,.16);background:linear-gradient(180deg,rgba(0,229,136,.05),transparent)}",
      ".shop-head::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00ff88,#00E5FF,transparent);filter:drop-shadow(0 0 6px #00ff88);animation:shopSweep 5s linear infinite}",
      "@keyframes shopSweep{0%{transform:translateX(-45%);opacity:0}12%,88%{opacity:.9}100%{transform:translateX(45%);opacity:0}}",
      ".shop-title{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;font-size:20px;letter-spacing:2px;color:#fff;text-shadow:0 0 18px rgba(0,229,136,.55);margin:0}",
      ".shop-title span{color:#00ff88}",
      ".shop-tag{font-size:10px;letter-spacing:2px;color:rgba(231,255,244,.42);text-transform:uppercase}",
      ".shop-bal{margin-left:auto;display:inline-flex;align-items:center;gap:8px}",
      ".shop-bal-chip{display:inline-flex;align-items:center;gap:6px;font-family:'Rajdhani',sans-serif;font-weight:800;font-size:13px;letter-spacing:.5px;color:#00ff88;padding:7px 14px;border-radius:20px;background:rgba(0,229,136,.08);border:1px solid rgba(0,229,136,.35);box-shadow:0 0 22px rgba(0,229,136,.15)}",
      ".shop-bal-chip b{color:#fff;font-weight:800}",
      ".shop-x{cursor:pointer;color:rgba(231,255,244,.5);font-size:20px;line-height:1;background:none;border:1px solid rgba(255,255,255,.12);border-radius:10px;width:34px;height:34px;transition:.15s}",
      ".shop-x:hover{color:#fff;border-color:rgba(0,229,136,.5);background:rgba(0,229,136,.08)}",
      /* tabs */
      ".shop-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px 0}",
      ".shop-tab{cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;font-size:11px;letter-spacing:1.2px;color:rgba(231,255,244,.55);padding:8px 15px;border-radius:10px 10px 0 0;background:rgba(255,255,255,.03);border:1px solid transparent;border-bottom:none;transition:.15s}",
      ".shop-tab:hover{color:#cfe;background:rgba(0,229,136,.06)}",
      ".shop-tab.on{color:#02150c;background:linear-gradient(135deg,#00ff88,#00E5FF);box-shadow:0 4px 16px rgba(0,229,136,.3)}",
      /* body / grid */
      ".shop-body{flex:1;overflow-y:auto;padding:16px 20px 26px;scrollbar-width:thin;scrollbar-color:rgba(0,229,136,.4) transparent}",
      ".shop-body::-webkit-scrollbar{width:9px}.shop-body::-webkit-scrollbar-thumb{background:rgba(0,229,136,.35);border-radius:8px}",
      ".shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:15px}",
      /* card */
      ".shop-card{position:relative;display:flex;flex-direction:column;border-radius:14px;padding:15px 14px 14px;background:linear-gradient(180deg,rgba(12,22,28,.92),rgba(5,9,14,.96));border:1px solid rgba(255,255,255,.07);overflow:hidden;transition:transform .16s ease,box-shadow .2s ease,border-color .2s}",
      ".shop-card:hover{transform:translateY(-3px);border-color:rgba(0,229,136,.4);box-shadow:0 16px 44px rgba(0,0,0,.55),inset 0 0 40px rgba(0,229,136,.04)}",
      ".shop-card.owned{opacity:.94}",
      ".shop-card .rar{align-self:flex-start;font-family:'Rajdhani',sans-serif;font-weight:800;font-size:9px;letter-spacing:1.5px;padding:3px 9px;border-radius:20px;border:1px solid currentColor;margin-bottom:9px}",
      ".shop-card .thumb{height:74px;border-radius:10px;margin-bottom:11px;display:grid;place-items:center;font-size:30px;background:radial-gradient(circle at 40% 30%,rgba(0,229,136,.14),rgba(0,229,255,.04));border:1px solid rgba(0,229,136,.14)}",
      ".shop-card .nm{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;font-size:14px;letter-spacing:.4px;color:#fff;margin:0 0 5px;line-height:1.2}",
      ".shop-card .ds{font-size:11.5px;line-height:1.45;color:rgba(231,255,244,.58);margin:0 0 12px;flex:1}",
      ".shop-card .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}",
      ".shop-card .price{font-family:'Rajdhani',sans-serif;font-weight:800;font-size:15px;letter-spacing:.4px}",
      ".shop-card .price.sparks{color:#00ff88}",
      ".shop-card .price.usd{color:#ffc14d}",
      ".shop-card .kindtag{position:absolute;top:13px;right:12px;font-size:8.5px;letter-spacing:1.4px;color:rgba(231,255,244,.32);text-transform:uppercase}",
      /* buy button */
      ".shop-buy{cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.6px;font-size:12px;padding:9px 15px;border-radius:10px;border:1px solid transparent;color:#02150c;background:linear-gradient(135deg,#00ff88,#00E5FF);box-shadow:0 6px 20px rgba(0,229,136,.32);transition:transform .12s ease,box-shadow .2s,filter .2s;white-space:nowrap}",
      ".shop-buy:hover{box-shadow:0 8px 28px rgba(0,229,160,.55)}",
      ".shop-buy:active{transform:translateY(1px)}",
      ".shop-buy.premium{color:#1a1200;background:linear-gradient(135deg,#ffc14d,#ff9d3d);box-shadow:0 6px 20px rgba(255,193,77,.32)}",
      ".shop-buy.busy{filter:grayscale(.4) brightness(.85);pointer-events:none;opacity:.8}",
      ".shop-buy.short{color:#02150c;background:linear-gradient(135deg,#ff7a7a,#ff5db1);box-shadow:0 6px 20px rgba(255,93,177,.3)}",
      ".shop-owned{font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.8px;font-size:12px;padding:9px 15px;border-radius:10px;color:#00ff88;background:rgba(0,229,136,.08);border:1px solid rgba(0,229,136,.4);cursor:default;display:inline-flex;align-items:center;gap:6px}",
      ".shop-equip{cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.6px;font-size:12px;padding:9px 15px;border-radius:10px;color:#00E5FF;background:rgba(0,229,255,.07);border:1px solid rgba(0,229,255,.4);transition:.15s}",
      ".shop-equip:hover{background:rgba(0,229,255,.15)}",
      /* purchased flash */
      ".shop-flash{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(180deg,rgba(0,229,136,.16),rgba(2,10,7,.9));border-radius:14px;animation:shopFlash .28s ease both;z-index:5}",
      "@keyframes shopFlash{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}",
      ".shop-flash b{font-family:'Orbitron',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;color:#00ff88;text-shadow:0 0 16px rgba(0,229,136,.7);text-align:center}",
      /* empty / offline / loading states */
      ".shop-state{grid-column:1/-1;padding:56px 20px;text-align:center;color:rgba(231,255,244,.6)}",
      ".shop-state .ic{font-size:40px;margin-bottom:12px;filter:drop-shadow(0 0 12px rgba(0,229,136,.4))}",
      ".shop-state h4{font-family:'Orbitron',sans-serif;font-weight:800;letter-spacing:1px;color:#cfe;margin:0 0 6px;font-size:15px}",
      ".shop-state p{font-size:12px;color:rgba(231,255,244,.45);margin:0}",
      ".shop-spin{width:34px;height:34px;margin:0 auto 14px;border-radius:50%;border:3px solid rgba(0,229,136,.18);border-top-color:#00ff88;animation:shopSpin .8s linear infinite}",
      "@keyframes shopSpin{to{transform:rotate(360deg)}}",
      /* nudge toast (insufficient funds) */
      ".shop-nudge{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;max-width:400px;display:flex;align-items:center;gap:12px;padding:13px 18px;border-radius:14px;color:#e7fff4;background:linear-gradient(180deg,rgba(14,10,8,.98),rgba(20,8,14,.98));border:1px solid rgba(255,120,120,.4);box-shadow:0 20px 60px rgba(0,0,0,.6);animation:shopNudge .3s ease both;font-family:'Rajdhani',sans-serif}",
      "@keyframes shopNudge{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}",
      ".shop-nudge .ni{font-size:22px}",
      ".shop-nudge b{color:#ff8a8a;display:block;font-size:12.5px;letter-spacing:.4px}",
      ".shop-nudge small{color:rgba(231,255,244,.6);font-size:11px}",
      ".shop-nudge button{margin-left:6px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;font-size:11px;letter-spacing:.5px;color:#02150c;background:linear-gradient(135deg,#00ff88,#00E5FF);border:none;padding:8px 13px;border-radius:9px;white-space:nowrap}",
      /* floating open button */
      ".shop-fab{position:fixed;right:18px;bottom:18px;z-index:9998;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;letter-spacing:1.4px;font-size:12px;color:#02150c;padding:12px 18px;border-radius:26px;background:linear-gradient(135deg,#00ff88,#00E5FF);border:none;box-shadow:0 10px 34px rgba(0,229,136,.45);transition:transform .14s ease,box-shadow .2s}",
      ".shop-fab:hover{transform:translateY(-2px);box-shadow:0 14px 42px rgba(0,229,160,.6)}",
      "@media(max-width:640px){.shop-fab{right:12px;bottom:12px;font-size:11px;padding:11px 15px}}",
      /* when the dashboard's bottom nav bar is docked, the fab sat inside its 44px band and
         clipped the last tab labels (reported: "SECURITY" cut off) — lift it clear instead. */
      "body.navpos-bottom .shop-fab{bottom:56px}",
      ".shop-fab.shop-fab-min{padding:0;width:44px;height:44px;border-radius:50%;font-size:0;letter-spacing:0}",
      ".shop-fab.shop-fab-min::before{content:'⬡';font-size:17px}"
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  /* thumb glyph per kind */
  var KIND_ICON = { decor: '🪴', cosmetic: '✨', upgrade: '⚡', premium: '👑' };

  /* ---------------- data ---------------- */
  function loadAll() {
    _state.loaded = false; _state.error = false;
    var uidv = uid();
    return Promise.all([
      jget('/api/economy/catalog'),
      jget('/api/economy/balance?userId=' + encodeURIComponent(uidv)),
      jget('/api/economy/inventory?userId=' + encodeURIComponent(uidv))
    ]).then(function (res) {
      var cat = res[0], bal = res[1], inv = res[2];
      if (!cat || !Array.isArray(cat.items)) { _state.error = true; _state.items = []; }
      else { _state.items = cat.items.filter(function (i) { return i && i.id; }); }

      _state.balance = readBalance(bal);
      _state.owned = readOwned(inv);
      _state.loaded = true;
      return _state;
    }).catch(function () { _state.error = true; _state.loaded = true; return _state; });
  }
  function readBalance(d) {
    if (!d) return null;
    var n = (typeof d.sparks_balance === 'number') ? d.sparks_balance
          : (typeof d.sparks === 'number') ? d.sparks
          : (typeof d.balance === 'number') ? d.balance : null;
    return n;
  }
  function readOwned(inv) {
    var owned = {};
    try {
      var list = inv && (inv.items || inv.inventory || (Array.isArray(inv) ? inv : null));
      if (Array.isArray(list)) {
        list.forEach(function (it) {
          var id = it && (it.id || it.itemId || it.item_id);
          if (id) owned[id] = true;
        });
      }
    } catch (e) {}
    return owned;
  }
  function refreshBalanceOnly() {
    return jget('/api/economy/balance?userId=' + encodeURIComponent(uid()))
      .then(function (b) { var n = readBalance(b); if (n != null) _state.balance = n; return _state.balance; });
  }

  /* ---------------- rendering ---------------- */
  function render() {
    if (!_mountEl) return;
    injectCss();
    _mountEl.textContent = '';

    // Header
    var head = el('div', 'shop-head');
    var titleWrap = el('div');
    var title = el('h2', 'shop-title'); title.appendChild(document.createTextNode('⬡ THE '));
    var accent = el('span', null, 'MARKET'); title.appendChild(accent);
    titleWrap.appendChild(title);
    titleWrap.appendChild(el('div', 'shop-tag', 'Spend Sparks · Deck out your world'));
    head.appendChild(titleWrap);

    var balWrap = el('div', 'shop-bal');
    balWrap.appendChild(buildBalanceChip());
    if (_overlay) {
      var xb = el('button', 'shop-x', '✕'); xb.title = 'Close';
      xb.addEventListener('click', close);
      balWrap.appendChild(xb);
    }
    head.appendChild(balWrap);
    _mountEl.appendChild(head);

    // Tabs
    var tabs = el('div', 'shop-tabs');
    CATEGORIES.forEach(function (c) {
      var t = el('button', 'shop-tab' + (_state.filter === c.key ? ' on' : ''), c.label);
      t.addEventListener('click', function () { _state.filter = c.key; render(); });
      tabs.appendChild(t);
    });
    _mountEl.appendChild(tabs);

    // Body
    var body = el('div', 'shop-body');
    var grid = el('div', 'shop-grid');
    body.appendChild(grid);
    _mountEl.appendChild(body);

    if (!_state.loaded) { grid.appendChild(stateLoading()); return; }
    if (_state.error || !_state.items.length) { grid.appendChild(stateOffline()); return; }

    var items = filteredItems();
    if (!items.length) { grid.appendChild(stateEmpty()); return; }
    items.forEach(function (it) { grid.appendChild(buildCard(it)); });
  }

  function buildBalanceChip() {
    // Prefer Economy's own renderer if present (keeps one source of truth), but
    // we still fall back to our own chip so the header never looks broken.
    var host = el('span');
    if (window.Economy && typeof Economy.renderSparks === 'function') {
      try { Economy.renderSparks(host); } catch (e) {}
    }
    // Our own authoritative chip from _state.balance (Shop just purchased → fresh).
    var chip = el('span', 'shop-bal-chip');
    chip.appendChild(document.createTextNode('⬡ '));
    var b = el('b', null, _state.balance == null ? '—' : fmtSparks(_state.balance));
    chip.appendChild(b);
    chip.appendChild(document.createTextNode(' Sparks'));
    // If Economy rendered something, hide ours to avoid double chips; else use ours.
    if (host.firstChild) { host.style.display = ''; return host; }
    return chip;
  }

  function filteredItems() {
    var cat = CATEGORIES.filter(function (c) { return c.key === _state.filter; })[0];
    if (!cat || !cat.kinds) return _state.items.slice();
    return _state.items.filter(function (it) {
      var kind = String(it.kind || '').toLowerCase();
      return cat.kinds.indexOf(kind) !== -1;
    });
  }

  function isPremium(it) {
    var kind = String(it.kind || '').toLowerCase();
    if (kind === 'premium') return true;
    // No Sparks price but has a USD price → treat as premium.
    var hasS = typeof it.sparks_price === 'number' && it.sparks_price > 0;
    var hasU = typeof it.usd_price_cents === 'number' && it.usd_price_cents > 0;
    return !hasS && hasU;
  }

  function buildCard(it) {
    var kind = String(it.kind || '').toLowerCase();
    var owned = !!_state.owned[it.id];
    var premium = isPremium(it);

    var card = el('div', 'shop-card' + (owned ? ' owned' : ''));
    card.appendChild(el('span', 'kindtag', kind || 'item'));

    // rarity
    var rk = String(it.rarity || 'common').toLowerCase();
    var rar = RARITY[rk] || RARITY.common;
    var rEl = el('span', 'rar', rar.label);
    rEl.style.color = rar.c;
    card.appendChild(rEl);

    // thumb
    var thumb = el('div', 'thumb', KIND_ICON[kind] || '⬡');
    card.appendChild(thumb);

    card.appendChild(el('h4', 'nm', it.name || 'Unnamed Item'));
    card.appendChild(el('p', 'ds', it.description || ''));

    // footer
    var foot = el('div', 'foot');
    var price = el('span', 'price ' + (premium ? 'usd' : 'sparks'));
    if (premium) {
      price.textContent = fmtUsd(it.usd_price_cents);
    } else {
      price.textContent = '⬡ ' + fmtSparks(it.sparks_price) + ' Sparks';
    }
    foot.appendChild(price);

    if (owned) {
      var ownedBtn = el('span', 'shop-owned'); ownedBtn.appendChild(document.createTextNode('✓ Owned'));
      foot.appendChild(ownedBtn);
      var equip = el('button', 'shop-equip', 'Equip');
      equip.addEventListener('click', function () { onEquip(it); });
      foot.appendChild(equip);
    } else {
      var buy = el('button', 'shop-buy' + (premium ? ' premium' : ''),
        premium ? 'Unlock' : 'Buy');
      buy.addEventListener('click', function () { onBuy(it, buy, card); });
      foot.appendChild(buy);
    }
    card.appendChild(foot);
    return card;
  }

  /* ---------------- states ---------------- */
  function stateLoading() {
    var s = el('div', 'shop-state');
    s.appendChild(el('div', 'shop-spin'));
    s.appendChild(el('h4', null, 'Loading the Market…'));
    return s;
  }
  function stateOffline() {
    var s = el('div', 'shop-state');
    s.appendChild(el('div', 'ic', '🛠️'));
    s.appendChild(el('h4', null, 'Shop is warming up'));
    s.appendChild(el('p', null, 'The Market is offline right now — check back in a moment.'));
    return s;
  }
  function stateEmpty() {
    var s = el('div', 'shop-state');
    s.appendChild(el('div', 'ic', '⬡'));
    s.appendChild(el('h4', null, 'Nothing here yet'));
    s.appendChild(el('p', null, 'No items in this category — try another tab.'));
    return s;
  }

  /* ---------------- buy flow ---------------- */
  function onBuy(it, btn, card) {
    if (_state.busy[it.id]) return;
    if (isPremium(it)) { routeToStripe(it, btn); return; }

    // Client-side affordability pre-check for a nicer nudge (server is source of truth).
    if (_state.balance != null && typeof it.sparks_price === 'number' && _state.balance < it.sparks_price) {
      showInsufficient(it);
      btn.classList.add('short'); btn.textContent = 'Not enough ⬡';
      setTimeout(function () { btn.classList.remove('short'); btn.textContent = 'Buy'; }, 2200);
      return;
    }

    _state.busy[it.id] = true;
    btn.classList.add('busy'); btn.textContent = 'Buying…';

    jpost('/api/economy/catalog/purchase', {
      userId: uid(), catalogId: it.id, itemId: it.id, idempotencyKey: idemKey()
    }).then(function (res) {
      _state.busy[it.id] = false;
      var d = res.data;

      // Premium item routed as requiresStripe.
      if (d && d.requiresStripe) { btn.classList.remove('busy'); routeToStripe(d.item || it, btn); return; }

      // Success (Sparks purchase).
      if (res.ok && d && (d.ok || d.item || typeof d.balance === 'number')) {
        var spent = (typeof d.sparksSpent === 'number') ? d.sparksSpent
                  : (typeof d.spent === 'number') ? d.spent
                  : (typeof it.sparks_price === 'number' ? it.sparks_price : 0);
        if (typeof d.balance === 'number') _state.balance = d.balance;
        else if (_state.balance != null) _state.balance = Math.max(0, _state.balance - spent);
        _state.owned[it.id] = true;
        flashPurchased(card, spent);
        // Sync the global Economy chip elsewhere on the page too.
        try { document.querySelectorAll('[data-eco-sparks]').forEach(function (elm) {
          if (window.Economy && Economy.renderSparks) Economy.renderSparks(elm);
        }); } catch (e) {}
        setTimeout(function () { render(); }, 950);
        return;
      }

      // Insufficient funds signalled by server.
      var msg = (d && (d.error || d.message) || '').toString().toLowerCase();
      if (res.status === 402 || msg.indexOf('insuffic') !== -1 || msg.indexOf('not enough') !== -1 || msg.indexOf('balance') !== -1) {
        showInsufficient(it);
        btn.classList.remove('busy'); btn.classList.add('short'); btn.textContent = 'Not enough ⬡';
        setTimeout(function () { btn.classList.remove('short'); btn.textContent = 'Buy'; }, 2200);
        return;
      }

      // Endpoint absent / other error → graceful, no throw.
      btn.classList.remove('busy'); btn.textContent = 'Try again';
      notify('Purchase unavailable right now — the Market is warming up.');
      setTimeout(function () { btn.textContent = 'Buy'; }, 2000);
    });
  }

  function flashPurchased(card, spent) {
    if (!card) return;
    var f = el('div', 'shop-flash');
    var b = el('b');
    b.appendChild(document.createTextNode('✓ Purchased!'));
    b.appendChild(document.createElement('br'));
    b.appendChild(document.createTextNode(spent > 0 ? ('−' + fmtSparks(spent) + ' ⬡') : 'Added to inventory'));
    f.appendChild(b);
    card.appendChild(f);
  }

  /* insufficient-funds → work-loop nudge */
  function showInsufficient(it) {
    injectCss();
    var old = document.getElementById('shopNudge'); if (old) old.remove();
    var n = el('div', 'shop-nudge'); n.id = 'shopNudge';
    n.appendChild(el('span', 'ni', '⬡'));
    var txt = el('div');
    txt.appendChild(el('b', null, 'Not enough Sparks'));
    txt.appendChild(el('small', null, 'Put an agent to work to earn more ⬡ — then come back and grab it.'));
    n.appendChild(txt);
    var go = el('button', null, 'Earn Sparks');
    go.addEventListener('click', function () {
      n.remove();
      // Route to the work loop if the app exposes one.
      try {
        if (typeof window.showView === 'function') { close(); window.showView('office'); return; }
        window.dispatchEvent(new CustomEvent('shop:earn-sparks', { detail: { itemId: it && it.id } }));
      } catch (e) {}
    });
    n.appendChild(go);
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.remove(); }, 6500);
  }

  /* ---------------- premium / Stripe ---------------- */
  function routeToStripe(it, btn) {
    if (btn) { btn.classList.add('busy'); btn.textContent = 'Opening checkout…'; }
    var cents = (typeof it.usd_price_cents === 'number' && it.usd_price_cents > 0) ? it.usd_price_cents : 299;
    var label = it.name || 'Premium item';

    // Prefer Economy's checkout/unlock flow (single source of truth for Stripe).
    if (window.Economy && typeof Economy.checkout === 'function') {
      try {
        return Economy.checkout('unlock', { key: 'shop_' + it.id, product: it.id, label: label, priceCents: cents })
          .then(function (ok) { if (!ok) fallbackUnlock(it, cents, label, btn); });
      } catch (e) { /* fall through */ }
    }
    return fallbackUnlock(it, cents, label, btn);
  }
  function fallbackUnlock(it, cents, label, btn) {
    var ret = location.origin + location.pathname;
    return jpost('/api/sub-billing/checkout/unlock', {
      userId: uid(),
      item: it.id,
      priceCents: cents,
      label: label,
      successUrl: ret + '?unlock=' + encodeURIComponent('shop_' + it.id),
      cancelUrl: ret
    }).then(function (res) {
      var d = res.data;
      var to = d && (d.url || d.checkoutUrl || d.sessionUrl);
      if (to) { location.href = to; return true; }
      if (btn) { btn.classList.remove('busy'); btn.textContent = 'Coming soon'; setTimeout(function () { btn.textContent = 'Unlock'; }, 2200); }
      notify('Premium checkout is being set up — coming soon.');
      return false;
    });
  }

  /* ---------------- equip (owned items) ---------------- */
  function onEquip(it) {
    notify((it.name || 'Item') + ' equipped.');
    try { window.dispatchEvent(new CustomEvent('shop:equip', { detail: { item: it } })); } catch (e) {}
  }

  /* ---------------- overlay open/close ---------------- */
  function open() {
    injectCss();
    if (_overlay) { refresh(); return; }
    _overlay = el('div', 'shop-overlay');
    var panel = el('div', 'shop-panel');
    _overlay.appendChild(panel);
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay) close(); });
    document.body.appendChild(_overlay);
    _mountEl = panel;
    document.addEventListener('keydown', onEsc);
    render();
    loadAll().then(render);
  }
  function close() {
    document.removeEventListener('keydown', onEsc);
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    if (_mountEl && _mountEl.parentNode === null) _mountEl = null;
    var nudge = document.getElementById('shopNudge'); if (nudge) nudge.remove();
  }
  function onEsc(e) { if (e.key === 'Escape') close(); }

  function renderInto(target) {
    if (!target || !target.nodeType) return;
    _mountEl = target;
    render();
    loadAll().then(render);
  }
  function refresh() {
    return loadAll().then(render);
  }

  /* ---------------- floating open button + wiring ---------------- */
  function installFab() {
    if (document.getElementById('shopFab')) return;
    var fab = el('button', 'shop-fab'); fab.id = 'shopFab';
    fab.appendChild(document.createTextNode('⬡ SHOP'));
    fab.title = 'Click: open shop · Double-click: minimize';
    try { if (localStorage.getItem('shd_shopfab_min') === '1') fab.classList.add('shop-fab-min'); } catch (_) {}
    fab.addEventListener('click', function (e) {
      if (fab.classList.contains('shop-fab-min')) { fab.classList.remove('shop-fab-min'); try { localStorage.setItem('shd_shopfab_min', '0'); } catch (_) {} return; }
      open();
    });
    fab.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      fab.classList.add('shop-fab-min');
      try { localStorage.setItem('shd_shopfab_min', '1'); } catch (_) {}
    });
    document.body.appendChild(fab);
  }

  function boot() {
    injectCss();
    installFab();
    // Pixel Office → MARKET building opens the Shop.
    window.addEventListener('pixeloffice:enter-building', function (e) {
      try {
        var b = e && e.detail && e.detail.building;
        if (b && String(b).toLowerCase() === 'market') { open(); }
      } catch (_) {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------------- public API ---------------- */
  window.Shop = {
    open: open,
    close: close,
    renderInto: renderInto,
    refresh: refresh,
    _state: _state
  };
})();
