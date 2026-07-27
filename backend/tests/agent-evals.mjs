// backend/tests/agent-evals.mjs
// ─────────────────────────────────────────────────────────────────────────────
// AGENT EVAL SUITE — reliability, not vibes.
// Runs a set of (agent, task, acceptable-tools) cases through /api/agentic/run
// and checks: did a correct tool actually fire, and did we get real output?
// Prints a pass-rate you can watch move on every change.
//   run:  node backend/tests/agent-evals.mjs
// ─────────────────────────────────────────────────────────────────────────────
const BASE = process.env.EVAL_BASE || 'http://localhost:3000';

const CASES = [
  { agent: 'ORACLE', task: 'What is the current crypto Fear and Greed index?', ok: ['get_fear_greed'] },
  { agent: 'NEXUS',  task: 'List 3 trending GitHub repos right now.',           ok: ['get_github_trending', 'search_github_repos'] },
  { agent: 'ZEROX',  task: 'What is the current price of Bitcoin in USD?',       ok: ['fetch_price', 'binance_price', 'dex_price', 'get_ohlcv', 'get_crypto_backup'] },
  { agent: 'ORACLE', task: 'Give me the top 3 stories on Hacker News right now.',ok: ['get_hackernews', 'get_hacker_news_comments'] },
  { agent: 'NEXUS',  task: 'Get details about the "express" npm package.',       ok: ['get_package_info', 'search_npm'] },
  { agent: 'ORACLE', task: 'What is the weather in Tokyo right now?',            ok: ['get_weather', 'weather_live'] },
];

async function run(c) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/agentic/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: c.agent, task: c.task }),
    });
    const d = await r.json();
    const used = d.toolsUsed || [];
    const firedRight = used.some(t => c.ok.includes(t));
    const hasOutput = (d.response || '').trim().length > 20;
    const pass = firedRight && hasOutput;
    return { pass, firedRight, hasOutput, used, ms: Date.now() - t0, resp: (d.response || d.error || '').slice(0, 80) };
  } catch (e) {
    return { pass: false, firedRight: false, hasOutput: false, used: [], ms: Date.now() - t0, resp: 'ERR ' + e.message };
  }
}

let pass = 0;
console.log('\nSHADDAI AGENT EVALS — reliability check\n' + '─'.repeat(64));
for (const c of CASES) {
  const r = await run(c);
  if (r.pass) pass++;
  else if (/429/.test(r.resp)) { // free-tier throttle — back off and retry once
    await new Promise(res => setTimeout(res, 8000));
    const r2 = await run(c);
    if (r2.pass) { pass++; Object.assign(r, r2); }
  }
  const mark = r.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark}  ${c.agent.padEnd(7)} tool:${r.firedRight ? '✓' : '✗'} out:${r.hasOutput ? '✓' : '✗'}  [${r.used.join(',') || '—'}]  ${r.ms}ms`);
  console.log(`        "${c.task}"`);
  if (!r.pass) console.log(`        → ${r.resp}`);
  await new Promise(res => setTimeout(res, 4500)); // pace requests under the free-tier rate limit
}
const rate = Math.round((pass / CASES.length) * 100);
console.log('─'.repeat(64));
console.log(`PASS RATE: ${pass}/${CASES.length}  (${rate}%)\n`);
process.exit(pass === CASES.length ? 0 : 1);
