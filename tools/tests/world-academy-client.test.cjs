/* world-academy-client.test.cjs — node tools/tests/world-academy-client.test.cjs
 * The station panels: pure HTML builders and the request flows, with a fake request layer (no browser, no server). */
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const Client = require(path.join(ROOT, 'public/world-academy-client.js'));
const Layout = require(path.join(ROOT, 'public/athenaeum-layout.js'));

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

const SKILLS = [
  { id: 'tool-protocol', name: 'SHADDAI Tool Protocol', tier: 'spark', track: 'tools', price_sparks: 20, teacher: { type: 'house', id: 'NEXUS' }, summary: 'Plan, act, verify.', requires: [], homework: { brief: 'Write the calls.' } },
  { id: 'tool-error-recovery', name: 'Tool Error Recovery', tier: 'adept', track: 'tools', price_sparks: 60, teacher: { type: 'house', id: 'NEXUS' }, summary: 'Retry once, then report.', requires: ['tool-protocol'], homework: null },
  { id: 'paper-risk-basics', name: 'Paper Trading: Risk Basics', tier: 'spark', track: 'trading', price_sparks: 20, teacher: { type: 'house', id: 'ZEROX' }, summary: 'Size from the cap.', requires: [], homework: null },
  { id: 'evil-skill', name: '<img src=x onerror=alert(1)>', tier: 'spark', track: 'writing', price_sparks: 5, teacher: { type: 'owner', id: 'u1' }, summary: '"quoted" & <b>bold</b>', requires: [], homework: null }
];
const FACULTY = [{ agent: 'NEXUS', room: 'tool-foundry', subjects: ['tool use', 'agent craft'] }, { agent: 'ZEROX', room: 'trading-desk', subjects: ['paper trading'] }];
const OPS = [{ id: 'op1', codename: 'ASTER', skills: [{ skillId: 'tool-protocol' }] }, { id: 'op2', codename: 'BOLT<x>', skills: [] }];

function fakeRequest(overrides) {
  const calls = [];
  const routes = Object.assign({
    'GET /skills': () => ({ status: 200, json: { success: true, skills: SKILLS } }),
    'GET /faculty': () => ({ status: 200, json: { success: true, faculty: FACULTY } }),
    'GET /classes': () => ({ status: 200, json: { success: true, classes: [{ id: 'cls_1', name: 'Tools 101', room: 'tool-foundry', kind: 'open', seats: 1, capacity: 5, syllabus: ['tool-protocol'] }] } }),
    'GET /press/titles': () => ({ status: 200, json: { success: true, titles: [{ id: 'bk_1', room: 'tool-foundry', title: 'Tool Protocol: course book', kind: 'course-book', price_sparks: 10, authors: [{ type: 'house', id: 'NEXUS', share: 100 }] }] } }),
    'POST /press/buy': () => ({ status: 200, json: { success: true, entitlement: { titleId: 'bk_1' } } }),
    'GET /press/read/bk_1': () => ({ status: 200, json: { success: true, title: { id: 'bk_1' }, body: '# Guide\n\n- one\n- two <script>alert(1)</script>\n\n**bold** and `code`' } }),
    'POST /agents/op1/learn': () => ({ status: 200, json: { success: true, passed: true, installed: true, baseline: 0.1, exam: 0.9, lift: 0.8, receiptId: 'rc_1' } }),
    'GET /admin/review': () => ({ status: 403, json: { success: false, error: 'admin only' } }),
    'GET /press/pending': () => ({ status: 403, json: { success: false, error: 'admin only' } })
  }, overrides || {});
  const fn = (method, p, body) => {
    calls.push({ method, path: p, body });
    const key = method + ' ' + p.split('?')[0];
    const r = routes[key];
    return Promise.resolve(r ? r(body) : { status: 404, json: { success: false, error: 'not found' } });
  };
  fn.calls = calls; return fn;
}
function make(overrides) {
  const request = fakeRequest(overrides);
  const c = Client.create({ request, getAgents: () => Promise.resolve(OPS), toast: () => {} });
  return { c, request };
}

test('every station kind in the layout has a panel, and each renders its own label', async () => {
  const L = Layout.build(); const { c } = make();
  const kinds = new Set(L.stations.map((s) => s.kind));
  for (const k of kinds) assert.ok(Client.PANEL_KINDS.includes(k), 'no panel for kind ' + k);
  for (const s of L.stations) {
    const html = await c.render(Object.assign({}, s, { id: s.id }));
    assert.ok(typeof html === 'string' && html.length > 40, s.id + ' rendered nothing');
    if (s.kind !== 'navi') assert.ok(html.includes(s.label.replace(/&/g, '&amp;')) || html.includes('ac-title'), s.id + ' has no title');
  }
});

