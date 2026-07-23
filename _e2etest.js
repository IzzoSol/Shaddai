const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppe2e'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1200,height:800,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/region-select.html?v=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  // click a locked realm (forest) — should NOT enter; then enter an open one (meadow)
  await p.evaluate(()=>{ select('forest'); enter(); });  // blocked
  await new Promise(r=>setTimeout(r,400));
  const stillHere=p.url().includes('region-select');
  await p.evaluate(()=>{ select('meadow'); enter(); });  // open → navigates after 600ms
  await p.waitForNavigation({waitUntil:'networkidle0',timeout:8000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,1400));
  const landed=await p.evaluate(()=>({url:location.pathname, state:(typeof state!=='undefined'?state:'?'), region:(typeof region!=='undefined'&&region?region.id:'?')}));
  await p.screenshot({path:'_e2e.png'});
  await b.close();
  console.log('locked realm blocked entry (stayed on selector):', stillHere);
  console.log('after entering Meadow →', JSON.stringify(landed));
  console.log('errors:', errs.length?errs.slice(0,3).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
