const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const tag=process.argv[2]||'a';const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=900']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<50&&!(await p.evaluate(()=>!!window.__hoverPark).catch(()=>false));i++)await sleep(2000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(25000);
const info=await p.evaluate(()=>{const P=window.__hoverPark;return{entrance:[Math.round(P.entrance.x),Math.round(P.entrance.z)],rooms:P.rooms.map(r=>[r.id,Math.round(r.x),Math.round(r.z),Math.round(r.r)]),deckY:Math.round(P.deckY)}});
console.log('PARK',JSON.stringify(info));
await p.evaluate(()=>{const D=window.__w3dDebug;if(!window.__camLock){const r0=D.renderer.render.bind(D.renderer);window.__camLock={};D.renderer.render=(s,c)=>{const L=window.__camLock;if(L.on){c.position.set(L.px,L.py,L.pz);c.lookAt(L.tx,L.ty,L.tz);c.updateMatrixWorld(true);}r0(s,c);};}});
const views=[['gate',(P)=>{const e=P.entrance,pad=P.rooms[0];const dx=e.x-pad.x,dz=e.z-pad.z,dl=Math.hypot(dx,dz);return [e.x+dx/dl*90,P.deckY+30,e.z+dz/dl*90,pad.x,P.deckY+8,pad.z];}],['aerial',(P)=>{const pad=P.rooms[0];return [pad.x+260,P.deckY+230,pad.z+260,pad.x,P.deckY,pad.z];}],['room2',(P)=>{const r=P.rooms[2]||P.rooms[1];return [r.x+70,P.deckY+26,r.z+70,r.x,P.deckY+8,r.z];}]];
for(const [n,f] of views){await p.evaluate((fs)=>{const P=window.__hoverPark,L=window.__camLock,v=eval('('+fs+')')(P);L.on=true;L.px=v[0];L.py=v[1];L.pz=v[2];L.tx=v[3];L.ty=v[4];L.tz=v[5];},f.toString());await sleep(7000);await p.screenshot({path:'C:/Users/Brittany/park-'+tag+'-'+n+'.png'});}
console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
