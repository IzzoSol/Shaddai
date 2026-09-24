// node tools/probe-arcade.cjs 8790 -> arcade score bridge: paid entry, iframe-only, once per entry, capped
let pw; try { pw = require('puppeteer'); } catch (e) { pw = null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = process.argv[2] || 8790;
(async () => {
  let b, p;
  if (pw) { b = await pw.launch({ headless: 'new' }); p = await b.newPage(); }
  else { const { chromium } = require('playwright'); b = await chromium.launch(); p = await b.newPage(); }
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 130)));
  await p.goto(`http://localhost:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    localStorage.setItem('shd.sparks3d', '100');
    const out = {};
    // 1. forged message from the top window (not the iframe) must be ignored
    window.postMessage({ shdGame: 'dodgeball', shdScore: 99999, shdWin: true }, location.origin);
    await w(150); out.forgedIgnored = shdSparks.get() === 100;
    // 2. paid entry -> iframe posts -> exactly one capped payout
    playArcade('dodgeball'); out.afterFee = shdSparks.get();              // 90
    const f = document.getElementById('arcadeFrame');
    for (let i = 0; i < 40 && !(f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentWindow.location.pathname.includes('dodgeball')); i++) await w(150);
    const post = (m) => f.contentWindow.eval(`parent.postMessage(${JSON.stringify(m)}, location.origin)`);
    post({ shdGame: 'dodgeball', shdScore: 5200, shdWin: true });
    await w(150); out.afterWin = shdSparks.get();                          // 90 + 26 + 15 = 131
    post({ shdGame: 'dodgeball', shdScore: 5200, shdWin: true });
    await w(150); out.dupeIgnored = shdSparks.get() === out.afterWin;
    // 3. exit contract closes the overlay
    post({ type: 'shaddai-close-panel' });
    await w(150); out.closed = document.getElementById('arcadeOverlay').style.display === 'none' && !window.__arcadeSession;
    out.payTable = ['skate', 'basketball', 'dodgeball', 'sigil'].map((g) => [g, arcadePayout(g, 1e9, true)]);
    return out;
  });
  console.log(JSON.stringify(r));
  const ok = r.forgedIgnored && r.afterFee === 90 && r.afterWin === 131 && r.dupeIgnored && r.closed;
  console.log(ok ? 'PASS' : 'FAIL', '| ERR:', errs.slice(0, 5).join(' | ') || 'none');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
