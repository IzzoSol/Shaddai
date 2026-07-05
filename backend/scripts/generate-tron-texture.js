/**
 * generate-tron-texture.js
 *
 * Generates a seamless top-down Tron-style neon grid floor (dark background,
 * glowing cyan grid lines) via the project's HF FLUX key pool and writes it
 * to public/assets/textures/tron/albedo.png.
 *
 * Usage:
 *   node backend/scripts/generate-tron-texture.js
 *
 * Requires:  backend/data/runtime-keys.json  with valid HF_TOKENS.
 * If no keys are available the script exits 1 with a message — it does NOT
 * block world startup (world-terrain.js has a procedural canvas fallback).
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { generate } = require('../lib/hf-keys');

const OUT_DIR = path.resolve(__dirname, '../../public/assets/textures/tron');
const OUT_FILE = path.join(OUT_DIR, 'albedo.png');

const PROMPT =
  'top-down seamless tileable Tron-style grid floor texture, ' +
  'pitch-black background, glowing electric cyan neon grid lines, ' +
  'thin bright-cyan lines forming a perfect square grid, ' +
  'subtle glow bloom around each line, intersections slightly brighter, ' +
  'no perspective, orthographic, pure flat overhead view, ' +
  'seamless tiling texture, photorealistic Tron Legacy aesthetic, ' +
  'high contrast, 1024x1024, digital abstract';

async function main() {
  console.log('[tron-texture] Generating via HF FLUX …');
  console.log('[tron-texture] Prompt:', PROMPT);

  let buf;
  try {
    buf = await generate(PROMPT);
  } catch (err) {
    if (err.code === 'NO_KEY') {
      console.error('[tron-texture] No HF keys configured — skipping generation.');
      console.error('  Set HF_TOKENS in env or backend/data/runtime-keys.json.');
      console.error('  world-terrain.js will use the procedural canvas fallback.');
      process.exit(1);
    }
    console.error('[tron-texture] Generation failed:', err.message);
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, buf);
  console.log('[tron-texture] Saved:', OUT_FILE, '(' + (buf.length / 1024).toFixed(1) + ' KB)');
}

main();
