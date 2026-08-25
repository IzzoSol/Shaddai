const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildVttIndex } = require('../scripts/vtt-index');

describe('buildVttIndex', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-index-test-'));
    fs.mkdirSync(path.join(tmpRoot, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'abc123.en.vtt'), 'WEBVTT\n');
    fs.writeFileSync(path.join(tmpRoot, 'nested', 'xyz789.vtt'), 'WEBVTT\n');
    fs.writeFileSync(path.join(tmpRoot, 'not-a-caption.txt'), 'plain text\n');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('indexes .vtt files by video id, stripping trailing .en', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.get('abc123')).toBe(path.join(tmpRoot, 'abc123.en.vtt'));
  });

  test('finds .vtt files in nested directories', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.get('xyz789')).toBe(path.join(tmpRoot, 'nested', 'xyz789.vtt'));
  });

  test('ignores non-.vtt files', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.has('not-a-caption')).toBe(false);
    expect(idx.size).toBe(2);
  });

  test('silently skips a root directory that does not exist', () => {
    const idx = buildVttIndex([path.join(tmpRoot, 'does-not-exist')]);
    expect(idx.size).toBe(0);
  });
});
