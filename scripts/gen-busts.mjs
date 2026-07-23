// Generate CINEMATIC BUST headshots (PIKADON/TURTLE style) for ORACLE + SHADDAI via fal FLUX.
import fs from 'fs';
function falKey(){ for(const f of ['.env','.env.local']){ try{ const t=fs.readFileSync(f,'utf8'); const m=t.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)/); if(m) return m[1].trim(); }catch{} } return process.env.FAL_KEY||null; }
const KEY=falKey(); if(!KEY){ console.error('NO FAL_KEY'); process.exit(1); }

const STYLE=', cinematic close-up bust portrait, head and shoulders only, dramatic cinematic rim lighting, moody atmospheric background with soft glowing bokeh, shallow depth of field, ultra detailed digital character art, concept portrait, 8k, volumetric light';
const NEG='full body, full length, wide shot, whole figure, legs, feet, T-pose, arms out, plain white background, plain grey studio background, flat background, blurry, low quality, extra limbs, deformed, bad hands, text, watermark, signature, logo';

const JOBS=[
  { out:'public/assets/agents/ORACLE-council.png', seed:70418,
    prompt:'ORACLE, a fierce dark-skinned female cyber-sorceress and mystic seer, long black hair with glowing violet-purple energy streaks pulled into a high ponytail, luminous glowing violet eyes, a glowing third-eye sigil on her forehead, sleek dark-purple techno-bodysuit with glowing purple circuit-lightning veins at the collar and shoulders, crackling purple lightning arcs around her, purple and violet neon glow'+STYLE },
  { out:'public/assets/agents/SHADDAI-council.png', seed:31007,
    prompt:'SHADDAI, a sovereign golden-armored emperor deity and supreme orchestrator, ornate gold helm and crown, a radiant floating halo of glowing cyan sacred glyphs orbiting his head, glowing electric-blue eyes, intricate gold and obsidian sacred-tech pauldrons with glowing cyan Hebrew glyphs at the collar, white ceremonial cape, majestic and divine, gold and cyan neon glow, dark cathedral atmosphere'+STYLE },
];

async function gen(j){
  const r=await fetch('https://fal.run/fal-ai/flux/dev',{ method:'POST', headers:{ Authorization:'Key '+KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ prompt:j.prompt, negative_prompt:NEG, image_size:{width:1024,height:1024}, num_inference_steps:34, guidance_scale:3.5, seed:j.seed }) });
  const d=await r.json();
  if(!r.ok){ throw new Error('fal '+r.status+': '+JSON.stringify(d).slice(0,200)); }
  const url=(d.images&&d.images[0]&&d.images[0].url)||(d.image&&d.image.url);
  if(!url) throw new Error('no url: '+JSON.stringify(d).slice(0,200));
  const buf=Buffer.from(await (await fetch(url)).arrayBuffer());
  if(fs.existsSync(j.out)&&!fs.existsSync(j.out+'.bodybak')) fs.copyFileSync(j.out,j.out+'.bodybak');
  fs.writeFileSync(j.out,buf);
  console.log('SAVED '+j.out+' '+(buf.length/1024|0)+'KB');
}
for(const j of JOBS){ try{ await gen(j); }catch(e){ console.error('FAIL '+j.out+': '+e.message); } }
console.log('DONE');
