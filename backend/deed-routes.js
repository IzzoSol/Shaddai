'use strict';
/**
 * deed-routes.js — Metaplex Core NFT deed minting for SHADDAI City plots.
 * Mints a Metaplex Core asset (single-account standard, ~0.003 SOL) on Solana devnet.
 * Mainnet requires SOLANA_NETWORK=mainnet-beta + funded platform keypair.
 *
 * Routes (mount at /api/deed):
 *   POST /mint        { uid, plotId, slot, walletAddress, tier, district }
 *                     → { ok, mintAddress, signature, explorerUrl }
 *   GET  /plot/:slot  → { ok, deed } — deed record for a given plot slot
 *   GET  /owner/:wallet → { ok, deeds } — all deeds for a wallet
 *   GET  /stats        → { ok, minted, network }
 *
 * Storage: backend/data/deeds.json (mint address + metadata per plot).
 * Keypair:  SOLANA_PLATFORM_KEYPAIR env var (base58 secret key) OR auto-generates
 *           a devnet keypair (saved to backend/data/platform-keypair.json for reuse).
 *
 * Metadata: stored on-chain URI points to /api/deed/metadata/:slot (served by this router).
 */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const json     = express.json();

// Lazily load Solana + Metaplex only when a mint is attempted
let _umi = null;
const DATA_DIR  = path.join(__dirname, 'data');
const DEEDS_FILE = path.join(DATA_DIR, 'deeds.json');
const KP_FILE    = path.join(DATA_DIR, 'platform-keypair.json');

