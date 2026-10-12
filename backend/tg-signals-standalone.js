// Standalone launcher for the SHADDAI Telegram signals worker.
// telegram-signals.js has no require.main guard; the server normally calls
// startTelegramSignals(). This launcher does exactly that and keeps the
// process alive so the setInterval timers keep firing.
process.chdir(__dirname);
require('dotenv').config();
try {
  const sig = require('./telegram-signals');
  if (typeof sig.startTelegramSignals === 'function') {
    sig.startTelegramSignals();
    console.log('[tg-signals-launcher] started. Keeping process alive.');
  } else {
    console.log('[tg-signals-launcher] ERROR: startTelegramSignals not exported');
    process.exit(1);
  }
  // PNL tracker: this process holds the broadcast lock, so the re-pricer +
  // milestone wins must live HERE. startTracker() refuses on any process that
  // does not own the lock, so there is exactly one tracker fleet-wide —
  // the 2026-10-12 audit showed nobody was re-pricing (server's copy saw the
  // lock held and stood down; this launcher never started one) and 139
  // recent calls sat flat at 1.00x, poisoning the hit rate to ~8%.
  try { require('./telegram-pnl').startTracker(); console.log('[tg-launcher] pnl tracker started (this instance owns broadcasting)'); } catch (e) { console.error('[tg-launcher] pnl tracker failed:', e && e.message); }
  try { require('./telegram-bot').startTelegramBot(); console.log('[tg-launcher] bot started (commands + DM chats)'); } catch (e) { console.error('[tg-launcher] bot failed:', e && e.message); }
  try { require('./telegram-news').startNewsPoster(); console.log('[tg-launcher] news poster started (pulse/headlines/top25/movers/promo)'); } catch (e) { console.error('[tg-launcher] news failed:', e && e.message); }
} catch (e) {
  console.error('[tg-signals-launcher] FAILED:', e && e.stack || e);
  process.exit(1);
}
setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));