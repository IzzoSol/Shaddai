const bus = require('../agent-event-bus');

describe('AgentEventBus ring buffer', () => {
  test('subscribe still receives events (existing API intact)', () => {
    const got = [];
    const unsub = bus.subscribe('t1', e => got.push(e));
    bus.toolStart('t1', 'fetch_price', { symbol: 'BTC' });
    bus.toolDone('t1', 'fetch_price', 'ok', 12);
    unsub();
    bus.toolStart('t1', 'after-unsub');
    expect(got.length).toBe(2);
    expect(got[0].type).toBe('tool-start');
    expect(got[1].type).toBe('tool-done');
  });

  test('history() records events and filters by taskId', () => {
    bus.emitEvent('tA', 'llm-start', { provider: 'groq' });
    bus.emitEvent('tB', 'llm-start', { provider: 'groq' });
    expect(bus.history('tA').every(e => e.taskId === 'tA')).toBe(true);
    expect(bus.history().length).toBeGreaterThan(0);
  });

  test('recent(type, n) returns last n of a type newest-first', () => {
    bus.emitEvent('tC', 'done', { output: '1' });
    bus.emitEvent('tC', 'done', { output: '2' });
    const r = bus.recent('done', 2);
    expect(r.length).toBe(2);
    expect(r[0].output).toBe('2'); // newest first
  });

  test('ring buffer caps at _maxHistory (200)', () => {
    for (let i = 0; i < 250; i++) bus.emitEvent('flood', 'tool-start', { i });
    expect(bus.history().length).toBeLessThanOrEqual(200);
  });
});
