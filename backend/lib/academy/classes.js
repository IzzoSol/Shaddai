'use strict';
const { hashOf, stripMarkup } = require('./canon');

const KINDS = ['open', 'scheduled', 'masterclass', 'bootcamp'];
const err = (error) => ({ ok: false, error });

function createClasses({ store, registry, roles }) {
  const load = () => store.read('classes', { items: {} });
  const get = (id) => load().items[id] || null;

  function create(by, spec) {
    if (!roles.can(by, 'class.create')) return err('not allowed to create classes');
    if (!spec || typeof spec !== 'object') return err('spec required');
    if (!KINDS.includes(spec.kind)) return err('kind must be one of ' + KINDS.join(','));
    if (!Array.isArray(spec.syllabus) || !spec.syllabus.length) return err('syllabus needs at least one skill');
    for (const s of spec.syllabus) if (!registry.get(s)) return err('unknown skill in syllabus: ' + s);
    if (spec.kind === 'scheduled' && !(spec.schedule && Number.isFinite(spec.schedule.start) && Number.isFinite(spec.schedule.end) && spec.schedule.end > spec.schedule.start)) return err('scheduled classes need schedule {start,end}');
    if (!spec.teacher || !spec.teacher.id) return err('teacher required');
    const name = stripMarkup(spec.name).slice(0, 80);
    if (!name) return err('name required');
    const capacity = Number.isInteger(spec.capacity) && spec.capacity > 0 ? spec.capacity : 30;
    const id = 'cls_' + hashOf({ name, by, t: Date.now(), n: Object.keys(load().items).length }).slice(0, 12);
    const cls = {
      id, name, track: spec.track || null, tier: spec.tier || null, kind: spec.kind, syllabus: spec.syllabus.slice(),
      teacher: { type: spec.teacher.type, id: String(spec.teacher.id) }, room: String(spec.room || ''), capacity,
      schedule: spec.kind === 'scheduled' ? { start: spec.schedule.start, end: spec.schedule.end } : null,
      scholarshipSeats: Number.isInteger(spec.scholarshipSeats) && spec.scholarshipSeats > 0 ? spec.scholarshipSeats : 0,
      createdBy: by, createdAt: Date.now(), members: {}
    };
    const d = load(); d.items[id] = cls; store.write('classes', d);
    return { ok: true, class: cls };
  }

  function seat(classId, agentId, scholarship) {
    const d = load(); const c = d.items[classId];
    if (!c) return err('unknown class');
    if (c.members[agentId]) return { ok: true, member: c.members[agentId] };
    if (Object.keys(c.members).length >= c.capacity) return err('class is full');
    c.members[agentId] = { agentId, scholarship: !!scholarship, passed: [], joinedAt: Date.now(), completed: false };
    store.write('classes', d);
    return { ok: true, member: c.members[agentId] };
  }

  const join = ({ classId, agentId }) => seat(classId, agentId, false);

  function grantScholarship({ by, classId, agentId }) {
    if (!roles.rolesOf(by).includes('admin')) return err('admin only');
    const c = get(classId);
    if (!c) return err('unknown class');
    const used = Object.values(c.members).filter((m) => m.scholarship).length;
    if (!c.members[agentId] && used >= c.scholarshipSeats) return err('no scholarship seats left');
    return seat(classId, agentId, true);
  }

  function recordPass({ classId, agentId, skillId }) {
    const d = load(); const c = d.items[classId];
    if (!c) return err('unknown class');
    const m = c.members[agentId];
    if (!m) return err('not a member');
    if (!c.syllabus.includes(skillId)) return err('skill not in syllabus');
    if (!m.passed.includes(skillId)) m.passed.push(skillId);
    const classComplete = c.syllabus.every((s) => m.passed.includes(s));
    const justCompleted = classComplete && !m.completed;
    if (classComplete) m.completed = true;
    store.write('classes', d);
    return { ok: true, classComplete, justCompleted };
  }

  const roster = (classId) => { const c = get(classId); return c ? Object.values(c.members) : []; };

  return { create, join, grantScholarship, recordPass, roster, get };
}

module.exports = { createClasses, KINDS };
