// Standalone launcher for the ZEROX Virtuals Telegram bot (@ZeroxVirtualsBot).
// Mirrors tg-signals-standalone.js: chdir to the backend, load .env, start,
// keep the process alive so the getUpdates poll loop keeps running.
process.chdir(__dirname);
require('dotenv').config();
try {
  const vb = require('./telegram-virtuals');
  if (typeof vb.startTelegramVirtualsBot === 'function') {
    vb.startTelegramVirtualsBot();
    console.log('[tg-virtuals-launcher] started. Keeping process alive.');
  } else {
    console.log('[tg-virtuals-launcher] ERROR: startTelegramVirtualsBot not exported');
    process.exit(1);
  }
} catch (e) {
  console.error('[tg-virtuals-launcher] FAILED:', e && e.stack || e);
  process.exit(1);
}
setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
