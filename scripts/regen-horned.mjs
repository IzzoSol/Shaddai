import fs from 'fs';
import path from 'path';

// Load FAL_KEY from .env
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1]?.trim();
if(!FAL_KEY){ console.error('NO FAL_KEY'); process.exit(1); }

const cat = JSON.parse(fs.readFileSync('backend/data/collectables/catalog.json','utf8'));
const arr = Array.isArray(cat)?cat:(cat.items||cat.collectables||Object.values(cat)[0]);

const IDS = ['c47','c53','c59','c63','c67','c69'];
const dir = 'backend/data/collectables/images';
const bak = dir+'/.bak-horned-20260719';
fs.mkdirSync(bak,{recursive:true});

// strip the horn interpretation: keep the card's own prompt, append a hard no-horns clause
const NOHORNS = ', clean bare forehead, no horns, no ram horns, no demon horns, no bull horns, no antlers, no pointed head protrusions, smooth human head';

async function gen(id){
  const m = arr.find(z=>z.id===id);
  if(!m){ console.log('skip (no meta)', id); return; }
  const prompt = (m.prompt||'') + NOHORNS;
  const r = await fetch('https://fal.run/fal-ai/flux/dev',{
    method:'POST',
    headers:{ 'Authorization':'Key '+FAL_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt, image_size:'square_hd', num_images:1, num_inference_steps:28, guidance_scale:3.5, enable_safety_checker:false })
  });
  if(!r.ok){ console.log('FAIL', id, r.status, (await r.text()).slice(0,180)); return; }
  const j = await r.json();
  const url = j.images?.[0]?.url;
  if(!url){ console.log('NO IMG', id, JSON.stringify(j).slice(0,160)); return; }
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  const dest = path.join(dir, id+'.png');
  // backup once
  const bdest = path.join(bak, id+'.png');
  if(fs.existsSync(dest) && !fs.existsSync(bdest)) fs.copyFileSync(dest, bdest);
  fs.writeFileSync(dest, img);
  console.log('OK', id, '->', (img.length/1024|0)+'KB', '('+(m.nm||m.name)+')');
}

for(const id of IDS){
  try{ await gen(id); }catch(e){ console.log('ERR', id, e.message); }
}
console.log('done. backups in', bak);
