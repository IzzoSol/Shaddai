const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppmenu'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1000,height:700,deviceScaleFactor:1});
  const base='file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/');
  // 1) prime localStorage with a saved region (simulate stale state)
  await p.goto(base,{waitUntil:'networkidle0'});
  await p.evaluate(()=>{ localStorage.setItem('shaddai.region','city'); localStorage.setItem('shaddai.player',JSON.stringify({name:'X',rig:{skin:'#e0a869',shirt:'#2f6fe8',pants:'#20242c',shoe:'#111',anim:'idle'}})); });
  // 2) reload WITH ?menu — should clear region and show create
  await p.goto(base+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const st=await p.evaluate(()=>({state:window.state, savedRegion:localStorage.getItem('shaddai.region'), createHidden:document.getElementById('create').classList.contains('hide')}));
  await p.screenshot({path:path.resolve(__dirname,'_menu.png')});
  await b.close();
  console.log('menu test:', JSON.stringify(st), '| errors:', errs.length?errs.slice(0,5).join(' || '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
