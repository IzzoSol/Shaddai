# OPS RUNBOOK — SHADDAI Signals (the operating manual)

One page. Everything needed to run, restart, audit, and deploy the signal
system. Written 2026-10-12 after a full teardown/audit day; update it when
behavior changes.

## Architecture (single-broadcaster rule)
- `tg-signals-standalone.js` (backend) is THE broadcaster: signals + pnl
  tracker + bot commands + news. Launched detached:
  `node tg-signals-standalone.js >> tg-signals.out.log 2>> tg-signals.err.log`
- Servers (local :3000 AND Render) run TG lanes ONLY with `TG_LANES=1` AND
  the broadcast lock. Render has no env var → pure web API. Never set
  TG_LANES on Render.
- The broadcast lock (`data/tg-lock.json`) is a 90s heartbeat, LOCAL to each
  machine. The launcher retries all lanes at +100s if a restart races the
  dying instance's heartbeat — the log line `lanes boot (retry+100s) —
  broadcast lock ACQUIRED` is the confirmation of a healthy boot.
- `@ZeroxVirtualsBot` runs separately (`tg-virtuals-standalone.js`, own token).

## Restart procedure (bot)
1. Kill the `node tg-signals-standalone.js` process (find PID via
   `Get-CimInstance Win32_Process -Filter "name='node.exe'"`).
2. Relaunch detached (command above), WorkingDirectory = backend.
3. Wait ~110s. Confirm `broadcast lock ACQUIRED` in `tg-signals.out.log`.
   If the initial boot says "HELD ELSEWHERE", that is the normal race — the
   retry at +100s must show ACQUIRED. If it does not, no process should be
   holding the lock; check for zombies.

## The record
- `data/tg-calls.json` = the live record. Historical baseline (278 curated
  calls, 29% 2x+ / 15% 5x+) is marked `baseline: true`; new-era calls append.
- Full archive (708 calls incl. everything dropped): `tg-calls-archive-2026-10-12.json`.
- NEVER seed from the archive without `scripts/seed-baseline.js` (the
  curation rules live there and were owner-approved 2026-10-12).
- Re-pricer: DexScreener primary → Jupiter lite fallback (`lite-api.jup.ag`).
  A flat 1.00x wall means BOTH sources failed — treat as an outage, check
  `tg-signals.err.log` for circuit-breaker lines.

## Audit tools (run from backend/)
- `node scripts/audit-calls-deep.js` — full cross-reference (sources, FDV
  bands, liquidity, vetted vs unvetted, hours). Flat rows are excluded from
  every rate (missing data, not losses).
- `node scripts/flash-vs-durable.js` — durable vs flash-rug call features.
- `node scripts/seed-baseline.js --dry` — preview the curation before reseeding.

## Gates (tg-config.json + code defaults)
$20k-$80k FDV · 5min age · dev wallet ≤7% · insider count ≤3 · social score
≥3 · LP lock ≥80% (fail-closed) · GoPlus hard-block · bundler clusters reject ·
boosted OFF · bonded 20-80k with $200-banner rule at 30-75k. RugCheck
fallback score is 0 (fail-closed) — an unvetted token can never be called.

## Deploy to Render (main) — git plumbing (the working tree is LIVE)
The backend folder runs the bots — NEVER checkout/switch branches there.
`feat/market-intel` (the working branch) is 500+ commits diverged from main;
ship changes by building the commit directly on origin/main:

```powershell
$env:GIT_INDEX_FILE = "$env:TEMP\opencode\deployN.idx"
git read-tree origin/main      # THE SLASH. 'origin.main' once shipped a 6-file-only tree.
git hash-object -w <file>     # per changed file (paths are REPO-ROOT relative!)
git update-index --add --cacheinfo 100644,<blob>,<path>
$tree = git write-tree
Remove-Item env:GIT_INDEX_FILE
git commit-tree $tree -p origin/main -F <msgfile>   # -F file; inline here-strings break args
git push origin "<sha>:refs/heads/main"
```
If a push hangs silently: rebuild the commit on the current tip and push
again; `gh api -X PATCH repos/IzzoSol/Shaddai/git/refs/heads/main -f sha=<full-40> -F force=true`
for ref surgery. Render auto-deploys in ~6-10 min.

## API budgets (free tier — do not exceed)
DexScreener 60/min shared by ALL pollers · GeckoTerminal 30/min sliding
(discovery cadence ≥3min or the circuit breaker loops) · CoinGecko 100/min ·
Jupiter lite per-mint (fallback only). RugCheck/pump.fun/GoPlus: polite gaps
already in the http layer.

## Known-issues file
Promo/hero errors land in tg-signals.err.log. "pre-bond poll error: fetch
failed" = intermittent pump.fun; tolerate. Gecko "circuit OPEN" loops = a
poller is too fast (see budgets).
