/* world-bots.js — AGENT BOTS: roster of 10 (5 humanoid + 5 wheeled), ownership, rules, follower AI, code-built bodies.
 *
 *   WorldBots.ROSTER          10 bot definitions (kind 'humanoid'|'wheeled', how to earn, base stats, art ref)
 *   WorldBots.state()         { owned:[{id, bodyState:'active'|'stowed'|'destroyed', follow:'follow'|'stay', skills:[], storage:[], hoverboard:bool, hp}], active, picked }
 *   WorldBots.STARTERS        the two bots available at the start; you choose ONE (WorldBots.pickStarter(id)); the other 8 are EARNED (unlock(id, reason))
 *   WorldBots.call(id, zone)  wheeled: only in a 'city' zone; humanoid: any zone except a fight instance. Returns {ok, why}
 *   WorldBots.canAttackBot(attackerOwner, botOwner, zone, challenges) -> false unless zone === 'void' OR an ACCEPTED challenge exists (rule from the owner)
 *   WorldBots.damage(id, n) / rebuild(id, sparksSpend)   destroyed alone -> body lost, SKILL FILES stay on the record (they live in your Navi)
 *   WorldBots.spawnBodies(THREE, scene, heightAt) + WorldBots.update(dt, playerPos, zone)   follower AI: humanoids trail you (lag), wheeled stay in the city
 *   Persistence: localStorage shd_bots_v1. Pure rules run without THREE (see tools/tests/world-bots.test.cjs).
 * Art: 'scrap' and 'lanky' humanoids + 'unicycle' wheel-bot are built from the owner's refs (code-built, placeholder fidelity); the other 7 use tinted
 *   variants until owner refs are approved (no fal spend without approval).
 */
