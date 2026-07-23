const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppc'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1200,height:760,deviceScaleFactor:1});
  await p.goto('file:///'+path.resolve(__dirname,'public','game.html').split(path.sep).join('/'),{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const regs=['meadow','beach','city','forest','desert','volcano'];
  for(const rid of regs){
    const info=await p.evaluate((id)=>{ try{ regionSel=id; if(typeof enterWorld==='function'){ document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); }
      // zoom out a touch to see the layout
      zoom=0.5; cam.col=26; cam.row=26; player.col=26; player.row=26;
      const nb=props.filter(x=>x.type==='building').length, np=props.length, nn=npcs.length;
      return {ok:true, buildings:nb, props:np, npcs:nn, hasGen:(window.RegionGen&&typeof window.RegionGen[id]==='function')}; }catch(e){ return {ok:false,err:e.message}; } }, rid);
    await new Promise(r=>setTimeout(r,700));
    await p.evaluate(()=>{ zoom=0.5; cam.col=26; cam.row=26; });
    await new Promise(r=>setTimeout(r,250));
    await p.screenshot({path:path.resolve(__dirname,'_city_'+rid+'.png')});
    console.log(rid, JSON.stringify(info));
  }
  await b.close();
  console.log('ERRORS:', errs.length?('\n'+errs.slice(0,8).join('\n')):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
