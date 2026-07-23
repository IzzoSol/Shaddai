const puppeteer = require('puppeteer');
const FLAGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--no-sandbox','--disable-setuid-sandbox'];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function measure(url, fp, frames){
  let br;
  try {
    br = await puppeteer.launch({headless:'new', args:FLAGS, protocolTimeout:240000});
    const pg = await br.newPage();
    await pg.setViewport({width:180,height:120});
    await pg.goto(url,{waitUntil:'load',timeout:40000});
    await wait(1200);
    await pg.evaluate(f => { window.__forceP = f; }, fp);
    await wait(1000);
    const ts = await pg.evaluate((N) => new Promise(res => {
      const a=[]; let last=performance.now(); let i=0;
      function s(){ const now=performance.now(); a.push(now-last); last=now;
        if(++i>=N){res(a);return;} requestAnimationFrame(s); }
      requestAnimationFrame(s);
    }), frames);
    ts.sort((x,y)=>x-y);
    return ts[Math.floor(ts.length/2)];
  } finally { if(br) try{ await br.close(); }catch(e){} }
}

(async () => {
  const B=[], A=[];
  for(let k=0;k<5;k++){
    try { const b = await measure('http://localhost:3000/_dp-baseline.html', 0.95, 12); B.push(b); process.stdout.write('B'+k+'='+b.toFixed(0)+' '); } catch(e){ process.stdout.write('B'+k+'=X '); }
    try { const a = await measure('http://localhost:3000/lab-molecules.html', 0.95, 12); A.push(a); process.stdout.write('A'+k+'='+a.toFixed(0)+' '); } catch(e){ process.stdout.write('A'+k+'=X '); }
  }
  process.stdout.write('\n');
  const med = arr => { arr=arr.slice().sort((x,y)=>x-y); return arr.length? arr[Math.floor(arr.length/2)]:null; };
  const bMed=med(B), aMed=med(A);
  console.log(JSON.stringify({
    beforeMs:+bMed.toFixed(2), afterMs:+aMed.toFixed(2),
    deltaPct:+(((aMed-bMed)/bMed)*100).toFixed(1),
    nBefore:B.length, nAfter:A.length,
    allBefore:B.map(x=>+x.toFixed(0)), allAfter:A.map(x=>+x.toFixed(0))
  }));
})().catch(e=>{console.error('FATAL',e&&e.message);process.exit(1);});
