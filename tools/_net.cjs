const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const rows=[];const t0=Date.now();
p.on('response',async r=>{try{const len=+(r.headers()['content-length']||0);rows.push([Date.now()-t0,len,r.url().replace('http://localhost:3013','')]);}catch(e){}});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
let ready=0;for(let i=0;i<120;i++){await sleep(2000);const st=await p.evaluate(()=>({play:!!window.__loadPlayable,p:(document.getElementById('ldPct')||{}).textContent||'',hp:!!window.__hoverPark,txt:((document.getElementById('loader')||document.body).innerText||'').slice(0,80).replace(/\n/g,' ')})).catch(()=>({}));if(i%5==0)console.log(Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(st));if(st.play){ready=Date.now()-t0;break;}}
console.log('READY ms',ready);let tot=0;rows.forEach(r=>tot+=r[1]);console.log('TOTAL MB',(tot/1e6).toFixed(1),'files',rows.length);
rows.sort((a,b)=>b[1]-a[1]);rows.slice(0,25).forEach(r=>console.log((r[1]/1e6).toFixed(2)+'MB','@'+r[0]+'ms',r[2].slice(0,90)));await b.close();})();
