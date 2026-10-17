const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});
await p.goto('http://localhost:3013/colosseum-viewer.html',{waitUntil:'domcontentloaded',timeout:60000});
for(let i=0;i<60;i++){await sleep(1500);if(await p.evaluate(()=>!!(window.__viewer&&window.__viewer.arena)).catch(()=>false))break;}
await sleep(6000);
const shots=[['in-lobby-north',[0,1.7,'LZ0+LD-5'],[0,9,'LZ0-30']],['at-gate',[0,1.7,'LZ0+3'],[0,5,'LZ0-40']],['in-tunnel',[0,1.7,'LZ0-14'],[0,4,0]],['arena-floor-south',[0,1.7,-10],[0,6,'LZ0']]];
for(const [n,c,t] of shots){await p.evaluate((c,t)=>{const V=window.__viewer,a=V.arena,d=a.dims,U=d.U||3.8889,cx=a.group.position.x,cz=a.group.position.z;const f=v=>typeof v==='string'?eval(v.replace('LZ0',d.LOBBY_Z0).replace('LD',d.LOBBY_D)):v;
 V.look(cx+c[0]*U,c[1]*U,cz+f(c[2])*U,cx+t[0]*U,t[1]*U,cz+f(t[2])*U);},c,t);await sleep(2500);await p.screenshot({path:'C:/Users/Brittany/colo-view-'+n+'.png'});}
await b.close();})();
