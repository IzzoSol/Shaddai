import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1400,900']});
const errs=[];const p=await b.newPage();
await p.setViewport({width:1400,height:900,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,160)));
await p.goto('http://localhost:3000/home.html',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:'scripts/cf-hero.png'});
// scroll to instruments/cosmos
await p.evaluate(()=>{const el=document.getElementById('instruments');el&&el.scrollIntoView({behavior:'instant',block:'center'});});
await new Promise(r=>setTimeout(r,1400));
await p.screenshot({path:'scripts/cf-cosmos.png'});
// count how many scene canvases are actively sized/painting (rough: canvases with non-zero pixels is hard; instead check DPR + count sections)
const info=await p.evaluate(()=>{
  const secs=document.querySelectorAll('section[data-scene],.band[data-scene]').length;
  const canv=document.querySelectorAll('canvas[data-canvas]').length;
  return {secs,canv};
});
// test descent overlay
const dz=await p.evaluate(()=>{const btn=document.querySelector('[data-descent]');if(!btn)return{btn:false};btn.click();return{btn:true};});
await new Promise(r=>setTimeout(r,1200));
const overlay=await p.evaluate(()=>{const f=document.querySelector('#descentPlayer iframe');return{iframe:!!f,src:f?f.getAttribute('src'):null,playerOpen:document.body.classList.contains('player-open')};});
await p.screenshot({path:'scripts/cf-descent.png'});
await b.close();
console.log('errors='+errs.length); errs.slice(0,8).forEach(e=>console.log('  ! '+e));
console.log('scenes='+info.secs+' canvases='+info.canv);
console.log('descent btn='+dz.btn+' | iframe='+overlay.iframe+' src='+overlay.src+' playerOpen='+overlay.playerOpen);
console.log(errs.length===0&&overlay.iframe?'RESULT: PASS':'RESULT: CHECK');
