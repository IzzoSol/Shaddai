const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppn'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1200,height:760,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{ regionSel='city'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); zoom=0.7; tod=0.0; });
  await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{ tod=0.0; cam.col=26; cam.row=26; });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:path.resolve(__dirname,'_night.png')});
  await b.close(); console.log('night shot saved. errors:',errs.length?errs.slice(0,4).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
