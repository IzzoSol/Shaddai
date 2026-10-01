const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(3000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(25000);
const spot=await p.evaluate(()=>{const W=window.__w3dDebug.waterV4,H=(window.__w3dDebug.terrainV4||window.__w3dDebug.terrain);let best=null;for(let x=-6000;x<=6000;x+=60)for(let z=-6000;z<=6000;z+=60){const w=W.waterHeightAt(x,z);if(w==null)continue;const d=w-H.heightAt(x,z);if(d>8&&d<40&&(!best||Math.hypot(x,z)<Math.hypot(best.x,best.z)))best={x,z,d};}return best;});
console.log('spot',JSON.stringify(spot));
if(spot){await p.evaluate(s=>{window.teleportTo(s.x,s.z-14);},spot);for(let i=0;i<60;i++){await sleep(3000);if(await p.evaluate(()=>window.__swimK!==undefined))break;}
const r=await p.evaluate(()=>({k:window.__swimK,busy:window.__spawnBusy,fps:window.__quality&&window.__quality.fps}));console.log('swimK',JSON.stringify(r));await p.screenshot({path:'C:/Users/Brittany/swim-shot.png'});}
console.log('ERRS',JSON.stringify(errs));await b.close();})();
