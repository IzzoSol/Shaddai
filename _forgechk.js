const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppforge'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; const fails=[];
  p.on('pageerror',e=>errs.push('PAGEERR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CON: '+m.text());});
  p.on('requestfailed',r=>fails.push(r.url().split('/').pop()));
  await p.goto('file:///'+path.resolve('public','pixel-forge.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1200));
  const st=await p.evaluate(()=>({ PP:!!window.PixelPeople, tabs:document.getElementById('tabs')&&document.getElementById('tabs').children.length, film:document.getElementById('film')&&document.getElementById('film').children.length, enter:!!document.getElementById('enter'), rigOk:(typeof rig!=='undefined') }));
  await p.screenshot({path:path.resolve('_forgechk.png')});
  await b.close();
  console.log('STATE:', JSON.stringify(st));
  console.log('FAILED:', fails.length?fails.join(', '):'none');
  console.log('ERRORS:', errs.length?('\n'+errs.slice(0,10).join('\n')):'none');
})().catch(e=>{console.error('LAUNCH/NAV ERR:',e.message);process.exit(1);});
