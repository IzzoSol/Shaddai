const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppg'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await p.setViewport({width:1280,height:760,deviceScaleFactor:1});
  const url='file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/');
  await p.goto(url,{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1200));
  await p.screenshot({path:path.resolve(__dirname,'_game_create.png')});
  // go to region
  await p.evaluate(()=>goRegion()); await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:path.resolve(__dirname,'_game_region.png')});
  // enter world
  await p.evaluate(()=>enterWorld()); await new Promise(r=>setTimeout(r,1400));
  await p.screenshot({path:path.resolve(__dirname,'_game_world.png')});
  // open travel menu
  await p.evaluate(()=>openTravel()); await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:path.resolve(__dirname,'_game_travel.png')});
  // travel to desert
  await p.evaluate(()=>travelTo('desert')); await new Promise(r=>setTimeout(r,1600));
  await p.screenshot({path:path.resolve(__dirname,'_game_desert.png')});
  // travel to beach
  await p.evaluate(()=>{openTravel();travelTo('beach');}); await new Promise(r=>setTimeout(r,1600));
  await p.screenshot({path:path.resolve(__dirname,'_game_beach.png')});
  await b.close();
  console.log('shots saved. console errors:', errs.length?('\n'+errs.slice(0,8).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
