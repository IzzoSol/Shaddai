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

