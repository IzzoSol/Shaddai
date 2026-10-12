'use strict';

// telegram-virtuals.js — @ZeroxVirtualsBot, the Virtuals-lane Telegram bot.
//
// "Virtuals agent Telegram bot (activity/logs/signals) — separate from the
// trading bot" per backend/.env. The token sat in .env since 2026-09 with no
// consumer; this is the consumer. Exposes ZEROX's ACP identity, job pipeline
// and the Virtuals marketplace as commands, and watches registration + agent
// wallet funding, posting state CHANGES to VIRTUALS_TELEGRAM_CHAT_ID when
// that channel is configured (otherwise it logs and stays DM-only).
//
// No dependencies: plain fetch + AbortSignal timeouts (node >= 18), same
// conventions as the other telegram-*.js workers. Poll-based (getUpdates),
// so nothing else may poll this token concurrently.

const fs = require('fs');
const path = require('path');

const TOKEN = () => String(process.env.VIRTUALS_TELEGRAM_BOT_TOKEN || '').trim();
const KEY = () => String(process.env.VIRTUALS_API_KEY || process.env.VIRTUALS_ACP_KEY || '').trim();
const ACS_BASE = () => (process.env.VIRTUALS_ACP_BASE || 'https://claw-api.virtuals.io').replace(/\/+$/, '');
const ACPX_BASE = () => (process.env.VIRTUALS_ACPX_BASE || 'https://acpx.virtuals.io').replace(/\/+$/, '');
const CHAT_ID = () => String(process.env.VIRTUALS_TELEGRAM_CHAT_ID || '').trim();
const STATE_FILE = path.join(__dirname, 'data', 'tg-virtuals-state.json');
const MONITOR_MS = 30 * 60 * 1000;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { offset: 0, monitor: null }; }
}
function saveState(st) {
  try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(st)); } catch (e) {}
}

