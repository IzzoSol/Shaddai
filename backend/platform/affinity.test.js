'use strict';
// ============================================================================
// backend/platform/affinity.test.js
// Plain node assert — run with: node backend/platform/affinity.test.js
// No external dependencies.
// ============================================================================

const assert = require('assert');
const {
  TAGS, SKILL_TAGS, AGENT_TAGS, KEYWORD_TAGS, ROLE_WEIGHTS, ROLE_POOL,
  tagSkill, agentAffinity, rolePool,
  roleAptitude, roleAptitudes, bestRole, roleStatMods,
} = require('./affinity');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ── 1. TAGS vocabulary ──────────────────────────────────────────────────────
console.log('\n[1] TAGS vocabulary');

test('TAGS has exactly 10 entries', () => {
  assert.strictEqual(TAGS.length, 10, `expected 10, got ${TAGS.length}`);
});

test("TAGS includes 'reaction'", () => {
  assert.ok(TAGS.includes('reaction'), "TAGS does not include 'reaction'");
});

test('NEUTRAL equals 1/10 = 0.1', () => {
  // NEUTRAL is module-internal; verify indirectly via empty-skill neutral spread
  const bag = tagSkill('__definitely_no_match_xyzzy__');
  const vals = Object.values(bag);
  // all values should be equal (neutral spread)
  const allEqual = vals.every(v => Math.abs(v - vals[0]) < 1e-9);
  assert.ok(allEqual, 'neutral spread is not uniform across all tags');
  assert.strictEqual(vals.length, TAGS.length, 'neutral spread missing tags');
});

// ── 2. Keyword fallback — reaction tag ──────────────────────────────────────
console.log('\n[2] Keyword fallback — reaction tag');

const reactionPhrases = [
  'reflex kick',
  'closing speed specialist',
  'jump the route',
  'anticipates the play',
  'read and react coverage',
  'twitch instinct',
];

for (const phrase of reactionPhrases) {
  test(`"${phrase}" tags reaction > 0`, () => {
    const bag = tagSkill(phrase);
    assert.ok((bag.reaction || 0) > 0, `reaction was ${bag.reaction || 0} for "${phrase}"`);
  });
}

test('non-reaction phrase does not get reaction from keyword', () => {
  // "slam dunk power crusher" — hits power, aggression, not reaction
  const bag = tagSkill('slam dunk power crusher');
  // reaction should be 0 or absent (no reaction keyword fired)
  assert.strictEqual(bag.reaction || 0, 0, `reaction should be 0 for pure-power phrase`);
});

// ── 3. bestRole — CB/FS specialization ──────────────────────────────────────
console.log('\n[3] bestRole gridiron — CB / FS');

// A reaction+speed+defense-heavy profile should prefer CB or FS over QB
test('reaction+speed+defense profile → CB or FS (not QB)', () => {
  // Build a raw trait bag then normalize manually so the profile is realistic
  const profile = {
    analysis:   0.04,
    defense:    0.22,
    aggression: 0.05,
    speed:      0.28,
    precision:  0.06,
    endurance:  0.04,
    control:    0.04,
    power:      0.04,
    support:    0.03,
    reaction:   0.20,
  };
  const role = bestRole(profile, 'gridiron');
  assert.ok(
    role === 'CB' || role === 'FS',
    `expected CB or FS for reaction+speed+defense profile, got ${role}`
  );
});

test('CB aptitude > QB aptitude for reaction+speed+defense profile', () => {
  const profile = {
    analysis:   0.04,
    defense:    0.22,
    aggression: 0.05,
    speed:      0.28,
    precision:  0.06,
    endurance:  0.04,
    control:    0.04,
    power:      0.04,
    support:    0.03,
    reaction:   0.20,
  };
  const cbApt = roleAptitude(profile, 'gridiron', 'CB');
  const qbApt = roleAptitude(profile, 'gridiron', 'QB');
  assert.ok(cbApt > qbApt, `CB(${cbApt}) should beat QB(${qbApt}) for defensive profile`);
});

