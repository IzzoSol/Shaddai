const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppint'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:1200,height:780,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/game.html?menu=1',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,700));
  const t=await p.evaluate(()=>{ localStorage.removeItem('shaddai.decor'); localStorage.removeItem('shaddai.home');
    regionSel='suburb'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld();
    const h=props.find(x=>x.type==='building'&&x.suburb); enterInterior(h); moveIn();   // claim + enter own home
    const roomSize=intRoom.w+'x'+intRoom.h; const baseFurn=intRoom.furniture.length;
    // decorate: place 3 items
    openDecorate(); decorPick=DECOR[0]; placeDecorAt(6,4); decorPick=DECOR[1]; placeDecorAt(8,5); decorPick=DECOR[2]; placeDecorAt(4,6); doneDecorate();
    const saved=JSON.parse(localStorage.getItem('shaddai.decor')||'{}');
    // wardrobe: change skin
    const oldSkin=player.rig.skin; openWardrobe(); player.rig.skin='#4a2f1c'; persistPlayer();
    const savedPlayer=JSON.parse(localStorage.getItem('shaddai.player')||'{}');
    const actionsShown=!document.getElementById('intActions').classList.contains('hide');
    return {roomSize, baseFurn, placed:(saved[h.houseId]||[]).length, actionsShown, skinChanged:oldSkin!==player.rig.skin, savedSkin:savedPlayer.rig&&savedPlayer.rig.skin}; });
  await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>{ closeWardrobe(); });
  await new Promise(r=>setTimeout(r,300));
  await p.screenshot({path:'_interior_big.png'});
  await b.close();
  console.log('interior test:', JSON.stringify(t));
  console.log('errors:', errs.length?errs.slice(0,4).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
