/* =============================================================================
 * SHADDAI — SHARED TEAM IDENTITY SYSTEM  (teams.js)
 * -----------------------------------------------------------------------------
 * ONE source of truth for the 8 Forge-archetype teams used across:
 *   - SHADDAI World (public/SHADDAI-WORLD-3D.html)
 *   - The Shaddai Center sports games
 * A team must look the SAME everywhere — same colors, crest, jersey, motto.
 *
 * -----------------------------------------------------------------------------
 * TEAM SCHEMA (each object in window.SHADDAI_TEAMS):
 *   {
 *     id:        string   // stable slug, e.g. "vanguard" — the key games store
 *     name:      string   // display name, e.g. "Vanguard"
 *     primary:   "#hex"   // dominant color (jersey body / main fill)
 *     secondary: "#hex"   // support color (pattern / trim)
 *     accent:    "#hex"   // highlight / glow / number color
 *     jersey:    'stripes' | 'sash' | 'chevron' | 'solid' | 'gradient' | 'panel'
 *     motto:     string   // short rally cry
 *     crest:     string   // emblem shape key (see drawTeamCrest below)
 *   }
 *
 * GLOBAL API (all attached to window):
 *   window.SHADDAI_TEAMS
 *       -> Array<Team> (the 8 teams, order stable)
 *
 *   window.getTeam(id)
 *       -> Team | null   (case-insensitive id lookup)
 *
 *   window.drawTeamCrest(ctx, id, cx, cy, size)
 *       -> draws a DISTINCT procedural emblem centered at (cx,cy),
 *          fitting inside a `size` px box. Pure Canvas2D shapes, no images.
 *          Uses the team's own colors.
 *
 *   window.drawJersey(ctx, id, cx, cy, w, h, number)
 *       -> draws a small jersey/torso swatch centered at (cx,cy) of size w x h,
 *          using the team's colors + jersey pattern, with optional `number`.
 *
 * All colors sit in the SHADDAI dark-neon palette and are mutually distinct:
 * no two teams read the same at a glance (checked across hue + brightness).
 * ============================================================================= */

