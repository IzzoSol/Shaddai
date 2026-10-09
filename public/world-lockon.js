/* world-lockon.js — lock-on targeting for PvP/fights. Pure logic + optional DOM overlay. No THREE.
 *   var lk = WorldLockOn.create({ getPlayer()->{x,z,yaw}, getTargets()->[{id,name,x,y,z,hp,maxHp,alive}],
 *                                 project(x,y,z)->{x,y,on}, canLock()->bool, onChange?(target|null), doc? });
 *   lk.toggle() lock best / release      lk.cycle() next target      lk.release()
 *   lk.update(dt)                         auto-release + overlay + felled timer
 *   lk.yawAssist(currentYaw, dt) -> yaw DELTA (host ADDS it; never overwrite). Yaw convention: forward = (sin yaw, cos yaw).
 *   lk.felled(name, id?)                  gold "ENEMY FELLED" card, once per id, 1.6 s hold then fade
 *   lk.target() · lk.isLocked() · lk.state()
 * Lock acquire range 18 m, release hysteresis 20 m. Damping k=4. */
(function (root) {
  'use strict';
  var RANGE = 18, RELEASE = 20, K = 4, HOLD = 1.6, FADE = 0.4;
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function create(o) {
    o = o || {};
    var doc = o.doc || null, lockedId = null, lastTarget = null, clock = 0;
    var felledSeen = {}, card = null, cardT0 = -1, cardOp = -1;
    var plate = null, bar = null, nameEl = null, reticle = null;
    var cache = { px: null, py: null, op: -1, hp: -1, name: null, rx: null, ry: null, rop: -1 };

    function alive(t) { return t && t.alive !== false && !(t.hp <= 0); }
    function dist(p, t) { var dx = t.x - p.x, dz = t.z - p.z; return Math.sqrt(dx * dx + dz * dz); }
    function bearing(p, t) { return Math.atan2(t.x - p.x, t.z - p.z); }
    function find(id) {
      var a = o.getTargets ? o.getTargets() : [];
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    }
    function candidates(range) {
      var p = o.getPlayer(), a = o.getTargets() || [], out = [];
      for (var i = 0; i < a.length; i++) {
        var t = a[i]; if (!alive(t)) continue;
        var d = dist(p, t); if (d > range) continue;
        var ang = Math.abs(wrap(bearing(p, t) - p.yaw));
        out.push({ t: t, score: d + ang * 6, d: d }); // angle penalty: 1 rad ~ 6 m
      }
      out.sort(function (x, y) { return x.score - y.score; });
      return out;
    }
    function set(t) {
      var id = t ? t.id : null; if (id === lockedId) return;
      lockedId = id; lastTarget = t || null;
      if (o.onChange) o.onChange(t || null);
    }
    function allowed() { return !o.canLock || !!o.canLock(); }

    function toggle() {
      if (lockedId !== null) { set(null); return null; }
      if (!allowed()) return null;
      var c = candidates(RANGE); if (!c.length) return null;
      set(c[0].t); return c[0].t;
    }
    function cycle() {
      if (!allowed()) return null;
      var c = candidates(RANGE); if (!c.length) return null;
      if (lockedId === null) { set(c[0].t); return c[0].t; }
      c.sort(function (x, y) { return bearing(o.getPlayer(), x.t) - bearing(o.getPlayer(), y.t); });
      var i = 0; for (; i < c.length; i++) if (c[i].t.id === lockedId) break;
      var n = c[(i + 1) % c.length].t; set(n); return n;
    }
    function release() { set(null); }
    function target() { return lockedId === null ? null : (find(lockedId) || null); }

    function yawAssist(yaw, dt) {
      var t = target(); if (!t || !(dt > 0)) return 0;
      var diff = wrap(bearing(o.getPlayer(), t) - yaw);
      return diff * (1 - Math.exp(-K * dt));
    }

    // ---- DOM ----
    function mk(css) { var e = doc.createElement('div'); e.style.cssText = css; (doc.body || doc.documentElement).appendChild(e); return e; }
    function ensureDom() {
      if (!doc || plate) return;
      plate = mk('position:fixed;left:0;top:0;pointer-events:none;z-index:60;display:none;transform:translate(-50%,-100%);text-align:center;font:600 12px sans-serif;color:#fff;text-shadow:0 1px 2px #000');
      nameEl = doc.createElement('div'); plate.appendChild(nameEl);
      var track = doc.createElement('div'); track.style.cssText = 'width:84px;height:6px;background:#300;border:1px solid #000;margin:2px auto 0';
      bar = doc.createElement('div'); bar.style.cssText = 'height:100%;width:100%;background:#d33'; track.appendChild(bar); plate.appendChild(track);
      reticle = mk('position:fixed;left:0;top:0;pointer-events:none;z-index:59;display:none;width:34px;height:34px;margin:-17px 0 0 -17px;border:2px solid #e8c45c;border-radius:50%;box-shadow:0 0 8px #e8c45c');
      card = mk('position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;z-index:70;display:none;opacity:0;padding:10px 28px;font:700 28px serif;letter-spacing:6px;color:#e8c45c;border:1px solid #e8c45c;background:rgba(6,8,11,.7);text-shadow:0 0 12px #e8c45c');
      card.textContent = 'ENEMY FELLED';
    }
    function renderLock() {
      if (!doc) return;
      ensureDom();
      var t = target(), show = false;
      if (t && alive(t)) {
        var p = o.getPlayer();
        if (dist(p, t) <= RANGE && o.project) {
          var s = o.project(t.x, t.y, t.z);
          if (s && s.on) {
            show = true;
            var px = Math.round(s.x), py = Math.round(s.y);
            if (cache.op !== 1) { plate.style.display = 'block'; reticle.style.display = 'block'; cache.op = 1; }
            if (cache.px !== px || cache.py !== py) { plate.style.left = px + 'px'; plate.style.top = (py - 24) + 'px'; reticle.style.left = px + 'px'; reticle.style.top = py + 'px'; cache.px = px; cache.py = py; }
            var nm = t.name || '', pct = Math.max(0, Math.min(100, Math.round((t.hp / (t.maxHp || 1)) * 100)));
            if (cache.name !== nm) { nameEl.textContent = nm; cache.name = nm; }
            if (cache.hp !== pct) { bar.style.width = pct + '%'; cache.hp = pct; }
          }
        }
      }
      if (!show && cache.op !== 0) { plate.style.display = 'none'; reticle.style.display = 'none'; cache.op = 0; cache.px = cache.py = null; }
    }
    function renderCard() {
      if (!card || cardT0 < 0) return;
      var e = clock - cardT0, op;
      if (e < HOLD) op = 1; else if (e < HOLD + FADE) op = Math.round((1 - (e - HOLD) / FADE) * 20) / 20; else op = 0;
      if (op === cardOp) return;
      if (op > 0 && cardOp <= 0) card.style.display = 'block';
      card.style.opacity = String(op);
      if (op === 0) { card.style.display = 'none'; cardT0 = -1; }
      cardOp = op;
    }

    function update(dt) {
      if (dt > 0) clock += dt;
      if (lockedId !== null) {
        var t = find(lockedId);
        if (!t || !alive(t) || !allowed() || dist(o.getPlayer(), t) > RELEASE) set(null);
      }
      if (doc) { renderLock(); renderCard(); }
    }

    function felled(name, id) {
      var key = id !== undefined && id !== null ? String(id) : 'n:' + name;
      if (felledSeen[key]) return false;
      felledSeen[key] = 1;
      if (lockedId !== null && String(lockedId) === key) set(null);
      cardT0 = clock; cardOp = -1;
      if (doc) { ensureDom(); card.textContent = 'ENEMY FELLED'; renderCard(); }
      return true;
    }

    function state() {
      return { locked: lockedId !== null, id: lockedId, cardVisible: cardT0 >= 0 && clock - cardT0 < HOLD + FADE, cardOpacity: cardOp < 0 ? 0 : cardOp, clock: clock };
    }
    return {
      toggle: toggle, cycle: cycle, release: release, update: update, yawAssist: yawAssist, felled: felled,
      target: target, isLocked: function () { return lockedId !== null; }, state: state, RANGE: RANGE, RELEASE: RELEASE
    };
  }
  var api = { create: create, RANGE: RANGE, RELEASE: RELEASE, K: K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldLockOn = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
