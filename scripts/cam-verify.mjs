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

// wait for animation to warm
await new Promise(r=>setTimeout(r,1500));

const webgl2 = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!c.getContext('webgl2');
});

const acquired = logs.some(l => l.includes('WebGL2 acquired'));
const maxScroll = await page.evaluate(()=> document.documentElement.scrollHeight - window.innerHeight);

async function shotAt(frac, name){
  const y = Math.round(maxScroll * frac);
  await page.evaluate(yy => window.scrollTo(0, yy), y);
  // let eased camera settle (ease factor 0.06 -> ~2s to converge)
  await new Promise(r=>setTimeout(r, 2600));
  await page.screenshot({ path: `scripts/${name}` });
  const p = await page.evaluate(()=> (window.scrollY)/(document.documentElement.scrollHeight-window.innerHeight));
  return p.toFixed(3);
}

const pIn  = await shotAt(0.00, 'cam-inside.png');
const pMid = await shotAt(0.40, 'cam-mid.png');
const pOut = await shotAt(0.90, 'cam-out.png');

console.log('--- RESULT ---');
console.log('WebGL2 supported:', webgl2);
console.log('WebGL2 acquired (from page log):', acquired);
console.log('maxScroll(px):', maxScroll);
console.log('scroll fracs captured:', pIn, pMid, pOut);
console.log('errors:', errors.length);
if(errors.length) console.log(errors.join('\n'));

await browser.close();
process.exit(errors.length ? 1 : 0);
