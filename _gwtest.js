const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppgw'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:1280,height:820,deviceScaleFactor:1});
  await p.goto('http://localhost:8790/region-select.html?v=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1000));
  const states=await p.evaluate(()=>REALMS.map(r=>r.id+':'+(r.locked?'LOCKED':'open')));
  // simulate: select meadow (open) then enter — intercept navigation
  const nav=await p.evaluate(()=>{ let dest=null; const _href=Object.getOwnPropertyDescriptor(window.location,'href');
    // select + enter
    select('meadow'); localStorage.removeItem('shaddai.region');
    // stub location.href to capture
    try{ Object.defineProperty(window,'location',{value:{href:'',assign:function(u){dest=u;}},writable:true}); }catch(e){}
    enter();
    const reg=localStorage.getItem('shaddai.region');
    return {region:reg}; });
  await p.screenshot({path:'_gateway.png'});
  await b.close();
  console.log('realm locks:', states.join('  '));
  console.log('after enter meadow → saved region:', JSON.stringify(nav.region));
  console.log('errors:', errs.length?errs.slice(0,3).join(' | '):'none');
})().catch(e=>{console.error(e.message);process.exit(1);});
