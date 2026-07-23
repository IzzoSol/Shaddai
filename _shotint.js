const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppgi'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1280,height:760,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{goRegion();enterWorld();});
  await new Promise(r=>setTimeout(r,1200));
  // force into HOME interior
  await p.evaluate(()=>{const h=props.find(x=>x.kind==='home');enterInterior(h);});
  await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:path.resolve(__dirname,'_game_home.png')});
  // office interior (TOWER)
  await p.evaluate(()=>{state='world';const o=props.find(x=>x.kind==='office');enterInterior(o);});
  await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:path.resolve(__dirname,'_game_office.png')});
  await b.close();
  console.log('interior shots saved. errors:',errs.length?('\n'+errs.slice(0,6).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
