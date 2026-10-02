'use strict';
const { hashOf } = require('./canon');
const { isSafeId, hasOwn } = require('./ids');

const ACADEMY_ECON = Object.freeze({
  teacher: 0.80, burn: 0.05, failTeacher: 0.5,
  houseAccount: 'house:academy', scholarshipAccount: 'house:scholarship'
});

function splitPrice(price, passed, econ = ACADEMY_ECON) {
  if (!passed) { const teacher = Math.floor(price * econ.failTeacher); return { teacher, burn: 0, house: price - teacher }; }
  const teacher = Math.floor(price * econ.teacher); const burn = Math.floor(price * econ.burn);
  return { teacher, burn, house: price - teacher - burn };
}

// getSkill(skillId) -> skill|null            price and teacher always come from the registry, never from the caller
// ownerOfAgent(agentId) -> ownerId|null      the payer must own the agent being enrolled
// teacherOwnerOf(skill) -> ownerId|null      null for house faculty
function createAcademyEconomy({ economy, store, econ = ACADEMY_ECON, getSkill, ownerOfAgent, teacherOwnerOf }) {
  if (typeof getSkill !== 'function' || typeof ownerOfAgent !== 'function' || typeof teacherOwnerOf !== 'function') {
    throw new Error('createAcademyEconomy needs getSkill, ownerOfAgent and teacherOwnerOf');
  }
  const load = () => store.read('enrollments', { items: {} });
  const get = (id) => { const d = load(); return isSafeId(id) && hasOwn(d.items, id) ? d.items[id] : null; };

  async function enroll({ ownerId, agentId, skillId, windowId }) {
    if (!isSafeId(ownerId) || !isSafeId(agentId) || !isSafeId(windowId)) return { ok: false, error: 'ownerId, agentId and windowId must be safe ids' };
    const skill = getSkill(skillId);
    if (!skill) return { ok: false, error: 'unknown or retired skill' };
    if (ownerOfAgent(agentId) !== ownerId) return { ok: false, error: 'that agent does not belong to you' };
    const price = skill.price_sparks;
    if (!Number.isInteger(price) || price < 0) return { ok: false, error: 'skill has an invalid price' };
    const id = 'enr_' + hashOf({ ownerId, agentId, skillId: skill.id, windowId }).slice(0, 16);
    const d = load();
    if (hasOwn(d.items, id)) return { ok: true, enrollment: d.items[id], replay: true };
    if (price > 0) {
      try { await economy.spend(ownerId, price, 'academy.tuition:' + skill.id, 'acad:enroll:' + id, { refId: id }); }
      catch (e) { return { ok: false, error: (e && e.message) || 'payment failed', insufficient: !!(e && e.constructor && e.constructor.name === 'InsufficientFundsError') }; }
    }
    const fresh = load();
    if (!hasOwn(fresh.items, id)) {
      fresh.items[id] = {
        id, ownerId, agentId, skillId: skill.id, price, status: 'paid', at: Date.now(),
        teacher: { type: skill.teacher.type, id: skill.teacher.id, ownerId: teacherOwnerOf(skill) || null }
      };
      store.write('enrollments', fresh);
    }
    return { ok: true, enrollment: fresh.items[id] };
  }

  async function settle({ enrollmentId, passed }) {
    const e = get(enrollmentId);
    if (!e) return { ok: false, error: 'unknown enrollment' };
    if (e.status === 'settled') return { ok: true, split: e.split, replay: true };
    const s = splitPrice(e.price, !!passed, econ);
    const selfDeal = e.teacher.type !== 'house' && !!e.teacher.ownerId && e.teacher.ownerId === e.ownerId;
    let teacherAccount;
    if (e.teacher.type === 'house') teacherAccount = econ.scholarshipAccount;
    else if (selfDeal || !e.teacher.ownerId) teacherAccount = econ.houseAccount;
    else teacherAccount = e.teacher.ownerId;
    if (s.teacher > 0) await economy.grant(teacherAccount, s.teacher, 'academy.teacher:' + e.skillId, 'acad:settle:' + e.id + ':teacher', { refId: e.id });
    if (s.house > 0) await economy.grant(econ.houseAccount, s.house, 'academy.house:' + e.skillId, 'acad:settle:' + e.id + ':house', { refId: e.id });
    const fresh = load();
    const cur = fresh.items[e.id];
    if (cur.status !== 'settled') {                 // first settle wins; a concurrent second call keeps the recorded split
      cur.status = 'settled';
      cur.split = Object.assign({}, s, { passed: !!passed, selfDeal, teacherAccount });
      store.write('enrollments', fresh);
    }
    return { ok: true, split: cur.split };
  }

  return { enroll, settle, get };
}

module.exports = { ACADEMY_ECON, splitPrice, createAcademyEconomy };
