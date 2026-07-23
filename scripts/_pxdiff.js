const puppeteer=require('puppeteer');
const fs=require('fs');
const FLAGS=['--no-sandbox','--disable-setuid-sandbox'];
(async()=>{
  const a='data:image/png;base64,'+fs.readFileSync('scripts/px-loved-062.png').toString('base64');
  const b='data:image/png;base64,'+fs.readFileSync('scripts/px-loved-062-BASELINE.png').toString('base64');
  const browser=await puppeteer.launch({headless:'new',args:FLAGS});
  const page=await browser.newPage();
  const r=await page.evaluate(async(a,b)=>{
    function loadImg(src){return new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.src=src;});}
    const ia=await loadImg(a), ib=await loadImg(b);
    const w=ia.width,h=ia.height;
    const ca=document.createElement('canvas');ca.width=w;ca.height=h;
    const cb=document.createElement('canvas');cb.width=w;cb.height=h;
    ca.getContext('2d').drawImage(ia,0,0);cb.getContext('2d').drawImage(ib,0,0);
    const da=ca.getContext('2d').getImageData(0,0,w,h).data;
    const db=cb.getContext('2d').getImageData(0,0,w,h).data;
    let maxd=0,sum=0,diff=0,n=w*h;
    for(let i=0;i<n;i++){
      let pd=0;
      for(let c=0;c<3;c++){const d=Math.abs(da[i*4+c]-db[i*4+c]);if(d>maxd)maxd=d;sum+=d;pd=Math.max(pd,d);}
      if(pd>3)diff++;
    }
    return {w,h,maxd,mean:+(sum/(n*3)).toFixed(3),pctDiff:+(100*diff/n).toFixed(2)};
  },a,b);
  console.log(JSON.stringify(r));
  await browser.close();
})();
