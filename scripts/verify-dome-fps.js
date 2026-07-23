// Headless verify for lab-dome.html FPS/crispness pass.
const puppeteer = require('puppeteer');
const path = require('path');

const FLAGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const OUT = path.join(__dirname);

async function frameStats(browser, url, forceP, frames){
  const p = await browser.newPage();
  await p.setViewport({width:640,height:400,deviceScaleFactor:1});
  const errors=[];
  p.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errors.push('CONSOLEERR '+m.text()); });
  await p.goto(url,{waitUntil:'load'});
  await p.evaluate(fp=>{ window.__forceP=fp; }, forceP);
  // warm up
  await new Promise(r=>setTimeout(r,900));
  const info = await p.evaluate(()=>({
    fallback: getComputedStyle(document.getElementById('fallback')).display,
    hasGL: !!document.getElementById('gl').getContext,
    dbg: window.__DBG||null
  }));
  // collect inter-frame deltas via rAF
  const deltas = await p.evaluate((n)=>new Promise(res=>{
    const ts=[]; const t0=performance.now();
    function tick(now){
      ts.push(now);
      // stop at n frames OR after 8s wall-clock (swiftshader safety cap)
      if(ts.length<=n && (now-t0)<8000) requestAnimationFrame(tick);
      else{ const d=[]; for(let i=1;i<ts.length;i++) d.push(ts[i]-ts[i-1]); res(d); }
    }
    requestAnimationFrame(tick);
  }), frames);
  deltas.sort((a,b)=>a-b);
  const median = deltas[Math.floor(deltas.length/2)];
  await p.close();
  return {median, errors, info};
}

(async()=>{
  const browser = await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:120000});
  const base='http://localhost:3000';

  // A/B frame time at forceP=0.9
  const pre  = await frameStats(browser, base+'/__dome-pre-fps.html', 0.9, 40);
  const post = await frameStats(browser, base+'/lab-dome.html',       0.9, 40);
  console.log('AB_MEDIAN_PRE_MS='+pre.median.toFixed(3));
  console.log('AB_MEDIAN_POST_MS='+post.median.toFixed(3));
  console.log('AB_IMPROVED='+(post.median<=pre.median+0.05));

  // Full correctness + WebGL2 + drag on current
  const page = await browser.newPage();
  await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  page.on('console',m=>{ if(m.type()==='error') errors.push('CONSOLEERR '+m.text()); });
  await page.goto(base+'/lab-dome.html',{waitUntil:'load'});

  const gl2 = await page.evaluate(()=>{
    const c=document.createElement('canvas');
    return !!c.getContext('webgl2');
  });
  console.log('WEBGL2='+gl2);
  console.log('FALLBACK_DISPLAY='+await page.evaluate(()=>getComputedStyle(document.getElementById('fallback')).display));

  // Orion view: aim gaze roughly at Orion via forceYaw/pitch, full dome
  await page.evaluate(()=>{ window.__forceP=0.95; });
  await new Promise(r=>setTimeout(r,800));
  await page.screenshot({path:path.join(OUT,'sf-dome-orion.png')});

  // Crown / zenith: look straight up (pitch small)
  await page.evaluate(()=>{ window.__forceP=1.0; window.__forceYaw=0.0; window.__forcePitch=0.0; });
  await new Promise(r=>setTimeout(r,800));
  await page.screenshot({path:path.join(OUT,'sf-dome-crown.png')});

  // DRAG test: record yaw before, simulate a drag, record yaw after
  await page.evaluate(()=>{ delete window.__forceYaw; delete window.__forcePitch; window.__forceP=0.9; });
  await new Promise(r=>setTimeout(r,300));
  const yawBefore = await page.evaluate(()=>window.__DBG.yaw);
  // simulate pointer drag across canvas
  const cv = await page.$('#gl');
  const box = await cv.boundingBox();
  const cx = box.x+box.width/2, cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);
  await page.mouse.down();
  for(let i=1;i<=10;i++){ await page.mouse.move(cx - i*30, cy + i*4); await new Promise(r=>setTimeout(r,16)); }
  await page.mouse.up();
  await new Promise(r=>setTimeout(r,500));
  const yawAfter = await page.evaluate(()=>window.__DBG.yaw);
  console.log('YAW_BEFORE='+yawBefore.toFixed(4));
  console.log('YAW_AFTER='+yawAfter.toFixed(4));
  console.log('DRAG_ROTATES='+(Math.abs(yawAfter-yawBefore)>0.01));
  await page.screenshot({path:path.join(OUT,'sf-dome-drag.png')});

  const allErr = errors.concat(pre.errors, post.errors);
  console.log('ERROR_COUNT='+allErr.length);
  allErr.slice(0,20).forEach(e=>console.log('ERR: '+e));
  await browser.close();
})().catch(e=>{ console.error('HARNESS_FAIL',e); process.exit(1); });
