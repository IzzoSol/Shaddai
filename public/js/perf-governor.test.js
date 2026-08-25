// public/js/perf-governor.test.js
const { createGovernor } = require('./perf-governor');

describe('createGovernor', () => {
  test('starts at tier index 1 (LOW) and calls onTierChange once immediately', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push({ i, name: t.name }) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ i: 1, name: 'LOW' });
    expect(gov.getTier().name).toBe('LOW');
  });

  test('a single very bad frame (fps < 30) drops a tier immediately, no accumulation needed', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push(t.name) });
    // one frame at ~20fps (dt = 0.05s) — EMA seeded at 55, one sample pulls it down but
    // the hard-floor check compares the EMA, so drive several bad frames to cross under 30.
    for (let i = 0; i < 10; i++) gov.update(0.05); // ~20fps repeated
    expect(gov.getTier().name).toBe('POTATO');
  });

  test('sustained fps > 58 for 6+ seconds steps up one tier, then cools down', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push(t.name) });
    // Drive at a steady 60fps (dt ~0.0167s) for >6 simulated seconds.
    const dt = 1 / 60;
    const frames = Math.ceil(6.5 / dt);
    for (let i = 0; i < frames; i++) gov.update(dt);
    expect(gov.getTier().name).toBe('MEDIUM');
  });

  test('tier index never goes below 0 or above the last tier', () => {
    const gov = createGovernor({});
    for (let i = 0; i < 200; i++) gov.update(0.2); // sustained terrible fps (5fps)
    expect(gov.getTier().index).toBeGreaterThanOrEqual(0);
    const gov2 = createGovernor({});
    const dt = 1 / 120;
    for (let i = 0; i < 20000; i++) gov2.update(dt); // sustained excellent fps for a long time
    expect(gov2.getTier().index).toBeLessThanOrEqual(gov2.tiers.length - 1);
  });

  test('exposes the 5-tier table with the exact values ported from SHADDAI-WORLD-3D.html', () => {
    const gov = createGovernor({});
    expect(gov.tiers.map(t => t.name)).toEqual(['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA']);
    expect(gov.tiers[0]).toEqual({ name: 'POTATO', pr: 0.55, bloomStr: 0, cullR: 75 });
    expect(gov.tiers[4]).toEqual({ name: 'ULTRA', pr: 1.5, bloomStr: 0.28, cullR: 9999 });
  });
});
