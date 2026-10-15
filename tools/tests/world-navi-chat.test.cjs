// node tools/tests/world-navi-chat.test.cjs — Navi chat bridge against the REAL backend/multiplayer.js relay (express on a random port)
const assert = require('assert'), path = require('path'), express = require('express');
const app = express(); app.use(express.json()); app.use('/api/mp', require('../../backend/multiplayer'));
app.post('/api/shaddai/chat', (req, res) => res.status(503).end());   // agent server offline
const server = app.listen(0); const BASE = 'http://127.0.0.1:' + server.address().port;

const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const realFetch = global.fetch; global.fetch = (u, o) => realFetch(BASE + u, o);
const logs = { Nearby: [], Global: [], Party: [], Agent: [] }, toasts = [];
global.window = global;
global.Navi = { chatName: () => store.shd_display_name || '', chatSet: (ch, m) => { logs[ch] = m; }, chatPush: (ch, m) => logs[ch].push(m), toast: m => toasts.push(m) };
require('../../public/world-navi-chat.js'); const C = global.WorldNaviChat;
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log('  ok ', n); };
const player = { x: 100, z: 100 };

(async () => {
  try {
    await t('no name = nothing is synced or sent', async () => {
      C.start({ getPlayer: () => player }); await wait(300);
      C._send('Global', 'hello'); await wait(300);
      assert.strictEqual(logs.Global.length, 0);
    });
    await t('after picking a name: send on Global, it comes back from the relay as mine', async () => {
      store.shd_display_name = 'Izzo'; C._send('Global', 'gm SHADDAI'); await wait(600);
      const m = logs.Global.find(x => x.t === 'gm SHADDAI'); assert(m, JSON.stringify(logs.Global)); assert.strictEqual(m.u, 'Izzo'); assert.strictEqual(m.me, true);
    });
    await t('another player on Global is received and not marked as mine', async () => {
      await realFetch(BASE + '/api/mp/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: 'w3d-global', id: 'other-1', name: 'Rava', text: 'yo' }) });
      C._sync(); await wait(600);
      const m = logs.Global.find(x => x.t === 'yo'); assert(m && m.u === 'Rava' && !m.me);
    });
    await t('Nearby is per map cell: moving cells switches room', async () => {
      const a = C._rooms().Nearby; player.x = 5000; const b = C._rooms().Nearby; assert.notStrictEqual(a, b); assert(/^w3d-near--?\d+_-?\d+$/.test(b));
    });
    await t('Party needs a code; joinParty validates it', async () => {
      C._send('Party', 'hi'); await wait(200); assert(/Join a party/.test(logs.Party[logs.Party.length - 1].t));
      assert.strictEqual(C.joinParty('bad code!'), false); assert.strictEqual(C.joinParty('crew-7'), true); assert.strictEqual(C._rooms().Party, 'w3d-party-crew-7');
    });
    await t('Agent channel: offline agent server gives a clear notice, not silence', async () => {
      C._send('Agent', 'what is SHADDAI?'); await wait(500); assert(/offline/.test(logs.Agent[logs.Agent.length - 1].t));
    });
    console.log(`${pass} passed, 0 failed`);
  } catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
  finally { C.stop(); server.close(); }
})();
