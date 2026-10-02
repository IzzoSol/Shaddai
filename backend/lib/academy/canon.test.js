'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAll, tmpDir } = require('./testkit');
const { canonical, hashOf, sha256, stripMarkup } = require('./canon');
const { createStore } = require('./store');

runAll('canon+store', {
  'canonical sorts keys and ignores undefined'() {
    assert.strictEqual(canonical({ b: 1, a: [2, { d: 4, c: 3 }], z: undefined }), '{"a":[2,{"c":3,"d":4}],"b":1}');
  },
  'hashOf is key-order independent'() {
    assert.strictEqual(hashOf({ a: 1, b: 2 }), hashOf({ b: 2, a: 1 }));
    assert.notStrictEqual(hashOf({ a: 1 }), hashOf({ a: 2 }));
    assert.strictEqual(sha256('x').length, 64);
  },
  'stripMarkup removes tags'() {
    assert.strictEqual(stripMarkup('  hi <script>x</script><b>there</b> '), 'hi xthere');
  },
  'store json roundtrip, fallback, atomic overwrite'() {
    const s = createStore(tmpDir());
    assert.deepStrictEqual(s.read('nope', { a: 1 }), { a: 1 });
    s.write('x', { n: 1 }); s.write('x', { n: 2 });
    assert.deepStrictEqual(s.read('x', null), { n: 2 });
    assert.ok(!fs.existsSync(path.join(s.dir, 'x.json.tmp')));
  },
  'store jsonl append and read'() {
    const s = createStore(tmpDir());
    assert.deepStrictEqual(s.readLines('log'), []);
    s.append('log', { i: 1 }); s.append('log', { i: 2 });
    assert.deepStrictEqual(s.readLines('log'), [{ i: 1 }, { i: 2 }]);
  }
});
