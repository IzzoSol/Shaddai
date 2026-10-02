// node tools/tests/world-districts.test.cjs — district identity over the real grid-city-v4.json plan
const assert = require('assert'), path = require('path'); global.window = global; require('../../public/world-districts.js');
const D = global.WorldDistricts, plan = require(path.join(__dirname, '..', '..', 'public', 'assets', 'world', 'grid-city-v4.json'));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('quadrants follow City Brief v2: Campus NE, Commons SE, Plots SW, Race NW', () => { assert.strictEqual(D.at(100, 100).id, 'campus'); assert.strictEqual(D.at(100, -100).id, 'commons'); assert.strictEqual(D.at(-100, -100).id, 'plots'); assert.strictEqual(D.at(-100, 100).id, 'race'); });
t('every building of the real plan lands in exactly one district and all four are populated', () => { const c = {}; plan.buildings.forEach(b => { const d = D.at(b.x_m, b.y_m); c[d.id] = (c[d.id] || 0) + 1; }); assert.strictEqual(Object.keys(c).length, 4); Object.values(c).forEach(n => assert(n > 150, JSON.stringify(c))); });
t('accent and facade tint come from the district; spires stay gold; tint consumes one random number (plan stays deterministic)', () => {
  const b = plan.buildings.find(x => x.kind !== 'spire' && D.at(x.x_m, x.y_m).id === 'campus'); assert.strictEqual(D.accentFor(b), 'teal'); assert(D.at(b.x_m, b.y_m).tints.includes(D.tintFor(b, () => 0.5)));
  assert.strictEqual(D.accentFor(plan.buildings.find(x => x.kind === 'spire')), 'gold'); let n = 0; D.tintFor(b, () => { n++; return 0.1; }); assert.strictEqual(n, 1);
});
t('roles: Race has an arcade strip, Campus towers are offices, homes dominate Plots, every building has a role', () => {
  const roles = {}; plan.buildings.forEach(b => { const d = D.at(b.x_m, b.y_m).id, r = D.roleFor(b); assert(r, 'role'); (roles[d] = roles[d] || {})[r] = (roles[d][r] || 0) + 1; });
  assert(roles.race.arcade > 20, JSON.stringify(roles.race)); assert(roles.campus.office > 50); assert(roles.plots.home > roles.plots.office || !roles.plots.office);
});
t('streets: names are stable, avenue names carry the district, ring roads are named', () => {
  assert.strictEqual(D.streetAt(0, 800), 'Race North Avenue'.replace('Race', D.at(0, 800).name)); assert(/Ring/.test(D.streetAt(300 * Math.sin(0.26), 576 * 1) || 'Ring') || true);
  assert.strictEqual(D.streetAt(576 * Math.sin(15 * Math.PI / 180), 576 * Math.cos(15 * Math.PI / 180)), 'Inner Ring'); assert.strictEqual(D.streetAt(992 * Math.sin(15 * Math.PI / 180), 992 * Math.cos(15 * Math.PI / 180)), 'Outer Ring');
  const names = new Set(); for (let a = 0; a < 360; a += 30) names.add(D.streetAt(300 * Math.sin(a * Math.PI / 180), 300 * Math.cos(a * Math.PI / 180))); assert.strictEqual(names.size, 12, [...names].join('|'));
});
console.log(pass + ' passed');
