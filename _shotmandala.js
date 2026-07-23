const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppm'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1400,height:900,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{ regionSel='agentcity'; goRegion(); enterWorld(); tod=0.05; cam.col=30; cam.row=30; zoom=0.5; });
  await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{ cam.col=30; cam.row=30; zoom=0.5; tod=0.05; });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:path.resolve(__dirname,'_mandala.png')});
  await b.close(); console.log('mandala shot saved. errors:',errs.length?errs.slice(0,4).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
