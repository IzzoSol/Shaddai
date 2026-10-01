/* world-farm.js — FARM BEDS (owner 2026-10-01: "farm stuff"): six beds, three crops that grow in REAL time (even while you are away), water to speed up, harvest into the inventory, sell for Sparks.
 *   noodle bean   5 min   seed 8   sells 18        glow-berry  10 min  seed 20  sells 52        void-pepper  20 min  seed 50  sells 140
 * Water once per plant: -20% of the remaining time (5 Sparks). Daily CAP on farm profit (400 Sparks); past the cap harvest sells at 50%. Seeds are a Sparks SINK; sales mint, so the cap keeps print < sink.
 * API: WorldFarm.beds() · plant(i, cropId) · water(i) · harvest(i) · sellAll() -> sparks · open() · CROPS · TUNE · _now(fn) (tests inject a clock)
 * Persistence: localStorage 'shd_farm_v1' (dev); production = per-user farm record. Visual 3D beds at plots/homes are the next step (data model is ready: beds[i].crop / growth).
 */
(function (root) {
  'use strict';
  var CROPS = { bean: { id: 'bean', name: 'Noodle Bean', ms: 5 * 60e3, seed: 8, sell: 18, icon: '🫘' }, berry: { id: 'berry', name: 'Glow-Berry', ms: 10 * 60e3, seed: 20, sell: 52, icon: '🍓' }, pepper: { id: 'pepper', name: 'Void-Pepper', ms: 20 * 60e3, seed: 50, sell: 140, icon: '🌶️' } };
  var TUNE = { beds: 6, waterCost: 5, waterCut: 0.2, dailyProfitCap: 400, overCapPrice: 0.5 };
  var KEY = 'shd_farm_v1', clock = function () { return Date.now(); };
  function today() { return new Date(clock()).toISOString().slice(0, 10); }
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.beds) return j; } catch (e) { } var b = []; for (var i = 0; i < TUNE.beds; i++) b.push(null); return { beds: b, day: today(), profit: 0 }; }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function inv() { return root.ShdInv; }
  function spend(n) { return root.ShdSparks && root.ShdSparks.spend ? root.ShdSparks.spend(n, 'farm', 'seed') : false; }
  function addSp(n) { if (root.ShdSparks && root.ShdSparks.add) root.ShdSparks.add(n, 'farm', 'harvest sale'); }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function rollDay() { if (S.day !== today()) { S.day = today(); S.profit = 0; save(); } }
  function view(b) { if (!b) return null; var c = CROPS[b.crop], left = Math.max(0, b.readyAt - clock()), total = b.ms; return { crop: b.crop, name: c.name, icon: c.icon, ready: left <= 0, msLeft: left, pct: Math.min(1, 1 - left / total), watered: !!b.watered }; }
  function beds() { return S.beds.map(view); }
  function plant(i, cropId) { var c = CROPS[cropId]; if (!c || i < 0 || i >= TUNE.beds) return { ok: false, msg: 'bad bed or crop' }; if (S.beds[i]) return { ok: false, msg: 'bed is in use' }; if (!spend(c.seed)) return { ok: false, msg: 'Not enough Sparks (' + c.seed + ')' }; S.beds[i] = { crop: cropId, ms: c.ms, readyAt: clock() + c.ms, watered: false }; save(); return { ok: true, msg: 'Planted ' + c.name + ' (' + Math.round(c.ms / 60000) + ' min)' }; }
  function water(i) { var b = S.beds[i]; if (!b) return { ok: false, msg: 'nothing planted' }; if (b.watered) return { ok: false, msg: 'already watered' }; if (clock() >= b.readyAt) return { ok: false, msg: 'already ripe' }; if (!root.ShdSparks || !root.ShdSparks.spend(TUNE.waterCost, 'farm', 'water')) return { ok: false, msg: 'Not enough Sparks (' + TUNE.waterCost + ')' }; var left = b.readyAt - clock(); b.readyAt -= Math.round(left * TUNE.waterCut); b.watered = true; save(); return { ok: true, msg: 'Watered: ripens sooner' }; }
  function harvest(i) { var b = S.beds[i]; if (!b) return { ok: false, msg: 'nothing planted' }; if (clock() < b.readyAt) return { ok: false, msg: 'not ripe yet' }; inv().add('crop-' + b.crop, 1); S.beds[i] = null; save(); return { ok: true, msg: 'Harvested ' + CROPS[b.crop].name }; }
  function sellAll() { rollDay(); var gained = 0; Object.keys(CROPS).forEach(function (id) { var n = inv().get('crop-' + id); if (!n) return; var c = CROPS[id]; for (var k = 0; k < n; k++) { var profit = c.sell - c.seed, over = S.profit >= TUNE.dailyProfitCap, price = over ? Math.round(c.sell * TUNE.overCapPrice) : c.sell; gained += price; if (!over) S.profit += profit; } inv().take('crop-' + id, n); }); if (gained) { addSp(gained); save(); } return gained; }

  // ---------- UI ----------
  var panel = null, timer = 0;
  function close() { if (panel) { panel.remove(); panel = null; } if (timer) { clearInterval(timer); timer = 0; } }
  var B = 'background:linear-gradient(180deg,rgba(0,255,156,.28),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:8px;color:#eafff6;padding:5px 9px;cursor:pointer;font:700 12px Rajdhani,sans-serif;margin:2px 3px 2px 0';
  var G = B.replace(/0,255,156/g, '232,196,92').replace('#00ff9c', '#e8c45c').replace('0,120,80', '120,80,10').replace('#eafff6', '#ffe9b0');
  function mmss(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
  function render() {
    if (!panel) return; rollDay(); var h = '';
    S.beds.forEach(function (b, i) { var v = view(b); h += '<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.08)"><div style="display:flex;justify-content:space-between"><b>Bed ' + (i + 1) + '</b><span>' + (v ? v.icon + ' ' + v.name : '<span style="opacity:.6">empty</span>') + '</span></div>' +
      (v ? '<div style="height:7px;border-radius:5px;background:rgba(255,255,255,.12);margin:5px 0;overflow:hidden"><i style="display:block;height:100%;width:' + Math.round(v.pct * 100) + '%;background:linear-gradient(90deg,#34e5b0,#e8c45c)"></i></div><div>' + (v.ready ? '<button data-a="h" data-i="' + i + '" style="' + G + '">HARVEST</button>' : '<small>' + mmss(v.msLeft) + ' left</small> ' + (v.watered ? '' : '<button data-a="w" data-i="' + i + '" style="' + B + '">Water (' + TUNE.waterCost + '⚡)</button>')) + '</div>'
        : Object.keys(CROPS).map(function (id) { var c = CROPS[id]; return '<button data-a="p" data-i="' + i + '" data-c="' + id + '" style="' + B + '">' + c.icon + ' ' + c.name + ' ' + c.seed + '⚡ → ' + c.sell + '</button>'; }).join('')) + '</div>'; });
    var stock = Object.keys(CROPS).map(function (id) { return CROPS[id].icon + ' ' + inv().get('crop-' + id); }).join('   ');
    panel.querySelector('#fmBody').innerHTML = h + '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center"><span>Harvest: ' + stock + '</span><button data-a="s" style="' + G + '">SELL ALL</button></div><div style="opacity:.55;font-size:11px;margin-top:4px">Farm profit today ' + S.profit + '/' + TUNE.dailyProfitCap + ' (then 50% prices). Crops keep growing while you are away.</div><div id="fmMsg" style="color:#e8c45c;min-height:18px;margin-top:4px"></div>';
  }
  function open() {
    if (typeof document === 'undefined') return; close(); panel = document.createElement('div'); panel.id = 'farmPanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,460px);max-height:84vh;overflow:auto;padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(52,229,176,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#34e5b0;font:900 16px Orbitron,sans-serif;letter-spacing:.14em"><span>FARM BEDS</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div id="fmBody"></div>'; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a'), i = +t.getAttribute('data-i'), r; if (a === 'x') return close();
      if (a === 'p') r = plant(i, t.getAttribute('data-c')); else if (a === 'w') r = water(i); else if (a === 'h') r = harvest(i); else if (a === 's') { var g = sellAll(); r = { ok: true, msg: g ? 'Sold for ' + g + ' Sparks' : 'Nothing to sell' }; }
      render(); var m = panel && panel.querySelector('#fmMsg'); if (m && r) m.textContent = r.msg; if (r) toast(r.msg); }); render(); timer = setInterval(render, 1000);
  }
  root.WorldFarm = { CROPS: CROPS, TUNE: TUNE, beds: beds, plant: plant, water: water, harvest: harvest, sellAll: sellAll, open: open, close: close, _now: function (f) { clock = f; }, _reset: function () { S = load(); for (var i = 0; i < S.beds.length; i++) S.beds[i] = null; S.profit = 0; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
