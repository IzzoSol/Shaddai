import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
async function check(url,label){
  const errs=[];const p=await b.newPage();await p.setViewport({width:1440,height:900});
  p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  await new Promise(r=>setTimeout(r,1800));
  const info=await p.evaluate(()=>{
    const pillars=[...document.querySelectorAll('.mega .pillar > button, .mega .pillar button')];
    const first=document.querySelector('.mega .pillar');
    const btn=first?first.querySelector('button'):null;
    const fs=btn?getComputedStyle(btn).fontSize:null;
    // try hover/click open the first pillar
    let opened=false, panelVis=null;
    if(first){ first.classList.add('open'); const panel=first.querySelector('.panel'); if(panel){ panelVis=getComputedStyle(panel).visibility+' / disp:'+getComputedStyle(panel).display+' / op:'+getComputedStyle(panel).opacity; } }
    // simulate real click behavior: dispatch mouseenter/click
    return { pillarCount:pillars.length, tabFontSize:fs, panelAfterOpenClass:panelVis, barExists:!!document.querySelector('.bar') };
  });
  // actually click the 2nd pillar and see if a panel becomes visible
  const clickTest=await p.evaluate(()=>{
    const pillars=[...document.querySelectorAll('.mega .pillar')];
    if(pillars.length<2) return 'no pillars';
    const pl=pillars[1]; const btn=pl.querySelector('button'); if(btn) btn.click();
    const panel=pl.querySelector('.panel');
    return panel? ('vis:'+getComputedStyle(panel).visibility+' op:'+getComputedStyle(panel).opacity) : 'no panel';
  });
  await p.close();
  console.log(label+': errors='+errs.length+' pillars='+info.pillarCount+' tabFont='+info.tabFontSize+' clickOpens='+clickTest);
  errs.slice(0,3).forEach(e=>console.log('   ! '+e));
}
await check('http://localhost:3000/aura.html','AURA');
await check('http://localhost:3000/home.html','HOME');
await check('http://localhost:3000/agents.html','COUNCIL');
await b.close();
