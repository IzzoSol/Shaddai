/**
 * renderer.js — Canvas2D Football Field Renderer.
 * ARCADE POP / COMIC aesthetic: halftone, ink outlines, bold flat fills,
 * zoomed action-follow camera showing only ~35 yards so players are LARGE.
 *
 * Usage:
 *   const r = new FootballRenderer(canvasElement);
 *   r.setCameraMode('SIDE_25D');
 *   r.resize();
 *   r.drawFrame(frame);
 */

'use strict';

(function (global) {
  // Depends on FootballProjection loaded before this file.
  function getProjection() {
    if (typeof FootballProjection !== 'undefined') return FootballProjection;
    if (typeof require !== 'undefined')            return require('./projection.js');
    throw new Error('renderer.js: FootballProjection not found — load projection.js first');
  }

  // ---------- PORTRAIT / ASSET CACHE ----------
  const _portraitCache = {};
  const _assetCache    = {};

  // Council codes that have football-action art in /sports/football/assets/players/
  const FOOTBALL_CODES = new Set(['SHADDAI','ZEROX','ORACLE','NEXUS','TURTLE','QUILL','PIKADON']);

  function loadPortrait(code) {
    if (_portraitCache[code]) return _portraitCache[code];
    const img = new Image();
    // Priority: 1) football-action comic art  2) agent portrait  3) agent generic  → colored disc
    if (FOOTBALL_CODES.has(code)) {
      const fball    = '/sports/football/assets/players/' + code + '.png?v=fball1';
      const portrait = '/assets/agents/' + code + '-portrait.png';
      const generic  = '/assets/agents/' + code + '.png';
      img.src = fball;
      img.onerror = function () {
        if (img.src.indexOf('players/') !== -1) { img.src = portrait; return; }
        if (img.src.indexOf('-portrait.png') !== -1) { img.src = generic; return; }
        img._failed = true;
      };
    } else {
      // Bots / unknowns — try generic agent portrait then give up → disc fallback
      const portrait = '/assets/agents/' + code + '-portrait.png';
      const generic  = '/assets/agents/' + code + '.png';
      img.src = portrait;
      img.onerror = function () {
        if (img.src.indexOf('-portrait.png') !== -1) { img.src = generic; return; }
        img._failed = true;
      };
    }
    _portraitCache[code] = img;
    return img;
  }

  function loadAsset(url) {
    if (_assetCache[url]) return _assetCache[url];
    const img = new Image();
    // Cache-bust: force the browser to refetch the regenerated COMIC assets
    // instead of serving the stale cached neon versions. Cache key stays the
    // base url so the draw-time lookups (keyed by base path) still resolve.
    img.src = url + '?v=comic2';
    img.onerror = function () { img._failed = true; };
    _assetCache[url] = img;
    return img;
  }

  // Preload council portraits
  const COUNCIL = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
  if (typeof Image !== 'undefined') {
    COUNCIL.forEach(c => loadPortrait(c));
    loadAsset('/sports/football/assets/stadium-bg.png');
    loadAsset('/sports/football/assets/turf.png');
    loadAsset('/sports/football/assets/splash.png');
    loadAsset('/sports/football/assets/burst.png');
  }

  // ---------- COMIC COLOUR CONSTANTS ----------
  const INK           = '#15130f';
  const PAPER         = '#f4ecd6';
  const TEAM_A_COLOR  = '#e63127';   // comic RED
  const TEAM_B_COLOR  = '#1f6fe5';   // comic BLUE
  const TEAM_A_DIM    = '#e6312744';
  const TEAM_B_DIM    = '#1f6fe544';
  const TEAM_A_GLOW   = '#e63127aa';
  const TEAM_B_GLOW   = '#1f6fe5aa';
  const GOLD          = '#ffd23f';   // comic YELLOW
  const GOLD_DIM      = '#ffd23f55';
  const LOS_COLOR     = '#ffd23f';
  const FIRST_DOWN_CLR = '#ff8800';

  function teamColor(team)    { return team === 'A' ? TEAM_A_COLOR : TEAM_B_COLOR; }
  function teamColorDim(team) { return team === 'A' ? TEAM_A_DIM   : TEAM_B_DIM; }
  function teamColorGlow(team){ return team === 'A' ? TEAM_A_GLOW  : TEAM_B_GLOW; }

  // ---------- FIELD THEMES ----------
  // Each theme controls turf color, line color, end-zone treatment, sky/stadium
  // backdrop and overall ambiance. `useTurfImg`/`useStadiumImg` opt into the
  // shipped bitmap assets; the rest are procedural so themes need no new art.
  const THEMES = {
    classic: {
      label:       'Classic Day',
      useTurfImg:  true,          // turf.png as base
      useStadiumImg: true,        // stadium-bg.png backdrop
      turf:        '#2f7d34',     // fallback grass if img missing
      turfAlt:     '#2a7030',     // mowing-stripe alt band
      line:        'rgba(255,255,255,0.85)',
      lineMinor:   'rgba(255,255,255,0.4)',
      hash:        'rgba(255,255,255,0.55)',
      number:      'rgba(255,255,255,0.92)',
      sideline:    INK,
      paper:       PAPER,
      skyTop:      '#b8cfe8',
      skyMid:      '#d4e6f5',
      halftone:    0.055,
      vignette:    0.34,
      turfTint:    'rgba(244,236,214,0.12)',
    },
    neon: {
      label:       'Neon Night',
      useTurfImg:  false,
      useStadiumImg: false,
      turf:        '#0b1420',     // deep midnight turf
      turfAlt:     '#111e30',
      line:        'rgba(0,245,255,0.85)',   // cyan glow lines
      lineMinor:   'rgba(0,245,255,0.35)',
      hash:        'rgba(0,245,255,0.5)',
      number:      'rgba(120,245,255,0.95)',
      sideline:    '#00f5ff',
      paper:       '#080d16',
      skyTop:      '#0a0f1e',
      skyMid:      '#12203a',
      halftone:    0.10,
      vignette:    0.55,
      turfTint:    'rgba(0,80,120,0.10)',
      glowLines:   true,          // add shadowBlur to lines
    },
    dome: {
      label:       'Indoor Dome',
      useTurfImg:  false,
      useStadiumImg: false,
      turf:        '#175c9e',     // blue-turf indoor field
      turfAlt:     '#1a68b0',
      line:        'rgba(255,255,255,0.9)',
      lineMinor:   'rgba(255,255,255,0.45)',
      hash:        'rgba(255,255,255,0.6)',
      number:      'rgba(255,236,150,0.95)',  // warm indoor lamp tint
      sideline:    '#f4ecd6',
      paper:       '#1a1712',
      skyTop:      '#2a2620',     // dome ceiling
      skyMid:      '#3a342a',
      halftone:    0.04,
      vignette:    0.42,
      turfTint:    'rgba(255,236,150,0.06)',
    },
  };
  const THEME_ORDER = ['classic', 'neon', 'dome'];

  function roleInitial(role) {
    const map = {
      QB:'Q', RB:'R', WR:'W', TE:'T', FB:'F',
      DL:'D', LB:'L', CB:'C', S:'S', DE:'E', DT:'G',
      OFF:'O', DEF:'D',
    };
    return map[role] || (role ? role[0] : '?');
  }

  // ---------- VFX STATE ----------
  const _vfxBursts = [];

  function addBurst(sx, sy, color, radius, ttl) {
    _vfxBursts.push({ x: sx, y: sy, color, radius, ttl, maxTtl: ttl });
  }

  // Ball trail
  const _ballTrail = [];
  const TRAIL_LEN  = 12;

  // Comic starburst callouts
  const _comicCallouts = []; // { sx, sy, text, color, ttl, maxTtl, scale }

  function addCallout(sx, sy, text, color, ttl) {
    _comicCallouts.push({ x: sx, y: sy, text, color, ttl, maxTtl: ttl, scale: 0.1 });
  }

  // Screen-shake state (managed externally via triggerShake)
  let _shakeX = 0, _shakeY = 0, _shakeTtl = 0;

  // ---------- ZOOM CAMERA STATE ----------
  // We maintain a smoothly-interpolated camera center (world Y) that follows the ball.
  // The visible window shows ±HALF_WINDOW yards around that center.
  // Wider window = more field visible around the ball = smaller players, more
  // "broadcast" ratio. Bumped from 34 → 48 (shows ~96 of 120 yds) so the field
  // reads big and the player tokens read small, like a real TV wide shot.
  const ZOOM_HALF_WINDOW = 48;   // show ~96 yards of field context
  const ZOOM_LERP_SPEED  = 0.08; // how fast camera pans per frame

  let _camCenterY  = 60;   // world-Y center (clamped)
  let _targetCamY  = 60;

  // ---------- HALFTONE HELPER ----------
  // Draw a CSS radial-gradient halftone pattern on a rect.
  function drawHalftone(ctx, x, y, w, h, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha || 0.12;
    // Use a small dot pattern via fillRect loops (Canvas2D compatible, no CSS)
    const dotR  = 2.5;
    const step  = 10;
    ctx.fillStyle = color || INK;
    for (let dx = x; dx < x + w; dx += step) {
      for (let dy = y; dy < y + h; dy += step) {
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- STARBURST SHAPE ----------
  // Draws a jagged starburst/explosion shape centred at (cx,cy).
  function drawStarBurst(ctx, cx, cy, r, points, color, outlineColor) {
    const inner = r * 0.52;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const rad   = i % 2 === 0 ? r : inner;
      const px    = cx + Math.cos(angle) * rad;
      const py    = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    // Ink outline first
    ctx.strokeStyle = outlineColor || INK;
    ctx.lineWidth   = 4;
    ctx.stroke();
    ctx.fillStyle   = color || GOLD;
    ctx.fill();
  }

  // ---------- SPEECH BUBBLE ----------
  function drawSpeechBubble(ctx, cx, cy, text, bgColor, textColor, fontSize) {
    ctx.save();
    const pad   = 10;
    const fSize = fontSize || 14;
    ctx.font = `bold ${fSize}px 'Luckiest Guy', 'Lilita One', cursive`;
    const tw  = ctx.measureText(text).width;
    const bw  = tw + pad * 2 + 8;
    const bh  = fSize + pad * 2;
    const bx  = cx - bw / 2;
    const by  = cy - bh - 18;

    // Tail
    ctx.beginPath();
    ctx.moveTo(cx - 8, by + bh);
    ctx.lineTo(cx,     cy - 4);
    ctx.lineTo(cx + 8, by + bh);
    ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle   = bgColor || GOLD; ctx.fill();

    // Bubble body with ink outline
    const br = 8;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, br) : ctx.rect(bx, by, bw, bh);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle   = bgColor || GOLD; ctx.fill();

    // Text
    ctx.fillStyle   = textColor || INK;
    ctx.font        = `bold ${fSize}px 'Luckiest Guy', 'Lilita One', cursive`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, by + bh / 2);
    ctx.restore();
  }

  // ---------- RENDERER CLASS ----------
  class FootballRenderer {
    constructor(canvas) {
      this.canvas     = canvas;
      this.ctx        = canvas.getContext('2d');
      this.cameraMode = 'SIDE_25D';
      this._proj      = null;
      this._dpr       = 1;
      this._lastFrame = null;
      this._tick      = 0;
      // Team identity (set by spectator.js via setTeamNames)
      this._teamNameA = 'TEAM A';
      this._teamNameB = 'TEAM B';
      // Active field theme (see THEMES). Default = classic day grass.
      this._themeKey = 'classic';
      this._theme    = THEMES.classic;
      this.resize();
    }

    setCameraMode(mode) {
      if (mode !== 'SIDE_25D' && mode !== 'ISO') return;
      this.cameraMode = mode;
    }

    // Switch the field/stadium theme. key ∈ THEME_ORDER. Redraw is caller's job.
    setTheme(key) {
      if (!THEMES[key]) return false;
      this._themeKey = key;
      this._theme    = THEMES[key];
      return true;
    }

    // Expose available themes for the UI picker.
    getThemes() {
      return THEME_ORDER.map(k => ({ key: k, label: THEMES[k].label }));
    }

    // Called by spectator.js with generated team names for end-zone text
    setTeamNames(nameA, nameB) {
      this._teamNameA = String(nameA || 'TEAM A').toUpperCase().slice(0, 10);
      this._teamNameB = String(nameB || 'TEAM B').toUpperCase().slice(0, 10);
    }

    resize() {
      this._proj = getProjection();
      // Cap DPR at 2 for performance
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = this.canvas.offsetWidth  || this.canvas.width  || 800;
      const H = this.canvas.offsetHeight || this.canvas.height || 600;
      this.canvas.width  = Math.round(W * this._dpr);
      this.canvas.height = Math.round(H * this._dpr);
      this.canvas.style.width  = W + 'px';
      this.canvas.style.height = H + 'px';
      this.ctx.scale(this._dpr, this._dpr);
      this._viewport = { width: W, height: H };
    }

    // ---------- ZOOM PROJECTION ----------
    // Returns a viewport that remaps the zoom window to the full canvas viewport,
    // so that the normal projection.js `project` call sees a "virtual" viewport
    // which covers the zoomed region. We do this by computing the screen offset
    // of what the zoomed window center would be vs. the full-field projection,
    // then applying a scale+translate transform to the canvas context.
    //
    // Approach: rather than hacking projection.js, we:
    // 1. Apply a canvas transform (scale + translate) before drawing.
    // 2. Project as normal into a "virtual" expanded viewport.
    // 3. Restore after drawing.

    _computeZoomTransform(frame) {
      const { width, height } = this._viewport;

      // Update camera target
      if (frame && frame.ball) {
        _targetCamY = frame.ball.y;
      } else if (frame && frame.field) {
        _targetCamY = 10 + (frame.field.los || 50); // world-Y from los
      }

      // Clamp target so window doesn't go outside field (world-Y 10..110)
      const minCam = 10 + ZOOM_HALF_WINDOW;
      const maxCam = 110 - ZOOM_HALF_WINDOW;
      _targetCamY = Math.max(minCam, Math.min(maxCam, _targetCamY));

      // Smooth interpolation
      _camCenterY += (_targetCamY - _camCenterY) * ZOOM_LERP_SPEED;

      // The full field world-Y range is 0..120.
      // The visible world-Y range is [_camCenterY - ZOOM_HALF_WINDOW .. _camCenterY + ZOOM_HALF_WINDOW].
      // We want to map this subset to the full viewport.
      // Zoom factor = FIELD_LENGTH / (2 * ZOOM_HALF_WINDOW)
      const visibleRange = 2 * ZOOM_HALF_WINDOW;
      const zoomY = this._proj.FIELD_LENGTH / visibleRange; // e.g. 120/36 ≈ 3.33

      // The center of the full field in screen space (before zoom) is at height * (1 - 0.5*0.7 - 0.05)
      // We just use a canvas scale+translate approach:
      //   scale: (zoomY, zoomY) — same zoom both axes for equal aspect
      //   translate: shift so _camCenterY (in normalized field coords) maps to canvas center

      // Where does _camCenterY land in screen coords in a normal (full-field) projection?
      const fullViewport = { width, height };
      const centerProj   = this._proj.project({ x: this._proj.FIELD_WIDTH / 2, y: _camCenterY, z: 0 }, this.cameraMode, fullViewport);

      // We want centerProj to map to canvas center after transform.
      // transform: ctx.translate(cx - centerProj.sx * zoom, cy - centerProj.sy * zoom); ctx.scale(zoom, zoom)
      const cx = width  / 2;
      const cy = height / 2;
      const zoom = Math.min(zoomY, 4.0); // cap zoom for ISO

      return {
        zoom,
        tx: cx - centerProj.sx * zoom,
        ty: cy - centerProj.sy * zoom,
      };
    }

    _project(worldPos) {
      return this._proj.project(worldPos, this.cameraMode, this._viewport);
    }

    // ---------- BACKDROP ----------
    _drawBackdrop() {
      const ctx    = this.ctx;
      const { width, height } = this._viewport;
      const theme  = this._theme || THEMES.classic;
      const stadBg = _assetCache['/sports/football/assets/stadium-bg.png'];
      const t      = this._tick;

      // Theme base fill (paper for classic, dark for neon/dome)
      ctx.fillStyle = theme.paper || PAPER;
      ctx.fillRect(0, 0, width, height);

      // Stadium background — top ~48% with comic pop art feel (classic only)
      if (theme.useStadiumImg && stadBg && !stadBg._failed && stadBg.complete && stadBg.naturalWidth > 0) {
        const bgH = height * 0.50;
        ctx.save();
        ctx.globalAlpha = 0.60;
        ctx.drawImage(stadBg, 0, 0, width, bgH);
        ctx.globalAlpha = 1;
        // Warm paper overlay gradient — fades image into paper
        const grad = ctx.createLinearGradient(0, 0, 0, bgH);
        grad.addColorStop(0,   'rgba(244,236,214,0.15)');
        grad.addColorStop(0.6, 'rgba(244,236,214,0.45)');
        grad.addColorStop(1,   'rgba(244,236,214,0.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, bgH);
        ctx.restore();
      } else {
        // Procedural themed sky / ceiling gradient with depth
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.52);
        sky.addColorStop(0,   theme.skyTop);
        sky.addColorStop(0.4, theme.skyMid);
        sky.addColorStop(1,   theme.paper || PAPER);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height * 0.52);

        // Neon: faint crowd light streaks across the upper stands
        if (theme.glowLines) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          for (let i = 0; i < 7; i++) {
            const gy = height * (0.05 + i * 0.05);
            ctx.fillStyle = i % 2 ? 'rgba(0,245,255,0.05)' : 'rgba(191,0,255,0.05)';
            ctx.fillRect(0, gy, width, 2);
          }
          ctx.restore();
        }
      }

      // Halftone dot overlay on upper backdrop — comic depth texture
      drawHalftone(ctx, 0, 0, width, height * 0.52, INK, theme.halftone || 0.055);

      // Crowd-glow bands at top and bottom edges (end-zone atmosphere)
      const topGlow = ctx.createLinearGradient(0, 0, 0, height * 0.18);
      topGlow.addColorStop(0, 'rgba(31,111,229,0.12)');
      topGlow.addColorStop(1, 'rgba(31,111,229,0)');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, width, height * 0.18);

      const botGlow = ctx.createLinearGradient(0, height * 0.82, 0, height);
      botGlow.addColorStop(0, 'rgba(230,49,39,0)');
      botGlow.addColorStop(1, 'rgba(230,49,39,0.12)');
      ctx.fillStyle = botGlow;
      ctx.fillRect(0, height * 0.82, width, height * 0.18);

      // Subtle depth gradient across the whole field area (perspective ground fade)
      const fieldGrad = ctx.createLinearGradient(0, height * 0.3, 0, height);
      fieldGrad.addColorStop(0, 'rgba(21,19,15,0.04)');
      fieldGrad.addColorStop(0.5, 'rgba(21,19,15,0)');
      fieldGrad.addColorStop(1, 'rgba(21,19,15,0.08)');
      ctx.fillStyle = fieldGrad;
      ctx.fillRect(0, height * 0.3, width, height * 0.7);
    }

    // ---------- FIELD DRAWING (runs inside zoom transform) ----------
    _drawField(frame) {
      const ctx          = this.ctx;
      const FIELD_LENGTH = this._proj.FIELD_LENGTH;
      const FIELD_WIDTH  = this._proj.FIELD_WIDTH;
      const theme        = this._theme || THEMES.classic;
      const turf         = _assetCache['/sports/football/assets/turf.png'];
      const t            = this._tick;

      const P = (wx, wy) => this._project({ x: wx, y: wy, z: 0 });

      // --- Turf base ---
      const corners = this._proj.projectFieldCorners(this.cameraMode, this._viewport);
      const sc  = (label) => corners.find(x => x.label === label).screen;
      const TL = sc('TL'), TR = sc('TR'), BR = sc('BR'), BL = sc('BL');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(TL.sx, TL.sy);
      ctx.lineTo(TR.sx, TR.sy);
      ctx.lineTo(BR.sx, BR.sy);
      ctx.lineTo(BL.sx, BL.sy);
      ctx.closePath();
      ctx.clip();

      if (theme.useTurfImg && turf && !turf._failed && turf.complete && turf.naturalWidth > 0) {
        const minX = Math.min(TL.sx, TR.sx, BR.sx, BL.sx);
        const maxX = Math.max(TL.sx, TR.sx, BR.sx, BL.sx);
        const minY = Math.min(TL.sy, TR.sy, BR.sy, BL.sy);
        const maxY = Math.max(TL.sy, TR.sy, BR.sy, BL.sy);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(turf, minX, minY, maxX - minX, maxY - minY);
        ctx.globalAlpha = 1;
        // Theme tint overlay
        ctx.fillStyle = theme.turfTint || 'rgba(244,236,214,0.15)';
        ctx.fill();
      } else {
        // Procedural themed turf base
        ctx.fillStyle = theme.turf;
        ctx.fill();
      }
      // Mowing-stripe alternating bands (every 5 yards) — reads as a real pitch,
      // drawn for every theme so the field is organized/legible.
      for (let yd = 10; yd < 110; yd += 5) {
        if (((yd - 10) / 5) % 2 === 0) continue; // every other band
        const a0 = P(0, yd), a1 = P(FIELD_WIDTH, yd);
        const b1 = P(FIELD_WIDTH, yd + 5), b0 = P(0, yd + 5);
        ctx.beginPath();
        ctx.moveTo(a0.sx, a0.sy); ctx.lineTo(a1.sx, a1.sy);
        ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(b0.sx, b0.sy);
        ctx.closePath();
        ctx.fillStyle   = theme.turfAlt;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Halftone on field
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(TL.sx, TL.sy); ctx.lineTo(TR.sx, TR.sy);
      ctx.lineTo(BR.sx, BR.sy); ctx.lineTo(BL.sx, BL.sy);
      ctx.closePath(); ctx.clip();
      drawHalftone(ctx, Math.min(TL.sx,BL.sx), Math.min(TL.sy,TR.sy),
                        Math.max(TR.sx,BR.sx)-Math.min(TL.sx,BL.sx),
                        Math.max(BL.sy,BR.sy)-Math.min(TL.sy,TR.sy),
                        INK, 0.06);

      // --- MIDFIELD LOGO (50-yard-line medallion) ---
      const mid = P(FIELD_WIDTH / 2, 60);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(mid.sx, mid.sy, 22, 0, Math.PI * 2);
      ctx.strokeStyle = theme.line;
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mid.sx, mid.sy, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Center hex mark
      ctx.fillStyle = theme.sideline;
      ctx.globalAlpha = 0.35;
      ctx.font = 'bold 14px Bungee, Impact, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⬡', mid.sx, mid.sy);
      ctx.restore();
      ctx.restore();

      // --- END ZONES (bold comic fill + ink border) ---
      const drawQuad = (y0, y1, color, inkAlpha) => {
        const pts = [
          P(0, y1), P(FIELD_WIDTH, y1),
          P(FIELD_WIDTH, y0), P(0, y0),
        ];
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.globalAlpha = inkAlpha || 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      drawQuad(0,   10,  TEAM_A_COLOR + '55', 0.6);
      drawQuad(110, 120, TEAM_B_COLOR + '55', 0.6);

      // Optional glow for neon lines
      const setGlow = (on) => {
        if (theme.glowLines && on) { ctx.shadowColor = theme.line; ctx.shadowBlur = 8; }
        else { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
      };

      // --- YARD LINES (every 5 yds; majors every 10) ---
      setGlow(false);
      for (let yd = 10; yd <= 110; yd += 5) {
        const pL = P(0, yd), pR = P(FIELD_WIDTH, yd);
        const isMajor = ((yd - 10) % 10) === 0;
        // Ink drop shadow (classic depth) — skip for dark themes to avoid mud
        if (!theme.glowLines) {
          ctx.strokeStyle = 'rgba(21,19,15,0.22)';
          ctx.lineWidth   = isMajor ? 3.5 : 1.8;
          ctx.beginPath();
          ctx.moveTo(pL.sx + 1.5, pL.sy + 1.5); ctx.lineTo(pR.sx + 1.5, pR.sy + 1.5);
          ctx.stroke();
        }
        setGlow(isMajor);
        ctx.strokeStyle = isMajor ? theme.line : theme.lineMinor;
        ctx.lineWidth   = isMajor ? 2.5 : 1;
        ctx.beginPath();
        ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy);
        ctx.stroke();
        setGlow(false);
      }

      // --- HASH MARKS (short realistic ticks at the two inbound hash rows,
      //     one per yard) instead of full-width lines. Two rows ~1/3 in. ---
      ctx.strokeStyle = theme.hash;
      ctx.lineWidth   = 1;
      const hashRows = [FIELD_WIDTH * 0.34, FIELD_WIDTH * 0.66];
      for (let yd = 11; yd < 110; yd++) {
        if (((yd - 10) % 5) === 0) continue; // skip where full lines already sit
        hashRows.forEach(hx => {
          const a = P(hx - 0.5, yd), b = P(hx + 0.5, yd);
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        });
      }
      // Sideline yard ticks (1-yard) as tiny marks along both boundaries
      for (let yd = 11; yd < 110; yd++) {
        if (((yd - 10) % 5) === 0) continue;
        const l0 = P(0.4, yd), l1 = P(1.4, yd);
        const r0 = P(FIELD_WIDTH - 1.4, yd), r1 = P(FIELD_WIDTH - 0.4, yd);
        ctx.beginPath(); ctx.moveTo(l0.sx, l0.sy); ctx.lineTo(l1.sx, l1.sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r0.sx, r0.sy); ctx.lineTo(r1.sx, r1.sy); ctx.stroke();
      }

      // --- SIDELINES ---
      setGlow(true);
      ctx.strokeStyle = theme.sideline;
      ctx.lineWidth   = 4;
      [0, FIELD_WIDTH].forEach(wx => {
        const p0 = P(wx, 0), p1 = P(wx, FIELD_LENGTH);
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
      });

      // --- GOAL LINES (thick) ---
      ctx.strokeStyle = theme.sideline;
      ctx.lineWidth   = 3;
      [10, 110].forEach(yd => {
        const pL = P(0, yd), pR = P(FIELD_WIDTH, yd);
        ctx.beginPath(); ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy); ctx.stroke();
      });
      setGlow(false);

      // --- BOLD YARD NUMBERS on BOTH sidelines (real broadcast layout) ---
      ctx.font      = 'bold 12px Bungee, Impact, monospace';
      ctx.textBaseline = 'middle';
      for (let yd = 20; yd <= 100; yd += 10) {
        const worldY = yd;
        const num    = worldY <= 60 ? (worldY - 10) : (110 - worldY);
        const numStr = String(num);
        // Left sideline number
        const pL = P(5, worldY);
        // Right sideline number
        const pR = P(FIELD_WIDTH - 5, worldY);
        [ [pL, 'left'], [pR, 'right'] ].forEach(([pt, side]) => {
          ctx.textAlign = 'center';
          if (!theme.glowLines) {
            ctx.fillStyle = INK;
            ctx.fillText(numStr, pt.sx + 1.5, pt.sy + 1.5);
          }
          ctx.fillStyle = theme.number;
          ctx.fillText(numStr, pt.sx, pt.sy);
        });
      }

      // --- END ZONE TEXT (Bungee bold — uses generated team names) ---
      ctx.font         = 'bold 14px Bungee, Impact, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const ezA = P(FIELD_WIDTH / 2, 5);
      const ezB = P(FIELD_WIDTH / 2, 115);
      const ezNameA = this._teamNameA || 'TEAM A';
      const ezNameB = this._teamNameB || 'TEAM B';

      ctx.fillStyle = INK;
      ctx.fillText(ezNameA, ezA.sx + 2, ezA.sy + 2);
      ctx.fillStyle = TEAM_A_COLOR;
      ctx.fillText(ezNameA, ezA.sx, ezA.sy);

      ctx.fillStyle = INK;
      ctx.fillText(ezNameB, ezB.sx + 2, ezB.sy + 2);
      ctx.fillStyle = TEAM_B_COLOR;
      ctx.fillText(ezNameB, ezB.sx, ezB.sy);

      // --- LOS MARKER (bold yellow dashed, pulsing) ---
      if (frame && frame.field) {
        const los    = frame.field.los;
        const worldY = 10 + los;
        const pulse  = 0.75 + 0.25 * Math.sin(t * 0.14);

        const pL = P(0, worldY), pR = P(FIELD_WIDTH, worldY);

        // Ink drop shadow first
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 4;
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(pL.sx + 2, pL.sy + 2); ctx.lineTo(pR.sx + 2, pR.sy + 2); ctx.stroke();

        ctx.strokeStyle = LOS_COLOR;
        ctx.lineWidth   = 3.5;
        ctx.globalAlpha = pulse;
        ctx.beginPath(); ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;

        // First-down line (orange)
        const { possession, distance } = frame.field;
        const fdOffset = possession === 'A' ? distance : -distance;
        const fdLos    = Math.max(0, Math.min(100, los + fdOffset));
        const fdY      = 10 + fdLos;
        const fdL      = P(0, fdY), fdR = P(FIELD_WIDTH, fdY);

        ctx.strokeStyle = INK;
        ctx.lineWidth   = 4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(fdL.sx + 2, fdL.sy + 2); ctx.lineTo(fdR.sx + 2, fdR.sy + 2); ctx.stroke();
        ctx.strokeStyle = FIRST_DOWN_CLR;
        ctx.lineWidth   = 3;
        ctx.beginPath(); ctx.moveTo(fdL.sx, fdL.sy); ctx.lineTo(fdR.sx, fdR.sy); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ---------- ABILITY GLOW RING + CURVED LABEL (replaces heavy ability panels) ----------
    _drawAbilityGlow(sx, sy, radius, label, color, t) {
      const ctx   = this.ctx;
      const pulse = radius + 10 + 5 * Math.sin(t * 0.22);

      ctx.save();

      // Outer soft glow (layered rings fading out)
      for (let layer = 3; layer >= 0; layer--) {
        const lr = pulse + layer * 5;
        ctx.beginPath();
        ctx.arc(sx, sy, lr, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 4 - layer * 0.8;
        ctx.globalAlpha = 0.18 - layer * 0.04;
        ctx.stroke();
      }
      // Solid glowing ring
      ctx.beginPath();
      ctx.arc(sx, sy, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3.5;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      // Ink outline ring
      ctx.strokeStyle = INK;
      ctx.lineWidth   = 5.5;
      ctx.globalAlpha = 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // --- CURVED LABEL text arced around the top of the ring ---
      if (label && label.length > 0) {
        const arcR    = pulse + 9;
        const text    = label.toUpperCase().slice(0, 12);
        const arcSpan = Math.min(Math.PI * 0.9, text.length * 0.16);
        const startA  = -Math.PI / 2 - arcSpan / 2;

        ctx.save();
        ctx.font         = `bold 8px Bungee, Impact, monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Draw each character along the arc
        for (let ci = 0; ci < text.length; ci++) {
          const frac  = text.length === 1 ? 0.5 : ci / (text.length - 1);
          const angle = startA + frac * arcSpan;
          const cx2   = sx + Math.cos(angle) * arcR;
          const cy2   = sy + Math.sin(angle) * arcR;
          ctx.save();
          ctx.translate(cx2, cy2);
          ctx.rotate(angle + Math.PI / 2);
          // Ink shadow
          ctx.fillStyle = INK;
          ctx.fillText(text[ci], 1, 1);
          // Color fill
          ctx.fillStyle = color;
          ctx.fillText(text[ci], 0, 0);
          ctx.restore();
        }
        ctx.restore();
      }

      ctx.restore();
    }

    // ---------- PLAYER CHIP (small, readable comic tokens) ----------
    _drawPlayer(player) {
      const ctx    = this.ctx;
      const proj   = this._project({ x: player.x, y: player.y, z: player.z });
      const scale  = proj.scale != null ? proj.scale : 1;
      const color  = teamColor(player.team);
      const dim    = teamColorDim(player.team);
      // SMALLER broadcast-scale tokens: base radius trimmed 11 → 6.5 so players
      // read small on the big field. Everything downstream is in world (radius)
      // units so the ring/badge/name all shrink together with the token.
      const radius = Math.max(5, 6.5 * scale);
      const hl     = player.highlight;
      const t      = this._tick;

      // ANCHOR FIX: the projection point (sx,sy) is the player's ground/foot
      // position at the yard line. Lift the token center up by ~radius so the
      // disc sits ON the line (feet at the yard) instead of straddling it.
      const sx = proj.sx;
      const sy = proj.sy - radius;

      // --- GROUND SHADOW (comic ink ellipse beneath player) ---
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx + 3, sy + radius + 3, radius * 1.1, radius * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // --- GLOW RING (when highlighted on notable event) ---
      if (hl && player.glowLabel) {
        const glowColor = player.glowColor || GOLD;
        this._drawAbilityGlow(sx, sy, radius, player.glowLabel, glowColor, t);
      }

      ctx.save();
      ctx.translate(sx, sy);

      if (hl) {
        const pulse = 1.1 + 0.06 * Math.sin(t * 0.18);
        ctx.scale(pulse, pulse);
      }

      // --- INK DROP SHADOW ---
      ctx.beginPath();
      ctx.arc(4, 5, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;

      // --- THICK INK RING ---
      ctx.beginPath();
      ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();

      // --- TEAM-COLOR RING ---
      ctx.beginPath();
      ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // --- WHITE INNER RING ---
      ctx.beginPath();
      ctx.arc(0, 0, radius + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // --- PORTRAIT OR DISC ---
      const pCode  = player.portraitCode ? player.portraitCode.toUpperCase() : '';
      const isCouncil = FOOTBALL_CODES.has(pCode);
      const img    = (typeof Image !== 'undefined') ? (_portraitCache[pCode] || loadPortrait(pCode)) : null;
      const hasImg = img && !img._failed && img.complete && img.naturalWidth > 0;

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);

      if (hasImg) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
        // Subtle team tint overlay
        ctx.fillStyle = dim;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        // Fallback: flat team colour disc with role letter (Bungee style)
        ctx.fillStyle = color;
        ctx.fill();
        ctx.font      = `bold ${Math.round(radius * 0.8)}px Bungee, Impact, monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = INK;
        ctx.fillText(roleInitial(player.role), 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(roleInitial(player.role), 0, 0);
      }

      // --- ROLE BADGE (compact comic pill) — sized to the smaller token ---
      const badgeY   = radius + 4;
      const badgeTxt = player.role || '';
      const bFSize   = Math.max(6, Math.round(6.5 * scale));
      const pillH    = bFSize + 3;
      ctx.font         = `bold ${bFSize}px Fredoka, 'Fredoka One', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      const btw  = ctx.measureText(badgeTxt).width;
      const bpad = 2.5;
      const bx   = -btw / 2 - bpad - 1;
      const bw2  = btw + bpad * 2 + 2;
      // Ink backing
      ctx.fillStyle = INK;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, badgeY - 1, bw2, pillH + 2, 3);
      else ctx.rect(bx, badgeY - 1, bw2, pillH + 2);
      ctx.fill();
      // Color fill
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx + 1, badgeY, btw + bpad * 2, pillH, 2);
      else ctx.rect(bx + 1, badgeY, btw + bpad * 2, pillH);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeTxt, 0, badgeY + 1);

      // --- NAME (Fredoka, ink-outlined, tight) — only for the council/heroes
      //     and highlighted players, to keep the field uncluttered at small scale ---
      const showName = hl || FOOTBALL_CODES.has((player.portraitCode || '').toUpperCase());
      if (showName) {
        const nameY = badgeY + pillH + 4;
        const nm    = player.name.slice(0, 8);
        const nFSize = Math.max(6, Math.round(6 * scale));
        ctx.font    = `bold ${nFSize}px Fredoka, sans-serif`;
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 2.5;
        ctx.strokeText(nm, 0, nameY);
        ctx.fillStyle   = '#ffffff';
        ctx.fillText(nm, 0, nameY);
      }

      ctx.restore();
    }

    // ---------- BALL + TRAIL ----------
    _drawBall(ball) {
      if (!ball) return;
      const ctx  = this.ctx;
      const proj = this._project(ball);
      const { sx, sy } = proj;
      const scale = proj.scale != null ? proj.scale : 1;
      // BIGGER ball
      const rw    = Math.max(10, 15 * scale);
      const rh    = Math.max(7,  9  * scale);
      const inAir = (ball.z || 0) > 0.5;

      _ballTrail.push({ sx, sy, z: ball.z || 0 });
      if (_ballTrail.length > TRAIL_LEN) _ballTrail.shift();

      // Thick ink trail
      for (let i = 0; i < _ballTrail.length - 1; i++) {
        const pt     = _ballTrail[i];
        const alpha  = (i / _ballTrail.length) * 0.6;
        const trailR = (i / _ballTrail.length) * rw * 0.7;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, Math.max(2, trailR), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 150, 30, ${alpha})`;
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 1.5;
        ctx.fill();
      }

      ctx.save();
      ctx.translate(sx, sy);

      if (inAir) {
        const s = 1 + (ball.z || 0) * 0.15;
        ctx.scale(s, s);
      }

      // INK SHADOW
      ctx.beginPath();
      ctx.ellipse(4, 4, rw + 2, rh + 2, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;

      // INK OUTLINE
      ctx.beginPath();
      ctx.ellipse(0, 0, rw + 2, rh + 2, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();

      // Ball body
      ctx.beginPath();
      ctx.ellipse(0, 0, rw, rh, -Math.PI / 6, 0, Math.PI * 2);
      const ballGrad = ctx.createRadialGradient(-rw * 0.2, -rh * 0.3, 0, 0, 0, rw);
      ballGrad.addColorStop(0, '#e8a85a');
      ballGrad.addColorStop(1, '#8a4010');
      ctx.fillStyle = ballGrad;
      ctx.fill();

      // Bold laces
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -rh * 0.45); ctx.lineTo(0, rh * 0.45);
      ctx.stroke();
      for (let lace = -1; lace <= 1; lace++) {
        ctx.beginPath();
        ctx.moveTo(-rw * 0.18, lace * rh * 0.22);
        ctx.lineTo( rw * 0.18, lace * rh * 0.22);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ---------- VFX BURSTS ----------
    _drawVFX() {
      const ctx = this.ctx;
      for (let i = _vfxBursts.length - 1; i >= 0; i--) {
        const b    = _vfxBursts[i];
        const prog = 1 - (b.ttl / b.maxTtl);
        const r    = b.radius * (0.3 + prog * 0.7);
        const alpha = (1 - prog) * 0.85;

        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 4 * (1 - prog);
        ctx.globalAlpha = alpha * 0.3;
        ctx.stroke();

        ctx.strokeStyle = b.color;
        ctx.lineWidth   = 3 * (1 - prog);
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (prog < 0.3) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 0.4, 0, Math.PI * 2);
          ctx.fillStyle   = b.color;
          ctx.globalAlpha = (0.3 - prog) * 2.5;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        b.ttl--;
        if (b.ttl <= 0) _vfxBursts.splice(i, 1);
      }
    }

    // ---------- COMIC CALLOUTS (starburst + text) ----------
    _drawComicCallouts() {
      const ctx = this.ctx;
      for (let i = _comicCallouts.length - 1; i >= 0; i--) {
        const c    = _comicCallouts[i];
        const prog = 1 - c.ttl / c.maxTtl;  // 0→1

        // Pop-in overshoot: grow fast then settle
        let sc;
        if (prog < 0.2) {
          sc = prog / 0.2 * 1.25;  // overshoot to 1.25
        } else if (prog < 0.35) {
          sc = 1.25 - (prog - 0.2) / 0.15 * 0.25; // settle to 1.0
        } else {
          sc = 1.0;
        }

        const alpha = c.ttl < 12 ? c.ttl / 12 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(c.x, c.y);
        ctx.scale(sc, sc);

        // Draw starburst behind text
        const bSize = Math.max(40, ctx.measureText(c.text).width * 0.7 + 30);
        drawStarBurst(ctx, 0, 0, bSize, 12, c.color || GOLD, INK);

        // Onomatopoeia text
        ctx.font = `bold 16px 'Luckiest Guy', 'Lilita One', cursive`;
        const tw  = ctx.measureText(c.text).width;
        ctx.font  = `bold ${Math.min(18, Math.max(11, bSize * 0.35))}px 'Luckiest Guy', 'Lilita One', cursive`;

        // Ink outline
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 4;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(c.text, 0, 0);
        ctx.fillStyle = INK;
        ctx.fillText(c.text, 1.5, 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(c.text, 0, 0);

        ctx.restore();

        c.ttl--;
        if (c.ttl <= 0) _comicCallouts.splice(i, 1);
      }
    }

    // ---------- TD BURST (comic starburst explosion) ----------
    _triggerTDBurst(frame) {
      if (!frame || !frame.ball) return;
      const proj  = this._project(frame.ball);
      const count = 10;
      const r     = 70;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        addBurst(
          proj.sx + Math.cos(angle) * r * 0.35,
          proj.sy + Math.sin(angle) * r * 0.35,
          i % 3 === 0 ? GOLD : i % 3 === 1 ? TEAM_A_COLOR : TEAM_B_COLOR,
          r + 20,
          30
        );
      }
      // Big comic callout
      addCallout(proj.sx, proj.sy - 60, 'TOUCHDOWN!!', GOLD, 55);
    }

    // ---------- SACK BURST ----------
    _triggerSackBurst(frame) {
      if (!frame || !frame.players) return;
      const actor = frame.players.find(p => p.highlight);
      if (!actor) return;
      const proj  = this._project({ x: actor.x, y: actor.y, z: actor.z });
      addBurst(proj.sx, proj.sy, TEAM_B_COLOR, 50, 22);
      addCallout(proj.sx, proj.sy - 50, 'SACK!', TEAM_B_COLOR, 45);
    }

    // ---------- INT BURST ----------
    _triggerIntBurst(frame) {
      if (!frame || !frame.players) return;
      const actor = frame.players.find(p => p.highlight);
      if (!actor) return;
      const proj  = this._project({ x: actor.x, y: actor.y, z: actor.z });
      addBurst(proj.sx, proj.sy, TEAM_A_COLOR, 55, 25);
      addCallout(proj.sx, proj.sy - 55, 'PICK!!', TEAM_A_COLOR, 48);
    }

    // ---------- ABILITY PULSE — sets glow ring data on the actor ----------
    _triggerAbilityPulse(frame) {
      if (!frame || !frame.players) return;
      const actor = frame.players.find(p => p.highlight);
      if (!actor) return;
      // Mark the actor so _drawPlayer draws the glow + curved label this tick
      const label = (frame.abilityName || frame.caption || 'ABILITY').toUpperCase().slice(0, 12);
      actor.glowLabel = label;
      actor.glowColor = '#bf00ff';
      // Small tasteful burst (no callout overlay for ability)
      const proj = this._project({ x: actor.x, y: actor.y, z: actor.z });
      addBurst(proj.sx, proj.sy, '#bf00ff', 40, 18);
    }

    // ---------- SACK / TD / INT GLOW ----------
    _applyEventGlow(frame, label, color) {
      if (!frame || !frame.players) return;
      const actor = frame.players.find(p => p.highlight);
      if (!actor) return;
      actor.glowLabel = label;
      actor.glowColor = color;
    }

    // ---------- SCREEN SHAKE TRIGGER ----------
    triggerShake(magnitude, durationFrames) {
      _shakeTtl = durationFrames || 20;
      this._shakeMag = magnitude || 8;
    }

    // ---------- FRAME DRAW ----------
    drawFrame(frame) {
      if (!frame) return;
      this._tick++;

      const ctx = this.ctx;
      const { width, height } = this._viewport;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Compute screen-shake offset
      let shakeOffX = 0, shakeOffY = 0;
      if (_shakeTtl > 0) {
        const mag    = (this._shakeMag || 8) * (_shakeTtl / 20);
        const angle  = this._tick * 2.7;
        shakeOffX    = Math.cos(angle) * mag;
        shakeOffY    = Math.sin(angle * 1.3) * mag * 0.6;
        _shakeTtl--;
      }

      // --- BACKDROP (outside zoom transform) ---
      this._drawBackdrop();

      // --- COMPUTE ZOOM TRANSFORM ---
      const zt = this._computeZoomTransform(frame);

      // --- APPLY ZOOM + SHAKE TRANSFORM ---
      ctx.save();
      ctx.translate(zt.tx + shakeOffX, zt.ty + shakeOffY);
      ctx.scale(zt.zoom, zt.zoom);

      // --- FIELD (inside zoom) ---
      this._drawField(frame);

      // --- PLAYERS ---
      const sorted = [...(frame.players || [])].sort((a, b) => a.y - b.y);
      sorted.forEach(p => this._drawPlayer(p));

      // --- BALL ---
      this._drawBall(frame.ball);

      // --- VFX BURSTS ---
      this._drawVFX();

      // --- COMIC CALLOUTS (also inside zoom so they follow action) ---
      this._drawComicCallouts();

      ctx.restore(); // end zoom transform

      // --- EVENT TRIGGERS ---
      if (frame.eventType === 'touchdown' || frame.eventType === 'field_goal') {
        this._triggerTDBurst(frame);
        this._applyEventGlow(frame, 'TD!', GOLD);
        if (_shakeTtl <= 0) this.triggerShake(10, 22);
      }
      if (frame.eventType === 'sack') {
        this._triggerSackBurst(frame);
        this._applyEventGlow(frame, 'SACK!', TEAM_B_COLOR);
        if (_shakeTtl <= 0) this.triggerShake(5, 14);
      }
      if (frame.eventType === 'interception') {
        this._triggerIntBurst(frame);
        this._applyEventGlow(frame, 'PICK!', TEAM_A_COLOR);
        if (_shakeTtl <= 0) this.triggerShake(5, 14);
      }
      if (frame.eventType === 'ability_used') {
        this._triggerAbilityPulse(frame);
      }

      // --- VIGNETTE (depth layer — drawn last, on top of zoom content, outside zoom) ---
      this._drawVignette();

      this._lastFrame = frame;
    }

    // ---------- VIGNETTE — soft radial darkness around field edges ----------
    _drawVignette() {
      const ctx = this.ctx;
      const { width, height } = this._viewport;
      const grad = ctx.createRadialGradient(
        width / 2, height * 0.55, height * 0.18,
        width / 2, height * 0.55, Math.max(width, height) * 0.78
      );
      const vAlpha = (this._theme && this._theme.vignette != null) ? this._theme.vignette : 0.38;
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${vAlpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // ---------- EXPORT ----------
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FootballRenderer;
  }
  global.FootballRenderer = FootballRenderer;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
