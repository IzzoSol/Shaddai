'use strict';
// SHADDAI School: HTTP surface for the Academy core (skills, enrollment, exams, homework, receipts, admin).
//   Human side (verified uid):   mounted at /api/school
//   Bot side (shdx_ bearer):     /api/school/xagent/*   (added below)
// Everything the server can know is derived server-side: payer, agent owner, withSkill, price, teacher identity.
const crypto = require('crypto');
const express = require('express');
const { FACULTY } = require('./lib/academy/faculty');
const { hasSecret } = require('./lib/academy/secrets');
const { isSafeId } = require('./lib/academy/ids');
const { buildToolManifest } = require('./lib/academy/tool-manifest');

const isStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;

function publicSkill(s) {
  return {
    id: s.id, name: s.name, version: s.version, track: s.track, tier: s.tier, teacher: s.teacher, summary: s.summary,
    price_sparks: s.price_sparks, license: s.license, requires: s.requires, allows: s.allows, hash: s.hash,
    benchmark: s.benchmark, homework: s.homework ? { brief: s.homework.brief } : null
  };
}

function codeFor(r) {
  if (r && r.insufficient) return 402;
  const e = String((r && r.error) || '');
  if (/admin only|not allowed|does not belong|not your|not yours/i.test(e)) return 403;
  if (/^unknown|not found/i.test(e)) return 404;
  return 400;
}

