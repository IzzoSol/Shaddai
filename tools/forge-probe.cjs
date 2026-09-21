const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();await p.setViewport({width:1200,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:8790/game.html',{waitUntil:'domcontentloaded'});await sleep(6000);
const r=await p.evaluate(()=>{const c=document.getElementById('ccv');if(!c)return 'no canvas';const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,painted:n,state:typeof state!=='undefined'?state:'?',ppOK:!!(window.PixelPeople),vis:getComputedStyle(c).display};});
console.log(JSON.stringify(r));console.log('ERR',errs.slice(0,5).join(' | '));await b.close();})();
