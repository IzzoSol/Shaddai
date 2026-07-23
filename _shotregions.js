const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppr'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1300,height:800,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  for(const rid of ['meadow','forest','beach','volcano']){
    await p.evaluate((id)=>{ regionSel=id; if(state!=='world'){goRegion();} enterWorld(); tod=0.34; }, rid);
    await new Promise(r=>setTimeout(r,1300));
    await p.evaluate(()=>{ tod=0.34; });
    await p.screenshot({path:path.resolve(__dirname,'_reg_'+rid+'.png')});
  }
  // the region map select
  await p.evaluate(()=>{ state='region'; document.getElementById('region').classList.remove('hide'); });
  await new Promise(r=>setTimeout(r,800));
  await p.screenshot({path:path.resolve(__dirname,'_reg_map.png')});
  await b.close();
  console.log('region shots saved. errors:',errs.length?('\n'+errs.slice(0,6).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
