import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/home.html';
const OUT = 'scripts';
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 120000,
  userDataDir: 'scripts/.rw-chrome-'+Date.now(),
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist','--no-sandbox']
});

async function newPage(w,h){
  const page = await browser.newPage();
  await page.setViewport({ width:w, height:h, deviceScaleFactor:1 });
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE['+w+']: '+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR['+w+']: '+e.message));
  page.on('requestfailed', r => {
    const u=r.url();
    if(/\/api\//.test(u)) return; // API guarded
    errors.push('REQFAIL['+w+']: '+u+' '+(r.failure()?.errorText||''));
  });
  return page;
}

async function shot(page, path){
  // swiftshader + continuous canvas rAF saturates the compositor and hangs captureScreenshot.
  // Quiesce rAF-driven paints for the capture, then restore.
  // Only quiesce the DESCENT IFRAME's rAF (the swiftshader compositor hog). Leave the parent
  // page rAF running so .reveal fades and hero animations are captured in their real state.
  await page.evaluate(()=>{
    try{ const w=document.getElementById('descentBg')?.contentWindow;
      if(w){ w.__origRAF=w.requestAnimationFrame; w.requestAnimationFrame=function(){ return 0; }; } }catch(e){}
  });
  await new Promise(r=>setTimeout(r,200));
  try{ await page.screenshot({ path, captureBeyondViewport:false }); }
  catch(e){ console.log('SHOT-FAIL '+path+': '+e.message); }
  await page.evaluate(()=>{
    try{ const w=document.getElementById('descentBg')?.contentWindow;
      if(w&&w.__origRAF){ w.requestAnimationFrame=w.__origRAF; } }catch(e){} });
}

/* ---------- DESKTOP ---------- */
const d = await newPage(1440, 900);
await d.goto(URL, { waitUntil:'domcontentloaded', timeout:45000 });
await new Promise(r=>setTimeout(r,1200));

// hero
await shot(d, `${OUT}/rw-hero.png`);

// descent-bg iframe present + capable + gets src
const bgInfo = await d.evaluate(()=>{
  const bg=document.getElementById('descentBg');
  return { exists:!!bg, src:bg?bg.getAttribute('src'):null,
    fallback:!!document.getElementById('descentFallback') };
});
// wait for lazy src set (350ms after load) + iframe load
await new Promise(r=>setTimeout(r,1600));
const bgAfter = await d.evaluate(()=>{
  const bg=document.getElementById('descentBg');
  return { src:bg?bg.getAttribute('src'):null, lit:bg?bg.classList.contains('lit'):false };
});
console.log('DESKTOP descentBg exists:', bgInfo.exists, '| fallback:', bgInfo.fallback);
console.log('DESKTOP descentBg src after load:', bgAfter.src, '| lit:', bgAfter.lit);

// roster: 7 cards, one clean row, no empty cells
const roster = await d.evaluate(()=>{
  const el=document.getElementById('roster');
  const ops=el?el.querySelectorAll('.op'):[];
  const cs=el?getComputedStyle(el).gridTemplateColumns.split(' ').length:0;
  // detect orphan empty cells: number of grid tracks vs items in the row
  return { count:ops.length, cols:cs };
});
console.log('ROSTER count:', roster.count, '| grid columns:', roster.cols);

// scroll to council + screenshot
await d.evaluate(()=>document.getElementById('council').scrollIntoView());
await new Promise(r=>setTimeout(r,700));
await shot(d, `${OUT}/rw-council.png`);

// scroll to mid (views/system) so descent shows behind content
await d.evaluate(()=>{ const s=document.getElementById('views'); if(s) s.scrollIntoView(); });
await new Promise(r=>setTimeout(r,800));
// verify iframe scroll synced (internal scrollY > 0 once we're mid-page)
const syncCheck = await d.evaluate(()=>{
  const bg=document.getElementById('descentBg');
  let inner=-1; try{ inner=bg.contentWindow.scrollY; }catch(e){ inner='X-ORIGIN'; }
  return { pageY:window.scrollY, innerY:inner };
});
console.log('SCROLL SYNC pageY:', syncCheck.pageY, '| iframe innerY:', syncCheck.innerY);
await shot(d, `${OUT}/rw-mid.png`);

// mega-nav opens
const nav = await d.evaluate(()=>{
  const p=document.querySelector('.pillar[data-pillar]'); const b=p&&p.querySelector('button');
  if(!b) return false; b.click(); return p.classList.contains('open');
});
console.log('MEGA-NAV opens:', nav);

// descent overlay (full-screen player) opens
await d.evaluate(()=>{ const p=document.querySelector('.pillar.open'); if(p)p.classList.remove('open'); });
const overlay = await d.evaluate(()=>{
  const btn=document.querySelector('.descent-btn[data-descent]'); if(!btn) return false;
  btn.click();
  return document.getElementById('descentPlayer').classList.contains('open');
});
console.log('DESCENT overlay opens:', overlay);

/* ---------- MOBILE (<=820) ---------- */
const m = await newPage(390, 844);
await m.goto(URL, { waitUntil:'domcontentloaded', timeout:45000 });
await new Promise(r=>setTimeout(r,2000));
const mBg = await m.evaluate(()=>{
  const bg=document.getElementById('descentBg');
  return { src:bg?bg.getAttribute('src'):null, fallback:!!document.getElementById('descentFallback') };
});
console.log('MOBILE descentBg src (should be null/empty):', JSON.stringify(mBg.src), '| fallback:', mBg.fallback);
// mobile menu opens
const mMenu = await m.evaluate(()=>{
  const b=document.getElementById('menuBtn'); if(!b) return false;
  b.click(); return document.getElementById('mobileNav').classList.contains('open');
});
console.log('MOBILE menu opens:', mMenu);
await m.evaluate(()=>{ const b=document.getElementById('mClose'); if(b)b.click(); });
await new Promise(r=>setTimeout(r,300));
await shot(m, `${OUT}/rw-mobile.png`);

await browser.close();
console.log('\n=== ERRORS ('+errors.length+') ===');
errors.forEach(e=>console.log(e));
console.log(errors.length===0 ? 'CLEAN — 0 console/page/request errors' : 'HAS ERRORS');
