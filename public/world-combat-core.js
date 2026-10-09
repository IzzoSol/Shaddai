/* world-combat-core.js — COMBAT CORE v2 (pure rules, no THREE/DOM). Deterministic: no Math.random.
 *   var f = WorldCombatCore.create({ cfg?, dodge?: WorldDodge, rng?, stamina?: {get(), spend(n), regen?(n)} });
 *   f.input('light'|'heavy'|'roll'|'block'|'release-block'|'move'|'stop') -> bool (accepted / buffered)
 *   f.step(dt)                      advance timers (returns nothing)
 *   f.hit({dmg, dir:{x,z}, kind, poise?}) -> {applied, dmg, stopMs, knockback:{x,z}, state, parried?, dodged?}
 *   f.attackFor(state) -> {move, dmg, clip}     f.on(evt, fn): 'state'{from,to} 'active'{move,start|end} 'hit' 'kill'
 *   f.state() · f.hp() · f.stamina() · f.isActive() · f.snapshot()
 * Hit-stop is RETURNED (stopMs) — the core never freezes a global clock; the host decides what to pause.
 * Roll i-frames: dodge.CFG {iFrom,iTo,dur,cooldown} drive an internal, step-synchronised timer (dodge.trigger() gates the cooldown);
 * if a dodge has no CFG, dodge.isInvulnerable()/invulnerable() is consulted instead.
 */
