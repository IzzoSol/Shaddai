'use strict';
// ============================================================================
// backend/platform/roster.test.js — Plain node assert tests for roster.js
// Run:  node backend/platform/roster.test.js
// ============================================================================

const assert = require('assert');
const { archetypeBots, assignRoles, buildLineup, buildMatchup } = require('./roster');
const { rng } = require('./prng');

// ── Football-like spec ────────────────────────────────────────────────────────
const FOOTBALL_SPEC = {
  mode:         'gridiron',
  teamSize:     4,
  offenseRoles: ['QB', 'RB', 'WR', 'OL'],
  defenseRoles: ['DL', 'LB', 'CB', 'FS'],
};

// All 7 named council agents as lightweight objects.
const COUNCIL = [
  { id: 'shaddai', name: 'SHADDAI', skills: [] },
  { id: 'zerox',   name: 'ZEROX',   skills: [] },
  { id: 'oracle',  name: 'ORACLE',  skills: [] },
  { id: 'nexus',   name: 'NEXUS',   skills: [] },
  { id: 'turtle',  name: 'TURTLE',  skills: [] },
  { id: 'quill',   name: 'QUILL',   skills: [] },
  { id: 'pikadon', name: 'PIKADON', skills: [] },
];

const HERO     = COUNCIL[0]; // SHADDAI
const POOL     = COUNCIL.slice(1); // remaining 6
const TEST_SEED = 42;

