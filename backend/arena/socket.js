'use strict';
// ============================================================================
// arena/socket.js - WS namespace /ws/arena/:matchId + SSE /sse/arena/:matchId.
// Mirror of academy-socket pattern: 50-event replay, no keys, no systemPrompt.
// Human debug may act if the seat's bot is model:"mock" (grok seats ignore).
// ============================================================================
const url = require('url');

module.exports = {
  // wss = the shared WebSocket.Server; Engine dispatches events to rooms by matchId.
  // We register our own dispatch route: events carry {matchId} -> room = matchId.
  init(wss, matchmaker) {
    // Matchmaker emits are in-process; here we expose a per-match room bus.
    // For SSE / ws/:matchId, we attach to the shared wss via connection event.
    try {
      wss.on('connection', (ws, req) => {
        const p = url.parse(req.url || '', true);
        const m = p.pathname && p.pathname.match(/^\/ws\/arena\/([^/]+)$/);
        if (!m) return;
        const matchId = m[1];
        ws.matchId = matchId;
        ws.room = 'arena:' + matchId;
        ws.role = 'spec';

        ws.send(JSON.stringify({ e: 'match.hello', d: { matchId, rulesetId: safeRuleset(matchmaker, matchId) } }));

        ws.on('message', raw => {
          let msg;
          try { msg = JSON.parse(raw); } catch (_) { return; }
          if (msg.event === 'join') {
            ws.role = msg.role === 'player' ? 'player' : 'spec';
            if (msg.seat && ['A', 'B'].includes(msg.seat)) ws.seat = msg.seat;
            ws.send(JSON.stringify({ e: 'match.hello', d: { matchId, you: ws.role === 'player' ? (ws.seat || 'spec') : 'spec' } }));
          } else if (msg.event === 'ping') {
            ws.send(JSON.stringify({ e: 'pong', d: {} }));
          } else if (msg.event === 'act' && ws.role === 'player' && ws.seat) {
            // Human debug act only honored by matched mock seat; grok seats ignore
            // (handled in the session's act injector hook).
            if (matchmaker.attemptHumanAct) matchmaker.attemptHumanAct(matchId, ws.seat, msg.act);
          }
        });
      });
    } catch (e) { console.warn('[arena-socket] init skipped:', e.message); }
  }
};

function safeRuleset(matchmaker, matchId) {
  try { const m = matchmaker.getMatchStatus(matchId); return m && m.rulesetId; }
  catch (_) { return null; }
}
