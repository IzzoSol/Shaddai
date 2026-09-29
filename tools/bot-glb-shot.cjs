const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const f=process.argv[2]||'scrap';const p=await b.newPage();await p.setViewport({width:1600,height:800});await p.goto('http://localhost:3013/bots-glb-preview.html?f='+f);
for(let i=0;i<60;i++){await sleep(1000);if(await p.evaluate(()=>window.__done||window.__err))break;}
await p.screenshot({path:'C:/Users/Brittany/AppData/Local/Temp/botglb-'+f+'.png'});console.log(await p.evaluate(()=>window.__err||(window.__size+' clips:'+window.__names)));await b.close();})();
