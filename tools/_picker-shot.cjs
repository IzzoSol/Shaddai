const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1100,height:760});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(4000);await p.screenshot({path:'C:/Users/Brittany/picker-shot.png'});
const r=await p.evaluate(()=>({n:document.querySelectorAll('.sp-char').length,locks:document.querySelectorAll('.sp-char-lock').length,on:(document.querySelector('.sp-char.on')||{}).getAttribute&&document.querySelector('.sp-char.on').getAttribute('data-code')}));
console.log(JSON.stringify(r),'ERRS',JSON.stringify(errs));await b.close();})();
