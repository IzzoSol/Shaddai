import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox','--use-gl=swiftshader','--window-size=1440,900']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.evaluateOnNewDocument(()=>{try{sessionStorage.setItem('shd_guest','1');}catch(e){}});
await p.goto('http://localhost:3000/dashboard',{waitUntil:'domcontentloaded',timeout:25000}).catch(()=>{});
await new Promise(r=>setTimeout(r,4000));
const state=await p.evaluate(()=>{
  // dismiss auth gate if present
  const gate=document.getElementById('shdAuthGate'); let gateVis=false;
  if(gate){ gateVis=getComputedStyle(gate).display!=='none'; const skip=gate.querySelector('.skip,[onclick*="skip"],[onclick*="guest"]'); if(skip) skip.click(); }
  try{ if(typeof showView==='function') showView('dash'); }catch(e){}
  const h=document.getElementById('shaddaiHome'); if(h){ h.scrollIntoView({block:'start'}); }
  const bar=document.querySelector('#shaddaiHome .hh-bar');
  return { gateVis, hubTop: h?Math.round(h.getBoundingClientRect().top):null, barH: bar?Math.round(bar.getBoundingClientRect().height):null, barVisible: bar?getComputedStyle(bar).display:null };
});
console.log('state:', JSON.stringify(state));
await new Promise(r=>setTimeout(r,1000));
await p.screenshot({path:'_dash-top.png'});
await b.close();process.exit(0);
