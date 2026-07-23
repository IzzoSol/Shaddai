const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppsub'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1100,height:740,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/game.html?menu=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  const info=await p.evaluate(()=>{ localStorage.removeItem('shaddai.home'); regionSel='suburb'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld();
    const houses=props.filter(x=>x.type==='building'&&x.suburb); return {hasGen:!!(window.RegionGen&&window.RegionGen.suburb), houses:houses.length, forSale:props.filter(x=>x.suburb&&x.name==='FOR SALE').length, gc:!!groundCanvas}; });
  await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{ zoom=0.6; cam.col=24; cam.row=24; });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:'_suburb.png'});
  // enter a suburb house + move in
  const claim=await p.evaluate(()=>{ const h=props.find(x=>x.type==='building'&&x.suburb); enterInterior(h); const shown=!document.getElementById('moveinBtn').classList.contains('hide'); moveIn(); const home=localStorage.getItem('shaddai.home'); return {name:h.name, btnShown:shown, home}; });
  await new Promise(r=>setTimeout(r,200));
  await p.screenshot({path:'_suburb_in.png'});
  await b.close();
  console.log('suburb:', JSON.stringify(info));
  console.log('claim:', JSON.stringify(claim));
  console.log('errors:', errs.length?errs.slice(0,5).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
