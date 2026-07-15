// Generates bot + PNL celebration images via the HF FLUX pool → public/assets/bot/.
// Run: node backend/scripts/gen-bot-images.js
'use strict';
const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'bot');
fs.mkdirSync(OUT, { recursive: true });

// ZEROX = neon cyan katana valkyrie · SHADDAI = golden supreme AI orchestrator
const PNL = [
  ['pnl-1',  'anime style, a neon cyan katana valkyrie girl and a golden armored AI overlord celebrating huge profit, green candlestick chart mooning, confetti, vibrant, dynamic'],
  ['pnl-2',  'claymation style, cute golden AI robot and a cyan ninja character celebrating money rain, green up arrows, playful, colorful'],
  ['pnl-3',  'Pixar 3d animation style, heroic golden AI and a cyan cyber girl cheering, rocket to the moon, green charts, joyful, cinematic'],
  ['pnl-4',  'luxury aesthetic, gold and cyan, champagne and diamonds, a golden AI overlord and a neon valkyrie, wealth, profit celebration, cinematic lighting'],
  ['pnl-5',  'funny cartoon meme style, a golden robot and a cyan anime girl riding a rocket labeled PROFIT, green candles, comic, hype'],
  ['pnl-6',  'cyberpunk hype, explosive neon PROFIT energy, a cyan katana girl and a golden AI, green chart mooning, dramatic lighting, intense'],
  ['pnl-7',  'sleek dark minimal design, glowing green candlestick chart going up, silhouettes of a golden AI and a cyan warrior, cool, premium'],
  ['pnl-8',  'retro pixel art, 8-bit golden robot and a cyan pixel ninja, rocket, green up candles, arcade style, celebration'],
  ['pnl-9',  'vaporwave aesthetic, cyan and gold, palm trees and neon grid, AI agents, green profits, retro 80s, moon'],
  ['pnl-10', 'epic cinematic, a golden AI emperor and a cyan valkyrie standing on a mountain of gold coins, green light beams, victory, dramatic'],
];
const BOT = [
  ['img-1',  'SHADDAI brand hero emblem, golden sacred geometry AI empire logo, cyan neon accents, dark premium tech background'],
  ['img-2',  'the SHADDAI council of seven AI agents, cyberpunk epic group shot, neon, cinematic'],
  ['img-3',  'ZEROX, a neon cyan katana valkyrie AI agent portrait, dramatic lighting, cyberpunk'],
  ['img-4',  'SHADDAI, a golden supreme AI orchestrator on a floating sky temple, majestic, godly light'],
  ['img-5',  'a cyber oracle owl mascot with glowing green candlestick eyes, neon, crypto signals bot mascot'],
  ['img-6',  'a crypto trading war room, holographic green charts, AI agents at work, cyberpunk, cinematic'],
  ['img-7',  'the Emerald Vine open lounge, a luxurious neon green lounge with relaxed AI agents, chill premium vibe'],
  ['img-8',  'a sovereign AI agent standing on open blockchain rails, solana, futuristic, cyberpunk'],
  ['img-9',  'a pump.fun style bonding rocket launching, green candles, hype crypto art, explosive'],
  ['img-10', 'a SHADDAI founders pass, golden premium collectible card, cyan accents, luxury, glowing'],
];

async function _save(file, img) {
  if (Buffer.isBuffer(img) && img.length > 1000) { fs.writeFileSync(path.join(OUT, file + '.png'), img); console.log('OK  ' + file + ' (' + Math.round(img.length / 1024) + 'KB)'); return true; }
  return false;
}
async function one(file, prompt) {
  // 1) HF FLUX (if keys have credit)
  try { const img = await hf.generate(prompt, { width: 1024, height: 1024 }); if (await _save(file, img)) return true; } catch (e) {}
  // 2) free Pollinations fallback (keyless — the app's standing image fallback)
  try {
    const url = hf.pollinationsUrl(prompt, { width: 1024, height: 1024, seed: Math.floor(Math.random() * 1e6) });
    const r = await fetch(url);
    if (r.ok) { const img = Buffer.from(await r.arrayBuffer()); if (await _save(file, img)) return true; }
    console.log('FAIL ' + file + ' — pollinations ' + r.status);
  } catch (e) { console.log('FAIL ' + file + ' — ' + (e && e.message)); }
  return false;
}

(async () => {
  console.log('[gen-bot-images] keys=' + hf.keys().length + ' → ' + OUT);
  let ok = 0;
  for (const [f, p] of [...PNL, ...BOT]) { if (await one(f, p)) ok++; }
  console.log('[gen-bot-images] done — ' + ok + '/' + (PNL.length + BOT.length) + ' generated.');
})();
