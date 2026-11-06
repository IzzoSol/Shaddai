/* tools/hf-likeness.cjs — LIKENESS art from a character's real reference image (FLUX.1 Kontext image-edit via Hugging Face → fal-ai provider).
 *   node tools/hf-likeness.cjs slide AGENT [AGENT...]      → public/assets/loading/candidates/<agent>-likeness.webp (loading-screen slide, 1280 wide)
 *   node tools/hf-likeness.cjs painting AGENT [AGENT...]   → public/assets/athenaeum/candidates/<agent>-painting.webp (Athenaeum hall portrait)
 *   node tools/hf-likeness.cjs billboard AGENT [AGENT...]  → public/assets/billboards/candidates/<agent>-billboard.webp
 * Candidates only — owner approves before anything is wired in (gen-loading-slides.cjs --approve style).
 * Refs: full-body art (assets/agents/<A>-body-ref.png; <A>-portrait.png became the owner's headshots 2026-11-06), EXCEPT PIKADON/ORACLE which use the owner's corrected refs (LF2/MODELS FOR FAL, 2026-09-29).
 * Keys: hf_ tokens from the owner's vault (never printed). Drops a key on 401/402/403 and moves to the owner's next HF account (owner-approved 2026-10-03). */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const FAL_REFS = 'C:/Users/Brittany/OneDrive/Pictures/LF2/MODELS FOR FAL/';
const REF = a => ({ PIKADON: FAL_REFS + 'agent-pikadon.png', ORACLE: FAL_REFS + 'image.jpg' })[a] || path.join(PUB, 'assets', 'agents', a + '-body-ref.png');
const KEEP = 'Keep this exact character: same face, hair, outfit, colours and silhouette.';
const MODES = {
  slide: { dir: 'loading', w: 1280, p: a => `${KEEP} Cinematic anime key art of this character, ${a}, standing heroic on a rain-soaked night street between plain dark buildings with blank walls and no signage, emerald and gold rim light, wide shot, dramatic, no signs, no lettering, no text anywhere, no watermark.` },
  painting: { dir: 'athenaeum', w: 1024, p: a => `${KEEP} A classical oil painting portrait of this character, ${a}, as a revered faculty master of a grand futuristic academy, gilded light, rich brushwork, museum quality, no lettering, no text, no frame.` },
  billboard: { dir: 'billboards', w: 1280, p: a => `${KEEP} Bold high-contrast billboard key art of this character, ${a}, dynamic heroic pose on the right third, ${PALETTE[a] || PALETTE.SHADDAI}, strong rim light, energy streaks, large clean empty area on the left for a headline added later, no lettering, no text, no logos.` }
};
// Billboard colour theory (owner ref "10 colour combinations", 2026-10-03): one high-contrast pair per agent, matched to its role.
const PALETTE = {
  SHADDAI: 'obsidian black #06080B background with emerald #00FF9C and gold #E8C45C light',
  ZEROX: 'deep navy #0D1B2A background with rich gold #FFC107 light and gold coin glints',
  NEXUS: 'deep black #0F0F0F background with electric cyan #00D4FF light',
  ORACLE: 'violet #7C3AED background with electric blue #00F0FF light',
  TURTLE: 'electric purple #8A2BE2 background with neon green #39FF14 light',
  QUILL: 'emerald green #10B981 background with crisp white #FFFFFF light',
  PIKADON: 'charcoal #1A1A1A background with crimson red #FF1E1E light'
};
const KEY_FILES = ['C:/Users/Brittany/OneDrive/OBSIDIAN/SHADDAI OBSIDIAN/07 Credentials/SHADDAI-API-KEYS-MASTER.md', 'C:/Users/Brittany/OneDrive/Desktop/Downloads/OBSIDIAN/SHADDAI OBSIDIAN/API_KEYS.md', 'C:/Users/Brittany/OneDrive/Desktop/Downloads/OBSIDIAN/SHADDAI OBSIDIAN/07 Credentials/⭐ MASTER API KEYS (all-in-one).md', 'C:/Users/Brittany/Shaddai/backend/data/runtime-keys.json'];
function hfKeys() { const s = new Set(); KEY_FILES.forEach(f => { try { (fs.readFileSync(f, 'utf8').match(/hf_[A-Za-z0-9]{20,}/g) || []).forEach(k => s.add(k)); } catch (e) { } }); return [...s]; }
async function edit(prompt, ref, keys) {
  const mime = /\.jpe?g$/i.test(ref) ? 'image/jpeg' : 'image/png', image_url = 'data:' + mime + ';base64,' + fs.readFileSync(ref).toString('base64');
  let last = '';
  while (keys.length) {   // owner-approved (2026-10-03): use the owner's other HF accounts; a key out of credits (402) or invalid is dropped for the rest of the run
    const key = keys[0];
    const r = await fetch('https://router.huggingface.co/fal-ai/fal-ai/flux-kontext/dev', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, image_url }) });
    if (r.status === 401 || r.status === 402 || r.status === 403) { last = 'HTTP ' + r.status; keys.shift(); continue; }
    if (!r.ok) return { err: 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160) };
    const j = await r.json(), u = j && j.images && j.images[0] && j.images[0].url; if (!u) return { err: 'no image: ' + JSON.stringify(j).slice(0, 160) };
    const buf = u.startsWith('data:') ? Buffer.from(u.split(',')[1], 'base64') : Buffer.from(await (await fetch(u)).arrayBuffer());
    return { buf };
  }
  return { err: last || 'no usable hf_ key' };
}
(async () => {
  const [mode, ...agents] = process.argv.slice(2), M = MODES[mode];
  if (!M || !agents.length) { console.log('usage: node tools/hf-likeness.cjs slide|painting|billboard AGENT ...'); process.exit(1); }
  const keys = hfKeys(); if (!keys.length) { console.log('no hf_ keys found in the vault'); process.exit(1); }
  const out = path.join(PUB, 'assets', M.dir, 'candidates'); fs.mkdirSync(out, { recursive: true });
  for (const a0 of agents) {
    const a = a0.toUpperCase(), ref = REF(a);
    if (!fs.existsSync(ref)) { console.log(a, 'missing ref', ref); continue; }
    const r = await edit(M.p(a), ref, keys);
    if (r.err) { console.log(a, 'FAILED', r.err); continue; }
    const f = path.join(out, a.toLowerCase() + '-' + mode + '.webp');
    await sharp(r.buf).resize({ width: M.w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(f);
    console.log(a, '->', path.relative(ROOT, f), Math.round(fs.statSync(f).size / 1024) + ' KB');
  }
})();
