// contact-sheet.mjs — thumbs (tools/blender/assets/thumbs.py) → labelled contact sheets per group.
//   NODE_PATH=…/Shaddai/node_modules node tools/ual/contact-sheet.mjs <thumbdir> <list.json> <outdir>
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, 'sharp') : 'sharp');
const [TD, LIST, OUT] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(LIST, 'utf8')), idx = JSON.parse(fs.readFileSync(path.join(TD, 'index.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true }); console.log('items', list.length);
const T = 256, CAP = 34, COLS = 8, PER = 48;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const groups = {};
for (const it of list) { const g = it.group.split('-')[0]; (groups[g] ||= []).push(it); }
for (const [g, items] of Object.entries(groups)) {
  const ok = items.filter((it) => fs.existsSync(path.join(TD, it.id + '.png')));
  for (let s = 0; s * PER < ok.length; s++) {
    const page = ok.slice(s * PER, (s + 1) * PER), rows = Math.ceil(page.length / COLS);
    const comps = [];
    page.forEach((it, i) => {
      const x = (i % COLS) * T, y = Math.floor(i / COLS) * (T + CAP), r = idx[it.id] || {};
      const nm = it.id.split('__').pop().slice(0, 30), sz = r.size_m ? r.size_m.map((v) => v < 10 ? v.toFixed(1) : Math.round(v)).join('×') + 'm' : '';
      comps.push({ input: path.join(TD, it.id + '.png'), left: x, top: y });
      comps.push({ input: Buffer.from(`<svg width="${T}" height="${CAP}"><rect width="100%" height="100%" fill="#06080b"/><text x="4" y="13" font-family="Arial" font-size="12" fill="#00ff9c">${esc(`${s * PER + i + 1}. ${nm}`)}</text><text x="4" y="28" font-family="Arial" font-size="11" fill="#e8c45c">${esc(`${sz}  ${r.tris ?? '?'}t${r.arm ? '  rig' : ''}${r.anims ? ' ' + r.anims + 'anim' : ''}`)}</text></svg>`), left: x, top: y + T });
    });
    const f = path.join(OUT, `${g}-${s + 1}.jpg`);
    await sharp({ create: { width: COLS * T, height: rows * (T + CAP), channels: 3, background: '#06080b' } }).composite(comps).jpeg({ quality: 82 }).toFile(f);
    console.log(f, page.length);
  }
}
