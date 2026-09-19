const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message.slice(0,300)));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log(m.type(),m.text().slice(0,200))});
await p.goto('http://localhost:3000/world3d.html',{waitUntil:'domcontentloaded'});await sleep(30000);console.log("w:",await p.evaluate(()=>typeof window.__w));console.log('msg',await p.evaluate(()=>document.querySelector('#loadmsg').textContent));await b.close();})();
