#!/usr/bin/env node
/* SHADDAI · spike: 5 free draft images, each a different game-camera angle/style,
 * to find out which (if any) a flux-family model will actually hold via prompting
 * alone — before deciding whether to touch the 2D world's isometric convention.
 * Throwaway spike code. $0 cost (HF pool or Pollinations free fallback).
 */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const CHAR = 'human-shaped AI agent "The Archivist", holding a slim glowing data-tablet, ' +
  'obsidian #06080b armor with emerald #00ff9c and gold #e8c45c accents, cyan #5fe0ff glow details';

const STYLES = [
  {
    id: 'topdown-birdseye',
    label: 'Straight top-down / bird\'s-eye (classic Zelda-style RPG)',
    prompt: `video game character reference sprite, ${CHAR}, straight top-down bird's-eye view camera ` +
      `directly overhead, full body visible, standing ready stance, simple flat background, game asset, clean lines`,
  },
  {
    id: '3q-stardew',
    label: '3/4 top-down RPG (Stardew Valley / Pokemon angle)',
    prompt: `video game character reference sprite, ${CHAR}, three-quarter top-down RPG camera angle ` +
      `(like Stardew Valley or Pokemon), full body visible, standing ready stance, simple flat background, game asset, clean lines`,
  },
  {
    id: 'side-platformer',
    label: 'Side-view platformer (Metroidvania profile)',
    prompt: `video game character reference sprite, ${CHAR}, direct side-view profile camera ` +
      `(2D platformer / Metroidvania style), full body visible, standing ready stance, simple flat background, game asset, clean lines`,
  },
  {
    id: 'chibi-topdown',
    label: 'Chibi/cute stylized top-down (Animal Crossing style)',
    prompt: `video game character reference sprite, chibi cute stylized proportions big head small body, ${CHAR}, ` +
      `three-quarter top-down camera angle (like Animal Crossing), full body visible, standing ready stance, ` +
      `simple flat background, game asset, clean lines`,
  },
  {
    id: 'voxel-blocky',
    label: 'Voxel/blocky 3D-render top-down (Minecraft/Crossy-Road style)',
    prompt: `video game character reference sprite, voxel blocky 3D-rendered character (Minecraft or Crossy Road style), ${CHAR}, ` +
      `three-quarter elevated camera angle, full body visible, standing ready stance, simple flat background, game asset`,
  },
];

async function main() {
  for (const s of STYLES) {
    process.stdout.write(`… ${s.id} (${s.label}) `);
    try {
      const out = await hfKeys.generateSafe(s.prompt, { width: 768, height: 768 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `style-${s.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
