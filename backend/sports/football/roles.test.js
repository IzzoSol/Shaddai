'use strict';
// ============================================================================
// roles.test.js — Plain node:assert tests for roles.js
// Run: node backend/sports/football/roles.test.js
// ============================================================================

const assert = require('assert');
const {
  OFFENSE_ROLES,
  DEFENSE_ROLES,
  ROLE_INFO,
  AGENT_ROLE_PRIORS,
  bestFootballRole,
} = require('./roles');

// Reference affinity roles for validation
const { ROLE_WEIGHTS } = require('../../platform/affinity');
const GRIDIRON_ROLES = new Set(Object.keys(ROLE_WEIGHTS.gridiron));
const COUNCIL_AGENTS = ['SHADDAI', 'NEXUS', 'PIKADON', 'ZEROX', 'TURTLE', 'ORACLE', 'QUILL'];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\n── roles.js ──────────────────────────────────────────────');

test('OFFENSE_ROLES has exactly 4 roles', () => {
  assert.strictEqual(OFFENSE_ROLES.length, 4, `Expected 4, got ${OFFENSE_ROLES.length}`);
});

test('DEFENSE_ROLES has exactly 4 roles', () => {
  assert.strictEqual(DEFENSE_ROLES.length, 4, `Expected 4, got ${DEFENSE_ROLES.length}`);
});

test('OFFENSE_ROLES contains QB, RB, WR, OL', () => {
  for (const r of ['QB', 'RB', 'WR', 'OL']) {
    assert.ok(OFFENSE_ROLES.includes(r), `Missing ${r}`);
  }
});

test('DEFENSE_ROLES contains DL, LB, CB, FS', () => {
  for (const r of ['DL', 'LB', 'CB', 'FS']) {
    assert.ok(DEFENSE_ROLES.includes(r), `Missing ${r}`);
  }
});

test('No overlap between offense and defense roles', () => {
  const offSet = new Set(OFFENSE_ROLES);
  for (const r of DEFENSE_ROLES) {
    assert.ok(!offSet.has(r), `${r} appears in both offense and defense`);
  }
});

test('ROLE_INFO exists for every role', () => {
  for (const r of [...OFFENSE_ROLES, ...DEFENSE_ROLES]) {
    assert.ok(ROLE_INFO[r], `No ROLE_INFO entry for ${r}`);
  }
});

test('Each ROLE_INFO entry has required shape', () => {
  const REQUIRED = ['side', 'name', 'blurb', 'keyStats', 'affinityRole'];
  for (const [role, info] of Object.entries(ROLE_INFO)) {
    for (const key of REQUIRED) {
      assert.ok(Object.prototype.hasOwnProperty.call(info, key), `ROLE_INFO[${role}] missing key: ${key}`);
    }
    assert.ok(['off', 'def'].includes(info.side), `ROLE_INFO[${role}].side must be 'off'|'def'`);
    assert.ok(Array.isArray(info.keyStats) && info.keyStats.length > 0, `ROLE_INFO[${role}].keyStats must be non-empty array`);
  }
});

test('Every ROLE_INFO.affinityRole maps to a real gridiron role in affinity.js', () => {
  for (const [role, info] of Object.entries(ROLE_INFO)) {
    assert.ok(
      GRIDIRON_ROLES.has(info.affinityRole),
      `ROLE_INFO[${role}].affinityRole "${info.affinityRole}" not found in ROLE_WEIGHTS.gridiron`
    );
  }
});

test('Offense roles all have side="off"', () => {
  for (const r of OFFENSE_ROLES) {
    assert.strictEqual(ROLE_INFO[r].side, 'off', `${r} should have side "off"`);
  }
});

test('Defense roles all have side="def"', () => {
  for (const r of DEFENSE_ROLES) {
    assert.strictEqual(ROLE_INFO[r].side, 'def', `${r} should have side "def"`);
  }
});

test('AGENT_ROLE_PRIORS covers all 7 council agents', () => {
  for (const agent of COUNCIL_AGENTS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(AGENT_ROLE_PRIORS, agent),
      `AGENT_ROLE_PRIORS missing agent: ${agent}`
    );
    const priors = AGENT_ROLE_PRIORS[agent];
    assert.ok(Array.isArray(priors) && priors.length > 0, `AGENT_ROLE_PRIORS[${agent}] must be non-empty array`);
  }
});

test('All AGENT_ROLE_PRIORS values reference valid 4v4 roles', () => {
  const allRoles = new Set([...OFFENSE_ROLES, ...DEFENSE_ROLES]);
  for (const [agent, priors] of Object.entries(AGENT_ROLE_PRIORS)) {
    for (const r of priors) {
      assert.ok(allRoles.has(r), `AGENT_ROLE_PRIORS[${agent}] references unknown role: ${r}`);
    }
  }
});

test('SHADDAI prior starts with QB', () => {
  assert.strictEqual(AGENT_ROLE_PRIORS.SHADDAI[0], 'QB');
});

test('PIKADON prior includes OL and FS', () => {
  assert.ok(AGENT_ROLE_PRIORS.PIKADON.includes('OL'), 'PIKADON should have OL prior');
  assert.ok(AGENT_ROLE_PRIORS.PIKADON.includes('FS'), 'PIKADON should have FS prior');
});

test('bestFootballRole returns a valid offense role for off side', () => {
  // Use a precision-heavy profile (→ QB or WR)
  const profile = {
    analysis: 0.30, precision: 0.25, control: 0.15, support: 0.10,
    speed: 0.05, defense: 0.05, aggression: 0.03, endurance: 0.03, power: 0.02, reaction: 0.02,
  };
  const role = bestFootballRole(profile, 'off');
  assert.ok(OFFENSE_ROLES.includes(role), `Expected an offense role, got "${role}"`);
});

test('bestFootballRole returns a valid defense role for def side', () => {
  // Use a defense/power profile (→ DL or LB)
  const profile = {
    defense: 0.30, power: 0.25, aggression: 0.15, endurance: 0.10,
    reaction: 0.08, speed: 0.05, analysis: 0.03, precision: 0.02, control: 0.01, support: 0.01,
  };
  const role = bestFootballRole(profile, 'def');
  assert.ok(DEFENSE_ROLES.includes(role), `Expected a defense role, got "${role}"`);
});

test('bestFootballRole is deterministic (same profile → same result)', () => {
  const profile = {
    speed: 0.25, reaction: 0.20, defense: 0.20, precision: 0.10,
    analysis: 0.10, control: 0.05, aggression: 0.04, power: 0.03, endurance: 0.02, support: 0.01,
  };
  const r1 = bestFootballRole(profile, 'def');
  const r2 = bestFootballRole(profile, 'def');
  assert.strictEqual(r1, r2, 'bestFootballRole must be deterministic');
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
