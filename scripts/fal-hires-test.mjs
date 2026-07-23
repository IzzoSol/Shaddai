import fs from 'fs';
import { execSync } from 'child_process';
// read FAL_KEY from .env
const env = fs.readFileSync('.env', 'utf8');
const m = env.match(/^FAL_KEY\s*=\s*(.+)$/m);
const KEY = m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
if (!KEY) { console.log('no FAL_KEY'); process.exit(1); }

const prompt = [
  "Hyper-real cinematic macro of a wild meadow at the golden-blue hour,",
  "extreme low worm eye angle looking up through towering translucent blades of grass with luminous emerald backlight,",
  "dew droplets refracting cold-cyan light like tiny lenses,",
  "small wildflowers with glowing gold-leaf petals in subtle sacred Flower-of-Life symmetry,",
  "low volumetric god-rays raking through the stems, deep depth of field, anamorphic bokeh,",
  "faint hairline gold sacred-geometry glyphs ghosted in the deep obsidian background, dark shadowed earth,",
  "reverent living cathedral of plants, cinematic film grain, moody and dark,",
  "emerald gold and cyan light on obsidian black, no text"
].join(' ');

const TMP = 'scripts/.fal-tmp'; fs.mkdirSync(TMP, { recursive: true });
function post(url, body, maxTime = 180) {
  const bf = TMP + '/req.json'; fs.writeFileSync(bf, JSON.stringify(body));
  const cmd = `curl -s --max-time ${maxTime} -X POST "${url}" -H "Authorization: Key ${KEY}" -H "Content-Type: application/json" --data-binary @${bf}`;
  const out = execSync(cmd, { maxBuffer: 64 * 1024 * 1024 }).toString();
  try { return JSON.parse(out); } catch (e) { return { __raw: out.slice(0, 700) }; }
}

console.log('generating flux-pro v1.1-ultra (2K)...');
const j = post('https://fal.run/fal-ai/flux-pro/v1.1-ultra',
  { prompt, aspect_ratio: '16:9', num_images: 1, output_format: 'jpeg', enable_safety_checker: false });
if (j.__raw) { console.log('raw:', j.__raw); process.exit(0); }
const img = j?.images?.[0];
if (!img?.url) { console.log('no image. response:', JSON.stringify(j).slice(0, 500)); process.exit(0); }
console.log('dims:', img.width + 'x' + img.height);
fs.mkdirSync('public/assets/descent/tests', { recursive: true });
const p = 'public/assets/descent/tests/grass-ultra.jpg';
execSync(`curl -s --max-time 90 -o "${p}" "${img.url}"`);
console.log('saved', p, ((fs.statSync(p).size / 1024) | 0) + 'KB');
