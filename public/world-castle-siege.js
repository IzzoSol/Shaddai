/* world-castle-siege.js — CASTLE SIEGE DAY rules (pure, no DOM): the whole server storms the castle and fights all 5 dragons at once.
 *   Schedule:  WorldSiege.nextStart(nowMs, {dow, hourUTC}) · phase(nowMs, startMs) -> 'idle'|'announce'|'gather'|'live'|'ended'
 *   Battle:    var b = WorldSiege.create({ rng, now }); b.join(playerId, clanId?) · b.hit(playerId, dragonId, dmg) -> events · b.state() · b.results()
 *   Dragons:   ember, frost, storm, void, elder  (hp scales with how many fighters joined; elder needs the other four dead to become vulnerable)
 *   Credit:    every point of damage is credited to the player AND their clan. On a dragon's death, drops go to: the KILLING BLOW (rare), the TOP CLAN (cosmetic),
 *              the TOP PLAYER (item), and EVERYONE with >= 1 % of that dragon's damage (participation drop). Nothing is auto-sold: drops are items/cosmetics only.
 *   Rules:     joining forces FIGHT mode (no passive); the battle ends when all 5 are dead or after LIVE_MIN; late joiners can still hit but get a damage-weight of 1.
 */
(function (root) {
  'use strict';
  var DAY = 86400000, MIN = 60000, ANNOUNCE_H = 24, GATHER_MIN = 15, LIVE_MIN = 90, PART_PCT = 0.01;
  var DRAGONS = {
    ember: { name: 'Ember Wyrm', base: 4000, per: 60, drops: { kill: 'ember-heart', clan: 'cosmetic-ember-banner', top: 'scroll-fire-1', part: 'ember-scale' } },
    frost: { name: 'Frost Drake', base: 4000, per: 60, drops: { kill: 'frost-heart', clan: 'cosmetic-frost-banner', top: 'scroll-cold-1', part: 'frost-scale' } },
    storm: { name: 'Storm Serpent', base: 5000, per: 70, drops: { kill: 'storm-heart', clan: 'cosmetic-storm-banner', top: 'scroll-shock-1', part: 'storm-scale' } },
    void: { name: 'Void Leviathan', base: 6000, per: 80, drops: { kill: 'void-heart', clan: 'cosmetic-void-banner', top: 'scroll-void-1', part: 'void-dust' } },
    elder: { name: 'Elder Dragon', base: 12000, per: 150, needs: ['ember', 'frost', 'storm', 'void'], drops: { kill: 'elder-crown', clan: 'cosmetic-elder-banner', top: 'scroll-masterwork', part: 'elder-scale' } }
  };
  function nextStart(now, o) {
    o = o || {}; var dow = o.dow == null ? 6 : o.dow, hour = o.hourUTC == null ? 20 : o.hourUTC, d = new Date(now), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
    var add = (dow - d.getUTCDay() + 7) % 7; t += add * DAY; if (t + LIVE_MIN * MIN <= now) t += 7 * DAY; return t;
  }
  function phase(now, start) {
    if (now < start - ANNOUNCE_H * 3600000) return 'idle'; if (now < start - GATHER_MIN * MIN) return 'announce'; if (now < start) return 'gather';
    if (now < start + LIVE_MIN * MIN) return 'live'; return 'ended';
  }
  function create(o) {
    o = o || {}; var rng = o.rng || Math.random, fighters = {}, clans = {}, dragons = {}, order = Object.keys(DRAGONS), done = false, log = [];
    function scale() { return Math.max(1, Object.keys(fighters).length); }
    function hpFor(id) { var D = DRAGONS[id]; return Math.round(D.base + D.per * scale()); }
    order.forEach(function (id) { dragons[id] = { id: id, name: DRAGONS[id].name, hp: hpFor(id), max: hpFor(id), dead: false, dmg: {}, clanDmg: {}, total: 0 }; });
    function rescale() { order.forEach(function (id) { var d = dragons[id]; if (d.dead) return; var f = d.hp / d.max; d.max = hpFor(id); d.hp = Math.max(1, Math.round(d.max * f)); }); }
    function vulnerable(id) { var n = DRAGONS[id].needs; return !n || n.every(function (k) { return dragons[k].dead; }); }
    function join(pid, clan) { if (!fighters[pid]) { fighters[pid] = { id: pid, clan: clan || null, dmg: 0 }; if (clan) clans[clan] = clans[clan] || { id: clan, dmg: 0, members: 0 }; if (clan) clans[clan].members++; rescale(); } return { fightMode: true }; }
    function pickTop(map) { var best = null, bv = 0; for (var k in map) if (map[k] > bv) { bv = map[k]; best = k; } return best; }
    function onDeath(d, killer) {
      d.dead = true; var D = DRAGONS[d.id].drops, drops = [], topP = pickTop(d.dmg), topC = pickTop(d.clanDmg);
      drops.push({ to: killer, item: D.kill, why: 'killing blow' });
      if (topC) Object.keys(fighters).forEach(function (pid) { if (fighters[pid].clan === topC) drops.push({ to: pid, item: D.clan, why: 'top clan' }); });
      if (topP) drops.push({ to: topP, item: D.top, why: 'top damage' });
      Object.keys(d.dmg).forEach(function (pid) { if (d.dmg[pid] / d.total >= PART_PCT) drops.push({ to: pid, item: D.part, why: 'participation' }); });
      log.push({ type: 'dragon-down', dragon: d.id, drops: drops }); return { type: 'dragon-down', dragon: d.id, killer: killer, topPlayer: topP, topClan: topC, drops: drops };
    }
    function hit(pid, did, dmg) {
      var f = fighters[pid], d = dragons[did], ev = [];
      if (done || !f || !d || d.dead || !(dmg > 0)) return ev; if (!vulnerable(did)) return [{ type: 'shielded', dragon: did, needs: DRAGONS[did].needs }];
      var real = Math.min(dmg, d.hp); d.hp -= real; d.total += real; d.dmg[pid] = (d.dmg[pid] || 0) + real; f.dmg += real; if (f.clan) { d.clanDmg[f.clan] = (d.clanDmg[f.clan] || 0) + real; clans[f.clan].dmg += real; }
      ev.push({ type: 'hit', dragon: did, dmg: real, hp: d.hp });
      if (d.hp <= 0) { ev.push(onDeath(d, pid)); if (order.every(function (k) { return dragons[k].dead; })) { done = true; ev.push({ type: 'victory' }); } }
      return ev;
    }
    function results() { return { done: done, dragons: order.map(function (k) { var d = dragons[k]; return { id: k, name: d.name, dead: d.dead, hp: d.hp, max: d.max }; }), topPlayers: Object.keys(fighters).map(function (k) { return fighters[k]; }).sort(function (a, b) { return b.dmg - a.dmg; }).slice(0, 10), topClans: Object.keys(clans).map(function (k) { return clans[k]; }).sort(function (a, b) { return b.dmg - a.dmg; }).slice(0, 5) }; }
    return { join: join, hit: hit, state: function () { return { fighters: Object.keys(fighters).length, dragons: dragons, done: done }; }, results: results, end: function () { done = true; }, vulnerable: vulnerable };
  }
  root.WorldCastleSiege = { DRAGONS: DRAGONS, nextStart: nextStart, phase: phase, create: create, LIVE_MIN: LIVE_MIN, GATHER_MIN: GATHER_MIN, ANNOUNCE_H: ANNOUNCE_H };
})(typeof window !== 'undefined' ? window : globalThis);
