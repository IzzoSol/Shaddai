'use strict';

/**
 * SHADDAI nft-mint.js
 * Real Solana NFT minting for SHADDAI collectibles via Metaplex Core.
 * DEVNET-FIRST, simulate-safe.
 *
 * Wire into the main TOOLS registry with ONE line:
 *   Object.assign(TOOLS, require('./lib/nft-mint'));
 *
 * SOLANA GUARDRAILS:
 *   - Network defaults to devnet. mainnet-beta ONLY when
 *     process.env.SOLANA_NETWORK === 'mainnet-beta' is explicitly set.
 *   - NEVER asks for or hardcodes seed phrases.
 *   - Signer secret comes ONLY from process.env.SOLANA_MINT_SECRET
 *     (base58 string OR JSON array of bytes).
 *   - If no signer is configured → clean { success:false, needsKey:true }.
 *   - @metaplex-foundation/* libs are lazy-required so this module always
 *     loads even when they are not installed.
 *
 * ENV:
 *   SOLANA_NETWORK     — 'mainnet-beta' to opt into mainnet; anything else → devnet
 *   SOLANA_MINT_SECRET — signer secret (base58 or JSON byte array)
 *   HELIUS_RPC_URL / SOLANA_RPC_URL — optional custom RPC endpoint
 */

// @solana/web3.js IS in the repo root package.json — safe to require at top.
const { Keypair, clusterApiUrl } = require('@solana/web3.js');

// ─── helpers ────────────────────────────────────────────────────────────────

/** Resolve the active network — devnet unless mainnet is EXPLICITLY requested. */
function resolveNetwork() {
  return process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
}

/** Resolve the RPC endpoint for the active network. */
function resolveRpc(network) {
  return (
    process.env.HELIUS_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    clusterApiUrl(network)
  );
}

/** Cluster query-string suffix for Solana Explorer links. */
function explorerCluster(network) {
  return network === 'mainnet-beta' ? '' : `?cluster=${network}`;
}

/**
 * Parse process.env.SOLANA_MINT_SECRET into raw secret-key bytes.
 * Accepts a JSON byte array ("[1,2,3,...]") or a base58 string.
 * Returns Uint8Array, or null if unset/unparseable.
 * NEVER accepts or parses seed phrases.
 */
function parseSecret(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // JSON byte array form, e.g. "[12,34,...]"
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length) return Uint8Array.from(arr);
    } catch (_) { /* fall through */ }
    return null;
  }

  // Reject anything that looks like a mnemonic/seed phrase.
  if (/\s/.test(trimmed)) return null;

  return trimmed; // base58 string — decoded by umi/bs58 later
}

// ─────────────────────────────────────────────────────────────────────────────
// mint_nft tool
// ─────────────────────────────────────────────────────────────────────────────

const mint_nft = {
  name: 'mint_nft',
  description:
    'Mint a SHADDAI collectible as a REAL Solana NFT using Metaplex Core. ' +
    'Devnet by default (simulate-safe); mainnet-beta only when SOLANA_NETWORK=mainnet-beta is explicitly set. ' +
    'Signer comes only from SOLANA_MINT_SECRET (base58 or JSON byte array) — never a seed phrase. ' +
    'Returns the on-chain mint address and a Solana Explorer link on success, or a clean ' +
    'needs-key / needs-libs message otherwise (never crashes, never fakes a mint).',
  schema: {
    name: 'string — NFT display name (required)',
    uri: 'string — optional: metadata JSON URI (off-chain). Defaults to an empty data URI.',
    description: 'string — optional: human description of the collectible',
    collectibleId: 'string — optional: SHADDAI collectible id to tag the mint'
  },
  agents: ['NEXUS', 'ZEROX', 'TURTLE', 'SHADDAI'],
  async execute({ name, uri, description, collectibleId } = {}) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return JSON.stringify({ success: false, error: 'name is required' });
    }

    const network = resolveNetwork();
    const rpc = resolveRpc(network);

    // ── Guardrail 1: signer must be configured ──────────────────────────────
    const secret = parseSecret(process.env.SOLANA_MINT_SECRET);
    if (!secret) {
      return JSON.stringify({
        success: false,
        needsKey: true,
        network,
        error:
          'No signer configured. Set SOLANA_MINT_SECRET (base58 string or JSON byte array) ' +
          'in backend/.env to mint. Seed phrases are never accepted.'
      });
    }

    // ── Guardrail 2: Metaplex Core libs may not be installed ────────────────
    let mplCore, umiBundle, umiKeypairs, umiSigners;
    try {
      mplCore = require('@metaplex-foundation/mpl-core');
      umiBundle = require('@metaplex-foundation/umi-bundle-defaults');
      // umi core helpers ship transitively with the bundle.
      umiKeypairs = require('@metaplex-foundation/umi');
      umiSigners = umiKeypairs;
    } catch (_) {
      return JSON.stringify({
        success: false,
        network,
        error:
          'Metaplex Core libs not installed — run: ' +
          'npm i @metaplex-foundation/mpl-core @metaplex-foundation/umi-bundle-defaults'
      });
    }

    try {
      const { createUmi } = umiBundle;
      const { create } = mplCore;
      const {
        generateSigner,
        signerIdentity,
        createSignerFromKeypair
      } = umiSigners;

      const umi = createUmi(rpc);

      // Build the signer keypair from SOLANA_MINT_SECRET (never a seed phrase).
      let umiKeypair;
      if (typeof secret === 'string') {
        // base58 — convert via web3.js Keypair, then into umi.
        const bs58 = require('bs58');
        const decoded =
          (bs58.decode ? bs58.decode(secret) : bs58.default.decode(secret));
        const web3kp = Keypair.fromSecretKey(Uint8Array.from(decoded));
        umiKeypair = umi.eddsa.createKeypairFromSecretKey(web3kp.secretKey);
      } else {
        // JSON byte array → web3.js Keypair → umi keypair.
        const web3kp = Keypair.fromSecretKey(secret);
        umiKeypair = umi.eddsa.createKeypairFromSecretKey(web3kp.secretKey);
      }

      const signer = createSignerFromKeypair(umi, umiKeypair);
      umi.use(signerIdentity(signer));

      // Fresh asset address for this mint.
      const asset = generateSigner(umi);

      // Off-chain metadata URI. If none supplied, embed a minimal data URI so
      // the mint still succeeds in a devnet simulation.
      const metaUri =
        (uri && typeof uri === 'string' && uri.trim()) ||
        ('data:application/json,' +
          encodeURIComponent(
            JSON.stringify({
              name,
              description: description || `SHADDAI collectible${collectibleId ? ' #' + collectibleId : ''}`,
              attributes: collectibleId ? [{ trait_type: 'collectibleId', value: String(collectibleId) }] : []
            })
          ));

      await create(umi, {
        asset,
        name: name.slice(0, 64),
        uri: metaUri
      }).sendAndConfirm(umi);

      const mintAddress = asset.publicKey.toString();

      return JSON.stringify({
        success: true,
        mintAddress,
        network,
        collectibleId: collectibleId || null,
        name,
        uri: metaUri.startsWith('data:') ? '(inline data URI)' : metaUri,
        explorer: `https://explorer.solana.com/address/${mintAddress}${explorerCluster(network)}`
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        network,
        error: `Mint failed: ${err && err.message ? err.message : String(err)}`
      });
    }
  }
};

module.exports = { mint_nft };