function loadDeeds() {
  try { return JSON.parse(fs.readFileSync(DEEDS_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function saveDeeds(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DEEDS_FILE, JSON.stringify(d, null, 2));
}

const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC = NETWORK === 'mainnet-beta'
  ? (process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com')
  : 'https://api.devnet.solana.com';

// Build or restore the platform keypair (the server-side minting authority)
function getPlatformKeypair() {
  const { Keypair } = require('@solana/web3.js');
  const envKey = process.env.SOLANA_PLATFORM_KEYPAIR;
  if (envKey) {
    const bs58 = require('bs58');
    const decoded = typeof bs58.decode === 'function' ? bs58.decode(envKey) : (bs58.default||bs58).decode(envKey);
    return Keypair.fromSecretKey(decoded);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(KP_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KP_FILE, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(saved));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(KP_FILE, JSON.stringify(Array.from(kp.secretKey)));
  console.log('[deed] New platform keypair generated:', kp.publicKey.toBase58());
  console.log('[deed] Fund it on devnet: https://faucet.solana.com/?address=' + kp.publicKey.toBase58());
  return kp;
}

// Initialize UMI once (lazy)
async function getUmi() {
  if (_umi) return _umi;
  const { createUmi }    = require('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore }      = require('@metaplex-foundation/mpl-core');
  const { keypairIdentity, createSignerFromKeypair } = require('@metaplex-foundation/umi');

  const platformKp = getPlatformKeypair();
  const umi = createUmi(RPC).use(mplCore());

  // Convert Solana Keypair → UMI signer
  const umiKp = umi.eddsa.createKeypairFromSecretKey(platformKp.secretKey);
  umi.use(keypairIdentity(umiKp));
  _umi = umi;
  return umi;
}

// Build metadata JSON for a plot deed
function buildMetadata(slot, tier, district, ownerWallet) {
  const tierNames = ['Raw', 'Developed', 'Landmark'];
  const tierName  = tierNames[tier] || 'Raw';
  return {
    name: `SHADDAI City · Founders Row #${slot + 1}`,
    symbol: 'SHAD-PLOT',
    description: `${tierName}-tier plot deed in SHADDAI City, Founders Row. District: ${district}. Owner: ${ownerWallet}.`,
    image: `https://shaddai-g81x.onrender.com/api/deed/image/${slot}`,
    external_url: 'https://shaddai-g81x.onrender.com',
    attributes: [
      { trait_type: 'Plot Slot',   value: slot + 1 },
      { trait_type: 'Tier',        value: tierName },
      { trait_type: 'District',    value: district || 'agentcity' },
      { trait_type: 'Row',         value: 'Founders Row' },
      { trait_type: 'Network',     value: NETWORK }
    ]
  };
}

// GET /api/deed/metadata/:slot — serve metadata JSON (used as on-chain URI)
router.get('/metadata/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  if (!Number.isFinite(slot) || slot < 0 || slot > 29) return res.status(400).json({ error: 'invalid slot' });
  const deeds = loadDeeds();
  const deed  = deeds[slot];
  if (!deed) return res.status(404).json({ error: 'deed not minted yet' });
  res.json(buildMetadata(slot, deed.tier || 0, deed.district, deed.ownerWallet));
});

// GET /api/deed/image/:slot — placeholder SVG deed image
router.get('/image/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10) || 0;
  const deeds = loadDeeds();
  const d = deeds[slot] || {};
  const colors = ['#4a5a6a', '#00b4e5', '#e8c45c'];
  const col = colors[d.tier || 0] || colors[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#06080b"/>
    <rect x="20" y="20" width="360" height="360" rx="24" fill="#0e1420" stroke="${col}" stroke-width="2"/>
    <text x="200" y="80" text-anchor="middle" font-family="monospace" font-size="13" fill="${col}" letter-spacing="3">SHADDAI CITY</text>
    <text x="200" y="140" text-anchor="middle" font-family="monospace" font-size="28" fill="#eaf3fb" font-weight="bold">PLOT #${slot + 1}</text>
    <text x="200" y="180" text-anchor="middle" font-family="monospace" font-size="12" fill="${col}">${['RAW','DEVELOPED','LANDMARK'][d.tier||0]} · FOUNDERS ROW</text>
    <rect x="140" y="210" width="120" height="80" rx="12" fill="${col}22" stroke="${col}55" stroke-width="1"/>
    <text x="200" y="260" text-anchor="middle" font-family="monospace" font-size="11" fill="#eaf3fb">Deed on Solana</text>
    <text x="200" y="280" text-anchor="middle" font-family="monospace" font-size="9" fill="${col}">${NETWORK.toUpperCase()}</text>
    <text x="200" y="370" text-anchor="middle" font-family="monospace" font-size="9" fill="#3a4a5a">shaddai-g81x.onrender.com</text>
  </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// POST /api/deed/mint — mint a Metaplex Core NFT for a plot
router.post('/mint', json, async (req, res) => {
  const { uid, plotId, slot, walletAddress, tier = 0, district = 'agentcity' } = req.body || {};
  if (!uid || slot === undefined || slot === null) return res.status(400).json({ ok: false, error: 'uid and slot required' });
  if (typeof slot !== 'number' || slot < 0 || slot > 29) return res.status(400).json({ ok: false, error: 'slot must be 0-29' });

  const deeds = loadDeeds();
  // Prevent duplicate mints for the same slot
  if (deeds[slot] && deeds[slot].mintAddress) {
    return res.json({ ok: true, already: true, mintAddress: deeds[slot].mintAddress, explorerUrl: deeds[slot].explorerUrl });
  }

  try {
    const umi = await getUmi();
    const { create, fetchAsset } = require('@metaplex-foundation/mpl-core');
    const { generateSigner, publicKey: umiPubkey } = require('@metaplex-foundation/umi');

    const metadataUri = `https://shaddai-g81x.onrender.com/api/deed/metadata/${slot}`;
    const asset = generateSigner(umi);

    // Build the mint instruction
    const ownerPubkey = walletAddress
      ? umiPubkey(walletAddress)
      : umi.identity.publicKey;

    const result = await create(umi, {
      asset,
      name:  `SHADDAI Plot #${slot + 1}`,
      uri:   metadataUri,
      owner: ownerPubkey
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

    const mintAddress  = asset.publicKey.toString();
    const signature    = Buffer.from(result.signature).toString('base64');
    const explorerUrl  = `https://explorer.solana.com/address/${mintAddress}?cluster=${NETWORK}`;

    // Persist deed record
    deeds[slot] = { slot, uid, ownerWallet: walletAddress || null, mintAddress, signature, explorerUrl, tier, district, mintedAt: Date.now(), network: NETWORK };
    saveDeeds(deeds);

    console.log(`[deed] Minted plot #${slot + 1} → ${mintAddress} (${NETWORK})`);
    return res.json({ ok: true, mintAddress, signature, explorerUrl, network: NETWORK });
  } catch (e) {
    const msg = String((e && e.message) || e);
    // Insufficient SOL on devnet is the most common failure — give a helpful error
    if (msg.includes('insufficient') || msg.includes('balance')) {
      return res.status(503).json({ ok: false, error: 'Platform wallet needs SOL for minting. Fund it at https://faucet.solana.com', detail: msg.slice(0, 200) });
    }
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) });
  }
});

// GET /api/deed/plot/:slot
router.get('/plot/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const deeds = loadDeeds();
  const deed  = deeds[slot];
  if (!deed) return res.json({ ok: true, deed: null, minted: false });
  res.json({ ok: true, deed, minted: true });
});

// GET /api/deed/owner/:wallet
router.get('/owner/:wallet', (req, res) => {
  const { wallet } = req.params;
  const deeds = loadDeeds();
  const owned = Object.values(deeds).filter(d => d.ownerWallet === wallet);
  res.json({ ok: true, wallet, deeds: owned });
});

// GET /api/deed/stats
router.get('/stats', (req, res) => {
  const deeds = loadDeeds();
  res.json({ ok: true, minted: Object.keys(deeds).length, network: NETWORK, rpc: RPC });
});

module.exports = router;
