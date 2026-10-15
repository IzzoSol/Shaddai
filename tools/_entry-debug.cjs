const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+(e&&e.message).slice(0,200)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(8000);
let s=await p.evaluate(()=>{const intro=document.getElementById('intro');return{playable:!!window.__loadPlayable,playableAt:window.__loadPlayableAt||null,introExists:!!intro,introDisplay:intro?intro.style.display:'-',introGone:intro?intro.classList.contains('gone'):'-',inWorld:document.body.classList.contains('in-world'),btnUsed:(function(){const b=document.getElementById('enterBtn');return b?!!b._used:'-'})()};});
console.log('before manual click:',JSON.stringify(s));
if(!s.introGone){ await p.evaluate(()=>{const b=document.getElementById('enterBtn');if(b)b.click();}); await sleep(4000); }
s=await p.evaluate(()=>{const intro=document.getElementById('intro');return{playableAt:window.__loadPlayableAt||null,introGone:intro?intro.classList.contains('gone'):'-',inWorld:document.body.classList.contains('in-world'),mergeDone:!!window.__staticMergeDone};});
console.log('after manual click:',JSON.stringify(s));
console.log('pageerrors:',errs.slice(0,6).join('\n  ')||'(none)');await b.close();})();
