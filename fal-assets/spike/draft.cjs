#!/usr/bin/env node
/* SHADDAI · one-off spike: generate a FREE draft image (HF pool, or Pollinations
 * fallback if no local HF key) to lock the isometric pose before spending any
 * fal credits on the img2img detail pass. Throwaway spike code, not a permanent
 * pipeline — see the conversation this came from for context.
 */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const PROMPT = "full-body slightly-crouched ready stance, human-shaped AI agent \"The Archivist\", " +
  "2:1 isometric tile projection at 30 degree elevation, 45 degree rotation, viewed from front-right " +
  "(right shoulder and head fully visible, left side foreshortened), feet positioned at lower-left of tile, " +
  "torso leaning forward 15 degrees, right arm extended holding a slim glowing data-tablet (gold-edged, cyan " +
  "circuit pattern on screen), left hand resting on a belt holo-pouch emitting emerald pulse, narrow angular " +
  "obsidian visor with thin gold trim, thin gold crest-line down the spine, matte obsidian torso with " +
  "semi-gloss emerald shoulder and forearm accents, palette locked to obsidian #06080b, emerald #00ff9c, " +
  "gold #e8c45c, cyan #5fe0ff, transparent background";

async function main() {
  const out = await hfKeys.generateSafe(PROMPT, { width: 1024, height: 1024 });
  const outPath = path.join(__dirname, 'archivist-draft.png');
  if (out.buffer) {
    fs.writeFileSync(outPath, out.buffer);
    console.log('draft saved (provider=' + out.provider + '):', outPath, out.buffer.length + ' bytes');
    return;
  }
  if (out.fallbackUrl) {
    console.log('no HF key locally — using free Pollinations fallback:', out.fallbackUrl);
    const r = await fetch(out.fallbackUrl);
    if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log('draft saved (provider=pollinations-free):', outPath, buf.length + ' bytes');
    return;
  }
  throw new Error('no buffer and no fallbackUrl — unexpected generateSafe() result');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
