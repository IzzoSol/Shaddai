const vm = require('vm'), fs = require('fs');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
// legacy rules (?basics=1&strict=1: bases visible, council agents priced) are tested first; the alpha defaults are asserted at the bottom
const store = {}; let sparks = 0;
const ctx = { console, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, location: { search: '?basics=1&strict=1' }, ShdSparks: { spend: n => { if (sparks < n) return false; sparks -= n; return true; } } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/world-operatives.js', 'utf8'), ctx);
const O = ctx.WorldOperatives, L = O.list();
t('8 bases + 8 premium', L.filter(o => o.base).length === 8 && L.filter(o => !o.base).length === 8);
t('bases listed first', L.slice(0, 8).every(o => o.base));
t('bases are free and owned', L.filter(o => o.base).every(o => o.price === 0 && o.owned));
t('premium locked at start', L.filter(o => !o.base).every(o => !o.owned && o.price > 0));
t('default is a base', O.defaultCode() === 'FORGE-VANGUARD');
t('SHADDAI costs more than the other council agents', O.price('SHADDAI') > O.price('ZEROX'));
t('cannot afford -> refused, still locked', !O.unlock('ZEROX').ok && !O.owned('ZEROX'));
sparks = 1600; const r = O.unlock('ZEROX');
t('affordable -> unlocked and charged', r.ok && O.owned('ZEROX') && sparks === 100);
t('unlock persists', JSON.parse(store.shd_ops_v1).owned.ZEROX === 1);
t('unlocking again is free', O.unlock('ZEROX').ok && sparks === 100);
t('forge glb url', O.glbFor('FORGE-STREET-DEITY').indexOf('/assets/forge-models/street-deity-final.glb') === 0);   // 2026-10-23: finalized bodies (baked library clips, A-pose arm alignment, idle legs at rest)
t('council glb url', O.glbFor('NEXUS').indexOf('/assets/agents/NEXUS.glb') === 0);
ctx.location.search = '?unlockall'; t('?unlockall owns everything', O.owned('SHADDAI'));
for (const o of L) { const f = o.portrait.replace(/^\//, ''); t('portrait exists ' + o.code, fs.existsSync('public/' + f)); }

{ const c2 = { console, localStorage: { getItem: () => null, setItem: () => {} }, location: { search: '' }, ShdSparks: { spend: () => false } }; c2.window = c2; vm.createContext(c2);
  vm.runInContext(fs.readFileSync('public/world-operatives.js', 'utf8'), c2);
  const A = c2.WorldOperatives, LA = A.list();
  t('alpha: the 8 basic characters are hidden from select', LA.filter(o => o.base).length === 0 && LA.length === 8);
  t('alpha: all 8 council agents are selectable for free', LA.every(o => o.owned));
  t('alpha: default is a council agent (SHADDAI)', A.defaultCode() === 'SHADDAI'); }
console.log(bad ? 'FAIL' : 'ok', ok, 'pass'); process.exit(bad ? 1 : 0);
