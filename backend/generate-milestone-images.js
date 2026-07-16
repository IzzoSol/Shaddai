/* ══════════════════════════════════════════════════════════════════════════
   generate-milestone-images.js — Creates milestone PNL celebration images
   for the Telegram bot. Matches SHADDAI dashboard agent aesthetic.
   
   Usage: node generate-milestone-images.js
   Output: public/assets/bot/milestones/milestone-{X}x.png
   
   Milestones: 2x, 5x, 10x, 15x, 20x, 25x, 30x, 35x, 40x, 45x, 50x
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'bot', 'milestones');

// Milestone definitions with colors and themes matching SHADDAI dashboard
const MILESTONES = [
  { mult: 2,   label: '2x',   color: '#22c55e', glow: '#16a34a', emoji: '📈', tier: 'starter',  bg: 'linear-gradient(135deg, #0a0f1a 0%, #0d1f12 50%, #0a1a0d 100%)' },
  { mult: 5,   label: '5x',   color: '#3b82f6', glow: '#2563eb', emoji: '🚀', tier: 'runner',   bg: 'linear-gradient(135deg, #0a0f1a 0%, #0d1525 50%, #0a1020 100%)' },
  { mult: 10,  label: '10x',  color: '#a855f7', glow: '#9333ea', emoji: '⚡', tier: 'rocket',   bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a0d25 50%, #150a20 100%)' },
  { mult: 15,  label: '15x',  color: '#f59e0b', glow: '#d97706', emoji: '🔥', tier: 'blazing',  bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a150d 50%, #201a0a 100%)' },
  { mult: 20,  label: '20x',  color: '#ef4444', glow: '#dc2626', emoji: '💥', tier: 'explosive', bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a0d0d 50%, #200a0a 100%)' },
  { mult: 25,  label: '25x',  color: '#06b6d4', glow: '#0891b2', emoji: '🌊', tier: 'tsunami',  bg: 'linear-gradient(135deg, #0a0f1a 0%, #0d1a1a 50%, #0a1520 100%)' },
  { mult: 30,  label: '30x',  color: '#ec4899', glow: '#db2777', emoji: '💎', tier: 'diamond',  bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a0d15 50%, #200a18 100%)' },
  { mult: 35,  label: '35x',  color: '#f97316', glow: '#ea580c', emoji: '🌟', tier: 'stellar',  bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a120d 50%, #20150a 100%)' },
  { mult: 40,  label: '40x',  color: '#14b8a6', glow: '#0d9488', emoji: '🏆', tier: 'champion', bg: 'linear-gradient(135deg, #0a0f1a 0%, #0d1a15 50%, #0a1a18 100%)' },
  { mult: 45,  label: '45x',  color: '#8b5cf6', glow: '#7c3aed', emoji: '👑', tier: 'royal',    bg: 'linear-gradient(135deg, #0a0f1a 0%, #120d1a 50%, #150a20 100%)' },
  { mult: 50,  label: '50x',  color: '#facc15', glow: '#eab308', emoji: '🐋', tier: 'whale',    bg: 'linear-gradient(135deg, #0a0f1a 0%, #1a180d 50%, #201a0a 100%)' },
];

function _html(ms) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 800px; height: 800px;
    background: ${ms.bg};
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #e2e8f0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative;
  }
  /* Animated glow background */
  .glow-orb {
    position: absolute; width: 400px; height: 400px; border-radius: 50%;
    background: radial-gradient(circle, ${ms.color}22 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    filter: blur(60px);
  }
  /* Grid overlay */
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(${ms.color}08 1px, transparent 1px),
      linear-gradient(90deg, ${ms.color}08 1px, transparent 1px);
    background-size: 40px 40px;
  }
  /* Scanline effect */
  .scanlines {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
    pointer-events: none;
  }
  /* Main content */
  .card {
    position: relative; z-index: 2;
    text-align: center; padding: 40px;
  }
  /* SHADDAI logo mark */
  .logo {
    font-size: 18px; font-weight: 700; letter-spacing: 6px;
    color: ${ms.color}; opacity: 0.6; margin-bottom: 20px;
    text-transform: uppercase;
  }
  /* Big multiplier */
  .mult {
    font-size: 160px; font-weight: 900; line-height: 1;
    background: linear-gradient(180deg, ${ms.color} 0%, ${ms.glow} 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    text-shadow: 0 0 80px ${ms.color}44;
    filter: drop-shadow(0 0 30px ${ms.color}33);
  }
  .mult-suffix {
    font-size: 80px; font-weight: 700;
    background: linear-gradient(180deg, ${ms.color}cc 0%, ${ms.glow}cc 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  /* Tier badge */
  .tier {
    display: inline-block; margin-top: 20px; padding: 8px 24px;
    border: 1px solid ${ms.color}44; border-radius: 100px;
    font-size: 16px; font-weight: 600; letter-spacing: 3px;
    color: ${ms.color}; text-transform: uppercase;
    background: ${ms.color}0a;
  }
  /* Divider */
  .divider {
    width: 120px; height: 2px; margin: 24px auto;
    background: linear-gradient(90deg, transparent, ${ms.color}66, transparent);
  }
  /* Tagline */
  .tagline {
    font-size: 14px; color: #64748b; letter-spacing: 2px;
    text-transform: uppercase;
  }
  /* Corner accents */
  .corner { position: absolute; width: 40px; height: 40px; }
  .corner.tl { top: 20px; left: 20px; border-top: 2px solid ${ms.color}44; border-left: 2px solid ${ms.color}44; }
  .corner.tr { top: 20px; right: 20px; border-top: 2px solid ${ms.color}44; border-right: 2px solid ${ms.color}44; }
  .corner.bl { bottom: 20px; left: 20px; border-bottom: 2px solid ${ms.color}44; border-left: 2px solid ${ms.color}44; }
  .corner.br { bottom: 20px; right: 20px; border-bottom: 2px solid ${ms.color}44; border-right: 2px solid ${ms.color}44; }
</style>
</head>
<body>
  <div class="glow-orb"></div>
  <div class="grid"></div>
  <div class="scanlines"></div>
  <div class="corner tl"></div>
  <div class="corner tr"></div>
  <div class="corner bl"></div>
  <div class="corner br"></div>
  <div class="card">
    <div class="logo">SHADDAI</div>
    <div class="mult">${ms.mult}<span class="mult-suffix">x</span></div>
    <div class="divider"></div>
    <div class="tier">${ms.emoji} ${ms.tier}</div>
    <div class="tagline" style="margin-top: 24px;">PNL Milestone</div>
  </div>
</body>
</html>`;
}

async function generate() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  for (const ms of MILESTONES) {
    const outFile = path.join(OUT_DIR, `milestone-${ms.mult}x.png`);
    console.log(`Generating ${ms.label} (${ms.tier})...`);

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.setContent(_html(ms), { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outFile, type: 'png' });
    await page.close();

    const size = fs.statSync(outFile).size;
    console.log(`  → ${outFile} (${(size / 1024).toFixed(0)}KB)`);
  }

  await browser.close();
  console.log(`\n✅ Generated ${MILESTONES.length} milestone images in ${OUT_DIR}`);
}

generate().catch(e => { console.error('Error:', e.message); process.exit(1); });
