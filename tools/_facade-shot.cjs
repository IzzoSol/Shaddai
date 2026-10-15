const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=900']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});const errs=[],warns=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));p.on('console',m=>{const t=m.text();if(/disabled after error|facade/i.test(t))warns.push(t.slice(0,140));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<50&&!(await p.evaluate(()=>!!(window.__facade&&window.__facade.stats().items)).catch(()=>false));i++)await sleep(2000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
for(let i=0;i<60&&!(await p.evaluate(()=>!!window.__w3dDebug.gridFabricV4).catch(()=>false));i++)await sleep(3000);await sleep(15000);
const info=await p.evaluate(()=>{const F=window.__facade,pp=window.__w3dDebug.playerPos;if(!F)return null;F.update(0.1);return {stats:F.stats(),pp:[Math.round(pp.x),Math.round(pp.z)]};});
console.log('INFO',JSON.stringify(info));
// look at a dense district street from ~35 m up, toward buildings
await p.evaluate(()=>{const D=window.__w3dDebug,pp=D.playerPos,H=D.terrainV4;if(!window.__camLock){const r0=D.renderer.render.bind(D.renderer);window.__camLock={};D.renderer.render=(s,c)=>{const L=window.__camLock;if(L.on){c.position.set(L.px,L.py,L.pz);c.lookAt(L.tx,L.ty,L.tz);c.updateMatrixWorld(true);}r0(s,c);};}
 const F=window.__facade;let best=null,bd=1e12;F.group.children.forEach(m=>{});const items=null;
 // choose the nearest band instance as target
 const bm=F.group.children.find(m=>m.name==='fd-bands');const mat=new D.camera.matrix.constructor();let tgt=null;for(let i=0;i<bm.count;i++){bm.getMatrixAt(i,mat);const x=mat.elements[12],z=mat.elements[14];const d=Math.hypot(x-pp.x,z-pp.z);if(d>120&&d<bd){bd=d;tgt={x,z};}}
 const L=window.__camLock;L.on=true;const gy=H.heightAt(tgt.x,tgt.z);const dx=tgt.x-pp.x,dz=tgt.z-pp.z,dl=Math.hypot(dx,dz);L.px=tgt.x-dx/dl*110;L.pz=tgt.z-dz/dl*110;L.py=H.heightAt(L.px,L.pz)+22;L.tx=tgt.x;L.ty=gy+36;L.tz=tgt.z;});
await sleep(9000);await p.screenshot({path:'C:/Users/Brittany/facade-1.png'});
console.log('ERRS',JSON.stringify(errs.slice(0,3)),'WARN',JSON.stringify(warns.slice(0,3)));await b.close();})();
