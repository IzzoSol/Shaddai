import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
async function check(url,label){
  const errs=[];const p=await b.newPage();await p.setViewport({width:1440,height:900});
  p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  await new Promise(r=>setTimeout(r,1600));
  const fs=await p.evaluate(()=>{const btn=document.querySelector('.pillar>button');return btn?getComputedStyle(btn).fontSize:null;});
  // real click on 3rd pillar (Create), wait for transition, check panel
  await p.evaluate(()=>{const pl=document.querySelectorAll('.pillar[data-pillar]')[2];const btn=pl&&pl.querySelector('button');if(btn)btn.click();});
  await new Promise(r=>setTimeout(r,450));
  const open=await p.evaluate(()=>{const pl=document.querySelectorAll('.pillar[data-pillar]')[2];const panel=pl&&pl.querySelector('.panel');if(!panel)return'no panel';const cs=getComputedStyle(panel);return'vis:'+cs.visibility+' op:'+cs.opacity;});
  // click again to close
  await p.evaluate(()=>{const pl=document.querySelectorAll('.pillar[data-pillar]')[2];const btn=pl&&pl.querySelector('button');if(btn)btn.click();});
  await new Promise(r=>setTimeout(r,300));
  const closed=await p.evaluate(()=>{const pl=document.querySelectorAll('.pillar[data-pillar]')[2];const panel=pl&&pl.querySelector('.panel');return getComputedStyle(panel).visibility;});
  await p.close();
  console.log(label+': errors='+errs.length+' tabFont='+fs+' | click-open='+open+' | click-close='+closed);
}
await check('http://localhost:3000/home.html','HOME');
await check('http://localhost:3000/aura.html','AURA');
await check('http://localhost:3000/marketplace-shop-v2.html','SHOP');
await b.close();
