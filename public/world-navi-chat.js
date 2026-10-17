/* world-navi-chat.js — real multiplayer chat for the Navi CHAT module (2026-10-15).
 *
 * Relays through the existing poll-based relay in backend/multiplayer.js (POST /api/mp/sync, /api/mp/chat):
 *   Global  -> room 'w3d-global'
 *   Nearby  -> room 'w3d-near-<cx>_<cz>' (the 600-unit map cell you stand in; changes as you travel)
 *   Party   -> room 'w3d-party-<code>' (localStorage shd_party, set via WorldNaviChat.joinParty(code))
 *   Agent   -> /api/shaddai/chat (SHADDAI agent server); a clear notice if it is offline
 * Only rooms you have a name for are synced; the sync also reports your presence (x/z) so "online" counts work.
 *   WorldNaviChat.start({ getPlayer })  · joinParty(code) · stop()
 */
(function (root) {
  'use strict';
  var ID_KEY = 'shd_mp_id', PARTY_KEY = 'shd_party', CELL = 600, POLL_MS = 2500, MAX_FAILS = 6;
  var timer = null, fails = 0, inFlight = false, getPlayer = null, seen = {};

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
      return post('/api/mp/sync', { room: R[ch], id: id, name: me, agent: '', x: Math.round(p.x), y: Math.round(p.z) }).then(function (d) {
        if (!d || d.ok !== true) throw new Error('not ok');
        var msgs = (d.chat || []).map(function (m) { return { u: m.name, t: m.text, me: m.name === me, at: m.t }; });
        var key = msgs.length ? msgs[msgs.length - 1].at + '|' + msgs.length : '0';
        if (seen[ch] !== key) { seen[ch] = key; root.Navi.chatSet(ch, msgs); }
      });
    })).then(function () { fails = 0; }, function () { if (++fails >= MAX_FAILS) { stop(); if (root.Navi.toast) root.Navi.toast('Chat offline (server unreachable)'); } })
      .then(function () { inFlight = false; });
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
    post('/api/mp/chat', { room: R[ch], id: myId(), name: nm, text: text }).then(syncAll, function () { root.Navi.chatPush(ch, { u: 'system', t: 'Message not sent (offline).', me: false, at: Date.now() }); });
  }

  function start(o) {
    getPlayer = (o && o.getPlayer) || getPlayer;
    root.NaviHooks = root.NaviHooks || {};
    root.NaviHooks.sendChat = sendChat;
    root.NaviHooks.onName = function () { syncAll(); };
    if (!timer) timer = setInterval(syncAll, POLL_MS);
    syncAll();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  root.WorldNaviChat = { start: start, stop: stop, joinParty: function (code) { if (/^[\w-]{1,40}$/.test(code || '')) { ls(PARTY_KEY, code); syncAll(); return true; } return false; },
    _rooms: rooms, _sync: syncAll, _send: sendChat };
})(typeof window !== 'undefined' ? window : globalThis);
