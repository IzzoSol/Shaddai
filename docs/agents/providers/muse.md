# Meta Muse / Meta Model API — provider notes (verified 2026-10-15)
Sources: https://dev.meta.ai/products/meta-model-api/ (official, via developer.meta.com redirect) · https://developer.meta.com/ai/resources/blog/build-with-muse-spark/
| Item | Value | Status |
|---|---|---|
| Base URL | not stated on product page; third parties say `https://api.meta.ai/v1`; docs at https://dev.meta.ai/docs/ | VERIFY in docs / live key |
| Auth | one-click API key from dev.meta.ai (bearer assumed) | VERIFY |
| Compatibility | "point your existing OpenAI SDK code at it"; Chat Completions + Responses (+ Anthropic-style Messages per Promptfoo) | partly official |
| Tools | "Add a single tool to your request" (cookbook) | VERIFY via conformance suite |
| Models / price per M tokens (in / cached / out) | `muse-spark-1.3` $1.25/$0.15/$4.25 · `muse-wonder-1.0` $4.00/$0.20/$20.00 · `muse-spark-1.1/1.2` $1.25/$0.15/$4.25 | official page |
| **Contributor variants** | `muse-spark-1.3-contributor` / `-1.2-contributor` $0.10/$0.002/$0.20 — **"Used to improve our products"**; standard variants "Not used to improve our products" | official page |
| Rate limits | not stated | VERIFY |
| Proxy / resell terms | not stated; links to Facebook ToS | **VERIFY; BYOK only until confirmed** |
**Hard routing rule (manual 20.5):** contributor variants are `dataUse: "improves-provider"` and are NEVER used for private, paid-user, or privacy-flagged content, and never as a silent fallback.
Adapter: `server/agents/providers/openai-compat.js`, provider id `muse`.
