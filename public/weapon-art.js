/* ══════════════════════════════════════════════════════════════════
   SHADDAI — weapon-art.js
   Code-drawn PIXEL weapon/tool sprites for the hotbar/backpack/store
   (replaces the flat emoji icons). Pure canvas, no assets. Cached as
   data-URLs so the hotbar can drop them into <img> without re-drawing.
     WeaponArt.dataURL(id, px=34) -> data URL (or '' if no art for id)
     WeaponArt.has(id) -> bool
     WeaponArt.iconHTML(id, px, fallbackEmoji) -> <img …> or emoji span
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var GRID = 16;                  // logical pixel grid the sprites are drawn on
  var cache = {};

  // p(ctx,scale,x,y,w,h,color) — fill a block of logical pixels.
  function P(c, s, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * s, y * s, w * s, h * s); }

  // Each drawer paints on a GRID×GRID logical canvas (scaled by s).
  var ART = {
    sword: function (c, s) {                                   // steel blade, gold guard
      P(c, s, 7, 1, 2, 9, '#dfe7f0'); P(c, s, 8, 1, 1, 9, '#aeb9c8');   // blade + shade
      P(c, s, 7, 1, 2, 1, '#ffffff');                                    // tip glint
      P(c, s, 5, 10, 6, 1, '#e8c45c'); P(c, s, 5, 11, 6, 1, '#b8912e');  // crossguard
      P(c, s, 7, 11, 2, 3, '#7a5a2a');                                   // grip
      P(c, s, 6, 14, 4, 1, '#e8c45c');                                   // pommel
    },
    axe: function (c, s) {                                     // battle axe
      P(c, s, 8, 2, 1, 12, '#6a4a2a'); P(c, s, 9, 2, 1, 12, '#4a3018');  // haft
      P(c, s, 3, 2, 6, 5, '#c9d2dc'); P(c, s, 3, 2, 6, 1, '#eef3f8'); // head
      P(c, s, 2, 3, 2, 3, '#c9d2dc'); P(c, s, 3, 6, 5, 1, '#8f9aa8');    // blade curve + shade
      P(c, s, 8, 6, 3, 4, '#c9d2dc');                                     // back spike side
    },
    bow: function (c, s) {                                     // wooden bow + arrow
      P(c, s, 4, 2, 1, 12, '#8a5a2a'); P(c, s, 5, 1, 1, 2, '#8a5a2a'); P(c, s, 5, 13, 1, 2, '#8a5a2a');
      P(c, s, 3, 3, 1, 10, '#a06a34');                                    // limb highlight
      P(c, s, 6, 2, 1, 12, '#e8e0d0');                                    // string
      P(c, s, 6, 7, 9, 1, '#cfd6e0'); P(c, s, 13, 6, 2, 3, '#ff6a4a');    // arrow + head
      P(c, s, 6, 6, 1, 3, '#f0a83a');                                     // fletching
    },
    shield: function (c, s) {                                  // kite shield + emblem
      P(c, s, 4, 2, 8, 8, '#3a6ea5'); P(c, s, 4, 2, 8, 1, '#6fa0d8');
      P(c, s, 5, 10, 6, 2, '#3a6ea5'); P(c, s, 6, 12, 4, 2, '#2c527c');
      P(c, s, 4, 2, 1, 9, '#6fa0d8'); P(c, s, 11, 2, 1, 9, '#2c527c');
      P(c, s, 7, 4, 2, 6, '#e8c45c'); P(c, s, 6, 5, 4, 2, '#e8c45c');     // gold cross
    },
    staff: function (c, s) {                                   // neon staff + orb
      P(c, s, 7, 5, 2, 10, '#5a4030'); P(c, s, 8, 5, 1, 10, '#3a2818');   // pole
      P(c, s, 6, 1, 4, 4, '#00e5a0'); P(c, s, 7, 0, 2, 6, '#00ffb0');     // orb glow
      P(c, s, 5, 2, 1, 2, '#00ffb0'); P(c, s, 10, 2, 1, 2, '#00ffb0');    // spark arms
      P(c, s, 7, 2, 2, 1, '#eafff5');                                     // orb shine
    },
    pick: function (c, s) {                                    // pickaxe
      P(c, s, 8, 3, 1, 11, '#6a4a2a'); P(c, s, 9, 3, 1, 11, '#4a3018');   // handle
      P(c, s, 3, 3, 11, 1, '#9aa4b0'); P(c, s, 2, 4, 2, 1, '#9aa4b0'); P(c, s, 13, 4, 2, 1, '#9aa4b0'); // head
      P(c, s, 3, 2, 11, 1, '#c2ccd6');                                    // head highlight
    },
    rod: function (c, s) {                                     // fishing rod
      P(c, s, 3, 13, 10, 1, '#b06a34'); P(c, s, 12, 2, 1, 12, '#c98a4a'); // handle→tip
      P(c, s, 12, 2, 3, 1, '#c98a4a');                                    // tip bend
      P(c, s, 14, 2, 1, 7, '#cfd6e0');                                    // line
      P(c, s, 13, 9, 3, 2, '#e8c45c');                                    // hook/bob
    },
    potion: function (c, s) {                                  // health potion
      P(c, s, 6, 2, 4, 1, '#cfd6e0'); P(c, s, 7, 3, 2, 2, '#aeb9c8');     // cork+neck
      P(c, s, 5, 5, 6, 8, '#7a2030'); P(c, s, 5, 7, 6, 6, '#e0344a');     // glass + liquid
      P(c, s, 6, 8, 2, 4, '#ff8a9a');                                     // shine
      P(c, s, 5, 12, 6, 1, '#5a1020');
    },
    lantern: function (c, s) {                                 // lantern
      P(c, s, 7, 1, 2, 2, '#8a6a2a');                                     // ring
      P(c, s, 5, 3, 6, 9, '#3a2f1a'); P(c, s, 6, 4, 4, 7, '#ffcf5a');     // frame + glow
      P(c, s, 7, 5, 2, 4, '#fff2b0');                                     // flame core
      P(c, s, 5, 12, 6, 1, '#8a6a2a');
    }
  };
  // shared aliases for tool ids the game uses
  ART.hide = null; // (materials keep emoji)

  function render(id, px) {
    var drawer = ART[id]; if (!drawer) return '';
    var key = id + '@' + px;
    if (cache[key]) return cache[key];
    var cv = document.createElement('canvas'); cv.width = px; cv.height = px;
    var c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    drawer(c, px / GRID);
    var url = cv.toDataURL('image/png');
    cache[key] = url; return url;
  }

  window.WeaponArt = {
    has: function (id) { return !!ART[id]; },
    dataURL: function (id, px) { return render(id, px || 34); },
    iconHTML: function (id, px, fallbackEmoji) {
      px = px || 30;
      var url = render(id, px * 2);   // 2× for crispness, CSS scales down
      if (url) return '<img class="wico" src="' + url + '" alt="" style="width:' + px + 'px;height:' + px + 'px;image-rendering:pixelated;vertical-align:middle" draggable="false">';
      return '<span>' + (fallbackEmoji || '📦') + '</span>';
    }
  };
})();
