const puppeteer=require('puppeteer');
const FLAGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function med(browser,url,fp,n){
  const page=await browser.newPage();
  await page.setViewport({width:300,height:190});
  await page.goto(url,{waitUntil:'load',timeout:30000});
  await wait(900);
  await page.evaluate(f=>{window.__forceP=f;},fp);
  await wait(600);
  const ts=await page.evaluate((N)=>new Promise(res=>{
    const a=[];let last=performance.now();let i=0;
    function s(){const now=performance.now();a.push(now-last);last=now;if(++i>=N){res(a);return;}requestAnimationFrame(s);}
    requestAnimationFrame(s);
  }),n);
  await page.close();
  ts.sort((x,y)=>x-y);return ts[Math.floor(ts.length/2)];
}
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:180000});
  // interleave 3x to average out swiftshader jitter
  const B=[],A=[];
  for(let k=0;k<3;k++){
    B.push(await med(browser,'http://localhost:3000/_lab-molecules-baseline.html',0.72,40));
    A.push(await med(browser,'http://localhost:3000/lab-molecules.html',0.72,40));
  }
  B.sort((a,b)=>a-b);A.sort((a,b)=>a-b);
  const b=B[1],a=A[1];
  console.log(JSON.stringify({before:+b.toFixed(1),after:+a.toFixed(1),deltaPct:+(((a-b)/b)*100).toFixed(1),allBefore:B.map(x=>+x.toFixed(0)),allAfter:A.map(x=>+x.toFixed(0))}));
  await browser.close();
})();
