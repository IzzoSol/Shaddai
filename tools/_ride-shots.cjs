// tools/_ride-shots.cjs - real game headless (needs ~1.5 GB free): boot, spawn at Source Temple, per character stand/ride/air close-ups + 4 aerial map shots -> PNGs next to this file's OUT dir. Needs tools/_serve-merged.cjs on :3080.

const puppeteer=require('C:/Users/Brittany/Shaddai-3d/node_modules/puppeteer'),os=require('os'),fs=require('fs'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=process.env.OUT||require('os').tmpdir(); (async()=>{ if(os.freemem()/1048576<1200){console.log('refused: low RAM',Math.round(os.freemem()/1048576));process.exit(3);}
const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--js-flags=--max-old-space-size=900']});
const p=await b.newPage(); await p.setViewport({width:640,height:400}); const errs=[]; p.on('pageerror',e=>errs.push((e.message||'').slice(0,160)));
p.on('console',m=>{const t=m.text(); if(/matrixWorld|cloneSkinned|ual\]|retarget/i.test(t)) console.log('  [console]',t.slice(0,180));});
const t0=Date.now(), log=s=>console.log(Math.round((Date.now()-t0)/1000)+'s',s);
await p.goto('http://localhost:3080/SHADDAI-WORLD-3D.html?colointro=0&unlockall',{waitUntil:'domcontentloaded',timeout:120000});
for(let i=0;i<200;i++){await sleep(2000); if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false)) break;} log('playable');
await sleep(5000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,c)=>(a.textContent||'').length-(c.textContent||'').length)[0]; if(t) t.click();});
for(let i=0;i<300&&!(await p.evaluate(()=>window.__spawnBusy===false).catch(()=>false));i++) await sleep(3000); log('spawned');
await sleep(8000);
const shoot=async(tag)=>{ const d=await p.evaluate(()=>{ const D=window.__w3dDebug, av=D.playerAvatar; const T=D.THREE; const box=new T.Box3().setFromObject(av,true), c=box.getCenter(new T.Vector3()); const cam=new T.PerspectiveCamera(35,1.6,0.1,5000);
  const yaw=av.rotation.y; cam.position.set(c.x+Math.sin(yaw+1.2)*16, c.y+5, c.z+Math.cos(yaw+1.2)*16); cam.lookAt(c); D.renderer.render(D.scene,cam); return D.renderer.domElement.toDataURL('image/png'); }).catch(e=>'ERR '+e.message);
  if(d.startsWith('ERR')) return log(tag+' '+d); fs.writeFileSync(OUT+'/game-'+tag+'.png',Buffer.from(d.split(',')[1],'base64')); log('shot '+tag); };
for(const code of (process.env.CHARS||'SHADDAI,ZEROX,ORACLE').split(',')){
  await p.evaluate(c=>window.setPlayerCharacter(c),code); await sleep(9000);
  await shoot(code+'-stand');
  await p.keyboard.press('KeyO'); await sleep(3000); const riding=await p.evaluate(()=>!!(window.__hover&&window.__hover.isRiding()));
  await p.keyboard.down('KeyW'); await sleep(2500); await shoot(code+'-ride'); console.log('  anim', await p.evaluate(()=>{ try{ const A=window.__w3dDebug.playerAnim(); const o={}; for(const k in A){ const v=A[k]; if(typeof v!=='function') o[k]=Array.isArray(v)?v.slice(0,40):v; } const av=window.__w3dDebug.playerAvatar, m=av.children[0]; let mx=null; const acts=[]; if(m){ const R=window.__hover; } return JSON.stringify(o).slice(0,900); }catch(e){ return 'ERR '+e.message; } })); await p.keyboard.down('Space'); await sleep(500); await shoot(code+'-air'); await p.keyboard.up('Space'); await sleep(1500); await p.keyboard.up('KeyW');
  await p.keyboard.press('KeyO'); await sleep(2000); log(code+' riding='+riding);
}
for(const [tag,pos,look] of [['aerial-city',[0,2600,2600],[0,0,0]],['aerial-top',[0,6000,10],[0,0,0]],['aerial-academy',[3200,900,-1900],[3958,0,-3117]],['aerial-far',[-6000,3000,6000],[0,0,0]]]){
  const d=await p.evaluate((pos,look)=>{ const D=window.__w3dDebug, T=D.THREE; const cam=new T.PerspectiveCamera(50,1.6,1,40000); cam.position.set(...pos); cam.lookAt(...look); D.renderer.render(D.scene,cam); return D.renderer.domElement.toDataURL('image/png'); },pos,look).catch(e=>'ERR '+e.message);
  if(!d.startsWith('ERR')){ fs.writeFileSync(OUT+'/game-'+tag+'.png',Buffer.from(d.split(',')[1],'base64')); log('shot '+tag); } else log(tag+' '+d); }
console.log('pageerrors',errs.length,JSON.stringify(errs.slice(0,6))); await b.close(); })().catch(e=>{console.log('FATAL',e.message);process.exit(1);});
