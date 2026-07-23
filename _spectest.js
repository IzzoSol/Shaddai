const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppspec'+Date.now(),args:['--no-sandbox']});
  const errs=[];
  // launcher shot
  let p=await b.newPage(); p.on('pageerror',e=>errs.push('launch:'+e.message)); await p.setViewport({width:1280,height:800});
  await p.goto('http://localhost:8790/_LAUNCH.html',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,1500));
  const enterHref=await p.evaluate(()=>document.getElementById('a-enter').getAttribute('href'));
  await p.screenshot({path:'_launch1.png'}); await p.close();
  // spectate flow
  p=await b.newPage(); p.on('pageerror',e=>errs.push('spec:'+e.message)); await p.setViewport({width:1200,height:760});
  await p.goto('http://localhost:8790/game.html',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{ localStorage.setItem('shaddai.mode','spectate'); });
  await p.goto('http://localhost:8790/game.html',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,600));
  const s1=await p.evaluate(()=>{ regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld();
    return {spectate:spectate, specHud:!document.getElementById('specHud').classList.contains('hide'), topbtnsHidden:document.getElementById('topbtns').classList.contains('hide')}; });
  await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:'_spectate.png'});
  const s2=await p.evaluate(()=>{ joinPlay(); return {spectate:spectate, specHudHidden:document.getElementById('specHud').classList.contains('hide')}; });
  await b.close();
  console.log('launcher a-enter href:', enterHref);
  console.log('on spectate enter:', JSON.stringify(s1));
  console.log('after Join&Play:', JSON.stringify(s2));
  console.log('errors:', errs.length?errs.slice(0,4).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
