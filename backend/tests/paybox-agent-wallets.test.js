// node backend/tests/paybox-agent-wallets.test.js  (NODE_PATH must reach express)
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const express = require('express'); const make = require('../lib/paybox-agent-wallets');
function get(port, p) { return new Promise((res, rej) => http.get({ port, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbw-')); fs.writeFileSync(path.join(dir, 'x402-ledger.json'), JSON.stringify({ balances: { ZEROX: 12.456, BOLT: 3, guest: 100 }, txns: [] }));
  const app = express(); app.use('/w', make({ dataDir: dir })); const srv = app.listen(0); const port = srv.address().port;
  let d = await get(port, '/w');
  assert.strictEqual(d.ok, true); assert.strictEqual(d.agents.length, 7);
  assert.strictEqual(d.agents.find((a) => a.agent === 'ZEROX').balance, 12.46, 'rounds to 2dp');
  assert.strictEqual(d.agents.find((a) => a.agent === 'ORACLE').balance, 0, 'no ledger entry shows 0, not starting credits');
  assert.strictEqual(d.chains.solana, 'coming_soon');
  assert.ok(!JSON.stringify(d).match(/address/i), 'returns no addresses');
  d = await get(port, '/w?agents=Bolt,Zed,zerox,%3Cscript%3E');
  const names = d.agents.map((a) => a.agent); assert.ok(names.includes('BOLT') && names.includes('ZED')); assert.strictEqual(names.filter((n) => n === 'ZEROX').length, 1, 'council not duplicated'); assert.ok(!names.some((n) => /SCRIPT/.test(n)), 'bad names dropped');
  assert.strictEqual(d.agents.find((a) => a.agent === 'BOLT').balance, 3); assert.strictEqual(d.agents.find((a) => a.agent === 'BOLT').kind, 'forged');
  fs.rmSync(path.join(dir, 'x402-ledger.json')); d = await get(port, '/w'); assert.ok(d.agents.every((a) => a.balance === 0), 'missing ledger = all zero');
  srv.close(); console.log('paybox-agent-wallets: all assertions passed');
})().catch((e) => { console.error(e); process.exit(1); });
