const { generateAvatar, getAvatar, buildAvatarUrl, DEFAULT_PROMPTS } = require('../lib/agent-avatars');

describe('agent-avatars (additive portrait layer)', () => {
  test('buildAvatarUrl returns a keyless Pollinations URL', () => {
    const u = buildAvatarUrl('a test prompt', 'ORACLE');
    expect(u).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
    expect(u).toContain('a%20test%20prompt');
    expect(u).toContain('seed=ORACLE');
  });

  test('generateAvatar persists and getAvatar reads it back', () => {
    const e = generateAvatar('ORACLE');
    expect(e.uri).toContain('pollinations.ai');
    expect(e.prompt).toBe(DEFAULT_PROMPTS.ORACLE);
    const got = getAvatar('ORACLE');
    expect(got).not.toBeNull();
    expect(got.uri).toBe(e.uri);
  });

  test('custom prompt overrides default', () => {
    const e = generateAvatar('NEXUS', 'custom cyan robot');
    expect(e.prompt).toBe('custom cyan robot');
    expect(e.uri).toContain('custom%20cyan%20robot');
  });

  test('unknown agent gets a sensible default prompt', () => {
    const e = generateAvatar('SCOUT');
    expect(e.prompt).toMatch(/SCOUT/);
    expect(e.uri).toContain('pollinations.ai');
  });
});
