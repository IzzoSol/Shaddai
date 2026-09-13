#!/usr/bin/env node
/* SHADDAI · spike: 5 free draft accessory icon concepts (flat item icons, not
 * posed characters) for browsing. $0 cost (HF pool or Pollinations fallback). */
const path = require('path');
const fs = require('fs');
const hfKeys = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'hf-keys.js'));

const STYLE = 'single game item icon, isolated on flat white background, no character, no body, item icon ' +
  'only, dark matte obsidian black (#06080b) base material, gold (#e8c45c) trim accents, emerald green ' +
  '(#00ff9c) or cyan (#5fe0ff) glow details, clean game asset';

const ITEMS = [
  { id: 'crown', label: 'Crown/Circlet (headwear)', prompt: `ornate futuristic crown circlet headwear accessory, ${STYLE}` },
  { id: 'cape', label: 'Cape/Cloak (back slot)', prompt: `flowing armored cape cloak accessory with a clasp, ${STYLE}` },
  { id: 'staff', label: 'Staff/Weapon', prompt: `glowing energy staff weapon accessory with a crystal top, ${STYLE}` },
  { id: 'companion', label: 'Companion/Pet', prompt: `small floating drone companion pet accessory, round and friendly shape, ${STYLE}` },
  { id: 'wings', label: 'Wings (back slot)', prompt: `mechanical energy wings back accessory, angular blade-like feathers, ${STYLE}` },
];

async function main() {
  for (const it of ITEMS) {
    process.stdout.write(`… ${it.id} (${it.label}) `);
    try {
      const out = await hfKeys.generateSafe(it.prompt, { width: 640, height: 640 });
      let buf;
      if (out.buffer) { buf = out.buffer; }
      else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('pollinations fetch failed: ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else throw new Error('no buffer/fallbackUrl');
      const outPath = path.join(__dirname, `item-${it.id}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`✔ (${out.provider || 'pollinations-free'}) ${outPath}`);
    } catch (e) {
      console.log(`✖ ${e.message}`);
    }
  }
}

main();
