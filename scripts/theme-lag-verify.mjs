import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1400,900']});
const errs=[];const p=await b.newPage();
await p.setViewport({width:1400,height:900,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push('home '+m.text().slice(0,120));});
p.on('pageerror',e=>errs.push('home PAGEERR '+e.message.slice(0,120)));
await p.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,1800));
const h1=await p.evaluate(()=>{
  const bg=document.getElementById('descentBg');
  const cs=bg?getComputedStyle(bg):null;
  return { theme:document.documentElement.getAttribute('data-theme'), bgTransform:cs?cs.transform:null, bgW:cs?cs.width:null, toggle:!!document.getElementById('themeToggle') };
});
// toggle to codex
await p.evaluate(()=>{document.getElementById('themeToggle').click();});
await new Promise(r=>setTimeout(r,700));
const h2=await p.evaluate(()=>{const bg=document.getElementById('descentBg');return { theme:document.documentElement.getAttribute('data-theme'), bgDisplay:bg?getComputedStyle(bg).display:null, stored:localStorage.getItem('shaddai-theme') };});
await p.screenshot({path:'scripts/tl-home-codex.png'});
// reload -> should stay codex (persist)
await p.reload({waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,900));
const h3=await p.evaluate(()=>document.documentElement.getAttribute('data-theme'));
await p.close();
// codex page inherits codex, toggle to neon
const errs2=[];const p2=await b.newPage();
p2.on('console',m=>{if(m.type()==='error')errs2.push('codex '+m.text().slice(0,120));});
p2.on('pageerror',e=>errs2.push('codex PAGEERR '+e.message.slice(0,120)));
await p2.goto('http://localhost:3000/codex.html',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,1200));
const c1=await p2.evaluate(()=>document.documentElement.getAttribute('data-theme'));
await p2.evaluate(()=>window.__toggleTheme&&window.__toggleTheme());
await new Promise(r=>setTimeout(r,600));
const c2=await p2.evaluate(()=>({theme:document.documentElement.getAttribute('data-theme'),stored:localStorage.getItem('shaddai-theme')}));
await p2.screenshot({path:'scripts/tl-codex-neon.png'});
await b.close();
console.log('HOME errors='+errs.length); errs.slice(0,6).forEach(e=>console.log('  ! '+e));
console.log('  init theme='+h1.theme+' toggle='+h1.toggle+' bgW='+h1.bgW+' bgTransform='+(h1.bgTransform||'').slice(0,30));
console.log('  after click: theme='+h2.theme+' descentDisplay='+h2.bgDisplay+' stored='+h2.stored);
console.log('  after reload persist theme='+h3);
console.log('CODEX errors='+errs2.length); errs2.slice(0,6).forEach(e=>console.log('  ! '+e));
console.log('  codex init theme(inherited)='+c1+' after toggle='+JSON.stringify(c2));
console.log((errs.length===0&&errs2.length===0&&h2.theme==='codex'&&h2.bgDisplay==='none'&&h3==='codex'&&c1==='codex')?'RESULT: PASS':'RESULT: CHECK');
