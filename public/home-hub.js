/* SHADDAI — Home Hub (Command Hub)
 * Self-contained, dependency-free. Renders a customizable tile grid
 * as the first child of #dashView. Visuals live in home-hub.css.
 * Exposes window.SHADDAI_HOME = { addTile, removeTile, save }.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shaddai_home_layout';

  /* ---- Tile registry: id -> { icon, label, action } ------------------- */
  function go(view) {
    return function () {
      try {
        if (typeof window.showView === 'function') {
          window.showView(view);
        }
      } catch (e) { /* no-op */ }
    };
  }

  /* Each tile prefers a HuggingFace-generated art PNG (served from /api/forge/art/<art>.png,
     the same pre-generated set the Forge + Media tabs use). The emoji is kept as an automatic
     fallback if the image ever fails to load, so tiles never render blank. */
  var REGISTRY = {
    agents:      { icon: '🤖', art: 'agent-shaddai',       label: 'Agents',       action: go('agents') },
    forge:       { icon: '⬡',  art: 'arch-vanguard',       label: 'Forge',        action: go('forge') },
    workflow:    { icon: '🔗', art: 'module-triggers',     label: 'Workflows',    action: go('workflow') },
    marketplace: { icon: '🛒', art: 'module-gallery',      label: 'Bazaar',       action: go('marketplace') },
    chat:        { icon: '💬', art: 'module-aiwriter',     label: 'Chat',         action: go('chat') },
    pipeline:    { icon: '📈', art: 'module-pipeline',     label: 'Markets',      action: go('pipeline') },
    skills:      { icon: '🧠', art: 'arch-psionic',        label: 'Skills',       action: go('skills') },
    world:       { icon: '🌐', art: 'hero-light-cycle',    label: 'World',        action: function () {
                    try { window.open('/SHADDAI-WORLD-3D.html', '_blank'); } catch (e) {}
                  } },
    office:      { icon: '🏢', art: 'module-automation',   label: 'Orchestrator', action: go('office') },
    settings:    { icon: '⚙',  label: 'Settings',     action: go('settings') },
    /* Extra views that can be added back via the Add menu */
    media:       { icon: '🎬', art: 'module-videostudio',  label: 'Media',        action: go('media') },
    projects:    { icon: '📁', art: 'module-contentseries',label: 'Projects',     action: go('projects') },
    apis:        { icon: '🔌', art: 'module-chartsignal',  label: 'APIs',         action: go('apis') },
    social:      { icon: '📣', art: 'module-musicaudio',   label: 'Social',       action: go('social') },
    automation:  { icon: '⚡', art: 'module-scheduler',    label: 'Automation',   action: go('automation') },
    billing:     { icon: '💳', label: 'Billing',      action: go('billing') },
    'library-notes': { icon: '📚', art: 'module-imagegen', label: 'Library',  action: go('library-notes') }
  };

  var DEFAULT_LAYOUT = [
    'agents', 'forge', 'workflow', 'marketplace', 'chat',
    'pipeline', 'skills', 'world', 'office', 'settings'
  ];

  /* ---- State ---------------------------------------------------------- */
  var layout = [];          // ordered array of tile ids
  var editing = false;
  var rootEl = null;        // #shaddaiHome
  var gridEl = null;        // .hh-grid
  var dragId = null;        // id of tile being dragged

  /* ---- Persistence ---------------------------------------------------- */
  function load() {
    var stored = null;
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) { stored = JSON.parse(raw); }
    } catch (e) { stored = null; }

    if (stored && Object.prototype.toString.call(stored) === '[object Array]' && stored.length) {
      layout = stored.filter(function (id) { return !!REGISTRY[id]; });
    }
    if (!layout.length) {
      layout = DEFAULT_LAYOUT.slice();
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (e) { /* no-op */ }
  }

  /* ---- Rendering ------------------------------------------------------ */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html != null) { n.innerHTML = html; }
    return n;
  }

  function makeTile(id) {
    var meta = REGISTRY[id];
    if (!meta) { return null; }

    var tile = el('div', 'hh-tile');
    tile.setAttribute('data-tile', id);

    var icon = el('div', 'hh-tile-icon');
    if (meta.art) {
      // HuggingFace-generated tile art; if it fails to load, drop back to the emoji glyph.
      var img = document.createElement('img');
      img.className = 'hh-tile-art';
      img.alt = meta.label;
      img.loading = 'lazy';
      img.src = '/api/forge/art/' + meta.art + '.png';
      img.onerror = function () { icon.textContent = meta.icon; img.remove(); };
      icon.appendChild(img);
    } else {
      icon.textContent = meta.icon;
    }
    var label = el('div', 'hh-tile-label', meta.label);
    tile.appendChild(icon);
    tile.appendChild(label);

    /* Click launches when NOT editing */
    tile.addEventListener('click', function () {
      if (editing) { return; }
      if (typeof meta.action === 'function') {
        try { meta.action(); } catch (e) { /* no-op */ }
      }
    });

    /* Remove button (only meaningful in edit mode; CSS hides otherwise) */
    var rm = el('button', 'hh-remove', '×');
    rm.setAttribute('type', 'button');
    rm.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeTile(id);
    });
    tile.appendChild(rm);

    /* Drag to rearrange (HTML5) */
    tile.setAttribute('draggable', 'true');
    tile.addEventListener('dragstart', function (ev) {
      if (!editing) { if (ev.preventDefault) { ev.preventDefault(); } return; }
      dragId = id;
      tile.classList.add('hh-dragging');
      tile.style.opacity = '0.5';
      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', id);
      } catch (e) {}
    });
    tile.addEventListener('dragend', function () {
      dragId = null;
      tile.classList.remove('hh-dragging');
      tile.style.opacity = '';
    });
    tile.addEventListener('dragover', function (ev) {
      if (!editing || dragId == null || dragId === id) { return; }
      if (ev.preventDefault) { ev.preventDefault(); }
      try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
    });
    tile.addEventListener('drop', function (ev) {
      if (!editing || dragId == null || dragId === id) { return; }
      if (ev.preventDefault) { ev.preventDefault(); }
      reorder(dragId, id);
    });

    return tile;
  }

  function renderGrid() {
    if (!gridEl) { return; }
    gridEl.innerHTML = '';
    for (var i = 0; i < layout.length; i++) {
      var t = makeTile(layout[i]);
      if (t) { gridEl.appendChild(t); }
    }
  }

  function reorder(fromId, toId) {
    var from = layout.indexOf(fromId);
    var to = layout.indexOf(toId);
    if (from < 0 || to < 0 || from === to) { return; }
    layout.splice(from, 1);
    layout.splice(to, 0, fromId);
    save();
    renderGrid();
  }

  /* ---- Add / Remove --------------------------------------------------- */
  function addTile(id) {
    if (!REGISTRY[id]) { return; }
    if (layout.indexOf(id) !== -1) { return; }
    layout.push(id);
    save();
    renderGrid();
  }

  function removeTile(id) {
    var idx = layout.indexOf(id);
    if (idx === -1) { return; }
    layout.splice(idx, 1);
    save();
    renderGrid();
  }

  function availableIds() {
    var out = [];
    for (var id in REGISTRY) {
      if (Object.prototype.hasOwnProperty.call(REGISTRY, id)) {
        if (layout.indexOf(id) === -1) { out.push(id); }
      }
    }
    return out;
  }

  function closeAddMenu() {
    var m = rootEl && rootEl.querySelector('.hh-addmenu');
    if (m && m.parentNode) { m.parentNode.removeChild(m); }
  }

  function showAddMenu() {
    // Toggle: clicking again closes it.
    if (rootEl && rootEl.querySelector('.hh-addmenu')) { closeAddMenu(); return; }

    var avail = availableIds();
    var menu = el('div', 'hh-addmenu');
    menu.setAttribute('style',
      'display:flex;flex-wrap:wrap;gap:6px;padding:9px;margin:0 0 10px;border-radius:8px;' +
      'background:rgba(0,255,136,.05);border:1px dashed rgba(0,255,136,.35)');

    if (!avail.length) {
      var empty = el('div', null, 'All tiles are already on your hub.');
      empty.setAttribute('style', 'font:600 11px "Share Tech Mono",monospace;color:#7fbfa0;padding:4px 6px');
      menu.appendChild(empty);
    } else {
      var hint = el('div', null, '＋ Tap to add:');
      hint.setAttribute('style', 'width:100%;font:700 9px "Share Tech Mono",monospace;letter-spacing:.12em;color:#00ff88;text-transform:uppercase;margin-bottom:2px');
      menu.appendChild(hint);
      avail.forEach(function (id) {
        var chip = el('button', null, REGISTRY[id].icon + '  ' + REGISTRY[id].label);
        chip.setAttribute('type', 'button');
        chip.setAttribute('style',
          'padding:6px 11px;border-radius:6px;cursor:pointer;font:600 10.5px "Share Tech Mono",monospace;' +
          'background:rgba(0,0,0,.4);border:1px solid rgba(0,255,136,.3);color:#d9ffe8;transition:all .13s');
        chip.addEventListener('mouseover', function () { chip.style.background = 'rgba(0,255,136,.16)'; chip.style.borderColor = '#00ff88'; });
        chip.addEventListener('mouseout', function () { chip.style.background = 'rgba(0,0,0,.4)'; chip.style.borderColor = 'rgba(0,255,136,.3)'; });
        chip.addEventListener('click', function () { addTile(id); showAddMenu(); showAddMenu(); });
        menu.appendChild(chip);
      });
    }

    // Insert the menu between the header bar and the grid so it's always visible.
    if (rootEl && gridEl) { rootEl.insertBefore(menu, gridEl); }
    else if (rootEl) { rootEl.appendChild(menu); }
  }

  /* ---- Edit mode ------------------------------------------------------ */
  function setEditing(on) {
    editing = !!on;
    if (!rootEl) { return; }
    if (editing) { rootEl.classList.add('hh-editing'); }
    else { rootEl.classList.remove('hh-editing'); }
  }

  /* ---- Build the widget ----------------------------------------------- */
  function build() {
    rootEl = el('div');
    rootEl.id = 'shaddaiHome';

    var bar = el('div', 'hh-bar');
    bar.appendChild(el('div', 'hh-title', '⚡ COMMAND HUB'));

    var editBtn = el('button', 'hh-btn', '✎ Edit Layout');
    editBtn.id = 'hhEditBtn';
    editBtn.setAttribute('type', 'button');
    editBtn.addEventListener('click', function () { setEditing(!editing); });

    var wallBtn = el('button', 'hh-btn', '🖼 Wallpaper');
    wallBtn.id = 'hhWallpaperBtn';
    wallBtn.setAttribute('type', 'button');
    /* Wallpaper is handled entirely by home-wallpaper.js (preset picker +
       upload, no URL prompt). No click handler here. */

    var addBtn = el('button', 'hh-btn', '＋ Add Tile');
    addBtn.id = 'hhAddBtn';
    addBtn.setAttribute('type', 'button');
    addBtn.addEventListener('click', showAddMenu);

    bar.appendChild(editBtn);
    bar.appendChild(wallBtn);
    bar.appendChild(addBtn);

    gridEl = el('div', 'hh-grid');

    rootEl.appendChild(bar);
    rootEl.appendChild(gridEl);

    /* Wallpaper restore is handled by home-wallpaper.js (with readability scrim). */

    renderGrid();
    return rootEl;
  }

  /* ---- Mount ---------------------------------------------------------- */
  function mount() {
    if (document.getElementById('shaddaiHome')) { return true; }
    var dash = document.getElementById('dashView');
    if (!dash) { return false; }
    load();
    var widget = build();
    if (dash.firstChild) { dash.insertBefore(widget, dash.firstChild); }
    else { dash.appendChild(widget); }
    return true;
  }

  function init() {
    if (mount()) { return; }
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      if (mount() || tries > 50) {   // ~6s at 120ms
        window.clearInterval(timer);
      }
    }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ---- Public API ----------------------------------------------------- */
  window.SHADDAI_HOME = {
    addTile: addTile,
    removeTile: removeTile,
    save: save
  };
})();
