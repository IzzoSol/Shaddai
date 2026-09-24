import puppeteer from 'puppeteer'; import sharp from 'sharp';
const pairs=[['zerox-council','zerox-v3m']];
const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();await p.setViewport({width:700,height:1000});
await p.goto('http://localhost:8765/spike/sprite-capture.html',{waitUntil:'load'});
const shot=async(n,clip,t)=>{await p.evaluate((f)=>window.__loadClip(f),`../characters/${n}/${n}-${clip}.glb`);await p.waitForFunction(()=>window.__ready===true||window.__ready==='error',{timeout:60000});await p.evaluate((tt)=>window.__setTime(tt),t);const f=await p.screenshot({omitBackground:true});return sharp(f).trim({threshold:10}).flatten({background:'#dfe3ea'}).resize({height:500,width:330,fit:'contain',background:'#dfe3ea'}).png().toBuffer();};
const tiles=[];for(const [o,n] of pairs){tiles.push(await shot(o,'walking',0.35),await shot(n,'walking',0.35));}
await sharp({create:{width:330*2,height:500,channels:3,background:'#dfe3ea'}}).composite(tiles.map((t,i)=>({input:t,left:i*330,top:0}))).png().toFile('fal-assets/spike/v3-compare.png');await b.close();console.log('ok');
