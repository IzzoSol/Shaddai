/* world-showcase.js — SHOWCASE + AD SPACE + CHAIN ADAPTER (Gallery / Library / Observatory uses, Navi Market).
 *
 *   WorldShowcase.KINDS      { art: TURTLE Museum, book: QUILL Library, music: ORACLE Esoteric Wing, nft: ORACLE (showcase only) }
 *   .submit({kind,title,priceSparks,fileHash?,url?,note?})  -> {ok, item}   status 'pending' until PIKADON/moderator approves (nothing renders or sells before that)
 *   .approve(id) / .reject(id, why)                          moderator path (server should own this; local mode is for dev)
 *   .list(kind?, {status:'ok'})   .buy(id, spend)            spend = (n, kind, id) => bool  (window.ShdSparks.spend). Split: creator gets (100 - BURN - HOUSE)%, BURN is destroyed, HOUSE to the treasury.
 *   .ads: slots + .buyAd(slotId, {imageHash, days}, spend)   image goes to review; only approved images may be drawn on a pylon
 *   WorldChain: adapter registry — 'none' (default; dry-run receipts labelled DRYRUN, never claimed on-chain), 'hedera', 'solana' (server-side signing; NO keys in the game, addresses only)
 * Local mode persists to localStorage (dev). Production: the same calls go through the backend economy-service (the only Sparks writer); see docs/CHAIN-READINESS.md.
 */
