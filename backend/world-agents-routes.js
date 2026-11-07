'use strict';
// World agents (the 3D terminal's contract C4): the server decides what each agent is doing; the world only RENDERS it.
//   GET  /api/world/agents            -> { ok, at, agents: [{ id, name, kind: 'council'|'bot', owner, state, task, place }] }
//   POST /api/world/agents/:id/task   -> 202 { ok, taskId }  |  400 bad input  |  401 sign in  |  403 { ok:false, why }
// A task is { verb: goto|work|study|idle, args }. There are NO spending verbs. Every attempt (allowed, denied, invalid) is audit-logged.
// Tasks are PER USER: you direct YOUR view of the council and your own agents; nobody can command the shared council for other players.
// Requests pass through gateway/pikadon-kernel.js (secret scan + policy/budget when a policy exists); verbs/args are validated here.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COUNCIL = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const VERBS = ['goto', 'work', 'study', 'idle'];
const PIN = /^(academy|park|colo|st-[A-Za-z0-9_-]{1,30}|door-[A-Z]{2,16})$/;
const SAFE = /^[A-Za-z0-9_.:@-]{1,80}$/;
const TASK_TTL_MS = 10 * 60 * 1000;
const PIN_LABEL = { academy: 'the Athenaeum', park: 'the park', colo: 'the Colosseum' };

function createWorldAgents(opts) {
  opts = opts || {};
  const dir = opts.dir || path.join(__dirname, 'data');
  const stateFile = path.join(dir, 'world-agent-tasks.json'), auditFile = path.join(dir, 'world-agent-tasks.jsonl');
  const operatives = opts.operatives || (() => { try { return require('./lib/operatives'); } catch (_) { return null; } })();
  const kernel = opts.kernel || (() => { try { return require('../gateway/pikadon-kernel'); } catch (_) { return null; } })();
  const uidOf = typeof opts.uidOf === 'function' ? opts.uidOf : (req) => { const u = String(req.userId || ''); return (req.isAuthenticated && u && u !== 'local' && u.length <= 128) ? u : ''; };
  const now = () => Date.now();

  let current = {}; try { current = JSON.parse(fs.readFileSync(stateFile, 'utf8')).current || {}; } catch (_) { /* first boot */ }
  function save() { try { fs.mkdirSync(dir, { recursive: true }); const t = stateFile + '.tmp-' + process.pid; fs.writeFileSync(t, JSON.stringify({ current })); fs.renameSync(t, stateFile); } catch (e) { console.error('[world-agents] save failed:', e && e.message); } }
  function audit(line) { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(auditFile, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, line)) + '\n'); } catch (e) { console.error('[world-agents] audit failed:', e && e.message); } }
  const ownerOfAgent = (id) => { try { const o = operatives && operatives.get && operatives.get(id); return o ? String(o.owner || o.ownerId || '') : null; } catch (_) { return null; } };
  const labelFor = (verb, args) => verb === 'goto' ? 'Heading to ' + (PIN_LABEL[args.pin] || args.pin) : verb === 'study' ? 'Studying class ' + args.classId : verb === 'work' ? 'Working at office ' + args.officeId : 'Idle';
  const placeFor = (verb, args) => (verb === 'goto' ? { pin: args.pin } : verb === 'study' ? { pin: 'academy' } : null);

  function validate(verb, args) {
    if (!VERBS.includes(verb)) return 'verb must be one of ' + VERBS.join(', ');
    args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    if (verb === 'goto') { if (typeof args.pin !== 'string' || !PIN.test(args.pin)) return 'goto needs args.pin: a known pin id (academy, park, colo, st-<id>, door-<CODE>)'; return null; }
    if (verb === 'study') { if (typeof args.classId !== 'string' || !SAFE.test(args.classId)) return 'study needs args.classId'; return null; }
    if (verb === 'work') { if (typeof args.officeId !== 'string' || !SAFE.test(args.officeId)) return 'work needs args.officeId'; return null; }
    return null;
  }

  const router = express.Router();
  if (!opts.uidOf) { try { const g = require('./auth-guard'); router.use(g.softAuth); router.use(g.rateLimit({ windowMs: 60000, max: 60 })); } catch (_) { /* tests */ } }

  router.get('/', (req, res) => {
    const u = uidOf(req);
    const view = (id, name, kind, owner) => {
      const key = u + ':' + id, t = u ? current[key] : null;
      const live = t && now() - t.since < TASK_TTL_MS && t.verb !== 'idle';
      return { id, name, kind, owner: owner || null, state: live ? (t.verb === 'goto' ? 'travelling' : 'working') : 'idle', task: live ? { id: t.id, verb: t.verb, label: t.label, since: t.since } : null, place: live ? t.place || null : null };
    };
    const agents = COUNCIL.map((n) => view(n, n, 'council', null));
    try { (operatives && operatives.listByOwner && u ? operatives.listByOwner(u) : []).forEach((o) => agents.push(view(o.id, o.name || o.id, 'bot', u))); } catch (_) { /* optional */ }
    res.json({ ok: true, at: new Date().toISOString(), agents });
  });

  router.post('/:id/task', express.json({ limit: '8kb' }), async (req, res) => {
    const u = uidOf(req), id = String(req.params.id || ''), b = req.body || {};
    const log = (decision, why, extra) => audit(Object.assign({ uid: u || 'anon', agent: id, verb: b.verb, args: b.args && typeof b.args === 'object' ? b.args : null, decision, why: why || null }, extra || {}));
    if (!u) { log('deny', 'unauthenticated'); return res.status(401).json({ ok: false, why: 'sign-in' }); }
    if (!SAFE.test(id)) { log('invalid', 'bad agent id'); return res.status(400).json({ ok: false, why: 'bad agent id' }); }
    const isCouncil = COUNCIL.includes(id.toUpperCase());
    if (!isCouncil && ownerOfAgent(id) !== u) { log('deny', 'not your agent'); return res.status(403).json({ ok: false, why: 'not your agent' }); }
    const bad = validate(b.verb, b.args); if (bad) { log('invalid', bad); return res.status(400).json({ ok: false, why: bad }); }
    // the kernel is the first hop: secret scan, and policy/budget if the agent has one
    let verdict = { ok: true };
    try { if (kernel && kernel.pikadonEntrance) verdict = await kernel.pikadonEntrance('world-agent', { userId: u, agent: id, tool: 'world.task.' + b.verb, args: b.args || {} }); } catch (e) { verdict = { ok: false, reason_code: 'kernel_error', error: 'policy check unavailable' }; }
    if (!verdict || verdict.ok === false) { const why = (verdict && (verdict.reason_code || verdict.error)) || 'denied'; log('deny', why, { kernel: true }); return res.status(403).json({ ok: false, why }); }
    const args = b.args && typeof b.args === 'object' ? b.args : {}, key = u + ':' + (isCouncil ? id.toUpperCase() : id);
    const t = { id: 'wt_' + crypto.randomBytes(6).toString('hex'), verb: b.verb, args, label: labelFor(b.verb, args), place: placeFor(b.verb, args), since: now() };
    current[key] = t; save(); log('allow', null, { taskId: t.id });
    res.status(202).json({ ok: true, taskId: t.id });
  });

  router._test = { current: () => current, auditFile };
  return router;
}

module.exports = createWorldAgents();
module.exports.createWorldAgents = createWorldAgents;
