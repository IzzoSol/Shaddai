const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const t0=Date.now(),pend={},fin=[];
p.on('request',r=>{pend[r.url()]=Date.now()-t0});p.on('requestfinished',r=>{fin.push([Date.now()-t0-(pend[r.url()]||0),r.url()]);delete pend[r.url()]});p.on('requestfailed',r=>{fin.push([-1,'FAIL '+r.url()]);delete pend[r.url()]});
await p.goto('https://shaddai-beta.onrender.com/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:120000});
for(let i=0;i<60;i++){await sleep(2000);const st=await p.evaluate(()=>({play:!!window.__loadPlayable,pct:(document.getElementById('litePct')||{}).textContent,step:(document.getElementById('liteStep')||{}).textContent})).catch(()=>({}));if(i%4==0)console.log(Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(st));if(st.play)break;}
console.log('PENDING',Object.entries(pend).slice(0,12).map(([u,t])=>u.slice(-60)+'@'+t).join('\n'));
fin.sort((a,b)=>b[0]-a[0]);console.log('SLOWEST');fin.slice(0,10).forEach(f=>console.log(f[0]+'ms',f[1].slice(-80)));console.log('FAILS',fin.filter(f=>f[0]<0).length);await b.close();})();
