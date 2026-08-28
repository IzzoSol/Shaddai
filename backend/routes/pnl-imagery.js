/**
 * PnL Imagery Generator
 * Uses HuggingFace FLUX Schnell to generate beautiful PnL visuals
 * Includes market cap, multiplier, thesis, entry/exit data
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CACHE_DIR = path.join(DATA_DIR, 'pnl-images');

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Image generation goes through the shared HF key pool, which routes to a LIVE
// inference provider and rotates across keys. The old direct `api-inference`
// URL is a retired provider (410 Gone) and could never produce an image.
const hfPool = require('../lib/hf-keys');

/**
 * Build prompt for HF FLUX image generation
 * Includes: coin symbol, multiplier, MC, thesis, entry/exit, emotion
 */
function buildPnLPrompt(data) {
  const {
    symbol = 'COIN',
    multiplier = 2.5,
    marketCap = 50000000,
    thesis = 'Strong community, organic growth',
    entryPrice = 0.001,
    currentPrice = 0.0025,
    riskTier = 'medium',
    winners = 0,
    losers = 0,
  } = data;

  const emotion = multiplier >= 5 ? 'excited, winning' : multiplier >= 2.5 ? 'confident, bullish' : 'cautious, building';
  const theme = riskTier === 'safe' ? 'professional, clean' : riskTier === 'medium' ? 'energetic, modern' : 'bold, risky, adrenaline';

  const prompt = `
Professional trading dashboard showing ${symbol} token performance.
${multiplier}x multiplier (entered at $${entryPrice.toFixed(6)}, now at $${currentPrice.toFixed(6)}).
Market cap: $${(marketCap / 1000000).toFixed(1)}M.
${winners} winning trades, ${losers} losses.
Thesis: ${thesis}.
Charts showing upward momentum, green candles, profit bars.
Digital art style, ${theme}.
Emotion: ${emotion}.
Professional trading UI elements, neon accents, dark background.
HUD style interface with metrics and data displays.
High quality, detailed, professional.
`.trim();

  return prompt;
}

/**
 * Generate PnL image via HuggingFace FLUX
 */
async function generatePnLImage(data) {
  if (!hfPool.keys().length) {
    console.warn('[PnL] no HF key configured (set HF_TOKENS or backend/data/runtime-keys.json) — skipping image');
    return null;
  }

  try {
    const prompt = buildPnLPrompt(data);
    const cacheKey = `${data.symbol}_${data.multiplier.toFixed(1)}`.toLowerCase();
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.png`);

    // Return cached if exists
    if (fs.existsSync(cachePath)) {
      return cachePath;
    }

    console.log(`🎨 Generating PnL image for ${data.symbol}...`);

    const out = await hfPool.generateSafe(prompt, { width: 1024, height: 1024 });
    if (!out.buffer) throw new Error('HF produced no image: ' + (out.hfError || 'all keys failed'));
    const imageBuffer = out.buffer;

    // Save to cache
    fs.writeFileSync(cachePath, imageBuffer);
    console.log(`✅ Saved PnL image: ${cacheKey}`);

    return cachePath;
  } catch (e) {
    console.error('PnL generation error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pnl-imagery/generate
 * Generate PnL image from signal data
 */
router.post('/generate', async (req, res) => {
  try {
    const data = req.body;
    if (!data.symbol) {
      return res.json({ error: 'Missing symbol' });
    }

    const imagePath = await generatePnLImage(data);

    // Return image URL
    const imageUrl = imagePath ? `/api/pnl-imagery/image/${path.basename(imagePath)}` : null;

    res.json({
      generated: !!imagePath,
      url: imageUrl,
      prompt: buildPnLPrompt(data),
      cached: fs.existsSync(imagePath),
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

/**
 * GET /api/pnl-imagery/image/:filename
 * Serve cached PnL image
 */
router.get('/image/:filename', (req, res) => {
  try {
    const filepath = path.join(CACHE_DIR, req.params.filename);

    // Security: prevent directory traversal
    if (!filepath.startsWith(CACHE_DIR)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.sendFile(filepath);
  } catch (e) {
    res.json({ error: e.message });
  }
});

/**
 * GET /api/pnl-imagery/preview
 * Get a quick preview thumbnail (using text-based summary image)
 */
router.get('/preview', async (req, res) => {
  const { symbol, multiplier, marketCap, thesis } = req.query;

  // Create a simple SVG preview
  const svg = `
    <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ff006e;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#00f5ff;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="300" height="200" fill="#1a1a2e"/>
      <rect width="300" height="200" fill="url(#grad)" opacity="0.1"/>
      <text x="150" y="40" font-size="28" font-weight="bold" fill="#ff006e" text-anchor="middle" font-family="monospace">
        ${symbol}
      </text>
      <text x="150" y="70" font-size="20" fill="#00f5ff" text-anchor="middle" font-family="monospace">
        ${multiplier}x
      </text>
      <text x="150" y="100" font-size="12" fill="#888" text-anchor="middle" font-family="monospace">
        MC: $${(parseInt(marketCap) / 1000000).toFixed(1)}M
      </text>
      <text x="150" y="130" font-size="10" fill="#666" text-anchor="middle" font-family="monospace" word-wrap="break-word" max-width="280">
        ${thesis ? thesis.substring(0, 40) + '...' : 'Analyzing...'}
      </text>
      <rect x="10" y="150" width="280" height="2" fill="#00f5ff" opacity="0.5"/>
      <text x="10" y="185" font-size="9" fill="#39ff14" font-family="monospace">
        📈 ZEROX PRO SIGNALS
      </text>
    </svg>
  `;

  res.type('svg').send(svg);
});

/**
 * GET /api/pnl-imagery/cache-status
 * Check what PnL images are cached
 */
router.get('/cache-status', (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const stats = files.map(f => {
      const filepath = path.join(CACHE_DIR, f);
      const stat = fs.statSync(filepath);
      return {
        filename: f,
        size: stat.size,
        createdAt: stat.birthtime,
      };
    });

    res.json({
      total: files.length,
      files: stats,
      cacheDir: CACHE_DIR,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

/**
 * DELETE /api/pnl-imagery/clear-cache
 * Clear all cached images
 */
router.delete('/clear-cache', (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    files.forEach(f => {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    });
    res.json({ cleared: files.length });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
