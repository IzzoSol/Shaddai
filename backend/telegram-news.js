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

let _timer = null;
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
  console.log('[tg-news] market-pulse poster armed (interval from dashboard config).');
}

module.exports = { startNewsPoster, marketPulse };
