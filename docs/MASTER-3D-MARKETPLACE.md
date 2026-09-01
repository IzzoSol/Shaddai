# SHADDAI 3D MARKETPLACE — Master Prompt / Design Contract

## Objective
Upgrade `public/forge-gallery.html` from a read-only "Render Review" into a
**master 3D marketplace** inside SHADDAI's existing stack. No external clone
(XANALIA/Agora/Open3DHub rejected: supply-chain risk, second codebase, and we
already have the forge engine + settlement rails). Everything is additive and
reuses proven backend routes.

## Boundaries (PIKADON)
- DO NOT introduce third-party marketplaces or unvetted npm deps.
- Settlement is NON-CUSTODIAL: never moves real on-chain funds. It debits the
  buyer's x402 credit ledger and credits the seller's paybox ledger (the exact
  pattern `backend/lib/paybox-settle.js` already implements).
- Gate stays 4444 in Simple Mode and the landing door; the marketplace is
  always listed, only purchases require 4444 + sign-in.
- Download is gated: file URL only returned after a settled (or free) purchase.
- Sanitize all user text; no raw eval; GLB paths always path.basename'd on server.

## Data (reuse, verified live)
- `GET /api/forge/models` → `{ archetypes: { <id>: { glb, thumb, name } } }`.
  8 archetypes (vanguard, ghost, artisan, oracle, street-deity, gaia-link,
  psionic, harvester). Real GLBs exist on disk (static + `-walk`).
- `public/assets/forge-models/*.glb` → downloadable after purchase.
- `POST /api/forge/3d` (Meshy text-to-3D, PRO gate, needs MESHY_KEY) + poll
  `GET /api/forge/3d/:taskId` → captures a buyer-forged GLB into
  `public/assets/forge-models/pixel-<id>.glb`. This is the "TURTLE saves models"
  path the user wants.
- Operatives (`/api/operatives`) carry `monetizePrice`, `tools[]`, `model`,
  `codename` — the "selling agent" identity and price for the paybox settlement.

## Settlement reuse
- `POST /api/paybox/tip` + `POST /api/paybox/confirm-order` already settle via
  `paybox-settle` (5% fee, receipts, x402 ledger, non-custodial).
- Sparks economy is `/api/economy`; a purchase can be priced in Sparks, and the
  credit ledger is the same x402 ledger paybox-settle moves.
- Stripe webhooks already mounted for real-money subscriptions/tiers; the
  marketplace stays on Sparks/credits (matching the closed-loop economy) and
  can expose a Stripe "top up"?NO — keep scope: Sparks + paybox/x402 only now.

## Build (forge-gallery.html)
1. Keep the working Three.js viewer (importmap + GLTFLoader + OrbitControls).
2. Load `GET /api/forge/models` and render a card per archetype.
3. Each card: thumbnail/GLB preview, archetype name, **price in Sparks**
   (derived from the matching operative's `monetizePrice`, default e.g. 500),
   a **Buy / Download** and a **Preview fullscreen** action.
4. Buy flow:
   - Gate: require 4444 unlock (shared `shd_open_market3d` key) + sign-in
     (`shd_userid`/`shd_token` present).
   - Confirm modal showing price in Sparks.
   - `POST /api/paybox/tip` (or a new marketplace endpoint) with buyer user,
     itemId=`3d:<arch>`, sellerAgent=archetype operative name, amountCredits,
     reason=`3d-model:<arch>`.
   - On ok → unlock download of the GLB and show receipt (txId).
   - On INSUFFICIENT_CREDITS (402) → surface "need more Sparks" + link to
     wealth/upgrade.
5. Post-purchase download: server returns the asset URL only after a settled
   receipt for that buyer/model. Prefer a small new backend endpoint
   `GET /api/market/file?model=<arch>&user=<uid>&tx=<txId>` that both checks the
   receipt and path.basename's the file name (no path traversal).
6. Forge/upload: "Forge your own" (Pro) → `POST /api/forge/3d`, poll, then the
   new model appears as a purchasable listing once saved. Keep the modal
   minimal; full forge UI is a later pass.
7. Visual: match existing theme (dark, `--neon:#27e0ff`, glow borders, mono
   stats). Keep access to enter.html/simple.html gates.

## Shipping
- `node --check` each changed JS. Serve locally, confirm endpoints reshaped.
- Commit + push after each verified batch. Tell the user what broke/needs env
  (MESHY_KEY, admin tokens) rather than silently shipping a dead button.
