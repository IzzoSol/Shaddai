/* ══════════════════════════════════════════════════════════════════════════
   telegram-news.js — scheduled MARKET PULSE broadcaster.
   Every N minutes (dashboard-configurable) posts a free market brief to the
   channel + every chat the bot is in: total mcap, BTC/ETH, dominance, trending.
   Uses the FREE CoinGecko API (no key). Fail-safe: skips if TG unconfigured.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const core = require('./telegram-core');

const CG = 'https://api.coingecko.com/api/v3';
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _usd(n) { const v = Number(n) || 0; if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; return '$' + v.toLocaleString(); }
function _pct(n) { const v = Number(n); if (!isFinite(v)) return ''; return (v >= 0 ? '🟢 +' : '🔴 ') + v.toFixed(1) + '%'; }

async function marketPulse() {
  try {
    const [gR, pR, tR] = await Promise.all([
      fetch(`${CG}/global`).then(r => r.json()).catch(() => null),
      fetch(`${CG}/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true`).then(r => r.json()).catch(() => null),
      fetch(`${CG}/search/trending`).then(r => r.json()).catch(() => null),
    ]);
    const g = gR && gR.data;
    const mcap = g && g.total_market_cap && g.total_market_cap.usd;
    const mcapChg = g && g.market_cap_change_percentage_24h_usd;
    const btcDom = g && g.market_cap_percentage && g.market_cap_percentage.btc;
    const line = (id, label) => (pR && pR[id]) ? `${label}: <b>$${Number(pR[id].usd).toLocaleString()}</b>  ${_pct(pR[id].usd_24h_change)}` : '';
    const trend = (tR && tR.coins || []).slice(0, 5).map(c => `${_esc(c.item.name)} ($${_esc(c.item.symbol)})`).join(' · ');
    return (
      `📊 <b>SHADDAI MARKET PULSE</b>\n\n` +
      (mcap ? `🌐 Total mcap: <b>${_usd(mcap)}</b>  ${_pct(mcapChg)}\n` : '') +
      (btcDom ? `👑 BTC dominance: <b>${btcDom.toFixed(1)}%</b>\n` : '') +
      `\n${line('bitcoin', '₿ BTC')}\n${line('ethereum', 'Ξ ETH')}\n${line('solana', '◎ SOL')}\n` +
      (trend ? `\n🔥 Trending: ${trend}\n` : '') +
      `\n<i>Not financial advice. DYOR.</i>`
    );
  } catch (e) { return null; }
}

// ── FREE RSS NEWS HEADLINES (no key) ────────────────────────────────────────
const RSS_FEEDS = (process.env.TG_NEWS_RSS ||
  'https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss/,https://decrypt.co/feed'
).split(',').map(s => s.trim()).filter(Boolean);
const _seenNews = new Set();
let _newsSeeded = false;
function _rssItems(xml) {
  const out = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < 12) {
    const blk = m[0];
    const t = (blk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1];
    const l = (blk.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1];
    if (t && l) out.push({ title: t.trim(), link: l.trim() });
  }
  return out;
}
async function _pollHeadlines() {
  if (!core.token() || core.getConfig().headlines === false) return;
  let posted = 0;
  for (const feed of RSS_FEEDS) {
    if (posted >= 2) break;
    let xml;
    try { const r = await fetch(feed, { headers: { 'user-agent': 'Mozilla/5.0 (SHADDAI)' } }); if (!r.ok) continue; xml = await r.text(); } catch (e) { continue; }
    const items = _rssItems(xml).slice(0, 4);
    for (const it of items) {
      if (posted >= 2) break;
      if (_seenNews.has(it.link)) continue;
      _seenNews.add(it.link);
      if (_newsSeeded) {
        const html = '📰 <b>' + _esc(it.title) + '</b>\n<a href="' + _esc(it.link) + '">Read →</a>';
        if (await core.broadcast(html)) posted++;
      }
      if (_seenNews.size > 3000) { const f = _seenNews.values().next().value; _seenNews.delete(f); }
    }
  }
  _newsSeeded = true;   // first poll only seeds — then post only NEW headlines
}

// ── SHADDAI PROJECT PROMO (timely brand signal) ─────────────────────────────
function projectPromo() {
  const web = process.env.SHADDAI_WEBSITE || 'https://shaddai-g81x.onrender.com';
  const gh = process.env.SHADDAI_GITHUB || 'https://github.com/IzzoSol';
  const x = process.env.SHADDAI_X || 'https://x.com/IzzoSol';
  const lounge = process.env.SHADDAI_LOUNGE || '';
  return (
    '⬡ <b>SHADDAI — Sovereign AI Agents</b>\n\n' +
    'Forge AI agents that live, work &amp; <b>earn</b> across a dashboard, a 2D pixel world and a 3D world. Intelligence you <b>own</b>, not rent — 200+ real tools on your own free keys, on open rails (Solana · x402).\n\n' +
    '🤖 The council: SHADDAI · ZEROX · ORACLE · NEXUS · TURTLE · QUILL · PIKADON\n' +
    '🌿 <b>Emerald Vine</b> — our open community lounge\n' +
    '⭐ <b>Star the GitHub to enter giveaways</b>\n\n' +
    '🌐 ' + _esc(web) + '\n' +
    '𝕏 ' + _esc(x) + '  (@IzzoSol)\n' +
    '⭐ ' + _esc(gh) + '\n' +
    (lounge ? '🌿 ' + _esc(lounge) + '\n' : '') +
    '\n<i>Build your empire. This bot &amp; premium signals are part of it.</i>'
  );
}

let _timer = null, _newsTimer = null, _promoTimer = null;
function startNewsPoster() {
  if (!core.token()) { return; }
  if (_timer) return;
  const tick = async () => {
    const cfg = core.getConfig();
    if (!cfg.news) return;                       // toggled off from dashboard
    const html = await marketPulse();
    if (html) await core.broadcast(html);
  };
  // re-evaluate the interval every minute so dashboard changes take effect without a restart
  let last = 0;
  _timer = setInterval(async () => {
    const cfg = core.getConfig();
    const everyMs = Math.max(15, cfg.newsIntervalMin || 60) * 60000;
    if (Date.now() - last >= everyMs) { last = Date.now(); tick().catch(() => {}); }
  }, 60000);
  if (_timer.unref) _timer.unref();
  // RSS headlines — seed first, then post only NEW headlines on its own cadence
  setTimeout(() => { _pollHeadlines().catch(() => {}); }, 6000);
  let lastN = 0;
  _newsTimer = setInterval(async () => {
    const cfg = core.getConfig();
    const everyMs = Math.max(15, cfg.headlinesIntervalMin || 45) * 60000;
    if (Date.now() - lastN >= everyMs) { lastN = Date.now(); _pollHeadlines().catch(() => {}); }
  }, 60000);
  if (_newsTimer.unref) _newsTimer.unref();
  // SHADDAI project promo — periodic brand/GitHub-star/socials broadcast
  let lastP = Date.now();   // wait a full interval before the first promo (no spam on restart)
  _promoTimer = setInterval(async () => {
    const cfg = core.getConfig();
    if (cfg.promo === false) return;
    const everyMs = Math.max(30, cfg.promoIntervalMin || 240) * 60000;
    if (Date.now() - lastP >= everyMs) { lastP = Date.now(); core.broadcast(projectPromo()).catch(() => {}); }
  }, 60000);
  if (_promoTimer.unref) _promoTimer.unref();
  console.log('[tg-news] market-pulse + RSS headlines + project promo armed.');
}

module.exports = { startNewsPoster, marketPulse, projectPromo, _pollHeadlines };
