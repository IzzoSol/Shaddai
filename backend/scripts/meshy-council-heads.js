#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MESHY COUNCIL HEADS — 3D "knowledge head" per agent for brain-head.html.
//
// PIPELINE: text-to-3D preview → refine (textured).
//
// Why not image-to-3D from the council portraits? Tried it three times (full
// 1024px portrait and a simplified 512px head crop): every run plateaued at 45%
// and then FAILED server-side with `type: timeout`. Meshy's own error says to
// simplify the input, and the crop already was. text-to-3D succeeds in a couple
// of minutes on the same account, so that's the pipeline. The council portraits
// still drive the LOOK — each agent's prompt below is written from its art.
//
// Failed tasks refund credits (verified: balance held then restored), so a
// failure costs nothing but time.
//
// Usage:
//   node meshy-council-heads.js --agent=NEXUS       # one agent
//   node meshy-council-heads.js --all               # every agent
//   node meshy-council-heads.js --preview-only      # skip the texture pass
//   node meshy-council-heads.js --status=<taskId>   # inspect any task
//   node meshy-council-heads.js --balance
//
// Key: MESHY_API_KEY (env or backend/.env).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const V2 = 'https://api.meshy.ai/openapi/v2';
const V1 = 'https://api.meshy.ai/openapi/v1';
const KEY = process.env.MESHY_API_KEY;
const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'council');

// Shape + texture prompts derived from each council portrait.
const COUNCIL = {
  NEXUS: {
    shape: 'futuristic cyborg human head bust, sleek angular tech helmet, stylized game character, clean topology',
    texture: 'sleek cyborg head, dark gunmetal armor plating, glowing cyan circuit lines, orange amber accent lights, high-tech',
  },
  PIKADON: {
    shape: 'armored sentinel helmet bust, angular faceplate mask, horned crest, stylized game character, clean topology',
    texture: 'black and crimson armored war mask, glowing red visor eyes, molten orange seams, battle-worn metal',
  },
  // Corrected from the owner's TURTLE character sheet (council/_src/TURTLE-sheet.jpg):
  // teal-green twin buns with gold cuffs, deep bronze skin, black bodysuit w/ green trim.
  TURTLE: {
    shape: 'stylized young woman head bust with twin rounded hair buns and a high collar, anime game character, clean topology',
    texture: 'vivid teal-green hair in twin buns with gold cuffs, deep bronze skin, green eyes, black high collar with glowing green trim lines',
  },
  ZEROX: {
    shape: 'stylized woman head bust with twin hair buns, sleek high collar, anime game character, clean topology',
    texture: 'dark navy hair, deep bronze skin, glossy black bodysuit collar with glowing electric cyan trim lines',
  },
  QUILL: {
    shape: 'bearded scholar head bust with swept hair and a high hooded collar, stylized game character, clean topology',
    texture: 'deep violet scholar hood and robe, warm skin, dark trimmed beard, soft gold rune glow',
  },
  ORACLE: {
    shape: 'stylized woman head bust with a high sleek ponytail and turtleneck collar, game character, clean topology',
    texture: 'dark bronze skin, black glossy turtleneck, luminous violet rim light, glowing amethyst eyes',
  },
  SHADDAI: {
    shape: 'regal masked sovereign head bust, crowned geometric halo, stylized game character, clean topology',
    texture: 'obsidian black mask with radiant gold filigree, glowing warm gold eyes, sacred geometry engraving',
  },
};

function headers() {
  if (!KEY) throw new Error('MESHY_API_KEY not set (env or backend/.env)');
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

async function balance() {
  const r = await fetch(`${V1}/balance`, { headers: headers() });
  if (!r.ok) throw new Error(`balance failed: ${r.status}`);
  return (await r.json()).balance;
}

async function post(body) {
  const r = await fetch(`${V2}/text-to-3d`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`create failed: ${r.status} ${text}`);
  return JSON.parse(text).result;
}

// Transient network blips must not orphan a live multi-minute generation.
async function poll(taskId, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${V2}/text-to-3d/${taskId}`, { headers: headers() });
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

async function waitFor(taskId, label) {
  const started = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 15000));
    const st = await poll(taskId);
    console.log(`[meshy] ${label}: ${st.status} ${st.progress ?? 0}%`);
    if (st.status === 'SUCCEEDED') return st;
    if (st.status === 'FAILED' || st.status === 'EXPIRED') {
      throw new Error(`${label} ${st.status}: ${JSON.stringify(st.task_error || {})}`);
    }
    if (Date.now() - started > 20 * 60 * 1000) {
      throw new Error(`${label}: timed out locally (task ${taskId} may still finish — --status=${taskId})`);
    }
  }
}

async function download(url, agent) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const out = path.join(OUT_DIR, `${agent}-head.glb`);
  fs.writeFileSync(out, buf);
  console.log(`[meshy] ${agent}: WROTE ${out} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  return out;
}

async function runAgent(agent, previewOnly) {
  const spec = COUNCIL[agent];
  if (!spec) throw new Error(`no prompt defined for ${agent}`);

  console.log(`[meshy] ${agent}: preview...`);
  const previewId = await post({
    mode: 'preview', prompt: spec.shape, art_style: 'realistic', should_remesh: true,
  });
  const preview = await waitFor(previewId, `${agent} preview`);

  if (previewOnly) return download(preview.model_urls.glb, agent);

  console.log(`[meshy] ${agent}: refine (texturing)...`);
  const refineId = await post({
    mode: 'refine', preview_task_id: previewId, enable_pbr: true, texture_prompt: spec.texture,
  });
  const refined = await waitFor(refineId, `${agent} refine`);
  return download(refined.model_urls.glb, agent);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };

  if (args.includes('--balance')) { console.log('credits:', await balance()); return; }
  const statusId = get('--status=');
  if (statusId) { console.log(JSON.stringify(await poll(statusId), null, 2)); return; }

  const before = await balance();
  console.log(`[meshy] credits before: ${before}`);

  const one = get('--agent=');
  const targets = args.includes('--all') ? Object.keys(COUNCIL) : [(one || 'NEXUS').toUpperCase()];
  const previewOnly = args.includes('--preview-only');
  console.log(`[meshy] generating: ${targets.join(', ')}${previewOnly ? ' (preview only)' : ''}`);

  const done = [];
  for (const agent of targets) {
    try { await runAgent(agent, previewOnly); done.push(agent); }
    catch (e) { console.error(`[meshy] ${agent} FAILED: ${e.message}`); }
  }

  const after = await balance();
  console.log(`[meshy] credits after: ${after} (spent ${before - after})`);
  console.log(`[meshy] completed ${done.length}/${targets.length}: ${done.join(', ') || 'none'}`);
}

main().catch((e) => { console.error('[meshy] FATAL:', e.message); process.exit(1); });
