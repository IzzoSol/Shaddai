const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:640,height:400});const errs=[];p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(40000);
const r=await p.evaluate(async()=>{const pp=window.__w3dDebug.playerPos;const out={start:[Math.round(pp.x),Math.round(pp.z)]};let big=null;let _x=pp.x,_z=pp.z;
 Object.defineProperty(pp,'x',{get(){return _x},set(v){if(Math.abs(v-_x)>300&&!big)big={from:[Math.round(_x),Math.round(pp.z)],to:Math.round(v),stack:new Error().stack.split('\n').slice(2,7).map(s=>s.trim().replace(/https?:\/\/[^/]+/,'').slice(0,110))};_x=v;},configurable:true});
 const k=(c)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:c,key:c,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:c,key:c,bubbles:true}));};
 for(const c of ['KeyV','KeyB','KeyB']){k(c);await new Promise(r=>setTimeout(r,2500));out[c+Math.random().toString(36).slice(2,4)]=[Math.round(_x),Math.round(pp.z)];}
 out.big=big;return out;});
console.log(JSON.stringify(r,null,1).slice(0,1800));console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
