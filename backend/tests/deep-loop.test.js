'use strict';
/* Deep-loop regression tests (2026-11-11).
 * Each test pins a bug found by the audit loops so it cannot silently return:
 *  1. the decommissioned Groq model must not be a call-site default anywhere;
 *  2. a BYOK key saved under the writer's default tier ('free') must be
 *     visible to both readers (engine + forged-agent tool runner);
 *  3. the dashboard task rows must carry data-id (the RUN-button patch reads
 *     row.dataset.id — without it every RUN said "Task not found");
 *  4. chat must be able to send the signed-in user's token (Firebase keeps it
 *     in window.SHD_AUTH; shd-chat.js only read localStorage 'shd_token');
 *  5. the file sidebar must render an empty state instead of freezing on
 *     "Loading folders..." forever.
 * Run: node --test backend/tests/deep-loop.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const PUBLIC = path.join(BACKEND, '..', 'public');
const DEAD = 'llama-3.1-8b-instant';

// Files whose call sites were fixed. llm-tracer.js is excluded on purpose:
// its mention is a historical price-table key, not a model that gets called.
const CALL_SITE_FILES = [
  'api-proxy-routes.js', 'agent-engine.js', 'brains.js', 'llm-client.js',
  'llm-proxy-routes.js', 'multi-agent-server.js', 'distill-mastery.js',
  'lib/llm-router.js', 'lib/agent-manifest.js', 'lib/digest-llm.js',
  'lib/orchestrate.js', 'routes/agent-policy.js',
];

test('no call site defaults to the decommissioned Groq model', () => {
  for (const rel of CALL_SITE_FILES) {
    const src = fs.readFileSync(path.join(BACKEND, rel), 'utf8');
    const codeLines = src.split('\n').filter(l => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    });
    const hits = codeLines.filter(l => l.includes(DEAD));
    assert.deepStrictEqual(hits, [], `${rel} still calls ${DEAD}: ${hits.join(' | ')}`);
  }
});

test('BYOK: a key saved under the free tier is visible to both readers', () => {
  // Runs in a child process: requiring agent-engine starts background
  // intervals, so the child asserts and exits explicitly.
  const { execFileSync } = require('child_process');
  const script = `
    const fs = require('fs'), path = require('path'), assert = require('node:assert');
    const file = path.join('backend', 'data', 'byok-keys.json');
    const had = fs.existsSync(file);
    const backup = had ? fs.readFileSync(file, 'utf8') : null;
    const fake = 'test-key-not-real-1234567890';
    try {
      fs.writeFileSync(file, JSON.stringify({
        'free:groq': { key: fake },
        'pro:groq': { key: 'pro-key-not-real-1234567890' },
      }));
      const engine = require('./backend/agent-engine');
      // highest-permission tier wins when present…
      assert.strictEqual(engine.getBYOKKey('groq'), 'pro-key-not-real-1234567890');
      // …and with only the free entry, the free key must be found (the bug:
      // the writer defaults to tier 'free', the readers never looked there).
      fs.writeFileSync(file, JSON.stringify({ 'free:groq': { key: fake } }));
      assert.strictEqual(engine.getBYOKKey('groq'), fake);
      const toolRun = require('./backend/lib/agent-tool-run');
      assert.strictEqual(toolRun.getVaultKey('groq'), fake);
      console.log('BYOK_OK');
    } finally {
      if (had) fs.writeFileSync(file, backup); else fs.rmSync(file, { force: true });
    }
    process.exit(0);
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(BACKEND, '..'), encoding: 'utf8', timeout: 90000,
  });
  assert.ok(out.includes('BYOK_OK'), out);
});

test('dashboard task rows carry the data-id the RUN button reads', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.ok(html.includes('class="task-row" data-id="${t.id}"'),
    'renderTasks must emit data-id or runTaskNow always says "Task not found"');
});

test('chat can send the signed-in token (SHD_AUTH fallback + persistence)', () => {
  const chat = fs.readFileSync(path.join(PUBLIC, 'shd-chat.js'), 'utf8');
  assert.ok(chat.includes('window.SHD_AUTH && window.SHD_AUTH.token'),
    'shd-chat hdr() must fall back to the in-memory Firebase token');
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.ok(html.includes("localStorage.setItem('shd_token', window.SHD_AUTH.token)"),
    'the Firebase sign-in handler must persist the token to shd_token');
});

test('file sidebar renders an empty state instead of freezing', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.ok(html.includes('No folders found on the server.'),
    'renderFileTree must replace the spinner when the folder list is empty');
  const block = html.slice(html.indexOf('const FILE_FOLDERS'), html.indexOf('];', html.indexOf('const FILE_FOLDERS')));
  assert.ok(!block.includes('C:'), 'FILE_FOLDERS must not hard-code another machine\'s Windows paths');
  assert.ok(block.includes("'backend/data'"), 'FILE_FOLDERS must point at real server-side directories');
});
