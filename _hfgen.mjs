// HF image gen — node, direct HuggingFace Inference API. Usage: node _hfgen.mjs <name> "<prompt>" [model]
import fs from 'fs';
import path from 'path';

const TOKEN = (fs.readFileSync('.env','utf8').match(/HF_API_TOKEN=(.+)/)||[])[1]?.trim();
if(!TOKEN){ console.error('no HF token'); process.exit(1); }

const name   = process.argv[2] || 'test';
const prompt = process.argv[3] || 'a landscape';
const model  = process.argv[4] || 'stabilityai/stable-diffusion-xl-base-1.0';
const outDir = path.resolve('public','hero');
fs.mkdirSync(outDir,{recursive:true});
const out = path.join(outDir, name + '.png');

async function gen(){
  for(let attempt=1; attempt<=6; attempt++){
    const r = await fetch('https://router.huggingface.co/hf-inference/models/'+model, {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+TOKEN, 'Content-Type':'application/json', 'Accept':'image/png' },
      body: JSON.stringify({ inputs: prompt, parameters:{ width:1024, height:576 } })
    });
    if(r.status===200){
      const buf = Buffer.from(await r.arrayBuffer());
      if(buf.length < 800){ console.error('tiny response:', buf.toString().slice(0,300)); process.exit(2); }
      fs.writeFileSync(out, buf);
      console.log('OK', name, buf.length, 'bytes ->', out);
      return;
    }
    const txt = await r.text();
    if(r.status===503){ // model loading
      let wait=8; try{ wait=Math.min(30,(JSON.parse(txt).estimated_time||8)); }catch(e){}
      console.log('attempt',attempt,'503 loading, wait',wait+'s');
      await new Promise(z=>setTimeout(z, wait*1000)); continue;
    }
    console.error('HTTP',r.status, txt.slice(0,400)); process.exit(3);
  }
  console.error('gave up after retries'); process.exit(4);
}
gen().catch(e=>{ console.error('ERR', e.message); process.exit(5); });
