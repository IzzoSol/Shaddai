const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1200,height:760});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?unlockall',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable&&!!window.Navi).catch(()=>false))break;}
await sleep(3000);
await p.evaluate(()=>{window.WorldMounts&&window.WorldMounts.buy&&0;window.ShdInv&&window.ShdInv.add('crop-bean',3);window.Navi.open();window.Navi.setModule('inv');});
await sleep(2500);await p.screenshot({path:'C:/Users/Brittany/navi-shot.png'});
console.log(await p.evaluate(()=>document.getElementById('navi')?document.getElementById('navi').innerText.slice(0,700):'no navi'),'ERRS',JSON.stringify(errs));await b.close();})();
