const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
  page.on('pageerror', e => errors.push('pageerror: '+e.message));
  await page.goto('http://localhost:3000/journey.html', { waitUntil:'networkidle2' });
  // ensure near top (lattice = first stage, t~0.02-0.05)
  const max = await page.evaluate(()=> document.documentElement.scrollHeight - window.innerHeight);
  await page.evaluate((m)=> window.scrollTo(0, m*0.005), max);
  await new Promise(r=>setTimeout(r,1800));
  const dbg = await page.evaluate(()=> ({t:window.t, stageF:window.stageF, scrollY:window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight}));
  console.log('SCROLL DEBUG:', JSON.stringify(dbg));
  await page.mouse.move(700, 420);
  await new Promise(r=>setTimeout(r,900));
  await page.mouse.move(1050, 300);
  await new Promise(r=>setTimeout(r,900));
  await page.screenshot({ path:'scripts/lattice-rich.png' });
  await page.mouse.move(400, 650);
  await new Promise(r=>setTimeout(r,1200));
  await page.screenshot({ path:'scripts/lattice-rich-2.png' });
  const label = await page.evaluate(()=>{ const e=document.querySelector('#stageLabel,.stage-label,[data-label]'); return e?e.textContent:null; });
  console.log('LABEL:', label);
  console.log('ERRORS:', errors.length, JSON.stringify(errors,null,2));
  await browser.close();
  process.exit(errors.length?1:0);
})();
