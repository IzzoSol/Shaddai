'use strict';
/**
 * backend/hall/arcade-art.js — HF-powered menu / ambient art for the Hall
 * (owner's directive: "use fal for characters/cut scenes, HF key (HF_TOKENS)
 * for menus"). Built on a locked, deterministic prompt registry.
 *
 * Security: `pack` is validated against ART_PROMPTS — user input is never
 * interpolated into a prompt, so the HF call can't be prompt-injected. Prompts
 * hard-code "no real people, no readable words", keeping the arcade's
 * original-cast/no-celebrity constraint at the image level too.
 *
 * Contract (mirrors lib/hf-keys.js's never-hard-fail stance):
 *   • first request for (pack, size) is generated via hf.generateSafe() and
 *     cached to backend/data/arcade-art/<pack>-<w>x<h>.png;
 *   • later requests serve the cached bytes (no re-burn);
 *   • if every HF key fails, returns keyless Pollinations' URL (is a menu
 *     still renders) rather than throwing.
 */

const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys');

const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'data', 'arcade-art');
const MAX_SIDE = 2048;
const DEFAULT_W = 1024;
const DEFAULT_H = 1024;

// Locked prompt registry. Keys are the pack ids surfaced to the room strip
// (plus 'hall' for the HALL lobby banner itself).
const ART_PROMPTS = Object.freeze({
  hall:
    'A glossy arcade-key-art menu banner for a sci-fi game lounge called THE HALL. A wide neon sign in the center reads HALL in cool teal, surrounded by a glowing purple dodgeball pylon, a golden three-point basketball arc, amber football pylons, and floating blue sigils. Clean dark background, cinematic lighting, sharp vector logo art. No text other than the word HALL. No real people. Original fictional style.',
  blackjack:
    'A polished key-art menu card for a blackjack table. A neon card spade and a gold chip hovering above a felt table, deep green and gold palette, subtle lens glow, cinematic vignette. No real people. No readable words. Original fictional style.',
  basketball_bet:
    'A neon key-art menu card for NEON HOOPS basketball. A glowing basketball arcing into a backlit hoop, teal and purple palette, motion streaks, cinematic rim light. No real people. No readable words. Original fictional style.',
  football_bet:
    'A neon key-art menu card for GRID GRIDIRON football. A player silhouette charging with a football under stadium lights, amber and crimson palette, dynamic low angle, light haze. No real people. No readable words. Original fictional style.',
  dodgeball_bet:
    'A neon key-art menu card for GRID DODGEBALL. A red dodgeball flying across a futuristic court with an energy trail, purple and orange palette, action-packed angle. No real people. No readable words. Original fictional style.',
  sigil_bet:
    'A neon key-art menu card for SIGIL STORM. A glowing blue sigil overlaying a storm-field sky, lightning arcs and floating runes, deep indigo and gold palette. No real people. No readable words. Original fictional style.',
});

function cachePath(dir, key, w, h) { return path.join(dir, `${key}-${w}x${h}.png`); }

function clampSide(n, fallback) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(MAX_SIDE, v);
}

/**
 * createArcadeArt({ cacheDir, provider }) — provider defaults to lib/hf-keys
 * (the real HF key pool + Pollinations fallback); tests inject a stub and a
 * tmp cache dir so nothing touches prod data or the network.
 */
function createArcadeArt({ cacheDir = DEFAULT_CACHE_DIR, provider = hf } = {}) {
  return {
    ART_PROMPTS,
    async get(pack, { width = DEFAULT_W, height = DEFAULT_H } = {}) {
      const prompt = ART_PROMPTS[pack];
      if (!prompt) return { notFound: true };
      const w = clampSide(width, DEFAULT_W);
      const h = clampSide(height, DEFAULT_H);
      const cached = cachePath(cacheDir, pack, w, h);
      if (fs.existsSync(cached)) {
        return { buffer: fs.readFileSync(cached), width: w, height: h, provider: 'cache' };
      }
      const out = await provider.generateSafe(prompt, { width: w, height: h });
      if (out && out.buffer) {
        try {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cached, out.buffer);
        } catch (_) { /* cache is best-effort — still return the bytes */ }
        return { buffer: out.buffer, width: w, height: h, provider: out.provider || 'hf-fal-flux' };
      }
      if (out && out.fallbackUrl) {
        return { url: out.fallbackUrl, width: w, height: h, provider: 'pollinations-free' };
      }
      return { error: 'no image produced' };
    },
  };
}

module.exports = { createArcadeArt, ART_PROMPTS, DEFAULT_CACHE_DIR, MAX_SIDE, DEFAULT_W, DEFAULT_H };