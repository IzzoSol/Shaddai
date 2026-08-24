#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MESHY COUNCIL HEADS — turn the 7 council portraits into 3D head assets.
//
// Feeds public/assets/council/<AGENT>.png to Meshy's image-to-3D endpoint and
// writes the resulting GLB to public/assets/council/<AGENT>-head.glb, so
// brain.html can render an agent's actual face as the "knowledge head" you
// look into.
//
// Credits are real money: this script generates ONE agent unless --all is
// passed, and always prints the balance before and after.
//
// Usage:
//   node meshy-council-heads.js --agent=NEXUS        # one agent
//   node meshy-council-heads.js --all                # all six portraits
//   node meshy-council-heads.js --status=<taskId>    # poll an existing task
//   node meshy-council-heads.js --balance            # just show credits
//
// Key: MESHY_API_KEY env var (falls back to backend/.env).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const API = 'https://api.meshy.ai/openapi/v1';
const KEY = process.env.MESHY_API_KEY;
const COUNCIL_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'council');
const AGENTS = ['NEXUS', 'PIKADON', 'TURTLE', 'ZEROX', 'QUILL', 'ORACLE'];

function authHeaders() {
  if (!KEY) throw new Error('MESHY_API_KEY not set (env or backend/.env)');
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

async function balance() {
  const r = await fetch(`${API}/balance`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`balance failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.balance;
}

// Prefer a preprocessed head crop when one exists. Meshy times out on the full
// 1024px portraits (busy background + full-body detail); a 512px head-only crop
// is the "simplify your input" its own timeout error asks for. Make crops with:
//   ffmpeg -i council/<A>.png -vf "crop=W:H:X:Y,scale=512:512" council/_src/<A>-head.png
function sourceFile(agent) {
  const crop = path.join(COUNCIL_DIR, '_src', `${agent}-head.png`);
  if (fs.existsSync(crop)) return crop;
  const full = path.join(COUNCIL_DIR, `${agent}.png`);
  if (fs.existsSync(full)) return full;
  throw new Error(`no source image for ${agent} (looked for ${crop} and ${full})`);
}

function dataUri(agent) {
  const file = sourceFile(agent);
  console.log(`[meshy] ${agent}: source ${path.relative(COUNCIL_DIR, file)}`);
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function createTask(agent) {
  const body = {
    image_url: dataUri(agent),
    // Portraits are head-and-shoulders; ask for a bust-style asset with PBR so
    // it lights correctly against brain.html's dark obsidian ground.
    enable_pbr: true,
    should_remesh: true,
    should_texture: true,
  };
  const r = await fetch(`${API}/image-to-3d`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`create failed for ${agent}: ${r.status} ${text}`);
  const j = JSON.parse(text);
  return j.result || j.id || j.task_id;
}

// Transient network blips must not kill a 10+ minute generation: a bare
// `fetch failed` here once orphaned a live task. Retry a few times before
// giving up, and let the caller keep polling.
async function pollTask(taskId, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${API}/image-to-3d/${taskId}`, { headers: authHeaders() });
      const text = await r.text();
      if (!r.ok) throw new Error(`status ${r.status}: ${text}`);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 4000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function downloadGlb(url, agent) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`glb download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const out = path.join(COUNCIL_DIR, `${agent}-head.glb`);
  fs.writeFileSync(out, buf);
  return { out, bytes: buf.length };
}

async function runAgent(agent, existingTaskId) {
  let taskId = existingTaskId;
  if (taskId) {
    console.log(`[meshy] ${agent}: reattaching to existing task ${taskId}`);
  } else {
    console.log(`[meshy] ${agent}: creating image-to-3D task...`);
    taskId = await createTask(agent);
    console.log(`[meshy] ${agent}: task ${taskId} created; polling (this takes a few minutes)`);
  }

  const started = Date.now();
  const TIMEOUT_MS = 15 * 60 * 1000;
  for (;;) {
    await new Promise((res) => setTimeout(res, 15000));
    const st = await pollTask(taskId);
    const status = st.status || st.progress_status;
    const progress = st.progress != null ? `${st.progress}%` : '';
    console.log(`[meshy] ${agent}: ${status} ${progress}`);
    if (status === 'SUCCEEDED') {
      const url = (st.model_urls && (st.model_urls.glb || st.model_urls.GLB)) || st.model_url;
      if (!url) throw new Error(`${agent}: succeeded but no glb url in response: ${JSON.stringify(st).slice(0, 400)}`);
      const { out, bytes } = await downloadGlb(url, agent);
      console.log(`[meshy] ${agent}: WROTE ${out} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
      return { agent, taskId, out };
    }
    if (status === 'FAILED' || status === 'EXPIRED') {
      throw new Error(`${agent}: task ${status}: ${JSON.stringify(st.task_error || st).slice(0, 400)}`);
    }
    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error(`${agent}: timed out after 15min (task ${taskId} may still finish — poll with --status=${taskId})`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };

  if (args.includes('--balance')) { console.log('credits:', await balance()); return; }

  const statusId = get('--status=');
  if (statusId) { console.log(JSON.stringify(await pollTask(statusId), null, 2)); return; }

  // Reattach to a task that's already generating (e.g. after a poller crash)
  // instead of paying for a fresh render: --wait=<taskId> --agent=<NAME>
  const waitId = get('--wait=');
  if (waitId) {
    const agent = (get('--agent=') || 'NEXUS').toUpperCase();
    await runAgent(agent, waitId);
    return;
  }

  const before = await balance();
  console.log(`[meshy] credits before: ${before}`);

  const one = get('--agent=');
  const targets = args.includes('--all') ? AGENTS : (one ? [one.toUpperCase()] : ['NEXUS']);
  console.log(`[meshy] generating: ${targets.join(', ')}`);

  const done = [];
  for (const agent of targets) {
    try { done.push(await runAgent(agent)); }
    catch (e) { console.error(`[meshy] ${agent} FAILED:`, e.message); }
  }

  const after = await balance();
  console.log(`[meshy] credits after: ${after} (spent ${before - after})`);
  console.log(`[meshy] completed ${done.length}/${targets.length}:`, done.map((d) => d.agent).join(', ') || 'none');
}

main().catch((e) => { console.error('[meshy] FATAL:', e.message); process.exit(1); });
