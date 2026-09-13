#!/usr/bin/env node
/* SHADDAI · spike: 5 free draft images of DIFFERENT character archetypes/concepts
 * (not camera angles this time — those are settled) in the Voxel low-poly style,
 * for browsing/picking. $0 cost (HF pool or Pollinations free fallback).
 */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const STYLE = 'voxel blocky 3D-rendered character (Minecraft or Crossy Road style), dark matte obsidian ' +
  'black (#06080b) armor/clothing as the dominant color, gold (#e8c45c) trim accents, emerald green ' +
  '(#00ff9c) and cyan (#5fe0ff) glow details, three-quarter elevated camera angle, full body visible, ' +
  'standing ready stance, flat white background, video game character reference sprite, game asset';

const CHARACTERS = [
  { id: 'warrior', label: 'Warrior/Knight', prompt: `armored knight warrior character wielding a glowing energy sword and round shield, ${STYLE}` },
  { id: 'explorer', label: 'Explorer/Adventurer', prompt: `rugged explorer adventurer character with a backpack, goggles, and a grappling hook tool, ${STYLE}` },
  { id: 'mystic', label: 'Mystic/Scholar', prompt: `hooded mystic scholar character with a glowing spellbook and floating rune symbols, ${STYLE}` },
  { id: 'engineer', label: 'Builder/Engineer', prompt: `engineer builder character wearing a tool belt and holding a wrench, with mechanical arm attachments, ${STYLE}` },
  { id: 'scout', label: 'Scout/Ranger', prompt: `agile scout ranger character with a hood, a bow, and a quiver of arrows, ${STYLE}` },
];

async function main() {
  for (const c of CHARACTERS) {
    process.stdout.write(`… ${c.id} (${c.label}) `);
    try {
      const out = await hfKeys.generateSafe(c.prompt, { width: 768, height: 768 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `char-${c.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
