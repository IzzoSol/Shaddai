'use strict';

// scripts/scan-missed.js — the missed-calls scanner (ZEROX audit rec #1).
//
// Finds tokens that RAN in our entry band that we did NOT call, and diagnoses
// WHY — the feedback loop that tunes every gate decision:
//   1. WHAT RAN: GeckoTerminal trending + new pools, FDV $20k-$80k, up >=2x
//      on 24h AND still standing (a runner that already round-tripped reads
//      ~0% h24 now — the filter inherently favors durable runners; those are
//      the real misses, the round-trippers were CORRECT rejections).
//   2. DID WE CALL IT: live record (tg-calls.json) + permanent rejects
//      (tg-bad-mints.json) + rolling reject log.
//   3. WHY NOT: approximate TODAY'S gates (rugcheck summary + dexscreener
//      socials) -> "would pass now" (real miss: discovery gap or bad-mint
//      over-persistence) vs "gate X would still block it" (correct call).
//
// Findings append to data/missed-calls.jsonl for trend tracking.
//   node scripts/scan-missed.js [--quiet]

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const QUIET = process.argv.includes('--quiet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

async function getJson(url, gapMs) {
  if (gapMs) await sleep(gapMs);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'shaddai-scan/1.0' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// ── what we already know ────────────────────────────────────────────────────
const record = (() => { try { return new Set(JSON.parse(fs.readFileSync(path.join(DATA, 'tg-calls.json'), 'utf8')).calls.map((c) => c.mint)); } catch (e) { return new Set(); } })();
const badMints = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(DATA, 'tg-bad-mints.json'), 'utf8')); const arr = Array.isArray(j) ? j : (j.mints || j.bad || Object.values(j)); return new Set(arr.map((x) => (typeof x === 'string' ? x : x.mint))); } catch (e) { return new Set(); } })();

(async () => {
  // 1 ─ fetch discovery kinds from gecko (respect the 30/min budget; ~3 calls
  // per scan at a 6h cadence is free). Trending page 2 is included so the
  // scanner can catch FEED GAPS — production's gecko feeds read page 1 only.
  const pools = [];
  for (const kind of ['trending_pools', 'trending_pools&page=2', 'new_pools']) {
    const j = await getJson(`https://api.geckoterminal.com/api/v2/networks/solana/${kind}?include=base_token`, kind.includes('page') ? 2500 : 0);
    for (const p of (j && j.data) || []) {
      const a = (p && p.attributes) || {};
      const rel = p && p.relationships && p.relationships.base_token && p.relationships.base_token.data;
      const mint = rel && rel.id && rel.id.startsWith('solana_') ? rel.id.slice(7) : null;
      const fdv = num(a.fdv_usd);
      const chg = a.price_change_percentage && num(a.price_change_percentage.h24);
      if (!mint || !fdv || chg == null) continue;
      // RAN: >=2x on 24h, still standing, inside the entry band
      if (chg < 100) continue;
      if (fdv < 20000 || fdv > 80000) continue;
      pools.push({ mint, kind: kind.split('&')[0], fdv, chg, name: a.name || '' });
    }
  }
  const candidates = pools.filter((p, i, arr) => arr.findIndex((q) => q.mint === p.mint) === i);
  const log = (...a) => { if (!QUIET) console.log(...a); };
  log(`runners in band (>=2x h24, $20-80k, standing): ${candidates.length}`);

  const findings = [];
  for (const c of candidates) {
    if (record.has(c.mint)) { log(`  ✓ CALLED  ${c.name} (${c.chg.toFixed(0)}% now)`); continue; }
    const reason = { called: false, badMint: badMints.has(c.mint), wouldPass: null, blockers: [] };

    // approximate today's gates with fresh data
    const rc = await getJson('https://api.rugcheck.xyz/v1/tokens/' + c.mint + '/report/summary', 1600);
    let lp = null, holders = null, score = null;
    if (rc) {
      score = num(rc.score_normalised);
      const m = (rc.markets || [])[0];
      lp = m && m.lp ? num(m.lp.lpLockedPct != null ? m.lp.lpLockedPct : m.lp.lpLocked) : null;
      holders = num(rc.totalHolders);
    }
    const ds = await getJson('https://api.dexscreener.com/latest/dex/tokens/' + c.mint, 1300);
    let social = 0, liq = null;
    if (ds) {
      const p = (ds.pairs || []).sort((x, y) => (y.liquidity && y.liquidity.usd || 0) - (x.liquidity && x.liquidity.usd || 0))[0];
      if (p) {
        liq = num(p.liquidity && p.liquidity.usd);
        const sites = (p.info && p.info.websites) || [];
        const socs = (p.info && p.info.socials) || [];
        if (sites.some((w) => w && w.url)) social += 2;
        for (const s of socs) {
          const t = String((s && s.type) || '').toLowerCase();
          if (t === 'twitter' || t === 'x') social += 2;
          else if (t === 'telegram') social += 1;
          else if (t === 'discord') social += 1;
        }
      }
    }

    // gate approximations (production thresholds, summary-data versions)
    if (score != null && score > 40) reason.blockers.push('rug ' + score);
    if (lp != null && lp < 80) reason.blockers.push('lp ' + lp + '%');
    if (holders != null && holders < 120) reason.blockers.push('holders ' + holders);
    if (social < 3) reason.blockers.push('social ' + social);
    if (liq != null && liq < 15000) reason.blockers.push('liq $' + Math.round(liq));
    reason.wouldPass = reason.blockers.length === 0;
    reason.rugcheckDown = rc == null;

    const tag = reason.badMint ? 'BAD-MINT-LOCKED'
      : reason.wouldPass ? (reason.rugcheckDown ? 'WOULD-PASS?' : 'REAL MISS')
      : 'correctly-blocked';
    log(`  ${tag.padEnd(18)} ${c.name}  +${c.chg.toFixed(0)}%  fdv $${Math.round(c.fdv / 1000)}k  ${reason.blockers.join(' · ') || '(all gates pass today)'}`);
    findings.push({ at: Date.now(), mint: c.mint, name: c.name, fdv: c.fdv, chg24: c.chg, source: c.kind, ...reason });
  }

  if (findings.length) {
    fs.appendFileSync(path.join(DATA, 'missed-calls.jsonl'), findings.map((f) => JSON.stringify(f)).join('\n') + '\n');
  }
  const realMisses = findings.filter((f) => !f.badMint && f.wouldPass).length;
  const realMissesMaybe = findings.filter((f) => !f.badMint && f.wouldPass && f.rugcheckDown).length;
  log(`\nsummary: ${candidates.length} runners in band · ${realMisses} real misses (would pass today's gates) · ${findings.filter((f) => f.badMint).length} bad-mint-locked · ${findings.filter((f) => !f.wouldPass && !f.badMint).length} correctly blocked · ${realMissesMaybe} unverifiable (rugcheck down)`);
})().catch((e) => { console.error('scan error:', e && e.message); process.exit(1); });