// ── Telegram plumbing ────────────────────────────────────────────────────────
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.warn('[tg-virtuals] api:', method, j.description || r.status);
  return j;
}
async function send(chatId, html) {
  return tg('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
}

// ── Virtuals ACP + wallet calls (mirror routes/virtuals-routes.js) ──────────
async function vApi(p) {
  const k = KEY();
  if (!k) return { error: 'VIRTUALS_API_KEY not set (backend/.env)' };
  try {
    const r = await fetch(ACS_BASE() + p, { headers: { 'x-api-key': k }, signal: AbortSignal.timeout(20000) });
    const txt = await r.text().catch(() => '');
    let j = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch (_) { return { error: 'non-JSON reply from Virtuals ACP' }; }
    if (!r.ok) return { status: r.status, ...j };
    return Object.keys(j).length ? j : { empty: true };
  } catch (e) { return { error: 'request failed: ' + ((e && e.message) || e) }; }
}
async function acpMe() {
  const d = await vApi('/acp/me');
  if (d.status || d.error || d.empty) {
    const detail = d.status === 404
      ? 'agent not registered on Virtuals — activate at app.virtuals.io/acp/agents (Settings → Generate API)'
      : d.status ? 'ACP HTTP ' + d.status : (d.error || 'empty reply — agent may not be registered');
    return { ok: false, detail };
  }
  const info = (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data : d;
  const agent = info.agent || info.agentId || info.name || info.id || null;
  return { ok: !!agent, registered: !!agent, agent, name: info.name || agent, id: info.id || info.agentId, walletAddress: info.walletAddress || info.wallet || null };
}
async function agentDetail(id) {
  try {
    const r = await fetch(ACPX_BASE() + '/api/agents/' + encodeURIComponent(id) + '/details', { signal: AbortSignal.timeout(20000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, detail: 'HTTP ' + r.status };
    const info = d.data || d.details || d;
    return {
      ok: true, id, name: info.name || info.agent || null, tokenSymbol: info.tokenSymbol || null,
      description: info.description || null,
      offerings: Array.isArray(info.offerings) ? info.offerings.map((o) => ({ name: o.name || o.jobOfferingName || o.title || '?', feeUsd: o.feeUsd || null })) : [],
    };
  } catch (e) { return { ok: false, detail: String((e && e.message) || e) }; }
}
async function jobStatus(id) {
  const d = await vApi('/acp/jobs/' + encodeURIComponent(id));
  if (d.status || d.error || d.empty) return { ok: false, detail: d.status ? 'ACP HTTP ' + d.status : (d.error || 'empty reply') };
  const j = (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data : d;
  return { ok: true, phase: j.phase || j.status || '?', deliverable: j.deliverable || null, memos: Array.isArray(j.memos) ? j.memos : (Array.isArray(d.memos) ? d.memos : []) };
}
async function baseBalance() {
  const w = String(process.env.VIRTUALS_BASE_WALLET || '').trim().toLowerCase();
  if (!w) return null;
  try {
    const r = await fetch('https://mainnet.base.org', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [w, 'latest'] }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    return { chain: 'base', address: w, balance: j.result ? parseInt(j.result, 16) / 1e18 : 0 };
  } catch (e) { return { chain: 'base', address: w, balance: null, error: String((e && e.message) || e) }; }
}
async function solBalance() {
  const w = String(process.env.VIRTUALS_SOL_WALLET || '').trim();
  if (!w) return null;
  try {
    const r = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [w] }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    return { chain: 'solana', address: w, balance: (j.result && j.result.value != null) ? j.result.value / 1e9 : 0 };
  } catch (e) { return { chain: 'solana', address: w, balance: null, error: String((e && e.message) || e) }; }
}

// ── /price — CoinGecko public (free, no key; same source the signals engine doctors) ──
const CG_IDS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', doge: 'dogecoin', wif: 'dogwifcoin', pepe: 'pepe', ton: 'the-open-network', ada: 'cardano', avax: 'avalanche-2', link: 'chainlink', sui: 'sui' };
async function prices(syms) {
  const ids = [...new Set(syms.map((s) => CG_IDS[s.toLowerCase()]).filter(Boolean))];
  if (!ids.length) return null;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v2/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(15000) });
    return await r.json();
  } catch (e) { return null; }
}

// ── command handlers ────────────────────────────────────────────────────────
const HELP =
  '<b>🟢 ZEROX · Virtuals Bot</b>\n' +
  'ZEROX\'s Virtuals ACP lane — agent commerce, jobs and the marketplace.\n\n' +
  '<code>/status</code> — ACP identity + agent wallets\n' +
  '<code>/price btc sol eth</code> — live prices\n' +
  '<code>/job <id></code> — ACP job status + memos\n' +
  '<code>/agent <id></code> — marketplace agent + offerings\n' +
  '<code>/ping</code> — heartbeat\n\n' +
  '<i>ACP escrow jobs are created by other agents; this bot reports them.</i>';

async function cmdStatus() {
  const me = await acpMe();
  const [base, sol] = await Promise.all([baseBalance(), solBalance()]);
  let out = '<b>🟢 ZEROX · Virtuals ACP</b>\n';
  if (!me.ok) out += 'registration: ❓ ' + esc(me.detail || 'unknown') + '\n';
  else out += 'agent: <b>' + esc(me.name || me.agent) + '</b>' + (me.id ? ' (id ' + esc(me.id) + ')' : '') + '\nregistered: ✅\n';
  if (me.walletAddress) out += 'acp wallet: <code>' + esc(me.walletAddress) + '</code>\n';
  for (const w of [base, sol]) {
    if (!w) continue;
    const label = w.chain === 'base' ? '💠 Base (ACP provider)' : '◎ Solana agent';
    if (w.balance == null) { out += label + ': ❓ ' + esc(w.error || 'balance unavailable') + '\n'; continue; }
    const funded = w.balance >= 0.001;
    out += label + ': <b>' + (w.chain === 'base' ? n2(w.balance).toFixed(4) + ' ETH' : n2(w.balance).toFixed(3) + ' SOL') + '</b> ' + (funded ? '✅ funded' : '⚠️ low') + '\n';
  }
  return out;
}
async function cmdJob(id) {
  const j = await jobStatus(id);
  if (!j.ok) return '❌ job: ' + esc(j.detail || 'not found');
  let out = '<b>🧾 ACP job ' + esc(id) + '</b>\nphase: <b>' + esc(j.phase) + '</b>\n';
  if (j.deliverable) out += '\ndeliverable:\n<i>' + esc(String(j.deliverable).slice(0, 800)) + '</i>\n';
  const memos = j.memos.slice(-3);
  if (memos.length) {
    out += '\nmemos (latest ' + memos.length + '):\n';
    for (const m of memos) out += '• <i>' + esc(String(typeof m === 'string' ? m : (m.content || m.message || JSON.stringify(m))).slice(0, 240)) + '</i>\n';
  }
  if (j.phase === 'COMPLETED' || j.phase === 'REJECTED' || j.phase === 'EXPIRED') out += '\n<i>terminal phase — no further updates.</i>';
  return out;
}
async function cmdAgent(id) {
  const a = await agentDetail(id);
  if (!a.ok) return '❌ agent: ' + esc(a.detail || 'not found');
  let out = '<b>🤖 ' + esc(a.name || a.id) + '</b>' + (a.tokenSymbol ? '  <code>$' + esc(a.tokenSymbol) + '</code>' : '') + '\n';
  if (a.description) out += '<i>' + esc(String(a.description).slice(0, 240)) + '</i>\n';
  if (a.offerings.length) {
    out += '\nofferings:\n';
    for (const o of a.offerings.slice(0, 5)) out += '• <b>' + esc(o.name) + '</b>' + (o.feeUsd != null ? ' — $' + esc(String(o.feeUsd)) : '') + '\n';
  } else out += '\nno offerings listed';
  return out;
}
async function cmdPrice(args) {
  if (!args.length) return 'usage: <code>/price btc sol eth</code> — supported: ' + Object.keys(CG_IDS).map(esc).join(', ');
  const j = await prices(args);
  if (!j) return '❌ price feed unavailable (or unknown symbols)';
  const parts = [];
  for (const s of args) {
    const id = CG_IDS[s.toLowerCase()];
    const d = id && j[id];
    if (!d) continue;
    const chg = d.usd_24h_change != null ? d.usd_24h_change : null;
    parts.push('<b>' + esc(s.toUpperCase()) + '</b> $' + esc(d.usd.toLocaleString('en', { maximumFractionDigits: d.usd >= 1 ? 2 : 6 })) + (chg != null ? ' (' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%)' : ''));
  }
  return parts.length ? parts.join('\n') : 'no known symbols in: ' + args.map(esc).join(', ');
}

// ── update loop ─────────────────────────────────────────────────────────────
const startedAt = Date.now();
let pollCount = 0;
let stopping = false;

function parseCmd(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return null;
  const m = /^\/([a-z]+)(?:@[\w_]+)?\s*([\s\S]*)$/i.exec(t);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: m[2].trim() ? m[2].trim().split(/\s+/) : [] };
}
async function handle(msg) {
  const text = msg && msg.text;
  const chat = msg && msg.chat && msg.chat.id;
  if (!text || !chat) return;
  const c = parseCmd(text);
  if (!c) return;
  let out;
  try {
    if (c.cmd === 'start' || c.cmd === 'help') out = HELP;
    else if (c.cmd === 'status') out = await cmdStatus();
    else if (c.cmd === 'ping') out = 'pong 🏓\nuptime ' + esc(fmtDur(Date.now() - startedAt)) + ' · polls ' + pollCount;
    else if (c.cmd === 'price') out = await cmdPrice(c.args);
    else if (c.cmd === 'job') out = c.args[0] ? await cmdJob(c.args[0]) : 'usage: <code>/job <id></code>';
    else if (c.cmd === 'agent') out = c.args[0] ? await cmdAgent(c.args[0]) : 'usage: <code>/agent <id></code>';
    else return;
  } catch (e) { out = '❌ ' + esc(String((e && e.message) || e)); }
  await send(chat, out).catch(() => {});
}
function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? h + 'h ' + m + 'm' : m + 'm ' + (s % 60) + 's';
}

