const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppp'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  for(const rid of ['city','forest','volcano','meadow']){
    await p.evaluate((id)=>{ regionSel=id; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); zoom=0.82; }, rid);
    await new Promise(r=>setTimeout(r,500));
    const fps=await p.evaluate(()=>new Promise(res=>{ let n=0,t0=performance.now(); function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }));
    console.log(rid,'FPS≈',fps);
  }
  await p.screenshot({path:path.resolve(__dirname,'_perf.png')});
  await b.close(); console.log('errors:',errs.length?errs.slice(0,4).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
