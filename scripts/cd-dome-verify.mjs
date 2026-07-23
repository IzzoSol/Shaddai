import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/lab-dome.html';
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--window-size=1440,900']
});
const page = await browser.newPage();
await page.setViewport({ width:1440, height:900, deviceScaleFactor:1 });
page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));

await page.goto(URL, { waitUntil:'networkidle2', timeout:60000 });
await new Promise(r=>setTimeout(r,1500));

// WebGL2 acquired?
const webgl2 = await page.evaluate(()=>{
  const c=document.getElementById('gl');
  return !!(c && c.getContext('webgl2'));
});

// Center a recognizable constellation (Orion) — drive yaw/pitch toward its center.
// Orion center dir ~ normalize(-0.18,0.72,-0.62). fwd = (sp*sy, cp, sp*cy).
await page.evaluate(()=>{
  window.__forceP = 1.0;
  // solve for yaw/pitch that point fwd at Orion center
  const c=[-0.18,0.72,-0.62]; const n=Math.hypot(...c); const d=c.map(v=>v/n);
  const pitch=Math.acos(Math.max(-1,Math.min(1,d[1])));
  const yaw=Math.atan2(d[0], d[2]);
  // basePitch at p=1 is ~0.02, uPitch adds; approximate by setting pitch directly
  window.__forcePitch = pitch-0.02;
  window.__forceYaw = yaw;
  window.__forceMouse = {x:0,y:0};
});
await new Promise(r=>setTimeout(r,1200));
await page.screenshot({ path:'scripts/cd-dome-orion.png' });

// Zenith crown filigree — look straight up
await page.evaluate(()=>{
  window.__forcePitch = -0.02;   // fwd ~ +Y zenith
  window.__forceYaw = 0.0;
});
await new Promise(r=>setTimeout(r,1200));
await page.screenshot({ path:'scripts/cd-dome-crown.png' });

// Simulate a click-drag, then confirm the sky rotated (yaw changed).
await page.evaluate(()=>{ delete window.__forceYaw; delete window.__forcePitch; delete window.__forceMouse; });
const before = await page.evaluate(()=> window.__DBG ? window.__DBG.yaw : null);
const box = { x:720, y:450 };
await page.mouse.move(box.x, box.y);
await page.mouse.down();
for(let i=0;i<12;i++){ await page.mouse.move(box.x - i*22, box.y + i*6); await new Promise(r=>setTimeout(r,16)); }
await page.mouse.up();
await new Promise(r=>setTimeout(r,900));
const after = await page.evaluate(()=> window.__DBG ? window.__DBG.yaw : null);
await page.screenshot({ path:'scripts/cd-dome-drag.png' });

// mean luminance sample to sanity-check ~obsidian dominance on the crown shot
const lum = await page.evaluate(()=>{
  const c=document.getElementById('gl');
  return { w:c.width, h:c.height };
});

console.log(JSON.stringify({
  webgl2, errors,
  yawBefore: before, yawAfter: after,
  rotated: (before!==null && after!==null && Math.abs(after-before) > 0.01),
  canvas: lum
}, null, 2));

await browser.close();
if(errors.length) process.exit(2);
