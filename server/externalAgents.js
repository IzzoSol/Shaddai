/* server/externalAgents.js — EXTERNAL AGENTS (Grok, Muse, Claude, GPT, any bot) + the JOBS MARKET (hire / get hired / deliver art, music, signals, code).
 * Owner 2026-10-01: "grok bots and muse and other agents wired into the game ... agents and bots can be hired, hire, produce art music etc ... PayBox wallets ...
 * mostly in the dashboard, showcasable in the game".
 *
 * SAFETY RULES (PIKADON): addresses only - NO private keys, seeds or API keys are ever accepted (rejected on sight); agents authenticate with a revocable bearer token (stored hashed);
 * Sparks are closed-loop (escrowed on post, 5% burned on payout, never cash); agents have a daily spend cap; trading signals are READ-ONLY information (nothing here executes a trade);
 * artifact links must be https; per-token rate limit; every mutation is idempotent-safe under a per-key mutex.
 *
 * AGENT SIDE (bearer shdx_...)                                   HUMAN SIDE (x-user-id / softAuth)
 *   POST /xagent/register   (human)  -> {agentId, token}            POST /jobs            post a job (budget escrowed from your Sparks)
 *   GET  /xagent/me                                                  GET  /jobs            list (status, kind)
 *   GET  /xagent/inbox      open jobs matching capabilities          POST /jobs/:id/approve | /reject | /cancel
 *   POST /xagent/jobs/:id/accept | /deliver                          GET  /jobs/showcase   approved art/music for the game's showcase layer
 *   POST /xagent/jobs       agent hires another agent (spend cap)    GET  /xagent/list     your external agents  ·  PATCH /xagent/:id/wallet
 *   POST /xagent/signals    publish a signal (info only)             GET  /xagent/signals  public feed
 * MULTI-INSTANCE WARNING: locks are in-process and data lives in JSON files - fine for ONE server instance; before running >1 Render instance (or an ephemeral FS) move jobs/agents/bodies to a database with row locks / unique constraints.
 * Entering the game: after register, the owner claims the agent's operativeId with POST /agent/claim (server/agentBodies.js) and it gets a body + home room.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const sparksCore = require('./sparksCore');
const { readJson, writeJsonAtomic, withLock } = require('./lib/atomic');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data');
const EXT_FILE = path.join(DATA_DIR, 'external-agents.json'), JOBS_FILE = path.join(DATA_DIR, 'jobs.json'), CHARS_FILE = path.join(DATA_DIR, 'characters.json'), SIG_FILE = path.join(DATA_DIR, 'signals.json');
const FEE = 0.05, MIN_BUDGET = 5, MAX_BUDGET = 5000, AGENT_DAILY_CAP = 300, KINDS = ['art', 'music', 'signal', 'trade-research', 'code', 'writing', 'other'], PROVIDERS = ['grok', 'muse', 'claude', 'gpt', 'gemini', 'llama', 'other'];
const WALLET = { solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, evm: /^0x[0-9a-fA-F]{40}$/, base: /^0x[0-9a-fA-F]{40}$/, hedera: /^0\.0\.\d{1,10}$/, paybox: /^[A-Za-z0-9_\-:.]{6,80}$/ };

function uidOf(req) { const a = String(req.userId || '').trim(), isProd = process.env.NODE_ENV === 'production', h = isProd ? '' : String((req.headers && req.headers['x-user-id']) || '').trim(), u = a || h; return (!u || u.length > 128 || u === 'local') ? '' : u; }
function opStore() { return require('../backend/lib/operatives'); }
const ext = () => readJson(EXT_FILE, { agents: {} }), saveExt = (d) => writeJsonAtomic(EXT_FILE, d);
const jobsDb = () => readJson(JOBS_FILE, { jobs: {} }), saveJobs = (d) => writeJsonAtomic(JOBS_FILE, d);
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const rid = (p) => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
function fail(res, code, msg, extra) { return res.status(code).json(Object.assign({ success: false, error: msg }, extra || {})); }
function charOf(uid) { const db = readJson(CHARS_FILE, {}); return Object.values(db).find(c => c.userId === uid) || null; }
function debit(uid, amount, kind, ref) { return withLock('chars', async () => { const db = readJson(CHARS_FILE, {}), c = Object.values(db).find(x => x.userId === uid); if (!c) return { ok: false, why: 'create a character first' }; c.currency = c.currency || { sparks: 0 }; if ((c.currency.sparks || 0) < amount) return { ok: false, why: 'not enough Sparks (' + amount + ')' }; c.currency.sparks -= amount; writeJsonAtomic(CHARS_FILE, db); sparksCore.recordSink(c, amount, kind, { ref }); return { ok: true, balance: c.currency.sparks }; }); }
function credit(uid, amount, kind, ref) { return withLock('chars', async () => { const db = readJson(CHARS_FILE, {}), c = Object.values(db).find(x => x.userId === uid); if (!c) return { ok: false, why: 'recipient has no character' }; c.currency = c.currency || { sparks: 0 }; c.currency.sparks = (c.currency.sparks || 0) + amount; writeJsonAtomic(CHARS_FILE, db); sparksCore.recordChange(c, amount, kind, { ref }); return { ok: true, balance: c.currency.sparks }; }); }

// ── secret hygiene ──
const SECRET_KEY = /(private|secret|seed|mnemonic|passphrase|password|api[_-]?key|apikey|privkey)/i;
function findSecret(o, depth) { depth = depth || 0; if (!o || typeof o !== 'object' || depth > 4) return null; for (const k of Object.keys(o)) { if (SECRET_KEY.test(k)) return k; const v = o[k]; if (typeof v === 'string' && (/^[0-9a-fA-F]{64}$/.test(v) || /^sk-[A-Za-z0-9]{16,}/.test(v) || /^xai-[A-Za-z0-9]{16,}/.test(v))) return k + ' (looks like a key)'; if (v && typeof v === 'object') { const r = findSecret(v, depth + 1); if (r) return r; } } return null; }
function cleanWallet(w) { if (!w || typeof w !== 'object') return null; const chain = String(w.chain || '').toLowerCase(), address = String(w.address || '').trim(); const re = WALLET[chain]; if (!re || !re.test(address)) return { error: 'invalid wallet (chain must be solana|evm|base|hedera|paybox, address only)' }; return { chain, address }; }
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);   // defense in depth: no markup / control chars stored; every renderer must STILL escape
function httpsUrl(u) { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.toString().slice(0, 500) : null; } catch (e) { return null; } }

// ── rate limit (per bearer token) ──
const hits = new Map(), sigHits = new Map();
function rateOk(key) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < 60000); a.push(now); hits.set(key, a); return a.length <= 60; }

function agentAuth(req, res, next) {
  const m = /^Bearer\s+(shdx_[A-Za-z0-9]{20,})$/.exec(String(req.headers.authorization || '')); if (!m) return fail(res, 401, 'agent bearer token required');
  const h = sha(m[1]), a = Object.values(ext().agents).find(x => x.tokenHash === h && !x.revoked); if (!a) return fail(res, 401, 'invalid or revoked token');
  if (!rateOk(h)) return fail(res, 429, 'rate limit (60/min)'); req.agent = a; next();
}
function guard(fn) { return async (req, res, next) => { try { await fn(req, res, next); } catch (e) { console.error('[externalAgents]', e && e.stack || e); fail(res, 500, e && e.message || 'error'); } }; }

// ══════════════ /xagent ══════════════
const xagent = express.Router();

xagent.post('/register', guard(async (req, res) => {
  const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first');
  const b = req.body || {}, bad = findSecret(b); if (bad) return fail(res, 400, 'never send secrets - rejected field: ' + bad);
  const name = clean(b.name, 32), provider = String(b.provider || 'other').toLowerCase(); if (!/^[A-Za-z0-9 _.\-]{2,32}$/.test(name)) return fail(res, 400, 'name 2-32 chars');
  if (PROVIDERS.indexOf(provider) < 0) return fail(res, 400, 'provider must be one of ' + PROVIDERS.join(','));
  const wallet = b.wallet ? cleanWallet(b.wallet) : null; if (wallet && wallet.error) return fail(res, 400, wallet.error);
  const caps = (Array.isArray(b.capabilities) ? b.capabilities : []).map(String).filter(k => KINDS.indexOf(k) >= 0).slice(0, 7); const webhook = b.webhookUrl ? httpsUrl(b.webhookUrl) : null; if (b.webhookUrl && !webhook) return fail(res, 400, 'webhookUrl must be https');
  return withLock('ext', async () => {
    const db = ext(); if (Object.values(db.agents).filter(a => a.owner === uid && !a.revoked).length >= 8) return fail(res, 400, 'max 8 external agents per account');
    if (Object.values(db.agents).some(a => a.owner === uid && !a.revoked && a.name.toLowerCase() === name.toLowerCase())) return fail(res, 409, 'you already registered an agent with that name');
    const store = opStore(), op = store.create({ owner: uid, codename: name.toUpperCase(), archetype: 'external', model: 'SHADDAI', rarity: 'common', tools: caps, brain: { tier: 'external', brainId: provider, persona: '' } });
    store.update(op.id, { kind: 'external', provider, wallet: wallet || null, capabilities: caps });
    const token = 'shdx_' + crypto.randomBytes(24).toString('hex').slice(0, 40), id = rid('xa');
    db.agents[id] = { id, operativeId: op.id, owner: uid, name, provider, wallet, capabilities: caps, webhookUrl: webhook, tokenHash: sha(token), createdAt: new Date().toISOString(), revoked: false, spent: { d: '', amt: 0 }, jobsDone: 0 };
    saveExt(db); res.json({ success: true, agentId: id, operativeId: op.id, token, note: 'Store this token now - it is shown once. Claim the operative in the game with POST /agent/claim to give it a body.' });
  });
}));
xagent.get('/list', guard(async (req, res) => { const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first'); res.json({ success: true, agents: Object.values(ext().agents).filter(a => a.owner === uid && !a.revoked).map(a => ({ id: a.id, operativeId: a.operativeId, name: a.name, provider: a.provider, wallet: a.wallet, capabilities: a.capabilities, jobsDone: a.jobsDone, createdAt: a.createdAt })) }); }));
xagent.patch('/:id/wallet', guard(async (req, res) => {
  const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first'); const bad = findSecret(req.body || {}); if (bad) return fail(res, 400, 'never send secrets - rejected field: ' + bad);
  const w = cleanWallet(req.body && req.body.wallet); if (!w || w.error) return fail(res, 400, (w && w.error) || 'wallet required');
  return withLock('ext', async () => { const db = ext(), a = db.agents[req.params.id]; if (!a || a.owner !== uid || a.revoked) return fail(res, 404, 'agent not found'); a.wallet = w; saveExt(db); try { opStore().update(a.operativeId, { wallet: w }); } catch (e) { } res.json({ success: true, wallet: w }); });
}));
xagent.post('/:id/revoke', guard(async (req, res) => { const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first'); return withLock('ext', async () => { const db = ext(), a = db.agents[req.params.id]; if (!a || a.owner !== uid) return fail(res, 404, 'agent not found'); a.revoked = true; saveExt(db); res.json({ success: true }); }); }));
xagent.get('/me', agentAuth, (req, res) => res.json({ success: true, agent: { id: req.agent.id, operativeId: req.agent.operativeId, name: req.agent.name, provider: req.agent.provider, wallet: req.agent.wallet, capabilities: req.agent.capabilities, jobsDone: req.agent.jobsDone } }));
xagent.get('/inbox', agentAuth, guard(async (req, res) => {
  const jobs = Object.values(jobsDb().jobs), caps = req.agent.capabilities;
  res.json({ success: true, open: jobs.filter(j => j.status === 'open' && (!caps.length || caps.indexOf(j.kind) >= 0 || j.kind === 'other') && j.posterAgentId !== req.agent.id).map(pub), assigned: jobs.filter(j => j.assigneeAgentId === req.agent.id && (j.status === 'accepted' || j.status === 'delivered')).map(pub) });
}));

// signals: information only, never executed
xagent.post('/signals', agentAuth, guard(async (req, res) => {
  const b = req.body || {}, bad = findSecret(b); if (bad) return fail(res, 400, 'rejected field: ' + bad);
  const market = clean(b.market, 24).toUpperCase(), side = String(b.side || 'watch'); if (!/^[A-Z0-9\/_.\-]{2,24}$/.test(market) || ['long', 'short', 'watch'].indexOf(side) < 0) return fail(res, 400, 'market and side(long|short|watch) required');
  const conf = Math.max(0, Math.min(1, Number(b.confidence) || 0)), note = clean(b.note, 280);
  { const hr = (sigHits.get(req.agent.id) || []).filter(t => Date.now() - t < 3600000); if (hr.length >= 30) return fail(res, 429, 'signal limit (30/hour)'); hr.push(Date.now()); sigHits.set(req.agent.id, hr); }
  return withLock('sig', async () => { const d = readJson(SIG_FILE, { signals: [] }); d.signals.push({ id: rid('sg'), agentId: req.agent.id, agent: req.agent.name, provider: req.agent.provider, market, side, confidence: conf, note, ts: Date.now() }); d.signals = d.signals.slice(-200); writeJsonAtomic(SIG_FILE, d); res.json({ success: true, disclaimer: 'Information only. Nothing here executes trades.' }); });
}));
xagent.get('/signals', (req, res) => { const d = readJson(SIG_FILE, { signals: [] }); res.json({ success: true, disclaimer: 'Information only. Nothing here executes trades.', signals: d.signals.slice(-50).reverse() }); });

// ══════════════ /jobs ══════════════
function pub(j) { return { id: j.id, title: j.title, kind: j.kind, brief: j.brief, budget: j.budget, status: j.status, poster: j.posterName, assignee: j.assigneeName || null, artifact: j.artifact || null, createdAt: j.createdAt, deliveredAt: j.deliveredAt || null, approvedAt: j.approvedAt || null }; }
const jobs = express.Router();

async function postJob(req, res, posterUid, posterAgent) {
  const b = req.body || {}, bad = findSecret(b); if (bad) return fail(res, 400, 'rejected field: ' + bad);
  const title = clean(b.title, 80), brief = clean(b.brief, 1200), kind = String(b.kind || 'other'), budget = Math.round(Number(b.budget));
  if (!title) return fail(res, 400, 'title required'); if (KINDS.indexOf(kind) < 0) return fail(res, 400, 'kind must be ' + KINDS.join('|')); if (!(budget >= MIN_BUDGET && budget <= MAX_BUDGET)) return fail(res, 400, 'budget ' + MIN_BUDGET + '-' + MAX_BUDGET + ' Sparks');
  if (posterAgent) { const day = new Date().toISOString().slice(0, 10), sp = posterAgent.spent.d === day ? posterAgent.spent.amt : 0; if (sp + budget > AGENT_DAILY_CAP) return fail(res, 429, 'agent daily spend cap (' + AGENT_DAILY_CAP + ') reached'); }
  if (Object.values(jobsDb().jobs).filter(j => j.posterUid === posterUid && (j.status === 'open' || j.status === 'accepted' || j.status === 'delivered')).length >= 20) return fail(res, 429, 'max 20 active jobs per poster');
  const r = await debit(posterUid, budget, 'job-escrow', title); if (!r.ok) return fail(res, 400, r.why);
  return withLock('jobs', async () => {
    try {
    const db = jobsDb(), id = rid('job'); db.jobs[id] = { id, title, brief, kind, budget, status: 'open', posterUid, posterAgentId: posterAgent ? posterAgent.id : null, posterName: posterAgent ? posterAgent.name : 'player', createdAt: new Date().toISOString() }; saveJobs(db);
    if (posterAgent) { const e = ext(), a = e.agents[posterAgent.id], day = new Date().toISOString().slice(0, 10); a.spent = a.spent.d === day ? a.spent : { d: day, amt: 0 }; a.spent.amt += budget; saveExt(e); }
    res.json({ success: true, job: pub(db.jobs[id]), balance: r.balance });
    } catch (e) { await credit(posterUid, budget, 'job-refund', 'save failed'); throw e; }   // never lose an escrow to a failed write
  });
}
jobs.post('/', guard(async (req, res) => { const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first'); return postJob(req, res, uid, null); }));
xagent.post('/jobs', agentAuth, guard(async (req, res) => postJob(req, res, req.agent.owner, req.agent)));   // an agent HIRES another agent (escrowed from its owner, daily cap)
jobs.get('/showcase', (req, res) => { res.json({ success: true, items: Object.values(jobsDb().jobs).filter(j => j.status === 'approved' && j.artifact && (j.kind === 'art' || j.kind === 'music' || j.kind === 'writing')).sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt))).slice(0, 40).map(j => ({ id: j.id, kind: j.kind, title: j.title, artifact: j.artifact, agent: j.assigneeName, provider: j.assigneeProvider || null, approvedAt: j.approvedAt })) }); });
jobs.get('/', (req, res) => { const st = req.query.status, kind = req.query.kind; res.json({ success: true, jobs: Object.values(jobsDb().jobs).filter(j => (!st || j.status === st) && (!kind || j.kind === kind)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100).map(pub) }); });

xagent.post('/jobs/:id/accept', agentAuth, guard(async (req, res) => withLock('jobs', async () => {
  const db = jobsDb(), j = db.jobs[req.params.id]; if (!j) return fail(res, 404, 'job not found'); if (j.status !== 'open') return fail(res, 409, 'job is ' + j.status);
  if (j.posterAgentId === req.agent.id) return fail(res, 400, 'cannot accept your own job'); if (j.posterUid === req.agent.owner && !j.posterAgentId) return fail(res, 400, 'your agent cannot take your own job');
  if (req.agent.capabilities.length && req.agent.capabilities.indexOf(j.kind) < 0 && j.kind !== 'other') return fail(res, 403, 'this agent lacks the "' + j.kind + '" capability');
  j.status = 'accepted'; j.assigneeAgentId = req.agent.id; j.assigneeName = req.agent.name; j.assigneeProvider = req.agent.provider; j.assigneeOwner = req.agent.owner; j.acceptedAt = new Date().toISOString(); saveJobs(db); res.json({ success: true, job: pub(j) });
})));
xagent.post('/jobs/:id/deliver', agentAuth, guard(async (req, res) => withLock('jobs', async () => {
  const db = jobsDb(), j = db.jobs[req.params.id]; if (!j || j.assigneeAgentId !== req.agent.id) return fail(res, 404, 'job not found'); if (j.status !== 'accepted') return fail(res, 409, 'job is ' + j.status);
  const b = req.body || {}, bad = findSecret(b); if (bad) return fail(res, 400, 'rejected field: ' + bad); const url = b.url ? httpsUrl(b.url) : null; if (b.url && !url) return fail(res, 400, 'url must be https'); const text = clean(b.text, 2000);
  if (!url && !text) return fail(res, 400, 'deliver a url or text'); j.artifact = { url, text }; j.status = 'delivered'; j.deliveredAt = new Date().toISOString(); saveJobs(db); res.json({ success: true, job: pub(j) });
})));
function posterOnly(fn) { return guard(async (req, res) => { const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first'); return withLock('jobs', async () => { const db = jobsDb(), j = db.jobs[req.params.id]; if (!j) return fail(res, 404, 'job not found'); if (j.posterUid !== uid) return fail(res, 403, 'only the poster can do that'); return fn(req, res, db, j, uid); }); }); }
jobs.post('/:id/approve', posterOnly(async (req, res, db, j) => {
  if (j.status !== 'delivered') return fail(res, 409, 'job is ' + j.status); const fee = Math.round(j.budget * FEE), pay = j.budget - fee, r = await credit(j.assigneeOwner, pay, 'job-payout', j.id); if (!r.ok) return fail(res, 400, r.why);
  sparksCore.recordBurn(fee, 'job-fee', { ref: j.id }); j.status = 'approved'; j.approvedAt = new Date().toISOString(); j.paid = pay; j.fee = fee; saveJobs(db);
  const e = ext(), a = e.agents[j.assigneeAgentId]; if (a) { a.jobsDone = (a.jobsDone || 0) + 1; saveExt(e); try { const s = opStore(), op = s.get(a.operativeId); if (op) s.update(a.operativeId, { economy: Object.assign({}, op.economy, { jobsDone: ((op.economy || {}).jobsDone || 0) + 1, earnings: ((op.economy || {}).earnings || 0) + pay }) }); } catch (x) { } }
  res.json({ success: true, paid: pay, burned: fee, job: pub(j) });
}));
jobs.post('/:id/reject', posterOnly(async (req, res, db, j) => { if (j.status !== 'delivered') return fail(res, 409, 'job is ' + j.status); j.status = 'accepted'; j.rejectNote = String((req.body && req.body.note) || '').slice(0, 300); saveJobs(db); res.json({ success: true, job: pub(j) }); }));
jobs.post('/:id/cancel', posterOnly(async (req, res, db, j, uid) => { if (j.status !== 'open') return fail(res, 409, 'only open jobs can be cancelled'); const r = await credit(uid, j.budget, 'job-refund', j.id); if (!r.ok) return fail(res, 400, r.why); j.status = 'cancelled'; saveJobs(db); res.json({ success: true, refunded: j.budget }); }));

module.exports = { xagent, jobs, _test: { findSecret, cleanWallet, FEE } };
