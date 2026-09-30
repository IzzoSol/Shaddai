const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
const logs=[];p.on('console',m=>{const t=m.text();if(/static-merge|error|failed/i.test(t))logs.push(t.slice(0,200));});
p.on('pageerror',e=>logs.push('PAGEERROR '+(e&&e.message)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(140000);
const r=await p.evaluate(()=>({done:!!window.__staticMergeDone,playableAt:window.__loadPlayableAt||null,now:Math.round(performance.now()),
  animFrame:window._animFrame||null,arm:window.__mergeArm?Math.round(window.__mergeArm):null,
  merged:(window.__w3dDebug.scene.children||[]).filter(c=>c.name==='static-merge').length,
  unnamedGroup:(function(){let n=0;window.__w3dDebug.scene.traverseVisible(function(o){if(!o.isMesh||o.name)return;let top=o;while(top.parent&&top.parent!==window.__w3dDebug.scene)top=top.parent;if(top!==o&&!top.name)n++;});return n;})()}));
console.log(JSON.stringify(r));console.log('console:',logs.slice(0,10).join('\n  ')||'(none)');await b.close();})();
