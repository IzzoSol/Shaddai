const puppeteer=require('puppeteer');
const FLAGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:120000});
  const page=await browser.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
  page.on('pageerror',e=>errs.push('PE:'+e.message.slice(0,160)));
  await page.setViewport({width:700,height:440});
  await page.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'load',timeout:30000});
  await wait(1000);
  const gl2=await page.evaluate(()=>{try{return !!document.getElementById('gl').getContext('webgl2');}catch(e){return false;}});
  const fb=await page.evaluate(()=>{const f=document.getElementById('fallback');return f&&getComputedStyle(f).display!=='none';});
  await page.evaluate(()=>{window.__forceP=0.90;});
  await wait(900);
  await page.screenshot({path:'scripts/px-apex-final.png'});
  await page.evaluate(()=>{window.__forceP=0.96;});
  await wait(900);
  await page.screenshot({path:'scripts/px-night-final.png'});
  console.log(JSON.stringify({gl2,fbShown:fb,errors:errs}));
  await browser.close();
})();
