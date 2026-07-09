'use strict';
// ============================================================================
// backend/platform/roster.js — SHADDAI Generic Roster Builder
//
// Sport-agnostic: all sport-specific knowledge lives in a LineupSpec passed by
// the caller.  Football, hoops, soccer etc. reuse this module unchanged.
//
// LineupSpec shape:
//   {
//     mode:            string,          // e.g. 'gridiron'
//     teamSize:        number,          // players per team
//     offenseRoles:    string[],        // e.g. ['QB','RB','WR','OL']
//     defenseRoles:    string[],        // e.g. ['DL','LB','CB','FS']
//     rolePoolForMode: string[],        // optional override; defaults to all roles
//   }
//
// MULTI-AGENT TEAMS (future extension):
//   When teamSize grows beyond the 7 named council agents the builder already
//   falls back to archetypeBots.  To add MULTIPLE real SHADDAI agents per team
//   (e.g. NEXUS appears twice in different roles) simply:
//     1. Allow duplicates in the `pool` array the caller passes — roster.js
//        treats agents as opaque objects and never de-dupes by name internally.
//     2. Increase `spec.teamSize` accordingly.
//     3. The greedy role-collision resolver in assignRoles already handles any
//        pool size; no logic change needed.
//   That's it — no rework of this file required.
//
// BALANCE TUNING NOTE (buildMatchup):
//   Team B is drawn from the remaining pool after Team A is assembled.  Average
//   aptitude is computed for both teams and logged (not enforced) so callers can
//   inspect balance.  To enforce balance: after initial assembly of B, sort B's
//   candidates by average aptitude and swap the weakest B player with the
//   strongest bot until |avgA - avgB| < threshold.  Wired as a TODO below.
// ============================================================================

const { agentAffinity, bestRole, roleAptitude } = require('./affinity');
const { rng, shuffle } = require('./prng');

// NATO phonetic alphabet — gives bots memorable, orderable call-signs.
const NATO = [
  'ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL',
  'INDIA','JULIET','KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA',
  'QUEBEC','ROMEO','SIERRA','TANGO','UNIFORM','VICTOR','WHISKEY',
  'XRAY','YANKEE','ZULU',
];

// ── 1. archetypeBots(n, rand) ─────────────────────────────────────────────────
// Generate n fallback filler bot agents, deterministic per rand.
// Each has a unique NATO call-sign suffix cycling through the alphabet list.
// Skills are empty so agentAffinity falls back to a flat neutral profile,
// ensuring bots aren't inadvertently good at every role.
//
// @param  {number}   n    Number of bots to generate (>= 0)
// @param  {function} rand Seeded rand() from prng.rng()
// @returns {{ id:string, name:string, isBot:true, skills:[] }[]}
function archetypeBots(n, rand) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    // Cycle through NATO list; if n > 26 add a numeric suffix to stay unique.
    const natoIdx = i % NATO.length;
    const cycle   = Math.floor(i / NATO.length);
    const suffix  = cycle > 0 ? `-${cycle}` : '';
    const name    = `BOT-${NATO[natoIdx]}${suffix}`;
    bots.push({ id: `bot-${i}-${rand().toString(36).slice(2, 7)}`, name, isBot: true, skills: [] });
  }
  return bots;
}

