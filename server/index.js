const express = require('express');
const characterRoutes = require('./characterServer');
const marketRoutes = require('./marketServer');
const questRoutes = require('./questServer');
const plotRoutes = require('./plotServer');
const bonusRoutes = require('./bonusServer');
const dailyRoutes = require('./dailyServer');
const agentRoutes = require('./agentServer');
const schedulerRoutes = require('./jobs/scheduler');

const app = express();
app.use(express.json());
// Dev-only CORS: game.html is served by the main backend on a different
// port/origin than this standalone MMO server, so the browser needs this
// to allow the fetch() calls in public/js/mmo-client.js.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Mount route groups
app.use('/character', characterRoutes);
app.use('/market', marketRoutes);
app.use('/quest', questRoutes);
app.use('/plot', plotRoutes);
app.use('/bonus', bonusRoutes);
app.use('/daily', dailyRoutes);
app.use('/agent', agentRoutes);

// Scheduler exposes a /health view of registered jobs
app.use('/scheduler', schedulerRoutes);

// Simple health check
app.get('/', (req, res) => res.send('SHADDAI 2D MMO core server running'));

// Start server on port 3001 (different from the client dev server)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SHADDAI MMO server listening on http://localhost:${PORT}`);
});