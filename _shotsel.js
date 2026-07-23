const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/pps'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','region-select.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1400));
  // hover Emberfields (locked) to show a card
  await p.mouse.move(720,450); await new Promise(r=>setTimeout(r,200));
  await p.screenshot({path:path.resolve(__dirname,'_sel.png')});
  // hover meadow node (top) + click to select
  await p.evaluate(()=>{ const c=document.querySelector('canvas'); });
  await p.mouse.move(720, 900*0.5-14 - Math.min(1440,900)*0.335 + 20); await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:path.resolve(__dirname,'_sel2.png')});
  await b.close(); console.log('selector shots saved. errors:',errs.length?errs.slice(0,5).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
