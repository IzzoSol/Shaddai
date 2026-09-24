#!/usr/bin/env node
/* SHADDAI · character-pipeline.mjs
 *
 * The validated, reusable recipe for turning ONE reference image into a
 * real, rigged, walking (and running) 3D character. Every step of this was
 * proven live on the "warrior" character (2026-09-17) -- see
 * fal-assets/spike/3d-preview.html for the working result.
 *
 * STEPS (all through fal, same account/billing as everything else here):
 *   1. image-to-3D  : fal-ai/hunyuan3d/v2  { input_image_url, textured_mesh:true }
 *      -> a textured GLB mesh
 *   2. auto-rig     : fal-ai/meshy/rigging { model_url: <mesh from step 1> }
 *      -> a rigged GLB/FBX + baked walking_glb/running_glb animations, FREE
 *         as part of the same call (no extra generation needed for basic
 *         locomotion)
 *
 * THE ONE HARD REQUIREMENT: the reference image MUST be a clean, unobstructed
 * pose -- arms and legs clearly separated from the torso, no weapon/shield
 * held across the body, no cape covering the legs. A dynamic combat pose
 * WILL fail step 2's pose estimation ("Pose estimation failed... must be a
 * humanoid character with clearly defined limbs"). This was confirmed live:
 * the original "combat pose" warrior image failed rigging outright; a
 * text2img neutral standing pose (arms down at sides, no held weapon)
 * succeeded on the first try.
 *
 * USAGE:
 *   node fal-assets/character-pipeline.mjs <name> <path-to-clean-pose-image.png>
 *
 * Always confirms cost before spending -- this hits real paid endpoints
 * (roughly $0.50-0.60 total per character: ~$0.375 for textured mesh,
 * rigging's own price on top). No --go flag needed since there's no cheap
 * dry-run for 3D/rigging APIs (unlike generate.mjs's 2D image batches) --
 * this script always spends when run. Only run it once you're sure the
 * source image is clean.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function falKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();   // env first (never printed); .env fallback
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = env.match(/^FAL_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error('FAL_KEY not found in .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function dataUri(path) {
  const buf = readFileSync(resolve(ROOT, path));
  return 'data:image/png;base64,' + buf.toString('base64');
}

async function submit(model, input, key) {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`submit ${model} failed: ${JSON.stringify(json)}`);
  return json; // { request_id, status_url, response_url, ... }
}

async function pollUntilDone(statusUrl, responseUrl, key, label, maxWaitMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const stJson = await st.json();
    if (stJson.status === 'COMPLETED') {
      const rr = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` } });
      return rr.json();
    }
    if (stJson.status === 'FAILED' || stJson.status === 'ERROR') {
      throw new Error(`${label} failed: ${JSON.stringify(stJson)}`);
    }
    console.log(`  ... ${label}: ${stJson.status}`);
  }
  throw new Error(`${label} timed out after ${maxWaitMs}ms`);
}

async function download(url, outPath) {
  const abs = resolve(ROOT, outPath);
  mkdirSync(dirname(abs), { recursive: true });
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(abs, buf);
  return { abs, bytes: buf.length };
}

async function main() {
  // --meshy6 : ONE call (fal-ai/meshy/v6/image-to-3d, $0.80) = mesh + T-pose + rig + animation + real-world height.
  //   Sharper faces/textures than hunyuan v2 ($0.16) + meshy rigging ($0.80) = $0.96, and cheaper.
  // --height <m> : rigging_height_meters (default 1.8; the SHADDAI adult unit)
  const argv = process.argv.slice(2);
  const useM6 = argv.includes('--meshy6');
  const hIdx = argv.indexOf('--height');
  const heightM = hIdx >= 0 ? parseFloat(argv[hIdx + 1]) : 1.8;
  const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--height');
  const [name, imagePath, actionIdsArg] = pos;
  if (!name || !imagePath) {
    console.error('usage: node fal-assets/character-pipeline.mjs <name> <path-to-clean-pose-image.png> [action_ids]');
    console.error('  action_ids: optional comma-separated Meshy animation-library ids, e.g. "89,97,178"');
    console.error('  see https://docs.meshy.ai/en/api/animation-library for the full 500+ preset list.');
    console.error('the image MUST be a clean, unobstructed pose -- see the header comment in this file.');
    process.exit(1);
  }
  if (!existsSync(resolve(ROOT, imagePath))) {
    console.error(`image not found: ${imagePath}`);
    process.exit(1);
  }
  const actionIds = actionIdsArg ? actionIdsArg.split(',').map((s) => parseInt(s.trim(), 10)) : null;

  const key = falKey();
  const outDir = process.env.OUTDIR || `fal-assets/characters/${name}`;

  if (useM6) {
    console.log(`▶ meshy v6 pipeline for "${name}" -- $0.80 (mesh + T-pose + rig + animation, ${heightM} m)`);
    const input = {
      image_url: dataUri(imagePath), pose_mode: 't-pose', enable_rigging: true, rigging_height_meters: heightM,
      enable_pbr: true, symmetry_mode: 'auto', enable_animation: !!actionIds, target_polycount: parseInt(process.env.M6_POLY || '30000', 10),
    };
    if (actionIds) input.animation_action_id = actionIds[0];
    // --static : buildings/props/landmarks -- no rig, no T-pose (OUTDIR env chooses the folder)
    if (argv.includes('--static')) { input.enable_rigging = false; input.enable_animation = false; input.pose_mode = ''; delete input.animation_action_id; }
    // Skin-tone fidelity: v6 texturing can lighten skin. --guide-texture feeds the reference back as texture guidance;
    // M6_TEXTURE_PROMPT adds an explicit instruction (e.g. "deep brown skin tone, do not lighten").
    if (argv.includes('--guide-texture')) input.texture_image_url = dataUri(imagePath);
    if (process.env.M6_TEXTURE_PROMPT) input.texture_prompt = process.env.M6_TEXTURE_PROMPT;
    const sub = await submit('fal-ai/meshy/v6/image-to-3d', input, key);
    const res = await pollUntilDone(sub.status_url, sub.response_url, key, 'meshy v6', 900000);
    if (res.detail) { console.error('❌ MESHY V6 FAILED: ' + JSON.stringify(res.detail)); process.exit(1); }
    const saves6 = [['model_glb', `${name}-mesh.glb`], ['rigged_character_glb', `${name}-rigged.glb`], ['rigged_character_fbx', `${name}-rigged.fbx`], ['animation_glb', `${name}-action.glb`], ['animation_fbx', `${name}-action.fbx`]];
    for (const [k2, file] of saves6) if (res[k2]?.url) { const f = await download(res[k2].url, `${outDir}/${file}`); console.log(`   saved: ${f.abs} (${(f.bytes / 1e6).toFixed(2)} MB)`); }
    for (const [ak, av] of Object.entries(res.basic_animations || {})) if (av?.url) {
      const ext = ak.endsWith('_fbx') ? 'fbx' : 'glb';
      const f = await download(av.url, `${outDir}/${name}-${ak.replace(/_(glb|fbx)$/, '')}.${ext}`); console.log(`   saved: ${f.abs} (${(f.bytes / 1e6).toFixed(2)} MB)`);
    }
    console.log(`
✔ Done. Character "${name}" (meshy v6) in ${outDir}/`);
    return;
  }
  console.log(`▶ character pipeline for "${name}" -- this spends real money (~$0.96 total: hunyuan $0.16 + rigging $0.80).`);
  if (actionIds) console.log(`   extra animation presets requested: ${actionIds.join(', ')}`);

  console.log('1/2: image-to-3D (fal-ai/hunyuan3d/v2, textured_mesh:true)...');
  const meshSubmit = await submit('fal-ai/hunyuan3d/v2', {
    input_image_url: dataUri(imagePath),
    textured_mesh: true
  }, key);
  const meshResult = await pollUntilDone(meshSubmit.status_url, meshSubmit.response_url, key, 'mesh generation');
  const meshUrl = meshResult.model_mesh.url;
  const meshFile = await download(meshUrl, `${outDir}/${name}-mesh.glb`);
  console.log(`   mesh saved: ${meshFile.abs} (${(meshFile.bytes / 1e6).toFixed(2)} MB)`);

  console.log('2/2: auto-rig + basic animations (fal-ai/meshy/rigging)...');
  const rigInput = { model_url: meshUrl };
  if (actionIds) {
    rigInput.enable_animation = true;
    if (actionIds.length > 1) rigInput.action_ids = actionIds;
    else rigInput.animation_action_id = actionIds[0];
  }
  const rigSubmit = await submit('fal-ai/meshy/rigging', rigInput, key);
  const rigResult = await pollUntilDone(rigSubmit.status_url, rigSubmit.response_url, key, 'rigging', 480000);

  if (rigResult.detail) {
    // Meshy's pose-estimation-failure shape: { detail: [{ msg: "..." }] }
    console.error('❌ RIGGING FAILED -- almost always means the source image pose wasn\'t clean enough:');
    console.error('   ' + JSON.stringify(rigResult.detail));
    console.error('   Fix: regenerate the reference image with arms/legs clearly separated,');
    console.error('   nothing (weapon/shield/cape) overlapping the torso or limbs, then retry.');
    process.exit(1);
  }

  const saves = [
    ['rigged_character_glb', `${name}-rigged.glb`],
    ['rigged_character_fbx', `${name}-rigged.fbx`],
    ['animation_glb', `${name}-action.glb`],
    ['animation_fbx', `${name}-action.fbx`],
  ];
  for (const [key2, file] of saves) {
    if (rigResult[key2]?.url) {
      const f = await download(rigResult[key2].url, `${outDir}/${file}`);
      console.log(`   saved: ${f.abs} (${(f.bytes / 1e6).toFixed(2)} MB)`);
    }
  }
  const anims = rigResult.basic_animations || {};
  for (const [animKey, animVal] of Object.entries(anims)) {
    if (animVal?.url) {
      const ext = animKey.endsWith('_fbx') ? 'fbx' : 'glb';
      const f = await download(animVal.url, `${outDir}/${name}-${animKey.replace(/_(glb|fbx)$/, '')}.${ext}`);
      console.log(`   saved: ${f.abs} (${(f.bytes / 1e6).toFixed(2)} MB)`);
    }
  }

  console.log(`\n✔ Done. Character "${name}" is rigged with baked walk/run animations in ${outDir}/`);
}

main().catch((e) => { console.error('PIPELINE FAILED:', e.message); process.exit(1); });
