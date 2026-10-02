const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=600']});
const p=await b.newPage();await p.setViewport({width:1000,height:700});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<60&&!(await p.evaluate(()=>!!(window.__mountRide&&window.WorldOffices&&window.WorldArcade&&window.WorldFarm)).catch(()=>false));i++)await sleep(2000);
await sleep(4000);
const r=await p.evaluate(()=>{const o={};o.farm3d=!!window.__farm3d;o.quests=typeof window.WorldQuests;o.gear=typeof window.WorldGear;o.gadgets=typeof window.WorldGadgets;o.hitfx=typeof window.__hitfx;o.mobsBlips=!!(window.__mobs&&window.__mobs.blips);o.radarBtn=!!document.getElementById("gadgetBar");window.__mountRide.panel(true);const t=document.getElementById('mountStore').innerText;o.sections=['ARCADE & FARM','OFFICES','HOVERBOARDS','RACES','AGENTS & JOBS','COLOSSEUM','TRAVEL','HELPER BOTS'].filter(x=>t.includes(x));o.offices=[...document.querySelectorAll('#mountStore [data-a="office"]')].length;
 const click=(sel)=>{const e=document.querySelector(sel);if(e){e.click();return true;}return false;};
 o.arcade=click('#mountStore [data-a="arcade"][data-id="slots"]');o.arcadePanel=!!document.getElementById('arcadePanel');
 window.__mountRide.panel(true);o.farm=click('#mountStore [data-a="farm"]');o.farmPanel=!!document.getElementById('farmPanel');
 window.__mountRide.panel(true);o.office=click('#mountStore [data-a="office"][data-id="NEXUS"]');o.officePanel=!!document.getElementById('officePanel');
 window.__mountRide.panel(true);o.race=click('#mountStore [data-a="rselect"]');o.racePanel=!!document.querySelector('#rsBody');return o;});
console.log(JSON.stringify(r));console.log('ERRS',JSON.stringify(errs.slice(0,4)));await b.close();})();
