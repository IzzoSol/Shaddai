/* world-buildings.js — Procedural buildings for SHADDAI World.
 *   window.buildWorldBuildings(THREE, scene, layout, heightAt, loader) → { update(t), markers }
 *
 * TURTLE pass v6 (2026-07-02) — FLOATING FIX + VISUAL OVERHAUL
 *
 * ROOT CAUSE OF ZEROX FLOAT:
 *   Every builder was using `fp * 0.46` as the entrance face radius — sized for SHADDAI's
 *   first octagonal tier. Box buildings (ZEROX, LIBRARY, MUSEUM, AEGIS) have face radii
 *   of fp*0.25–0.38. The door recess, columns, arch, and ground plaque were all placed
 *   8–12 units in front of the actual building wall, hanging in empty air. ZEROX (square
 *   box face at fp*0.35 vs fp*0.46 → 10-unit gap) was worst because it's side-on to the
 *   player and the gap was maximally visible.
 *
 * FIX:
 *   Each _build* now returns { topY, faceR } where faceR is the ACTUAL facade radius.
 *   decorate(), addEntrance(), _doorRecess(), and addGroundPlaque() all accept faceR.
 *
 * VISUAL OVERHAUL:
 *   • buildPalette() adds `body` (very dark graphite + 18% primary tint) — replaces
 *     raw `pal.primary` or muddy structural blends as the main building material.
 *   • Belt courses: thin emissive bands every ~8-10 units up each tower.
 *   • Greeble panels: InstancedMesh of shallow recessed quads on major facades.
 *   • Each building has a distinct silhouette + meaningful crown detail.
 *   • Emissive values constrained (body ≤0.05, crown ≤0.22) — no neon soup.
 *
 * PERFORMANCE:
 *   InstancedMesh for ribs, windows, greeble panels, colonnade, fins.
 *   0 per-building PointLights. No per-frame allocations in update().
 *   ≤16 draw calls per building × 8 buildings.
 */
