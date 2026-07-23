const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppflow'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
  const url='file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/');
  await p.goto(url,{waitUntil:'networkidle0'});
  // simulate the forge + selector hand-off
  await p.evaluate(()=>{ localStorage.setItem('shaddai.player', JSON.stringify({name:'Izzo', rig:{skin:'#8a5a3a',hair:'#111111',hoodie:'#8b5cf6',pants:'#20242c',shoe:'#111',shoeStyle:'sneaker',anim:'idle'}, source:'forge'}));
    localStorage.setItem('shaddai.region','forest'); });
  await p.reload({waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1400));
  const st=await p.evaluate(()=>({state:window.state, name:(document.getElementById('hudWho')||{}).textContent, where:(document.getElementById('hudWhere')||{}).textContent}));
  await p.screenshot({path:path.resolve(__dirname,'_flow.png')});
  await b.close();
  console.log('flow:', JSON.stringify(st), '| errors:', errs.length?errs.slice(0,5).join('\n'):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
