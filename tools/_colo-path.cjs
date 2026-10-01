const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://localhost:3013/colosseum-viewer.html',{waitUntil:'domcontentloaded',timeout:60000});
for(let i=0;i<60;i++){await sleep(1500);if(await p.evaluate(()=>!!(window.__viewer&&window.__viewer.arena&&window.__viewer.arena.hLocal)).catch(()=>false))break;}
const r=await p.evaluate(()=>{const a=window.__viewer.arena,d=a.dims,h=a.hLocal;const LZ0=d.LOBBY_Z0,LD=d.LOBBY_D,TH=d.TUNNEL_HALF;const out={dims:{A:d.A,B:d.B,SHELL:d.SHELL,LZ0,LD,TH,LOBBY_W:d.LOBBY_W}};
 // walk x=0 from the lobby's far (south) end to the arena centre
 const prof=[];let blocked=null,maxStep=0,last=null;for(let z=LZ0+LD-1;z>=-2;z-=1){const v=h(0,z);prof.push([Math.round(z),v>=999?'X':+v.toFixed(1)]);if(v>=999&&blocked===null)blocked=z;if(last!==null&&v<999&&last<999)maxStep=Math.max(maxStep,Math.abs(v-last));last=v;}
 out.firstBlockedZ=blocked;out.maxStep=+maxStep.toFixed(2);out.profileEvery10=prof.filter((_,i)=>i%10===0);
 // tunnel width check at the shell: sample x across at z=LZ0-4
 const row=[];for(let x=-8;x<=8;x+=1){const v=h(x,LZ0-4);row.push(v>=999?'X':+v.toFixed(1));}out.tunnelRowAtShell=row.join(',');
 const row2=[];for(let x=-34;x<=34;x+=4){const v=h(x,LZ0+10);row2.push(v>=999?'X':+v.toFixed(1));}out.lobbyRow=row2.join(',');return out;});
console.log(JSON.stringify(r,null,1).slice(0,1500));console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();
