// fal FLUX-schnell image gen. Usage: node _falgen.mjs <name> "<prompt>"
import fs from 'fs'; import path from 'path';
const KEY = (fs.readFileSync('.env','utf8').match(/FAL_KEY=(.+)/)||[])[1]?.trim();
if(!KEY){ console.error('no FAL_KEY'); process.exit(1); }
const name=process.argv[2]||'test', prompt=process.argv[3]||'a landscape';
const outDir=path.resolve('public','hero'); fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,name+'.png');

async function run(){
  const r=await fetch('https://fal.run/fal-ai/flux/schnell',{
    method:'POST',
    headers:{'Authorization':'Key '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({prompt, image_size:'landscape_16_9', num_images:1, num_inference_steps:4})
  });
  const txt=await r.text();
  if(r.status!==200){ console.error('HTTP',r.status,txt.slice(0,400)); process.exit(3); }
  let j; try{ j=JSON.parse(txt); }catch(e){ console.error('bad json',txt.slice(0,300)); process.exit(4); }
  const url=j.images?.[0]?.url; if(!url){ console.error('no image url',txt.slice(0,300)); process.exit(5); }
  const img=await fetch(url); const buf=Buffer.from(await img.arrayBuffer());
  fs.writeFileSync(out,buf); console.log('OK',name,buf.length,'bytes ->',out);
}
run().catch(e=>{console.error('ERR',e.message);process.exit(9);});
