#!/usr/bin/env node
/* SHADDAI · generate real character portraits for the 7 actual agents, each in
 * their now-LOCKED identity color (docs/SHADDAI_HALL_MASTER_BUILD_BIBLE.md),
 * using the same voxel low-poly archetype+prop framing that worked well for
 * the fantasy characters. $0 cost (HF pool or Pollinations free fallback). */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const STYLE = 'voxel blocky 3D-rendered character (Minecraft or Crossy Road style), three-quarter ' +
  'elevated camera angle, full body visible, standing ready stance, flat white background, video ' +
  'game character reference sprite, game asset';

const AGENTS = [
  { id: 'shaddai', label: 'SHADDAI — sovereign gold commander', prompt:
    `regal sovereign commander character wearing an ornate golden crown and holding a glowing golden ` +
    `scepter, armor is dark obsidian black with prominent bright gold (#e8c45c) trim and a golden ` +
    `cape, ${STYLE}` },
  { id: 'oracle', label: 'ORACLE — arcane purple researcher', prompt:
    `hooded mystic researcher character holding a glowing purple crystal orb and an ancient book, ` +
    `dark robes with prominent arcane purple (#8b7bf0) glowing trim and psychic energy wisps, ${STYLE}` },
  { id: 'turtle', label: 'TURTLE — bio-neon green creative', prompt:
    `creative builder character holding a glowing paintbrush and a floating holographic design panel, ` +
    `dark clothing with prominent bio-neon green (#00ff9c) organic-tech glowing accents and vines, ${STYLE}` },
  { id: 'zerox', label: 'ZEROX — electric blue markets', prompt:
    `sharp market trader character holding a glowing holographic stock chart and a coin, dark suit ` +
    `with prominent electric blue (#00c8ff) circuit-line trim and a data-grid cape, ${STYLE}` },
  { id: 'nexus', label: 'NEXUS — steel gray engineer (robot)', prompt:
    `industrial robot engineer character holding a large wrench and a glowing circuit board, chassis ` +
    `is dark matte black with prominent steel gray (#87909c) and chrome (#c5ccd5) armor plating, ${STYLE}` },
  { id: 'quill', label: 'QUILL — cyan writer', prompt:
    `elegant writer character holding a glowing quill pen and an unrolled scroll, dark clothing with ` +
    `prominent cyan (#5fe0ff) glowing ink-line trim and floating letter glyphs, ${STYLE}` },
  { id: 'pikadon', label: 'PIKADON — crimson red guardian', prompt:
    `armored guardian sentinel character holding a glowing shield and a short blade, dark armor with ` +
    `prominent crimson red (#ff5a4d) glowing trim and a defensive energy aura, ${STYLE}` },
];

async function main() {
  for (const a of AGENTS) {
    process.stdout.write(`… ${a.id} (${a.label}) `);
    try {
      const out = await hfKeys.generateSafe(a.prompt, { width: 768, height: 768 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `agent-${a.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
