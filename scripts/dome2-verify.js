// Verify the upgraded constellation-dome (lab-dome.html):
//  - 0 console/page errors, WebGL2 acquires (no fallback)
//  - real constellations author into figure centers
//  - click-drag look-around rotates the sky (yaw/pitch change)
// Screenshots: dome2-orion.png, dome2-drag.png, dome2-full.png
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 240000,
    args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle',
           '--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
  page.on('console', m => { const t=m.text();
    if (m.type()==='error') errors.push('CONSOLE: '+t);
    if(/WebGL2 acquired|shader compile error|link error/.test(t)) console.log('LOG:',t); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/lab-dome.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 900));

  const info = await page.evaluate(()=>({
    fallback: getComputedStyle(document.getElementById('fallback')).display,
    hasGL: !!document.getElementById('gl').getContext('webgl2'),
    dbg: window.__DBG || null
  }));
  console.log('fallback-display=', info.fallback, ' webgl2=', info.hasGL, ' dbg=', JSON.stringify(info.dbg));

  const outDir = __dirname;
  async function shot(name){
    let ok=false;
    for(let attempt=0; attempt<3 && !ok; attempt++){
      try {
        await page.screenshot({ path: path.join(outDir, name), captureBeyondViewport:false });
        ok=true;
      } catch(e){ console.log('  shot retry', name, e.message.split('\n')[0]); await new Promise(r=>setTimeout(r,1500)); }
    }
    const d = await page.evaluate(()=>window.__DBG);
    console.log(name, ok?'OK':'FAILED', '=>', JSON.stringify(d));
    return d;
  }

  // Rise fully under the dome.
  await page.evaluate(()=>{ window.__forceP = 1.0; });
  await new Promise(r=>setTimeout(r,700));

  // --- ORION view: aim gaze at Orion's center via forced yaw/pitch ---
  // Orion center ~ normalize(-0.18,0.72,-0.62). Solve for yaw/pitch that make
  // the shader forward = (sp*sy, cp, sp*cy) point at it. Let __forcePitch be the
  // total pitch used (basePitch at p=1 ~ 0.02 is folded in via uPitch here we
  // just set an absolute look by forcing yaw/pitch and zeroing hover nudge).
  await page.evaluate(()=>{
    // aim at Orion: forward.y=cos(pitch), forward.xz gives yaw
    const c=[-0.18,0.72,-0.62]; const n=Math.hypot(...c); const f=c.map(v=>v/n);
    const pitch=Math.acos(f[1]);            // angle from zenith
    const yaw=Math.atan2(f[0], f[2]);       // matches (sp*sy, _, sp*cy)
    // uPitch adds to basePitch(~0.02 at p=1); subtract it out
    window.__forcePitch = pitch - 0.02;
    window.__forceYaw   = yaw;
    window.__forceMouse = {x:0,y:0};
  });
  await new Promise(r=>setTimeout(r,900));
  const orionDbg = await shot('dome2-orion.png');

  // --- CLICK-DRAG look-around: pointer down -> move -> up, confirm rotation ---
  // Release the forced yaw/pitch so real drag drives them.
  await page.evaluate(()=>{ delete window.__forceYaw; delete window.__forcePitch; delete window.__forceMouse; });
  await new Promise(r=>setTimeout(r,400));
  const before = await page.evaluate(()=>({yaw:window.__DBG.yaw, pitch:window.__DBG.pitch}));

  const cx=250, cy=380;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // drag far to the right + up -> large yaw + pitch change
  for(let i=1;i<=20;i++){ await page.mouse.move(cx+ i*30, cy - i*9); await new Promise(r=>setTimeout(r,12)); }
  await page.mouse.up();
  await new Promise(r=>setTimeout(r,600));   // let momentum settle a touch
  const after = await page.evaluate(()=>({yaw:window.__DBG.yaw, pitch:window.__DBG.pitch}));
  const dYaw = Math.abs(after.yaw-before.yaw), dPitch = Math.abs(after.pitch-before.pitch);
  console.log('DRAG before=',JSON.stringify(before),' after=',JSON.stringify(after),
              ' dYaw=',dYaw.toFixed(3),' dPitch=',dPitch.toFixed(3));
  const dragRotated = dYaw > 0.3 || dPitch > 0.15;
  console.log('DRAG_ROTATED_SKY=', dragRotated);
  await new Promise(r=>setTimeout(r,300));
  await shot('dome2-drag.png');

  // --- FULL dome: pitch straight up to see the whole spread ---
  await page.evaluate(()=>{ window.__forceYaw = 0.6; window.__forcePitch = 0.55; window.__forceMouse={x:0,y:0}; });
  await new Promise(r=>setTimeout(r,900));
  await shot('dome2-full.png');

  await browser.close();
  console.log('ERROR_COUNT=' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  console.log('RESULT=', (errors.length===0 && info.hasGL && info.fallback==='none' && dragRotated) ? 'PASS' : 'CHECK');
  process.exit(errors.length ? 1 : 0);
})();
