const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:600,height:400});
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
await sleep(3000);
const r=await p.evaluate(()=>{const D=window.__w3dDebug,H=D.terrainV4||D.terrain,W=D.waterV4,U=7/1.8,R=300*U;const res=[];
 function fig(cx,cz,rot){const pts=[];for(let i=0;i<64;i++){const t=i/64*Math.PI*2,d=1+Math.sin(t)*Math.sin(t),x=R*Math.cos(t)/d,z=R*Math.sin(t)*Math.cos(t)/d;pts.push([cx+x*Math.cos(rot)-z*Math.sin(rot),cz+x*Math.sin(rot)+z*Math.cos(rot)]);}return pts;}
 for(let cx=-3000*U;cx<=3000*U;cx+=150*U)for(let cz=-3000*U;cz<=3000*U;cz+=150*U){
  const pts=fig(cx,cz,0);let mn=1e9,mx=-1e9,wet=0;pts.forEach(q=>{const h=H.heightAt(q[0],q[1]),w=W.waterHeightAt(q[0],q[1]);if(w!=null&&w>h-0.5)wet++;mn=Math.min(mn,h);mx=Math.max(mx,h);});
  let near=0;for(let a=0;a<12;a++){const x=cx+Math.cos(a/12*6.283)*(R*1.6),z=cz+Math.sin(a/12*6.283)*(R*1.6),w=W.waterHeightAt(x,z),h=H.heightAt(x,z);if(w!=null&&w>h)near++;}
  if(wet===0&&mx-mn<12*U&&near>0)res.push({x:Math.round(cx/U),z:Math.round(cz/U),rel:Math.round((mx-mn)/U),near,d:Math.round(Math.hypot(cx,cz)/U)});}
 res.sort((a,b)=>a.d-b.d);return res.slice(0,8);});
console.log(JSON.stringify(r));await b.close();})();