test('everything dynamic is escaped: skill names, summaries, agent names', async () => {
  const { c } = make();
  const html = await c.render({ id: 'directory', kind: 'directory', label: 'Skill Directory', room: 'arcade-concourse' });
  assert.ok(!html.includes('<img'), 'raw tag leaked');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<b>bold</b>') && html.includes('&lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(html.includes('BOLT&lt;x&gt;') && !html.includes('BOLT<x>'));
  assert.ok(!/onerror=alert\(1\)(?!&gt;)/.test(html.replace(/&lt;img[^&]*&gt;/g, '')));
});

test('directory groups skills by track, shows tier, price, teacher and prerequisites', async () => {
  const { c } = make();
  const html = await c.render({ id: 'directory', kind: 'directory', label: 'Skill Directory', room: 'arcade-concourse' });
  for (const t of ['tools', 'trading', 'writing']) assert.ok(html.includes('data-track="' + t + '"'), t);
  assert.ok(html.includes('20 Sparks') && html.includes('60 Sparks'));
  assert.ok(html.includes('NEXUS') && /requires[^<]*tool-protocol/i.test(html));
  assert.ok(html.includes('data-act="learn"') && html.includes('data-skill="paper-risk-basics"'));          // teachable for the selected agent (ASTER)
  assert.ok(!html.includes('data-skill="tool-protocol"') && /installed/.test(html));                          // ASTER already has tool-protocol
});

test('a skill whose prerequisites the chosen agent lacks is shown locked, not teachable', async () => {
  const { c } = make();
  const first = await c.render({ id: 'dais', kind: 'dais', label: 'Skill Tree', room: 'arcade-concourse' });
  assert.ok(/✓ installed/.test(first) && /available/.test(first));                           // op1 has tool-protocol, so error-recovery is open to it
  c.state.agentId = 'op2';                                                                   // BOLT has nothing yet
  const second = await c.render({ id: 'dais', kind: 'dais', label: 'Skill Tree', room: 'arcade-concourse' });
  assert.ok(/locked, requires tool-protocol/.test(second));
  const dir = await c.render({ id: 'directory', kind: 'directory', label: 'Skill Directory', room: 'arcade-concourse' });
  assert.ok(/locked/.test(dir) && !dir.includes('data-skill="tool-error-recovery"'));        // and it cannot be taught yet
});

test('learn flow posts to the agent route and reports lift, install and receipt', async () => {
  const { c, request } = make();
  const html = await c.actions.learn('op1', 'tool-protocol');
  assert.deepStrictEqual(request.calls.find((x) => x.method === 'POST'), { method: 'POST', path: '/agents/op1/learn', body: { skillId: 'tool-protocol' } });
  assert.ok(/passed/i.test(html) && /installed/i.test(html) && html.includes('80%') && html.includes('rc_1'));
});

test('failed requests are explained in plain words, never raw status codes alone', async () => {
  const cases = [[402, 'Not enough Sparks'], [403, 'not yours'], [409, 'already'], [429, 'limit'], [503, 'offline'], [0, 'offline'], [401, 'Sign in']];
  for (const [status, word] of cases) {
    const { c } = make({ 'POST /agents/op1/learn': () => ({ status, json: { success: false, error: 'x', stage: 'enroll' } }) });
    const html = await c.actions.learn('op1', 'tool-protocol');
    assert.ok(html.toLowerCase().includes(word.toLowerCase()), status + ' -> ' + html);
    assert.ok(!/<script/i.test(html));
  }
});

test('press: buy then read renders the book safely and charges through the buy route only', async () => {
  const { c, request } = make();
  const press = await c.render({ id: 'press-forge', kind: 'press', label: 'Forge Press', room: 'tool-foundry' });
  assert.ok(press.includes('Tool Protocol: course book') && press.includes('10 Sparks') && press.includes('data-act="buy"'));
  const html = await c.actions.buy('bk_1');
  assert.ok(request.calls.some((x) => x.method === 'POST' && x.path === '/press/buy' && x.body.titleId === 'bk_1'));
  assert.ok(html.includes('<h4>Guide</h4>') && html.includes('<li>one</li>') && html.includes('<strong>bold</strong>') && html.includes('<code>code</code>'));
  assert.ok(!html.includes('<script') && html.includes('&lt;script&gt;'));
});

