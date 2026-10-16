# SHADDAI-FINAL merge prep — wiring + onboarding + dashboard math (2026-10-16)

Source: `C:\Users\Brittany\shaddai-n8n\SHADDAI-FINAL.html` (413KB, 2517 lines, OPEN in
browser now). Static file: NO fetch calls, all data inline, 6 script blocks
(three@0.160 CDN + 5 inline), 451 ids, 18 functions. Tab engine: `#tabs button
[data-tab]` + `.tab` sections + `go(tab)` — portable as-is.

## 16 tabs → repo targets (extract per-tab, never paste whole file)
| Tab | Goes to | Notes |
|---|---|---|
| dossier | `portfolio/hub/dossier.html` (exists — reconcile, keep newer) | 10-section whitepaper content |
| master | thinking-graphs content | mind-map SVG |
| money | revenue diagrams | money-map SVG |
| sim | dashboard module (client math stays) | `drawMRR/model/chart`, see Math below |
| realm | `portfolio/hub/realm.html` (exists — reconcile) | SVG fly() + canvas; three CDN only here |
| platform / mcp / aura / lifecycle | `dash-agent-chat.js` / `dash-aura.js` / approvals (WP-2) | live data replaces statics |
| backend | `GET /roster` | 28 office literals → live roster (agent import) |
| workflows | Workflows tab + 4 n8n JSON imports | creds in n8n UI only |
| gamedev / content | pipeline docs + content-studio wiring | later |
| thinking | thinking-graphs | static, copy |
| publish | publish flow (immutable versions) | needs backend (WP-6) |
| handoff | `docs/` | already have |

## Dashboard math (what Opus wires, client keeps)
`applyPrices(P)` shape (from sim tab): `{catalog:{plan_base_usd},
bazaar:{avg_deal_usd}, colosseum:{avg_ticket_sparks}, plots:{cost_sparks},
peg:{spark_usd}, tiers:[{id,monthly}]}`. Backend serves this FROM `prices.json`
v1.1.0 (extend `/usage` or new `GET /prices`; versioned, effective-dated per Part C.3).
`drawMRR/model/chart` stay client-side — pure functions of P + toggles. 1 oz
localStorage = cache only (server is truth; rollback on refusal per sparks spec).

## Onboarding wizard (DOES NOT EXIST — build per WP-3)
Only `setup_once` clip ids found. Build new module: template → persona (live token
count) → power source (hosted/BYOK/endpoint/external + 4 honesty notes) →
grants (least privilege) → budgets → avatar (approved catalog) → Playground
(deterministic gates) → publish. First-run trigger via localStorage. Spec
`docs/FORGE_UI_PLAN.md` FIRST, owner approval before code.

## 3D-world agent import (backend for the realm)
- In-game tab `public/world-agents-ui.js`: My agents + usage + pause/kill,
  read-only budgets, ~0 per-frame cost (no render-loop polling).
- Static 28 office literals → `GET /roster` (`{agents:[{id,name,role,grants,provider}]}`).
- Chat/approvals later via `POST /chat` SSE + `POST /approvals/:id/decision|resume`
  (Part B/C contract). Presence protocol (Master Prompt §10) after economy.
- Blockers first (WP-0): `sparksRoutes.js` + `sparksCore.js`, MCP bridge :3001→:3002.

## Do-not-break (from shaddai-n8n CLAUDE-HANDOFF)
`portfolio.mjs` wipes hand edits → cards in `extras.json`; hub copies re-copied
from shaddai-n8n on edit; `Idempotency-Key` on every POST; mask `shdx_`/`bab_live_`;
xStocks/NVDAx geo-restricted; no yield promises; token optional, no staking.
