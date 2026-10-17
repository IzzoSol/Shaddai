const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(15000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(25000);
const list=await p.evaluate(()=>window.__entrances||null);console.log('ENTRANCES',JSON.stringify(list));
const codes=process.argv.slice(2).length?process.argv.slice(2):['NEXUS','QUILL'];
for(const code of codes){
 await p.evaluate((code)=>{const e=window.__entrances.find(x=>x.code===code);const D=window.__w3dDebug,cam=D.camera,pp=D.playerPos;const H=D.terrainV4||D.terrain;const dist=95;const cx=e.x+e.nx*dist,cz=e.z+e.nz*dist;pp.x=cx;pp.z=cz;
  if(!window.__camLock){const r0=D.renderer.render.bind(D.renderer);window.__camLock={};D.renderer.render=(s,c)=>{const L=window.__camLock;if(L.on){c.position.set(L.px,L.py,L.pz);c.lookAt(L.tx,L.ty,L.tz);c.updateMatrixWorld(true);}r0(s,c);};}
  const L=window.__camLock;L.on=true;const gy=H.heightAt(e.x,e.z);L.px=cx;L.py=gy+14;L.pz=cz;L.tx=e.x;L.ty=gy+22;L.tz=e.z;},code);
 await sleep(7000);await p.screenshot({path:'C:/Users/Brittany/ent-'+code+'.png'});}
console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
