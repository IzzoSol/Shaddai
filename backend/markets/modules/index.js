'use strict';
// Add a new strategy file here and it appears everywhere (API, UI, later TG/MCP).
const MODULES = [require('./stock-screener'), require('./crypto-momentum'), require('./prediction-watch')];
module.exports = { MODULES };