// ── monitor: registration + wallet funding state changes ─────────────────────
async function monitor(st) {
  const snap = {};
  try {
    const me = await acpMe();
    snap.registered = !!me.registered;
    snap.agentName = me.name || me.agent || null;
  } catch (e) { /* keep old snapshot fields */ }
  const [base, sol] = await Promise.all([baseBalance(), solBalance()]);
  if (base && base.balance != null) { snap.baseBal = Math.round(base.balance * 1e4) / 1e4; snap.baseFunded = base.balance >= 0.001; }
  if (sol && sol.balance != null) { snap.solBal = Math.round(sol.balance * 1e3) / 1e3; snap.solFunded = sol.balance >= 0.001; }

  const prev = st.monitor;
  const changes = [];
  if (prev) {
    if (prev.registered !== snap.registered) changes.push(snap.registered ? '🟢 ACP registration: <b>ACTIVE</b>' : '🔴 ACP registration lost');
    if (prev.baseFunded !== snap.baseFunded) changes.push(snap.baseFunded ? '💠 Base wallet funded: <b>' + snap.baseBal + ' ETH</b>' : '💠 Base wallet drained: <b>' + snap.baseBal + ' ETH</b>');
    if (prev.solFunded !== snap.solFunded) changes.push(snap.solFunded ? '◎ Solana wallet funded: <b>' + snap.solBal + ' SOL</b>' : '◎ Solana wallet drained: <b>' + snap.solBal + ' SOL</b>');
    if (prev.baseBal != null && snap.baseBal != null && prev.baseBal > 0 && Math.abs(snap.baseBal - prev.baseBal) / prev.baseBal > 0.5) changes.push('💠 Base wallet: ' + prev.baseBal + ' → <b>' + snap.baseBal + ' ETH</b>');
    if (prev.solBal != null && snap.solBal != null && prev.solBal > 0 && Math.abs(snap.solBal - prev.solBal) / prev.solBal > 0.5) changes.push('◎ Solana wallet: ' + prev.solBal + ' → <b>' + snap.solBal + ' SOL</b>');
  }
  if (changes.length) {
    const txt = '<b>⚡ ZEROX · Virtuals monitor</b>\n' + changes.map((c) => '• ' + c).join('\n');
    console.log('[tg-virtuals] monitor change:', changes.join(' | '));
    if (CHAT_ID()) await send(CHAT_ID(), txt).catch(() => {});
  }
  st.monitor = snap;
  saveState(st);
}

