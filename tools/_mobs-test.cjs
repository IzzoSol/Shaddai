const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:900,height:560});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<60&&!(await p.evaluate(()=>!!window.__mobs).catch(()=>false));i++)await sleep(2000);
await sleep(5000);
const r=await p.evaluate(async()=>{const M=window.__mobs,pp=window.__w3dDebug.playerPos,S=window.ShdSparks,U=7/1.8,out={};
 out.stats=M.stats();out.camps=M.camps().length;const c=M.camps()[0];out.camp0={kind:c.kind,x:Math.round(c.x),z:Math.round(c.z)};
 pp.x=c.x+30*U;pp.z=c.z;window.__playerHP=100;
 const tick=(sec,dt=0.1)=>{for(let t=0;t<sec;t+=dt)M.update(dt);};
 out.near=M.nearestCamp(pp);tick(1);out.visibleAfter1s=M._mobs().filter(m=>m.camp.id===c.id&&m.g.visible).length;
 // aggro: walk inside the camp
 pp.x=c.x+8*U;pp.z=c.z;const hp0=window.__playerHP;tick(6);out.hpLost=hp0-window.__playerHP;out.states=M._mobs().filter(m=>m.camp.id===c.id).map(m=>m.state);
 // fight: kill everything in the camp with melee hits
 const kills=[];M.on('kill',k=>kills.push(k));const bal0=S.get();M.TUNE.respawnS=2;
 const mobs=M._mobs().filter(m=>m.camp.id===c.id);mobs.forEach(m=>{pp.x=m.x-1.5*U;pp.z=m.z;M.meleeHit(pp,{x:1,z:0},6*U,100);});
 out.kills=kills.length;out.sparksGained=S.get()-bal0;out.killInfo=kills[0]&&{name:kills[0].name,sparks:kills[0].sparks};
 out.deadNow=M._mobs().filter(m=>m.camp.id===c.id&&m.dead).length;out.nearestAfterKills=M.nearestCamp(pp);
 // bolt
 out.localKills=JSON.parse(localStorage.getItem('shd_mobkills_v1')||'null');
 await new Promise(r=>setTimeout(r,2600));tick(1);
 out.respawned=M._mobs().filter(m=>m.camp.id===c.id&&!m.dead).length;out.hpFull=M._mobs().filter(m=>m.camp.id===c.id).every(m=>m.hp===m.max);
 return out;});
console.log(JSON.stringify(r,null,1));console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
