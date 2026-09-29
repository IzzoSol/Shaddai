const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const errs=[],bad=[];let bytes=0;
p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));p.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url().slice(-70));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
let ok=false;for(let i=0;i<220;i++){await sleep(2500);ok=await p.evaluate(()=>!!(window.__hoverPark&&window.__raceRun&&window.WorldBots)).catch(()=>false);if(ok)break;}
await sleep(6000);
const r=await p.evaluate(()=>{const D=window.__w3dDebug;const i=D.renderer.info;return{v4:!!window.__MAP_V4,calls:i.render.calls,tris:i.render.triangles,tier:window.__getQualityTier&&window.__getQualityTier()}});
console.log('FINAL',JSON.stringify(r));console.log('ERRS',JSON.stringify(errs.slice(0,6)));console.log('BAD',JSON.stringify(bad.slice(0,8)));await b.close();})();
