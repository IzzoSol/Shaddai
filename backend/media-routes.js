// SHADDAI media engine rail - /api/media gateway.
// Talks only to the loopback-bound engine (127.0.0.1:9000) with a scoped
// api-key + UA. PIKADON rails enforced here:
//   - fetch: url must be public http(s), DNS resolved & non-private/link-local
//   - dl:    only the engine's OWN /tunnel URLs are proxied (no open redirect)
//   - rate:  per-IP budget for fetch attempts
//   - audit: JSONL trail of every fetch/dl (backend/data/media-audit.jsonl)

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const PORT = Number(process.env.MEDIA_ENGINE_PORT) || 9000;
const ENGINE_HOST = '127.0.0.1';
const ENGINE_BASE = `http://${ENGINE_HOST}:${PORT}`;
const ENGINE_UA = process.env.MEDIA_ENGINE_UA || 'ShaddaiBot/2.0';
const KEYS_FILE = process.env.MEDIA_ENGINE_KEYS || path.join(__dirname, 'media-engine', 'api', 'keys.json');
const DL_MAX_BYTES = (Number(process.env.MEDIA_DL_MAX_MB) || 2048) * 1024 * 1024;
const RATE_PER_MIN = Number(process.env.MEDIA_RATE_PER_MIN) || 30;
const AUDIT_FILE = path.join(__dirname, 'data', 'media-audit.jsonl');

const router = express.Router();
const hits = new Map();

function getEngineKey() {
  try {
    const k = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    const id = Object.keys(k)[0];
    return id ? { key: id, ua: (k[id] && k[id].userAgents && k[id].userAgents[0]) || ENGINE_UA } : null;
  } catch (e) {
    return null;
  }
}

function audit(ev) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ t: new Date().toISOString(), ...ev }) + '\n');
  } catch (e) { /* audit never throws */ }
}

function readAudit(limit) {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-(limit || 12)).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

function ratelimit(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.reset > 60000) {
    hits.set(ip, { n: 1, reset: now + 60000 });
    return true;
  }
  h.n += 1;
  if (hits.size > 5000) hits.clear();
  return h.n <= RATE_PER_MIN;
}

function isBlockedIp(ip) {
  if (ip.includes(':')) {
    if (ip === '::1' || /^::ffff:/.test(ip)) return true;
    const hex = ip.toLowerCase().split(':')[0];
    return hex === 'fe80' || hex === 'fc' || hex === 'fd';
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  return (a === 10) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 127) || (a === 0) || (a === 169 && b === 254) || (a >= 224);
}

function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error('invalid url'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('http(s) only');
  if (u.username || u.password) throw new Error('credentials not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') throw new Error('private host blocked');
  return { url: raw, host };
}

function assertPublicHost(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) return reject(new Error('dns failed'));
      resolve(addrs.every(a => !isBlockedIp(a.address)));
    });
  });
}

