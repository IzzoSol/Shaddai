#!/usr/bin/env node
/* SHADDAI · forge.mjs — one command, one finished character.
 *
 * This wraps the three scripts that already work (generate.mjs's text2img
 * call, character-pipeline.mjs, capture-sprites.mjs) behind a single
 * entrypoint, so producing a character costs ONE tool call instead of
 * eight. It also hard-codes the parts that are expensive to get wrong:
 * the T-pose language below is the exact wording that survives Meshy's
 * pose estimation. Every rigging failure we paid for during 2026-09-17/18
 * came from varying it. Callers supply only the LOOK.
 *
 * USAGE
 *   node fal-assets/forge.mjs character <name> --look "<who they are + what they wear>"
 *        [--actions 89,97,178] [--proportions tall|chibi] [--style painted|voxel]
 *        [--frames 8] [--go]
 *   node fal-assets/forge.mjs sprites <name> [frames]
 *   node fal-assets/forge.mjs check <name>
 *
 * DRY-RUN BY DEFAULT. Without --go it prints the composed prompt and the
 * plan and spends nothing. With --go it spends ~$0.60-0.70 (flux image +
 * hunyuan3d textured mesh + meshy rig). Sprite capture is free.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── the locked pose block ─────────────────────────────────────────────────
// Do not reword. Meshy's auto-rigger rejects anything where the hands touch
// the torso, the arms angle downward, or the character holds a prop; each of
// those cost a paid mesh + a failed rig before we pinned this down.
const POSE = 'standing in a strict scarecrow T-POSE facing the camera dead-on: ' +
  'BOTH ARMS LOCKED COMPLETELY STRAIGHT OUT HORIZONTALLY TO THE SIDES at exactly shoulder ' +
  'height, elbows perfectly straight, both open empty hands with fingers spread, a large ' +
  'visible gap of empty background between each hand and the torso, nothing held (no weapon, ' +
  'no gear, hands completely empty), legs straight shoulder-width apart.';

const PROPORTIONS = {
  tall: 'REAL ADULT HUMAN PROPORTIONS (7-8 heads tall, NOT chibi, NOT stylized-short) -- an athletic normal build.',
  chibi: 'Stylized chibi proportions (roughly 3 heads tall, large head, compact body) -- matches the original Lantern Order roster.',
};

const STYLES = {
  painted: {
    register: 'raw',
    lead: 'Character reference sheet illustration, painted digital cel-shaded art style with bold clean linework (like a professional character-design turnaround, not a photo).',
  },
  voxel: {
    register: 'raw',
    lead: 'Character reference sheet illustration of a blocky voxel toy figure, flat-shaded cube-based construction with crisp square edges (like a collectible vinyl toy render, not a photo).',
  },
};

const TAIL = 'Plain flat light-grey studio background so the silhouette reads clearly, ' +
  'full body visible head to feet, no text, no logos, no watermark';

// Meshy animation-library ids worth knowing (full list: docs.meshy.ai/en/api/animation-library).
// Walk + run come free with every rig; these are the extras worth paying for.
const KNOWN_ACTIONS = {
  4: 'Attack', 89: 'Combat_Stance', 97: 'Left_Slash',
  125: 'Charged_Spell_Cast', 178: 'Hit_Reaction', 224: 'Archery_Shot',
};

function falKey() {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = env.match(/^FAL_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error('FAL_KEY not found in .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function composePrompt({ look, proportions, style }) {
  const s = STYLES[style];
  return `${s.lead} ${look.trim().replace(/\.?$/, ',')} ${POSE} ${PROPORTIONS[proportions]} ${TAIL}`;
}

function arg(flags, name, fallback = null) {
  const i = flags.indexOf(`--${name}`);
  return i === -1 ? fallback : flags[i + 1];
}

function run(script, args) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [resolve(__dirname, script), ...args], {
      cwd: ROOT, stdio: 'inherit',
    });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${script} exited ${code}`))));
  });
}

async function text2img(prompt, outPath, key) {
  const res = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, num_images: 1, image_size: 'square_hd' }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const url = j?.images?.[0]?.url;
  if (!url) throw new Error('no image url in response');
  const abs = resolve(ROOT, outPath);
  mkdirSync(dirname(abs), { recursive: true });
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(abs, buf);
  return { abs, bytes: buf.length };
}

// ── commands ──────────────────────────────────────────────────────────────

async function cmdCharacter(name, flags) {
  const look = arg(flags, 'look');
  if (!look) throw new Error('--look is required: describe who they are and what they wear');
  const proportions = arg(flags, 'proportions', 'tall');
  const style = arg(flags, 'style', 'painted');
  const frames = parseInt(arg(flags, 'frames', '8'), 10);
  const actions = arg(flags, 'actions');
  const go = flags.includes('--go');
  if (!PROPORTIONS[proportions]) throw new Error(`--proportions must be one of: ${Object.keys(PROPORTIONS).join(', ')}`);
  if (!STYLES[style]) throw new Error(`--style must be one of: ${Object.keys(STYLES).join(', ')}`);

  const prompt = composePrompt({ look, proportions, style });
  const imgPath = `fal-assets/spike/char-${name}-tpose.png`;
  const manifestPath = `fal-assets/batches/char-${name}-tpose.json`;

  // Always write the manifest, even on a dry run -- it's the reproducible
  // record of what produced this character, and it's re-runnable through
  // generate.mjs on its own if the forge step needs to be resumed.
  mkdirSync(resolve(ROOT, 'fal-assets/batches'), { recursive: true });
  writeFileSync(resolve(ROOT, manifestPath), JSON.stringify([{
    id: `char-${name}-tpose`, type: 'text2img', register: STYLES[style].register,
    size: 'square_hd', body: prompt, out: imgPath,
  }], null, 2) + '\n');

  console.log(`\n▶ forge character "${name}"  [${style} · ${proportions}]`);
  console.log(`  manifest: ${manifestPath}`);
  if (actions) {
    const labels = actions.split(',').map((a) => `${a.trim()}=${KNOWN_ACTIONS[a.trim()] || '?'}`);
    console.log(`  extra animations: ${labels.join(', ')}`);
  }
  console.log(`\n--- composed prompt ---\n${prompt}\n-----------------------\n`);

  if (!go) {
    console.log('DRY RUN — nothing spent. Steps that would run:');
    console.log(`  1. flux/dev text2img            -> ${imgPath}`);
    console.log(`  2. hunyuan3d + meshy rigging    -> fal-assets/characters/${name}/`);
    console.log(`  3. headless sprite capture (free, ${frames} frames/clip)`);
    console.log('\nRe-run with --go to spend (~$0.60-0.70).');
    return;
  }

  console.log('1/3: T-pose reference image (fal-ai/flux/dev)...');
  const img = await text2img(prompt, imgPath, falKey());
  console.log(`   saved: ${img.abs} (${(img.bytes / 1e3).toFixed(0)} KB)`);
  console.log('   ⚠ LOOK AT THIS IMAGE before trusting the rig. If the arms are not');
  console.log('     dead-horizontal with clear air between hands and torso, stop and');
  console.log('     re-run step 1 -- rigging a bad pose wastes the mesh cost too.\n');

  console.log('2/3: mesh + rig...');
  await run('character-pipeline.mjs', actions ? [name, imgPath, actions] : [name, imgPath]);

  console.log('\n3/3: sprite capture (free)...');
  await run('capture-sprites.mjs', [name, String(frames)]);

  cmdCheck(name);
}

function cmdCheck(name) {
  const dir = resolve(ROOT, `fal-assets/characters/${name}`);
  if (!existsSync(dir)) { console.log(`✗ no such character: ${name}`); return; }
  const files = readdirSync(dir);
  const sprites = existsSync(join(dir, 'sprites')) ? readdirSync(join(dir, 'sprites')) : [];
  const has = (suffix) => files.some((f) => f.endsWith(suffix));
  console.log(`\n── ${name} ──`);
  console.log(`  mesh        ${has('-mesh.glb') ? '✔' : '✗'}`);
  console.log(`  rigged      ${has('-rigged.glb') ? '✔' : '✗'}`);
  console.log(`  walk/run    ${has('-walking.glb') ? '✔' : '✗'} / ${has('-running.glb') ? '✔' : '✗'}`);
  console.log(`  action clip ${has('-action.glb') ? '✔' : '✗'}`);
  console.log(`  2D sprites  ${sprites.filter((f) => f.endsWith('-strip.png')).length} strips, ${sprites.length} files`);
  console.log(`  3D↔2D parity ${has('-rigged.glb') && sprites.length ? '✔ (same rig feeds both realms)' : '✗ INCOMPLETE'}`);
}

const [, , cmd, name, ...flags] = process.argv;
const commands = {
  character: () => cmdCharacter(name, flags),
  sprites: () => run('capture-sprites.mjs', [name, flags[0] || '8']),
  check: () => cmdCheck(name),
};

if (!commands[cmd] || !name) {
  console.error('usage:');
  console.error('  node fal-assets/forge.mjs character <name> --look "<description>" [--actions 89,97] [--proportions tall|chibi] [--style painted|voxel] [--frames 8] [--go]');
  console.error('  node fal-assets/forge.mjs sprites <name> [frames]');
  console.error('  node fal-assets/forge.mjs check <name>');
  process.exit(1);
}
Promise.resolve(commands[cmd]()).catch((e) => { console.error('FORGE FAILED:', e.message); process.exit(1); });
