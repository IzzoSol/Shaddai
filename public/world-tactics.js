/* world-tactics.js — SHADDAI TACTICS v1 (2026-09-23): FFT-style grid battles for the
 * Colosseum. CT turn order by AGI, STR/AGI/INT/HP, move+act per turn, archetype skills,
 * agentic bot opponents (weighted option scores), sparks stake in / pot out.
 *
 * Overlay battle canvas (2D tactical — the grid-mode from the Master World Spec §TACTICS);
 * the 3D camera-pull integration lands with the model polish pass. Zero fal, zero deps.
 *
 * Integration: window.buildWorldTactics({ sparks:{get,add}, onEnd(fn) })
 *   window.__worldTactics.startFight({ entry, pool, tier })   // from the Colosseum modal
 */
window.buildWorldTactics = function (opts) {
  opts = opts || {};
  var SPK = opts.sparks || {
    get: function () { try { return parseInt(localStorage.getItem('shd.sparks3d') || '0', 10) || 0; } catch (e) { return 0; } },
    add: function (n) { try { localStorage.setItem('shd.sparks3d', String(SPK.get() + n)); } catch (e) {} },
  };
  var TOURN = (function () { try { return JSON.parse(localStorage.getItem('shd.tourney') || '{"fightPool":0,"fightN":0,"skatePool":0,"skateN":0,"wins":0,"losses":0}'); } catch (e) { return { fightPool: 0, fightN: 0, skatePool: 0, skateN: 0, wins: 0, losses: 0 }; } })();
  function saveT() { try { localStorage.setItem('shd.tourney', JSON.stringify(TOURN)); } catch (e) {} }

  // ── archetypes: stats wired to the §SPEC classes (Heavy/Scout/Utility/Apex) ──
  var ARCH = {
    PILOT:  { str: 10, agi: 10, int: 10, hp: 60, move: 4, rng: 1, col: '#5fe0ff', name: 'PILOT' },
    SHADDAI:{ str: 12, agi: 9,  int: 14, hp: 70, move: 4, rng: 2, col: '#ffcf4a', name: 'SHADDAI' },
    HEAVY:  { str: 16, agi: 5,  int: 6,  hp: 90, move: 3, rng: 1, col: '#ff5a6e', name: 'HEAVY BOT' },
    SCOUT:  { str: 7,  agi: 16, int: 8,  hp: 40, move: 6, rng: 3, col: '#ff8a3a', name: 'SCOUT BOT' },
    ORACLE: { str: 6,  agi: 9,  int: 16, hp: 50, move: 4, rng: 3, col: '#c084fc', name: 'ORACLE' },
  };
  var SKILLS = {
    BASH:   { cost: 0, dmg: 1.6, rng: 1, kind: 'atk', int: 0,  label: 'BASH (heavy strike)' },
    BLITZ:  { cost: 0, dmg: 1.2, rng: 3, kind: 'atk', int: 2,  label: 'BLITZ (ranged shot)' },
    HEAL:   { cost: 0, dmg: -1,  rng: 3, kind: 'heal', int: 8, label: 'HEAL (restore INT×2)' },
  };

  var W = 12, H = 9, TS = 54;           // grid + tile px
  var wrap, cv, cx, side, st = null, raf = 0, tick = 0, last = 0;

  function mkUnit(arch, side_, gx, gy, isPlayer, bot) {
    var a = ARCH[arch];
    return { arch: arch, name: a.name, side: side_, x: gx, y: gy, str: a.str, agi: a.agi,
      int: a.int, hp: a.hp, hpMax: a.hp, move: a.move, rng: a.rng, col: a.col,
      ct: Math.random() * 40, isPlayer: !!isPlayer, bot: !!bot, acted: false, moved: false, dead: false };
  }

  function buildDOM() {
    if (wrap) return;
    wrap = document.createElement('div');
    wrap.id = 'shdTactics';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:120;display:none;background:radial-gradient(120% 90% at 50% 0%,rgba(10,16,30,.96),rgba(4,6,12,.99));font-family:system-ui,sans-serif';
    wrap.innerHTML =
      '<div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:#e8c45c;font-weight:900;letter-spacing:.22em;font-size:15px;text-shadow:0 0 14px rgba(232,196,92,.5)">⚔ SHADDAI TACTICS</div>'
      + '<canvas id="tacCv" style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);border:1px solid rgba(232,196,92,.35);border-radius:10px;box-shadow:0 0 44px rgba(0,0,0,.7)"></canvas>'
      + '<div id="tacSide" style="position:absolute;right:16px;top:64px;width:190px;color:#9fe8c4;font-size:12px"></div>'
      + '<div id="tacLog" style="position:absolute;left:16px;bottom:14px;width:260px;color:#8fa3c0;font-size:11px;line-height:1.5"></div>'
      + '<div id="tacBtns" style="position:absolute;right:16px;bottom:14px;display:flex;gap:8px"></div>'
      + '<div id="tacTurn" style="position:absolute;left:50%;top:40px;transform:translateX(-50%);color:#5fe0ff;font-weight:800;font-size:13px;letter-spacing:.1em"></div>';
    document.body.appendChild(wrap);
    cv = document.getElementById('tacCv'); cx = cv.getContext('2d');
    side = document.getElementById('tacSide');
    cv.width = W * TS; cv.height = H * TS;
    cv.addEventListener('click', onGrid);
  }

  function log(txt, col) {
    var el = document.getElementById('tacLog');
    el.innerHTML = '<div style="color:' + (col || '#8fa3c0') + '">› ' + txt + '</div>' + el.innerHTML;
  }

  // ── combat math (deterministic, spec-wired) ──
  function hitChance(a, d) { return Math.min(95, Math.max(40, 70 + (a.agi - d.agi) * 2)); }
  function dmgDealt(a, d, mult, useInt) {
    var base = useInt ? (a.int * 1.6) : (a.str * 1.5);
    return Math.max(1, Math.round(base * mult - d.agi * 0.4));
  }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function alive(side_) { return st.units.filter(function (u) { return u.side === side_ && !u.dead; }); }
  function bfs(u, maxN) {
    var seen = {}, q = [[u.x, u.y, 0]], out = [];
    seen[u.x + ',' + u.y] = 1;
    while (q.length) {
      var c = q.shift();
      if (c[2] > maxN) continue;
      out.push([c[0], c[1], c[2]]);
      var occ = st.units.some(function (o) { return !o.dead && o.x === c[0] && o.y === c[1] && o !== u; });
      if (!occ) [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d4) {
        var nx = c[0] + d4[0], ny = c[1] + d4[1], k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) return;
        seen[k] = 1; q.push([nx, ny, c[2] + 1]);
      });
    }
    return out;
  }

  // ── turn loop ──
  function stepCT(dt) {
    if (st.over) return;
    if (st.active) return;                       // a unit is acting; charge frozen
    for (var i = 0; i < st.units.length; i++) {
      var u = st.units[i];
      if (u.dead) continue;
      u.ct += u.agi * dt * 6;
      if (u.ct >= 100) { st.active = u; u.ct = 100; u.moved = false; u.acted = false;
        document.getElementById('tacTurn').textContent = (u.side === 'P' ? 'YOUR MOVE · ' : 'ENEMY · ') + u.name;
        if (u.bot && u.side === 'E') setTimeout(function (uu) { return function () { botAct(uu); }; }(u), 420);
        else if (u.bot && u.side === 'P') setTimeout(function (uu) { return function () { botAct(uu); }; }(u), 380);
        break;
      }
    }
  }

  function botAct(u) {
    var foes = alive(u.side === 'E' ? 'P' : 'E');
    if (!foes.length) { endTurn(u); return; }
    foes.sort(function (a, b) { return dist(u, a) - dist(u, b); });
    var foe = foes[0];
    // 1) attack if in range — pick best skill by expected damage (agentic weighted score)
    var best = null, bestScore = -1e9;
    Object.keys(SKILLS).forEach(function (k) {
      var s = SKILLS[k];
      if (dist(u, foe) > s.rng) return;
      var score = s.kind === 'heal' ? -999 : dmgDealt(u, foe, s.dmg, s.int > 0) + (s.rng > 1 ? 4 : 0);
      if (score > bestScore) { bestScore = score; best = k; }
    });
    if (best) { doAttack(u, foe, best); endTurn(u); return; }
    // 2) else move toward foe (greedy BFS step) then maybe attack
    var reach = bfs(u, u.move);
    reach.sort(function (a, b) { return (Math.abs(a[0] - foe.x) + Math.abs(a[1] - foe.y)) - (Math.abs(b[0] - foe.x) + Math.abs(b[1] - foe.y)); });
    var tgt = reach[0];
    if (tgt) { u.x = tgt[0]; u.y = tgt[1]; }
    if (dist(u, foe) <= u.rng) doAttack(u, foe, u.rng > 2 ? 'BLITZ' : 'BASH');
    endTurn(u);
  }

  function doAttack(a, d, skillKey) {
    var s = SKILLS[skillKey] || SKILLS.BASH;
    if (s.kind === 'heal') { var h = a.int * 2; d.hp = Math.min(d.hpMax, d.hp + h); log(a.name + ' HEALS ' + d.name + ' +' + h + 'HP', '#00ff9c'); return; }
    var hit = hitChance(a, d);
    if (Math.random() * 100 > hit) { log(a.name + ' MISSED ' + d.name, '#8fa3c0'); return; }
    var dmg = dmgDealt(a, d, s.dmg, s.int > 0);
    d.hp -= dmg;
    log(a.name + ' → ' + d.name + '  −' + dmg + 'HP', a.side === 'P' ? '#00ff9c' : '#ff5a6e');
    if (d.hp <= 0) { d.dead = true; d.hp = 0; log('☠ ' + d.name + ' DOWN', '#e8c45c'); }
    checkEnd();
  }

  function checkEnd() {
    if (st.over) return;
    if (!alive('E').length) finish(true);
    else if (!alive('P').length) finish(false);
  }

  function endTurn(u) { u.ct = 0; st.active = null; render(); }

  // ── player input (click to move, buttons to act) ──
  var sel = null;
  function onGrid(e) {
    var r = cv.getBoundingClientRect();
    var gx = Math.floor((e.clientX - r.left) / TS), gy = Math.floor((e.clientY - r.top) / TS);
    if (!st.active || st.active.side !== 'P' || !st.active.isPlayer) return;
    var u = st.active;
    if (sel === 'move') {
      var ok = bfs(u, u.move).some(function (c) { return c[0] === gx && c[1] === gy; });
      if (ok) { u.x = gx; u.y = gy; u.moved = true; sel = null; log(u.name + ' moves'); render(); }
    } else if (sel === 'atk') {
      var t = st.units.find(function (o) { return !o.dead && o.x === gx && o.y === gy; });
      if (t && dist(u, t) <= u.rng) { doAttack(u, t, 'BASH'); u.acted = true; sel = null; endTurn(u); }
    }
  }
  function actBtn(label, fn, col) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid ' + col + ';background:rgba(10,14,20,.8);color:' + col + ';font-weight:800;font-size:11px;cursor:pointer;letter-spacing:.06em';
    b.onclick = fn;
    document.getElementById('tacBtns').appendChild(b);
    return b;
  }
  function drawBtns() {
    var holder = document.getElementById('tacBtns');
    holder.innerHTML = '';
    if (!st || !st.active || st.active.side !== 'P' || !st.active.isPlayer) return;
    var u = st.active;
    actBtn('MOVE', function () { sel = sel === 'move' ? null : 'move'; }, '#5fe0ff');
    actBtn('ATTACK', function () { sel = sel === 'atk' ? null : 'atk'; }, '#ff5a6e');
    actBtn('HEAL', function () {
      var ally = alive('P').filter(function (o) { return o !== u; }).sort(function (a, b) { return a.hp / a.hpMax - b.hp / b.hpMax; })[0] || u;
      if (dist(u, ally) <= 3) { doAttack(u, ally, 'HEAL'); u.acted = true; endTurn(u); } else log('ALLY OUT OF HEAL RANGE', '#8fa3c0');
    }, '#00ff9c');
    actBtn('END', function () { sel = null; endTurn(u); }, '#e8c45c');
  }

  // ── render ──
  function render() {
    if (!st) return;
    var grd = cx.createLinearGradient(0, 0, 0, cv.height);
    grd.addColorStop(0, 'rgba(10,16,28,1)'); grd.addColorStop(1, 'rgba(4,8,14,1)');
    cx.fillStyle = grd; cx.fillRect(0, 0, cv.width, cv.height);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      cx.strokeStyle = ((x + y) % 2) ? 'rgba(39,224,255,.07)' : 'rgba(232,196,92,.06)';
      cx.strokeRect(x * TS + .5, y * TS + .5, TS - 1, TS - 1);
    }
    if (st.active && st.active.isPlayer && sel === 'move') {
      bfs(st.active, st.active.move).forEach(function (c) {
        cx.fillStyle = 'rgba(95,224,255,.16)'; cx.fillRect(c[0] * TS + 3, c[1] * TS + 3, TS - 6, TS - 6);
      });
    }
    if (st.active && st.active.isPlayer && sel === 'atk') {
      cx.fillStyle = 'rgba(255,90,110,.14)';
      cx.fillRect(st.active.x * TS, st.active.y * TS, TS, TS);
    }
    st.units.forEach(function (u) {
      if (u.dead) return;
      var px = u.x * TS + TS / 2, py = u.y * TS + TS / 2;
      cx.beginPath(); cx.arc(px, py, TS * .34, 0, 7);
      cx.fillStyle = u.col; cx.globalAlpha = u === st.active ? 1 : .82; cx.fill(); cx.globalAlpha = 1;
      cx.strokeStyle = u.isPlayer ? '#fff' : 'rgba(0,0,0,.5)'; cx.lineWidth = 2; cx.stroke();
      cx.fillStyle = '#06080b'; cx.font = '900 13px system-ui'; cx.textAlign = 'center';
      cx.fillText(u.name.slice(0, 2), px, py + 4);
      cx.fillStyle = 'rgba(0,0,0,.65)'; cx.fillRect(px - TS * .36, py + TS * .26, TS * .72, 5);
      cx.fillStyle = u.side === 'P' ? '#00ff9c' : '#ff5a6e';
      cx.fillRect(px - TS * .36, py + TS * .26, TS * .72 * (u.hp / u.hpMax), 5);
    });
    side.innerHTML = st.units.filter(function (u) { return !u.dead; }).map(function (u) {
      var pct = Math.round(u.ct);
      return '<div style="margin-bottom:7px;padding:6px 8px;border:1px solid ' + u.col + '55;border-radius:7px;background:rgba(6,10,16,.7)">'
        + '<b style="color:' + u.col + '">' + u.name + '</b>'
        + '<div style="font-size:10px;opacity:.8">HP ' + u.hp + '/' + u.hpMax + ' · STR ' + u.str + ' AGI ' + u.agi + ' INT ' + u.int + '</div>'
        + '<div style="height:3px;background:#1a2230;border-radius:2px;margin-top:3px"><div style="height:3px;border-radius:2px;width:' + pct + '%;background:' + (u.side === 'P' ? '#00ff9c' : '#ff5a6e') + '"></div></div>'
        + '<div style="font-size:9px;opacity:.6">CT ' + pct + '</div></div>';
    }).join('');
    drawBtns();
  }

  var ctTimer = 0;
  function frame() {
    if (!st) return;
    render();
    if (st && !st.over) requestAnimationFrame(frame);
  }

  function finish(won) {
    st.over = true; sel = null;
    var pot = st.entry + st.pool;
    var el = document.getElementById('tacTurn');
    if (won) { SPK.add(pot); TOURN.wins++; el.textContent = 'VICTORY  ·  +' + pot + ' ⚡'; log('⚔ VICTORY — the pool is yours: +' + pot + ' SPARKS', '#e8c45c'); }
    else { TOURN.losses++; el.textContent = 'DEFEATED  ·  entry lost'; log('☠ defeated — your entry burns in the pool', '#ff5a6e'); }
    saveT();
    document.getElementById('tacBtns').innerHTML = '';
    actBtn('RETURN TO THE ARENA', function () { hide(); }, '#e8c45c');
    render();
  }

  function hide() { wrap.style.display = 'none'; st = null; if (ctTimer) { clearInterval(ctTimer); ctTimer = 0; } }

  var api = {
    startFight: function (cfg) {
      cfg = cfg || {};
      buildDOM();
      var tier = cfg.tier || Math.min(3, Math.floor((TOURN.wins || 0) / 2));   // enemies scale with wins
      st = { over: false, active: null, entry: cfg.entry || 50, pool: cfg.pool || 0, tier: tier, units: [] };
      st.units.push(mkUnit('PILOT', 'P', 2, 4, true, false));
      st.units.push(mkUnit('SHADDAI', 'P', 1, 2, false, true));
      st.units.push(mkUnit('ORACLE', 'P', 1, 6, false, true));
      st.units.push(mkUnit('HEAVY', 'E', W - 3, 3, false, true));
      st.units.push(mkUnit('SCOUT', 'E', W - 3, 5, false, true));
      if (tier >= 1) st.units.push(mkUnit('HEAVY', 'E', W - 2, 4, false, true));
      if (tier >= 2) { st.units[4].agi += 4; st.units[3].str += 4; }
      if (tier >= 3) st.units.push(mkUnit('SCOUT', 'E', W - 2, 2, false, true));
      st.units.forEach(function (u) { if (u.side === 'E') { u.str += tier * 2; u.hp += tier * 10; u.hpMax = u.hp; } });
      wrap.style.display = 'block';
      document.getElementById('tacLog').innerHTML = '';
      log('COLOSSEUM — tier ' + tier + ' · entry ' + st.entry + '⚡ · pot ' + (st.entry + st.pool) + '⚡', '#e8c45c');
      // CT clock: fixed 200ms ticks (5/s) — deterministic pace, immune to rAF throttling
      if (ctTimer) clearInterval(ctTimer);
      ctTimer = setInterval(function () { if (st && !st.over) stepCT(0.2); }, 200);
      last = performance.now(); requestAnimationFrame(frame);
      return true;
    },
    tourney: TOURN,
    hide: hide,
  };
  try { window.__worldTactics = api; } catch (e) {}
  return api;
};
