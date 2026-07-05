/* ============================================================================
   forge-tab.js  —  "◇ CHOOSE YOUR MODEL" upgrade for the SHADDAI Agent Forge
   ----------------------------------------------------------------------------
   Additive, self-wiring, null-safe. Injects a selectable model-card grid at the
   TOP of #operatorForge and a prominent "⚙ TOOLS" header above #ofSkills.
   REUSES the existing real backend wiring by programmatically clicking the
   matching `.of-preset[data-archetype="..."]` button. Never edits index.html.
   ============================================================================ */
(function () {
  'use strict';

  // 7 agents in council order. glb:true => a 3D model exists on the server.
  var AGENTS = [
    { key: 'shaddai', name: 'SHADDAI', glb: true  },
    { key: 'nexus',   name: 'NEXUS',   glb: true  },
    { key: 'zerox',   name: 'ZEROX',   glb: false }, // glb may be missing — handle gracefully
    { key: 'oracle',  name: 'ORACLE',  glb: true  },
    { key: 'turtle',  name: 'TURTLE',  glb: true  },
    { key: 'quill',   name: 'QUILL',   glb: true  },
    { key: 'pikadon', name: 'PIKADON', glb: true  }
  ];

  var PORTRAIT = function (name) { return '/assets/agents/' + name + '-portrait.png'; };
  var BUILT_FLAG = 'data-ftx-built';

  // Which real 3D architect model the forged agent will wear in the 3D World.
  // UPPERCASE key (e.g. 'NEXUS'); default 'SHADDAI'. Read by index.html forge().
  window.SHADDAI_FORGE_MODEL = window.SHADDAI_FORGE_MODEL || 'SHADDAI';

  function build(forge) {
    try {
      if (!forge || forge.getAttribute(BUILT_FLAG)) return;
      forge.setAttribute(BUILT_FLAG, '1');

      // ---- 1) MODEL PICKER SECTION -------------------------------------
      var grid = forge.querySelector('.of-grid');
      var section = document.createElement('div');
      section.className = 'ftx-models';
      section.innerHTML =
        '<div class="ftx-models-hd">◇ CHOOSE YOUR MODEL' +
          '<span class="ftx-models-sub">pick an architect — its real portrait &amp; brain load in</span>' +
        '</div>' +
        '<div class="ftx-grid" id="ftxGrid"></div>';

      // Insert before the existing grid (falls back to appending).
      if (grid && grid.parentNode) { grid.parentNode.insertBefore(section, grid); }
      else { forge.appendChild(section); }

      var gridEl = section.querySelector('#ftxGrid');
      var ofArt = forge.querySelector('#ofArt');

      AGENTS.forEach(function (a) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'ftx-card';
        card.setAttribute('data-archetype', a.key);
        card.setAttribute('aria-label', 'Select ' + a.name + ' model');
        card.innerHTML =
          '<div class="ftx-card-imgwrap">' +
            '<img class="ftx-card-img" src="' + PORTRAIT(a.name) + '" alt="' + a.name + '" ' +
                 'loading="lazy" onerror="this.style.opacity=0.12">' +
            (a.glb ? '<span class="ftx-badge3d">3D</span>' : '') +
            '<span class="ftx-check">✓</span>' +
          '</div>' +
          '<div class="ftx-card-name">' + a.name + '</div>';

        card.addEventListener('click', function () {
          try {
            // (a) selected glow
            var all = gridEl.querySelectorAll('.ftx-card');
            for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
            card.classList.add('selected');

            // (a2) record the chosen 3D architect model (UPPERCASE key) so the
            // forged operative carries it into the 3D World.
            window.SHADDAI_FORGE_MODEL = String(a.name).toUpperCase();

            // (b) sync the big preview portrait
            if (ofArt) { ofArt.src = PORTRAIT(a.name); ofArt.style.opacity = ''; }

            // (c) fire the REAL backend wiring via the existing preset button
            var preset = forge.querySelector('.of-preset[data-archetype="' + a.key + '"]');
            if (preset) preset.click();
          } catch (e) { /* never throw from a click handler */ }
        });

        gridEl.appendChild(card);
      });

      // Pre-select whichever archetype the forge currently shows (ofArt src),
      // else default to ORACLE (the page default) so a card always glows.
      (function preselect() {
        try {
          var current = 'oracle';
          var src = (ofArt && ofArt.getAttribute('src')) || '';
          var m = src.match(/([A-Z]+)-portrait\.png/);
          if (m) current = m[1].toLowerCase();
          else if (/arch-([a-z]+)\.png/.test(src)) current = src.match(/arch-([a-z]+)\.png/)[1];
          var sel = gridEl.querySelector('.ftx-card[data-archetype="' + current + '"]') ||
                    gridEl.querySelector('.ftx-card[data-archetype="oracle"]');
          if (sel) { sel.classList.add('selected');
            window.SHADDAI_FORGE_MODEL = String(sel.getAttribute('data-archetype') || 'shaddai').toUpperCase(); }
        } catch (e) {}
      })();

      // ---- 2) PROMINENT "⚙ TOOLS" HEADER + FILTER over #ofSkills --------
      var skills = forge.querySelector('#ofSkills');
      if (skills && !forge.querySelector('.ftx-tools-hd')) {
        var toolsHd = document.createElement('div');
        toolsHd.className = 'ftx-tools-hd';
        toolsHd.innerHTML =
          '<span class="ftx-tools-title">⚙ TOOLS</span>' +
          '<span class="ftx-tools-hint">equip skills — each adds compute load</span>' +
          '<input class="ftx-tools-search" type="text" placeholder="filter tools…" ' +
                 'aria-label="filter tools" spellcheck="false">';
        // place the header directly above the skills chip container
        if (skills.parentNode) skills.parentNode.insertBefore(toolsHd, skills);

        var search = toolsHd.querySelector('.ftx-tools-search');
        if (search) {
          search.addEventListener('input', function () {
            try {
              var q = (search.value || '').trim().toLowerCase();
              var chips = skills.querySelectorAll('.of-chip');
              for (var i = 0; i < chips.length; i++) {
                var txt = (chips[i].textContent || '').toLowerCase();
                chips[i].style.display = (!q || txt.indexOf(q) !== -1) ? '' : 'none';
              }
            } catch (e) {}
          });
        }

        // clicking the header scrolls the tools into view (discoverability helper)
        toolsHd.querySelector('.ftx-tools-title').addEventListener('click', function () {
          try { skills.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        });
      }
    } catch (e) { /* swallow — must never break the page */ }
  }

  // ---- Bootstrap: run now if present, else poll up to ~5s ----------------
  function boot() {
    try {
      var forge = document.getElementById('operatorForge');
      if (forge) { build(forge); return; }
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        var f = document.getElementById('operatorForge');
        if (f) { build(f); clearInterval(t); }
        else if (tries > 50) { clearInterval(t); } // ~5s at 100ms
      }, 100);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
