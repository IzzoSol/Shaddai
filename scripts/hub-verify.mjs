import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1280,800']});
const errs=[];
const p=await b.newPage();
await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,200)));
p.on('requestfailed',r=>{if(!r.url().includes('favicon'))errs.push('REQFAIL '+r.url().slice(0,80));});
await p.goto('http://localhost:3000/home.html',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
// probe mega-nav pillars + descent button existence
const probe=await p.evaluate(()=>{
  const t=document.body.innerText;
  const pillars=['ENTER','COUNCIL','CREATE','PLAY','INTELLIGENCE','LEARN'].filter(x=>t.toUpperCase().includes(x));
  const descentBtn=/play the descent|full screen|play only/i.test(t);
  const iframe=!!document.querySelector('iframe');
  const heroWord=(document.querySelector('.wordmark,.neon,h1')||{}).textContent||'';
  return {pillars, descentBtn, iframeAtLoad:iframe, heroWord:heroWord.slice(0,40)};
});
// mobile screenshot
await p.setViewport({width:430,height:900,deviceScaleFactor:1});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:'scripts/hub-mobile.png'});
await b.close();
console.log('errors='+errs.length);
errs.slice(0,10).forEach(e=>console.log('  ! '+e));
console.log('pillars found:',JSON.stringify(probe.pillars));
console.log('descent button:',probe.descentBtn,'| iframe present at load (should be false/lazy):',probe.iframeAtLoad,'| hero:',probe.heroWord);
console.log(errs.length===0?'RESULT: PASS':'RESULT: CHECK');
