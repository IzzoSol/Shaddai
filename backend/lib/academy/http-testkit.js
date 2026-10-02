'use strict';
// Shared HTTP harness for the school router tests: real academy on a temp dir, real express, fake identities.
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const express = require('express');
const { tmpDir, sampleSkill, sampleBenchmark, sampleRubric } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const { createAcademy } = require('./academy-core');
const { createSchoolRouter } = require('../../academy-school-routes');

async function boot() {
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  for (const u of ['owner1', 'owner2', 'teacherUser']) await economy.grant(u, 200, 'test.seed', 'seed-' + u);
  const opsDb = {
    op1: { id: 'op1', owner: 'owner1', tools: ['chat'], skills: [] },
    op2: { id: 'op2', owner: 'owner2', tools: [], skills: [] },
    tchr: { id: 'tchr', owner: 'teacherUser', tools: [], skills: [] }
  };
  const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(opsDb, id) ? opsDb[id] : null), update: (id, p) => Object.assign(opsDb[id], p) };
  let clock = 1700000000000;
  const academy = createAcademy({
    dir: tmpDir(), economy, operatives, now: () => clock, adminIds: ['owner1'],
    hooks: { passed() {}, failed() {}, homeworkImproved() {}, taught() {}, classCompleted() {} },
    judge: async () => ({ scores: { clarity: 3, tools: 3 }, critique: { focus_next: 'composition', what_went_wrong: ['vague'] } })
  });
  assert.ok(academy.benchmarks.register(sampleBenchmark()).ok);
  assert.ok(academy.benchmarks.registerRubric(sampleRubric()).ok);
  assert.ok(academy.registry.publish(sampleSkill()).ok);
  const app = express();
  app.use('/school', createSchoolRouter({
    academy, operatives,
    uidOf: (req) => String(req.headers['x-test-uid'] || ''),
    agentAuth: (req, res, next) => {
      const a = { 'bot-1': { id: 'xa_1', operativeId: 'op1', owner: 'owner1', name: 'Bot1' }, 'bot-2': { id: 'xa_2', operativeId: 'op2', owner: 'owner2', name: 'Bot2' } }[String(req.headers['x-test-agent'] || '')];
      if (!a) return res.status(401).json({ success: false, error: 'agent bearer token required' });
      req.agent = a; next();
    }
  }));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/school';
  async function call(method, p, o) {
    o = o || {};
    const headers = { 'content-type': 'application/json' };
    if (o.uid) headers['x-test-uid'] = o.uid;
    if (o.agent) headers['x-test-agent'] = o.agent;
    const res = await fetch(base + p, { method, headers, body: o.raw !== undefined ? o.raw : (o.body ? JSON.stringify(o.body) : undefined) });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  }
  return { academy, economy, opsDb, call, close: () => server.close(), tick: (ms) => { clock += ms; } };
}

module.exports = { boot };
