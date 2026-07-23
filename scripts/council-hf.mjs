import fs from 'fs';
import sharp from 'sharp';
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1].trim();
const A = 'public/assets/agents';

const SUFFIX = ', deep dark moody atmospheric background, near-black background with volumetric colored haze and faint glowing embers, dramatic cinematic rim lighting, single cohesive premium character portrait, ultra detailed, sharp focus, painterly digital art, centered figure, no text, no watermark, no letters, no numbers';

const JOBS = [
  { id:'SHADDAI', init:'scripts/council-tmp/SHADDAI.png', out:A+'/SHADDAI-council.png', backup:true,
    prompt:'majestic supreme leader and orchestrator, ornate golden crown and regal divine armor, radiant gold energy, commanding god-like presence, glowing eyes, long dark hair and beard'+SUFFIX },
  { id:'ORACLE', init:'scripts/council-tmp/ORACLE.png', out:A+'/ORACLE-council.png', backup:true,
    prompt:'mystic female oracle seer, flowing hair, glowing violet third-eye arcane energy, ethereal cosmic insight, purple magic aura, elegant robes'+SUFFIX },
  { id:'ZEROX', init:'scripts/council-tmp/ZEROX.png', out:A+'/ZEROX-council.png', backup:false,
    prompt:'sleek female warrior wielding a glowing cyan katana, neon blue hair in twin buns, black glossy tactical bodysuit, confident fighting stance, electric cyan energy'+SUFFIX },
];

async function img2img(job){
  if(job.backup && fs.existsSync(job.out)){
    const bak = job.out+'.bak-hf-20260719';
    if(!fs.existsSync(bak)) fs.copyFileSync(job.out, bak);
  }
  const b64 = 'data:image/png;base64,'+fs.readFileSync(job.init).toString('base64');
  const r = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image',{
    method:'POST', headers:{'Authorization':'Key '+FAL_KEY,'Content-Type':'application/json'},
    body: JSON.stringify({ image_url:b64, prompt:job.prompt, strength:0.58, num_inference_steps:36, guidance_scale:3.5, enable_safety_checker:false })
  });
  const j = await r.json();
  if(!(j.images&&j.images[0])){ console.log('FAIL', job.id, JSON.stringify(j).slice(0,160)); return; }
  const img = Buffer.from(await (await fetch(j.images[0].url)).arrayBuffer());
  fs.writeFileSync(job.out, img);
  console.log('OK', job.id, (img.length/1024|0)+'KB ->', job.out);
}

for(const job of JOBS){ try{ await img2img(job); }catch(e){ console.log('ERR', job.id, e.message); } }

// QUILL: just a tiny darker tone (keep the exact image, drop brightness a touch)
try{
  const qOut = A+'/QUILL-council.png';
  await sharp('scripts/council-tmp/QUILL.png').modulate({ brightness:0.85, saturation:1.02 }).png().toFile(qOut);
  console.log('OK QUILL (darkened tone) ->', qOut);
}catch(e){ console.log('ERR QUILL', e.message); }

console.log('done');