(function (root) {
  'use strict';
  var KEY = 'shd_showcase_v1', TUNE = { burnPct: 5, housePct: 5, maxTitle: 80, maxPrice: 1000000, adDays: [7, 14, 30], adPricePerDay: 40 };
  var KINDS = { art: { label: 'Art', room: 'TURTLE', where: 'TURTLE Museum' }, book: { label: 'Book', room: 'QUILL', where: 'QUILL Library' }, music: { label: 'Track', room: 'ORACLE', where: 'ORACLE Esoteric Wing' }, nft: { label: 'NFT showcase', room: 'ORACLE', where: 'ORACLE Esoteric Wing' } };
  var S = (function () { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.items) return j; } catch (e) { } return { items: [], sales: [], ads: {}, seq: 1 }; })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function me() { try { return localStorage.getItem('shd_uid') || 'guest'; } catch (e) { return 'guest'; } }
  function clean(s, n) { return String(s == null ? '' : s).replace(/[<>\u0000-\u001f]/g, '').slice(0, n || 80).trim(); }

  function submit(o) {
    o = o || {}; var k = KINDS[o.kind]; if (!k) return { ok: false, why: 'unknown kind' };
    var title = clean(o.title, TUNE.maxTitle); if (title.length < 2) return { ok: false, why: 'title too short' };
    var price = Number(o.priceSparks); if (!Number.isInteger(price) || price < 0 || price > TUNE.maxPrice) return { ok: false, why: 'price must be a whole number of Sparks (0 = free)' };
    var hash = clean(o.fileHash, 128), url = clean(o.url, 300); if (!hash && !url) return { ok: false, why: 'attach a file hash or link so the sale can be proven' };
    if (url && !/^https:\/\//i.test(url)) return { ok: false, why: 'links must be https' };
    var it = { id: 'sc' + (S.seq++), kind: o.kind, title: title, priceSparks: price, fileHash: hash, url: url, note: clean(o.note, 200), creator: me(), status: 'pending', at: Date.now(), sold: 0 };
    S.items.push(it); save(); return { ok: true, item: it };
  }
  function find(id) { return S.items.filter(function (x) { return x.id === id; })[0] || null; }
  function approve(id) { var it = find(id); if (!it) return false; it.status = 'ok'; save(); return true; }
  function reject(id, why) { var it = find(id); if (!it) return false; it.status = 'rejected'; it.why = clean(why, 120); save(); return true; }
  function list(kind, o) { o = o || {}; var st = o.status || 'ok'; return S.items.filter(function (x) { return (!kind || x.kind === kind) && (st === 'any' || x.status === st); }); }
  function buy(id, spend) {
    var it = find(id); if (!it || it.status !== 'ok') return { ok: false, why: 'not for sale' }; if (it.creator === me()) return { ok: false, why: 'this is your own listing' };
    if (S.sales.some(function (s) { return s.item === id && s.buyer === me(); })) return { ok: false, why: 'you already own this' };
    if (it.priceSparks > 0) { if (!spend || !spend(it.priceSparks, 'showcase', id)) return { ok: false, why: 'not enough Sparks' }; }
    var burn = Math.floor(it.priceSparks * TUNE.burnPct / 100), house = Math.floor(it.priceSparks * TUNE.housePct / 100), creator = it.priceSparks - burn - house;
    var sale = { id: 'r' + (S.seq++), item: id, buyer: me(), price: it.priceSparks, creator: creator, burn: burn, house: house, at: Date.now(), settle: 'local', fileHash: it.fileHash };
    S.sales.push(sale); it.sold++; save(); return { ok: true, sale: sale, item: it };
  }
  function owned() { var u = me(); return S.sales.filter(function (s) { return s.buyer === u; }).map(function (s) { return find(s.item); }).filter(Boolean); }

  /* AD SPACE: slots on the Grid's ad pylons. Nothing draws until the image is APPROVED. */
  var AD_SLOTS = [{ id: 'ad-grid-n', name: 'Grid North Avenue pylon' }, { id: 'ad-grid-s', name: 'Grid South Avenue pylon' }, { id: 'ad-bazaar', name: 'Bazaar arch' }, { id: 'ad-station', name: 'Central Station board' },
    { id: 'ad-colo', name: 'Colosseum plaza screen' }, { id: 'ad-arcade', name: 'Arcade marquee' }, { id: 'ad-forum', name: 'Hoverskate Forum banner' }, { id: 'ad-harbor', name: 'Harbor pier sign' }];
  function adState(id) { var a = S.ads[id]; if (!a) return { free: true }; if (a.until < Date.now()) { return { free: true, expired: true }; } return { free: false, owner: a.owner, until: a.until, status: a.status, imageHash: a.imageHash }; }
  function buyAd(slotId, o, spend) {
    var slot = AD_SLOTS.filter(function (s) { return s.id === slotId; })[0]; if (!slot) return { ok: false, why: 'unknown slot' };
    var days = TUNE.adDays.indexOf(Number(o && o.days)) >= 0 ? Number(o.days) : 7, hash = clean(o && o.imageHash, 128); if (!hash) return { ok: false, why: 'attach the image hash' };
    if (!adState(slotId).free) return { ok: false, why: 'slot is taken' };
    var price = days * TUNE.adPricePerDay; if (!spend || !spend(price, 'ad-space', slotId)) return { ok: false, why: 'not enough Sparks (' + price + ')' };
    S.ads[slotId] = { owner: me(), imageHash: hash, until: Date.now() + days * 864e5, status: 'pending', price: price }; save(); return { ok: true, slot: slot, price: price, status: 'pending' };
  }
  function approveAd(slotId) { if (S.ads[slotId]) { S.ads[slotId].status = 'ok'; save(); return true; } return false; }

  /* CHAIN ADAPTER: keys never live in the game. Adapters call the backend, which signs. Default = dry-run (clearly labelled, never presented as on-chain). */
  var adapters = {}, current = 'none';
  function dry(kind, hash) { var h = 0, s = kind + ':' + hash; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return { ok: true, dryRun: true, chain: 'none', ref: 'DRYRUN-' + (h >>> 0).toString(16), note: 'No chain adapter enabled. This is a local placeholder, not an on-chain record.' }; }
  adapters.none = { attest: function (kind, hash) { return Promise.resolve(dry(kind, hash)); }, mintNFT: function (meta) { return Promise.resolve(dry('nft', JSON.stringify(meta || {}))); }, verifyOwner: function () { return Promise.resolve({ ok: false, why: 'no chain adapter' }); } };
  function serverAdapter(chain, base) {   // hedera: HCS topic message (receipts) + HTS NFT (showcases). solana: memo/attest + Metaplex mint. ALL signing happens server-side.
    function post(path, body) { return fetch((base || '/api/chain') + '/' + chain + path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
    return { attest: function (kind, hash, meta) { return post('/attest', { kind: kind, hash: hash, meta: meta || {} }); }, mintNFT: function (meta) { return post('/mint', { meta: meta }); }, verifyOwner: function (account) { return post('/verify-owner', { account: account }); } };
  }
  var WorldChain = {
    enable: function (chain, o) { if (chain !== 'hedera' && chain !== 'solana') return false; adapters[chain] = serverAdapter(chain, o && o.base); current = chain; return true; },
    disable: function () { current = 'none'; }, current: function () { return current; },
    attest: function (k, h, m) { return adapters[current].attest(k, h, m); }, mintNFT: function (m) { return adapters[current].mintNFT(m); }, verifyOwner: function (a) { return adapters[current].verifyOwner(a); },
    readiness: function () { return { active: current, adapters: Object.keys(adapters), rule: 'no private keys in the client; wallet ADDRESSES only; the server signs; Sparks stay off-chain', hedera: 'HCS topic = receipts scoreboard, HTS = NFT showcase', solana: 'memo/attest for receipts, Metaplex mint for NFT showcase' }; }
  };
  root.WorldShowcase = { KINDS: KINDS, TUNE: TUNE, submit: submit, approve: approve, reject: reject, list: list, buy: buy, owned: owned, find: find, ads: { slots: AD_SLOTS, state: adState, buy: buyAd, approve: approveAd }, _reset: function () { S = { items: [], sales: [], ads: {}, seq: 1 }; save(); } };
  root.WorldChain = WorldChain;
})(typeof window !== 'undefined' ? window : globalThis);
