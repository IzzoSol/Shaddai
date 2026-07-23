import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/lab-molecules.html';
const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-gpu-rasterization','--no-sandbox','--window-size=1280,800']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

page.on('console', m => { const t=m.text(); logs.push(t); if(m.type()==='error') errors.push('CONSOLE:'+t); });
page.on('pageerror', e => errors.push('PAGEERROR:'+e.message));
page.on('requestfailed', r => errors.push('REQFAIL:'+r.url()+' '+ (r.failure()&&r.failure().errorText)));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r=>setTimeout(r,1500));

const webgl2 = await page.evaluate(() => { const c=document.createElement('canvas'); return !!c.getContext('webgl2'); });
const acquired = logs.some(l => l.includes('WebGL2 acquired'));
const maxScroll = await page.evaluate(()=> document.documentElement.scrollHeight - window.innerHeight);

async function shotAt(frac, name){
  // Under swiftshader the 4-pass pipeline runs at low fps so the eased scroll
  // can't converge in reasonable time. Pin p directly (test-only hook) AND set
  // scroll position, so the screenshot reflects the exact intended scale.
  const y = Math.round(maxScroll * frac);
  await page.evaluate((yy,f)=>{ window.scrollTo(0,yy); window.__forceP = f; }, y, frac);
  // let a few frames render at the pinned p (mouse/time still ease)
  await new Promise(r=>setTimeout(r, 2500));
  await page.screenshot({ path: `scripts/${name}` });
  const dbg = await page.evaluate(()=>window.__DBG||{p:0,pMol:0,pLife:0});
  return `frac=${frac} p=${dbg.p.toFixed(3)} pMol=${dbg.pMol.toFixed(3)} pLife=${dbg.pLife.toFixed(3)}`;
}

const a = await shotAt(0.10, 'j2-molecule.png'); // still molecular
const b = await shotAt(0.65, 'j2-grass.png');    // grass field
const c = await shotAt(0.92, 'j2-tree.png');     // tree, craning up

console.log('--- RESULT ---');
console.log('WebGL2 supported:', webgl2);
console.log('WebGL2 acquired (page log):', acquired);
console.log('maxScroll(px):', maxScroll);
console.log('scroll fracs:', a, b, c);
console.log('errors:', errors.length);
if(errors.length) console.log(errors.join('\n'));

await browser.close();
process.exit(errors.length ? 1 : 0);
