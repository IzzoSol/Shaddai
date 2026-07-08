// Generate dynamic action thumbnails per SHADDAI character via HuggingFace FLUX.
// Usage: node scripts/gen-character-thumbs.cjs [CODE ...]   (no args = all)
const fs = require('fs');
const path = require('path');
const hf = require('../backend/lib/hf-keys.js');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'agents');
const STYLE = 'full-body dynamic action pose, mid-motion, dramatic rim lighting, cinematic, ' +
  'highly detailed anime-realism splash art, glossy, energy VFX, dark studio gradient background, ' +
  'centered, sharp focus, trending game character key art';

const CHARS = {
  ZEROX:  'a confident cyber-kunoichi market-intelligence operative, electric blue hair in braided buns, ' +
          'dark glossy latex bodysuit with glowing emerald-cyan neon trim, wielding a glowing neon-green katana mid-swing, teal energy trails',
  ORACLE: 'a mystic esoteric oracle sorceress, flowing violet robes, glowing purple arcane sigils and constellations orbiting her, ' +
          'casting radiant violet cosmic energy, third-eye glow, ethereal',
  TURTLE: 'a vibrant creative game-designer heroine with flowing emerald-GREEN hair, sleek green and jade ' +
          'techwear with holographic neon accents, spraying luminous green paint-light into dynamic shapes, playful energetic leap',
  PIKADON:'an armored security-fortress guardian, crimson and black heavy plated armor, ' +
          'slamming a glowing red war-hammer, sparks and red shield energy, powerful low stance',
  SHADDAI:'a divine golden orchestrator overlord, radiant gold ornate armor and cloak, ' +
          'unleashing a brilliant golden energy light-blast from raised hand, halo of light, commanding',
  NEXUS:  'a sleek auto-router techno-agent in deep BLUE cyber armor with glowing electric-blue circuit lines, ' +
          'blue holographic network streams spiraling, swift precise motion, cool blue aesthetic',
  QUILL:  'an elegant writer-mage with flowing violet-purple hair, lavender and amethyst robes, throwing a fan of ' +
          'glowing purple feathers like blades, swirling ink-magic and purple glyphs, graceful dynamic throw, rich violet aesthetic',
  VILLAIN:'a menacing crimson sentinel villainess, long fiery red hair, dark battle armor with blood-red glowing edges, ' +
          'aggressive combat stance, crimson aura, sinister',
};

(async () => {
  const want = process.argv.slice(2).map(s => s.toUpperCase());
  const list = Object.keys(CHARS).filter(c => !want.length || want.includes(c));
  for (const code of list) {
    const prompt = `${CHARS[code]}, ${STYLE}`;
    process.stdout.write(`… ${code} `);
    try {
      const buf = await hf.generate(prompt);
      const p = path.join(OUT, `${code}-action.png`);
      fs.writeFileSync(p, buf);
      console.log(`✓ ${(buf.length / 1024).toFixed(0)} KB → ${code}-action.png`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }
  console.log('Done.');
})();
