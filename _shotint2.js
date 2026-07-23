const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppint'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:900,height:640,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/')+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,800));
  await p.evaluate(()=>{ regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); });
  await new Promise(r=>setTimeout(r,400));
  for(const k of ['office','diner','bank','tavern','forge','home']){
    await p.evaluate((kind)=>{ interiorType=kind; buildInterior(kind); state='interior'; inInterior={name:kind,kind:kind}; player.icol=intRoom.door.col; player.irow=intRoom.door.row-1.5; }, k);
    await new Promise(r=>setTimeout(r,350));
    await p.screenshot({path:path.resolve(__dirname,'_int2_'+k+'.png')});
  }
  await b.close(); console.log('interior shots saved. errors:',errs.length?errs.slice(0,4).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