// ── boot ────────────────────────────────────────────────────────────────────
function startTelegramVirtualsBot() {
  if (!TOKEN()) { console.log('[tg-virtuals] disabled — set VIRTUALS_TELEGRAM_BOT_TOKEN to enable.'); return; }
  const st = loadState();
  console.log('[tg-virtuals] @ZeroxVirtualsBot starting · key ' + (KEY() ? 'set' : 'MISSING') + ' · monitor ' + Math.round(MONITOR_MS / 60000) + 'm' + (CHAT_ID() ? ' · channel ' + CHAT_ID() : ' · DM-only (no VIRTUALS_TELEGRAM_CHAT_ID)'));

  tg('setMyCommands', { commands: [
    { command: 'status', description: 'ZEROX ACP identity + agent wallets' },
    { command: 'price', description: 'Live prices: /price btc sol eth' },
    { command: 'job', description: 'ACP job status: /job <id>' },
    { command: 'agent', description: 'Marketplace agent: /agent <id>' },
    { command: 'ping', description: 'Bot heartbeat' },
  ] }).catch(() => {});

  (async function poll() {
    while (!stopping) {
      try {
        const j = await tg('getUpdates', { offset: st.offset, timeout: 25, allowed_updates: ['message'] });
        pollCount += 1;
        if (j.ok && Array.isArray(j.result)) {
          for (const u of j.result) {
            st.offset = Math.max(st.offset, u.update_id + 1);
            await handle(u.message).catch(() => {});
          }
          if (j.result.length) saveState(st);
        } else if (j.ok === false) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (e) {
        console.warn('[tg-virtuals] poll error:', (e && e.message) || e);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  const mTimer = setInterval(() => { monitor(st).catch((e) => console.warn('[tg-virtuals] monitor error:', (e && e.message) || e)); }, MONITOR_MS);
  if (mTimer.unref) mTimer.unref();
  monitor(st).catch(() => {});

  const shutdown = () => { stopping = true; saveState(st); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return { shutdown };
}

module.exports = { startTelegramVirtualsBot };
