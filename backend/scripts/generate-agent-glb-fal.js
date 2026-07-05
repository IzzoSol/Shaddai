#!/usr/bin/env node
/**
 * SHADDAI — Agent Image → 3D GLB via fal.ai Trellis
 * Converts each agent's full-body FLUX portrait (backend/data/forge-art/char-<id>.png)
 * into a real 3D GLB body and saves it to public/assets/agents/<ID>.glb
 *
 * Usage:
 *   node backend/scripts/generate-agent-glb-fal.js            # all 7 agents
 *   node backend/scripts/generate-agent-glb-fal.js shaddai    # just one (test first!)
 *
 * Requires FAL_KEY (read from env or .env.local).
 */

const fs = require('fs');
const path = require('path');

// ── load FAL_KEY from env or .env.local (supports `export FAL_KEY="..."`) ──
function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.replace(/^["']|["']$/g, '');
  try {
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    const txt = fs.readFileSync(envPath, 'utf8');
    const m = txt.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

const FAL_KEY = loadFalKey();
if (!FAL_KEY) {
  console.error('❌ FAL_KEY not found (env or .env.local).');
  process.exit(1);
}

const AGENTS = ['shaddai', 'zerox', 'oracle', 'nexus', 'turtle', 'quill', 'pikadon'];
const ART_DIR = path.join(__dirname, '..', 'data', 'forge-art');
const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'agents');
const MODEL = 'fal-ai/trellis';            // image → 3D mesh (GLB)
const QUEUE = 'https://queue.fal.run/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pngToDataUri(file) {
  const buf = fs.readFileSync(file);
  return 'data:image/png;base64,' + buf.toString('base64');
}

async function falJson(url, opts) {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json', ...(opts && opts.headers) },
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`fal ${r.status}: ${(json.detail || json.error || text || '').toString().slice(0, 200)}`);
  return json;
}

// submit → poll → fetch result → download GLB
async function imageToGlb(agent) {
  const src = path.join(ART_DIR, `char-${agent}.png`);
  if (!fs.existsSync(src)) throw new Error(`missing source image: ${src}`);
  const image_url = pngToDataUri(src);

  console.log(`  → submitting ${agent} to ${MODEL} …`);
  const submit = await falJson(QUEUE + MODEL, { method: 'POST', body: JSON.stringify({ image_url }) });
  const reqId = submit.request_id;
  const statusUrl = submit.status_url || `${QUEUE}${MODEL}/requests/${reqId}/status`;
  const respUrl = submit.response_url || `${QUEUE}${MODEL}/requests/${reqId}`;
  if (!reqId) throw new Error('no request_id from fal: ' + JSON.stringify(submit).slice(0, 200));

  // poll up to ~5 min
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const st = await falJson(statusUrl, { method: 'GET' });
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error('fal job failed: ' + JSON.stringify(st).slice(0, 200));
    if (i % 4 === 0) console.log(`    … ${agent}: ${st.status || 'IN_PROGRESS'} (${(i + 1) * 3}s)`);
  }

  const result = await falJson(respUrl, { method: 'GET' });
  const meshUrl = (result.model_mesh && result.model_mesh.url) || (result.mesh && result.mesh.url) || result.model_glb?.url;
  if (!meshUrl) throw new Error('no model_mesh.url in result: ' + JSON.stringify(result).slice(0, 250));

  const glb = await fetch(meshUrl);
  if (!glb.ok) throw new Error('download failed: ' + glb.status);
  const buf = Buffer.from(await glb.arrayBuffer());
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${agent.toUpperCase()}.glb`);
  fs.writeFileSync(out, buf);
  return { out, mb: (buf.length / 1024 / 1024).toFixed(2) };
}

(async () => {
  const arg = process.argv[2];
  const list = arg ? [arg.toLowerCase()] : AGENTS;
  console.log(`\n🧊 fal.ai image→3D (Trellis) for: ${list.join(', ')}\n`);
  let ok = 0, fail = 0;
  for (const a of list) {
    try {
      console.log(`[${a}]`);
      const { out, mb } = await imageToGlb(a);
      console.log(`  ✅ ${path.basename(out)} (${mb}MB)\n`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${a}: ${e.message}\n`);
      fail++;
    }
  }
  console.log(`Done. ${ok} ok, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
