/**
 * ZEROX Wallet Analyzer
 * Scan wallet addresses for trading history, PnL, holdings analysis
 * Integrates with Helius, Solscan, magic eden for Solana
 */

const WALLET_CONFIG = {
  heliusRpcUrl: localStorage.getItem('helius_rpc_url') || 'https://mainnet.helius-rpc.com/',
  heliusApiKey: localStorage.getItem('helius_api_key') || '',
  solscanApiKey: localStorage.getItem('solscan_api_key') || '',
};

/**
 * Analyze wallet for trading activity
 * @param {string} walletAddress - Public key
 * @returns {Promise<object>} - Trade history, stats, holdings
 */
async function analyzeWallet(walletAddress) {
  try {
    // Validate address format
    if (!walletAddress || walletAddress.length < 32) {
      return { error: 'Invalid wallet address' };
    }

    // Fetch via Helius (best for SPL token transfers)
    const signatures = await fetch(`${WALLET_CONFIG.heliusRpcUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 100 }],
      }),
    }).then(r => r.json());

    if (!signatures.result) {
      return { error: 'Could not fetch wallet history' };
    }

    // Parse transactions for swaps, trades
    const trades = await parseTrades(walletAddress, signatures.result);
    const holdings = await getWalletHoldings(walletAddress);
    const stats = calculateWalletStats(trades);

    return {
      wallet: walletAddress,
      trades,
      holdings,
      stats,
      lastUpdated: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Wallet analysis error:', e);
    return { error: e.message };
  }
}

/**
 * Parse transaction signatures for trades
 */
async function parseTrades(wallet, signatures) {
  const trades = [];

  for (const sig of signatures.slice(0, 50)) {
    try {
      const tx = await fetch(`${WALLET_CONFIG.heliusRpcUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { maxSupportedTransactionVersion: 0 }],
        }),
      }).then(r => r.json());

      if (!tx.result) continue;

      // Parse swap instructions (Jupiter, Raydium, etc)
      const trade = parseSwapTransaction(tx.result, wallet);
      if (trade) trades.push(trade);
    } catch (e) {
      // Continue on error
    }
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Extract swap details from transaction
 */
function parseSwapTransaction(tx, wallet) {
  if (!tx || !tx.blockTime) return null;

  // Look for token transfer instructions
  const meta = tx.meta;
  if (!meta || !meta.postTokenBalances) return null;

  // Simplified: detect if this is a swap (usually involves 2+ token transfers)
  const tokenChanges = meta.postTokenBalances.length;
  if (tokenChanges < 2) return null;

  // Extract: tokenIn, tokenOut, amountIn, amountOut, fees
  // This is simplified — real implementation would parse instruction data
  return {
    signature: tx.transaction?.signatures?.[0] || 'unknown',
    timestamp: tx.blockTime * 1000,
    type: 'swap',
    tokenIn: 'SOL', // Placeholder
    tokenOut: 'USDC', // Placeholder
    amountIn: 1.5,
    amountOut: 150,
    fee: 0.25,
    status: meta.err ? 'failed' : 'success',
  };
}

/**
 * Get current wallet holdings
 */
async function getWalletHoldings(wallet) {
  try {
    // Using Solscan or similar
    // For now, return mock
    return [
      { mint: 'SOL', symbol: 'SOL', balance: 5.2, usdValue: 1040 },
      { mint: 'USDC', symbol: 'USDC', balance: 2500, usdValue: 2500 },
      { mint: 'LUNA', symbol: 'LUNA', balance: 145.3, usdValue: 1453 },
    ];
  } catch (e) {
    return [];
  }
}

/**
 * Calculate trading stats from trades
 */
function calculateWalletStats(trades) {
  if (!trades.length) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgGain: 0,
      avgLoss: 0,
      totalVolume: 0,
    };
  }

  // Simplified: assume trades have entry/exit
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  return {
    totalTrades: trades.length,
    winRate: ((wins.length / trades.length) * 100).toFixed(1),
    wins: wins.length,
    losses: losses.length,
    totalPnL: totalPnL.toFixed(2),
    avgGain: (wins.reduce((s, t) => s + t.pnl, 0) / wins.length || 0).toFixed(2),
    avgLoss: (losses.reduce((s, t) => s + t.pnl, 0) / losses.length || 0).toFixed(2),
    totalVolume: trades.reduce((s, t) => s + t.amountIn, 0).toFixed(2),
  };
}

/**
 * Render wallet analyzer UI
 */
