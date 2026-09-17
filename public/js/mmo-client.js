/* mmo-client.js — REAL wiring between game.html and the standalone
   MMO backend (server/index.js, port 3001). This replaces reliance on
   auth.js/skills.js/market.js/buildings.js, which call a
   shaddai_bridge_call global that does not exist in this codebase and
   never actually reach the server — they are disconnected scaffold,
   not integration.

   Dev-only: the MMO server runs standalone on localhost:3001 and is
   not yet mounted into backend/server-production.js, so this client
   only works when that server is running locally alongside the main
   app. Production wiring (proxy route or merging into the main
   backend) is a separate follow-up.
*/
(function () {
  const API = 'http://localhost:3001';
  const CHAR_KEY = 'shd_mmo_char_id';

  async function call(method, path, body) {
    const opts = { method, headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(API + path, opts);
    } catch (e) {
      throw new Error('MMO server unreachable at ' + API + ' (is `node index.js` running in server/?)');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  const GET = (path) => call('GET', path);
  const POST = (path, body) => call('POST', path, body);

  let charId = localStorage.getItem(CHAR_KEY);

  async function ensureCharacter() {
    if (charId) return charId;
    const r = await POST('/character/spawn');
    charId = r.characterId;
    localStorage.setItem(CHAR_KEY, charId);
    return charId;
  }

  const MMO = {
    api: { GET, POST },
    getCharacterId: () => charId,
    ensureCharacter,
    // ---- character ----
    move: (dx, dy) => POST('/character/move', { characterId: charId, dx, dy }),
    shop: (itemId) => POST('/character/shop', { characterId: charId, itemId }),
    die: (dangerous) => POST('/character/die', { characterId: charId, dangerous: !!dangerous }),
    graveList: () => GET('/character/grave/list?characterId=' + charId),
    graveRetrieve: (graveId) => POST('/character/grave/retrieve', { characterId: charId, graveId }),
    // ---- quests ----
    questList: () => GET('/quest/list'),
    questActive: () => GET('/quest/active?characterId=' + charId),
    questAccept: (questId) => POST('/quest/accepted', { questId, characterId: charId }),
    questProgress: (questId, amount) => POST('/quest/progress', { questId, characterId: charId, amount }),
    questComplete: (questId) => POST('/quest/complete', { questId, characterId: charId }),
    // ---- daily board ----
    dailyBoard: () => GET('/daily/board?characterId=' + charId),
    dailyAccept: (questId) => POST('/daily/accept', { characterId: charId, questId }),
    dailyProgress: (questId, amount) => POST('/daily/progress', { characterId: charId, questId, amount }),
    dailyClaim: (questId) => POST('/daily/claim', { characterId: charId, questId }),
    dailyDrop: (questId) => POST('/daily/drop', { characterId: charId, questId }),
    // ---- login bonus ----
    bonusState: () => GET('/bonus/state?characterId=' + charId),
    bonusClaim: () => POST('/bonus/claim', { characterId: charId }),
    // ---- housing plots ----
    plotList: () => GET('/plot/list?characterId=' + charId),
    plotBuy: (plotId) => POST('/plot/buy', { characterId: charId, plotId }),
    plotAssign: (plotId, agentId) => POST('/plot/assign', { characterId: charId, plotId, agentId }),
    plotCollect: (plotId) => POST('/plot/collect', { characterId: charId, plotId }),
    // ---- hired agents (labor board) ----
    agentRoster: () => GET('/agent/roster?characterId=' + charId),
    agentHire: (role) => POST('/agent/hire', { characterId: charId, role }),
    agentShift: (role) => POST('/agent/shift/' + role, { characterId: charId }),
    agentCollect: (role) => POST('/agent/collect/' + role, { characterId: charId }),
    // ---- player market ----
    marketListings: () => GET('/market/listings'),
    marketList: (itemName, price, duration) => POST('/market/listing', { ownerId: charId, itemName, price, duration }),
    marketBid: (listingId, amount) => POST('/market/bid', { listingId, bidderId: charId, amount }),
    marketComplete: (listingId, sellerId) => POST('/market/complete', { listingId, buyerId: charId, sellerId })
  };
  window.MMO = MMO;

  /* ---------------- minimal panel UI ---------------- */
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (html != null) e.innerHTML = html;
    return e;
  }

  const TABS = ['Quests', 'Daily', 'Bonus', 'Plot', 'Agents', 'Grave'];
  const CANDIDATE_PLOT_IDS = ['plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5', 'plot-6'];
  let activeTab = 'Quests';

  function buildPanel() {
    const panel = el('div', { id: 'mmoPanel' });
    panel.style.cssText = `
      position:fixed; top:70px; right:12px; width:320px; max-height:70vh;
      background:#0b0f14; border:1px solid #2a3542; border-radius:10px;
      color:#dfe8ee; font:12px/1.4 system-ui,sans-serif; z-index:9500;
      display:none; flex-direction:column; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.5);
    `;
    const head = el('div', {}, `<b>SHADDAI MMO</b> <span id="mmoCharTag" style="opacity:.6;font-size:10px"></span>`);
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#121a22;border-bottom:1px solid #2a3542';
    const closeBtn = el('span', { style: 'cursor:pointer;opacity:.7' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    head.appendChild(closeBtn);

    const tabsBar = el('div');
    tabsBar.style.cssText = 'display:flex;border-bottom:1px solid #2a3542';
    TABS.forEach(t => {
      const b = el('div', {}, t);
      b.style.cssText = 'flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:11px;opacity:.7';
      b.onclick = () => { activeTab = t; renderTab(); };
      b._label = t;
      tabsBar.appendChild(b);
    });

    const body = el('div', { id: 'mmoBody' });
    body.style.cssText = 'padding:10px;overflow-y:auto;flex:1';

    panel.appendChild(head);
    panel.appendChild(tabsBar);
    panel.appendChild(body);
    document.body.appendChild(panel);

    const toggle = el('div', {}, '⚔ MMO');
    toggle.id = 'mmoToggle';
    toggle.style.cssText = `
      position:fixed; top:70px; right:12px; z-index:9499;
      background:#00e5a0; color:#04121a; font:700 12px system-ui,sans-serif;
      padding:8px 12px; border-radius:8px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.4);
    `;
    toggle.onclick = async () => {
      const showing = panel.style.display === 'flex';
      if (showing) { panel.style.display = 'none'; return; }
      toggle.style.display = 'none';
      panel.style.display = 'flex';
      try {
        await ensureCharacter();
        document.getElementById('mmoCharTag').textContent = charId;
      } catch (e) {
        document.getElementById('mmoBody').textContent = e.message;
        return;
      }
      renderTab();
    };
    // re-show the launcher pill when the panel closes
    const obs = new MutationObserver(() => { if (panel.style.display === 'none') toggle.style.display = 'block'; });
    obs.observe(panel, { attributes: true, attributeFilter: ['style'] });
    document.body.appendChild(toggle);

    function highlightTabs() {
      Array.from(tabsBar.children).forEach(b => {
        b.style.opacity = b._label === activeTab ? '1' : '.55';
        b.style.background = b._label === activeTab ? '#1a2530' : 'transparent';
      });
    }

    async function renderTab() {
      highlightTabs();
      body.innerHTML = 'Loading…';
      try {
        if (activeTab === 'Quests') await renderQuests();
        else if (activeTab === 'Daily') await renderDaily();
        else if (activeTab === 'Bonus') await renderBonus();
        else if (activeTab === 'Plot') await renderPlot();
        else if (activeTab === 'Agents') await renderAgents();
        else if (activeTab === 'Grave') await renderGrave();
      } catch (e) {
        body.textContent = 'Error: ' + e.message;
      }
    }

    async function renderQuests() {
      const [{ quests: all }, { quests: active }] = await Promise.all([MMO.questList(), MMO.questActive()]);
      const activeIds = new Set(active.map(q => q.id));
      body.innerHTML = '';
      all.forEach(q => {
        const a = active.find(x => x.id === q.id);
        const row = el('div', {}, `
          <div style="font-weight:600">${q.title}</div>
          <div style="opacity:.7;font-size:11px">${q.description}</div>
          <div style="font-size:11px;margin:4px 0">Reward: ${q.rewardXP} XP · ${q.rewardSparks}⚡</div>
        `);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button');
        btn.style.cssText = 'width:100%;padding:6px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        if (a) {
          btn.textContent = `Progress ${a.progress}/${a.targetAmount} — add 1`;
          btn.onclick = async () => { await MMO.questProgress(q.id, 1); renderQuests(); };
        } else if (activeIds.has(q.id)) {
          btn.textContent = 'Active';
          btn.disabled = true;
        } else {
          btn.textContent = 'Accept';
          btn.onclick = async () => { await MMO.questAccept(q.id); renderQuests(); };
        }
        row.appendChild(btn);
        body.appendChild(row);
      });
    }

    async function renderDaily() {
      const r = await MMO.dailyBoard();
      body.innerHTML = '';
      (r.quests || []).forEach(q => {
        const row = el('div', {}, `<div style="font-weight:600">${q.name} <span style="opacity:.6;font-weight:400">(${q.progress}/${q.target})</span></div>
          <div style="font-size:11px;opacity:.7">${q.desc} · reward ${q.reward}⚡</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const mkBtn = (label) => { const b = el('button', {}, label); b.style.cssText = 'margin-right:6px;margin-top:4px;padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700'; return b; };
        if (q.claimed) {
          row.appendChild(mkBtn('Claimed')).disabled = true;
        } else if (!q.accepted) {
          const b = mkBtn('Accept');
          b.onclick = async () => { try { await MMO.dailyAccept(q.id); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else if (q.progress < q.target) {
          const b = mkBtn('+1 progress');
          b.onclick = async () => { try { await MMO.dailyProgress(q.id, 1); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else {
          const b = mkBtn('Claim reward');
          b.onclick = async () => { try { await MMO.dailyClaim(q.id); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        }
        body.appendChild(row);
      });
      if (!body.children.length) body.textContent = 'No board data.';
    }

    async function renderBonus() {
      const r = await MMO.bonusState();
      body.innerHTML = '';
      const row = el('div', {}, `<div style="font-weight:600">Login streak: ${r.streak} day${r.streak === 1 ? '' : 's'}</div>
        <div style="font-size:11px;opacity:.7">Next claim: ${r.nextAmount}⚡</div>`);
      row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
      const btn = el('button', {}, r.claimedToday ? 'Claimed today' : 'Claim stipend');
      btn.disabled = r.claimedToday;
      btn.style.cssText = 'padding:6px 12px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
      btn.onclick = async () => { try { await MMO.bonusClaim(); renderBonus(); } catch (e) { alertInline(e); } };
      row.appendChild(btn);
      body.appendChild(row);
    }

    async function renderPlot() {
      const r = await MMO.plotList();
      const mine = r.plots || [];
      body.innerHTML = '';
      mine.forEach(p => {
        const row = el('div', {}, `<div style="font-weight:600">Your plot: ${p.id}</div>
          <div style="font-size:11px;opacity:.7">${p.agent ? 'Worked by ' + p.agent : 'No agent stationed'}</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button', {}, p.agent ? 'Collect yield' : 'Assign scout to work it');
        btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        btn.onclick = async () => {
          try {
            if (p.agent) { const c = await MMO.plotCollect(p.id); alertInline(new Error('Collected ' + c.yieldAmount + ' Sparks')); }
            else { await MMO.plotAssign(p.id, 'scout'); }
            renderPlot();
          } catch (e) { alertInline(e); }
        };
        row.appendChild(btn);
        body.appendChild(row);
      });
      const ownedIds = new Set(mine.map(p => p.id));
      const available = CANDIDATE_PLOT_IDS.filter(id => !ownedIds.has(id));
      if (available.length) {
        const buyRow = el('div', {}, `<div style="font-weight:600;margin-bottom:4px">Buy a plot (100⚡)</div>`);
        buyRow.style.cssText = 'padding:8px;background:#121a22;border-radius:6px';
        const sel = el('select');
        sel.style.cssText = 'padding:4px;margin-right:6px;background:#0b0f14;color:#dfe8ee;border:1px solid #2a3542;border-radius:4px';
        available.forEach(id => sel.appendChild(el('option', { value: id }, id)));
        const buyBtn = el('button', {}, 'Buy');
        buyBtn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        buyBtn.onclick = async () => { try { await MMO.plotBuy(sel.value); renderPlot(); } catch (e) { alertInline(e); } };
        buyRow.appendChild(sel); buyRow.appendChild(buyBtn);
        body.appendChild(buyRow);
      }
      if (!body.children.length) body.textContent = 'No plots left to buy.';
    }

    async function renderAgents() {
      const r = await MMO.agentRoster();
      body.innerHTML = '';
      const roster = r.roster || {};
      const ROLES = Object.keys(r.roles || { gatherer: 1, merchant: 1, scout: 1, crafter: 1 });
      ROLES.forEach(role => {
        const owned = roster[role];
        const def = (r.roles || {})[role] || {};
        const row = el('div', {}, `<div style="font-weight:600">${def.name || role} <span style="opacity:.6;font-weight:400">(${def.cost}⚡)</span></div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const mkBtn = (label) => { const b = el('button', {}, label); b.style.cssText = 'margin-right:6px;margin-top:4px;padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700'; return b; };
        if (!owned) {
          const b = mkBtn('Hire');
          b.onclick = async () => { try { await MMO.agentHire(role); renderAgents(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else {
          const working = Date.now() < owned.shiftEndAt;
          if (working) {
            const mins = Math.max(0, Math.round((owned.shiftEndAt - Date.now()) / 60000));
            row.appendChild(el('div', { style: 'font-size:11px;opacity:.7' }, `Working — ${mins}m left`));
          } else if (owned.shiftEndAt > 0) {
            const b = mkBtn('Collect');
            b.onclick = async () => { try { const c = await MMO.agentCollect(role); alertInline(new Error('Gained: ' + JSON.stringify(c.gained))); renderAgents(); } catch (e) { alertInline(e); } };
            row.appendChild(b);
          } else {
            const b = mkBtn('Start shift');
            b.onclick = async () => { try { await MMO.agentShift(role); renderAgents(); } catch (e) { alertInline(e); } };
            row.appendChild(b);
          }
        }
        body.appendChild(row);
      });
    }

    async function renderGrave() {
      const r = await MMO.graveList();
      body.innerHTML = '';
      (r.graves || []).forEach(g => {
        const mins = Math.max(0, Math.round((g.expiresAt - Date.now()) / 60000));
        const row = el('div', {}, `<div style="font-weight:600">Grave at (${g.location.x},${g.location.y})</div>
          <div style="font-size:11px;opacity:.7">${JSON.stringify(g.items)} · expires in ${mins}m</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button', {}, 'Retrieve');
        btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        btn.onclick = async () => { try { await MMO.graveRetrieve(g.id); renderGrave(); } catch (e) { alertInline(e); } };
        row.appendChild(btn);
        body.appendChild(row);
      });
      if (!body.children.length) body.textContent = 'No active graves.';
    }

    function alertInline(err) {
      const n = el('div', {}, err.message);
      n.style.cssText = 'position:fixed;top:130px;right:12px;background:#241;color:#dfe8ee;padding:8px 12px;border-radius:6px;z-index:9600;font:12px system-ui';
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 2500);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel);
  else buildPanel();
})();
