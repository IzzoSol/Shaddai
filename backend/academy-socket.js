'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI Agent Academy — socket layer (constitution §5).
//   - WS   /ws/academy   room = sessionId (one human + one Grok + optional town NPC)
//   - SSE  /sse/academy?sessionId=...
// Events: session.hello, catalog.results, quote.ready, tab.opened|spent|closed,
//   paybox.needs_approval|approved|rejected, policy.warn|blocked,
//   receipt.written, badge.granted, error
// Replay last 50 events on reconnect. No secrets on the wire.
// Socket displays state. Settlement is HTTP x402 / PayBox / channel settle.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');

let sessions = {};   // sessionId -> { ws: Set<ws>, sse: Set<res> }

function safeSend(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (_) {}
}
function sseSend(res, obj) {
  try { res.write('event: ' + (obj.type || 'message') + '\ndata: ' + JSON.stringify(obj) + '\n\n'); } catch (_) {}
}

function init(app, wss, engine) {
  // ---- subscribe to engine events -> fan out to room clients ----
  engine.bus.on('event', (ev) => {
    const sid = ev.sessionId;
    if (!sid) return;
    const room = sessions[sid];
    if (!room) return;
    for (const ws of room.ws) safeSend(ws, ev);
    for (const res of room.sse) sseSend(res, ev);
  });

  // ---- upgrade: /ws/academy?sessionId= ----
  wss.on('connection', (ws, req) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (_) { ws.close(); return; }
    if (url.pathname !== '/ws/academy') return; // let other handlers own it (handled above by wss anyway)
    const sid = url.searchParams.get('sessionId') || 'anon';
    const room = (sessions[sid] = sessions[sid] || { ws: new Set(), sse: new Set() });
    room.ws.add(ws);

    // replay last 50 events (constitution §5)
    const hist = engine.replay();
    for (const ev of hist) if (!ev.sessionId || ev.sessionId === sid) safeSend(ws, ev);

    ws.on('message', (m) => {
      let data; try { data = JSON.parse(m.toString()); } catch (_) { return; }
      // Clients may trigger engine ops by type here (e.g. {type:'runLesson'})
      if (data && data.type && engine[data.type]) {
        try { engine[data.type](data.args || {}); } catch (e) { safeSend(ws, { type: 'error', reason: String(e && e.message || e) }); }
      } else if (data && data.type === 'ack') {
        // client ack — nothing to persist; state lives in engine ledger
      }
    });

    ws.on('close', () => { room.ws.delete(ws); if (!room.ws.size && !room.sse.size) delete sessions[sid]; });
  });

  // ---- SSE: /sse/academy?sessionId= -
  app.get('/sse/academy', (req, res) => {
    const sid = req.query.sessionId || 'anon';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const room = (sessions[sid] = sessions[sid] || { ws: new Set(), sse: new Set() });
    room.sse.add(res);
    for (const ev of engine.replay()) if (!ev.sessionId || ev.sessionId === sid) sseSend(res, ev);
    req.on('close', () => { room.sse.delete(res); if (!room.ws.size && !room.sse.size) delete sessions[sid]; });
  });

  console.log('[academy] socket ready → /ws/academy + /sse/academy (50-event replay)');
}

module.exports = { init };
