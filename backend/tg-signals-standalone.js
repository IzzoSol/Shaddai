// Standalone launcher for the SHADDAI Telegram signals worker.
// telegram-signals.js has no require.main guard; the server normally calls
// startTelegramSignals(). This launcher does exactly that and keeps the
// process alive so the setInterval timers keep firing.
process.chdir(__dirname);
require('dotenv').config();
try {
  const sig = require('./telegram-signals');
  const core = require('./telegram-core');
  const pnl = require('./telegram-pnl');
  const bot = require('./telegram-bot');
  const news = require('./telegram-news');

  const bootLanes = (phase) => {
    // All lane starters are idempotent (internal _timer guards), so calling
    // them again after a failed lock acquisition is a safe RETRY — the
    // 2026-10-12 restart race: the old server's lock heartbeat was still
    // fresh when this process booted, every lane stood down, and NOTHING
    // ever retried → a silent dead broadcaster ("no signals").
    const owner = core.acquireBroadcastLock();
    if (sig.startTelegramSignals) sig.startTelegramSignals();
    if (pnl.startTracker) pnl.startTracker();
    // Surge watcher REMOVED (owner 2026-10-24): "stop the surge calls" — the
    // cards cluttered the channel. startSurgeWatcher is also hard-off unless
    // TG_SURGE=1, so no entry point can silently restart it.
    if (bot.startTelegramBot) bot.startTelegramBot();
    if (news.startNewsPoster) news.startNewsPoster();
    console.log('[tg-launcher] lanes boot (' + phase + ') — broadcast lock ' + (owner ? 'ACQUIRED' : 'HELD ELSEWHERE (will retry at +100s)'));
  };

  bootLanes('initial');

  // Lock-failure retry: the broadcast lock is a 90s heartbeat. If another
  // process's stale heartbeat blocked us at boot, it is definitely dead by
  // +100s — boot once more and this process takes over.
  setTimeout(() => { try { bootLanes('retry+100s'); } catch (e) { console.error('[tg-launcher] retry failed:', e && e.message); } }, 100 * 1000);

  // Missed-calls scanner every 6h — the gate-tuning feedback loop (ZEROX
  // audit rec #1). Finds in-band runners we did not call and diagnoses which
  // gate blocked them (or the feed gap). Appends to data/missed-calls.jsonl.
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    const runScan = () => {
      try {
        console.log('[tg-launcher] missed-calls scan starting');
        spawn(process.execPath, [path.join(__dirname, 'scripts', 'scan-missed.js'), '--quiet'], { cwd: __dirname, stdio: 'ignore', detached: true }).unref();
      } catch (e) {}
    };
    setTimeout(runScan, 5 * 60 * 1000);        // first scan 5 min after boot
    const scanTimer = setInterval(runScan, 6 * 3600 * 1000);
    if (scanTimer.unref) scanTimer.unref();
  } catch (e) {}
} catch (e) {
  console.error('[tg-signals-launcher] FAILED:', e && e.stack || e);
  process.exit(1);
}
setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
