# SHADDAI World — Game Integration Spec (v1)

Build standalone games with **opencode**; drop them into Shaddai World with zero rework.
Games are **self-contained web apps at a URL**. The world enters them through the existing
**portal system** and talks to them over a tiny **postMessage bridge**. x402 (SHAD-Credits)
handles wagers/rewards. That's the whole contract.

---

## 1. What a game IS

- A **single self-contained `index.html`** (inline or bundled JS/CSS), OR a folder with `index.html` + assets.
- Pure static — **no server required**. (Optional: call SHADDAI APIs for x402/leaderboard.)
- Runs **inside an iframe** in the world, OR as a full-page navigation. Build for iframe.
- Any engine that exports to static (vanilla JS/Canvas, Three.js, Phaser, PixiJS). For 3D, use the
  same Three.js via importmap (`https://unpkg.com/three@0.180.0`) to stay CSP-safe.

## 2. Where it lives (two options)

**A. Bundled (recommended):** drop the folder at `/games/<slug>/index.html` in the SHADDAI repo.
It is served at `https://<shaddai-host>/games/<slug>/`. (We add a static `/games` route — see §7.)

**B. External:** host anywhere (GitHub Pages, Vercel) and register the full `https://…` URL.

## 3. How it appears in the world — register a portal

Add an entry to `backend/portal-registry.json` (claim one of the `open-slot-*` or add a new one).
The world already reads this via `GET /api/grid/portals` and renders each as an enterable portal ring.

```json
{
  "id": "grid-runner",
  "name": "GRID RUNNER",
  "operator": "shaddai-treasury",
  "url": "/games/grid-runner/",
  "position": [141, 0, 141],
  "color": "#27e0ff",
  "entry_fee_usdc": 0,
  "type": "game",
  "tags": ["arcade", "racing", "tron"],
  "thumbnail": "/games/grid-runner/cover.png"
}
```

- `position` is `[x, 0, z]` in world units (the world multiplies by 0.3). Spread games 120–220 out.
- `entry_fee_usdc` > 0 → the world charges x402 before entry (pay-to-play). 0 → free.
- `type: "game"` so we can theme game portals distinctly from districts.
- Walk to the ring, press **E** → world navigates/opens your game URL.

## 4. The Shaddai bridge (postMessage API)

Your game runs in an iframe; `window.parent` is the world. **All messages are `{ type, ... }` JSON.**

### World → Game (you receive)
On load the world posts identity/context. Listen for it:
```js
window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'shaddai:init') {
    // m.user   → string user id ('guest' if anonymous)
    // m.tier   → 'free' | 'builder' | 'pro' | 'alpha'
    // m.credits→ number (SHAD-Credits balance)
    // m.agent  → host agent codename (e.g. 'ZEROX') or null
    startGame(m);
  }
  if (m.type === 'shaddai:charge:ok')  { /* wager accepted, m.balance */ }
  if (m.type === 'shaddai:charge:402') { /* insufficient, m.balance */ }
});
// tell the world you're ready (it replies with shaddai:init)
parent.postMessage({ type: 'shaddai:ready' }, '*');
```

### Game → World (you send)
```js
parent.postMessage({ type:'shaddai:score',  game:'grid-runner', score: 12345 }, '*'); // submit score
parent.postMessage({ type:'shaddai:charge', amount: 5, reason:'wager' }, '*');         // x402 debit (wager/buy-in)
parent.postMessage({ type:'shaddai:reward', amount: 20, reason:'win' }, '*');          // x402 credit (payout/prize)
parent.postMessage({ type:'shaddai:mint',   item:{ name:'Grid Champion', type:'art', url:'…' } }, '*'); // mint a collectible (Pro/Alpha)
parent.postMessage({ type:'shaddai:exit' }, '*');                                       // return to the world
```

> If your game is opened as a **full page** (not iframe), the same calls work against the REST API
> directly (§5) and you return to the world with `window.location.href = '/world3d'`.

