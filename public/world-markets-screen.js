/* world-markets-screen.js — a big in-world LIVE trading screen at the ZEROX markets sector.
 * Classic script: window.buildWorldMarketsScreen(THREE, scene, layout) -> { update(t) }
 * Renders a candlestick chart from /api/markets/ohlc onto a CanvasTexture on a tall panel.
 */
window.buildWorldMarketsScreen = function (THREE, scene, layout) {
  const sec = (layout && layout.sector) ? layout.sector('ZEROX') : { pos: [48, 30] };
  const px = sec.pos[0], pz = sec.pos[1];

  // ── canvas the chart is drawn onto ──
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 640;
  const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;

  // ── the screen panel (faces world center) ──
  const group = new THREE.Group();
  const W = 30, H = 18;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 1.4, H + 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff7a18, toneMapped: false })
  );
  frame.position.z = -0.05;
  // two support pylons
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, emissive: 0xff7a18, emissiveIntensity: 0.25, metalness: 0.7, roughness: 0.4 });
  for (const sx of [-W / 2 + 1, W / 2 - 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 14, 8), pylonMat);
    p.position.set(sx, -H / 2 - 7, -0.1); group.add(p);
  }
  group.add(frame); group.add(screen);
  group.position.set(px, H / 2 + 7, pz);
  group.lookAt(0, group.position.y, 0);   // face the world center
  scene.add(group);

  // ── draw ──
  let candles = [], price = null, change = 0, label = 'BTC';
  function draw() {
    cx.fillStyle = '#04060d'; cx.fillRect(0, 0, 1024, 640);
    // header
    cx.fillStyle = '#ff7a18'; cx.font = 'bold 48px Orbitron, monospace';
    cx.fillText('ZEROX EXCHANGE', 30, 60);
    cx.font = '28px "Share Tech Mono", monospace'; cx.fillStyle = '#27e0ff';
    cx.fillText(label + (price != null ? '   $' + Number(price).toLocaleString() : '   …'), 30, 100);
    if (price != null) { cx.fillStyle = change >= 0 ? '#26d07c' : '#ff5a6e'; cx.fillText((change >= 0 ? '+' : '') + change.toFixed(2) + '%  24h', 520, 100); }
    // chart area
    const x0 = 40, y0 = 140, w = 944, h = 460;
    cx.strokeStyle = 'rgba(39,224,255,0.15)'; cx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = y0 + (i / 4) * h; cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x0 + w, y); cx.stroke(); }
    if (candles.length > 1) {
      let lo = Infinity, hi = -Infinity;
      for (const c of candles) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
      const rng = (hi - lo) || 1; const cw = w / candles.length;
      candles.forEach((c, i) => {
        const X = x0 + i * cw + cw * 0.5;
        const yH = y0 + h - ((c.h - lo) / rng) * h, yL = y0 + h - ((c.l - lo) / rng) * h;
        const yO = y0 + h - ((c.o - lo) / rng) * h, yC = y0 + h - ((c.c - lo) / rng) * h;
        const up = c.c >= c.o; cx.strokeStyle = cx.fillStyle = up ? '#26d07c' : '#ff5a6e';
        cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(X, yH); cx.lineTo(X, yL); cx.stroke();
        const bw = Math.max(2, cw * 0.6); cx.fillRect(X - bw / 2, Math.min(yO, yC), bw, Math.max(2, Math.abs(yC - yO)));
      });
    } else {
      cx.fillStyle = '#7e8aa3'; cx.font = '24px monospace'; cx.fillText('loading market data…', x0 + 20, y0 + h / 2);
    }
    tex.needsUpdate = true;
  }
  draw();

  async function refresh() {
    try {
      const r = await fetch('/api/markets/ohlc?symbol=btc');
      const d = await r.json();
      if (d && d.candles) { candles = d.candles.slice(-48); price = d.price; change = d.change24h || 0; label = d.symbol || 'BTC'; draw(); }
    } catch (e) { /* keep last frame */ }
  }
  refresh(); const iv = setInterval(refresh, 60000);

  let acc = 0;
  return { mesh: group, update: function (t) { /* gentle emissive shimmer could go here */ }, dispose: function () { clearInterval(iv); } };
};
