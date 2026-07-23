import fs from 'fs';
import { execSync } from 'child_process';
const TOKEN = process.env.ACE;
if (!TOKEN) { console.log('no ACE token'); process.exit(1); }

const prompt = [
  "Hyper-real cinematic macro of a wild meadow at the golden-blue hour,",
  "extreme low worm eye angle looking up through towering translucent blades of grass with luminous emerald backlight,",
  "dew droplets refracting cold-cyan light like tiny lenses,",
  "small wildflowers with glowing gold-leaf petals arranged in subtle sacred Flower-of-Life symmetry,",
  "low volumetric god-rays raking through the stems, deep layered depth of field, anamorphic bokeh,",
  "faint hairline gold sacred-geometry glyphs ghosted in the deep obsidian background, dark shadowed earth below,",
  "reverent living cathedral of plants, cinematic film grain, moody and dark,",
  "emerald gold and cyan light on obsidian black",
  "--ar 16:9 --v 7 --style raw --s 250 --no text, watermark, bright blue sky, daylight, flat lighting"
].join(' ');

const TMP = 'scripts/.mj-tmp';
fs.mkdirSync(TMP, { recursive: true });

function curlPost(url, bodyObj, maxTime = 120) {
  const bf = TMP + '/req.json';
  fs.writeFileSync(bf, JSON.stringify(bodyObj));
  const cmd = `curl -s --max-time ${maxTime} -X POST "${url}" ` +
    `-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -H "Accept: application/json" ` +
    `--data-binary @${bf}`;
  const out = execSync(cmd, { maxBuffer: 64 * 1024 * 1024 }).toString();
  try { return JSON.parse(out); } catch (e) { return { __raw: out.slice(0, 700) }; }
}

function urls(o) {
  let out = [];
  if (!o || typeof o !== 'object') return out;
  if (o.image_url) out.push(o.image_url);
  if (Array.isArray(o.image_urls)) out.push(...o.image_urls);
  if (Array.isArray(o.images)) o.images.forEach(x => { if (typeof x === 'string') out.push(x); else if (x && x.image_url) out.push(x.image_url); });
  if (Array.isArray(o.data)) o.data.forEach(d => out.push(...urls(d)));
  if (o.data && !Array.isArray(o.data)) out.push(...urls(o.data));
  return out;
}

console.log('submitting...');
let j = curlPost('https://api.acedata.cloud/midjourney/imagine',
  { prompt, mode: 'fast', version: '7', quality: '1', translation: false, split_images: true }, 180);
if (j.__raw) { console.log('SUBMIT raw:', j.__raw); process.exit(0); }
console.log('SUBMIT keys:', Object.keys(j).join(','));
if (j.error || j.code || j.success === false) console.log('SUBMIT body:', JSON.stringify(j).slice(0, 500));

let got = urls(j);
const taskId = j.task_id || (j.data && j.data.task_id) || (Array.isArray(j.data) && j.data[0] && j.data[0].task_id) || j.id;
if (!got.length && taskId) {
  console.log('polling task', taskId);
  for (let i = 0; i < 30; i++) {
    execSync('sleep 9');
    let pj;
    try { pj = curlPost('https://api.acedata.cloud/midjourney/tasks', { task_id: taskId }, 60); } catch (e) { console.log('  poll err', e.message.slice(0, 80)); continue; }
    const st = (pj.data && (pj.data.state || pj.data.status || pj.data.progress)) || pj.state || pj.status || (pj.__raw ? pj.__raw.slice(0, 60) : JSON.stringify(pj).slice(0, 80));
    console.log('  poll ' + i + ' :', st);
    got = urls(pj);
    if (got.length) break;
    if (String(JSON.stringify(pj)).match(/"(state|status)"\s*:\s*"(failure|failed|error)"/i)) { console.log('FAILED:', JSON.stringify(pj).slice(0, 400)); process.exit(0); }
  }
}
if (!got.length) { console.log('no image urls. response:', JSON.stringify(j).slice(0, 700)); process.exit(0); }
console.log('IMAGES:', got.length);
fs.mkdirSync('public/assets/descent/tests', { recursive: true });
for (let i = 0; i < got.length; i++) {
  const p = 'public/assets/descent/tests/grass-mj-' + i + '.png';
  try {
    execSync(`curl -s --max-time 90 -o "${p}" "${got[i]}"`);
    const sz = fs.statSync(p).size;
    console.log('  saved ' + p + ' (' + ((sz / 1024) | 0) + 'KB)');
  } catch (e) { console.log('  dl fail', got[i].slice(0, 80)); }
}