window.buildWorldBuildings = function (THREE, scene, layout, heightAt, loader, onComplete) {
  try { window.__scene = scene; } catch (e) {}   // expose for collision-footprint measuring + diagnostics
  var _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var _now = function(){ return (typeof performance !== 'undefined' ? performance.now() : Date.now()); };
  var _PERF = false; try { _PERF = /[?&]perf\b/.test(location.search); } catch (e) {}
  // Chunked scheduler: build the heavy towers a few frames apart so the intro warp RAF never
  // freezes on one giant synchronous pass. requestAnimationFrame keeps chunks aligned to the
  // paint loop; falls back to setTimeout in non-browser/headless contexts.
  var _raf = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : function (f) { return setTimeout(f, 16); };
  // whenReady — resolves when every tower + all post-build steps (facade textures + bounds/
  // frustum pass) are done. Callers can await it OR pass onComplete. Both fire together.
  var _readyResolve = null;
  var whenReady = (typeof Promise !== 'undefined') ? new Promise(function (res) { _readyResolve = res; }) : null;
  const gy       = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const spinners  = [];
  const markers   = [];
  const landmarks = [];
  const trimRings = [];

  // ── NEXUS LOUNGE LIVE SCREENS (charts + news) ──────────────────────────────
  // A wall of 3D "screens" (canvas-textured planes) in the NEXUS lounge showing
  // REAL data: 3 live price charts (BTC/ETH/SOL from /api/markets/ohlc) + 2
  // vertically-scrolling news tickers (/api/news/crypto). ONE shared fetch feeds
  // every screen (no per-screen API calls); results are cached and refreshed on a
  // timer. Charts repaint only when fresh data lands (~every 60s); the news
  // tickers repaint at ~10fps for smooth scroll. All work is skipped unless the
  // player is near the lounge. If an endpoint fails the screen shows "— offline —"
  // (honest) — prices/headlines are never invented.
  const SCREEN_COINS = ['bitcoin', 'ethereum', 'solana'];

  // Generalized live-screen state: MANY lounges, ONE shared batched fetch layer.
  // Each agent lounge registers its own screens + centre position (independent
  // near-gate). Data is cached per CATEGORY (coins/news/fear/trending/wiki/cve)
  // and each category is pulled at most once / 60s, and only while at least one
  // near lounge actually needs it. Prices/headlines/CVEs are never invented — on
  // failure the *Err flag drives an honest "— offline —" placeholder.
  const screenState = {
    lounges: [],                                    // [{ code, pos:{x,z}, accent, screens:[] }]
    data: {
      coins: {}, coinErr: {},                       // /api/markets/ohlc            (charts)
      news: null, newsSource: 'CRYPTO', newsErr: false, // /api/news/crypto          (tickers)
      fear: null, fearErr: false,                   // tools/run get_fear_greed      (gauge)
      trending: null, trendErr: false,              // tools/run get_trending        (list)
      wiki: null, wikiErr: false,                   // tools/run get_wikipedia_summary
      cve: null, cveErr: false,                     // tools/run cve_lookup          (threats)
    },
    cat: {},                                        // per-category { last:-1e9, busy:false }
    lastDraw: -1e9,
  };
  try { window.__nexusScreens = screenState; } catch (e) {}   // legacy diagnostics alias

  // POST /api/tools/run helper (shared by fear/trending/wiki/cve categories).
  function _toolRun(tool, args) {
    return fetch('/api/tools/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args ? { tool, args } : { tool }),
    }).then(r => r.json());
  }

  // One fetcher per data CATEGORY. Each resolves AFTER caching (data or *Err flag).
  const CAT_FETCH = {
    coins: () => Promise.all(SCREEN_COINS.map(id =>
      fetch('/api/markets/ohlc?symbol=' + id).then(r => r.json()).then(j => {
        if (j && j.ok && Array.isArray(j.candles) && j.candles.length) {
          screenState.data.coins[id] = j; screenState.data.coinErr[id] = false;
        } else { screenState.data.coinErr[id] = true; }
      }).catch(() => { screenState.data.coinErr[id] = true; }))),
    news: () => fetch('/api/news/crypto').then(r => r.json()).then(j => {
      if (j && j.ok && Array.isArray(j.news) && j.news.length) {
        screenState.data.news = j.news; screenState.data.newsSource = j.source || 'CRYPTO'; screenState.data.newsErr = false;
      } else { screenState.data.newsErr = true; }
    }).catch(() => { screenState.data.newsErr = true; }),
    fear: () => _toolRun('get_fear_greed').then(j => {
      const r = j && j.ok && j.result;
      if (r && r.today && r.today.score != null) { screenState.data.fear = r; screenState.data.fearErr = false; }
      else { screenState.data.fearErr = true; }
    }).catch(() => { screenState.data.fearErr = true; }),
    trending: () => _toolRun('get_trending').then(j => {
      if (j && j.ok && Array.isArray(j.result) && j.result.length) { screenState.data.trending = j.result; screenState.data.trendErr = false; }
      else { screenState.data.trendErr = true; }
    }).catch(() => { screenState.data.trendErr = true; }),
    wiki: () => _toolRun('get_wikipedia_summary', { topic: 'Bitcoin' }).then(j => {
      if (j && j.ok && typeof j.result === 'string' && j.result.length) { screenState.data.wiki = j.result; screenState.data.wikiErr = false; }
      else { screenState.data.wikiErr = true; }
    }).catch(() => { screenState.data.wikiErr = true; }),
    cve: () => _toolRun('cve_lookup', { keyword: 'openssl' }).then(j => {
      let r = j && j.ok && j.result;
      if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
      if (r && Array.isArray(r.cves) && r.cves.length) { screenState.data.cve = r; screenState.data.cveErr = false; }
      else { screenState.data.cveErr = true; }
    }).catch(() => { screenState.data.cveErr = true; }),
  };

  // kind → data category. null = client-only (gallery loads local images, no fetch).
  const KIND_CAT = { chart: 'coins', news: 'news', fear: 'fear', trending: 'trending', wiki: 'wiki', cve: 'cve', gallery: null };

  // Fetch ONE category (throttled to 60s, de-duped across all lounges), then
  // repaint just that category's screens when fresh data lands.
  function _screenFetchCat(cat, t) {
    if (!cat) return;
    const st = screenState.cat[cat] || (screenState.cat[cat] = { last: -1e9, busy: false });
    if (st.busy || (t - st.last) < 60 || typeof fetch !== 'function') return;
    st.busy = true; st.last = t;
    CAT_FETCH[cat]().then(() => { st.busy = false; _screenRedrawCat(cat); });
  }

  // Draw an "offline / loading" placeholder (never fake data).
  function _screenPlaceholder(s, msg) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent || '#38e1ff'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = '#5a6b82'; c.font = 'bold 26px "Share Tech Mono", monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(msg, W / 2, H / 2);
    s.tex.needsUpdate = true;
  }

  // Draw a live price chart (area+line of candle closes) onto the screen canvas.
  function _drawChart(s) {
    const feed = screenState.data.coins[s.coin];
    if (!feed) { _screenPlaceholder(s, screenState.data.coinErr[s.coin] ? '— offline —' : 'loading…'); return; }
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    const closes = feed.candles.map(k => k.c);
    let lo = Infinity, hi = -Infinity;
    for (const v of closes) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi > lo)) hi = lo + 1;
    const up = (feed.change24h || 0) >= 0;
    const line = up ? '#39ff9e' : '#ff5d6c';
    const padT = 84, padB = 30, padX = 18;
    const plotW = W - padX * 2, plotH = H - padT - padB;
    const X = i => padX + (i / (closes.length - 1)) * plotW;
    const Y = v => padT + (1 - (v - lo) / (hi - lo)) * plotH;

    // background + frame
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    // grid
    c.strokeStyle = 'rgba(120,150,190,0.14)'; c.lineWidth = 1;
    for (let g = 0; g <= 3; g++) { const gy2 = padT + (g / 3) * plotH; c.beginPath(); c.moveTo(padX, gy2); c.lineTo(W - padX, gy2); c.stroke(); }
    // header
    const fmt = n => n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US')
                   : n >= 1    ? '$' + n.toFixed(2)
                               : '$' + n.toFixed(4);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = s.accent; c.font = 'bold 34px Orbitron, monospace';
    c.fillText((feed.symbol || s.coin).toUpperCase(), 22, 46);
    c.fillStyle = '#eaf3ff'; c.font = 'bold 30px "Share Tech Mono", monospace';
    c.fillText(fmt(feed.price), 22, 74);
    c.fillStyle = line; c.font = 'bold 24px "Share Tech Mono", monospace'; c.textAlign = 'right';
    c.fillText((up ? '▲ +' : '▼ ') + (feed.change24h || 0).toFixed(2) + '%', W - 22, 60);
    // area fill
    c.beginPath(); c.moveTo(X(0), Y(closes[0]));
    for (let i = 1; i < closes.length; i++) c.lineTo(X(i), Y(closes[i]));
    c.lineTo(X(closes.length - 1), padT + plotH); c.lineTo(X(0), padT + plotH); c.closePath();
    const grad = c.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, up ? 'rgba(57,255,158,0.34)' : 'rgba(255,93,108,0.34)');
    grad.addColorStop(1, 'rgba(6,10,20,0.02)');
    c.fillStyle = grad; c.fill();
    // line
    c.beginPath(); c.moveTo(X(0), Y(closes[0]));
    for (let i = 1; i < closes.length; i++) c.lineTo(X(i), Y(closes[i]));
    c.strokeStyle = line; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
    // last-price dot
    const lx = X(closes.length - 1), ly = Y(closes[closes.length - 1]);
    c.fillStyle = line; c.beginPath(); c.arc(lx, ly, 5, 0, Math.PI * 2); c.fill();
    // footer
    c.fillStyle = '#5a6b82'; c.font = '16px "Share Tech Mono", monospace'; c.textAlign = 'left';
    c.fillText('LIVE · 24h · ' + closes.length + ' pts', 22, H - 12);
    s.tex.needsUpdate = true;
  }

  // Draw the scrolling news ticker onto the screen canvas.
  function _drawNews(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    // header band
    c.fillStyle = 'rgba(56,225,255,0.10)'; c.fillRect(6, 6, W - 12, 54);
    c.fillStyle = s.accent; c.font = 'bold 30px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('◈ ' + (screenState.data.newsSource || 'CRYPTO') + ' NEWS', 22, 34);

    const news = screenState.data.news;
    if (!news) { _screenPlaceholder(s, screenState.data.newsErr ? '— offline —' : 'loading…'); return; }

    const top = 72, bottom = H - 10, viewH = bottom - top;
    const rowH = 74;                                   // headline block height (2 lines)
    const total = news.length * rowH;
    c.save();
    c.beginPath(); c.rect(6, top, W - 12, viewH); c.clip();
    const off = ((s.scroll % total) + total) % total;
    // draw two passes so the list loops seamlessly
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < news.length; i++) {
        const y = top + i * rowH - off + pass * total;
        if (y > bottom || y + rowH < top) continue;
        const item = news[i];
        c.fillStyle = s.accent; c.font = 'bold 22px "Share Tech Mono", monospace';
        c.fillText('▸', 20, y + rowH / 2 - 10);
        c.fillStyle = '#eaf3ff'; c.font = '21px "Share Tech Mono", monospace';
        _wrapText(c, item.title || '', 44, y + 14, W - 60, 24, 2);
      }
    }
    c.restore();
    s.tex.needsUpdate = true;
  }

  // Word-wrap helper for the news ticker (max `maxLines`, ellipsis on overflow).
  function _wrapText(c, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/);
    let line = '', row = 0;
    for (let n = 0; n < words.length; n++) {
      const test = line ? line + ' ' + words[n] : words[n];
      if (c.measureText(test).width > maxW && line) {
        c.fillText(line, x, y + row * lh); line = words[n]; row++;
        if (row === maxLines - 1) {
          // last allowed line — squeeze the remainder + ellipsis
          let rest = words.slice(n).join(' ');
          while (rest && c.measureText(rest + '…').width > maxW) rest = rest.slice(0, -1);
          c.fillText(rest + '…', x, y + row * lh); return;
        }
      } else { line = test; }
    }
    c.fillText(line, x, y + row * lh);
  }

  // ── ZEROX: FEAR & GREED gauge (get_fear_greed) ─────────────────────────────
  function _drawFear(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = s.accent; c.font = 'bold 30px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText('◈ FEAR & GREED', 22, 44);
    const d = screenState.data.fear;
    if (!d) { _screenPlaceholder(s, screenState.data.fearErr ? '— offline —' : 'loading…'); return; }
    const score = Math.max(0, Math.min(100, parseInt(d.today.score, 10) || 0));
    const label = d.today.label || '';
    const col = score < 25 ? '#ff5d6c' : score < 45 ? '#ff9f43' : score < 55 ? '#ffd24a' : score < 75 ? '#7ed957' : '#39ff9e';
    const cx = W / 2, cy = H - 68, R = 148;
    c.lineWidth = 22; c.lineCap = 'round';
    c.strokeStyle = 'rgba(120,150,190,0.18)';
    c.beginPath(); c.arc(cx, cy, R, Math.PI, 2 * Math.PI); c.stroke();
    c.strokeStyle = col;
    c.beginPath(); c.arc(cx, cy, R, Math.PI, Math.PI + Math.PI * (score / 100)); c.stroke();
    c.fillStyle = '#eaf3ff'; c.font = 'bold 74px Orbitron, monospace'; c.textAlign = 'center';
    c.fillText(String(score), cx, cy - 6);
    c.fillStyle = col; c.font = 'bold 26px "Share Tech Mono", monospace';
    c.fillText(label.toUpperCase(), cx, cy + 30);
    c.fillStyle = '#5a6b82'; c.font = '15px "Share Tech Mono", monospace';
    c.fillText('alternative.me · ZEROX live', cx, H - 14);
    s.tex.needsUpdate = true;
  }

  // ── ORACLE: TRENDING list (get_trending) ───────────────────────────────────
  function _drawTrending(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = 'rgba(120,90,255,0.10)'; c.fillRect(6, 6, W - 12, 54);
    c.fillStyle = s.accent; c.font = 'bold 28px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('◈ TRENDING NOW', 22, 34);
    const list = screenState.data.trending;
    if (!list) { _screenPlaceholder(s, screenState.data.trendErr ? '— offline —' : 'loading…'); return; }
    c.textBaseline = 'alphabetic';
    const rows = Math.min(7, list.length), top = 90, rowH = 32;
    for (let i = 0; i < rows; i++) {
      const it = list[i], y = top + i * rowH;
      c.fillStyle = s.accent; c.font = 'bold 22px "Share Tech Mono", monospace'; c.textAlign = 'left';
      c.fillText((i + 1) + '.', 22, y);
      c.fillStyle = '#eaf3ff'; c.font = '21px "Share Tech Mono", monospace';
      let name = it.name || it.symbol || '';
      if (name.length > 22) name = name.slice(0, 21) + '…';
      c.fillText(name, 66, y);
      c.fillStyle = s.accent; c.font = 'bold 20px "Share Tech Mono", monospace'; c.textAlign = 'right';
      c.fillText(String(it.symbol || '').toUpperCase(), W - 22, y);
    }
    c.fillStyle = '#5a6b82'; c.font = '15px "Share Tech Mono", monospace'; c.textAlign = 'left';
    c.fillText('ORACLE · market signals', 22, H - 14);
    s.tex.needsUpdate = true;
  }

  // ── ORACLE: RESEARCH BRIEF (get_wikipedia_summary) ─────────────────────────
  function _drawWiki(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = s.accent; c.font = 'bold 26px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText('◈ RESEARCH BRIEF', 22, 42);
    const txt = screenState.data.wiki;
    if (!txt) { _screenPlaceholder(s, screenState.data.wikiErr ? '— offline —' : 'loading…'); return; }
    c.fillStyle = '#cfe0f5'; c.font = '20px "Share Tech Mono", monospace';
    _wrapText(c, txt, 22, 78, W - 44, 27, 8);
    c.fillStyle = '#5a6b82'; c.font = '15px "Share Tech Mono", monospace';
    c.fillText('Wikipedia · ORACLE intel', 22, H - 14);
    s.tex.needsUpdate = true;
  }

  // ── PIKADON: THREAT MONITOR (cve_lookup) — board (static) or scroll ticker ──
  function _drawCve(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#0a0608'; c.fillRect(0, 0, W, H);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = 'rgba(255,60,60,0.10)'; c.fillRect(6, 6, W - 12, 54);
    c.fillStyle = s.accent; c.font = 'bold 26px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('⚠ THREAT MONITOR', 22, 34);
    const d = screenState.data.cve;
    if (!d) { _screenPlaceholder(s, screenState.data.cveErr ? '— offline —' : 'loading…'); return; }
    const cves = d.cves;
    const sevCol = sv => /crit/i.test(sv) ? '#ff3b3b' : /import|high/i.test(sv) ? '#ff8c3b' : /mod|medium/i.test(sv) ? '#ffd24a' : '#7ed957';
    c.textBaseline = 'alphabetic';
    if (s.mode === 'scroll') {
      const top = 72, bottom = H - 28, viewH = bottom - top, rowH = 64, total = Math.max(1, cves.length * rowH);
      c.save(); c.beginPath(); c.rect(6, top, W - 12, viewH); c.clip();
      const off = ((s.scroll % total) + total) % total;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < cves.length; i++) {
        const y = top + i * rowH - off + pass * total;
        if (y > bottom || y + rowH < top) continue;
        const it = cves[i];
        c.fillStyle = sevCol(it.severity); c.font = 'bold 20px "Share Tech Mono", monospace'; c.textAlign = 'left';
        c.fillText('● ' + (it.cve || ''), 20, y + 20);
        c.fillStyle = '#9fb0c6'; c.font = '15px "Share Tech Mono", monospace';
        c.fillText('CVSS ' + (it.cvss || '?') + '   ' + String(it.severity || '').toUpperCase(), 22, y + 42);
      }
      c.restore();
    } else {
      const rows = Math.min(6, cves.length), top = 88, rowH = 40;
      for (let i = 0; i < rows; i++) {
        const it = cves[i], y = top + i * rowH;
        c.fillStyle = sevCol(it.severity); c.fillRect(20, y - 16, 10, 24);
        c.fillStyle = '#eaf3ff'; c.font = 'bold 19px "Share Tech Mono", monospace'; c.textAlign = 'left';
        c.fillText(it.cve || '', 42, y);
        c.fillStyle = sevCol(it.severity); c.font = 'bold 17px "Share Tech Mono", monospace'; c.textAlign = 'right';
        c.fillText((it.cvss || '?') + ' · ' + String(it.severity || '').toUpperCase(), W - 22, y);
      }
    }
    c.fillStyle = '#5a6b82'; c.font = '15px "Share Tech Mono", monospace'; c.textAlign = 'left';
    c.fillText('Red Hat CVE · "' + (d.query || '') + '" · ' + (d.count || cves.length) + ' active', 22, H - 12);
    s.tex.needsUpdate = true;
  }

  // ── TURTLE: GALLERY — cycles real archetype artwork (/assets/forge-models) ──
  const GALLERY_ART = ['artisan', 'ghost', 'oracle', 'vanguard', 'psionic', 'street-deity', 'harvester', 'gaia-link']
    .map(n => '/assets/forge-models/' + n + '-art.jpg');
  function _galleryInit(s, start) {
    s.gIdx = (start || 0) % GALLERY_ART.length;
    s.gPrev = null; s.gImg = null; s.gErr = false; s.gLoading = false;
  }
  function _galleryLoad(s) {
    if (s.gLoading || typeof Image === 'undefined') return;
    s.gLoading = true;
    const img = new Image();
    img.onload  = () => { s.gLoading = false; s.gImg = img; s.gErr = false; _drawGallery(s); };
    img.onerror = () => { s.gLoading = false; s.gImg = null; s.gErr = true;  _drawGallery(s); };
    img.src = GALLERY_ART[s.gIdx % GALLERY_ART.length];
  }
  function _galleryTick(s, t) {
    if (s.gPrev === null) { s.gPrev = t; _galleryLoad(s); return; }   // load first frame
    if (t - s.gPrev > 4.0) { s.gPrev = t; s.gIdx = (s.gIdx + 1) % GALLERY_ART.length; s.gImg = null; _galleryLoad(s); }
    else if (!s.gImg && !s.gLoading && !s.gErr) _galleryLoad(s);
  }
  function _drawGallery(s) {
    const c = s.ctx, W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = '#07060a'; c.fillRect(0, 0, W, H);
    if (!s.gImg) {
      c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
      c.fillStyle = '#5a6b82'; c.font = 'bold 24px "Share Tech Mono", monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(s.gErr ? '— offline —' : 'loading…', W / 2, H / 2);
      s.tex.needsUpdate = true; return;
    }
    const iw = s.gImg.width || 1, ih = s.gImg.height || 1;
    const scale = Math.max(W / iw, H / ih), dw = iw * scale, dh = ih * scale;
    c.drawImage(s.gImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const gr = c.createLinearGradient(0, H - 96, 0, H);
    gr.addColorStop(0, 'rgba(7,6,10,0)'); gr.addColorStop(1, 'rgba(7,6,10,0.85)');
    c.fillStyle = gr; c.fillRect(0, H - 96, W, 96);
    c.strokeStyle = s.accent; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = s.accent; c.font = 'bold 22px Orbitron, monospace';
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText('◈ TURTLE GALLERY', 20, 40);
    const name = (GALLERY_ART[s.gIdx % GALLERY_ART.length].split('/').pop() || '').replace('-art.jpg', '').replace(/-/g, ' ').toUpperCase();
    c.fillStyle = '#eaf3ff'; c.font = 'bold 26px "Share Tech Mono", monospace';
    c.fillText(name, 20, H - 26);
    s.tex.needsUpdate = true;
  }

  // Draw dispatch by kind.
  function _drawScreen(s) {
    switch (s.kind) {
      case 'chart':    return _drawChart(s);
      case 'news':     return _drawNews(s);
      case 'fear':     return _drawFear(s);
      case 'trending': return _drawTrending(s);
      case 'wiki':     return _drawWiki(s);
      case 'cve':      return _drawCve(s);
      case 'gallery':  return _drawGallery(s);
    }
  }

  // Repaint every screen bound to a data category (called when fresh data lands).
  function _screenRedrawCat(cat) {
    for (const lg of screenState.lounges) for (const s of lg.screens)
      if (KIND_CAT[s.kind] === cat) _drawScreen(s);
  }

  // Per-frame tick (from update): per-lounge near-gate + batched category fetch +
  // cheap animation of the moving screens only (news/cve scroll, gallery cycle).
  const SCREEN_NEAR2 = 210 * 210;
  function _screenTick(t) {
    if (!screenState.lounges.length) return;
    const p = (typeof window !== 'undefined') ? window._playerPos : null;
    const anim = (t - screenState.lastDraw > 0.1);
    if (anim) screenState.lastDraw = t;
    for (const lg of screenState.lounges) {
      if (p && lg.pos) {                              // far lounge → skip all its work
        const dx = p.x - lg.pos.x, dz = p.z - lg.pos.z;
        if (dx * dx + dz * dz > SCREEN_NEAR2) continue;
      }
      for (const s of lg.screens) {                   // pull each needed category (throttled+deduped)
        const cat = KIND_CAT[s.kind];
        if (cat) _screenFetchCat(cat, t);
        if (cat === null && s.kind === 'gallery' && anim) _galleryTick(s, t);
      }
      if (anim) for (const s of lg.screens) {          // scroll the ticker screens (~10fps)
        if (s.kind === 'news' || (s.kind === 'cve' && s.mode === 'scroll')) { s.scroll += 15; _drawScreen(s); }
      }
    }
  }

  // Which themed screens each agent lounge gets (verified live endpoints only).
  const LOUNGE_SCREENS = {
    'nexus-hub':        [{ kind: 'chart', coin: 'bitcoin' }, { kind: 'news' }, { kind: 'chart', coin: 'ethereum' }, { kind: 'news' }, { kind: 'chart', coin: 'solana' }],
    'markets-exchange': [{ kind: 'chart', coin: 'bitcoin' }, { kind: 'fear' }, { kind: 'chart', coin: 'ethereum' }],   // ZEROX
    'library':          [{ kind: 'news' }, { kind: 'news' }],                                                          // QUILL
    'oracle-spire':     [{ kind: 'trending' }, { kind: 'wiki' }],                                                      // ORACLE
    'museum':           [{ kind: 'gallery', start: 0 }, { kind: 'gallery', start: 3 }],                                // TURTLE
    'aegis':            [{ kind: 'cve', mode: 'board' }, { kind: 'cve', mode: 'scroll' }],                             // PIKADON
  };

  // Build one lounge's screen wall on an arc across the back of the lounge, each
  // screen facing the centre + framed with an emissive glow. Shared by all agents.
  function _buildLoungeScreens(code, x, z, groundY, undersideY, fp, pal, faceAng) {
    const layoutSpec = LOUNGE_SCREENS[code];
    if (!layoutSpec || !layoutSpec.length) return;
    const accent = hexColor(pal.trim.getHex());
    const lounge = { code, pos: { x, z }, accent, screens: [] };
    const n      = layoutSpec.length;
    const backA  = faceAng + Math.PI;                 // wall hangs opposite the entrance
    const span   = Math.min(Math.PI * 0.92, Math.PI * 0.30 * n);   // narrower arc for fewer screens
    // Screens ring: the lounge pillars sit at rP=fp*0.375 with a fat shaft (rS=max(3.4,fp*0.052)).
    // The pillars' widest INNER elements are the square plinth feet / abaci (box ≈ rS*3.1 → half
    // ≈ rS*1.55) and the flared echinus caps (rS*1.78), so the innermost pillar surface sits at
    // rP - rS*1.78. The old fp*0.32 ring put screens OUTSIDE that surface, so any screen that
    // lined up with a pillar punched straight through it (owner: "billboards glitched into the
    // pillars"). Seat the ring at min(fp*0.26, pillarInner - clearance) so screens clear the legs
    // AND the feet/caps at every angle and every building size — no clipping into the pillars.
    const _rP    = fp * 0.375;                          // pillar ring radius (mirror of _buildPillarPavilion)
    const _rS    = Math.max(3.4, fp * 0.052);           // fat shaft radius
    const pillarInner = _rP - _rS * 1.78;               // innermost pillar surface (echinus cap)
    const sw     = fp * 0.150, sh = fp * 0.100;         // screen width / height
    // Ring must clear the pillar inner surface by at least half the screen's diagonal footprint
    // (screens are ~0.4 deep incl. bezel offsets) plus a comfort margin.
    const rW     = Math.max(fp * 0.16, Math.min(fp * 0.26, pillarInner - Math.max(3.0, fp * 0.03)));
    const clear  = undersideY - groundY;
    const yC     = groundY + Math.min(clear * 0.56, 9.5) + sh * 0.5;   // eye-level, under the podium

    const frameMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.15),
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    // Solid dark BEZEL behind each screen so it reads as a framed TV/monitor with a clean
    // border (owner: "add some borders around it"). A thin accent trim rim sits on its edge.
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x090c13, roughness: 0.7, metalness: 0.4 });
    const bezelRimMat = new THREE.MeshBasicMaterial({ color: pal.trim.clone(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

    for (let i = 0; i < n; i++) {
      const spec = layoutSpec[i];
      const a  = backA - span / 2 + (n === 1 ? span / 2 : span * (i / (n - 1)));
      const ox = Math.cos(a), oz = Math.sin(a);
      const px = x + ox * rW, pz = z + oz * rW;
      const rotY = Math.atan2(-ox, -oz);              // face the lounge centre

      // solid dark bezel border (a framed-TV look), with a thin accent trim rim on its face
      const bezel = new THREE.Mesh(new THREE.PlaneGeometry(sw * 1.24, sh * 1.32), bezelMat);
      bezel.position.set(px + ox * 0.14, yC, pz + oz * 0.14);
      bezel.rotation.y = rotY; bezel.renderOrder = 1; scene.add(bezel);
      const bezelRim = new THREE.Mesh(new THREE.PlaneGeometry(sw * 1.16, sh * 1.24), bezelRimMat);
      bezelRim.position.set(px + ox * 0.10, yC, pz + oz * 0.10);
      bezelRim.rotation.y = rotY; bezelRim.renderOrder = 1; scene.add(bezelRim);

      // emissive frame behind the screen (arcade glow)
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(sw * 1.10, sh * 1.16), frameMat);
      frame.position.set(px + ox * 0.25, yC, pz + oz * 0.25);
      frame.rotation.y = rotY; frame.renderOrder = 2; scene.add(frame);
      landmarks.push({ mat: frame.material, baseOpacity: 0.5, phase: i * 0.7 });

      // canvas + texture + screen plane
      const tall = (spec.kind === 'news' || spec.kind === 'cve');
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = tall ? 384 : 320;
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(sw, sh),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.set(px, yC, pz); screen.rotation.y = rotY; screen.renderOrder = 3; scene.add(screen);

      const s = { kind: spec.kind, coin: spec.coin, mode: spec.mode, canvas, ctx, tex, scroll: 0, accent };
      if (spec.kind === 'gallery') _galleryInit(s, spec.start);
      _screenPlaceholder(s, 'loading…');
      lounge.screens.push(s);
    }
    screenState.lounges.push(lounge);
  }

  // ── PILLAR-PAVILION LIFT (2026-07-05) ──────────────────────────────────────
  // Every agent building's mass is raised this many units so it stands HIGH on
  // huge pillars, with an open walk-through themed LOUNGE underneath at ground
  // level. Must match BUILD_LIFT in world-elevators.js (the lounge lift rides the
  // player from the ground lounge up to the building's elevated floor at this Y).
  const AGENT_LIFT = 46;

  // ── SHARED SCENE LIGHTS (one-time cost, all buildings) ───────────────────
  const _bldHemi = new THREE.HemisphereLight(0x2a3a5a, 0x050406, 0.22);
  scene.add(_bldHemi);
  const _bldDir  = new THREE.DirectionalLight(0xfff2cc, 0.32);
  _bldDir.position.set(120, 220, 90); _bldDir.castShadow = false;
  scene.add(_bldDir);

  const sec = (c) => (layout && layout.sector  && layout.sector(c))    || { pos: [0, 0], color: 0x27e0ff };
  const lmk = (id) => (layout && layout.landmark && layout.landmark(id)) || null;

  // ── COLOR HELPERS ─────────────────────────────────────────────────────────
  function hexColor(color) {
    const c = (typeof color === 'number') ? color : 0x27e0ff;
    return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  }

  // Palette: dark architectural base (body) + accent as trim/glow only.
  // body       — deep obsidian-graphite tinted 18% with primary; the main building mass.
  // primary    — full accent; used ONLY for emissive, never as diffuse body.
  // secondary  — hue-shifted complement; panels, ribs, accent plates.
  // structural — near-black; deep shadows, base plinths.
  // trim       — primary lightened; glowing seams, crown elements.
  function buildPalette(accentHex) {
    const primary    = new THREE.Color(accentHex || 0x27e0ff);
    const secondary  = primary.clone();
    { const h = {}; secondary.getHSL(h);
      secondary.setHSL((h.h + 0.10) % 1.0, Math.max(0.15, h.s * 0.68), Math.min(0.75, h.l * 1.15)); }
    const structural = new THREE.Color(0x030507).lerp(primary, 0.10);
    const body       = new THREE.Color(0x06090f).lerp(primary, 0.18);
    const trim       = primary.clone().lerp(new THREE.Color(0xffffff), 0.32);
    return { primary, secondary, structural, body, trim };
  }

  // ── PROCEDURAL CANVAS TEXTURES (free · offline · $0 — no network / no URLs) ─
  // Every map below is drawn ONCE with a 2D canvas and cached in _texCache, then
  // shared across all buildings (cloned only so each material can own its .repeat).
  // Grayscale by design → each building keeps its accent identity via the material's
  // own color / emissive. Used as map / roughnessMap / emissiveMap.  Zero cost,
  // zero requests: this works fully offline.
  const _texCache = {};
  function _mkCanvas(S) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    return cv;
  }
  function _finishTex(cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  // Stone / dressed masonry: fine speckle grain + staggered ashlar block courses.
  function _stoneTexture() {
    if (_texCache.stone) return _texCache.stone;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#8d8d92'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {                       // deterministic speckle (perf: was 3200, visually identical at tiled scale)
      const v = 118 + ((i * 2654435761) % 96);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',0.06)';
      const s = 1 + ((i * 13) % 3);
      g.fillRect((i * 97) % S, (i * 57) % S, s, s);
    }
    const rows = 8, rh = S / rows;
    g.lineWidth = 2; g.strokeStyle = 'rgba(18,18,22,0.55)';
    for (let r = 0; r <= rows; r++) {                      // horizontal mortar courses
      const y = Math.round(r * rh) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
    }
    for (let r = 0; r < rows; r++) {                       // staggered vertical joints
      const cols = 4, off = (r % 2) * (S / (cols * 2));
      for (let c = 0; c <= cols; c++) {
        const xx = ((c * S / cols) + off) % S + 0.5;
        g.beginPath(); g.moveTo(xx, r * rh); g.lineTo(xx, (r + 1) * rh); g.stroke();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.05)';                // top-edge block highlight
    for (let r = 0; r < rows; r++) g.fillRect(0, r * rh + 1, S, 1);
    return _texCache.stone = _finishTex(cv, true);
  }

  // Brushed / panelled metal: vertical brush streaks + riveted panel seams + bolts.
  function _metalTexture() {
    if (_texCache.metal) return _texCache.metal;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, S, S);
    g.lineWidth = 1;
    for (let i = 0; i < 800; i++) {                        // vertical brushing (perf: was 1600, same look tiled)
      const x = (i * 41) % S, v = 138 + ((i * 2246822519) % 82);
      g.strokeStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',0.05)';
      g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, S); g.stroke();
    }
    const px = 2, py = 3, pw = S / px, ph = S / py;        // panel seams
    g.lineWidth = 2; g.strokeStyle = 'rgba(26,28,34,0.65)';
    for (let a = 0; a <= px; a++) { const xx = Math.round(a * pw) + 0.5; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, S); g.stroke(); }
    for (let b = 0; b <= py; b++) { const yy = Math.round(b * ph) + 0.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(S, yy); g.stroke(); }
    g.fillStyle = 'rgba(20,22,28,0.7)';                    // corner bolts
    for (let a = 0; a <= px; a++) for (let b = 0; b <= py; b++) {
      g.beginPath(); g.arc(a * pw, b * ph, 2.4, 0, Math.PI * 2); g.fill();
    }
    return _texCache.metal = _finishTex(cv, true);
  }

  // Lit-window facade grid (emissive): rows of windows — some bright, some dim, some
  // dark → the building reads as INHABITED. White-ish so the material's emissive
  // color tints the glow to each building's accent.
  function _windowTexture() {
    if (_texCache.window) return _texCache.window;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    const cols = 6, rows = 8, cw = S / cols, ch = S / rows;
    const padX = cw * 0.26, padY = ch * 0.24;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const seed = ((r * 73 + c * 151) * 2654435761) >>> 0;
      const lit  = (seed % 1000) / 1000;
      if (lit < 0.22) continue;                            // vacant / dark window
      const b = lit < 0.55 ? 120 : (lit < 0.85 ? 190 : 246);
      g.fillStyle = 'rgb(' + b + ',' + Math.floor(b * 0.97) + ',' + Math.floor(b * 0.9) + ')';
      const wx = c * cw + padX, wy = r * ch + padY, ww = cw - padX * 2, wh = ch - padY * 2;
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; // mullion cross
      g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke();
      g.beginPath(); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
    }
    return _texCache.window = _finishTex(cv, false);
  }

  // Faint ornamental frieze — repeating chevron band for cornice / frieze detail.
  function _friezeTexture() {
    if (_texCache.frieze) return _texCache.frieze;
    const S = 128, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#c8c8d0'; g.lineWidth = 3; g.lineJoin = 'round';
    const n = 8, step = S / n;
    for (let i = 0; i < n; i++) {                          // zig-zag chevron run
      const x0 = i * step;
      g.beginPath();
      g.moveTo(x0, S * 0.72); g.lineTo(x0 + step * 0.5, S * 0.28); g.lineTo(x0 + step, S * 0.72);
      g.stroke();
    }
    g.beginPath(); g.moveTo(0, S * 0.86); g.lineTo(S, S * 0.86); g.stroke();
    g.beginPath(); g.moveTo(0, S * 0.14); g.lineTo(S, S * 0.14); g.stroke();
    return _texCache.frieze = _finishTex(cv, false);
  }

  // Carved-stone pillar RELIEF map — a real image generated by the world's own
  // image-gen tool (POST /api/image/generate, model:huggingface) and saved to
  // /assets/pillar-relief.jpg. Loaded ONCE, shared by every building's pillars and
  // tinted per-agent by the material colour. Fully guarded + silent onError so a
  // missing file can never break world load (the procedural carving carries it).
  function _reliefTexture() {
    if (_texCache.relief !== undefined) return _texCache.relief;
    _texCache.relief = null;
    try {
      var tl = new THREE.TextureLoader();
      var t  = tl.load('/assets/pillar-relief.jpg', undefined, undefined, function () { /* silent */ });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.repeat.set(2, 4);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      _texCache.relief = t;
    } catch (e) { _texCache.relief = null; }
    return _texCache.relief;
  }

  // ── SCENE MARKERS ─────────────────────────────────────────────────────────
  function groundMarker(x, z, color, radius) {
    const r    = radius || 30;
    // A THIN, STATIC seam hugging the building wall foot — NOT a big glowing
    // perimeter halo. (Owner: "no forcefield." The old marker was a wide pulsing
    // ring well outside the footprint that read like a shield dome.) It now sits
    // right at the wall, flush to the ground, faint, and does not pulse.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.90, r, 48),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy(x, z) + 0.05, z);
    ring.renderOrder = 2;
    scene.add(ring);
  }

  function accentTrimRing(x, z, color, roofY, footprint) {
    // Removed: this was a glowing torus HOVERING 0.5u above the roof that pulsed
    // and read as a floating halo / forcefield ring around the building.
    // (Owner: "no extra trim / no forcefield.") Roofline identity now comes from
    // each builder's own crown/cornice geometry, not a floating ring. No-op.
    return;
  }

  // ── LOW-LEVEL GEOMETRY HELPERS ────────────────────────────────────────────
  function _cyl(x, z, baseY, rTop, rBot, h, mat, segs) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs || 16), mat);
    m.position.set(x, baseY + h * 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return baseY + h;
  }
  function _dome(x, z, baseY, r, mat, segs) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, segs || 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.position.set(x, baseY, z);
    m.castShadow = true; scene.add(m);
    return baseY + r;
  }
  function _band(x, z, y, r, tube, pal) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 8, 64),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
        transparent: true, opacity: 0.52,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 3; scene.add(m);
  }
  function _box(x, z, baseY, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, baseY + h * 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); return baseY + h;
  }
  function _fins(x, z, baseY, topY, r, count, finW, finD, pal) {
    const H   = topY - baseY;
    const mat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.06,
      roughness: 0.62, metalness: 0.14,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(finW, H, finD), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      d.position.set(x + Math.cos(a) * r, baseY + H * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; scene.add(im);
  }
  function _battlements(x, z, y, r, count, mW, mH, mD, pal) {
    const mat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(pal.primary, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.04,
      roughness: 0.84, metalness: 0.04,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(mW, mH, mD), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      d.position.set(x + Math.cos(a) * r, y + mH * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // Belt courses: thin horizontal emissive bands every `step` units up a tower.
  // 1 InstancedMesh = 1 draw call regardless of belt count.
  function _beltCourses(x, z, baseY, topY, r, tube, step, pal) {
    const H     = topY - baseY;
    const count = Math.max(1, Math.floor(H / step));
    const mat   = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.10),
      transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im = new THREE.InstancedMesh(new THREE.TorusGeometry(r, tube, 6, 48), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const y = baseY + step * (i + 1);
      d.position.set(x, y, z);
      d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.renderOrder = 3; scene.add(im);
  }

  // ── MULLION STRIPS — vertical panel-joint extrusions on facades ─────────────
  // Real-geometry grid of vertical dividers. 1 IM = 1 draw call.
  // Adds tangible shadow-casting depth to what would otherwise be a flat wall.
  function _mullionStrips(x, z, baseY, topY, faceR, sides, cols, pal) {
    if (cols < 1) return;
    const H     = Math.max(1, topY - baseY);
    const thick = Math.max(0.20, faceR * 0.013);
    const depth = 0.36;
    const count = sides * cols;
    const mat   = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(pal.secondary, 0.18),
      emissive: pal.trim.clone(), emissiveIntensity: 0.028,
      roughness: 0.72, metalness: 0.18,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(thick, H, depth), mat, count);
    im.castShadow = true;
    const d  = new THREE.Object3D();
    let idx  = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      const faceW   = faceR * (Math.PI * 2 / sides) * 0.78;
      const spacing = faceW / Math.max(1, cols + 1);
      for (let c = 0; c < cols; c++) {
        const xOff = (c - (cols - 1) * 0.5) * spacing;
        d.position.set(
          x + cosF * (faceR + depth * 0.5) + cosP * xOff,
          baseY + H * 0.5,
          z + sinF * (faceR + depth * 0.5) + sinP * xOff
        );
        d.rotation.set(0, fa, 0); d.updateMatrix();
        im.setMatrixAt(idx++, d.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── EXHAUST STACKS — industrial rooftop chimneys / vent pipes ──────────────
  // count stacks placed deterministically on the roof. 2 IM (shaft + cap ring).
  function _exhaustStacks(x, z, roofY, fp, count, pal) {
    const h   = Math.max(3.5, fp * 0.090);
    const r   = Math.max(0.28, fp * 0.013);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(new THREE.Color(0x3a3a3a), 0.55),
      emissive: pal.primary.clone(), emissiveIntensity: 0.008,
      roughness: 0.88, metalness: 0.30,
    });
    const capMat = new THREE.MeshBasicMaterial({
      color: pal.trim, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im  = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.75, r, h, 8), mat, count);
    const cap = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(r * 1.28, r * 0.92, r * 0.48, 8), capMat, count);
    cap.renderOrder = 3; im.castShadow = true;
    const d    = new THREE.Object3D();
    const cols = Math.ceil(Math.sqrt(count));
    const sp   = fp * 0.11;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const ox  = (col - (cols - 1) * 0.5) * sp + (i % 3 - 1) * sp * 0.22;
      const oz  = (row - (Math.ceil(count / cols) - 1) * 0.5) * sp + (i % 2 - 0.5) * sp * 0.18;
      d.position.set(x + ox, roofY + h * 0.5, z + oz);
      d.rotation.set(0, (i * 1.13) % (Math.PI * 2), 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      d.position.set(x + ox, roofY + h + r * 0.24, z + oz);
      d.rotation.set(0, 0, 0); d.updateMatrix();
      cap.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate  = true; scene.add(im);
    cap.instanceMatrix.needsUpdate = true; scene.add(cap);
  }

  // ── VENT BOXES — HVAC / mechanical box units on rooftops ────────────────────
  // Box bodies + face-mounted grill glows. 2 IM.
  function _ventBoxes(x, z, roofY, fp, count, pal) {
    const bw = Math.max(2.0, fp * 0.055), bd = Math.max(1.4, fp * 0.036), bh = Math.max(1.2, fp * 0.028);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.body.clone().lerp(new THREE.Color(0x2e2e2e), 0.50),
      emissive: pal.secondary.clone(), emissiveIntensity: 0.015,
      roughness: 0.82, metalness: 0.22,
    });
    const grillMat = new THREE.MeshBasicMaterial({
      color: pal.trim, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im    = new THREE.InstancedMesh(new THREE.BoxGeometry(bw, bh, bd), mat, count);
    const grill = new THREE.InstancedMesh(new THREE.PlaneGeometry(bw * 0.78, bh * 0.65), grillMat, count);
    grill.renderOrder = 3; im.castShadow = true;
    const d    = new THREE.Object3D();
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const a   = (i / count) * Math.PI * 2;
      const ox  = Math.cos(a) * fp * 0.20 + (col - (cols - 1) * 0.5) * fp * 0.080;
      const oz  = Math.sin(a) * fp * 0.20 + (row - (Math.ceil(count / cols) - 1) * 0.5) * fp * 0.080;
      d.position.set(x + ox, roofY + bh * 0.5, z + oz);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      d.position.set(x + ox + Math.cos(a) * (bd * 0.51), roofY + bh * 0.5, z + oz + Math.sin(a) * (bd * 0.51));
      d.rotation.set(0, a, 0); d.updateMatrix();
      grill.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate    = true; scene.add(im);
    grill.instanceMatrix.needsUpdate = true; scene.add(grill);
  }

  // ── CONDUIT RUNS — horizontal pipe runs across each facade ──────────────────
  // 1 IM. Pipes as thin cylinders, each running parallel to the face.
  function _conduitRun(x, z, y, faceR, sides, fp, pal) {
    const r   = Math.max(0.16, fp * 0.005);
    const len = faceR * 0.70;
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(new THREE.Color(0x181818), 0.58),
      emissive: pal.trim.clone(), emissiveIntensity: 0.048,
      roughness: 0.52, metalness: 0.48,
    });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, len, 6), mat, sides);
    const d  = new THREE.Object3D();
    for (let s = 0; s < sides; s++) {
      const fa = (s / sides) * Math.PI * 2 + Math.PI / sides;
      d.position.set(x + Math.cos(fa) * faceR, y, z + Math.sin(fa) * faceR);
      d.rotation.set(0, fa + Math.PI / 2, Math.PI / 2); d.updateMatrix();
      im.setMatrixAt(s, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── ANTENNA CLUSTER — radiating rod array, rooftop sensor mast ──────────────
  // 1 IM. Deterministic radial pattern. Adds height hierarchy to roofline.
  function _antennaCluster(x, z, roofY, fp, count, pal) {
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.trim.clone().lerp(pal.structural, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.18,
      roughness: 0.36, metalness: 0.58,
    });
    const im = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.003, fp * 0.008, fp * 0.095, 5), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = fp * (0.038 + (i % 3) * 0.028);
      const h = fp * (0.070 + (i % 2) * 0.042);
      d.position.set(x + Math.cos(a) * r, roofY + h * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, (i % 4) * 0.10); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── SATELLITE DISH — parabolic dish on rooftop mast ─────────────────────────
  function _satelliteDish(x, z, roofY, r, pal) {
    const mastH  = r * 2.8;
    const mastMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0x404040), 0.55),
      roughness: 0.80, metalness: 0.35,
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.12, mastH, 6), mastMat);
    mast.position.set(x, roofY + mastH * 0.5, z); mast.castShadow = true; scene.add(mast);
    const dishMat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(new THREE.Color(0x808080), 0.45),
      emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.55, metalness: 0.40,
      side: THREE.DoubleSide,
    });
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), dishMat);
    dish.rotation.x = Math.PI * 0.30; dish.rotation.z = Math.PI * 0.15;
    dish.position.set(x, roofY + mastH, z);
    dish.castShadow = true; scene.add(dish);
  }

  // ── ROOFTOP PINNACLES — slender decorative tapered spires (Library/Gothic) ──
  function _rooftopPinnacles(x, z, roofY, fp, count, pal) {
    const h   = Math.max(5, fp * 0.082);
    const r   = Math.max(0.22, fp * 0.010);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.060,
      roughness: 0.68, metalness: 0.14,
    });
    const orb = new THREE.InstancedMesh(new THREE.SphereGeometry(r * 1.35, 8, 6), mat, count);
    const pin = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.15, r, h, 6), mat, count);
    pin.castShadow = true;
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a  = (i / count) * Math.PI * 2;
      const pr = fp * 0.36;
      d.position.set(x + Math.cos(a) * pr, roofY + h * 0.5, z + Math.sin(a) * pr);
      d.rotation.set(0, a, 0); d.updateMatrix();
      pin.setMatrixAt(i, d.matrix);
      d.position.set(x + Math.cos(a) * pr, roofY + h + r * 1.4, z + Math.sin(a) * pr);
      d.rotation.set(0, 0, 0); d.updateMatrix();
      orb.setMatrixAt(i, d.matrix);
    }
    pin.instanceMatrix.needsUpdate = true; scene.add(pin);
    orb.instanceMatrix.needsUpdate = true; scene.add(orb);
  }

  // Greeble panel quads on building facades — shallow recessed look, 1 draw call.
  // faceR = distance from center to facade. rows/cols of panels per face. sides = face count.
  function _greeblePanels(x, z, baseY, topY, faceR, sides, rows, cols, panW, panH, pal) {
    const H     = topY - baseY;
    const count = sides * rows * cols;
    const mat   = new THREE.MeshBasicMaterial({
      color: pal.primary.clone().lerp(new THREE.Color(0xffffff), 0.08),
      transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(panW, panH), mat, count);
    im.renderOrder = 2;
    const d = new THREE.Object3D();
    let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / (sides);
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      const spacing = panW * 1.55;
      for (let row = 0; row < rows; row++) {
        const yPos = baseY + H * (0.15 + (row / Math.max(1, rows - 1)) * 0.68);
        for (let col = 0; col < cols; col++) {
          const xOff = (col - (cols - 1) / 2) * spacing;
          d.position.set(
            x + cosF * faceR + cosP * xOff,
            yPos,
            z + sinF * faceR + sinP * xOff
          );
          d.rotation.set(0, fa, 0); d.updateMatrix();
          im.setMatrixAt(idx++, d.matrix);
        }
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── TEMPLE COLONNADE — peristyle of classical columns with a FRONT ENTRY GAP ─
  // A ring of proper columns (plinth base + fluted shaft + echinus + abacus capital)
  // around a building's lower level, leaving a wide OPEN gap facing `gapDir` (the
  // direction toward world-centre) so it reads as a walk-in portico, not a sealed wall.
  // Columns that fall inside the entrance arc are skipped; the entablature lintels that
  // would bridge the gap are skipped too → the opening stays clear top to bottom.
  //   Draw calls: 5 InstancedMesh (base/shaft/echinus/abacus/capital-glow)
  //             + 1 InstancedMesh (entablature lintels) + 1 flat stylobate decal.
  // All matrices baked once at build; nothing per-frame.
  function _colonnade(x, z, baseY, ringR, totalH, colR, count, gapDir, gapHalf, pal) {
    // Which column angles survive? Skip the arc facing gapDir (the entrance).
    const frontAng = Math.atan2(gapDir.z, gapDir.x);
    const angles = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      let d = a - frontAng;
      while (d >  Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < gapHalf) continue;   // leave the entrance open
      angles.push(a);
    }
    const n = angles.length;
    if (n < 1) return;

    const baseH  = colR * 0.55;
    const capH   = colR * 0.60;
    const shaftH = Math.max(2, totalH - baseH - capH);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0xd8ccae), 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.018,
      roughness: 0.82, metalness: 0.05,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.62, metalness: 0.16,
    });

    // 12-sided shaft reads as fluting under the directional light.
    const baseIM  = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.42, colR * 1.55, baseH, 12), capMat, n);
    const shaftIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 0.86, colR * 0.98, shaftH, 12), stoneMat, n);
    const echIM   = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.28, colR * 0.90, capH, 12), capMat, n);
    const abacIM  = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 2.5, colR * 0.30, colR * 2.5), capMat, n);
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.30),
      transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glowIM  = new THREE.InstancedMesh(
      new THREE.TorusGeometry(colR * 1.00, colR * 0.10, 6, 16), glowMat, n);
    baseIM.castShadow = shaftIM.castShadow = echIM.castShadow = abacIM.castShadow = true;
    glowIM.renderOrder = 3;

    const abacY = baseY + baseH + shaftH + capH + colR * 0.15;
    {
      const d = new THREE.Object3D();
      for (let k = 0; k < n; k++) {
        const a  = angles[k];
        const cx = x + Math.cos(a) * ringR;
        const cz = z + Math.sin(a) * ringR;
        d.rotation.set(0, 0, 0);
        d.position.set(cx, baseY + baseH * 0.5, cz);                d.updateMatrix(); baseIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, baseY + baseH + shaftH * 0.5, cz);       d.updateMatrix(); shaftIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, baseY + baseH + shaftH + capH * 0.5, cz);d.updateMatrix(); echIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, abacY, cz);                              d.updateMatrix(); abacIM.setMatrixAt(k, d.matrix);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.position.set(cx, abacY, cz);                              d.updateMatrix(); glowIM.setMatrixAt(k, d.matrix);
      }
      baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
      shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
      echIM.instanceMatrix.needsUpdate   = true; scene.add(echIM);
      abacIM.instanceMatrix.needsUpdate  = true; scene.add(abacIM);
      glowIM.instanceMatrix.needsUpdate  = true; scene.add(glowIM);
    }

    // Entablature — lintel beams spanning ADJACENT columns. Pairs that straddle the
    // entrance gap are skipped, so the doorway stays open right to the top.
    const spacing  = (Math.PI * 2) / count;
    const lintMids = [];
    for (let k = 0; k < n; k++) {
      const a0 = angles[k], a1 = angles[(k + 1) % n];
      let dd = a1 - a0; if (dd <= 0) dd += Math.PI * 2;
      if (dd > spacing * 1.6) continue;   // straddles the entrance → leave open
      lintMids.push(a0 + dd * 0.5);
    }
    if (lintMids.length) {
      const L      = 2 * ringR * Math.sin(spacing * 0.5) * 1.02;   // chord length
      const rMid   = ringR * Math.cos(spacing * 0.5);              // chord midpoint radius
      const lintY  = abacY + colR * 0.30;
      const lintIM = new THREE.InstancedMesh(
        new THREE.BoxGeometry(L, colR * 0.72, colR * 1.5), stoneMat, lintMids.length);
      lintIM.castShadow = true;
      const d = new THREE.Object3D();
      for (let k = 0; k < lintMids.length; k++) {
        const mid = lintMids[k];
        // Same span convention as the entrance lintel: local-x = tangent to the face.
        d.rotation.set(0, Math.atan2(Math.cos(mid), Math.sin(mid)), 0);
        d.position.set(x + Math.cos(mid) * rMid, lintY, z + Math.sin(mid) * rMid);
        d.updateMatrix(); lintIM.setMatrixAt(k, d.matrix);
      }
      lintIM.instanceMatrix.needsUpdate = true; scene.add(lintIM);
    }

    // Flat stylobate outline at the column feet — decorative decal, never blocks movement.
    const sty = new THREE.Mesh(
      new THREE.RingGeometry(ringR - colR * 1.7, ringR + colR * 1.7, 64),
      new THREE.MeshBasicMaterial({
        color: pal.trim, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    sty.rotation.x = -Math.PI / 2;
    sty.position.set(x, baseY + 0.06, z);
    sty.renderOrder = 2; scene.add(sty);
  }

  // ── FACADE TEXTURE REGISTRY ───────────────────────────────────────────────
  const facadeRegistry = {};
  function regFacade(code, mat) {
    (facadeRegistry[code] = facadeRegistry[code] || []).push(mat);
  }

  // ── FOUNDATION: INTEGRATED CARVED PODIUM / SOCLE ──────────────────────────
  // The recurring "toy dropped on the ground / fake blocky bottom / floating" note
  // came from stacking a few concentric DISCS under every building — a separate part
  // sitting on grass, the same round shape whether the building was a box or a tower.
  //
  // This rebuild makes the bottom read as ONE carved plinth that BELONGS to the
  // building, following its shape (square podium for box buildings, round for the two
  // cylinders). From the ground up it is:
  //   • a flared SKIRT whose widest course is BURIED below the pad — the wall/ground
  //     seam is never visible, nothing floats;
  //   • a PLINTH mass in the building's own colour family (matte dressed stone);
  //   • a projecting base MOLDING lip (bull-nose) at the plinth top;
  //   • a chamfered CAP course that tapers in toward the wall — the carved bevel where
  //     wall meets base;
  //   • a recessed dark SHADOW-GAP reveal line at the wall foot;
  //   • a thin emissive TRIM seam in the accent colour so the bottom has life/colour;
  //   • low CORNER BLOCKS (quoin feet) anchoring the perimeter to the ground;
  //   • a couple of shallow ENTRY STEPS on the frontDir side only, rising ground→landing.
  //
  // Deliberately NOT a barrier: total rise = SOCLE_RISE (0.9u), so the door landing is
  // only ankle-high. Every course buries below the pad so no floating edge shows.
  // Returns SOCLE_RISE → walls/entrance/door all seat on the plinth top together.
  const SOCLE_RISE = 0.35;

  function addMonumentBase(x, z, palette, baseY, footprint, isCylinder, frontDir) {
    const fp   = footprint || 50;
    const RISE = SOCLE_RISE;                    // 0.90 — landing height (small = walkable)
    frontDir   = frontDir || { x: 0, z: -1 };
    const faceAng = Math.atan2(frontDir.x, frontDir.z);

    // Radial envelope — COLLISION-FIT. The app's SOLID collider for the building is a
    // circle/box at fp*0.46 (the facade wall). Every TALL / SOLID base course (plinth,
    // cap, corner quoins, entry steps) is therefore kept WITHIN fp*0.46 so the player
    // can never walk onto a ledge that sits outside the wall. The ONLY thing allowed to
    // flare past fp*0.46 is the very LOW ground-contact fillet (a flat bevel ≤0.5u tall
    // that you simply walk over), reaching out to ~fp*0.55 to hide the ground seam.
    const wallR   = fp * 0.450;   // dressed-wall / cap reach — inside the collider
    const plinthR = fp * 0.458;   // main plinth mass — widest SOLID, still inside fp*0.46
    const skirtR  = fp * 0.500;   // flared skirt — mostly BURIED, melts into the pad
    const contactR = fp * 0.550;  // LOW ground-contact fillet — the only course past fp*0.46

    // ── Materials: same colour FAMILY as the building body, graded like dressed stone.
    const podiumMat = new THREE.MeshStandardMaterial({    // the mass (matches body, mattier)
      color: palette.body.clone().lerp(palette.structural, 0.34),
      roughness: 0.92, metalness: 0.07,
      emissive: palette.primary.clone(), emissiveIntensity: 0.006,
    });
    const capMat = new THREE.MeshStandardMaterial({       // dressed chamfer + molding course
      color: palette.body.clone().lerp(palette.secondary, 0.20),
      roughness: 0.78, metalness: 0.13,
      emissive: palette.primary.clone(), emissiveIntensity: 0.016,
    });
    const revealMat = new THREE.MeshStandardMaterial({    // near-black shadow-gap groove
      color: palette.structural.clone().lerp(new THREE.Color(0x000000), 0.40),
      roughness: 0.98, metalness: 0.0,
    });
    const trimMat = new THREE.MeshBasicMaterial({         // emissive accent seam = colour/life
      color: palette.trim, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // ── Shape-aware solid course (round frustum for cylinders, square box otherwise).
    // boxSide = half-extent used for the square course (box can't taper, so the
    // chamfer/reveal read comes from stacking courses of different widths). Defaults to
    // rBot; pass rTop for a course that must step IN (the chamfer cap).
    function course(rBot, rTop, botY, topY, mat, cast, boxSide) {
      const h = topY - botY;
      let m;
      if (isCylinder) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 48), mat);
      } else {
        const s = (boxSide != null ? boxSide : rBot);
        m = new THREE.Mesh(new THREE.BoxGeometry(s * 2, h, s * 2), mat);
      }
      m.position.set(x, (botY + topY) * 0.5, z);
      m.rotation.y = isCylinder ? 0 : faceAng;   // align square podium to the facing
      m.receiveShadow = true; if (cast) m.castShadow = true;
      scene.add(m);
    }

    // ── Shape-aware edge band: a torus for cylinders, a 4-bar square frame for boxes.
    // Used for the projecting molding, the shadow-gap reveal, and the emissive trim —
    // each is 1 draw call regardless of shape.
    function ringBand(radius, y, mat, tube, height, renderOrder) {
      if (isCylinder) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 64), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y, z);
        if (renderOrder) m.renderOrder = renderOrder;
        scene.add(m);
      } else {
        const h  = height || tube * 2;
        const im = new THREE.InstancedMesh(
          new THREE.BoxGeometry(radius * 2 + tube * 2, h, tube * 2), mat, 4);
        if (renderOrder) im.renderOrder = renderOrder;
        const d = new THREE.Object3D();
        for (let s = 0; s < 4; s++) {
          const na = faceAng + s * (Math.PI / 2);      // side outward-normal angle
          d.rotation.set(0, na, 0);
          d.position.set(x + Math.sin(na) * radius, y, z + Math.cos(na) * radius);
          d.updateMatrix(); im.setMatrixAt(s, d.matrix);
        }
        im.instanceMatrix.needsUpdate = true; scene.add(im);
      }
    }

    // 0) GROUND-CONTACT FILLET — a very wide, low bevel course that flares out past
    //    every other course and sinks WELL below the pad, so the base melts into the
    //    terrain on ALL sides with no visible seam or floating edge — box + cylinder
    //    alike. Its top is essentially flush to the pad (baseY+0.06); its widest foot
    //    is buried (baseY-2.8), so even on a sloped pad edge the ground never shows a
    //    gap under the podium. This is the "founded, not floating" contact skirt.
    course(contactR, skirtR, baseY - 2.8, baseY + 0.06, podiumMat, false);

    // 1) SKIRT — flared course, widest at the bottom and BURIED, so it melts into the
    //    pad with no hard seam. Frustum for cylinders; a wider buried box for boxes.
    //    Buried deep (baseY-2.4) so it overlaps the fillet and never floats.
    course(skirtR, plinthR, baseY - 2.4, baseY + 0.10, podiumMat, false);

    // 2) PLINTH — the main dressed-stone mass, projecting just past the walls.
    course(plinthR, plinthR, baseY - 2.4, baseY + 0.20, podiumMat, true);

    // 3) BASE MOLDING — bull-nose lip at the plinth top (a real base course). Its OUTER
    //    face (radius + tube) is held to plinthR so the molding stays inside fp*0.46 and
    //    reads as a dressed shoulder rather than a walk-on ledge outside the collider.
    ringBand(plinthR - 0.4, baseY + 0.16, capMat, 0.4, 0.6);

    // 4) CHAMFER CAP — short course tapering IN from plinth to wall = the carved bevel
    //    where the wall lands on the base. Cylinders taper true; boxes step in to wallR.
    course(plinthR, wallR, baseY + 0.20, baseY + RISE, capMat, true, wallR);

    // 5) SHADOW-GAP REVEAL — a recessed dark groove at the very foot of the wall, so the
    //    wall reads as set INTO the plinth (a crisp architectural reveal, not a butt joint).
    ringBand(wallR * 1.004, baseY + RISE - 0.05, revealMat, 0.3, 0.22);

    // 6) EMISSIVE TRIM — thin accent seam on the plinth shoulder = colour/life at the base.
    ringBand(plinthR * 0.992, baseY + 0.60, trimMat, 0.22, 0.10, 3);

    // 7) CORNER BLOCKS — REMOVED. These low quoin-foot boxes poked up ~0.5u at the
    //    podium corners and read as "random squares sticking out of the bottom" of
    //    the building. (Owner complaint.) The clean plinth + chamfer + buried skirt
    //    already give a founded, flush base, so the loose corner boxes are gone.

    // 8) ENTRY STEPS — a short flight on the frontDir (entrance) side ONLY, carved INTO
    //    the plinth front (kept within plinthR ≤ fp*0.46 so the flight sits inside the
    //    collision wall — no step treads projecting out past the collider). Buried
    //    bottoms → no floating step edges. 1 InstancedMesh. Lowest tread hugs the plinth
    //    face; each higher tread steps INWARD toward the wall as it rises to the landing.
    {
      const stepN = 3;
      const stepW = Math.max(8.0, fp * 0.22);
      const stepD = Math.max(1.6, fp * 0.032);
      const im = new THREE.InstancedMesh(
        new THREE.BoxGeometry(stepW, RISE + 1.0, stepD), capMat, stepN);
      im.castShadow = true; im.receiveShadow = true;
      const d = new THREE.Object3D();
      for (let i = 0; i < stepN; i++) {
        const topY = baseY + RISE * ((i + 1) / stepN);
        const botY = baseY - 1.4;                       // buried deeper → no step float
        // Lowest step (i=0) hugs the plinth face (outer tread edge = plinthR, inside the
        // collider); each higher step recedes INWARD toward the wall. All within fp*0.46.
        const radial = plinthR - stepD * (i + 0.5);
        d.rotation.set(0, faceAng, 0);
        d.position.set(x + frontDir.x * radial, (topY + botY) * 0.5, z + frontDir.z * radial);
        d.scale.set(1, (topY - botY) / (RISE + 1.0), 1);
        d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }

    // 9) GROUND RING — a faint engraved ring flush to the pad, tying the podium footprint
    //    into the terrain (decorative only, never blocks movement).
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(skirtR * 0.97, skirtR * 1.02, isCylinder ? 48 : 4),
      new THREE.MeshBasicMaterial({
        color: palette.trim, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.rotation.z = isCylinder ? 0 : faceAng + Math.PI / 4;   // square ring for box pads
    rune.position.set(x, baseY + 0.05, z);
    rune.renderOrder = 2; scene.add(rune);

    return RISE;   // walls emerge from the plinth top; landing = baseY + SOCLE_RISE
  }

  // ── DOOR RECESS ───────────────────────────────────────────────────────────
  // Deep slot punched into the front facade with:
  //   1. Dark recess box — absolute black, wide, deep → maximum shadow
  //   2. Glowing back panel — emissive rectangle at the back of the void
  //      reads as "lit interior" even from 100+ units away
  //   3. Threshold glow strip at floor level — unmistakeable entry cue
  // faceR = actual building face distance (fixes floating on box buildings).
  // Now a REAL, WALK-IN PORTAL — not a shallow recess. On the center-facing (frontDir)
  // wall it builds: a deep dark recessed interior you look INTO (open-fronted BackSide
  // box so there is no front face to occlude), a lit "room beyond" glow at the deep end,
  // solid stone JAMBS framing both sides, a LINTEL bridging them, a semicircular ARCH
  // header, and a bright floor THRESHOLD. Opening ≈ half the facade half-width, tall.
  // Everything is aligned to frontDir so it matches where the app lets the player pass.
  function _doorRecess(x, z, baseY, pal, fp, frontDir, faceR) {
    const faceR_  = faceR || fp * 0.46;
    const doorW   = Math.min(faceR_ * 0.70, Math.max(7.5, faceR_ * 0.54));
    const doorH   = Math.max(16.0, fp * 0.42);   // taller, grander proportions
    const depth   = Math.max(6.5, fp * 0.108);   // projecting archway depth → deep walk-in read
    const faceAng = Math.atan2(frontDir.x, frontDir.z);
    const px = -frontDir.z, pz = frontDir.x;      // tangent along the face

    // Point at radius r on the front axis, offset o along the face tangent → [x, z].
    const P = (r, o) => [ x + frontDir.x * r + px * o, z + frontDir.z * r + pz * o ];

    // Interior back sits just outside the wall shell (no z-fight); the archway projects
    // outward from there so you look INTO a receding dark passage toward the lit interior.
    const backR = faceR_ + 0.4;
    const openR = backR + depth;                  // outer opening plane

    // 1) DARK RECESSED INTERIOR — open-fronted box (BackSide → front face culled, you see in).
    const voidMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x000102),
      emissive: pal.primary.clone(), emissiveIntensity: 0.020,
      roughness: 0.98, metalness: 0.0,
      side: THREE.BackSide,
    });
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, depth), voidMat);
    { const c = P(backR + depth * 0.5, 0);
      cavity.position.set(c[0], baseY + doorH * 0.5, c[1]);
      cavity.rotation.y = faceAng; scene.add(cavity); }

    // 2) LIT INTERIOR — warm lamp-lit glow at the deep end = "the room beyond the
    //    threshold". Accent lerped toward a hearth tone so the light reads as spilling
    //    from an inhabited interior (still carries the building's accent identity).
    const _warm    = new THREE.Color(0xffcf9a);
    const warmGlow = pal.trim.clone().lerp(_warm, 0.55);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.88, doorH * 0.92),
      new THREE.MeshBasicMaterial({
        color: warmGlow.clone().lerp(new THREE.Color(0xffffff), 0.14),
        transparent: true, opacity: 0.68,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    { const c = P(backR + 0.25, 0);
      glow.position.set(c[0], baseY + doorH * 0.50, c[1]);
      glow.rotation.y = faceAng; glow.renderOrder = 5; scene.add(glow); }

    // Shared carved-stone surround material + emissive reveal.
    const frameMat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(pal.structural, 0.34),
      emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.60, metalness: 0.20,
    });
    const revealMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.20),
      transparent: true, opacity: 0.70,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // 3) JAMBS — two solid piers framing the opening (left + right). 1 IM, 2 instances.
    const jambW = Math.max(1.4, doorW * 0.16);
    const jambD = depth + 1.2;
    const jambIM   = new THREE.InstancedMesh(new THREE.BoxGeometry(jambW, doorH, jambD), frameMat, 2);
    const revealIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(jambW * 0.22, doorH * 0.94, 0.30), revealMat, 2);
    jambIM.castShadow = true; revealIM.renderOrder = 4;
    { const d = new THREE.Object3D(); let k = 0;
      for (const side of [-1, 1]) {
        const o = side * (doorW * 0.5 + jambW * 0.5);
        d.rotation.set(0, faceAng, 0);
        let c = P(backR + jambD * 0.5 - 0.6, o);
        d.position.set(c[0], baseY + doorH * 0.5, c[1]); d.updateMatrix(); jambIM.setMatrixAt(k, d.matrix);
        c = P(openR + 0.05, o - side * jambW * 0.22);
        d.position.set(c[0], baseY + doorH * 0.5, c[1]); d.updateMatrix(); revealIM.setMatrixAt(k, d.matrix);
        k++;
      }
      jambIM.instanceMatrix.needsUpdate   = true; scene.add(jambIM);
      revealIM.instanceMatrix.needsUpdate = true; scene.add(revealIM);
    }

    // 4) LINTEL — solid beam bridging the jambs across the top of the opening.
    const lintH  = Math.max(1.4, doorH * 0.10);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + jambW * 2.2, lintH, jambD), frameMat);
    { const c = P(backR + jambD * 0.5 - 0.6, 0);
      lintel.position.set(c[0], baseY + doorH + lintH * 0.5, c[1]);
      lintel.rotation.y = faceAng; lintel.castShadow = true; scene.add(lintel); }

    // 5) ARCHIVOLT — a layered semicircular archway: three concentric molding rings
    //    stepping outward & forward (classical archivolt) so the header reads as
    //    ornate carved stone, with a bright inner reveal and a crowning keystone.
    const archR    = doorW * 0.5 + jambW * 0.5;
    const archY    = baseY + doorH + lintH;
    const archTube = Math.max(0.5, archR * 0.11);
    const RINGS    = 3;
    const archIM   = new THREE.InstancedMesh(
      new THREE.TorusGeometry(archR, archTube, 10, 28, Math.PI), frameMat, RINGS);
    archIM.castShadow = true;
    { const d = new THREE.Object3D();
      for (let m = 0; m < RINGS; m++) {
        const rr = archR + m * (archTube * 1.35);
        const c  = P(openR - 0.4 - m * (archTube * 1.1), 0);
        d.rotation.set(0, faceAng, 0);
        d.position.set(c[0], archY, c[1]);
        d.scale.set(rr / archR, rr / archR, 1 - m * 0.16);
        d.updateMatrix(); archIM.setMatrixAt(m, d.matrix);
      }
      archIM.instanceMatrix.needsUpdate = true; scene.add(archIM);
    }
    { const c = P(openR - 0.1, 0);
      const archGlow = new THREE.Mesh(
        new THREE.TorusGeometry(archR * 0.96, archTube * 0.30, 8, 28, Math.PI), revealMat);
      archGlow.position.set(c[0], archY, c[1]); archGlow.rotation.y = faceAng;
      archGlow.renderOrder = 5; scene.add(archGlow);
      // Keystone — wedge block crowning the arch apex.
      const key = new THREE.Mesh(
        new THREE.BoxGeometry(jambW * 0.9, archR * 0.42, archTube * 2.2), frameMat);
      const kc = P(openR - 0.4, 0);
      key.position.set(kc[0], archY + archR * 0.9, kc[1]); key.rotation.y = faceAng;
      key.castShadow = true; scene.add(key);
    }

    // 6) THRESHOLD — bright floor strip through the opening = unmistakable "enter here".
    const thresh = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 1.05, depth + 1.0),
      new THREE.MeshBasicMaterial({
        color: pal.primary.clone().lerp(new THREE.Color(0xffffff), 0.30),
        transparent: true, opacity: 0.50,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    { const c = P(backR + depth * 0.5, 0);
      thresh.rotation.order = 'YXZ';
      thresh.rotation.y = faceAng; thresh.rotation.x = -Math.PI / 2;
      thresh.position.set(c[0], baseY + 0.10, c[1]);
      thresh.renderOrder = 4; scene.add(thresh);
    }

    // 7) INNER FLOOR — a dark stone floor inside the cavity, so looking in reads as
    //    a real room beyond the threshold (not a hollow black hole).
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.94, depth * 0.92),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0a0c12), roughness: 0.95, metalness: 0.05,
        emissive: pal.primary.clone(), emissiveIntensity: 0.015,
      })
    );
    { const c = P(backR + depth * 0.5, 0);
      floor.rotation.order = 'YXZ';
      floor.rotation.y = faceAng; floor.rotation.x = -Math.PI / 2;
      floor.position.set(c[0], baseY + 0.06, c[1]); scene.add(floor);
    }

    // 8) RAISED SILL — a shallow dressed-stone step at the very threshold; you step
    //    UP INTO the doorway (classic entrance cue, reinforces "walk in here").
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + jambW, 0.5, 1.8), frameMat);
    { const c = P(openR - 0.8, 0);
      sill.rotation.y = faceAng;
      sill.position.set(c[0], baseY + 0.25, c[1]);
      sill.castShadow = true; scene.add(sill);
    }

    // 9) DOOR LEAVES — two tall PANELLED doors standing AJAR against the jambs, each
    //    with recessed rectangular panels, a bright leading-edge reveal and a metal
    //    HANDLE. Dark metal-clad leaves swung open so the warm interior shows between
    //    them. Leaves / panels / handles are all instanced (4 draw calls total).
    const leafW    = doorW * 0.5;
    const leafMat  = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(new THREE.Color(0x151019), 0.5),
      emissive: pal.trim.clone(), emissiveIntensity: 0.05,
      roughness: 0.50, metalness: 0.45,
    });
    const leafGlowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.22),
      transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(new THREE.Color(0x05060a), 0.5),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.44, metalness: 0.55,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color:    pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.25),
      emissive: pal.trim.clone(), emissiveIntensity: 0.22,
      roughness: 0.30, metalness: 0.80,
    });
    const leafIM     = new THREE.InstancedMesh(
      new THREE.BoxGeometry(leafW, doorH * 0.94, 0.70), leafMat, 2);
    const leafGlowIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(leafW * 0.10, doorH * 0.88, 0.14), leafGlowMat, 2);
    const panelIM    = new THREE.InstancedMesh(
      new THREE.BoxGeometry(leafW * 0.62, doorH * 0.30, 0.16), panelMat, 4);
    const handleIM   = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.16, doorH * 0.16, 6), handleMat, 2);
    leafIM.castShadow = true; leafGlowIM.renderOrder = 4; panelIM.castShadow = true;
    { const d = new THREE.Object3D(); let k = 0, pj = 0;
      for (const side of [-1, 1]) {
        const swing   = side * 0.55;                      // ~31° ajar toward the jamb
        const leafAng = faceAng - swing;
        const nX = Math.sin(leafAng), nZ = Math.cos(leafAng);   // leaf outward normal
        const tX = Math.cos(leafAng), tZ = -Math.sin(leafAng);  // leaf tangent (local +X)
        const hingeO  = side * (doorW * 0.5 - leafW * 0.08);
        const c  = P(backR + 1.6, hingeO - side * leafW * 0.42);
        const cx = c[0], cz = c[1], cy = baseY + doorH * 0.47;
        d.rotation.set(0, leafAng, 0);
        d.position.set(cx, cy, cz); d.updateMatrix(); leafIM.setMatrixAt(k, d.matrix);
        // two recessed panels standing proud of the leaf's outer face
        for (const pv of [-1, 1]) {
          d.position.set(cx + nX * 0.42, cy + pv * doorH * 0.26, cz + nZ * 0.42);
          d.updateMatrix(); panelIM.setMatrixAt(pj++, d.matrix);
        }
        // leading-edge glow reveal
        const cg = P(backR + 1.9, hingeO - side * leafW * 0.82);
        d.position.set(cg[0], cy, cg[1]); d.updateMatrix(); leafGlowIM.setMatrixAt(k, d.matrix);
        // vertical handle bar near the leading (inner) edge
        const ho = -side * leafW * 0.34;
        d.position.set(cx + tX * ho + nX * 0.5, cy, cz + tZ * ho + nZ * 0.5);
        d.updateMatrix(); handleIM.setMatrixAt(k, d.matrix);
        k++;
      }
      leafIM.instanceMatrix.needsUpdate     = true; scene.add(leafIM);
      leafGlowIM.instanceMatrix.needsUpdate = true; scene.add(leafGlowIM);
      panelIM.instanceMatrix.needsUpdate    = true; scene.add(panelIM);
      handleIM.instanceMatrix.needsUpdate   = true; scene.add(handleIM);
    }

    // 10) SCONCES — two lit lamps flanking the portal = an unmistakable LIT threshold.
    const sconceIM = new THREE.InstancedMesh(
      new THREE.SphereGeometry(Math.max(0.55, doorW * 0.06), 10, 8),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.40),
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }), 2);
    sconceIM.renderOrder = 5;
    { const d = new THREE.Object3D(); let k = 0;
      for (const side of [-1, 1]) {
        const o = side * (doorW * 0.5 + jambW * 1.1);
        const c = P(openR - 0.6, o);
        d.position.set(c[0], baseY + doorH * 0.64, c[1]); d.updateMatrix();
        sconceIM.setMatrixAt(k, d.matrix); k++;
      }
      sconceIM.instanceMatrix.needsUpdate = true; scene.add(sconceIM);
    }

    // 11) ENTRY STEPS — a short flight rising from the plaza up to the threshold,
    //     in front of the portal. 1 IM; bottoms buried so no floating step edges.
    {
      const stepN = 3, H0 = 2.2;
      const stepW = doorW * 1.55;
      const run   = Math.max(1.4, fp * 0.030);
      const stepIM = new THREE.InstancedMesh(
        new THREE.BoxGeometry(stepW, H0, run), frameMat, stepN);
      stepIM.castShadow = true; stepIM.receiveShadow = true;
      const d = new THREE.Object3D();
      for (let i = 0; i < stepN; i++) {
        const topY   = baseY - i * 0.24;
        const botY   = baseY - 2.4;
        const radial = openR + run * (i + 0.5);
        d.rotation.set(0, faceAng, 0);
        d.scale.set(1, (topY - botY) / H0, 1);
        d.position.set(x + frontDir.x * radial, (topY + botY) * 0.5, z + frontDir.z * radial);
        d.updateMatrix(); stepIM.setMatrixAt(i, d.matrix);
      }
      stepIM.instanceMatrix.needsUpdate = true; scene.add(stepIM);
    }

    // 12) LIGHT POOL — warm glow spilling from the doorway onto the plaza floor.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(doorW * 0.95, 24),
      new THREE.MeshBasicMaterial({
        color: warmGlow.clone().lerp(new THREE.Color(0xffffff), 0.14),
        transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    { const c = P(openR + doorW * 0.5, 0);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(c[0], baseY + 0.08, c[1]);
      pool.renderOrder = 2; scene.add(pool);
    }
  }

  // ── ENTRANCE DOORWAY ──────────────────────────────────────────────────────
  // Fluted columns + lintel + double-ring arch + threshold glow + approach runner.
  // faceR = actual building face distance (fixes floating entrance bug).
  function addEntrance(x, z, palette, doorY, footprint, frontDir, faceR) {
    const fp         = footprint || 50;
    const doorFaceR  = faceR || fp * 0.46;
    const doorW      = Math.max(4.5, fp * 0.16);
    const doorH      = Math.max(7.0, fp * 0.25);
    const colR       = Math.max(0.72, fp * 0.028);
    const lintH      = Math.max(1.0,  fp * 0.038);

    const dfx      = x + frontDir.x * doorFaceR;
    const dfz      = z + frontDir.z * doorFaceR;
    const px       = -frontDir.z;
    const pz       =  frontDir.x;
    const faceAngle = Math.atan2(frontDir.x, frontDir.z);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: palette.structural.clone().lerp(palette.secondary, 0.40),
      emissive: palette.trim.clone(), emissiveIntensity: 0.06,
      metalness: 0.05, roughness: 0.72,
    });

    // Columns (left + right) — the two sides differ only by translation (all parts are
    // rotationally symmetric or plan-square), so each part-type becomes one InstancedMesh
    // with 2 instances: 5 draw calls instead of 10, and the orb material is built once
    // instead of once per side. × 8 buildings = ~40 draw calls saved.
    const colH      = doorH * 1.12;
    const colOffset = doorW * 0.5 + colR * 1.80;
    const baseIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.58, colR * 1.70, colR * 0.50, 8), stoneMat, 2);
    const shaftIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 0.80, colR, colH, 12), stoneMat, 2);
    const echIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.35, colR * 0.82, colR * 0.58, 8), stoneMat, 2);
    const abacIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 2.9, colR * 0.34, colR * 2.9), stoneMat, 2);
    const colOrbMat = new THREE.MeshBasicMaterial({
      color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.50),
      transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const colOrbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(colR * 1.02, 10, 7), colOrbMat, 2);
    baseIM.castShadow = shaftIM.castShadow = echIM.castShadow = abacIM.castShadow = true;
    colOrbIM.renderOrder = 4;
    {
      const d = new THREE.Object3D(); let k = 0;
      for (const side of [-1, 1]) {
        const cx = dfx + px * colOffset * side;
        const cz = dfz + pz * colOffset * side;
        d.position.set(cx, doorY + colR * 0.25, cz); d.updateMatrix(); baseIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH * 0.5, cz); d.updateMatrix(); shaftIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.29, cz); d.updateMatrix(); echIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.62 + colR * 0.17, cz); d.updateMatrix(); abacIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.80 + colR * 0.34, cz); d.updateMatrix(); colOrbIM.setMatrixAt(k, d.matrix);
        k++;
      }
      baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
      shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
      echIM.instanceMatrix.needsUpdate   = true; scene.add(echIM);
      abacIM.instanceMatrix.needsUpdate  = true; scene.add(abacIM);
      colOrbIM.instanceMatrix.needsUpdate = true; scene.add(colOrbIM);
    }

    // Lintel / architrave
    const lintW = doorW + colR * 4.0;
    const lintY = doorY + doorH + lintH * 0.5;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintW, lintH, colR * 1.40), stoneMat);
    lintel.position.set(dfx, lintY, dfz);
    lintel.rotation.y = faceAngle;
    lintel.castShadow = true; scene.add(lintel);

    // Emissive trim strip on lintel face
    const trimStrip = new THREE.Mesh(
      new THREE.BoxGeometry(lintW * 0.95, lintH * 0.16, colR * 0.10),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
        transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    trimStrip.position.set(dfx + frontDir.x * colR * 0.78, lintY - lintH * 0.38,
                           dfz + frontDir.z * colR * 0.78);
    trimStrip.rotation.y = faceAngle;
    trimStrip.renderOrder = 4; scene.add(trimStrip);

    // Dentil course — row of small blocks beneath the architrave (classical cornice
    // detail). Instanced along the tangent (px,pz) using the entrance's proven vectors.
    const dentN  = 7;
    const dentIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 0.42, colR * 0.52, colR * 0.52), stoneMat, dentN);
    dentIM.castShadow = true;
    {
      const dd   = new THREE.Object3D();
      const span = lintW * 0.80;
      for (let i = 0; i < dentN; i++) {
        const off = (i - (dentN - 1) / 2) * (span / dentN);
        dd.position.set(
          dfx + px * off + frontDir.x * colR * 0.58,
          lintY - lintH * 0.64,
          dfz + pz * off + frontDir.z * colR * 0.58
        );
        dd.rotation.set(0, faceAngle, 0); dd.updateMatrix();
        dentIM.setMatrixAt(i, dd.matrix);
      }
      dentIM.instanceMatrix.needsUpdate = true; scene.add(dentIM);
    }

    // Cornice cap — projecting crown molding above the architrave
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(lintW + colR * 1.2, lintH * 0.5, colR * 2.0), stoneMat);
    cornice.position.set(dfx, lintY + lintH * 0.58, dfz);
    cornice.rotation.y = faceAngle;
    cornice.castShadow = true; scene.add(cornice);

    // Double arch above lintel
    const archR     = doorW * 0.52 + colR * 1.2;
    const archCentY = lintY + lintH * 0.5 + archR * 0.86;
    const archTube  = Math.max(0.20, archR * 0.053);
    const archOuter = new THREE.Mesh(
      new THREE.TorusGeometry(archR, archTube, 10, 52),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.26),
        transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    archOuter.rotation.y = faceAngle;
    archOuter.position.set(dfx, archCentY, dfz);
    archOuter.renderOrder = 5; scene.add(archOuter);
    const archInner = new THREE.Mesh(
      new THREE.TorusGeometry(archR * 0.70, archTube * 1.48, 8, 40),
      new THREE.MeshBasicMaterial({
        color: palette.primary.clone().lerp(new THREE.Color(0xffffff), 0.58),
        transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    archInner.rotation.y = faceAngle;
    archInner.position.set(dfx, archCentY, dfz);
    archInner.renderOrder = 4; scene.add(archInner);

    // Keystone — wedge block crowning the arch apex (classical centrepiece)
    const keystone = new THREE.Mesh(
      new THREE.BoxGeometry(colR * 1.1, archR * 0.44, colR * 1.35),
      new THREE.MeshStandardMaterial({
        color: palette.secondary.clone().lerp(palette.trim, 0.30),
        emissive: palette.trim.clone(), emissiveIntensity: 0.10,
        roughness: 0.58, metalness: 0.20,
      })
    );
    keystone.position.set(
      dfx + frontDir.x * colR * 0.20,
      archCentY + archR * 0.92,
      dfz + frontDir.z * colR * 0.20
    );
    keystone.rotation.y = faceAngle;
    keystone.castShadow = true; scene.add(keystone);

    // Threshold glow tile
    const threshW = doorW + colR * 2.6;
    const threshD = Math.max(2.8, fp * 0.068);
    const thresh  = new THREE.Mesh(
      new THREE.PlaneGeometry(threshW, threshD),
      new THREE.MeshBasicMaterial({
        color: palette.trim, transparent: true, opacity: 0.40,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    thresh.rotation.order = 'YXZ';
    thresh.rotation.y = faceAngle;
    thresh.rotation.x = -Math.PI / 2;
    thresh.position.set(dfx + frontDir.x * threshD * 0.5, doorY + 0.16,
                        dfz + frontDir.z * threshD * 0.5);
    thresh.renderOrder = 3; scene.add(thresh);

    // Approach path
    const pathLen = Math.max(8, fp * 0.22);
    const path    = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.46, pathLen),
      new THREE.MeshBasicMaterial({
        color: palette.primary, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    path.rotation.order = 'YXZ';
    path.rotation.y = faceAngle;
    path.rotation.x = -Math.PI / 2;
    path.position.set(dfx + frontDir.x * (threshD + pathLen * 0.5), doorY + 0.12,
                      dfz + frontDir.z * (threshD + pathLen * 0.5));
    path.renderOrder = 2; scene.add(path);

    // Two entry steps
    const stepH   = 0.25;
    const stepD   = Math.max(1.5, fp * 0.040);
    const stepW   = doorW + colR * 3.0;
    const stepMat = new THREE.MeshStandardMaterial({
      color: palette.structural.clone().lerp(new THREE.Color(0xbab0a0), 0.30),
      roughness: 0.90, metalness: 0.02,
      emissive: palette.primary.clone(), emissiveIntensity: 0.005,
    });
    for (let i = 0; i < 2; i++) {
      const stepFaceR = doorFaceR - stepD * (1.8 - i * 0.90);
      const sx  = x + frontDir.x * stepFaceR;
      const sz  = z + frontDir.z * stepFaceR;
      const stp = new THREE.Mesh(
        new THREE.BoxGeometry(stepW - i * colR * 0.8, stepH, stepD), stepMat);
      stp.position.set(sx, doorY + stepH * (i + 0.5), sz);
      stp.rotation.y = faceAngle;
      stp.castShadow = true; stp.receiveShadow = true; scene.add(stp);
    }
  }

  // ── GROUND PLAQUE ──────────────────────────────────────────────────────────
  // Engraved name slab at the doorstep. faceR = actual building face.
  function addGroundPlaque(x, z, color, text, doorY, footprint, frontDir, faceR) {
    const fp        = footprint || 50;
    const plaqueW   = Math.max(6.5, fp * 0.19);
    const plaqueD   = Math.max(2.6, fp * 0.072);
    const plaqueH   = 0.20;
    const doorFaceR = faceR || fp * 0.46;
    const plaqueR   = doorFaceR + Math.max(3.5, fp * 0.13);
    const faceAngle = Math.atan2(frontDir.x, frontDir.z);
    const px_       = x + frontDir.x * plaqueR;
    const pz_       = z + frontDir.z * plaqueR;

    const slabCol = new THREE.Color(0x060910).lerp(new THREE.Color(color), 0.14);
    const slab    = new THREE.Mesh(
      new THREE.BoxGeometry(plaqueW, plaqueH, plaqueD),
      new THREE.MeshStandardMaterial({
        color: slabCol, roughness: 0.84, metalness: 0.06,
        emissive: new THREE.Color(color), emissiveIntensity: 0.020,
      })
    );
    slab.position.set(px_, doorY + plaqueH * 0.5, pz_);
    slab.rotation.y = faceAngle;
    slab.receiveShadow = true; slab.castShadow = true; scene.add(slab);

    // Canvas text engraved on slab top
    const W  = 256, H = 64;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const col = hexColor(color);
    ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.strokeText(text, W / 2, H / 2);
    const tex  = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4; tex.needsUpdate = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(plaqueW * 0.86, plaqueD * 0.76),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.83,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    face.rotation.order = 'YXZ';
    face.rotation.y = faceAngle;
    face.rotation.x = -Math.PI / 2;
    face.position.set(px_, doorY + plaqueH + 0.02, pz_);
    face.renderOrder = 3; scene.add(face);
  }

  // ── SHARED RIBS (InstancedMesh) ───────────────────────────────────────────
  function addRibs(x, z, palette, baseY, roofY, footprint) {
    const H    = Math.max(1, roofY - baseY);
    const r    = footprint * 0.48;
    const ribW = Math.max(0.7, footprint * 0.030);
    const N    = 8;
    const ribIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(ribW, H, ribW),
      new THREE.MeshStandardMaterial({
        color: palette.secondary.clone().lerp(palette.structural, 0.30),
        emissive: palette.secondary.clone(), emissiveIntensity: 0.05,
        metalness: 0.08, roughness: 0.76,
      }),
      N
    );
    ribIM.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      dummy.position.set(x + Math.cos(angle) * r, baseY + H * 0.5, z + Math.sin(angle) * r);
      dummy.rotation.set(0, angle, 0); dummy.updateMatrix();
      ribIM.setMatrixAt(i, dummy.matrix);
    }
    ribIM.instanceMatrix.needsUpdate = true; scene.add(ribIM);

    // Cap cylinders
    const capIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(ribW * 1.2, ribW * 1.2, ribW * 0.55, 8),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.10),
        transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      N
    );
    capIM.renderOrder = 3;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      dummy.position.set(x + Math.cos(angle) * r, roofY + ribW * 0.28, z + Math.sin(angle) * r);
      dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      capIM.setMatrixAt(i, dummy.matrix);
    }
    capIM.instanceMatrix.needsUpdate = true; scene.add(capIM);
  }

  // ── RECESSED WINDOWS (InstancedMesh — 3 draw calls total per building) ──────
  // Each window = frame surround (solid geometry) + near-black recess box + additive glass.
  // The recess box is physically punched into the facade depth → real shadow, real depth.
  // faceR: actual face distance from building center (per-building, fixes position accuracy).
  function addWindowsRecessed(x, z, palette, baseY, roofY, footprint, faceR, sides, rows, cols) {
    const H      = Math.max(1, roofY - baseY);
    const fp     = footprint;
    const actual_r  = (faceR !== undefined ? faceR : fp * 0.49);
    const winW   = Math.max(1.4, fp * 0.044);
    const winH   = Math.max(2.0, fp * 0.068);
    const depth  = Math.max(0.9, fp * 0.024);   // physical recess depth — creates shadow pocket
    const frameT = Math.max(0.24, fp * 0.008);  // frame reveal thickness
    const colSpacing = winW + Math.max(1.0, fp * 0.030);
    const count  = sides * rows * cols;
    if (count < 1) return;

    // 1) Frame surround — stands proud of facade surface, creates shadowed reveal edge
    const frameMat = new THREE.MeshStandardMaterial({
      color:    palette.structural.clone().lerp(palette.secondary, 0.24),
      emissive: palette.trim.clone(), emissiveIntensity: 0.040,
      roughness: 0.63, metalness: 0.22,
    });
    const frameIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(winW + frameT * 2, winH + frameT * 2, frameT * 1.6),
      frameMat, count);
    frameIM.castShadow = true;

    // 2) Recess void — near-black deep box; the shadow depth that makes the facade read as 3D
    const recessMat = new THREE.MeshStandardMaterial({
      color:    new THREE.Color(0x000204),
      emissive: palette.primary.clone(), emissiveIntensity: 0.010,
      roughness: 0.99, metalness: 0.0,
    });
    const recessIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(winW, winH, depth), recessMat, count);

    // 3) Glass glow — additive interior-light plane at the back of the recess
    const glassMat = new THREE.MeshBasicMaterial({
      color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.12),
      transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glassIM = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(winW * 0.78, winH * 0.78), glassMat, count);
    glassIM.renderOrder = 3;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      for (let row = 0; row < rows; row++) {
        const yPos = baseY + H * (0.16 + (row / Math.max(1, rows - 1)) * 0.66);
        for (let col = 0; col < cols; col++) {
          const xOff = (col - (cols - 1) * 0.5) * colSpacing;
          // Point on the facade surface
          const fx = x + cosF * actual_r + cosP * xOff;
          const fz = z + sinF * actual_r + sinP * xOff;

          // Frame: just proud of facade surface along the outward normal
          dummy.position.set(fx + cosF * (frameT * 0.80), yPos, fz + sinF * (frameT * 0.80));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          frameIM.setMatrixAt(idx, dummy.matrix);

          // Recess box: center is depth/2 behind the facade surface
          dummy.position.set(fx - cosF * (depth * 0.5 - 0.12), yPos, fz - sinF * (depth * 0.5 - 0.12));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          recessIM.setMatrixAt(idx, dummy.matrix);

          // Glass: at the very back of the recess
          dummy.position.set(fx - cosF * (depth - 0.22), yPos, fz - sinF * (depth - 0.22));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          glassIM.setMatrixAt(idx, dummy.matrix);

          idx++;
        }
      }
    }
    frameIM.instanceMatrix.needsUpdate = true; scene.add(frameIM);
    recessIM.instanceMatrix.needsUpdate = true; scene.add(recessIM);
    glassIM.instanceMatrix.needsUpdate  = true; scene.add(glassIM);
  }

  // ── CARVED RELIEF: ENGAGED PILASTERS (corner piers, base + shaft + capital) ─
  // A slender engaged pier at every facade corner/edge, giving vertical relief and
  // reading as quoined corner stones. 3 InstancedMesh (base / shaft / capital).
  function _pilasters(x, z, baseY, topY, faceR, sides, pal, fp) {
    const H      = Math.max(2, topY - baseY);
    const shaftH = H * 0.86;
    const pw     = Math.max(0.9, faceR * 0.10);
    const pd     = Math.max(0.5, faceR * 0.05);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(pal.secondary, 0.22),
      emissive: pal.trim.clone(), emissiveIntensity: 0.022,
      roughness: 0.74, metalness: 0.14,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.050,
      roughness: 0.62, metalness: 0.18,
    });
    const shaftIM = new THREE.InstancedMesh(new THREE.BoxGeometry(pw, shaftH, pd), shaftMat, sides);
    const baseIM  = new THREE.InstancedMesh(new THREE.BoxGeometry(pw * 1.5, H * 0.06, pd * 1.5), capMat, sides);
    const capIM   = new THREE.InstancedMesh(new THREE.BoxGeometry(pw * 1.7, H * 0.05, pd * 1.7), capMat, sides);
    shaftIM.castShadow = baseIM.castShadow = capIM.castShadow = true;
    const d = new THREE.Object3D();
    for (let s = 0; s < sides; s++) {
      const ea  = (s / sides) * Math.PI * 2;                 // corner / edge angle
      const rot = Math.atan2(Math.cos(ea), Math.sin(ea));    // local +Z → radial outward
      const cx  = x + Math.cos(ea) * (faceR + pd * 0.5);
      const cz  = z + Math.sin(ea) * (faceR + pd * 0.5);
      d.rotation.set(0, rot, 0);
      d.position.set(cx, baseY + H * 0.06 + shaftH * 0.5, cz); d.updateMatrix(); shaftIM.setMatrixAt(s, d.matrix);
      d.position.set(cx, baseY + H * 0.03, cz);                d.updateMatrix(); baseIM.setMatrixAt(s, d.matrix);
      d.position.set(cx, baseY + H * 0.06 + shaftH, cz);       d.updateMatrix(); capIM.setMatrixAt(s, d.matrix);
    }
    shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
    baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
    capIM.instanceMatrix.needsUpdate   = true; scene.add(capIM);
  }

  // ── CARVED RELIEF: STRING COURSES — projecting horizontal moldings ──────────
  // Solid, shadow-casting horizontal bands wrapping each face at two heights → the
  // wall reads as banded stone, not a flat slab. 1 IM (per-face segments × heights).
  function _stringCourses(x, z, baseY, topY, faceR, sides, pal, fp) {
    const H       = Math.max(2, topY - baseY);
    const heights = [0.30, 0.62];
    const count   = sides * heights.length;
    const sh    = Math.max(0.7, faceR * 0.05);
    const sd    = Math.max(0.5, faceR * 0.04);
    const faceW = faceR * (Math.PI * 2 / sides) * 0.98;
    const mat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.34),
      emissive: pal.trim.clone(), emissiveIntensity: 0.045,
      roughness: 0.66, metalness: 0.14,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(faceW, sh, sd), mat, count);
    im.castShadow = true;
    const d = new THREE.Object3D(); let idx = 0;
    for (let h = 0; h < heights.length; h++) {
      const y = baseY + H * heights[h];
      for (let s = 0; s < sides; s++) {
        const fa = (s / sides) * Math.PI * 2 + Math.PI / sides;   // face center
        d.rotation.set(0, Math.atan2(Math.cos(fa), Math.sin(fa)), 0);
        d.position.set(x + Math.cos(fa) * (faceR + sd * 0.5), y, z + Math.sin(fa) * (faceR + sd * 0.5));
        d.updateMatrix(); im.setMatrixAt(idx++, d.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── CARVED RELIEF: FRIEZE BAND — row of carved blocks under the cornice ─────
  // A metope/dentil-style carved frieze near the top of the facade. 1 IM.
  function _friezeBand(x, z, y, faceR, sides, pal, fp) {
    const per   = 5;
    const count = sides * per;
    const bw = Math.max(0.7, faceR * 0.05);
    const bh = Math.max(1.0, faceR * 0.075);
    const bd = Math.max(0.5, faceR * 0.045);
    const mat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(pal.secondary, 0.26),
      emissive: pal.trim.clone(), emissiveIntensity: 0.55,
      // Faint ornamental chevron frieze (shared cached CanvasTexture) glows in the
      // accent colour on the cornice band → carved-relief detail, not a flat block.
      emissiveMap: _friezeTexture(),
      roughness: 0.60, metalness: 0.18,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(bw, bh, bd), mat, count);
    im.castShadow = true;
    const faceW = faceR * (Math.PI * 2 / sides) * 0.82;
    const d = new THREE.Object3D(); let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      const rot  = Math.atan2(Math.cos(fa), Math.sin(fa));
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * (faceW / per);
        d.rotation.set(0, rot, 0);
        d.position.set(
          x + cosF * (faceR + bd * 0.5) + cosP * o, y,
          z + sinF * (faceR + bd * 0.5) + sinP * o);
        d.updateMatrix(); im.setMatrixAt(idx++, d.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── CROWNING CORNICE CAP — projecting molding ring at the wall top ──────────
  // Additive detail pass: without this the facade wall simply STOPS at topY, which
  // reads as an unfinished slab edge. This lays a shallow, slightly-overhanging
  // molding around the very top of each face (a proper terminated roofline / crown).
  // Per-face box segments (matches _stringCourses / _friezeBand placement math) so it
  // hugs the wall radius on flat AND cylinder buildings. Overhang is small (bd only)
  // → stays inside the building silhouette, never reaches the ground lounge.
  // 2 IM = 2 draw calls: main fascia band + a thinner brighter drip edge just under it.
  function _corniceCap(x, z, topY, faceR, sides, pal, fp) {
    const faceW = faceR * (Math.PI * 2 / sides) * 0.995;   // full face width, tiny seam gap
    const bh    = Math.max(1.0, faceR * 0.055);            // fascia height
    const bd    = Math.max(0.6, faceR * 0.05);             // projection (overhang) depth
    // Main fascia — solid stone molding, seats so its top aligns with topY.
    const capMat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.05,
      roughness: 0.60, metalness: 0.20,
    });
    // Drip edge — thin bright lip under the fascia = crisp shadow line + accent glow.
    const lipMat = new THREE.MeshStandardMaterial({
      color:    pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.16),
      emissive: pal.trim.clone(), emissiveIntensity: 0.30,
      roughness: 0.45, metalness: 0.30,
    });
    const capIM = new THREE.InstancedMesh(new THREE.BoxGeometry(faceW, bh, bd), capMat, sides);
    const lipH  = bh * 0.28;
    const lipIM = new THREE.InstancedMesh(new THREE.BoxGeometry(faceW * 0.96, lipH, bd * 1.14), lipMat, sides);
    capIM.castShadow = true;
    const d = new THREE.Object3D();
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;   // face center
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const rot  = Math.atan2(Math.cos(fa), Math.sin(fa));
      // Fascia: top edge flush with topY, projecting outward by bd*0.5 beyond the wall.
      d.rotation.set(0, rot, 0);
      d.position.set(x + cosF * (faceR + bd * 0.5), topY - bh * 0.5, z + sinF * (faceR + bd * 0.5));
      d.updateMatrix(); capIM.setMatrixAt(s, d.matrix);
      // Drip lip: sits just under the fascia, projecting a hair further for a shadow ledge.
      d.position.set(x + cosF * (faceR + bd * 0.5), topY - bh - lipH * 0.5, z + sinF * (faceR + bd * 0.5));
      d.updateMatrix(); lipIM.setMatrixAt(s, d.matrix);
    }
    capIM.instanceMatrix.needsUpdate = true; scene.add(capIM);
    lipIM.instanceMatrix.needsUpdate = true; scene.add(lipIM);
  }

  // ── WINDOW SILLS — projecting ledge under each recessed window ──────────────
  // Additive detail pass: the recessed windows have a frame reveal but sit flush at
  // the bottom, so the opening reads slightly floating. A thin projecting sill under
  // each window grounds the opening (classic architectural read). Placement math is a
  // 1:1 mirror of addWindowsRecessed() so every sill lands exactly under its window.
  // 1 IM = 1 draw call. Overhang tiny; windows are at facade height, far above lounge.
  function _windowSills(x, z, baseY, roofY, footprint, faceR, sides, rows, cols, pal) {
    const H     = Math.max(1, roofY - baseY);
    const fp    = footprint;
    const winW  = Math.max(1.4, fp * 0.044);
    const winH  = Math.max(2.0, fp * 0.068);
    const frameT = Math.max(0.24, fp * 0.008);
    const colSpacing = winW + Math.max(1.0, fp * 0.030);
    const count = sides * rows * cols;
    if (count < 1) return;
    const sillW = winW + frameT * 2.4;                 // a touch wider than the frame
    const sillH = Math.max(0.28, fp * 0.010);
    const sillD = Math.max(0.5, fp * 0.016);           // projection beyond facade
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(pal.secondary, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.035,
      roughness: 0.66, metalness: 0.18,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(sillW, sillH, sillD), mat, count);
    im.castShadow = true;
    const d = new THREE.Object3D();
    let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      for (let row = 0; row < rows; row++) {
        const yPos = baseY + H * (0.16 + (row / Math.max(1, rows - 1)) * 0.66);
        for (let col = 0; col < cols; col++) {
          const xOff = (col - (cols - 1) * 0.5) * colSpacing;
          const fx = x + cosF * faceR + cosP * xOff;
          const fz = z + sinF * faceR + sinP * xOff;
          // Sill sits at the window's bottom edge, projecting proud of the facade.
          d.position.set(
            fx + cosF * (sillD * 0.4),
            yPos - winH * 0.5 - sillH * 0.4,
            fz + sinF * (sillD * 0.4));
          d.rotation.set(0, fa, 0); d.updateMatrix();
          im.setMatrixAt(idx++, d.matrix);
        }
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── HERALDIC FLUX BANNER (2026-07-09) ─────────────────────────────────────
  // Hangs a tall vertical fabric banner (real HuggingFace FLUX art from
  // /assets/banners/<code>.jpg) UP on a tower's FRONT facade, facing world-centre
  // (frontDir), seated in the upper third of the elevated mass. Visual only:
  //   • NO collider, NO ground geometry — the walk-through lounge stays clear.
  //   • Built ONCE at build time (freeze-safe): geometry + material + textures are
  //     created here and never touched per-frame (no allocation in update()).
  //   • Texture is loaded SRGB and its material is DoubleSide so the pennant reads
  //     from either approach; a thin dark rod at top + a weighted hem bar at bottom
  //     give it a finished, hung-tapestry look.
  // buildingCode → banner asset code (only the 6 agent towers are decorated here).
  const _BANNER_CODE = {
    'nexus-hub':        'nexus',
    'library':          'quill',    // QUILL's grand library
    'aegis':            'pikadon',
    'museum':           'turtle',
    'markets-exchange': 'zerox',
    'oracle-spire':     'oracle',
    'source-spire':     'shaddai',  // (SHADDAI temple, if ever built via this path)
  };
  const _bannerTexCache = {};       // code → THREE.Texture (shared if a code repeats)

  function hangBanner(code, x, z, frontDir, faceR, baseY, topY, pal) {
    if (!code) return;
    // Vertical span of the elevated mass; seat the banner across the upper third so
    // it flies high and clear of the doorway/relief lower down.
    const H       = Math.max(1, topY - baseY);
    const bannerH = Math.min(26, Math.max(16, H * 0.40));      // ~16–26u tall
    const bannerW = Math.min(16, Math.max(10, faceR * 0.34));  // ~10–16u wide
    // Centre height ≈ upper third of the facade (clearly visible from a distance).
    const cy      = baseY + H * 0.70;
    // Stand the banner CLEARLY proud of the wall — 0.9 clipped into the facade relief
    // (mullions/conduits/greebles + the new cornices), which read as the banner being
    // "stuck in the building". 3.2 lets it hang free in front of all facade detail.
    const standoff = 3.2;
    const fr      = faceR + standoff;
    const cx      = x + frontDir.x * fr;
    const cz      = z + frontDir.z * fr;
    const faceAng = Math.atan2(frontDir.x, frontDir.z);        // yaw so +Z of the plane faces world-centre

    // Shared texture per code (SRGB, silent onError so a missing file can't break load).
    let tex = _bannerTexCache[code];
    if (tex === undefined) {
      tex = null;
      try {
        const tl = new THREE.TextureLoader();
        tex = tl.load('/assets/banners/' + code + '.jpg', undefined, undefined, function () { /* silent */ });
        tex.anisotropy = 4;
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      } catch (e) { tex = null; }
      _bannerTexCache[code] = tex;
    }

    // ── The cloth: a tall vertical plane carrying the FLUX banner art. ──────────
    const clothMat = new THREE.MeshStandardMaterial({
      map: tex || null,
      color: tex ? 0xffffff : (pal ? pal.body : 0x101018),
      roughness: 0.86, metalness: 0.04,
      emissive: pal ? pal.primary : 0x223344, emissiveMap: tex || null, emissiveIntensity: tex ? 0.14 : 0.05,
      side: THREE.DoubleSide, transparent: false,
    });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerH), clothMat);
    cloth.position.set(cx, cy, cz);
    cloth.rotation.y = faceAng;
    scene.add(cloth);

    // ── Trim: a dark rod across the top + a weighted hem bar across the bottom, so
    //    the banner reads as a real hung tapestry (not a floating sticker). Both are
    //    thin cylinders spanning the banner width, laid along the facade tangent. ──
    const px = -frontDir.z, pz = frontDir.x;                   // tangent along the face
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d12, roughness: 0.5, metalness: 0.7,
      emissive: pal ? pal.trim : 0x556677, emissiveIntensity: 0.10,
    });
    const rodLen = bannerW * 1.08;
    function bar(yy, r) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(r, r, rodLen, 8), rodMat);
      rod.rotation.z = Math.PI / 2;                            // lay horizontal…
      rod.rotation.y = faceAng;                                // …along the facade tangent
      rod.position.set(cx + px * 0, yy, cz + pz * 0);
      scene.add(rod);
    }
    bar(cy + bannerH * 0.5 + 0.25, 0.42);                      // top rod (banner hangs from it)
    bar(cy - bannerH * 0.5 - 0.20, 0.30);                      // bottom weighted hem
  }

  // ── FULL DECORATION SUITE ─────────────────────────────────────────────────
  // faceR = actual building face radius (from each builder).
  // buildingCode used to tune window sides/density.
  // The single grand entrance is built by _doorRecess() (deep walk-in portal + layered
  // archivolt + panelled ajar doors + warm interior spill + steps) framed by addEntrance()
  // columns. The old _boldDoorway() glowing-plane + beacon was redundant with that portal
  // and clashed on the same frontDir wall, so it was removed for one cohesive doorway.

  function decorate(x, z, color, displayName, footprint, topY, frontDir, faceR, buildingCode, liftBaseY) {
    // liftBaseY: when the building mass is raised onto pillars (PILLAR PAVILION),
    // the podium / entrance / windows / relief must build at that SAME elevated
    // level — otherwise they'd stay at ground while the tower floats above them.
    const baseY   = (liftBaseY != null) ? liftBaseY : gy(x, z);
    const palette = buildPalette(color);
    const fp      = footprint || 50;

    // Cylinder buildings get a round podium + round window band; box buildings square.
    const isCylinder = (buildingCode === 'nexus-hub' || buildingCode === 'oracle-spire');

    groundMarker(x, z, color, fp * 0.47);   // seam AT the wall foot, not a wide halo
    accentTrimRing(x, z, palette.trim, topY, fp);   // no-op (floating roof halo removed)

    const apronH   = addMonumentBase(x, z, palette, baseY, fp, isCylinder, frontDir);
    const landingY = baseY + apronH;   // top of the podium — walls + door seat here

    addEntrance(x, z, palette, landingY, fp, frontDir, faceR);   // columns framing the _doorRecess portal
    if (displayName) addGroundPlaque(x, z, color, displayName, landingY, fp, frontDir, faceR);
    addRibs   (x, z, palette, landingY, topY, fp);

    // ── Recessed windows: 3 IM objects, real physical depth ──────────────────
    // Cylinder buildings get more sides; box buildings use 4.
    const winSides   = isCylinder ? 6 : 4;
    const winRows    = 5, winCols = 3;
    addWindowsRecessed(x, z, palette, landingY, topY, fp, faceR, winSides, winRows, winCols);

    // ── Window sills — projecting ledge under each window, grounds the opening ─
    _windowSills(x, z, landingY, topY, fp, faceR, winSides, winRows, winCols, palette);

    // ── Mullion strips — vertical panel seams, 1 IM ──────────────────────────
    _mullionStrips(x, z, landingY, topY, faceR, winSides, winCols + 1, palette);

    // ── Horizontal conduit runs at mechanical levels (1 IM each = 2 draw calls) ─
    const h1 = landingY + (topY - landingY) * 0.32;
    const h2 = landingY + (topY - landingY) * 0.64;
    _conduitRun(x, z, h1, faceR, winSides, fp, palette);
    _conduitRun(x, z, h2, faceR, winSides, fp, palette);

    // ── Carved architectural relief on every building: engaged pilasters (corner
    // piers / quoins), projecting horizontal string courses, and a cornice frieze
    // band. All instanced; kept within the same envelope as the window band. ────
    const Hfull = topY - landingY;
    _pilasters    (x, z, landingY, topY, faceR, winSides, palette, fp);
    _stringCourses(x, z, landingY, topY, faceR, winSides, palette, fp);
    _friezeBand   (x, z, landingY + Hfull * 0.86, faceR, winSides, palette, fp);

    // ── Crowning cornice cap — projecting molding terminates the wall at topY, so
    // the roofline reads as a finished crown, not a cut-off slab edge. ──────────
    _corniceCap   (x, z, topY, faceR, winSides, palette, fp);

    // ── Heraldic FLUX banner flown on the FRONT facade (upper third), facing
    // world-centre. Visual only — no collider, seated on the elevated mass so the
    // walk-through lounge below stays completely clear. Built once (freeze-safe). ─
    hangBanner(_BANNER_CODE[buildingCode], x, z, frontDir, faceR, landingY, topY, palette);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8 DISTINCT PROCEDURAL BUILDING BUILDERS
  // Each returns { topY, faceR } — faceR is the ACTUAL face distance, used to
  // seat the entrance flush against the building wall (fixes floating).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── SHADDAI TEMPLE — stepped octagonal ziggurat + central spire, GOLD ────
  // faceR = first tier radius (fp * 0.46) — the entrance was always correct here.
  function _buildShaddaiTemple(x, z, baseY, pal, fp, code, frontDir) {
    frontDir = frontDir || { x: 0, z: -1 };
    // Deep-gold body: structural (near-black) + 50% primary tint
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x09070a).lerp(pal.primary, 0.50),
      emissive: pal.primary.clone(), emissiveIntensity: 0.022,
      roughness: 0.62, metalness: 0.18,
    });
    regFacade(code, bodyMat);

    const tiers = [
      { r: fp * 0.46, h: 12 },
      { r: fp * 0.33, h: 13 },
      { r: fp * 0.22, h: 14 },
      { r: fp * 0.13, h: 15 },
    ];
    let y = baseY;
    for (const t of tiers) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r * 0.92, t.r, t.h, 8), bodyMat);
      mesh.position.set(x, y + t.h * 0.5, z);
      mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
      // Emissive belt at each tier transition
      _band(x, z, y + t.h, t.r * 0.94, t.r * 0.014, pal);
      y += t.h;
    }

    // Belt courses up the first (largest) tier
    _beltCourses(x, z, baseY, baseY + tiers[0].h, tiers[0].r * 0.96, tiers[0].r * 0.008, 4, pal);

    // Greeble panels on first tier faces
    _greeblePanels(x, z, baseY, baseY + tiers[0].h,
      tiers[0].r * 0.94, 8, 3, 2, fp * 0.045, fp * 0.045, pal);

    // ── GRAND BASE COLONNADE ────────────────────────────────────────────────
    // A peristyle of fluted columns rings tier 0, standing just outside the cella
    // wall so the temple base reads as PILLARS, not a solid block. The ring has a
    // wide OPEN gap aligned to frontDir (i.e. facing world-centre / the entrance),
    // with the entablature lintels over the gap omitted → a real walk-in portico.
    // Columns rise a touch above tier 0 so they appear to carry the setback above.
    _colonnade(
      x, z, baseY,
      tiers[0].r * 1.16,          // ring radius — just outside the fp*0.46 cella wall
      tiers[0].h * 1.04,          // column height ≈ first tier
      fp * 0.019,                 // column radius
      24,                         // columns before the entrance gap is cut
      frontDir, 0.42,             // gap faces world-centre (~48° clear opening)
      pal
    );

    // ── GRAND ENTRANCE STAIRCASE ────────────────────────────────────────────
    // Owner ask: "the temple at the top should have stairs." A monumental flight
    // climbs the frontDir (entrance) side up to the tier-0 PLATFORM / door
    // threshold (top tread level = baseY, where the _doorRecess sits). It seats on
    // the temple base and marches OUT through the open colonnade gap (which faces
    // frontDir), so it reads as the clear ceremonial way up — no piece blocks it.
    //   • 1 InstancedMesh for the treads (shared box geo, matrices baked once).
    //   • 1 InstancedMesh for the two flanking cheek/stringer walls.
    // All matrices baked at build; nothing per-frame, no per-frame `new`.
    {
      const faceAng   = Math.atan2(frontDir.x, frontDir.z);
      const px = -frontDir.z, pz = frontDir.x;         // tangent along the entrance face
      const STEP_N    = 10;                             // grand flight
      const totalRise = tiers[0].h * 1.10;             // top tread ≈ platform top (baseY)
      const riseEach  = totalRise / STEP_N;
      const treadD    = Math.max(2.2, fp * 0.030);     // depth of each tread
      const stepW     = Math.max(14, tiers[0].r * 1.30); // wide, matched to the temple face
      // Innermost tread edge sits just outside the cella wall (fp*0.46); the flight
      // then marches OUTWARD (larger radius) as it descends to the ground.
      const innerR    = tiers[0].r * 1.02;
      // Matched gold materials (same family as the temple body/spire accents).
      const stairMat  = new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(new THREE.Color(0xffd700), 0.34),
        emissive: pal.primary.clone(), emissiveIntensity: 0.028,
        roughness: 0.60, metalness: 0.22,
      });
      const cheekMat  = new THREE.MeshStandardMaterial({
        color: pal.secondary.clone().lerp(pal.structural, 0.24),
        emissive: pal.trim.clone(), emissiveIntensity: 0.05,
        roughness: 0.56, metalness: 0.24,
      });

      const treadIM = new THREE.InstancedMesh(
        new THREE.BoxGeometry(stepW, riseEach + 1.0, treadD), stairMat, STEP_N);
      treadIM.castShadow = true; treadIM.receiveShadow = true;
      const d = new THREE.Object3D();
      // i=0 is the TOP tread (hugging the platform), i=STEP_N-1 is the lowest/outermost.
      for (let i = 0; i < STEP_N; i++) {
        const topY   = baseY - riseEach * i;                 // each step down from platform
        const botY   = baseY - totalRise - 2.4;              // buried deep → no floating edges
        const radial = innerR + treadD * (i + 0.5);          // step OUT as it descends
        d.rotation.set(0, faceAng, 0);
        d.position.set(x + frontDir.x * radial, (topY + botY) * 0.5, z + frontDir.z * radial);
        d.scale.set(1, (topY - botY) / (riseEach + 1.0), 1);
        d.updateMatrix(); treadIM.setMatrixAt(i, d.matrix);
      }
      treadIM.instanceMatrix.needsUpdate = true; scene.add(treadIM);

      // Two flanking CHEEK / STRINGER walls — solid raked stringers seating the flight
      // as intentional architecture (and framing the ascent). One IM, 2 instances.
      const cheekW   = Math.max(2.0, stepW * 0.06);
      const cheekLen = (treadD * STEP_N) * 1.06;             // spans the flight length
      const cheekH   = totalRise + 3.0;
      const cheekMidR = innerR + (treadD * STEP_N) * 0.5;   // mid-radius of the flight
      const cheekIM  = new THREE.InstancedMesh(
        new THREE.BoxGeometry(cheekW, cheekH, cheekLen), cheekMat, 2);
      cheekIM.castShadow = true; cheekIM.receiveShadow = true;
      { let k = 0;
        for (const side of [-1, 1]) {
          const o = side * (stepW * 0.5 + cheekW * 0.5);
          d.rotation.set(0, faceAng, 0);
          d.scale.set(1, 1, 1);
          d.position.set(
            x + frontDir.x * cheekMidR + px * o,
            baseY - cheekH * 0.5 + 1.5,                       // top of cheek ≈ platform
            z + frontDir.z * cheekMidR + pz * o
          );
          d.updateMatrix(); cheekIM.setMatrixAt(k++, d.matrix);
        }
        cheekIM.instanceMatrix.needsUpdate = true; scene.add(cheekIM);
      }
    }

    // Central spire
    const spireH  = 38;
    const spireMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffd700), 0.50),
      emissive: pal.primary.clone(), emissiveIntensity: 0.20,
      roughness: 0.44, metalness: 0.30,
    });
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(fp * 0.016, fp * 0.068, spireH, 8), spireMat);
    spire.position.set(x, y + spireH * 0.5, z);
    spire.castShadow = true; scene.add(spire);
    y += spireH;

    // Crown orb
    const orbMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.28,
      roughness: 0.34, metalness: 0.34,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(fp * 0.036, 12, 8), orbMat);
    orb.position.set(x, y, z); scene.add(orb);
    y += fp * 0.036;

    // 4 corner mini-spires off tier 0 — InstancedMesh (1 draw call vs 4)
    const miniR = fp * 0.32, miniH = 26;
    const miniIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.008, fp * 0.036, miniH, 6), spireMat, 4);
    miniIM.castShadow = true;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        d.position.set(
          x + Math.cos(a) * miniR,
          baseY + miniH * 0.5 + tiers[0].h * 0.30,
          z + Math.sin(a) * miniR
        );
        d.updateMatrix(); miniIM.setMatrixAt(i, d.matrix);
      }
      miniIM.instanceMatrix.needsUpdate = true; scene.add(miniIM);
    }

    // ── Rooftop: ritual antenna array + satellite dish on tier-1 ────────────
    // TRIM: the antenna cluster was seated at `y` (the crown-orb tip, ~40u above the
    // temple on a spire only fp*0.016 wide) — its rods radiate to fp*0.094, so they
    // FLOATED in open air beside the thin spire with no surface under them. Re-seat
    // the array onto the tier-2 rooftop platform (same ceremonial roof shelf the
    // exhaust stacks stand on) so every rod plants on real roof.
    _antennaCluster(x, z, baseY + tiers[0].h + tiers[1].h, fp, 8, pal);
    _satelliteDish(x + tiers[1].r * 0.72, z, baseY + tiers[0].h, fp * 0.055, pal);
    // Exhaust stacks as ceremonial brazier chimneys around tier-2 platform
    _exhaustStacks(x, z, baseY + tiers[0].h + tiers[1].h, fp * 0.50, 5, pal);

    return { topY: y, faceR: tiers[0].r };  // faceR = fp * 0.46
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEXUS HUB (NAVIGATOR) — a sleek DATA-CATHEDRAL spire drawn to a φ blueprint.
  //
  // A dark graphite drum-tower (full fp·0.46 body — flush with its round collider)
  // ringed by tall RIBBED buttress FINS that read as a cathedral's clustered piers,
  // laced with glowing vertical CONDUIT lines + horizontal data-ring string courses,
  // stepping up through two φ-reduced setback drums to a lantern, a ribbed cap dome,
  // a broadcast antenna mast and a crowning holographic RING. Teal (0x34e5b0).
  //
  // φ SYSTEM (R = faceR = fp·0.46 = collider radius):
  //   H_main = R·φ   ·  drum2 R/φ, drum3 R/φ²  ·  spire rises from there.
  // CONTRACT: cylinder, faceR = fp·0.46, entrance on frontDir (built by decorate).
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildNexusHub(x, z, baseY, pal, fp, code, frontDir) {
    const PHI = 1.6180339887;
    const R   = fp * 0.46;                     // ← CONTRACT: body flush with collider

    // Dark slate graphite body, teal emissive only.
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.042,
      roughness: 0.52, metalness: 0.26,
    });
    regFacade(code, bodyMat);
    const accentMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.36),
      emissive: pal.trim.clone(), emissiveIntensity: 0.12,
      roughness: 0.44, metalness: 0.34,
    });

    // ── 1) MAIN SHAFT — full-width drum, slight entasis taper. ────────────────
    const H_main = R * PHI;                      // φ-tall primary mass
    _cyl(x, z, baseY, R * 0.97, R, H_main, bodyMat, 28);
    const mainTop = baseY + H_main;

    // Horizontal data-ring string courses + a bold mid accent collar.
    _beltCourses(x, z, baseY, mainTop, R * 1.02, R * 0.012, 7, pal);
    _cyl(x, z, baseY + H_main * 0.5 - R * 0.05, R * 1.06, R * 1.06, R * 0.10, accentMat, 28);

    // ── 2) RIBBED BUTTRESS FINS — tall clustered piers up the full shaft. ─────
    _fins(x, z, baseY, mainTop, R * 1.01, 20, fp * 0.011, fp * 0.055, pal);

    // ── 3) GLOWING CONDUIT LINES — vertical emissive data runs between the fins.
    {
      const N = 20, H = H_main * 0.92;
      const conduitMat = new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.16),
        transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(fp * 0.004, H, 0.3), conduitMat, N);
      im.renderOrder = 3;
      const d = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + Math.PI / N;
        d.position.set(x + Math.cos(a) * (R * 1.03), baseY + H * 0.5 + R * 0.04, z + Math.sin(a) * (R * 1.03));
        d.rotation.set(0, -a, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }

    // ── 4) SETBACK DRUMS — two φ-reduced tiers carrying the spire. ────────────
    const R2 = R / PHI, H2 = R2 * PHI * 0.9;
    _cyl(x, z, mainTop, R2 * 0.96, R2 * 1.04, R2 * 0.16, accentMat, 24);   // shoulder ledge
    const drum2Base = mainTop + R2 * 0.16;
    _cyl(x, z, drum2Base, R2 * 0.94, R2, H2, bodyMat, 22);
    _beltCourses(x, z, drum2Base, drum2Base + H2, R2 * 1.02, R2 * 0.016, 4, pal);
    _fins(x, z, drum2Base, drum2Base + H2, R2 * 1.01, 14, fp * 0.008, fp * 0.036, pal);
    const drum2Top = drum2Base + H2;
    _band(x, z, drum2Top, R2 * 1.06, R2 * 0.03, pal);

    const R3 = R / (PHI * PHI), H3 = R3 * PHI;
    _cyl(x, z, drum2Top, R3, R3 * 1.02, H3, bodyMat, 18);
    const drum3Top = drum2Top + H3;

    // ── 5) LANTERN + RIBBED CAP DOME (16 facets read as ribs). ────────────────
    const domeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.18),
      emissive: pal.trim.clone(), emissiveIntensity: 0.14,
      roughness: 0.40, metalness: 0.30,
    });
    _cyl(x, z, drum3Top, R3 * 0.86, R3 * 0.92, R3 * 0.5, accentMat, 16);
    const domeBase = drum3Top + R3 * 0.5;
    const domeTop  = _dome(x, z, domeBase, R3 * 0.94, domeMat, 16);
    _band(x, z, domeBase, R3 * 0.98, R3 * 0.03, pal);

    // ── 6) BROADCAST ANTENNA MAST + CROWNING HOLO-RING. ───────────────────────
    const antH  = R * 0.62;
    const antMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.24,
      roughness: 0.34, metalness: 0.50,
    });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(fp * 0.003, fp * 0.010, antH, 6), antMat);
    ant.position.set(x, domeTop + antH * 0.5, z); ant.castShadow = true; scene.add(ant);
    const ringY = domeTop + antH * 0.60;
    for (let i = 0; i < 2; i++) {
      const holo = new THREE.Mesh(
        new THREE.TorusGeometry(R3 * (0.7 - i * 0.28), R3 * 0.03, 8, 40),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.34),
          transparent: true, opacity: 0.6 - i * 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      holo.rotation.x = -Math.PI / 2;
      holo.position.set(x, ringY + i * R3 * 0.22, z);
      holo.renderOrder = 4; scene.add(holo);
    }
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(fp * 0.014, 12, 8),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.5),
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    beacon.position.set(x, domeTop + antH, z); beacon.renderOrder = 5; scene.add(beacon);

    // ── 7) ROOFTOP TECH — sensor mast cluster + dish on the main shoulder. ────
    _antennaCluster(x, z, drum2Top, fp, 9, pal);
    _satelliteDish(x + R2 * 0.7, z, mainTop, fp * 0.05, pal);
    _ventBoxes(x, z, mainTop, R * 0.9, 5, pal);

    return { topY: domeTop + antH, faceR: R };   // faceR = fp * 0.46 (CONTRACT)
  }

  // ── SACRED-GEOMETRY TEXTURE: SEED OF LIFE (procedural · offline · $0) ──────
  // Seven interlocking circles (1 centre + 6 on a hexagon of the same radius) — the
  // classical "Seed of Life". White strokes on black so an ADDITIVE material shows
  // only the glowing vesica lattice, tinted by the material's accent colour. Used on
  // the pediment tympanum inlay and the entrance-floor medallion.
  function _seedOfLifeTexture() {
    if (_texCache.seed) return _texCache.seed;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#e6d8ff'; g.lineWidth = 3; g.lineJoin = 'round';
    const cx = S / 2, cy = S / 2, r = S * 0.1666;   // radius = 1/6 → 7 circles fit in 1/2
    const circ = (a, b) => { g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.stroke(); };
    circ(cx, cy);                                   // centre
    for (let i = 0; i < 6; i++) {                   // six around (vesica-piscis lattice)
      const ang = i * Math.PI / 3;
      circ(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    }
    g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r * 2, 0, Math.PI * 2); g.stroke(); // boundary
    return _texCache.seed = _finishTex(cv, false);
  }

  // ── TRIANGULAR PEDIMENT / GABLE (hand-built prism, oriented to frontDir) ───
  // Isosceles cross-section (base 2·halfW along the facade tangent, apex `h` up),
  // extruded `depth` back along the inward normal. Front triangular face = the
  // tympanum. Winding-agnostic (mat is DoubleSide). One mesh, build-time only.
  function _gable(fcx, fcz, baseY, f, halfW, h, depth, mat) {
    const tx = -f.z, tz = f.x;                      // unit tangent
    const V = (o, up, s) => [ fcx + tx * o - f.x * s, baseY + up, fcz + tz * o - f.z * s ];
    const A = V(-halfW, 0, 0), B = V(halfW, 0, 0), C = V(0, h, 0);       // front cap
    const D = V(-halfW, 0, depth), E = V(halfW, 0, depth), F = V(0, h, depth); // back cap
    const pos = new Float32Array([].concat(A, B, C, D, E, F));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex([
      0, 1, 2,          // front tympanum
      3, 5, 4,          // back
      0, 1, 4, 0, 4, 3, // base
      1, 2, 5, 1, 5, 4, // right rake
      2, 0, 3, 2, 3, 5, // left rake
    ]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
    return m;
  }

  // ── FLUTED CORINTHIAN COLONNADE (fully instanced: 5 IM for any column count) ─
  // Each column: Attic base · fluted shaft (20 facets read as flutes) with entasis
  // taper · tall Corinthian bell capital · abacus · astragal glow ring (acanthus
  // hint). `positions` = array of [worldX, worldZ]. Canonical slenderness handled by
  // the caller (H_col ≈ 10·lower-diameter). Returns the abacus-top Y (entablature seat).
  function _corinthianColumns(positions, colBaseY, colR0, H_col, shaftMat, capMat, glowMat) {
    const n = positions.length;
    if (n < 1) return colBaseY + H_col;
    const D0 = colR0 * 2, rTop = colR0 * 0.82;
    const baseH = D0 * 0.5, capH = D0 * 1.15, abH = D0 * 0.18;
    const shaftH = Math.max(2, H_col - baseH - capH);
    const baseIM  = new THREE.InstancedMesh(new THREE.CylinderGeometry(colR0 * 1.16, colR0 * 1.34, baseH, 20), capMat, n);
    const shaftIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(rTop, colR0, shaftH, 20), shaftMat, n);
    const capIM   = new THREE.InstancedMesh(new THREE.CylinderGeometry(rTop * 1.62, rTop * 0.94, capH, 12), capMat, n);
    const abIM    = new THREE.InstancedMesh(new THREE.BoxGeometry(D0 * 1.26, abH, D0 * 1.26), capMat, n);
    const ringIM  = new THREE.InstancedMesh(new THREE.TorusGeometry(rTop * 1.06, colR0 * 0.10, 6, 16), glowMat, n);
    baseIM.castShadow = shaftIM.castShadow = capIM.castShadow = abIM.castShadow = true;
    ringIM.renderOrder = 3;
    const d = new THREE.Object3D();
    const yBase  = colBaseY + baseH * 0.5;
    const yShaft = colBaseY + baseH + shaftH * 0.5;
    const yRing  = colBaseY + baseH + shaftH;
    const yCap   = colBaseY + baseH + shaftH + capH * 0.5;
    const yAb    = colBaseY + baseH + shaftH + capH + abH * 0.5;
    for (let i = 0; i < n; i++) {
      const px = positions[i][0], pz = positions[i][1];
      d.rotation.set(0, 0, 0);
      d.position.set(px, yBase,  pz); d.updateMatrix(); baseIM.setMatrixAt(i, d.matrix);
      d.position.set(px, yShaft, pz); d.updateMatrix(); shaftIM.setMatrixAt(i, d.matrix);
      d.position.set(px, yCap,   pz); d.updateMatrix(); capIM.setMatrixAt(i, d.matrix);
      d.position.set(px, yAb,    pz); d.updateMatrix(); abIM.setMatrixAt(i, d.matrix);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.position.set(px, yRing,  pz); d.updateMatrix(); ringIM.setMatrixAt(i, d.matrix);
    }
    baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
    shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
    capIM.instanceMatrix.needsUpdate   = true; scene.add(capIM);
    abIM.instanceMatrix.needsUpdate    = true; scene.add(abIM);
    ringIM.instanceMatrix.needsUpdate  = true; scene.add(ringIM);
    return colBaseY + H_col + abH;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY (QUILL) — GRAND CLASSICAL LIBRARY, drawn to a real BLUEPRINT.
  //
  // A Pantheon-model temple of knowledge: a pale-marble SQUARE cella (circle-in-
  // square sacred plan) wrapped by a peripteral CORINTHIAN order, fronted by a
  // projecting octastyle PORTICO with a full ENTABLATURE + triangular PEDIMENT
  // (Seed-of-Life tympanum, acroteria), and crowned by a domed reading ROTUNDA
  // with an oculus. Everything is derived from the golden ratio φ.
  //
  // φ PROPORTIONAL SYSTEM (a = 2·faceR = the square plan side):
  //   • H_col  (column order)      = a / φ²          → Corinthian, H_col = 10·D0
  //   • H_ent  (entablature)       = H_col / φ³      → ≈ ¼ of the column (canonical)
  //   • H_wall (cella)             = H_col + H_ent   → columns carry the entablature
  //   • H_ped  (pediment rise)     = (a/2) / φ³      → ~15° gable (Greek pitch)
  //   • drumR  (rotunda)           = faceR / φ²      → circle inscribed in the square
  //   • H_drum                     = drumR / φ
  // CONTRACT (unchanged): footprint 172, faceR = fp·0.46, entrance on frontDir.
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildLibrary(x, z, baseY, pal, fp, code, frontDir) {
    const f       = frontDir || { x: 0, z: -1 };    // toward world-centre (entrance side)
    const faceAng = Math.atan2(f.x, f.z);
    const tX = -f.z, tZ = f.x;                       // unit tangent along the facade
    const PHI = 1.6180339887, PHI2 = PHI * PHI, PHI3 = PHI2 * PHI;

    // ── φ-DERIVED DIMENSIONS ──────────────────────────────────────────────────
    const faceR   = fp * 0.46;                       // ← CONTRACT: collision + door radius
    const a       = 2 * faceR;                       // square cella side (plan)
    const stylH   = a * 0.020;                        // stylobate — low + flat + walkable
    const H_col   = a / PHI2;                         // Corinthian order height
    const D0      = H_col / 10, colR0 = D0 * 0.5;     // lower diameter → 10:1 slenderness
    const H_ent   = H_col / PHI3;                     // architrave + frieze + cornice
    const H_wall  = H_col + H_ent;                    // cella wall height (= a/φ)
    const stylTop = baseY + stylH;
    const cellaTop = stylTop + H_wall;
    const eb      = stylTop + H_col;                  // entablature seat (column-cap top)

    // ── MATERIALS: pale marble body, violet (QUILL 0xb98cff) emissive trim ─────
    const stoneTx = _stoneTexture().clone(); stoneTx.needsUpdate = true;
    stoneTx.wrapS = stoneTx.wrapT = THREE.RepeatWrapping; stoneTx.repeat.set(3, 3);
    const marble = new THREE.MeshStandardMaterial({
      map: stoneTx, color: new THREE.Color(0xe9e3d5),
      emissive: pal.primary.clone(), emissiveIntensity: 0.020,
      roughness: 0.76, metalness: 0.04,
    });
    regFacade(code, marble);
    const capMarble = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xf2ecdd), emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.56, metalness: 0.12,
    });
    const corniceMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe4dccb), emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.62, metalness: 0.10,
    });
    const friezeTx = _friezeTexture().clone(); friezeTx.needsUpdate = true;
    friezeTx.wrapS = friezeTx.wrapT = THREE.RepeatWrapping; friezeTx.repeat.set(8, 1);
    const friezeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd9cfba), emissive: pal.primary.clone(), emissiveIntensity: 0.55,
      emissiveMap: friezeTx, roughness: 0.66, metalness: 0.08,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xbdbccb), side: THREE.DoubleSide,
      emissive: pal.primary.clone(), emissiveIntensity: 0.030, roughness: 0.70, metalness: 0.12,
    });
    const domeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd7d2e4), emissive: pal.primary.clone(), emissiveIntensity: 0.050,
      roughness: 0.62, metalness: 0.14,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.25),
      transparent: true, opacity: 0.50, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const warmMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd9a6),
      transparent: true, opacity: 0.50, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const seedMat = new THREE.MeshBasicMaterial({
      map: _seedOfLifeTexture(), color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.20),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });

    // ── LOCAL HELPER: box oriented to frontDir (local-x = facade tangent) ──────
    const boxAt = (cx, cz, by, w, h, dpt, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
      m.position.set(cx, by + h * 0.5, cz); m.rotation.y = faceAng;
      m.castShadow = true; m.receiveShadow = true; scene.add(m); return by + h;
    };

    // ── 1) STYLOBATE (crepidoma) — one low flat course + a wider bottom step ───
    // Bottom step is FOUNDED 2.4u into the terrain (bottom buried) so no floating
    // base edge shows on a sloped pad; its top face still lands at baseY+stylH·0.1.
    boxAt(x, z, baseY - 2.4, a + D0 * 2.2, 2.4 + stylH * 0.1, a + D0 * 2.2, corniceMat);
    boxAt(x, z, baseY, a + D0 * 0.4, stylH, a + D0 * 0.4, marble);

    // ── 2) SQUARE CELLA (naos) — sacred circle-in-square plan, oriented to f ───
    boxAt(x, z, stylTop, a, H_wall, a, marble);

    // ── 3) PERIPTERAL CORINTHIAN COLONNADE ────────────────────────────────────
    // Octastyle portico (8) projecting toward world-centre + engaged ranks on the
    // three remaining walls, so the order wraps the whole temple. All one IM set.
    const nFront = 8;
    const span   = a * 0.86;                          // front colonnade width
    const spac   = span / (nFront - 1);              // intercolumniation
    const Pd     = D0 * 2.4;                           // portico depth (projection)
    const sColF  = faceR + Pd;                        // front colonnade centre-line
    const cols   = [];
    for (let i = 0; i < nFront; i++) {                // front portico row (freestanding)
      const o = (i - (nFront - 1) / 2) * spac;
      cols.push([x + f.x * sColF + tX * o, z + f.z * sColF + tZ * o]);
    }
    for (let i = 0; i < 6; i++) {                     // back-wall engaged rank
      const o = (i - 2.5) * (a * 0.72 / 5);
      cols.push([x - f.x * faceR + tX * o, z - f.z * faceR + tZ * o]);
    }
    for (let j = 0; j < 6; j++) {                     // left + right engaged ranks
      const s = (j - 2.5) * (a * 0.72 / 5);
      cols.push([x - tX * faceR + f.x * s, z - tZ * faceR + f.z * s]);
      cols.push([x + tX * faceR + f.x * s, z + tZ * faceR + f.z * s]);
    }
    _corinthianColumns(cols, stylTop, colR0, H_col, marble, capMarble, glowMat);

    // ── 4) CELLA ENTABLATURE — architrave · frieze (carved band) · cornice ─────
    const Ha = H_ent * 0.30, Hf = H_ent * 0.34, Hc = H_ent * 0.36;
    boxAt(x, z, eb,            a + D0 * 0.6, Ha, a + D0 * 0.6, corniceMat);   // architrave
    boxAt(x, z, eb + Ha,       a + D0 * 1.0, Hf, a + D0 * 1.0, friezeMat);    // frieze band
    boxAt(x, z, eb + Ha + Hf,  a + D0 * 2.0, Hc, a + D0 * 2.0, corniceMat);   // projecting cornice

    // Dentils — instanced tooth-blocks beneath the cornice on all four sides (1 IM).
    {
      const nPer = 18, dCount = 4 * nPer, dr = a * 0.5 + D0 * 1.0;
      const dIM = new THREE.InstancedMesh(
        new THREE.BoxGeometry(D0 * 0.5, Hc * 0.5, D0 * 0.55), capMarble, dCount);
      dIM.castShadow = true;
      const d = new THREE.Object3D();
      const norms = [[f.x, f.z], [-f.x, -f.z], [tX, tZ], [-tX, -tZ]];
      let idx = 0;
      for (const nm of norms) {
        const nang = Math.atan2(nm[0], nm[1]), pxN = -nm[1], pzN = nm[0];
        for (let k = 0; k < nPer; k++) {
          const o = (k - (nPer - 1) / 2) * (a * 0.9 / nPer);
          d.rotation.set(0, nang, 0);
          d.position.set(x + nm[0] * dr + pxN * o, eb + Ha + Hf - Hc * 0.10, z + nm[1] * dr + pzN * o);
          d.updateMatrix(); dIM.setMatrixAt(idx++, d.matrix);
        }
      }
      dIM.instanceMatrix.needsUpdate = true; scene.add(dIM);
    }

    // ── 5) PROJECTING PORTICO — floor slab, entablature, PEDIMENT + Seed of Life ─
    const sEntFront = sColF + D0 * 1.2;              // portico cornice front face
    const sEntBack  = faceR - D0 * 0.3;
    const sMid      = (sEntFront + sEntBack) * 0.5;
    const entDepth  = sEntFront - sEntBack;
    const entW      = span + D0 * 2.2;

    // portico floor (flush with stylobate top — a flat landing before the door)
    boxAt(x + f.x * sMid, z + f.z * sMid, baseY, entW, stylH * 1.15, entDepth, corniceMat);
    // portico entablature over the front row
    boxAt(x + f.x * sMid, z + f.z * sMid, eb,           entW,          Ha, entDepth,          corniceMat);
    boxAt(x + f.x * sMid, z + f.z * sMid, eb + Ha,      entW,          Hf, entDepth,          friezeMat);
    boxAt(x + f.x * sMid, z + f.z * sMid, eb + Ha + Hf, entW + D0,     Hc, entDepth + D0,     corniceMat);

    // Pediment (triangular gable) — apex above the entrance axis; ~15° Greek pitch.
    const H_ped = (a * 0.5) / PHI3;
    _gable(x + f.x * sEntFront, z + f.z * sEntFront, eb + H_ent, f, entW * 0.5, H_ped, entDepth, roofMat);

    // Tympanum inlay — Seed of Life (sacred geometry), glowing violet on the gable.
    {
      const seed = new THREE.Mesh(new THREE.PlaneGeometry(H_ped * 1.35, H_ped * 1.35), seedMat);
      seed.position.set(x + f.x * (sEntFront + 0.6), eb + H_ent + H_ped * 0.36, z + f.z * (sEntFront + 0.6));
      seed.rotation.y = faceAng; seed.renderOrder = 3; scene.add(seed);
    }

    // Acroteria — palmette finials at the pediment apex + both lower corners.
    {
      const acr = (o, up) => {
        const px = x + f.x * sEntFront + tX * o, pz = z + f.z * sEntFront + tZ * o;
        const fin = new THREE.Mesh(new THREE.CylinderGeometry(0, D0 * 0.55, D0 * 2.1, 6), capMarble);
        fin.position.set(px, eb + H_ent + up + D0 * 1.05, pz); fin.castShadow = true; scene.add(fin);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(D0 * 0.34, 10, 8), glowMat);
        orb.position.set(px, eb + H_ent + up + D0 * 2.35, pz); orb.renderOrder = 3; scene.add(orb);
      };
      acr(0, H_ped); acr(entW * 0.5, 0); acr(-entW * 0.5, 0);
    }

    // Warm interior glow spilling through the entrance (seen from the plaza).
    {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(D0 * 3.4, H_col * 0.5), warmMat);
      glow.position.set(x + f.x * (faceR - 0.6), stylTop + H_col * 0.30, z + f.z * (faceR - 0.6));
      glow.rotation.y = faceAng; glow.renderOrder = 2; scene.add(glow);
    }

    // Entrance-floor MEDALLION — Seed of Life inlaid on the threshold (symmetry axis).
    {
      const med = new THREE.Mesh(new THREE.CircleGeometry(D0 * 2.2, 40), seedMat);
      med.rotation.x = -Math.PI / 2;
      med.position.set(x + f.x * (faceR - D0 * 1.5), stylTop + 0.08, z + f.z * (faceR - D0 * 1.5));
      med.renderOrder = 2; scene.add(med);
    }

    // ── 6) DOMED READING ROTUNDA — circle inscribed in the square (squared circle) ─
    const atticH   = a * 0.045;
    const atticTop = boxAt(x, z, cellaTop, a * 0.84, atticH, a * 0.84, marble); // low attic terrace
    const drumR    = faceR / PHI2;                   // inscribed-circle radius / φ²
    const H_drum   = drumR / PHI;
    _cyl(x, z, atticTop, drumR, drumR, H_drum, marble, 24);
    const drumTop  = atticTop + H_drum;

    // Rotunda peristyle — 12 small Corinthian columns on a regular dodecagon.
    const peri = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      peri.push([x + Math.cos(ang) * drumR * 1.06, z + Math.sin(ang) * drumR * 1.06]);
    }
    _corinthianColumns(peri, atticTop, colR0 * 0.45, H_drum, marble, capMarble, glowMat);
    _band(x, z, drumTop, drumR * 1.02, drumR * 0.030, pal);   // drum cornice ring

    // Ribbed dome (16 facets read as ribs) + coffer/latitude rings (squared-circle).
    const domeTop = _dome(x, z, drumTop, drumR, domeMat, 16);
    for (let r = 1; r <= 3; r++) {
      const lat = (r / 4) * Math.PI * 0.5, rr = drumR * Math.cos(lat) * 1.004, yy = drumTop + drumR * Math.sin(lat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, drumR * 0.012, 6, 40), glowMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, yy, z); ring.renderOrder = 3; scene.add(ring);
    }

    // Oculus ring + warm skylight glow at the dome crown.
    const ocR = drumR * 0.20;
    {
      const oc = new THREE.Mesh(new THREE.TorusGeometry(ocR, drumR * 0.020, 6, 24), glowMat);
      oc.rotation.x = -Math.PI / 2; oc.position.set(x, domeTop - 0.2, z); oc.renderOrder = 3; scene.add(oc);
      const sky = new THREE.Mesh(new THREE.CircleGeometry(ocR * 0.9, 24), warmMat);
      sky.rotation.x = -Math.PI / 2; sky.position.set(x, domeTop - 0.3, z); sky.renderOrder = 2; scene.add(sky);
    }

    // Crowning lantern / cupola + finial.
    const lanternH = a * 0.06, lanBase = domeTop - 0.1;
    _cyl(x, z, lanBase, ocR * 1.1, ocR * 1.2, lanternH, capMarble, 12);
    const cupTop = _dome(x, z, lanBase + lanternH, ocR * 1.2, domeMat, 12);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0, ocR * 0.4, lanternH * 0.9, 6), capMarble);
    finial.position.set(x, cupTop + lanternH * 0.45, z); finial.castShadow = true; scene.add(finial);

    return { topY: cupTop + lanternH * 0.9, faceR: faceR };   // faceR = fp * 0.46 (CONTRACT)
  }

  // ── SHIELD-&-LOCK EMBLEM TEXTURE (procedural · offline · $0) ───────────────
  // A heraldic shield bearing a padlock — PIKADON's security crest. White on black.
  function _shieldTexture() {
    if (_texCache.shield) return _texCache.shield;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#ffdede'; g.lineWidth = 8; g.lineJoin = 'round';
    g.beginPath();                                          // shield outline
    g.moveTo(S * 0.5, S * 0.10);
    g.lineTo(S * 0.85, S * 0.24);
    g.lineTo(S * 0.85, S * 0.55);
    g.quadraticCurveTo(S * 0.85, S * 0.82, S * 0.5, S * 0.92);
    g.quadraticCurveTo(S * 0.15, S * 0.82, S * 0.15, S * 0.55);
    g.lineTo(S * 0.15, S * 0.24);
    g.closePath(); g.stroke();
    g.lineWidth = 6;                                        // padlock shackle
    g.beginPath(); g.arc(S * 0.5, S * 0.44, S * 0.11, Math.PI, 0); g.stroke();
    g.strokeRect(S * 0.36, S * 0.44, S * 0.28, S * 0.24);   // padlock body
    g.fillStyle = '#ffdede';                                // keyhole
    g.beginPath(); g.arc(S * 0.5, S * 0.55, S * 0.03, 0, Math.PI * 2); g.fill();
    g.fillRect(S * 0.485, S * 0.55, S * 0.03, S * 0.08);
    return _texCache.shield = _finishTex(cv, false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AEGIS (PIKADON / SECURITY) — an armored CITADEL keep drawn to a φ blueprint.
  //
  // A massive battered curtain-keep (full fp·0.46 mass) oriented so its gate faces
  // world-centre: sloping TALUS base, sheer masonry walls, angled BUTTRESSES, four
  // drum corner BASTIONS with conical caps, a crenellated parapet with MACHICOLATIONS,
  // a PORTCULLIS gatehouse framing the entrance, a shield-and-lock CREST over the gate,
  // and a raised battlemented watch-keep with a signal brazier. Red (0xff5a6e).
  //
  // φ SYSTEM (Wh = faceR = fp·0.46):  W=2·Wh · H_wall=W/φ · watch-keep W/φ.
  // CONTRACT: box, faceR = fp·0.46, gate on frontDir.
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildAegis(x, z, baseY, pal, fp, code, frontDir) {
    const PHI = 1.6180339887;
    const f   = frontDir || { x: 0, z: -1 };
    const faceAng = Math.atan2(f.x, f.z);
    const tX = -f.z, tZ = f.x;                     // facade tangent
    const Wh = fp * 0.46;                           // ← CONTRACT: half-extent (collider)
    const W  = 2 * Wh;

    const wallMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.07),
      emissive: pal.primary.clone(), emissiveIntensity: 0.024,
      roughness: 0.88, metalness: 0.06,
    });
    regFacade(code, wallMat);
    const trimMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.70, metalness: 0.12,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(pal.structural, 0.32),
      emissive: pal.primary.clone(), emissiveIntensity: 0.14,
      roughness: 0.54, metalness: 0.18,
    });

    // box oriented to frontDir (local-x = facade tangent)
    const boxAt = (cx, cz, by, w, h, dpt, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
      m.position.set(cx, by + h * 0.5, cz); m.rotation.y = faceAng;
      m.castShadow = true; m.receiveShadow = true; scene.add(m); return by + h;
    };

    // ── 1) BATTERED TALUS BASE — sloped glacis (wider foot → fortress batter). ─
    // Founded 2.4u into the terrain (the batter continues below grade) so the foot
    // never floats over a sloped pad. Visible top still lands at baseY+talusH.
    const talusH = Wh * 0.22;
    {
      const g = new THREE.Mesh(
        new THREE.CylinderGeometry(Wh * 1.02, Wh * 1.16, talusH + 2.4, 4), wallMat);
      g.rotation.y = faceAng + Math.PI / 4; g.position.set(x, baseY + talusH * 0.5 - 1.2, z);
      g.castShadow = true; g.receiveShadow = true; scene.add(g);
    }

    // ── 2) MAIN KEEP WALLS — sheer masonry mass. ──────────────────────────────
    const H_wall = W / PHI;
    boxAt(x, z, baseY, W, H_wall, W, wallMat);
    const wallTop = baseY + H_wall;

    // ── 3) ANGLED BUTTRESSES — leaning piers on the three non-gate faces. ─────
    {
      const bw = Wh * 0.16, bd = Wh * 0.20, bh = H_wall * 0.9;
      const bmat = wallMat;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(bw, bh, bd), bmat, 6);
      im.castShadow = true;
      const d = new THREE.Object3D();
      // sides = right(+t), left(-t), back(-f); 2 buttresses each along their face
      const faces = [[tX, tZ, f.x, f.z], [-tX, -tZ, f.x, f.z], [-f.x, -f.z, tX, tZ]];
      let k = 0;
      for (const fc of faces) {
        const nx = fc[0], nz = fc[1], ax = fc[2], az = fc[3];
        const nang = Math.atan2(nx, nz);
        for (const o of [-Wh * 0.5, Wh * 0.5]) {
          d.rotation.set(0.12, nang, 0);
          d.position.set(x + nx * (Wh + bd * 0.3) + ax * o, baseY + bh * 0.5, z + nz * (Wh + bd * 0.3) + az * o);
          d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }

    // ── 4) PARAPET + MACHICOLATION corbel band + CRENELLATIONS along 4 edges. ──
    boxAt(x, z, wallTop, W + Wh * 0.10, Wh * 0.10, W + Wh * 0.10, trimMat);   // corbel band
    const parY = wallTop + Wh * 0.10;
    {
      const mW = Wh * 0.14, mH = Wh * 0.16, mD = Wh * 0.10;
      const perSide = 6, count = 4 * perSide;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(mW, mH, mD), trimMat, count);
      im.castShadow = true;
      const d = new THREE.Object3D(); let k = 0;
      const sides = [[f.x, f.z, tX, tZ], [-f.x, -f.z, tX, tZ], [tX, tZ, f.x, f.z], [-tX, -tZ, f.x, f.z]];
      for (const sd of sides) {
        const nx = sd[0], nz = sd[1], ax = sd[2], az = sd[3], nang = Math.atan2(nx, nz);
        for (let i = 0; i < perSide; i++) {
          const o = (i - (perSide - 1) / 2) * (W * 0.9 / perSide);
          d.rotation.set(0, nang, 0);
          d.position.set(x + nx * Wh + ax * o, parY + mH * 0.5, z + nz * Wh + az * o);
          d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }

    // ── 5) CORNER BASTIONS — four drum towers + conical caps + merlon rings. ──
    const bR = fp * 0.10, bH2 = H_wall * 1.22;
    const bastMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.11),
      emissive: pal.primary.clone(), emissiveIntensity: 0.05, roughness: 0.78, metalness: 0.08,
    });
    const towerIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(bR, bR * 1.10, bH2, 12), bastMat, 4);
    const coneIM  = new THREE.InstancedMesh(new THREE.CylinderGeometry(0, bR * 1.18, bR * 1.7, 12), capMat, 4);
    towerIM.castShadow = coneIM.castShadow = true;
    {
      const d = new THREE.Object3D();
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (let i = 0; i < 4; i++) {
        const ex = corners[i][0] * Wh, ez = corners[i][1] * Wh;
        const cx = x + f.x * ex + tX * ez, cz = z + f.z * ex + tZ * ez;
        d.rotation.set(0, 0, 0);
        d.position.set(cx, baseY + bH2 * 0.5, cz); d.updateMatrix(); towerIM.setMatrixAt(i, d.matrix);
        d.position.set(cx, baseY + bH2 + bR * 0.85, cz); d.updateMatrix(); coneIM.setMatrixAt(i, d.matrix);
        _battlements(cx, cz, baseY + bH2 - bR * 0.2, bR * 1.02, 8, bR * 0.34, bR * 0.5, bR * 0.28, pal);
      }
      towerIM.instanceMatrix.needsUpdate = true; scene.add(towerIM);
      coneIM.instanceMatrix.needsUpdate = true; scene.add(coneIM);
    }

    // ── 6) GLITCH SECURITY GATE — an imposing high-security portal on the gate
    //      (frontDir) face: a HEAVY LAYERED frame stepping out from the wall, an
    //      ENERGY-PORTCULLIS of horizontal scanline bars (red/cyan, flickering),
    //      DISPLACED "glitch" armour plates nudged out of alignment with glowing
    //      edges, a SHIELD-LOCK crest, and a bright entry THRESHOLD. Deep + 3D —
    //      not a flat board. All aligned to frontDir over the walk-in _doorRecess.
    {
      const gateW  = Wh * 0.68, gateH = H_wall * 0.56;
      const halfW  = gateW * 0.5;
      const gRed   = pal.primary.clone().lerp(new THREE.Color(0xff2233), 0.55);
      const gCyan  = new THREE.Color(0x35ecff);

      const frameMat = new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(new THREE.Color(0x140a0c), 0.35),
        emissive: gRed, emissiveIntensity: 0.12, roughness: 0.46, metalness: 0.72,
      });
      const plateMat = new THREE.MeshStandardMaterial({
        color: pal.body.clone().lerp(new THREE.Color(0x2a0e14), 0.40),
        emissive: gRed, emissiveIntensity: 0.10, roughness: 0.55, metalness: 0.40,
      });
      const barMat  = new THREE.MeshBasicMaterial({          // red energy scanlines
        color: gRed,  transparent: true, opacity: 0.90,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const barMatC = new THREE.MeshBasicMaterial({          // cyan energy scanlines
        color: gCyan, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });

      // (a) HEAVY LAYERED FRAME — 3 nested rectangular frames (jambs + lintel + sill)
      //     each projecting further OUT from the wall → real depth, imposing gatehouse.
      const layers = 3;
      const jambW = Wh * 0.12, sillH = Wh * 0.11, fd = Wh * 0.12;
      for (let L = 0; L < layers; L++) {
        const fr   = Wh + Wh * (0.05 + L * 0.10);     // projection out from wall face
        const grow = L * Wh * 0.07;                    // outer frames grow a touch
        const hw   = halfW + jambW * 0.6 + grow;
        const gh   = gateH + grow;
        const mat  = (L === 1) ? capMat : frameMat;
        // two jambs (left / right of the mouth)
        boxAt(x + f.x * fr - tX * hw, z + f.z * fr - tZ * hw, baseY, jambW, gh + sillH, fd, mat);
        boxAt(x + f.x * fr + tX * hw, z + f.z * fr + tZ * hw, baseY, jambW, gh + sillH, fd, mat);
        // lintel bridging the top
        boxAt(x + f.x * fr, z + f.z * fr, baseY + gh, hw * 2 + jambW, sillH * 1.5, fd, mat);
        // threshold sill along the ground
        boxAt(x + f.x * fr, z + f.z * fr, baseY, hw * 2 + jambW, sillH, fd, mat);
      }

      // (b) ENERGY PORTCULLIS — horizontal scanline energy bars across the mouth,
      //     alternating red/cyan. Two InstancedMesh (1 draw call each). Flicker is
      //     driven by mutating each material's opacity in update() (allocation-free).
      const nBar  = 9;
      const barTh = gateH / (nBar * 2.4);
      const barR  = Wh + 0.7;
      const barGeo = new THREE.BoxGeometry(gateW * 0.94, barTh, 0.4);
      const nRed = Math.ceil(nBar / 2), nCyn = Math.floor(nBar / 2);
      const redIM = new THREE.InstancedMesh(barGeo, barMat,  nRed);
      const cynIM = new THREE.InstancedMesh(barGeo, barMatC, nCyn);
      redIM.renderOrder = cynIM.renderOrder = 4;
      {
        const d = new THREE.Object3D(); let ri = 0, ci = 0;
        for (let i = 0; i < nBar; i++) {
          const yo = baseY + ((i + 0.5) / nBar) * gateH;
          d.rotation.set(0, faceAng, 0);
          d.position.set(x + f.x * barR, yo, z + f.z * barR);
          d.updateMatrix();
          if (i % 2 === 0) redIM.setMatrixAt(ri++, d.matrix);
          else             cynIM.setMatrixAt(ci++, d.matrix);
        }
        redIM.instanceMatrix.needsUpdate = true; scene.add(redIM);
        cynIM.instanceMatrix.needsUpdate = true; scene.add(cynIM);
      }
      // subtle glitch flicker — reuse the landmarks pipeline (no per-frame alloc):
      landmarks.push({ mat: barMat,  baseOpacity: 0.90, phase: 0.0 });
      landmarks.push({ mat: barMatC, baseOpacity: 0.85, phase: 2.3 });

      // (c) DISPLACED GLITCH PLATES — armour plates nudged out of alignment on X/Z
      //     with glowing red/cyan edges, flanking the gate (the "glitch" signature).
      const nPl  = 6;
      const seed = [-1.2, 0.7, -0.4, 1.1, -0.9, 0.5];
      const plGeo = new THREE.BoxGeometry(Wh * 0.17, Wh * 0.24, Wh * 0.06);
      const glGeo = new THREE.PlaneGeometry(Wh * 0.21, Wh * 0.28);
      const plIM  = new THREE.InstancedMesh(plGeo, plateMat, nPl);
      const nGR = Math.ceil(nPl / 2), nGC = Math.floor(nPl / 2);
      const glR = new THREE.InstancedMesh(glGeo, barMat,  nGR);   // red glow edges
      const glC = new THREE.InstancedMesh(glGeo, barMatC, nGC);   // cyan glow edges
      plIM.castShadow = true; glR.renderOrder = glC.renderOrder = 3;
      {
        const d = new THREE.Object3D(); let gr = 0, gc = 0;
        for (let i = 0; i < nPl; i++) {
          const side = (i < nPl / 2) ? -1 : 1;
          const o    = side * (halfW + Wh * (0.18 + (i % 3) * 0.15));   // beside the mouth
          const jit  = seed[i] * Wh * 0.05;                            // tangent displace
          const yo   = baseY + gateH * (0.22 + (i % 3) * 0.27);
          const dr   = Wh + Wh * 0.06 + seed[i] * Wh * 0.03;           // normal displace
          const ang  = faceAng + seed[i] * 0.05;                       // slight skew
          d.rotation.set(0, ang, 0);
          d.position.set(x + f.x * dr + tX * (o + jit), yo, z + f.z * dr + tZ * (o + jit));
          d.updateMatrix(); plIM.setMatrixAt(i, d.matrix);
          // glow plate a hair further out (additive edge halo), alternating colour
          d.position.set(x + f.x * (dr + 0.3) + tX * (o + jit), yo, z + f.z * (dr + 0.3) + tZ * (o + jit));
          d.updateMatrix();
          if (i % 2 === 0) glR.setMatrixAt(gr++, d.matrix);
          else             glC.setMatrixAt(gc++, d.matrix);
        }
        plIM.instanceMatrix.needsUpdate = true; scene.add(plIM);
        glR.instanceMatrix.needsUpdate  = true; scene.add(glR);
        glC.instanceMatrix.needsUpdate  = true; scene.add(glC);
      }

      // (d) SHIELD-LOCK CREST — heraldic shield + a 3D hard-lock ring & keyhole
      //     mounted above the gate = the high-security emblem.
      const crest = new THREE.Mesh(
        new THREE.PlaneGeometry(Wh * 0.5, Wh * 0.5),
        new THREE.MeshBasicMaterial({
          map: _shieldTexture(), color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.2),
          transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }));
      const crestY = baseY + gateH + Wh * 0.32;
      crest.position.set(x + f.x * (Wh + 0.5), crestY, z + f.z * (Wh + 0.5));
      crest.rotation.y = faceAng; crest.renderOrder = 5; scene.add(crest);
      // hard-lock ring (torus facing outward along frontDir)
      const lockR = Wh + 0.8;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Wh * 0.10, Wh * 0.032, 8, 22), capMat);
      ring.rotation.y = faceAng; ring.position.set(x + f.x * lockR, crestY, z + f.z * lockR);
      ring.castShadow = true; scene.add(ring);
      // keyhole bar (cyan) centred in the lock ring
      const key = new THREE.Mesh(new THREE.BoxGeometry(Wh * 0.035, Wh * 0.11, Wh * 0.03),
        new THREE.MeshBasicMaterial({ color: gCyan, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      key.rotation.y = faceAng;
      key.position.set(x + f.x * (lockR + 0.2), crestY - Wh * 0.01, z + f.z * (lockR + 0.2));
      key.renderOrder = 6; scene.add(key);

      // (e) BRIGHT THRESHOLD — glowing entry strip on the landing floor, unmistakably
      //     an entrance you walk up to. Pulses via the landmarks pipeline.
      const thr = new THREE.Mesh(
        new THREE.PlaneGeometry(gateW * 0.9, Wh * 0.24),
        new THREE.MeshBasicMaterial({ color: gCyan, transparent: true, opacity: 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      thr.rotation.x = -Math.PI / 2; thr.rotation.z = faceAng;
      thr.position.set(x + f.x * (Wh + Wh * 0.14), baseY + SOCLE_RISE + 0.06, z + f.z * (Wh + Wh * 0.14));
      thr.renderOrder = 3; scene.add(thr);
      landmarks.push({ mat: thr.material, baseOpacity: 0.6, phase: 1.1 });
    }

    // ── 8) RAISED WATCH-KEEP — inner tower with parapet + signal brazier. ─────
    const kW = W / PHI, kH = H_wall * 0.5;
    boxAt(x, z, parY + Wh * 0.16, kW, kH, kW, wallMat);
    const keepTop = parY + Wh * 0.16 + kH;
    boxAt(x, z, keepTop, kW + Wh * 0.08, Wh * 0.08, kW + Wh * 0.08, trimMat);
    {   // merlons on the watch-keep
      const mW = Wh * 0.12, mH = Wh * 0.14, kh = kW * 0.5;
      const perSide = 4, count = 4 * perSide;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(mW, mH, mW), capMat, count);
      im.castShadow = true;
      const d = new THREE.Object3D(); let k = 0;
      const sides = [[f.x, f.z, tX, tZ], [-f.x, -f.z, tX, tZ], [tX, tZ, f.x, f.z], [-tX, -tZ, f.x, f.z]];
      for (const sd of sides) {
        const nx = sd[0], nz = sd[1], ax = sd[2], az = sd[3], nang = Math.atan2(nx, nz);
        for (let i = 0; i < perSide; i++) {
          const o = (i - (perSide - 1) / 2) * (kW * 0.86 / perSide);
          d.rotation.set(0, nang, 0);
          d.position.set(x + nx * kh + ax * o, keepTop + Wh * 0.08 + mH * 0.5, z + nz * kh + az * o);
          d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }
    const braH = keepTop + Wh * 0.3;
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(kW * 0.14, kW * 0.10, kW * 0.16, 10), capMat);
    brazier.position.set(x, braH, z); brazier.castShadow = true; scene.add(brazier);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(kW * 0.13, 12, 8),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffcf9a), 0.5),
        transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(x, braH + kW * 0.16, z); flame.renderOrder = 5; scene.add(flame);

    // ── 9) ROOFTOP DEFENCE — radar dish + munitions vents on the watch-keep. ──
    _satelliteDish(x + kW * 0.5, z, keepTop, fp * 0.05, pal);
    _ventBoxes(x, z, keepTop, kW * 0.9, 5, pal);
    _antennaCluster(x, z, keepTop, fp, 7, pal);

    return { topY: braH + kW * 0.3, faceR: Wh };   // faceR = fp * 0.46 (CONTRACT)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MUSEUM (TURTLE / ART) — a refined GALLERY drawn to a φ blueprint.
  //
  // A serene neoclassical gallery (full fp·0.46 mass) facing world-centre: a low
  // stylobate, a COLONNADED portico of slender columns framing the entrance, a
  // rhythm of arched sculptural NICHES with lit statue-hints along the facade, a
  // fine cornice + parapet, and a crowning glazed roof-LANTERN (clerestory drum +
  // faceted glass dome + oculus) washing the halls with daylight. Teal-green
  // (0x1fd6c4).
  //
  // φ SYSTEM (Wh = faceR = fp·0.46): W=2·Wh · H_wall=W/φ² · lantern drum W/φ³.
  // CONTRACT: box, faceR = fp·0.46, entrance on frontDir.
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildMuseum(x, z, baseY, pal, fp, code, frontDir) {
    const PHI = 1.6180339887;
    const f   = frontDir || { x: 0, z: -1 };
    const faceAng = Math.atan2(f.x, f.z);
    const tX = -f.z, tZ = f.x;
    const Wh = fp * 0.46, W = 2 * Wh;               // ← CONTRACT: half-extent (collider)

    const faceMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.032,
      roughness: 0.62, metalness: 0.16,
    });
    regFacade(code, faceMat);
    const cornMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.58, metalness: 0.16,
    });
    const paleMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0xdfeee9), 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.04, roughness: 0.66, metalness: 0.10,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.28),
      transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const boxAt = (cx, cz, by, w, h, dpt, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
      m.position.set(cx, by + h * 0.5, cz); m.rotation.y = faceAng;
      m.castShadow = true; m.receiveShadow = true; scene.add(m); return by + h;
    };

    // ── 1) STYLOBATE + GALLERY BLOCK ──────────────────────────────────────────
    // Stylobate is kept to the WALL width (W = fp·0.92) so it does not project a
    // thin shelf past the shared podium/chamfer (that projecting lip was the
    // "poking square" at the museum's base), and it is FOUNDED 2.4u into the
    // terrain so no floating edge shows on a sloped pad. Top stays at baseY+stylH.
    const stylH = W * 0.02;
    boxAt(x, z, baseY - 2.4, W, stylH + 2.4, W, cornMat);
    const H_wall = W / (PHI * PHI) * PHI;            // = W/φ, tall enough to read as a hall
    boxAt(x, z, baseY + stylH, W, H_wall, W, faceMat);
    const wallTop = baseY + stylH + H_wall;

    // ── 2) ARCHED SCULPTURAL NICHES — recessed bays with lit statue-hints. ────
    {
      const nW = Wh * 0.22, nH = H_wall * 0.5, depth = Wh * 0.10;
      const perSide = 4, count = 3 * perSide;        // three visible faces
      const nicheIM = new THREE.InstancedMesh(new THREE.BoxGeometry(nW, nH, depth),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x06100e), emissive: pal.trim.clone(), emissiveIntensity: 0.05,
          roughness: 0.9, metalness: 0.05 }), count);
      const statIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(nW * 0.12, nW * 0.18, nH * 0.62, 8),
        paleMat, count);
      const glowIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(nW * 0.8, nH * 0.8), glowMat, count);
      statIM.castShadow = true; glowIM.renderOrder = 3;
      const d = new THREE.Object3D(); let k = 0;
      const sides = [[tX, tZ, f.x, f.z], [-tX, -tZ, f.x, f.z], [-f.x, -f.z, tX, tZ]];
      for (const sd of sides) {
        const nx = sd[0], nz = sd[1], ax = sd[2], az = sd[3], nang = Math.atan2(nx, nz);
        for (let i = 0; i < perSide; i++) {
          const o = (i - (perSide - 1) / 2) * (W * 0.78 / perSide);
          const bx = x + nx * Wh + ax * o, bz = z + nz * Wh + az * o, yy = baseY + stylH + H_wall * 0.42;
          d.rotation.set(0, nang, 0);
          d.position.set(bx - nx * depth * 0.3, yy, bz - nz * depth * 0.3); d.updateMatrix(); nicheIM.setMatrixAt(k, d.matrix);
          d.position.set(bx - nx * depth * 0.5, baseY + stylH + nH * 0.42, bz - nz * depth * 0.5); d.updateMatrix(); statIM.setMatrixAt(k, d.matrix);
          d.position.set(bx - nx * depth * 0.7, yy, bz - nz * depth * 0.7); d.updateMatrix(); glowIM.setMatrixAt(k, d.matrix);
          k++;
        }
      }
      nicheIM.instanceMatrix.needsUpdate = true; scene.add(nicheIM);
      statIM.instanceMatrix.needsUpdate = true; scene.add(statIM);
      glowIM.instanceMatrix.needsUpdate = true; scene.add(glowIM);
    }

    // ── 3) CORNICE + PARAPET ──────────────────────────────────────────────────
    boxAt(x, z, wallTop, W + Wh * 0.14, Wh * 0.10, W + Wh * 0.14, cornMat);
    const parY = boxAt(x, z, wallTop + Wh * 0.10, W + Wh * 0.02, Wh * 0.08, W + Wh * 0.02, paleMat);

    // ── 4) COLONNADED PORTICO — free-standing columns framing the entrance,
    //      leaving an open gap on the frontDir door axis. ──────────────────────
    {
      const Pd = Wh * 0.34;                          // portico projection
      const ringR = Wh + Pd;
      const colR = fp * 0.014, H_col = H_wall * 0.86;
      const cols = [];
      const nHalf = 3, span = W * 0.86, spac = span / (2 * nHalf);
      for (let i = -nHalf; i <= nHalf; i++) {
        if (i === 0) continue;                       // leave the centre open for the door
        const o = i * spac;
        cols.push([x + f.x * ringR + tX * o, z + f.z * ringR + tZ * o]);
      }
      const capMat = new THREE.MeshStandardMaterial({
        color: pal.secondary.clone().lerp(pal.structural, 0.28),
        emissive: pal.trim.clone(), emissiveIntensity: 0.06, roughness: 0.6, metalness: 0.14 });
      const ab = _corinthianColumns(cols, baseY + stylH, colR, H_col, paleMat, capMat, glowMat);
      // portico entablature + pediment over the columns
      const entW = span + colR * 6;
      const ent = new THREE.Mesh(new THREE.BoxGeometry(entW, Wh * 0.16, Pd * 2.0), cornMat);
      ent.position.set(x + f.x * ringR, ab + Wh * 0.08, z + f.z * ringR); ent.rotation.y = faceAng;
      ent.castShadow = true; scene.add(ent);
      _gable(x + f.x * (ringR + Pd), z + f.z * (ringR + Pd), ab + Wh * 0.16, f, entW * 0.5, Wh * 0.34, Pd * 2.0, paleMat);
    }

    // ── 5) GLAZED ROOF-LANTERN — clerestory drum + faceted glass dome + oculus.
    const drumR = W / (PHI * PHI * PHI) * PHI;        // = W/φ²
    const drumH = drumR / PHI;
    _cyl(x, z, parY, drumR, drumR * 1.02, drumH, paleMat, 20);
    const domeBase = parY + drumH;
    // clerestory glass panes around the drum
    {
      const N = 12;
      const paneIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(drumR * 0.42, drumH * 0.7),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.3),
          transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide }), N);
      paneIM.renderOrder = 3;
      const d = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        d.position.set(x + Math.cos(a) * drumR * 1.01, parY + drumH * 0.5, z + Math.sin(a) * drumR * 1.01);
        d.rotation.set(0, -a + Math.PI / 2, 0); d.updateMatrix(); paneIM.setMatrixAt(i, d.matrix);
      }
      paneIM.instanceMatrix.needsUpdate = true; scene.add(paneIM);
    }
    const glassMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.42),
      emissive: pal.trim.clone(), emissiveIntensity: 0.12,
      roughness: 0.34, metalness: 0.26, transparent: true, opacity: 0.82,
    });
    const domeR = drumR * 1.06;
    const domeTop = _dome(x, z, domeBase, domeR, glassMat, 20);
    _band(x, z, domeBase, domeR * 1.04, domeR * 0.026, pal);
    // glazing ribs on the dome
    for (let r = 1; r <= 2; r++) {
      const lat = (r / 3) * Math.PI * 0.5, rr = domeR * Math.cos(lat) * 1.004, yy = domeBase + domeR * Math.sin(lat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, domeR * 0.012, 6, 36), glowMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, yy, z); ring.renderOrder = 3; scene.add(ring);
    }
    // oculus finial
    const ocR = domeR * 0.2;
    const oc = new THREE.Mesh(new THREE.TorusGeometry(ocR, domeR * 0.02, 6, 20), glowMat);
    oc.rotation.x = -Math.PI / 2; oc.position.set(x, domeTop - 0.2, z); oc.renderOrder = 3; scene.add(oc);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0, ocR * 0.5, drumH * 0.8, 8), paleMat);
    finial.position.set(x, domeTop + drumH * 0.3, z); finial.castShadow = true; scene.add(finial);

    // ── 6) ROOFTOP — discreet skylights + AC plant behind the parapet. ────────
    _ventBoxes(x, z, parY, W * 0.55, 5, pal);

    return { topY: domeTop + drumH * 0.8, faceR: Wh };   // faceR = fp * 0.46 (CONTRACT)
  }

  // ── CLOCK-FACE TEXTURE (procedural · offline · $0) ─────────────────────────
  // A classical exchange clock — ring, hour ticks, roman-ish index + two hands.
  function _clockTexture() {
    if (_texCache.clock) return _texCache.clock;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d'); const C = S / 2;
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#ffe6c8'; g.lineWidth = 8;
    g.beginPath(); g.arc(C, C, S * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 5;
    for (let i = 0; i < 12; i++) {                         // hour ticks
      const a = i * Math.PI / 6, r0 = S * 0.42, r1 = i % 3 === 0 ? S * 0.32 : S * 0.37;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      g.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); g.stroke();
    }
    g.lineWidth = 9; g.lineCap = 'round';                  // hour hand (~10:10)
    g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(-2.6) * S * 0.20, C + Math.sin(-2.6) * S * 0.20); g.stroke();
    g.lineWidth = 6;                                       // minute hand
    g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(-0.6) * S * 0.30, C + Math.sin(-0.6) * S * 0.30); g.stroke();
    g.fillStyle = '#ffe6c8'; g.beginPath(); g.arc(C, C, 7, 0, Math.PI * 2); g.fill();
    return _texCache.clock = _finishTex(cv, false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZEROX MARKETS (WEALTH / EXCHANGE) — a grand MERCANTILE EXCHANGE hall, φ blueprint.
  //
  // A monumental trading hall (full fp·0.46 mass) facing world-centre: a low
  // stylobate, a projecting monumental PORTICO of tall columns + entablature +
  // PEDIMENT framing the entrance, a great arched TRADING-HALL window blazing over
  // the door, engaged pilaster-piers rhythm, a fine cornice, and a crowning CLOCK
  // TOWER with a lit exchange clock and a scrolling TICKER band. Orange (0xff7a18).
  //
  // φ SYSTEM (Wh = faceR = fp·0.46): W=2·Wh · H_wall=W/φ · clock tower W/φ².
  // CONTRACT: box, faceR = fp·0.46, entrance on frontDir.
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildMarketsExchange(x, z, baseY, pal, fp, code, frontDir) {
    const PHI = 1.6180339887;
    const f   = frontDir || { x: 0, z: -1 };
    const faceAng = Math.atan2(f.x, f.z);
    const tX = -f.z, tZ = f.x;
    const Wh = fp * 0.46, W = 2 * Wh;               // ← CONTRACT: half-extent (collider)

    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.10),
      emissive: pal.primary.clone(), emissiveIntensity: 0.030,
      roughness: 0.60, metalness: 0.22,
    });
    regFacade(code, bodyMat);
    const cornMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.26),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10, roughness: 0.52, metalness: 0.22,
    });
    const paleMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0xe8dcc4), 0.28),
      emissive: pal.trim.clone(), emissiveIntensity: 0.05, roughness: 0.64, metalness: 0.12,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.28),
      transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const boxAt = (cx, cz, by, w, h, dpt, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
      m.position.set(cx, by + h * 0.5, cz); m.rotation.y = faceAng;
      m.castShadow = true; m.receiveShadow = true; scene.add(m); return by + h;
    };

    // ── 1) STYLOBATE + HALL BLOCK ─────────────────────────────────────────────
    // Kept to WALL width (no projecting shelf lip = no "poking square" at the base)
    // and FOUNDED 2.4u into the terrain so no floating edge shows on a sloped pad.
    const stylH = W * 0.022;
    boxAt(x, z, baseY - 2.4, W, stylH + 2.4, W, cornMat);
    const H_wall = W / PHI;
    boxAt(x, z, baseY + stylH, W, H_wall, W, bodyMat);
    const wallTop = baseY + stylH + H_wall;

    // ── 2) GREAT ARCHED TRADING-HALL WINDOW over the entrance (frontDir). ─────
    {
      const awW = Wh * 0.9, awH = H_wall * 0.6;
      const fr = Wh + 0.4;
      // glowing arched glass pane (rectangle + semicircle top)
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(awW, awH),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.22),
          transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide }));
      pane.position.set(x + f.x * fr, baseY + stylH + H_wall * 0.5, z + f.z * fr);
      pane.rotation.y = faceAng; pane.renderOrder = 3; scene.add(pane);
      const semi = new THREE.Mesh(new THREE.CircleGeometry(awW * 0.5, 24, 0, Math.PI), pane.material);
      semi.position.set(x + f.x * fr, baseY + stylH + H_wall * 0.5 + awH * 0.5, z + f.z * fr);
      semi.rotation.order = 'YXZ'; semi.rotation.y = faceAng; semi.renderOrder = 3; scene.add(semi);
      // stone arch surround + radial mullions
      const arch = new THREE.Mesh(new THREE.TorusGeometry(awW * 0.52, Wh * 0.03, 8, 28, Math.PI), paleMat);
      arch.position.set(x + f.x * (fr + 0.2), baseY + stylH + H_wall * 0.5 + awH * 0.5, z + f.z * (fr + 0.2));
      arch.rotation.y = faceAng; arch.castShadow = true; scene.add(arch);
      const nV = 5;
      const mulIM = new THREE.InstancedMesh(new THREE.BoxGeometry(Wh * 0.02, awH, Wh * 0.03), paleMat, nV);
      const d = new THREE.Object3D();
      for (let i = 0; i < nV; i++) {
        const o = (i - (nV - 1) / 2) * (awW / nV);
        d.rotation.set(0, faceAng, 0);
        d.position.set(x + f.x * (fr + 0.1) + tX * o, baseY + stylH + H_wall * 0.5, z + f.z * (fr + 0.1) + tZ * o);
        d.updateMatrix(); mulIM.setMatrixAt(i, d.matrix);
      }
      mulIM.instanceMatrix.needsUpdate = true; scene.add(mulIM);
    }

    // ── 3) MONUMENTAL PORTICO — tall columns + entablature + pediment, front. ─
    let porticoTop;
    {
      const Pd = Wh * 0.40, ringR = Wh + Pd;
      const colR = fp * 0.017, H_col = H_wall * 0.94;
      const cols = [];
      const nHalf = 3, span = W * 0.9, spac = span / (2 * nHalf);
      for (let i = -nHalf; i <= nHalf; i++) {
        if (i === 0) continue;                       // open centre for the door
        const o = i * spac;
        cols.push([x + f.x * ringR + tX * o, z + f.z * ringR + tZ * o]);
      }
      const ab = _corinthianColumns(cols, baseY + stylH, colR, H_col, paleMat, cornMat, glowMat);
      const entW = span + colR * 8, entH = Wh * 0.20;
      const ent = new THREE.Mesh(new THREE.BoxGeometry(entW, entH, Pd * 2.1), cornMat);
      ent.position.set(x + f.x * ringR, ab + entH * 0.5, z + f.z * ringR); ent.rotation.y = faceAng;
      ent.castShadow = true; scene.add(ent);
      _gable(x + f.x * (ringR + Pd), z + f.z * (ringR + Pd), ab + entH, f, entW * 0.5, Wh * 0.4, Pd * 2.1, paleMat);
      porticoTop = ab + entH + Wh * 0.4;
    }

    // ── 4) CORNICE + ATTIC ────────────────────────────────────────────────────
    boxAt(x, z, wallTop, W + Wh * 0.16, Wh * 0.10, W + Wh * 0.16, cornMat);
    const atticTop = boxAt(x, z, wallTop + Wh * 0.10, W * 0.9, Wh * 0.14, W * 0.9, bodyMat);

    // ── 5) CLOCK TOWER — φ-reduced drum, lit clock faces + ticker band + cupola.
    const ctW = W / (PHI * PHI), ctH = ctW * PHI;
    boxAt(x, z, atticTop, ctW, ctH, ctW, bodyMat);
    const ctTop = atticTop + ctH;
    // ticker band around the tower base
    {
      const tick = new THREE.Mesh(
        new THREE.CylinderGeometry(ctW * 0.74, ctW * 0.74, ctW * 0.16, 4, 1, true),
        new THREE.MeshStandardMaterial({
          color: pal.structural.clone().lerp(pal.primary, 0.3),
          emissive: pal.trim.clone(), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.3 }));
      tick.rotation.y = faceAng + Math.PI / 4; tick.position.set(x, atticTop + ctW * 0.3, z);
      scene.add(tick);
    }
    // clock faces on all four sides
    {
      const clockMat = new THREE.MeshBasicMaterial({
        map: _clockTexture(), color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.3),
        transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide });
      const clkR = ctW * 0.4;
      const sides = [[f.x, f.z], [-f.x, -f.z], [tX, tZ], [-tX, -tZ]];
      for (const sd of sides) {
        const nang = Math.atan2(sd[0], sd[1]);
        const cf = new THREE.Mesh(new THREE.PlaneGeometry(clkR * 2, clkR * 2), clockMat);
        cf.position.set(x + sd[0] * (ctW * 0.51), ctTop - ctH * 0.42, z + sd[1] * (ctW * 0.51));
        cf.rotation.y = nang; cf.renderOrder = 4; scene.add(cf);
      }
    }
    // cornice + cupola + finial
    boxAt(x, z, ctTop, ctW + Wh * 0.06, Wh * 0.08, ctW + Wh * 0.06, cornMat);
    const cupBase = ctTop + Wh * 0.08;
    const cupTop = _dome(x, z, cupBase, ctW * 0.5, paleMat, 16);
    _band(x, z, cupBase, ctW * 0.5, ctW * 0.02, pal);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0, ctW * 0.12, ctW * 0.7, 8),
      new THREE.MeshStandardMaterial({
        color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.28,
        roughness: 0.34, metalness: 0.46 }));
    spire.position.set(x, cupTop + ctW * 0.32, z); spire.castShadow = true; scene.add(spire);
    const finTop = cupTop + ctW * 0.7;

    // ── 6) ROOFTOP — bell/broadcast antenna + mercantile vents. ───────────────
    _antennaCluster(x, z, ctTop, fp, 6, pal);
    _ventBoxes(x, z, atticTop, W * 0.5, 4, pal);

    return { topY: finTop, faceR: Wh };            // faceR = fp * 0.46 (CONTRACT)
  }

  // ── STAR-MAP TEXTURE (procedural · offline · $0) ───────────────────────────
  // A dark celestial chart — scattered stars + faint constellation lines + a zodiac
  // ring band. White on black so an accent-tinted emissive shows the glowing map.
  function _starMapTexture() {
    if (_texCache.starmap) return _texCache.starmap;
    const S = 256, cv = _mkCanvas(S), g = cv.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 220; i++) {                        // deterministic star field
      const sx = (i * 1103515245 + 12345) % S;
      const sy = (i * 2654435761) % S;
      const r  = 0.5 + ((i * 7) % 5) * 0.4;
      const a  = 0.35 + ((i * 13) % 60) / 100;
      g.fillStyle = 'rgba(230,224,255,' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(200,180,255,0.30)'; g.lineWidth = 1;   // constellation lines
    for (let i = 0; i < 10; i++) {
      const x0 = (i * 53) % S, y0 = (i * 97) % S;
      const x1 = (i * 131 + 40) % S, y1 = (i * 61 + 30) % S;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.strokeStyle = 'rgba(210,190,255,0.45)'; g.lineWidth = 2;   // zodiac band
    g.beginPath(); g.moveTo(0, S * 0.5); g.lineTo(S, S * 0.5); g.stroke();
    return _texCache.starmap = _finishTex(cv, false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORACLE SPIRE (RESEARCH / ASTRONOMY) — an astral OBSERVATORY temple, φ blueprint.
  //
  // A full-width dark drum-tower (fp·0.46, flush with its round collider) girdled by
  // a glowing STAR-MAP frieze band and belt courses, stepping up to a colonnaded
  // observation gallery, a great slotted OBSERVATORY DOME with a bright OCULUS, three
  // tilted ORRERY orbit-rings sweeping the crown, and a sighting-telescope finial.
  // Violet (0xc084fc).
  //
  // φ SYSTEM (R = faceR = fp·0.46):  H_main = R·φ · gallery R/φ · dome = inscribed.
  // CONTRACT: cylinder, faceR = fp·0.46, entrance on frontDir (built by decorate).
  // ═══════════════════════════════════════════════════════════════════════════
  function _buildOracleSpire(x, z, baseY, pal, fp, code, frontDir) {
    const PHI = 1.6180339887;
    const R   = fp * 0.46;                       // ← CONTRACT: flush with collider

    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.044,
      roughness: 0.54, metalness: 0.20,
    });
    regFacade(code, bodyMat);

    // ── 1) MAIN DRUM-TOWER — full-width, gentle entasis. ──────────────────────
    const H_main = R * PHI;
    _cyl(x, z, baseY, R * 0.97, R, H_main, bodyMat, 30);
    const mainTop = baseY + H_main;
    _beltCourses(x, z, baseY, mainTop, R * 1.02, R * 0.012, 6, pal);

    // ── 2) STAR-MAP FRIEZE — glowing celestial chart band girdling the drum. ──
    {
      const starTx = _starMapTexture().clone();
      starTx.wrapS = starTx.wrapT = THREE.RepeatWrapping; starTx.repeat.set(8, 1);
      starTx.needsUpdate = true;
      const friezeMat = new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(pal.secondary, 0.22),
        emissive: pal.trim.clone(), emissiveIntensity: 0.6, emissiveMap: starTx,
        roughness: 0.6, metalness: 0.18,
      });
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.03, R * 1.03, R * 0.34, 30, 1, true), friezeMat);
      band.position.set(x, mainTop - R * 0.30, z); band.castShadow = true; scene.add(band);
    }

    // ── 3) OBSERVATION GALLERY — φ-reduced colonnaded drum on a projecting ledge.
    const ledgeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.09,
      roughness: 0.5, metalness: 0.24,
    });
    _cyl(x, z, mainTop, R * 1.10, R * 1.02, R * 0.12, ledgeMat, 30);        // cornice ledge
    const galBase = mainTop + R * 0.12;
    const Rg = R / PHI, Hg = Rg * PHI * 0.72;
    _cyl(x, z, galBase, Rg, Rg * 1.02, Hg, bodyMat, 24);
    // peristyle of slim columns around the gallery
    {
      const peri = [], NC = 16;
      for (let i = 0; i < NC; i++) {
        const a = (i / NC) * Math.PI * 2;
        peri.push([x + Math.cos(a) * Rg * 1.12, z + Math.sin(a) * Rg * 1.12]);
      }
      const colMat = new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(new THREE.Color(0xd8d0e6), 0.26),
        emissive: pal.trim.clone(), emissiveIntensity: 0.03, roughness: 0.7, metalness: 0.1,
      });
      _corinthianColumns(peri, galBase, fp * 0.010, Hg, colMat, ledgeMat,
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.3),
          transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
    }
    const galTop = galBase + Hg;
    _band(x, z, galTop, Rg * 1.04, Rg * 0.03, pal);

    // ── 4) OBSERVATORY DOME — slotted (telescope aperture) with a bright oculus. ─
    const domeR   = Rg * 1.06;
    const domeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.26),
      emissive: pal.trim.clone(), emissiveIntensity: 0.13,
      roughness: 0.42, metalness: 0.28,
    });
    const domeTop = _dome(x, z, galTop, domeR, domeMat, 24);
    // latitude coffer rings on the dome
    for (let r = 1; r <= 2; r++) {
      const lat = (r / 3) * Math.PI * 0.5, rr = domeR * Math.cos(lat) * 1.004, yy = galTop + domeR * Math.sin(lat);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(rr, domeR * 0.014, 6, 40),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.28),
          transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, yy, z); ring.renderOrder = 3; scene.add(ring);
    }
    // telescope aperture slot — a dark recessed band up one side of the dome (faces frontDir)
    {
      const f = frontDir || { x: 0, z: -1 }, faceAng = Math.atan2(f.x, f.z);
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(domeR * 0.24, domeR * 1.4, 0.6),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x05060c), emissive: pal.trim.clone(), emissiveIntensity: 0.05,
          roughness: 0.95, metalness: 0.0,
        }));
      slot.position.set(x + f.x * domeR * 0.5, galTop + domeR * 0.55, z + f.z * domeR * 0.5);
      slot.rotation.set(-Math.PI * 0.28, faceAng, 0); slot.renderOrder = 2; scene.add(slot);
    }
    // oculus ring + warm skylight at the crown
    const ocR = domeR * 0.22;
    {
      const oc = new THREE.Mesh(
        new THREE.TorusGeometry(ocR, domeR * 0.02, 6, 24),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.34),
          transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      oc.rotation.x = -Math.PI / 2; oc.position.set(x, domeTop - 0.2, z); oc.renderOrder = 3; scene.add(oc);
      const sky = new THREE.Mesh(new THREE.CircleGeometry(ocR * 0.9, 20),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xe6d8ff), transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      sky.rotation.x = -Math.PI / 2; sky.position.set(x, domeTop - 0.3, z); sky.renderOrder = 2; scene.add(sky);
    }

    // ── 5) ORRERY — three tilted orbit-rings sweeping the crown. ──────────────
    for (let i = 0; i < 3; i++) {
      const rR  = domeR * (1.20 + i * 0.30);
      const rng = new THREE.Mesh(
        new THREE.TorusGeometry(rR, rR * 0.012, 8, 80),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.36),
          transparent: true, opacity: 0.56 - i * 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      rng.position.set(x, domeTop - domeR * 0.1 + i * domeR * 0.16, z);
      rng.rotation.x = (Math.PI / 2) * (0.30 + i * 0.10) * (i % 2 === 0 ? 1 : -1);
      rng.rotation.z = (Math.PI / 5) * i;
      rng.renderOrder = 4; scene.add(rng);
      // orbiting planet bead on each ring
      const bead = new THREE.Mesh(new THREE.SphereGeometry(rR * 0.045, 8, 6),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.5),
          transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      bead.position.set(x + rR, domeTop - domeR * 0.1 + i * domeR * 0.16, z);
      bead.renderOrder = 5; scene.add(bead);
    }

    // ── 6) SIGHTING TELESCOPE FINIAL — angled tube on a small mount at the apex. ─
    const antMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.22,
      roughness: 0.34, metalness: 0.48,
    });
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(fp * 0.010, fp * 0.014, R * 0.55, 10), antMat);
    scope.position.set(x, domeTop + R * 0.24, z); scope.rotation.z = Math.PI * 0.22;
    scope.castShadow = true; scene.add(scope);
    const finTop = domeTop + R * 0.52;

    // ── 7) ROOFTOP INSTRUMENTS — weather sensors + dishes on the gallery. ─────
    _antennaCluster(x, z, galTop, fp, 10, pal);
    _satelliteDish(x - Rg * 0.7, z + Rg * 0.4, galBase, fp * 0.05, pal);
    _ventBoxes(x, z, mainTop, R * 0.9, 5, pal);

    return { topY: finTop, faceR: R };           // faceR = fp * 0.46 (CONTRACT)
  }

  // ── BAZAAR — dark multi-domed souk + colonnade arcade + 4 corner domes ────
  // faceR = baseW / 2 = fp * 0.43
  function _buildBazaar(x, z, baseY, pal, fp, code) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.12),
      emissive: pal.primary.clone(), emissiveIntensity: 0.022,
      roughness: 0.74, metalness: 0.07,
    });
    regFacade(code, bodyMat);

    const baseW = fp * 0.86, baseH = 12;
    _box(x, z, baseY, baseW, baseH, baseW, bodyMat);
    _band(x, z, baseY + baseH, baseW * 0.48, baseW * 0.011, pal);
    _greeblePanels(x, z, baseY, baseY + baseH, baseW * 0.44, 4, 2, 4, fp * 0.042, fp * 0.042, pal);

    // Central drum + large dome
    const cDrumR = fp * 0.25, cDrumH = 11;
    const drumMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.042,
      roughness: 0.62, metalness: 0.14,
    });
    _cyl(x, z, baseY + baseH, cDrumR, cDrumR * 1.04, cDrumH, drumMat, 18);
    const cDomeBase = baseY + baseH + cDrumH;
    const cDomeR    = cDrumR * 1.14;
    const cDomeMat  = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.46, metalness: 0.20,
    });
    const cDomeTop = _dome(x, z, cDomeBase, cDomeR, cDomeMat, 22);
    _band(x, z, cDomeBase, cDomeR * 1.06, cDomeR * 0.024, pal);

    // 4 corner smaller domes
    const sDomeR  = fp * 0.086, sDrumH = 7;
    const sDomeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.055,
      roughness: 0.54, metalness: 0.16,
    });
    // 4 corner domes: drum + dome + accent band → 3 InstancedMesh (3 draw calls vs 12).
    // Geometry/material/positions match the prior _cyl/_dome/_band calls exactly.
    const sOff = fp * 0.27;
    const cornDrumIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(sDomeR, sDomeR * 1.03, sDrumH, 12), drumMat, 4);
    const cornDomeIM = new THREE.InstancedMesh(
      new THREE.SphereGeometry(sDomeR * 1.10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), sDomeMat, 4);
    const cornBandMat = new THREE.MeshBasicMaterial({   // one shared band material (was 4)
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
      transparent: true, opacity: 0.52,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const cornBandIM = new THREE.InstancedMesh(
      new THREE.TorusGeometry(sDomeR * 1.12, sDomeR * 0.028, 8, 64), cornBandMat, 4);
    cornDrumIM.castShadow = true; cornDomeIM.castShadow = true;
    cornBandIM.renderOrder = 3;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < 4; i++) {
        const a  = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const sx = x + Math.cos(a) * sOff;
        const sz = z + Math.sin(a) * sOff;
        d.rotation.set(0, 0, 0);
        d.position.set(sx, baseY + baseH + sDrumH * 0.5, sz); d.updateMatrix();
        cornDrumIM.setMatrixAt(i, d.matrix);
        d.position.set(sx, baseY + baseH + sDrumH, sz); d.updateMatrix();
        cornDomeIM.setMatrixAt(i, d.matrix);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.position.set(sx, baseY + baseH + sDrumH, sz); d.updateMatrix();
        cornBandIM.setMatrixAt(i, d.matrix);
      }
      cornDrumIM.instanceMatrix.needsUpdate = true; scene.add(cornDrumIM);
      cornDomeIM.instanceMatrix.needsUpdate = true; scene.add(cornDomeIM);
      cornBandIM.instanceMatrix.needsUpdate = true; scene.add(cornBandIM);
    }

    // Perimeter colonnade arcade (InstancedMesh)
    const arcCount = 16, arcR = baseW * 0.45, arcH = baseH * 0.78;
    const colIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.016, fp * 0.020, arcH, 8),
      new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(new THREE.Color(0xc8c0b0), 0.22),
        emissive: pal.secondary.clone(), emissiveIntensity: 0.035,
        roughness: 0.82, metalness: 0.04,
      }),
      arcCount
    );
    const cd = new THREE.Object3D();
    for (let i = 0; i < arcCount; i++) {
      const a = (i / arcCount) * Math.PI * 2;
      cd.position.set(x + Math.cos(a) * arcR, baseY + arcH * 0.5, z + Math.sin(a) * arcR);
      cd.rotation.set(0, 0, 0); cd.updateMatrix();
      colIM.setMatrixAt(i, cd.matrix);
    }
    colIM.instanceMatrix.needsUpdate = true;
    colIM.castShadow = true; scene.add(colIM);

    // ── Rooftop: wind catchers (tall exhaust stacks) + bazaar vents ──────────
    _exhaustStacks(x, z, cDomeTop, fp * 0.60, 6, pal);
    _ventBoxes(x, z, baseY + baseH, fp * 0.65, 8, pal);
    // Minarets as tall antenna clusters
    _antennaCluster(x, z, cDomeTop, fp, 8, pal);

    return { topY: cDomeTop, faceR: baseW * 0.5 };
  }

  // Generic fallback
  function _buildGenericTower(x, z, baseY, pal, fp, code) {
    const H   = 48;
    const mat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(), emissive: pal.primary.clone(),
      emissiveIntensity: 0.05, roughness: 0.70, metalness: 0.10,
    });
    regFacade(code, mat);
    _box(x, z, baseY, fp * 0.52, H, fp * 0.52, mat);
    return { topY: baseY + H, faceR: fp * 0.26 };
  }

  // ── CENTRAL BAZAAR / COMMUNITY MARKETPLACE ────────────────────────────────
  // The heart of the world at [0,0]: a large CIRCULAR bazaar — "Aladdin meets
  // Tron-glitch". An outer ring of ornate rentable MARKET STALLS (pointed onion
  // arches, striped awnings, hanging lanterns) fused with neon Tron accents
  // (glowing edge strips, holographic FOR-RENT sign plates), a patterned mandala
  // /circuit plaza floor, strung pennant banners, market clutter, and a grand
  // tiered fountain monument crowned by a spinning holo market-board.
  //
  // SOLID: every stall + the central monument is exposed as a circle collider on
  //   window.__hubColliders = [{cx,cz,r}, …]  — the app blocks the player on
  //   these; the aisles BETWEEN stalls and the open plaza stay walkable.
  //
  // All geometry is static / instanced and built ONCE. Animated glow is done by
  //   pushing shared materials to `landmarks` (opacity pulse) and meshes to
  //   `spinners` (rotation.y) — both already iterated in update(), so NOTHING is
  //   added to the per-frame hot path and update() stays allocation-free.
  function _buildBazaarCenter(cx, cz) {
    const baseY   = gy(cx, cz);
    const PLAZA_R = 90;      // plaza disc radius
    const STALL_N = 12;      // rentable stalls (kept modest: 8–16)
    const STALL_R = 72;      // radius of the stall ring
    const TWO_PI  = Math.PI * 2;

    // ── ONE-TIME CANVAS TEXTURES (offline · $0 · no network) ──────────────────
    // Patterned plaza floor: concentric mandala rings + radial spokes + circuit dots.
    // Perf: 256² instead of 512² — 4× fewer pixels to rasterize + upload; the plaza
    // floor is viewed at a distance/oblique angle so the drop is not visible. All
    // coordinates below are derived from FC (=half) so the pattern is identical.
    const FS = 256, FC = FS / 2;
    const fcv = document.createElement('canvas'); fcv.width = fcv.height = FS;
    const fg  = fcv.getContext('2d');
    fg.fillStyle = '#0a0912'; fg.fillRect(0, 0, FS, FS);
    for (let i = 1; i <= 8; i++) {
      fg.beginPath();
      fg.strokeStyle = (i % 2) ? 'rgba(255,178,64,0.55)' : 'rgba(39,224,255,0.42)';
      fg.lineWidth   = (i % 2) ? 3 : 2;
      fg.arc(FC, FC, i * 14, 0, TWO_PI); fg.stroke();
    }
    fg.strokeStyle = 'rgba(255,200,96,0.30)'; fg.lineWidth = 1.5;
    for (let s = 0; s < 24; s++) {
      const a = s / 24 * TWO_PI;
      fg.beginPath(); fg.moveTo(FC, FC);
      fg.lineTo(FC + Math.cos(a) * 116, FC + Math.sin(a) * 116); fg.stroke();
    }
    fg.fillStyle = 'rgba(39,224,255,0.7)';
    for (let i = 1; i <= 8; i++) for (let s = 0; s < 12; s++) {
      const a = (s + ((i % 2) ? 0.5 : 0)) / 12 * TWO_PI, rr = i * 14;
      fg.beginPath(); fg.arc(FC + Math.cos(a) * rr, FC + Math.sin(a) * rr, 1.3, 0, TWO_PI); fg.fill();
    }
    fg.strokeStyle = 'rgba(255,222,128,0.85)'; fg.lineWidth = 2.5;   // central seed-of-life flower
    for (let s = 0; s < 6; s++) {
      const a = s / 6 * TWO_PI;
      fg.beginPath(); fg.arc(FC + Math.cos(a) * 14, FC + Math.sin(a) * 14, 14, 0, TWO_PI); fg.stroke();
    }
    const floorTex = new THREE.CanvasTexture(fcv);
    floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.needsUpdate = true;

    // Striped awning fabric (Aladdin) with a Tron neon hem.
    const acv = document.createElement('canvas'); acv.width = 64; acv.height = 40;
    const ag = acv.getContext('2d'); const NS = 8;
    for (let i = 0; i < NS; i++) {
      ag.fillStyle = (i % 2) ? '#d8324a' : '#f3e6c4';
      ag.fillRect(i * (64 / NS), 0, 64 / NS, 40);
    }
    ag.fillStyle = '#27e0ff'; ag.fillRect(0, 34, 64, 6);            // neon hem strip
    const awnTex = new THREE.CanvasTexture(acv);
    awnTex.colorSpace = THREE.SRGBColorSpace; awnTex.needsUpdate = true;

    // Holographic FOR-RENT sign plate (per stall — carries its number).
    function makeSignTex(num) {
      const scv = document.createElement('canvas'); scv.width = 128; scv.height = 80;
      const sg = scv.getContext('2d');
      sg.fillStyle = '#0b0a14'; sg.fillRect(0, 0, 128, 80);
      sg.strokeStyle = '#27e0ff'; sg.lineWidth = 4; sg.strokeRect(4, 4, 120, 72);
      sg.textAlign = 'center';
      sg.fillStyle = '#ffd27a'; sg.font = 'bold 20px sans-serif'; sg.fillText('◈ FOR RENT', 64, 27);
      sg.fillStyle = '#27e0ff'; sg.font = '13px sans-serif';      sg.fillText('VENDOR SPACE', 64, 47);
      sg.fillStyle = '#ff53c8'; sg.font = 'bold 22px sans-serif'; sg.fillText('#' + num, 64, 71);
      const t = new THREE.CanvasTexture(scv);
      t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
    }

    // Spinning holo market-board (central monument signage).
    function makeBoardTex() {
      const bcv = document.createElement('canvas'); bcv.width = 256; bcv.height = 64;
      const bg = bcv.getContext('2d');
      bg.fillStyle = 'rgba(6,10,20,0.0)'; bg.fillRect(0, 0, 256, 64);
      bg.strokeStyle = '#27e0ff'; bg.lineWidth = 3; bg.strokeRect(3, 3, 250, 58);
      bg.textAlign = 'center';
      bg.fillStyle = '#ffd27a'; bg.font = 'bold 30px sans-serif'; bg.fillText('◈ SHADDAI BAZAAR ◈', 128, 30);
      bg.fillStyle = '#ff53c8'; bg.font = '16px sans-serif';      bg.fillText('RENT A STALL • TRADE • GATHER', 128, 52);
      const t = new THREE.CanvasTexture(bcv);
      t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
    }

    // ── SHARED MATERIALS (created once) ───────────────────────────────────────
    const paveMat = new THREE.MeshStandardMaterial({
      color: 0x2a2130, metalness: 0.20, roughness: 0.82,
      map: floorTex, emissive: new THREE.Color(0xffffff), emissiveMap: floorTex, emissiveIntensity: 0.55,
    });
    const stallBody = new THREE.MeshStandardMaterial({
      color: 0x2c2016, metalness: 0.14, roughness: 0.82,
      emissive: new THREE.Color(0xff9a3c), emissiveIntensity: 0.05,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0x5a4416, metalness: 0.85, roughness: 0.28,
      emissive: new THREE.Color(0xffcf4a), emissiveIntensity: 0.42,
    });
    const stoneWarm = new THREE.MeshStandardMaterial({
      color: 0x33291f, metalness: 0.10, roughness: 0.86,
      emissive: new THREE.Color(0xffcf4a), emissiveIntensity: 0.05,
    });
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffcf4a, metalness: 0.80, roughness: 0.20,
      emissive: new THREE.Color(0xffcf4a), emissiveIntensity: 0.95,
    });
    const awnMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: awnTex, metalness: 0.05, roughness: 0.70,
      emissive: new THREE.Color(0xffffff), emissiveMap: awnTex, emissiveIntensity: 0.20,
      side: THREE.DoubleSide,
    });
    function glowMat(hex, op) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex), transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
    }
    // Glow materials pushed to `landmarks` → allocation-free opacity pulse in update().
    const neonCyan    = glowMat(0x27e0ff, 0.62);
    const neonGold    = glowMat(0xffd27a, 0.55);
    const neonMag     = glowMat(0xff53c8, 0.52);
    const lanternGlow = glowMat(0xffb84a, 0.72);
    const bannerGlow  = glowMat(0xff6a3c, 0.52);
    const haloGlow    = glowMat(0x8af0ff, 0.50);
    [neonCyan, neonGold, neonMag, lanternGlow, bannerGlow, haloGlow].forEach(function (m, i) {
      landmarks.push({ mat: m, baseOpacity: m.opacity, phase: i * 1.13 });
    });

    // ── PLAZA FLOOR + concentric neon inlays + edge marker ────────────────────
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 2, 0.6, 80, 1), paveMat);
    floor.position.set(cx, baseY + 0.3, cz); floor.receiveShadow = true;
    scene.add(floor);
    const inlayR = [24, 48, 70, 86];
    for (let i = 0; i < inlayR.length; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(inlayR[i], 0.34, 6, 120), (i % 2) ? neonGold : neonCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, baseY + 0.66, cz); ring.renderOrder = 3;
      scene.add(ring);
    }
    groundMarker(cx, cz, 0xffcf4a, PLAZA_R + 4);

    // ── OUTER RING OF RENTABLE MARKET STALLS (instanced) ──────────────────────
    // Geometry shared per part-type; positions baked into instance matrices.
    const counterIM = new THREE.InstancedMesh(new THREE.BoxGeometry(11, 3.4, 3.2),  stallBody, STALL_N);
    const postIM    = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.34, 7, 8), goldMat, STALL_N * 2);
    const lintelIM  = new THREE.InstancedMesh(new THREE.BoxGeometry(10.8, 0.7, 0.8), goldMat, STALL_N);
    const finialIM  = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1.7, 0), goldMat, STALL_N);
    const awningIM  = new THREE.InstancedMesh(new THREE.BoxGeometry(11.6, 0.22, 4.4), awnMat, STALL_N);
    const awnTrimIM = new THREE.InstancedMesh(new THREE.BoxGeometry(11.8, 0.2, 0.2), neonCyan, STALL_N);
    const cNeonIM   = new THREE.InstancedMesh(new THREE.BoxGeometry(11.2, 0.16, 0.16), neonMag, STALL_N);
    const lanternIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.7, 0), lanternGlow, STALL_N * 2);
    const crateIM   = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), stallBody, STALL_N * 2);
    counterIM.castShadow = true; postIM.castShadow = true; lintelIM.castShadow = true;
    finialIM.castShadow  = true; crateIM.castShadow = true;
    awnTrimIM.renderOrder = 3; cNeonIM.renderOrder = 3; lanternIM.renderOrder = 3;

    const d = new THREE.Object3D();
    // Bake one instance with local-space offset (lx,ly,lz) rotated into the stall frame.
    function setInst(im, idx, sx, sz, cs, sn, lx, ly, lz, rotX, sX, sY, sZ) {
      const wx = sx + lx * cs + lz * sn;
      const wz = sz - lx * sn + lz * cs;
      d.position.set(wx, baseY + ly, wz);
      d.rotation.set(rotX || 0, Math.atan2(sn, cs), 0);
      d.scale.set(sX || 1, sY || 1, sZ || 1);
      d.updateMatrix();
      im.setMatrixAt(idx, d.matrix);
      d.scale.set(1, 1, 1);
    }

    const hubColliders = [];
    for (let i = 0; i < STALL_N; i++) {
      const a  = i / STALL_N * TWO_PI;
      const sx = cx + Math.cos(a) * STALL_R;
      const sz = cz + Math.sin(a) * STALL_R;
      // face the stall opening toward the plaza centre (local -Z points inward).
      const theta = Math.PI / 2 - a;
      const cs = Math.cos(theta), sn = Math.sin(theta);

      // counter (solid), gold posts, lintel, onion finial
      setInst(counterIM, i, sx, sz, cs, sn, 0, 1.7, 1.2, 0);
      setInst(postIM, i * 2,     sx, sz, cs, sn, -4.8, 3.5, 1.2, 0);
      setInst(postIM, i * 2 + 1, sx, sz, cs, sn,  4.8, 3.5, 1.2, 0);
      setInst(lintelIM, i, sx, sz, cs, sn, 0, 7.0, 1.2, 0);
      setInst(finialIM, i, sx, sz, cs, sn, 0, 8.4, 1.2, 0, 1, 1.9, 1);   // stretched → onion dome
      // striped awning overhanging toward the plaza (tilted down at the front)
      setInst(awningIM,  i, sx, sz, cs, sn, 0, 6.2, -1.4, 0.34);
      setInst(awnTrimIM, i, sx, sz, cs, sn, 0, 5.6, -3.3, 0.34);         // neon front hem
      setInst(cNeonIM,   i, sx, sz, cs, sn, 0, 3.5, -0.5, 0);           // counter-edge neon
      // hanging lanterns at the two front awning corners
      setInst(lanternIM, i * 2,     sx, sz, cs, sn, -5.2, 4.6, -2.8, 0);
      setInst(lanternIM, i * 2 + 1, sx, sz, cs, sn,  5.2, 4.6, -2.8, 0);
      // market clutter (crates) flanking the stall front — decorative, non-colliding
      setInst(crateIM, i * 2,     sx, sz, cs, sn, -6.6, 0.9, -3.0, 0.4, 1, 0.8, 1);
      setInst(crateIM, i * 2 + 1, sx, sz, cs, sn,  6.4, 0.7, -3.4, -0.5, 0.7, 0.7, 0.7);

      // holographic FOR-RENT sign plate (hanging under the arch; faces the plaza)
      const signMat = new THREE.MeshStandardMaterial({
        map: makeSignTex(i + 1), emissive: new THREE.Color(0xffffff),
        emissiveMap: null, emissiveIntensity: 0.9, side: THREE.DoubleSide,
        metalness: 0.0, roughness: 1.0, transparent: true,
      });
      signMat.emissiveMap = signMat.map;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6), signMat);
      const slx = 0, sly = 5.0, slz = -1.9;
      sign.position.set(sx + slx * cs + slz * sn, baseY + sly, sz - slx * sn + slz * cs);
      sign.rotation.y = theta + Math.PI;   // face inward toward plaza centre
      sign.renderOrder = 4;
      scene.add(sign);

      // SOLID collider for this stall (aisles between stalls stay open).
      hubColliders.push({ cx: sx, cz: sz, r: 6.2 });
    }
    counterIM.instanceMatrix.needsUpdate = true; scene.add(counterIM);
    postIM.instanceMatrix.needsUpdate    = true; scene.add(postIM);
    lintelIM.instanceMatrix.needsUpdate  = true; scene.add(lintelIM);
    finialIM.instanceMatrix.needsUpdate  = true; scene.add(finialIM);
    awningIM.instanceMatrix.needsUpdate  = true; scene.add(awningIM);
    awnTrimIM.instanceMatrix.needsUpdate = true; scene.add(awnTrimIM);
    cNeonIM.instanceMatrix.needsUpdate   = true; scene.add(cNeonIM);
    lanternIM.instanceMatrix.needsUpdate = true; scene.add(lanternIM);
    crateIM.instanceMatrix.needsUpdate   = true; scene.add(crateIM);

    // ── STRUNG PENNANT BANNERS between the stalls (instanced, glowing) ────────
    const BANNERS = STALL_N * 2, bannerR = STALL_R - 6;
    const bannerIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 2.6), bannerGlow, BANNERS);
    bannerIM.renderOrder = 3;
    for (let i = 0; i < BANNERS; i++) {
      const a = (i + 0.5) / BANNERS * TWO_PI;
      d.position.set(cx + Math.cos(a) * bannerR, baseY + 9.2, cz + Math.sin(a) * bannerR);
      d.rotation.set(0.5, -a + Math.PI / 2, 0); d.scale.set(1, 1, 1); d.updateMatrix();
      bannerIM.setMatrixAt(i, d.matrix);
    }
    bannerIM.instanceMatrix.needsUpdate = true; scene.add(bannerIM);

    // ── GRAND CENTRAL MONUMENT: tiered fountain + genie lamp + spinning holo ──
    const tierR = [13, 8.5, 5.0], tierH = 2.0, tierBaseY = [1.0, 3.4, 5.8];
    for (let i = 0; i < tierR.length; i++) {
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(tierR[i], tierR[i] + 0.8, tierH, 40, 1), stoneWarm);
      tier.position.set(cx, baseY + tierBaseY[i] + tierH / 2, cz);
      tier.castShadow = true; tier.receiveShadow = true;
      scene.add(tier);
      const water = new THREE.Mesh(new THREE.CircleGeometry(tierR[i] * 0.9, 40), neonCyan);
      water.rotation.x = -Math.PI / 2;
      water.position.set(cx, baseY + tierBaseY[i] + tierH + 0.05, cz);
      water.renderOrder = 3; scene.add(water);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(tierR[i] + 0.2, 0.22, 6, 60), neonGold);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(cx, baseY + tierBaseY[i] + tierH, cz); rim.renderOrder = 3;
      scene.add(rim);
    }
    // Tapered central column.
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.7, 8, 16, 1), goldMat);
    column.position.set(cx, baseY + 5.8 + 2 + 4, cz); column.castShadow = true;
    scene.add(column);
    // Genie-lamp finial (oval body + spout + flame orb).
    const lampBody = new THREE.Mesh(new THREE.SphereGeometry(2.0, 20, 14), goldMat);
    lampBody.scale.set(1.5, 0.75, 1.0);
    lampBody.position.set(cx, baseY + 15.8, cz); lampBody.castShadow = true;
    scene.add(lampBody);
    const spout = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.0, 12), goldMat);
    spout.position.set(cx + 3.0, baseY + 16.1, cz);
    spout.rotation.z = -Math.PI / 2.3; scene.add(spout);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), orbMat);
    flame.position.set(cx, baseY + 17.6, cz); scene.add(flame);
    const flameGlow = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), neonGold);
    flameGlow.position.set(cx, baseY + 17.6, cz); flameGlow.renderOrder = 3; scene.add(flameGlow);

    // Spinning holo halo rings around the column (rotation.y → visible spin).
    const haloY = [9.0, 11.4, 13.4];
    for (let i = 0; i < haloY.length; i++) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(3.4 - i * 0.6, 0.2, 6, 48), haloGlow);
      halo.position.set(cx, baseY + haloY[i], cz); halo.renderOrder = 3;
      scene.add(halo);
      spinners.push({ o: halo, ry: (i % 2 ? -1 : 1) * (0.18 + i * 0.10) });
    }
    // Spinning holo market-board — 4 signage planes on a rotating cross.
    const board = new THREE.Group();
    board.position.set(cx, baseY + 12.0, cz);
    const boardMat = new THREE.MeshBasicMaterial({
      map: makeBoardTex(), transparent: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.6), boardMat);
      p.rotation.y = i / 4 * TWO_PI; p.renderOrder = 4;
      board.add(p);
    }
    scene.add(board);
    spinners.push({ o: board, ry: 0.25 });
    // Crowning beacon orb.
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.3, 18, 14), orbMat);
    crown.position.set(cx, baseY + 20.0, cz); scene.add(crown);

    // SOLID collider for the central monument (fountain base).
    hubColliders.push({ cx: cx, cz: cz, r: 14 });

    // ── WARM + NEON GATHERING LIGHT (two cheap point lights) ──────────────────
    const warmLight = new THREE.PointLight(0xffd27a, 1.6, 260, 2);
    warmLight.position.set(cx, baseY + 20, cz); scene.add(warmLight);
    const neonLight = new THREE.PointLight(0x2fbaff, 0.7, 150, 2);
    neonLight.position.set(cx, baseY + 6, cz); scene.add(neonLight);

    // Expose SOLID pieces for the app's collision resolver (aisles/floor excluded).
    window.__hubColliders = hubColliders;

    markers.push({ code: 'BAZAAR', x: cx, z: cz });
  }

  // ── PROCEDURAL FACADE TEXTURE APPLICATION ─────────────────────────────────
  // Runs once after all buildings are placed. Uses the cached, canvas-generated
  // maps above (_stoneTexture / _metalTexture / _windowTexture) — NO network, NO
  // external URLs, NO paid services: everything is drawn locally and shared, so
  // this is $0 and works fully offline. Each material gets:
  //   • map          — stone masonry or brushed metal (grayscale → tinted by accent)
  //   • roughnessMap — stone grain (varied surface, not a flat spec)
  //   • emissiveMap  — lit-window grid so the building reads as inhabited, glowing
  //                    in the building's own accent colour.
  //
  // Textures are the SAME cached CanvasTextures, cloned only to give each material
  // its own .repeat (a handful of clones total, not one atlas per mesh).
  //
  // repeat values (U,V) tuned so tiles read as architectural courses/panels, not
  // wallpaper (buildings are ~30-80 units tall, ~20-90 wide):
  //   2×3 ≈ large slab/panel   3×4 ≈ dressed masonry   4×6 ≈ dense metal panelling
  function _initFacadeTextures() {
    const stone   = _stoneTexture();
    const metal   = _metalTexture();
    const windows = _windowTexture();

    // material family + repeat per building code
    const CFG = {
      'source-spire':     { kind: 'stone', ru: 3, rv: 4 },
      'nexus-hub':        { kind: 'metal', ru: 4, rv: 6 },
      'library':          { kind: 'stone', ru: 3, rv: 5 },
      'aegis':            { kind: 'metal', ru: 4, rv: 5 },
      'museum':           { kind: 'stone', ru: 3, rv: 3 },
      'markets-exchange': { kind: 'metal', ru: 4, rv: 6 },
      'oracle-spire':     { kind: 'stone', ru: 2, rv: 5 },
      'bazaar':           { kind: 'stone', ru: 3, rv: 2 },
    };

    function repClone(src, ru, rv, linear) {
      const t = src.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(ru, rv);
      if (linear) t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    }

    for (const code in CFG) {
      const mats = facadeRegistry[code];
      if (!mats || !mats.length) continue;
      const cfg  = CFG[code];
      const base = (cfg.kind === 'metal') ? metal : stone;
      // Perf/dedup: every material of THIS building uses the SAME repeat, so clone the
      // three maps ONCE per building code and SHARE them across all its facade mats
      // (was 3 clones × N mats → 3 clones total). Fewer texture objects + GPU uploads.
      const mapTex  = repClone(base,  cfg.ru, cfg.rv, false);
      const roughTex = repClone(stone, cfg.ru, cfg.rv, true);
      const emisTex = repClone(
        windows,
        Math.max(2, Math.round(cfg.ru * 0.75)),
        Math.max(3, Math.round(cfg.rv * 0.9)), true);
      mats.forEach(function (mat) {
        mat.map          = mapTex;
        mat.roughnessMap = roughTex;
        // Lit-window emissive grid — slightly coarser repeat so windows read at scale.
        mat.emissiveMap  = emisTex;
        // Windows glow in the building's accent (fallback to white if unset).
        if (!mat.emissive || (mat.emissive.r + mat.emissive.g + mat.emissive.b) < 0.05) {
          mat.emissive = new THREE.Color(0xffffff);
        }
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.55);
        // Lift near-black body so the grayscale map isn't crushed, keep the accent tint.
        mat.color.lerp(new THREE.Color(0x9a9a9a), 0.55);
        if (cfg.kind === 'metal') { mat.metalness = Math.max(mat.metalness || 0, 0.55); mat.roughness = 0.45; }
        else                      { mat.roughness = Math.max(mat.roughness || 0.6, 0.80); }
        mat.needsUpdate = true;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PILLAR PAVILION — legs down to the ground + walk-through themed LOUNGE.
  // The building mass is lifted by AGENT_LIFT in buildProceduralBuilding(); here we
  // build 6 fat pillars from the ground up to the building's podium underside and an
  // open, aesthetic lounge between them (floor + rug + seating + themed props + a
  // centre feature + an agent sign + a soft lit underside). Everything is static /
  // instanced and frozen by the matrix-freeze pass at the end of build(); no per-
  // frame allocation. No colliders are added (buildings are non-solid) so the whole
  // lounge is freely walkable. Only material.opacity of a few accents is pulsed via
  // the shared `landmarks` list (same mechanism the rest of the world uses).
  // ═══════════════════════════════════════════════════════════════════════════
  const LOUNGE_THEME = {
    'markets-exchange': { title: 'ZEROX · TRADING FLOOR', prop: 'desk',     center: 'ticker' },
    'library':          { title: 'QUILL · READING ROOM',  prop: 'shelf',    center: 'medal'  },
    'nexus-hub':        { title: 'NEXUS · ARCADE',         prop: 'arcade',   center: 'medal'  },
    'oracle-spire':     { title: 'ORACLE · MYSTIC HALL',   prop: 'obelisk',  center: 'orb'    },
    'museum':           { title: 'TURTLE · GALLERY',       prop: 'pedestal', center: 'medal'  },
    'aegis':            { title: 'PIKADON · VAULT',        prop: 'crate',    center: 'vault'  },
  };

  function _buildPillarPavilion(x, z, groundY, baseY, fp, pal, frontDir, code, color, faceR) {
    const theme      = LOUNGE_THEME[code] || { title: code, prop: 'pedestal', center: 'medal' };
    const undersideY = baseY - 1.2;                       // meet the elevated podium underside
    const H          = Math.max(20, undersideY - groundY);
    const faceAng    = Math.atan2(frontDir.x, frontDir.z);

    // ── SHARED MATERIALS ─────────────────────────────────────────────────────
    const pillarMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.03,
      roughness: 0.80, metalness: 0.16,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.14,
      roughness: 0.56, metalness: 0.24,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.20),
      transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // ── 1) PILLARS — 6 MONUMENTAL CARVED columns ────────────────────────────
    // Each leg reads as intentional, carved architecture, not a plain cylinder:
    //   • carved-stone RELIEF texture map (real image-gen output) on the shaft,
    //   • vertical FLUTING (proud ridges) running the shaft,
    //   • two carved RELIEF / GLYPH BANDS with a per-agent MOTIF,
    //   • an ornate stepped CAPITAL (echinus + square abacus) at the top,
    //   • a base MOLDING + square PLINTH foot anchoring it to the lounge floor.
    // Everything is InstancedMesh + shared geometry/materials → a handful of extra
    // draw calls per building, no per-frame allocation (frozen by the build's
    // matrix-freeze pass). Emissive accents carry the "life"; no new lights.
    const NP   = 6;
    // TRIM: pulled the pillar ring IN from fp*0.40 → fp*0.375. The square plinth feet
    // (rS*3.1 box → half ≈ fp*0.081) and capital abaci were reaching rP + half ≈ fp*0.481,
    // poking past both the lounge floor (rL=fp*0.46) and the podium plinth above
    // (plinthR=fp*0.458) — a visible flared overhang past the building silhouette. At
    // fp*0.375 the outer feet/caps land ≈ fp*0.456, tucked just inside the floor & podium.
    const rP   = fp * 0.375;                              // ring radius — capitals/feet tuck inside fp*0.46
    const rS   = Math.max(3.4, fp * 0.052);               // fat shaft radius ("legs")
    const angO = Math.PI / NP + faceAng;                  // offset off the entrance axis

    // Per-agent carved MOTIF for the relief bands (keyed by layout code).
    const motif = ({
      'oracle-spire':     'runes',    // ORACLE — vertical rune ticks
      'library':          'script',   // QUILL  — horizontal script bars
      'markets-exchange': 'circuit',  // ZEROX  — circuit/coin nodes
      'aegis':            'shield',    // PIKADON— shield bosses
      'museum':           'fret',      // TURTLE — Greek-key fretwork
      'nexus-hub':        'nodes',     // NEXUS  — connected nodes
    })[code] || 'nodes';

    // Carved-stone shaft: apply the real relief image map (tinted by pillarMat's
    // colour). Guarded — if the image is absent the shaft is still fluted stone.
    const _relief = _reliefTexture();
    if (_relief) { pillarMat.map = _relief; pillarMat.needsUpdate = true; }

    // Extra carving materials (matte stone ridge + emissive glyph accent).
    const ridgeMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.structural, 0.55),
      emissive: pal.primary.clone(), emissiveIntensity: 0.02,
      roughness: 0.90, metalness: 0.10,
    });
    const glyphMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.34,
      roughness: 0.46, metalness: 0.30,
    });

    const shaftIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(rS * 0.82, rS, H, 20), pillarMat, NP);
    const footIM  = new THREE.InstancedMesh(new THREE.CylinderGeometry(rS * 1.50, rS * 1.75, 2.2, 16), trimMat, NP);
    // Ornate capital: echinus (flared collar) + square abacus slab on top.
    const echIM   = new THREE.InstancedMesh(new THREE.CylinderGeometry(rS * 1.78, rS * 1.20, 2.8, 16), trimMat, NP);
    const abacIM  = new THREE.InstancedMesh(new THREE.BoxGeometry(rS * 3.0, 1.1, rS * 3.0), trimMat, NP);
    // Square plinth foot under the round base molding.
    const plinIM  = new THREE.InstancedMesh(new THREE.BoxGeometry(rS * 3.1, 1.6, rS * 3.1), ridgeMat, NP);
    const bandIM  = new THREE.InstancedMesh(new THREE.TorusGeometry(rS * 1.14, rS * 0.12, 6, 20), glowMat, NP);

    // Vertical FLUTING — proud ridges running each shaft (NF per pillar).
    const NF   = 10, flH = H * 0.84;
    const fluteIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(rS * 0.16, flH, rS * 0.30), ridgeMat, NP * NF);

    // Two carved RELIEF / GLYPH bands per pillar — a torus course + a ring of
    // motif glyphs. Glyph geometry varies with the agent's motif.
    const bandHFrac = [0.30, 0.62];
    const NG   = 14;
    const courseIM = new THREE.InstancedMesh(
      new THREE.TorusGeometry(rS * 1.20, rS * 0.10, 6, 24), glyphMat, NP * bandHFrac.length);
    const glyphGeo = (motif === 'runes')   ? new THREE.BoxGeometry(rS * 0.12, rS * 0.72, rS * 0.12)
                   : (motif === 'script')  ? new THREE.BoxGeometry(rS * 0.86, rS * 0.12, rS * 0.12)
                   : (motif === 'circuit') ? new THREE.BoxGeometry(rS * 0.28, rS * 0.28, rS * 0.16)
                   : (motif === 'shield')  ? new THREE.SphereGeometry(rS * 0.22, 10, 8)
                   : (motif === 'fret')    ? new THREE.BoxGeometry(rS * 0.52, rS * 0.24, rS * 0.14)
                                           : new THREE.SphereGeometry(rS * 0.17, 8, 6);
    const glyphIM = new THREE.InstancedMesh(glyphGeo, glyphMat, NP * bandHFrac.length * NG);

    shaftIM.castShadow = footIM.castShadow = echIM.castShadow = abacIM.castShadow =
      plinIM.castShadow = fluteIM.castShadow = true;
    bandIM.renderOrder = 3; courseIM.renderOrder = 3; glyphIM.renderOrder = 3;
    {
      const d = new THREE.Object3D();
      let fi = 0, gi = 0, ci = 0;
      for (let i = 0; i < NP; i++) {
        const a  = angO + (i / NP) * Math.PI * 2;
        const px = x + Math.cos(a) * rP, pz = z + Math.sin(a) * rP;
        d.scale.set(1, 1, 1);
        d.rotation.set(0, 0, 0);
        d.position.set(px, groundY + H * 0.5, pz);   d.updateMatrix(); shaftIM.setMatrixAt(i, d.matrix);
        d.position.set(px, groundY + 1.1, pz);       d.updateMatrix(); footIM.setMatrixAt(i, d.matrix);
        d.position.set(px, undersideY - 1.4, pz);    d.updateMatrix(); echIM.setMatrixAt(i, d.matrix);
        // Square abacus + plinth aligned to the pillar's radial facing.
        d.rotation.set(0, -a, 0);
        d.position.set(px, undersideY - 0.1, pz);    d.updateMatrix(); abacIM.setMatrixAt(i, d.matrix);
        d.position.set(px, groundY + 0.8, pz);       d.updateMatrix(); plinIM.setMatrixAt(i, d.matrix);
        d.rotation.set(0, 0, 0);
        // Vertical fluting ridges around the shaft.
        for (let f = 0; f < NF; f++) {
          const fa = (f / NF) * Math.PI * 2;
          d.rotation.set(0, -fa, 0);
          d.position.set(px + Math.cos(fa) * rS * 0.98, groundY + H * 0.5, pz + Math.sin(fa) * rS * 0.98);
          d.updateMatrix(); fluteIM.setMatrixAt(fi++, d.matrix);
        }
        // Glow band (kept) + carved courses + motif glyph rings at each band height.
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.position.set(px, groundY + H * 0.66, pz);  d.updateMatrix(); bandIM.setMatrixAt(i, d.matrix);
        for (let b = 0; b < bandHFrac.length; b++) {
          const by = groundY + H * bandHFrac[b];
          d.rotation.set(-Math.PI / 2, 0, 0);
          d.position.set(px, by, pz);                d.updateMatrix(); courseIM.setMatrixAt(ci++, d.matrix);
          for (let gk = 0; gk < NG; gk++) {
            const ga = (gk / NG) * Math.PI * 2;
            d.rotation.set(0, -ga, 0);
            d.position.set(px + Math.cos(ga) * rS * 1.10, by, pz + Math.sin(ga) * rS * 1.10);
            d.updateMatrix(); glyphIM.setMatrixAt(gi++, d.matrix);
          }
        }
      }
      shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
      footIM.instanceMatrix.needsUpdate  = true; scene.add(footIM);
      echIM.instanceMatrix.needsUpdate   = true; scene.add(echIM);
      abacIM.instanceMatrix.needsUpdate  = true; scene.add(abacIM);
      plinIM.instanceMatrix.needsUpdate  = true; scene.add(plinIM);
      fluteIM.instanceMatrix.needsUpdate = true; scene.add(fluteIM);
      bandIM.instanceMatrix.needsUpdate  = true; scene.add(bandIM);
      courseIM.instanceMatrix.needsUpdate = true; scene.add(courseIM);
      glyphIM.instanceMatrix.needsUpdate = true; scene.add(glyphIM);
    }

    // ── 1b) SECOND-FLOOR DECK + BALCONY RAILING (2026-07-13) ─────────────────
    // The pillars used to hold up the elevated building mass with an EMPTY gap at
    // their tops — "pillars floating in the air with nothing on them." This builds
    // the real WALKABLE upper floor that those pillars support: a solid deck slab
    // capping the pillars at podium level, a perimeter parapet + glowing rail
    // (balcony), and a soft under-glow. The player already RIDES the lounge lift up
    // to this level (world-elevators.js STOP-2 registers a walkable deckList patch of
    // radius fp at interiorY = groundY+BUILD_LIFT), so this only adds the missing
    // VISUAL floor — collision/reachability were already in place. All static /
    // instanced, frozen by the build's matrix-freeze pass; no per-frame allocation.
    // The deck ring is held just INSIDE the building silhouette (fp*0.455) so it never
    // flares past the podium/facade, and it wraps the building mass as a balcony.
    {
      const deckTopY = baseY;                     // flush with the elevated building floor (podium seat)
      const rD       = fp * 0.455;                // deck radius — inside the fp*0.46 facade, caps the pillar ring (rP=fp*0.375)
      const deckMat  = new THREE.MeshStandardMaterial({
        color: pal.body.clone().lerp(pal.structural, 0.34),
        emissive: pal.primary.clone(), emissiveIntensity: 0.05,
        roughness: 0.74, metalness: 0.22,
      });
      // Solid slab (Cylinder axis=Y → horizontal disc). Top surface sits at deckTopY;
      // slab hangs 1.2 below so it visually meets the pillar capitals + podium underside.
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(rD, rD, 1.2, 48), deckMat);
      deck.position.set(x, deckTopY - 0.6, z); deck.receiveShadow = true; deck.castShadow = true;
      scene.add(deck);
      // Fascia band (a slightly wider, thin trim below the deck edge — reads as a floor edge, not a raw disc).
      const fascia = new THREE.Mesh(new THREE.CylinderGeometry(rD * 1.008, rD * 1.008, 0.5, 48), trimMat);
      fascia.position.set(x, deckTopY - 1.35, z); scene.add(fascia);

      // Perimeter PARAPET wall — a low open glass/metal balcony wall around the deck edge.
      const parapetMat = new THREE.MeshStandardMaterial({
        color: pal.body.clone().lerp(pal.secondary, 0.22),
        emissive: pal.trim.clone(), emissiveIntensity: 0.10,
        roughness: 0.60, metalness: 0.30, side: THREE.DoubleSide,
      });
      const parapet = new THREE.Mesh(
        new THREE.CylinderGeometry(rD - 0.4, rD - 0.4, 2.4, 48, 1, true), parapetMat);
      parapet.position.set(x, deckTopY + 1.2, z); scene.add(parapet);
      // Glowing top RAIL cap ringing the parapet (the "balcony" light seam).
      const rail = new THREE.Mesh(
        new THREE.TorusGeometry(rD - 0.4, Math.max(0.28, fp * 0.006), 8, 64), glowMat);
      rail.rotation.x = Math.PI / 2; rail.position.set(x, deckTopY + 2.5, z);
      rail.renderOrder = 3; scene.add(rail);
      landmarks.push({ mat: rail.material, baseOpacity: 0.42, phase: 2.3 });

      // Balustrade POSTS around the rail (instanced — one draw call). Ties rail to deck.
      const NPOST = 24;
      const postGeo = new THREE.CylinderGeometry(Math.max(0.14, fp * 0.004), Math.max(0.14, fp * 0.004), 2.4, 6);
      const postIM  = new THREE.InstancedMesh(postGeo, trimMat, NPOST);
      postIM.castShadow = true;
      {
        const d = new THREE.Object3D();
        for (let i = 0; i < NPOST; i++) {
          const a = (i / NPOST) * Math.PI * 2;
          d.position.set(x + Math.cos(a) * (rD - 0.4), deckTopY + 1.2, z + Math.sin(a) * (rD - 0.4));
          d.rotation.set(0, 0, 0); d.updateMatrix(); postIM.setMatrixAt(i, d.matrix);
        }
        postIM.instanceMatrix.needsUpdate = true; scene.add(postIM);
      }

      // Soft UNDER-GLOW on the deck's underside so the lounge below reads as lit-from-above.
      const deckUnder = new THREE.Mesh(
        new THREE.CircleGeometry(rD * 0.92, 40),
        new THREE.MeshBasicMaterial({
          color: pal.trim, transparent: true, opacity: 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
      deckUnder.rotation.x = Math.PI / 2;         // face DOWN toward the lounge
      deckUnder.position.set(x, deckTopY - 1.5, z); deckUnder.renderOrder = 2; scene.add(deckUnder);
      landmarks.push({ mat: deckUnder.material, baseOpacity: 0.08, phase: 0.9 });

      // Faint accent RING inlaid on the deck's top surface (matches the lounge rug motif).
      const deckRing = new THREE.Mesh(
        new THREE.RingGeometry(rD * 0.58, rD * 0.66, 48),
        new THREE.MeshBasicMaterial({
          color: pal.trim, transparent: true, opacity: 0.14,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      deckRing.rotation.x = -Math.PI / 2; deckRing.position.set(x, deckTopY + 0.08, z);
      deckRing.renderOrder = 2; scene.add(deckRing);
    }

    // ── 2) LOUNGE FLOOR — themed slab + accent rug rings ─────────────────────
    const rL = fp * 0.46;
    const floorMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(new THREE.Color(0x0a0d14), 0.50),
      emissive: pal.primary.clone(), emissiveIntensity: 0.05,
      roughness: 0.70, metalness: 0.20,
    });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(rL, rL, 0.5, 44), floorMat);
    floor.position.set(x, groundY + 0.05, z); floor.receiveShadow = true; scene.add(floor);
    for (let k = 0; k < 2; k++) {
      const rr = new THREE.Mesh(
        new THREE.RingGeometry(rL * (0.30 + k * 0.28), rL * (0.36 + k * 0.28), 48),
        new THREE.MeshBasicMaterial({
          color: pal.trim, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      rr.rotation.x = -Math.PI / 2; rr.position.set(x, groundY + 0.32, z); rr.renderOrder = 2; scene.add(rr);
    }

    // ── 3) LIT UNDERSIDE — soft downward emissive glow so the lounge reads as lit ─
    const ceil = new THREE.Mesh(
      new THREE.CircleGeometry(rL * 0.94, 40),
      new THREE.MeshBasicMaterial({
        color: pal.trim, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(x, undersideY - 0.4, z); ceil.renderOrder = 2; scene.add(ceil);
    landmarks.push({ mat: ceil.material, baseOpacity: 0.10, phase: 1.7 });

    // ── 4) PERIMETER SEATING — benches ringing the lounge ────────────────────
    const NB = 6, rB = rL * 0.80;
    const benchIM = new THREE.InstancedMesh(new THREE.BoxGeometry(fp * 0.11, 1.6, fp * 0.028), trimMat, NB);
    benchIM.castShadow = true;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < NB; i++) {
        const a = faceAng + Math.PI + (i / NB) * Math.PI * 2;
        d.rotation.set(0, a + Math.PI / 2, 0);
        d.position.set(x + Math.cos(a) * rB, groundY + 0.8, z + Math.sin(a) * rB);
        d.updateMatrix(); benchIM.setMatrixAt(i, d.matrix);
      }
      benchIM.instanceMatrix.needsUpdate = true; scene.add(benchIM);
    }

    // ── 5/6) THEME FURNITURE + CENTRE FEATURE + AGENT SIGN ───────────────────
    _loungeProps (x, z, groundY, rL, fp, theme.prop, pal, faceAng);
    _loungeCenter(x, z, groundY, undersideY, fp, theme.center, pal);
    _loungeSign  (x, z, groundY, fp, frontDir, faceAng, theme.title, pal);

    // Every agent lounge gets its own themed wall of real-data 3D screens
    // (NEXUS charts+news, ZEROX markets+fear/greed, ORACLE trending+research,
    // QUILL headlines, PIKADON threat monitor, TURTLE gallery). Shared fetch.
    _buildLoungeScreens(code, x, z, groundY, undersideY, fp, pal, faceAng);
  }

  // Themed furniture ring — 2 InstancedMesh (body + emissive accent) per lounge.
  function _loungeProps(x, z, groundY, rL, fp, kind, pal, faceAng) {
    const N  = 6, rR = rL * 0.52;
    const spec = ({
      desk:     { w: fp * 0.10,  h: 3.2, d: fp * 0.050, topH: 0.5, top: 'screen' },
      shelf:    { w: fp * 0.090, h: 6.5, d: fp * 0.035, topH: 0.4, top: 'band'   },
      arcade:   { w: fp * 0.060, h: 4.6, d: fp * 0.050, topH: 1.6, top: 'screen' },
      obelisk:  { w: fp * 0.050, h: 7.0, d: fp * 0.050, topH: 1.0, top: 'point'  },
      pedestal: { w: fp * 0.055, h: 3.4, d: fp * 0.055, topH: 1.2, top: 'cube'   },
      crate:    { w: fp * 0.080, h: 3.0, d: fp * 0.080, topH: 0.4, top: 'band'   },
    })[kind] || { w: fp * 0.06, h: 3.4, d: fp * 0.06, topH: 1.0, top: 'cube' };

    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.structural, 0.18),
      emissive: pal.primary.clone(), emissiveIntensity: 0.03, roughness: 0.74, metalness: 0.20,
    });
    const accMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.20),
      transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const bodyIM = new THREE.InstancedMesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), bodyMat, N);
    bodyIM.castShadow = true;
    const accGeo = (spec.top === 'point')
      ? new THREE.ConeGeometry(spec.w * 0.6, spec.w * 1.4, 6)
      : (spec.top === 'cube')
        ? new THREE.BoxGeometry(spec.w * 0.8, spec.topH, spec.d * 0.8)
        : new THREE.BoxGeometry(spec.w * 0.9, spec.topH, spec.d * 0.55);
    const accIM = new THREE.InstancedMesh(accGeo, accMat, N);
    accIM.renderOrder = 3;
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a  = faceAng + Math.PI / N + (i / N) * Math.PI * 2;
      const px = x + Math.cos(a) * rR, pz = z + Math.sin(a) * rR;
      d.rotation.set(0, -a, 0);
      d.position.set(px, groundY + spec.h * 0.5, pz);  d.updateMatrix(); bodyIM.setMatrixAt(i, d.matrix);
      const accY = groundY + spec.h + (spec.top === 'point' ? spec.w * 0.7 : spec.topH * 0.5);
      d.position.set(px, accY, pz);                    d.updateMatrix(); accIM.setMatrixAt(i, d.matrix);
    }
    bodyIM.instanceMatrix.needsUpdate = true; scene.add(bodyIM);
    accIM.instanceMatrix.needsUpdate  = true; scene.add(accIM);
  }

  // Centre feature — a low dais plus a per-theme signature (orb / vault / ticker / medallion).
  function _loungeCenter(x, z, groundY, undersideY, fp, kind, pal) {
    const daisMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(pal.secondary, 0.20),
      emissive: pal.primary.clone(), emissiveIntensity: 0.04, roughness: 0.70, metalness: 0.20,
    });
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(fp * 0.12, fp * 0.14, 1.2, 32), daisMat);
    dais.position.set(x, groundY + 0.6, z); dais.receiveShadow = true; scene.add(dais);
    const emMat = () => new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.30),
      transparent: true, opacity: 0.70, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    if (kind === 'orb') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(fp * 0.05, 20, 14), emMat());
      orb.position.set(x, groundY + fp * 0.09, z); orb.renderOrder = 3; scene.add(orb);
      landmarks.push({ mat: orb.material, baseOpacity: 0.70, phase: 0.4 });
      const rune = new THREE.Mesh(new THREE.TorusGeometry(fp * 0.16, 0.4, 6, 40), emMat());
      rune.rotation.x = -Math.PI / 2; rune.position.set(x, groundY + 0.30, z); rune.renderOrder = 2; scene.add(rune);
    } else if (kind === 'vault') {
      const door = new THREE.Mesh(new THREE.CylinderGeometry(fp * 0.10, fp * 0.10, 1.0, 32),
        new THREE.MeshStandardMaterial({
          color: pal.secondary.clone().lerp(pal.structural, 0.30),
          emissive: pal.trim.clone(), emissiveIntensity: 0.12, roughness: 0.50, metalness: 0.50,
        }));
      door.position.set(x, groundY + 1.3, z); door.castShadow = true; scene.add(door);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(fp * 0.07, fp * 0.012, 8, 32), emMat());
      ring.position.set(x, groundY + 1.85, z); ring.renderOrder = 3; scene.add(ring);
      landmarks.push({ mat: ring.material, baseOpacity: 0.70, phase: 0.9 });
    } else if (kind === 'ticker') {
      const N = 8, tIM = new THREE.InstancedMesh(new THREE.BoxGeometry(fp * 0.05, fp * 0.04, 0.3), emMat(), N);
      tIM.renderOrder = 3;
      const d = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        d.rotation.set(0, -a, 0);
        d.position.set(x + Math.cos(a) * fp * 0.12, groundY + fp * 0.08, z + Math.sin(a) * fp * 0.12);
        d.updateMatrix(); tIM.setMatrixAt(i, d.matrix);
      }
      tIM.instanceMatrix.needsUpdate = true; scene.add(tIM);
      landmarks.push({ mat: tIM.material, baseOpacity: 0.60, phase: 0.2 });
    } else {
      const medal = new THREE.Mesh(new THREE.CircleGeometry(fp * 0.11, 40),
        new THREE.MeshBasicMaterial({
          map: _seedOfLifeTexture(), color: pal.trim.clone(),
          transparent: true, opacity: 0.50, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }));
      medal.rotation.x = -Math.PI / 2; medal.position.set(x, groundY + 0.35, z); medal.renderOrder = 2; scene.add(medal);
      landmarks.push({ mat: medal.material, baseOpacity: 0.50, phase: 1.1 });
    }
  }

  // Illuminated agent marquee sign hung on the lounge's entrance side (canvas text).
  function _loungeSign(x, z, groundY, fp, frontDir, faceAng, title, pal) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g  = cv.getContext('2d');
    const hex = hexColor(pal.trim.getHex());
    g.fillStyle = 'rgba(6,9,20,0.92)'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = hex; g.lineWidth = 5; g.strokeRect(4, 4, 504, 88);
    g.fillStyle = hex; g.font = 'bold 34px Orbitron, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title, 256, 50);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(fp * 0.34, fp * 0.064),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const sr = fp * 0.34;
    sign.position.set(x + frontDir.x * sr, groundY + fp * 0.075, z + frontDir.z * sr);
    sign.rotation.y = faceAng; sign.renderOrder = 3; scene.add(sign);
  }

  // ── PROCEDURAL BUILDING PLACER ────────────────────────────────────────────
  function buildProceduralBuilding(buildingCode, fp, x, z, color, displayName) {
    const groundY = gy(x, z) - 0.6;   // true ground foot (buried base courses hide the seam)
    // PILLAR PAVILION: raise the whole building mass up onto pillars; a walk-through
    // themed lounge is then built between the pillars at ground level (below).
    const baseY   = groundY + AGENT_LIFT;
    const pal     = buildPalette(color);

    const dx  = -x, dz = -z, len = Math.sqrt(dx * dx + dz * dz);
    const frontDir = (len < 0.1) ? { x: 0, z: -1 } : { x: dx / len, z: dz / len };

    const BUILDERS = {
      'source-spire':     _buildShaddaiTemple,
      'nexus-hub':        _buildNexusHub,
      'library':          _buildLibrary,
      'aegis':            _buildAegis,
      'museum':           _buildMuseum,
      'markets-exchange': _buildMarketsExchange,
      'oracle-spire':     _buildOracleSpire,
      'bazaar':           _buildBazaar,
    };
    const builder       = BUILDERS[buildingCode] || _buildGenericTower;
    // frontDir passed through so builders can align entrances/colonnades to world-centre.
    const { topY, faceR } = builder(x, z, baseY, pal, fp, buildingCode, frontDir);

    // Door recess + full decoration suite build at the ELEVATED baseY so the podium,
    // entrance, plaque, ribs, recessed windows, mullions and relief travel up with
    // the tower (liftBaseY = baseY) instead of staying stranded on the ground.
    _doorRecess(x, z, baseY + SOCLE_RISE, pal, fp, frontDir, faceR);
    decorate(x, z, color, displayName, fp, topY, frontDir, faceR, buildingCode, baseY);

    // Huge pillars down to the ground + an open walk-through themed lounge beneath.
    _buildPillarPavilion(x, z, groundY, baseY, fp, pal, frontDir, buildingCode, color, faceR);
  }

  // ── QUILL'S STUDY — a small, cozy scholar's office beside the grand Library ─
  // A modest stone cottage (footprint ~60): warm-lit windows, a pitched slate roof,
  // a smoking chimney, a violet quill-&-ink sign, and a real door on the side facing
  // world-centre. SOLID: its collider {cx,cz,r} is pushed onto window.__hubColliders
  // so the app blocks the player at the walls. Zero per-frame cost (build-time only;
  // the one animated element is the window glow, pulsed via the existing `landmarks`).
  function _buildQuillStudy(x, z) {
    const baseY = gy(x, z) - 0.6;   // sink the whole building slightly into the ground (buried base courses hide the seam)
    const pal   = buildPalette(0xb98cff);            // QUILL violet accents
    // frontDir → world-centre; door + main windows face it.
    const dx = -x, dz = -z, len = Math.sqrt(dx * dx + dz * dz) || 1;
    const f  = { x: dx / len, z: dz / len };
    const faceAng = Math.atan2(f.x, f.z);
    const tX = -f.z, tZ = f.x;                        // facade tangent

    // Plan dims (kept well inside the r=28 collider).
    const W = 34, D = 26, wallH = 15, roofH = 9;
    const fY = baseY + SOCLE_RISE;                    // wall-foot landing

    // ── Materials (one-time). Warm sandstone body + violet emissive trim. ──────
    const stoneTx = _stoneTexture().clone(); stoneTx.needsUpdate = true;
    stoneTx.wrapS = stoneTx.wrapT = THREE.RepeatWrapping; stoneTx.repeat.set(2, 2);
    const stoneMat = new THREE.MeshStandardMaterial({
      map: stoneTx, color: new THREE.Color(0xd8cdb6),
      emissive: pal.primary.clone(), emissiveIntensity: 0.02,
      roughness: 0.86, metalness: 0.05,
    });
    regFacade('quill-study', stoneMat);
    const baseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8f8672), roughness: 0.92, metalness: 0.04,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x3b3348), side: THREE.DoubleSide,
      emissive: pal.primary.clone(), emissiveIntensity: 0.05, roughness: 0.7, metalness: 0.16,
    });
    const chimneyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x6e5b52), roughness: 0.95, metalness: 0.03,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0a0910), roughness: 1.0, metalness: 0.0,
    });
    const violetMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone(), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const warmMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffcf8a), transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // Oriented box helper (local-x = facade tangent). Returns top Y.
    const boxAt = (cx, cz, by, w, h, dpt, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
      m.position.set(cx, by + h * 0.5, cz); m.rotation.y = faceAng;
      m.castShadow = true; m.receiveShadow = true; scene.add(m); return by + h;
    };

    // 1) Low plinth pad + wall body.
    boxAt(x, z, baseY - 0.6, W + 4, SOCLE_RISE + 0.6, D + 4, baseMat);   // plinth
    boxAt(x, z, fY, W, wallH, D, stoneMat);                               // cella walls

    // 2) Pitched slate roof (gable) spanning the body + a violet ridge line.
    _gable(x + f.x * (D * 0.5 + 0.5), z + f.z * (D * 0.5 + 0.5), fY + wallH,
           f, W * 0.5 + 1.2, roofH, D + 1.0, roofMat);
    {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, D + 1.0), violetMat);
      ridge.position.set(x - f.x * 0.0, fY + wallH + roofH - 0.2, z - f.z * 0.0);
      ridge.rotation.y = faceAng; ridge.renderOrder = 3; scene.add(ridge);
    }

    // 3) Chimney at a back corner, with a faint ember glow at the flue.
    {
      const chx = x - f.x * (D * 0.28) + tX * (W * 0.34);
      const chz = z - f.z * (D * 0.28) + tZ * (W * 0.34);
      const chTop = boxAt(chx, chz, fY + wallH * 0.35, 3.2, roofH + 7, 3.2, chimneyMat);
      boxAt(chx, chz, chTop, 4.0, 0.8, 4.0, chimneyMat);                 // cap
      const ember = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), warmMat);
      ember.rotation.x = -Math.PI / 2;
      ember.position.set(chx, chTop + 0.9, chz); ember.renderOrder = 3; scene.add(ember);
    }

    // 4) DOOR on the front (world-centre) face — recessed slot + violet frame + sill.
    {
      const dW = 5.0, dH = 8.5, fr = faceAng;
      const fcx = x + f.x * (D * 0.5), fcz = z + f.z * (D * 0.5);
      const recess = new THREE.Mesh(new THREE.BoxGeometry(dW, dH, 1.6), darkMat);
      recess.position.set(fcx - f.x * 0.4, fY + dH * 0.5, fcz - f.z * 0.4);
      recess.rotation.y = fr; scene.add(recess);
      // Violet door-frame (3 thin bars: lintel + 2 jambs) as one small group.
      const frameGeoV = new THREE.BoxGeometry(0.5, dH + 0.6, 0.4);
      const frameGeoH = new THREE.BoxGeometry(dW + 1.0, 0.5, 0.4);
      for (const o of [-dW * 0.5 - 0.25, dW * 0.5 + 0.25]) {
        const jamb = new THREE.Mesh(frameGeoV, violetMat);
        jamb.position.set(fcx + f.x * 0.35 + tX * o, fY + (dH + 0.6) * 0.5, fcz + f.z * 0.35 + tZ * o);
        jamb.rotation.y = fr; jamb.renderOrder = 3; scene.add(jamb);
      }
      const lintel = new THREE.Mesh(frameGeoH, violetMat);
      lintel.position.set(fcx + f.x * 0.35, fY + dH + 0.25, fcz + f.z * 0.35);
      lintel.rotation.y = fr; lintel.renderOrder = 3; scene.add(lintel);
      // Threshold step (walkable, low).
      boxAt(fcx + f.x * 1.4, fcz + f.z * 1.4, baseY, dW + 2.0, 0.5, 2.6, baseMat);
    }

    // 5) WARM-LIT WINDOWS — one flanking the door (front) + one on a side wall.
    //    Pulsed gently via the shared `landmarks` list → no per-frame allocation.
    const addWindow = (wx, wz, ww, wh, ang) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), warmMat.clone());
      pane.position.set(wx, fY + wallH * 0.5, wz); pane.rotation.y = ang;
      pane.renderOrder = 2; scene.add(pane);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(ww + 0.8, wh + 0.8), violetMat);
      frame.position.set(wx, fY + wallH * 0.5, wz); frame.rotation.y = ang;
      frame.renderOrder = 1; scene.add(frame);
      landmarks.push({ mat: pane.material, baseOpacity: 0.6, phase: Math.random() * 6.28 });
    };
    // front window (beside the door)
    addWindow(x + f.x * (D * 0.5 + 0.05) + tX * (W * 0.30),
              z + f.z * (D * 0.5 + 0.05) + tZ * (W * 0.30), 4.5, 5.5, faceAng);
    // side window
    addWindow(x + tX * (W * 0.5 + 0.05) - f.x * (D * 0.18),
              z + tZ * (W * 0.5 + 0.05) - f.z * (D * 0.18), 4.5, 5.5, faceAng + Math.PI / 2);

    // 6) QUILL & INK SIGN — a hanging plaque above the door: violet board, a white
    //    feather-quill (tapered cylinder) and a small ink bottle.
    {
      const sgx = x + f.x * (D * 0.5 + 1.6) + tX * (W * 0.5 - 3.0);
      const sgz = z + f.z * (D * 0.5 + 1.6) + tZ * (W * 0.5 - 3.0);
      const sgy = fY + wallH * 0.78;
      const board = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.4, 0.3),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x1b1526), emissive: pal.primary.clone(),
          emissiveIntensity: 0.28, roughness: 0.7, metalness: 0.1,
        }));
      board.position.set(sgx, sgy, sgz); board.rotation.y = faceAng;
      board.renderOrder = 2; scene.add(board);
      // bracket to the wall
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.2), chimneyMat);
      arm.position.set(sgx - f.x * 1.6, sgy + 1.7, sgz - f.z * 1.6);
      arm.rotation.y = faceAng; scene.add(arm);
      // feather-quill (angled) + nib
      const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.42, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf4efff), roughness: 0.6 }));
      quill.position.set(sgx + f.x * 0.3, sgy, sgz + f.z * 0.3);
      quill.rotation.set(0, faceAng, Math.PI * 0.28); quill.renderOrder = 3; scene.add(quill);
      // ink bottle
      const ink = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.0), violetMat);
      ink.position.set(sgx + f.x * 0.35 + tX * 1.6, sgy - 0.9, sgz + f.z * 0.35 + tZ * 1.6);
      ink.rotation.y = faceAng; ink.renderOrder = 3; scene.add(ink);
    }

    // 7) Violet eave trim band around the wall-head (cozy accent line).
    _band(x, z, fY + wallH - 0.4, Math.max(W, D) * 0.5 + 0.6, 0.18, pal);

    // 8) SOLID collider → app blocks the player at the study walls.
    window.__hubColliders = window.__hubColliders || [];
    window.__hubColliders.push({ cx: x, cz: z, r: 28 });

    markers.push({ code: 'QUILL_STUDY', x: x, z: z });
    return { x: x, z: z };
  }

  // ── SECTOR BUILDINGS ──────────────────────────────────────────────────────
  const S = {
    SHADDAI: sec('SHADDAI'), NEXUS:  sec('NEXUS'),  ZEROX:   sec('ZEROX'),
    QUILL:   sec('QUILL'),   ORACLE: sec('ORACLE'), PIKADON: sec('PIKADON'),
    TURTLE:  sec('TURTLE'),
  };

  // SHADDAI temple REMOVED from the ground centre — the Source now crowns the Sky
  // Observatory (built in world-elevators.js). The ground centre is now the grand
  // CIRCULAR BAZAAR / community marketplace (the old standalone bazaar building at
  // ~[0,130] is removed — the bazaar now lives ONLY here at world-centre).
  // ── CHUNKED BUILD QUEUE ────────────────────────────────────────────────────
  // Each entry builds ONE structure. We drain the queue a small slice at a time,
  // yielding to requestAnimationFrame between slices so the intro warp animation
  // keeps painting smoothly instead of freezing on ~7 back-to-back tower builds.
  const _buildQueue = [
    function(){ _buildBazaarCenter(S.SHADDAI.pos[0], S.SHADDAI.pos[1]); },
    function(){ buildProceduralBuilding('nexus-hub',         140, S.NEXUS.pos[0],   S.NEXUS.pos[1],   0x34e5b0, 'NEXUS HUB'); },
    function(){ buildProceduralBuilding('library',           258, S.QUILL.pos[0],   S.QUILL.pos[1],   0xb98cff, 'LIBRARY'); },  // ← 1.5× bigger (was 172): a grand, fully-roofed domed library. faceR=258·0.46≈118 (collider bumped to match in SHADDAI-WORLD-3D.html)
    function(){ buildProceduralBuilding('aegis',             145, S.PIKADON.pos[0], S.PIKADON.pos[1], 0xff5a6e, 'THE AEGIS'); },
    function(){ buildProceduralBuilding('museum',            140, S.TURTLE.pos[0],  S.TURTLE.pos[1],  0x1fd6c4, 'THE MUSEUM'); },
    function(){ buildProceduralBuilding('markets-exchange',  145, S.ZEROX.pos[0],   S.ZEROX.pos[1],   0xff7a18, 'ZEROX MARKETS'); },
    function(){ buildProceduralBuilding('oracle-spire',      138, S.ORACLE.pos[0],  S.ORACLE.pos[1],  0xc084fc, 'ORACLE'); },
    // QUILL'S STUDY — a small scholar's office set just OUTSIDE the grand Library, placed
    // radially outward from the QUILL sector so it clears the library footprint and sits in
    // open ground beyond the agent ring (no overlap with neighbours).
    function(){
      const lx = S.QUILL.pos[0], lz = S.QUILL.pos[1];
      const lr = Math.sqrt(lx * lx + lz * lz) || 1;
      const qsx = lx + (lx / lr) * 165;                 // ~165u further out along the radius (was 130; pushed out so it clears the now-bigger library faceR≈118)
      const qsz = lz + (lz / lr) * 165;
      _buildQuillStudy(qsx, qsz);
    },
  ];

  // BAZAAR: the standalone bazaar building is REMOVED — the bazaar now lives only
  // in the world-centre as the circular marketplace built by _buildBazaarCenter().

  for (const c of Object.keys(S)) markers.push({ code: c, x: S[c].pos[0], z: S[c].pos[1] });

  console.log('[layout] SHADDAI temple removed from ground center; now on the sky observatory');

  // Drain the tower queue across frames (≤ ~12ms of build per frame), then run the one-time
  // post-build steps and signal completion.
  var _towersT0 = _now();
  function _drainQueue(){
    var _sliceStart = _now();
    // Build at least one entry per frame; keep going only while we're under the frame budget so
    // a fast machine still builds several per frame but a slow one never blows the frame.
    while (_buildQueue.length) {
      var job = _buildQueue.shift();
      try { job(); } catch (e) { console.warn('tower build failed:', e && e.message); }
      if ((_now() - _sliceStart) >= 12) break;
    }
    if (_buildQueue.length) { _raf(_drainQueue); return; }
    if (_PERF) console.log('[perf] towers built in', Math.round(_now() - _towersT0), 'ms');
    _raf(_postBuild);   // yield one more frame so the last tower's paint lands, then finish
  }

  function _postBuild(){
    // Apply PBR textures to all registered facade materials (async, lazy)
    _initFacadeTextures();
    var _boundsT0 = _now();
    _runBoundsPass();
    if (_PERF) console.log('[perf] bounds/frustum pass in', Math.round(_now() - _boundsT0), 'ms');
    try {                                                        // expose for diagnostics
      screenState.tick = _screenTick; screenState.fetchCat = _screenFetchCat;
      window.__nexusScreens = screenState;   // legacy alias (now holds ALL lounges)
    } catch (e) {}
    if (typeof onComplete === 'function') { try { onComplete(); } catch (e) { console.warn('onComplete', e && e.message); } }
    if (_readyResolve) _readyResolve();
  }

  _raf(_drainQueue);

  // Return the API object IMMEDIATELY (towers build async in the background). Callers that
  // touch applyFacadeTexture before towers exist just iterate an empty registry (safe no-op);
  // the HTML now applies facade textures + measures footprints from the onComplete callback.
  return {
    markers,
    whenReady,

    // applyFacadeTexture — public hook (kept for external callers).
    // Accepts either a single THREE.Texture (legacy: sets map only) or an object
    // { map, normalMap, roughnessMap } for full PBR override per building code.
    applyFacadeTexture(code, texOrObj) {
      const mats = facadeRegistry[code] || [];
      mats.forEach(m => {
        if (texOrObj && typeof texOrObj === 'object' && !(texOrObj instanceof THREE.Texture)) {
          if (texOrObj.map)          { m.map = texOrObj.map; }
          if (texOrObj.normalMap)    { m.normalMap = texOrObj.normalMap; }
          if (texOrObj.roughnessMap) { m.roughnessMap = texOrObj.roughnessMap; }
        } else {
          m.map = texOrObj;
        }
        m.needsUpdate = true;
      });
    },

    update(t) {
      for (const s  of spinners)  s.o.rotation.y = t * s.ry;
      for (const lm of landmarks) lm.mat.opacity = lm.baseOpacity * (0.72 + 0.28 * Math.sin(t * 1.6 + lm.phase));
      for (const tr of trimRings) tr.ring.material.opacity = tr.baseOpacity * (0.75 + 0.25 * Math.sin(t * 1.8 + tr.phase));
      _screenTick(t);   // NEXUS lounge live screens: near-gated + throttled refresh
    },
  };

  // ── FRUSTUM-CULLING / BOUNDS PASS (one-time, after all towers exist — biggest FPS lever) ──
  // The world is ~8 buildings × dozens of InstancedMesh detail objects (windows,
  // ribs, columns, greebles, dentils, stalls, banners…), all added to the scene at
  // the ORIGIN with WORLD coordinates baked into their per-instance matrices.
  //
  // Why this pass matters:
  //   • An InstancedMesh's own `boundingSphere` starts null. When null, the frustum
  //     test falls back to the base geometry's ORIGIN-centred sphere (e.g. a single
  //     8-unit rib box at [0,0,0]) even though the actual instances sit hundreds of
  //     units out at a building. That volume never matches where the instances are,
  //     so the mesh is (a) never culled when off-screen — drawn EVERY frame — and
  //     (b) can pop when the camera looks away from world-centre.
  //   • `InstancedMesh.computeBoundingSphere()` (r0.180) derives the sphere from the
  //     baked instance matrices, producing a cull volume that truly encloses the
  //     instances → distant/off-screen buildings are now correctly frustum-culled,
  //     which is where the FPS is recovered. Because every mesh's matrixWorld is
  //     identity (all added at the origin) the instance-space sphere IS the world
  //     sphere, so the cull maths is exact and no visible building is wrongly culled.
  //   • Regular Meshes get their geometry bounding sphere pre-warmed so the first
  //     frustum test doesn't lazily compute it mid-frame (removes a first-frames
  //     hitch). Spinning meshes (halo rings, holo board) rotate about their own
  //     centre, so their world sphere is rotation-invariant → still cull-correct.
  //
  // frustumCulled is (re)affirmed true on everything so nothing is force-drawn.
  // One-time cost at build; zero per-frame cost; no visual change to on-screen geometry.
  //
  // STATIC-MATRIX FREEZE (perf technique #6 — biggest per-frame CPU lever after culling):
  //   Buildings never move. By default three.js recomposes every object's local matrix
  //   from position/quaternion/scale EVERY frame inside updateMatrixWorld() — for the
  //   hundreds of structural meshes + InstancedMesh detail objects here that is pure
  //   wasted CPU. Setting matrixAutoUpdate=false (after baking the current transform once
  //   via updateMatrix()) removes that per-frame Matrix4.compose() for each static object.
  //   We updateMatrix() FIRST so the baked matrix is correct even though this runs before
  //   the first render (otherwise a not-yet-composed matrix would render at the origin).
  //   The ONLY objects skipped are the spinning holo halos (their .o rotates every frame in
  //   update()), which must keep matrixAutoUpdate=true. Meshes animated by material opacity
  //   only (landmarks / trimRings) never move, so freezing their matrices is safe.
  //
  // Defined as a hoisted function declaration so _postBuild (above) can call it once every
  // tower mesh exists in the scene — measuring/culling too early would miss geometry.
  function _runBoundsPass(){
    var _spinSet = new Set();
    for (var _si = 0; _si < spinners.length; _si++) _spinSet.add(spinners[_si].o);
    var _nIM = 0, _nMesh = 0, _nFrozen = 0;
    scene.traverse(function (o) {
      if (o.isInstancedMesh) {
        _nIM++;
        o.frustumCulled = true;
        o.computeBoundingSphere();          // rebuild sphere from baked world-space instances
        if (!_spinSet.has(o)) { o.updateMatrix(); o.matrixAutoUpdate = false; _nFrozen++; }
      } else if (o.isMesh) {
        _nMesh++;
        o.frustumCulled = true;
        if (o.geometry && o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
        if (!_spinSet.has(o)) { o.updateMatrix(); o.matrixAutoUpdate = false; _nFrozen++; }
      }
    });

    console.log('[BENCH] world-buildings built in',
      Math.round(((typeof performance !== 'undefined' ? performance : Date).now()) - _t0),
      'ms |', (_nMesh + _nIM), 'scene meshes (' + _nIM + ' InstancedMesh +', _nMesh, 'Mesh) |',
      _nFrozen, 'static matrices frozen (matrixAutoUpdate=false)');
  }
};
