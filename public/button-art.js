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
      'border:1px solid rgba(0,229,160,.3) !important;overflow:hidden !important;border-radius:13px !important;' +
      'min-height:104px !important;transition:filter .18s,border-color .18s,transform .18s,box-shadow .18s !important}' +
      // image visible up top; a dark plate anchored at the bottom keeps the label crisp
      '.shd-btn-art::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,11,.02) 34%,rgba(4,6,11,.52) 72%,rgba(4,6,11,.9));z-index:0;pointer-events:none}' +
      '.shd-btn-art > *{position:relative;z-index:1}' +
      '.shd-btn-art *{text-shadow:0 2px 7px rgba(0,0,0,.96) !important}' +
      '.shd-btn-art .mqa-label{font-weight:800 !important;letter-spacing:.02em !important;font-size:12.5px !important}' +
      '.shd-btn-art .mqa-icon,.shd-btn-art .ic{filter:drop-shadow(0 2px 6px rgba(0,0,0,.95));font-size:21px !important}' +
      '.shd-btn-art:hover{filter:brightness(1.16) saturate(1.08) !important;border-color:rgba(0,229,160,.8) !important;transform:translateY(-3px) !important;box-shadow:0 12px 28px rgba(0,0,0,.52),0 0 22px rgba(0,229,160,.28) !important}';
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
          el.style.backgroundImage = 'url(/assets/buttons/' + MAP[k] + '.png?v=2)';
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
