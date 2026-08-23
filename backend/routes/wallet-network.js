/**
 * Wallet Network Visualization API
 * Graph: tracked wallets ↔ coins they hold
 * Shows: volumes, win rates, shared holdings
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Build network graph from tracked wallets
 * Nodes: wallets + coins
 * Edges: wallet holdings with volume/price data
 */
async function buildWalletNetwork() {
  try {
    const walletsPath = path.join(DATA_DIR, 'watched-wallets.json');
    const walletsData = JSON.parse(fs.readFileSync(walletsPath, 'utf8') || '{}');
    const wallets = Object.values(walletsData);

    const nodes = {
      wallets: [],
      coins: {},
    };

    const edges = [];
    const coinStats = {};

    // Build wallet nodes
    wallets.forEach(w => {
      nodes.wallets.push({
        id: w.address,
        type: 'wallet',
        label: w.label || w.address.slice(0, 6) + '...',
        walletType: w.type || 'alpha',
        emoji: getWalletEmoji(w.type),
        addedAt: w.addedAt,
        hitCount: w.hitCount || 0,
        wins: w.wins || 0,
        winRate: w.hitCount ? ((w.wins || 0) / w.hitCount * 100).toFixed(0) : 0,
      });
    });

    // For now, mock coin holdings (in production, would fetch from Helius/Solscan)
    // TODO: Integrate with Helius API to fetch real holdings per wallet
    const mockHoldings = generateMockHoldings(wallets);

    // Build edges (wallet → coin)
    mockHoldings.forEach(holding => {
      const coinId = holding.mint.toLowerCase();
      const walletId = holding.walletAddress;

      // Add coin node if not exists
      if (!nodes.coins[coinId]) {
        nodes.coins[coinId] = {
          id: coinId,
          type: 'coin',
          symbol: holding.symbol,
          fdv: holding.fdv,
          liquidity: holding.liquidity,
          holders: holding.holders,
          entryPrice: holding.entryPrice,
          currentPrice: holding.currentPrice,
          multiplier: holding.multiplier,
          holderCount: 1,
        };
        coinStats[coinId] = { symbol: holding.symbol, walletCount: 0, totalVolume: 0 };
      } else {
        nodes.coins[coinId].holderCount = (nodes.coins[coinId].holderCount || 1) + 1;
      }

      // Add edge
      edges.push({
        source: walletId,
        target: coinId,
        amount: holding.amount,
        value: holding.value,
        percentage: holding.percentage,
        enteredAt: holding.enteredAt,
        multiplier: holding.multiplier,
      });

      // Update coin stats
      coinStats[coinId].walletCount += 1;
      coinStats[coinId].totalVolume = (coinStats[coinId].totalVolume || 0) + (holding.value || 0);
    });

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalWallets: nodes.wallets.length,
        totalCoins: Object.keys(nodes.coins).length,
        totalEdges: edges.length,
        avgHoldingsPerWallet: (edges.length / Math.max(nodes.wallets.length, 1)).toFixed(2),
      },
      nodes: {
        wallets: nodes.wallets,
        coins: Object.values(nodes.coins),
      },
      edges: edges,
      coinStats: coinStats,
      visualization: {
        width: 1400,
        height: 800,
        layout: 'force-directed',
      },
    };
  } catch (e) {
    console.error('Network build error:', e);
    return { error: e.message };
  }
}

/**
 * Generate mock holdings (placeholder for Helius integration)
 * In production, this would query Helius API for actual wallet holdings
 */
