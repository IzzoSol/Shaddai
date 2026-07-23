// One-off: FLUX image-to-image ORACLE from the owner's reference (keeps the design, renders HF/FLUX style).
import fs from 'fs';
import path from 'path';

// load FAL_KEY from .env (root) — never print it
function falKey(){
  for(const f of ['.env','.env.local']){
    try{ const t=fs.readFileSync(f,'utf8'); const m=t.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)/); if(m) return m[1].trim(); }catch{}
  }
  return process.env.FAL_KEY||null;
}
const KEY=falKey();
if(!KEY){ console.error('NO FAL_KEY'); process.exit(1); }

const REF='C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/image.jpg';
const OUT='public/assets/agents/ORACLE-council.png';
const b64=fs.readFileSync(REF).toString('base64');
const dataUri='data:image/jpeg;base64,'+b64;

const prompt='SHADDAI ORACLE, a fierce dark-skinned female cyber-sorceress and seer, long high ponytail of black hair streaked with glowing violet energy, form-fitting dark purple techno-bodysuit laced with glowing purple circuit-lightning veins across her body, angular shoulder armor and fingerless tactical gloves, an alchemist utility belt heavy with glowing potion vials and mystic trinkets, a crackling violet energy dagger sheathed at her hip, holding aloft a staff topped with a glowing purple orb of arcane energy, armored knee pads and glowing purple-soled combat boots, wreathed in crackling purple lightning, third-eye mystic-tech oracle, heroic standing pose, neon Tron aesthetic, glowing circuit edges, cinematic rim lighting, dark moody background, ultra high detail digital character art, full body, 3/4 front view';
const negative='cropped, cut off, close-up, headshot, bust, blurry, low quality, extra limbs, deformed hands, text, watermark, signature, washed out';

const body={
  image_url:dataUri,
  prompt, negative_prompt:negative,
  strength:0.62,               // keep the design, restyle toward FLUX
  num_inference_steps:34, guidance_scale:3.5,
  seed:70418
};

const r=await fetch('https://fal.run/fal-ai/flux/dev/image-to-image',{
  method:'POST', headers:{ Authorization:'Key '+KEY, 'Content-Type':'application/json' }, body:JSON.stringify(body)
});
const j=await r.json();
if(!r.ok){ console.error('fal '+r.status+': '+JSON.stringify(j).slice(0,300)); process.exit(1); }
const url=(j.images&&j.images[0]&&j.images[0].url)||(j.image&&j.image.url);
if(!url){ console.error('no url: '+JSON.stringify(j).slice(0,300)); process.exit(1); }
const img=Buffer.from(await (await fetch(url)).arrayBuffer());
// back up the raw reference copy once
if(fs.existsSync(OUT)&&!fs.existsSync(OUT+'.ref')) fs.copyFileSync(OUT,OUT+'.ref');
fs.writeFileSync(OUT,img);
console.log('SAVED '+OUT+' '+(img.length/1024|0)+'KB');