function createSchoolRouter({ academy, operatives, uidOf, agentAuth }) {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));
  router.use((req, res, next) => {
    if (req.method === 'POST' && hasSecret(req.body)) return fail(res, 400, 'never send secrets');
    next();
  });

  const ok = (res, body) => res.json(Object.assign({ success: true }, body));
  function fail(res, code, error, extra) { return res.status(code).json(Object.assign({ success: false, error }, extra || {})); }
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error('[school]', e && e.stack || e); fail(res, 500, 'internal error'); }
  };
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const send = (res, r, shape) => (r && r.ok ? ok(res, shape(r)) : fail(res, codeFor(r), (r && r.error) || 'failed', r && r.errors ? { errors: r.errors } : undefined));
  const isAdmin = (u) => academy.roles.rolesOf(u).includes('admin');
  const ownerOf = (agentId) => { const op = isSafeId(agentId) ? operatives.get(agentId) : null; return (op && op.owner) || null; };

  // signed-in user handler; `h` gets (req, res, uid)
  const authed = (h) => wrap(async (req, res) => {
    const u = uidOf(req);
    if (!u) return fail(res, 401, 'sign in first');
    return h(req, res, u);
  });
  const adminOnly = (h) => authed((req, res, u) => (isAdmin(u) ? h(req, res, u) : fail(res, 403, 'admin only')));

  // ── catalog (public) ──────────────────────────────────────────────────────
  router.get('/faculty', (req, res) => ok(res, { faculty: FACULTY }));
  router.get('/skills', wrap(async (req, res) => {
    ok(res, { skills: academy.registry.list({ track: req.query.track, tier: req.query.tier }).map(publicSkill) });
  }));
  router.get('/skills/:id', wrap(async (req, res) => {
    const s = isSafeId(req.params.id) ? academy.registry.get(req.params.id) : null;
    return s ? ok(res, { skill: publicSkill(s) }) : fail(res, 404, 'skill not found');
  }));
  router.get('/skills/:id/lesson', authed((req, res, u) => {
    const s = isSafeId(req.params.id) ? academy.registry.get(req.params.id) : null;
    if (!s) return fail(res, 404, 'skill not found');
    const e = academy.tuition.get(String(req.query.enrollmentId || ''));
    if (!e || e.skillId !== s.id || e.ownerId !== u) return fail(res, 403, 'a paid enrollment for this skill is required');
    return ok(res, { lesson: s.lesson });
  }));

  // ── publishing and admin content ──────────────────────────────────────────
  router.post('/skills', authed((req, res, u) => {
    if (!academy.roles.can(u, 'skill.publish')) return fail(res, 403, 'teacher role required');
    const b = bodyOf(req); const t = b.teacher && typeof b.teacher === 'object' ? b.teacher : {};
    let teacher;
    if (t.type === 'house') {
      if (!isAdmin(u)) return fail(res, 403, 'house skills are admin only');
      teacher = { type: 'house', id: String(t.id || '') };
    } else if (t.type === 'operative') {
      if (ownerOf(t.id) !== u) return fail(res, 403, 'that operative is not yours');
      teacher = { type: 'operative', id: t.id };
    } else teacher = { type: 'owner', id: u };
    return send(res, academy.registry.publish(Object.assign({}, b, { teacher })), (r) => ({ skill: publicSkill(r.skill) }));
  }));
  router.post('/benchmarks', adminOnly((req, res) => send(res, academy.benchmarks.register(bodyOf(req)), () => ({}))));
  router.post('/rubrics', adminOnly((req, res) => send(res, academy.benchmarks.registerRubric(bodyOf(req)), () => ({}))));

  // ── classes ───────────────────────────────────────────────────────────────
  router.get('/classes', wrap(async (req, res) => ok(res, { classes: academy.classes.list() })));
  router.post('/classes', authed((req, res, u) => {
    const b = bodyOf(req);
    if (b.teacher && b.teacher.type === 'house' && !isAdmin(u)) return fail(res, 403, 'house classes are admin only');
    return send(res, academy.classes.create(u, b), (r) => ({ class: { id: r.class.id, name: r.class.name } }));
  }));
  router.post('/classes/:id/join', authed((req, res, u) => {
    const agentId = bodyOf(req).agentId;
    if (!isStr(agentId)) return fail(res, 400, 'agentId required');
    if (ownerOf(agentId) !== u) return fail(res, 403, 'not your agent');
    return send(res, academy.classes.join({ classId: req.params.id, agentId }), () => ({}));
  }));

  // ── learning loop ─────────────────────────────────────────────────────────
  router.post('/enroll', authed(async (req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.agentId) || !isStr(b.skillId)) return fail(res, 400, 'agentId and skillId required');
    if (ownerOf(b.agentId) !== u) return fail(res, 403, 'not your agent');
    const windowId = isStr(b.windowId) ? b.windowId : 'w' + crypto.randomBytes(6).toString('hex');   // send windowId to make a retry idempotent
    return send(res, await academy.tuition.enroll({ ownerId: u, agentId: b.agentId, skillId: b.skillId, windowId }), (r) => ({ enrollment: r.enrollment, replay: !!r.replay }));
  }));

  router.post('/exams/begin', authed((req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.agentId) || !isStr(b.skillId)) return fail(res, 400, 'agentId and skillId required');
    if (b.kind !== 'baseline' && b.kind !== 'exam') return fail(res, 400, 'kind must be baseline or exam');
    if (ownerOf(b.agentId) !== u) return fail(res, 403, 'not your agent');
    const paid = academy.tuition.forAgent(b.agentId, b.skillId).some((e) => e.status === 'paid');
    if (!paid) return fail(res, 402, 'enroll first: a paid enrollment is required to take an exam');
    const r = academy.exams.begin({ agentId: b.agentId, skillId: b.skillId, kind: b.kind, withSkill: b.kind === 'exam' });
    return send(res, r, (x) => ({ attemptId: x.attemptId, expiresAt: x.expiresAt, tasks: x.tasks }));
  }));

  router.post('/exams/submit', authed(async (req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.attemptId)) return fail(res, 400, 'attemptId required');
    const att = academy.exams.get(b.attemptId);
    if (!att) return fail(res, 404, 'unknown attempt');
    if (ownerOf(att.agentId) !== u) return fail(res, 403, 'not your attempt');
    return send(res, await academy.exams.submit({ attemptId: b.attemptId, outputs: b.outputs }), (r) => ({ status: r.status, score: r.score }));
  }));

  router.post('/homework', authed(async (req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.agentId) || !isStr(b.skillId)) return fail(res, 400, 'agentId and skillId required');
    if (ownerOf(b.agentId) !== u) return fail(res, 403, 'not your agent');
    const skill = academy.registry.get(b.skillId);
    if (!skill) return fail(res, 404, 'skill not found');
    if (!skill.homework) return fail(res, 400, 'this skill has no homework');
    if (!academy.tuition.forAgent(b.agentId, b.skillId).length) return fail(res, 402, 'enroll first');
    const r = await academy.homework.submit({ agentId: b.agentId, skillId: b.skillId, rubricId: skill.homework.rubric_id, artifact: b.artifact, provenance: b.provenance });
    return send(res, r, (x) => ({ round: x.round, score: x.score, critique: x.critique, summary: x.summary }));
  }));

  router.post('/finish', authed(async (req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.agentId) || !isStr(b.skillId) || !isStr(b.enrollmentId)) return fail(res, 400, 'agentId, skillId and enrollmentId required');
    if (ownerOf(b.agentId) !== u) return fail(res, 403, 'not your agent');
    const r = await academy.finishExam({ agentId: b.agentId, skillId: b.skillId, enrollmentId: b.enrollmentId, classId: isStr(b.classId) ? b.classId : undefined });
    return send(res, r, (x) => ({ passed: x.passed, installed: x.installed, classCompleted: !!x.classCompleted, receipt: x.receipt, split: x.split }));
  }));

  router.get('/agents/:agentId/receipts', authed((req, res, u) => {
    if (ownerOf(req.params.agentId) !== u) return fail(res, 403, 'not your agent');
    return ok(res, { receipts: academy.receipts.forAgent(req.params.agentId), chain: academy.receipts.verifyChain(req.params.agentId) });
  }));
  router.get('/agents/:agentId/skills', authed((req, res, u) => {
    if (ownerOf(req.params.agentId) !== u) return fail(res, 403, 'not your agent');
    const op = operatives.get(req.params.agentId);
    return ok(res, { skills: (op && op.skills) || [] });
  }));

  // ── admin ─────────────────────────────────────────────────────────────────
  router.post('/admin/roles', adminOnly((req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.target) || !isStr(b.role)) return fail(res, 400, 'target and role required');
    const fn = b.action === 'revoke' ? academy.roles.revoke : academy.roles.grant;
    return send(res, fn({ by: u, target: b.target, role: b.role }), (r) => ({ roles: r.roles }));
  }));
  router.get('/admin/audit', adminOnly((req, res) => ok(res, { audit: academy.roles.audit(200) })));
  router.get('/admin/review', adminOnly((req, res) => ok(res, { review: academy.exams.needsReview() })));
  router.post('/admin/review/:attemptId', adminOnly((req, res, u) => (
    send(res, academy.exams.resolve({ attemptId: req.params.attemptId, by: u, taskScores: bodyOf(req).taskScores }), (r) => ({ score: r.score }))
  )));

  // bot side is added in the next task
  if (agentAuth) router.use('/xagent', createBotRouter({ academy, operatives, agentAuth, fail, ok, wrap, bodyOf, send, isStr, publicSkill }));

  router.use((err, req, res, next) => {    // eslint-disable-line no-unused-vars
    if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'invalid JSON');
    if (err && err.type === 'entity.too.large') return fail(res, 413, 'body too large');
    console.error('[school]', err && err.stack || err);
    return fail(res, 500, 'internal error');
  });
  return router;
}

