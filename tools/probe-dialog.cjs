// node tools/probe-dialog.cjs 8790 -> agent NPC dialogs: E opens, agent picks a quest, accept → progress → turn-in pays gold+XP+sparks, trust grows
let pw; try { pw = require('puppeteer'); } catch (e) { pw = null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = process.argv[2] || 8790;
(async () => {
  let b, p;
  if (pw) { b = await pw.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); p = await b.newPage(); }
  else { const { chromium } = require('playwright'); b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); p = await b.newPage(); }
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 130)));
  await p.goto(`http://localhost:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.evaluate(() => { localStorage.clear(); sessionStorage.setItem('shd_guest', '1'); localStorage.setItem('shaddai.region', 'meadow'); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(9000);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { state, region: region && region.id };
    const bot = npcs.find((n) => n.bot);
    if (!bot) return { ...out, noBot: true, n: npcs.length };
    out.agent = bot.name;
    player.col = bot.col + 0.6; player.row = bot.row; bot.speed = 0; bot.tc = bot.col; bot.tr = bot.row;
    out.markBefore = AgentDialog.marker(bot);
    tryDoor(); await w(350);
    out.opened = AgentDialog.isOpen() && state === 'dialog' && !document.getElementById('agentDialog').classList.contains('hide');
    // force a fetch quest so the probe can satisfy it deterministically
    let q; for (let i = 0; i < 40 && (!q || q.kind !== 'fetch'); i++) q = AgentDialog.decide(bot);
    out.decided = q && q.kind + ':' + q.goal + ' score=' + q.score.toFixed(2);
    const btn = (label) => [...document.querySelectorAll('#agentDialog .ch button')].find((x) => x.textContent.includes(label));
    btn('Any work').click(); await w(100);
    out.offerShown = !!btn('Accept');
    const db = AgentDialog._load(); const key = Object.keys(db)[0] || botCfgFor(bot).key;
    btn('Accept').click(); await w(100);
    const act = AgentDialog._load()[botCfgFor(bot).key].active;
    out.accepted = !!act && act.kind;
    out.markActive = AgentDialog.marker(bot);
    // satisfy it
    if (act.kind === 'fetch') inv[act.good] = act.goal; else quest[act.stat] = act.base + act.goal;
    out.markReady = AgentDialog.marker(bot);
    const m0 = money, s0 = ShdSparks.get();
    document.querySelector('#agentDialog .ch button').click(); await w(100);  // Leave
    tryDoor(); await w(300);
    btn('Turn in').click(); await w(100); btn('Turn in').click(); await w(100);
    const rec = AgentDialog._load()[botCfgFor(bot).key];
    out.paid = { gold: money - m0, sparks: ShdSparks.get() - s0, trust: rec.trust, cleared: !rec.active, goodsTaken: act.kind !== 'fetch' || !inv[act.good] };
    // Esc leaves and returns control to the world
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await w(350);
    out.closed = !AgentDialog.isOpen() && state === 'world';
    return out;
  });
  console.log(JSON.stringify(r));
  const ok = r.opened && r.offerShown && r.accepted && r.markBefore === '!' && r.markActive === '…' && r.markReady === '?' && r.paid && r.paid.gold > 0 && r.paid.sparks > 0 && r.paid.trust === 1 && r.paid.cleared && r.paid.goodsTaken && r.closed;
  console.log(ok ? 'PASS' : 'FAIL', '| ERR:', errs.slice(0, 5).join(' | ') || 'none');
  await p.screenshot({ path: process.env.SHOT || 'probe-dialog.png' }).catch(() => {});
  await b.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
