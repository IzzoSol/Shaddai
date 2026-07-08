// Screenshot the dashboard Rooms tab (marketplace view) — chambers + relocated swivel.
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless:'new',
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1600 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:3000/dashboard', { waitUntil:'domcontentloaded', timeout:40000 }).catch(e=>errs.push('goto '+e.message));
// skip the boot overlay + open the Rooms (marketplace) view
await new Promise(r=>setTimeout(r,2500));
await page.evaluate(()=>{ try{ const o=document.getElementById('shaddai-boot-overlay'); if(o) o.remove(); }catch(_){}
  try{ const l=document.getElementById('ly-intro'); if(l) l.style.display='none'; }catch(_){}
  try{ window.showView && window.showView('marketplace'); }catch(e){ console.log('showView '+e.message); } });
await new Promise(r=>setTimeout(r,4500));   // let chamber 3D + carousel render
// select a chamber so a body is mounted
await page.evaluate(()=>{ try{ window.selectChamber && window.selectChamber('turtle'); }catch(_){} });
await new Promise(r=>setTimeout(r,6000));
const info = await page.evaluate(()=>{
  const mv = document.getElementById('marketplaceView');
  return { marketActive: mv && mv.classList.contains('active'),
    hasChamber: !!document.getElementById('chamberStage'),
    swivelInRooms: !!(mv && mv.querySelector('#agentDeployCard')),
    canvases: document.querySelectorAll('#marketplaceView canvas').length };
});
const out = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\scripts\\shot-rooms.png';
// close-up of JUST the chamber 3D stage so the model is clearly visible
const el = await page.$('#chamberStage');
if (el) { await el.screenshot({ path: out }); } else { await page.screenshot({ path: out, fullPage: true }); }
await browser.close();
console.log('info:', JSON.stringify(info));
console.log('errors:', errs.slice(0,5).join(' | ')||'(none)');
console.log('saved:', out);
