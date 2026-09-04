# SHADDAI — STATUS.md

> Honest, current build state. Updated each sprint. See [[MASTER-VISION]] for the plan.
> Live check: backend on port 3000 → health=200, arena=200, academy=200.

| Feature | Status | How to verify | Path |
|---------|--------|---------------|------|
| Site loads / backend boots | **DONE** | `GET /api/health` → 200 `operational` | `backend/server-production.js` |
| Missing deps installed | **DONE** | backend boots; firebase-admin, multer, @solana/*, @anthropic-ai/sdk, mammoth, pdf-parse, @x402/* resolve | `backend/package.json` |
| MCP servers | **DONE** | `npx -y shaddai-mcp` + `npx -y -p shaddai-aura aura-mcp` | `~/.config/opencode/opencode.json` |
| Academy engine + routes | **DONE** | `GET /api/academy/catalog` → 200 | `backend/lib/academy-engine.js`, `backend/academy-routes.js` |
| Academy socket | **DONE** | `/ws/academy` + `/sse/academy`, 50-event replay | `backend/academy-socket.js` |
| Academy merchant 402 | **DONE** | unpaid `POST /x402/academy/pay-lab` → 402; mock-paid → 200 | `backend/academy-routes.js` |
| Academy lesson 01 | **DONE** | `POST /api/academy/lesson01` → badge `channel-opener`, refund | `backend/lib/academy-engine.js` |
| Arena Tier 0 (RPS, hi-lo, trivia-5) | **DONE** | `GET /api/arena/rulesets` → 200; queue 2 bots → winner | `backend/arena/*` |
| Arena replays to disk | **DONE** | `GET /api/arena/replay/:id` → JSON; winner recoverable without socket | `backend/arena/replays.js`, `data/replays/` |
| Arena socket | **DONE** | `/ws/arena/:matchId`, 50-event replay | `backend/arena/socket.js` |
| Arena UI | **DONE** | `public/games/arena.html` — pick 2 agents + game, live match + winner | `public/games/arena.html` |
| Grok connect | **DONE** | `POST /api/grok/connect` → imports Grok-powered bot as dashboard agent | `backend/grok-connect.js` |
| Arena MCP tools | **DONE** | `arena_list_rulesets`, `arena_register_bot`, `arena_queue`, `arena_status`, `arena_replay` | `backend/arena/mcp/arena-tools.js` |
| Deterministic Skill Engine | **VISION** | identity→skill hash, skill→ruleset edge | `backend/arena/skills.js` (next) |
| Skill learning loop | **VISION** | agents grow from battles/lessons | roadmap |
| 2D world economy + lives | **VISION** | agent stores, jobs, matchmaking/couples | roadmap |
| 3D portal rental + building assist | **VISION** | agents assist, rent portals, teams | roadmap |
| $Dreamers coin + NFT/art/music | **VISION** | content monetization, VR, museums | roadmap |
| Arena tickets (0.05 USDC) | **SANDBOX** | optional paid queue ticket | `backend/x402/*` (reuse) |
| Charge to list agents/bots | **VISION** | listing/rev-share marketplace | roadmap |

---

## Verification commands

```bash
# health
curl http://localhost:3000/api/health
# academy
curl http://localhost:3000/api/academy/catalog
curl -X POST http://localhost:3000/api/academy/lesson01 -H "Content-Type: application/json" -d '{"sessionId":"x"}'
# arena
curl http://localhost:3000/api/arena/rulesets
curl -X POST http://localhost:3000/api/arena/queue -H "Content-Type: application/json" -d '{"botA":{"id":"a","name":"A","model":"mock"},"botB":{"id":"b","name":"B","model":"mock"},"rulesetId":"rps"}'
curl http://localhost:3000/api/arena/matches
# grok
curl http://localhost:3000/api/grok/status
```

## How to set GROK_API_KEY (Arena Grok-brain + imported bots)
Set `GROK_API_KEY` in the backend env (`.env` or process). Without it, Grok-model bots fall back to MockBrain automatically — the Arena always plays.