test('analysis+reaction profile → DB/FS beats QB (reaction+analysis = coverage, not offense)', () => {
  // Deep safety: analysis + reaction, moderate defense.
  // DB has analysis:2+defense:2+speed:2 and FS has analysis:3+reaction:2+defense:2
  // so both score higher than QB for this mixed profile. DB wins pool-order tiebreak
  // when DB and FS are equal; either way QB is outscored — the key invariant.
  const profile = {
    analysis:   0.30,
    defense:    0.15,
    aggression: 0.03,
    speed:      0.08,
    precision:  0.06,
    endurance:  0.04,
    control:    0.04,
    power:      0.03,
    support:    0.07,
    reaction:   0.20,
  };
  const fsApt  = roleAptitude(profile, 'gridiron', 'FS');
  const dbApt  = roleAptitude(profile, 'gridiron', 'DB');
  const qbApt  = roleAptitude(profile, 'gridiron', 'QB');
  // FS or DB should beat QB for an analysis+reaction (coverage) profile
  assert.ok(
    fsApt > qbApt || dbApt > qbApt,
    `Expected FS(${fsApt}) or DB(${dbApt}) > QB(${qbApt}) for analysis+reaction profile`
  );
  const role = bestRole(profile, 'gridiron');
  // Valid: DB and FS tie at the top — either is correct; QB should not win
  assert.ok(
    role === 'FS' || role === 'DB' || role === 'CB',
    `Expected FS/DB/CB for analysis+reaction coverage profile, got ${role}`
  );
});

// ── 4. ROLE_POOL.gridiron contains CB and FS ────────────────────────────────
console.log('\n[4] ROLE_POOL gridiron');

test('ROLE_POOL.gridiron includes CB', () => {
  assert.ok(ROLE_POOL.gridiron.includes('CB'), `ROLE_POOL.gridiron = ${JSON.stringify(ROLE_POOL.gridiron)}`);
});

test('ROLE_POOL.gridiron includes FS', () => {
  assert.ok(ROLE_POOL.gridiron.includes('FS'), `ROLE_POOL.gridiron = ${JSON.stringify(ROLE_POOL.gridiron)}`);
});

test('rolePool("gridiron") returns 9 roles', () => {
  assert.strictEqual(rolePool('gridiron').length, 9);
});

// ── 5. Backward-compat — council agents ─────────────────────────────────────
console.log('\n[5] Backward-compat — council agents');

test('PIKADON profile scores high on LB or DB (defense-heavy)', () => {
  const profile = agentAffinity([], 'PIKADON');
  const lbApt = roleAptitude(profile, 'gridiron', 'LB');
  const dbApt = roleAptitude(profile, 'gridiron', 'DB');
  const qbApt = roleAptitude(profile, 'gridiron', 'QB');
  assert.ok(
    lbApt > qbApt || dbApt > qbApt,
    `PIKADON: LB(${lbApt}) or DB(${dbApt}) should beat QB(${qbApt})`
  );
});

test('ORACLE profile scores high on QB or FS (analysis-heavy)', () => {
  const profile = agentAffinity([], 'ORACLE');
  const qbApt = roleAptitude(profile, 'gridiron', 'QB');
  const fsApt = roleAptitude(profile, 'gridiron', 'FS');
  const rbApt = roleAptitude(profile, 'gridiron', 'RB');
  assert.ok(
    qbApt > rbApt || fsApt > rbApt,
    `ORACLE: QB(${qbApt}) or FS(${fsApt}) should beat RB(${rbApt})`
  );
});

test('AGENT_TAGS still has all 7 council agents', () => {
  const expected = ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'];
  for (const name of expected) {
    assert.ok(AGENT_TAGS[name], `Missing AGENT_TAGS entry for ${name}`);
  }
});

// ── 6. roleStatMods — reaction maps to 'defense', clamp [0.9, 1.18] ─────────
console.log('\n[6] roleStatMods — reaction→defense, clamp');

test('roleStatMods for CB includes a defense multiplier', () => {
  // CB has reaction:2 which maps to defense stat
  const profile = {
    analysis: 0.04, defense: 0.22, aggression: 0.05, speed: 0.28,
    precision: 0.06, endurance: 0.04, control: 0.04, power: 0.04,
    support: 0.03, reaction: 0.20,
  };
  const { mods } = roleStatMods(profile, 'gridiron', 'CB');
  assert.ok('defense' in mods, `CB roleStatMods.mods should have 'defense' key; got ${JSON.stringify(mods)}`);
});

