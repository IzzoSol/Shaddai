// One-off generator: 8 archetype 3D character models via Meshy text->3D.
// Writes GLB + thumbnail to public/assets/forge-models/ and a manifest.json.
const fs = require('fs');
const path = require('path');
const core = require('./forge-core');

const MESHY_KEY = 'msy_Y4mJn5Ot96iQjHfpUp3ldrdmaW6d7hhOCBCA';
const AUTH = { Authorization: `Bearer ${MESHY_KEY}` };
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
fs.mkdirSync(OUT, { recursive: true });

const STYLE_SUFFIX = 'full body character, T-pose, game-ready, neon sci-fi, clean topology, single character';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function promptFor(key) {
  const a = core.ARCHETYPES[key];
  const lo = a.loadout;
  // order: body, hair, headwear, eyes, outfit, handheld, aura, accent
  const order = ['body', 'hair', 'headwear', 'eyes', 'outfit', 'handheld', 'aura', 'accent'];
  const frags = order.map(s => (core.ASSETS[s][lo[s]] || {}).fragment).filter(Boolean);
  return `${a.name} operative: ${frags.join(', ')}, ${STYLE_SUFFIX}`;
}

async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function genOne(key) {
  const prompt = promptFor(key);
  const create = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', prompt, art_style: 'realistic', should_remesh: true }),
  });
  if (create.status !== 202 && !create.ok) {
    throw new Error(`create ${create.status}: ${await create.text()}`);
  }
  const { result: taskId } = await create.json();
  process.stdout.write(`[${key}] task ${taskId} `);
  for (let i = 0; i < 60; i++) {
    await sleep(15000);
    const poll = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`, { headers: AUTH });
    const t = await poll.json();
    process.stdout.write(`.${t.status}(${t.progress || 0}) `);
    if (t.status === 'SUCCEEDED') {
      const glbUrl = t.model_urls && t.model_urls.glb;
      const thumb = t.thumbnail_url;
      const glbSize = await dl(glbUrl, path.join(OUT, `${key}.glb`));
      let thumbOk = false;
      try { if (thumb) { await dl(thumb, path.join(OUT, `${key}.png`)); thumbOk = true; } } catch (e) {}
      console.log(`\n[${key}] OK glb=${(glbSize/1024).toFixed(0)}KB thumb=${thumbOk}`);
      return { glbSize, thumbOk };
    }
    if (t.status === 'FAILED') {
      throw new Error(`FAILED: ${(t.task_error && t.task_error.message) || 'unknown'}`);
    }
  }
  throw new Error('timeout');
}

(async () => {
  const keys = Object.keys(core.ARCHETYPES);
  const manifest = { archetypes: {} };
  const results = {};
  for (const key of keys) {
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      try {
        const r = await genOne(key);
        results[key] = { ok: true, ...r };
        manifest.archetypes[key] = {
          glb: `/assets/forge-models/${key}.glb`,
          thumb: r.thumbOk ? `/assets/forge-models/${key}.png` : null,
          name: core.ARCHETYPES[key].name,
        };
        done = true;
      } catch (e) {
        console.log(`\n[${key}] attempt ${attempt} error: ${e.message}`);
        if (attempt === 2) results[key] = { ok: false, error: e.message };
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('manifest written to', path.join(OUT, 'manifest.json'));
})();
