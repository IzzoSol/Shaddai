const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/pplm'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:520,height:460,deviceScaleFactor:2});
  await p.setContent('<canvas id="c" width="520" height="460"></canvas>');
  await p.addScriptTag({path:path.resolve(__dirname,'public','landmarks.js')});
  await new Promise(r=>setTimeout(r,200));
  await p.evaluate(()=>{ const x=document.getElementById('c').getContext('2d'); x.fillStyle='#2a5a3a'; x.fillRect(0,0,520,460); window.Landmarks.draw(x,'castle',260,300,0); });
  await new Promise(r=>setTimeout(r,150));
  await p.screenshot({path:path.resolve(__dirname,'_lm_castle.png')});
  await b.close(); console.log('landmark shot saved. errors:',errs.length?errs.slice(0,4).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
