const vm = require('vm'), fs = require('fs');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const store = {}; let sparks = 0;
const ctx = { console, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, location: { search: '' }, ShdSparks: { spend: n => { if (sparks < n) return false; sparks -= n; return true; } } };
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
t('forge glb url', O.glbFor('FORGE-STREET-DEITY').indexOf('/assets/forge-models/street-deity-walk.glb') === 0);
t('council glb url', O.glbFor('NEXUS').indexOf('/assets/agents/NEXUS.glb') === 0);
ctx.location.search = '?unlockall'; t('?unlockall owns everything', O.owned('SHADDAI'));
for (const o of L) { const f = o.portrait.replace(/^\//, ''); t('portrait exists ' + o.code, fs.existsSync('public/' + f)); }
console.log(bad ? 'FAIL' : 'ok', ok, 'pass'); process.exit(bad ? 1 : 0);
