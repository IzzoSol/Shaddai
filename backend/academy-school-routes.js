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
  if (/admin only|not allowed|does not belong|not your|not yours|role required|do not own/i.test(e)) return 403;
  if (/^unknown|not found/i.test(e)) return 404;
  return 400;
}

function createSchoolRouter({ academy, operatives, uidOf, agentAuth, runner }) {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));
  // Body checks run AFTER authentication so anonymous callers never trigger any scanning work.
  const badBody = (req) => {
    if (req.method !== 'POST') return null;
    let size = 0; try { size = JSON.stringify(req.body || {}).length; } catch (_) { return [400, 'invalid body']; }
    if (size > 256 * 1024) return [413, 'body too large'];
    if (hasSecret(req.body)) return [400, 'never send secrets'];
    return null;
  };

  const ok = (res, body) => res.json(Object.assign({ success: true }, body));
  function fail(res, code, error, extra) { return res.status(code).json(Object.assign({ success: false, error }, extra || {})); }
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error('[school]', e && e.stack || e); fail(res, 500, 'internal error'); }
  };
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const send = (res, r, shape) => (r && r.ok ? ok(res, shape(r)) : fail(res, codeFor(r), (r && r.error) || 'failed', r && r.errors ? { errors: r.errors } : undefined));
  const isAdmin = (u) => academy.roles.rolesOf(u).includes('admin');
  const ownerOf = (agentId) => { const op = isSafeId(agentId) ? operatives.get(agentId) : null; return (op && op.owner) || null; };

  // Prerequisites: every skill in `requires` must already be installed on the agent.
  const missingPrereqs = (agentId, skillId) => academy.missingPrereqs(agentId, skillId);

  // An enrollment is "open" until an exam attempt has used it; repeat enroll calls return it instead of charging again.
  const openEnrollment = (agentId, skillId) => academy.tuition.forAgent(agentId, skillId).find((e) => e.status === 'paid' && !academy.exams.enrollmentKinds(e.id).includes('exam')) || null;
  const pickEnrollment = (agentId, skillId, kind) => academy.tuition.forAgent(agentId, skillId).find((e) => e.status === 'paid' && !academy.exams.enrollmentKinds(e.id).includes(kind)) || null;

  // signed-in user handler; `h` gets (req, res, uid)
  const authed = (h) => wrap(async (req, res) => {
    const u = uidOf(req);
    if (!u) return fail(res, 401, 'sign in first');
    const bad = badBody(req);
    if (bad) return fail(res, bad[0], bad[1]);
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
    const b = bodyOf(req); const t = b.teacher && typeof b.teacher === 'object' ? b.teacher : {};
    if (!isAdmin(u)) {
      const mine = (t.type === 'owner' && t.id === u) || (t.type === 'operative' && ownerOf(t.id) === u);
      if (!mine) return fail(res, 403, 'you can only teach as yourself or as your own operative');
    }
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
    const missing = missingPrereqs(b.agentId, b.skillId);
    if (missing.length) return fail(res, 400, 'requires skills you do not have yet: ' + missing.join(', '));
    if (!isStr(b.windowId)) {
      const open = openEnrollment(b.agentId, b.skillId);
      if (open) return ok(res, { enrollment: open, replay: true });
    }
    const windowId = isStr(b.windowId) ? b.windowId : 'w' + crypto.randomBytes(6).toString('hex');
    return send(res, await academy.tuition.enroll({ ownerId: u, agentId: b.agentId, skillId: b.skillId, windowId }), (r) => ({ enrollment: r.enrollment, replay: !!r.replay }));
  }));

  router.post('/exams/begin', authed((req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.agentId) || !isStr(b.skillId)) return fail(res, 400, 'agentId and skillId required');
    if (b.kind !== 'baseline' && b.kind !== 'exam') return fail(res, 400, 'kind must be baseline or exam');
    if (ownerOf(b.agentId) !== u) return fail(res, 403, 'not your agent');
    const enr = pickEnrollment(b.agentId, b.skillId, b.kind);
    if (!enr) return fail(res, 402, 'enroll first: each paid enrollment covers one baseline and one exam');
    const r = academy.exams.begin({ agentId: b.agentId, skillId: b.skillId, kind: b.kind, withSkill: b.kind === 'exam', enrollmentId: enr.id });
    return send(res, r, (x) => ({ attemptId: x.attemptId, enrollmentId: enr.id, expiresAt: x.expiresAt, tasks: x.tasks }));
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

  // Run the whole learning loop for one of the owner's own agents (their brain takes the baseline and the exam).
  const learning = new Set();                       // in-flight agent+skill pairs: a double click must not run it twice
  router.post('/agents/:agentId/learn', authed(async (req, res, u) => {
    if (ownerOf(req.params.agentId) !== u) return fail(res, 403, 'not your agent');
    const b = bodyOf(req);
    if (!isStr(b.skillId)) return fail(res, 400, 'skillId required');
    if (!runner) return fail(res, 503, 'the agent runner is not configured on this server');
    const key = req.params.agentId + '|' + b.skillId;
    if (learning.has(key)) return fail(res, 409, 'this agent is already learning that skill');
    learning.add(key);
    try {
      const r = await runner.learn({ ownerId: u, agentId: req.params.agentId, skillId: b.skillId });
      if (!r.ok) return fail(res, r.insufficient ? 402 : codeFor(r), r.error, { stage: r.stage });
      return ok(res, {
        passed: !!r.passed, installed: !!r.installed, pending: !!r.pending, status: r.status, baseline: r.baseline, exam: r.exam, lift: r.lift,
        receiptId: r.receipt ? r.receipt.receiptId : null, enrollmentId: r.enrollmentId
      });
    } finally { learning.delete(key); }
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

  // ── room Press: books and docs sold from the subject rooms ────────────────
  router.get('/press/titles', wrap(async (req, res) => ok(res, { titles: academy.press.list({ room: isStr(req.query.room) ? req.query.room : undefined }) })));
  router.get('/press/titles/:id', wrap(async (req, res) => {
    const t = academy.press.get(req.params.id);
    return t ? ok(res, { title: t }) : fail(res, 404, 'title not found');
  }));
  router.post('/press/titles', authed((req, res, u) => {
    const b = bodyOf(req);
    return send(res, academy.press.publish({ by: u, room: b.room, title: b.title, kind: b.kind, body: b.body, price_sparks: b.price_sparks, authors: b.authors }), (r) => ({ title: r.title }));
  }));
  router.post('/press/buy', authed(async (req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.titleId)) return fail(res, 400, 'titleId required');
    return send(res, await academy.press.buy({ ownerId: u, titleId: b.titleId }), (r) => ({ entitlement: r.entitlement }));
  }));
  router.get('/press/read/:id', authed((req, res, u) => send(res, academy.press.read({ ownerId: u, titleId: req.params.id }), (r) => ({ title: r.title, body: r.body }))));
  router.get('/press/pending', adminOnly((req, res) => ok(res, { titles: academy.press.pending() })));
  router.post('/press/approve', adminOnly((req, res, u) => {
    const b = bodyOf(req);
    if (!isStr(b.titleId)) return fail(res, 400, 'titleId required');
    return send(res, academy.press.approve({ by: u, titleId: b.titleId, approve: b.approve === true }), (r) => ({ title: r.title }));
  }));

  // bot side
  if (agentAuth) router.use('/xagent', createBotRouter({ academy, operatives, agentAuth, fail, ok, wrap, bodyOf, send, isStr, publicSkill, badBody, openEnrollment, pickEnrollment, missingPrereqs }));

  router.use((err, req, res, next) => {    // eslint-disable-line no-unused-vars
    if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'invalid JSON');
    if (err && err.type === 'entity.too.large') return fail(res, 413, 'body too large');
    console.error('[school]', err && err.stack || err);
    return fail(res, 500, 'internal error');
  });
  return router;
}

