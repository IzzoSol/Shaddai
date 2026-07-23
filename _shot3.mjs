import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox','--use-gl=swiftshader','--window-size=1440,900']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.evaluateOnNewDocument(()=>{try{sessionStorage.setItem('shd_guest','1'); localStorage.setItem('shd_onboarding_done','1'); localStorage.setItem('shaddai_onboarded','1');}catch(e){}});
await p.goto('http://localhost:3000/dashboard',{waitUntil:'domcontentloaded',timeout:25000}).catch(()=>{});
await new Promise(r=>setTimeout(r,4500));
await p.evaluate(()=>{
  // hide any first-run onboarding / axiom overlays covering the hub
  document.querySelectorAll('[class*="shd-ob"],[id*="onboard"],#axiomModal').forEach(e=>{ try{ if(getComputedStyle(e).position==='fixed'||e.id==='axiomModal') e.style.display='none'; }catch(_){}}); 
  try{ if(typeof showView==='function') showView('dash'); }catch(e){}
  const h=document.getElementById('shaddaiHome'); if(h) h.scrollIntoView({block:'start'});
});
await new Promise(r=>setTimeout(r,900));
const bar=await p.$('#shaddaiHome .hh-bar');
if(bar){ const box=await bar.boundingBox(); await p.screenshot({path:'_hub-final.png', clip:{x:0,y:Math.max(0,box.y-6),width:1440,height:Math.min(120,box.height+16)}}); console.log('captured hub bar region h='+Math.round(box.height)); }
await b.close();process.exit(0);
