import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1280,800']});
// 1) lab-molecules?bg=1 renders clean
const e1=[];const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')e1.push(m.text().slice(0,140));});
p.on('pageerror',e=>e1.push('PAGEERR '+e.message.slice(0,140)));
await p.goto('http://localhost:3000/lab-molecules.html?bg=1',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,2500));
const s1=await p.evaluate(()=>{const c=document.getElementById('gl');return{webgl2:!!(c&&c.getContext('webgl2'))};});
await p.screenshot({path:'scripts/bgv-descent.png'});
await p.close();
// 2) home loads descentBg?bg=1
const e2=[];const p2=await b.newPage(); await p2.setViewport({width:1280,height:800});
p2.on('pageerror',e=>e2.push('home PAGEERR '+e.message.slice(0,140)));
await p2.goto('http://localhost:3000/home.html',{waitUntil:'domcontentloaded',timeout:40000});
await new Promise(r=>setTimeout(r,3000));
const s2=await p2.evaluate(()=>{const bg=document.getElementById('descentBg');return{src:bg?(bg.getAttribute('src')||'(empty)'):'(none)'};});
await b.close();
console.log('LAB?bg=1 errors='+e1.length+' webgl2='+s1.webgl2); e1.slice(0,5).forEach(x=>console.log('  ! '+x));
console.log('HOME errors='+e2.length+' descentSrc='+s2.src); e2.slice(0,5).forEach(x=>console.log('  ! '+x));
console.log((e1.length===0&&s1.webgl2&&e2.length===0&&s2.src.indexOf('bg=1')>=0)?'RESULT: PASS':'RESULT: CHECK');