function callEngine(method, enginePath, body, headers) {
  return new Promise((resolve, reject) => {
    const auth = getEngineKey();
    const req = http.request({
      host: ENGINE_HOST, port: PORT, method, path: enginePath,
      headers: {
        'Accept': 'application/json',
        'User-Agent': auth ? auth.ua : ENGINE_UA,
        'Content-Type': 'application/json',
        'Authorization': auth ? `api-key ${auth.key}` : '',
        'X-Forwarded-For': (headers && headers['x-forwarded-for']) || '',
        ...(headers || {}),
      },
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* non-json */ }
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(new Error('engine timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function engineUp() {
  return new Promise((resolve) => {
    const req = http.get({ host: ENGINE_HOST, port: PORT, path: '/', timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// GET /api/media/status - engine + service info, audit counter
router.get('/status', async (req, res) => {
  const r = await engineUp();
  if (!r) return res.status(503).json({ ok: false, error: 'media engine is offline', engineUp: false });
  const info = await callEngine('GET', '/');
  res.json({ ok: true, engineUp: true, engine: info.json || { raw: info.text }, services: (info.json && info.json.engine && info.json.engine.services) || [], audit: { recent: readAudit(8) } });
});

// POST /api/media/fetch - download request (public URL -> engine)
router.post('/fetch', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  if (!ratelimit(ip)) return res.status(429).json({ ok: false, error: 'too many download attempts' });

  const { url, downloadMode } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ ok: false, error: 'url required' });

  let pub;
  try {
    pub = assertPublicUrl(url);
    if (!(await assertPublicHost(pub.host))) throw new Error('private host blocked');
  } catch (e) {
    audit({ kind: 'fetch', user: req.headers['x-user-id'] || '', ip, url, result: 'blocked:' + e.message });
    return res.status(403).json({ ok: false, error: e.message });
  }

  try {
    const r = await callEngine('POST', '/', { url, downloadMode: downloadMode || 'auto' });
    if (r.json && r.json.error) {
      audit({ kind: 'fetch', user: req.headers['x-user-id'] || '', ip, url, result: 'engine:' + r.json.error.code });
      return res.status(r.json.error.code === 'error.api.auth.quota_exceeded' ? 429 : (r.status >= 500 ? 502 : 400))
        .json({ ok: false, error: r.json.error.code, context: r.json.error.context || null });
    }
    const out = r.json && typeof r.json === 'object' ? r.json : { status: 'stream', url: r.text };
    const downloadUrl = out.url ? '/api/media/dl?url=' + encodeURIComponent(out.url) : null;
    audit({ kind: 'fetch', user: req.headers['x-user-id'] || '', ip, url, result: 'ok:' + (out.status || 'stream'), filename: out.filename || '' });
    res.json({ ok: true, status: out.status, filename: out.filename || '', url: downloadUrl, size: out.size || out.contentLength || null });
  } catch (e) {
    audit({ kind: 'fetch', user: req.headers['x-user-id'] || '', ip, url, result: 'fail:' + e.message });
    res.status(502).json({ ok: false, error: 'engine unreachable' });
  }
});

// GET /api/media/dl?url=<engine tunnel url> - stream the media through us.
// PIKADON: the only allowed target is the engine's own signed /tunnel endpoint.
router.get('/dl', async (req, res) => {
  const raw = String(req.query.url || '');
  const ok = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}\/tunnel\?/.test(raw);
  if (!ok) return res.status(403).json({ ok: false, error: 'tunnel url required' });
  let u; try { u = new URL(raw.replace(/\[::1\]/, '127.0.0.1').replace(/^http/, 'http')); } catch (e) { return res.status(403).json({ ok: false, error: 'invalid url' }); }
  if (!(u.port === String(PORT)) || (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost')) {
    return res.status(403).json({ ok: false, error: 'origin not allowed' });
  }

  const auth = getEngineKey();
  const upstream = http.get({
    host: u.hostname, port: u.port || PORT, path: u.pathname + u.search,
    headers: { 'Accept': '*/*', 'User-Agent': auth ? auth.ua : ENGINE_UA, 'Authorization': auth ? `api-key ${auth.key}` : '' },
    timeout: 30000,
  }, (ur) => {
    if (ur.statusCode >= 400) {
      ur.resume();
      return res.status(ur.statusCode).json({ ok: false, error: 'upstream ' + ur.statusCode });
    }
    const est = Number((ur.headers['estimated-content-length'] || '').toString()) || 0;
    if (est > DL_MAX_BYTES) {
      ur.destroy();
      audit({ kind: 'dl', user: req.headers['x-user-id'] || '', ip: req.socket.remoteAddress, url: raw, result: 'size-cap' });
      return res.status(413).json({ ok: false, error: 'media too large' });
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', ur.headers['content-type'] || 'application/octet-stream');
    if (ur.headers['content-disposition']) res.setHeader('Content-Disposition', ur.headers['content-disposition']);
    let sent = 0;
    let capped = false;
    ur.on('data', (c) => {
      sent += c.length;
      if (sent > DL_MAX_BYTES) { capped = true; ur.destroy(); res.destroy(); }
      else res.write(c);
    });
    ur.on('end', () => {
      if (!capped) res.end();
      audit({ kind: 'dl', user: req.headers['x-user-id'] || '', ip: req.socket.remoteAddress, url: raw, result: 'ok:' + sent });
    });
    ur.on('error', () => { if (!res.writableEnded) res.destroy(); });
  });
  upstream.on('error', () => res.status(502).json({ ok: false, error: 'engine unreachable' }));
  req.on('aborted', () => upstream.destroy());
});

module.exports = router;