import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/agents.html';
const OUT = 'scripts';
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist','--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => {
  const u = r.url();
  if (/\/api\//.test(u)) return;                       // page guards API failures
  if (/\/assets\/agents\/.*-council\.png/.test(u)) return; // override art has portrait fallback
  errors.push('REQFAIL: ' + u + ' ' + (r.failure()?.errorText || ''));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 1500));

// hero screenshot
await page.screenshot({ path: `${OUT}/fin-council-hero.png` });

// open THE COUNCIL mega-menu (the .current pillar)
const navOpened = await page.evaluate(() => {
  const p = document.querySelector('.pillar.current');
  const b = p && p.querySelector('button'); if (!b) return false;
  b.click();
  return p.classList.contains('open');
});
await new Promise(r => setTimeout(r, 550));
await page.screenshot({ path: `${OUT}/fin-council-nav.png` });
console.log('MEGA-NAV (The Council) opens:', navOpened);

// close menu, scroll to TURTLE agent section
await page.evaluate(() => document.body.click());
await page.evaluate(() => { const s=document.getElementById('a-TURTLE'); if(s) s.scrollIntoView(); });
await new Promise(r => setTimeout(r, 1100));
await page.screenshot({ path: `${OUT}/fin-council-agent.png` });

// open TURTLE 3D viewer
await page.evaluate(() => window.__V3D && window.__V3D.open('TURTLE'));
// wait for GLB load + anim
let anim = null;
for (let i=0;i<40;i++){
  await new Promise(r => setTimeout(r, 500));
  anim = await page.evaluate(() => window.__V3D ? window.__V3D.anim : null);
  if (anim && anim.hasMixer) break;
}
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/fin-council-3d.png` });
console.log('3D anim state:', JSON.stringify(anim));

// drag-rotate test: record camera azimuth-ish via canvas drag
const beforeAfter = await page.evaluate(async () => {
  const stage = window.__V3D.stage;
  const cv = stage.querySelector('canvas'); if(!cv) return {ok:false};
  const ctx = window.__V3D.ctx; if(!ctx) return {ok:false};
  const p0 = ctx.camera.position.clone();
  const rect = cv.getBoundingClientRect();
  const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
  function ev(type,x){ cv.dispatchEvent(new PointerEvent(type,{clientX:x,clientY:cy,pointerId:1,bubbles:true,button:0})); }
  ev('pointerdown', cx);
  for(let i=1;i<=10;i++){ ev('pointermove', cx + i*14); }
  ev('pointerup', cx+140);
  await new Promise(r=>setTimeout(r,300));
  const p1 = ctx.camera.position.clone();
  return { ok:true, moved: (p0.distanceTo(p1) > 0.001), d: p0.distanceTo(p1) };
});
console.log('DRAG rotates camera:', JSON.stringify(beforeAfter));

// switch a clip (walk) if present
const clipSwitch = await page.evaluate(() => {
  const pills = [...document.querySelectorAll('.clip-pill')].map(p=>p.dataset.clip);
  if (window.__V3D && pills.includes('walk')) { window.__V3D.playClip('walk'); }
  return { pills, cur: window.__V3D && window.__V3D.anim ? window.__V3D.anim.curName : null };
});
console.log('CLIP pills:', JSON.stringify(clipSwitch));

// close disposes
const disposed = await page.evaluate(async () => {
  window.__V3D.close();
  await new Promise(r=>setTimeout(r,400));
  return { ctxNull: window.__V3D.ctx===null,
           canvasGone: !document.querySelector('#v3dStage canvas'),
           open: document.getElementById('v3d').classList.contains('open') };
});
console.log('CLOSE disposes:', JSON.stringify(disposed));

// mobile 480px
await page.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 });
await page.evaluate(() => window.scrollTo(0,0));
await new Promise(r => setTimeout(r, 700));
const mob = await page.evaluate(() => {
  const btn = document.getElementById('menuBtn');
  const visible = btn && getComputedStyle(btn).display !== 'none';
  if (btn) btn.click();
  const navOpen = document.getElementById('mobileNav').classList.contains('open');
  return { menuBtnVisible: visible, mobileNavOpens: navOpen };
});
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/fin-council-mobile.png` });
console.log('MOBILE:', JSON.stringify(mob));

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.forEach(e => console.log(e));

await browser.close();
process.exit(errors.length ? 1 : 0);
