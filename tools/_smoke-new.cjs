const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=900']});
const p=await b.newPage();await p.setViewport({width:640,height:400});const errs=[],warns=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));p.on('console',m=>{const t=m.text();if(/disabled after error|[mobs]/i.test(t))warns.push(t.slice(0,160));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<50&&!(await p.evaluate(()=>!!(window.__crowd&&window.__skateJam&&window.__mobs)).catch(()=>false));i++)await sleep(2000);
await sleep(8000);
const r=await p.evaluate(()=>{const o={};const C=window.__crowd,M=window.__mobs,J=window.__skateJam;o.crowd=C&&C.stats();o.mobs=M&&M.stats();o.jam=J&&J.state();
 // crowd sanity: run updates, nobody inside a footprint, positions finite
 if(C){for(let i=0;i<30;i++)C.update(0.1);const bad=C._people.filter(p=>!isFinite(p.x)||!isFinite(p.z)).length;o.crowdBad=bad;o.crowdAfter=C.stats();}
 o.rings=M?M.camps().length:null;if(C){const per=C._people[0];const pp=window.__w3dDebug.playerPos;pp.x=per.x+2*3.889;pp.z=per.z;per.talkCd=0;C.update(0.1);const b=document.getElementById('citizenBubble');o.bubble=b?b.innerText.slice(0,90):null;}o.copy=!!window.WorldCopy;o.facade=window.__facade&&window.__facade.stats();o.mobsEarly=!!window.__mobs;o.mount=!!window.__mountRide;o.boardApi=typeof window.__rideBoard;return o;});
console.log(JSON.stringify(r));console.log('ERRS',JSON.stringify(errs.slice(0,4)),'WARN',JSON.stringify(warns.slice(0,4)));await b.close();})();
