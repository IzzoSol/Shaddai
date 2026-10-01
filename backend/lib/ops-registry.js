'use strict';
// Ops registry — every background service that costs Render memory/CPU, with an
// on/off toggle. Toggles persist to data/ops-toggles.json and gate services at
// boot; services that expose a stop() also switch off live, the rest apply on
// the next restart (POST /api/ops/restart — Render relaunches the process).
//
// Memory per service is an ESTIMATE: RSS delta measured around each service's
// start(), plus the on-disk size of the data it keeps in memory.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'ops-toggles.json');
const DATA = path.join(__dirname, '..', 'data');

// id → metadata. `env` (DISABLE_<ID>=1) forces a service off regardless of the file.
const SERVICES = {
  'tg-signals':   { label: 'TG signals feed',        desc: 'DexScreener/Gecko/Helius pollers + 4-stage pipeline; posts to @ShaddaiLabs and every chat the bot is in.', data: ['tg-calls.json', 'tg-bad-mints.json', 'source-overlap.json'], liveStop: false },
  'tg-bot':       { label: 'Interactive Telegram bot', desc: 'Long-polls Telegram for commands from users in your chats.', data: [], liveStop: true },
  'tg-news':      { label: 'TG news/market-pulse poster', desc: 'Scheduled headlines, digest, promo and market-pulse posts.', data: [], liveStop: false },
  'tg-pnl':       { label: 'Call PNL tracker',        desc: 'Re-prices every open call and posts milestone wins; powers hit-rate stats.', data: ['tg-calls.json'], liveStop: false },
  'tg-discovery': { label: 'DexScreener discovery',   desc: 'Finds new boosted tokens and feeds them into signals.', data: [], liveStop: false },
  'turtle-music-bot': { label: '@TurtleMusicBot',     desc: 'Dedicated music bot (idle unless TURTLE_MUSIC_BOT_TOKEN is set).', data: [], liveStop: true },
  'aura-warmer':  { label: 'AURA cache warmer',       desc: 'Pre-warms the AURA compression bank on a timer.', data: [], liveStop: false },
  'keep-alive':   { label: 'Keep-alive self-ping',    desc: 'Pings the public URL every 10 min so Render free tier never sleeps (keeps all pollers running 24/7).', data: [], liveStop: true },
  'gamedev-library': { label: 'Game-dev library (TURTLE)', desc: 'Searchable game-dev skills/docs/templates served to TURTLE and MCP users. Loads on first query (~15 MB), frees itself after 10 idle minutes; text stays on disk.', data: [], liveStop: true },
  'mirofish':     { label: 'MiroFish simulator',      desc: 'Separate server on port 5001 — NOT running on Render, costs 0 here.', data: [], liveStop: true, external: true },
};

let toggles = null;
const hooks = {}; // id → fn(on) for services that react live (lazy loaders)
function hook(id, fn) { hooks[id] = fn; }
const state = {}; // id → { running, bootCostMB, stopFn, lastChange }

function load() {
  if (toggles) return toggles;
  try { toggles = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { toggles = {}; }
  return toggles;
}
function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(toggles, null, 2)); } catch (e) { console.warn('[ops] could not persist toggles:', e.message); }
}

function enabled(id) {
  if (process.env['DISABLE_' + id.toUpperCase().replace(/-/g, '_')] === '1') return false;
  const t = load();
  return t[id] !== false; // default on
}

const rssMB = () => +(process.memoryUsage().rss / 1048576).toFixed(1);
const fileMB = (f) => { try { return fs.statSync(path.join(DATA, f)).size / 1048576; } catch (_) { return 0; } };

// Start a service if enabled. `fn` does the start and may return a stop function.
function boot(id, fn) {
  const s = state[id] || (state[id] = { running: false, bootCostMB: 0, stopFn: null, lastChange: null });
  if (!enabled(id)) { console.log(`[ops] ${id} OFF (toggle) — not started`); return false; }
  const before = rssMB();
  try {
    const ret = fn();
    if (typeof ret === 'function') s.stopFn = ret;
    s.running = true;
    s.bootCostMB = Math.max(0, +(rssMB() - before).toFixed(1));
    s.lastChange = new Date().toISOString();
  } catch (e) { console.warn(`[ops] ${id} failed to start:`, e && e.message); }
  return s.running;
}

function list() {
  const t = load();
  return Object.entries(SERVICES).map(([id, m]) => {
    const s = state[id] || {};
    const dataMB = +(m.data.reduce((a, f) => a + fileMB(f), 0)).toFixed(2);
    return {
      id, label: m.label, description: m.desc,
      enabled: enabled(id), running: !!s.running, external: !!m.external,
      forcedOffByEnv: process.env['DISABLE_' + id.toUpperCase().replace(/-/g, '_')] === '1',
      appliesLive: !!m.liveStop, pendingRestart: !m.external && (enabled(id) !== !!s.running) && !!s.lastChange,
      estimatedMB: m.external ? 0 : +(((s.bootCostMB || 0)) + dataMB).toFixed(1),
      bootCostMB: s.bootCostMB || 0, dataMB,
      persisted: t[id] === false ? 'off' : 'default-on',
    };
  });
}

// Returns { ok, appliedLive, needsRestart }.
function setEnabled(id, on) {
  if (!SERVICES[id]) return { ok: false, error: 'unknown service' };
  const t = load();
  if (on) delete t[id]; else t[id] = false;
  save();
  const s = state[id] || (state[id] = { running: false, bootCostMB: 0, stopFn: null, lastChange: null });
  let appliedLive = false;
  if (!on && s.running && s.stopFn) { try { s.stopFn(); s.running = false; appliedLive = true; } catch (_) {} }
  s.lastChange = new Date().toISOString();
  if (hooks[id]) { try { hooks[id](on); appliedLive = true; s.running = on; } catch (_) {} }
  const needsRestart = on ? !s.running : s.running;
  return { ok: true, id, enabled: on, appliedLive, needsRestart };
}

module.exports = { SERVICES, hook, boot, list, enabled, setEnabled };