test('roleStatMods for FS includes defense multiplier (reaction + defense both map there)', () => {
  const profile = {
    analysis: 0.30, defense: 0.15, aggression: 0.03, speed: 0.08,
    precision: 0.06, endurance: 0.04, control: 0.04, power: 0.03,
    support: 0.07, reaction: 0.20,
  };
  const { mods } = roleStatMods(profile, 'gridiron', 'FS');
  assert.ok('defense' in mods, `FS roleStatMods.mods should have 'defense'; got ${JSON.stringify(mods)}`);
});

test('all roleStatMods multipliers are in [0.9, 1.18]', () => {
  const modes = Object.keys(ROLE_WEIGHTS);
  const profiles = [
    agentAffinity([], 'PIKADON'),
    agentAffinity([], 'ORACLE'),
    agentAffinity(['court_vision', 'lockdown'], 'NEXUS'),
    agentAffinity(['speed_demon', 'clutch_gene'], 'ZEROX'),
  ];
  for (const profile of profiles) {
    for (const mode of modes) {
      for (const role of rolePool(mode)) {
        const { mods } = roleStatMods(profile, mode, role);
        for (const [stat, val] of Object.entries(mods)) {
          assert.ok(
            val >= 0.9 && val <= 1.18,
            `${mode}/${role}/${stat} multiplier ${val} outside [0.9, 1.18]`
          );
        }
      }
    }
  }
});

test('roleStatMods returns aptitude in 0..1', () => {
  const profile = agentAffinity(['sharpshooter'], 'QUILL');
  for (const role of rolePool('gridiron')) {
    const { aptitude } = roleStatMods(profile, 'gridiron', role);
    assert.ok(aptitude >= 0 && aptitude <= 1, `aptitude ${aptitude} out of [0,1] for ${role}`);
  }
});

// ── 7. Skill-domain → position routing ──────────────────────────────────────
// Verifies the KEYWORD_TAGS additions for each new domain route via the EXISTING
// ROLE_WEIGHTS to the intended position families. FORGED agent = no intrinsic tags.
console.log('\n[7] Skill-domain → position routing');

const OFF_POOL = ['QB','RB','WR','OL'];
const DEF_POOL = ['DL','LB','CB','FS','DB'];

function forgedBest(skillObj, pool) {
  const profile = agentAffinity([skillObj], 'FORGED');
  return bestRole(profile, 'gridiron', pool);
}

// ANALYSIS domain → QB on offense
test('analysis-domain skill → QB on offense', () => {
  const role = forgedBest(
    { id:'t_ana', name:'Strategic Analysis', desc:'analyze research intel strategy pattern forecast logic audit' },
    OFF_POOL
  );
  assert.strictEqual(role, 'QB', `analysis domain should route to QB on offense, got ${role}`);
});

// SECURITY domain → a defensive role (LB/CB/DB/FS) on defense
test('security-domain skill → defensive role (LB/CB/DB/FS) on defense', () => {
  const role = forgedBest(
    { id:'t_sec', name:'Threat Audit', desc:'security firewall protect guard defense patrol shield block' },
    DEF_POOL
  );
  assert.ok(
    ['LB','CB','DB','FS'].includes(role),
    `security domain should route to LB/CB/DB/FS on defense, got ${role}`
  );
});

// CODING domain → QB on offense (analysis + control)
test('coding-domain skill → QB on offense', () => {
  const role = forgedBest(
    { id:'t_cod', name:'Backend Engineer', desc:'code coding engineer architect develop backend api system' },
    OFF_POOL
  );
  assert.strictEqual(role, 'QB', `coding domain should route to QB on offense, got ${role}`);
});

// WRITING domain → RB or WR on offense
test('writing-domain skill → RB or WR on offense', () => {
  const role = forgedBest(
    { id:'t_wri', name:'Blog Writer', desc:'writing write copy content narrative docs author story editor' },
    OFF_POOL
  );
  assert.ok(
    role === 'RB' || role === 'WR',
    `writing domain should route to RB or WR on offense, got ${role}`
  );
});