## 5. x402 endpoints (wagers, prizes) — already live

Off-chain SHAD-Credits ledger. Use directly if you prefer REST over postMessage:
```
GET  /api/x402/balance?user=<id>                         → { balance }
POST /api/x402/charge  { user, amount, reason, payee }   → 200 { balance } | 402 insufficient
POST /api/x402/grant   { user, amount }                  → 200 { balance }   (prize payout)
GET  /api/x402/txns?user=<id>                            → recent transactions
```
5% marketplace fee on charges → treasury. Wager flow: `charge` buy-in → on win `grant` the prize.

## 6. Leaderboard (optional, we provide) 

```
POST /api/games/score  { game, user, score }   → { ok, rank, top:[…] }
GET  /api/games/leaderboard?game=<slug>&limit=10
```
(Tiny JSON store; we add it when the first game needs it — ask and it's ~20 min.)

## 7. What WE add on the SHADDAI side (so your game just works)

- `app.use('/games', express.static('games'))` in `_dash93.cjs` + `server-production.js`.
- Game-portal rendering + the postMessage bridge handler in `SHADDAI-WORLD-3D.html`
  (translates `shaddai:charge/reward/score` → the x402/leaderboard APIs and replies).
- `type:"game"` portal theming (arcade-pink ring + ▶ PLAY label).
These are small and we'll wire them the moment you have one game URL to point at.

## 8. Style guide (so games feel native)

- **Palette:** void `#04060d`, cyan `#27e0ff`, gold `#ffcf4a`, accent green `#00e5a0`, danger `#ff7a18`.
- **Fonts:** `Orbitron` (display/headers), `Share Tech Mono` (body/HUD) — Google Fonts.
- **Aesthetic:** Tron neon, glowing edges, dark void bg, additive glows, scanlines OK.
- **CSP-safe:** no `eval`/inline-string handlers; use addEventListener; load Three via importmap.
- **Perf:** target 60fps, responsive to iframe size, **mobile/touch friendly** (on-screen controls).
- **Audio:** start muted; unmute on first user gesture (autoplay policy).

## 9. Example games (each maps to an agent district)

| Game | Host agent | Hook |
|---|---|---|
| **Grid Runner** (endless Tron-bike racer) | NEXUS | high-score, x402 entry, leaderboard |
| **Market Mayhem** (predict the candle, live prices) | ZEROX | wager SHAD-Credits on real price moves |
| **Aegis Breach** (tower-defense vs. exploits) | PIKADON | learn-security mini-game, score |
| **Oracle's Riddles** (lore/crypto trivia) | ORACLE | daily quiz, prize payout |
| **Pixel Forge** (art/puzzle, mint winner) | TURTLE | mint best creation as a Museum NFT |
| **Solana BlackJack** (already exists in your repo) | ZEROX | wire its score/wager to the bridge |

## 10. Acceptance checklist (a game is "done" when…)

- [ ] Loads standalone at its URL with no console errors (works in an iframe).
- [ ] Posts `shaddai:ready`, handles `shaddai:init`, degrades gracefully if no parent (standalone play).
- [ ] Uses SHAD-Credits via the bridge or REST for any wager/prize (never invents currency).
- [ ] Has an **Exit** that posts `shaddai:exit` (or routes to `/world3d`).
- [ ] Matches the style guide (fonts, palette, neon), responsive + touch-friendly.
- [ ] Ships a `cover.png` (16:9) for the portal thumbnail.
- [ ] Registered in `portal-registry.json` with a unique `id`, `position`, `type:"game"`.

---

**TL;DR for opencode:** build a self-contained neon web game, listen for `shaddai:init`, send
`shaddai:score/charge/reward/exit`, add one entry to `portal-registry.json`. Hand me the URL and
I wire the `/games` route + bridge + portal theming on the SHADDAI side.
