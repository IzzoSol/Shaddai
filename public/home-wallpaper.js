/*!
 * SHADDAI Home Hub — Wallpaper System
 * Self-contained. Lets the user set a custom background wallpaper for
 * #shaddaiHome, persisted per-device via localStorage.
 *
 * Public API: window.SHADDAI_WALLPAPER = { apply, open }
 * Pairs with: home-wallpaper.css
 *
 * Does NOT edit index.html or the backend. Wires to an existing
 * <button id="hhWallpaperBtn"> inside #shaddaiHome.
 */
(function () {
  'use strict';

  // ---- Guard double-init -------------------------------------------------
  if (window.SHADDAI_WALLPAPER && window.__shdWallpaperInit) {
    return;
  }
  window.__shdWallpaperInit = true;

  // ---- Constants ---------------------------------------------------------
  var LS_KEY = 'shaddai_home_wallpaper';
  var LS_DIM = 'shaddai_home_wallpaper_dim';
  var DEFAULT_DIM = 45; // percent, 0-80
  var MAX_DIM = 80;
  var MODAL_ID = 'shdWallpaperModal';
  var SCRIM_ID = 'shdHomeScrim';

  // Theme-matched art (HF-generated) shown first, then general options.
  var THEME_ART = {
    glitch:   '/assets/ui/themes/glitch.jpg',
    terminal: '/assets/ui/themes/terminal.jpg',
    void:     '/assets/ui/themes/void.jpg',
    amber:    '/assets/ui/themes/amber.jpg'
  };
  var PRESETS = [
    { id: 'glitch',   label: 'Glitch',      url: '/assets/ui/themes/glitch.jpg' },
    { id: 'terminal', label: 'Terminal',    url: '/assets/ui/themes/terminal.jpg' },
    { id: 'void',     label: 'Void',        url: '/assets/ui/themes/void.jpg' },
    { id: 'amber',    label: 'Amber',       url: '/assets/ui/themes/amber.jpg' },
    { id: 'nebula',  label: 'Nebula',      url: '/assets/ui/bg-nebula.jpg' },
    { id: 'grid',    label: 'Glow Grid',   url: '/assets/ui/glow-grid.jpg' },
    { id: 'forge',   label: 'Forge',       url: '/assets/ui/forge-bg.jpg' },
    { id: 'orb',     label: 'Hero Orb',    url: '/assets/ui/hero-orb.jpg' }
  ];

  function currentSkin() {
    try { return document.documentElement.getAttribute('data-theme-skin') || 'glitch'; }
    catch (e) { return 'glitch'; }
  }
  function themeArtUrl() { return THEME_ART[currentSkin()] || THEME_ART.glitch; }
  // Is the saved wallpaper one of the auto theme-art images (vs a user upload)?
  function isThemeArt(v) {
    if (!v) return true;
    for (var k in THEME_ART) { if (THEME_ART[k] === v) return true; }
    return false;
  }

  // ---- Small safe helpers ------------------------------------------------
  function $(sel, root) {
    try { return (root || document).querySelector(sel); } catch (e) { return null; }
  }
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') { node.textContent = attrs[k]; }
        else if (k === 'html') { node.innerHTML = attrs[k]; }
        else if (k === 'style') { node.setAttribute('style', attrs[k]); }
        else { node.setAttribute(k, attrs[k]); }
      });
    }
    (kids || []).forEach(function (c) { if (c) { node.appendChild(c); } });
    return node;
  }
  function lsGet(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* quota / disabled */ }
  }
  function clampDim(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) { n = DEFAULT_DIM; }
    if (n < 0) { n = 0; }
    if (n > MAX_DIM) { n = MAX_DIM; }
    return n;
  }
  function getHome() { return $('#shaddaiHome'); }

  // ---- Core: apply wallpaper --------------------------------------------
  // value: url/dataURL string, or 'none'
  function apply(value, dim) {
    var home = getHome();
    if (!home) { return; }

    var wp = (value === null || value === undefined) ? lsGet(LS_KEY, 'none') : value;
    var d  = clampDim(dim === undefined ? lsGet(LS_DIM, DEFAULT_DIM) : dim);

    try {
      home.classList.add('shd-has-wallpaper');

      if (!wp || wp === 'none') {
        home.style.backgroundImage = '';
        home.classList.remove('shd-wp-active');
      } else {
        // Safe CSS url() — escape backslashes and quotes.
        var safe = String(wp).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        home.style.backgroundImage = 'url("' + safe + '")';
        home.style.backgroundSize = 'cover';
        home.style.backgroundPosition = 'center center';
        home.style.backgroundRepeat = 'no-repeat';
        home.style.backgroundAttachment = 'local';
        home.classList.add('shd-wp-active');
      }

      // Scrim child (kept below tiles via CSS). Managed dedicated element.
      var scrim = $('#' + SCRIM_ID, home);
      if (!scrim) {
        scrim = el('div', { id: SCRIM_ID, 'aria-hidden': 'true' });
        // Insert as first child so tiles paint above it.
        if (home.firstChild) { home.insertBefore(scrim, home.firstChild); }
        else { home.appendChild(scrim); }
      }
      var alpha = (d / 100).toFixed(3);
      scrim.style.opacity = (!wp || wp === 'none') ? '0' : '1';
      // Readability gradient: darker at edges/bottom, keeps center airy.
      scrim.style.background =
        'linear-gradient(180deg, rgba(0,0,0,' + (alpha * 0.65) + ') 0%, ' +
        'rgba(0,0,0,' + alpha + ') 55%, rgba(0,0,0,' + (alpha * 1.1 > 1 ? 1 : alpha * 1.1) + ') 100%)';
    } catch (e) {
      // Never throw.
    }

    // Persist.
    lsSet(LS_KEY, (!wp) ? 'none' : String(wp));
    lsSet(LS_DIM, String(d));
  }

  // ---- Picker modal ------------------------------------------------------
  var modalRef = null;

  function currentValue() { return lsGet(LS_KEY, 'none'); }
  function currentDim() { return clampDim(lsGet(LS_DIM, DEFAULT_DIM)); }

  function markSelected(root, value) {
    if (!root) { return; }
    var thumbs = root.querySelectorAll('[data-wp-value]');
    for (var i = 0; i < thumbs.length; i++) {
      var v = thumbs[i].getAttribute('data-wp-value');
      if (v === value) { thumbs[i].classList.add('shd-wp-sel'); }
      else { thumbs[i].classList.remove('shd-wp-sel'); }
    }
  }

  function buildModal() {
    if (modalRef && document.body.contains(modalRef)) { return modalRef; }

    var overlay = el('div', { id: MODAL_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose wallpaper' });

    var panel = el('div', { class: 'shd-wp-panel' });

    // Header
    var header = el('div', { class: 'shd-wp-head' }, [
      el('span', { class: 'shd-wp-title', text: 'HOME WALLPAPER' }),
      el('button', { class: 'shd-wp-x', type: 'button', 'aria-label': 'Close', text: '✕' })
    ]);

    // Preset grid
    var grid = el('div', { class: 'shd-wp-grid' });

    // "None" option
    var noneThumb = el('button', {
      type: 'button', class: 'shd-wp-thumb shd-wp-none', 'data-wp-value': 'none',
      title: 'None (solid background)'
    }, [ el('span', { class: 'shd-wp-thumb-label', text: 'None' }) ]);
    grid.appendChild(noneThumb);

    PRESETS.forEach(function (p) {
      var t = el('button', {
        type: 'button', class: 'shd-wp-thumb', 'data-wp-value': p.url, title: p.label,
        style: 'background-image:url("' + p.url + '")'
      }, [ el('span', { class: 'shd-wp-thumb-label', text: p.label }) ]);
      grid.appendChild(t);
    });

    // (Custom URL input removed by request — avoids the security surface of
    //  loading arbitrary external image URLs. Presets + local upload only.)

    // Upload row
    var fileInput = el('input', { type: 'file', accept: 'image/*', class: 'shd-wp-file', 'aria-label': 'Upload image' });
    var uploadRow = el('div', { class: 'shd-wp-row' }, [
      el('label', { class: 'shd-wp-lbl', text: 'Upload image' }),
      fileInput
    ]);

    // Dim slider row
    var dimVal = el('span', { class: 'shd-wp-dimval', text: currentDim() + '%' });
    var dimSlider = el('input', {
      type: 'range', min: '0', max: String(MAX_DIM), step: '1',
      value: String(currentDim()), class: 'shd-wp-range', 'aria-label': 'Dim overlay'
    });
    var dimRow = el('div', { class: 'shd-wp-row' }, [
      el('label', { class: 'shd-wp-lbl' }, [ document.createTextNode('Dim '), dimVal ]),
      dimSlider
    ]);

    // Footer
    var footer = el('div', { class: 'shd-wp-foot' }, [
      el('button', { type: 'button', class: 'shd-wp-btn shd-wp-close2', text: 'Done' })
    ]);

    panel.appendChild(header);
    panel.appendChild(grid);
    panel.appendChild(uploadRow);
    panel.appendChild(dimRow);
    panel.appendChild(footer);
    overlay.appendChild(panel);

    // ---- Wire events -----------------------------------------------------
    function close() {
      overlay.classList.remove('shd-wp-open');
      try { document.removeEventListener('keydown', onKey); } catch (e) {}
    }
    function onKey(ev) { if (ev.key === 'Escape') { close(); } }

    header.querySelector('.shd-wp-x').addEventListener('click', close);
    footer.querySelector('.shd-wp-close2').addEventListener('click', close);
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) { close(); }
    });

    // Thumb clicks (delegate)
    grid.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== grid && !t.hasAttribute('data-wp-value')) { t = t.parentNode; }
      if (!t || t === grid) { return; }
      var val = t.getAttribute('data-wp-value');
      apply(val, dimSlider.value);
      markSelected(overlay, val);
    });

    fileInput.addEventListener('change', function () {
      try {
        var f = fileInput.files && fileInput.files[0];
        if (!f) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var dataURL = reader.result;
            if (dataURL) { apply(dataURL, dimSlider.value); markSelected(overlay, dataURL); }
          } catch (e) {}
        };
        reader.onerror = function () { /* ignore */ };
        reader.readAsDataURL(f);
      } catch (e) {}
    });

    dimSlider.addEventListener('input', function () {
      var d = clampDim(dimSlider.value);
      dimVal.textContent = d + '%';
      // Re-apply current wallpaper with new dim (live preview).
      apply(currentValue(), d);
    });

    overlay._shdClose = close;
    overlay._shdOnKey = onKey;

    document.body.appendChild(overlay);
    modalRef = overlay;
    return overlay;
  }

  function open() {
    var overlay = buildModal();
    if (!overlay) { return; }
    // Sync UI state to persisted values.
    var slider = overlay.querySelector('.shd-wp-range');
    var dimVal = overlay.querySelector('.shd-wp-dimval');
    if (slider) { slider.value = String(currentDim()); }
    if (dimVal) { dimVal.textContent = currentDim() + '%'; }
    markSelected(overlay, currentValue());
    overlay.classList.add('shd-wp-open');
    try { document.addEventListener('keydown', overlay._shdOnKey); } catch (e) {}
  }

  // ---- Wire the button (poll up to ~6s) ---------------------------------
  function wireButton() {
    var tries = 0;
    var max = 60; // 60 * 100ms = 6s
    var timer = setInterval(function () {
      tries++;
      var btn = $('#hhWallpaperBtn');
      if (btn) {
        clearInterval(timer);
        if (!btn.__shdWired) {
          btn.__shdWired = true;
          btn.addEventListener('click', function (ev) {
            try { ev.preventDefault(); } catch (e) {}
            open();
          });
        }
      } else if (tries >= max) {
        clearInterval(timer);
      }
    }, 100);
  }

  // ---- Restore saved wallpaper on load (poll for #shaddaiHome) -----------
  function restore() {
    var tries = 0;
    var max = 60;
    var timer = setInterval(function () {
      tries++;
      if (getHome()) {
        clearInterval(timer);
        var saved = null;
        try { saved = window.localStorage.getItem(LS_KEY); } catch (e) {}
        if (saved === null || saved === undefined || isThemeArt(saved)) {
          // No custom pick (or an auto theme-art) → show THIS theme's matching art.
          apply(themeArtUrl(), currentDim());
        } else {
          apply(); // user's custom upload — keep it
        }
      } else if (tries >= max) {
        clearInterval(timer);
      }
    }, 100);
  }

  // ---- Auto-switch wallpaper to match the active theme ------------------
  function watchTheme() {
    try {
      var last = currentSkin();
      var obs = new MutationObserver(function () {
        var now = currentSkin();
        if (now === last) return;
        last = now;
        // Only auto-swap when the current wallpaper is theme-art (not a custom upload).
        var saved = null;
        try { saved = window.localStorage.getItem(LS_KEY); } catch (e) {}
        if (isThemeArt(saved)) { apply(themeArtUrl(), currentDim()); }
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-skin'] });
    } catch (e) { /* ignore */ }
  }

  function init() {
    try { restore(); wireButton(); watchTheme(); } catch (e) { /* never throw */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Expose API --------------------------------------------------------
  window.SHADDAI_WALLPAPER = { apply: apply, open: open };
})();
