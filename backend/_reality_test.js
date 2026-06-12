// REALITY TEST — agent-to-agent handoff with REAL tool execution.
// Driven by local Ollama (llama3.2:1b). Proves tools actually fire and
// that delegated sub-agent output (real data) returns to the caller.
const eng = require('./agent-engine');

async function run(agent, task, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`agent=${agent}  task="${task}"`);
  const t = eng.createTask(task, agent);
  const t0 = Date.now();
  await eng.runAgentLoop(t.id);
  const done = eng.getTask(t.id);
  console.log(`status: ${done.status}  (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  console.log(`tools_used: ${JSON.stringify([...new Set(done.tools_used||[])])}`);
  console.log(`result: ${(done.result||done.error||'').slice(0,600)}`);
  return done;
}

(async () => {
  // 1) single agent must CALL a real tool (fetch_price → live data)
  const a = await run('ZEROX', 'Use your tools to fetch the current price of Bitcoin (BTC) in USD and report the exact number.', 'TEST 1 — single agent real tool call');

  // 2) agent-to-agent handoff: SHADDAI delegates to ZEROX
  const b = await run('SHADDAI', 'Delegate to the ZEROX agent the task of fetching the current Bitcoin price in USD using its tools, then report what ZEROX returned.', 'TEST 2 — agent→agent delegation');

  console.log('\n=== VERDICT ===');
  const t1real = (a.tools_used||[]).length > 0;
  const t2deleg = (b.tools_used||[]).includes('delegate_to_agent');
  console.log('TEST1 single-agent tool fired:', t1real, '→', JSON.stringify([...new Set(a.tools_used||[])]));
  console.log('TEST2 delegation fired       :', t2deleg, '→', JSON.stringify([...new Set(b.tools_used||[])]));
  process.exit(0);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(1); });
