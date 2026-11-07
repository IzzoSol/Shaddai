// node tools/tests/world-dashboard-link.test.cjs — WORLD side of the World <-> Dashboard contract (docs/HANDOFF-20261106c-DASHBOARD-WORLD-LINK.md).
// Runs the real public/world-dashboard-link.js in a vm with fake world modules + a fake fetch. Checks C1 snapshot shape, C2 deep-link
// parsing (and that junk is rejected), C3/C4 offline + ready states, C4 agent pins, C5 dashboard URL.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const pub = path.join(__dirname, '..', '..', 'public');
const src = fs.readFileSync(path.join(pub, 'world-dashboard-link.js'), 'utf8');
const navi = fs.readFileSync(path.join(pub, 'world-navi.js'), 'utf8');
let pass = 0; const tests = []; const t = (n, fn) => tests.push([n, fn]);

function boot(routes) {
  const store = { shd_display_name: 'Izzo', shd_token: 'tok123' }, posted = [], calls = [], pins = {};
  const win = {
    __worldLinkNoBoot: true, Date, JSON, Math, Promise, setTimeout, location: { search: '' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    BroadcastChannel: function () { this.postMessage = m => posted.push(m); },
    fetch: (url, opt) => { calls.push({ url, opt }); const r = routes[url]; return Promise.resolve(r ? { ok: true, json: () => Promise.resolve(r) } : { ok: false, json: () => Promise.resolve({}) }); },
    ShdSparks: { get: () => 4321 },
    _playerCharacter: 'NEXUS', __w3dDebug: { playerPos: { x: 12.4, z: 88.6 } },
    NaviState: { waypoint: { label: 'The Athenaeum', kind: 'Academy', x: 1, z: 2 } },
    WorldBots: { ROSTER: [{ id: 'scrap', name: 'SCRAP', kind: 'humanoid' }, { id: 'unicycle', name: 'UNI-9', kind: 'wheeled' }],
      state: () => ({ active: 'scrap' }), rec: id => id === 'scrap' ? { bodyState: 'active', hp: 90, skills: ['carry'] } : null, call: () => ({ ok: true }) },
    WorldMounts: { owned: () => [{ id: 'disc', hp: 50 }], def: () => ({ name: 'Starling Disc', flying: true }) },
    WorldSurvival: { spots: () => [{ id: 'bz', name: 'Bazaar', kind: 'bazaar' }, { id: 'h1', name: 'My Home', kind: 'home' }], active: () => ({ id: 'h1' }) },
    WorldOperatives: { list: () => [{ code: 'NEXUS', name: 'NEXUS', portrait: '/assets/agents/NEXUS-portrait.png', owned: true }] },
    Navi: { registerPin: p => { pins[p.id] = p; }, unregisterPin: id => { delete pins[id]; }, pins: () => [{ id: 'academy', t: 'The Athenaeum (Academy)', kind: 'Academy', x: 3958.8, z: -3117.6 }],
      setWaypoint: w => { win._wp = w; }, open: () => { win._open = true; }, setModule: m => { win._mod = m; }, toast: () => { } }
  };
  win.window = win; vm.createContext(win); vm.runInContext(src, win);
  return { L: win.WorldLink, win, store, posted, calls, pins };
}

t('C1 snapshot has the contract shape', () => {
  const { L } = boot({}); const s = L.snapshot();
  assert.strictEqual(s.v, 1); assert.strictEqual(s.live, true); assert(typeof s.at === 'number');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.player)), { character: 'NEXUS', name: 'Izzo', pos: { x: 12, z: 89 }, place: null });
  assert.strictEqual(s.sparks, 4321); assert.strictEqual(s.activeBot, 'scrap');
  assert.deepStrictEqual(s.bots.map(b => b.state), ['active', 'locked']); assert.deepStrictEqual(s.bots[0].skills, ['carry']);
  assert.strictEqual(s.mounts[0].name, 'Starling Disc'); assert.strictEqual(s.mounts[0].flying, true);
  assert.deepStrictEqual(s.spots.map(x => x.active), [false, true]);
  assert.strictEqual(s.operatives[0].equipped, true); assert.deepStrictEqual(JSON.parse(JSON.stringify(s.waypoint)), { label: 'The Athenaeum', kind: 'Academy' });
});
t('C1 publish writes localStorage + BroadcastChannel; hide marks live:false', () => {
  const { L, store, posted } = boot({}); L.publish(true);
  assert.strictEqual(JSON.parse(store.shd_world_snapshot_v1).sparks, 4321); assert.strictEqual(posted[0].type, 'snapshot');
  L.publish(true); assert.strictEqual(posted.length, 1, 'unchanged snapshot is not re-sent');
  L.publish(false); assert.strictEqual(JSON.parse(store.shd_world_snapshot_v1).live, false); assert.strictEqual(posted.length, 2);
});
t('C1 snapshot holds no secrets (no token)', () => { const { L } = boot({}); assert(!/tok123/.test(JSON.stringify(L.snapshot()))); });
t('C2 deep links: valid params pass, junk is dropped', () => {
  const { L } = boot({});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.deepLink('?from=dashboard&navi=bots&pin=academy&bot=scrap'))), { navi: 'bots', pin: 'academy', bot: 'scrap' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.deepLink('?navi=evil&pin=<script>&bot=a%20b'))), {});
});
t('C2 apply: waypoint to the pin, bot called, Navi opened on the module', () => {
  const { L, win } = boot({}); const done = L.applyDeepLink({ navi: 'academy', pin: 'academy', bot: 'scrap' });
  assert.deepStrictEqual([...done], ['pin', 'bot', 'navi']); assert.strictEqual(win._wp.x, 3958.8); assert.strictEqual(win._mod, 'academy');
  assert.deepStrictEqual([...L.applyDeepLink({ pin: 'nowhere', bot: 'unicycle' })], [], 'unknown pin / unowned bot do nothing');
});
t('C3 progress offline (404) says offline and keeps the 7 tiers', async () => {
  const { L } = boot({}); const P = await L.reloadProgress(); assert.strictEqual(P.state, 'offline'); assert.strictEqual(P.tiers.length, 7); assert.strictEqual(P.tiers[6].name, 'Agentic AI');
});
t('C3 progress ready reads agents + server tiers, sends the Bearer token to our own origin', async () => {
  const { L, calls } = boot({ '/api/school/progress': { ok: true, agents: [{ agentId: 'NEXUS', passed: [1, 2], current: 3 }] }, '/api/school/classes': { ok: true, tiers: [{ n: 1, name: 'AI' }] } });
  const P = await L.reloadProgress(); assert.strictEqual(P.state, 'ready'); assert.strictEqual(P.agents[0].name, 'NEXUS'); assert.deepStrictEqual([...P.agents[0].passed], [1, 2]); assert.strictEqual(P.tiers[0].name, 'AI');
  assert(calls.every(c => c.url.startsWith('/api/') && c.opt.headers.Authorization === 'Bearer tok123'));
});
t('C4 agents: offline is safe; ready registers map pins for coordinate places and removes stale ones', async () => {
  let b = boot({}); let A = await b.L.reloadAgents(); assert.strictEqual(A.state, 'offline'); assert.strictEqual(b.L.agentFor('NEXUS'), null);
  const routes = { '/api/world/agents': { ok: true, agents: [{ id: 'NEXUS', name: 'NEXUS', kind: 'council', state: 'working', task: { label: 'Building' }, place: { x: 10, z: 20 } }, { id: 'QUILL', state: 'idle', place: { pin: 'academy' } }] } };
  b = boot(routes); A = await b.L.reloadAgents(); assert.strictEqual(A.state, 'ready'); assert.strictEqual(b.L.agentFor('nexus').state, 'working');
  assert.deepStrictEqual(Object.keys(b.pins), ['agent-NEXUS']); assert(/Building/.test(b.pins['agent-NEXUS'].t));
  routes['/api/world/agents'] = { ok: true, agents: [] }; await b.L.reloadAgents(); assert.deepStrictEqual(Object.keys(b.pins), []);
});
t('C5 dashboard URL is the hash route the dashboard handles', () => { const { L } = boot({}); assert.strictEqual(L.dashboardUrl(), '/dashboard#worlds/myworld'); assert.strictEqual(L.dashboardUrl('academy'), '/dashboard#worlds/academy'); });
t('Navi wiring: pins()/unregisterPin exported, tier rings, live tasks, dashboard buttons', () => {
  assert(/pins: function \(\) \{ return knownPins\(\); \}/.test(navi) && /unregisterPin:/.test(navi));
  assert(/function tierRings\(/.test(navi) && /id: 'progress'/.test(navi) && /openDash\('academy'\)/.test(navi) && /openDash\('agents'\)/.test(navi));
  assert(/liveAgentHtml\(c\[0\]\)/.test(navi));
});
t('world page loads the link after the Navi', () => {
  const h = fs.readFileSync(path.join(pub, 'SHADDAI-WORLD-3D.html'), 'utf8'); const a = h.indexOf('/world-navi.js?v='), b = h.indexOf('/world-dashboard-link.js?v=');
  assert(a > 0 && b > a);
});

(async () => { for (const [n, fn] of tests) { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } }
  console.log(`${pass} passed, ${tests.length - pass} failed`); })();
