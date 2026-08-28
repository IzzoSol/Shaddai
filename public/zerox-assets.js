/**
 * ZEROX Premium Assets — HuggingFace PnL Imagery
 * Generate realistic, professional PnL/trading visuals
 * Integrates with HF Stable Diffusion, FLUX for quality imagery
 */

// Image generation goes through our own server (/api/image/generate), which
// holds the HF key pool and routes to a LIVE inference provider. Previously
// this file called `api-inference.huggingface.co` straight from the browser —
// a retired provider that returns 410 Gone — using a key pasted into
// localStorage. That could never produce an image, and put a raw token in the
// browser. No key is needed client-side any more.
const HF_MODEL = 'stabilityai/stable-diffusion-3-medium-diffusion'; // Professional, clean image generation

// PnL Visual Prompts (designed for trading dashboard)
const PNL_PROMPTS = {
  'win-huge': 'Professional trading dashboard showing massive green gains +250%, clean modern UI, neon green accent on black background, candlestick chart trending up sharply, minimalist design, trading terminal aesthetic, 4k quality, professional stock photo',
  'win-good': 'Trading platform showing solid green profit +75%, clean UI design, green checkmark, ascending trend line, professional finance app style, dark theme with emerald accents, high quality',
  'win-small': 'Minimal trading chart showing modest gains +15%, green bar chart, professional clean design, dark background with green highlights, finance dashboard aesthetic',
  'loss': 'Trading dashboard showing red loss -45%, professional UI, descending trend line, red warning accent, dark professional theme, finance app style, high quality',
  'break-even': 'Trading interface showing break-even position 0%, neutral gray colors, flat trend line, professional clean design, finance platform aesthetic',
  'market-heatmap': 'Colorful market heatmap showing cryptocurrency movements, red-yellow-green gradient, professional trading interface, dark background, real-time data visualization, 4k quality',
  'wallet-tracking': 'Blockchain explorer interface showing wallet transactions, clean data visualization, neon blue accents, dark tech aesthetic, professional UI, high detail',
};

/**
 * Generate PnL visual for a trade result
 * @param {number} pnl - PnL percentage (-100 to +500)
 * @returns {Promise<string>} - Image URL from HuggingFace
 */
async function generatePnLVisual(pnl) {
  let promptKey = 'break-even';

  if (pnl > 100) promptKey = 'win-huge';
  else if (pnl > 50) promptKey = 'win-good';
  else if (pnl > 5) promptKey = 'win-small';
  else if (pnl < 0) promptKey = 'loss';

  const prompt = PNL_PROMPTS[promptKey];

  try {
    const response = await fetch('/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 512, height: 256 }),
    });

    if (!response.ok) {
      console.error('image generate failed:', response.status);
      return null;
    }

    const j = await response.json();
    return j.url || j.image_url || null;
  } catch (e) {
    console.error('PnL generation error:', e);
    return null;
  }
}

/**
 * Create a cached PnL card with HF imagery
 * Uses localStorage to avoid regenerating same images
 */
async function createPnLCardWithAsset(trade) {
  const cacheKey = `pnl_${trade.symbol}_${trade.pnl}`;
  let imageUrl = localStorage.getItem(cacheKey);

  if (!imageUrl) {
    imageUrl = await generatePnLVisual(trade.pnl);
    if (imageUrl) {
      localStorage.setItem(cacheKey, imageUrl);
    }
  }

  return `
    <div class="pnl-trade-card" style="
      background: linear-gradient(135deg, rgba(0,255,156,0.08), rgba(255,200,74,0.02));
      border: 1px solid rgba(0,255,156,0.2);
      border-radius: 8px;
      overflow: hidden;
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
      padding: 12px;
      margin-bottom: 12px;
      align-items: center;
    ">
      ${imageUrl ? `<img src="${imageUrl}" style="width:160px;height:120px;object-fit:cover;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);" />` : ''}
      <div>
        <div style="font-family:Syncopate;font-size:14px;font-weight:700;color:var(--text-primary)">${trade.symbol}</div>
        <div style="font-size:12px;color:var(--text-muted);margin:4px 0">${trade.entry} → ${trade.exit}</div>
        <div style="font-family:'Share Tech Mono';font-size:16px;font-weight:700;color:${trade.pnl >= 0 ? '#00ff9c' : '#ff6b35'}">${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}%</div>
        <div style="font-size:9px;color:var(--text-muted);margin-top:4px">${trade.date}</div>
      </div>
    </div>
  `;
}

/**
 * Generate market heatmap visualization
 */
async function generateMarketHeatmap() {
  try {
    const response = await fetch('/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: PNL_PROMPTS['market-heatmap'], width: 512, height: 384 }),
    });

    if (!response.ok) return null;

    const j = await response.json();
    return j.url || j.image_url || null;
  } catch (e) {
    console.error('Heatmap generation error:', e);
    return null;
  }
}

/**
 * ZEROX Premium Asset Library
 * Pre-designed gradient overlays, animated elements
 */
const ZEROX_ASSETS = {
  // Risk tier color schemes
  riskTierBg: (risk) => {
    const map = {
      'pre-bond': 'linear-gradient(135deg,rgba(255,107,53,0.08),rgba(255,107,53,0.01))',
      'almost-bond': 'linear-gradient(135deg,rgba(255,200,74,0.08),rgba(255,200,74,0.01))',
      'migrated': 'linear-gradient(135deg,rgba(0,255,156,0.08),rgba(0,255,156,0.01))',
    };
    return map[risk] || map['almost-bond'];
  },

  // SVG icons for signals (can be swapped for better icons)
  icons: {
    signal: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19v-8m-4 8v-4m8 4v-6"/></svg>',
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
  },

  // Animated gradient backgrounds
  animatedGradients: {
    pulsing: 'linear-gradient(270deg,rgba(0,255,156,0.2),rgba(0,255,156,0.05));background-size:200% 200%;animation:gradientPulse 4s ease infinite;',
    sliding: 'linear-gradient(90deg,rgba(255,107,53,0.1),rgba(255,200,74,0.1),rgba(0,255,156,0.1));background-size:200% 100%;animation:slideGradient 6s ease infinite;',
  },
};

// CSS animations for assets
const ASSET_STYLES = `
@keyframes gradientPulse {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes slideGradient {
  0% { background-position: 0% center; }
  50% { background-position: 100% center; }
  100% { background-position: 0% center; }
}

@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

.asset-shimmer {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  background-size: 200px 100%;
  animation: shimmer 2s infinite;
}
`;

// Inject asset styles
const styleTag = document.createElement('style');
styleTag.textContent = ASSET_STYLES;
document.head.appendChild(styleTag);

/**
 * Load HuggingFace API key from environment or localStorage
 */
async function initZeroxAssets() {
  // Try to fetch from backend if available
  try {
    const response = await fetch('/api/config/hf-key', {
      headers: { 'x-user-id': localStorage.getItem('userId') || 'guest' }
    });
    const data = await response.json();
    if (data.key) {
      localStorage.setItem('hf_api_key', data.key);
    }
  } catch (e) {
    console.log('HF asset generation available with valid API key');
  }
}

// Export for use
window.ZEROX_ASSETS = ZEROX_ASSETS;
window.generatePnLVisual = generatePnLVisual;
window.createPnLCardWithAsset = createPnLCardWithAsset;
window.generateMarketHeatmap = generateMarketHeatmap;
window.initZeroxAssets = initZeroxAssets;

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initZeroxAssets);
} else {
  initZeroxAssets();
}
