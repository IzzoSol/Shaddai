import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
const errs=[];const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,140)));
await p.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2200));
const s0=await p.evaluate(()=>{
  var rail=document.getElementById('depthRail');
  return { railDisplay:rail?getComputedStyle(rail).display:'none', viewBtn:!!document.getElementById('viewBtn') };
});
// click View -> immersive
await p.evaluate(()=>document.getElementById('viewBtn').click());
await new Promise(r=>setTimeout(r,700));
const s1=await p.evaluate(()=>{
  var bg=document.getElementById('descentBg');
  var sec=document.querySelector('section.blk');
  return { immersive:document.body.classList.contains('immersive'),
    bgPE:bg?getComputedStyle(bg).pointerEvents:null, bgOpacity:bg?getComputedStyle(bg).opacity:null,
    secVis:sec?getComputedStyle(sec).visibility:null, viewLabel:document.getElementById('viewBtn').textContent };
});
await p.screenshot({path:'scripts/vv-immersive.png'});
// exit
await p.evaluate(()=>document.getElementById('viewBtn').click());
await new Promise(r=>setTimeout(r,500));
const s2=await p.evaluate(()=>document.body.classList.contains('immersive'));
await b.close();
console.log('errors='+errs.length); errs.slice(0,6).forEach(e=>console.log('  ! '+e));
console.log('rail display='+s0.railDisplay+' (want none) | viewBtn='+s0.viewBtn);
console.log('immersive ON: class='+s1.immersive+' descentPE='+s1.bgPE+' descentOpacity='+s1.bgOpacity+' sectionVis='+s1.secVis+' label="'+s1.viewLabel+'"');
console.log('after exit immersive='+s2);
console.log((errs.length===0&&s0.railDisplay==='none'&&s1.immersive&&s1.bgPE==='auto'&&s1.secVis==='hidden'&&!s2)?'RESULT: PASS':'RESULT: CHECK');
