import fs from 'fs';
import sharp from 'sharp';
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1].trim();

const STYLE = ', premium character face portrait, head and shoulders close-up, neck up, face centered facing the viewer, deep dark moody atmospheric background, near-black background with soft colored volumetric haze, dramatic cinematic rim lighting, volumetric glow, ultra detailed face, sharp focus, semi-realistic painterly concept art, artstation quality, highly detailed, no text, no watermark, no letters, no numbers';

const JOBS = [
  { id:'SHADDAI', out:'public/assets/agents/SHADDAI-council.png',
    prompt:'a majestic supreme AI overlord king, ornate golden crown and divine golden ornate armor, radiant warm gold energy, glowing golden eyes, regal god-like commanding face, dark hair and short beard, wise and powerful'+STYLE, seed:41 },
  { id:'ORACLE', out:'public/assets/agents/ORACLE-council.png',
    prompt:'a mystic female oracle seer, glowing violet third eye on her forehead, long flowing purple and silver hair, ethereal arcane violet energy, serene mysterious knowing face, cosmic sorceress'+STYLE, seed:52 },
  { id:'ZEROX', out:'public/assets/agents/ZEROX-council.png',
    prompt:'a confident female cyber warrior, neon cyan and blue hair in twin buns, sleek black glossy tactical bodysuit with high collar, electric cyan energy accents, sharp determined beautiful face, neon valkyrie'+STYLE, seed:63 },
];

async function gen(job){
  const bak = job.out+'.bak-preface-20260719';
  if(fs.existsSync(job.out) && !fs.existsSync(bak)) fs.copyFileSync(job.out, bak);
  const r=await fetch('https://fal.run/fal-ai/flux/dev',{method:'POST',headers:{'Authorization':'Key '+FAL_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({prompt:job.prompt, image_size:'square_hd', num_images:1, num_inference_steps:40, guidance_scale:3.5, enable_safety_checker:false, seed:job.seed})});
  const j=await r.json();
  if(!(j.images&&j.images[0])){ console.log('FAIL',job.id,JSON.stringify(j).slice(0,150)); return; }
  const img=Buffer.from(await(await fetch(j.images[0].url)).arrayBuffer());
  await sharp(img).resize(1024,1024,{fit:'cover'}).png({compressionLevel:9,effort:8}).toFile(job.out+'.tmp');
  fs.renameSync(job.out+'.tmp', job.out);
  console.log('OK',job.id,(fs.statSync(job.out).size/1024|0)+'KB');
}
for(const job of JOBS){ try{ await gen(job); }catch(e){ console.log('ERR',job.id,e.message); } }
console.log('done');