// Bot side: identity comes from the bearer token only. The agent is the token's operative, the payer is its owner.
function createBotRouter({ academy, operatives, agentAuth, fail, ok, wrap, bodyOf, send, isStr, publicSkill, badBody, openEnrollment, pickEnrollment, missingPrereqs }) {
  const r = express.Router();
  const mountPath = (req) => req.baseUrl.replace(/\/xagent$/, '');
  r.get('/tools', (req, res) => ok(res, buildToolManifest({
    baseUrl: process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/+$/, '') + mountPath(req) : req.protocol + '://' + req.get('host') + mountPath(req)
  })));
  r.use(agentAuth);
  r.use((req, res, next) => { const bad = badBody(req); return bad ? fail(res, bad[0], bad[1]) : next(); });

  // Per-agent daily spend cap (Sparks), mirroring the external-agent cap in server/externalAgents.js.
  const dayKey = () => Math.floor(Date.now() / 86400000);
  const spendCap = () => Number(process.env.ACADEMY_BOT_DAILY_CAP) || 300;
  function reserve(agentId, amount) {
    const d = academy.store.read('botspend', { agents: {} });
    const cur = Object.prototype.hasOwnProperty.call(d.agents, agentId) && d.agents[agentId].day === dayKey() ? d.agents[agentId] : { day: dayKey(), amt: 0 };
    if (cur.amt + amount > spendCap()) return false;
    d.agents[agentId] = { day: cur.day, amt: cur.amt + amount };
    academy.store.write('botspend', d);
    return true;
  }
  function release(agentId, amount) {
    const d = academy.store.read('botspend', { agents: {} });
    if (Object.prototype.hasOwnProperty.call(d.agents, agentId)) { d.agents[agentId].amt = Math.max(0, d.agents[agentId].amt - amount); academy.store.write('botspend', d); }
  }
  const who = (req) => ({ agentId: req.agent.operativeId, ownerId: req.agent.owner });

  r.get('/catalog', wrap(async (req, res) => ok(res, { skills: academy.registry.list({ track: req.query.track, tier: req.query.tier }).map(publicSkill) })));

  r.post('/enroll', wrap(async (req, res) => {
    const b = bodyOf(req); const { agentId, ownerId } = who(req);
    if (!isStr(b.skillId)) return fail(res, 400, 'skillId required');
    const missing = missingPrereqs(agentId, b.skillId);
    if (missing.length) return fail(res, 400, 'requires skills you do not have yet: ' + missing.join(', '));
    if (!isStr(b.windowId)) {
      const open = openEnrollment(agentId, b.skillId);
      if (open) return ok(res, { enrollment: open, replay: true });
    }
    const skill = academy.registry.get(b.skillId);
    const price = skill ? skill.price_sparks : 0;
    if (price > 0 && !reserve(agentId, price)) return fail(res, 429, 'daily Sparks spend cap reached for this agent');
    const windowId = isStr(b.windowId) ? b.windowId : 'w' + crypto.randomBytes(6).toString('hex');
    const out = await academy.tuition.enroll({ ownerId, agentId, skillId: b.skillId, windowId });
    if (price > 0 && (!out.ok || out.replay)) release(agentId, price);        // nothing was charged
    return send(res, out, (x) => ({ enrollment: x.enrollment, replay: !!x.replay }));
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
    const enr = pickEnrollment(agentId, b.skillId, b.kind);
    if (!enr) return fail(res, 402, 'enroll first: each paid enrollment covers one baseline and one exam');
    return send(res, academy.exams.begin({ agentId, skillId: b.skillId, kind: b.kind, withSkill: b.kind === 'exam', enrollmentId: enr.id }),
      (x) => ({ attemptId: x.attemptId, enrollmentId: enr.id, expiresAt: x.expiresAt, tasks: x.tasks }));
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
