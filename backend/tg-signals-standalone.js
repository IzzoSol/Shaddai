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
} catch (e) {
  console.error('[tg-signals-launcher] FAILED:', e && e.stack || e);
  process.exit(1);
}
setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));