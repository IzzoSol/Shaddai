// swarm-markdown.js — 7-agent TuFish sentiment verdict for Telegram (/swarm)
// Mirrors the terminal's SWARM_AGENTS so the phone sees the same calls.
const http = require('http');

const AGENTS = [
  { n: 'Momentum', glyph: '\u{1F3C3}', f: (v) => {
    if (v.s >= 5) return { side: 'long', conf: Math.min(1, 0.5 + Math.abs(v.s) / 110), note: 'headline flow green' };
    if (v.s <= -5) return { side: 'short', conf: Math.min(1, 0.5 + Math.abs(v.s) / 110), note: 'tape turned red' };
    return { side: 'flat', conf: 0.4, note: 'chop no thrust' };
  } },
  { n: 'Value', glyph: '\u{1F4C9}', f: (v) => {
    if (v.mk && v.mk.change24h < -1 && v.s > 0) return { side: 'long', conf: 0.62, note: 'dip + good news' };
    if (v.s >= 15) return { side: 'long', conf: 0.55, note: 'sturdy tape' };
    if (v.s <= -15) return { side: 'short', conf: 0.52, note: 'weak narrative' };
    return { side: 'flat', conf: 0.45, note: 'no edge' };
  } },
  { n: 'Sentinel', glyph: '\u{1F6A8}', f: (v) => {
    if (!v.meta.news || v.meta.news < 3) return { side: 'flat', conf: 0.35, note: 'thin tape' };
    if (v.pol === 'negative') return { side: 'short', conf: Math.min(1, 0.5 + Math.abs(v.s) / 90), note: 'negative loop' };
    if (v.pol === 'positive') return { side: 'long', conf: Math.min(1, 0.5 + Math.abs(v.s) / 90), note: 'clean positive' };
    return { side: 'flat', conf: 0.4, note: 'mixed tape' };
  } },
  { n: 'Volume', glyph: '\u{1F4F3}', f: (v) => {
    if (v.mk && v.mk.change24h > 3 && v.s > 2) return { side: 'long', conf: 0.6, note: 'vol confirms +' + v.mk.change24h.toFixed(1) + '%' };
    if (v.mk && v.mk.change24h < -3 && v.s < 0) return { side: 'short', conf: 0.58, note: 'heavy flush' };
    if (v.meta.news >= 12 && v.s > 0) return { side: 'long', conf: 0.52, note: 'thick bid tape' };
    if (v.meta.news >= 12 && v.s < 0) return { side: 'short', conf: 0.5, note: 'thick ask tape' };
    return { side: 'flat', conf: 0.42, note: 'thin tape' };
  } },
  { n: 'Whale', glyph: '\u{1F40B}', f: (v) => {
    if (v.s > 50) return { side: 'short', conf: 0.55, note: 'fade the top' };
    if (v.s < -50) return { side: 'long', conf: 0.55, note: 'buy the washout' };
    if (v.s >= 10) return { side: 'long', conf: 0.48, note: 'quiet long' };
    if (v.s <= -10) return { side: 'short', conf: 0.46, note: 'quiet short' };
    return { side: 'flat', conf: 0.5, note: 'no crowd' };
  } },
  { n: 'Fearless', glyph: '\u{2694}\u{FE0F}', f: (v) => {
    if (v.s >= 2) return { side: 'long', conf: Math.min(1, 0.62 + Math.abs(v.s) / 80), note: 'first mover' };
    if (v.s <= -2) return { side: 'short', conf: Math.min(1, 0.6 + Math.abs(v.s) / 80), note: 'no hesitation' };
    return { side: 'flat', conf: 0.4, note: 'flat conviction' };
  } },
  { n: 'Sage', glyph: '\u{1F33F}', f: (v) => {
    const mkBlend = v.mk ? Math.max(-40, Math.min(40, v.mk.change24h * 2)) : 0;
    const raw = v.s * 0.7 + mkBlend * 0.3;
    const conf = 0.4 + v.conf * 0.35 + Math.min(0.2, v.m / 60);
    if (raw >= 8) return { side: 'long', conf: Math.min(1, conf), note: 'news+price agree' };
    if (raw <= -8) return { side: 'short', conf: Math.min(1, conf), note: 'both tapes against' };
    return { side: 'flat', conf: 0.5, note: 'divergent tapes' };
  } }
];

function fetchJSON(path) {
  const port = process.env.PORT || 3000;
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 12000 }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; if (b.length > 2e6) req.destroy(); });
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad json')); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function swarmVerdict(q) {
  const data = await fetchJSON('/api/tufish/sentiment?q=' + encodeURIComponent(String(q || '').trim()));
  if (!data || data.ok === false) return { error: (data && (data.message || data.error)) || 'sentiment engine gave nothing' };
  const v = { s: data.score || 0, m: data.magnitude || 0, conf: data.confidence || 0, pol: data.polarity || 'neutral', meta: data.meta || {}, mk: data.market || null };
  const votes = AGENTS.map((a) => { const r = a.f(v); return { name: a.n, glyph: a.g, side: r.side, conf: Math.min(1, Math.max(0, r.conf)), note: r.note }; });
  const longs = votes.filter((x) => x.side === 'long').length;
  const shorts = votes.filter((x) => x.side === 'short').length;
  const flats = votes.length - longs - shorts;
  const lead = longs > shorts ? 'long' : (shorts > longs ? 'short' : 'flat');
  const strong = Math.max(longs, shorts) >= 5;
  const lbl = lead === 'long' ? (strong ? 'STRONG BULL' : 'BULLISH') : (lead === 'short' ? (strong ? 'STRONG BEAR' : 'BEARISH') : 'NEUTRAL');
  const mk = data.market || null;
  const moods = { long: '🟢', short: '🔴', flat: '⚪' };
  const lines = votes.map((x) => (moods[x.side] || '') + ' <b>' + x.name + '</b> ' + x.side.toUpperCase() + ' ' + Math.round(x.conf * 100) + '% — ' + esc(x.note));
  const head = (data.headlines || [])
    .filter((h) => h.label === 'pos' || h.label === 'neg')
    .slice(0, 3)
    .map((h) => '  ' + (h.label === 'pos' ? '▲' : '▼') + ' ' + esc((h.title || '').slice(0, 90)) + ' — <i>' + esc(h.source || '') + '</i>');
  const emoji = lead === 'long' ? (strong ? '🚨' : '🚀') : (lead === 'short' ? (strong ? '🛑' : '📉') : '🪙');
  return {
    markdown: emoji + ' <b>SWARM · ' + esc(data.q || q).toUpperCase() + ' → ' + lbl + '</b>  <code>' + longs + '/' + shorts + '/' + flats + '</code>\n' +
      'score <b>' + data.score + '</b> · ' + esc(data.polarity || 'neutral') + ' · mag ' + data.magnitude + ' · conf ' + Math.round((data.confidence || 0) * 100) + '%' +
      (mk ? ' · <b>' + esc(mk.symbol || mk.id) + '</b> $' + Number(mk.price) + ' (' + (Number(mk.change24h) > 0 ? '+' : '') + Number(mk.change24h).toFixed(2) + '%)' : '') +
      (data.meta && data.meta.news ? ' · ' + data.meta.news + ' headlines' : '') + '\n\n' +
      lines.join('\n') +
      (head.length ? '\n\n💬 <i>headline tape</i>\n' + head.join('\n') : '') +
      '\n\n🤖 Tune trade from phone 24/7'
  };
}

module.exports = { swarmVerdict, AGENTS };