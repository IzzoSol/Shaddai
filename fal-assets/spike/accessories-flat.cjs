#!/usr/bin/env node
/* SHADDAI · regenerate all 11 existing accessory icons in a FLAT style that
 * actually matches pixel-people.js's classic rig (flat two-tone box shading,
 * hard edges, no gradients/gloss/realistic rendering) -- the original batch
 * used a glossy painterly-3D-icon style that clashes badly next to the
 * simple flat character. Same ids/slots, same output filenames -- this
 * REPLACES the existing accessory art, catalog.json needs no changes. $0. */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const STYLE = 'flat 2D vector game icon, solid flat colors only, simple bold geometric shapes, thick ' +
  'clean dark outline, NO gradients, NO gloss, NO realistic shading, NO 3D rendering, flat design ' +
  'icon like a mobile game UI asset, isolated on plain white background, no character, no body';

const ITEMS = [
  { id: 'hat_crown', prompt: `an ornate crown headwear icon, flat obsidian black base with flat gold trim and a flat emerald gem, ${STYLE}` },
  { id: 'hat_horns', prompt: `a pair of curved demon horns headwear icon, flat obsidian black with flat emerald glowing rune shapes, ${STYLE}` },
  { id: 'weapon_staff', prompt: `a wizard staff weapon icon with a crystal top, flat obsidian black shaft with flat gold trim and a flat emerald crystal, ${STYLE}` },
  { id: 'weapon_axe', prompt: `a battle axe weapon icon, flat obsidian black handle with a flat gold-trimmed emerald blade, ${STYLE}` },
  { id: 'pet_drone', prompt: `a small round flying drone companion icon, flat obsidian black body with flat gold trim rings and flat emerald lights, ${STYLE}` },
  { id: 'pet_wisp', prompt: `a small floating glowing orb spirit companion icon, flat emerald green sphere with flat gold ring accents, ${STYLE}` },
  { id: 'wings_dark', prompt: `a pair of dark angel wings back-item icon, flat obsidian black feathers with flat gold trim edges, ${STYLE}` },
  { id: 'wings_feather', prompt: `a pair of elegant feathered angel wings back-item icon, flat obsidian black feathers with flat emerald glowing tips, ${STYLE}` },
  { id: 'cape_royal', prompt: `a royal cape cloak icon with a clasp, flat obsidian black fabric with a flat gold trim collar and emerald gem clasp, ${STYLE}` },
  { id: 'cape_tattered', prompt: `a tattered hooded cloak icon with frayed edges, flat obsidian black fabric with a flat gold trim collar, ${STYLE}` },
  { id: 'mask_visor', prompt: `a sci-fi visor mask icon, flat obsidian black frame with a flat cyan glowing lens, ${STYLE}` },
];

async function main() {
  for (const it of ITEMS) {
    process.stdout.write(`… ${it.id} `);
    try {
      const out = await hfKeys.generateSafe(it.prompt, { width: 640, height: 640 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `flat-${it.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
