const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<90;i++){await sleep(2000);const d=await p.evaluate(()=>window.__LD&&window.__LD.critical.every(n=>window.__LD.steps[n]&&window.__LD.steps[n].t1)).catch(()=>false);if(d)break;}
const r=await p.evaluate(()=>({crit:window.__LD.critical,rows:window.__loadTimings.map(t=>[t.step,t.start,t.ms,t.start+t.ms]),prog:window.__loadProgress}));
console.log('CRIT',r.crit.join(','));r.rows.sort((a,b)=>a[3]-b[3]).forEach(x=>console.log(x[0].padEnd(16),'start',String(x[1]).padStart(6),'dur',String(x[2]).padStart(6),'end',x[3]));await b.close();})();
