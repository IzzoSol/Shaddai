# xAI / Grok — provider notes (verified 2026-10-15)
Sources: https://docs.x.ai/docs/overview (official) · third-party pricing guides (unverified, listed below).
| Item | Value | Status |
|---|---|---|
| Base URL | `https://api.x.ai/v1` | official |
| Auth | `Authorization: Bearer <XAI_API_KEY>` | official |
| Primary API shown | `POST /v1/responses` (OpenAI SDK pointed at the base URL works) | official |
| Chat Completions `/v1/chat/completions` | reported by third parties, **not stated on the official overview** | VERIFY with a live key (adapter `validateConfig`) |
| Function calling / streaming format | linked guides, not on the overview page | VERIFY (conformance suite decides) |
| Models | docs example uses `grok-4.7` ("Grok Build"); full list on the Models page | model IDs live in config, never hardcoded |
| Pricing | third-party only (e.g. grok-4.3 ≈ $1.25 / $2.50 per M tokens) | VERIFY at docs.x.ai pricing; keep in the versioned price table |
| Rate limits | not stated | VERIFY |
| Proxy / resell terms | not stated | **VERIFY before any hosted/paid use; until then BYOK only** |
Adapter: `server/agents/providers/openai-compat.js`, provider id `xai`, `format: "responses"` default with `"chat"` fallback.
