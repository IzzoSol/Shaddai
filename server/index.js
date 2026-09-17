const express = require('express');
const characterRoutes = require('./characterServer');
const marketRoutes = require('./marketServer');
const questRoutes = require('./questServer');
const schedulerRoutes = require('./jobs/scheduler');

const app = express();
app.use(express.json());

// Mount route groups
app.use('/character', characterRoutes);
app.use('/market', marketRoutes);
app.use('/quest', questRoutes);

// Scheduler exposes a /health view of registered jobs
app.use('/scheduler', schedulerRoutes);

// Simple health check
app.get('/', (req, res) => res.send('SHADDAI 2D MMO core server running'));

// Start server on port 3001 (different from the client dev server)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SHADDAI MMO server listening on http://localhost:${PORT}`);
});