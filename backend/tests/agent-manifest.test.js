const { buildManifest, validateManifest, SPEC_VERSION } = require('../lib/agent-manifest');

describe('buildManifest', () => {
  test('builds a valid manifest for a council agent (ORACLE)', () => {
    const m = buildManifest('ORACLE', { tools: ['search_web', 'fetch_price'] });
    expect(m).not.toBeNull();
    expect(m.specVersion).toBe(SPEC_VERSION);
    expect(m.id).toBe('a_oracle');
    expect(m.name).toBe('ORACLE');
    expect(m.brain.provider).toBeTruthy();
    expect(m.brain.model).toBeTruthy();
    expect(m.tools).toEqual(['search_web', 'fetch_price']);
    expect(m.avatar.kind).toBe('pixel');
    expect(validateManifest(m).valid).toBe(true);
  });

  test('returns null for unknown agent', () => {
    expect(buildManifest('NOBODY')).toBeNull();
  });

  test('supports custom agents via opts.custom', () => {
    const m = buildManifest('SCOUT', {
      custom: { label: 'SCOUT · Recon', persona: 'You are SCOUT.', defaultBrain: 'groq-70b' },
      tools: []
    });
    expect(m.name).toBe('SCOUT');
    expect(m.tags).toContain('custom');
    expect(validateManifest(m).valid).toBe(true);
  });

  test('defaults tools to [] and still validates', () => {
    const m = buildManifest('NEXUS');
    expect(Array.isArray(m.tools)).toBe(true);
    expect(validateManifest(m).valid).toBe(true);
  });
});

describe('validateManifest', () => {
  test('rejects non-object', () => {
    expect(validateManifest(null).valid).toBe(false);
  });

  test('reports missing required fields', () => {
    const r = validateManifest({ specVersion: '1.0', tools: [] });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining([expect.stringMatching(/id/), expect.stringMatching(/name/)]));
  });

  test('rejects wrong specVersion', () => {
    const m = buildManifest('ZEROX');
    m.specVersion = '0.9';
    expect(validateManifest(m).valid).toBe(false);
  });
});
