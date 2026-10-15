const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:900,height:560});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(20000);
console.log('CLICK',await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t){(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();return t.textContent.slice(0,30);}return 'none';}));
await sleep(30000);
console.log('ARENA',await p.evaluate(()=>window.__travel.colospot('arena')));await sleep(12000);
console.log('LAVA',await p.evaluate(()=>window.__travel.field('lava')));await sleep(8000);
await p.evaluate(()=>{[...document.querySelectorAll('button')].filter(b=>/SPECTATE/i.test(b.textContent)).forEach(b=>b.click());});await sleep(1500);
console.log('POS',JSON.stringify(await p.evaluate(()=>{const pp=window.__w3dDebug.playerPos;return [Math.round(pp.x),Math.round(pp.y),Math.round(pp.z)]})));
await p.screenshot({path:'C:/Users/Brittany/colo-3-arena-lava.png'});
console.log('LOBBY',await p.evaluate(()=>window.__travel.colospot('lobby')));await sleep(9000);await p.screenshot({path:'C:/Users/Brittany/colo-4-lobby.png'});
console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
