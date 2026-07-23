import puppeteer from 'puppeteer';
const AGENTS=(process.argv.slice(2).length?process.argv.slice(2):['SHADDAI','ORACLE','QUILL','TURTLE','NEXUS','ZEROX','PIKADON']);
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'],protocolTimeout:180000});
for(const A of AGENTS){
  const p=await b.newPage();
  await p.setViewport({width:768,height:1024,deviceScaleFactor:1});
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  await p.goto('http://localhost:3000/_modelshot.html?agent='+A+'&unlit=0',{waitUntil:'networkidle2',timeout:60000});
  // wait for __done
  try{ await p.waitForFunction('window.__done===true',{timeout:60000}); }catch(e){ errs.push('timeout'); }
  const err=await p.evaluate(()=>window.__err);
  // front
  await p.evaluate(()=>window.__frame&&window.__frame(0)); await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:'fal-assets/model-refs/'+A+'-front.png'});
  // 3/4
  await p.evaluate(()=>window.__frame&&window.__frame(35)); await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:'fal-assets/model-refs/'+A+'-34.png'});
  console.log(A+': '+(err?('ERR '+err):'ok'));
  await p.close();
}
await b.close(); console.log('DONE');
