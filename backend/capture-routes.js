const express = require('express');
const router = express.Router();

const PORT = Number(process.env.PORT) || 3000;
const ORIGIN = 'http://127.0.0.1:' + PORT;
const CLIPPER_ORIGIN = process.env.CLIPPER_ORIGIN || 'http://127.0.0.1:8787';
const MAX_SCRAPE = 200000;

function clientIp(req) {
  return String(req.get('x-forwarded-for') ? req.get('x-forwarded-for').split(',')[0].trim() : (req.socket && req.socket.remoteAddress) || 'local');
}

async function self(path, options) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), (options && options.timeout) || 20000);
  try {
    return await fetch(ORIGIN + path, {
      method: (options && options.method) || 'GET',
      headers: options && options.headers ? options.headers : { 'content-type': 'application/json' },
      body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: ctl.signal
    });
  } finally { clearTimeout(t); }
}

router.get('/status', async (req, res) => {
  const out = { ok: true, media: { up: false }, clipper: { up: false }, scraper: { ready: true }, asOf: new Date().toISOString() };
  try {
    const r = await self('/api/media/status');
    const d = r.ok ? await r.json() : {};
    out.media = { up: !!d.engineUp, engine: d.engine, services: (d.services || []).length, audit: d.audit };
  } catch (e) { out.media.error = e.message; }
  try {
    const r = await fetch(CLIPPER_ORIGIN + '/clipper/health', { signal: AbortSignal.timeout(6000) });
    out.clipper = { up: true, upstream: CLIPPER_ORIGIN, engine: r.ok ? await r.text().catch(() => '') : null };
  } catch (e) { out.clipper = { up: false, upstream: CLIPPER_ORIGIN, error: e.message }; }
  res.json(out);
});

router.post('/run', async (req, res) => {
  const mode = String((req.body && req.body.mode) || '').trim().toLowerCase();
  const url = String((req.body && req.body.url) || '').trim();
  if (!['media', 'scrape', 'clip'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'mode must be one of media | scrape | clip' });
  }
  if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

  if (mode === 'scrape') {
    let scraper;
    try { scraper = require('./lib/web-scrape'); }
    catch (e) { return res.json({ ok: false, error: 'scraper unavailable: ' + e.message }); }
    try {
      const maxChars = Math.min(MAX_SCRAPE, Math.max(300, Number(req.body.max_chars) || MAX_SCRAPE));
      const r = await scraper.scrape({ url, maxChars });
      const md = scraper.toMarkdown(r);
      return res.json({
        ok: true,
        mode: 'scrape',
        url: r.finalUrl || r.url,
        title: r.title,
        description: r.description,
        bytes: Buffer.byteLength(md, 'utf8'),
        chars: (r.text || '').length,
        links: (r.links || []).slice(0, 12),
        markdown: md.slice(0, MAX_SCRAPE),
        text: r.text.slice(0, Math.min(maxChars, 20000))
      });
    } catch (e) {
      return res.json({ ok: false, mode: 'scrape', error: e.message });
    }
  }

  if (mode === 'media') {
    try {
      const r = await self('/api/media/fetch', { method: 'POST', body: { url, downloadMode: (req.body.downloadMode || 'auto') } });
      const d = r.ok ? await r.json() : { ok: false, error: 'gateway HTTP ' + r.status };
      return res.json({ mode: 'media', ...d });
    } catch (e) {
      return res.json({ ok: false, mode: 'media', error: 'media engine unreachable: ' + e.message });
    }
  }

  const clipperPath = String((req.body && req.body.clipper_path) || '').trim();
  if (mode === 'clip' && clipperPath && !clipperPath.startsWith('/')) {
    return res.status(400).json({ ok: false, error: 'clipper_path must start with /' });
  }
  const safePath = (mode === 'clip')
    ? (clipperPath || '/')
    : '';
  if (safePath.includes('//') || safePath.includes('..')) {
    return res.status(400).json({ ok: false, error: 'clipper_path looks unsafe' });
  }
  try {
    const target = CLIPPER_ORIGIN + '/clipper' + safePath;
    const up = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'ShaddaiCapture/2.0', host: new URL(CLIPPER_ORIGIN).host },
      body: JSON.stringify(req.body && req.body.payload ? req.body.payload : {}),
      signal: AbortSignal.timeout(25000)
    });
    const text = await up.text();
    return res.status(up.status).json({ ok: up.ok, mode: 'clip', upstream: CLIPPER_ORIGIN, status: up.status, engine: text });
  } catch (e) {
    return res.status(502).json({ ok: false, mode: 'clip', upstream: CLIPPER_ORIGIN, error: 'clipper unreachable: ' + e.message });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const d = await (await self('/api/media/status')).json();
    res.json({ ok: true, audit: d.audit, requestIp: clientIp(req) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;