const puppeteer=require('puppeteer');
const FLAGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:FLAGS,protocolTimeout:180000});
  const page=await browser.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
  page.on('pageerror',e=>errs.push('PE:'+e.message.slice(0,200)));
  await page.setViewport({width:900,height:560});
  await page.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'load',timeout:30000});
  await wait(1200);
  const gl2=await page.evaluate(()=>{try{return !!document.getElementById('gl').getContext('webgl2');}catch(e){return false;}});
  const fb=await page.evaluate(()=>{const f=document.getElementById('fallback');return f&&getComputedStyle(f).display!=='none';});

  // ---- FULL SWEEP across the whole journey (incl. new dome) ----
  const sweep=[0.05,0.2,0.4,0.6,0.72,0.85,0.92,0.97,1.0];
  const sweepErrs={};
  for(const P of sweep){
    const before=errs.length;
    await page.evaluate(v=>{window.__forceP=v;},P);
    await wait(500);
    sweepErrs[P]=errs.length-before;
  }

  // helper to shoot at a pinned p
  async function shot(p,name,extra){
    await page.evaluate(v=>{window.__forceP=v;},p);
    if(extra) await page.evaluate(extra);
    await wait(800);
    await page.screenshot({path:'scripts/'+name});
  }
  // mean luminance of center to prove NOT black
  async function lum(){
    return await page.evaluate(()=>{
      const c=document.getElementById('gl');
      const gl=c.getContext('webgl2');
      const w=c.width,h=c.height;
      const px=new Uint8Array(4*100);
      // sample a 10x10 block near center
      const x0=(w/2)|0,y0=(h/2)|0; let sum=0,n=0;
      const buf=new Uint8Array(4);
      for(let i=0;i<10;i++){for(let j=0;j<10;j++){
        gl.readPixels(x0+i,y0+j,1,1,gl.RGBA,gl.UNSIGNED_BYTE,buf);
        sum+=(buf[0]+buf[1]+buf[2]); n++;
      }}
      return sum/n/3;
    });
  }

  await shot(0.50,'cn-water.png');            // loved Flower-of-Life caustic
  await shot(0.63,'cn-desert-apex.png');      // apex + glint, pre-seam
  const seamLum=await (async()=>{ await shot(0.70,'cn-seam.png'); return await lum(); })(); // mid tilt-up
  await shot(0.85,'cn-dome.png');             // full dome + constellations
  await shot(1.00,'cn-crown.png');            // zenith Kether crown
  // drag during dome beat: pin yaw/pitch to simulate a click-drag look-around
  await page.evaluate(()=>{window.__forceP=0.90;window.__forceYaw=0.8;window.__forcePitch=0.5;});
  await wait(800);
  await page.screenshot({path:'scripts/cn-drag.png'});
  const dragLum=await lum();

  console.log(JSON.stringify({gl2,fbShown:fb,totalErrors:errs.length,sweepErrs,seamLum,dragLum,errs:errs.slice(0,10)},null,2));
  await browser.close();
})();
