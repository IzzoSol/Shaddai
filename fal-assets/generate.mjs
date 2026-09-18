#!/usr/bin/env node
/* SHADDAI · fal.ai asset generator
 * Reads a batch manifest (fal-assets/batches/<name>.json), calls fal, saves outputs,
 * verifies each file. Auto-prepends the STYLE SPINE and appends the SHARED NEGATIVE
 * per the Art Bible rules.
 *
 * SAFETY: DRY-RUN by default — builds + prints every request but spends NOTHING.
 *   Preview:  node fal-assets/generate.mjs batch-1-descent
 *   Execute:  node fal-assets/generate.mjs batch-1-descent --go
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── shared prompt DNA (Art Bible §0) ──────────────────────────────────────
const SPINE_CINEMATIC =
  "Cinematic occult-almanac sci-fi, ancient sacred wisdom fused with future technology. " +
  "Deep obsidian-black void #06080b, luminous neon-emerald #00ff9c, illuminated-manuscript gold-leaf #e8c45c, " +
  "cold cyan #5fe0ff as the only accent lights. High-contrast, dark, reverent, luminous, precise. " +
  "Etched sacred geometry, hairline gold Hebrew/alchemical glyphs, volumetric god-rays, fine film grain, " +
  "subtle chromatic aberration, deep depth-of-field, anamorphic bokeh. Museum-grade, no text, no watermark. ";
const SPINE_PIXEL =
  "Isometric pixel-art, clean 2:1 tile projection, crisp anti-aliased edges, palette-locked colors " +
  "(emerald #00ff9c, gold #e8c45c, cyan #5fe0ff, obsidian #06080b, stone-grey #6b7280, deep-teal #0f3d3e). " +
  "Single light source upper-left 45 degrees, soft ambient occlusion, no gradient banding, game-ready spritesheet quality. ";
const NEG =
  "text, watermark, signature, logo, UI, letters, caption, low-res, jpeg artifacts, blurry, muddy, oversaturated, " +
  "garish rainbow, cartoon, childish, clip-art, stock-photo lighting, flat lighting, washed out, " +
  "purple-on-white AI-slop gradient, extra limbs, deformed, inconsistent light direction, mismatched palette";

// ── .env FAL_KEY ──────────────────────────────────────────────────────────
function falKey() {
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^FAL_KEY\s*=\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}

// ── local file → data URI (for image→image inputs) ────────────────────────
function dataUri(path) {
  const p = resolve(ROOT, path);
  const buf = readFileSync(p);
  const ext = p.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

// ── build a fal request from a manifest job ───────────────────────────────
function buildRequest(job) {
  const spine = job.register === 'raw' ? '' : job.register === 'pixel' ? SPINE_PIXEL : SPINE_CINEMATIC;
  const prompt = `${spine}${job.body} Negative: ${NEG}.`;
  const input = { prompt, num_images: 1 };
  if (job.size) input.image_size = job.size;              // e.g. "square_hd", "landscape_16_9"
  if (job.seed != null) input.seed = job.seed;
  let model = job.model;
  if (job.type === 'img2img') {
    model = model || 'fal-ai/flux/dev/image-to-image';
    input.image_url = dataUri(job.input);
    input.strength = job.strength ?? 0.6;
  } else if (job.type === 'video') {
    model = model || 'fal-ai/bytedance/seedance/v1/lite/image-to-video';
    if (job.input) input.image_url = dataUri(job.input);
    if (job.duration) input.duration = job.duration;
  } else {
    model = model || 'fal-ai/flux/dev';                   // text→image still
  }
  return { model, input, out: job.out, id: job.id };
}

async function callFal(model, input, key) {
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const url = j?.images?.[0]?.url || j?.video?.url || j?.image?.url;
  if (!url) throw new Error('no output url in fal response: ' + JSON.stringify(j).slice(0, 200));
  return url;
}

async function download(url, outPath) {
  const abs = resolve(ROOT, outPath);
  mkdirSync(dirname(abs), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(abs, buf);
  return { abs, bytes: buf.length };
}

// ── main ──────────────────────────────────────────────────────────────────
const [, , batchName, flag] = process.argv;
const GO = flag === '--go';
if (!batchName) { console.error('usage: node fal-assets/generate.mjs <batch> [--go]'); process.exit(1); }

const manifestPath = join(__dirname, 'batches', `${batchName}.json`);
if (!existsSync(manifestPath)) { console.error('manifest not found:', manifestPath); process.exit(1); }
const jobs = JSON.parse(readFileSync(manifestPath, 'utf8'));
const key = falKey();

console.log(`\n▶ batch "${batchName}" — ${jobs.length} jobs — ${GO ? 'LIVE (spending)' : 'DRY-RUN (no spend)'}`);
if (GO && !key) { console.error('✖ no FAL_KEY in .env — cannot run live'); process.exit(1); }

let ok = 0, fail = 0;
for (const job of jobs) {
  let req;
  try { req = buildRequest(job); }
  catch (e) { console.log(`  ✖ ${job.id}: build error — ${e.message}`); fail++; continue; }

  if (!GO) {
    const kind = job.type || 'text2img';
    const inNote = job.input ? ` ← ${job.input}${job.strength ? ` (i2i ${job.strength})` : ''}` : '';
    console.log(`  • ${job.id} [${kind}] ${req.model}${inNote}\n      → ${job.out}\n      prompt: ${req.input.prompt.slice(0, 110)}…`);
    ok++;
    continue;
  }
  try {
    process.stdout.write(`  … ${job.id} → fal(${req.model}) `);
    const url = await callFal(req.model, req.input, key);
    const { bytes } = await download(url, req.out);
    console.log(`✔ ${(bytes / 1024 | 0)}KB → ${job.out}`);
    ok++;
  } catch (e) { console.log(`✖ ${e.message}`); fail++; }
}
console.log(`\n${GO ? 'DONE' : 'DRY-RUN COMPLETE'} — ok:${ok} fail:${fail}\n`);
process.exit(fail ? 1 : 0);
