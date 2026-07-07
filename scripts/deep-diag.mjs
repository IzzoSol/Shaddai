// Deep diagnostic: load world, drive setPlayerCharacter, count bodies in the scene graph.
import puppeteer from 'puppeteer';
const URL = 'http://localhost:3000/SHADDAI-WORLD-3D.html';
const all = [], errs = [];
const browser = await puppeteer.launch({ headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', m => all.push(m.text()));
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('requestfailed', r => { const u=r.url(); if(/\.glb|assets/.test(u)) errs.push('reqfail: '+u+' '+(r.failure()&&r.failure().errorText)); });

await page.goto(URL, { waitUntil:'domcontentloaded', timeout:30000 }).catch(e=>errs.push('goto: '+e.message));
await new Promise(r=>setTimeout(r, 14000));   // let agent bodies stream

// expose scene internals by asking the page to instrument itself (module vars aren't on window,
// but THREE scene is reachable via the canvas' __three? no — instead count via the loaders' logs +
// force a player pick and read its console confirmation)
const beforePick = all.length;
await page.evaluate(()=>{ try{ window.setPlayerCharacter && window.setPlayerCharacter('SHADDAI'); }catch(e){ console.log('PICK-ERR '+e.message); } });
await new Promise(r=>setTimeout(r, 4000));
await page.evaluate(()=>{ try{ window.setPlayerCharacter && window.setPlayerCharacter('ZEROX'); }catch(e){ console.log('PICK-ERR '+e.message); } });
await new Promise(r=>setTimeout(r, 4000));

// Probe: is WebGL actually up? how many meshes did three build? (reach scene via renderer.info)
const info = await page.evaluate(()=>{
  const out = { hasCanvas:!!document.querySelector('canvas'), webgl:false, threeGlobal:typeof window.THREE };
  try { const c=document.querySelector('canvas'); const gl=c && (c.getContext('webgl2')||c.getContext('webgl')); out.webgl=!!gl; } catch(e){ out.webglErr=e.message; }
  return out;
});

await browser.close();
const bodyLogs = all.filter(l=>/rig clips|now playing|main character|player model|agent body/i.test(l));
console.log('\n── body/player logs ──\n' + (bodyLogs.join('\n')||'(NONE)'));
console.log('\n── logs after pick ──\n' + (all.slice(beforePick).join('\n')||'(none)'));
console.log('\n── env probe ──\n' + JSON.stringify(info,null,2));
console.log('\n── errors ──\n' + (errs.join('\n')||'(none)'));
console.log('\n── warn/err console lines ──\n' + (all.filter(l=>/warn|error|fail|❌|✗|blocked|undefined|null/i.test(l)).join('\n')||'(none)'));
