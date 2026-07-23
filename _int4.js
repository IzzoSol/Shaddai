const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppint2'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); await p.setViewport({width:1200,height:780,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/game.html?menu=1',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{ regionSel='suburb'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); });
  await new Promise(r=>setTimeout(r,2200)); // let splash fade
  await p.evaluate(()=>{ const h=props.find(x=>x.type==='building'&&x.suburb); moveIn=moveIn||function(){}; enterInterior(h); moveIn();
    openDecorate(); decorPick=DECOR[0]; placeDecorAt(7,4); decorPick=DECOR[6]; placeDecorAt(5,5); decorPick=DECOR[5]; placeDecorAt(9,3); doneDecorate(); });
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:'_interior_clean.png'});
  await b.close(); console.log('done');
})().catch(e=>{console.error(e.message);process.exit(1);});
