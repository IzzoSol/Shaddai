const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:1100,height:650});
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
await p.goto('http://localhost:8790/world3d.html',{waitUntil:'domcontentloaded'});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!(window.__w&&window.__w.mounts.length>=7&&document.getElementById('stream')===null)).catch(()=>false))break;}
await p.evaluate(()=>{const w=window.__w;w.player.root.position.set(0,0,30);w.state.cam.yaw=0;w.state.cam.pitch=1.05;w.state.cam.dist=26;});
await sleep(2500);await p.screenshot({path:'fal-assets/spike/city-plan.png'});console.log('ERR',errs.join('|')||'none');await b.close();})();
