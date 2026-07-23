const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/pprg'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1000,height:720,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve('public','game.html').split(path.sep).join('/')+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,800));
  await p.evaluate(()=>goRegion());
  await new Promise(r=>setTimeout(r,400));
  const g=await p.evaluate(()=>({cards:document.getElementById('regionGrid').children.length, sel:regionSel}));
  await p.screenshot({path:path.resolve('_regcards.png')});
  // click the 3rd card (should change regionSel)
  const before=await p.evaluate(()=>regionSel);
  await p.evaluate(()=>{ document.getElementById('regionGrid').children[3].click(); });
  const after=await p.evaluate(()=>regionSel);
  await b.close();
  console.log('cards:',g.cards,'default:',g.sel,'| click test:',before,'->',after,'| errors:',errs.length?errs.slice(0,3).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
