const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(15000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(30000);
await p.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',key:'v',bubbles:true}));});await sleep(3000);
const info=await p.evaluate(()=>{const D=window.__w3dDebug,pp=D.playerPos;let av=null;D.scene.traverse(o=>{if(o.name==='player-contact-shadow')av=o;});return{pp:[Math.round(pp.x),Math.round(pp.y),Math.round(pp.z)],shadow:!!av,shadowVisible:av&&av.visible,shadowPos:av&&[Math.round(av.position.x),Math.round(av.position.y),Math.round(av.position.z)]}});
console.log('INFO',JSON.stringify(info));
await p.evaluate(()=>{const D=window.__w3dDebug,cam=D.camera,pp=D.playerPos,H=D.terrainV4||D.terrain;if(!window.__camLock){const r0=D.renderer.render.bind(D.renderer);window.__camLock={};D.renderer.render=(s,c)=>{const L=window.__camLock;if(L.on){c.position.set(L.px,L.py,L.pz);c.lookAt(L.tx,L.ty,L.tz);c.updateMatrixWorld(true);}r0(s,c);};}
 const L=window.__camLock;L.on=true;const gy=H.heightAt(pp.x,pp.z);L.px=pp.x+0;L.py=gy+10;L.pz=pp.z-24;L.tx=pp.x;L.ty=gy+7;L.tz=pp.z;});
await sleep(6000);await p.screenshot({path:'C:/Users/Brittany/pop-after.png'});
await p.evaluate(()=>{window.__camLock.on=false;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyY',key:'y',bubbles:true}));});await sleep(7000);await p.screenshot({path:'C:/Users/Brittany/navi-after.png'});
console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