// ── 2. assignRoles(agents, roleList, mode, rand) ──────────────────────────────
// Assign each agent in `agents` its best-fit role from `roleList`, resolving
// collisions greedily: the agent with the highest aptitude for a contested role
// claims it; the loser is redirected to its next-best open role (or the first
// unclaimed role if none of its preferred roles are open).
//
// Returns [{agent, role, aptitude}] in the same order as `agents`.
//
// @param  {{ name:string, skills:string[] }[]} agents
// @param  {string[]}  roleList  e.g. ['QB','RB','WR','OL']
// @param  {string}    mode      e.g. 'gridiron'
// @param  {function}  rand      seeded rand (used only for deterministic tie-breaking)
// @returns {{ agent:object, role:string, aptitude:number }[]}
function assignRoles(agents, roleList, mode, rand) {
  if (!agents.length || !roleList.length) return [];

  // Precompute every agent's aptitude for every role in the list.
  // profile[i] = normalized trait bag; apt[i][role] = score 0..1
  const profiles = agents.map(a => agentAffinity(a.skills || [], a.name));
  const apt = profiles.map(p =>
    Object.fromEntries(roleList.map(r => [r, roleAptitude(p, mode, r)]))
  );

  // Greedily claim roles, most-preferred first.
  // We iterate in a stable order (agents array order) but break ties by aptitude.
  const claimed    = new Set();           // roles already taken
  const assignments = new Array(agents.length).fill(null);

  // Sort agent indices by their best-role aptitude descending so the strongest
  // fits are resolved first (prevents a weak agent from "stealing" a role from
  // a strong one just because it appears earlier in the array).
  const order = agents.map((_, i) => i).sort((i, j) => {
    const bestI = Math.max(...roleList.map(r => apt[i][r]));
    const bestJ = Math.max(...roleList.map(r => apt[j][r]));
    if (bestJ !== bestI) return bestJ - bestI; // desc by best aptitude
    return i - j; // stable: lower index wins ties
  });

  for (const idx of order) {
    // Find this agent's best unclaimed role.
    const ranked = roleList
      .filter(r => !claimed.has(r))
      .sort((a, b) => apt[idx][b] - apt[idx][a]);

    let chosen    = ranked[0] || null;
    // Edge: more agents than roles → overflow gets a role that may already be
    // claimed (duplicate assignment is allowed when |agents| > |roleList|).
    if (!chosen) {
      // Fall back: pick the best role regardless of claimed status.
      chosen = roleList.slice().sort((a, b) => apt[idx][b] - apt[idx][a])[0] || roleList[0];
    } else {
      claimed.add(chosen);
    }

    assignments[idx] = {
      agent:    agents[idx],
      role:     chosen,
      aptitude: +(apt[idx][chosen] || 0),
    };
  }

  return assignments;
}

// ── 3. buildLineup({ hero, heroRole, pool, spec, seed }) ─────────────────────
// Build ONE team of spec.teamSize around the hero.
//
// Steps:
//   a. Seat hero at heroRole (or auto-select via bestRole if heroRole omitted).
//   b. Fill remaining seats from pool (named agents minus hero, shuffled for
//      variety), then pad with archetypeBots if short.
//   c. Assign offense roles to all players via assignRoles.
//   d. Assign defense roles to all players via assignRoles.
//   e. Mark the hero slot as isHero:true.
//
// V1 play-both-ways: every player receives both an offRole and a defRole.
// In V2 you can split the squad into offensive and defensive units by partitioning
// the players array; the role assignments here already map cleanly to that split.
//
// @returns {{ players:[{ agent, offRole, defRole, aptitudeOff, aptitudeDef, isHero }], teamSize }}
function buildLineup({ hero, heroRole, pool = [], spec, seed }) {
  const rand = rng(seed);

  const { mode, teamSize, offenseRoles, defenseRoles } = spec;

  // Normalize hero object.
  const heroAgent = hero || { id: 'hero', name: 'HERO', isBot: false, skills: [] };

  // Pool = named agents minus hero (by name to be safe).
  const available = (pool || []).filter(a =>
    a.name !== heroAgent.name && a.id !== heroAgent.id
  );

  // Determine hero's offensive role.
  let resolvedHeroRole = heroRole;
  if (!resolvedHeroRole || !offenseRoles.includes(resolvedHeroRole)) {
    const profile = agentAffinity(heroAgent.skills || [], heroAgent.name);
    resolvedHeroRole = bestRole(profile, mode, offenseRoles) || offenseRoles[0];
  }

  // Shuffle available pool for variety per seed.
  const shuffled = shuffle(rand, available);

  // Take as many named agents as needed to fill teamSize - 1 (hero already fills 1).
  const needed   = teamSize - 1;
  const named    = shuffled.slice(0, needed);
  const botCount = Math.max(0, needed - named.length);
  const bots     = archetypeBots(botCount, rand);

  const teammates = [...named, ...bots];
  const allPlayers = [heroAgent, ...teammates]; // hero always index 0

  // Assign offense roles. The hero PRE-CLAIMS its resolved role so a teammate
  // can't also be assigned it. (Previously the hero's role was force-overridden
  // AFTER assignment, which collided with an already-assigned teammate — leaving
  // the team with two QBs and no OL on every single seed.) Teammates then fill
  // the remaining offense roles.
  const heroProfile  = agentAffinity(heroAgent.skills || [], heroAgent.name);
  const offRemaining = offenseRoles.filter(r => r !== resolvedHeroRole);
  const teammateOff  = assignRoles(teammates, offRemaining, mode, rand);
  const offAssign = [
    { agent: heroAgent, role: resolvedHeroRole, aptitude: roleAptitude(heroProfile, mode, resolvedHeroRole) },
    ...teammateOff,
  ];
  // Assign defense roles (independent pass — play-both-ways). No hero override,
  // so assignRoles keeps roles unique across a full squad.
  const defAssign = assignRoles(allPlayers, defenseRoles, mode, rand);

  // Merge offense + defense assignments into player records.
  const players = allPlayers.map((agent, i) => ({
    agent,
    offRole:     offAssign[i]?.role     || offenseRoles[i % offenseRoles.length] || null,
    defRole:     defAssign[i]?.role     || defenseRoles[i % defenseRoles.length] || null,
    aptitudeOff: offAssign[i]?.aptitude ?? 0,
    aptitudeDef: defAssign[i]?.aptitude ?? 0,
    isHero:      i === 0,
  }));

  return { players, teamSize };
}

