/* world-navi-chat.js — real multiplayer chat for the Navi CHAT module (2026-10-15).
 *
 * Relays through the existing poll-based relay in backend/multiplayer.js (POST /api/mp/sync, /api/mp/chat):
 *   Global  -> room 'w3d-global'
 *   Nearby  -> room 'w3d-near-<cx>_<cz>' (the 600-unit map cell you stand in; changes as you travel)
 *   Party   -> room 'w3d-party-<code>' (localStorage shd_party, set via WorldNaviChat.joinParty(code))
 *   Agent   -> /api/shaddai/chat (SHADDAI agent server); a clear notice if it is offline
 * Only rooms you have a name for are synced; the sync also reports your presence (x/z) so "online" counts work.
 *   WorldNaviChat.start({ getPlayer })  · joinParty(code) · stop()
 *
 * BACKEND PERF #7 (2026-11-15) — presence SSE. With ?sse=1 the 2.5 s poll is replaced by
 * one EventSource per room (GET /api/mp/stream): the server pushes presence + chat deltas
 * the moment they happen and refreshes presence server-side, so an idle client sends ZERO
 * requests. Position updates while moving go through POST /api/mp/pos (only when moved
 * >25 units, at most ~1/s). Default is polling, exactly as before. Any stream error retries
 * once, then falls back to polling — SSE can never wedge chat. window.__mpSse reports the
 * live mode ('sse' | 'poll' | 'poll-fallback').
 */
(function (root) {
  'use strict';
  var ID_KEY = 'shd_mp_id', PARTY_KEY = 'shd_party', CELL = 600, POLL_MS = 2500, MAX_FAILS = 6;
  var SSE_MOVE = 25, SSE_POS_CHECK_MS = 1000, SSE_RETRY_MS = 3000;
  var timer = null, fails = 0, inFlight = false, getPlayer = null, seen = {};
  // SSE state (opt-in ?sse=1, default OFF).
  var sseOptIn = false, useSse = false, streams = {}, sseRetried = false, posTimer = null;
  var lastPos = null, lastRooms = null, history = {};
  try { sseOptIn = typeof location !== 'undefined' && /(?:^|[?&])sse=1(?:&|$)/.test(location.search || ''); } catch (e) { sseOptIn = false; }
  if (sseOptIn && typeof EventSource === 'undefined') sseOptIn = false; // no EventSource -> polling
  useSse = sseOptIn;

  function mode() { return useSse ? 'sse' : 'poll'; }
  function setMpSse() { try { root.__mpSse = { enabled: sseOptIn, mode: useSse ? 'sse' : (sseRetried ? 'poll-fallback' : 'poll') }; } catch (e) {} }

  // Chat deltas (BACKEND_PERF §7 item 2): per-ROOM history + cursor (room id,
  // not channel — the Nearby room changes as you travel between cells).
  // We send the cursor as `since`; the server returns only newer messages
  // and we merge. Merging also handles full-ring responses (old server /
  // off-switch) identically. Off-switch: ?mpdelta=0 in the page URL.
  var hist = {}, cursor = {};
  var DELTA_OFF = /[?&]mpdelta=0(?:&|$)/.test((root.location && root.location.search) || '');

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function myId() { var id = ls(ID_KEY); if (!id || !/^[\w-]{1,64}$/.test(id)) { id = 'w3d-' + Math.random().toString(36).slice(2, 12); ls(ID_KEY, id); } return id; }
  function name() { return (root.Navi && root.Navi.chatName && root.Navi.chatName()) || ''; }
  function pos() { var p = getPlayer && getPlayer(); return p || { x: 0, z: 0 }; }
  function party() { var c = ls(PARTY_KEY); return c && /^[\w-]{1,40}$/.test(c) ? c : ''; }
  function rooms() {
    var p = pos(), r = { Global: 'w3d-global', Nearby: 'w3d-near-' + Math.floor(p.x / CELL) + '_' + Math.floor(p.z / CELL) };
    if (party()) r.Party = 'w3d-party-' + party();
    return r;
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }

  function syncAll() {
    if (inFlight || !name() || !root.Navi) return;
    inFlight = true;
    var p = pos(), R = rooms(), me = name(), id = myId();
    Promise.all(Object.keys(R).map(function (ch) {
      var rk = R[ch]; // room id — history/cursor are keyed by this
      var since = DELTA_OFF ? 0 : (cursor[rk] || 0);
      return post('/api/mp/sync', { room: rk, id: id, name: me, agent: '', x: Math.round(p.x), y: Math.round(p.z), since: since }).then(function (d) {
        if (!d || d.ok !== true) throw new Error('not ok');
        var have = {}, merged = (hist[rk] || []).slice();
        merged.forEach(function (m) { have[m.at + '|' + m.u + '|' + m.t] = 1; });
        (d.chat || []).forEach(function (m) {
          var mm = { u: m.name, t: m.text, me: m.name === me, at: m.t };
          var k = mm.at + '|' + mm.u + '|' + mm.t;
          if (!have[k]) { have[k] = 1; merged.push(mm); }
        });
        merged.sort(function (a, b) { return a.at - b.at; });
        if (merged.length > 30) merged = merged.slice(-30);
        hist[rk] = merged;
        if (merged.length) cursor[rk] = Math.max(cursor[rk] || 0, merged[merged.length - 1].at);
        var key = merged.length ? merged[merged.length - 1].at + '|' + merged.length : '0';
        if (seen[ch] !== key) { seen[ch] = key; root.Navi.chatSet(ch, merged); }
        // G-6 presence: the same sync returns the room's other players — render them (world-presence.js; ?presence=0 = off)
        if (d.players && root.WorldPresence) { try { root.WorldPresence.update(d.players, { selfId: id, selfPos: p }); } catch (e) {} }
      });
    })).then(function () { fails = 0; }, function () { if (++fails >= MAX_FAILS) { stop(); if (root.Navi.toast) root.Navi.toast('Chat offline (server unreachable)'); } })
      .then(function () { inFlight = false; });
  }

  // ---- SSE transport (BACKEND PERF #7) -------------------------------------
  // chatSet REPLACES the channel log, so SSE deltas are accumulated per channel
  // and the accumulated array is handed over (the first event after (re)connect
  // carries the full ring, so it resets the history).
  function ingest(ch, msgs, initial) {
    if (initial || !history[ch]) { history[ch] = msgs.slice(); }
    else {
      var have = {};
      history[ch].forEach(function (m) { if (m.seq) have[m.seq] = 1; });
      msgs.forEach(function (m) { if (!m.seq || !have[m.seq]) history[ch].push(m); });
      if (history[ch].length > 80) history[ch] = history[ch].slice(-80);
    }
    root.Navi.chatSet(ch, history[ch]);
  }

  function streamUrl(ch) {
    var R = rooms(), p = pos();
    return '/api/mp/stream?room=' + encodeURIComponent(R[ch]) + '&id=' + encodeURIComponent(myId()) +
      '&name=' + encodeURIComponent(name()) + '&x=' + Math.round(p.x) + '&y=' + Math.round(p.z);
  }

  function closeStream(ch) {
    if (streams[ch]) { try { streams[ch].close(); } catch (e) {} delete streams[ch]; }
  }
  function closeAllStreams() { Object.keys(streams).forEach(closeStream); }

  function openStream(ch) {
    closeStream(ch);
    if (!root.Navi || !name()) return;
    history[ch] = null; // the next event is the initial full snapshot
    var es;
    try { es = new EventSource(streamUrl(ch)); } catch (e) { sseStreamError(ch); return; }
    es.addEventListener('sync', function (ev) {
      try {
        var d = JSON.parse(ev.data || '{}');
        if (!d || d.ok !== true) return;
        fails = 0;
        var me = name();
        var msgs = (d.chat || []).map(function (m) { return { u: m.name, t: m.text, me: m.name === me, at: m.t, seq: m.seq }; });
        if (msgs.length) ingest(ch, msgs, history[ch] === null);
        else if (history[ch] === null) history[ch] = [];
      } catch (e) {}
    });
    es.onerror = function () { sseStreamError(ch); };
    streams[ch] = es;
  }
  function openAllStreams() { Object.keys(rooms()).forEach(openStream); }

  function sseStreamError(ch) {
    closeStream(ch);
    if (!useSse) return;
    if (!sseRetried) {
      sseRetried = true;
      setTimeout(function () { if (useSse) openAllStreams(); }, SSE_RETRY_MS);
    } else {
      sseFallback();
    }
  }
  function sseFallback() {
    closeAllStreams();
    useSse = false;
    setMpSse();
    startPolling();
  }
  function startPolling() {
    if (!timer) timer = setInterval(syncAll, POLL_MS);
    syncAll();
  }

  // Local-only position watcher (no network when idle): reports a move >25 units
  // via POST /api/mp/pos, and reopens streams when the Nearby cell changes.
  function checkPos() {
    if (!useSse || !root.Navi || !name()) return;
    var p = pos(), R = rooms();
    var roomChanged = !lastRooms || R.Nearby !== lastRooms.Nearby || (R.Party || '') !== (lastRooms.Party || '');
    if (roomChanged) {
      lastPos = { x: p.x, z: p.z }; lastRooms = R;
      openAllStreams();
      return;
    }
    if (!lastPos) { lastPos = { x: p.x, z: p.z }; return; }
    if (Math.abs(p.x - lastPos.x) > SSE_MOVE || Math.abs(p.z - lastPos.z) > SSE_MOVE) {
      lastPos = { x: p.x, z: p.z };
      var id = myId();
      Object.keys(R).forEach(function (ch) {
        post('/api/mp/pos', { room: R[ch], id: id, x: Math.round(p.x), y: Math.round(p.z) }).then(null, function () {});
      });
    }
  }

  function sendChat(ch, text, nm) {
    nm = nm || name(); if (!nm) return;
    if (ch === 'Agent') {
      post('/api/shaddai/chat', { message: text }).then(function (d) {
        root.Navi.chatPush('Agent', { u: 'SHADDAI', t: (d && (d.response || d.output)) || '(no reply)', me: false, at: Date.now() });
      }, function () { root.Navi.chatPush('Agent', { u: 'system', t: 'Agent server is offline right now - try again later.', me: false, at: Date.now() }); });
      return;
    }
    var R = rooms(); if (!R[ch]) { root.Navi.chatPush(ch, { u: 'system', t: ch === 'Party' ? 'Join a party first (party code).' : 'Channel unavailable.', me: false, at: Date.now() }); return; }
    // SSE mode: the server broadcast delivers the echo; polling mode needs a refresh.
    post('/api/mp/chat', { room: R[ch], id: myId(), name: nm, text: text }).then(useSse ? function () {} : syncAll, function () { root.Navi.chatPush(ch, { u: 'system', t: 'Message not sent (offline).', me: false, at: Date.now() }); });
  }

  function start(o) {
    getPlayer = (o && o.getPlayer) || getPlayer;
    root.NaviHooks = root.NaviHooks || {};
    root.NaviHooks.sendChat = sendChat;
    root.NaviHooks.onName = function () { if (useSse) openAllStreams(); else syncAll(); };
    setMpSse();
    if (useSse) {
      var sp = pos();
      lastPos = { x: sp.x, z: sp.z }; lastRooms = rooms(); // copy: pos() may return a live object
      openAllStreams();
      if (!posTimer) posTimer = setInterval(checkPos, SSE_POS_CHECK_MS);
    } else {
      startPolling();
    }
  }
  function stop() {
    if (timer) clearInterval(timer); timer = null;
    if (posTimer) clearInterval(posTimer); posTimer = null;
    closeAllStreams();
  }

  root.WorldNaviChat = { start: start, stop: stop, joinParty: function (code) { if (/^[\w-]{1,40}$/.test(code || '')) { ls(PARTY_KEY, code); if (useSse) openAllStreams(); else syncAll(); return true; } return false; },
    _rooms: rooms, _sync: syncAll, _send: sendChat,
    _mode: mode, _streams: function () { return streams; }, _checkPos: checkPos, _ingest: ingest };
})(typeof window !== 'undefined' ? window : globalThis);
