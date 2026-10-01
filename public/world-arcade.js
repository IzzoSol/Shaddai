/* world-arcade.js — THE ARCADE (owner 2026-10-01: "we need the arcade made"): three cabinets paid in Sparks, with a real house edge (a Sparks SINK) and a daily win cap.
 *   SLOTS         3 reels, weighted symbols; payout table is auto-scaled so the long-run return (RTP) = TUNE.rtp (0.92)
 *   HIGHER-LOWER  next card higher/lower, streak multiplier, cash out any time; a tie loses (house edge)
 *   HOVER DASH    timing game: stop the sweeping marker inside the gate: PERFECT 3x / GOOD 1.8x / OK 1.2x / MISS 0 (skill-based)
 * Sparks are closed-loop. DAILY CAP: net arcade winnings per day are capped (TUNE.dailyNetCap); beyond it wins pay back the bet only, so the arcade can never out-print the sinks.
 * API: WorldArcade.open(game?) · WorldArcade.slots.spin(bet, rng) · slots.rtp() · hl.start/guess/cash · dash.play(bet, pos, rng) · TUNE · state()
 */
(function (root) {
  'use strict';
  var TUNE = { rtp: 0.92, bets: [10, 25, 50, 100], dailyNetCap: 600, hlStep: 1.85, hlMax: 8 };
  var KEY = 'shd_arcade_v1';
  function ls() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.d === today()) return j; } catch (e) { } return { d: today(), net: 0, plays: 0 }; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
  function spend(n) { return root.ShdSparks && root.ShdSparks.spend ? root.ShdSparks.spend(n, 'arcade', 'bet') : false; }
  function add(n) { if (root.ShdSparks && root.ShdSparks.add) root.ShdSparks.add(n, 'arcade', 'win'); }
  function bal() { return root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0; }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  // net-cap aware settlement: returns the amount actually credited for a gross win (bet already spent)
  function settle(bet, gross) { var s = ls(); s.plays++; var net = gross - bet, credit = gross; if (net > 0) { var room = Math.max(0, TUNE.dailyNetCap - s.net); if (net > room) { credit = bet + room; } s.net += Math.min(net, room); } else s.net += net; save(s); if (credit > 0) add(credit); return { credit: credit, capped: net > 0 && credit < gross, net: s.net }; }

  // ───────── SLOTS ─────────
  var SYM = [{ g: '7', p: 0.08, m: 50 }, { g: 'BAR', p: 0.14, m: 20 }, { g: '🔔', p: 0.2, m: 10 }, { g: '🍓', p: 0.26, m: 5 }, { g: '⚡', p: 0.32, m: 3 }];
  var PAIR_M = 2;   // reels 1+2 match (reel 3 different)
  var scale = 1; (function calibrate() { var raw = 0, i; for (i = 0; i < SYM.length; i++) { var p = SYM[i].p; raw += p * p * p * SYM[i].m + p * p * (1 - p) * PAIR_M; } scale = TUNE.rtp / raw; })();
  function pick(r) { var x = r, i; for (i = 0; i < SYM.length; i++) { if (x < SYM[i].p) return i; x -= SYM[i].p; } return SYM.length - 1; }
  var slots = {
    spin: function (bet, rng) { rng = rng || Math.random; var a = pick(rng()), b = pick(rng()), c = pick(rng()), mult = 0; if (a === b && b === c) mult = SYM[a].m * scale; else if (a === b) mult = PAIR_M * scale; var win = Math.floor(bet * mult + 1e-9); return { reels: [SYM[a].g, SYM[b].g, SYM[c].g], win: win, mult: mult }; },
    rtp: function () { var raw = 0, i; for (i = 0; i < SYM.length; i++) { var p = SYM[i].p; raw += p * p * p * SYM[i].m + p * p * (1 - p) * PAIR_M; } return raw * scale; },
    play: function (bet) { if (!spend(bet)) return { ok: false, msg: 'Not enough Sparks (' + bet + ')' }; var r = slots.spin(bet), s = settle(bet, r.win); return { ok: true, reels: r.reels, win: r.win, credit: s.credit, capped: s.capped, msg: r.win ? (s.capped ? 'Daily arcade cap reached — bet returned' : 'WIN +' + (s.credit - bet) + ' Sparks') : 'No match' }; }
  };

  // ───────── HIGHER / LOWER ─────────
  var hl = { st: null,
    start: function (bet, rng) { if (hl.st) return { ok: false, msg: 'finish your hand first' }; if (!spend(bet)) return { ok: false, msg: 'Not enough Sparks (' + bet + ')' }; hl.st = { bet: bet, card: 2 + Math.floor((rng || Math.random)() * 13), streak: 0, rng: rng || Math.random }; return { ok: true, card: hl.st.card }; },
    guess: function (dir) { var s = hl.st; if (!s) return { ok: false, msg: 'start a hand' }; var next = 2 + Math.floor(s.rng() * 13), ok = dir === 'higher' ? next > s.card : next < s.card;   // tie loses
      if (!ok) { var bet = s.bet; hl.st = null; settle(bet, 0); return { ok: true, over: true, won: false, card: next, msg: 'Wrong (' + next + ')' }; } s.card = next; s.streak++; if (s.streak >= TUNE.hlMax) return hl.cash(); return { ok: true, over: false, card: next, streak: s.streak, mult: +Math.pow(TUNE.hlStep, s.streak).toFixed(2) }; },
    cash: function () { var s = hl.st; if (!s) return { ok: false, msg: 'no hand' }; hl.st = null; if (s.streak === 0) { var r0 = settle(s.bet, s.bet); return { ok: true, over: true, won: false, credit: r0.credit, msg: 'Pushed: bet returned' }; } var gross = Math.floor(s.bet * Math.pow(TUNE.hlStep, s.streak)), r = settle(s.bet, gross); return { ok: true, over: true, won: true, credit: r.credit, msg: 'Cashed out ' + r.credit + ' Sparks (streak ' + s.streak + ')' + (r.capped ? ' — daily cap applied' : '') }; } };

  // ───────── HOVER DASH (skill) ─────────
  var dash = { play: function (bet, pos) { /* pos: marker position 0..1 when you pressed STOP; the gate is centred at 0.5 */ if (!spend(bet)) return { ok: false, msg: 'Not enough Sparks (' + bet + ')' }; var d = Math.abs(pos - 0.5), tier = d < 0.03 ? ['PERFECT', 3] : d < 0.09 ? ['GOOD', 1.8] : d < 0.16 ? ['OK', 1.2] : ['MISS', 0], gross = Math.floor(bet * tier[1]), r = settle(bet, gross); return { ok: true, tier: tier[0], credit: r.credit, msg: tier[0] + (gross ? '  x' + tier[1] : '') + (r.capped ? ' — daily cap applied' : '') }; } };

  // ───────── UI ─────────
  var panel = null, tab = 'slots', bet = 10, dashRaf = 0, dashPos = 0, dashDir = 1;
  function close() { if (panel) { panel.remove(); panel = null; } if (dashRaf) { cancelAnimationFrame(dashRaf); dashRaf = 0; } }
  var B = 'background:linear-gradient(180deg,rgba(0,255,156,.3),rgba(0,120,80,.42));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:9px;color:#eafff6;padding:8px 14px;cursor:pointer;font:800 13px Rajdhani,sans-serif;letter-spacing:.08em;margin:3px 4px 3px 0';
  var G = B.replace(/0,255,156/g, '232,196,92').replace('#00ff9c', '#e8c45c').replace('0,120,80', '120,80,10').replace('#eafff6', '#ffe9b0');
  function view() {
    if (!panel) return; var s = ls(), body = panel.querySelector('#arBody'), h = '<div style="display:flex;gap:6px;margin-bottom:8px">' + ['slots|SLOTS', 'hl|HIGHER-LOWER', 'dash|HOVER DASH'].map(function (x) { var p = x.split('|'); return '<button data-a="tab" data-t="' + p[0] + '" style="' + (p[0] === tab ? G : B) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div style="margin-bottom:6px">Bet: ' + TUNE.bets.map(function (b) { return '<button data-a="bet" data-b="' + b + '" style="' + (b === bet ? G : B) + ';padding:5px 10px">' + b + '</button>'; }).join('') + ' <span style="opacity:.7">⚡ ' + bal() + '</span></div>';
    if (tab === 'slots') h += '<div id="arReels" style="font:900 40px Orbitron,sans-serif;text-align:center;letter-spacing:.2em;padding:14px;border-radius:12px;background:#080d18;border:1px solid rgba(232,196,92,.4)">— — —</div><button data-a="spin" style="' + B + ';width:100%;font-size:16px">SPIN (' + bet + '⚡)</button><div style="opacity:.6;font-size:11px">RTP ' + (slots.rtp() * 100).toFixed(0) + '% · three of a kind pays up to ' + Math.round(SYM[0].m * scale) + 'x · two matching reels pay ' + (PAIR_M * scale).toFixed(1) + 'x</div>';
    else if (tab === 'hl') h += '<div id="arCard" style="font:900 56px Orbitron,sans-serif;text-align:center;padding:10px;border-radius:12px;background:#080d18;border:1px solid rgba(232,196,92,.4)">' + (hl.st ? hl.st.card : '?') + '</div><div>' + (hl.st ? '<button data-a="hi" style="' + B + '">HIGHER</button><button data-a="lo" style="' + B + '">LOWER</button><button data-a="cash" style="' + G + '">CASH OUT x' + Math.pow(TUNE.hlStep, hl.st.streak).toFixed(2) + '</button>' : '<button data-a="hstart" style="' + B + ';width:100%">DEAL (' + bet + '⚡)</button>') + '</div><div style="opacity:.6;font-size:11px">Cards 2–14. Each correct guess multiplies x' + TUNE.hlStep + ' (max ' + TUNE.hlMax + '). A tie loses.</div>';
    else h += '<div style="position:relative;height:34px;border-radius:10px;background:#080d18;border:1px solid rgba(232,196,92,.4);overflow:hidden"><div style="position:absolute;left:34%;width:32%;top:0;bottom:0;background:rgba(232,196,92,.18)"></div><div style="position:absolute;left:47%;width:6%;top:0;bottom:0;background:rgba(0,255,156,.35)"></div><div id="arMark" style="position:absolute;top:2px;bottom:2px;width:6px;border-radius:3px;background:#fff;left:0"></div></div><button data-a="stop" style="' + B + ';width:100%;font-size:16px;margin-top:8px">STOP (' + bet + '⚡)</button><div style="opacity:.6;font-size:11px">Hit the green gate: PERFECT x3 · GOOD x1.8 · OK x1.2</div>';
    h += '<div id="arMsg" style="margin-top:8px;min-height:20px;color:#e8c45c"></div><div style="opacity:.55;font-size:11px">Today: net ' + s.net + '/' + TUNE.dailyNetCap + ' cap · ' + s.plays + ' plays · Sparks are closed-loop</div>'; body.innerHTML = h;
    if (dashRaf) { cancelAnimationFrame(dashRaf); dashRaf = 0; } if (tab === 'dash') { var mk = body.querySelector('#arMark'), last = performance.now(); (function f(t) { var dt = (t - last) / 1000; last = t; dashPos += dashDir * dt * 0.9; if (dashPos > 1) { dashPos = 1; dashDir = -1; } if (dashPos < 0) { dashPos = 0; dashDir = 1; } if (mk && mk.isConnected) { mk.style.left = (dashPos * 97) + '%'; dashRaf = requestAnimationFrame(f); } })(last); }
  }
  function say(m) { var e = panel && panel.querySelector('#arMsg'); if (e) e.textContent = m; toast(m); }
  function open(g) {
    if (typeof document === 'undefined') return; close(); tab = g || tab; panel = document.createElement('div'); panel.id = 'arcadePanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,440px);padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font:900 16px Orbitron,sans-serif;letter-spacing:.14em"><span>SHADDAI ARCADE</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div id="arBody" style="margin-top:8px"></div>'; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a'), r;
      if (a === 'x') return close(); if (a === 'tab') { tab = t.getAttribute('data-t'); return view(); } if (a === 'bet') { bet = +t.getAttribute('data-b'); return view(); }
      if (a === 'spin') { r = slots.play(bet); view(); if (r.reels) panel.querySelector('#arReels').textContent = r.reels.join('  '); say(r.msg); }
      else if (a === 'hstart') { r = hl.start(bet); view(); if (!r.ok) say(r.msg); } else if (a === 'hi' || a === 'lo') { r = hl.guess(a === 'hi' ? 'higher' : 'lower'); view(); say(r.msg || (r.over ? '' : 'Correct — streak ' + r.streak + ' (x' + r.mult + ')')); } else if (a === 'cash') { r = hl.cash(); view(); say(r.msg); }
      else if (a === 'stop') { r = dash.play(bet, dashPos); view(); say(r.msg); } }); view();
  }
  root.WorldArcade = { TUNE: TUNE, slots: slots, hl: hl, dash: dash, open: open, close: close, state: ls, _scale: function () { return scale; } };
})(typeof window !== 'undefined' ? window : globalThis);
