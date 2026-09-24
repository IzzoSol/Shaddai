// node tools/probe-skate-offline.cjs -> the local S.K.A.T.E. fallback in public/games/skate.html plays full,
// legal matches with the same response shapes the Hall server returns (runs the page's own code in a sandbox)
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../public/games/skate.html', 'utf8');
const a = src.indexOf('let offline = false, local = null;'), b = src.indexOf("throw new Error('Filming the trick", a);
const code = src.slice(a, src.indexOf('}', b) + 1) + '\n;globalThis.localApi = localApi;';
const ctx = { seatId: 'local-you', Math, Date, String, Error, globalThis: null }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(code, ctx);
(async () => {
  const tally = { win: 0, lose: 0, push: 0 }; let bad = 0;
  for (let m = 0; m < 300; m++) {
    const t = await ctx.localApi('/api/casino/tables', { body: {} });
    if (!t.matchId || t.legal.length !== 3 || t.state.round !== 0) bad++;
    let res, rounds = 0;
    do { const pick = t.legal[(Math.random() * 3) | 0].id; res = await ctx.localApi(`/api/casino/tables/${t.matchId}/move`, { body: { move: pick } }); rounds++;
      if (res.settlement.events.length !== 2) bad++;
    } while (res.settlement.score === null && rounds < 20);
    const L = res.state.letters, y = L['local-you'].length, h = L['local-house'].length;
    if (rounds > 9 || y > 5 || h > 5 || !res.settlement.score) bad++;
    if (res.settlement.score === 'win' && !(h === 5 || y < h)) bad++;
    tally[res.settlement.score]++;
  }
  let lensErr = ''; try { await ctx.localApi('/api/casino/tables/x/lens', { body: {} }); } catch (e) { lensErr = e.message; }
  console.log(JSON.stringify({ matches: 300, tally, bad, lensFriendly: /SHADDAI server/.test(lensErr) }));
  console.log(bad === 0 && tally.win > 50 && tally.lose > 50 ? 'PASS' : 'FAIL'); process.exit(bad ? 1 : 0);
})();
