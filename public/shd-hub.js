/* SHADDAI V119 — HUB. The two floating corner buttons become real menus.
   SHADDAI = Navi: type a workflow in plain words ("price btc", "research mangroves", "news"), jump to chat/office/agents, or hide the button.
   SHOP: Sparks, Cosmetics (2D and 3D), Bazaar, Membership, each opens a floating showcase of items with one-tap buy.
   Everything reads the server (catalog, balance, bridge). Nothing is faked: if the server is not reachable the panels say so. */
(function () {
  'use strict';
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; var t = LS.get('shd_token'); if (t) o.Authorization = 'Bearer ' + t; return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0, _offline: true }; }); }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function uid() { return LS.get('shd_userid') || ''; }
  var openMenu = null;
  function closeMenus() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.contains(e.target) && !e.target.closest('#popChatBtn,#shopFab')) closeMenus(); });
  function anchor(menu, btn) { document.body.appendChild(menu); var r = btn.getBoundingClientRect(); menu.style.right = Math.max(12, window.innerWidth - r.right) + 'px'; menu.style.bottom = (window.innerHeight - r.top + 10) + 'px'; openMenu = menu; }

  /* ── NAVI (the SHADDAI button) ─────────────────────────────────────── */
  function runWords(text, out) {
    text = String(text || '').trim(); if (!text) return;
    out.textContent = 'Working on it…';
    if (!window.shdWords) { out.textContent = 'The word engine is still loading. Try again in a moment.'; return; }
    var t = text.replace(/^\/(run|do)\s+/i, '').replace(/^\//, '');
    window.shdWords.resolve(t).then(function (r) {
      if (!r || !r.ok) { out.textContent = (r && r.message) || "I couldn't find that one."; if (r && r.suggestions && r.suggestions.length) { var row = h('div', { class: 'hb-chips' }); r.suggestions.slice(0, 4).forEach(function (s) { row.appendChild(h('button', { type: 'button', class: 'hb-chip', text: s.title || s.id || s, onclick: function () { runWords(s.id || s.title || s, out); } })); }); out.appendChild(row); } return; }
      api('POST', '/api/bridge/run', { workflow_id: r.wf, params: r.params || {}, idempotency_key: 'navi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }).then(function (d) {
        if (!d.ok) { out.textContent = d._offline ? "Can't reach the server right now." : 'Could not start: ' + (d.error || d._s); return; }
        out.textContent = ''; out.appendChild(h('div', { text: 'Started: ' + (r.title || r.wf) + '.' }));
        out.appendChild(h('div', { class: 'hb-chips' }, [h('button', { type: 'button', class: 'hb-chip', text: 'Watch in Office', onclick: function () { closeMenus(); if (window.showView) showView('office'); } }), h('button', { type: 'button', class: 'hb-chip', text: 'See in chat', onclick: function () { closeMenus(); try { if (window.shdChat) shdChat.open(); else if (window.showView) showView('chat'); } catch (e) { /* ignore */ } } })]));
      });
    });
  }
  function naviMenu(btn) {
    closeMenus();
    var out = h('div', { class: 'hb-out', role: 'status', 'aria-live': 'polite' });
    var inp = h('input', { class: 'hb-in', type: 'text', placeholder: 'Ask Navi: price btc, research mangroves, news…', 'aria-label': 'Ask Navi or run a workflow', autocomplete: 'off' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') runWords(inp.value, out); });
    function item(label, sub, fn) { return h('button', { type: 'button', class: 'hb-item', onclick: function () { closeMenus(); fn(); } }, [h('b', { text: label }), h('small', { text: sub })]); }
    var m = h('div', { class: 'hb-menu', role: 'menu', 'aria-label': 'Navi' }, [
      h('div', { class: 'hb-kick', text: 'NAVI' }), h('div', { class: 'hb-title', text: 'What should we do?' }),
      h('div', { class: 'hb-row' }, [inp, h('button', { type: 'button', class: 'hb-go', text: 'Go', onclick: function () { runWords(inp.value, out); } })]), out,
      h('div', { class: 'hb-chips' }, [['Market snapshot', 'market snapshot'], ['News', 'news'], ['Research', 'research ']].map(function (c) { return h('button', { type: 'button', class: 'hb-chip', text: c[0], onclick: function () { inp.value = c[1]; inp.focus(); if (c[1].slice(-1) !== ' ') runWords(c[1], out); } }); })),
      h('div', { class: 'hb-grid' }, [
        item('Chat', 'Talk to SHADDAI', function () { if (window.openPopout) openPopout(); }),
        item('Office', 'Watch agents work', function () { if (window.showView) showView('office'); }),
        item('Agents', 'Your team', function () { if (window.showView) showView('agents'); }),
        item('Worlds', 'Plots, Colosseum', function () { if (window.showView) showView('worlds'); })
      ]),
      h('button', { type: 'button', class: 'hb-hide', text: 'Hide this button', onclick: function () { closeMenus(); hideNavi(true); toast('Navi hidden. Tap the small ◉ tab to bring it back.'); } })
    ]);
    anchor(m, btn); inp.focus();
  }
  function hideNavi(on) {
    var b = document.getElementById('popChatBtn'); if (!b) return; var tab = document.getElementById('shdNaviTab');
    if (on) { LS.set('shd_navi_hidden', '1'); b.style.display = 'none'; if (!tab) { tab = h('button', { id: 'shdNaviTab', type: 'button', class: 'hb-tab', 'aria-label': 'Show Navi', title: 'Show Navi', text: '◉', onclick: function () { hideNavi(false); } }); document.body.appendChild(tab); } }
    else { LS.del('shd_navi_hidden'); b.style.display = ''; if (tab) tab.remove(); }
  }

  /* ── SHOP ──────────────────────────────────────────────────────────── */
  var SECTIONS = [
    { id: 'sparks', name: 'Sparks', sub: 'Top up and spend', icon: '✦', test: /spark|credit|boost/i },
    { id: 'cosmetics', name: 'Cosmetics', sub: '2D and 3D looks', icon: '◈', test: /cosmetic|skin|aura|hat|outfit|wear|badge|avatar|model|glow|accessor|emote|trail|banner|poster/i },
    { id: 'bazaar', name: 'Bazaar', sub: 'Furniture, gear, themes', icon: '⬡', test: /furnit|decor|room|theme|gear|tool|bot|item|upgrade|plot/i },
    { id: 'member', name: 'Membership', sub: 'Plans and perks', icon: '★', test: /^$/ }
  ];
  function shopMenu(btn) {
    closeMenus();
    var m = h('div', { class: 'hb-menu hb-shop', role: 'menu', 'aria-label': 'Shop' }, [h('div', { class: 'hb-kick', text: 'SHOP' }), h('div', { class: 'hb-title', text: 'Spend Sparks, get things' }),
      h('div', { class: 'hb-tiles' }, SECTIONS.map(function (s) { return h('button', { type: 'button', class: 'hb-tile', 'data-s': s.id, onclick: function () { closeMenus(); if (s.id === 'member') { if (window.shdPlans) shdPlans.open(); } else showcase(s.id); } }, [h('i', { text: s.icon }), h('b', { text: s.name }), h('small', { text: s.sub })]); }))]);
    anchor(m, btn);
  }
  var sc = null;
  function showcase(sec) {
    if (sc) sc.remove();
    var grid = h('div', { class: 'sc-grid' }, [h('div', { class: 'sc-note', text: 'Loading the shelves…' })]), bal = h('span', { class: 'sc-bal', text: '⬡ …' }), msg = h('div', { class: 'sc-msg', role: 'status', 'aria-live': 'polite' });
    var cur = sec, tabs = h('div', { class: 'sc-tabs', role: 'tablist' }), items = [];
    function render() {
      grid.textContent = '';
      var s = SECTIONS.filter(function (x) { return x.id === cur; })[0];
      var list = items.filter(function (it) { return s && s.test.test([it.category, it.kind, it.name, it.id].join(' ')); });
      if (!list.length) list = cur === 'sparks' ? [] : items;   // never show an empty shelf when the catalog has things
      if (!list.length) { grid.appendChild(h('div', { class: 'sc-note', text: items.length ? 'Nothing in this shelf yet.' : (sc._offline ? "The shop can't be reached right now." : 'The shelves are being stocked. Check back soon.') })); return; }
      list.slice(0, 48).forEach(function (it, i) {
        var price = it.sparks_price != null ? '⬡ ' + it.sparks_price : (it.usd_price_cents != null ? '$' + (it.usd_price_cents / 100).toFixed(2) : '');
        var btn = h('button', { type: 'button', class: 'sc-buy', text: price ? 'Get · ' + price : 'Get', onclick: function () { buy(it, btn); } });
        grid.appendChild(h('div', { class: 'sc-card r-' + String(it.rarity || 'common').toLowerCase(), style: 'animation-delay:' + (i % 8) * 0.25 + 's' }, [h('div', { class: 'sc-orb' }), h('div', { class: 'sc-name', text: it.name || it.id }), it.description ? h('div', { class: 'sc-desc', text: it.description }) : null, h('div', { class: 'sc-rar', text: String(it.rarity || 'common') }), btn]));
      });
    }
    function buy(it, btn) {
      if (!uid()) { msg.textContent = 'Sign in first, then you can buy.'; return; }
      btn.disabled = true; msg.textContent = '';
      api('POST', '/api/economy/catalog/purchase', { userId: uid(), itemId: it.id, idempotencyKey: 'hub-' + it.id + '-' + Date.now() }).then(function (d) {
        btn.disabled = false;
        if (d.requiresStripe) { msg.textContent = 'This one is a paid item. Opening checkout…'; if (window.shdPlans) shdPlans.open(); return; }
        if (d.ok) { msg.textContent = 'Added: ' + (it.name || it.id) + '.'; if (d.balance != null) bal.textContent = '⬡ ' + d.balance; try { if (window.Shop && Shop.refresh) Shop.refresh(); } catch (e) { /* ignore */ } return; }
        msg.textContent = d._offline ? "Can't reach the shop right now." : (d.error || d.message || 'Could not complete that purchase.');
      });
    }
    SECTIONS.forEach(function (sx) { if (sx.id === 'member') return; var tb = h('button', { type: 'button', role: 'tab', class: 'sc-tab' + (sx.id === cur ? ' on' : ''), 'aria-selected': sx.id === cur ? 'true' : 'false', text: sx.icon + ' ' + sx.name, onclick: function () { cur = sx.id; [].forEach.call(tabs.children, function (x) { x.classList.toggle('on', x === tb); x.setAttribute('aria-selected', x === tb ? 'true' : 'false'); }); render(); } }); tabs.appendChild(tb); });
    sc = h('div', { class: 'sc-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Shop' }, [h('div', { class: 'sc-scrim', onclick: function () { sc.remove(); sc = null; } }),
      h('div', { class: 'sc-card-big' }, [h('button', { type: 'button', class: 'pl-x', 'aria-label': 'Close', text: '×', onclick: function () { sc.remove(); sc = null; } }), h('div', { class: 'sc-top' }, [h('div', null, [h('div', { class: 'pl-kick', text: 'SHOP' }), h('h2', { class: 'pl-h', text: 'Showcase' })]), bal]), tabs, grid, msg,
        h('div', { class: 'sc-foot' }, [h('button', { type: 'button', class: 'hb-chip', text: 'Open the full shop', onclick: function () { sc.remove(); sc = null; try { if (window.Shop) Shop.open(); } catch (e) { /* ignore */ } } }), h('button', { type: 'button', class: 'hb-chip', text: 'Membership', onclick: function () { if (window.shdPlans) shdPlans.open(); } })])])]);
    document.body.appendChild(sc);
    Promise.all([api('GET', '/api/economy/catalog'), uid() ? api('GET', '/api/economy/balance?userId=' + encodeURIComponent(uid())) : Promise.resolve({})]).then(function (r) {
      var c = r[0] || {}, b = r[1] || {}; items = c.items || []; sc._offline = !!c._offline; bal.textContent = b.sparks_balance != null ? '⬡ ' + b.sparks_balance : (uid() ? '⬡ —' : 'Sign in for your balance'); render();
    });
  }

  function wire() {
    var navi = document.getElementById('popChatBtn'), shop = document.getElementById('shopFab');
    if (navi && !navi.dataset.hub) { navi.dataset.hub = '1'; navi.setAttribute('aria-haspopup', 'menu'); navi.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); if (openMenu && openMenu.getAttribute('aria-label') === 'Navi') closeMenus(); else naviMenu(navi); }, true); if (LS.get('shd_navi_hidden') === '1') hideNavi(true); }
    if (shop && !shop.dataset.hub) { shop.dataset.hub = '1'; shop.setAttribute('aria-haspopup', 'menu'); shop.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); if (openMenu && openMenu.getAttribute('aria-label') === 'Shop') closeMenus(); else shopMenu(shop); }, true); }
    return !!(navi && shop);
  }
  var tries = 0, t = setInterval(function () { if (wire() || ++tries > 40) clearInterval(t); }, 500);
  window.shdHub = { navi: function () { var b = document.getElementById('popChatBtn'); if (b) naviMenu(b); }, shop: function () { var b = document.getElementById('shopFab'); if (b) shopMenu(b); }, showcase: showcase, hideNavi: hideNavi };
})();
