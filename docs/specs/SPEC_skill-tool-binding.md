# SPEC: Skill-to-Tool Binding System
**Project:** SHADDAI — AI-Agent Marketplace  
**Status:** Design Spec — No implementation yet  
**Date:** 2026-06-02  
**Author:** ORACLE (Research) + NEXUS (Architecture)

---

## 1. Problem Statement

### Current State
`backend/skill-router.js` defines **60+ skills** grouped under 7 agents (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON). Each skill has:
- A `desc` field (one-line description)
- A `fn` field naming a handler (e.g. `analyzeCryptoTrading`)
- A `confidence` score

The `SKILL_HANDLERS` map in `skill-router.js` wires those `fn` names to actual functions. **Those functions return hard-coded template strings with `Math.random()` placeholders** — fake numbers, fabricated market levels, static bullet points. Example: `analyzeOnChain` returns invented whale counts; `analyzeFinance` generates random cashflow numbers.

`backend/agent-engine.js` maintains a `TOOLS` registry with **~50+ real, working tools** (confirmed from source review: `fetch_price`, `get_fear_greed`, `whale_scan`, `search_web`, `get_stock_quote`, `get_ohlcv`, `check_security`, `run_js`, `post_discord`, `generate_image`, `translate_text`, etc.). These tools make real HTTP calls, execute real computations, and return live data.

The two systems **do not talk to each other.** When a skill fires, it returns canned text. When the LLM loop in `agent-engine.js` fires a `[TOOL:name:{...}]` call, the skill layer is bypassed entirely.

### Consequences
1. Users see fabricated outputs presented as "real AI work" — trust erosion.
2. The real tool registry is only reachable via the agentic LLM loop, not from the skill-router UI path.
3. Skills cannot be tested for correctness — there are no real outputs to assert against.
4. New tools added to `TOOLS` have zero skill coverage until manually wired.
5. The SHADDAI marketplace value prop ("real agents doing real work") is undermined by dummy data.

---

## 2. Approaches Considered

### Approach A — Explicit Skill → Tool Map (Static Binding)
Each skill entry in `AGENT_SKILLS` gets a `tools` array listing exact tool names, plus an `argMap` function that projects the incoming `prompt`/`params` object to each tool's schema. The executor iterates tools, calls them in sequence or parallel, and assembles a structured result.

**Pros:** Deterministic, zero LLM cost, fast, unit-testable, no hallucination risk in routing.  
**Cons:** Every skill must be mapped by a human; new skills need manual wiring; prompt-to-arg extraction can be brittle without NLP.

### Approach B — LLM-Routed Tool Selection Per Skill (Fully Dynamic)
On each skill execution, call the LLM with a system prompt listing available tools, the skill's description, and the user's prompt. The LLM emits `[TOOL:name:{...}]` calls (same format as the existing agent loop). The executor parses and dispatches them.

**Pros:** Requires zero static mapping; adapts to new tools automatically; can chain tools intelligently.  
**Cons:** Latency (adds 1+ LLM round-trip per skill invocation); costs tokens on every call; non-deterministic outputs; harder to test.

### Approach C — Hybrid: Explicit Map + LLM Fallback (Recommended)
For skills with known, stable tool-use patterns: bind explicitly via a `tools` + `argMap` entry in the skill registry.  
For skills with no explicit binding (or when the explicit binding fails/returns empty): fall through to a **mini LLM tool-call loop** using the existing `runAgentLoop` machinery already in `agent-engine.js`.

