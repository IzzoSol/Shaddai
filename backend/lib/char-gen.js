// char-gen.js — when an operative is forged, generate a full-body FLUX character
// (matching its Forge archetype) so it appears as a real character in Shaddai World.
const fs = require('fs');
const path = require('path');
let hf; try { hf = require('./hf-keys'); } catch (e) {}
const ART = path.join(__dirname, '..', 'data', 'forge-art');

// archetype → forge-part vocabulary for the character prompt
const ARCH_DESC = {
  oracle:        'mystic oracle seer, ornate oni mask, layered tech-kimono robes, swirling cosmic nebula aura, glowing mage staff, gold glow',
  vanguard:      'cybernetic market vanguard warrior, neural crown, sleek aegis plate armor, blazing inferno aura, cyber katana, electric cyan glow',
  artisan:       'creative artisan, soft mage hood, flowing leaf-woven mantle, gentle neon-pulse aura, glowing holo tablet, warm gold glow',
  psionic:       'psionic seer mystic, oni mask, layered psionic robes, swirling cosmic nebula aura, floating mage staff, deep violet glow',
  ghost:         'stealth android operative, tactical headwrap, futuristic street-tech outfit, flowing data-stream aura, cyber katana, azure glow',
  'gaia-link':   'nature sylvan being, explorer hat, leaf-woven mantle, sprouting vines aura, bio-harvester tool, emerald green glow',
  'street-deity':'street deity android, operator cap, street-tech hoodie, neon-pulse aura, glowing holo tablet, magenta glow',
  harvester:     'nomad harvester, wide explorer hat, long nomad duster coat, whispering mist aura, plasma scythe, green glow',
};
const STYLE = ', full body character concept art, standing heroic pose, centered symmetrical, neon Tron aesthetic, glowing circuit edges, deep dark void background, cinematic rim lighting, high detail digital art, 3/4 front view';

async function generateCharForOperative(op) {
  if (!hf || !hf.keys || !hf.keys().length || !op || !op.codename) return;
  const arch = String(op.archetype || (op.look && op.look.archetype) || 'oracle').toLowerCase();
  const desc = ARCH_DESC[arch] || ARCH_DESC.oracle;
  const safe = String(op.codename).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const fp = path.join(ART, 'char-' + safe + '.png');
  if (fs.existsSync(fp)) return; // already has a character
  try {
    const buf = await hf.generate(desc + STYLE);
    fs.writeFileSync(fp, buf);
    console.log('[char-gen] character generated for', op.codename, '→', fp);
  } catch (e) { console.warn('[char-gen] failed for', op.codename, ':', e.message); }
}

// ── the 7 council characters (self-heal on Render: forge-art is gitignored,
//    so a fresh box regenerates these server-side from HF env keys) ──
const COUNCIL = {
  shaddai: 'supreme golden deity orchestrator, radiant golden oni mask, ornate golden imperial robes, blazing solar halo aura, glowing scepter of light, brilliant gold glow',
  zerox:   'cyber financier vanguard, neural circuit crown, sleek plated market-suit, cascading golden-green data aura, holo ledger blade, emerald and gold glow',
  oracle:  ARCH_DESC.oracle,
  nexus:   'master technical architect android, neural circuit crown, sleek azure tech-armor, flowing data-stream aura, glowing holo schematic, electric blue glow',
  turtle:  ARCH_DESC.artisan,
  quill:   'scholarly scribe mystic, hooded sage cowl, flowing ink-rune robes, swirling parchment aura, glowing quill pen, warm amber glow',
  pikadon: 'security sentinel guardian, armored visor helm, heavy aegis plate armor, crackling firewall aura, glowing energy shield, crimson red glow',
};
const _generating = new Set();
async function ensureCouncilChar(codename) {
  if (!hf || !hf.keys || !hf.keys().length) return;
  const safe = String(codename || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!COUNCIL[safe]) return;                       // only the known 7 — no arbitrary generation
  const fp = path.join(ART, 'char-' + safe + '.png');
  if (fs.existsSync(fp) || _generating.has(safe)) return;
  _generating.add(safe);
  try {
    const buf = await hf.generate(COUNCIL[safe] + STYLE);
    fs.writeFileSync(fp, buf);
    console.log('[char-gen] council character generated →', fp);
  } catch (e) { console.warn('[char-gen] council', safe, 'failed:', e.message); }
  finally { _generating.delete(safe); }
}
// fire-and-forget: regenerate any missing council characters (sequential to spare HF quota)
function ensureCouncilChars() {
  if (!hf || !hf.keys || !hf.keys().length) { console.log('[char-gen] no HF keys — skipping council self-heal'); return; }
  (async () => { for (const c of Object.keys(COUNCIL)) { await ensureCouncilChar(c); } })().catch(() => {});
}

module.exports = { generateCharForOperative, ensureCouncilChar, ensureCouncilChars, COUNCIL };
