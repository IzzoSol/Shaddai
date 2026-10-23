/* world-city-screens.js — LIVE SCREENS in SHADDAI City (2026-10-23, owner: "the screens in zerox shaddai city and news screen").
 *   ZEROX MARKET WALL — in front of ZEROX's Markets building: 8 live tickers (24h colour), Fear & Greed gauge, trending coins.
 *   SHADDAI NEWS SCREEN — on the Grid centre plaza: live crypto headlines (Cointelegraph) + world bulletins, crawling.
 * Data: world-live-feeds.js (server-cached free APIs). Offline = the screen says so. Each screen = one canvas texture on a framed
 * panel (2 draws + frame); it redraws only while the player is within VIEW_M. Brand: SHADDAI gold/cyan on black glass.
 *   WorldCityScreens.build({ THREE, scene, heightAt, layout, getPlayer, anchors? }) -> { tick(t), screens }   ?screens=0 = off
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, VIEW_M = 350;
  function panel(THREE, w, h, accent) {
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * h / w);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    var g = new THREE.Group();
    var face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    var frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, h + 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c0f16, metalness: 0.8, roughness: 0.35, emissive: accent, emissiveIntensity: 0.12 }));
    frame.position.z = -0.3; face.position.z = 0.0;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, h * 0.9, 12), frame.material); post.position.y = -h * 0.95;
    g.add(frame); g.add(face); g.add(post); face.position.y = 0; frame.position.y = 0;
    return { group: g, cv: cv, ctx: cv.getContext('2d'), tex: tex, h: h };
  }
  function drawMarkets(P, F) {
    var c = P.ctx, W = P.cv.width, H = P.cv.height, T = F.get('tickers'), G = F.get('fng'), R = F.get('trending');
    c.fillStyle = '#05070c'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffcf4a'; c.font = '700 34px system-ui'; c.fillText('ZEROX · THE MARKETS', 28, 50);
    c.fillStyle = T.state === 'ready' ? '#2cff9a' : '#ff6a5a'; c.font = '600 18px system-ui'; c.fillText(T.state === 'ready' ? '● LIVE' : (T.state === 'offline' ? '● OFFLINE' : '● LOADING'), W - 150, 46);
    var list = T.data || [];
    list.slice(0, 8).forEach(function (t, i) {
      var x = 28 + (i % 4) * 245, y = 90 + Math.floor(i / 4) * 120, up = t.change24h >= 0;
      c.fillStyle = '#0d1424'; c.fillRect(x, y, 230, 104); c.fillStyle = up ? '#2cff9a' : '#ff5a6a'; c.fillRect(x, y, 4, 104);
      c.fillStyle = '#e8f6ff'; c.font = '700 26px system-ui'; c.fillText(t.symbol, x + 16, y + 34);
      c.font = '600 22px system-ui'; c.fillText(t.price >= 1000 ? '$' + Math.round(t.price).toLocaleString() : '$' + (+t.price).toPrecision(4), x + 16, y + 66);
      c.fillStyle = up ? '#2cff9a' : '#ff5a6a'; c.font = '600 20px system-ui'; c.fillText((up ? '▲ +' : '▼ ') + t.change24h + '%', x + 16, y + 94);
    });
    if (!list.length) { c.fillStyle = '#9fb3c8'; c.font = '600 26px system-ui'; c.fillText(T.state === 'offline' ? 'Market feed offline — the server is not reachable.' : 'Loading live markets…', 28, 160); }
    var gy = H - 110;
    if (G.data) {
      var v = +G.data.value; c.fillStyle = '#9fb3c8'; c.font = '600 18px system-ui'; c.fillText('FEAR & GREED', 28, gy);
      c.fillStyle = '#1a2236'; c.fillRect(28, gy + 14, 420, 22); var gr = c.createLinearGradient(28, 0, 448, 0); gr.addColorStop(0, '#ff4a4a'); gr.addColorStop(0.5, '#ffcf4a'); gr.addColorStop(1, '#2cff9a');
      c.fillStyle = gr; c.fillRect(28, gy + 14, 420 * v / 100, 22); c.fillStyle = '#fff'; c.font = '700 24px system-ui'; c.fillText(v + ' · ' + G.data.value_classification, 28, gy + 70);
    }
    if (R.data && R.data.length) { c.fillStyle = '#9fb3c8'; c.font = '600 18px system-ui'; c.fillText('TRENDING', 520, gy); c.fillStyle = '#ffcf4a'; c.font = '600 22px system-ui'; c.fillText(R.data.slice(0, 5).map(function (x) { return x.symbol; }).join('  ·  '), 520, gy + 36); }
    c.fillStyle = '#56657a'; c.font = '14px system-ui'; c.fillText('CoinGecko · alternative.me — information, not advice', 520, H - 24);
    P.tex.needsUpdate = true;
  }
  function drawNews(P, F, t) {
    var c = P.ctx, W = P.cv.width, H = P.cv.height, N = F.get('news'), items = N.data || [];
    c.fillStyle = '#05070c'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#27e0ff'; c.font = '700 34px system-ui'; c.fillText('SHADDAI NEWS', 28, 50);
    c.fillStyle = N.state === 'ready' ? '#2cff9a' : '#ff6a5a'; c.font = '600 18px system-ui'; c.fillText(N.state === 'ready' ? '● LIVE' : (N.state === 'offline' ? '● FEED OFFLINE' : '● LOADING'), W - 210, 46);
    var heads = items.length ? items.map(function (n) { return n.title; }) : ['Welcome to SHADDAI City — the Underground Bazaar lift is at the centre plaza', 'Colosseum bracket opens', 'Edge realms sighted beyond the rim — sealed for now'];
    var k = Math.floor(t / 6) % heads.length;
    for (var i = 0; i < 4; i++) {
      var hd = heads[(k + i) % heads.length], y = 110 + i * 82;
      c.fillStyle = i === 0 ? '#ffcf4a' : '#e8f6ff'; c.font = (i === 0 ? '700 30px' : '500 24px') + ' system-ui';
      c.fillText(hd.length > 62 ? hd.slice(0, 60) + '…' : hd, 28, y);
    }
    var crawl = heads.join('   ◆   '), x = W - ((t * 90) % (crawl.length * 14 + W));
    c.fillStyle = '#0d1424'; c.fillRect(0, H - 50, W, 50); c.fillStyle = '#27e0ff'; c.font = '600 22px system-ui'; c.fillText(crawl, x, H - 17);
    P.tex.needsUpdate = true;
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]screens=0/.test(location.search || '')) return null;
    var THREE = o.THREE, F = root.WorldFeeds; if (!F) return null;
    var L = o.layout || root.WORLD_LAYOUT, A = o.anchors || {};
    var zx = A.zerox || (L && L.sector && L.sector('ZEROX') && { x: L.sector('ZEROX').pos[0], z: L.sector('ZEROX').pos[1] }) || { x: -260, z: 0 };
    var cx = A.news || { x: 0, z: 0 };
    var screens = [];
    function place(P, x, z, toward, lift) {
      var y = (o.heightAt ? o.heightAt(x, z) : 0) + lift * U; P.group.position.set(x, y, z); P.group.scale.setScalar(U);
      P.group.lookAt(toward.x, y, toward.z); o.scene.add(P.group); return P;
    }
    var d = Math.hypot(zx.x, zx.z) || 1;
    // beside the entrance (not in front of it): 34 m to the side of the door axis, 40 m out, 9 m up, angled to face the plaza approach
    var ux = -zx.x / d, uz = -zx.z / d, sx = -uz, sz = ux, mx = zx.x + ux * 40 * U + sx * 34 * U, mz = zx.z + uz * 40 * U + sz * 34 * U;
    var mk = place(panel(THREE, 18, 9, 0xffcf4a), mx, mz, { x: zx.x + ux * 120 * U, z: zx.z + uz * 120 * U }, 9); mk.kind = 'markets'; screens.push(mk);
    var nw = place(panel(THREE, 18, 8, 0x27e0ff), cx.x, cx.z - 48 * U, { x: cx.x, z: cx.z + 100 }, 12); nw.kind = 'news'; screens.push(nw);
    var last = 0;
    function tick(t) {
      if (t - last < 0.5) return; last = t; var p = o.getPlayer && o.getPlayer();
      screens.forEach(function (S) { if (p && Math.hypot(p.x - S.group.position.x, p.z - S.group.position.z) > VIEW_M * U) return; if (S.kind === 'markets') drawMarkets(S, F); else drawNews(S, F, t); });
    }
    var api = { screens: screens, tick: tick }; root.__cityScreens = api; return api;
  }
  root.WorldCityScreens = { build: build };
})(typeof window !== 'undefined' ? window : this);
