const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/pppol'+Date.now(),args:['--no-sandbox']});
  const errs=[];
  async function shot(url,file,wait,fn){ const p=await b.newPage(); p.on('pageerror',e=>errs.push(file+': '+e.message)); await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
    await p.goto(url,{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,wait||1200)); if(fn) await p.evaluate(fn); await new Promise(r=>setTimeout(r,600)); await p.screenshot({path:file}); await p.close(); }
  await shot('http://localhost:8790/_LAUNCH.html','_pol_launch.png',1600);
  await shot('http://localhost:8790/pixel-forge.html','_pol_forge.png',1400);
  await shot('http://localhost:8790/region-select.html','_pol_realm.png',1500);
  await shot('http://localhost:8790/game.html?menu=1','_pol_splash.png',1000,()=>{ regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); });
  await b.close();
  console.log('errors:', errs.length?errs.join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
