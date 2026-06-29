// scripts/gen-part-thumbnails.mjs — one HF FLUX thumbnail per Forge part for the
// SHADDAI Operative builder's picker cards. File-disjoint from the dashboard
// (writes backend/data/forge-art/part-<slot>-<key>.png). Re-runnable (skips done).
// Prompt = "<Prompt DNA from master asset catalog>, <STYLE>". Generated in slot
// order (body first) so the most distinctive parts are made before any quota runs out.
// Run: node scripts/gen-part-thumbnails.mjs   (or pass a "slot/key" to do just one)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const hf = require('../backend/lib/hf-keys.js');

const OUT = fileURLToPath(new URL('../backend/data/forge-art/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const STYLE = 'isolated game-asset icon, centered emblem on a dark studio background, ' +
  'dramatic rim lighting, volumetric glow, premium NFT trading-card aesthetic, sharp focus, ' +
  'high detail, no text, no watermark, no letters';

// slot → { key: Prompt DNA }. DNA copied verbatim from the master asset catalog.
// Order matters: body first (most visually-distinctive parts before quota runs out).
const PARTS = {
  body: {
    'humanoid':    'A perfectly sculpted human form, athletic and graceful, hyper-realistic skin textures and subtle muscle definition, cinematic high-resolution render.',
    'android':     'A sleek futuristic android chassis, seamless polished chrome and matte black panels, glowing internal circuitry through translucent sections, cyberpunk high-tech.',
    'cyborg':      'A formidable cyborg, organic and synthetic seamlessly integrated, exposed metallic endoskeleton interwoven with living tissue, glowing optical implants, gritty post-human.',
    'sylvan-form': 'An ethereal being of ancient gnarled wood and vibrant bioluminescent flora, bark-like skin, flowing moss, delicate leaf patterns, mystical nature-bound.',
    'xeno-form':   'An otherworldly entity, elongated elegant silhouette, smooth obsidian-like skin, subtle bioluminescent patterns, alien yet graceful anatomy, cosmic enigmatic.',
  },
  headwear: {
    'mage-hood':         'Deep flowing hood of dark enchanted fabric, face in dramatic shadow, intricate arcane embroidery glowing faintly, mystical secretive.',
    'neural-crown':      'Delicate glowing circlet of interwoven light and data streams, integrated with temples, advanced cognitive processing, high-tech ethereal.',
    'oni-mask':          'Fearsome intricate Oni mask, lacquered metal, sharp stylized horns, glowing red eyes, samurai-cyberpunk fusion, power and intimidation.',
    'tactical-headwrap': 'Rugged military-grade headwrap, durable weather-resistant fabric, integrated comms and night-vision optics, practical stealthy.',
    'explorers-hat':     "Wide-brimmed weathered adventurer's hat, feathers and small intricate tools, sense of journey, rustic resourceful.",
    'operator-cap':      'Modern tactical baseball cap, subtly branded, sleek low-profile, practical urban understated.',
  },
  outfit: {
    'street-tech-hoodie': 'Stylish oversized tech-wear hoodie, advanced breathable fabric, integrated LED strips, hidden compartments, urban rebellious functional.',
    'aegis-plate-armor':  'Imposing heavy plate armor, gleaming futuristic alloy, intricate engravings, glowing energy conduits, unyielding protective.',
    'leaf-woven-mantle':  'Flowing organic mantle of iridescent leaves, bioluminescent vines, delicate petals, alive and nature-connected, ethereal ancient.',
    'tech-kimono':        'Fusion of traditional elegance and tech: flowing smart-fabric kimono, holographic patterns, integrated data displays, sophisticated deadly.',
    'nomads-duster':      "Long weathered duster, durable earth-toned canvas, utility pouches and survival gear, endless journey, resilient independent.",
    'psionic-robes':      'Flowing ethereal robes of shimmering translucent fabric rippling with unseen energy, subtle cosmic patterns, otherworldly contemplative.',
  },
  aura: {
    'neon-pulse':      'Vibrant pulsating aura of electric neon, shifting electric-blue to magenta, glitching digital particles, energetic artificial.',
    'inferno':         'Fierce roaring inferno of hyper-realistic flames engulfing the operative, dramatic shadows, intense heat, volatile destructive.',
    'sprouting-vines': 'Gentle swirling aura of rapidly growing bioluminescent vines and glowing spores, life and growth, organic restorative.',
    'cosmic-nebula':   'Mesmerizing swirling nebula of stardust and miniature galaxies within the aura, profound ancient cosmic.',
    'data-stream':     'Cascading streams of glowing green hexadecimal code forming a digital shield, constant information flow, analytical protective.',
    'whispering-mist': 'Subtle swirling mist of ethereal translucent vapor with faint glowing runes, mysterious elusive, hidden power.',
  },
  handheld: {
    'mage-staff':    'Gnarled ancient wooden staff topped with a brilliantly glowing multi-faceted crystal pulsing with arcane energy, powerful mystical.',
    'cyber-katana':  'Sleek futuristic katana, razor-sharp blade of shimmering energy, ergonomic high-tech hilt, deadly precise.',
    'holo-tablet':   'Transparent glowing holographic data-tablet showing complex UI and real-time analytics, confident analytical grip, informative strategic.',
    'plasma-scythe': 'Massive intimidating scythe, blade of crackling contained plasma energy, raw destructive power, formidable ancient.',
    'aether-orb':    'Levitating perfect sphere of swirling condensed magical energy held gently in palm, immense controlled power.',
    'bio-harvester': 'Sophisticated organic-tech extraction tool with glowing tendrils and sharp crystalline edge, efficient sustainable.',
  },
  hair: {
    'natural-flow':     'Flowing realistic natural hair, elegant, catching the light, rich earthy tones.',
    'silver-silk':      'Long shimmering silver hair cascading like liquid metal, ethereal sheen, futuristic elegant.',
    'electric-blue':    'Vibrant electric-blue hair, sharp modern cut, subtle glowing highlights, bold cyberpunk.',
    'verdant-tendrils': 'Hair of intertwining glowing green vines and delicate blossoms, alive and organic, nature-infused mystical.',
    'crimson-flare':    'Intense fiery crimson hair, wild and untamed, radiating passionate energy, dynamic powerful.',
    'shadow-weave':     'Hair of inky blackness in intricate braids and dreadlocks absorbing all light, mysterious ancient.',
  },
  eyes: {
    'normal':     'Piercing highly-detailed expressive human eyes, deep emotion and intelligence, sharp focus.',
    'glowing':    'Eyes radiating solid intense unnatural light (emerald and sapphire), no visible pupils, pure energy mystical.',
    'scanner':    'Cybernetic eyes with glowing targeting reticles and data-overlays, constant processing, machine precision analytical.',
    'void-stare': 'Eyes containing swirling miniature galaxies and nebulae, profound ancient all-seeing.',
  },
  background: {
    'void':            'Pure infinite pitch-black void, dramatic studio lighting on the operative, minimalist impactful.',
    'neon-cityscape':  'Blurred rainy cyberpunk cityscape at night, glowing neon signs, wet asphalt reflections, cinematic depth of field, urban futuristic.',
    'ancient-grove':   'Serene ancient forest grove, sunlight through colossal trees, glowing flora, mystical mist, ethereal natural.',
    'matrix-rain':     'Cascading glowing green hexadecimal code, digital waterfall effect, hacking the system, cyber-reality.',
    'astral-plane':    'Swirling multi-dimensional astral plane, cosmic dust, distant galaxies, shimmering energy, otherworldly infinite.',
    'industrial-core': 'Massive humming industrial complex, glowing pipes, steam vents, heavy machinery, gritty powerful mechanical.',
  },
};

// Build the flat task list in slot order (body first).
const only = process.argv[2]; // optional "slot/key"
const tasks = [];
for (const slot of Object.keys(PARTS)) {
  for (const key of Object.keys(PARTS[slot])) {
    if (only && only !== `${slot}/${key}`) continue;
    tasks.push({ slot, key, dna: PARTS[slot][key] });
  }
}

console.log(`HF keys: ${hf.keys().length}. Generating ${tasks.length} part thumbnail(s) → backend/data/forge-art/part-*.png`);

let done = 0, skip = 0, fail = 0;
let stopped = false;
for (const { slot, key, dna } of tasks) {
  const out = OUT + `part-${slot}-${key}.png`;
  if (existsSync(out)) { console.log(`· skip ${slot}/${key} (exists)`); skip++; continue; }
  const prompt = `${dna}, ${STYLE}`;
  const t0 = Date.now();
  try {
    const img = await hf.generate(prompt);
    writeFileSync(out, img);
    console.log(`✓ ${slot}/${key} · ${(img.length/1024|0)}KB · ${((Date.now()-t0)/1000).toFixed(1)}s`);
    done++;
  } catch (e) {
    console.log(`✗ ${slot}/${key}: ${e.message}`); fail++;
    if (e.code === 'NO_KEY' || e.code === 'ALL_FAILED') { stopped = true; break; }
  }
  await new Promise(s => setTimeout(s, 1500));
}
console.log(`DONE generated:${done} skipped:${skip} failed:${fail}${stopped ? ' (stopped early — quota/no-key; re-runnable)' : ''}`);
