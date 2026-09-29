const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(60000);
// which materials get needsUpdate per frame: sample versions
const v=await p.evaluate(()=>new Promise(res=>{const sc=window.__w3dDebug.scene;const ms=[];sc.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material)&&ms.length<4000)ms.push(o.material)});const v0=ms.map(m=>m.version);setTimeout(()=>{let ch=0;const names={};const own={};ms.forEach((m,i)=>{if(m.version!==v0[i]){ch++;const k=m.type+'|'+(m.name||'')+'|map:'+(m.map?m.map.constructor.name+(m.map.image&&m.map.image.width||''):'-')+'|vc:'+m.vertexColors+'|tr:'+m.transparent;names[k]=(names[k]||0)+1;m.__chg=(m.__chg||0)+(m.version-v0[i]);}});let ex=[];sc.traverse(o=>{if(o.isMesh&&o.material&&o.material.__chg&&ex.length<6){let p=o,path=[];while(p&&path.length<4){path.push(p.name||p.type);p=p.parent}ex.push(path.join('<')+' dv='+o.material.__chg)}});res({total:ms.length,changed:ch,names,ex});},8000);}));
console.log('MATVER',JSON.stringify(v).slice(0,1800));await b.close();})();
