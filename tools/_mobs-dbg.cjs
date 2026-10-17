const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});const logs=[];p.on('console',m=>{const t=m.text();if(/mobs|Material|THREE/i.test(t))logs.push(t.slice(0,200));});p.on('pageerror',e=>logs.push('PAGEERR '+e.message.slice(0,200)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(40000);
const r=await p.evaluate(()=>{const o={order:window.__LD&&window.__LD.order.join(','),done:window.__LD&&Object.keys(window.__LD.steps).filter(k=>window.__LD.steps[k].t1).join(','),wild:!!window.__wildlife,drag:!!window.__dragons,mount:!!window.__mountRide,sky:!!window.__skyTraffic,fn:typeof window.buildWorldMobs,mobs:!!window.__mobs,gate:window.__LD&&window.__LD.gatePassed};
 try{const D=window.__w3dDebug,T=D.terrainV4;const THREE=D.scene.constructor?null:null;}catch(e){}
 return o;});
console.log(JSON.stringify(r));console.log(JSON.stringify(logs.slice(0,8)));await b.close();})();
