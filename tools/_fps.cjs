const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const q=process.argv[2]||'';const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html'+q,{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(70000);
await p.evaluate(()=>{window.__setQualityTier&&window.__setQualityTier(1)});await sleep(3000);
const r=await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();(function f(){n++;if(performance.now()-t0<15000)requestAnimationFrame(f);else{const i=window.__w3dDebug.renderer.info.render;res({fps:+(n/15).toFixed(2),calls:i.calls,tris:i.triangles})}})();}));
console.log('FPS',q||'(default)',JSON.stringify(r));await b.close();})();
