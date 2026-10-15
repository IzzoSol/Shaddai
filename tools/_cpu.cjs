const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(90000);   // let streaming finish
const c=await p.createCDPSession();await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:500});await c.send('Profiler.start');await sleep(25000);const {profile}=await c.send('Profiler.stop');
const self={},byId={};profile.nodes.forEach(n=>byId[n.id]=n);const dt=profile.timeDeltas;const tot=dt.reduce((a,x)=>a+x,0);
profile.samples.forEach((id,i)=>{const n=byId[id],cf=n.callFrame;const k=(cf.functionName||'(anon)')+' '+cf.url.split('/').pop()+':'+cf.lineNumber;self[k]=(self[k]||0)+dt[i];});
console.log('TOTAL ms',Math.round(tot/1000));Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,28).forEach(([k,v])=>console.log((v/1000).toFixed(0).padStart(6)+'ms '+(100*v/tot).toFixed(1).padStart(5)+'% '+k.slice(0,100)));
const fr=await p.evaluate(()=>({fps:window.__fpsNow&&window.__fpsNow(),tier:window.__getQualityTier&&window.__getQualityTier()}));console.log('FPS',JSON.stringify(fr));await b.close();})();
