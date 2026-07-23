import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3000/marketplace-shop-v2.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2000));
const d=await p.evaluate(()=>{
  const pillars=document.querySelectorAll('.pillar[data-pillar]');
  const pl=pillars[2];
  const btn=pl&&pl.querySelector('button');
  const before={ pillars:pillars.length, hasBtn:!!btn };
  if(btn) btn.click();
  const openNow = pl.classList.contains('open');
  const panel=pl.querySelector('.panel');
  const cs=panel?getComputedStyle(panel):null;
  // check bar z-index + any fixed ancestor issue
  const bar=document.querySelector('.bar');
  const barZ=bar?getComputedStyle(bar).zIndex:null;
  const bodyOverflow=getComputedStyle(document.body).overflow;
  return { ...before, openClassAdded:openNow, panelVis:cs?cs.visibility:'no panel', panelOp:cs?cs.opacity:null, panelZ:cs?cs.zIndex:null, barZ, bodyOverflow };
});
await new Promise(r=>setTimeout(r,450));
const after=await p.evaluate(()=>{const pl=document.querySelectorAll('.pillar[data-pillar]')[2];const panel=pl.querySelector('.panel');const cs=getComputedStyle(panel);return{vis:cs.visibility,op:cs.opacity};});
await b.close();
console.log('errors='+errs.length); errs.slice(0,3).forEach(e=>console.log('  ! '+e));
console.log('pillars='+d.pillars+' openClassAdded='+d.openClassAdded+' barZ='+d.barZ+' panelZ='+d.panelZ+' bodyOverflow='+d.bodyOverflow);
console.log('panel immediately: vis='+d.panelVis+' op='+d.panelOp);
console.log('panel after 450ms: vis='+after.vis+' op='+after.op);
