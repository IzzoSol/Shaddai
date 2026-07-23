const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppeco'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1000,height:720,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/game.html?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{ localStorage.removeItem('shaddai.econ'); credits=250; regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); loadEcon(); updateWallet(); });
  await new Promise(r=>setTimeout(r,300));
  const c0=await p.evaluate(()=>credits);
  await p.evaluate(()=>openStore());
  await new Promise(r=>setTimeout(r,200));
  await p.evaluate(()=>buy('sword'));  // -60
  await p.evaluate(()=>buy('tv'));     // -130
  const afterBuy=await p.evaluate(()=>({credits, inv:JSON.stringify(inv), storeShown:!document.getElementById('store').classList.contains('hide')}));
  await p.evaluate(()=>closePanel());
  await p.evaluate(()=>{ jobCooldown=0; openJobs(); doJob(); });
  const afterJob=await p.evaluate(()=>credits);
  await p.evaluate(()=>{ closePanel(); openInv(); });
  await new Promise(r=>setTimeout(r,200));
  await p.screenshot({path:'_eco.png'});
  await b.close();
  console.log('start credits:',c0,'| after buying sword+tv:',afterBuy.credits,'inv:',afterBuy.inv,'storeShown:',afterBuy.storeShown);
  console.log('after 1 job:',afterJob);
  console.log('errors:',errs.length?errs.slice(0,4).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
