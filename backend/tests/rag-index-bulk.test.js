const fs = require('fs');
const os = require('os');
const path = require('path');

describe('addDocumentsBulk', () => {
  let tmpHome, ragIndex;
  const USER = 'kb_bulktest';

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-bulk-test-'));
    jest.resetModules();
    process.env.SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST = tmpHome;
    ragIndex = require('../rag-index');
  });

  afterEach(() => {
    delete process.env.SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('inserts multiple documents and returns one docId per item', () => {
    const { docIds, totalChunks } = ragIndex.addDocumentsBulk(USER, [
      { name: 'Video One', text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa '.repeat(5) },
      { name: 'Video Two', text: 'lambda mu nu xi omicron pi rho sigma tau upsilon '.repeat(5) },
    ]);
    expect(docIds).toHaveLength(2);
    expect(totalChunks).toBeGreaterThan(0);
  });

  test('bulk-inserted documents are searchable afterward, same as addDocument', () => {
    ragIndex.addDocumentsBulk(USER, [
      { name: 'Unique Topic Doc', text: 'zephyrsaurus is a made up word that only appears here '.repeat(10) },
    ]);
    const hits = ragIndex.searchUser(USER, 'zephyrsaurus', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docName).toBe('Unique Topic Doc');
  });

  test('meta (videoId, kind, title) is preserved per item like addDocument', () => {
    ragIndex.addDocumentsBulk(USER, [
      { name: 'Meta Doc', text: 'word '.repeat(30), meta: { videoId: 'abc123', kind: 'transcript', title: 'Meta Doc Title' } },
    ]);
    const docs = ragIndex.listUserDocs(USER);
    const doc = docs.find(d => d.name === 'Meta Doc');
    expect(doc.videoId).toBe('abc123');
    expect(doc.kind).toBe('transcript');
  });

  // NOTE ON THIS TEST'S DESIGN vs the plan brief:
  // The brief's original approach (`jest.spyOn(_internal, 'saveDocsForTest')`,
  // where `saveDocsForTest` is an alias `saveDocs` in the `_internal` export
  // object) does NOT work: addDocumentsBulk/addDocument call the *local*
  // `saveDocs` function binding inside rag-index.js directly, not through
  // `module.exports._internal`. Replacing the exported alias with a jest mock
  // only swaps what `_internal.saveDocsForTest` points to — it never touches
  // the closure-private `saveDocs` reference that the module's own code calls.
  // So that spy is guaranteed to report 0 calls always, proving nothing.
  //
  // Instead we verify the real, externally-observable effect of "saveDocs
  // called once": exactly one write to this user's docs.json file. This is
  // black-box but genuinely tests the batching claim.
  test('rebuildVectors/save happens once for the whole batch, not once per item', () => {
    const docsJsonPath = path.join(tmpHome, USER, 'docs.json');
    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    ragIndex.addDocumentsBulk(USER, [
      { name: 'D1', text: 'one two three four five six seven eight nine ten '.repeat(5) },
      { name: 'D2', text: 'eleven twelve thirteen fourteen fifteen sixteen '.repeat(5) },
      { name: 'D3', text: 'seventeen eighteen nineteen twenty twenty-one '.repeat(5) },
    ]);
    const docsJsonWrites = writeSpy.mock.calls.filter(call => call[0] === docsJsonPath);
    expect(docsJsonWrites).toHaveLength(1);
    writeSpy.mockRestore();
  });

  test('throws when items array is empty', () => {
    expect(() => ragIndex.addDocumentsBulk(USER, [])).toThrow();
  });

  test('throws when an item has missing/non-string text', () => {
    expect(() => ragIndex.addDocumentsBulk(USER, [
      { name: 'Bad Item', text: '' },
    ])).toThrow();
    expect(() => ragIndex.addDocumentsBulk(USER, [
      { name: 'Bad Item 2', text: 12345 },
    ])).toThrow();
  });

  test('throws when an item text produces no chunks', () => {
    expect(() => ragIndex.addDocumentsBulk(USER, [
      { name: 'Whitespace Only', text: '   \n\t  ' },
    ])).toThrow();
  });
});
