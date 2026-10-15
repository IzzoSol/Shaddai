'use strict';
/** Proves a Skate Jam run can never increase total Sparks (closed loop). Loads the real module in a vm with a fake DOM + ledger. */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert');
const PUB = path.join(__dirname, '..', '..', 'public');
const R = require(path.join(PUB, 'world-rng.js'));

function makeEnv(balance) {
  const store = {};
  const el = () => { const e = { style: {}, children: [], firstChild: { style: {} }, appendChild(c) { e.children.push(c); }, remove() { }, addEventListener() { }, querySelector() { return null; } }; return e; };
  const burned = { n: 0 };
  const ledger = { bal: balance, spend(n) { if (this.bal < n) return false; this.bal -= n; return true; }, add(n) { this.bal += n; }, get() { return this.bal; } };
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, isFinite, Number, setTimeout: () => 0,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { createElement: el, body: { appendChild() { } } }, requestAnimationFrame: f => 0,
    WorldCopy: { pick: () => '' }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, ledger, burned };
}
function loadJam(env, withEconomy) {
  if (withEconomy) vm.runInContext(fs.readFileSync(path.join(PUB, 'world-economy.js'), 'utf8'), env.ctx);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'world-skatejam.js'), 'utf8'), env.ctx);
  const hover = { isRiding: () => true, speedMS: () => 0, isFlying: () => false, isAirborne: () => false };
  return env.ctx.buildSkateJam({ hover, playerPos: { x: 0, z: 0 }, toast() { }, spend: n => env.ledger.spend(n), add: n => env.ledger.add(n), balance: () => env.ledger.get() });
}
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }

function playRun(jam, score) {
  const r = jam.start({ stake: playRun.stake }); if (!r.ok) return r;
  jam.update(3.1); // count -> run
  for (let i = 0; i < 10 && score > 0; i++) { /* score via clean trick events */ }
  let left = score; while (left > 0) { const pts = Math.min(left, 100); jam._trick({ kind: 'summary', clean: true, score: pts }); left -= pts; if (jam.state().mult > 1) { /* combo inflates; fine */ } }
  jam.update(100); // run out the clock -> finish
  return r;
}

[true, false].forEach(withEco => {
  test('no run can increase total Sparks (' + (withEco ? 'WorldEconomy' : 'inline fallback') + ', 300 seeded runs)', () => {
    const env = makeEnv(1e9), jam = loadJam(env, withEco), rng = R.create(2026);
    const start = env.ledger.bal; let spent = 0;
    for (let i = 0; i < 300; i++) {
      // reset daily cap each run so wagers are allowed
      env.ctx.localStorage.setItem('shd_jam_cap_v1', JSON.stringify({ d: new Date().toISOString().slice(0, 10), t: 0 }));
      const before = env.ledger.bal; playRun.stake = rng.pick([0, 30, 100, 300]);
      const r = playRun(jam, rng.pick([0, 100, 600, 1500, 5000, 20000]));
      assert.ok(r.ok, JSON.stringify(r));
      assert.ok(env.ledger.bal <= before, 'run ' + i + ' increased Sparks: ' + before + ' -> ' + env.ledger.bal);
      assert.ok(Number.isInteger(env.ledger.bal));
      jam.stop(); // clears phase
      jam.update(0); // idle
      env.ctx.__x = 0;
      // let the 7 s done->idle timer be irrelevant: force idle
      assert.ok(env.ledger.bal >= before - playRun.stake, 'lost more than stake: i=' + i + ' stake=' + playRun.stake + ' before=' + before + ' after=' + env.ledger.bal + ' ' + JSON.stringify(jam.state()));
    }
    assert.ok(env.ledger.bal <= start);
  });
});

test('success refunds exactly the stake; failure returns stake minus 5% burn', () => {
  const env = makeEnv(10000), jam = loadJam(env, true);
  playRun.stake = 100; playRun(jam, 20000);
  assert.strictEqual(env.ledger.bal, 10000, 'tier reached -> exact refund (no profit)');
  const env2 = makeEnv(10000), jam2 = loadJam(env2, true);
  playRun.stake = 100; playRun(jam2, 0);
  assert.strictEqual(env2.ledger.bal, 10000 - 5, '5% of 100 burned');
});
test('daily wager cap still enforced (600)', () => {
  const env = makeEnv(10000), jam = loadJam(env, true);
  env.ctx.localStorage.setItem('shd_jam_cap_v1', JSON.stringify({ d: new Date().toISOString().slice(0, 10), t: 500 }));
  const r = jam.start({ stake: 300 });
  assert.strictEqual(r.ok, false); assert.strictEqual(env.ledger.bal, 10000);
  assert.ok(jam.start({ stake: 0 }).ok, 'free run still allowed');
});
test('insufficient balance is refused BEFORE any spend (explicit check, not the ledger)', () => {
  const env = makeEnv(50), jam = loadJam(env, true); let spendCalls = 0;
  const orig = env.ledger.spend.bind(env.ledger); env.ledger.spend = n => { spendCalls++; return orig(n); };
  const r = jam.start({ stake: 100 });
  assert.strictEqual(r.ok, false); assert.ok(/not enough Sparks/.test(r.why), r.why);
  assert.strictEqual(spendCalls, 0, 'spend must not be attempted'); assert.strictEqual(env.ledger.bal, 50);
});
test('no tier multipliers remain in TUNE', () => {
  const jam = loadJam(makeEnv(1), true);
  assert.ok(jam.TUNE.tiers.every(t => t.mult === undefined));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
