import fs from 'fs';
import { execSync } from 'child_process';
const env = fs.readFileSync('.env', 'utf8');
const KEY = (env.match(/^FAL_KEY\s*=\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!KEY) { console.log('no FAL_KEY'); process.exit(1); }

const STYLE = "cinematic film grain, moody and dark, deep depth of field, anamorphic bokeh, volumetric god-rays, emerald gold and cyan light on obsidian black, reverent, sacred, hyper-detailed, no text, no watermark";

const SCENES = [
  { out: 'public/assets/journey/water-hd.jpg', ar: '16:9', prompt:
    "Cinematic close-up of a vast dark ocean seen from just above the surface, obsidian depths below, cold-cyan and emerald caustic light-nets dancing across the water in cymatics ripple patterns forming concentric sacred Flower-of-Life interference rings, gold bioluminescent particles suspended like drifting stars, low cyan mist, sunlight glinting gold on the ripples, mirror-still yet alive" },
  { out: 'public/assets/journey/earth-hd.jpg', ar: '16:9', prompt:
    "Epic cinematic view of Earth curved horizon from high atmosphere, a radiant sun cresting with emerald and gold corona flares, the day-side terminator sweeping into deep obsidian night glittering with cold-cyan city-light constellations, a faint gold Metatron cube sacred-geometry wireframe ghosted over the planet curvature, anamorphic lens flares, deep space, the heart of the journey, vast" },
  { out: 'public/assets/journey/cosmos-hd.jpg', ar: '16:9', prompt:
    "Awe-scale cinematic deep-space vista, mostly obsidian black threaded with a cosmic web of galaxies, nebulae and supernova remnants strung in luminous emerald and cold-cyan filament chains, a great ringed gas-giant planet with gold-leaf glowing rings, faint gold planetary glyph engravings, nebula god-rays, anamorphic bokeh star-orbs, sacred cosmic sublime, universes within universes" },
  { out: 'public/assets/journey/tree-hd.jpg', ar: '9:16', prompt:
    "The Kabbalistic Tree of Life materializing in obsidian cosmic space, ten radiant sephiroth spheres glowing emerald gold and cyan connected by 22 luminous gold pathways of pure light, a faint Metatron cube wireframe underlying the whole structure now fully visible, hairline gold Hebrew letters and alchemical glyphs engraved along each path, a Jacob ladder shaft of light rising toward a brilliant golden crown at the apex, sacred architecture of the divine, symmetrical, luminous" }
];

const TMP = 'scripts/.fal-tmp'; fs.mkdirSync(TMP, { recursive: true });
function ultra(prompt, ar) {
  const bf = TMP + '/req.json';
  fs.writeFileSync(bf, JSON.stringify({ prompt: prompt + ', ' + STYLE, aspect_ratio: ar, num_images: 1, output_format: 'jpeg', enable_safety_checker: false }));
  const cmd = `curl -s --max-time 200 -X POST "https://fal.run/fal-ai/flux-pro/v1.1-ultra" -H "Authorization: Key ${KEY}" -H "Content-Type: application/json" --data-binary @${bf}`;
  const out = execSync(cmd, { maxBuffer: 64 * 1024 * 1024 }).toString();
  try { return JSON.parse(out); } catch (e) { return { __raw: out.slice(0, 400) }; }
}

// grass: promote the already-generated 2.75K ultra into place
if (fs.existsSync('public/assets/descent/tests/grass-ultra.jpg')) {
  if (fs.existsSync('public/assets/journey/grass.jpg')) fs.copyFileSync('public/assets/journey/grass.jpg', 'public/assets/journey/grass.jpg.bak-960');
  fs.copyFileSync('public/assets/descent/tests/grass-ultra.jpg', 'public/assets/journey/grass.jpg');
  console.log('grass.jpg <- 2.75K ultra (promoted)');
}

for (const s of SCENES) {
  process.stdout.write('generating ' + s.out.split('/').pop() + ' (' + s.ar + ') ... ');
  const j = ultra(s.prompt, s.ar);
  const img = j?.images?.[0];
  if (!img?.url) { console.log('FAIL', JSON.stringify(j).slice(0, 200)); continue; }
  if (fs.existsSync(s.out)) fs.copyFileSync(s.out, s.out + '.bak-960');
  execSync(`curl -s --max-time 90 -o "${s.out}" "${img.url}"`);
  console.log(img.width + 'x' + img.height + '  ' + ((fs.statSync(s.out).size / 1024) | 0) + 'KB');
}
console.log('DONE hi-res scene bases');
