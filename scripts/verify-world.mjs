// Headless smoke test: load world, capture console + errors, confirm rigged clips,
// then fire mousedown / R / Q to prove the combat handlers don't throw.
import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/SHADDAI-WORLD-3D.html';
const logs = [], errors = [], rigClips = [];
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); logs.push(t); if (/rig clips|now playing|main character/i.test(t)) rigClips.push(t); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => { const u = r.url(); if (/\.glb|assets\/agents/.test(u)) errors.push('reqfail: ' + u); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => errors.push('goto: ' + e.message));
await new Promise(r => setTimeout(r, 13000));   // let deferred bodies stream + parse

// fire the combat inputs that previously threw (mousedown + R + Q)
const beforeErr = errors.length;
await page.evaluate(() => {
  window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
});
await new Promise(r => setTimeout(r, 1500));

const probe = await page.evaluate(async () => {
  const out = {}; for (const c of ['ZEROX','ORACLE','TURTLE','PIKADON','VILLAIN']) {
    const r = await fetch('/assets/agents/' + c + '.glb?v=8'); out[c] = r.ok ? 'ok' : ('HTTP ' + r.status);
  }
  out['VILLAIN-action.png'] = (await fetch('/assets/agents/VILLAIN-action.png')).ok ? 'ok' : 'MISS';
  return out;
});

await browser.close();
console.log('\n── rig/clip lines ──\n' + (rigClips.join('\n') || '(none)'));
console.log('\n── asset reachability ──\n' + JSON.stringify(probe, null, 2));
console.log('\n── combat-input errors (after dispatch) ──\n' + (errors.slice(beforeErr).join('\n') || '(none — handlers OK)'));
console.log('\n── all errors ──\n' + (errors.join('\n') || '(none)'));
process.exit(errors.length ? 1 : 0);