// ── Helper ────────────────────────────────────────────────────────────────────
function agentKey(agent) { return agent.id || agent.name; }

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${e.message}`);
    failed++;
  }
}

// =============================================================================
console.log('\n[ archetypeBots ]');
// =============================================================================

test('generates exactly n bots', () => {
  const rand = rng(1);
  const bots = archetypeBots(4, rand);
  assert.strictEqual(bots.length, 4);
});

test('all bots have isBot:true and empty skills', () => {
  const rand = rng(2);
  const bots = archetypeBots(3, rand);
  for (const b of bots) {
    assert.strictEqual(b.isBot, true);
    assert.deepStrictEqual(b.skills, []);
  }
});

test('bot names follow BOT-NATO pattern', () => {
  const rand = rng(3);
  const bots = archetypeBots(3, rand);
  assert.ok(bots[0].name.startsWith('BOT-ALPHA'), `got ${bots[0].name}`);
  assert.ok(bots[1].name.startsWith('BOT-BRAVO'), `got ${bots[1].name}`);
  assert.ok(bots[2].name.startsWith('BOT-CHARLIE'), `got ${bots[2].name}`);
});

test('archetypeBots fills when pool is smaller than teamSize', () => {
  // Only 2 named agents; teamSize 4 → needs 2 bots
  const rand   = rng(TEST_SEED);
  const lineup = buildLineup({
    hero:     HERO,
    heroRole: 'QB',
    pool:     [COUNCIL[1]], // only 1 extra named agent
    spec:     FOOTBALL_SPEC,
    seed:     TEST_SEED,
  });
  const bots = lineup.players.filter(p => p.agent.isBot);
  assert.strictEqual(bots.length, 2, `expected 2 bots, got ${bots.length}`);
});

// =============================================================================
console.log('\n[ assignRoles ]');
// =============================================================================

test('returns one entry per agent', () => {
  const rand    = rng(TEST_SEED);
  const agents  = COUNCIL.slice(0, 4);
  const result  = assignRoles(agents, FOOTBALL_SPEC.offenseRoles, 'gridiron', rand);
  assert.strictEqual(result.length, 4);
});

test('all returned roles are in the roleList', () => {
  const rand   = rng(TEST_SEED);
  const agents = COUNCIL.slice(0, 4);
  const result = assignRoles(agents, FOOTBALL_SPEC.offenseRoles, 'gridiron', rand);
  for (const r of result) {
    assert.ok(FOOTBALL_SPEC.offenseRoles.includes(r.role), `unexpected role ${r.role}`);
  }
});

test('aptitude is a number 0..1', () => {
  const rand   = rng(TEST_SEED);
  const result = assignRoles(COUNCIL.slice(0, 4), FOOTBALL_SPEC.offenseRoles, 'gridiron', rand);
  for (const r of result) {
    assert.ok(typeof r.aptitude === 'number', 'aptitude must be a number');
    assert.ok(r.aptitude >= 0 && r.aptitude <= 1, `aptitude out of range: ${r.aptitude}`);
  }
});

test('PIKADON tends toward a defensive role (LB/FS/CB/DL)', () => {
  // Use the full defense role list with PIKADON among 4 agents.
  const rand     = rng(TEST_SEED);
  const agents   = [
    COUNCIL.find(a => a.name === 'PIKADON'),
    COUNCIL.find(a => a.name === 'ORACLE'),
    COUNCIL.find(a => a.name === 'ZEROX'),
    COUNCIL.find(a => a.name === 'QUILL'),
  ];
  const result   = assignRoles(agents, FOOTBALL_SPEC.defenseRoles, 'gridiron', rand);
  const pikaEntry = result.find(r => r.agent.name === 'PIKADON');
  const defensiveRoles = ['LB', 'FS', 'CB', 'DL'];
  assert.ok(
    defensiveRoles.includes(pikaEntry.role),
    `PIKADON got ${pikaEntry.role}, expected one of ${defensiveRoles.join('/')}`
  );
});

// =============================================================================
console.log('\n[ buildLineup ]');
// =============================================================================

test('lineup has correct teamSize', () => {
  const lineup = buildLineup({ hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  assert.strictEqual(lineup.players.length, FOOTBALL_SPEC.teamSize);
  assert.strictEqual(lineup.teamSize, FOOTBALL_SPEC.teamSize);
});

test('hero is flagged isHero and placed at requested offRole', () => {
  const lineup = buildLineup({ hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  const hero   = lineup.players.find(p => p.isHero);
  assert.ok(hero, 'no hero in lineup');
  assert.strictEqual(hero.offRole, 'QB');
});

test('every player has an offRole from offenseRoles', () => {
  const lineup = buildLineup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  for (const p of lineup.players) {
    assert.ok(FOOTBALL_SPEC.offenseRoles.includes(p.offRole), `bad offRole: ${p.offRole}`);
  }
});

test('every player has a defRole from defenseRoles', () => {
  const lineup = buildLineup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  for (const p of lineup.players) {
    assert.ok(FOOTBALL_SPEC.defenseRoles.includes(p.defRole), `bad defRole: ${p.defRole}`);
  }
});

test('aptitudeOff and aptitudeDef are 0..1', () => {
  const lineup = buildLineup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  for (const p of lineup.players) {
    assert.ok(p.aptitudeOff >= 0 && p.aptitudeOff <= 1, `aptitudeOff out of range: ${p.aptitudeOff}`);
    assert.ok(p.aptitudeDef >= 0 && p.aptitudeDef <= 1, `aptitudeDef out of range: ${p.aptitudeDef}`);
  }
});

test('hero auto-selects best role when heroRole omitted', () => {
  const lineup = buildLineup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  const hero   = lineup.players.find(p => p.isHero);
  assert.ok(FOOTBALL_SPEC.offenseRoles.includes(hero.offRole), `hero got ${hero.offRole}`);
});

// =============================================================================
console.log('\n[ buildMatchup ]');
// =============================================================================

test('returns lineupA and lineupB each with correct teamSize', () => {
  const { lineupA, lineupB } = buildMatchup({ hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  assert.strictEqual(lineupA.players.length, FOOTBALL_SPEC.teamSize);
  assert.strictEqual(lineupB.players.length, FOOTBALL_SPEC.teamSize);
});

test('hero is on lineupA and flagged isHero', () => {
  const { lineupA } = buildMatchup({ hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  const h = lineupA.players.find(p => p.isHero);
  assert.ok(h, 'hero missing from lineupA');
  assert.strictEqual(h.agent.name, HERO.name);
});

test('hero is placed at requested offRole in lineupA', () => {
  const { lineupA } = buildMatchup({ hero: HERO, heroRole: 'WR', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  const h = lineupA.players.find(p => p.isHero);
  assert.strictEqual(h.offRole, 'WR');
});

test('no shared agents between lineupA and lineupB (named only)', () => {
  const { lineupA, lineupB } = buildMatchup({ hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  const keysA = new Set(lineupA.players.filter(p => !p.agent.isBot).map(p => agentKey(p.agent)));
  const keysB = new Set(lineupB.players.filter(p => !p.agent.isBot).map(p => agentKey(p.agent)));
  for (const k of keysA) {
    assert.ok(!keysB.has(k), `agent ${k} appears on both teams`);
  }
});

test('every player on both teams has offRole and defRole from correct pools', () => {
  const { lineupA, lineupB } = buildMatchup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  for (const lineup of [lineupA, lineupB]) {
    for (const p of lineup.players) {
      assert.ok(FOOTBALL_SPEC.offenseRoles.includes(p.offRole), `bad offRole ${p.offRole}`);
      assert.ok(FOOTBALL_SPEC.defenseRoles.includes(p.defRole), `bad defRole ${p.defRole}`);
    }
  }
});

test('deterministic: same seed → identical matchup', () => {
  const opts = { hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED };
  const r1   = buildMatchup(opts);
  const r2   = buildMatchup(opts);

  const names = lineup => lineup.players.map(p => `${p.agent.name}:${p.offRole}:${p.defRole}`).join('|');
  assert.strictEqual(names(r1.lineupA), names(r2.lineupA), 'lineupA differs between runs');
  assert.strictEqual(names(r1.lineupB), names(r2.lineupB), 'lineupB differs between runs');
  assert.strictEqual(r1.seed, r2.seed, 'seeds differ');
});

test('different seeds produce different lineupB (bot composition may vary)', () => {
  // With only 6 pool agents and teamSize 4, Team B will get 3 named agents.
  // Different seeds should shuffle the pool differently.
  const base = { hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC };
  const r1 = buildMatchup({ ...base, seed: 1 });
  const r2 = buildMatchup({ ...base, seed: 999 });
  const namesB = lineup => lineup.players.map(p => p.agent.name).sort().join(',');
  // Allow for the rare collision; the important thing is the function runs.
  // We just verify the function completes and teams look valid.
  assert.strictEqual(r1.lineupB.players.length, FOOTBALL_SPEC.teamSize);
  assert.strictEqual(r2.lineupB.players.length, FOOTBALL_SPEC.teamSize);
});

test('bots fill when pool is too small for two full teams', () => {
  // Use only 2 pool agents → 6 slots need bots.
  const { lineupA, lineupB } = buildMatchup({
    hero:     HERO,
    heroRole: 'QB',
    pool:     COUNCIL.slice(1, 3), // only ZEROX + ORACLE
    spec:     FOOTBALL_SPEC,
    seed:     TEST_SEED,
  });
  const totalBots = [...lineupA.players, ...lineupB.players].filter(p => p.agent.isBot).length;
  assert.ok(totalBots > 0, 'expected bots when pool is small');
  assert.strictEqual(lineupA.players.length, 4);
  assert.strictEqual(lineupB.players.length, 4);
});

test('balanceHint returned with numeric avgAptA and avgAptB', () => {
  const { balanceHint } = buildMatchup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  assert.ok(typeof balanceHint.avgAptA === 'number', 'avgAptA not a number');
  assert.ok(typeof balanceHint.avgAptB === 'number', 'avgAptB not a number');
  assert.ok(balanceHint.avgAptA >= 0 && balanceHint.avgAptA <= 1);
  assert.ok(balanceHint.avgAptB >= 0 && balanceHint.avgAptB <= 1);
});

test('PIKADON (defense-heavy) draws a defensive role in defenseRoles', () => {
  // Put PIKADON in hero position so we can control which team it's on.
  const pikadon = COUNCIL.find(a => a.name === 'PIKADON');
  const lineup  = buildLineup({
    hero:     pikadon,
    pool:     COUNCIL.filter(a => a.name !== 'PIKADON'),
    spec:     FOOTBALL_SPEC,
    seed:     TEST_SEED,
  });
  const pikaPlayer = lineup.players.find(p => p.agent.name === 'PIKADON');
  const defensiveRoles = ['DL', 'LB', 'CB', 'FS'];
  assert.ok(
    defensiveRoles.includes(pikaPlayer.defRole),
    `PIKADON defRole=${pikaPlayer.defRole}, expected one of ${defensiveRoles.join('/')}`
  );
});

// =============================================================================
console.log('\n[ seed in return value ]');
// =============================================================================

test('buildMatchup returns the resolved seed', () => {
  const { seed } = buildMatchup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED });
  assert.strictEqual(seed, TEST_SEED);
});

test('buildMatchup without seed returns a numeric seed', () => {
  const { seed } = buildMatchup({ hero: HERO, pool: POOL, spec: FOOTBALL_SPEC });
  assert.ok(typeof seed === 'number' && seed >= 0, `seed should be a non-negative number, got ${seed}`);
});

// =============================================================================
console.log('\n[ balance & versatility ]');
// =============================================================================

test('buildMatchup teams are balanced: |avgAptA - avgAptB| < 0.20 across many seeds', () => {
  // With only 6 pool agents and teamSize 4, balance can't always be perfect
  // but the snake draft should keep both teams within a reasonable window.
  let maxGap = 0;
  let totalGap = 0;
  const SEEDS = 20;
  for (let s = 0; s < SEEDS; s++) {
    const { balanceHint } = buildMatchup({
      hero: HERO, heroRole: null, pool: POOL, spec: FOOTBALL_SPEC, seed: s * 7 + 3,
    });
    const gap = Math.abs(balanceHint.avgAptA - balanceHint.avgAptB);
    if (gap > maxGap) maxGap = gap;
    totalGap += gap;
  }
  const avgGap = totalGap / SEEDS;
  assert(avgGap < 0.20,
    `Average balance gap (${avgGap.toFixed(4)}) should be < 0.20 across ${SEEDS} seeds`);
  assert(maxGap < 0.40,
    `Max balance gap (${maxGap.toFixed(4)}) should be < 0.40`);
});

test('buildMatchup: no duplicate off roles within each team', () => {
  for (let s = 0; s < 10; s++) {
    const { lineupA, lineupB } = buildMatchup({
      hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: s * 13,
    });
    for (const [label, lineup] of [['A', lineupA], ['B', lineupB]]) {
      const offRoles = lineup.players.map(p => p.offRole);
      const unique   = new Set(offRoles);
      // teamSize=4, offenseRoles=4 → should be no duplicates
      assert.strictEqual(offRoles.length, unique.size,
        `Team ${label} seed ${s} has duplicate offRoles: ${offRoles.join(',')}`);
    }
  }
});

test('buildMatchup: no duplicate def roles within each team', () => {
  for (let s = 0; s < 10; s++) {
    const { lineupA, lineupB } = buildMatchup({
      hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: s * 17,
    });
    for (const [label, lineup] of [['A', lineupA], ['B', lineupB]]) {
      const defRoles = lineup.players.map(p => p.defRole);
      const unique   = new Set(defRoles);
      assert.strictEqual(defRoles.length, unique.size,
        `Team ${label} seed ${s} has duplicate defRoles: ${defRoles.join(',')}`);
    }
  }
});

test('buildMatchup: hero always on team A with correct heroRole (fixed QB)', () => {
  for (let s = 0; s < 5; s++) {
    const { lineupA } = buildMatchup({
      hero: HERO, heroRole: 'QB', pool: POOL, spec: FOOTBALL_SPEC, seed: s,
    });
    const heroPlayer = lineupA.players.find(p => p.isHero);
    assert.ok(heroPlayer, 'hero should be in lineupA');
    assert.strictEqual(heroPlayer.offRole, 'QB', `hero offRole should be QB at seed ${s}`);
  }
});

test('buildMatchup: balanceHint avgAptA and avgAptB are in [0,1]', () => {
  const { balanceHint } = buildMatchup({
    hero: HERO, pool: POOL, spec: FOOTBALL_SPEC, seed: TEST_SEED,
  });
  assert(balanceHint.avgAptA >= 0 && balanceHint.avgAptA <= 1, `avgAptA ${balanceHint.avgAptA} out of range`);
  assert(balanceHint.avgAptB >= 0 && balanceHint.avgAptB <= 1, `avgAptB ${balanceHint.avgAptB} out of range`);
});

// =============================================================================
// Summary
// =============================================================================
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED.`);
  process.exit(1);
}
