#!/usr/bin/env node
/**
 * SHADDAI v79.9 — End-to-end backend verification
 * Tests every major endpoint and flow against a running server on :3000
 *
 * Usage: node backend/test-e2e.js
 */

const BASE = process.env.SHADDAI_BASE || 'http://localhost:3000';

const results = [];
let passed = 0, failed = 0;

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const dt = Date.now() - t0;
    if (result === false) {
      failed++;
      results.push({ name, status: 'FAIL', ms: dt, detail: 'returned false' });
    } else {
      passed++;
      results.push({ name, status: 'PASS', ms: dt, detail: typeof result === 'string' ? result.slice(0, 80) : '' });
    }
  } catch (e) {
    failed++;
    results.push({ name, status: 'ERROR', ms: Date.now() - t0, detail: e.message.slice(0, 80) });
  }
}

async function GET(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function POST(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, data: text }; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' SHADDAI v79.9 E2E Verification');
  console.log(` Target: ${BASE}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // CORE
  await test('GET /api/agent/test (self-test)', async () => {
    const d = await GET('/api/agent/test');
    if (!d.success || !d.task) throw new Error('no success/task');
    return `${d.task.agentName} ${d.task.status} (${d.task.tools_used?.length||0} tools)`;
  });

  await test('GET /api/agent/tools (catalog)', async () => {
    const d = await GET('/api/agent/tools');
    const tools = d.tools || d.data || [];
    if (tools.length < 100) throw new Error(`only ${tools.length} tools`);
    return `${tools.length} tools`;
  });

  await test('GET /api/agent/agents (7 agents)', async () => {
    const d = await GET('/api/agent/agents');
    const agents = d.agents || d.data || [];
    if (agents.length !== 7) throw new Error(`expected 7 got ${agents.length}`);
    return agents.map(a => a.name || a).join(',');
  });

  await test('GET /api/agent/stats', async () => {
    const d = await GET('/api/agent/stats');
    if (!d.byAgent || !d.system) throw new Error('missing keys');
    return `system uptime ${d.system.uptimeSec}s, ${Object.keys(d.byAgent).length} agents`;
  });

  // SKILLS
  await test('GET /api/skills/semantic-search', async () => {
    const d = await GET('/api/skills/semantic-search?q=market+analysis&k=3');
    const results = d.results || d.data || [];
    if (!results.length) throw new Error('no skills returned');
    return `top: ${results[0].name||results[0].id}`;
  });

  // CACHE + TRACING
  await test('GET /api/cache/stats', async () => {
    const d = await GET('/api/cache/stats');
    return `hitRate ${d.hitRate||0}%, ${d.entries||0} entries`;
  });

  await test('GET /api/llm/traces', async () => {
    const d = await GET('/api/llm/traces');
    return `${d.calls?.length||0} calls logged`;
  });

  // COLLECTIBLES FLOW
  let collectibleId;
  await test('POST /api/collectibles/mint', async () => {
    const r = await POST('/api/collectibles/mint', { name: 'E2E Test Item', rarity: 'T4', owner: 'e2e-tester' });
    if (!r.ok || !r.data.ok) throw new Error(`mint failed: ${JSON.stringify(r.data)}`);
    collectibleId = r.data.data.collectible.id;
    return `id=${collectibleId} sig=${r.data.data.collectible.signature?.slice(0,8)}`;
  });

  await test('POST /api/collectibles/list (price)', async () => {
    const r = await POST('/api/collectibles/list', { id: collectibleId, priceCredits: 250 });
    if (!r.ok || !r.data.ok) throw new Error(`list failed: ${JSON.stringify(r.data)}`);
    return `listed #${collectibleId} @ 250cr`;
  });

  await test('GET /api/collectibles/listings', async () => {
    const d = await GET('/api/collectibles/listings');
    if (!d.ok) throw new Error('not ok');
    return `${d.data.length} active listings`;
  });

  await test('POST /api/collectibles/trade', async () => {
    const r = await POST('/api/collectibles/trade', { collectible_id: collectibleId, buyer: 'e2e-buyer', buyer_credits: 300 });
    if (!r.ok || !r.data.ok) throw new Error(`trade failed: ${JSON.stringify(r.data)}`);
    return r.data.data.message.slice(0, 80);
  });

  await test('GET /api/collectibles/trades (history)', async () => {
    const d = await GET('/api/collectibles/trades');
    if (!d.ok || !d.data.length) throw new Error('no trades recorded');
    return `${d.data.length} trades total`;
  });

  // BYOK TIER GATING
  await test('POST /api/byok/set (free+groq → 403)', async () => {
    const r = await POST('/api/byok/set', { tier: 'free', provider: 'groq', key: 'gsk_test' });
    if (r.status !== 403) throw new Error(`expected 403 got ${r.status}`);
    return '403 as expected';
  });

  await test('POST /api/byok/set (builder+groq → 200)', async () => {
    const r = await POST('/api/byok/set', { tier: 'builder', provider: 'groq', key: 'gsk_test123' });
    if (!r.ok) throw new Error(`expected 200 got ${r.status}: ${JSON.stringify(r.data)}`);
    return 'allowed';
  });

  await test('POST /api/byok/set (builder+claude → 403)', async () => {
    const r = await POST('/api/byok/set', { tier: 'builder', provider: 'claude', key: 'sk-ant-test' });
    if (r.status !== 403) throw new Error(`expected 403 got ${r.status}`);
    return '403 as expected';
  });

  await test('POST /api/byok/set (pro+claude → 200)', async () => {
    const r = await POST('/api/byok/set', { tier: 'pro', provider: 'claude', key: 'sk-ant-test' });
    if (!r.ok) throw new Error(`expected 200 got ${r.status}`);
    return 'allowed';
  });

  await test('GET /api/byok/status', async () => {
    const d = await GET('/api/byok/status');
    if (typeof d.groq !== 'boolean') throw new Error('bad shape');
    return `groq=${d.groq} claude=${d.claude}`;
  });

  // DIRECT TOOL EXECUTION
  await test('POST /api/agent/tool (fetch_price BTC)', async () => {
    const r = await POST('/api/agent/tool', { tool: 'fetch_price', params: { symbol: 'bitcoin' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const result = JSON.stringify(r.data);
    if (!/price|\$/.test(result)) throw new Error(`no price in result: ${result.slice(0,100)}`);
    return result.slice(0, 100);
  });

  await test('POST /api/agent/tool (set_agent_room_state)', async () => {
    const r = await POST('/api/agent/tool', { tool: 'set_agent_room_state', params: { agent: 'TURTLE', state: 'working', mood: 'creative' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return 'room state set';
  });

  await test('POST /api/agent/tool (get_agent_mood)', async () => {
    const r = await POST('/api/agent/tool', { tool: 'get_agent_mood', params: { agent: 'TURTLE' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.stringify(r.data).slice(0, 80);
  });

  // MARKETPLACE JOBS
  let jobId;
  await test('POST /api/marketplace/jobs/post', async () => {
    const r = await POST('/api/marketplace/jobs/post', {
      title: 'E2E test job', description: 'Write a tweet about SHADDAI',
      budget: 75, agentTarget: 'QUILL', postedBy: 'e2e-poster'
    });
    if (!r.ok || !r.data.ok) throw new Error(`post failed: ${JSON.stringify(r.data)}`);
    jobId = r.data.data.id;
    return `created ${jobId}`;
  });

  await test('GET /api/marketplace/jobs/:id', async () => {
    const d = await GET(`/api/marketplace/jobs/${jobId}`);
    const job = d.job || d.data;
    if (!job || job.id !== jobId) throw new Error(`mismatch: ${JSON.stringify(d).slice(0,100)}`);
    return `title: ${job.title}`;
  });

  await test('POST /api/marketplace/jobs/:id/bid', async () => {
    const r = await POST(`/api/marketplace/jobs/${jobId}/bid`, { agentId: 'QUILL', amount: 60, eta: '30m' });
    if (!r.ok) throw new Error(`bid failed: ${JSON.stringify(r.data)}`);
    return 'bid recorded';
  });

  // SKILL PACKS
  await test('GET /api/skill-packs (seeded 3)', async () => {
    const d = await GET('/api/skill-packs');
    const packs = d.data || d.packs || (Array.isArray(d) ? d : []);
    if (packs.length < 3) throw new Error(`only ${packs.length} packs`);
    return `${packs.length} packs`;
  });

  await test('POST /api/skill-packs/install (degen)', async () => {
    const r = await POST('/api/skill-packs/install', { pack_id: 'pack-degen-001', user: 'e2e-tester' });
    if (!r.ok) throw new Error(`install failed: ${JSON.stringify(r.data)}`);
    return 'installed';
  });

  await test('GET /api/skill-packs/installed/:user', async () => {
    const d = await GET('/api/skill-packs/installed/e2e-tester');
    const installed = d.data || d.packs || (Array.isArray(d) ? d : []);
    if (!installed.length) throw new Error('no packs installed');
    return `${installed.length} pack(s) installed`;
  });

  // RAG (per-user document Q&A)
  await test('POST /api/rag/upload', async () => {
    const r = await POST('/api/rag/upload', {
      user: 'e2e-rag', name: 'policy.txt',
      text: 'SHADDAI is an AI agent marketplace. Refund policy allows full refunds within 30 days of purchase. Pro tier users get priority support within 4 hours. We accept USD, EUR, and Solana SOL.'
    });
    if (!r.ok || !r.data.ok) throw new Error(`upload failed: ${JSON.stringify(r.data)}`);
    return `${r.data.data.chunks} chunk(s)`;
  });

  await test('GET /api/rag/docs/:user', async () => {
    const d = await GET('/api/rag/docs/e2e-rag');
    if (!d.ok || !d.data.length) throw new Error('no docs');
    return `${d.data.length} doc(s)`;
  });

  await test('POST /api/rag/search', async () => {
    const r = await POST('/api/rag/search', { user: 'e2e-rag', query: 'refund policy' });
    const results = r.data?.data?.results || [];
    if (!results.length) throw new Error('no search results');
    return `top score ${results[0].score?.toFixed(3)}`;
  });

  await test('POST /api/rag/ask (grounded answer)', async () => {
    const r = await POST('/api/rag/ask', { user: 'e2e-rag', query: 'How long do I have to request a refund?' });
    const ans = r.data?.data?.answer || '';
    if (!/30|thirty/i.test(ans)) throw new Error(`answer missing '30 days': ${ans.slice(0,80)}`);
    return ans.slice(0, 70);
  });

  // RENDER RESULTS
  console.log('\n┌─────┬────────────────────────────────────────────────────┬──────┬─────────┐');
  console.log('│  #  │ Test                                               │  ms  │ Status  │');
  console.log('├─────┼────────────────────────────────────────────────────┼──────┼─────────┤');
  results.forEach((r, i) => {
    const idx = String(i + 1).padStart(3);
    const name = r.name.slice(0, 50).padEnd(50);
    const ms = String(r.ms).padStart(4);
    const stat = (r.status === 'PASS' ? '✓ PASS  ' : r.status === 'FAIL' ? '✗ FAIL  ' : '⚠ ERROR ').padEnd(7);
    console.log(`│ ${idx} │ ${name} │ ${ms} │ ${stat}│`);
    if (r.status !== 'PASS') console.log(`│     │   └─ ${r.detail.slice(0, 78).padEnd(78)} │`);
  });
  console.log('└─────┴────────────────────────────────────────────────────┴──────┴─────────┘');
  console.log(`\n  PASS: ${passed}  FAIL: ${failed}  TOTAL: ${results.length}`);
  console.log(`  ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(2); });
