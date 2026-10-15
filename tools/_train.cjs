const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});const logs=[];p.on('console',m=>{const t=m.text();if(/transit|train|maglev|colosseum|interior|station/i.test(t))logs.push(t.slice(0,140));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(45000);
const r=await p.evaluate(()=>{const C=window.COLOSSEUM_WORLD,E=window.__colosseumExt,I=window.__w3dDebug.interiors,T=window.__worldTransitApi;const o={colo:C&&{x:Math.round(C.x),z:Math.round(C.z),door:C.door.map(Math.round)},extBuilt:!!E,groupVisible:E&&E.group&&E.group.visible,groupY:E&&E.group&&Math.round(E.group.position.y)};
 if(I&&C){o.nearestDoorAtDoor=(()=>{try{const d=I.nearestDoor(C.door[0],C.door[1]);return d&&{code:d.code,dist:Math.round(d.dist||0)}}catch(e){return 'ERR '+e.message}})();}
 o.station=T&&T.stations&&T.stations[0]&&{id:T.stations[0].id,near:!!T.near(T.stations[0].x,T.stations[0].z)};o.hasPrompt=!!window._doorPrompt;return o;});
console.log(JSON.stringify(r).slice(0,1600));console.log(JSON.stringify(logs.slice(0,8)));await b.close();})();
