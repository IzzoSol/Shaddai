/* tools/_ab-sheet.cjs — stack A/B screenshots into one review sheet (left = A, right = B), half size.
 *   node tools/_ab-sheet.cjs <out.png> <a1.png> <b1.png> [<a2.png> <b2.png> ...] */
const sharp = require('sharp');
(async () => {
  const [out, ...files] = process.argv.slice(2), W = 450, H = 260, rows = files.length / 2, comp = [];
  for (let i = 0; i < files.length; i++) comp.push({ input: await sharp(files[i]).resize(W, H).toBuffer(), left: (i % 2) * W, top: Math.floor(i / 2) * H });
  await sharp({ create: { width: W * 2, height: H * rows, channels: 3, background: '#000' } }).composite(comp).png().toFile(out);
  console.log('sheet', out);
})();
