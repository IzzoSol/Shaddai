#!/usr/bin/env node
/* analyze-pf-winners.js
   Fetches pump.fun graduated tokens using their advanced API (which includes
   allTimeHighMarketCap at graduation data), calculates peak multiple from
   the ~$69K graduation baseline, then compares tokenomics of 5x/10x/100x
   winners vs losers to identify what separates good calls from rugs.

   Run:  node backend/scripts/analyze-pf-winners.js
*/
'use strict';

const PF_GRADUATED = 'https://advanced-api-v2.pump.fun/coins/graduated?limit=50';
const DS_TOKEN     = (a) => `https://api.dexscreener.com/latest/dex/tokens/${a}`;
const PF_HEADERS   = { accept: 'application/json', origin: 'https://pump.fun', 'user-agent': 'Mozilla/5.0 (SHADDAI-research)' };
const GRAD_MC_USD  = 69000;   // pump.fun graduation threshold
const BATCH_PAGES  = 8;       // 8 × 50 = 400 tokens — enough for solid patterns
const DS_ENRICHED  = 80;      // enrich top N with DexScreener for live price

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function avg(arr, key) {
  const vals = arr.map(r => Number(r[key]) || 0).filter(v => v > 0);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}
function pct(num, denom) { return denom ? ((num / denom) * 100).toFixed(1) + '%' : '-'; }

async function fetchGraduates() {
  const all = [];
  console.log(`Fetching ${BATCH_PAGES} pages of pump.fun graduates...`);
  for (let page = 0; page < BATCH_PAGES; page++) {
    try {
      const url = page === 0
        ? PF_GRADUATED
        : PF_GRADUATED + `&offset=${page * 50}`;
      const r = await fetch(url, { headers: PF_HEADERS });
      if (!r.ok) { console.warn(`  page ${page} HTTP ${r.status} — stopping`); break; }
      const j = await r.json();
      const arr = Array.isArray(j) ? j : ((j && (j.data || j.coins)) || []);
      if (!arr.length) { console.log(`  page ${page} empty — done`); break; }
      all.push(...arr);
      process.stdout.write(`  page ${page + 1}: +${arr.length} (total ${all.length})\r`);
      await sleep(400);
    } catch (e) { console.warn(`  page ${page} error:`, e.message); break; }
  }
  console.log(`\nFetched ${all.length} graduates total.`);
  return all;
}

async function enrichWithDS(coins) {
  const results = [];
  const toEnrich = coins.slice(0, DS_ENRICHED);
  console.log(`\nEnriching ${toEnrich.length} tokens with DexScreener live price...`);
  let done = 0;
  for (const c of toEnrich) {
    const mint = c.coinMint;
    if (!mint) continue;
    try {
      const r = await fetch(DS_TOKEN(mint));
      if (r.ok) {
        const j = await r.json();
        const pairs = (j && j.pairs) || [];
        const best = pairs.sort((a, b) => (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0))[0];
        if (best) {
          c._dsCurrentMC = Number(best.fdv || best.marketCap) || 0;
          c._dsLiq       = Number(best.liquidity && best.liquidity.usd) || 0;
          c._dsVol24h    = Number(best.volume && best.volume.h24) || 0;
          c._dsVenue     = best.dexId || '';
        }
      }
    } catch (e) {}
    done++;
    if (done % 10 === 0) process.stdout.write(`  ${done}/${toEnrich.length} enriched\r`);
    await sleep(250);
  }
  console.log(`\nEnrichment done.`);
  return coins;
}

function buildRecord(c) {
  const athMC     = Number(c.allTimeHighMarketCap || c.pumpAth) || 0;
  const entryMC   = GRAD_MC_USD;
  const peakMult  = athMC > 0 ? Math.round((athMC / entryMC) * 10) / 10 : 0;
  const liveMC    = c._dsCurrentMC || 0;
  const liveMult  = liveMC > 0 ? Math.round((liveMC / entryMC) * 10) / 10 : 0;
  return {
    symbol:    c.ticker    || '',
    name:      c.name      || '',
    mint:      c.coinMint  || '',
    holders:   Number(c.numHolders || c.holders) || 0,
    snipers:   Number(c.sniperCount || c.snipers) || 0,
    devPct:    Number(c.devHoldingsPercentage || c.devPct) || 0,
    athMC,
    liveMC,
    peakMult,
    liveMult,
    venue:     c._dsVenue || '',
    liq:       c._dsLiq || 0,
    vol24h:    c._dsVol24h || 0,
  };
}

