/* world-skatejam.js — SKATE JAM: the Hoverskate park trick game (owner 2026-10-01: "skate park game tricks mechanics ... fully complete the hoverboard mechanics ... effects").
 *
 *   var jam = window.buildSkateJam({ hover, playerPos, park?, toast, spend, add, balance })
 *   jam.open()        modal: wager + tier targets + leaderboard (needs you riding a hoverboard)
 *   jam.start(cfg)    begin a 90 s run  ({stake})
 *   jam.update(dt)    every frame (timer, combo decay, HUD, speed lines, stamina bar)
 *   jam.state()       { phase, score, combo, mult, timeLeft, tricks, rooms }
 *
 * Scoring (every number is provisional - TUNE is the single knob table):
 *   each CLEAN landing (hover.onTrick 'summary') scores its trick score x COMBO multiplier; consecutive clean tricks within COMBO_WINDOW keep the chain
 *   (mult = 1 + 0.5 per chain link, max 6); a BAIL resets the chain and costs BAIL_PENALTY. First clean landing in each park room = ROOM_BONUS; all rooms = LINE_BONUS.
 * Payout - CLOSED LOOP, NO MINTING (fixed 2026-10-09; the old rule paid stake x up to 6 from nothing). There is no house pool, so a run can never
 * return more than it staked: the stake is escrowed at start; reach any tier (BRONZE+) and the stake is REFUNDED in full; miss every tier and
 * LOSS_FEE (5%) is burned and the rest returned (WorldEconomy.settle - pure math, conserves exactly: payout + burn === stake).
 * Tiers now reward points/leaderboard rank, not Sparks. Daily cap (dailyCap = 600) limits Sparks WAGERED per day; free runs (stake 0) are unlimited.
 * A future bonus may only be paid out of a real burn-funded pool; do not add a multiplier without one.
 * Effects: coloured screen pulse per trick kind (spin cyan / flip magenta / varial gold / grab green), floating trick feed, combo bar, speed lines above ~16 m/s, stamina bar while flying.
 * Hook for real leaderboards: LB entries {score, tier, ts} (localStorage now; POST /api/skate/score later).
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  var TUNE = { duration: 90, comboWindow: 4.0, comboStep: 0.5, comboMax: 6, bailPenalty: 40, roomBonus: 80, lineBonus: 600, speedLinesMS: 16, dailyCap: 600, lossFee: 0.05,
    tiers: [{ name: 'BRONZE', score: 500 }, { name: 'SILVER', score: 1400 }, { name: 'GOLD', score: 2800 }], stakes: [30, 100, 300] };
  var KIND_COL = { spin: '#27e0ff', flip: '#ff3ea5', varial: '#e8c45c', grab: '#34e5b0', combo: '#ffffff', bail: '#ff5a6e' };
  var LBKEY = 'shd_jam_lb_v1', CAPKEY = 'shd_jam_cap_v1';
  function today() { return new Date().toISOString().slice(0, 10); }
  function lbLoad() { try { return JSON.parse(localStorage.getItem(LBKEY) || '[]'); } catch (e) { return []; } }
  function lbSave(a) { try { localStorage.setItem(LBKEY, JSON.stringify(a.slice(0, 10))); } catch (e) { } }
  function capLoad() { try { var c = JSON.parse(localStorage.getItem(CAPKEY) || '{}'); return c.d === today() ? c : { d: today(), t: 0 }; } catch (e) { return { d: today(), t: 0 }; } }
  function capSave(c) { try { localStorage.setItem(CAPKEY, JSON.stringify(c)); } catch (e) { } }

  root.buildSkateJam = function (o) {
    var hover = o.hover, P = o.playerPos, park = function () { return root.__hoverPark || o.park || null; };
    var S = { phase: 'idle', score: 0, chain: 0, chainT: 0, mult: 1, timeLeft: 0, tricks: 0, bails: 0, stake: 0, rooms: {}, best: 0, cd: 0 };
    var el = null, feed = null, flashEl = null, speedEl = null, panel = null, stBar = null;
    function toast(m) { if (o.toast) o.toast(m); else if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
    function bal() { return o.balance ? o.balance() : (root.ShdSparks ? root.ShdSparks.get() : 0); }
    function spend(n) { return o.spend ? o.spend(n, 'skate-jam', 'entry') : (root.ShdSparks ? root.ShdSparks.spend(n, 'skate-jam', 'entry') : false); }
    function add(n, why) { if (o.add) o.add(n, 'skate-win', why); else if (root.ShdSparks) root.ShdSparks.add(n, 'skate-win', why); }
    // closed-loop settlement: WorldEconomy.settle when loaded, identical inline math otherwise
    function settleRun(stake, won) {
      var fee = won ? 0 : TUNE.lossFee;
      if (root.WorldEconomy) { var r = root.WorldEconomy.settle({ stakes: [stake], shares: [1], feePct: fee }); return { payout: r.payouts[0] || 0, burn: r.burn }; }
      var burn = Math.floor(stake * Math.round(fee * 10000) / 10000); return { payout: stake - burn, burn: burn };
    }
    function riding() { return !!(hover && hover.isRiding && hover.isRiding()); }

    // ---------- DOM ----------
    function ensureDom() {
      if (el) return; var css = 'font-family:"Chakra Petch",Rajdhani,sans-serif;pointer-events:none;position:fixed;';
      el = document.createElement('div'); el.id = 'jamHud'; el.style.cssText = css + 'left:50%;bottom:92px;transform:translateX(-50%);z-index:9000;min-width:280px;text-align:center;padding:8px 18px;border-radius:14px;background:linear-gradient(180deg,rgba(12,18,30,.9),rgba(5,8,15,.95));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;display:none;box-shadow:0 8px 22px rgba(0,0,0,.5)';
      document.body.appendChild(el);
      feed = document.createElement('div'); feed.style.cssText = css + 'left:50%;top:34%;transform:translateX(-50%);z-index:9001;text-align:center'; document.body.appendChild(feed);
      flashEl = document.createElement('div'); flashEl.style.cssText = css + 'inset:0;z-index:8998;opacity:0;transition:opacity .35s'; document.body.appendChild(flashEl);
      speedEl = document.createElement('div'); speedEl.style.cssText = css + 'inset:0;z-index:8997;opacity:0;transition:opacity .25s;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,255,255,.0) 0deg 5deg,rgba(255,255,255,.10) 5deg 6deg);-webkit-mask-image:radial-gradient(circle,transparent 38%,#000 78%);mask-image:radial-gradient(circle,transparent 38%,#000 78%)'; document.body.appendChild(speedEl);
      stBar = document.createElement('div'); stBar.style.cssText = css + 'left:50%;bottom:70px;transform:translateX(-50%);z-index:8999;width:200px;height:7px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;display:none'; stBar.innerHTML = '<i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#00ff9c,#27e0ff);transition:width .1s"></i>'; document.body.appendChild(stBar);
    }
    function pop(txt, col, big) {
      ensureDom(); var d = document.createElement('div'); d.style.cssText = 'font:700 ' + (big ? 30 : 20) + 'px "Chakra Petch",Rajdhani,sans-serif;letter-spacing:.1em;color:' + col + ';text-shadow:0 0 14px ' + col + ',0 2px 4px #000;opacity:1;transform:translateY(0);transition:transform 1.4s ease-out,opacity 1.4s ease-out;margin:2px 0';
      d.textContent = txt; feed.appendChild(d); requestAnimationFrame(function () { d.style.transform = 'translateY(-46px)'; d.style.opacity = '0'; }); setTimeout(function () { d.remove(); }, 1500);
    }
    function pulse(col) { ensureDom(); flashEl.style.background = 'radial-gradient(circle,transparent 45%,' + col + '55 100%)'; flashEl.style.transition = 'none'; flashEl.style.opacity = '1'; requestAnimationFrame(function () { requestAnimationFrame(function () { flashEl.style.transition = 'opacity .45s'; flashEl.style.opacity = '0'; }); }); }

    // ---------- scoring ----------
    function onTrick(e) {
      if (S.phase !== 'run' || !e) return;
      if (e.kind === 'summary') {
        if (e.clean) {
          S.chain++; S.chainT = TUNE.comboWindow; S.mult = Math.min(TUNE.comboMax, 1 + TUNE.comboStep * (S.chain - 1));
          var pts = Math.round((e.score || 0) * S.mult); S.score += pts; S.tricks++; pulse(KIND_COL[S.lastKind] || '#27e0ff');
          pop('+' + pts + (S.mult > 1 ? '   x' + S.mult.toFixed(1) : ''), S.mult >= 3 ? '#e8c45c' : '#27e0ff', S.mult >= 3); if (S.mult >= 3 && S.chain % 3 === 0 && root.WorldCopy) pop(root.WorldCopy.pick('toasts.jam_combo'), '#9fb0cf', false);
          // park room bonus (first clean landing inside each room)
          var pk = park(); if (pk && pk.rooms) pk.rooms.forEach(function (r) { if (S.rooms[r.id]) return; if (Math.hypot(P.x - r.x, P.z - r.z) < (r.r || 40 * U) * 1.1) { S.rooms[r.id] = 1; S.score += TUNE.roomBonus; pop('ROOM CLEARED  +' + TUNE.roomBonus, '#34e5b0', false); } });
          if (pk && pk.rooms && pk.rooms.length && Object.keys(S.rooms).length >= pk.rooms.length && !S.lineDone) { S.lineDone = 1; S.score += TUNE.lineBonus; pop('FULL PARK LINE  +' + TUNE.lineBonus, '#ffffff', true); pulse('#ffffff'); }
        } else { S.bails++; S.chain = 0; S.mult = 1; S.chainT = 0; S.score = Math.max(0, S.score - TUNE.bailPenalty); pop('BAIL  -' + TUNE.bailPenalty + (root.WorldCopy ? '  \u2014 ' + root.WorldCopy.pick('toasts.jam_bail') : ''), KIND_COL.bail, false); pulse('#ff5a6e'); }
      } else if (e.kind && e.name && e.kind !== 'summary') { S.lastKind = e.kind; if (KIND_COL[e.kind]) pulse(KIND_COL[e.kind]); pop(String(e.name).toUpperCase() + (e.deg ? '  ' + Math.round(e.deg) + '°' : ''), KIND_COL[e.kind] || '#fff', false); }
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('shaddai:trick', function (ev) { onTrick(ev.detail); });

    // ---------- session ----------
    function start(cfg) {
      if (S.phase === 'run' || S.phase === 'count') return { ok: false, why: 'a run is already going' };
      if (!riding()) return { ok: false, why: 'ride your hoverboard first (I > Boards > Ride)' };
      var stake = Math.max(0, Math.round(cfg && cfg.stake != null && isFinite(cfg.stake) ? cfg.stake : 30));   // stake 0 = free run (was `|| 30`, which charged free runs 30)
      if (stake && bal() < stake) return { ok: false, why: 'not enough Sparks (' + stake + ')' };
      if (stake) { var cp = capLoad(); if (cp.t + stake > TUNE.dailyCap) return { ok: false, why: 'daily wager cap reached (' + cp.t + '/' + TUNE.dailyCap + ') - try a free run' }; }
      if (stake && !spend(stake)) return { ok: false, why: 'wager refused' };
      if (stake) { var cw = capLoad(); cw.t += stake; capSave(cw); }
      S.stake = stake; S.score = 0; S.chain = 0; S.mult = 1; S.tricks = 0; S.bails = 0; S.rooms = {}; S.lineDone = 0; S.timeLeft = TUNE.duration; S.phase = 'count'; S.cd = 3; ensureDom(); close();
      toast('SKATE JAM  -  ' + (stake ? stake + ' Sparks wagered' : 'free run') + '. Land clean tricks to build a combo!'); return { ok: true };
    }
    function finish() {
      S.phase = 'done'; var tier = null; TUNE.tiers.forEach(function (t) { if (S.score >= t.score) tier = t; });
      var payout = 0, burned = 0; if (S.stake) { var st = settleRun(S.stake, !!tier); payout = st.payout; burned = st.burn; if (payout > 0) add(payout, tier ? 'refund ' + tier.name : 'refund minus fee'); S.stake = 0; }
      var lb = lbLoad(); lb.push({ score: S.score, tier: tier ? tier.name : '-', ts: Date.now() }); lb.sort(function (a, b) { return b.score - a.score; }); lbSave(lb); S.best = lb[0] ? lb[0].score : S.score;
      pulse(tier ? '#e8c45c' : '#8fa3b8'); toast('SKATE JAM over - ' + S.score + ' pts' + (tier ? ' - ' + tier.name : ' - no tier') + (payout || burned ? '  (stake back: ' + payout + (burned ? ', ' + burned + ' burned' : '') + ')' : ''));
      setTimeout(function () { if (S.phase === 'done') { S.phase = 'idle'; draw(); } }, 7000);
    }
    function stop() { if (S.phase === 'count' && S.stake) { add(S.stake, 'cancelled'); S.stake = 0; } S.phase = 'idle'; draw(); }
    function draw() {
      ensureDom(); if (S.phase === 'idle') { el.style.display = 'none'; return; } el.style.display = 'block';
      var nextT = null; TUNE.tiers.forEach(function (t) { if (!nextT && S.score < t.score) nextT = t; });
      if (S.phase === 'count') { el.innerHTML = '<div style="color:#e8c45c;font-size:12px;letter-spacing:.2em">SKATE JAM</div><div style="font-size:34px;color:#00ff9c">' + Math.max(1, Math.ceil(S.cd)) + '</div>'; return; }
      var barW = Math.max(0, Math.min(100, S.chainT / TUNE.comboWindow * 100));
      el.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:12px;letter-spacing:.14em;color:#8fa3b8"><span>' + (S.phase === 'done' ? 'FINAL' : 'TIME ' + Math.ceil(S.timeLeft) + 's') + '</span><span>' + S.tricks + ' tricks &middot; ' + S.bails + ' bails</span></div>' +
        '<div style="font-size:30px;font-weight:700;color:#e8c45c;letter-spacing:.06em">' + S.score + '</div>' +
        '<div style="height:6px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:2px 0 4px"><i style="display:block;height:100%;width:' + barW + '%;background:linear-gradient(90deg,#ff3ea5,#e8c45c)"></i></div>' +
        '<div style="font-size:12px;color:#9fb0cf">' + (S.mult > 1 ? '<b style="color:#e8c45c">x' + S.mult.toFixed(1) + ' COMBO</b> &middot; ' : '') + (nextT ? 'next: ' + nextT.name + ' ' + nextT.score : '<b style="color:#00ff9c">GOLD CLEARED</b>') + '</div>';
    }
    function update(dt) {
      ensureDom();
      // speed lines + stamina bar apply to ANY hoverboard ride, not just a Jam run
      var r = riding(), v = r ? Math.abs(hover.speedMS ? hover.speedMS() : 0) : 0; speedEl.style.opacity = r && v > TUNE.speedLinesMS ? Math.min(0.9, (v - TUNE.speedLinesMS) / 8) : 0;
      if (r && (hover.isFlying && (hover.isFlying() || hover.isAirborne()))) { stBar.style.display = 'block'; stBar.firstChild.style.width = Math.round((hover.stamina ? hover.stamina() : 1) * 100) + '%'; } else stBar.style.display = 'none';
      if (S.phase === 'count') { S.cd -= dt; if (S.cd <= 0) { S.phase = 'run'; pop('GO!', '#00ff9c', true); } draw(); return; }
      if (S.phase !== 'run') return;
      S.timeLeft -= dt; if (S.chainT > 0) { S.chainT -= dt; if (S.chainT <= 0) { S.chain = 0; S.mult = 1; } }
      if (!r) { S.offT = (S.offT || 0) + dt; if (S.offT > 6) { pop('OFF THE BOARD', KIND_COL.bail, false); S.timeLeft = 0; } } else S.offT = 0;
      if (S.timeLeft <= 0) { S.timeLeft = 0; finish(); }
      draw();
    }

    // ---------- modal ----------
    function close() { if (panel) { panel.remove(); panel = null; } }
    function open() {
      close(); var lb = lbLoad(), cap = capLoad();
      panel = document.createElement('div'); panel.id = 'jamPanel';
      panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9500;width:min(92vw,420px);padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px "Chakra Petch",Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-size:16px;letter-spacing:.12em"><span>SKATE JAM</span><span data-act="x" style="cursor:pointer">&#10005;</span></div>' +
        '<div style="opacity:.75;margin:6px 0 8px">90 seconds. Land CLEAN tricks (Space hop, then hold Space to fly; in the air: A/D spin, Shift+W/S flips, grab). Chain them within 4 s to build a multiplier. Visit every park room for bonuses.</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px">' + TUNE.tiers.map(function (t) { return '<div style="flex:1;text-align:center;padding:6px;border:1px solid rgba(232,196,92,.35);border-radius:8px"><b style="color:#e8c45c">' + t.name + '</b><br>' + t.score + ' pts<br><small>stake back</small></div>'; }).join('') + '</div>' +
        '<div style="margin-bottom:8px">Wager: ' + TUNE.stakes.map(function (s) { return '<button data-act="go" data-s="' + s + '" style="margin:0 6px 0 0;padding:7px 12px;border-radius:8px;cursor:pointer;background:linear-gradient(180deg,rgba(0,255,156,.3),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;color:#eafff6;font:700 13px inherit">' + s + '&#9889;</button>'; }).join('') + '<button data-act="go" data-s="0" style="padding:7px 12px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.3);color:#cfe;font:700 13px inherit">Free run</button></div>' +
        '<div style="opacity:.7;font-size:12px">Your ride: <b style="color:' + (riding() ? '#00ff9c' : '#ff5a6e') + '">' + (riding() ? 'hoverboard ready' : 'NOT on a hoverboard (I &gt; Boards &gt; Ride)') + '</b> &middot; wagered today ' + cap.t + '/' + TUNE.dailyCap + ' Sparks &middot; reach BRONZE to get your stake back, miss it and 5% burns</div>' +
        '<div style="margin-top:8px;color:#e8c45c;letter-spacing:.1em">LEADERBOARD</div>' + (lb.length ? lb.slice(0, 5).map(function (e, i) { return '<div style="display:flex;justify-content:space-between;opacity:.9"><span>' + (i + 1) + '. ' + e.score + ' pts</span><span style="opacity:.7">' + e.tier + '</span></div>'; }).join('') : '<div style="opacity:.6">no runs yet</div>');
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-act]'); if (!t) return; if (t.getAttribute('data-act') === 'x') close(); else { var r = start({ stake: +t.getAttribute('data-s') }); if (!r.ok) toast(r.why); } });
    }
    return { open: open, start: start, stop: stop, update: update, state: function () { return { phase: S.phase, score: S.score, chain: S.chain, mult: S.mult, timeLeft: S.timeLeft, tricks: S.tricks, bails: S.bails, rooms: Object.keys(S.rooms).length }; }, TUNE: TUNE, _trick: onTrick, leaderboard: lbLoad, close: close };
  };
})(typeof window !== 'undefined' ? window : globalThis);
