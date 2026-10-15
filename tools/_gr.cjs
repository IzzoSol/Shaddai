const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:600000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:800,height:500});const errs=[];p.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?map=v4&peek=1',{waitUntil:'domcontentloaded',timeout:90000});
let ok=false;for(let i=0;i<220;i++){await sleep(2500);ok=await p.evaluate(()=>!!(window.__hoverPark&&window.__raceRun)).catch(()=>false);if(ok)break;}
const r=await p.evaluate(()=>{const P=window.__hoverPark,T=window.__w3dDebug.terrainV4||window.__w3dDebug.terrain,U=7/1.8,out={};const c=P.rooms.find(x=>x.id==='pad');out.deckY=+P.deckY.toFixed(1);out.onDeck=+T.heightAt(c.x,c.z).toFixed(1);
 const en=P.entrance;out.entrance=+T.heightAt(en.x,en.z).toFixed(1);out.far=+T.heightAt(c.x+800*U,c.z).toFixed(1);const b=P.rooms.find(x=>x.id==='banks');out.banks=+T.heightAt(b.x,b.z).toFixed(1);
 // walk a line across the apron: monotone?
 const dir=[c.x-en.x,c.z-en.z];const L=Math.hypot(dir[0],dir[1]);const line=[];for(let d=-60;d<=10;d+=10){line.push(+T.heightAt(en.x-dir[0]/L*d*U*-1,en.z-dir[1]/L*d*U*-1).toFixed(0));}out.apron=line.join(',');return out;});
console.log('GROUND '+JSON.stringify(r));console.log('ERRS '+JSON.stringify(errs.slice(0,4)));await b.close();})();
