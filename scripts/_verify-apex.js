const puppeteer = require('puppeteer');

const FLAGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait = ms => new Promise(r=>setTimeout(r,ms));

async function load(browser, url, vw, vh){
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if(m.type()==='error') errors.push('console:'+m.text().slice(0,200)); });
  page.on('pageerror', e => errors.push('pageerror:'+e.message.slice(0,200)));
  await page.setViewport({width:vw,height:vh});
  await page.goto(url,{waitUntil:'load',timeout:30000});
  await wait(900);
  return {page,errors};
}

async function shot(page, fp, file){
  await page.evaluate(f=>{ window.__forceP = f; }, fp);
  await wait(900);
  await page.screenshot({path:file});
}

async function frameMedian(page, fp, n){
  await page.evaluate(f=>{ window.__forceP = f; }, fp);
  await wait(500);
  const times = await page.evaluate((N)=>new Promise((resolve)=>{
    const ts=[]; let last=performance.now(); let i=0;
    function step(){ const now=performance.now(); ts.push(now-last); last=now;
      if(++i>=N){ resolve(ts); return; } requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }), n);
  times.sort((a,b)=>a-b);
  return times[Math.floor(times.length/2)];
}

async function obsidianPct(page, fp){
  await page.evaluate(f=>{window.__forceP=f;}, fp);
  await wait(700);
  return page.evaluate(()=>{
    const c=document.getElementById('gl'); const g=c.getContext('webgl2');
    const w=c.width,h=c.height; const px=new Uint8Array(w*h*4);
    g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,px);
    let dark=0,tot=w*h;
    for(let i=0;i<tot;i++){ const r=px[i*4],gg=px[i*4+1],b=px[i*4+2];
      if(0.299*r+0.587*gg+0.114*b<40) dark++; }
    return dark/tot;
  });
}

(async()=>{
  const browser = await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:240000});
  const out = {};
  try{
    // ---- PHASE 1: status + errors + screenshots on the CURRENT build ----
    const A = await load(browser,'http://localhost:3000/lab-molecules.html',900,560);
    out.status = await A.page.evaluate(()=>{
      const fb=document.getElementById('fallback');
      const fbShown = fb && getComputedStyle(fb).display!=='none';
      let gl2=false; try{ gl2=!!document.getElementById('gl').getContext('webgl2'); }catch(e){}
      return {fbShown, gl2};
    });
    await shot(A.page,0.62,'scripts/px-loved-062.png');
    await shot(A.page,0.66,'scripts/px-desert-loved.png');
    await shot(A.page,0.90,'scripts/px-apex.png');
    await shot(A.page,0.96,'scripts/px-night.png');
    out.obsidian_apex  = await obsidianPct(A.page,0.90);
    out.obsidian_night = await obsidianPct(A.page,0.96);
    out.errors = A.errors;
    await A.page.close();

    // ---- PHASE 2: baseline loved screenshot ----
    const B = await load(browser,'http://localhost:3000/_lab-molecules-baseline.html',900,560);
    await shot(B.page,0.62,'scripts/px-loved-062-BASELINE.png');
    await B.page.close();

    // ---- PHASE 3: A/B frame time at forceP=0.72, small viewport ----
    const Cb = await load(browser,'http://localhost:3000/_lab-molecules-baseline.html',320,200);
    const mb=[]; for(let k=0;k<3;k++) mb.push(await frameMedian(Cb.page,0.72,40));
    mb.sort((a,b)=>a-b); out.frameMedian072_BEFORE = +mb[1].toFixed(2);
    await Cb.page.close();
    const Ca = await load(browser,'http://localhost:3000/lab-molecules.html',320,200);
    const ma=[]; for(let k=0;k<3;k++) ma.push(await frameMedian(Ca.page,0.72,40));
    ma.sort((a,b)=>a-b); out.frameMedian072_AFTER = +ma[1].toFixed(2);
    await Ca.page.close();
    out.frameDeltaPct = +(((out.frameMedian072_AFTER-out.frameMedian072_BEFORE)/out.frameMedian072_BEFORE)*100).toFixed(1);

    console.log(JSON.stringify(out,null,2));
  }catch(e){
    console.log('SCRIPT_ERROR '+e.message);
    console.log('PARTIAL '+JSON.stringify(out));
  }finally{ await browser.close(); }
})();
