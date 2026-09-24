#!/usr/bin/env node
/* SHADDAI · fal preflight — the gate between us and the $100.
 *
 *   node fal-assets/production/preflight.mjs              validate manifest + rebuild board-data.js
 *   node fal-assets/production/preflight.mjs check <id> <step> [--use-reserve]
 *        exit 0 = this ONE call may spend; exit 1 = blocked (reason printed)
 *   node fal-assets/production/preflight.mjs log <id> <step> <usd> "<note>"
 *        record a real spend (read the $ off fal's dashboard/response, never guess)
 *
 * Rules enforced (MASTER-PLAN §4 + §14): Gate 0 row must exist · refs on disk ·
 * step order (concept → owner approval → mesh → rig) · canary first per family ·
 * family cap · $100 hard cap with $20 reserve held back unless --use-reserve.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAL = resolve(HERE, '..');
const M = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const LEDGER_PATH = join(HERE, 'spend-ledger.json');
const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) : { entries: [] };

const RANK = { 'needs-ref': 0, 'ready-concept': 1, 'concept-approved': 2, 'mesh-approved': 3, 'shipped': 4, 'cut': -1 };
// which status an asset must be AT (or past) before a step may spend
const NEEDS = { concept: 'ready-concept', mesh: 'concept-approved', 'rig+clips': 'mesh-approved', retexture: 'concept-approved', clip: 'concept-approved' };
const REQUIRED = ['id', 'family', 'name', 'status', 'slot', 'refs'];
// owner drop-folders: any image in production/refs/<id>/ counts as a ref automatically
for (const a of M.assets) {
  const dir = join(HERE, 'refs', a.id);
  if (!existsSync(dir)) continue;
  const found = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => `production/refs/${a.id}/${f}`);
  if (!found.length) continue;
  a.refs = a.refs || {};
  a.refs.have = [...new Set([...(a.refs.have || []), ...found])];
  a.refs.dropped = found.length;
}

const spentBy = (pred) => ledger.entries.filter(pred).reduce((s, e) => s + e.usd, 0);
const totalSpent = () => spentBy(() => true);
const assetById = (id) => M.assets.find((a) => a.id === id);
const refPath = (p) => join(FAL, p);

function validate() {
  const problems = [], rows = [];
  const seen = new Set();
  for (const a of M.assets) {
    const miss = REQUIRED.filter((k) => a[k] == null);
    if (miss.length) problems.push(`${a.id || '?'}: missing Gate-0 fields ${miss.join(',')}`);
    if (seen.has(a.id)) problems.push(`${a.id}: duplicate id`); seen.add(a.id);
    if (!M.families[a.family]) problems.push(`${a.id}: unknown family ${a.family}`);
    if (!(a.status in RANK)) problems.push(`${a.id}: bad status ${a.status}`);
    const have = (a.refs && a.refs.have) || [];
    const missingFiles = have.filter((p) => !existsSync(refPath(p)));
    missingFiles.forEach((p) => problems.push(`${a.id}: ref not on disk ${p}`));
    for (const k of ['current_state', 'legacy_concept']) {
      const p = a.refs && a.refs[k];
      if (p && !existsSync(refPath(p)) && !existsSync(resolve(FAL, '..', p))) problems.push(`${a.id}: ${k} not on disk ${p}`);
    }
    const need = (a.refs && a.refs.need) || [];
    if (a.status !== 'needs-ref' && RANK[a.status] < RANK['concept-approved'] && have.length === 0 && need.some((n) => !/^optional/i.test(n)))
      problems.push(`${a.id}: status ${a.status} but has no refs and still needs: ${need[0]}`);
    rows.push({ id: a.id, family: a.family, status: a.status, refsHave: have.length, refsNeed: need.filter((n) => !/^optional/i.test(n)).length });
  }
  // budget arithmetic: family caps + reserve must fit the hard cap, and worst-case pipeline cost must fit each family
  const famSum = Object.values(M.families).reduce((s, f) => s + f.cap_usd, 0);
  if (famSum + M.budget.reserve_usd > M.budget.hard_cap_usd)
    problems.push(`budget: family caps $${famSum} + reserve $${M.budget.reserve_usd} > hard cap $${M.budget.hard_cap_usd}`);
  const worst = {};
  for (const [fam, f] of Object.entries(M.families)) {
    const perAsset = (M.pipelines[fam] || []).reduce((s, st) => s + st.cap_usd, 0);
    const n = M.assets.filter((a) => a.family === fam && a.status !== 'cut').reduce((s, a) => s + (a.count || 1), 0);
    worst[fam] = { perAsset: +perAsset.toFixed(2), n, worst: +(perAsset * n).toFixed(2), cap: f.cap_usd };
    if (perAsset * n > f.cap_usd + 1e-9) problems.push(`budget: ${fam} worst case ${n} x $${perAsset.toFixed(2)} = $${(perAsset * n).toFixed(2)} > family cap $${f.cap_usd}`);
  }
  return { problems, rows, worst };
}

function check(id, step, useReserve) {
  const a = assetById(id);
  if (!a) return `no Gate-0 row for "${id}" — add it to manifest.json first`;
  if (a.status === 'cut') return `${id} is CUT`;
  const pipe = M.pipelines[a.family] || [];
  const st = pipe.find((s) => s.step === step);
  if (!st) return `family ${a.family} has no step "${step}" (steps: ${pipe.map((s) => s.step).join(', ')})`;
  const need = NEEDS[step];
  if (need && RANK[a.status] < RANK[need]) return `${id} is "${a.status}" — step ${step} needs "${need}" first (${need === 'concept-approved' ? 'OWNER must approve the concept image' : 'finish the previous gate'})`;
  if (a.status === 'needs-ref') return `${id} still needs refs: ${(a.refs.need || []).join(' | ')}`;
  const fam = M.families[a.family];
  if (fam.only_if_reserve_intact && totalSpent() > M.budget.hard_cap_usd - M.budget.reserve_usd - 10)
    return `${a.family} only runs while >= $10 of non-reserve budget is left`;
  const canary = assetById(fam.canary);
  if (canary && canary.id !== id && RANK[canary.status] < RANK['mesh-approved'] && step !== 'concept')
    return `canary first: ${canary.id} is "${canary.status}" — batch waits until it is mesh-approved`;
  const famSpent = spentBy((e) => assetById(e.id) && assetById(e.id).family === a.family);
  if (famSpent + st.cap_usd > fam.cap_usd + 1e-9) return `family ${a.family} cap: spent $${famSpent.toFixed(2)} + step cap $${st.cap_usd} > $${fam.cap_usd}`;
  const tries = ledger.entries.filter((e) => e.id === id && e.step === step).length;
  if (tries >= 2) return `${id}/${step} already ran ${tries}x — rule: a model failing twice means the PROMPT is wrong. Redesign it, then log a note and raise this manually.`;
  const ceiling = M.budget.hard_cap_usd - (useReserve ? 0 : M.budget.reserve_usd);
  if (totalSpent() + st.cap_usd > ceiling + 1e-9) return `total: spent $${totalSpent().toFixed(2)} + $${st.cap_usd} > $${ceiling}${useReserve ? '' : ' (reserve held back; --use-reserve only for gate failures)'}`;
  return null;
}

function writeBoard(v) {
  const data = { manifest: M, ledger, validation: v, spent: +totalSpent().toFixed(2), builtAt: new Date().toISOString() };
  writeFileSync(join(HERE, 'board-data.js'), '// generated by preflight.mjs — do not edit\nwindow.FAL_BOARD = ' + JSON.stringify(data, null, 1) + ';\n');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'check') {
  const [id, step] = args;
  const why = check(id, step, args.includes('--use-reserve'));
  if (why) { console.log('BLOCKED: ' + why); process.exit(1); }
  console.log(`OK: ${id}/${step} may spend up to $${M.pipelines[assetById(id).family].find((s) => s.step === step).cap_usd} (total spent so far $${totalSpent().toFixed(2)})`);
  process.exit(0);
} else if (cmd === 'log') {
  const [id, step, usd, note] = args;
  if (!assetById(id) || !(+usd >= 0)) { console.log('usage: log <id> <step> <usd> "<note>"'); process.exit(1); }
  ledger.entries.push({ at: new Date().toISOString(), id, step, usd: +usd, note: note || '' });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
  const v = validate(); writeBoard(v);
  console.log(`logged $${(+usd).toFixed(2)} — total $${totalSpent().toFixed(2)} of $${M.budget.hard_cap_usd}`);
} else {
  const v = validate(); writeBoard(v);
  const by = {}; v.rows.forEach((r) => { (by[r.status] = by[r.status] || []).push(r.id); });
  console.log(`assets ${v.rows.length} · spent $${totalSpent().toFixed(2)} / $${M.budget.hard_cap_usd} (reserve $${M.budget.reserve_usd})`);
  for (const [s, ids] of Object.entries(by)) console.log(`  ${s.padEnd(17)} ${ids.join(', ')}`);
  console.log('budget worst-case per family:'); for (const [f, w] of Object.entries(v.worst)) console.log(`  ${f.padEnd(9)} ${w.n} x $${w.perAsset} = $${w.worst} / cap $${w.cap}`);
  if (v.problems.length) { console.log('PROBLEMS:'); v.problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
  console.log('manifest OK · board-data.js rebuilt');
}
