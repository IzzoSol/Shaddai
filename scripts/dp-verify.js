const puppeteer = require('puppeteer');
const sharp = require('sharp');
async function pngMeanLum(p){
  const { data } = await sharp(p).raw().toBuffer({resolveWithObject:true});
  let s=0; for(let i=0;i<data.length;i+=3){ s += (data[i]+data[i+1]+data[i+2]); }
  return s/((data.length/3)*3);
}
const FLAGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function openPage(browser, url, errs){
  const page = await browser.newPage();
  await page.setViewport({width:320,height:200});
  page.on('console', m => { if(m.type()==='error') errs.push('console:'+m.text()); });
  page.on('pageerror', e => errs.push('pageerror:'+e.message));
  await page.goto(url,{waitUntil:'load',timeout:40000});
  await wait(1000);
  return page;
}

async function medFrame(page, fp, n){
  await page.evaluate(f => { window.__forceP = f; }, fp);
  await wait(700);
  const ts = await page.evaluate((N) => new Promise(res => {
    const a=[]; let last=performance.now(); let i=0;
    function s(){ const now=performance.now(); a.push(now-last); last=now;
      if(++i>=N){res(a);return;} requestAnimationFrame(s); }
    requestAnimationFrame(s);
  }), n);
  ts.sort((x,y)=>x-y);
  return ts[Math.floor(ts.length/2)];
}

(async () => {
  const out = {};
  const browser = await puppeteer.launch({headless:'new', args:FLAGS, protocolTimeout:200000});

  // ---- 1. error sweep across forceP on the AFTER (fixed) page ----
  const errs = [];
  const page = await openPage(browser, 'http://localhost:3000/lab-molecules.html', errs);
  for(const fp of [0.7,0.8,0.9,0.97,1.0]){
    await page.evaluate(f => { window.__forceP = f; }, fp);
    await wait(500);
  }
  out.errorsAfterSweep = errs.slice();

  // ---- 2. seam (0.8) + dome (0.95) screenshots on AFTER page ----
  await page.evaluate(f => { window.__forceP = f; }, 0.8);
  await wait(900);
  out.seamDBG = await page.evaluate(() => window.__DBG);
  await page.screenshot({path: __dirname + '/dp-seam.png'});
  out.seamMeanLum = +(await pngMeanLum(__dirname + '/dp-seam.png')).toFixed(2);

  await page.evaluate(f => { window.__forceP = f; }, 0.95);
  await wait(900);
  out.domeDBG = await page.evaluate(() => window.__DBG);
  await page.screenshot({path: __dirname + '/dp-dome.png'});
  out.domeMeanLum = +(await pngMeanLum(__dirname + '/dp-dome.png')).toFixed(2);
  await page.close();

  await browser.close();

  // ---- 3. A/B frame time at the dome (forceP ~0.95 -> pDome 0.853 -> cull ON) ----
  // Baseline frames are ~2s each on swiftshader, so use a fresh browser per
  // measurement, a small viewport, and modest frame counts to avoid protocol
  // timeouts / target crashes. Wrap each measure so one crash doesn't abort.
  async function measure(url, fp, frames){
    let br;
    try {
      br = await puppeteer.launch({headless:'new', args:FLAGS, protocolTimeout:220000});
      const pg = await br.newPage();
      await pg.setViewport({width:200,height:130});
      await pg.goto(url,{waitUntil:'load',timeout:40000});
      await wait(1200);
      await pg.evaluate(f => { window.__forceP = f; }, fp);
      await wait(1000);                       // let renderScale/EMA settle (pinned to 1 under forceP)
      const ts = await pg.evaluate((N) => new Promise(res => {
        const a=[]; let last=performance.now(); let i=0;
        function s(){ const now=performance.now(); a.push(now-last); last=now;
          if(++i>=N){res(a);return;} requestAnimationFrame(s); }
        requestAnimationFrame(s);
      }), frames);
      ts.sort((x,y)=>x-y);
      return ts[Math.floor(ts.length/2)];
    } finally { if(br) try{ await br.close(); }catch(e){} }
  }

  const B=[], A=[];
  for(let k=0;k<3;k++){
    try { B.push(await measure('http://localhost:3000/_dp-baseline.html', 0.95, 14)); } catch(e){ B.push(null); }
    try { A.push(await measure('http://localhost:3000/lab-molecules.html', 0.95, 14)); } catch(e){ A.push(null); }
  }
  const bClean = B.filter(x=>x!=null).sort((a,b)=>a-b);
  const aClean = A.filter(x=>x!=null).sort((a,b)=>a-b);
  const med = arr => arr.length? arr[Math.floor(arr.length/2)] : null;
  const bMed = med(bClean), aMed = med(aClean);
  out.ab = {
    beforeMs: bMed!=null? +bMed.toFixed(2):null,
    afterMs:  aMed!=null? +aMed.toFixed(2):null,
    deltaPct: (bMed!=null&&aMed!=null)? +(((aMed-bMed)/bMed)*100).toFixed(1):null,
    allBefore: B.map(x=>x!=null?+x.toFixed(1):null),
    allAfter:  A.map(x=>x!=null?+x.toFixed(1):null)
  };

  require('fs').writeFileSync(__dirname+'/_dp-result.json', JSON.stringify(out,null,2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
