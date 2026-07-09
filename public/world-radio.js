/**
 * world-radio.js — SHADDAI RADIO + City Bulletin
 * ZEROX + NEXUS build — v1.0.0
 *
 * Usage (the world binds the key and calls these):
 *   const radio = window.buildShaddaiRadio();
 *   radio.toggle();   // show/hide the panel
 *   radio.show();
 *   radio.hide();
 *   radio.isOpen();   // → boolean
 *   radio.start();    // call from a user gesture to satisfy autoplay policy
 *
 * The panel appends itself to document.body when buildShaddaiRadio() is called.
 * All user-supplied strings are rendered with textContent (no innerHTML) to prevent XSS.
 */
(function (global) {
  'use strict';

  var BASE_URL = '/api/radio';

  // ─── Tag palette ─────────────────────────────────────────────────────────────
  var TAG_COLORS = {
    collab:  '#00e5ff',
    gig:     '#ffd700',
    post:    '#a78bfa',
    wanted:  '#f87171',
    event:   '#34d399',
    other:   '#94a3b8',
  };

  // ─── Factory ─────────────────────────────────────────────────────────────────
  global.buildShaddaiRadio = function () {

    var panelEl   = null;
    var audioEl   = null;
    var rotation  = [];
    var trackIdx  = 0;
    var open      = false;
    var started   = false;

    // ── DOM helpers ─────────────────────────────────────────────────────────────
    function el(tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        if (k === 'style') {
          Object.assign(node.style, attrs[k]);
        } else if (k === 'class') {
          node.className = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
      if (children) {
        if (typeof children === 'string') {
          node.textContent = children;
        } else if (Array.isArray(children)) {
          children.forEach(function (c) { if (c) node.appendChild(c); });
        } else {
          node.appendChild(children);
        }
      }
      return node;
    }

    function txt(s) { return document.createTextNode(String(s || '')); }

    function safeText(s) { return String(s || '').slice(0, 600); }

    function timeAgo(iso) {
      try {
        var diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 60)   return 'just now';
        if (diff < 3600) return Math.floor(diff / 60)   + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
      } catch (_) { return ''; }
    }

    // ── Fetch helpers ───────────────────────────────────────────────────────────
    function apiFetch(method, endpoint, body) {
      var opts = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) opts.body = JSON.stringify(body);
      return fetch(BASE_URL + endpoint, opts).then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || r.status); });
        return r.json();
      });
    }

    // ── Audio player ────────────────────────────────────────────────────────────
    function playTrack(idx) {
      if (!rotation.length) return;
      trackIdx = ((idx % rotation.length) + rotation.length) % rotation.length;
      var track = rotation[trackIdx];
      if (!audioEl) return;
      audioEl.src = track.url;
      if (started) {
        audioEl.play().catch(function () { /* autoplay blocked — user must press play */ });
      }
      renderNowPlaying();
    }

    function nextTrack() { playTrack(trackIdx + 1); }
    function prevTrack() { playTrack(trackIdx - 1); }

    // ── Build panel ─────────────────────────────────────────────────────────────
    function buildPanel() {
      if (panelEl) return;

      // ── Styles ────────────────────────────────────────────────────────────
      var style = document.createElement('style');
      style.textContent = [
        '#shaddai-radio-panel {',
        '  position: fixed; bottom: 80px; right: 24px; z-index: 10000;',
        '  width: 360px; max-width: calc(100vw - 32px); max-height: 88vh; overflow-y: auto;',
        '  background: linear-gradient(160deg, #0b0f1a 0%, #0d1b2a 100%);',
        '  border: 1px solid #00e5ff44; border-radius: 14px;',
        '  box-shadow: 0 0 32px #00e5ff22, 0 8px 32px #000a;',
        '  font-family: "Segoe UI", system-ui, sans-serif;',
        '  color: #e2e8f0; font-size: 13px; display: none;',
        '  scrollbar-width: thin; scrollbar-color: #00e5ff33 transparent;',
        '  -webkit-overflow-scrolling: touch;',   /* smooth momentum scroll on iOS */
        '}',
        '#shaddai-radio-panel::-webkit-scrollbar { width: 4px; }',
        '#shaddai-radio-panel::-webkit-scrollbar-thumb { background: #00e5ff44; border-radius: 4px; }',
        /* Mobile: dock as a bottom-sheet that fits any phone, full width, scrollable */
        '@media (max-width: 560px) {',
        '  #shaddai-radio-panel {',
        '    bottom: 0; right: 0; left: 0; width: auto; max-width: none;',
        '    max-height: 82vh; border-radius: 16px 16px 0 0;',
        '    border-bottom: none; font-size: 14px;',
        '  }',
        '}',
        '.sr-header {',
        '  display: flex; align-items: center; justify-content: space-between;',
        '  padding: 14px 16px 10px; border-bottom: 1px solid #00e5ff22;',
        '  background: linear-gradient(90deg, #0b0f1a 60%, #0d2a1a 100%);',
        '  border-radius: 14px 14px 0 0; position: sticky; top: 0; z-index: 1;',
        '}',
        '.sr-title { font-size: 15px; font-weight: 700; color: #00e5ff;',
        '  letter-spacing: 2px; text-shadow: 0 0 8px #00e5ff88; }',
        /* Close: 44x44 min tap target for touch */
        '.sr-close { background: none; border: none; color: #cbd5e1; cursor: pointer;',
        '  font-size: 20px; line-height: 1; border-radius: 8px;',
        '  min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;',
        '  margin: -8px -8px -8px 0; transition: background .15s, color .15s; }',
        '.sr-close:hover { color: #f87171; background: #f8717118; }',
        '.sr-section { padding: 14px 16px; border-bottom: 1px solid #00e5ff11; }',
        /* Brighter label for readability (was #ffd70099 ~60% alpha) */
        '.sr-section-label { font-size: 11px; font-weight: 700; letter-spacing: 2px;',
        '  color: #ffd700cc; text-transform: uppercase; margin-bottom: 10px; }',
        /* Now Playing — wrap long titles (was clipped to one line), stronger contrast */
        '.sr-track-name { font-size: 15px; font-weight: 700; color: #ffffff;',
        '  margin-bottom: 3px; line-height: 1.35; overflow-wrap: anywhere;',
        '  display: flex; align-items: center; gap: 7px; }',
        '.sr-track-artist { font-size: 12.5px; color: #67e8f9; margin-bottom: 12px; overflow-wrap: anywhere; }',
        /* Pulse dot beside the playing title — pure CSS, on-brand neon */
        '.sr-pulse { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%;',
        '  background: #34d399; box-shadow: 0 0 6px #34d399; animation: sr-pulse 1.6s ease-in-out infinite; }',
        '@keyframes sr-pulse { 0%,100% { opacity: 1; transform: scale(1); }',
        '  50% { opacity: .4; transform: scale(.7); } }',
        '@media (prefers-reduced-motion: reduce) { .sr-pulse { animation: none; } }',
        '.sr-empty { color: #94a3b8; font-style: italic; font-size: 12.5px; line-height: 1.5; }',
        '.sr-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }',
        /* Buttons: min 44px tap target for touch */
        '.sr-btn { background: #00e5ff18; border: 1px solid #00e5ff44; border-radius: 8px;',
        '  color: #7df9ff; cursor: pointer; padding: 8px 14px; font-size: 14px; font-weight: 600;',
        '  min-height: 44px; display: inline-flex; align-items: center; justify-content: center;',
        '  transition: background .15s, border-color .15s; }',
        '.sr-btn:hover { background: #00e5ff33; border-color: #00e5ff77; }',
        '.sr-vol { flex: 1 1 80px; min-width: 80px; height: 44px; accent-color: #00e5ff; cursor: pointer; }',
        /* Rotation list */
        '.sr-track-list { max-height: 120px; overflow-y: auto; margin-top: 8px;',
        '  scrollbar-width: thin; scrollbar-color: #00e5ff22 transparent; }',
        '.sr-track-item { display: flex; align-items: center; gap: 8px;',
        '  padding: 7px 4px; border-bottom: 1px solid #ffffff0f; cursor: pointer; border-radius: 6px; }',
        '.sr-track-item:hover { background: #00e5ff0d; }',
        '.sr-track-item:hover .sr-ti-title { color: #7df9ff; }',
        '.sr-track-item.active .sr-ti-title { color: #ffd700; font-weight: 600; }',
        '.sr-ti-num { color: #64748b; font-size: 11px; min-width: 18px; text-align: right; }',
        '.sr-ti-info { flex: 1; overflow: hidden; }',
        /* Ellipsis is fine here (dense list), but title stays legible */
        '.sr-ti-title { font-size: 12.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.sr-ti-artist { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.sr-ti-del { background: none; border: none; color: #ef4444aa; cursor: pointer;',
        '  font-size: 15px; line-height: 1; border-radius: 6px; flex: 0 0 auto;',
        '  min-width: 30px; min-height: 30px; display: flex; align-items: center; justify-content: center; }',
        '.sr-ti-del:hover { color: #fff; background: #f8717133; }',
        /* Forms */
        '.sr-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }',
        /* Inputs use 16px font so iOS Safari does not auto-zoom on focus */
        '.sr-input { background: #0f172a; border: 1px solid #00e5ff33; border-radius: 8px;',
        '  color: #f1f5f9; font-size: 16px; padding: 10px 12px; outline: none; width: 100%; box-sizing: border-box;',
        '  transition: border-color .15s; }',
        '.sr-input::placeholder { color: #64748b; }',
        '.sr-input:focus { border-color: #00e5ff88; box-shadow: 0 0 0 2px #00e5ff22; }',
        '.sr-select { appearance: none; background: #0f172a url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%2300e5ff\'/%3E%3C/svg%3E") no-repeat right 12px center / 10px;',
        '  border: 1px solid #00e5ff33; border-radius: 8px; color: #f1f5f9;',
        '  font-size: 16px; padding: 10px 32px 10px 12px; width: 100%; box-sizing: border-box; cursor: pointer; }',
        '.sr-textarea { resize: vertical; min-height: 64px; line-height: 1.4; }',
        /* Submit: 44px tap target, brighter label */
        '.sr-submit { background: linear-gradient(90deg, #00e5ff22, #ffd70022);',
        '  border: 1px solid #00e5ff55; border-radius: 8px; color: #7df9ff;',
        '  cursor: pointer; font-size: 14px; font-weight: 700; padding: 11px; min-height: 44px;',
        '  letter-spacing: .5px; transition: background .15s, opacity .15s; }',
        '.sr-submit:hover { background: linear-gradient(90deg, #00e5ff44, #ffd70044); }',
        '.sr-submit:disabled { opacity: .5; cursor: default; }',
        '.sr-msg { font-size: 12px; min-height: 16px; margin-top: 2px; }',
        '.sr-msg.ok { color: #34d399; }',
        '.sr-msg.err { color: #f87171; }',
        /* Bulletin */
        '.sr-bulletin-list { max-height: 200px; overflow-y: auto; margin-top: 8px;',
        '  scrollbar-width: thin; scrollbar-color: #00e5ff22 transparent; }',
        '.sr-post { padding: 10px 0; border-bottom: 1px solid #ffffff0f; }',
        '.sr-post:last-child { border-bottom: none; }',
        '.sr-post-header { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; flex-wrap: wrap; }',
        '.sr-post-name { font-size: 12.5px; font-weight: 700; color: #f8fafc; overflow-wrap: anywhere; }',
        /* Timestamp brighter (was #475569, nearly unreadable on dark) */
        '.sr-post-time { font-size: 10.5px; color: #94a3b8; margin-left: auto; white-space: nowrap; }',
        /* Tag chip: readable label, per-tag color set inline from TAG_COLORS */
        '.sr-tag { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 20px;',
        '  letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; line-height: 1.4; }',
        '.sr-post-body { font-size: 12.5px; color: #dbe4ee; line-height: 1.55; overflow-wrap: anywhere; }',
      ].join('\n');
      document.head.appendChild(style);

      // ── Audio element ───────────────────────────────────────────────────────
      audioEl = el('audio', { preload: 'none' });
      audioEl.addEventListener('ended', nextTrack);
      audioEl.volume = 0.6;

      // ── Skeleton panel ──────────────────────────────────────────────────────
      panelEl = el('div', { id: 'shaddai-radio-panel' });

      // Header
      var closeBtn = el('button', { 'class': 'sr-close', title: 'Close Radio' }, '✕');
      closeBtn.addEventListener('click', hide);
      panelEl.appendChild(el('div', { 'class': 'sr-header' }, [
        el('span', { 'class': 'sr-title' }, '📻 SHADDAI RADIO'),
        closeBtn,
      ]));

      // Section: Now Playing
      var nowPlayingSection = el('div', { 'class': 'sr-section', id: 'sr-now-playing-section' });
      panelEl.appendChild(nowPlayingSection);

      // Section: Submit Track
      var submitSection = el('div', { 'class': 'sr-section' });
      submitSection.appendChild(el('div', { 'class': 'sr-section-label' }, '🎵 Submit Your Track'));

      var inTitle     = el('input', { 'class': 'sr-input', placeholder: 'Track title', maxlength: '120' });
      var inArtist    = el('input', { 'class': 'sr-input', placeholder: 'Artist / your name', maxlength: '80' });
      var inUrl       = el('input', { 'class': 'sr-input', placeholder: 'Direct audio URL (mp3, ogg, stream…)', maxlength: '512' });
      var inSubmitter = el('input', { 'class': 'sr-input', placeholder: 'Your handle (optional)', maxlength: '60' });
      var submitMsg   = el('div', { 'class': 'sr-msg' });
      var submitBtn   = el('button', { 'class': 'sr-submit' }, 'Add to Rotation');

      submitBtn.addEventListener('click', function () {
        var body = {
          title:       inTitle.value.trim(),
          artist:      inArtist.value.trim(),
          url:         inUrl.value.trim(),
          submittedBy: inSubmitter.value.trim() || 'anonymous',
        };
        if (!body.title || !body.artist || !body.url) {
          setMsg(submitMsg, 'Please fill in title, artist, and URL.', 'err'); return;
        }
        submitBtn.disabled = true;
        apiFetch('POST', '/tracks', body)
          .then(function (d) {
            rotation.push(d.track);
            renderNowPlaying();
            renderTrackList();
            inTitle.value = inArtist.value = inUrl.value = '';
            setMsg(submitMsg, 'Track added to the rotation!', 'ok');
          })
          .catch(function (e) { setMsg(submitMsg, 'Error: ' + e.message, 'err'); })
          .finally(function () { submitBtn.disabled = false; });
      });

      var submitForm = el('div', { 'class': 'sr-form' }, [inTitle, inArtist, inUrl, inSubmitter, submitBtn, submitMsg]);
      submitSection.appendChild(submitForm);
      panelEl.appendChild(submitSection);

      // Section: City Bulletin
      var bulletinSection = el('div', { 'class': 'sr-section' });
      bulletinSection.appendChild(el('div', { 'class': 'sr-section-label' }, '📌 City Bulletin'));

      var bulletinList = el('div', { 'class': 'sr-bulletin-list', id: 'sr-bulletin-list' });
      bulletinSection.appendChild(bulletinList);

      var bInName    = el('input', { 'class': 'sr-input', placeholder: 'Your name', maxlength: '60' });
      var bInTag     = el('select', { 'class': 'sr-input sr-select' });
      ['collab', 'gig', 'post', 'wanted', 'event', 'other'].forEach(function (t) {
        bInTag.appendChild(el('option', { value: t }, t));
      });
      var bInMsg    = el('textarea', { 'class': 'sr-input sr-textarea', placeholder: 'Say something…', maxlength: '400' });
      var bulletinMsg = el('div', { 'class': 'sr-msg' });
      var bulletinBtn = el('button', { 'class': 'sr-submit' }, 'Post to Bulletin');

      bulletinBtn.addEventListener('click', function () {
        var body = {
          name:    bInName.value.trim() || 'Anonymous',
          tag:     bInTag.value,
          message: bInMsg.value.trim(),
        };
        if (!body.message) { setMsg(bulletinMsg, 'Message cannot be empty.', 'err'); return; }
        bulletinBtn.disabled = true;
        apiFetch('POST', '/bulletin', body)
          .then(function (d) {
            bulletinList.insertBefore(renderPost(d.post), bulletinList.firstChild);
            bInMsg.value = '';
            setMsg(bulletinMsg, 'Posted!', 'ok');
          })
          .catch(function (e) { setMsg(bulletinMsg, 'Error: ' + e.message, 'err'); })
          .finally(function () { bulletinBtn.disabled = false; });
      });

      var bForm = el('div', { 'class': 'sr-form', style: { marginTop: '12px' } }, [bInName, bInTag, bInMsg, bulletinBtn, bulletinMsg]);
      bulletinSection.appendChild(bForm);
      panelEl.appendChild(bulletinSection);

      document.body.appendChild(panelEl);
      document.body.appendChild(audioEl);

      // Initial data load
      loadTracks().then(function () { renderNowPlaying(); renderTrackList(); });
      loadBulletin().then(function (posts) { renderBulletin(posts); });
    }

    // ── Renders ─────────────────────────────────────────────────────────────────
    function setMsg(el, text, cls) {
      el.textContent = text;
      el.className = 'sr-msg ' + (cls || '');
      setTimeout(function () { if (el.textContent === text) el.textContent = ''; }, 4000);
    }

    function renderNowPlaying() {
      var section = document.getElementById('sr-now-playing-section');
      if (!section) return;
      // clear
      while (section.firstChild) section.removeChild(section.firstChild);

      section.appendChild(el('div', { 'class': 'sr-section-label' }, '▶ NOW PLAYING'));

      if (!rotation.length) {
        section.appendChild(el('div', { 'class': 'sr-empty' }, 'No tracks in the rotation yet — add yours below!'));
        return;
      }

      var track = rotation[trackIdx] || rotation[0];

      var nameEl   = el('div', { 'class': 'sr-track-name' });
      // Live pulse dot + wrapping title text (title kept as textContent — XSS-safe)
      nameEl.appendChild(el('span', { 'class': 'sr-pulse', 'aria-hidden': 'true' }));
      nameEl.appendChild(el('span', null, safeText(track.title)));
      var artistEl = el('div', { 'class': 'sr-track-artist' });
      artistEl.textContent = safeText(track.artist);

      // Controls
      var prevBtn  = el('button', { 'class': 'sr-btn', title: 'Previous' }, '⏮');
      var playBtn  = el('button', { 'class': 'sr-btn', title: 'Play / Pause' }, '▶ Play');
      var nextBtn  = el('button', { 'class': 'sr-btn', title: 'Next' }, '⏭');
      var vol      = el('input', { type: 'range', 'class': 'sr-vol', min: '0', max: '1', step: '0.05', value: audioEl ? String(audioEl.volume) : '0.6', title: 'Volume' });

      prevBtn.addEventListener('click', prevTrack);
      nextBtn.addEventListener('click', nextTrack);
      playBtn.addEventListener('click', function () {
        if (!audioEl) return;
        if (audioEl.paused) {
          started = true;
          if (!audioEl.src && rotation.length) audioEl.src = rotation[trackIdx].url;
          audioEl.play().catch(function (e) { console.warn('[Radio] play blocked:', e.message); });
          playBtn.textContent = '⏸ Pause';
        } else {
          audioEl.pause();
          playBtn.textContent = '▶ Play';
        }
      });

      if (audioEl) {
        audioEl.addEventListener('play',  function () { playBtn.textContent = '⏸ Pause'; });
        audioEl.addEventListener('pause', function () { playBtn.textContent = '▶ Play'; });
      }

      vol.addEventListener('input', function () {
        if (audioEl) audioEl.volume = parseFloat(vol.value);
      });

      var controls = el('div', { 'class': 'sr-controls' }, [prevBtn, playBtn, nextBtn, vol]);
      section.appendChild(nameEl);
      section.appendChild(artistEl);
      section.appendChild(controls);
      renderTrackList(section);
    }

    function renderTrackList(parentOverride) {
      // Only re-render the list inside now-playing section; don't stomp other sections
      var section = parentOverride || document.getElementById('sr-now-playing-section');
      if (!section) return;

      var existing = section.querySelector('.sr-track-list');
      if (existing) section.removeChild(existing);

      if (!rotation.length) return;

      var list = el('div', { 'class': 'sr-track-list' });
      rotation.forEach(function (t, i) {
        var row = el('div', { 'class': 'sr-track-item' + (i === trackIdx ? ' active' : '') });

        var numEl = el('span', { 'class': 'sr-ti-num' });
        numEl.textContent = String(i + 1);

        var infoEl   = el('div', { 'class': 'sr-ti-info' });
        var titleEl  = el('div', { 'class': 'sr-ti-title' });
        titleEl.textContent = safeText(t.title);
        var artistEl = el('div', { 'class': 'sr-ti-artist' });
        artistEl.textContent = safeText(t.artist);
        infoEl.appendChild(titleEl);
        infoEl.appendChild(artistEl);

        var delBtn = el('button', { 'class': 'sr-ti-del', title: 'Remove (only if you submitted)' }, '✕');
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var owner = prompt('Enter your handle to confirm removal:');
          if (!owner) return;
          apiFetch('DELETE', '/tracks/' + t.id + '?owner=' + encodeURIComponent(owner))
            .then(function () {
              rotation.splice(i, 1);
              if (trackIdx >= rotation.length) trackIdx = 0;
              renderNowPlaying();
            })
            .catch(function (err) { alert('Could not remove: ' + err.message); });
        });

        row.appendChild(numEl);
        row.appendChild(infoEl);
        row.appendChild(delBtn);

        row.addEventListener('click', function () { started = true; playTrack(i); });
        list.appendChild(row);
      });
      section.appendChild(list);
    }

    function renderPost(post) {
      var wrapper = el('div', { 'class': 'sr-post' });

      var nameEl = el('span', { 'class': 'sr-post-name' });
      nameEl.textContent = safeText(post.name);

      var tagColor = TAG_COLORS[post.tag] || TAG_COLORS.other;
      var tagEl = el('span', { 'class': 'sr-tag' });
      tagEl.textContent = safeText(post.tag);
      tagEl.style.background = tagColor + '22';
      tagEl.style.color = tagColor;
      tagEl.style.border = '1px solid ' + tagColor + '55';

      var timeEl = el('span', { 'class': 'sr-post-time' });
      timeEl.textContent = timeAgo(post.createdAt);

      var header = el('div', { 'class': 'sr-post-header' }, [nameEl, tagEl, timeEl]);

      var bodyEl = el('div', { 'class': 'sr-post-body' });
      bodyEl.textContent = safeText(post.message);

      wrapper.appendChild(header);
      wrapper.appendChild(bodyEl);
      return wrapper;
    }

    function renderBulletin(posts) {
      var list = document.getElementById('sr-bulletin-list');
      if (!list) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!posts || !posts.length) {
        list.appendChild(el('div', { 'class': 'sr-empty' }, 'No posts yet — be the first!'));
        return;
      }
      posts.forEach(function (p) { list.appendChild(renderPost(p)); });
    }

    // ── Data loaders ────────────────────────────────────────────────────────────
    function loadTracks() {
      return apiFetch('GET', '/tracks')
        .then(function (d) {
          rotation = Array.isArray(d.tracks) ? d.tracks : [];
          // keep trackIdx in bounds
          if (trackIdx >= rotation.length) trackIdx = 0;
        })
        .catch(function (e) {
          console.warn('[Radio] Could not load tracks:', e.message);
          rotation = [];
        });
    }

    function loadBulletin() {
      return apiFetch('GET', '/bulletin')
        .then(function (d) { return Array.isArray(d.posts) ? d.posts : []; })
        .catch(function (e) {
          console.warn('[Radio] Could not load bulletin:', e.message);
          return [];
        });
    }

    // ── Public API ───────────────────────────────────────────────────────────────
    function show() {
      if (!panelEl) buildPanel();
      panelEl.style.display = 'block';
      open = true;
    }

    function hide() {
      if (panelEl) panelEl.style.display = 'none';
      open = false;
    }

    function toggle() {
      if (open) { hide(); } else { show(); }
    }

    function isOpen() { return open; }

    /** Call from a user-gesture handler to unlock the AudioContext / autoplay. */
    function start() {
      if (!audioEl) buildPanel();
      started = true;
      if (rotation.length && audioEl && !audioEl.src) {
        audioEl.src = rotation[trackIdx].url;
      }
      // Don't auto-play — respect the user; they press ▶ when ready.
    }

    return { toggle: toggle, show: show, hide: hide, isOpen: isOpen, start: start };
  };

}(typeof window !== 'undefined' ? window : {}));
