// SHADDAI — lightweight multiplayer server (static file serve + WebSocket relay).
// Run:  node mp-server.js    then open  http://localhost:8790/_LAUNCH.html  in 2+ tabs.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, 'public');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/_LAUNCH.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
let nextId = 1;
const players = new Map(); // id -> {id,name,region,col,row,anim,rig}

function bcast(obj, except) { const s = JSON.stringify(obj);
  for (const c of wss.clients) { if (c !== except && c.readyState === 1) { try { c.send(s); } catch(e){} } } }

wss.on('connection', (ws) => {
  const id = 'p' + (nextId++);
  ws.pid = id;
  players.set(id, { id, name:'Traveler', region:null, col:30, row:30, anim:'idle', rig:null });
  ws.send(JSON.stringify({ t:'welcome', id }));
  for (const [pid, pl] of players) if (pid !== id) ws.send(JSON.stringify({ t:'state', ...pl }));

  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch(e){ return; }
    const pl = players.get(id); if (!pl) return;
    if (m.t === 'hello') { pl.name = String(m.name||'Traveler').slice(0,16); pl.rig = m.rig; pl.region = m.region; bcast({ t:'state', ...pl }, ws); }
    else if (m.t === 'move') { pl.col = m.col; pl.row = m.row; pl.anim = m.anim; if (m.region) pl.region = m.region; bcast({ t:'state', ...pl }, ws); }
    else if (m.t === 'region') { pl.region = m.region; bcast({ t:'state', ...pl }, ws); }
    else if (m.t === 'chat') { const text = String(m.text||'').slice(0,200); if (text) bcast({ t:'chat', id, name:pl.name, region:pl.region, text }); }
  });
  ws.on('close', () => { players.delete(id); bcast({ t:'leave', id }); });
  ws.on('error', () => {});
});

const PORT = process.env.PORT || process.env.MP_PORT || 8790;   // Render sets PORT
server.listen(PORT, '0.0.0.0', () => console.log('SHADDAI multiplayer live → http://localhost:' + PORT + '/_LAUNCH.html  (open in 2 tabs)'));
