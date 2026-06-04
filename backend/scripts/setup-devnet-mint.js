#!/usr/bin/env node
'use strict';
/**
 * One-time: provision a DEVNET platform mint authority for SHADDAI NFT minting.
 * Generates a throwaway keypair (NOT a user seed phrase), appends SOLANA_MINT_SECRET
 * + SOLANA_NETWORK=devnet to backend/.env (gitignored), and airdrops devnet SOL.
 * Idempotent: reuses an existing SOLANA_MINT_SECRET if already set.
 */
const path = require('path');
const fs = require('fs');
const ENV = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV });
const { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');

(async () => {
  let kp;
  const existing = (process.env.SOLANA_MINT_SECRET || '').trim();
  if (existing.startsWith('[')) {
    kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(existing)));
    console.log('• Reusing existing SOLANA_MINT_SECRET');
  } else {
    kp = Keypair.generate();
    const block = `\n# ── Devnet NFT mint authority (auto-generated; throwaway, DEVNET ONLY) ──\nSOLANA_NETWORK=devnet\nSOLANA_MINT_SECRET=[${kp.secretKey.toString()}]\n`;
    fs.appendFileSync(ENV, block);
    console.log('• Generated keypair + wrote SOLANA_MINT_SECRET to backend/.env (gitignored)');
  }
  const pub = kp.publicKey.toString();
  console.log('• Mint authority (devnet):', pub);

  const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');
  let bal = await conn.getBalance(kp.publicKey);
  console.log('• Balance:', (bal / LAMPORTS_PER_SOL).toFixed(3), 'SOL');
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    try {
      console.log('• Requesting devnet airdrop (1 SOL)…');
      const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
      bal = await conn.getBalance(kp.publicKey);
      console.log('• Airdropped ✓ Balance:', (bal / LAMPORTS_PER_SOL).toFixed(3), 'SOL');
    } catch (e) {
      console.log('• Airdrop failed (' + e.message + ').');
      console.log('  Fund manually (devnet) at https://faucet.solana.com → ' + pub);
    }
  }
  console.log('Done. Restart the server to load SOLANA_MINT_SECRET.');
  process.exit(0);
})().catch(e => { console.error('setup failed:', e.message); process.exit(1); });