function printBucket(label, items) {
  if (!items.length) { console.log(`  ${label}: none`); return; }
  const s = (k, d) => avg(items, k).toFixed(d === undefined ? 0 : d);
  const topSym = items.slice(0, 5).map(r => r.symbol || '?').join(', ');
  console.log(`\n  ── ${label} (${items.length} tokens) ──`);
  console.log(`     Avg peakMult : ${s('peakMult', 1)}x`);
  console.log(`     Avg holders  : ${s('holders')}`);
  console.log(`     Avg dev%     : ${s('devPct', 1)}%`);
  console.log(`     Avg snipers  : ${s('snipers', 1)}`);
  console.log(`     Avg liq      : $${Math.round(avg(items, 'liq')).toLocaleString()}`);
  console.log(`     Avg vol24h   : $${Math.round(avg(items, 'vol24h')).toLocaleString()}`);
  console.log(`     Dev%=0 rate  : ${pct(items.filter(r => r.devPct === 0).length, items.length)}`);
  console.log(`     Sniper=0 rate: ${pct(items.filter(r => r.snipers === 0).length, items.length)}`);
  const venues = {};
  items.forEach(r => { if (r.venue) venues[r.venue] = (venues[r.venue] || 0) + 1; });
  const topVenue = Object.entries(venues).sort((a,b) => b[1]-a[1]).slice(0,3).map(([v,c]) => `${v}(${c})`).join(', ');
  if (topVenue) console.log(`     Top venues   : ${topVenue}`);
  console.log(`     Top symbols  : ${topSym}`);
  if (items.length >= 5) {
    const devBuckets = { '0%': 0, '1-5%': 0, '5-15%': 0, '15-30%': 0, '30%+': 0 };
    items.forEach(r => {
      if (r.devPct === 0)       devBuckets['0%']++;
      else if (r.devPct < 5)    devBuckets['1-5%']++;
      else if (r.devPct < 15)   devBuckets['5-15%']++;
      else if (r.devPct < 30)   devBuckets['15-30%']++;
      else                      devBuckets['30%+']++;
    });
    const holderBuckets = { '<50': 0, '50-100': 0, '100-300': 0, '300-1000': 0, '1000+': 0 };
    items.forEach(r => {
      if (r.holders < 50)         holderBuckets['<50']++;
      else if (r.holders < 100)   holderBuckets['50-100']++;
      else if (r.holders < 300)   holderBuckets['100-300']++;
      else if (r.holders < 1000)  holderBuckets['300-1000']++;
      else                        holderBuckets['1000+']++;
    });
    console.log(`     Dev% breakdown: ${Object.entries(devBuckets).map(([k,v]) => `${k}:${v}`).join('  ')}`);
    console.log(`     Holder dist:    ${Object.entries(holderBuckets).map(([k,v]) => `${k}:${v}`).join('  ')}`);
  }
}

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('   PUMP.FUN GRADUATE WINNER ANALYSIS');
  console.log('   ZEROX · SHADDAI · powered by real data');
  console.log('══════════════════════════════════════════\n');

  const raw = await fetchGraduates();
  if (!raw.length) { console.error('No data — pump.fun API may be down. Try again.'); process.exit(1); }

  const enriched = await enrichWithDS(raw);
  // dedup by mint — pump.fun API returns same token multiple times across pages
  const seenMints = new Set();
  const records  = enriched.map(buildRecord).filter(r => {
    if (!r.mint || seenMints.has(r.mint)) return false;
    seenMints.add(r.mint);
    return true;
  });

  // Only analyze tokens where we have ATH data
  const withData = records.filter(r => r.peakMult > 0);
  const noData   = records.filter(r => r.peakMult === 0);

  console.log(`\n${'═'.repeat(44)}`);
  console.log(`DATASET: ${records.length} graduates | ${withData.length} with ATH data | ${noData.length} missing ATH`);

  // Bucket by peak multiple
  const moon   = withData.filter(r => r.peakMult >= 100);     // 100x+
  const tenX   = withData.filter(r => r.peakMult >= 10 && r.peakMult < 100);
  const fiveX  = withData.filter(r => r.peakMult >= 5  && r.peakMult < 10);
  const twoX   = withData.filter(r => r.peakMult >= 2  && r.peakMult < 5);
  const rug    = withData.filter(r => r.peakMult < 2);

  const rates = (n, d) => d > 0 ? `${((n/d)*100).toFixed(1)}%` : '-';
  console.log(`\n📊 PERFORMANCE DISTRIBUTION:`);
  console.log(`  🌙 100x+    : ${moon.length}  (${rates(moon.length, withData.length)} of tokens)`);
  console.log(`  🚀 10x-99x  : ${tenX.length}  (${rates(tenX.length, withData.length)})`);
  console.log(`  🔥 5x-9x   : ${fiveX.length}  (${rates(fiveX.length, withData.length)})`);
  console.log(`  📈 2x-4x   : ${twoX.length}  (${rates(twoX.length, withData.length)})`);
  console.log(`  💀 <2x     : ${rug.length}  (${rates(rug.length, withData.length)})`);

  console.log(`\n${'═'.repeat(44)}`);
  console.log(`TOKENOMICS BREAKDOWN BY PERFORMANCE:`);
  printBucket('🌙 100x+ MOONSHOTS', moon);
  printBucket('🚀 10x-99x STRONG CALLS', tenX);
  printBucket('🔥 5x-9x GOOD CALLS', fiveX);
  printBucket('💀 RUGS/FAILURES (<2x)', rug);

  // Key insight: what % of winners had dev% = 0?
  const winners = [...moon, ...tenX, ...fiveX];
  console.log(`\n${'═'.repeat(44)}`);
  console.log(`KEY INSIGHTS — WINNERS (5x+) vs FAILURES (<2x):`);
  console.log(`  Winners:  ${winners.length} tokens`);
  console.log(`  Failures: ${rug.length} tokens`);

  if (winners.length && rug.length) {
    const wDev0 = pct(winners.filter(r => r.devPct === 0).length, winners.length);
    const rDev0 = pct(rug.filter(r => r.devPct === 0).length, rug.length);
    const wSnip0 = pct(winners.filter(r => r.snipers === 0).length, winners.length);
    const rSnip0 = pct(rug.filter(r => r.snipers === 0).length, rug.length);
    const wHolders = avg(winners, 'holders').toFixed(0);
    const rHolders = avg(rug, 'holders').toFixed(0);
    const wDev = avg(winners, 'devPct').toFixed(1);
    const rDev = avg(rug, 'devPct').toFixed(1);
    const wSnip = avg(winners, 'snipers').toFixed(1);
    const rSnip = avg(rug, 'snipers').toFixed(1);
    console.log(`\n  Metric           Winners(5x+)   Failures(<2x)  Signal`);
    console.log(`  ─────────────────────────────────────────────────────`);
    console.log(`  dev% = 0         ${wDev0.padEnd(15)} ${rDev0.padEnd(15)} ${Number(wDev0) > Number(rDev0) ? '✅ more winners have 0 dev' : '❌'}`);
    console.log(`  avg dev%         ${(wDev+'%').padEnd(15)} ${(rDev+'%').padEnd(15)} ${Number(wDev) < Number(rDev) ? '✅ winners have lower dev' : '❌'}`);
    console.log(`  snipers = 0      ${wSnip0.padEnd(15)} ${rSnip0.padEnd(15)} ${Number(wSnip0) > Number(rSnip0) ? '✅ winners have fewer snipers' : '❌'}`);
    console.log(`  avg snipers      ${wSnip.padEnd(15)} ${rSnip.padEnd(15)} ${Number(wSnip) < Number(rSnip) ? '✅ winners have fewer snipers' : '❌'}`);
    console.log(`  avg holders      ${wHolders.padEnd(15)} ${rHolders.padEnd(15)} ${Number(wHolders) > Number(rHolders) ? '✅ winners have more holders' : '❌'}`);
  }

  // Top 20 by peak mult
  console.log(`\n${'═'.repeat(44)}`);
  console.log(`TOP 20 PERFORMERS FROM THIS DATASET:`);
  console.log(`  sym        peakMult  holders  dev%  snipers`);
  withData.sort((a,b) => b.peakMult - a.peakMult).slice(0, 20).forEach((r, i) => {
    const sym = (r.symbol || '?').slice(0, 10).padEnd(10);
    console.log(`  ${sym} ${String(r.peakMult + 'x').padEnd(9)} ${String(r.holders).padEnd(8)} ${String(r.devPct.toFixed(1) + '%').padEnd(5)} ${r.snipers}`);
  });

  console.log(`\n${'═'.repeat(44)}`);
  console.log(`RECOMMENDED FILTER ADJUSTMENTS (based on data):`);

  // Generate recommendations based on actual data
  const winHolders = avg(winners, 'holders');
  const rugHolders = avg(rug, 'holders');
  const winDev = avg(winners, 'devPct');
  const rugDev = avg(rug, 'devPct');
  const winSnip = avg(winners, 'snipers');

  if (winHolders > rugHolders * 1.2) {
    console.log(`  ✅ minHolders: increase to ~${Math.round(winHolders * 0.7)} (winner avg is ${Math.round(winHolders)})`);
  }
  if (winDev < rugDev * 0.8) {
    console.log(`  ✅ devPct: reject if dev holds > ${Math.round(winDev * 2)}% (winner avg is ${winDev.toFixed(1)}%)`);
  }
  if (winSnip < 1) {
    console.log(`  ✅ snipers: strict 0 snipers on winners — keep maxSnipersPct low`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Analysis complete. Use this to tune tg-config.json.`);
  console.log(`══════════════════════════════════════════\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
