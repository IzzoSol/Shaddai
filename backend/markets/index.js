'use strict';
const path = require('node:path');
const { makeJsonFetcher } = require('./http');
const { createYahooAdapter } = require('./adapters/yahoo');
const { createCoinGeckoAdapter } = require('./adapters/coingecko');
const { createPolymarketAdapter } = require('./adapters/polymarket');
const { fetchBasket } = require('./adapters/basket');
const { MODULES } = require('./modules');
const { createEngine } = require('./engine');
const { createPaper } = require('./paper');
const { createRouter } = require('./routes');

function createDefault() {
  const getJson = makeJsonFetcher();
  const engine = createEngine({
    adapters: [createYahooAdapter(getJson), createCoinGeckoAdapter(getJson), createPolymarketAdapter(getJson)],
    modules: MODULES,
    getBasket: () => fetchBasket(getJson),
  });
  // NOTE: the host disk can be ephemeral (Render), so the paper ledger may reset on deploy. Fine for paper; revisit if it becomes valuable.
  const paper = createPaper({ file: path.join(__dirname, '..', '..', 'data', 'markets-paper.json') });
  return createRouter({ engine, paper });
}
module.exports = { createDefault };
