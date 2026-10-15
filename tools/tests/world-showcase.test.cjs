// node tools/tests/world-showcase.test.cjs — showcase rules, ad space, chain adapter honesty
const assert = require('assert'), store = {}; global.window = global; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
require('../../public/world-showcase.js'); const SC = global.WorldShowcase, CH = global.WorldChain;
let pass = 0; const t = (n, f) => { try { SC._reset(); store.shd_uid = 'alice'; f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const wallet = (bal) => { const w = { bal, spend: (n) => { if (w.bal < n) return false; w.bal -= n; return true; } }; return w; };
t('submissions need title, whole-Sparks price and proof (hash or https link)', () => {
  assert.strictEqual(SC.submit({ kind: 'art', title: 'x', priceSparks: 5, fileHash: 'ab' }).ok, false); assert.strictEqual(SC.submit({ kind: 'art', title: 'Sunset', priceSparks: 1.5, fileHash: 'ab' }).ok, false, 'no fractional Sparks');
  assert.strictEqual(SC.submit({ kind: 'art', title: 'Sunset', priceSparks: 5 }).ok, false, 'no proof'); assert.strictEqual(SC.submit({ kind: 'book', title: 'Novel', priceSparks: 5, url: 'http://x.com/a' }).ok, false, 'https only'); assert.strictEqual(SC.submit({ kind: 'nope', title: 'Novel' }).ok, false);
});
t('nothing lists or sells before review', () => { const r = SC.submit({ kind: 'music', title: 'Track One', priceSparks: 10, fileHash: 'abc123' }); assert(r.ok); assert.strictEqual(SC.list('music').length, 0); assert.strictEqual(SC.buy(r.item.id, wallet(100).spend).ok, false); SC.approve(r.item.id); assert.strictEqual(SC.list('music').length, 1); });
t('buy: pays, splits burn/house/creator, blocks self-buy and double-buy', () => {
  const r = SC.submit({ kind: 'book', title: 'Novel', priceSparks: 200, fileHash: 'h1' }); SC.approve(r.item.id); assert.strictEqual(SC.buy(r.item.id, wallet(999).spend).why, 'this is your own listing');
  store.shd_uid = 'bob'; const w = wallet(500); const b = SC.buy(r.item.id, w.spend); assert(b.ok); assert.strictEqual(w.bal, 300); assert.strictEqual(b.sale.burn, 10); assert.strictEqual(b.sale.house, 10); assert.strictEqual(b.sale.creator, 180);
  assert.strictEqual(b.sale.burn + b.sale.house + b.sale.creator, 200); assert.strictEqual(SC.buy(r.item.id, w.spend).why, 'you already own this'); assert.strictEqual(SC.owned().length, 1);
});
t('not enough Sparks = no sale', () => { const r = SC.submit({ kind: 'art', title: 'Art', priceSparks: 50, fileHash: 'z' }); SC.approve(r.item.id); store.shd_uid = 'bob'; const b = SC.buy(r.item.id, wallet(10).spend); assert.strictEqual(b.ok, false); assert.strictEqual(SC.find(r.item.id).sold, 0); });
t('ad space: pay, review first, slot taken until expiry', () => {
  const w = wallet(1000); const r = SC.ads.buy('ad-bazaar', { imageHash: 'img1', days: 7 }, w.spend); assert(r.ok); assert.strictEqual(w.bal, 1000 - 7 * SC.TUNE.adPricePerDay); assert.strictEqual(SC.ads.state('ad-bazaar').status, 'pending');
  assert.strictEqual(SC.ads.buy('ad-bazaar', { imageHash: 'img2', days: 7 }, w.spend).why, 'slot is taken'); assert.strictEqual(SC.ads.buy('nope', { imageHash: 'x' }, w.spend).ok, false); assert.strictEqual(SC.ads.buy('ad-forum', {}, w.spend).ok, false, 'needs an image hash');
});
t('chain adapter: default is an honest dry-run; hedera/solana enable server adapters; no keys client-side', async () => {
  const r = await CH.attest('receipt', 'abc'); assert(r.dryRun === true && /^DRYRUN-/.test(r.ref) && r.chain === 'none'); assert.strictEqual(CH.current(), 'none');
  assert.strictEqual(CH.enable('ethereum'), false); assert.strictEqual(CH.enable('hedera'), true); assert.strictEqual(CH.current(), 'hedera'); assert(/no private keys/.test(CH.readiness().rule)); CH.disable();
});
console.log(pass + ' passed');
