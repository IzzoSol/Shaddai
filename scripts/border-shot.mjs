import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:'scripts/bd-hero.png'});
await p.evaluate(()=>window.scrollTo(0, innerHeight*3));
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'scripts/bd-mid.png'});
// check for horizontal overflow + any element wider than viewport
const info=await p.evaluate(()=>{
  const de=document.documentElement;
  const overflowX = de.scrollWidth - de.clientWidth;
  // find elements extending past the right edge
  const wide=[]; document.querySelectorAll('*').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.right>innerWidth+1 && r.width>2){ wide.push(el.tagName+'.'+(el.className||'').toString().slice(0,30)+' right='+Math.round(r.right)); } });
  return { overflowX, scrollWidth:de.scrollWidth, clientWidth:de.clientWidth, wide:wide.slice(0,8) };
});
await b.close();
console.log('overflowX='+info.overflowX+' scrollWidth='+info.scrollWidth+' clientWidth='+info.clientWidth);
console.log('elements past right edge:'); info.wide.forEach(w=>console.log('  '+w));
