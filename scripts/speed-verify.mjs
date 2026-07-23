import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1280,800']});
// bg mode: renders + resumes on scroll
const e1=[];const p=await b.newPage();await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')e1.push(m.text().slice(0,120));});
p.on('pageerror',e=>e1.push('PAGEERR '+e.message.slice(0,120)));
await p.goto('http://localhost:3000/lab-molecules.html?bg=1',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,3000));
const s1=await p.evaluate(()=>{const c=document.getElementById('gl');return{webgl2:!!(c&&c.getContext('webgl2'))};});
// simulate scroll to confirm it resumes (no error)
await p.evaluate(()=>window.scrollTo(0, 2000)); await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>window.scrollTo(0, 6000)); await new Promise(r=>setTimeout(r,800));
await p.screenshot({path:'scripts/sv-bg.png'});
await p.close();
// standalone descent still fine
const e2=[];const p2=await b.newPage();await p2.setViewport({width:1280,height:800});
p2.on('pageerror',e=>e2.push('PAGEERR '+e.message.slice(0,120)));
await p2.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2000));
const s2=await p2.evaluate(()=>{const c=document.getElementById('gl');return{webgl2:!!(c&&c.getContext('webgl2'))};});
await p2.close();
// home: no Replay, has ?bg=1, 0 errors
const e3=[];const p3=await b.newPage();await p3.setViewport({width:1280,height:800});
p3.on('pageerror',e=>e3.push('home PAGEERR '+e.message.slice(0,120)));
await p3.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2500));
const s3=await p3.evaluate(()=>({replay:/replay/i.test(document.body.innerText), bgsrc:(document.getElementById('descentBg')||{}).getAttribute?document.getElementById('descentBg').getAttribute('src'):null}));
await b.close();
console.log('BG?bg=1 errors='+e1.length+' webgl2='+s1.webgl2); e1.slice(0,4).forEach(x=>console.log('  ! '+x));
console.log('STANDALONE errors='+e2.length+' webgl2='+s2.webgl2); e2.slice(0,4).forEach(x=>console.log('  ! '+x));
console.log('HOME errors='+e3.length+' replayVisible='+s3.replay+' descentSrc='+s3.bgsrc); e3.slice(0,4).forEach(x=>console.log('  ! '+x));
console.log((e1.length===0&&s1.webgl2&&e2.length===0&&s2.webgl2&&e3.length===0&&!s3.replay)?'RESULT: PASS':'RESULT: CHECK');
