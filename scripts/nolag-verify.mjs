import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
const errs=[];const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,140)));
await p.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2500));
// descent should NOT be loaded on scroll landing
const s0=await p.evaluate(()=>{
  var bg=document.getElementById('descentBg');
  return { descentSrc: bg?(bg.getAttribute('src')||'(empty)'):'(no el)', fallbackShown: (function(){var f=document.getElementById('descentFallback');return f?getComputedStyle(f).display!=='none':false;})() };
});
await p.screenshot({path:'scripts/nl-scroll-bg.png'});
// click View -> should load descent now
await p.evaluate(()=>document.getElementById('viewBtn').click());
await new Promise(r=>setTimeout(r,1200));
const s1=await p.evaluate(()=>{ var bg=document.getElementById('descentBg'); return { descentSrcAfterView: bg?(bg.getAttribute('src')||'(empty)'):'(no el)', immersive:document.body.classList.contains('immersive') }; });
await b.close();
console.log('errors='+errs.length); errs.slice(0,6).forEach(e=>console.log('  ! '+e));
console.log('ON SCROLL LANDING: descent src='+s0.descentSrc+'  (want empty = not loaded)  fallbackShown='+s0.fallbackShown);
console.log('AFTER View click: descent src='+s1.descentSrcAfterView+' immersive='+s1.immersive);
console.log((errs.length===0 && s0.descentSrc==='(empty)' && s1.descentSrcAfterView.indexOf('lab-molecules')>=0)?'RESULT: PASS':'RESULT: CHECK');
