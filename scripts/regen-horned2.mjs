import fs from 'fs';
import path from 'path';
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1]?.trim();
const cat = JSON.parse(fs.readFileSync('backend/data/collectables/catalog.json','utf8'));
const arr = Array.isArray(cat)?cat:(cat.items||cat.collectables||Object.values(cat)[0]);
const dir = 'backend/data/collectables/images';

// concrete head feature replaces the horn tendency (no negation — FLUX ignores negatives)
const HEAD = {
  c53: 'short slicked-back dark hair, smooth bare forehead, sleek cyberpunk look',
  c63: 'short neat hair, smooth bare forehead, subtle thin metallic circlet band',
  c69: 'sleek smooth metallic circlet crown flush to the head, smooth forehead'
};

function rebuild(m, id){
  // rebuild prompt WITHOUT any horn trigger: keep style, inject concrete head feature
  return 'premium NFT trading-card character portrait, cyberpunk '+(m.kind==='robot'?'robot AI operative, sleek mechanical design':'human operative, painterly stylized portrait')
    + ', ' + HEAD[id]
    + (m.aura? ', '+m.aura.toLowerCase()+' energy aura':'')
    + ', ' + (m.faction||'') + ' faction, teal cyan and deep navy with colorful vibrant accents, dramatic rim lighting, volumetric glow, intricate fine detail, sharp focus, centered bust, dark atmospheric background, cohesive collectible art style, highly detailed, no text, no watermark, '+(m.rar||'')+' tier';
}

async function gen(id, seed){
  const m = arr.find(z=>z.id===id);
  const prompt = rebuild(m, id);
  const r = await fetch('https://fal.run/fal-ai/flux/dev',{
    method:'POST', headers:{ 'Authorization':'Key '+FAL_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt, image_size:'square_hd', num_images:1, num_inference_steps:28, guidance_scale:3.5, enable_safety_checker:false, seed })
  });
  if(!r.ok){ console.log('FAIL', id, r.status, (await r.text()).slice(0,160)); return; }
  const j = await r.json();
  const url = j.images?.[0]?.url;
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(dir, id+'.png'), img);
  console.log('OK', id, (img.length/1024|0)+'KB', 'seed='+seed);
}
// distinct seeds to avoid re-rolling the same horned composition
const jobs = [['c53',7],['c63',19],['c69',42]];
for(const [id,seed] of jobs){ try{ await gen(id,seed); }catch(e){ console.log('ERR',id,e.message); } }
console.log('done');
