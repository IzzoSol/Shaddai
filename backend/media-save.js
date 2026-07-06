'use strict';
// ============================================================================
// Media persistence — saves generated images/video to disk so they don't vanish.
// The Media Gallery was storing raw provider URLs (fal/HF links EXPIRE) or giant
// data-URIs (which blow the localStorage quota). This downloads/decodes the media
// once and writes it to public/assets/gallery/, returning a stable local path.
// Mounted at /api/media.
// ============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const GALLERY_DIR = path.join(__dirname, '..', 'public', 'assets', 'gallery');

// POST /api/media/save  { data: <data-URI | http(s) URL>, type?, ext? }
// → { ok, path: '/assets/gallery/<file>', bytes }
router.post('/save', express.json({ limit: '30mb' }), async (req, res) => {
  try {
    const { data, type = 'image', ext = 'png' } = req.body || {};
    if (!data || typeof data !== 'string') return res.status(400).json({ ok: false, error: 'data (data-URI or URL) required' });

    let buf, guessedExt = ext;
    if (/^data:/i.test(data)) {
      const m = data.match(/^data:([^;,]+)[^,]*,(.*)$/s);
      if (!m) return res.status(400).json({ ok: false, error: 'malformed data URI' });
      buf = Buffer.from(m[2], /;base64/i.test(data) ? 'base64' : 'utf8');
      const mime = m[1] || '';
      if (/png/.test(mime)) guessedExt = 'png';
      else if (/jpe?g/.test(mime)) guessedExt = 'jpg';
      else if (/webp/.test(mime)) guessedExt = 'webp';
      else if (/gif/.test(mime)) guessedExt = 'gif';
      else if (/mp4/.test(mime)) guessedExt = 'mp4';
    } else if (/^https?:\/\//i.test(data)) {
      const r = await fetch(data, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error('source fetch failed: HTTP ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      if (/png/.test(ct)) guessedExt = 'png';
      else if (/jpe?g/.test(ct)) guessedExt = 'jpg';
      else if (/webp/.test(ct)) guessedExt = 'webp';
      else if (/mp4/.test(ct)) guessedExt = 'mp4';
    } else {
      return res.status(400).json({ ok: false, error: 'data must be a data: URI or http(s) URL' });
    }

    if (!buf || buf.length < 64) throw new Error('empty/invalid media');
    const safeExt = /^(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav)$/.test(guessedExt) ? guessedExt : 'png';
    fs.mkdirSync(GALLERY_DIR, { recursive: true });
    const name = `${String(type).replace(/[^a-z0-9]/gi, '') || 'media'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    fs.writeFileSync(path.join(GALLERY_DIR, name), buf);
    res.json({ ok: true, path: '/assets/gallery/' + name, bytes: buf.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

module.exports = router;
