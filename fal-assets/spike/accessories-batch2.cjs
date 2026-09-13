#!/usr/bin/env node
/* SHADDAI · batch 2: fill out the accessory store with more variety per slot
 * (2-3 items per slot instead of 1) and fill the empty "mask" slot entirely.
 * Same flat-icon framing that worked well in batch 1. $0 cost. */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const STYLE = 'single game item icon, isolated on flat white background, no character, no face, no ' +
  'body, item icon only, dark matte obsidian black (#06080b) base material, gold (#e8c45c) trim ' +
  'accents, emerald green (#00ff9c) or cyan (#5fe0ff) glow details, clean game asset';

const ITEMS = [
  // hat (currently only hat_crown)
  { id: 'hat_horns', slot: 'hat', prompt: `demonic curved horns headwear accessory with glowing runes, ${STYLE}` },
  { id: 'hat_halo', slot: 'hat', prompt: `floating glowing halo ring headwear accessory, ${STYLE}` },
  // weapon (currently only weapon_staff)
  { id: 'weapon_blade', slot: 'weapon', prompt: `curved energy blade sword weapon accessory with a glowing edge, ${STYLE}` },
  { id: 'weapon_hammer', slot: 'weapon', prompt: `heavy war hammer weapon accessory with glowing rune engravings, ${STYLE}` },
  // pet (currently only pet_drone)
  { id: 'pet_wisp', slot: 'pet', prompt: `small floating glowing spirit wisp orb companion pet accessory, ${STYLE}` },
  { id: 'pet_hound', slot: 'pet', prompt: `small robotic mechanical hound companion pet accessory, ${STYLE}` },
  // wings (currently only wings_dark)
  { id: 'wings_feather', slot: 'wings', prompt: `elegant angelic feathered wings back accessory with glowing tips, ${STYLE}` },
  { id: 'wings_thruster', slot: 'wings', prompt: `mechanical jet thruster wings back accessory with exhaust glow, ${STYLE}` },
  // cape (currently only cape_royal)
  { id: 'cape_tattered', slot: 'cape', prompt: `tattered battle-worn cloak cape accessory with frayed edges, ${STYLE}` },
  // mask (currently EMPTY — real gap)
  { id: 'mask_visor', slot: 'mask', prompt: `sleek angular sci-fi visor mask accessory covering the eyes, ${STYLE}` },
  { id: 'mask_respirator', slot: 'mask', prompt: `armored respirator breathing mask accessory covering the lower face, ${STYLE}` },
];

async function main() {
  for (const it of ITEMS) {
    process.stdout.write(`… ${it.id} (${it.slot}) `);
    try {
      const out = await hfKeys.generateSafe(it.prompt, { width: 640, height: 640 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `item2-${it.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
