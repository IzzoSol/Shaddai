// UI atmosphere art for dark neon glitch dashboard. Credit-bounded: EXACTLY 6 images.
const http = require('http'); const fs = require('fs'); const path = require('path');
const OUT = 'C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/public/assets/ui';
fs.mkdirSync(OUT, { recursive: true });

const IMAGES = [
  ['bg-nebula.jpg', 1280, 800, 'a vast dark cyberpunk nebula, deep black space with faint neon-green and cyan energy wisps, subtle particle field, very dark and moody, cinematic depth, atmospheric, absolutely no text no letters'],
  ['tex-circuit.jpg', 800, 800, 'a dark circuit-board micro-texture, near-black with faint glowing green traces, seamless subtle tech pattern, low brightness, absolutely no text no letters'],
  ['glow-grid.jpg', 1280, 400, 'a dark futuristic perspective grid floor receding into black, faint neon green horizon glow, tron-like, minimal, absolutely no text no letters'],
  ['forge-bg.jpg', 1000, 800, 'a dark arcane sci-fi forge chamber, black metal and neon green energy conduits, glowing molten-green core in distance, volumetric haze, dramatic, absolutely no text no letters'],
  ['panel-ornament.jpg', 600, 600, 'an ornate dark tech hexagonal frame ornament, thin glowing green filigree on pure black, symmetrical, corner decoration, absolutely no text no letters'],
  ['hero-orb.jpg', 700, 700, 'a glowing green energy sphere orb floating in black void, intricate inner circuitry, radiant neon glow, sci-fi, absolutely no text no letters'],
];

function gen(prompt, width, height) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ prompt, width, height });
    const req = http.request({ host: 'localhost', port: 3000, path: '/api/image/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej); req.setTimeout(180000, () => req.destroy(new Error('timeout'))); req.write(body); req.end();
  });
}

async function tryOne(file, w, h, prompt) {
  const r = await gen(prompt, w, h);
  const url = r && (r.url || r.image || r.data);
  if (url && typeof url === 'string' && url.startsWith('data:')) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, file), buf);
    return buf.length;
  }
  throw new Error('no image in response');
}

(async () => {
  const results = [];
  for (const [file, w, h, prompt] of IMAGES) {
    let ok = false, size = 0, err = '';
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        size = await tryOne(file, w, h, prompt);
        ok = true;
        console.log('OK   ' + file + '  ' + size + ' bytes' + (attempt > 1 ? ' (retry)' : ''));
      } catch (e) {
        err = e.message;
        console.log((attempt === 1 ? 'FAIL ' : 'FAIL2 ') + file + '  ' + err);
      }
    }
    results.push({ file, ok, size, err });
  }
  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log((r.ok ? 'SAVED ' : 'FAILED') + '  ' + r.file + (r.ok ? '  ' + r.size + ' bytes' : '  (' + r.err + ')'));
  console.log('DONE');
})();
