/**
 * spectator.js — DOM controller for the SHADDAI Football Spectator.
 * Loads on DOMContentLoaded, fetches a match from POST /api/football/sim,
 * builds frames via FootballReplay, and drives FootballRenderer at variable speed.
 *
 * URL params: ?seed=&hero=
 */

'use strict';

(function () {

  // ---- STATE ----
  let _record     = null;
  let _frames     = [];
  let _frameIdx   = 0;
  let _playing    = false;
  let _speed      = 1;          // multiplier
  let _camMode    = 'SIDE_25D';
  let _renderer   = null;
  let _rafId      = null;
  let _lastTime   = 0;
  let _frameMs    = 80;          // ms per frame at 1× speed (adjusted by speed multiplier)

  const BASE_FRAME_MS = 80;      // 1× speed → ~12fps of game frames

  // ---- URL PARAMS ----
  const _urlParams = new URLSearchParams(window.location.search);
  const _heroParam = _urlParams.get('hero') || '';
  const _seedParam = _urlParams.get('seed') || '';

  // ---- DOM REFS (populated in init()) ----
  let $canvas, $scoreA, $scoreB, $teamNameA, $teamNameB, $quarter,
      $downDist, $caption, $feed, $btnPlay, $btnRestart,
      $speedSelect, $camToggle, $themeSelect, $seedInput, $btnNew,
      $postMatch, $postScore, $postWinner, $postMvp, $postSummary,
      $btnWatchAgain, $btnNewSeed, $loadingOverlay, $modeLabel,
      $postMvpPortrait;

  // Track last scores for bump animation
  let _lastScoreA = 0, _lastScoreB = 0;

  // ---- TEAM IDENTITY GENERATOR ----
  // Deterministic from a seed — no Math.random.  Same seed → same names every time.
  const _MASCOTS = [
    'BLITZ', 'TITANS', 'VOLTAGE', 'REAPERS', 'PHANTOMS',
    'GUARDIANS', 'SERAPHS', 'OVERLORDS', 'RONIN', 'HAVOC',
    'CIRCUIT', 'IRON', 'SURGE', 'ECLIPSE', 'VORTEX',
  ];
  const _CITIES = [
    'NEON', 'APEX', 'HYPER', 'TURBO', 'ULTRA',
    'OMEGA', 'NOVA', 'CYBER', 'FLUX', 'SIGMA',
    'DELTA', 'PRIME', 'VECTOR', 'ECHO', 'STORM',
  ];

  // Simple seeded hash — deterministic integer from string
  function _hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  // Generate a comic team name.  captain = agent name (string), seed = match seed number.
  function _genTeamName(captain, seed) {
    const base   = String(captain || 'UNKNOWN').toUpperCase() + String(seed || '0');
    const hash   = _hashStr(base);
    const mIdx   = hash % _MASCOTS.length;
    const cIdx   = (hash >> 4) % _CITIES.length;
    // Alternate between "{CAPTAIN} {MASCOT}" and "{CITY} {MASCOT}" patterns
    if ((hash & 1) === 0) {
      return String(captain || 'TEAM').toUpperCase().slice(0, 7) + ' ' + _MASCOTS[mIdx];
    } else {
      return _CITIES[cIdx] + ' ' + _MASCOTS[mIdx];
    }
  }

  // ---- FETCH + INIT MATCH ----
  async function fetchMatch(seed, hero) {
    showLoading(true);
    const body = {};
    if (seed)  body.seed = parseInt(seed, 10) || seed;
    if (hero)  body.hero = hero;

    try {
      const res  = await fetch('/api/football/sim', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Server ${res.status}: ${res.statusText}`);
      const data = await res.json();
      // /api/football/sim returns { ok, seed, record }. Unwrap to the actual
      // match record (fall back to the raw payload if it's ever un-nested).
      const record = (data && data.record) ? data.record : data;
      if (!record || !Array.isArray(record.events)) {
        throw new Error(data && data.error ? data.error : 'malformed match record');
      }

      loadRecord(record);
    } catch (err) {
      showLoading(false);
      showError('Could not load match: ' + err.message + '. Is the server running at /api/football/sim?');
    }
  }

  function loadRecord(record) {
    _record   = record;
    _frames   = FootballReplay.buildFrames(record);
    _frameIdx = 0;

    // Resolve captain agent name from lineup.  player.agent may be string or {id,name}.
    const nameOf = (a) => (typeof a === 'string' ? a : (a && (a.name || a.id)) || 'Team');
    const pA      = record.lineupA && record.lineupA.players && record.lineupA.players[0];
    const pB      = record.lineupB && record.lineupB.players && record.lineupB.players[0];
    const captA   = pA ? nameOf(pA.agent) : 'Alpha';
    const captB   = pB ? nameOf(pB.agent) : 'Beta';

    // Generate deterministic comic team names using match seed
    const matchSeed   = record.seed != null ? record.seed : (_seedInput ? $seedInput.value : '42');
    const genNameA    = _genTeamName(captA, matchSeed);
    const genNameB    = _genTeamName(captB, String(matchSeed) + '_B');

    // Show in scoreboard
    $teamNameA.textContent = genNameA;
    $teamNameB.textContent = genNameB;

    // Update badge shield initials (first letter of mascot word = last word of team name)
    const _mascotInitA = genNameA.split(' ').pop().slice(0, 1);
    const _mascotInitB = genNameB.split(' ').pop().slice(0, 1);
    const $badgeLetA = document.getElementById('badge-a-letter');
    const $badgeLetB = document.getElementById('badge-b-letter');
    if ($badgeLetA) $badgeLetA.textContent = _mascotInitA;
    if ($badgeLetB) $badgeLetB.textContent = _mascotInitB;

    // Push names into renderer for end-zone text
    if (_renderer && typeof _renderer.setTeamNames === 'function') {
      _renderer.setTeamNames(genNameA, genNameB);
    }

    $postMatch.style.display = 'none';
    resetFeed();
    showLoading(false);
    updateHUD(_frames[0]);
    _renderer.drawFrame(_frames[0]);
    play();
  }

  // ---- PLAYBACK ENGINE ----
  function play() {
    _playing = true;
    $btnPlay.textContent = '⏸ Pause';
    loop(performance.now());
  }

  function pause() {
    _playing = false;
    $btnPlay.textContent = '▶ Play';
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = null;
  }

  function loop(now) {
    if (!_playing) return;
    _rafId = requestAnimationFrame(loop);

    const elapsed = now - _lastTime;
    const targetMs = BASE_FRAME_MS / _speed;

    if (elapsed < targetMs) return;
    _lastTime = now - (elapsed % targetMs);

    advance();
  }

  function advance() {
    if (_frameIdx >= _frames.length) {
      pause();
      showPostMatch();
      return;
    }

    const frame = _frames[_frameIdx];
    _renderer.drawFrame(frame);
    updateHUD(frame);

    if (frame.isKeyFrame && frame.caption) {
      appendFeed(frame);
    }

    _frameIdx++;
  }

  function restart() {
    pause();
    _frameIdx = 0;
    $postMatch.style.display = 'none';
    resetFeed();
    if (_frames.length > 0) {
      _renderer.drawFrame(_frames[0]);
      updateHUD(_frames[0]);
    }
    play();
  }

  // ---- HUD UPDATE ----
  function updateHUD(frame) {
    if (!frame) return;

    // Score with bump animation
    if (frame.scoreA !== _lastScoreA) {
      $scoreA.textContent = frame.scoreA;
      _lastScoreA = frame.scoreA;
      $scoreA.classList.remove('score-bump');
      void $scoreA.offsetWidth; // reflow
      $scoreA.classList.add('score-bump');
    }
    if (frame.scoreB !== _lastScoreB) {
      $scoreB.textContent = frame.scoreB;
      _lastScoreB = frame.scoreB;
      $scoreB.classList.remove('score-bump');
      void $scoreB.offsetWidth;
      $scoreB.classList.add('score-bump');
    }

    if (frame.field) {
      const { down, distance, possession, los } = frame.field;
      $downDist.textContent = `${down && down > 0 ? down + '&' + (distance || '?') : '-'} | Ball: ${possession || '?'} | YD: ${los || 0}`;
    }

    // Approx quarter from frame index
    const pct = _frames.length > 0 ? _frameIdx / _frames.length : 0;
    const qtr = Math.min(4, Math.floor(pct * 4) + 1);
    $quarter.textContent = `Q${qtr}`;

    if (frame.caption && frame.isKeyFrame) {
      $caption.textContent = frame.caption;
      $caption.classList.remove('caption-flash');
      void $caption.offsetWidth; // reflow
      $caption.classList.add('caption-flash');
    }

    // Event type caption color
    $caption.classList.remove('caption-ability', 'caption-td');
    if (frame.eventType === 'ability_used') {
      $caption.classList.add('caption-ability');
      setTimeout(() => $caption.classList.remove('caption-ability'), 1200);
    }
    if (frame.eventType === 'touchdown' || frame.eventType === 'field_goal') {
      $caption.classList.add('caption-td');
      setTimeout(() => $caption.classList.remove('caption-td'), 1800);
      // Screen-shake: renderer handles it internally too; belt-and-suspenders call
      if (_renderer && typeof _renderer.triggerShake === 'function') {
        _renderer.triggerShake(10, 22);
      }
    }
    // Shake on big hits
    if ((frame.eventType === 'sack' || frame.eventType === 'interception') &&
        _renderer && typeof _renderer.triggerShake === 'function') {
      _renderer.triggerShake(6, 14);
    }
  }

  // ---- FEED ----
  function appendFeed(frame) {
    const li = document.createElement('li');
    li.className = 'feed-item';
    if (frame.eventType === 'touchdown')     li.classList.add('feed-td');
    if (frame.eventType === 'interception')  li.classList.add('feed-int');
    if (frame.eventType === 'sack')          li.classList.add('feed-sack');
    if (frame.eventType === 'ability_used')  li.classList.add('feed-ability');
    li.textContent = `[${Math.round(frame.t)}s] ${frame.caption}`;
    $feed.prepend(li);
    // Keep feed trimmed
    while ($feed.children.length > 40) $feed.removeChild($feed.lastChild);
  }

  function resetFeed() {
    $feed.innerHTML = '';
    $caption.textContent = 'Kickoff soon…';
  }

  // ---- POST MATCH PANEL ----
  function showPostMatch() {
    if (!_record) return;
    const r = _record;

    const _winNameA = $teamNameA ? $teamNameA.textContent : 'TEAM A';
    const _winNameB = $teamNameB ? $teamNameB.textContent : 'TEAM B';
    $postScore.textContent   = `${r.finalScoreA || 0} — ${r.finalScoreB || 0}`;
    $postWinner.textContent  = r.winner === 'tie'
      ? 'IT\'S A TIE!'
      : `WINNER: ${r.winner === 'a' ? _winNameA : _winNameB}`;
    $postWinner.style.color  = r.winner === 'a' ? '#00e5ff' : (r.winner === 'b' ? '#ff2d95' : '#ffffff');

    // MVP portrait (visual enhancement — load agent portrait if available)
    if (r.mvp && $postMvpPortrait) {
      const code = String(r.mvp).toUpperCase();
      $postMvpPortrait.src = '/assets/agents/' + code + '-portrait.png';
      $postMvpPortrait.onerror = function () {
        $postMvpPortrait.src = '/assets/agents/' + code + '.png';
        $postMvpPortrait.onerror = function () { $postMvpPortrait.style.display = 'none'; };
        $postMvpPortrait.style.display = 'block';
      };
      $postMvpPortrait.style.display = 'block';
    }
    $postMvp.textContent     = r.mvp ? '✦ MVP: ' + r.mvp : '';

    // Summary
    if (r.summary && typeof r.summary === 'object') {
      const lines = Object.entries(r.summary).slice(0, 8)
        .map(([k, v]) => `${k}: ${v}`).join(' | ');
      $postSummary.textContent = lines;
    } else if (typeof r.summary === 'string') {
      $postSummary.textContent = r.summary.slice(0, 200);
    } else {
      $postSummary.textContent = '';
    }

    $postMatch.style.display = 'flex';
  }

  // ---- LOADING / ERROR ----
  function showLoading(on) {
    $loadingOverlay.style.display = on ? 'flex' : 'none';
  }

  function showError(msg) {
    $loadingOverlay.innerHTML = `<p style="color:#ff6666;padding:1rem;text-align:center">${msg}</p>`;
    $loadingOverlay.style.display = 'flex';
  }

  // ---- CAMERA TOGGLE ----
  function toggleCamera() {
    _camMode = _camMode === 'SIDE_25D' ? 'ISO' : 'SIDE_25D';
    _renderer.setCameraMode(_camMode);
    $camToggle.textContent = _camMode === 'SIDE_25D' ? '2.5D ⇄ Iso' : 'Iso ⇄ 2.5D';
    $modeLabel.textContent = _camMode;
    if (_frames[_frameIdx]) _renderer.drawFrame(_frames[_frameIdx]);
  }

  // ---- RESIZE ----
  function onResize() {
    if (!_renderer) return;
    _renderer.resize();
    if (_frames[_frameIdx]) _renderer.drawFrame(_frames[_frameIdx]);
  }

  // ---- INIT ----
  function init() {
    $canvas        = document.getElementById('football-canvas');
    $scoreA        = document.getElementById('score-a');
    $scoreB        = document.getElementById('score-b');
    $teamNameA     = document.getElementById('team-name-a');
    $teamNameB     = document.getElementById('team-name-b');
    $quarter       = document.getElementById('quarter');
    $downDist      = document.getElementById('down-dist');
    $caption       = document.getElementById('play-caption');
    $feed          = document.getElementById('event-feed');
    $btnPlay       = document.getElementById('btn-play');
    $btnRestart    = document.getElementById('btn-restart');
    $speedSelect   = document.getElementById('speed-select');
    $camToggle     = document.getElementById('btn-cam');
    $themeSelect   = document.getElementById('theme-select');
    $seedInput     = document.getElementById('seed-input');
    $btnNew        = document.getElementById('btn-new');
    $postMatch     = document.getElementById('post-match');
    $postScore     = document.getElementById('post-score');
    $postWinner    = document.getElementById('post-winner');
    $postMvp       = document.getElementById('post-mvp');
    $postSummary   = document.getElementById('post-summary');
    $btnWatchAgain   = document.getElementById('btn-watch-again');
    $btnNewSeed      = document.getElementById('btn-new-seed');
    $loadingOverlay  = document.getElementById('loading-overlay');
    $modeLabel       = document.getElementById('cam-mode-label');
    $postMvpPortrait = document.getElementById('post-mvp-portrait');

    // Hero mode label
    if (_heroParam) {
      const hl = document.getElementById('mode-label');
      if (hl) { hl.textContent = 'AGENT-SIM'; hl.style.color = '#00f5ff'; }
    }

    // Renderer
    _renderer = new FootballRenderer($canvas);
    _renderer.setCameraMode(_camMode);
    _renderer.resize();

    // Pre-fill seed
    if (_seedParam) $seedInput.value = _seedParam;

    // Events
    $btnPlay.addEventListener('click', () => _playing ? pause() : play());
    $btnRestart.addEventListener('click', restart);

    $speedSelect.addEventListener('change', () => {
      _speed = parseFloat($speedSelect.value) || 1;
    });

    $camToggle.addEventListener('click', toggleCamera);

    if ($themeSelect) {
      $themeSelect.addEventListener('change', () => {
        if (_renderer && typeof _renderer.setTheme === 'function') {
          _renderer.setTheme($themeSelect.value);
          // Redraw current frame immediately so the theme swap is visible even when paused
          if (_frames[_frameIdx]) _renderer.drawFrame(_frames[_frameIdx]);
        }
      });
    }

    $btnNew.addEventListener('click', () => {
      pause();
      fetchMatch($seedInput.value.trim(), _heroParam);
    });

    $btnWatchAgain.addEventListener('click', restart);
    $btnNewSeed.addEventListener('click', () => {
      $seedInput.value = Math.floor(Math.random() * 999999);
      pause();
      fetchMatch($seedInput.value, _heroParam);
    });

    window.addEventListener('resize', onResize);

    // Touch: swipe left/right to scrub (advance/back 10 frames)
    let _touchStartX = 0;
    $canvas.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
    $canvas.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _touchStartX;
      if (Math.abs(dx) > 40) {
        _frameIdx = Math.max(0, Math.min(_frames.length - 1, _frameIdx + (dx < 0 ? 10 : -10)));
        if (_frames[_frameIdx]) { _renderer.drawFrame(_frames[_frameIdx]); updateHUD(_frames[_frameIdx]); }
      }
    }, { passive: true });

    // Fetch initial match
    fetchMatch(_seedParam, _heroParam);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