(function (root) {
  'use strict';
  var DEFAULTS = {
    hp: 100,
    attacks: {
      attack1: { startup: 0.10, active: 0.12, recovery: 0.22, dmg: 10, clip: 'Sword_Regular_A', next: 'attack2' },
      attack2: { startup: 0.10, active: 0.12, recovery: 0.24, dmg: 12, clip: 'Sword_Regular_B', next: 'attack3' },
      attack3: { startup: 0.14, active: 0.14, recovery: 0.36, dmg: 18, clip: 'Sword_Regular_C', next: null },
      heavy:   { startup: 0.32, active: 0.16, recovery: 0.50, dmg: 30, clip: 'Sword_Heavy_Combo', next: null }
    },
    clips: { block: 'Sword_Block', roll: 'Roll', hitstun: 'Hit_Knockback' },
    roll: { dur: 0.5, iFrom: 0.04, iTo: 0.42, cooldown: 0.9 },
    cost: { light: 8, heavy: 22, roll: 18, blockHit: 6 },
    stamina: { max: 100, regen: 30, regenDelay: 0.6 },
    bufferWindow: 0.25,
    parryWindow: 0.15,
    blockReduction: 0.6,
    hitstun: { min: 0.15, max: 0.45, base: 0.15, perDmg: 0.01, poiseScale: 0.6 },
    stop: { base: 40, perDmg: 1.5, min: 40, max: 90 },
    knockback: { base: 2, perDmg: 0.15 },
    undodgeable: /lava|drown|fall|hazard|gas|cold|heat|burn|void|starv/i
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function merge(base, over) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    if (over) for (k in over) {
      var v = over[k];
      out[k] = (v && typeof v === 'object' && !(v instanceof RegExp) && !Array.isArray(v) && base[k] && typeof base[k] === 'object') ? merge(base[k], v) : v;
    }
    return out;
  }

  function create(opts) {
    opts = opts || {};
    var C = merge(DEFAULTS, opts.cfg), dodge = opts.dodge || null, rng = opts.rng || null, ext = opts.stamina || null;
    var hp = C.hp, maxHp = C.hp, own = C.stamina.max, regenDelay = 0;
    var state = 'idle', t = 0, moving = false, activeStarted = false, activeOn = false;
    var buf = null, rollT0 = -1, rollReady = 0, clock = 0, hitstunDur = 0, parryT = 0;
    var handlers = {}, ownDodgeCd = 0;

    function on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return function () { var a = handlers[evt], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }
    function emit(evt, d) { var a = handlers[evt]; if (a) for (var i = 0; i < a.length; i++) a[i](d); }

    function getSta() { return ext ? ext.get() : own; }
    function canSpend(n) { return getSta() >= n; }
    function spend(n) {
      if (n <= 0) return true;
      if (!canSpend(n)) return false;
      if (ext) ext.spend(n); else own = Math.max(0, own - n);
      regenDelay = C.stamina.regenDelay; return true;
    }
    function drain(n) { // block-hit cost: take what is there, report whether it fully covered
      var have = getSta(), take = Math.min(have, n);
      if (take > 0) { if (ext) ext.spend(take); else own = Math.max(0, own - take); }
      regenDelay = C.stamina.regenDelay; return take >= n;
    }

    function isAttack(s) { return !!C.attacks[s]; }
    function phase() { // 'startup' | 'active' | 'recovery' | null
      var a = C.attacks[state]; if (!a) return null;
      return t < a.startup ? 'startup' : t < a.startup + a.active ? 'active' : 'recovery';
    }
    function endActive() { if (activeOn) { activeOn = false; emit('active', { move: state, end: true }); } }
    function enter(to, carry) {
      var from = state;
      if (isAttack(from) && from !== to) endActive();
      else if (isAttack(from) && from === to) endActive();
      state = to; t = carry || 0; activeStarted = false; activeOn = false;
      if (from !== to) emit('state', { from: from, to: to });
      else emit('state', { from: from, to: to });
    }
    function freeState() { return moving ? 'run' : 'idle'; }

    function startAttack(name) {
      var cost = name === 'heavy' ? C.cost.heavy : C.cost.light;
      if (!spend(cost)) return false;
      enter(name); return true;
    }
    function startRoll() {
      if (!canSpend(C.cost.roll)) return false;
      if (dodge) { if (dodge.trigger && !dodge.trigger()) return false; }
      else { if (clock < rollReady) return false; rollReady = clock + C.roll.cooldown; }
      spend(C.cost.roll); rollT0 = clock; enter('roll'); return true;
    }
    function rollWin() { var d = dodge && dodge.CFG ? dodge.CFG : C.roll; return { dur: d.dur || C.roll.dur, iFrom: d.iFrom, iTo: d.iTo }; }
    function invulnerable() {
      if (state !== 'roll') return false;
      if (dodge && !dodge.CFG) { var f = dodge.isInvulnerable || dodge.invulnerable; if (f) return !!f.call(dodge); }
      var w = rollWin(); return t >= w.iFrom && t <= w.iTo;
    }

    function consumeBuffer(carry) { // called when entering a free state; returns true if an action started
      if (!buf) return false;
      var b = buf; buf = null;
      if (clock - b.at > C.bufferWindow) return false;
      if (b.name === 'light') return startAttack('attack1') && (t = carry || 0, true);
      if (b.name === 'heavy') return startAttack('heavy') && (t = carry || 0, true);
      if (b.name === 'roll') return startRoll() && (t = carry || 0, true);
      return false;
    }
    function toFree(carry) { enter(freeState(), carry); consumeBuffer(carry); }

    function input(name) {
      if (state === 'dead') return false;
      var busy = state === 'hitstun';
      var ph = phase();
      switch (name) {
        case 'move': moving = true; if (state === 'idle') enter('run'); return true;
        case 'stop': moving = false; if (state === 'run') enter('idle'); return true;
        case 'release-block': if (state === 'block') { toFree(0); return true; } return false;
        case 'block':
          if (busy || state === 'roll' || isAttack(state)) return false;
          if (state === 'block') return true;
          enter('block'); parryT = 0; return true;
        case 'light':
        case 'heavy': {
          if (busy || state === 'block') return false;
          if (state === 'idle' || state === 'run') {
            if (name === 'heavy' && !canSpend(C.cost.heavy)) return false;
            if (name === 'light' && !canSpend(C.cost.light)) return false;
            return startAttack(name === 'light' ? 'attack1' : 'heavy');
          }
          if (name === 'heavy' && !canSpend(C.cost.heavy)) return false;
          buf = { name: name, at: clock }; return true; // attack/roll in progress -> buffer
        }
        case 'roll':
          if (busy) return false;
          if (state === 'roll') { buf = { name: 'roll', at: clock }; return true; }
          if (isAttack(state) && ph !== 'recovery') { buf = { name: 'roll', at: clock }; return true; }
          return startRoll();
      }
      return false;
    }

    function step(dt) {
      if (!(dt > 0)) return;
      clock += dt; t += dt;
      if (buf && clock - buf.at > C.bufferWindow) buf = null;
      // stamina regen
      if (regenDelay > 0) regenDelay = Math.max(0, regenDelay - dt);
      else if (state !== 'dead') {
        if (ext) { if (ext.regen) ext.regen(C.stamina.regen * dt); }
        else own = Math.min(C.stamina.max, own + C.stamina.regen * dt);
      }
      if (state === 'block') parryT += dt;
      var a = C.attacks[state];
      if (a) {
        if (!activeStarted && t >= a.startup) { activeStarted = true; activeOn = true; emit('active', { move: state, start: true }); }
        if (activeOn && t >= a.startup + a.active) { activeOn = false; emit('active', { move: state, end: true }); }
        var total = a.startup + a.active + a.recovery;
        if (t >= total) {
          var over = t - total, nxt = a.next;
          if (buf && buf.name === 'light' && nxt && clock - buf.at <= C.bufferWindow) {
            buf = null;
            if (spend(C.cost.light)) { enter(nxt, over); return; }
          }
          toFree(over);
        }
      } else if (state === 'roll') {
        if (t >= rollWin().dur) { var o2 = t - rollWin().dur; toFree(o2); }
      } else if (state === 'hitstun') {
        if (t >= hitstunDur) toFree(t - hitstunDur);
      }
    }

    function hit(info) {
      info = info || {};
      var dmg = Math.max(0, +info.dmg || 0), dir = info.dir || { x: 0, z: 0 }, kind = info.kind || 'melee', poise = clamp(+info.poise || 0, 0, 1);
      var zero = { x: 0, z: 0 };
      if (state === 'dead') return { applied: false, dmg: 0, stopMs: 0, knockback: zero, state: state };
      if (invulnerable() && !C.undodgeable.test(String(kind)))
        return { applied: false, dodged: true, dmg: 0, stopMs: 0, knockback: zero, state: state };
      if (state === 'block' && !C.undodgeable.test(String(kind))) {
        if (parryT < C.parryWindow) {
          emit('hit', { parried: true, dmg: 0, kind: kind });
          return { applied: false, parried: true, dmg: 0, stopMs: C.stop.min, knockback: zero, state: state };
        }
        var covered = drain(C.cost.blockHit);
        if (covered) {
          var bd = dmg * (1 - C.blockReduction);
          hp = Math.max(0, hp - bd);
          var res = { applied: true, blocked: true, dmg: bd, stopMs: stopFor(dmg), knockback: zero, state: state };
          emit('hit', { dmg: bd, kind: kind, blocked: true });
          if (hp <= 0) die();
          res.state = state; return res;
        }
        // guard break: falls through as an unblocked hit
      }
      hp = Math.max(0, hp - dmg);
      var n = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1, kbm = (C.knockback.base + dmg * C.knockback.perDmg) * (1 - poise * 0.5);
      var kb = { x: dir.x / n * kbm, z: dir.z / n * kbm };
      var stop = stopFor(dmg);
      emit('hit', { dmg: dmg, kind: kind, knockback: kb, stopMs: stop });
      if (hp <= 0) { die(); return { applied: true, dmg: dmg, stopMs: stop, knockback: kb, state: state }; }
      hitstunDur = clamp((C.hitstun.base + dmg * C.hitstun.perDmg) * (1 - poise * C.hitstun.poiseScale), C.hitstun.min, C.hitstun.max);
      buf = null; enter('hitstun');
      return { applied: true, dmg: dmg, stopMs: stop, knockback: kb, state: state };
    }
    function stopFor(dmg) { return clamp(C.stop.base + dmg * C.stop.perDmg, C.stop.min, C.stop.max); }
    function die() { buf = null; enter('dead'); emit('kill', { hp: 0 }); }

    function attackFor(s) {
      s = s || state;
      var a = C.attacks[s];
      if (a) return { move: s, dmg: a.dmg, clip: a.clip };
      return { move: s, dmg: 0, clip: C.clips[s] || null };
    }

    return {
      CFG: C, input: input, step: step, hit: hit, on: on, attackFor: attackFor,
      state: function () { return state; }, hp: function () { return hp; }, maxHp: function () { return maxHp; },
      stamina: getSta, phase: phase, invulnerable: invulnerable,
      isActive: function () { return activeOn; },
      timeInState: function () { return t; },
      snapshot: function () { return { state: state, t: t, hp: hp, stamina: getSta(), buffered: buf ? buf.name : null }; },
      rng: rng
    };
  }
  var api = { create: create, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldCombatCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