(function (global) {
  'use strict';

  /* -------------------------------------------------------------------------
   * THE 8 TEAMS
   * Colors chosen for distinct hues across the wheel:
   *   Vanguard    ~ steel blue        (210)
   *   Ghost       ~ faded violet-gray (270 low sat)
   *   Artisan     ~ teal              (175)
   *   Oracle      ~ deep violet       (285)
   *   Street-Deity~ magenta           (320)
   *   Gaia-Link   ~ jade/lime         (140)
   *   Psionic     ~ cyan              (190)  paired w/ hot pink
   *   Harvester   ~ blood red         (355)
   * ----------------------------------------------------------------------- */
  var TEAMS = [
    {
      id: 'vanguard',
      name: 'Vanguard',
      primary: '#2f6bd4',   // steel blue
      secondary: '#12233f', // deep navy
      accent: '#ffcc33',    // gold
      jersey: 'chevron',
      motto: 'Hold the line.',
      crest: 'shield'
    },
    {
      id: 'ghost',
      name: 'Ghost',
      primary: '#8a83b0',   // faded violet-gray
      secondary: '#1a1824', // near-black
      accent: '#d6d0ff',    // pale violet glow
      jersey: 'solid',
      motto: 'Never seen. Never gone.',
      crest: 'wisp'
    },
    {
      id: 'artisan',
      name: 'Artisan',
      primary: '#1fb6a6',   // teal
      secondary: '#0c3a37', // dark teal
      accent: '#e08a3c',    // copper
      jersey: 'panel',
      motto: 'Make it, break it, remake it.',
      crest: 'gear'
    },
    {
      id: 'oracle',
      name: 'Oracle',
      primary: '#8b44e0',   // deep violet
      secondary: '#2a1147', // dark purple
      accent: '#ffd54a',    // gold
      jersey: 'gradient',
      motto: 'It is already written.',
      crest: 'eye'
    },
    {
      id: 'street-deity',
      name: 'Street-Deity',
      primary: '#ff2fb0',   // magenta
      secondary: '#20081c', // dark plum
      accent: '#ffd23f',    // gold
      jersey: 'sash',
      motto: 'Worship the block.',
      crest: 'halo'
    },
    {
      id: 'gaia-link',
      name: 'Gaia-Link',
      primary: '#1fbf5a',   // jade green
      secondary: '#08351f', // deep forest
      accent: '#b6ff3c',    // lime
      jersey: 'stripes',
      motto: 'Rooted. Networked. Alive.',
      crest: 'leaf'
    },
    {
      id: 'psionic',
      name: 'Psionic',
      primary: '#12d9e6',   // cyan
      secondary: '#07303a', // dark cyan
      accent: '#ff4fd8',    // hot pink
      jersey: 'panel',
      motto: 'Think louder.',
      crest: 'brainwave'
    },
    {
      id: 'harvester',
      name: 'Harvester',
      primary: '#d61f2b',   // blood red
      secondary: '#0a0709', // black
      accent: '#ff7a45',    // ember orange
      jersey: 'chevron',
      motto: 'Reap what you built.',
      crest: 'scythe'
    }
  ];

  /* index by id for O(1) lookup */
  var BY_ID = {};
  TEAMS.forEach(function (t) { BY_ID[t.id] = t; });

  function getTeam(id) {
    if (!id) return null;
    return BY_ID[String(id).toLowerCase()] || null;
  }

  /* -------------------------------------------------------------------------
   * Small canvas helpers
   * ----------------------------------------------------------------------- */
  function withCtx(ctx, fn) {
    ctx.save();
    try { fn(); } finally { ctx.restore(); }
  }

  function glow(ctx, color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur || 8;
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
      else ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
  }

  /* -------------------------------------------------------------------------
   * CREST DRAWERS — one distinct glyph per archetype.
   * Each receives (ctx, t, cx, cy, s) where s = full box size; work in a
   * radius r = s*0.42 around (cx, cy).
   * ----------------------------------------------------------------------- */
  var CRESTS = {

    // Vanguard — armored shield with a chevron
    shield: function (ctx, t, cx, cy, s) {
      var r = s * 0.42;
      withCtx(ctx, function () {
        glow(ctx, t.primary, s * 0.14);
        poly(ctx, [
          [cx, cy - r],
          [cx + r * 0.85, cy - r * 0.55],
          [cx + r * 0.85, cy + r * 0.25],
          [cx, cy + r],
          [cx - r * 0.85, cy + r * 0.25],
          [cx - r * 0.85, cy - r * 0.55]
        ]);
        ctx.fillStyle = t.primary;
        ctx.fill();
        ctx.lineWidth = s * 0.05;
        ctx.strokeStyle = t.secondary;
        ctx.stroke();
        // gold chevron
        ctx.shadowBlur = 0;
        ctx.lineWidth = s * 0.09;
        ctx.strokeStyle = t.accent;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.1);
        ctx.lineTo(cx, cy + r * 0.35);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.1);
        ctx.stroke();
      });
    },

    // Ghost — floating wisp with two hollow eyes
    wisp: function (ctx, t, cx, cy, s) {
      var r = s * 0.4;
      withCtx(ctx, function () {
        glow(ctx, t.accent, s * 0.16);
        ctx.fillStyle = t.primary;
        ctx.beginPath();
        // rounded top
        ctx.arc(cx, cy - r * 0.15, r * 0.8, Math.PI, 0, false);
        // wavy bottom (tattered wisp)
        var baseY = cy + r * 0.7;
        var x0 = cx + r * 0.8;
        ctx.lineTo(x0, baseY - r * 0.15);
        var waves = 4;
        for (var i = 0; i < waves; i++) {
          var span = (r * 1.6) / waves;
          var xa = x0 - span * (i + 0.5);
          var xb = x0 - span * (i + 1);
          var dip = (i % 2 === 0) ? r * 0.25 : -r * 0.02;
          ctx.quadraticCurveTo(xa, baseY + dip, xb, baseY - r * 0.15);
        }
        ctx.closePath();
        ctx.fill();
        // hollow eyes
        ctx.shadowBlur = 0;
        ctx.fillStyle = t.secondary;
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.1, r * 0.16, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.3, cy - r * 0.1, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    // Artisan — gear/cog with a copper hub
    gear: function (ctx, t, cx, cy, s) {
      var r = s * 0.4;
      var teeth = 8;
      withCtx(ctx, function () {
        glow(ctx, t.primary, s * 0.14);
        ctx.fillStyle = t.primary;
        ctx.beginPath();
        for (var i = 0; i < teeth * 2; i++) {
          var ang = (Math.PI / teeth) * i;
          var rad = (i % 2 === 0) ? r : r * 0.72;
          var x = cx + Math.cos(ang) * rad;
          var y = cy + Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        // inner ring
        ctx.shadowBlur = 0;
        ctx.fillStyle = t.secondary;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // copper hub
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    // Oracle — all-seeing eye with radiant lashes
    eye: function (ctx, t, cx, cy, s) {
      var r = s * 0.42;
      withCtx(ctx, function () {
        // rays
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.03;
        ctx.shadowBlur = 0;
        for (var i = 0; i < 12; i++) {
          var a = (Math.PI * 2 / 12) * i;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
          ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05);
          ctx.stroke();
        }
        // eye almond
        glow(ctx, t.primary, s * 0.14);
        ctx.fillStyle = t.primary;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.9, cy);
        ctx.quadraticCurveTo(cx, cy - r * 0.7, cx + r * 0.9, cy);
        ctx.quadraticCurveTo(cx, cy + r * 0.7, cx - r * 0.9, cy);
        ctx.closePath();
        ctx.fill();
        // iris
        ctx.shadowBlur = 0;
        ctx.fillStyle = t.secondary;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
        ctx.fill();
        // pupil (gold)
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    // Street-Deity — haloed crown / radiant ring over an urban diamond
    halo: function (ctx, t, cx, cy, s) {
      var r = s * 0.4;
      withCtx(ctx, function () {
        // halo ring
        glow(ctx, t.accent, s * 0.18);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.07;
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.15, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // diamond body
        ctx.shadowBlur = s * 0.12;
        ctx.shadowColor = t.primary;
        ctx.fillStyle = t.primary;
        poly(ctx, [
          [cx, cy - r * 0.05],
          [cx + r * 0.55, cy + r * 0.45],
          [cx, cy + r * 0.95],
          [cx - r * 0.55, cy + r * 0.45]
        ]);
        ctx.fill();
        // crown spikes on top
        ctx.shadowBlur = 0;
        ctx.fillStyle = t.accent;
        poly(ctx, [
          [cx - r * 0.4, cy - r * 0.15],
          [cx - r * 0.25, cy - r * 0.55],
          [cx - r * 0.1, cy - r * 0.2],
          [cx, cy - r * 0.6],
          [cx + r * 0.1, cy - r * 0.2],
          [cx + r * 0.25, cy - r * 0.55],
          [cx + r * 0.4, cy - r * 0.15]
        ]);
        ctx.fill();
      });
    },

    // Gaia-Link — leaf inside a hex node (nature + network)
    leaf: function (ctx, t, cx, cy, s) {
      var r = s * 0.42;
      withCtx(ctx, function () {
        // hex node
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.045;
        glow(ctx, t.accent, s * 0.1);
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
          var a = Math.PI / 3 * i - Math.PI / 6;
          var x = cx + Math.cos(a) * r;
          var y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        // leaf
        ctx.shadowBlur = s * 0.12;
        ctx.shadowColor = t.primary;
        ctx.fillStyle = t.primary;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.65);
        ctx.quadraticCurveTo(cx + r * 0.6, cy - r * 0.1, cx, cy + r * 0.65);
        ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.1, cx, cy - r * 0.65);
        ctx.closePath();
        ctx.fill();
        // vein
        ctx.shadowBlur = 0;
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.03;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.6);
        ctx.lineTo(cx, cy + r * 0.6);
        ctx.stroke();
      });
    },

    // Psionic — brain-wave: a pulsing waveform arc
    brainwave: function (ctx, t, cx, cy, s) {
      var r = s * 0.42;
      withCtx(ctx, function () {
        // outer psi orb
        glow(ctx, t.primary, s * 0.14);
        ctx.strokeStyle = t.primary;
        ctx.lineWidth = s * 0.05;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        // waveform
        ctx.shadowColor = t.accent;
        ctx.shadowBlur = s * 0.12;
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.06;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        var x0 = cx - r * 0.75;
        var steps = 24;
        for (var i = 0; i <= steps; i++) {
          var px = x0 + (r * 1.5) * (i / steps);
          var phase = (i / steps) * Math.PI * 3;
          var amp = r * 0.4 * Math.sin(phase) * (0.5 + 0.5 * Math.sin(i * 0.9));
          var py = cy + amp;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      });
    },

    // Harvester — scythe blade + shaft
    scythe: function (ctx, t, cx, cy, s) {
      var r = s * 0.42;
      withCtx(ctx, function () {
        // shaft
        ctx.strokeStyle = t.secondary;
        ctx.lineWidth = s * 0.08;
        ctx.lineCap = 'round';
        glow(ctx, t.primary, s * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.45, cy - r * 0.8);
        ctx.lineTo(cx - r * 0.15, cy + r * 0.85);
        ctx.stroke();
        // blade (crescent)
        ctx.shadowColor = t.primary;
        ctx.shadowBlur = s * 0.14;
        ctx.fillStyle = t.primary;
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.45, cy - r * 0.8);
        ctx.quadraticCurveTo(cx - r * 0.95, cy - r * 0.95, cx - r * 0.7, cy - r * 0.05);
        ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 0.55, cx + r * 0.45, cy - r * 0.8);
        ctx.closePath();
        ctx.fill();
        // ember edge highlight
        ctx.shadowBlur = 0;
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = s * 0.03;
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.45, cy - r * 0.8);
        ctx.quadraticCurveTo(cx - r * 0.95, cy - r * 0.95, cx - r * 0.7, cy - r * 0.05);
        ctx.stroke();
      });
    }
  };

  function drawTeamCrest(ctx, id, cx, cy, size) {
    var t = getTeam(id);
    if (!t || !ctx) return;
    var fn = CRESTS[t.crest] || CRESTS.shield;
    fn(ctx, t, cx, cy, size);
  }

  /* -------------------------------------------------------------------------
   * JERSEY DRAWER — small torso swatch with the team's pattern.
   * ----------------------------------------------------------------------- */
  function roundRectPath(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // Torso silhouette path (shoulders + body). Origin is top-left of w x h box.
  function torsoPath(ctx, x, y, w, h) {
    var neck = w * 0.28;
    var sh = h * 0.18;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5 - neck / 2, y);           // left neck
    ctx.lineTo(x, y + sh);                            // left shoulder
    ctx.lineTo(x + w * 0.14, y + sh * 1.6);          // left sleeve
    ctx.lineTo(x + w * 0.22, y + sh);                // armpit-ish
    ctx.lineTo(x + w * 0.22, y + h);                 // left hem
    ctx.lineTo(x + w * 0.78, y + h);                 // right hem
    ctx.lineTo(x + w * 0.78, y + sh);
    ctx.lineTo(x + w * 0.86, y + sh * 1.6);          // right sleeve
    ctx.lineTo(x + w, y + sh);                        // right shoulder
    ctx.lineTo(x + w * 0.5 + neck / 2, y);           // right neck
    ctx.closePath();
  }

  var JERSEYS = {
    solid: function (ctx, t, x, y, w, h) {
      ctx.fillStyle = t.primary;
      ctx.fill();
    },
    stripes: function (ctx, t, x, y, w, h) {
      ctx.fillStyle = t.primary;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = t.secondary;
      var n = 5;
      var sw = w / (n * 2);
      for (var i = 0; i < n; i++) {
        ctx.fillRect(x + i * 2 * sw + sw, y, sw, h);
      }
      ctx.restore();
    },
    sash: function (ctx, t, x, y, w, h) {
      ctx.fillStyle = t.primary;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = t.accent;
      var band = w * 0.28;
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.15);
      ctx.lineTo(x + band, y + h * 0.15);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - band, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    chevron: function (ctx, t, x, y, w, h) {
      ctx.fillStyle = t.primary;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = t.secondary;
      ctx.lineWidth = h * 0.1;
      ctx.lineJoin = 'round';
      for (var k = 0; k < 3; k++) {
        var yy = y + h * (0.28 + k * 0.22);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, yy);
        ctx.lineTo(x + w * 0.5, yy + h * 0.14);
        ctx.lineTo(x + w * 0.8, yy);
        ctx.stroke();
      }
      ctx.restore();
    },
    gradient: function (ctx, t, x, y, w, h) {
      var g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, t.secondary);
      g.addColorStop(0.55, t.primary);
      g.addColorStop(1, t.accent);
      ctx.fillStyle = g;
      ctx.fill();
    },
    panel: function (ctx, t, x, y, w, h) {
      ctx.fillStyle = t.primary;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // right vertical panel in secondary, thin accent seam
      ctx.fillStyle = t.secondary;
      ctx.fillRect(x + w * 0.6, y, w * 0.4, h);
      ctx.fillStyle = t.accent;
      ctx.fillRect(x + w * 0.58, y, w * 0.03, h);
      ctx.restore();
    }
  };

  function drawJersey(ctx, id, cx, cy, w, h, number) {
    var t = getTeam(id);
    if (!t || !ctx) return;
    var x = cx - w / 2;
    var y = cy - h / 2;

    withCtx(ctx, function () {
      // soft team glow behind
      ctx.shadowColor = t.primary;
      ctx.shadowBlur = w * 0.18;

      // build torso path, fill via pattern fn (which expects current path)
      torsoPath(ctx, x, y, w, h);
      var pat = JERSEYS[t.jersey] || JERSEYS.solid;
      pat(ctx, t, x, y, w, h);

      // outline
      ctx.shadowBlur = 0;
      torsoPath(ctx, x, y, w, h);
      ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.strokeStyle = t.accent;
      ctx.stroke();

      // number
      if (number !== undefined && number !== null && number !== '') {
        ctx.fillStyle = t.accent;
        ctx.font = 'bold ' + (h * 0.42) + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = t.secondary;
        ctx.shadowBlur = w * 0.06;
        ctx.fillText(String(number), cx, y + h * 0.62);
      }
    });
  }

  /* -------------------------------------------------------------------------
   * EXPORTS
   * ----------------------------------------------------------------------- */
  global.SHADDAI_TEAMS = TEAMS;
  global.getTeam = getTeam;
  global.drawTeamCrest = drawTeamCrest;
  global.drawJersey = drawJersey;

  // CommonJS-friendly (harmless in browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SHADDAI_TEAMS: TEAMS, getTeam: getTeam, drawTeamCrest: drawTeamCrest, drawJersey: drawJersey };
  }

})(typeof window !== 'undefined' ? window : this);
