const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppb'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const shots=[['meadow',0.34,30,33],['city',0.02,26,26],['beach',0.34,26,30],['volcano',0.34,26,26]];
  for(const [rid,td,cc,cr] of shots){
    await p.evaluate((id,t,c,r)=>{ regionSel=id; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); zoom=0.9; tod=t; cam.col=c; cam.row=r; player.col=c; player.row=r; }, rid,td,cc,cr);
    await new Promise(r=>setTimeout(r,700));
    await p.evaluate((c,r,t)=>{ zoom=0.9; cam.col=c; cam.row=r; tod=t; }, cc,cr,td);
    await new Promise(r=>setTimeout(r,300));
    await p.screenshot({path:path.resolve(__dirname,'_beauty_'+rid+'.png')});
  }
  await b.close(); console.log('beauty shots saved. errors:',errs.length?errs.slice(0,3).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
