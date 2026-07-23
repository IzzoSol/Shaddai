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
  if (/\/api\//.test(u)) return;
  if (/\/assets\/agents\/.*-council\.png/.test(u)) return;
  errors.push('REQFAIL: ' + u + ' ' + (r.failure()?.errorText || ''));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 1500));

// hero screenshot
await page.screenshot({ path: `${OUT}/gl-council-hero.png` });

// AURA glow system present?
const auraInfo = await page.evaluate(() => window.__AURA ? { count: window.__AURA.count } : null);
console.log('AURA glow system:', JSON.stringify(auraInfo));

// only on-screen agent should animate: at hero, expect 0-1 visible/animating
const atHero = await page.evaluate(() => window.__AURA ? { animating: window.__AURA.animatingCount(), visible: window.__AURA.visibleCount() } : null);
console.log('At hero — glow:', JSON.stringify(atHero));

// scroll to TURTLE agent, glow behind it should animate
await page.evaluate(() => { const s=document.getElementById('a-TURTLE'); if(s) s.scrollIntoView({block:'center'}); });
await new Promise(r => setTimeout(r, 1200));
const atTurtle = await page.evaluate(() => window.__AURA ? { animating: window.__AURA.animatingCount(), visible: window.__AURA.visibleCount() } : null);
console.log('At TURTLE — glow:', JSON.stringify(atTurtle));
await page.screenshot({ path: `${OUT}/gl-council-agent.png` });

// relatability: no chakra/sephira jargon in visible body text
const jargon = await page.evaluate(() => {
  const t = document.body.innerText;
  const hits = [];
  [/chakra/i,/sahasrara/i,/ajna/i,/vishuddha/i,/anahata/i,/manipura/i,/svadhisthana/i,/muladhara/i,/sephira/i,/sephirot/i,/kabbalah/i,/tree of life/i].forEach(re=>{ if(re.test(t)) hits.push(re.source); });
  return { hits, hasHebrew: /[֐-׿]/.test(t) };
});
console.log('Jargon in visible text:', JSON.stringify(jargon));

// open TURTLE 3D viewer
await page.evaluate(() => window.__V3D && window.__V3D.open('TURTLE'));
let anim = null;
for (let i=0;i<40;i++){
  await new Promise(r => setTimeout(r, 500));
  anim = await page.evaluate(() => window.__V3D ? window.__V3D.anim : null);
  if (anim && anim.hasMixer) break;
}
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/gl-council-3d.png` });
console.log('3D anim state:', JSON.stringify(anim));

// glow should pause while a full-screen modal covers the section — sections still "visible" per IO,
// but confirm no errors; then close disposes
const disposed = await page.evaluate(async () => {
  window.__V3D.close();
  await new Promise(r=>setTimeout(r,400));
  return { ctxNull: window.__V3D.ctx===null,
           canvasGone: !document.querySelector('#v3dStage canvas'),
           open: document.getElementById('v3d').classList.contains('open') };
});
console.log('3D CLOSE disposes:', JSON.stringify(disposed));

// visibility hidden pauses glow RAF
const hiddenPause = await page.evaluate(async () => {
  Object.defineProperty(document, 'hidden', { configurable:true, get:()=>true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r=>setTimeout(r,200));
  const paused = window.__AURA.animatingCount();
  Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r=>setTimeout(r,200));
  return { pausedCount: paused, resumedCount: window.__AURA.animatingCount() };
});
console.log('Glow pause-on-hidden:', JSON.stringify(hiddenPause));

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.forEach(e => console.log(e));

await browser.close();
process.exit(errors.length ? 1 : 0);