test('press buy with no Sparks says so and never tries to read', async () => {
  const { c, request } = make({ 'POST /press/buy': () => ({ status: 402, json: { success: false, error: 'not enough', insufficient: true } }) });
  const html = await c.actions.buy('bk_1');
  assert.ok(html.includes('Not enough Sparks'));
  assert.ok(!request.calls.some((x) => x.path.startsWith('/press/read')));
});

test('lectern shows the faculty member, their subjects, their skills and the room classes', async () => {
  const { c } = make();
  const html = await c.render({ id: 'lectern-forge', kind: 'lectern', label: 'Forge Lectern', room: 'tool-foundry', agent: 'NEXUS' });
  assert.ok(html.includes('NEXUS') && html.includes('tool use') && html.includes('Tool Protocol') && html.includes('Tools 101') && html.includes('data-act="join"'));
});

test('trading desk is labelled paper only and lists only trading skills', async () => {
  const { c } = make();
  const html = await c.render({ id: 'trading', kind: 'trading', label: 'Trading Desk (paper)', room: 'trading-desk', agent: 'ZEROX' });
  assert.ok(/paper/i.test(html) && html.includes('Paper Trading: Risk Basics') && !html.includes('Tool Protocol'));
  assert.ok(!/guarantee|profit/i.test(html.replace(/no profit|not .*profit/gi, '')));
});

test('admin door: non-admins see a locked message and no admin controls', async () => {
  const { c } = make();
  const html = await c.render({ id: 'admin', kind: 'admin', label: 'Admin Office', room: 'admin-office', locked: 'admin' });
  assert.ok(/admins only|locked/i.test(html));
  assert.ok(!html.includes('data-act="approve"') && !html.includes('data-act="resolve"'));
});

test('admin door: admins get the review queue and pending books with controls', async () => {
  const { c } = make({
    'GET /admin/review': () => ({ status: 200, json: { success: true, review: [{ attemptId: 'att_1', agentId: 'op1', skillId: 'x', tasks: [{ taskId: 't1', prompt: 'P', output: '<b>o</b>' }] }] } }),
    'GET /press/pending': () => ({ status: 200, json: { success: true, titles: [{ id: 'bk_9', title: 'New <i>Book</i>', room: 'scriptorium', price_sparks: 5, authors: [] }] } })
  });
  const html = await c.render({ id: 'admin', kind: 'admin', label: 'Admin Office', room: 'admin-office', locked: 'admin' });
  assert.ok(html.includes('data-act="resolve"') && html.includes('data-attempt="att_1"') && html.includes('data-act="approve"') && html.includes('data-title="bk_9"'));
  assert.ok(html.includes('New &lt;i&gt;Book&lt;/i&gt;') && html.includes('&lt;b&gt;o&lt;/b&gt;'));
});

test('import dock gives the tool manifest URL and a copyable agent guide pointer, with no secrets', async () => {
  const { c } = make();
  const html = await c.render({ id: 'import', kind: 'import', label: 'Import Dock', room: 'tool-foundry' });
  assert.ok(html.includes('/xagent/tools') && /shdx_/.test(html) && /never share|keep it secret/i.test(html));
});

test('request layer: base URL, user header, JSON, and offline handling', async () => {
  const seen = [];
  const store = { shd_uid: 'u_77' };
  const c = Client.create({ fetch: (url, init) => { seen.push({ url, init }); return Promise.resolve({ status: 200, json: () => Promise.resolve({ success: true }) }); }, storage: { getItem: (k) => store[k] || null } });
  const res = await c.api('POST', '/enroll', { agentId: 'op1' });
  assert.strictEqual(seen[0].url, '/api/school/enroll');
  assert.strictEqual(seen[0].init.headers['x-user-id'], 'u_77');
  assert.strictEqual(seen[0].init.body, JSON.stringify({ agentId: 'op1' }));
  assert.strictEqual(res.status, 200);
  const off = Client.create({ fetch: () => Promise.reject(new Error('net')) });
  assert.strictEqual((await off.api('GET', '/skills')).status, 0);
});

test('renderMarkdown is safe: escapes html, no links, no images', () => {
  const md = Client.renderMarkdown('# T\n\n[click](javascript:alert(1)) ![x](http://e/x.png) <img src=x onerror=1>\n\n```\n<b>code</b>\n```');
  assert.ok(!/<a[\s>]|<img[\s>]/i.test(md),'markdown must never emit links or images: ' + md);       // 'javascript:' survives only as inert escaped text
  assert.ok(md.includes('<h4>T</h4>') && md.includes('<pre>') && md.includes('&lt;b&gt;code&lt;/b&gt;'));
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
  }
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ' + pass + ' passed'));
  process.exit(fail ? 1 : 0);
})();
