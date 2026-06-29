#!/usr/bin/env node
/**
 * Generate a FULL-BODY agent portrait via fal.ai FLUX (head-to-feet, not cropped).
 * Saves to backend/data/forge-art/char-<agent>.png (overwrites).
 *   node backend/scripts/generate-agent-image-fal.js quill
 * Requires FAL_KEY (env or .env.local).
 */
const fs = require('fs');
const path = require('path');

function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.replace(/^["']|["']$/g, '');
  try { const t = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
    const m = t.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)["']?/); if (m) return m[1].trim(); } catch {}
  return null;
}
const FAL_KEY = loadFalKey();
if (!FAL_KEY) { console.error('FAL_KEY not found'); process.exit(1); }

const ART = path.join(__dirname, '..', 'data', 'forge-art');
const FULLBODY = ', FULL BODY shot, entire figure head to toe, both feet visible and planted on the ground, full-length character, standing straight, generous empty margin above the head and below the feet, centered, nothing cropped, knees and shins and feet clearly in frame';
const STYLE = ', full body character concept art, heroic standing pose, neon Tron aesthetic, glowing circuit edges, deep dark void background, cinematic rim lighting, high detail digital art, 3/4 front view';
const NEG = 'cropped, cut off, close-up, portrait crop, knees cut, feet cut, out of frame, zoomed in, headshot, bust, half body, blurry, low quality, white background';

const PROMPTS = {
  quill: 'scholarly scribe mystic, hooded sage cowl, flowing ink-rune robes that fall to the ankles, swirling parchment aura, glowing quill pen, warm amber glow, full boots visible',
};

async function gen(agent) {
  const prompt = (PROMPTS[agent] || (agent + ' character')) + FULLBODY + STYLE;
  console.log('Generating full-body', agent, '…');
  const r = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, negative_prompt: NEG, image_size: { width: 832, height: 1472 }, num_inference_steps: 32, guidance_scale: 3.5, seed: Math.floor(Math.random() * 1e6) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('fal ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
  const url = (j.image && j.image.url) || (j.images && j.images[0] && j.images[0].url);
  if (!url) throw new Error('no image url: ' + JSON.stringify(j).slice(0, 200));
  const img = await fetch(url); const buf = Buffer.from(await img.arrayBuffer());
  if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true });
  const out = path.join(ART, 'char-' + agent + '.png');
  // keep the old one as a backup once
  if (fs.existsSync(out) && !fs.existsSync(out + '.bak')) fs.copyFileSync(out, out + '.bak');
  fs.writeFileSync(out, buf);
  console.log('✅ saved', out, (buf.length / 1024).toFixed(0) + 'KB');
}

const agent = (process.argv[2] || 'quill').toLowerCase();
gen(agent).then(() => process.exit(0)).catch(e => { console.error('✗', e.message); process.exit(1); });
