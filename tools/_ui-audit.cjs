const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1100,height:700});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(15000);
await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&/Source Temple/i.test(e.textContent||'')&&e.offsetParent);const t=els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];if(t)(t.closest('button,[class*=portal],[class*=card],[onclick]')||t).click();});
await sleep(25000);
const report=await p.evaluate(async()=>{const N=window.Navi;const out=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 if(!N||!N.open){return 'no Navi';}
 N.open();await sleep(800);
 const nodes=[...document.querySelectorAll('#navi .node')];
 for(const n of nodes){const mod=n.dataset.m;n.click();await sleep(500);
  const btns=[...document.querySelectorAll('#navi button.b, #navi .row')].filter(e=>e.offsetParent);
  const entry={mod,rows:document.querySelectorAll('#navi .row').length,buttons:[...document.querySelectorAll('#navi button.b')].map(x=>x.textContent.trim().slice(0,24)),empty:(document.querySelector('#navi .empty')||{}).textContent||null,plateL:(document.getElementById('nvL')||{}).innerText?.slice(0,60),plateR:(document.getElementById('nvR')||{}).innerText?.slice(0,60)};
  // click every button once, record toast/modal change
  const results=[];for(const bt of [...document.querySelectorAll('#navi button.b')]){const before=document.body.innerText.length+(document.querySelector('#navi .modal')?1:0);let threw=null;try{bt.click();}catch(e){threw=e.message}await sleep(250);const modal=!!document.querySelector('#navi .modal');results.push([bt.textContent.trim().slice(0,22),bt.disabled?'DISABLED':'ok',threw||'',modal?'modal':'']);const m=document.querySelector('#navi .modal');if(m){const c=[...m.querySelectorAll('button')].find(x=>/cancel|close|x/i.test(x.textContent));if(c)c.click();else m.remove();}await sleep(120);}
  entry.clicks=results;out.push(entry);}
 return out;});
console.log(JSON.stringify(report,null,0).replace(/\},\{/g,'},\n{').slice(0,6000));console.log('ERRS',JSON.stringify(errs.slice(0,6)));await b.close();})();
