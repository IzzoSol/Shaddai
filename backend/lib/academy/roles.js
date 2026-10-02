'use strict';

const PERMS = {
  student: ['enroll'],
  teacher: ['skill.publish', 'class.create', 'review.write'],
  proctor: ['exam.proctor', 'review.spotcheck'],
  admin: ['*']
};
const ROLES = Object.keys(PERMS);

function createRoles({ store, adminIds, now = Date.now }) {
  const admins = new Set(adminIds || String(process.env.ACADEMY_ADMINS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const load = () => store.read('roles', { users: {} });

  function rolesOf(userId) {
    const out = new Set(['student']);
    if (admins.has(userId)) out.add('admin');
    for (const r of load().users[userId] || []) out.add(r);
    return Array.from(out);
  }
  function can(userId, action) {
    return rolesOf(userId).some((r) => PERMS[r].includes('*') || PERMS[r].includes(action));
  }
  function change(by, target, role, add) {
    if (!rolesOf(by).includes('admin')) return { ok: false, error: 'admin only' };
    if (!ROLES.includes(role) || role === 'student') return { ok: false, error: 'invalid role' };
    const d = load(); const cur = new Set(d.users[target] || []);
    if (add) cur.add(role); else cur.delete(role);
    d.users[target] = Array.from(cur); store.write('roles', d);
    store.append('audit', { at: now(), by, target, role, action: add ? 'grant' : 'revoke' });
    return { ok: true, roles: rolesOf(target) };
  }
  const grant = ({ by, target, role }) => change(by, target, role, true);
  const revoke = ({ by, target, role }) => change(by, target, role, false);
  const audit = (limit = 100) => store.readLines('audit').slice(-limit);

  return { rolesOf, can, grant, revoke, audit };
}

module.exports = { createRoles, ROLES, PERMS };
