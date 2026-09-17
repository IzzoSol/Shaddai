/* scheduler.js – registers and runs periodic jobs via SHADDAI's Scheduler
   Supported job types (as defined in SHADDAI API):
     - zerox.watch          : monitor a symbol/token price threshold
     - hall.announce        : broadcast a message to the Hall
     - collect_rent         : collect passive income from owned plots
     - oracle.weekly        : run weekly analytics/report
     - pikadon.recheck      : re‑check security flags on active jobs
     - sub_agent_work       : continue work on delegated tasks
   This file demonstrates how to register a few core jobs that keep the
   world ticking (daily reset, weekly analytics, and a simple market‑watch).
*/

const express = require('express');
const router = express.Router();

// Helper to safely call the bridge scheduler
function schedule(job) {
  if (typeof shaddai_sched_add === 'function') {
    try {
      shaddai_sched_add(job.type, job.payload, job.everyMs, job.at);
    } catch (e) {
      console.error('[scheduler] bridge add failed:', e);
    }
  }
}

// Job: daily reset of all repeatable quests at 03:00 server time
function registerDailyReset() {
  const payload = {
    // “hall.announce” can be used as a generic timer trigger; we’ll
    // repurpose it to call a custom script via the scheduler.
    // The actual reset logic lives in a small Node script we’ll run
    // via a system command (cron‑like) – here we just signal the system.
    message: 'reset_quests_daily'
  };
  // Using hall.announce with a special topic is a convenient way to
  // fire at a scheduled time without needing an at‑timestamp.
  schedule({
    type: 'hall.announce',
    payload: payload,
    everyMs: 60_000,          // check every minute (simpler for demo)
    // In a production setting you’d use `at` with an ISO timestamp
    // e.g. at: '2024-09-17T03:00:00.000Z'
  });
}

// Job: weekly market analytics (every Monday 04:00 UTC)
function registerWeeklyAnalytics() {
  const payload = {
    // Use zerox.watch to monitor market pairs and then trigger analytics
    // This is just a placeholder; real analytics would be in a separate
    // script that reads market data and writes to reports.
    command: 'run_market_analytics'
  };
  schedule({
    type: 'zerox.watch',
    payload: payload,
    everyMs: 60_000,
    at: '2024-09-18T04:00:00.000Z'   // next Monday
  });
}

// Job: security re‑check of active market jobs (every 12 h)
function registerMarketSecurityCheck() {
  schedule({
    type: 'pikadon.recheck',
    payload: { venue: 'acp', check: 'all' },
    everyMs: 12 * 60 * 60 * 1000   // 12 hours
  });
}

// Auto‑register jobs when the module loads
registerDailyReset();
registerWeeklyAnalytics();
registerMarketSecurityCheck();

// Export router (optional – can be mounted via MCP if desired)
module.exports = router;