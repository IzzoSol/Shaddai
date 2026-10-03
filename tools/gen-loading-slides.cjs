/* tools/gen-loading-slides.cjs — generate loading-screen art for the 7 council agents with Hugging Face (FLUX.1-schnell via the nscale partner provider).
 *   node tools/gen-loading-slides.cjs [agent ...]        default: all 7. Writes public/assets/loading/candidates/<agent>.webp (1280 wide) + candidates/contact.png
 *   node tools/gen-loading-slides.cjs --approve agent..  copies approved candidates to public/assets/loading/ and adds them to slides.json (no code change needed)
 * Keys: read from the owner's vault file (6 free HF tokens), rotated per call, NEVER printed or written anywhere. 403 = token lacks the Inference Providers scope; 410 = retired provider.
 * Style = the owner's references (image 15/18/20/22): anime key art, black bodysuit with glowing emerald circuit lines, rain-soaked neon city. Agent looks are REFERENCE-LED:
 * these are role-based candidates for the owner to approve or replace with the correct refs (LF2/MODELS FOR FAL). Nothing is wired into the game until --approve. */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'public', 'assets', 'loading'), CAND = path.join(OUT, 'candidates');
const VAULT = 'C:/Users/Brittany/OneDrive/OBSIDIAN/SHADDAI OBSIDIAN/07 Credentials/SHADDAI-API-KEYS-MASTER.md';
const STYLE = 'dramatic anime key art, rain-soaked neon cyberpunk city at night, black bodysuit with glowing emerald-green circuit lines, swirling green energy particles, cinematic lighting, highly detailed, wide composition, no text, no watermark';
const AGENTS = {
  SHADDAI: { line: 'One world. Every agent. Yours to shape.', p: 'the supreme commander standing at the centre of the city with a halo of gold and emerald light, arms open, authority, wind-swept long coat' },
  NEXUS: { line: 'Every skill, one tap away.', p: 'the technical architect conducting a floating lattice of glowing network nodes and circuit blueprints with both hands, visor of data' },
  ZEROX: { line: 'Markets move. We read them first.', p: 'the wealth strategist surrounded by holographic candlestick charts and streams of gold data coins, sharp tailored jacket, confident smirk' },
  ORACLE: { line: 'Know the night before it comes.', p: 'the hooded seer with a glowing third-eye sigil and sacred geometry rings floating behind, calm eyes, mystic energy' },
  TURTLE: { line: 'Make it beautiful. Make it move.', p: 'the creative designer painting colours of light in the air with a brush of energy, paint splashes and glowing sketches orbiting' },
  QUILL: { line: 'Say it clearly. Say it once.', p: 'the scribe with a glowing quill pen of light writing, floating pages of luminous text swirling around, library of data towers' },
  PIKADON: { line: 'Nothing gets past the shield.', p: 'the guardian in heavy armoured suit with a glowing energy shield barrier, visor, standing firm against a storm of digital attacks' }
};
const KEY_FILES = [VAULT, 'C:/Users/Brittany/OneDrive/Desktop/Downloads/OBSIDIAN/SHADDAI OBSIDIAN/API_KEYS.md', 'C:/Users/Brittany/OneDrive/Desktop/Downloads/OBSIDIAN/SHADDAI OBSIDIAN/07 Credentials/⭐ MASTER API KEYS (all-in-one).md', 'C:/Users/Brittany/Shaddai/backend/data/runtime-keys.json'];
function hfKeys() { const all = new Set(); KEY_FILES.forEach(f => { try { (fs.readFileSync(f, 'utf8').match(/hf_[A-Za-z0-9]{20,}/g) || []).forEach(k => all.add(k)); } catch (e) { } }); return [...all]; }
async function gen(prompt, keys, k0) {
  let last = '';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(k0 + i) % keys.length];
    try {
      const r = await fetch('https://router.huggingface.co/nscale/v1/images/generations', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt, size: '1344x768', response_format: 'b64_json' }) });
      if (!r.ok) { last = 'HTTP ' + r.status; continue; }
      const j = await r.json(); const b = j && j.data && j.data[0] && j.data[0].b64_json; if (b) return Buffer.from(b, 'base64'); last = 'no image';
    } catch (e) { last = e.message.slice(0, 60); }
  }
  throw new Error('all keys failed: ' + last);
}
(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--approve') {
    const names = args.slice(1).map(s => s.toUpperCase()), mf = path.join(OUT, 'slides.json'); const cur = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : [];
    for (const n of names) { const f = path.join(CAND, n.toLowerCase() + '.webp'); if (!AGENTS[n] || !fs.existsSync(f)) { console.log('skip ' + n); continue; } fs.copyFileSync(f, path.join(OUT, 'agent-' + n.toLowerCase() + '.webp')); const src = '/assets/loading/agent-' + n.toLowerCase() + '.webp'; if (!cur.some(s => s.src === src)) cur.push({ src, who: n, line: AGENTS[n].line }); console.log('approved ' + n); }
    fs.writeFileSync(mf, JSON.stringify(cur, null, 1)); return;
  }
  const keys = hfKeys(); if (!keys.length) { console.log('no HF keys found in the vault file'); process.exit(2); }
  console.log(keys.length + ' keys available (not printed)'); fs.mkdirSync(CAND, { recursive: true });
  const names = (args.length ? args.map(s => s.toUpperCase()) : Object.keys(AGENTS)).filter(n => AGENTS[n]); const done = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    try { const buf = await gen(AGENTS[n].p + ', ' + STYLE, keys, i); await sharp(buf).resize({ width: 1280 }).webp({ quality: 74 }).toFile(path.join(CAND, n.toLowerCase() + '.webp')); done.push(n); console.log('ok ' + n); }
    catch (e) { console.log('FAIL ' + n + ': ' + e.message); }
  }
  if (done.length) { const th = await Promise.all(done.map(n => sharp(path.join(CAND, n.toLowerCase() + '.webp')).resize(448, 256, { fit: 'cover' }).png().toBuffer())); await sharp({ create: { width: 448 * 4, height: 256 * Math.ceil(th.length / 4), channels: 3, background: '#000' } }).composite(th.map((b, i) => ({ input: b, left: (i % 4) * 448, top: Math.floor(i / 4) * 256 }))).png().toFile(path.join(CAND, 'contact.png')); console.log('contact sheet: ' + path.join(CAND, 'contact.png')); }
})();
