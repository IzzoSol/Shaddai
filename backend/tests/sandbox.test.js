const { runSandboxedJs } = require('../lib/sandbox');

describe('runSandboxedJs (vm fallback)', () => {
  test('captures console output and returns success', async () => {
    const r = await runSandboxedJs('console.log("hi", 2 + 2)');
    expect(r.success).toBe(true);
    expect(r.output.join(' ')).toContain('hi 4');
    expect(r.error).toBeNull();
  });

  test('no require/process in scope', async () => {
    const r = await runSandboxedJs('console.log(typeof require, typeof process)');
    expect(r.success).toBe(true);
    expect(r.output.join(' ')).toContain('undefined undefined');
  });

  test('enforces a timeout on infinite loops', async () => {
    const r = await runSandboxedJs('while(true){}', { timeoutMs: 400 });
    expect(r.success).toBe(false);
    expect(String(r.error)).toMatch(/time|exceed/i);
  });

  test('rejects oversized code', async () => {
    const r = await runSandboxedJs('x'.repeat(10001));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/10000/);
  });
});
