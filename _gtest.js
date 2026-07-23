const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppg'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1200,height:760,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve('public','game.html').split(path.sep).join('/')+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const gi=await p.evaluate(()=>{ regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); zoom=0.85; cam.col=30; cam.row=33; player.col=30; player.row=33; return {cw:groundCanvas.width, ch:groundCanvas.height, scale:+groundScale.toFixed(3)}; });
  await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{ zoom=0.85; cam.col=30; cam.row=33; });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:path.resolve('_gtest.png')});
  await b.close(); console.log('ground:', JSON.stringify(gi), '| errors:', errs.length?errs.slice(0,3).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
