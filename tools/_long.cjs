const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));await p.setViewport({width:800,height:500});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<120;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
const t=await p.evaluate(()=>performance.now());await sleep(75000);
const r=await p.evaluate(()=>({long:window.__LD.long.filter(e=>e[1]>150).map(e=>[Math.round(e[0]),Math.round(e[1])]),steps:window.__loadTimings.map(x=>[x.step,x.start,x.start+x.ms]),now:performance.now()}));
console.log('ERRS',JSON.stringify(errs.slice(0,4)));console.log('playable at',Math.round(t));console.log('LONG>150ms',JSON.stringify(r.long));console.log('STEPS',r.steps.filter(s=>s[1]>t-2000).map(s=>s.join(':')).join(' '));await b.close();})();
