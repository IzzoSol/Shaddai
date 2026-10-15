const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(15000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(25000);
const r=await p.evaluate(()=>[...document.body.querySelectorAll('*')].filter(e=>{const cs=getComputedStyle(e);if(!(cs.position==='fixed'||cs.position==='absolute'))return false;const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.width<700&&cs.display!=='none'&&cs.visibility!=='hidden'&&(r.top<140||r.bottom>window.innerHeight-120)&&!e.closest('canvas')&&(e.innerText||'').trim().length>0&&(e.innerText||'').length<120;}).map(e=>{const r=e.getBoundingClientRect();return (e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ').join('.'):'')+' ['+Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)+'] '+(e.innerText||'').trim().replace(/\n/g,' / ').slice(0,40);}).slice(0,40));
console.log(r.join('\n'));await p.screenshot({path:'C:/Users/Brittany/hud-after.png'});await b.close();})();
