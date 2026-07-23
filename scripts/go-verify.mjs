import puppeteer from 'puppeteer';
const args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1280,720'];
const b=await puppeteer.launch({headless:'new',args});
for(const [name,url,beats] of [
  ['molecules','http://localhost:3000/lab-molecules.html',[['loved',0.62],['apex',0.90],['night',0.96]]],
  ['dome','http://localhost:3000/lab-dome.html',[['orion',0.5],['crown',0.9]]]
]){
  const errs=[];
  const p=await b.newPage();
  await p.setViewport({width:1280,height:720,deviceScaleFactor:1});
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,180));});
  p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,180)));
  try{ await p.goto(url,{waitUntil:'networkidle2',timeout:60000}); }catch(e){ errs.push('GOTO '+e.message.slice(0,120)); }
  await new Promise(r=>setTimeout(r,1800));
  const st=await p.evaluate(()=>{const c=document.getElementById('gl');const gl2=c&&c.getContext('webgl2');const fb=document.getElementById('fallback');return{webgl2:!!gl2,fb:fb?getComputedStyle(fb).display!=='none':false};});
  for(const [bn,pv] of beats){
    await p.evaluate(v=>{window.__forceP=v;},pv);
    await new Promise(r=>setTimeout(r,1200));
    await p.screenshot({path:`scripts/go-${name}-${bn}.png`});
  }
  await p.close();
  console.log(`[${name}] webgl2=${st.webgl2} fallback=${st.fb} errors=${errs.length}`);
  errs.slice(0,6).forEach(e=>console.log('   ! '+e));
}
await b.close();
console.log('DONE');
