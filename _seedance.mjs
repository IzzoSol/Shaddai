// Seedance text-to-video via fal (ByteDance Seedance v1 Lite). One ~5s clip.
// Usage: node _seedance.mjs <name> "<prompt>"
import fs from 'fs'; import path from 'path';
process.on('unhandledRejection', e=>console.log('  (ignored async drop:',(e&&e.message)||e,')'));
process.on('uncaughtException',  e=>console.log('  (ignored async drop:',(e&&e.message)||e,')'));
const KEY = (fs.readFileSync('.env','utf8').match(/FAL_KEY=(.+)/)||[])[1]?.trim();
if(!KEY){ console.error('no FAL_KEY'); process.exit(1); }
const name = process.argv[2] || 'intro';
const prompt = process.argv[3] || 'cinematic cosmic descent into a glowing sacred-geometry city';
const MODEL = 'fal-ai/bytedance/seedance/v1/lite/text-to-video';
const outDir = path.resolve('public','hero'); fs.mkdirSync(outDir,{recursive:true});
const out = path.join(outDir, name+'.mp4');
const H = { 'Authorization':'Key '+KEY, 'Content-Type':'application/json' };

async function jsonOf(res){ const t = await res.text(); if(!t) return null; try{ return JSON.parse(t); }catch(e){ return null; } }
async function run(){
  const sub = await fetch('https://queue.fal.run/'+MODEL, { method:'POST', headers:H,
    body: JSON.stringify({ prompt, resolution:'720p', duration:'5', aspect_ratio:'16:9' }) });
  const sj0 = await jsonOf(sub);
  if(sub.status!==200 || !sj0){ console.error('SUBMIT HTTP',sub.status,JSON.stringify(sj0)); process.exit(3); }
  const request_id = sj0.request_id;
  const statusUrl = sj0.status_url || ('https://queue.fal.run/'+MODEL+'/requests/'+request_id+'/status');
  const resUrl    = sj0.response_url || ('https://queue.fal.run/'+MODEL+'/requests/'+request_id);
  console.log('submitted',request_id,'— polling…');
  let done=false;
  for(let i=0;i<100;i++){
    await new Promise(r=>setTimeout(r,3000));
    let sj=null; try{ sj = await jsonOf(await fetch(statusUrl,{headers:H})); }catch(e){}
    if(!sj){ if(i%4===0) console.log('  … (no status yet)',(i*3)+'s'); continue; }
    if(sj.status==='COMPLETED'){ done=true; break; }
    if(sj.status==='FAILED'||sj.status==='ERROR'){ console.error('FAILED',JSON.stringify(sj).slice(0,400)); process.exit(5); }
    if(i%3===0) console.log('  …',sj.status||'queued',(i*3)+'s');
  }
  if(!done){ console.error('timed out waiting'); process.exit(7); }
  const rj = await jsonOf(await fetch(resUrl,{headers:H}));
  const url = rj?.video?.url || rj?.videos?.[0]?.url || rj?.output?.video?.url;
  if(!url){ console.error('no video url',JSON.stringify(rj).slice(0,500)); process.exit(6); }
  const vid = await fetch(url); const buf = Buffer.from(await vid.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log('OK',name,(buf.length/1024/1024).toFixed(2),'MB ->',out);
}
run().catch(e=>{ console.error('ERR',e.message); process.exit(9); });
