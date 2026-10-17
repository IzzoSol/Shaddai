/* world-quests.js — QUEST BOARD (QUILL's Library): three daily quests drawn from a pool, tracked automatically; claim pays Sparks.
 * Sources: 'race' (finish a race), 'podium' (top-3 finish), 'kill' (defeat mobs), 'harvest' (farm), 'arcade' (play a game).
 * Reward totals are small and Sparks are closed-loop points. Daily reset by date. Persistence: localStorage 'shd_quests_v1'.
 * API: WorldQuests.today() · note(kind, n) · claim(i) · open() · close() · POOL
 */
(function (root) {
  'use strict';
  var POOL = [
    { id: 'race1', kind: 'race', n: 1, title: 'Finish a hover race', reward: 30 },
    { id: 'race3', kind: 'race', n: 3, title: 'Finish three races', reward: 70 },
    { id: 'pod1', kind: 'podium', n: 1, title: 'Reach the podium', reward: 50 },
    { id: 'kill5', kind: 'kill', n: 5, title: 'Defeat 5 monsters outside the city', reward: 45 },
    { id: 'kill12', kind: 'kill', n: 12, title: 'Defeat 12 monsters', reward: 80 },
    { id: 'farm2', kind: 'harvest', n: 2, title: 'Harvest 2 crops', reward: 30 },
    { id: 'farm5', kind: 'harvest', n: 5, title: 'Harvest 5 crops', reward: 60 },
    { id: 'arc3', kind: 'arcade', n: 3, title: 'Play 3 arcade rounds', reward: 25 }
  ];
  var KEY = 'shd_quests_v1', clock = function () { return Date.now(); };
  function day() { return new Date(clock()).toISOString().slice(0, 10); }
  function seed(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function draw(d) {
    var h = seed(d), kinds = {}, out = [], tries = 0;
    while (out.length < 3 && tries++ < 80) {
      h = (h * 1103515245 + 12345) >>> 0;
      var q = POOL[(h >>> 8) % POOL.length];
      if (kinds[q.kind]) continue;
      kinds[q.kind] = 1;
      out.push({ id: q.id, kind: q.kind, n: q.n, title: q.title, reward: q.reward, have: 0, claimed: false });
    }
    return out;
  }
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.day === day() && j.q) return j; } catch (e) { } return { day: day(), q: draw(day()) }; }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function roll() { if (S.day !== day()) { S = { day: day(), q: draw(day()) }; save(); } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function today() { roll(); return S.q.map(function (q) { return { id: q.id, title: q.title, kind: q.kind, need: q.n, have: Math.min(q.n, q.have), done: q.have >= q.n, claimed: q.claimed, reward: q.reward }; }); }
  function note(kind, n) {
    roll(); var hit = false;
    S.q.forEach(function (q) { if (q.kind === kind && q.have < q.n) { q.have = Math.min(q.n, q.have + (n || 1)); hit = true; if (q.have >= q.n) toast('Quest complete: ' + q.title + ' - claim it on the Library quest board'); } });
    if (hit) { save(); render(); }
  }
  function claim(i) {
    roll(); var q = S.q[i];
    if (!q || q.have < q.n || q.claimed) return { ok: false, msg: 'Not ready' };
    q.claimed = true; if (root.ShdSparks && root.ShdSparks.add) root.ShdSparks.add(q.reward, 'quest', q.id);
    save(); return { ok: true, msg: '+' + q.reward + ' Sparks' };
  }

  // ---- auto tracking ----
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('shaddai:race', function (ev) {
    var e = ev.detail || {};
    if (e.type === 'finish' && e.id === 'you') { note('race', 1); if ((e.place || 9) <= 3) note('podium', 1); }
  });
  (function hook() {
    var tries = 0, lastPlays = -1;
    var t = setInterval(function () {
      if (++tries > 4000) clearInterval(t);
      try { if (root.WorldArcade && root.WorldArcade.state) { var p = root.WorldArcade.state().plays; if (lastPlays >= 0 && p > lastPlays) note('arcade', p - lastPlays); lastPlays = p; } } catch (e) { }
      try { if (root.WorldFarm && !root.WorldFarm.__q) { var h = root.WorldFarm.harvest; root.WorldFarm.harvest = function (i) { var r = h(i); if (r && r.ok) note('harvest', 1); return r; }; root.WorldFarm.__q = 1; } } catch (e) { }
    }, 1500);
  })();

  // ---- UI ----
  var panel = null;
  function close() { if (panel) { panel.remove(); panel = null; } }
  function render() {
    if (!panel) return;
    var B = 'background:linear-gradient(180deg,rgba(232,196,92,.3),rgba(120,80,10,.45));border:1px solid #e8c45c;border-radius:8px;color:#ffe9b0;padding:5px 10px;cursor:pointer;font:700 12px Rajdhani,sans-serif';
    panel.querySelector('#qBody').innerHTML = today().map(function (q, i) {
      return '<div style="padding:9px 0;border-top:1px solid rgba(255,255,255,.08)"><div style="display:flex;justify-content:space-between"><b>' + q.title + '</b><span style="color:#e8c45c">' + q.reward + '&#9889;</span></div>' +
        '<div style="height:6px;border-radius:5px;background:rgba(255,255,255,.12);margin:6px 0;overflow:hidden"><i style="display:block;height:100%;width:' + Math.round(q.have / q.need * 100) + '%;background:linear-gradient(90deg,#34e5b0,#e8c45c)"></i></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><small>' + q.have + ' / ' + q.need + '</small>' + (q.claimed ? '<small style="opacity:.6">claimed</small>' : q.done ? '<button data-a="c" data-i="' + i + '" style="' + B + '">CLAIM</button>' : '') + '</div></div>';
    }).join('') + '<div style="opacity:.55;font-size:11px;margin-top:6px">New quests every day. QUILL keeps the record.</div>';
  }
  function open() {
    if (typeof document === 'undefined') return; close(); panel = document.createElement('div'); panel.id = 'questPanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,420px);padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font:900 16px Orbitron,sans-serif;letter-spacing:.14em"><span>QUEST BOARD</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div id="qBody"></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a'); if (a === 'x') return close(); if (a === 'c') { var r = claim(+t.getAttribute('data-i')); toast(r.msg); render(); } });
    render();
  }
  root.WorldQuests = { POOL: POOL, today: today, note: note, claim: claim, open: open, close: close, _now: function (f) { clock = f; S = load(); }, _reset: function () { S = { day: day(), q: draw(day()) }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
