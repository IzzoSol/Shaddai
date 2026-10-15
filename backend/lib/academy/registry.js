'use strict';
const { validateSkill } = require('./skill-schema');

function cmpVer(a, b) {
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function createRegistry(store) {
  const load = () => store.read('skills', { skills: {} });

  function publish(input) {
    const v = validateSkill(input);
    if (!v.ok) return { ok: false, errors: v.errors };
    const skill = v.skill;
    const db = load();
    const cur = db.skills[skill.id];
    if (cur) {
      if (cur.latest.teacher.id !== skill.teacher.id) return { ok: false, errors: ['only the original teacher can publish a new version'] };
      if (cmpVer(skill.version, cur.latest.version) <= 0) return { ok: false, errors: ['version must be greater than ' + cur.latest.version] };
    }
    const entry = cur || { id: skill.id, status: 'active', history: [] };
    entry.latest = skill;
    entry.status = 'active';
    entry.history.push({ version: skill.version, hash: skill.hash, at: Date.now() });
    db.skills[skill.id] = entry;
    store.write('skills', db);
    return { ok: true, skill };
  }

  function get(id) {
    const e = load().skills[id];
    return e && e.status === 'active' ? e.latest : null;
  }

  function list(f) {
    f = f || {};
    return Object.values(load().skills)
      .filter((e) => e.status === 'active')
      .map((e) => e.latest)
      .filter((s) => (!f.track || s.track === f.track) && (!f.tier || s.tier === f.tier));
  }

  function retire(id) {
    const db = load();
    if (!db.skills[id]) return false;
    db.skills[id].status = 'retired';
    store.write('skills', db);
    return true;
  }

  function history(id) { const e = load().skills[id]; return e ? e.history : []; }

  return { publish, get, list, retire, history };
}

module.exports = { createRegistry, cmpVer };
