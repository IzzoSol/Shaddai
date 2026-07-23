// Likeness-preserving cinematic busts: crop the agent's REAL head from its canonical image,
// then low-strength FLUX img2img (keeps the same being, adds cinematic mood).
import fs from 'fs';
import sharp from 'sharp';
function falKey(){ for(const f of ['.env','.env.local']){ try{ const t=fs.readFileSync(f,'utf8'); const m=t.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)/); if(m) return m[1].trim(); }catch{} } return process.env.FAL_KEY||null; }
const KEY=falKey(); if(!KEY){ console.error('NO FAL_KEY'); process.exit(1); }

const NEG='full body, full length, T-pose, arms out, plain flat background, blurry, low quality, extra limbs, deformed, bad hands, text, watermark, different person, changed face';
const JOBS=[
  { src:'public/assets/agents/ORACLE-council.png.ref', crop:{left:190,top:70,width:500,height:500},
    out:'public/assets/agents/ORACLE-council.png', seed:70418, strength:0.46,
    prompt:'close-up cinematic bust portrait, head and shoulders, of a dark-skinned female cyber-sorceress and mystic seer with glowing violet eyes, long black-and-purple ponytail, sleek dark purple techno-bodysuit with glowing purple circuit-lightning, dramatic cinematic rim lighting, dark moody atmospheric background with soft purple bokeh, shallow depth of field, ultra detailed, keep the exact same face and character' },
  { src:'public/assets/agents/SHADDAI-portrait.png', crop:{left:222,top:20,width:580,height:580},
    out:'public/assets/agents/SHADDAI-council.png', seed:31007, strength:0.46,
    prompt:'close-up cinematic bust portrait, head and shoulders, of a golden-armored emperor deity wearing an ornate gold crown and a gold face-mask helm with glowing electric-blue eyes, a radiant halo of glowing cyan sacred glyphs orbiting behind his head, ornate gold and obsidian sacred-tech armor, white cape, dramatic cinematic rim lighting, dark cathedral atmosphere with cyan bokeh, shallow depth of field, ultra detailed, keep the exact same masked face and character' },
];

async function run(j){
  // 1) crop head+shoulders, square, upsize to 1024
  const cropBuf=await sharp(j.src).extract(j.crop).resize(1024,1024,{fit:'cover'}).png().toBuffer();
  const dataUri='data:image/png;base64,'+cropBuf.toString('base64');
  // 2) low-strength img2img to add cinematic mood, keep the being
  const r=await fetch('https://fal.run/fal-ai/flux/dev/image-to-image',{ method:'POST',
    headers:{ Authorization:'Key '+KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ image_url:dataUri, prompt:j.prompt, negative_prompt:NEG, strength:j.strength, num_inference_steps:36, guidance_scale:3.5, seed:j.seed }) });
  const d=await r.json();
  if(!r.ok) throw new Error('fal '+r.status+': '+JSON.stringify(d).slice(0,200));
  const url=(d.images&&d.images[0]&&d.images[0].url)||(d.image&&d.image.url);
  if(!url) throw new Error('no url');
  const buf=Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(j.out,buf);
  console.log('SAVED '+j.out+' '+(buf.length/1024|0)+'KB');
}
for(const j of JOBS){ try{ await run(j); }catch(e){ console.error('FAIL '+j.out+': '+e.message); } }
console.log('DONE');