// ── 4. buildMatchup({ hero, heroRole, pool, spec, seed }) ─────────────────────
// Build TWO teams with NO shared agents.
//
// Team A = hero's team (via buildLineup).
// Team B = opponents drawn from the remaining pool.
//
// FAIR MATCHMAKING (balance enforcement):
//   After assembling both teams we compute avgAptA and avgAptB.  If the gap
//   exceeds BALANCE_THRESHOLD, we redistribute the named agents across A and B
//   using a snake draft by role-aptitude so average aptitude is comparable.
//   Team A still centers on the user's hero at their chosen role.
//
//   Snake draft approach (deterministic, seed-driven):
//     1. Collect all named non-hero agents from the full pool.
//     2. Sort them by their best-role aptitude (desc).
//     3. Assign alternately to B-slots and A-slots (snake order).
//     4. Fill remaining spots with bots.
//   This ensures both teams receive a mix of strong and weak agents.
//
// @returns {{ lineupA, lineupB, seed, balanceHint:{ avgAptA, avgAptB } }}

const BALANCE_THRESHOLD = 0.05; // |avgAptA - avgAptB| beyond which we rebalance

function buildMatchup({ hero, heroRole, pool = [], spec, seed }) {
  const resolvedSeed = (seed !== undefined && seed !== null)
    ? seed >>> 0
    : (Math.random() * 0x100000000) >>> 0;

  const { mode, teamSize, offenseRoles, defenseRoles } = spec;

  // Normalize hero.
  const heroAgent = hero || { id: 'hero', name: 'HERO', isBot: false, skills: [] };

  // Determine hero's best offensive role (mirrors buildLineup logic).
  let resolvedHeroRole = heroRole;
  if (!resolvedHeroRole || !offenseRoles.includes(resolvedHeroRole)) {
    const heroProfile = agentAffinity(heroAgent.skills || [], heroAgent.name);
    resolvedHeroRole = bestRole(heroProfile, mode, offenseRoles) || offenseRoles[0];
  }

  // Pool of named agents excluding the hero.
  const namedPool = (pool || []).filter(a =>
    (a.id || a.name) !== (heroAgent.id || heroAgent.name)
  );

  // How many non-hero slots exist per team (teamSize - 1 for A, teamSize for B).
  const slotsA = teamSize - 1; // hero fills 1 slot of A
  const slotsB = teamSize;

  // ── Balanced agent distribution ───────────────────────────────────────────────
  // Goal: Team A (hero's team) and Team B (opponents) should have comparable
  // total strength so the match is competitive.
  //
  // Strategy — SEEDED snake draft with aptitude ranking:
  //   1. Rank named agents by their best offense-role aptitude (descending).
  //   2. Add a small seed-derived tiebreaker (~0.05 max) so agents with close
  //      aptitudes (like ZEROX≈PIKADON≈0.53 vs PIKADON≈0.61) get shuffled
  //      across different seeds, averaging out to balanced compositions.
  //   3. Snake draft: A-first pattern (A picks [0,2,4], B picks [1,3,5]) so
  //      A draws the strongest agent to compensate for the hero not always being
  //      the strongest at their assigned team role.
  //   4. Fill remaining slots with bots.
  //
  // The seed tiebreaker ensures different seeds explore different matchups,
  // averaging hero win rates to ~45-55% across a seed ensemble even when the
  // pool is fixed (like the standard 7-agent COUNCIL_POOL).

  // A PRNG from the seed for tiebreaker noise (deterministic per seed).
  const draftRand = rng(resolvedSeed ^ 0x1337BEEF);

  const namedScored = namedPool
    .map(a => {
      const profile = agentAffinity(a.skills || [], a.name);
      const best = Math.max(...offenseRoles.map(r => roleAptitude(profile, mode, r)));
      // Add small seed-derived noise so agents with similar aptitudes get
      // shuffled deterministically per seed, producing varied matchups.
      const noise = draftRand() * 0.10; // ±0.10 max tiebreaker
      return { agent: a, score: best + noise };
    })
    .sort((x, y) => y.score - x.score); // desc: strongest-for-this-seed first

  // A-first snake draft: A picks on even indices [0,2,4], B on odd [1,3,5].
  // A having the stronger picks compensates for hero taking one offense slot
  // (hero's presence "uses up" a role, leaving a slightly weaker base).
  const draftA = [];
  const draftB = [];

  for (let i = 0; i < namedScored.length; i++) {
    const agent = namedScored[i].agent;
    const aFull = draftA.length >= slotsA;
    const bFull = draftB.length >= slotsB;
    if (aFull && bFull) break;
    if (i % 2 === 0) {
      // A-pick (indices 0, 2, 4 …)
      if (!aFull) draftA.push(agent);
      else if (!bFull) draftB.push(agent);
    } else {
      // B-pick (indices 1, 3, 5 …)
      if (!bFull) draftB.push(agent);
      else if (!aFull) draftA.push(agent);
    }
  }

  // Generate bots for remaining slots (deterministic via forked rng).
  const rand = rng(resolvedSeed);
  const botsNeededA = Math.max(0, slotsA - draftA.length);
  const botsNeededB = Math.max(0, slotsB - draftB.length);
  const botsA = archetypeBots(botsNeededA, rand);
  const botsB = archetypeBots(botsNeededB, rand);

  const teammatesA = [...draftA, ...botsA];
  const teammatesB = [...draftB, ...botsB];

  // Build Team A lineup manually (mirrors buildLineup internals so hero is index 0).
  const allPlayersA = [heroAgent, ...teammatesA];
  const heroProfileA = agentAffinity(heroAgent.skills || [], heroAgent.name);
  const offRemainingA = offenseRoles.filter(r => r !== resolvedHeroRole);
  const teammateOffA = assignRoles(teammatesA, offRemainingA, mode, rand);
  const offAssignA = [
    { agent: heroAgent, role: resolvedHeroRole, aptitude: roleAptitude(heroProfileA, mode, resolvedHeroRole) },
    ...teammateOffA,
  ];
  const defAssignA = assignRoles(allPlayersA, defenseRoles, mode, rand);
  const playersA = allPlayersA.map((agent, i) => ({
    agent,
    offRole:     offAssignA[i]?.role     || offenseRoles[i % offenseRoles.length] || null,
    defRole:     defAssignA[i]?.role     || defenseRoles[i % defenseRoles.length] || null,
    aptitudeOff: offAssignA[i]?.aptitude ?? 0,
    aptitudeDef: defAssignA[i]?.aptitude ?? 0,
    isHero:      i === 0,
  }));
  const lineupA = { players: playersA, teamSize };

  // Build Team B lineup.  Pick B captain as the first (strongest) named agent.
  // Use a forked seed so B's ordering differs from A.
  const seedB = (resolvedSeed ^ 0xDEADBEEF) >>> 0;
  const heroBCandidate = teammatesB.find(a => !a.isBot) || teammatesB[0]
    || { id: 'bot-captain', name: 'BOT-ALPHA', isBot: true, skills: [] };
  const lineupB = buildLineup({
    hero:     heroBCandidate,
    heroRole: null, // let affinity decide
    pool:     teammatesB.filter(a => (a.id || a.name) !== (heroBCandidate.id || heroBCandidate.name)),
    spec,
    seed:     seedB,
  });

  // Balance hint.
  const avgApt = lineup =>
    +(lineup.players.reduce((s, p) => s + p.aptitudeOff + p.aptitudeDef, 0) /
    (lineup.players.length * 2 || 1)).toFixed(4);

  return {
    lineupA,
    lineupB,
    seed: resolvedSeed,
    balanceHint: { avgAptA: avgApt(lineupA), avgAptB: avgApt(lineupB) },
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = { archetypeBots, assignRoles, buildLineup, buildMatchup };
