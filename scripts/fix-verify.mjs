import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1280,800']});
const errs=[];const p=await b.newPage();
await p.setViewport({width:1280,height:800,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,160)));
await p.goto('http://localhost:3000/agents.html',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,2000));
// check SHADDAI + ORACLE img srcs
const imgs=await p.evaluate(()=>{
  const out={};
  document.querySelectorAll('.agent').forEach(s=>{const id=s.id.replace('a-','');const img=s.querySelector('.portrait-frame img');if(img)out[id]=img.getAttribute('src');});
  return out;
});
// open TURTLE viewer, read camera dist + zoom range
await p.evaluate(()=>{const btn=document.querySelector('.view3d[data-agent="TURTLE"]');btn&&btn.click();});
await new Promise(r=>setTimeout(r,3500));
const cam=await p.evaluate(()=>{
  // reach into module scope isn't possible; sample via a global if exposed, else read controls from renderer canvas won't work.
  return window.__V3DDBG||null;
});
await p.screenshot({path:'scripts/fix-turtle-framed.png'});
await b.close();
console.log('errors='+errs.length); errs.slice(0,6).forEach(e=>console.log('  ! '+e));
console.log('SHADDAI img:',imgs.SHADDAI);
console.log('ORACLE img:',imgs.ORACLE);
console.log('ZEROX img:',imgs.ZEROX);
console.log(errs.length===0?'RESULT: PASS':'RESULT: CHECK');
