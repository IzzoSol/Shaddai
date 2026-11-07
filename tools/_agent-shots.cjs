// tools/_agent-shots.cjs - photograph every skinned root in the world headless (URL=<world page> OUT=<dir> WAIT=ms). One object per evaluate (all at once crashed the tab).
const puppeteer=require('C:/Users/Brittany/Shaddai-3d/node_modules/puppeteer'),fs=require('fs'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:800,height:500});
p.on('console',m=>{ if(/agent-lib|cloneSkinned|matrixWorld|retarget/i.test(m.text())) console.log('CONSOLE',m.text().slice(0,160)); });
await p.goto(process.env.URL||'https://shaddai-g81x.onrender.com/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<120;i++){ await sleep(2000); if(await p.evaluate(()=>!!(window.__loadPlayable&&window.__w3dDebug)).catch(()=>false)) break; }
await sleep(+(process.env.WAIT||70000));
const n=await p.evaluate(()=>{ const D=window.__w3dDebug; const roots=new Set(); D.scene.traverse(o=>{ if(o.isSkinnedMesh){ let r=o; while(r.parent&&r.parent!==D.scene) r=r.parent; roots.add(r); } }); window.__roots=[...roots]; return window.__roots.length; }); console.log('skinned roots',n);
const shots=[]; for(let i=0;i<Math.min(n,12);i++){ const s=await p.evaluate(i=>{ const D=window.__w3dDebug,T=D.THREE,r=window.__roots[i]; if(!r.visible) return null; r.updateMatrixWorld(true); const bx=new T.Box3().setFromObject(r,true), sz=bx.getSize(new T.Vector3()), c=bx.getCenter(new T.Vector3()); const h=Math.max(sz.x,sz.y,sz.z); if(!(h>60)) return {skip:h}; const nm=[]; r.traverse(o=>{ if(o.isSkinnedMesh) nm.push(o.name+':'+o.skeleton.bones.length+(o.skeleton.bones.some(b=>!b)?'MISSING':'')); });
  const cam=new T.PerspectiveCamera(35,1.6,0.1,5000); const hide=[]; D.scene.children.forEach(ch=>{ if(ch!==r && ch.visible && !ch.isLight){ ch.visible=false; hide.push(ch);} });
  cam.position.set(c.x+h*1.1,c.y+h*0.15,c.z+h*1.1); cam.lookAt(c); D.renderer.render(D.scene,cam); hide.forEach(ch=>ch.visible=true); let name=r.name||''; r.traverse(o=>{ if(!name&&o.name) name=o.name; });
  return {name:name.slice(0,30)+' | '+nm.slice(0,4).join(','),h:+h.toFixed(1),png:D.renderer.domElement.toDataURL('image/jpeg',0.8)}; },i).catch(e=>({err:e.message})); if(s&&s.png) shots.push(s); else console.log(i,JSON.stringify(s)); }
shots.forEach((s,i)=>{ fs.writeFileSync(process.env.OUT+'/a'+i+'.jpg',Buffer.from(s.png.split(',')[1],'base64')); console.log(i,s.name,s.h); });
await b.close();})().catch(e=>console.log('FATAL',e.message));
