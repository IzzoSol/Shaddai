const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/pppick'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.setViewport({width:1000,height:700,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/')+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const s0=await p.evaluate(()=>({state:typeof state!=='undefined'?state:'?', hasRegionMap:!!(window.RegionMap&&window.RegionMap.draw), noMap:!!window.__noMap}));
  // click "Choose region"
  await p.evaluate(()=>{ goRegion(); });
  await new Promise(r=>setTimeout(r,700));
  const s1=await p.evaluate(()=>({state:typeof state!=='undefined'?state:'?', regionHidden:document.getElementById('region').classList.contains('hide')}));
  await p.screenshot({path:path.resolve(__dirname,'_pick_region.png')});
  // now select a region + enter
  await p.evaluate(()=>{ regionSel='meadow'; enterWorld(); });
  await new Promise(r=>setTimeout(r,900));
  const s2=await p.evaluate(()=>({state:typeof state!=='undefined'?state:'?', where:(document.getElementById('hudWhere')||{}).textContent}));
  await p.screenshot({path:path.resolve(__dirname,'_pick_world.png')});
  await b.close();
  console.log('create:',JSON.stringify(s0));
  console.log('region:',JSON.stringify(s1));
  console.log('world:',JSON.stringify(s2));
  console.log('ERRORS:', errs.length?('\n'+errs.slice(0,8).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
