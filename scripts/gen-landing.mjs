import fs from 'fs';
import path from 'path';
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1]?.trim();
if(!FAL_KEY){ console.error('NO FAL_KEY'); process.exit(1); }

const outDir = 'public/assets/landing';
fs.mkdirSync(outDir,{recursive:true});

const STYLE = ', SHADDAI sacred-tech aesthetic, obsidian black background, emerald #00ff9c with gold and cyan accents, volumetric glow, cinematic lighting, sacred geometry hints, highly detailed, no text, no watermark, no letters, no numbers';

// 4 step scenes (subtle, sit faint behind text) + 8 nav-area tiles (light HF images)
const JOBS = [
  ['step-1', 'abstract data streams and glowing notes and documents dissolving into particles of light flowing into a single emerald core, minimal, ethereal'],
  ['step-2', 'seven glowing energy orbs of different colors arranged in a circle collaborating and exchanging beams of light, emerald gold cyan violet, ethereal, minimal'],
  ['step-3', 'a single glowing emerald checkmark inside a hexagonal gate of light, approval, minimal, ethereal'],
  ['step-4', 'finished glowing artifacts and documents radiating outward as beams of delivered light, minimal, ethereal'],
  ['tab-worlds',  'aerial view of an isometric neon sacred-geometry city of AI agents, emerald and gold towers, dark cinematic'],
  ['tab-council', 'seven cosmic AI agent archetypes standing together as a council, emerald gold cyan violet red auras, dark cinematic group portrait'],
  ['tab-create',  'a glowing digital forge crafting an AI operative from streams of light and code, emerald sparks, dark cinematic'],
  ['tab-play',    'a neon arcade sports arena with glowing athletes mid-action, cyan and magenta energy, dark cinematic'],
  ['tab-signals', 'glowing financial candlestick charts and crypto market data streams rising, gold and cyan, dark cinematic'],
  ['tab-aura',    'a glowing golden balance scale and ledger made of pure light and energy, sacred geometry, dark cinematic'],
  ['tab-shop',    'a neon bazaar marketplace of floating digital artifacts and agents, gold and emerald stalls of light, dark cinematic'],
  ['tab-codex',   'an ancient illuminated manuscript glowing with sacred geometry and neon runes, gold and emerald ink, dark cinematic'],
];

async function gen(id, desc, seed){
  const prompt = desc + STYLE;
  const r = await fetch('https://fal.run/fal-ai/flux/dev',{
    method:'POST', headers:{ 'Authorization':'Key '+FAL_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt, image_size: id.startsWith('step')?'landscape_4_3':'square_hd', num_images:1, num_inference_steps:28, guidance_scale:3.5, enable_safety_checker:false, seed })
  });
  if(!r.ok){ console.log('FAIL', id, r.status, (await r.text()).slice(0,140)); return; }
  const j = await r.json();
  const url = j.images?.[0]?.url;
  if(!url){ console.log('NO IMG', id); return; }
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(outDir, id+'.png'), img);
  console.log('OK', id, (img.length/1024|0)+'KB');
}

let seed=11;
for(const [id,desc] of JOBS){ try{ await gen(id,desc,seed+=7); }catch(e){ console.log('ERR',id,e.message); } }
console.log('done ->', outDir);
