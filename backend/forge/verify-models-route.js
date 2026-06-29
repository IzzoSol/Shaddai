// Isolated verification of GET /api/forge/models without touching the running
// production server. Mounts the real forge-routes on a temp port and probes.
const express = require('express');
const app = express();
app.use('/api/forge', require('./forge-routes'));
const srv = app.listen(0, async () => {
  const port = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/forge/models`);
    const body = await r.json();
    console.log('STATUS', r.status);
    console.log('archetypes:', Object.keys(body.archetypes || {}).join(', '));
    console.log(JSON.stringify(body, null, 2));
  } catch (e) { console.log('ERR', e.message); }
  srv.close();
});
