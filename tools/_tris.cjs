const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(70000);
const r=await p.evaluate(()=>{const sc=window.__w3dDebug.scene,cam=window.__w3dDebug.camera;const G={};const f=new (cam.position.constructor)();
 sc.traverseVisible(o=>{if(!o.isMesh)return;const g=o.geometry;if(!g)return;const idx=g.index?g.index.count:(g.attributes.position?g.attributes.position.count:0);let t=idx/3;if(o.isInstancedMesh)t*=o.count;
  let top=o,path=[];while(top.parent&&top.parent!==sc){top=top.parent;}const k=(top.name||top.type)+(o.isInstancedMesh?' [inst]':'')+' / '+(o.name||o.parent&&o.parent.name||'');const e=G[k]||(G[k]={tris:0,meshes:0});e.tris+=t;e.meshes++;});
 return Object.entries(G).sort((a,b)=>b[1].tris-a[1].tris).slice(0,22).map(([k,v])=>Math.round(v.tris/1000)+'k tris '+v.meshes+' meshes  '+k.slice(0,90));});
console.log(r.join('\n'));await b.close();})();
