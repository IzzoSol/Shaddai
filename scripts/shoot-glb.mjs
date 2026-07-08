import puppeteer from 'puppeteer';
const codes = process.argv.slice(2); if(!codes.length) codes.push('ZEROX','TURTLE','PIKADON','ORACLE','VILLAIN');
const browser = await puppeteer.launch({ headless:'new',
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
for(const c of codes){
  const page = await browser.newPage(); await page.setViewport({width:640,height:800});
  await page.goto('http://localhost:3000/_glbcheck.html?clone=1&f='+c+'.glb', { waitUntil:'networkidle2', timeout:40000 }).catch(()=>{});
  await page.waitForFunction('window.__ready===true', { timeout:40000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,1200));
  const info = await page.evaluate(()=>({ clips:window.__clips, err:window.__err }));
  const out = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\scripts\\shot-'+c+'.png';
  await page.screenshot({ path: out });
  console.log(c, '→', out, '| clips:', (info.clips||[]).join(',')||'(none)', info.err?('| ERR '+info.err):'');
  await page.close();
}
await browser.close();