(function (root) {
  'use strict';
  var KEY = 'shd_bots_v1';
  var TUNE = { followMinM: 3, followMaxM: 8, followSpeedK: 0.9, baseStorage: 4, storagePerSkill: 4, rebuildSparks: 250, humanoidHp: 120, wheeledHp: 90, hoverSpeedK: 1.1 };
  var ROSTER = [
    { id: 'scrap',    kind: 'humanoid', name: 'SCRAP',    ref: 'e748c454', earn: 'starter',              style: { body: 0xd9772a, head: 0x4a5566, eye: 0xffc933, accent: 0xd4504a }, blurb: 'Box-head scrapper. Tough, loud, loyal.' },
    { id: 'lanky',    kind: 'humanoid', name: 'LANKY',    ref: '92815f70', earn: 'academy:class-3',      style: { body: 0xd8cfb8, head: 0xe0d6bd, eye: 0xffd35a, accent: 0xd4504a }, blurb: 'Tall and quiet. Long reach, red sneakers.' },
    { id: 'tinker',   kind: 'humanoid', name: 'TINKER',   ref: null,       earn: 'forge:10-crafts',      style: { body: 0x6f8f9a, head: 0x3a4a52, eye: 0x7dffd8, accent: 0xe8c45c }, blurb: 'Carries the toolbox. Extra storage.' },
    { id: 'warden',   kind: 'humanoid', name: 'WARDEN',   ref: null,       earn: 'colosseum:5-wins',     style: { body: 0x5a6a7a, head: 0x2a3138, eye: 0xff5a4a, accent: 0xc0c8d0 }, blurb: 'Guard frame. Built to fight beside you.' },
    { id: 'drifter',  kind: 'humanoid', name: 'DRIFTER',  ref: null,       earn: 'wilds:3-dragons',      style: { body: 0x8a6a4a, head: 0x3a3028, eye: 0x9dff6a, accent: 0x5fa8ff }, blurb: 'Trail-worn scout. Rides its own board.' },
    { id: 'unicycle', kind: 'wheeled',  name: 'UNI-9',    ref: 'fc6ed6df', earn: 'starter',              style: { body: 0xf08a1c, head: 0xf08a1c, eye: 0x33d6ff, accent: 0xd4302a }, blurb: 'Single-wheel courier. City only.' },
    { id: 'porter',   kind: 'wheeled',  name: 'PORTER',   ref: null,       earn: 'farm:100-harvests',    style: { body: 0x7a9a4a, head: 0x4a6a2a, eye: 0xffe07a, accent: 0xd8c8a0 }, blurb: 'Hauler. Moves crates between stall and home.' },
    { id: 'clerk',    kind: 'wheeled',  name: 'CLERK',    ref: null,       earn: 'shop:50-sales',        style: { body: 0x3a6ea5, head: 0x2a4a75, eye: 0xffffff, accent: 0xe8c45c }, blurb: 'Runs your counter (Catalog B shop skills).' },
    { id: 'analyst',  kind: 'wheeled',  name: 'ANALYST',  ref: null,       earn: 'zerox:30-paper-days',  style: { body: 0x5a3a8a, head: 0x3a2560, eye: 0xc770ff, accent: 0x66f0ff }, blurb: 'Desk bot. Paper trading and signal calls.' },
    { id: 'herald',   kind: 'wheeled',  name: 'HERALD',   ref: null,       earn: 'hoverskate:forum-pass', style: { body: 0xb04a6a, head: 0x702a45, eye: 0xffd0e0, accent: 0xffffff }, blurb: 'Event caller: races, brackets, news.' }
  ];
  var byId = {}; ROSTER.forEach(function (b) { byId[b.id] = b; });
  var STARTERS = ['scrap', 'unicycle'];

  var S = load();
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.owned) return j; } catch (e) { } return { owned: [], active: null, picked: false, challenges: [] }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function rec(id) { return S.owned.filter(function (o) { return o.id === id; })[0] || null; }
  var listeners = []; function emit(ev, d) { listeners.forEach(function (f) { try { f(ev, d); } catch (e) { } }); }

  function grant(id, reason) {
    var def = byId[id]; if (!def) return { ok: false, why: 'unknown bot' }; if (rec(id)) return { ok: false, why: 'already owned' };
    var r = { id: id, bodyState: 'stowed', follow: 'follow', skills: [], storage: [], hoverboard: false, hp: def.kind === 'humanoid' ? TUNE.humanoidHp : TUNE.wheeledHp, earned: reason || 'grant', at: Date.now() };
    S.owned.push(r); if (!S.active) S.active = id; save(); emit('unlock', r); return { ok: true, bot: r };
  }
  function pickStarter(id) {
    if (S.picked) return { ok: false, why: 'starter already chosen' }; if (STARTERS.indexOf(id) < 0) return { ok: false, why: 'not a starter' };
    var g = grant(id, 'starter'); if (g.ok) { S.picked = true; save(); } return g;
  }
  function unlock(id, reason) { var def = byId[id]; if (!def || def.earn === 'starter') return { ok: false, why: 'starters are picked, not earned' }; return grant(id, reason || def.earn); }
  function storageCap(id) { var r = rec(id); return r ? TUNE.baseStorage + TUNE.storagePerSkill * r.skills.filter(function (s) { return /carry|pack|haul|storage/i.test(s); }).length : 0; }
  function addSkill(id, skill) { var r = rec(id); if (!r) return false; if (r.skills.indexOf(skill) < 0) r.skills.push(skill); save(); emit('skill', { id: id, skill: skill }); return true; }
  function stow(id, item) { var r = rec(id), def = r && byId[id]; if (!r || def.kind !== 'humanoid') return { ok: false, why: 'only humanoids carry items' }; if (r.storage.length >= storageCap(id)) return { ok: false, why: 'storage full' }; r.storage.push(item); save(); return { ok: true }; }

  // zone: 'city' | 'wilderness' | 'void' | 'fight' | 'interior'
  function call(id, zone) {
    var r = rec(id), def = byId[id]; if (!r) return { ok: false, why: 'not owned' };
    if (r.bodyState === 'destroyed') return { ok: false, why: 'body destroyed — rebuild it' };
    if (zone === 'fight') return { ok: false, why: 'bots cannot enter fights (Colosseum kits are set in the Navi)' };
    if (def.kind === 'wheeled' && zone !== 'city' && zone !== 'interior') return { ok: false, why: 'wheeled bots stay in the cities — talk to them in the Navi' };
    r.bodyState = 'active'; S.active = id; save(); emit('call', { id: id, zone: zone }); return { ok: true };
  }
  function dismiss(id) { var r = rec(id); if (!r) return false; if (r.bodyState === 'active') r.bodyState = 'stowed'; save(); return true; }
  function canAttackBot(attackerOwner, botOwner, zone, challenges) {
    if (attackerOwner === botOwner) return false;
    if (zone === 'void') return true;   // "the void: anything goes"
    return (challenges || S.challenges || []).some(function (c) { return c.accepted && ((c.from === attackerOwner && c.to === botOwner) || (c.from === botOwner && c.to === attackerOwner)); });
  }
  function damage(id, n, alone) {
    var r = rec(id); if (!r || r.bodyState === 'destroyed') return null; r.hp = Math.max(0, r.hp - n);
    if (r.hp <= 0) { r.bodyState = 'destroyed'; if (S.active === id) S.active = null; emit('destroyed', { id: id, alone: !!alone }); }   // skills[] + storage keep on the record: the skill FILES live in the Navi
    save(); return r;
  }
  function rebuild(id, spend) {
    var r = rec(id); if (!r || r.bodyState !== 'destroyed') return { ok: false, why: 'body is fine' };
    if (spend && !spend(TUNE.rebuildSparks)) return { ok: false, why: 'need ' + TUNE.rebuildSparks + ' Sparks for a new body' };
    r.bodyState = 'stowed'; r.hp = byId[id].kind === 'humanoid' ? TUNE.humanoidHp : TUNE.wheeledHp; save(); emit('rebuilt', { id: id }); return { ok: true };
  }
  function setFollow(id, mode) { var r = rec(id); if (!r) return false; r.follow = mode === 'stay' ? 'stay' : 'follow'; save(); return true; }
  function setHoverboard(id, on) { var r = rec(id); if (!r || byId[id].kind !== 'humanoid') return false; r.hoverboard = !!on; save(); return true; }
  function challenge(from, to) { var c = { from: from, to: to, accepted: false, at: Date.now() }; S.challenges.push(c); save(); return c; }
  function accept(from, to) { var c = S.challenges.filter(function (x) { return x.from === from && x.to === to; })[0]; if (c) { c.accepted = true; save(); } return !!c; }

  /* ── follower AI + bodies (needs THREE) ── */
  var bodies = {}, sim = {}, ctx = null;
  var BODY = { scrap: 'scrap', lanky: 'lanky', tinker: 'scrap', warden: 'lanky', drifter: 'scrap', unicycle: 'unicycle', porter: 'unicycle', clerk: 'analyst', analyst: 'analyst', herald: 'analyst' };   // roster id -> rigged body (world-bot-bodies.js); variants recolour via def.style
  function mk(THREE, def) {
    if (root.WorldBotBodies) { var bb = root.WorldBotBodies.build(THREE, BODY[def.id] || (def.kind === 'humanoid' ? 'scrap' : 'unicycle'), def.style); bb.root.userData.parts = {}; bb.root.userData.bot = bb; return bb.root; }
    var g = new THREE.Group(), st = def.style, M = function (c, e) { return new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 }); };
    var body = M(st.body), head = M(st.head), eye = M(0x111111, st.eye), acc = M(st.accent), dark = M(0x2a2f36);
    function add(geo, m, x, y, z, rx, ry, rz) { var o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0); g.add(o); return o; }
    var B = THREE.BoxGeometry, C = THREE.CylinderGeometry, parts = {};
    if (def.kind === 'humanoid') {
      var tall = def.id === 'lanky' ? 1.25 : 1.0;
      parts.torso = add(new C(0.32, 0.26, 0.55 * tall, 10), body, 0, 1.05 * tall, 0);
      parts.head = add(new B(0.34, 0.28, 0.3), head, 0, 1.55 * tall, 0);
      add(new THREE.SphereGeometry(0.05, 6, 6), eye, -0.09, 1.57 * tall, 0.16); add(new THREE.SphereGeometry(0.05, 6, 6), eye, 0.09, 1.57 * tall, 0.16);
      add(new C(0.015, 0.015, 0.3, 4), dark, -0.14, 1.78 * tall, 0, 0, 0, 0.25); add(new C(0.015, 0.015, 0.3, 4), dark, 0.14, 1.78 * tall, 0, 0, 0, -0.25);
      parts.armL = add(new B(0.11, 0.55 * tall, 0.11), acc, -0.42, 1.05 * tall, 0); parts.armR = add(new B(0.11, 0.55 * tall, 0.11), acc, 0.42, 1.05 * tall, 0);
      parts.legL = add(new B(0.13, 0.62 * tall, 0.13), dark, -0.14, 0.4 * tall, 0); parts.legR = add(new B(0.13, 0.62 * tall, 0.13), dark, 0.14, 0.4 * tall, 0);
      add(new B(0.17, 0.09, 0.26), acc, -0.14, 0.05, 0.05); add(new B(0.17, 0.09, 0.26), acc, 0.14, 0.05, 0.05);
    } else {
      parts.wheel = add(new C(0.42, 0.42, 0.2, 16), dark, 0, 0.42, 0, 0, 0, Math.PI / 2); add(new C(0.26, 0.26, 0.24, 12), acc, 0, 0.42, 0, 0, 0, Math.PI / 2);
      parts.torso = add(new C(0.3, 0.24, 0.6, 10), body, 0, 1.0, 0); parts.head = add(new THREE.SphereGeometry(0.22, 10, 8), head, 0, 1.45, 0);
      add(new THREE.SphereGeometry(0.09, 8, 6), eye, 0, 1.47, 0.16);
      parts.armL = add(new B(0.1, 0.5, 0.1), acc, -0.4, 1.0, 0.05); parts.armR = add(new B(0.1, 0.5, 0.1), acc, 0.4, 1.0, 0.05);
    }
    g.userData.parts = parts; g.userData.def = def; return g;
  }
  // Rigged Meshy/procedural GLBs (public/assets/bots/*.glb, meshopt): loaded lazily; the code-built body shows until (and if) the file arrives. Companions are SMALLER than the player.
  var BOT_GLB = { scrap: '/assets/bots/scrap.glb', lanky: '/assets/bots/lanky.glb', unicycle: '/assets/bots/uni9.glb', analyst: '/assets/bots/analyst.glb' }, BOT_H = { humanoid: 1.35, wheeled: 1.15 }, glbFail = {};
  function pickClip(anims, re) { for (var i = 0; i < anims.length; i++) if (re.test(anims[i].name)) return anims[i]; return null; }
  function upgradeToGlb(id) {
    var url = BOT_GLB[BODY[id]], def = byId[id]; if (!url || !ctx || !ctx.loader || glbFail[url]) return;
    ctx.loader.load(url, function (g) {
      var old = bodies[id]; if (!old) return; var THREE = ctx.THREE, src = g.scene, inst = ctx.clone ? ctx.clone(src) : src.clone(true), U = 3.889;
      var box = new THREE.Box3().setFromObject(inst), h = Math.max(0.01, box.max.y - box.min.y), k = U * BOT_H[def.kind] / h; inst.scale.multiplyScalar(k); inst.updateMatrixWorld(true);
      var b2 = new THREE.Box3().setFromObject(inst); inst.position.y -= b2.min.y; var wrap = new THREE.Group(); wrap.add(inst); wrap.userData.glb = true;
      var idle = pickClip(g.animations, /idle|stand|breath/i) || g.animations[0], walk = pickClip(g.animations, /walk|roll|drive|move/i) || idle, run = pickClip(g.animations, /run|sprint/i) || walk;
      ctx.scene.remove(old); ctx.scene.add(wrap); bodies[id] = wrap; var sm = sim[id]; if (sm) { sm.mixer = new THREE.AnimationMixer(inst); sm.bot = { clips: { idle: idle, walk: walk, run: run } }; sm.clip = null; sm.act = null; }
    }, undefined, function () { glbFail[url] = true; });
  }
  function spawnBodies(THREE, scene, heightAt, opts) { ctx = { THREE: THREE, scene: scene, heightAt: heightAt || function () { return 0; }, loader: opts && opts.loader, clone: opts && opts.cloneSkinned }; syncBodies(); return bodies; }
  function syncBodies() {
    if (!ctx) return;
    S.owned.forEach(function (r) {
      var want = r.bodyState === 'active';
      if (want && !bodies[r.id]) { var m = mk(ctx.THREE, byId[r.id]); m.scale.setScalar(m.userData.bot ? 3.889 * BOT_H[byId[r.id].kind] / Math.max(0.5, m.userData.bot.height) : 3.889); ctx.scene.add(m); upgradeToGlb(r.id); bodies[r.id] = m; sim[r.id] = { x: null, z: null, yaw: 0, ph: 0, v: 0 }; if (m.userData.bot) { sim[r.id].mixer = new ctx.THREE.AnimationMixer(m); sim[r.id].bot = m.userData.bot; } }
      if (!want && bodies[r.id]) { ctx.scene.remove(bodies[r.id]); delete bodies[r.id]; delete sim[r.id]; }
    });
  }
  var PL = { x: 0, z: 0, px: null, pz: null };
  function update(dt, playerPos, zone) {
    if (!ctx) return;
    S.owned.forEach(function (r) { if (r.bodyState === 'active' && byId[r.id].kind === 'wheeled' && zone && zone !== 'city' && zone !== 'interior') { r.bodyState = 'stowed'; save(); emit('recalled', { id: r.id, zone: zone }); } });   // wheeled bots never leave the cities
    syncBodies(); if (!playerPos) return;
    var U = 3.889, pv = PL.px == null ? 0 : Math.hypot(playerPos.x - PL.px, playerPos.z - PL.pz) / Math.max(dt, 1e-3) / U; PL.px = playerPos.x; PL.pz = playerPos.z;
    Object.keys(bodies).forEach(function (id) {
      var r = rec(id), m = bodies[id], s = sim[id], def = byId[id]; if (!r || !m) return;
      if (s.x == null) { s.x = playerPos.x - 2 * U; s.z = playerPos.z - 2 * U; }
      var dx = playerPos.x - s.x, dz = playerPos.z - s.z, d = Math.hypot(dx, dz) / U, moving = false;
      if (r.follow === 'follow' && (def.kind === 'humanoid' || zone === 'city')) {
        var want = TUNE.followMinM; if (d > want) { var sp = Math.max(4, pv * TUNE.followSpeedK) * (r.hoverboard ? TUNE.hoverSpeedK : 1) + Math.max(0, d - TUNE.followMaxM) * 1.5;   // lags: never faster than ~90% of you until it falls far behind
          var k = Math.min(d - want, sp * dt) / (d || 1); s.x += dx * k; s.z += dz * k; moving = true; s.yaw += (Math.atan2(dx, dz) - s.yaw) * Math.min(1, dt * 8); }
        else s.yaw += (Math.atan2(dx, dz) - s.yaw) * Math.min(1, dt * 3);
      }
      s.ph += dt * (moving ? 9 : 0); var y = ctx.heightAt(s.x, s.z);
      m.position.set(s.x, y + (r.hoverboard ? 0.35 * U : 0), s.z); m.rotation.y = s.yaw;
      if (s.mixer) {   // real rig: crossfade idle <-> walk clips
        var want = moving ? 'walk' : 'idle'; if (s.clip !== want) { var a = s.mixer.clipAction(s.bot.clips[want] || s.bot.clips.idle); if (s.act) s.act.fadeOut(0.25); a.reset().fadeIn(0.25).play(); s.act = a; s.clip = want; } s.mixer.update(dt); return;
      }
      var P = m.userData.parts, sw = moving ? Math.sin(s.ph) * 0.7 : 0;
      if (P.legL) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; } if (P.armL) { P.armL.rotation.x = -sw * 0.8; P.armR.rotation.x = sw * 0.8; } if (P.wheel) P.wheel.rotation.x += moving ? dt * 6 : 0;
    });
  }
  root.WorldBots = { ROSTER: ROSTER, TUNE: TUNE, STARTERS: STARTERS, def: function (id) { return byId[id]; }, state: function () { return S; }, rec: rec, pickStarter: pickStarter, unlock: unlock, grant: grant, call: call, dismiss: dismiss,
    canAttackBot: canAttackBot, damage: damage, rebuild: rebuild, setFollow: setFollow, setHoverboard: setHoverboard, addSkill: addSkill, stow: stow, storageCap: storageCap, challenge: challenge, accept: accept,
    spawnBodies: spawnBodies, update: update, _sim: function () { return sim; }, on: function (f) { listeners.push(f); }, _reset: function () { S = { owned: [], active: null, picked: false, challenges: [] }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
