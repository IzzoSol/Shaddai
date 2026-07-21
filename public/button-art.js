/* ══════════════════════════════════════════════════════════════════
   SHADDAI — BUTTON ART  (button-art.js)
   Gives the Home quick-action buttons and the Media category buttons a
   FULL-COVER themed image (obsidian + emerald sacred-geometry, generated
   art in /assets/buttons/) with a dark scrim so the label stays readable.
   Matches buttons by their existing onclick — no HTML edits needed.
   Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__buttonArtV1) return; window.__buttonArtV1 = true;

  var MAP = {
    "showView('chat')": 'home-chat',
    "showView('workflow')": 'home-workflow',
    "showView('pipeline')": 'home-markets',
    "showView('marketplace')": 'home-marketplace',
    "showView('agents')": 'home-agents',
    "scrollToMediaCard('imageGen')": 'media-image',
    "scrollToMediaCard('videoStudio')": 'media-video',
    "scrollToMediaCard('audioMusic')": 'media-music',
    "scrollToMediaCard('elevenLabs')": 'media-voice',
    "scrollToMediaCard('mediaGallery')": 'media-gallery'
  };

  function css() {
    if (document.getElementById('shd-btnart-css')) return;
    var s = document.createElement('style'); s.id = 'shd-btnart-css';
    s.textContent =
      '.shd-btn-art{background-size:cover !important;background-position:center !important;position:relative !important;color:#fff !important;' +
      'border:1px solid rgba(0,229,160,.32) !important;text-shadow:0 1px 5px rgba(0,0,0,.95) !important;overflow:hidden !important;' +
      'min-height:84px !important;transition:filter .16s,border-color .16s,transform .16s !important}' +
      '.shd-btn-art::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,11,.22),rgba(4,6,11,.80));z-index:0;pointer-events:none}' +
      '.shd-btn-art > *{position:relative;z-index:1}' +
      '.shd-btn-art:hover{filter:brightness(1.14) !important;border-color:rgba(0,229,160,.7) !important;transform:translateY(-2px) !important;box-shadow:0 8px 22px rgba(0,0,0,.45) !important}' +
      '.shd-btn-art .mqa-icon,.shd-btn-art .ic{filter:drop-shadow(0 2px 4px rgba(0,0,0,.9))}';
    document.head.appendChild(s);
  }

  function apply() {
    css();
    // SCOPED: only the Home (#dashView) quick-actions and the Media view category
    // buttons — never the top nav / sidebar (they also use showView(...)).
    var scope = '#dashView button, #dashView [role="button"], #mediaView button, #mediaView [role="button"], #content-studioView button';
    document.querySelectorAll(scope).forEach(function (el) {
      if (el.getAttribute('data-btn-art-done')) return;
      var oc = (el.getAttribute('onclick') || '').replace(/\s+/g, '');
      for (var k in MAP) {
        if (oc.indexOf(k.replace(/\s+/g, '')) !== -1) {
          el.classList.add('shd-btn-art');
          el.style.backgroundImage = 'url(/assets/buttons/' + MAP[k] + '.png)';
          el.setAttribute('data-btn-art-done', '1');
          break;
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  // Re-apply after view switches / late-rendered buttons.
  [800, 2000, 4000].forEach(function (t) { setTimeout(apply, t); });
  document.addEventListener('click', function () { setTimeout(apply, 250); }, true);
})();
