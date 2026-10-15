/* tools/owner-loading-art.cjs — the owner's FINAL intro / loading / cutscene art (2026-10-04). Converts each source to a small WebP
 * (1280 px wide, q72) in public/assets/loading/owner/ and prints the SLIDES array for world-loading-slides.js.  node tools/owner-loading-art.cjs */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const DL = 'C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/', FAL = 'C:/Users/Brittany/OneDrive/Pictures/LF2/MODELS FOR FAL/';
const SRC = [
  [DL + 'image (37).jpg'], [FAL + 'ZEROX-council.png', 'ZEROX', 'Markets move. We read them first.'], [DL + 'image (40).jpg'], [DL + 'image (14).jpg'],
  [FAL + 'agent-nexus.png', 'NEXUS', 'Every skill, one tap away.'], [DL + 'image (15).jpg'], [DL + 'image (16).jpg'], [FAL + 'agent-pikadon.png', 'PIKADON', 'Nothing gets past the shield.'],
  [DL + 'image (17).jpg'], [DL + 'image (18).jpg'], [FAL + 'QUILL-council.png', 'QUILL', 'Say it clearly. Say it once.'], [DL + 'image (20).jpg'], [DL + 'image (22).jpg'],
  [DL + '9c607f325e287e52b27fcf10f4b2b491.jpg'], [DL + 'image (13).jpg'], [DL + 'image (42).jpg'], [DL + 'b55f2c795e079ef22457e7d3c435ee43.jpg'],
  [DL + 'bedc1fbe2f57d9e876d02d66220eeb68.jpg'], [DL + 'image (35).jpg']
];
const LINES = ['One world. Every agent. Yours to shape.', 'The Ringed Realm awaits.', 'Seven agents. One army.', 'Build it. Ride it. Own it.', 'Never fight alone.'];
const OUT = path.join(__dirname, '..', 'public', 'assets', 'loading', 'owner');
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const slides = []; let k = 0;
  for (let i = 0; i < SRC.length; i++) {
    const [src, who, line] = SRC[i]; if (!fs.existsSync(src)) { console.error('missing', src); continue; }
    const name = String(++k).padStart(2, '0') + '.webp';
    await sharp(src).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(OUT, name));
    slides.push({ src: '/assets/loading/owner/' + name, who: who || 'SHADDAI WORLD', line: line || LINES[i % LINES.length] });
  }
  const kb = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
  fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify(slides, null, 1));
  console.log(slides.length, 'slides,', Math.round(kb), 'KB total');
})();
