# @ShaddaiHall — Command Reference

The Hall is one bot that fronts all 7 SHADDAI agents **plus** the live signals
feed, the gem community economy, and the whole bot family. Everything below is
in-chat. Paper gems only — not financial advice.

## Start & navigation
| Command | What it does |
|---|---|
| `/start` | Welcome card. `/start ref_XXXX` accepts a referral link. |
| `/menu` | The 7 sections on one board (hall cards). |
| `/help` | Full command list. |
| `/family` | Every SHADDAI bot on one card (Hall, Turtle Music, signals, ZEROX/Virtuals). |
| `/digest` | Daily roundup — community stats, top scorers, live market pulse. |

## Agents (each has free + paid depth)
| Command | Agent |
|---|---|
| `/oracle <question>` | ORACLE — research, markets, science, trends. |
| `/turtle <prompt>` | TURTLE — design direction, brand, UX concepts. |
| `/nexus <task>` | NEXUS — engineering, code, technical plans. |
| `/quill <task>` | QUILL — copy, docs, product descriptions. |
| `/pikadon <task>` | PIKADON — security review, audits, "is this safe?". |
| `/shaddai <goal>` | SHADDAI — orchestrates the whole team for a goal. |
| `/council <topic>` | All 7 agents, one synthesized verdict. |
| `/astro` `/horoscope` `/stars` | Daily guidance layer. |
| `/design <prompt>` | TURTLE generates an actual image. |
| `/check <url>` | PIKADON scans a URL for phishing/scripts/redirects (deep scan on paid). |

## Live markets & signals
| Command | What it does |
|---|---|
| `/signals` | Interactive signals hub — active calls, leaderboard, stats. |
| `/price <SYM>` | Live price + 24h for coins / Solana mints. |
| `/rug <SYM>` | Rug-check a token. |
| `/news` | Fresh market news. |
| `/lb` | PNL leaderboard (top tracked calls by Xs). |
| `/conviction <SYM> [gems]` | Stake gems on a call — the room's heat-map. |
| `/hot` | The most-backed calls. |

## Community & games (gems economy)
| Command | What it does |
|---|---|
| `/dice` `/dart` `/ball` `/bowl` `/slot` `/footy` | Native Telegram games, gems at stake. |
| `/arcade <game> [bet]` | CPU battle (basketball/football/dodgeball/sigil-storm), win doubles up. |
| `/games` | Arcade hub — all games + odds. |
| `/gems` | Balance + score · `/gems top` = league. |
| `/bonus` | Daily +25 free gems. |
| `/quest` | Daily quest bank: roll +10, win +20, invite +25. |
| `/referral` | Your invite link (inviter +100 gems +2 free brain-asks; friend +50). |
| `/refs` | Top referrers leaderboard. |
| `/leaderboard` | Podium — scorers, referrers, hot calls (`/leaderboard broadcast` = admin only). |
| `/music` | Free procedural track by TURTLE — earns +5 gems. |

## Master & games
| Command | What it does |
|---|---|
| `/master` | The full Temple index — every agent, game, MCP and link on one card. |
| `/arena <A> vs <B> [bet]` | Watch two agents fight a best-of-7 tilt; bet 5–200 gems on the first named. |
| `/grok <question>` | Ask Grok right here (xAI or AceDataCloud key). |
| `/game` | Telegram-native games hub — HTML5 game + native dice/dart/ball/bowl/slot/footy. |
| `/astro` | Pick a sign → ORACLE horoscope + moon phase (no sign = sign picker). |
| `/news` | Fresh market pulse, reloadable. |
| `/music` | Procedural track by TURTLE (+5 gems) — `/music lofi`. |
| `/headlines` | ORACLE news wires. |

## Paid
| Command | What it does |
|---|---|
| `/virtuals` | Hire ZEROX onchain via Virtuals agents. |
| `/pay` | Free vs paid tier comparison. |

## Family bots
- `@ShaddaiHall` — this bot.
- **Turtle Music Bot** — `/music [genre] [mood] [bars]` → awards +5 💎 into the same wallet.
- **Signals channel** (`@ShaddaiLabs`) — rug-filtered alpha feed, mirrors `/signals`.
- **ZEROX on Virtuals** — hire the agent onchain (`app.virtuals.io/acp/agents`).

## Environment (backend/.env)
| Var | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Hall bot (@BotFather). Only ONE long-poller per token — this bot owns it. |
| `TELEGRAM_CHANNEL` | Signals broadcast target. |
| `SHADDAI_BOT_USERNAME` | Referral deep-link username (fallback `ShaddaiHall`). |
| `SHADDAI_ADMIN_ID` | Telegram user id allowed to `/leaderboard broadcast`. |
| `TURTLE_MUSIC_BOT_TOKEN` | Standalone music bot (separate token). |
| `VIRTUALS_TELEGRAM_BOT_TOKEN` / `VIRTUALS_TELEGRAM_CHAT_ID` | Virtuals agent activity → Hall. |
| `VIRTUALS_AGENT_URL` | Override in `/family` link. |
| `X402_ENABLED` | `true` makes `/pay` real (USDC via x402). |

## Rules of the road
- One `getUpdates` poller per bot token — the Hall owns `TELEGRAM_BOT_TOKEN`.
- All money concepts are paper gems until `X402_ENABLED=true` + wallets are funded.
- Outcomes are server-side only (`sendDice` value from Telegram, never client input).