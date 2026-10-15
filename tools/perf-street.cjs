const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(flag){const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:480});const errs=[];p.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?map=v4&peek=1&perf=1'+flag,{waitUntil:'domcontentloaded',timeout:90000});
let ok=false;for(let i=0;i<200;i++){await sleep(2500);ok=await p.evaluate(()=>!!(window.__realmHomes&&window.__perf&&window.__perf.calls>0&&window.__setQualityTier)).catch(()=>false);if(ok)break;}
await p.evaluate(()=>window.__setQualityTier(1,1e9));
await sleep(20000);
await p.evaluate(()=>{window.__probeCam={pos:[110,14,720],look:[110,10,400]};});
await sleep(20000);
const r=await p.evaluate(()=>{const c=window.__w3dDebug.scene.getObjectByName('grid-fabric-v4');let vis=0,tot=0,cnt=0;if(c)c.traverse(o=>{if(o.isInstancedMesh){tot++;if(o.visible&&o.count>0){vis++;cnt+=o.count;}}});const top={};const sc=window.__w3dDebug.scene;const walk=(o,root)=>{if(!o.visible)return;if(o.isMesh||o.isPoints||o.isLine||o.isSprite){const k=root||o.name||o.type;top[k]=(top[k]||0)+1;}o.children.forEach(ch=>walk(ch,root||(ch.parent===sc?(ch.name||ch.type):null)));};sc.children.forEach(ch=>walk(ch,ch.name||ch.type));const topN=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>k+': '+v);return {topVisibleObjects:topN,calls:window.__perf.calls,tris:Math.round(window.__perf.tris/1000)+'k',tier:window.__quality,fabricMeshes:tot,fabricVisible:vis,fabricInstances:cnt};});
await b.close();return {r,errs};}
(async()=>{const a=await run('');console.log(JSON.stringify(a,null,1));})();
