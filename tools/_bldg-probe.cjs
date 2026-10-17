const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(30000);
const r=await p.evaluate(()=>{const out={};out.measured=window.__measuredFootprints||null;
 try{const C=window.buildPlayerController.worldColliders(window);out.nColliders=C.length;out.colliderSample=C.slice(0,14).map(c=>JSON.stringify(c).slice(0,110));}catch(e){out.collErr=e.message}
 out.layoutColl=(window.WORLD_LAYOUT&&window.WORLD_LAYOUT.realmColliders)?window.WORLD_LAYOUT.realmColliders.length:null;
 out.bldgR={SHADDAI:76,NEXUS:63,QUILL:118,PIKADON:65,TURTLE:63,ZEROX:65,ORACLE:62};
 out.sectors=window.WORLD_LAYOUT.sectors.map(s=>[s.code,Math.round(s.pos[0]),Math.round(s.pos[1])].join(':'));
 out.entr=(window.__entrances||[]).map(e=>[e.code,Math.round(e.x),Math.round(e.z)].join(':'));
 return out;});
console.log(JSON.stringify(r,null,1).slice(0,3000));console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
