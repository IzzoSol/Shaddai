// node --test backend/forge/forge-core.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('./forge-core');

const COMMON = { archetype:'artisan', organic:true, slots:{
  body:'humanoid', headwear:'mage-hood', outfit:'hoodie', aura:'neon',
  handheld:'coffee-cup', hair:'natural', eyes:'normal', background:'void', accent:'azure' } };

test('catalog: 9 slots, 8 archetypes, every preset slot valid', () => {
  assert.equal(core.SLOTS.length, 9);
  assert.equal(Object.keys(core.ARCHETYPES).length, 8);
  for (const a of Object.keys(core.ARCHETYPES))
    assert.deepEqual(core.validateBuild(core.loadoutFor(a)), []);
});

test('buildHash deterministic + order-independent; changes on slot change', () => {
  const rev = { ...COMMON, slots: Object.fromEntries(Object.entries(COMMON.slots).reverse()) };
  assert.equal(core.buildHash(COMMON), core.buildHash(rev));
  assert.match(core.buildHash(COMMON), /^[0-9a-f]{8}$/);
  assert.notEqual(core.buildHash(COMMON), core.buildHash({ ...COMMON, slots:{ ...COMMON.slots, body:'android' } }));
});

test('rarityOf: highest-weight part wins', () => {
  assert.equal(core.rarityOf(COMMON), 'common');
  assert.equal(core.rarityOf(core.loadoutFor('gaia-link')), 'legendary');
});

test('assemblePrompt: fragments + ethnicity + style, deterministic', () => {
  const p = core.assemblePrompt(core.loadoutFor('gaia-link'), 7);
  assert.ok(p.includes('bark-textured skin') && p.includes('flowering wooden antlers') && p.includes('no text'));
  assert.equal(core.assemblePrompt(core.loadoutFor('oracle'), 3), core.assemblePrompt(core.loadoutFor('oracle'), 3));
});

test('forgeMetadata: tokenId, buildHash, rarity, 9 attributes', () => {
  const m = core.forgeMetadata(core.loadoutFor('vanguard'), 42, '/x.png', 'u1');
  assert.equal(m.tokenId, 42);
  assert.equal(m.rarity, core.rarityOf(core.loadoutFor('vanguard')));
  assert.equal(m.buildHash, core.buildHash(core.loadoutFor('vanguard')));
  assert.equal(m.attributes.length, 9);
  assert.equal(m.attributes.find(a => a.trait_type === 'Body').value, 'Cyborg');
});

test('validateBuild reports invalid slot', () => {
  const bad = core.loadoutFor('ghost'); bad.slots.body = 'bogus';
  assert.ok(core.validateBuild(bad).some(e => e.includes('body')));
});
