'use strict';
/**
 * Tests for backend/hall/arcade-art.js with an injected stub provider + a tmp
 * cache dir: no HF key, no network, no prod data. Proves the prompt registry
 * gate, on-disk PNG caching, dimension clamping, and the keyless fallback URL.
 * Run: node backend/hall/tests/arcade-art.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createArcadeArt, ART_PROMPTS } = require('../arcade-art');

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeStubProvider() {
  const calls = [];
  return {
    calls,
    async generateSafe(prompt, opts) {
      calls.push({ prompt, opts });
      return { buffer: TINY_PNG, provider: 'stub' };
    },
  };
}

async function run() {
  const cacheDir = path.join(os.tmpdir(), `hall-art-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const provider = makeStubProvider();
  const art = createArcadeArt({ cacheDir, provider });
  try {
    // 1. Unknown pack → notFound, and the stub is never touched.
    const miss = await art.get('nope');
    assert.strictEqual(miss.notFound, true);
    assert.strictEqual(provider.calls.length, 0);
    console.log('PASS: unknown art pack short-circuits (no provider call)');

    // 2. Defaults: 1024x1024, generated once, cached to disk, served from
    //    cache on the second call (provider count stays 1).
    const first = await art.get('hall');
    assert.strictEqual(first.provider, 'stub');
    assert.strictEqual(first.width, 1024);
    assert.strictEqual(first.height, 1024);
    const cachedPath = path.join(cacheDir, 'hall-1024x1024.png');
    assert.ok(fs.existsSync(cachedPath), 'generated art must be written to the cache dir');
    const second = await art.get('hall');
    assert.strictEqual(second.provider, 'cache');
    assert.deepStrictEqual(second.buffer, TINY_PNG);
    assert.strictEqual(provider.calls.length, 1, 'second call must serve from cache, not re-burn');
    assert.ok(provider.calls[0].prompt.includes('HALL'), 'locked prompt (not user input) is what ships to the model');
    console.log('PASS: generate-once, cache-then-serve with the locked prompt registry');

    // 3. Clamping: absurd dims clamp to MAX_SIDE and key the cache by the
    //    clamped size.
    const big = await art.get('basketball_bet', { width: 99999, height: 60 });
    assert.strictEqual(big.width, 2048);
    assert.strictEqual(big.height, 60);
    assert.ok(fs.existsSync(path.join(cacheDir, 'basketball_bet-2048x60.png')));
    console.log('PASS: dimensions clamp to the 16..2048 sandbox and the cache key follows');

    // 4. Keyless fallback: a provider that returns only a URL (no buffer) is
    //    relayed as a renderable url + provider (Pollinations fallback style).
    const fallbackProvider = { calls: 0, async generateSafe() { this.calls++; return { fallbackUrl: 'https://image.pollinations.ai/prompt/x?width=512&height=512', provider: 'pollinations-free' }; } };
    const fbArt = createArcadeArt({ cacheDir: path.join(cacheDir, 'fb'), provider: fallbackProvider });
    const fb = await fbArt.get('sigil_bet', { width: 512 });
    assert.strictEqual(fb.url, 'https://image.pollinations.ai/prompt/x?width=512&height=512');
    assert.strictEqual(fb.provider, 'pollinations-free');
    assert.ok(!fb.buffer);
    console.log('PASS: keyless fallback URL path relays without throwing');

    // 5. Registry covers every pack the house can open (hall + arcade-bet keys).
    for (const pack of Object.keys(ART_PROMPTS)) {
      assert.ok(!ART_PROMPTS[pack].includes('{'), 'prompts are deterministic constants, no interpolation');
    }
    console.log(`PASS: prompt registry ships ${Object.keys(ART_PROMPTS).length} locked packs (no {injection})`);

    console.log('\nAll arcade-art checks passed');
  } finally {
    try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });