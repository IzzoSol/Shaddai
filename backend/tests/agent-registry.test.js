const { COUNCIL, listAgents, resolveAgent, systemPromptFor } = require('../lib/agent-registry');

describe('agent registry', () => {
  test('lists all seven council agents', () => {
    const agents = listAgents();
    for (const name of ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON']) {
      expect(agents.find((a) => a.id === name)).toBeTruthy();
    }
  });

  test('every council agent has a distinct accent colour and a voice', () => {
    const accents = new Set();
    for (const a of Object.values(COUNCIL)) {
      expect(a.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof a.voice).toBe('string');
      expect(a.voice.length).toBeGreaterThan(10);
      accents.add(a.accent);
    }
    expect(accents.size).toBe(Object.keys(COUNCIL).length);
  });

  test('resolves a council agent by name, case-insensitively', () => {
    expect(resolveAgent('turtle').id).toBe('TURTLE');
    expect(resolveAgent('TURTLE').id).toBe('TURTLE');
  });

  test('falls back to the default rather than throwing on an unknown id', () => {
    expect(resolveAgent('not-a-real-agent').id).toBe('SHADDAI');
    expect(resolveAgent('').id).toBe('SHADDAI');
    expect(resolveAgent(null).id).toBe('SHADDAI');
  });

  test('the listed shape carries no prompt engineering', () => {
    for (const a of listAgents()) {
      expect(a.voice).toBeUndefined();
      expect(a.systemPrompt).toBeUndefined();
    }
  });

  test('a council system prompt carries the agent identity and the job', () => {
    const p = systemPromptFor(COUNCIL.PIKADON, 'Review this code.');
    expect(p).toContain('PIKADON');
    expect(p).toContain('Review this code.');
  });

  test('a forged agent answers in its own persona, used verbatim', () => {
    const forged = {
      id: 'agent_1', name: 'TEST', emoji: '🤖', role: 'Custom Agent',
      accent: '#123456', isCustom: true,
      systemPrompt: 'You are test, always sign as [TEST].',
    };
    const p = systemPromptFor(forged, 'Write a post.');
    expect(p).toContain('always sign as [TEST]');
    expect(p).toContain('Write a post.');
    // The council boilerplate must not override what the user wrote.
    expect(p).not.toContain('of the SHADDAI council');
  });
});
