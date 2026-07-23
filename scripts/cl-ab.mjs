import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1600,900']});
for(const [name,file] of [['backup','_ab_backup.html'],['current','_ab_current.html']]){
  const p=await b.newPage();
  await p.setViewport({width:1600,height:900,deviceScaleFactor:1});
  await p.goto('http://localhost:3000/'+file,{waitUntil:'networkidle2',timeout:60000});
  await new Promise(r=>setTimeout(r,1800));
  await p.evaluate(()=>{window.__forceP=0.06;});
  await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:'scripts/cl-ab-'+name+'.png'});
  await p.close();
}
await b.close();
console.log('done');
