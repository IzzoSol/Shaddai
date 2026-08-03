#!/usr/bin/env node
/* wallet-intelligence.js
   Cross-references creator wallets and insider networks across our top winner
   tokens using RugCheck full report (free, no key required).

   Finds:
   1. Serial deployers — creators who deployed 2+ winners
   2. Insider wallets — wallets RugCheck flagged as insiders across 2+ winners
   3. CreatorToken patterns — what else does each winner's creator deploy?

   Run: node backend/scripts/wallet-intelligence.js
*/
'use strict';

const RC_REPORT  = (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report`;

const WINNER_MINTS = [
  { mint: '4nA3PW6DPmVzNDeKKa3SmfpKeY7LS1yXsRFJm9oEpump', symbol: 'ANMOND',     peak: 48.7 },
  { mint: 'GgJq4UwLvsPrKxLV4xDKm3aJn9pvx7jXAVenKgePpump', symbol: 'JIMOTHY',    peak: 31.6 },
  { mint: '43mjozsTLTViop3seWnmgkcf1DRj6qMf1JWw7X8ypump',  symbol: 'MrSue',      peak: 29.2 },
  { mint: 'DD8rKbR6rydyzKr4LSbZ34whoU39aPmQCnMK41V1pump',  symbol: 'Mmm',        peak: 23.3 },
  { mint: '2jZYuNm65bGmY7T8ChQvdGq6oX9y9y99Z8kA6ozvpump',  symbol: 'Pippinkawa', peak: 21.6 },
  { mint: '59PGW8bfszAmFBmyEfUdm6Jp4X7UdcPM8DiVcvBcpump',  symbol: 'Raccbit',    peak: 21.0 },
  { mint: '8VB5j49CimiSRHXLjUXZupefEwHsVEJUbZc1gp11pump',  symbol: 'RACOIN',     peak: 20.8 },
  { mint: 'HmMNqFyy1rwSrGfASY1ajWktjjKmdtm4tLQn87rQpump',  symbol: 'GLOOB',      peak: 20.0 },
  { mint: 'DoAG1HmKYcnQiHn6DnpRsy6LKvGTkBgv1776YMN8pump',  symbol: 'ACTR',       peak: 19.5 },
  { mint: 'HekL5sMgvpsuypitEc7ThcrAtRCT59zMxqvcH7T4pump',   symbol: 'Blackmothy', peak: 19.5 },
  { mint: 'J4Bd5mXnqy5tzQc8XSpbDV5qJ1s7kV5LJbe6wKvMpump',  symbol: 'RACCHUA',    peak: 19.4 },
  { mint: '9Gsj9bbmekAvDbaTX4EvEJu6opWTn66oFuDcybG3pump',   symbol: 'RACSEM',     peak: 19.3 },
  { mint: '6YtBaPruY4oGLyYEeyW3XRbPSkes8qwr3vH5Wp7Spump',  symbol: 'RACCEM',     peak: 18.5 },
  { mint: 'EPKPcUPmhcDfpRq1LtN46FuysHo49D5Q6W2L2oPmpump',  symbol: 'SUB',        peak: 18.3 },
  { mint: '6Ysh8UFncdyHrafGnNvKmHi96cuD1vQDjqk1iV2zpump',  symbol: 'HOG',        peak: 16.7 },
  { mint: 'rt4yXXHYeQLr7H8YqUb8NCB3gcEuXbEieQ458q6pump',   symbol: 'SUB2',       peak: 15.8 },
  { mint: '7hiJh2852KMUN2SSk5hK1tk97HpefbGYby1TLn24pump',  symbol: 'bull',       peak: 14.2 },
  { mint: 'ChJpVy89fLPUzy2QBmBaAk3KVeR9ncnBYWL4knCxpump',  symbol: 'LEGEND',     peak: 13.1 },
  { mint: 'Nhr8g2MZzNPj3ygswfGas57arhzV2fH4gMV58M3pump',   symbol: 'USOH',       peak: 12.3 },
  { mint: 'C3R693DufymiZzUBxVMhWfRzqDgeFJtq9d6tbaC2pump',  symbol: 'Cupsey',     peak:  7.2 },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchReport(mint) {
  try {
    const r = await fetch(RC_REPORT(mint), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function extractInsiders(report) {
  if (!report) return [];
  const wallets = new Set();
  // insiderNetworks: [{wallets:[{address}]}]
  const nets = report.insiderNetworks || [];
  for (const net of nets) {
    for (const w of (net.wallets || [])) {
      if (w.address) wallets.add(w.address);
    }
  }
  // topHolders flagged as insider
  for (const h of (report.topHolders || [])) {
    if (h.insider && h.owner) wallets.add(h.owner);
  }
  return [...wallets];
}

function extractTopHolders(report, topN = 10) {
  if (!report || !report.topHolders) return [];
  return report.topHolders.slice(0, topN)
    .map(h => h.owner || h.address)
    .filter(Boolean);
}

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('   SHADDAI WALLET INTELLIGENCE v2 — RugCheck Edition');
  console.log('   Analyzes creators + insiders across top-20 winners');
  console.log('══════════════════════════════════════════════════════\n');

  const creatorMap  = new Map();   // creator wallet → [{symbol, peak}]
  const insiderMap  = new Map();   // insider wallet  → [{symbol, peak}]
  const holderMap   = new Map();   // top holder      → [{symbol, peak}]
  const tokenResults = [];

  for (const { mint, symbol, peak } of WINNER_MINTS) {
    process.stdout.write(`  ${symbol.padEnd(12)} (${peak}x) ...`);
    const report = await fetchReport(mint);

    const creator  = report && report.creator ? report.creator : null;
    const insiders = extractInsiders(report);
    const topH     = extractTopHolders(report, 10);
    const creatorTokens = report && report.creatorTokens ? report.creatorTokens.length : 0;
    const graphInsiders = report && report.graphInsidersDetected ? report.graphInsidersDetected : 0;

    if (creator) {
      if (!creatorMap.has(creator)) creatorMap.set(creator, []);
      creatorMap.get(creator).push({ symbol, peak, mint });
    }
    for (const w of insiders) {
      if (!insiderMap.has(w)) insiderMap.set(w, []);
      insiderMap.get(w).push({ symbol, peak });
    }
    for (const w of topH) {
      if (!holderMap.has(w)) holderMap.set(w, []);
      holderMap.get(w).push({ symbol, peak });
    }

    tokenResults.push({ symbol, peak, mint, creator, insiderCount: insiders.length, graphInsiders, creatorTokens, topHolderCount: topH.length });
    console.log(` creator: ${creator ? creator.slice(0,8)+'…' : 'N/A'} | insiders: ${insiders.length} | graph: ${graphInsiders} | creatorOtherTokens: ${creatorTokens}`);
    await sleep(350);  // RugCheck rate limit buffer
  }

  // ── SERIAL DEPLOYERS ────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('1. SERIAL DEPLOYERS (created 2+ of our winners):');
  const serialDev = [...creatorMap.entries()].filter(([, v]) => v.length >= 2).sort((a,b) => b[1].length - a[1].length);
  if (!serialDev.length) {
    console.log('   None found — all winners have unique creators');
  } else {
    serialDev.forEach(([w, tokens]) => {
      console.log(`\n   🚨 ${w}`);
      console.log(`      Deployed ${tokens.length} winners: ${tokens.map(t=>t.symbol+'('+t.peak.toFixed(0)+'x)').join(', ')}`);
    });
  }

  // ── INSIDER WALLETS ──────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('2. REPEAT INSIDER WALLETS (flagged as insider in 2+ winners):');
  const repeatInsiders = [...insiderMap.entries()].filter(([, v]) => v.length >= 2).sort((a,b) => b[1].length - a[1].length);
  if (!repeatInsiders.length) {
    console.log('   None found — no insider wallet appears in 2+ winners');
  } else {
    console.log(`   Found ${repeatInsiders.length} repeat insiders:\n`);
    repeatInsiders.slice(0, 20).forEach(([w, tokens], i) => {
      const total = tokens.reduce((s,t)=>s+t.peak,0);
      console.log(`   ${i+1}. ${w}`);
      console.log(`      Seen in: ${tokens.map(t=>t.symbol+'('+t.peak.toFixed(0)+'x)').join(', ')} | total peak: ${total.toFixed(0)}x`);
    });
  }

  // ── TOP HOLDER OVERLAPS ──────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('3. SMART MONEY (top-10 holder in 2+ winners):');
  const repeatHolders = [...holderMap.entries()].filter(([, v]) => v.length >= 2).sort((a,b) => b[1].length - a[1].length);
  if (!repeatHolders.length) {
    console.log('   None found — no wallet appears as top holder in 2+ winners');
  } else {
    console.log(`   Found ${repeatHolders.length} recurring holders:\n`);
    repeatHolders.slice(0, 20).forEach(([w, tokens], i) => {
      const total = tokens.reduce((s,t)=>s+t.peak,0);
      console.log(`   ${i+1}. ${w}`);
      console.log(`      Top holder of: ${tokens.map(t=>t.symbol+'('+t.peak.toFixed(0)+'x)').join(', ')} | combined peak: ${total.toFixed(0)}x`);
    });
  }

  // ── INSIDER STATS PER TOKEN ──────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('4. INSIDER PROFILE PER WINNER (graph-level detection):');
  console.log('   sym           peak    insiders  graphIns  creatorOtherToks');
  tokenResults.forEach(t => {
    console.log(`   ${t.symbol.padEnd(12)} ${(t.peak.toFixed(1)+'x').padEnd(8)} ${String(t.insiderCount).padEnd(10)} ${String(t.graphInsiders).padEnd(10)} ${t.creatorTokens}`);
  });

  // ── SAVE ────────────────────────────────────────────────────────────────────
  const watchlist = {
    generated: new Date().toISOString(),
    winnersAnalyzed: WINNER_MINTS.length,
    serialDeployers: serialDev.map(([w,v])=>({ wallet:w, count:v.length, tokens:v })),
    repeatInsiders:  repeatInsiders.slice(0,50).map(([w,v])=>({ wallet:w, appearances:v.length, tokens:v })),
    smartMoneyHolders: repeatHolders.slice(0,50).map(([w,v])=>({ wallet:w, appearances:v.length, totalPeak: parseFloat(v.reduce((s,t)=>s+t.peak,0).toFixed(1)), tokens:v })),
    perToken: tokenResults,
  };

  const path = 'backend/data/smart-money-watchlist.json';
  require('fs').writeFileSync(path, JSON.stringify(watchlist, null, 2));
  console.log(`\nSaved → ${path}`);
  console.log(`Serial deployers: ${watchlist.serialDeployers.length} | Repeat insiders: ${watchlist.repeatInsiders.length} | Smart holders: ${watchlist.smartMoneyHolders.length}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
