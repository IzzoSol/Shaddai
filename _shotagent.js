const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppag'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CON: '+m.text());});
  await p.setViewport({width:1100,height:740,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/')+'?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const info=await p.evaluate(()=>{ try{ regionSel='agentcity'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld();
    return {ok:true, buildings:props.filter(x=>x.type==='building').length, tiles:tiles.length, gc:!!groundCanvas}; }catch(e){ return {ok:false,err:e.message,stack:(e.stack||'').split('\n').slice(0,3).join(' | ')}; } });
  await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{ zoom=0.85; cam.col=30; cam.row=30; });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:path.resolve(__dirname,'_agentcity.png')});
  await b.close();
  console.log('agentcity:', JSON.stringify(info));
  console.log('ERRORS:', errs.length?('\n'+errs.slice(0,10).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