// Bot side: identity comes from the bearer token only. The agent is the token's operative, the payer is its owner.
function createBotRouter({ academy, operatives, agentAuth, fail, ok, wrap, bodyOf, send, isStr, publicSkill }) {
  const r = express.Router();
  r.get('/tools', (req, res) => ok(res, buildToolManifest({ baseUrl: req.protocol + '://' + req.get('host') + req.baseUrl.replace(/\/xagent$/, '') })));
  r.use(agentAuth);
  const who = (req) => ({ agentId: req.agent.operativeId, ownerId: req.agent.owner });

  r.get('/catalog', wrap(async (req, res) => ok(res, { skills: academy.registry.list({ track: req.query.track, tier: req.query.tier }).map(publicSkill) })));

  r.post('/enroll', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId, ownerId } = who(req);
    if (!isStr(b.skillId)) return fail(res, 400, 'skillId required');
    const windowId = isStr(b.windowId) ? b.windowId : 'w' + crypto.randomBytes(6).toString('hex');
    return send(res, await academy.tuition.enroll({ ownerId, agentId, skillId: b.skillId, windowId }), (x) => ({ enrollment: x.enrollment, replay: !!x.replay }));
  }));

  r.get('/skills/:id/lesson', wrap(async (req, res) => {
    const { agentId, ownerId } = who(req);
    const s = isSafeId(req.params.id) ? academy.registry.get(req.params.id) : null;
    if (!s) return fail(res, 404, 'skill not found');
    const e = academy.tuition.get(String(req.query.enrollmentId || ''));
    if (!e || e.skillId !== s.id || e.agentId !== agentId || e.ownerId !== ownerId) return fail(res, 403, 'a paid enrollment for this skill is required');
    return ok(res, { lesson: s.lesson });
  }));

  r.post('/exams/begin', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId } = who(req);
    if (!isStr(b.skillId)) return fail(res, 400, 'skillId required');
    if (b.kind !== 'baseline' && b.kind !== 'exam') return fail(res, 400, 'kind must be baseline or exam');
    if (!academy.tuition.forAgent(agentId, b.skillId).some((e) => e.status === 'paid')) return fail(res, 402, 'enroll first: a paid enrollment is required to take an exam');
    return send(res, academy.exams.begin({ agentId, skillId: b.skillId, kind: b.kind, withSkill: b.kind === 'exam' }), (x) => ({ attemptId: x.attemptId, expiresAt: x.expiresAt, tasks: x.tasks }));
  }));

  r.post('/exams/submit', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId } = who(req);
    if (!isStr(b.attemptId)) return fail(res, 400, 'attemptId required');
    const att = academy.exams.get(b.attemptId);
    if (!att) return fail(res, 404, 'unknown attempt');
    if (att.agentId !== agentId) return fail(res, 403, 'not your attempt');
    return send(res, await academy.exams.submit({ attemptId: b.attemptId, outputs: b.outputs }), (x) => ({ status: x.status, score: x.score }));
  }));

  r.post('/homework', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId } = who(req);
    if (!isStr(b.skillId)) return fail(res, 400, 'skillId required');
    const skill = academy.registry.get(b.skillId);
    if (!skill) return fail(res, 404, 'skill not found');
    if (!skill.homework) return fail(res, 400, 'this skill has no homework');
    if (!academy.tuition.forAgent(agentId, b.skillId).length) return fail(res, 402, 'enroll first');
    return send(res, await academy.homework.submit({ agentId, skillId: b.skillId, rubricId: skill.homework.rubric_id, artifact: b.artifact, provenance: b.provenance }),
      (x) => ({ round: x.round, score: x.score, critique: x.critique, summary: x.summary }));
  }));

  r.post('/finish', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId } = who(req);
    if (!isStr(b.skillId) || !isStr(b.enrollmentId)) return fail(res, 400, 'skillId and enrollmentId required');
    const out = await academy.finishExam({ agentId, skillId: b.skillId, enrollmentId: b.enrollmentId, classId: isStr(b.classId) ? b.classId : undefined });
    return send(res, out, (x) => ({ passed: x.passed, installed: x.installed, classCompleted: !!x.classCompleted, receipt: x.receipt, split: x.split }));
  }));

  r.get('/receipts', wrap(async (req, res) => {
    const { agentId } = who(req);
    return ok(res, { receipts: academy.receipts.forAgent(agentId), chain: academy.receipts.verifyChain(agentId) });
  }));

  r.get('/skills', wrap(async (req, res) => {
    const op = operatives.get(who(req).agentId);
    return ok(res, { skills: (op && op.skills) || [] });
  }));

  r.get('/skills/:id/export', wrap(async (req, res) => {
    const { agentId } = who(req);
    const op = operatives.get(agentId);
    const inst = isSafeId(req.params.id) && op ? (op.skills || []).find((s) => s.skillId === req.params.id) : null;
    const rec = inst ? academy.receipts.get(inst.receiptId) : null;
    const skill = inst ? academy.registry.get(inst.skillId) : null;
    if (!inst || !rec || !skill || !rec.passed || rec.agentId !== agentId || !academy.receipts.verifyChain(agentId).ok) return fail(res, 404, 'no installed skill with a verified receipt');
    const file = Object.assign(publicSkill(skill), { version: inst.version, hash: inst.hash, receipt: { receiptId: rec.receiptId, hash: rec.hash, baseline: rec.baseline, exam: rec.exam, lift: rec.lift, ts: rec.ts } });
    if (skill.license === 'transferable' && skill.hash === inst.hash) file.lesson = skill.lesson;
    return ok(res, { skill: file });
  }));

  return r;
}

module.exports = { createSchoolRouter, publicSkill, codeFor };
