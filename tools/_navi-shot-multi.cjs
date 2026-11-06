// Navi screenshots per module at 1200x760 + a small 1024x600 ring check. Writes to argv[2] (default scratch). Headless only.
const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));const OUT=process.argv[2]||'.';
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1200,height:760});const errs=[],warns=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));p.on('console',m=>{if(m.type()==='error')warns.push(m.text().slice(0,160));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?unlockall',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable&&!!window.Navi).catch(()=>false))break;}
await sleep(3000);await p.evaluate(()=>window.Navi.open());
for(const m of ['bots','academy','jobs']){await p.evaluate(m=>window.Navi.setModule(m),m);await sleep(1500);await p.screenshot({path:OUT+'/navi-'+m+'.png'});}
await p.evaluate(()=>{window.Navi.setModule('bots');const r=document.querySelector('#nvL .row[data-id="ag:NEXUS"]');r&&r.click();});await sleep(1500);await p.screenshot({path:OUT+'/navi-face.png'});
const ov=async()=>p.evaluate(()=>{const n=[...document.querySelectorAll('#navi .node')].map(e=>e.getBoundingClientRect());let o=0;for(let i=0;i<n.length;i++){const j=(i+1)%n.length;const dx=n[i].left-n[j].left,dy=n[i].top-n[j].top;if(Math.hypot(dx,dy)<n[i].width)o++;}return {size:Math.round(n[0].width),overlaps:o};});
const big=await ov();await p.setViewport({width:1024,height:600});await sleep(1500);const small=await ov();await p.screenshot({path:OUT+'/navi-1024x600.png'});
const tick=await p.evaluate(async()=>{window.Navi.setModule('academy');const a=document.getElementById('nvCodeLeft').textContent;await new Promise(r=>setTimeout(r,2200));return [a,document.getElementById('nvCodeLeft').textContent];});
console.log(JSON.stringify({big,small,tick,core:await p.evaluate(()=>document.getElementById('nvAgent').textContent),errs,consoleErrors:warns.slice(0,15)}));await b.close();})();
