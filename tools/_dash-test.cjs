const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--js-flags=--max-old-space-size=700']});
const p=await b.newPage();await p.setViewport({width:1200,height:800});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/index.html',{waitUntil:'domcontentloaded',timeout:90000});await sleep(9000);
const r=await p.evaluate(async()=>{const o={};o.hasView=!!document.getElementById('worldsView');o.fn=typeof window.switchWorldsTab;o.ui=typeof window.WorldAgentsUI;o.da=typeof window.DashboardAgents;
 try{window.showView&&window.showView('worlds');}catch(e){o.showErr=e.message}
 await new Promise(r=>setTimeout(r,800));
 for(const t of ['worlds','city','economy','forge']){try{window.switchWorldsTab(t);}catch(e){o['err_'+t]=e.message}await new Promise(r=>setTimeout(r,1500));}
 o.portal3d=!!document.getElementById('dxaPortal3d');o.forgeCard=!!document.getElementById('dxaForge');o.cityCard=!!document.getElementById('dxaCity');o.jobsCard=!!document.getElementById('dxaJobs');
 o.forgeText=(document.querySelector('#dxaForge .dxa-body')||{}).innerText;o.tabStyle=getComputedStyle(document.querySelector('#worldsView .wh-tb')).borderBottomWidth;return o;});
console.log(JSON.stringify(r));console.log('ERRS',JSON.stringify(errs.slice(0,4)));await p.screenshot({path:'C:/Users/Brittany/dash-worlds.png'});await b.close();})();
