#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   uptimerobot-monitor.js — keeps the Render free-tier service awake 24/7.

   Render's free plan spins the instance DOWN after ~15 min with no traffic,
   which stops the signal pollers (DexScreener / pump.fun / Gecko / Helius)
   and makes live test pages feel dead. Uptime Robot pings the health URL
   every 5 minutes, so the instance never goes idle and the signals keep
   flowing for people to test.

   Usage:
     set UPTIME_ROBOT_API_KEY   (v2 ACCOUNT key — get it at
                                 uptimerobot.com → My Settings → API Settings)
     npm run uptime            (or: node scripts/uptimerobot-monitor.js)

   Optional env:
     MONITOR_NAME   default "SHADDAI-CLOUD"
     MONITOR_URL    default "https://shaddai-g81x.onrender.com/api/model/health"
     MONITOR_KEYWORD default "\"ok\":true"   (body must contain this; blank = HTTP 200 only)

   Docs: https://uptimerobot.com/api/
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const KEY = process.env.UPTIME_ROBOT_API_KEY || '';
const NAME = process.env.MONITOR_NAME || 'SHADDAI-CLOUD';
const URL = process.env.MONITOR_URL || 'https://shaddai-g81x.onrender.com/api/model/health';
const KEYWORD = Object.prototype.hasOwnProperty.call(process.env, 'MONITOR_KEYWORD')
  ? process.env.MONITOR_KEYWORD : '\\"ok\\":true';

function api(method, params) {
  return new Promise((resolve, reject) => {
    const p = Object.assign({ api_key: KEY, format: 'json' }, params || {});
    const body = new URLSearchParams(p).toString();
    const req = require('https').request('https://api.uptimerobot.com/v2/' + method, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d || e.message)); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  if (!KEY) {
    console.error('[uptime] missing UPTIME_ROBOT_API_KEY (v2 account key).');
    process.exit(1);
  }

  // Look for an existing monitor on this URL so re-runs are idempotent.
  let existing = null;
  try {
    const list = await api('getMonitors', { limit: 50, offset: 0 });
    if (list && list.stat === 'ok') {
      const m = (list.monitors || []).find(x => (x.url || '').replace(/\/$/, '') === URL.replace(/\/$/, ''));
      if (m) existing = m;
    } else if (list && list.stat === 'fail') {
      console.error('[uptime] getMonitors failed:', (list.error && list.error.message) || JSON.stringify(list.error));
      process.exit(1);
    }
  } catch (e) { console.error('[uptime] getMonitors error:', e.message); }

  if (existing) {
    console.log('[uptime] monitor already exists — id', existing.id, '·', existing.friendly_name, '·', existing.url);
    console.log('[uptime] status:', existing.status === 2 ? 'UP' : 'NOT UP (check monitor in dashboard)');
    return;
  }

  const payload = {
    friendly_name: NAME,
    type: 1,             // HTTP(s)
    url: URL,
    interval: 5,         // minutes — beats Render's ~15 min idle window
  };
  if (KEYWORD) { payload.keyword_type = 1; payload.keyword_value = KEYWORD; }  // contains

  const created = await api('newMonitor', payload);
  if (created.stat === 'ok') {
    const id = created.monitor && created.monitor.id;
    console.log('[uptime] monitor created ✓ id', id, '·', NAME, '·', URL, '· interval 5m');
    console.log('[uptime] health URL will be pinged every 5 min → Render never sleeps → signals run 24/7');
  } else {
    console.error('[uptime] newMonitor failed:', (created.error && created.error.message) || JSON.stringify(created.error));
    process.exit(1);
  }
})().catch((e) => { console.error('[uptime] fatal:', e.message); process.exit(1); });
