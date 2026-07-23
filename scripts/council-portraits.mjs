import fs from 'fs';
import sharp from 'sharp';
const env = fs.readFileSync('.env','utf8');
const FAL_KEY = (env.match(/FAL_KEY\s*=\s*(.+)/)||[])[1].trim();

const SUF = ', head and shoulders close-up portrait, neck up, face centered and clearly visible, looking at viewer, deep dark moody atmospheric background, near-black background with soft colored haze, dramatic cinematic rim lighting, single cohesive premium character portrait, ultra detailed face, sharp focus, painterly digital art, no text, no watermark, no letters';

// crop boxes as fractions [left, top, side] of the source (square crop around the head)
const JOBS = [
  { id:'SHADDAI', src:'scripts/council-tmp/SHADDAI.png', box:[0.20,0.02,0.60],
    prompt:'majestic supreme leader king, ornate golden crown, radiant gold divine energy, glowing eyes, dark hair and beard, commanding presence'+SUF },
  { id:'ORACLE', src:'scripts/council-tmp/ORACLE.png', box:[0.24,0.03,0.54],
    prompt:'mystic female oracle seer, flowing hair, glowing violet third-eye arcane energy, ethereal cosmic gaze, purple magic aura'+SUF },
  { id:'ZEROX', src:'scripts/council-tmp/ZEROX.png', box:[0.30,0.02,0.42],
    prompt:'sleek confident female warrior, neon blue hair in twin buns, black tactical outfit collar, electric cyan energy, sharp determined gaze'+SUF },
];

async function run(job){
  const meta = await sharp(job.src).metadata();
  const W=meta.width, H=meta.height;
  let side = Math.round(job.box[2]*W);
  let left = Math.round(job.box[0]*W);
  let top  = Math.round(job.box[1]*H);
  side = Math.min(side, W-left, H-top);
  const crop = await sharp(job.src).extract({left,top,width:side,height:side}).resize(1024,1024,{fit:'cover'}).png().toBuffer();
  fs.writeFileSync('scripts/council-tmp/'+job.id+'-crop.png', crop);
  const b64='data:image/png;base64,'+crop.toString('base64');
  const r=await fetch('https://fal.run/fal-ai/flux/dev/image-to-image',{method:'POST',headers:{'Authorization':'Key '+FAL_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({image_url:b64, prompt:job.prompt, strength:0.5, num_inference_steps:36, guidance_scale:3.5, enable_safety_checker:false})});
  const j=await r.json();
  if(!(j.images&&j.images[0])){ console.log('FAIL',job.id,JSON.stringify(j).slice(0,150)); return; }
  const img=Buffer.from(await(await fetch(j.images[0].url)).arrayBuffer());
  fs.writeFileSync('scripts/council-tmp/'+job.id+'-portrait.png', img);
  console.log('OK',job.id,(img.length/1024|0)+'KB');
}
for(const job of JOBS){ try{ await run(job); }catch(e){ console.log('ERR',job.id,e.message); } }
console.log('done — previews in scripts/council-tmp/*-portrait.png');