function generateMockHoldings(wallets) {
  const mockCoins = [
    { symbol: 'SOL', mint: '11111111111111111111111111111112', fdv: 150000000000 },
    { symbol: 'USDC', mint: 'EPjFWaLb3xlutoajmCH5siFEjuc92i342d4mHpmoxWP', fdv: 100000000000 },
    { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz8w6VsRaMyQn7H8EdyDYpspNAXKu', fdv: 2000000000 },
    { symbol: 'COPE', mint: '8HGyAAB1yoM1ttS7pXjHMa3dukTsobNVnhy7PJ3ZoPZ', fdv: 120000000 },
    { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hKeGUSdzJ1Kin7nVrQaZw5QbL', fdv: 3000000000 },
  ];

  const holdings = [];

  wallets.slice(0, 5).forEach((wallet, wIdx) => {
    const coinCount = Math.floor(Math.random() * 4) + 1;
    const selectedCoins = mockCoins.sort(() => Math.random() - 0.5).slice(0, coinCount);

    selectedCoins.forEach(coin => {
      const amount = Math.floor(Math.random() * 10000) + 100;
      const entryPrice = (Math.random() * 100 + 10).toFixed(8);
      const currentPrice = (parseFloat(entryPrice) * (Math.random() * 3 + 0.5)).toFixed(8);
      const value = amount * parseFloat(currentPrice);

      holdings.push({
        walletAddress: wallet.address,
        symbol: coin.symbol,
        mint: coin.mint,
        amount: amount,
        entryPrice: parseFloat(entryPrice),
        currentPrice: parseFloat(currentPrice),
        value: Math.round(value),
        multiplier: (currentPrice / entryPrice).toFixed(2),
        percentage: ((amount / 10000) * 100).toFixed(2),
        enteredAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
        fdv: coin.fdv,
        liquidity: coin.fdv * 0.05,
        holders: Math.floor(Math.random() * 50000) + 1000,
      });
    });
  });

  return holdings;
}

/**
 * Get emoji for wallet type
 */
function getWalletEmoji(type) {
  const emojis = {
    alpha: '🎯',
    whale: '🐋',
    smart: '🧠',
    kol: '📣',
    dev: '⚠️',
    sniper: '🔫',
    team: '👥',
    fund: '🏦',
  };
  return emojis[type] || '👤';
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/wallet-network
 * Full network graph (nodes + edges)
 */
router.get('/', async (req, res) => {
  const network = await buildWalletNetwork();
  res.json(network);
});

/**
 * GET /api/wallet-network/wallets
 * List all tracked wallets with stats
 */
router.get('/wallets', (req, res) => {
  try {
    const walletsPath = path.join(DATA_DIR, 'watched-wallets.json');
    const walletsData = JSON.parse(fs.readFileSync(walletsPath, 'utf8') || '{}');
    const wallets = Object.values(walletsData).map(w => ({
      address: w.address,
      label: w.label || w.address.slice(0, 6) + '...',
      type: w.type || 'alpha',
      emoji: getWalletEmoji(w.type),
      addedAt: w.addedAt,
      hitCount: w.hitCount || 0,
      wins: w.wins || 0,
      winRate: w.hitCount ? ((w.wins || 0) / w.hitCount * 100).toFixed(0) : 0,
      lastSeen: w.lastSeen || 0,
    }));

    res.json({
      count: wallets.length,
      wallets: wallets.sort((a, b) => (b.wins || 0) - (a.wins || 0)),
    });
  } catch (e) {
    res.json({ count: 0, wallets: [], error: e.message });
  }
});

/**
 * GET /api/wallet-network/coins
 * Coins held by tracked wallets
 */
router.get('/coins', async (req, res) => {
  const network = await buildWalletNetwork();
  res.json({
    coins: network.nodes.coins,
    coinStats: network.coinStats,
  });
});

/**
 * GET /api/wallet-network/wallet/:address
 * Deep dive into a specific wallet
 */
router.get('/wallet/:address', (req, res) => {
  try {
    const walletsPath = path.join(DATA_DIR, 'watched-wallets.json');
    const walletsData = JSON.parse(fs.readFileSync(walletsPath, 'utf8') || '{}');
    const wallet = walletsData[req.params.address.toLowerCase()] ||
                   walletsData[req.params.address];

    if (!wallet) {
      return res.json({ error: 'Wallet not found' });
    }

    res.json({
      wallet: {
        address: wallet.address,
        label: wallet.label || wallet.address.slice(0, 6) + '...',
        type: wallet.type || 'alpha',
        emoji: getWalletEmoji(wallet.type),
        addedAt: wallet.addedAt,
        hitCount: wallet.hitCount || 0,
        wins: wallet.wins || 0,
        winRate: wallet.hitCount ? ((wallet.wins || 0) / wallet.hitCount * 100).toFixed(0) : 0,
        lastSeen: wallet.lastSeen || 0,
      },
      recentActivity: {
        lastTx: wallet.lastTx || null,
        totalCalls: wallet.totalCalls || 0,
      },
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
