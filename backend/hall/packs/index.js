'use strict';
/**
 * backend/hall/packs/index.js — the Hall's pack registry. hall/routes.js
 * looks up `PACKS[match.pack]` here; adding a new pack is a one-line
 * addition, no route changes needed.
 *
 * The 4 arcade-bet pairings below reuse arcade-sim.js's own AFFINITY table
 * (the agents it already boosts for that game) rather than picking pairs
 * arbitrarily -- SHADDAI/ZEROX for basketball, etc. are that file's own
 * stated affinities, not a new decision made here.
 */

const blackjack = require('./blackjack');
const { makeArcadeBetPack } = require('./arcade-bet');

const basketball_bet = makeArcadeBetPack('basketball_bet', {
  game: 'basketball', label: 'Neon Hoops', agents: ['ZEROX', 'SHADDAI'],
});
const football_bet = makeArcadeBetPack('football_bet', {
  game: 'football', label: 'Grid Gridiron', agents: ['NEXUS', 'PIKADON'],
});
const dodgeball_bet = makeArcadeBetPack('dodgeball_bet', {
  game: 'dodgeball', label: 'Grid Dodgeball', agents: ['PIKADON', 'TURTLE'],
});
const sigilstorm_bet = makeArcadeBetPack('sigilstorm_bet', {
  game: 'sigil-storm', label: 'Sigil Storm', agents: ['ORACLE', 'NEXUS'],
});

module.exports = { blackjack, basketball_bet, football_bet, dodgeball_bet, sigilstorm_bet };
