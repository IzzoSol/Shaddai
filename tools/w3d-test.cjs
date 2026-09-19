const puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1280,height:720});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,200)));p.on('console',m=>{const t=m.text();if(m.type()==='error'||/warn|fail/i.test(t))errs.push(m.type()+': '+t.slice(0,160))});
await p.goto('http://localhost:3000/world3d.html',{waitUntil:'domcontentloaded'});
let ready=false;for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,2000));ready=await p.evaluate(()=>document.querySelector('#loading').hidden===true).catch(()=>false);if(ready)break;}
console.log('ready:',ready,'msg:',await p.evaluate(()=>document.querySelector('#loadmsg').textContent).catch(()=>'?'));
await new Promise(r=>setTimeout(r,3500));
await p.screenshot({path:'fal-assets/spike/w3d-1.png'});
await p.evaluate(()=>{const w=window.__w;w.state.cam.yaw=2.6;w.state.cam.pitch=0.3;w.state.cam.dist=16;w.player.root.position.set(-30,0,40);});
await new Promise(r=>setTimeout(r,1800));await p.screenshot({path:'fal-assets/spike/w3d-2.png'});
await p.evaluate(()=>{const w=window.__w;const m=w.mounts[0];w.player.root.position.set(m.grp.position.x+3,0,m.grp.position.z);w.state.keys['e']=false;w.mount(m);w.state.cam.yaw=0.6;w.state.cam.dist=9;});
await new Promise(r=>setTimeout(r,800));await p.evaluate(()=>{const w=window.__w;w.state.keys['w']=true;});await new Promise(r=>setTimeout(r,1500));await p.evaluate(()=>{window.__w.state.keys['w']=false;});
await new Promise(r=>setTimeout(r,1500));await p.screenshot({path:'fal-assets/spike/w3d-3.png'});
await p.evaluate(()=>{const w=window.__w;w.enterInterior();});
await new Promise(r=>setTimeout(r,2500));await p.screenshot({path:'fal-assets/spike/w3d-4.png'});
const st=await p.evaluate(()=>window.__w?{hero:window.__w.state.hero,mounts:window.__w.mounts.length,pos:window.__w.player.root.position.toArray().map(v=>+v.toFixed(1))}:'no __w').catch(e=>String(e));console.log(JSON.stringify(st));
console.log(errs.slice(0,12).join('\n')||'no errors');await b.close();})();
