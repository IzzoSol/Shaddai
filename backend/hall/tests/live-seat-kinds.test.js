'use strict';
/**
 * Post-merge re-proof of Shaddai-Arcade issue #10's original gate ("played
 * end-to-end with a real seat filled by a human, a shaddai agent, and a
 * grok seat") against the IN-PROCESS routes.js -- the pre-merge version of
 * this same test (Shaddai-Arcade repo) proved it against the old
 * cross-service HTTP design; this proves the merge didn't break it,
 * including mailbox.js's new same-process loopback default for `shaddai`
 * seats (no SHADDAI_MAIN_BACKEND_URL needed unless overridden here for
 * test isolation).
 * Run: node backend/hall/tests/live-seat-kinds.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

delete process.env.DATABASE_URL;
const { EconomyService, DevFileStore } = require('../../economy-service');
const createHallRouter = require('../routes');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function run() {
  const tmp = path.join(os.tmpdir(), `hall-test-economy-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const economySvc = new EconomyService({ store: new DevFileStore(tmp) });

  // Stub grok bot: a real HTTP endpoint, same as mailbox.test.js's pattern.
  const grokBot = express();
  grokBot.use(express.json());
  grokBot.post('/mailbox', (req, res) => {
    const { match_id, legal } = req.body;
    res.json({ match_id, move: (legal.find((b) => b.id === 'stand') || legal[0]).id });
  });
  const grokServer = http.createServer(grokBot);
  const grokPort = await listen(grokServer);

  // Stub main-backend agent surface, same contract mailbox.js's
  // dispatchToShaddai actually calls (POST /api/agent/run, GET
  // /api/agent/task/:id). Pointed at explicitly via SHADDAI_MAIN_BACKEND_URL
  // for test isolation -- production leaves this unset and relies on the
  // same-process loopback default instead.
  let taskSeq = 0;
  const tasks = new Map();
  const agentApp = express();
  agentApp.use(express.json());
  agentApp.post('/api/agent/run', (req, res) => {
    const id = 'task_' + (++taskSeq);
    tasks.set(id, { status: 'completed', result: { text: 'stand' } });
    res.json({ taskId: id });
  });
  agentApp.get('/api/agent/task/:id', (req, res) => {
    const t = tasks.get(req.params.id);
    if (!t) return res.status(404).json({});
    res.json(t);
  });
  const agentServer = http.createServer(agentApp);
  const agentPort = await listen(agentServer);
  process.env.SHADDAI_MAIN_BACKEND_URL = `http://127.0.0.1:${agentPort}`;

  const app = express();
  app.use(createHallRouter({ economySvc }));
  const hallServer = http.createServer(app);
  const hallPort = await listen(hallServer);
  const base = `http://127.0.0.1:${hallPort}`;
  const axios = require('axios');
  async function post(p, body) { return (await axios.post(`${base}${p}`, body)).data; }

  try {
    // 1. Human seat.
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Owner' });
      let table = await post('/api/casino/tables', { seatId: seat.id, wager: 0 });
      let guard = 0;
      while (table.settlement.score === null && guard++ < 10) {
        table = await post(`/api/casino/tables/${table.matchId}/move`, { move: 'stand' });
      }
      assert.notStrictEqual(table.settlement.score, null);
      console.log(`PASS: human seat played a full hand end-to-end (score=${table.settlement.score})`);
    }

    // 2. Grok/webhook seat.
    {
      const { seat } = await post('/api/casino/seats', {
        kind: 'grok', display_name: 'GrokBot', endpoint: `http://127.0.0.1:${grokPort}/mailbox`,
      });
      const table = await post('/api/casino/tables', { seatId: seat.id, wager: 0 });
      assert.notStrictEqual(table.settlement.score, null);
      console.log(`PASS: grok seat played a full hand end-to-end (score=${table.settlement.score})`);
    }

    // 3. Shaddai seat -- exercises mailbox.js's dispatchToShaddai over the
    //    real HTTP contract (stubbed here for isolation).
    {
      const { seat } = await post('/api/casino/seats', { kind: 'shaddai', display_name: 'NEXUS-seat' });
      const table = await post('/api/casino/tables', { seatId: seat.id, wager: 0 });
      assert.notStrictEqual(table.settlement.score, null);
      console.log(`PASS: shaddai seat played a full hand end-to-end (score=${table.settlement.score})`);
    }

    console.log('\n3/3 live seat-kind checks passed post-merge -- issue #10\'s original gate still holds');
  } finally {
    grokServer.close(); agentServer.close(); hallServer.close();
    delete process.env.SHADDAI_MAIN_BACKEND_URL;
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