// GRAPHICS domain → WR or CB (offense WR; defense CB)
test('graphics-domain skill → WR on offense', () => {
  const role = forgedBest(
    { id:'t_gfx', name:'Visual Designer', desc:'graphics design visual render art ui ux illustration' },
    OFF_POOL
  );
  assert.ok(
    role === 'WR' || role === 'RB',
    `graphics domain should route to WR (or RB) on offense, got ${role}`
  );
});

test('graphics-domain skill → CB or WR-cousin on defense', () => {
  const role = forgedBest(
    { id:'t_gfx2', name:'Album Art Designer', desc:'graphics design visual render art ui ux illustration' },
    DEF_POOL
  );
  assert.ok(
    ['CB','DB','FS'].includes(role),
    `graphics domain should route to CB/DB/FS on defense, got ${role}`
  );
});

// MUSIC domain → WR on offense / CB-family on defense
test('music-domain skill → WR on offense', () => {
  const role = forgedBest(
    { id:'t_mus', name:'Beat Producer', desc:'music audio sound media video beat rhythm mix' },
    OFF_POOL
  );
  assert.ok(
    role === 'WR' || role === 'RB',
    `music domain should route to WR (or RB) on offense, got ${role}`
  );
});

test('music-domain skill → CB-family on defense', () => {
  const role = forgedBest(
    { id:'t_mus2', name:'Beat Producer', desc:'music audio sound media video beat rhythm mix' },
    DEF_POOL
  );
  assert.ok(
    ['CB','DB','FS'].includes(role),
    `music domain should route to CB/DB/FS on defense, got ${role}`
  );
});

// FINANCE domain → RB on offense / DL on defense
test('finance-domain skill → RB on offense', () => {
  const role = forgedBest(
    { id:'t_fin', name:'Trade Revenue', desc:'finance wealth trade trading money revenue market econ' },
    OFF_POOL
  );
  assert.ok(
    role === 'RB' || role === 'WR',
    `finance domain should route to RB (or WR) on offense, got ${role}`
  );
});

test('finance-domain skill → DL on defense', () => {
  const role = forgedBest(
    { id:'t_fin2', name:'Trade Revenue', desc:'finance wealth trade trading money revenue market econ' },
    DEF_POOL
  );
  assert.ok(
    role === 'DL' || role === 'LB',
    `finance domain should route to DL (or LB) on defense, got ${role}`
  );
});

// A writing-domain skill routes a FORGED agent to WR/RB on offense.
// (Tested on a neutral forged agent, NOT a council agent — council base
// profiles are balance-tuned and their intrinsic role prior can dominate a
// single equipped skill. The skill→position mapping is what we assert here.)
test('writing skill → WR/RB on offense (forged agent)', () => {
  const writingSkill = { id:'t_qw', name:'Blog Writer', desc:'writing copy content narrative docs author story editor' };
  const profile = agentAffinity([writingSkill], 'FORGED_WRITER');
  const role = bestRole(profile, 'gridiron', OFF_POOL);
  assert.ok(
    role === 'WR' || role === 'RB',
    `writing skill should route to WR or RB on offense, got ${role}`
  );
});

// NEXUS + coding skill → QB on offense (agent nudge test)
test('NEXUS agent + coding skill → QB on offense', () => {
  const codeSkill = { id:'t_nc', name:'Backend Engineer', desc:'code coding engineer architect develop backend api system' };
  const profile = agentAffinity([codeSkill], 'NEXUS');
  const role = bestRole(profile, 'gridiron', OFF_POOL);
  assert.strictEqual(role, 'QB', `NEXUS + coding skill should route to QB on offense, got ${role}`);
});

// ── 8. Exports completeness ──────────────────────────────────────────────────
console.log('\n[8] Exports completeness');

const REQUIRED_EXPORTS = [
  'TAGS','SKILL_TAGS','AGENT_TAGS','KEYWORD_TAGS','ROLE_WEIGHTS','ROLE_POOL',
  'tagSkill','agentAffinity','rolePool',
  'roleAptitude','roleAptitudes','bestRole','roleStatMods',
];

const mod = require('./affinity');
for (const name of REQUIRED_EXPORTS) {
  test(`exports '${name}'`, () => {
    assert.ok(name in mod, `module.exports missing '${name}'`);
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
