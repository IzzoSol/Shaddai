// generate-bazaar-art.js — real HF FLUX images for the 2D Bazaar content categories.
// Saves square neon storefront tiles to public/assets/bazaar/<slug>.png.
// Run: node backend/scripts/generate-bazaar-art.js
const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'bazaar');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = ', neon holographic marketplace product tile, SHADDAI Tron aesthetic, glowing cyan and gold circuit edges, deep dark void background, centered icon, cinematic rim light, high detail digital art, square';

// creator-economy categories the Bazaar sells
const CATS = {
  'ai-art':        'a glowing holographic painting / AI-generated art canvas floating in a frame',
  'music':         'a luminous audio waveform and neon headphones, sound-wave energy',
  'video':         'a neon film-strip and holographic play button, cinematic clip reel',
  'models-3d':     'a glowing wireframe 3D character bust rotating on a holo-pedestal',
  'writing':       'a radiant glowing quill writing luminous runes on a floating scroll',
  'agent-services':'a sleek AI agent android orb offering a glowing service token',
  'data':          'a holographic data crystal with cascading neon analytics charts',
  'design':        'a neon brand emblem and color-swatch palette hologram',
};

(async () => {
  if (!hf || !hf.keys || !hf.keys().length) { console.log('[bazaar-art] no HF keys — aborting'); process.exit(0); }
  let ok = 0;
  for (const [slug, desc] of Object.entries(CATS)) {
    const fp = path.join(OUT, slug + '.png');
    if (fs.existsSync(fp)) { console.log('[bazaar-art] skip (exists):', slug); ok++; continue; }
    try {
      const buf = await hf.generate(desc + STYLE);
      fs.writeFileSync(fp, buf);
      ok++; console.log('[bazaar-art] ✓', slug, '→', fp);
    } catch (e) { console.warn('[bazaar-art] ✗', slug, ':', e.message); }
  }
  console.log(`[bazaar-art] done — ${ok}/${Object.keys(CATS).length} tiles ready in ${OUT}`);
})();
