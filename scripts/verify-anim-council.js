// Headless verify: agents.html art swap + rig animation system.
// swiftshader can't render Meshy PBR motion into a still — we verify MOTION via mixer
// state (actions/isRunning), not pixels. Screenshots are for the cards + open viewers.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
  page.on('pageerror', e => errors.push('pageerror: '+e.message));
  page.on('requestfailed', r => { const u=r.url(); if(/agents\.html|forge\/art|\.glb/.test(u)) errors.push('reqfail: '+u+' '+(r.failure()&&r.failure().errorText)); });

  const artReqs = [];
  page.on('request', r => { if(/\/api\/forge\/art\/agent-/.test(r.url())) artReqs.push(r.url()); });

  await page.goto('http://localhost:3000/agents.html', { waitUntil:'networkidle2', timeout:60000 });
  await new Promise(r=>setTimeout(r,1200));

  // FIX 1 — card portrait srcs
  const imgSrcs = await page.$$eval('.portrait-frame img', els => els.map(e=>e.getAttribute('src')));
  const forgeCount = imgSrcs.filter(s=>/\/api\/forge\/art\/agent-/.test(s)).length;

  await page.screenshot({ path: path.join(__dirname,'anim-council-cards.png'), fullPage:false });

  // helper: open an agent viewer, wait for anim, sample state
  async function openAndSample(id){
    await page.evaluate(id => window.__V3D.open(id), id);
    // wait until model loaded (anim populated) or timeout
    await page.waitForFunction(()=>{ const a=window.__V3D.anim; return a && a.hasMixer; }, {timeout:30000}).catch(()=>{});
    await new Promise(r=>setTimeout(r,900));
    const anim = await page.evaluate(()=>window.__V3D.anim);
    const pills = await page.$$eval('#v3dClips .clip-pill', els=>els.map(e=>e.dataset.clip));
    const canvasCount = await page.evaluate(()=>document.querySelectorAll('#v3dStage canvas').length);
    return { anim, pills, canvasCount };
  }
  async function closeAndCheck(){
    await page.evaluate(()=>window.__V3D.close());
    await new Promise(r=>setTimeout(r,500));
    return await page.evaluate(()=>({
      ctxNull: window.__V3D.ctx===null,
      leakedCanvas: document.querySelectorAll('#v3dStage canvas').length
    }));
  }

  const turtle = await openAndSample('TURTLE');
  await page.screenshot({ path: path.join(__dirname,'anim-turtle-3d.png') });
  const turtleClose = await closeAndCheck();

  const zerox = await openAndSample('ZEROX');
  await page.screenshot({ path: path.join(__dirname,'anim-zerox-3d.png') });
  const zeroxClose = await closeAndCheck();

  console.log(JSON.stringify({
    errors,
    fix1: { totalImgs: imgSrcs.length, forgeArtImgs: forgeCount, sampleSrcs: imgSrcs.slice(0,3), artRequests: artReqs.length },
    turtle: { ...turtle, close: turtleClose },
    zerox:  { ...zerox,  close: zeroxClose }
  }, null, 2));

  await browser.close();
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
