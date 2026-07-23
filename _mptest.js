const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppmp'+Date.now(),args:['--no-sandbox']});
  async function client(nm){ const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8790/game.html?menu=1',{waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,700));
    await p.evaluate((name)=>{ player.name=name; regionSel='meadow'; document.getElementById('create').classList.add('hide'); document.getElementById('region').classList.add('hide'); enterWorld(); }, nm);
    return {p,errs}; }
  const A=await client('Alice'); const B=await client('Bob');
  await new Promise(r=>setTimeout(r,900));
  // A moves
  await A.p.evaluate(()=>{ for(let i=0;i<20;i++){ player.col+=0.3; player.row+=0.1; mpMove(); } });
  await new Promise(r=>setTimeout(r,600));
  const bSeesA=await B.p.evaluate(()=>Object.keys(remote).length);
  const bRemote=await B.p.evaluate(()=>{ const k=Object.keys(remote)[0]; return k?{name:remote[k].name,region:remote[k].region,tcol:remote[k].tcol}:null; });
  // A chats
  await A.p.evaluate(()=>{ MP.send(JSON.stringify({t:'chat',text:'hello world'})); });
  await new Promise(r=>setTimeout(r,500));
  const bChat=await B.p.evaluate(()=>document.getElementById('chatlog').textContent);
  await A.p.screenshot({path:'_mp_A.png'});
  console.log('B sees remote players:', bSeesA);
  console.log('B remote data:', JSON.stringify(bRemote));
  console.log('B chat log:', JSON.stringify(bChat));
  console.log('errors A/B:', A.errs.concat(B.errs).slice(0,4).join(' | ')||'none');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
