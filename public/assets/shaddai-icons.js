/* =============================================================================
 * SHADDAI ICON SET  —  hand-crafted holographic HUD glyphs
 * Design lead: TURTLE (SHADDAI council)
 * -----------------------------------------------------------------------------
 * Zero external requests. Zero API keys. Zero data: URIs. Pure inline SVG.
 * Every glyph is a 24x24 viewBox, stroke-based, and themes via `currentColor`
 * plus the SHADDAI neon palette (electric green + cyan). Set the CSS `color`
 * of the parent element to recolor the base stroke; accent strokes carry the
 * neon cyan/green so glyphs glow cleanly on dark backgrounds.
 *
 * USAGE
 * -----
 *   <script src="/assets/shaddai-icons.js"></script>
 *
 *   // Raw SVG string for a key:
 *   el.innerHTML = window.SHADDAI_ICONS.agents;
 *
 *   // Helper (recommended) — size + color overrides:
 *   el.innerHTML = window.shaddaiIcon('forge', { size: 20, color: '#39FF14' });
 *   el.innerHTML = window.shaddaiIcon('shaddai');              // defaults
 *
 *   // For a soft neon glow, add this once in your CSS:
 *   //   .shaddai-icon { filter: drop-shadow(0 0 3px currentColor); }
 *
 * OPTIONS (shaddaiIcon(key, opts))
 *   size   : number|string  -> width & height (default 24)
 *   color  : string         -> overrides base stroke `currentColor`
 *   glow   : boolean        -> adds a drop-shadow filter inline (default false)
 *   class  : string         -> extra class on the root <svg>
 *   stroke : number         -> base stroke-width (default 1.6)
 * ========================================================================== */
