const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const errors=[];
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--use-gl=angle','--ignore-gpu-blocklist'] });
  const pg = await b.newPage();
  await pg.setViewport({width:1440,height:900,deviceScaleFactor:1});
  pg.on('pageerror',e=>errors.push('PE:'+e.message));
  pg.on('console',m=>{if(m.type()==='error')errors.push('C:'+m.text());});
  await pg.goto('http://localhost:3000/lab-molecules.html',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,600));
  async function pin(v){await pg.evaluate(p=>{window.__forceP=p;},v);await new Promise(r=>setTimeout(r,900));}
  await pin(0.10); await pg.screenshot({path:path.join(__dirname,'j3-mol.png')});
  await pin(0.45); await pg.screenshot({path:path.join(__dirname,'j3-grass.png')});
  await b.close();
  console.log('ERR='+errors.length); if(errors.length)console.log(errors.join('\n'));
})();
