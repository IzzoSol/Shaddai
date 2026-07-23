import puppeteer from 'puppeteer';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:3000/agents.html';
const OUT = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\scripts\\';

const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox',
      '--window-size=1440,900'
    ],
    defaultViewport: { width:1440, height:900, deviceScaleFactor:1 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!u.includes('favicon')) errors.push('REQFAIL: '+u+' :: '+(r.failure()?.errorText||'')); });

  console.log('→ loading', URL);
  await page.goto(URL, { waitUntil:'networkidle2', timeout:60000 });
  await sleep(1200);

  // hero screenshot
  await page.screenshot({ path: OUT+'council-hero.png' });
  console.log('  saved council-hero.png');

  // scroll to TURTLE card, screenshot portrait + VIEW IN 3D
  await page.evaluate(()=>{ document.getElementById('a-TURTLE').scrollIntoView({behavior:'instant',block:'center'}); });
  await sleep(1400);
  await page.screenshot({ path: OUT+'council-agent-portrait.png' });
  console.log('  saved council-agent-portrait.png');

  // ── open TURTLE 3D ──
  console.log('→ opening TURTLE 3D');
  await page.evaluate(()=> window.__V3D.open('TURTLE'));
  // wait for a mesh to appear in the scene
  const turtleLoaded = await page.waitForFunction(()=>{
    const c = window.__V3D.ctx;
    if(!c || !c.scene) return false;
    let meshes=0; c.scene.traverse(o=>{ if(o.isMesh) meshes++; });
    return meshes>0;
  }, { timeout:45000 }).then(()=>true).catch(()=>false);
  await sleep(1000);
  const turtleMeshes = await page.evaluate(()=>{ let n=0; const c=window.__V3D.ctx; if(c&&c.scene) c.scene.traverse(o=>{ if(o.isMesh) n++; }); return n; });
  console.log('  TURTLE meshLoaded=%s meshes=%d', turtleLoaded, turtleMeshes);
  await page.screenshot({ path: OUT+'council-3d-open.png' });
  console.log('  saved council-3d-open.png');

  // ── simulate drag-rotate: capture camera azimuth before/after ──
  const before = await page.evaluate(()=>{ const c=window.__V3D.ctx; c.controls.autoRotate=false; return {x:c.camera.position.x, z:c.camera.position.z}; });
  const box = await page.evaluate(()=>{ const cv=window.__V3D.stage.querySelector('canvas'); const r=cv.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
  const cx = box.x+box.w/2, cy = box.y+box.h/2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for(let i=1;i<=10;i++){ await page.mouse.move(cx + i*22, cy); await sleep(16); }
  await page.mouse.up();
  await sleep(400);
  const after = await page.evaluate(()=>{ const c=window.__V3D.ctx; return {x:c.camera.position.x, z:c.camera.position.z}; });
  const moved = Math.abs(after.x-before.x)+Math.abs(after.z-before.z);
  console.log('  drag rotated camera: before(%s,%s) after(%s,%s) delta=%s', before.x.toFixed(3),before.z.toFixed(3),after.x.toFixed(3),after.z.toFixed(3),moved.toFixed(4));
  const dragWorks = moved > 0.01;

  // ── close TURTLE, confirm dispose (canvas removed, ctx null) ──
  await page.evaluate(()=> window.__V3D.close());
  await sleep(600);
  const disposed = await page.evaluate(()=>{
    const c = window.__V3D.ctx;
    const canvases = window.__V3D.stage.querySelectorAll('canvas').length;
    return { ctxNull: c===null, canvases };
  });
  console.log('  after close: ctxNull=%s canvasCount=%d', disposed.ctxNull, disposed.canvases);

  // ── open a SECOND agent: ZEROX ──
  console.log('→ opening ZEROX 3D');
  await page.evaluate(()=> window.__V3D.open('ZEROX'));
  const zeroxLoaded = await page.waitForFunction(()=>{
    const c = window.__V3D.ctx; if(!c||!c.scene) return false;
    let m=0; c.scene.traverse(o=>{ if(o.isMesh) m++; }); return m>0;
  }, { timeout:45000 }).then(()=>true).catch(()=>false);
  await sleep(1200);
  const zeroxMeshes = await page.evaluate(()=>{ let n=0; const c=window.__V3D.ctx; if(c&&c.scene) c.scene.traverse(o=>{ if(o.isMesh) n++; }); return n; });
  console.log('  ZEROX meshLoaded=%s meshes=%d', zeroxLoaded, zeroxMeshes);
  await page.screenshot({ path: OUT+'council-3d-second.png' });
  console.log('  saved council-3d-second.png');

  // confirm only ONE webgl context/canvas exists at a time
  const totalCanvases = await page.evaluate(()=> document.querySelectorAll('.v3d-stage canvas').length);
  await page.evaluate(()=> window.__V3D.close());
  await sleep(400);

  await browser.close();

  console.log('\n════════ RESULT ════════');
  console.log('errors:', errors.length);
  errors.forEach(e=>console.log('   '+e));
  console.log('TURTLE loaded :', turtleLoaded, '('+turtleMeshes+' meshes)');
  console.log('drag rotates  :', dragWorks);
  console.log('dispose (ctx null, 0 canvas):', disposed.ctxNull && disposed.canvases===0);
  console.log('ZEROX loaded  :', zeroxLoaded, '('+zeroxMeshes+' meshes)');
  console.log('single context at a time:', totalCanvases===1);
  const pass = errors.length===0 && turtleLoaded && dragWorks && disposed.ctxNull && disposed.canvases===0 && zeroxLoaded;
  console.log('OVERALL:', pass ? 'PASS' : 'CHECK');
  process.exit(pass?0:2);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
