import puppeteer from 'puppeteer';
const args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1280,720'];
const b=await puppeteer.launch({headless:'new',args});
const errs=[];
const p=await b.newPage();
await p.setViewport({width:1280,height:720,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,180));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,180)));
await p.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,1800));
const st=await p.evaluate(()=>{const c=document.getElementById('gl');const gl2=c&&c.getContext('webgl2');const fb=document.getElementById('fallback');return{webgl2:!!gl2,fb:fb?getComputedStyle(fb).display!=='none':false};});
// full 0-error sweep
const sweep=[0.05,0.20,0.30,0.45,0.55,0.63,0.70,0.78,0.85,0.92,0.97,1.0];
for(const v of sweep){ await p.evaluate(x=>{window.__forceP=x;},v); await new Promise(r=>setTimeout(r,650)); }
const errAfterSweep=errs.length;
// beat screenshots
const shots=[['cn-water',0.30],['cn-seam',0.72],['cn-dome',0.90],['cn-crown',0.995]];
for(const [nm,v] of shots){ await p.evaluate(x=>{window.__forceP=x;},v); await new Promise(r=>setTimeout(r,1100)); await p.screenshot({path:`scripts/${nm}.png`}); }
// drag test in dome beat
await p.evaluate(x=>{window.__forceP=x;},0.92);
await new Promise(r=>setTimeout(r,600));
const y0=await p.evaluate(()=>window.__DBG?window.__DBG.yaw:null);
await p.mouse.move(640,360); await p.mouse.down();
await p.mouse.move(880,380,{steps:8}); await p.mouse.move(980,400,{steps:8}); await p.mouse.up();
await new Promise(r=>setTimeout(r,700));
const y1=await p.evaluate(()=>window.__DBG?window.__DBG.yaw:null);
await p.screenshot({path:'scripts/cn-drag.png'});
const dbg=await p.evaluate(()=>window.__DBG);
await b.close();
console.log('webgl2='+st.webgl2+' fallback='+st.fb);
console.log('errors during full sweep + shots + drag = '+errs.length+' (after sweep: '+errAfterSweep+')');
errs.slice(0,8).forEach(e=>console.log('  ! '+e));
console.log('drag yaw: '+y0+' -> '+y1+'  => '+((y1!==null&&y0!==null&&Math.abs(y1-y0)>0.001)?'ROTATES OK':'NO ROTATION'));
console.log('final __DBG:',JSON.stringify(dbg));
console.log(errs.length===0&&st.webgl2?'RESULT: PASS':'RESULT: CHECK');
