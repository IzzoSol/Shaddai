import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2000));
const info=await p.evaluate(()=>{
  const sky=document.getElementById('sky');
  const view=document.getElementById('viewBtn');
  const gate=document.getElementById('shGateC');
  return { heroCanvas:!!sky, heroCanvasSize: sky?sky.width+'x'+sky.height:null, viewBtn:!!view, viewText:view?view.textContent.trim():null, shGate:!!gate };
});
await p.screenshot({path:'scripts/wa-hero.png'});
await b.close();
console.log('errors='+errs.length);
console.log(JSON.stringify(info));