**Pros:** Fast and cheap for well-understood skills (most ZEROX/NEXUS skills); graceful coverage for edge-case and esoteric skills (ORACLE's `natal-chart`, `gematria`, etc. where no free API exists); self-healing — adding a new tool to `TOOLS` makes it immediately available to the LLM fallback path.  
**Cons:** Slightly more complex executor; two code paths to maintain.

### Recommendation: Approach C (Hybrid)
This is the correct choice for SHADDAI's maturity level. The core market-data and security-audit skills should be deterministically wired (Approach A) for reliability and testability. The long-tail esoteric skills (chakra scanning, human design, sacred geometry) are best served by an LLM reasoning over the available tools — and if no tool covers the domain, the LLM can answer from knowledge with a clearly labeled disclaimer. This mirrors production patterns at companies like Replit (deterministic for code execution, LLM-routed for open questions).

---

## 3. Binding Architecture

### 3.1 Skill Registry Schema (Extended)

Extend each entry in `AGENT_SKILLS[agent].skills[skillId]` with the following optional fields:

```
{
  id: string,              // slug, e.g. "crypto-trading"
  desc: string,            // existing human description
  fn: string,              // LEGACY: existing handler name (kept for backward compat)
  confidence: number,      // existing scoring

  // NEW FIELDS:
  tools: string[],         // ordered list of TOOLS registry keys to invoke
  argMap: function | null, // (prompt: string, params: object) => { toolName: argsObject }[]
                           // returns array of { tool, args } pairs, one per tool call
  compose: function | null, // (toolResults: object[], prompt: string) => string
                            // optional post-processor that assembles a final human-readable output
                            // if null, results are JSON-joined with separators
  fallbackToLLM: boolean,  // default true — if tools fail or return empty, run LLM mini-loop
  tier: 'free' | 'keyed' | 'premium',
                            // 'keyed' = requires env var; 'premium' = requires paid tier
  realData: boolean        // true = this skill returns live external data (for badge display)
}
```

**Example — `zerox/crypto-trading`:**
```json
{
  "id": "crypto-trading",
  "desc": "Day-trading, swing-trading, algo strategies",
  "tools": ["fetch_price", "get_fear_greed", "get_ohlcv"],
  "argMap": "(prompt, params) => [\n  { tool: 'fetch_price', args: { symbol: extractSymbol(prompt) || 'bitcoin' } },\n  { tool: 'get_fear_greed', args: {} },\n  { tool: 'get_ohlcv', args: { symbol: extractSymbol(prompt) || 'bitcoin', days: 7 } }\n]",
  "compose": "formatTradingReport(toolResults, prompt)",
  "fallbackToLLM": true,
  "tier": "free",
  "realData": true
}
```

**Example — `oracle/natal-chart` (no suitable free tool, LLM-only):**
```json
{
  "id": "natal-chart",
  "desc": "Natal chart generation and interpretation",
  "tools": [],
  "argMap": null,
  "compose": null,
  "fallbackToLLM": true,
  "tier": "free",
  "realData": false
}
```

### 3.2 SkillExecutor Module

Create `backend/skill-executor.js` (replacing and superseding the current `SKILL_HANDLERS` block in `skill-router.js`).

```
SkillExecutor.run(skillId, agent, prompt, params, user)
  1. Look up skill entry from AGENT_SKILLS[agent].skills[skillId]
  2. If skill.tools.length > 0:
     a. Call skill.argMap(prompt, params) to get [{ tool, args }, ...]
     b. Execute each tool in parallel via resolveTool(name).execute(args)
        - Each call wrapped in try/catch with 10s timeout
        - Failures return { error, tool } — do not throw
     c. If skill.compose exists, call it with (toolResults[], prompt) to build response
     d. If all tools errored AND skill.fallbackToLLM === true, fall through to step 3
  3. LLM fallback: run a constrained agent loop
     a. System prompt = agent persona from brains.js + skill.desc as context
     b. User message = original prompt
     c. Available tools = skill.tools (if non-empty) OR all tools for this agent
     d. Max iterations: 3 (prevents runaway)
     e. Strip [TOOL:...] markup from final response via existing stripToolCalls()
  4. Return { result, toolsUsed[], dataSource: 'tools'|'llm'|'mixed', skill, agent }
```

### 3.3 ArgMap Helpers

Include a shared `argMapHelpers.js` with:
- `extractSymbol(prompt)` — regex-extracts crypto tickers (BTC → bitcoin, ETH → ethereum, etc.)
- `extractCity(prompt)` — NLP-lite city extraction for weather/timezone
- `extractUrl(prompt)` — URL extraction
- `extractCode(prompt)` — extracts fenced code blocks
- `extractQuery(prompt)` — fallback: returns the full prompt as a search query (safe default)

These are pure functions, easy to unit-test independently.

### 3.4 Compose Helpers

Pre-built composers for the common output patterns:
- `composeMarketReport(results, prompt)` — formats price + F&G + OHLCV into a trading brief
- `composeSecurityReport(results)` — formats `check_security` findings into severity-ordered markdown
- `composeResearchSummary(results)` — combines `search_web` + `wikipedia_search` + `get_hackernews` into a structured brief
- `composeCodeResult(results)` — wraps `run_js` / `run_python` output with labels
- Default: `JSON.stringify(results, null, 2)` (always safe)

### 3.5 Safe Fallback for Unmapped Skills

If a skill has no `tools` array AND `fallbackToLLM` is not explicitly false:
- The executor treats the skill as LLM-only and runs the mini-loop with the agent's full tool set.
- This means **zero breaking changes to existing skill behavior** — the old canned-text handlers become unreachable and can be removed incrementally.
- A warning is logged: `[SKILL_EXECUTOR] No tool binding for skill "${skillId}" — using LLM fallback`

### 3.6 Integration Point in skill-router.js

Replace the current `SKILL_HANDLERS[skill.fn](prompt)` call with:
```javascript
const { SkillExecutor } = require('./skill-executor');
const result = await SkillExecutor.run(skillId, agentId, prompt, params, req.user);
```

The existing skill detection, agent selection, and memory logic in `skill-router.js` is preserved.

---

## 4. New Tools Catalog

Tools marked **[EXISTS]** are already in `agent-engine.js` TOOLS registry. Others are proposed additions. Tools marked **[KEYED]** require an environment variable API key. Tools marked **[PREMIUM]** are gated to paid tiers.

---

### 4.1 Communications

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `post_discord` | Post message to Discord via webhook | `message`, `title` | QUILL, SHADDAI | Free [KEYED: DISCORD_WEBHOOK_URL] **[EXISTS]** |
| `send_email` | Send transactional email via SendGrid or Resend | `to`, `subject`, `body`, `html?` | QUILL, SHADDAI | Free tier [KEYED: SENDGRID_API_KEY] |
| `send_telegram` | Post message to Telegram bot/channel | `chat_id`, `message`, `parse_mode?` | QUILL, SHADDAI, PIKADON | Free [KEYED: TELEGRAM_BOT_TOKEN] |
| `send_slack` | Post to Slack channel via Incoming Webhook | `channel`, `message`, `blocks?` | QUILL, SHADDAI | Free [KEYED: SLACK_WEBHOOK_URL] |
| `send_sms` | Send SMS via Twilio | `to`, `message` | SHADDAI, PIKADON | [KEYED: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM] [PREMIUM] |
| `post_twitter` | Post tweet via Twitter API v2 | `text`, `reply_to?` | QUILL, TURTLE | [KEYED: TWITTER_BEARER_TOKEN] [PREMIUM] |
| `send_webhook` | POST any payload to any webhook URL | `url`, `payload`, `headers?` | NEXUS, SHADDAI | Free (no external key needed) |

---

### 4.2 Productivity & Docs

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `create_calendar_event` | Create Google Calendar event via OAuth | `title`, `start`, `end`, `description?`, `attendees?` | SHADDAI, NEXUS | [KEYED: GOOGLE_CLIENT_ID/SECRET] |
| `create_notion_page` | Create a Notion page in a database | `database_id`, `title`, `content`, `properties?` | QUILL, NEXUS | [KEYED: NOTION_API_KEY] |
| `append_google_sheet` | Append rows to a Google Sheet | `spreadsheet_id`, `sheet_name`, `rows[]` | ZEROX, NEXUS | [KEYED: GOOGLE_SERVICE_ACCOUNT_JSON] |
| `create_google_doc` | Create a new Google Doc with content | `title`, `content_markdown` | QUILL, SHADDAI | [KEYED: GOOGLE_SERVICE_ACCOUNT_JSON] |
| `create_airtable_record` | Add record to Airtable base | `base_id`, `table_name`, `fields{}` | NEXUS, ZEROX | [KEYED: AIRTABLE_API_KEY] |
| `search_notion` | Search across a Notion workspace | `query`, `filter?` | ORACLE, QUILL | [KEYED: NOTION_API_KEY] |

---

### 4.3 Data & Scraping

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `fetch_url` | Fetch + clean text from any URL | `url` | ORACLE, QUILL, NEXUS, PIKADON | Free **[EXISTS]** |
| `scrape_site` | Deep scrape: multiple pages from a site, follows links | `url`, `max_pages?`, `selector?` | ORACLE, NEXUS | Free (Cheerio-based) |
| `extract_pdf` | Extract text from a PDF URL (first N pages) | `url`, `max_pages?` | ORACLE, QUILL, PIKADON | Free (pdf-parse) |
| `ocr_image` | Extract text from an image URL | `image_url` | ORACLE, PIKADON | [KEYED: OCR_SPACE_API_KEY] free tier available |
| `csv_query` | Load a CSV from URL or file and query it with SQL-like filter | `source`, `filter?`, `select?`, `limit?` | ZEROX, NEXUS, ORACLE | Free (papaparse) |
| `xml_to_json` | Parse XML/RSS/ATOM from URL into JSON | `url` | ORACLE, NEXUS | Free (fast-xml-parser) |
| `json_transform` | Apply JSONPath / jq-style transform to JSON payload | `data`, `path_expr` | NEXUS, ZEROX | Free (jsonpath-plus) |

---

### 4.4 Media & Creative

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `generate_image` | Generate AI image (Pollinations, keyless) | `prompt`, `model?`, `width?`, `height?` | TURTLE | Free **[EXISTS]** |
| `text_to_speech` | Convert text to audio file URL (ElevenLabs free tier or Coqui TTS) | `text`, `voice?`, `speed?` | TURTLE, QUILL | Free tier [KEYED: ELEVENLABS_API_KEY optional] |
| `transcribe_audio` | Transcribe audio URL to text (Whisper via OpenAI or local) | `audio_url`, `language?` | ORACLE, QUILL | [KEYED: OPENAI_API_KEY or local Whisper] |
| `edit_image` | Edit/transform an image via Cloudinary or imgix | `image_url`, `operations[]` | TURTLE | [KEYED: CLOUDINARY_URL] |
| `generate_qr` | Generate QR code image URL for any text | `data`, `size?` | QUILL, NEXUS | Free **[EXISTS as get_qr_code]** |
| `screenshot_url` | Capture webpage screenshot | `url`, `width?` | TURTLE, ORACLE, NEXUS | Free (thum.io) **[EXISTS]** |
| `make_music` | Generate AI music clip URL (via Suno API or Udio) | `prompt`, `style?`, `duration?` | TURTLE | [KEYED: SUNO_API_KEY] [PREMIUM] |
| `get_color_palette` | Generate color palette from seed hex | `hex`, `mode?` | TURTLE | Free **[EXISTS]** |

---

### 4.5 Developer Tools

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `run_js` | Execute JS in Node.js vm sandbox | `code` | NEXUS, SHADDAI | Free **[EXISTS]** |
| `run_python` | Execute Python (local interpreter) | `code` | NEXUS, SHADDAI | Free **[EXISTS]** |
| `check_security` | PIKADON static code security audit | `code` | PIKADON | Free **[EXISTS]** |
| `search_npm` | Search npm package registry | `query`, `limit?` | NEXUS | Free **[EXISTS]** |
| `get_github_repo` | GitHub repo stats (stars, forks, activity) | `repo` | NEXUS, ORACLE | Free **[EXISTS]** |
| `open_github_issue` | Create GitHub issue via API | `repo`, `title`, `body`, `labels?` | NEXUS, PIKADON | [KEYED: GITHUB_TOKEN] |
| `open_github_pr` | Open GitHub pull request | `repo`, `title`, `body`, `head`, `base` | NEXUS | [KEYED: GITHUB_TOKEN] |
| `run_shell_command` | Run a whitelisted shell command (sandboxed) | `command`, `args[]` | NEXUS | Free (allowlist-gated) |
| `validate_json_schema` | Validate a JSON payload against a JSON Schema | `schema`, `data` | NEXUS, PIKADON | Free (ajv) |
| `call_api` | Make an authenticated HTTP request to any external REST API | `url`, `method?`, `headers?`, `body?` | NEXUS, SHADDAI | Free (no external key needed) |
| `deploy_to_vercel` | Trigger a Vercel deploy via API | `project_id`, `env?` | NEXUS | [KEYED: VERCEL_TOKEN] [PREMIUM] |

---

### 4.6 Commerce & Financial

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `fetch_price` | Live crypto price (CoinGecko) | `symbol` | ZEROX, ORACLE, SHADDAI | Free **[EXISTS]** |
| `get_stock_quote` | Real-time stock price (Yahoo Finance) | `symbol` | ZEROX, ORACLE | Free **[EXISTS]** |
| `get_exchange_rates` | Fiat currency exchange rates | `currencies` | ZEROX, ORACLE | Free **[EXISTS]** |
| `moonpay_quote` | Get MoonPay crypto buy quote | `amount`, `currency_in`, `currency_out` | ZEROX | [KEYED: MOONPAY_API_KEY] |
| `price_compare` | Compare product prices across retailers (via SerpAPI or ScraperAPI) | `product_query`, `country?` | ZEROX, ORACLE | [KEYED: SERP_API_KEY] |
| `create_stripe_checkout` | Generate a Stripe Checkout session URL | `amount_cents`, `currency`, `description`, `success_url`, `cancel_url` | ZEROX, SHADDAI | [KEYED: STRIPE_SECRET_KEY] [PREMIUM] |
| `get_defi_tvl` | DeFi TVL data from DeFiLlama | `limit?` | ZEROX, ORACLE | Free **[EXISTS]** |
| `get_gas_price` | Ethereum gas prices | — | ZEROX | Free **[EXISTS]** |
| `get_nft_floor` | Solana NFT floor price (MagicEden) | `symbol` | ZEROX | Free **[EXISTS]** |

---

### 4.7 CRM & Social Intelligence

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `search_web` | Web search (Google News RSS + DuckDuckGo) | `query` | ORACLE, QUILL, NEXUS | Free **[EXISTS]** |
| `get_reddit_posts` | Top posts from any subreddit | `subreddit` | ORACLE, ZEROX | Free (rate-limited) **[EXISTS]** |
| `get_crypto_news` | Latest crypto headlines (CryptoCompare/CoinDesk) | — | ZEROX, ORACLE | Free **[EXISTS]** |
| `analyze_sentiment` | Sentiment score for any text | `text` | ORACLE, ZEROX, QUILL | Free **[EXISTS]** |
| `extract_keywords` | Top keywords by frequency | `text`, `limit?` | ORACLE, QUILL | Free **[EXISTS]** |
| `get_hackernews` | HN top stories | `limit?` | ORACLE, NEXUS | Free **[EXISTS]** |
| `search_twitter` | Twitter/X search via API v2 | `query`, `limit?`, `since_id?` | ORACLE, ZEROX | [KEYED: TWITTER_BEARER_TOKEN] |
| `get_linkedin_profile` | Fetch LinkedIn public profile data | `url` | ORACLE | [KEYED: PROXYCURL_API_KEY] [PREMIUM] |
| `create_hubspot_contact` | Create/update a HubSpot CRM contact | `email`, `name`, `properties?` | ZEROX, SHADDAI | [KEYED: HUBSPOT_API_KEY] [PREMIUM] |

---

### 4.8 Knowledge & Learning (ORACLE domain)

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `wikipedia_search` | Wikipedia article summary | `query` | ORACLE, QUILL | Free **[EXISTS]** |
| `get_arxiv_papers` | arXiv research paper search | `query` | ORACLE, NEXUS | Free **[EXISTS]** |
| `get_word_definition` | English dictionary definition | `word` | QUILL, ORACLE | Free **[EXISTS]** |
| `translate_text` | Text translation (MyMemory) | `text`, `target`, `source?` | QUILL, ORACLE | Free **[EXISTS]** |
| `get_moon_phase` | Current moon phase + lunar calendar | — | ORACLE | Free **[EXISTS]** |
| `get_weather` | Live weather for any city | `city` | ORACLE, SHADDAI | Free **[EXISTS]** |
| `get_country_info` | Country facts (population, capital, etc.) | `country` | ORACLE, QUILL | Free **[EXISTS]** |
| `wolfram_query` | Computational knowledge from Wolfram Alpha | `query` | ORACLE, ZEROX | [KEYED: WOLFRAM_APP_ID] |
| `pubmed_search` | Medical/biomedical research papers | `query`, `limit?` | ORACLE, PIKADON | Free (no key) |

---

### 4.9 Security & Compliance (PIKADON domain)

| Tool Name | Purpose | Inputs | Agents | Cost |
|---|---|---|---|---|
| `check_security` | Static code security audit (20 check patterns) | `code` | PIKADON | Free **[EXISTS]** |
| `hash_text` | SHA256/SHA1/MD5 hash | `text`, `algorithm?` | PIKADON, NEXUS | Free **[EXISTS]** |
| `scan_url_virustotal` | Check URL reputation via VirusTotal | `url` | PIKADON | [KEYED: VIRUSTOTAL_API_KEY] |
| `check_pwned` | Check if email was in a data breach (HaveIBeenPwned) | `email` | PIKADON | [KEYED: HIBP_API_KEY] |
| `generate_password` | Generate a cryptographically secure password | `length?`, `symbols?` | PIKADON | Free |
| `validate_jwt` | Decode and validate a JWT without secret (structure/expiry check) | `token` | PIKADON | Free |
| `scan_dependencies` | Check npm package.json for known CVEs (via OSV.dev) | `package_json_content` | PIKADON, NEXUS | Free (no key) |

---

## 5. Data Flow & API

### 5.1 New Endpoint: `/api/skills/run`

**Method:** POST  
**Auth:** Required (user session or API key)  
**Request:**
```json
{
  "agent": "zerox",
  "skill": "crypto-trading",
  "prompt": "Analyze Bitcoin for a swing trade entry",
  "params": { "symbol": "bitcoin" },
  "user": { "tier": "standard" }
}
```

**Response (success):**
```json
{
  "ok": true,
  "agent": "ZEROX",
  "skill": "crypto-trading",
  "result": "...",
  "toolsUsed": ["fetch_price", "get_fear_greed", "get_ohlcv"],
  "dataSource": "tools",
  "realData": true,
  "latencyMs": 342,
  "tier": "free"
}
```

**Response (tool failure, LLM fallback used):**
```json
{
  "ok": true,
  "agent": "ZEROX",
  "skill": "crypto-trading",
  "result": "...",
  "toolsUsed": [],
  "dataSource": "llm",
  "realData": false,
  "fallbackReason": "fetch_price timed out, get_fear_greed HTTP 429",
  "latencyMs": 1820
}
```

**Error response:**
```json
{
  "ok": false,
  "error": "Skill 'non-existent' not found for agent 'zerox'",
  "code": "SKILL_NOT_FOUND"
}
```

### 5.2 Supporting Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/skills/list` | GET | Return all skills for all agents with binding metadata |
| `/api/skills/list/:agent` | GET | Return skills for a specific agent |
| `/api/skills/coverage` | GET | Return coverage report (bound vs unbound per agent) |
| `/api/tools/list` | GET | Return all registered tools with schema (admin) |
| `/api/tools/run` | POST | Direct tool invocation (admin/dev only, gated by `ALLOW_DIRECT_TOOLS=true`) |

### 5.3 Error Handling Matrix

| Scenario | Behavior |
|---|---|
| Tool throws network error | Catch, log `{ tool, error, ms }`, continue to next tool |
| Tool returns empty string / null | Treat as soft failure; flag for LLM fallback |
| All tools fail | If `fallbackToLLM=true` (default), run LLM mini-loop |
| LLM fallback also fails | Return structured error with `dataSource: 'error'` and human-readable message |
| Skill not found | 404 with `SKILL_NOT_FOUND` code |
| argMap throws | Catch, log, fall through to LLM fallback with full prompt |
| Tool requires missing env key | Return early with: `"Not configured: set SENDGRID_API_KEY in backend/.env"` (consistent with existing pattern) |
| Tier-gated tool called by free user | Return `"Upgrade to Pro to use this tool"` — never expose the underlying key error |
| Timeout (>10s) on any single tool | Abort via AbortSignal, treat as failure |

---

## 6. Testing: Skill Coverage Harness

### 6.1 Coverage Script: `backend/tests/skill-coverage.test.js`

This test suite serves two purposes: verify real data is flowing, and flag any skill that is still returning canned text.

**Checks per skill:**
1. **Binding check** — does the skill have a `tools[]` array? (warn if not)
2. **Smoke test** — call `SkillExecutor.run(skillId, agent, testPrompt)` with a real prompt from a fixture
3. **Canned-text detector** — scan response for known fake patterns:
   - `Math.random()` artifacts (values like `$47,283.00` with suspiciously round specifics)
   - Hard-coded strings: `"RSI: 68"`, `"Support Levels: $42,500"`, `"Twitter sentiment: 68% positive"`, `"Net worth growth: +12.3% YoY"`
   - Template markers: `[Live Fear & Greed API unavailable]`, `Using cached data`
4. **Real-data assertion** — if `skill.realData === true`, assert that at least one tool call returned an HTTP 200 response (log the tool + URL called)
5. **Latency budget** — warn if skill takes >5s (SLA target: <3s for tool-only paths, <8s for LLM fallback)

**Output format:**
```
SKILL COVERAGE REPORT — 2026-06-02
===================================
Agent    Skill                  Status   Tools   DataSource  LatencyMs
ZEROX    crypto-trading         PASS     3/3     tools       412
ZEROX    on-chain-intel         PASS     2/2     tools       287
ZEROX    sentiment-analysis     WARN     0       llm         1430  [no tool binding]
ORACLE   natal-chart            PASS     0       llm         2100  [no suitable tool]
PIKADON  rbac-guard             FAIL     0       error       300   [CANNED_TEXT detected]
...
Coverage: 34/62 skills bound (55%) | 58/62 passing (94%)
```

### 6.2 Unit Tests for ArgMap Helpers

Each helper in `argMapHelpers.js` gets a unit test file: `tests/argMapHelpers.test.js`. Example fixture:
```
extractSymbol("Analyze Bitcoin for swing trade") → "bitcoin"
extractSymbol("What's the ETH price?") → "ethereum"
extractSymbol("Tell me about solana") → "solana"
extractSymbol("general question with no coin") → null
```

### 6.3 CI Integration

Add `npm run skill-coverage` to `package.json`. Run it in GitHub Actions on every PR that touches `skill-router.js`, `skill-executor.js`, or `agent-engine.js`. Fail the pipeline if coverage drops below 50% or if any previously-passing skill starts returning canned text.

---

## 7. Phased Rollout

### Phase 1 — Core Tool Bindings (Week 1)
**Goal:** Wire the highest-value skills. No new tools needed — use existing `TOOLS`.

Priority skills to bind first (by user-impact and tool availability):

| Agent | Skill | Tools to bind |
|---|---|---|
| ZEROX | `crypto-trading` | `fetch_price`, `get_fear_greed`, `get_ohlcv` |
| ZEROX | `market-pulse` | `get_fear_greed`, `get_global_market`, `get_trending` |
| ZEROX | `on-chain-intel` | `whale_scan`, `get_sol_balance`, `get_defi_tvl` |
| ZEROX | `risk-management` | `fetch_price`, `get_ohlcv`, `get_fear_greed` |
| ORACLE | `research-engine` | `search_web`, `wikipedia_search`, `get_hackernews` |
| ORACLE | `moon-phase` | `get_moon_phase` |
| NEXUS | `workflow-orchestrator` | `delegate_to_agent`, `schedule_task` |
| PIKADON | `threat-detector` | `check_security` |
| PIKADON | `password-generator` | `hash_text` + local crypto |
| QUILL | `content-creator` | `search_web`, `extract_keywords`, `write_file` |
| TURTLE | `generate-image` | `generate_image` |
| TURTLE | `color-palette-ai` | `get_color_palette` |

**Deliverable:** `skill-executor.js` with argMap + compose for 12 core skills. Coverage test passing at 20%+.

---

### Phase 2 — New Tool Integration (Week 2-3)
**Goal:** Add the highest-ROI new tools from the catalog above.

Prioritized by: free/no-key-needed first, then keyed tools already used in the project.

New tools to implement first:
1. `send_email` (Resend — generous free tier, simple API)
2. `scrape_site` (Cheerio — pure Node, no key)
3. `extract_pdf` (pdf-parse — no key)
4. `csv_query` (papaparse — no key)
5. `send_webhook` (pure axios — no key)
6. `validate_json_schema` (ajv — no key)
7. `scan_dependencies` (OSV.dev — free, no key)
8. `send_telegram` (Telegram bot — free, just needs token)
9. `pubmed_search` (free, no key)
10. `wolfram_query` (free tier available)

For each: add to `TOOLS` registry in `agent-engine.js`, wire to at least 2 skills each, add to coverage test.

**Deliverable:** 10 new tools shipped. Coverage at 40%+.

---

### Phase 3 — LLM Fallback Activation & Long-Tail Skills (Week 4)
**Goal:** All remaining skills use the LLM fallback path correctly. Remove all canned-text handlers.

Steps:
1. Audit all remaining `SKILL_HANDLERS` entries for canned-text strings. Remove each one after confirming the LLM fallback produces a better result.
2. For ORACLE esoteric skills (natal-chart, gematria, chakra-scanner, human-design, sacred-geometry): confirm LLM fallback with ORACLE persona produces coherent, contextual responses. Add `realData: false` badge so users know it's LLM-reasoned, not live data.
3. Ship keyed tools gated behind env vars: `send_email`, `create_calendar_event`, `post_twitter`, `create_stripe_checkout`. Show a friendly "Configure in Settings" CTA in the UI when the key is missing.
4. Add skill coverage CI gate. Set minimum 60% coverage with 0 canned-text regressions.

**Deliverable:** Zero canned-text handlers remain. Coverage at 60%+. CI gating active.

---

### Phase 4 — Premium Tool Tier & Agent Store (Week 5-6)
**Goal:** Monetize high-value tools. Full coverage for all SHADDAI marketplace skills.

1. Gate `[PREMIUM]` tools (Twilio SMS, LinkedIn, HubSpot, Stripe Checkout, Vercel Deploy) behind Pro/Elite subscription check in `pay-guard.js`.
2. Build a UI "Skill Marketplace" card that shows: skill name, tools used, data source badge (live data / AI reasoning), tier requirement.
3. Add `get_hubspot_contact`, `create_stripe_checkout`, `deploy_to_vercel`, `make_music` tools for Pro users.
4. Final coverage target: 80%+ skills bound, 100% passing (no canned text).

---

## 8. Migration Path for Existing Code

The migration is backward-compatible and non-breaking:

1. **Do not delete** `SKILL_HANDLERS` immediately — keep existing functions as safety fallback during Phase 1.
2. In `skill-router.js`, add a feature flag: `const USE_NEW_EXECUTOR = process.env.USE_SKILL_EXECUTOR === 'true'`
3. Route through new executor when flag is on; fall back to old handlers when off.
4. Once Phase 1 skills pass coverage tests, flip the flag to `true` by default. Remove the old handlers one by one over Phases 2-3.
5. The existing `/api/agent/run` endpoint (LLM loop path) is **untouched** — skills and LLM loop are parallel paths that share the same `TOOLS` registry.

---

## 9. Key Design Decisions & Constraints

- **No new HTTP framework.** The executor is a plain module, not an Express router. It imports and calls `resolveTool()` directly.
- **The `TOOLS` registry is the single source of truth.** Skills do not implement their own HTTP calls — they only declare which tools to invoke. This prevents drift between tool implementations and skill outputs.
- **ArgMap functions are data, not just logic.** Store them as serializable JSON strings (or module-level named functions) so the skill registry can be introspected, logged, and diff'd in git history without executing code.
- **Composable by default.** A skill that calls 3 tools and combines their output is more valuable than one that calls 1 tool. The compose layer makes multi-source synthesis a first-class pattern.
- **Real data is the product.** Every skill that can call a real free API should. The `realData: true` badge is a marketing feature, not just a technical flag — it demonstrates SHADDAI agent capability to users and potential customers.

---

*End of spec. Estimated implementation effort: 3-4 weeks part-time for Phases 1-3. Phase 4 is optional and tied to billing roadmap.*
