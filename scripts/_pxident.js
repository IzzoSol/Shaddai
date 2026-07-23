const puppeteer=require('puppeteer');
const FLAGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function grab(browser,url,fp,tt){
  const page=await browser.newPage();
  await page.setViewport({width:600,height:380});
  await page.goto(url,{waitUntil:'load',timeout:30000});
  await wait(800);
  await page.evaluate((p,t)=>{window.__forceP=p;window.__forceT=t;},fp,tt);
  await wait(900);
  const data=await page.evaluate(()=>{
    const c=document.getElementById('gl');const g=c.getContext('webgl2');
    const w=c.width,h=c.height;const px=new Uint8Array(w*h*4);
    g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,px);
    return {w,h,px:Array.from(px)};
  });
  await page.close();
  return data;
}
function diff(a,b){
  if(a.w!==b.w||a.h!==b.h)return {err:'size'};
  let maxd=0,sum=0,dn=0,n=a.w*a.h;
  for(let i=0;i<n;i++){let pd=0;for(let c=0;c<3;c++){const d=Math.abs(a.px[i*4+c]-b.px[i*4+c]);if(d>maxd)maxd=d;sum+=d;pd=Math.max(pd,d);}if(pd>2)dn++;}
  return {maxd,mean:+(sum/(n*3)).toFixed(3),pctDiff:+(100*dn/n).toFixed(2)};
}
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:120000});
  const out={};
  for(const fp of [0.66,0.72]){
    const cur=await grab(browser,'http://localhost:3000/lab-molecules.html',fp,12.0);
    const base=await grab(browser,'http://localhost:3000/_lab-molecules-baseline.html',fp,12.0);
    out['fp'+fp]=diff(cur,base);
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