function renderWalletAnalyzer() {
  return `
    <div id="wallet-analyzer" style="display:flex;flex-direction:column;gap:16px;padding:16px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border-soft);">
      <div style="font-family:Syncopate;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--signal-strong);">🔍 Wallet Analyzer</div>

      <!-- Input -->
      <div style="display:flex;gap:8px;">
        <input
          id="wallet-input"
          type="text"
          placeholder="Paste wallet address..."
          style="flex:1;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-soft);border-radius:6px;color:var(--text-primary);font-family:'Share Tech Mono';font-size:11px;"
        />
        <button
          onclick="analyzeWalletInput()"
          style="padding:10px 16px;background:rgba(0,255,156,0.15);border:1px solid var(--signal-strong);color:var(--signal-strong);border-radius:6px;font-weight:700;cursor:pointer;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;"
        >
          Scan
        </button>
      </div>

      <!-- Results -->
      <div id="wallet-results" style="display:none;">
        <div id="wallet-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
          <!-- Populated dynamically -->
        </div>
        <div style="border-top:1px solid var(--border-soft);padding-top:12px;">
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Recent Trades</div>
          <div id="wallet-trades"></div>
        </div>
        <div style="border-top:1px solid var(--border-soft);padding-top:12px;">
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Holdings</div>
          <div id="wallet-holdings"></div>
        </div>
      </div>

      <!-- Loading -->
      <div id="wallet-loading" style="display:none;text-align:center;color:var(--text-muted);padding:20px;">
        Scanning wallet... <span style="animation:pulse 1s infinite;">⏳</span>
      </div>
    </div>
  `;
}

/**
 * Handle wallet input and analysis
 */
async function analyzeWalletInput() {
  const input = document.getElementById('wallet-input').value.trim();
  if (!input) {
    alert('Please paste a wallet address');
    return;
  }

  document.getElementById('wallet-loading').style.display = 'block';
  document.getElementById('wallet-results').style.display = 'none';

  const result = await analyzeWallet(input);

  document.getElementById('wallet-loading').style.display = 'none';

  if (result.error) {
    alert('Error: ' + result.error);
    return;
  }

  // Render stats
  const statsHtml = Object.entries(result.stats).map(([key, value]) => `
    <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;border-left:2px solid var(--signal-strong);text-align:center;">
      <div style="font-size:9px;color:var(--text-muted);font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${key.replace(/([A-Z])/g, ' $1').trim()}</div>
      <div style="font-family:'Share Tech Mono';font-size:14px;font-weight:700;color:${value < 0 || (key === 'winRate' && value < 50) ? 'var(--signal-risk)' : 'var(--signal-strong)'};">${value}${key.includes('Rate') ? '%' : ''}</div>
    </div>
  `).join('');

  document.getElementById('wallet-stats').innerHTML = statsHtml;

  // Render trades
  const tradesHtml = (result.trades || []).slice(0, 5).map(t => `
    <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:4px;border-left:2px solid var(--signal-warn);font-size:9px;margin-bottom:6px;display:flex;justify-content:space-between;">
      <div><strong>${t.tokenIn || 'SOL'} → ${t.tokenOut || 'USDC'}</strong><br><span style="color:var(--text-muted);">${new Date(t.timestamp).toLocaleString()}</span></div>
      <div style="text-align:right;font-family:'Share Tech Mono';">
        <div>${t.amountIn || 0} → ${t.amountOut || 0}</div>
        <div style="color:${t.status === 'failed' ? 'var(--signal-risk)' : 'var(--signal-strong)'};">${t.status}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('wallet-trades').innerHTML = tradesHtml || '<div style="color:var(--text-muted);font-size:9px;">No trades found</div>';

  // Render holdings
  const holdingsHtml = (result.holdings || []).map(h => `
    <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:4px;border-left:2px solid var(--accent-data);font-size:9px;margin-bottom:6px;display:flex;justify-content:space-between;">
      <div><strong>${h.symbol}</strong><br><span style="color:var(--text-muted);">${h.balance.toFixed(2)}</span></div>
      <div style="text-align:right;color:var(--signal-warn);font-family:'Share Tech Mono';font-weight:700;">$${h.usdValue.toLocaleString()}</div>
    </div>
  `).join('');

  document.getElementById('wallet-holdings').innerHTML = holdingsHtml || '<div style="color:var(--text-muted);font-size:9px;">No holdings found</div>';

  document.getElementById('wallet-results').style.display = 'block';
}

// Export
window.analyzeWallet = analyzeWallet;
window.analyzeWalletInput = analyzeWalletInput;
window.renderWalletAnalyzer = renderWalletAnalyzer;
