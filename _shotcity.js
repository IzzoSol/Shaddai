const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppc'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1360,height:820,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{ regionSel='agentcity'; goRegion(); enterWorld(); tod=0.35; });
  await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:path.resolve(__dirname,'_game_agentcity.png')});
  // move toward an agent building cluster (upper-left) to see agents
  await p.evaluate(()=>{ player.col=13; player.row=16; cam.col=13; cam.row=16; });
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:path.resolve(__dirname,'_game_agents.png')});
  // night
  await p.evaluate(()=>{ tod=0.0; });
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:path.resolve(__dirname,'_game_night.png')});
  await b.close();
  console.log('city shots saved. errors:',errs.length?('\n'+errs.slice(0,6).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