(function (root) {
  'use strict';

  // SHADDAI neon palette (accent strokes live inside the glyphs)
  var NEON_GREEN = '#39FF14';
  var NEON_CYAN  = '#00E5FF';

  // Every value is the *inner* markup of a 0 0 24 24 SVG. The wrapper <svg>
  // (with sizing/color) is applied by shaddaiIcon(); SHADDAI_ICONS also exposes
  // full <svg>…</svg> strings for drop-in innerHTML use.
  var BODY = {

    /* ---- THE 7 AGENTS ---------------------------------------------------- */

    // SHADDAI — supreme crown + all-seeing eye (authority)
    shaddai:
      '<path d="M4 15l1.6-7 4 4L12 5l2.4 7 4-4L20 15z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M4.6 18h14.8" stroke="' + NEON_GREEN + '"/>' +
      '<circle cx="12" cy="11" r="1.5" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M9 11c1-1.6 5-1.6 6 0" stroke="' + NEON_CYAN + '"/>',

    // ZEROX — crossed katana / wealth blade
    zerox:
      '<path d="M4 20L18 6" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M15.5 3.5L20 8l-2 2-4.5-4.5z" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M6.5 17.5l-2.5 .8.8-2.5" stroke="currentColor"/>' +
      '<path d="M9 12l3 3" stroke="' + NEON_GREEN + '"/>',

    // ORACLE — all-seeing eye of wisdom, radiant iris
    oracle:
      '<path d="M2.5 12C5 7.5 9 5.5 12 5.5s7 2 9.5 6.5C19 16.5 15 18.5 12 18.5S5 16.5 2.5 12z" stroke="currentColor"/>' +
      '<circle cx="12" cy="12" r="3" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="12" cy="12" r="1" fill="' + NEON_GREEN + '" stroke="none"/>',

    // NEXUS — router network of nodes
    nexus:
      '<circle cx="12" cy="5" r="1.8" stroke="' + NEON_GREEN + '"/>' +
      '<circle cx="5" cy="17" r="1.8" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="19" cy="17" r="1.8" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="12" cy="13" r="1.6" stroke="currentColor"/>' +
      '<path d="M12 6.8v4.4M10.7 14.1L6.3 15.8M13.3 14.1l4.4 1.7" stroke="currentColor"/>',

    // TURTLE — hex shell of creation
    turtle:
      '<path d="M12 3.5l7 4v9l-7 4-7-4v-9z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M12 7.5l3.4 2v4l-3.4 2-3.4-2v-4z" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M12 3.5v4M12 15.5v4M5 7.5l3.6 2M19 7.5l-3.6 2" stroke="currentColor"/>',

    // QUILL — feather pen over a scroll line
    quill:
      '<path d="M5 19c6-1 9-4 12-13-6 2-10 5-12 13z" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M8 16c2-3 4-5 7-7" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M4 20h6" stroke="currentColor"/>',

    // PIKADON — shield with a lightning lock (security)
    pikadon:
      '<path d="M12 3l7 2.5v5c0 5-3 8-7 9.5-4-1.5-7-4.5-7-9.5v-5z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M13 8l-3 4h2.5l-1.5 3.5" stroke="' + NEON_CYAN + '"/>',

    /* ---- NAV / TAB ICONS ------------------------------------------------- */

    // agents — roster of operatives
    agents:
      '<circle cx="9" cy="9" r="3" stroke="currentColor"/>' +
      '<circle cx="16.5" cy="10" r="2.2" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M4 19c.5-3 3-4.5 5-4.5s4.5 1.5 5 4.5" stroke="currentColor"/>' +
      '<path d="M14.5 19c.3-2 1.7-3 3-3s2.7 1 3 3" stroke="' + NEON_CYAN + '"/>',

    // skills — branching skill tree / nodes
    skills:
      '<path d="M12 4v5" stroke="currentColor"/>' +
      '<circle cx="12" cy="3.5" r="1.5" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M12 9L6 13v4M12 9l6 4v4" stroke="currentColor"/>' +
      '<circle cx="6" cy="18" r="1.5" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="18" cy="18" r="1.5" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="12" cy="13" r="1.3" stroke="' + NEON_GREEN + '"/>',

    // forge — anvil + spark
    forge:
      '<path d="M4 13h9l3-3 3 1-3 4H4z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M7 17v2h6v-2" stroke="currentColor"/>' +
      '<path d="M14 6l1.5 2M17 5l1 2" stroke="' + NEON_CYAN + '"/>',

    // rooms — command-deck grid of chambers
    rooms:
      '<rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor"/>' +
      '<rect x="13" y="4" width="7" height="7" rx="1" stroke="' + NEON_CYAN + '"/>' +
      '<rect x="4" y="13" width="7" height="7" rx="1" stroke="' + NEON_CYAN + '"/>' +
      '<rect x="13" y="13" width="7" height="7" rx="1" stroke="' + NEON_GREEN + '"/>',

    // world — holographic globe with orbit ring
    world:
      '<circle cx="12" cy="12" r="8" stroke="currentColor"/>' +
      '<path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" stroke="' + NEON_CYAN + '"/>' +
      '<ellipse cx="12" cy="12" rx="9.5" ry="3.4" stroke="' + NEON_GREEN + '"/>',

    // billing — credit card with neon strip
    billing:
      '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor"/>' +
      '<path d="M3 10h18" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M6.5 14.5h4" stroke="' + NEON_CYAN + '"/>',

    // aura — pulsing energy sigil (token-saver)
    aura:
      '<circle cx="12" cy="12" r="3" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" stroke="currentColor"/>',

    // media — play frame / studio
    media:
      '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor"/>' +
      '<path d="M10 9.5l4.5 2.5-4.5 2.5z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M3 9h3M18 9h3" stroke="' + NEON_CYAN + '"/>',

    // social — broadcast / share nodes
    social:
      '<circle cx="17" cy="6" r="2" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="6" cy="12" r="2" stroke="currentColor"/>' +
      '<circle cx="17" cy="18" r="2" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M7.7 11l7.6-3.8M7.7 13l7.6 3.8" stroke="currentColor"/>',

    // workflow — chained flow steps
    workflow:
      '<rect x="3" y="4" width="6" height="4" rx="1" stroke="' + NEON_CYAN + '"/>' +
      '<rect x="15" y="10" width="6" height="4" rx="1" stroke="' + NEON_GREEN + '"/>' +
      '<rect x="3" y="16" width="6" height="4" rx="1" stroke="currentColor"/>' +
      '<path d="M9 6h4a2 2 0 012 2v2M9 18h4a2 2 0 002-2v0" stroke="currentColor"/>',

    // office — HUD workstation
    office:
      '<rect x="3" y="5" width="18" height="11" rx="1.5" stroke="currentColor"/>' +
      '<path d="M8 19h8M12 16v3" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M6.5 12l2-3 2 2 2.5-3.5L16 12" stroke="' + NEON_GREEN + '"/>',

    // calendar — scheduler grid
    calendar:
      '<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor"/>' +
      '<path d="M4 9h16M8 3v4M16 3v4" stroke="' + NEON_CYAN + '"/>' +
      '<rect x="7" y="12" width="3" height="3" rx="0.5" stroke="' + NEON_GREEN + '"/>',

    // projects — layered stacks
    projects:
      '<path d="M12 4l8 4-8 4-8-4z" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M4 12l8 4 8-4" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M4 16l8 4 8-4" stroke="currentColor"/>',

    // collectables — faceted gem
    collectables:
      '<path d="M7 4h10l4 5-9 11L3 9z" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M3 9h18M7 4l5 5 5-5M12 9v11" stroke="' + NEON_GREEN + '"/>',

    // mission-control — targeting reticle
    'mission-control':
      '<circle cx="12" cy="12" r="7" stroke="currentColor"/>' +
      '<circle cx="12" cy="12" r="2.5" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="' + NEON_CYAN + '"/>',

    // news — feed / broadcast page
    news:
      '<rect x="4" y="5" width="14" height="14" rx="1.5" stroke="currentColor"/>' +
      '<path d="M18 8h2v9a2 2 0 01-2 2" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M7 9h6M7 12h8M7 15h5" stroke="' + NEON_GREEN + '"/>',

    // simple-mode — minimal toggle (mobile lite)
    'simple-mode':
      '<rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor"/>' +
      '<circle cx="16" cy="12" r="2.5" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M7 12h3" stroke="' + NEON_CYAN + '"/>',

    /* ---- UI ACTION ICONS ------------------------------------------------- */

    // deploy — rocket launch
    deploy:
      '<path d="M12 3c3 2 4.5 5 4 9l-4 3-4-3c-.5-4 1-7 4-9z" stroke="' + NEON_GREEN + '"/>' +
      '<circle cx="12" cy="9" r="1.4" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M9 17l-2 3M15 17l2 3M12 15v5" stroke="currentColor"/>',

    // connect — link plug
    connect:
      '<path d="M9 15l-2 2a3 3 0 01-4-4l3-3a3 3 0 014 0" stroke="currentColor"/>' +
      '<path d="M15 9l2-2a3 3 0 014 4l-3 3a3 3 0 01-4 0" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M9.5 14.5l5-5" stroke="' + NEON_GREEN + '"/>',

    // delete — trash with slash accent
    delete:
      '<path d="M5 7h14M8 7V5h8v2M6.5 7l1 12h9l1-12" stroke="currentColor"/>' +
      '<path d="M10 10.5v5M14 10.5v5" stroke="' + NEON_GREEN + '"/>',

    // minimize — collapse
    minimize:
      '<path d="M5 12h14" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M8 8l4 3 4-3" stroke="currentColor"/>',

    // drag — move handle
    drag:
      '<circle cx="9" cy="6" r="1.1" fill="' + NEON_GREEN + '" stroke="none"/>' +
      '<circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="12" r="1.1" fill="' + NEON_CYAN + '" stroke="none"/>' +
      '<circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="18" r="1.1" fill="' + NEON_GREEN + '" stroke="none"/>',

    // zoom-in
    'zoom-in':
      '<circle cx="11" cy="11" r="6" stroke="currentColor"/>' +
      '<path d="M15.5 15.5L20 20" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M11 8.5v5M8.5 11h5" stroke="' + NEON_GREEN + '"/>',

    // zoom-out
    'zoom-out':
      '<circle cx="11" cy="11" r="6" stroke="currentColor"/>' +
      '<path d="M15.5 15.5L20 20" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M8.5 11h5" stroke="' + NEON_GREEN + '"/>',

    // play / animate — triggered motion
    play:
      '<circle cx="12" cy="12" r="8.5" stroke="currentColor"/>' +
      '<path d="M10 8.5l6 3.5-6 3.5z" stroke="' + NEON_GREEN + '"/>',

    // save — disk with neon shutter
    save:
      '<path d="M5 5h11l3 3v11H5z" stroke="currentColor"/>' +
      '<path d="M8 5v4h6V5" stroke="' + NEON_CYAN + '"/>' +
      '<rect x="9" y="12" width="6" height="4" rx="0.5" stroke="' + NEON_GREEN + '"/>',

    // download — inbound arrow to tray
    download:
      '<path d="M12 4v9" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M8 10l4 4 4-4" stroke="currentColor"/>' +
      '<path d="M5 18h14" stroke="' + NEON_CYAN + '"/>',

    // note — sticky memo
    note:
      '<path d="M5 4h14v10l-5 5H5z" stroke="currentColor"/>' +
      '<path d="M14 19v-5h5" stroke="' + NEON_CYAN + '"/>' +
      '<path d="M8 8h8M8 11h5" stroke="' + NEON_GREEN + '"/>',

    // gallery — stacked image frames
    gallery:
      '<rect x="6" y="6" width="14" height="12" rx="1.5" stroke="currentColor"/>' +
      '<path d="M3 8v11a1 1 0 001 1h13" stroke="' + NEON_CYAN + '"/>' +
      '<circle cx="10.5" cy="10.5" r="1.3" stroke="' + NEON_GREEN + '"/>' +
      '<path d="M8 16l3.5-3 3 2.5 2-1.5 3 2" stroke="' + NEON_GREEN + '"/>'
  };

  // Shared attributes applied to every wrapper <svg>.
  function wrap(inner, opts) {
    opts = opts || {};
    var size   = opts.size != null ? opts.size : 24;
    var sw     = opts.stroke != null ? opts.stroke : 1.6;
    var color  = opts.color || 'currentColor';
    var cls    = 'shaddai-icon' + (opts.class ? ' ' + opts.class : '');
    var glow   = opts.glow ? ' style="filter:drop-shadow(0 0 3px currentColor)"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + cls + '"' + glow +
      ' width="' + size + '" height="' + size + '" viewBox="0 0 24 24"' +
      ' fill="none" color="' + color + '" stroke="' + color + '"' +
      ' stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  // Public helper.
  function shaddaiIcon(key, opts) {
    var inner = BODY[key];
    if (inner == null) {
      // graceful fallback: a neon question glyph, never throws
      inner = '<circle cx="12" cy="12" r="8.5" stroke="' + NEON_CYAN + '"/>' +
              '<path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-1 .5-1 1-1 2" stroke="currentColor"/>' +
              '<circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>';
    }
    return wrap(inner, opts);
  }

  // Pre-built full-<svg> map for direct innerHTML use (default styling).
  var SHADDAI_ICONS = {};
  for (var k in BODY) {
    if (Object.prototype.hasOwnProperty.call(BODY, k)) {
      SHADDAI_ICONS[k] = wrap(BODY[k], {});
    }
  }

  // Attach globals.
  root.SHADDAI_ICONS = SHADDAI_ICONS;
  root.SHADDAI_ICON_BODY = BODY;      // raw inner markup, if you need it
  root.shaddaiIcon = shaddaiIcon;
  root.SHADDAI_ICON_KEYS = Object.keys(BODY);

  // UMD-lite: also support module environments (harmless in the browser).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SHADDAI_ICONS: SHADDAI_ICONS, shaddaiIcon: shaddaiIcon, BODY: BODY };
  }
})(typeof window !== 'undefined' ? window : this);
