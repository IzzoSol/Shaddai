# HANDOFF — SHADDAI Quick Start

Paste this whole file as your first message in a new terminal session.

---

## Context you need

**Repo:** `C:\Users\Brittany\Shaddai` · branch `main` · **10 commits ahead of `origin/main`, never pushed.**

**Environment gotchas (learned the hard way — don't rediscover these):**
- Windows. PowerShell is primary. The Bash tool works for `cat`/`grep`/`ls`/`rm`/`node`, but use PowerShell for `git commit` with multi-line messages (here-strings `@'...'@`, closing `'@` at column 0).
- **A stale node server has been holding port 3000 since 2026-08-25 (PID 16072).** It runs OLD code. If you test against :3000 you will get stale results and draw wrong conclusions — this already happened once. Start a test server on a free port instead: `$env:PORT='3115'; node backend/server-production.js`.
- Run tests with `npx jest backend/tests/ --testPathIgnorePatterns worktrees node_modules`. Without that flag jest also picks up `.claude/worktrees/rag-brain-corpus-ingestion/` (a separate unmerged branch) and reports 3 pre-existing failures that are **not yours**.
- `express.static` for `public/` is mounted with `index:false`, so directory URLs fall through to the SPA catch-all. `/sites` has its own dedicated mount because of this.

**Test baseline: 128 passing, 16 suites.** If you see 131/19, you're accidentally including the worktree.

---

## What Quick Start is

A mobile-first wizard at `/quickstart.html`, linked from the dashboard nav. Pick a job → pick an agent → answer 2-5 questions → get the thing.

### Files
| File | What it is |
|---|---|
| `backend/quickstart-usecases.js` | **The catalog — 41 use cases, 7 categories.** Pure data. |
| `backend/quickstart-routes.js` | The generic runner + `/api/quickstart/{usecases,agents,run/:id}` |
| `backend/lib/agent-registry.js` | Resolves the council + the user's forged agents |
| `backend/lib/website-generator.js` | `renderWebsite()` / `slugify()` — the one special-cased output |
| `public/quickstart.html` | The wizard (self-contained, Firebase auth inline) |
| `backend/tests/` | `quickstart-*.test.js`, `agent-registry.test.js`, `website-generator.test.js` |

### The architecture that matters
**A use case is DATA, not code.** It declares `questions`, an `agent`, a `system` instruction and a `template` with `{key}` placeholders. One generic runner in `quickstart-routes.js` fills the template from the answers and calls the LLM as the chosen agent. **Adding a use case = adding an entry to the array. Do not write a handler.** Only `make-website` is special-cased (it writes real files).

**Agents are real, not labels.** `agent-registry.js` resolves the 7 council agents (each with `voice`, `accent`, `palette`) and the user's forged agents from `backend/data/custom_agents.json` — a forged agent's own `systemPrompt` is used **verbatim**, so the agent the user built is the agent that answers. Verified live: identical answers give TURTLE a bold neon site in `#ff2bd6` and QUILL a warm editorial one in `#c9622a`.

### Invariants — do not break these
- `publicCatalog()` strips `system`/`template`/`agent` before sending. **Prompt wording never reaches the client.** There's a test for it.
- All user text is HTML-escaped before it lands in a generated site (`esc()` covers `< > & " '`). Generated sites are publicly served — this is a stored-XSS boundary.
- Agent-supplied colours are validated as strict `#rrggbb` before touching CSS (`safeHex`).
- Site directories are `<slug>-<8-hex-hash-of-owner>`. Slug is `[a-z0-9-]` only, capped at 40 chars. Two users can't collide; the same user regenerating updates their own site.
- `POST /run` is behind `verifyFirebaseToken` + `rateLimit({max:10, windowMs:60000})`. The catalog endpoints are public. `REQUIRE_AUTH=true` hard-blocks anonymous callers in prod; locally it falls back to the `x-user-id` header.
- No new npm dependencies.
- Don't touch: the gamified onboarding, the BYOK panel, the Workflow Center.

---

## Verified working (don't re-verify, don't doubt)

- 41 use cases across 7 categories, served over the wire, no prompt leakage.
- 8 agents listed (7 council + 1 forged "TEST").
- Website generation end-to-end: real file at `public/sites/<dir>/index.html`, live at `/sites/<dir>/`.
- Per-owner isolation: alice and bob both made "Coffee Shop", got separate sites, no content leak.
- Rate limit trips on the 11th request in a minute (10× 200 then 429).
- Anonymous POST returns 401 under `REQUIRE_AUTH=true`.
- **Text use cases work through local Ollama.** QUILL produced three real social-post variants on 2026-08-27. `getAvailableProviders()` returns `["ollama"]`; no cloud keys are set (`GROQ_API_KEY` etc. all unset) but Ollama is running locally, and the chain falls through to it.

> ⚠️ In the **jest** environment the LLM chain fails, so the text-use-case test asserts the honest 502 error path, not a successful generation. That is intentional. It does **not** mean text use cases are broken.

---

## What's left, in the order I'd do it

1. **Cloud provider fallback.** Only Ollama is available, and it's local-only — so on Render (production) every text use case will fail. Set `GROQ_API_KEY` in the Render env, or wire per-user BYOK keys into `callLLM`'s `options`. **This is the thing that decides whether 40 of the 41 work for real users.**
2. **Images.** The user explicitly asked for images. Nothing generates them yet — the logo/brand brief only outputs a prompt to paste elsewhere. TURTLE has a `generate_image` tool in `agent-engine.js`; wire it into the runner as a third `outputType`.
3. **Per-user BYOK scoping.** Provider keys are currently a process-global env override, so one user's key is effectively everyone's. Needed before real multi-user BYOK.
4. **MCP tools** so Grok/other bots can call these 41 flows. `shaddai-mcp` is already published; each use case can be generated as a tool from the same catalog data.
5. **A "my sites" list.** Nothing shows a user what they've generated; the URL is returned once and then lost.
6. **Push.** 10 unpushed commits. The user has not yet said yes — **ask before pushing.**

---

## Working style (from the owner, respect these)

- Confirm visual direction BEFORE building anything non-trivial. Don't burn credits on unapproved mechanical execution.
- Work LEAN: small edits yourself, ONE focused agent rather than a fleet. Confirm before any multi-agent dispatch.
- No visible browser automation for routine verification — use headless `curl` / `Invoke-WebRequest` / `node --check`.
- When the owner says "still old / not there", they're usually looking at the DEPLOYED Render site, not localhost.
- Small verifiable steps beat big autonomous runs. Show evidence, don't assert success.

---

## Suggested opening move

> Read `backend/quickstart-usecases.js` and `backend/quickstart-routes.js` to load the pattern, then start on item 1 (cloud provider fallback). Confirm the approach with me before writing code.
