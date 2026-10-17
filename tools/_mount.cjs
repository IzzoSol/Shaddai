const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:900,height:560});const errs=[],logs=[];p.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));p.on('console',m=>{const t=m.text();if(/mount|hawk|GLTF|glb/i.test(t))logs.push(t.slice(0,160));});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
let ok=false;for(let i=0;i<220;i++){await sleep(2500);ok=await p.evaluate(()=>!!(window.__mountRide&&window.__hoverPark)).catch(()=>false);if(ok)break;}
const id=process.argv[2]||'bull';
const r=await p.evaluate(async(id)=>{const M=window.WorldMounts,R=window.__mountRide;M.buy(id,()=>true);const ok=R.summon(id);await new Promise(r=>setTimeout(r,12000));const s0=R.state();
 const mounted=R.mount();const inp=window.__dragonRideIn=window.__dragonRideIn||{};return {ok,s0,mounted}},id);
console.log('SUMMON',JSON.stringify(r));
console.log('RIDE',JSON.stringify(await p.evaluate(()=>{const R=window.__mountRide;const out=[];const run=(n,inp)=>{for(let i=0;i<n;i++)R.update(0.033,inp);const s=R.state();out.push([+s.sp.toFixed(1),+s.y.toFixed(1)])};
 run(90,{fwd:true});run(90,{fwd:true,dive:true});run(60,{fwd:true,left:true});run(90,{fwd:true,climb:true});return out.concat([R.state()])})));
await sleep(1500);
await p.screenshot({path:'C:/Users/Brittany/AppData/Local/Temp/mount-'+id+'.png'});
console.log('ERRS',JSON.stringify(errs.slice(0,5)),JSON.stringify(logs));await b.close();})();
