import puppeteer from 'puppeteer';
const args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=760,428'];
const b=await puppeteer.launch({headless:'new',args,protocolTimeout:180000});
const errs=[];
const p=await b.newPage();
await p.setViewport({width:760,height:428,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,180));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,180)));
await p.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,1500));
const st=await p.evaluate(()=>{const c=document.getElementById('gl');return{webgl2:!!(c&&c.getContext('webgl2')),fb:(()=>{const f=document.getElementById('fallback');return f?getComputedStyle(f).display!=='none':false;})()};});
const sweep=[0.05,0.20,0.30,0.45,0.55,0.63,0.70,0.78,0.85,0.92,0.97,1.0];
for(const v of sweep){ await p.evaluate(x=>{window.__forceP=x;},v); await new Promise(r=>setTimeout(r,900)); }
console.log('SWEEP errors='+errs.length+' webgl2='+st.webgl2+' fallback='+st.fb);
const shots=[['cn-dome',0.90],['cn-crown',0.995]];
for(const [nm,v] of shots){ try{ await p.evaluate(x=>{window.__forceP=x;},v); await new Promise(r=>setTimeout(r,1500)); await p.screenshot({path:`scripts/${nm}.png`}); console.log('shot '+nm+' ok'); }catch(e){ console.log('shot '+nm+' FAILED '+e.message.slice(0,60)); } }
// drag
try{ await p.evaluate(x=>{window.__forceP=x;},0.92); await new Promise(r=>setTimeout(r,700));
const y0=await p.evaluate(()=>window.__DBG?.yaw);
await p.mouse.move(380,214); await p.mouse.down(); await p.mouse.move(560,230,{steps:8}); await p.mouse.move(640,250,{steps:8}); await p.mouse.up();
await new Promise(r=>setTimeout(r,700));
const y1=await p.evaluate(()=>window.__DBG?.yaw);
await p.screenshot({path:'scripts/cn-drag.png'});
console.log('drag yaw '+y0+' -> '+y1+' => '+(Math.abs((y1||0)-(y0||0))>0.001?'ROTATES OK':'NO ROT')); }catch(e){ console.log('drag FAILED '+e.message.slice(0,60)); }
await b.close();
console.log('TOTAL errors='+errs.length); errs.slice(0,8).forEach(e=>console.log('  ! '+e));
console.log(errs.length===0&&st.webgl2?'RESULT: PASS':'RESULT: CHECK');
