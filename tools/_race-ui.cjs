const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=600']});
const p=await b.newPage();await p.setViewport({width:1100,height:700});const errs=[],warns=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));p.on('console',m=>{const t=m.text();if(/disabled after error|thumbnails failed|race\] start failed/i.test(t))warns.push(t.slice(0,140));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<60&&!(await p.evaluate(()=>!!(window.__raceStart&&window.__traffic&&window.__mountRide&&window.WorldRaceSelect)).catch(()=>false));i++)await sleep(2000);
await sleep(5000);
const r=await p.evaluate(()=>{const o={};const T=window.__traffic;o.traffic=T&&T.stats();
 WorldRaceSelect.open({cid:'plaza-cup'});const imgs=[...document.querySelectorAll('#rsBody img')];o.thumbs=imgs.length;o.thumbOk=imgs.filter(i=>i.src.startsWith('data:image/png')&&i.src.length>2000).length;
 o.cards=document.querySelectorAll('#rsBody [data-a="ride"]').length;return o;});
console.log(JSON.stringify(r));
await p.screenshot({path:'C:/Users/Brittany/race-select.png'});
const r2=await p.evaluate(()=>{const o={};WorldRaceSelect.close();const ok=window.__raceStart('plaza-cup',{vehicle:'kart-pod',ais:3,ranked:false});o.started=ok;o.riding=window.__mountRide.isRiding();o.run=window.__raceRun.state()&&window.__raceRun.state().phase;o.kart=window.__raceKart;return o;});
console.log(JSON.stringify(r2));console.log('ERRS',JSON.stringify(errs.slice(0,4)),'WARN',JSON.stringify(warns.slice(0,3)));await b.close();})();
