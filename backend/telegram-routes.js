/* ══════════════════════════════════════════════════════════════════════════
   telegram-routes.js — dashboard control for the Telegram bot/signals.
     GET  /api/telegram/status     → enabled, channel, chat count, config
     POST /api/telegram/broadcast  → { text } push a message to channel + all chats
     POST /api/telegram/config     → { signals, bonded, news, newsIntervalMin }
   Broadcast + config are admin-gated when ADMIN_TOKEN is set (matches app policy).
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router = express.Router();
const core = require('./telegram-core');
const pnl = require('./telegram-pnl');

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _adminOk(req) {
  const need = process.env.ADMIN_TOKEN || '';
  if (!need) return true;   // unset → open (dev), same policy as other admin routes
  const got = req.headers['x-admin-token'] || (req.body && req.body.adminToken) || '';
  return got && got === need;
}

router.get('/status', (req, res) => {
  res.json({
    ok: true,
    enabled: !!core.token(),
    channel: core.channel() || null,
    chats: core.chats().length,
    config: core.getConfig(),
    adminRequired: !!process.env.ADMIN_TOKEN,
  });
});

router.get('/stats', (req, res) => {
  const p = String(req.query.period || 'day');
  res.json({ ok: true, period: p, text: pnl.stats(p === 'week' || p === 'month' ? p : 'day') });
});

router.post('/broadcast', express.json({ limit: '32kb' }), async (req, res) => {
  if (!_adminOk(req)) return res.status(401).json({ ok: false, error: 'admin token required' });
  if (!core.token()) return res.status(503).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  const html = '📢 <b>SHADDAI</b>\n\n' + _esc(text).slice(0, 3800);
  const delivered = await core.broadcast(html);
  res.json({ ok: true, delivered });
});

router.post('/config', express.json({ limit: '8kb' }), (req, res) => {
  if (!_adminOk(req)) return res.status(401).json({ ok: false, error: 'admin token required' });
  const b = req.body || {};
  const patch = {};
  ['signals', 'bonded', 'newpools', 'trending', 'news', 'headlines', 'promo', 'rugFilter', 'bullishOnly'].forEach(k => { if (typeof b[k] === 'boolean') patch[k] = b[k]; });
  if (b.newsIntervalMin != null) patch.newsIntervalMin = Math.max(15, parseInt(b.newsIntervalMin, 10) || 60);
  if (b.headlinesIntervalMin != null) patch.headlinesIntervalMin = Math.max(15, parseInt(b.headlinesIntervalMin, 10) || 45);
  if (typeof b.chains === 'string') patch.chains = b.chains.slice(0, 120);
  ['minLiq', 'minVol24h', 'minFdv', 'maxFdv', 'maxPer'].forEach(k => { if (b[k] != null && isFinite(Number(b[k]))) patch[k] = Math.max(0, Number(b[k])); });
  res.json({ ok: true, config: core.setConfig(patch) });
});

module.exports = router;
