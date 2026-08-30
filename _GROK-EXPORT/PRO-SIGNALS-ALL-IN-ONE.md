# SHADDAI Pro Signals — everything in one file

Paste this whole thing into Grok. It is the complete working set: the brief, the
constraints, the real data shapes, and every line of code.

---

## THE BRIEF

A live crypto call feed with two front ends, both in production:

- `/pro-signals.html` — the full desktop terminal (2,797 lines, NOT included
  here; it is desktop-first with only three media queries)
- `/signals.html` — the phone view, four modes, INCLUDED BELOW in full

They are one door: the terminal redirects below 820px to the phone view, and the
phone view offers the terminal at 820px and up. One menu button, right view per
device.

## THE CONSTRAINTS — code that breaks these cannot ship

- **No build step.** Vanilla JS only. No JSX, no TypeScript, no imports needing
  a bundler. `<script src>` and plain functions.
- **No new dependencies.** Node built-ins first.
- **390px is the target width.** Inputs must be >=16px font or iOS zooms the
  whole page on focus. Touch targets >=44px.
- **`prefers-reduced-motion` respected** by anything that animates.

## FAILURE MODES THIS CODEBASE HAS ACTUALLY HIT

Each of these shipped at least once. Check for them specifically.

- **CSS specificity.** An ID selector (`#x{}`, 1-0-0) silently beats a class
  rule (0-1-0). If a style is not applying, look for an ID rule before reaching
  for `!important`.
- **`` inside a template literal is a BACKSPACE character**, not a regex word
  boundary. ``new RegExp(`${x}`)`` matches nothing. Double-escape it.
- **Flex and grid children default to `min-width:auto`** and refuse to shrink
  below their content. This is the most common reason a horizontal scroller
  "does nothing" — the child inherits full content width and pushes the page.
  Set `min-width:0` on every ancestor.
- **`overflow-x:hidden` on `body` alone is not enough** — `html` stays visible
  and the page still scrolls. Both need it.
- **CSS cannot give a `<table>` a scroll parent.** `table{display:block}`
  relocates overflow onto TBODY and destroys column layout. Wrap it in a real
  div.
- **Silent catch blocks hide real errors.** A catch returning an empty result
  makes a ReferenceError indistinguishable from a valid "nothing here" state.
- **Non-ASCII inside a hex colour** passes every syntax check and renders
  nothing. Grep colour literals after any generated edit.

## HOUSE STYLE

- Comment the WHY, not the what.
- Degrade gracefully — a missing API key falls back, it does not 500.
- Never claim something works without measuring it.
- Never invent a capability. If it is not built, say so in the code.

## THE DATA MODEL

A call carries `mint, symbol, name, source, entryFdv, curFdv, curMult,
peakMult, ts, closed, riskTier, score`.

`source` maps to what a trader says:

| source | shown as | means |
|---|---|---|
| `new_pools` | Pre-bond | pump.fun, still on the curve |
| `bonded` | Post-bond | pump.fun, graduated |
| `boosted` | Boosted | paid promotion running |
| `trending`, `trending_pools` | Trending | |
| `seed`, `test` | excluded | not real calls |

**`closed:true` is excluded everywhere.** A dead call in a live feed is worse
than an empty feed, because somebody will act on it.

## ENDPOINTS

```
GET  /api/pro-signals/feed              ~300 calls, the main dataset
GET  /api/pro-signals/hot               current hot list
GET  /api/pro-signals/top-dex?limit=25  most-boosted, WITH logos and socials
POST /api/pro-signals/enrich {mints:[]} logos + typed socials flags
```

## KNOWN GAPS — good places to build

- No price sparkline or chart anywhere
- No alerting ("tell me when this crosses 5x")
- No sort control — each view has one fixed sort
- No search box
- Bubbles re-pack from scratch on refresh instead of animating between states
- No holder or liquidity filters, though the data carries both

---

## SAMPLE DATA — /api/pro-signals/feed

`_GROK-EXPORT/01-PRO-SIGNALS/SAMPLE-feed.json` — 186 lines

```json
{
  "_note": "Real /api/pro-signals/feed output, trimmed to 6 active calls.",
  "count": 303,
  "calls": [
    {
      "mint": "FieiBMr1f8xD1fBTk6ULv7dEsQeBP4JYz9u3s3okpump",
      "chain": "solana",
      "name": "Solanadier",
      "symbol": "SOLANDIER",
      "source": "seed",
      "entryFdv": 2400,
      "entryPrice": 0.0024,
      "ts": 1784070000000,
      "peakMult": 250,
      "curMult": 0.6145833333333334,
      "curFdv": 1475,
      "milestones": [
        2,
        5,
        10,
        25,
        100,
        15,
        20,
        30,
        35,
        40,
        45,
        50
      ],
      "closed": false,
      "score": 194,
      "riskTier": "medium",
      "isQuickXs": false
    },
    {
      "mint": "43mjozsTLTViop3seWnmgkcf1DRj6qMf1JWw7X8ypump",
      "chain": "solana",
      "name": "The Wheelchair Fish",
      "symbol": "MrSue",
      "source": "bonded",
      "entryFdv": 20027,
      "entryPrice": 2.002e-05,
      "holders": 376,
      "ts": 1784437049619,
      "peakMult": 29.217606231587357,
      "curMult": 0.349628002197034,
      "curFdv": 7002,
      "milestones": [
        2,
        5,
        10,
        15,
        20,
        25
      ],
      "closed": false,
      "score": 175,
      "riskTier": "medium",
      "isQuickXs": false
    },
    {
      "mint": "95TDpd91E9KcwiuU6kkG7BUVkAR3yvBNEC5pHHGNpump",
      "chain": "solana",
      "name": "IQ",
      "symbol": "IQ",
      "source": "boosted",
      "entryFdv": 72360,
      "entryPrice": 7.294e-07,
      "riskScore": 67,
      "viabilityScore": 65,
      "holders": 0,
      "liq": 22720.06,
      "vol1h": 0,
      "vol24": 0,
      "top10Pct": 0,
      "lpPct": 0,
      "insiders": 0,
      "bundlers": false,
      "snipers": false,
      "rugScore": 0,
      "rank": 0,
      "liqRatio": "31.40",
      "holderDensity": 0,
      "vol24Ratio": 0,
      "ts": 1788008245402,
      "peakMult": 1.0499032614704256,
      "curMult": 0.1021558872305141,
      "curFdv": 7392,
      "milestones": [],
      "closed": false,
      "score": 174,
      "riskTier": "medium",
      "isQuickXs": false
    },
    {
      "mint": "A4FJQGuSmykD6erkywPrSkzCrGsxQPRFh3SAXN63pump",
      "chain": "solana",
      "name": "apewifkash",
      "symbol": "kash",
      "source": "boosted",
      "entryFdv": 194067,
      "entryPrice": 1.884e-06,
      "riskScore": 67,
      "viabilityScore": 65,
      "holders": 0,
      "liq": 39965.92,
      "vol1h": 0,
      "vol24": 0,
      "top10Pct": 0,
      "lpPct": 0,
      "insiders": 0,
      "bundlers": false,
      "snipers": false,
      "rugScore": 0,
      "liqRatio": "20.59",
      "holderDensity": 0,
      "vol24Ratio": 0,
      "ts": 1787929810604,
      "peakMult": 1.9635589770543163,
      "curMult": 0.02199240468497993,
      "curFdv": 4268,
      "milestones": [],
      "closed": false,
      "score": 173,
      "riskTier": "medium",
      "isQuickXs": false
    },
    {
      "mint": "2FZCtjs3PqarpwjzXWeR4vMHmW4ESXGmWxRfWnbmpump",
      "chain": "solana",
      "name": "Walnut",
      "symbol": "Walnut",
      "source": "boosted",
      "entryFdv": 57838,
      "entryPrice": 5.689e-07,
      "riskScore": 67,
      "viabilityScore": 65,
      "holders": 0,
      "liq": 19404.19,
      "vol1h": 0,
      "vol24": 0,
      "top10Pct": 0,
      "lpPct": 0,
      "insiders": 0,
      "bundlers": false,
      "snipers": false,
      "rugScore": 0,
      "liqRatio": "33.55",
      "holderDensity": 0,
      "vol24Ratio": 0,
      "ts": 1787939527321,
      "peakMult": 1,
      "curMult": 0.0864483557522736,
      "curFdv": 5000,
      "milestones": [],
      "closed": false,
      "score": 173,
      "riskTier": "medium",
      "isQuickXs": false
    },
    {
      "mint": "3XEe11RMNqNTka33ik2yEmr3siUWmFQWSESP9Ejepump",
      "chain": "solana",
      "name": "wiwiwi / SOL",
      "symbol": "",
      "source": "trending_pools",
      "entryFdv": 372103.025623085,
      "entryPrice": 0.00038717708648011896,
      "holders": 0,
      "ts": 1785817356290,
      "peakMult": 14.147321138238574,
      "curMult": 0.9823085942070433,
      "curFdv": 365520,
      "milestones": [
        2,
        5,
        10
      ],
      "closed": false,
      "score": 170,
      "riskTier": "safe",
      "isQuickXs": false
    }
  ]
}
```

## SAMPLE DATA — /api/pro-signals/top-dex

`_GROK-EXPORT/01-PRO-SIGNALS/SAMPLE-topdex.json` — 145 lines

```json
{
  "_note": "Real /api/pro-signals/top-dex output. Note image + socials.",
  "pairs": [
    {
      "rank": 1,
      "mint": "AfGdjAp9djSaqJxzYo3t6jy8tJA3o2aDPHoZ57Egpump",
      "symbol": "Greyson",
      "name": "Greyson, Florida\u00e2\u20ac\u2122s viral Onewheel-riding pit bull, conquerin",
      "boost": 500,
      "image": "CNy0mG2rZI710xyN",
      "socials": {
        "any": true,
        "twitter": true,
        "telegram": false,
        "discord": false,
        "website": true,
        "links": [
          {
            "type": "website",
            "url": "https://greyson.dog"
          },
          {
            "type": "twitter",
            "url": "https://x.com/GreysonOnewheel"
          }
        ],
        "site": "https://greyson.dog"
      },
      "priceUsd": 0.0001007,
      "liq": 28601.8,
      "vol24": 3414201.64,
      "vol1h": 59022.2,
      "chg24": -54.09,
      "chg1h": -24.05,
      "pairUrl": "https://dexscreener.com/solana/caka2ratbnyimjxatpetksj3567mslatbxifws6g2rej",
      "dex": "pumpswap"
    },
    {
      "rank": 2,
      "mint": "6E8fPgsBvwjGRHcoeLUW8iugy736SKo54VvYLbYMpump",
      "symbol": "CGX",
      "name": "The all-in-one hub, fully Decentralized Perpetual Exchange (",
      "boost": 500,
      "image": "P32UtoeeKWmIb9N8",
      "socials": {
        "any": true,
        "twitter": false,
        "telegram": true,
        "discord": false,
        "website": true,
        "links": [
          {
            "type": "website",
            "url": "https://www.cryptogdex.io/"
          },
          {
            "type": "telegram",
            "url": "https://t.me/cryptogdex"
          }
        ],
        "site": "https://www.cryptogdex.io/"
      },
      "priceUsd": 0.0006807,
      "liq": 70435.9,
      "vol24": 48476.01,
      "vol1h": 1542.48,
      "chg24": 86.73,
      "chg1h": 3.88,
      "pairUrl": "https://dexscreener.com/solana/7n9drbwkk4lxgw8kvhx8vzw8fagupjjh6ebhyndxj9xb",
      "dex": "pumpswap"
    },
    {
      "rank": 3,
      "mint": "F7TGmpDqNFKxhHGCMcHDzoyxwkNtuX2d4aTZuEwwpump",
      "symbol": "pepescobar",
      "name": "Pepe Parker's least favourite person. The Lily Pad Cartel ha",
      "boost": 500,
      "image": "U6l_DTh3eKZMztcm",
      "socials": {
        "any": true,
        "twitter": true,
        "telegram": false,
        "discord": false,
        "website": true,
        "links": [
          {
            "type": "website",
            "url": "https://pepeescobar.com"
          },
          {
            "type": "twitter",
            "url": "https://x.com/rtc2028"
          }
        ],
        "site": "https://pepeescobar.com"
      },
      "priceUsd": 4.06e-05,
      "liq": 22247.31,
      "vol24": 10510.46,
      "vol1h": 64.86,
      "chg24": 50.61,
      "chg1h": 0.22,
      "pairUrl": "https://dexscreener.com/solana/egebrx3y79a3uuda2u4ubndf81qffyflxlypnjfpvbzf",
      "dex": "pumpswap"
    },
    {
      "rank": 4,
      "mint": "BoaPfCRY99XA4KcvZzpJNGupwUitNp5jVGhSoaBZpump",
      "symbol": "stacyfone",
      "name": "",
      "boost": 100,
      "image": "qCnXbOPs7WoORloC",
      "socials": {
        "any": true,
        "twitter": true,
        "telegram": true,
        "discord": false,
        "website": true,
        "links": [
          {
            "type": "website",
            "url": "https://stacyonfone.site"
          },
          {
            "type": "telegram",
            "url": "https://t.me/stacyfone"
          },
          {
            "type": "twitter",
            "url": "https://x.com/stacyfone"
          }
        ],
        "site": "https://stacyonfone.site"
      },
      "priceUsd": 2.212e-06,
      "liq": 2443.26,
      "vol24": 1739639.46,
      "vol1h": 37.3,
      "chg24": -96.89,
      "chg1h": -4.53,
      "pairUrl": "https://dexscreener.com/solana/gf9gqhqjyesczknfbnreummbjbhuwabursgdn17ohmxb",
      "dex": "pumpswap"
    }
  ]
}
```

## THE PHONE VIEW (complete)

`_GROK-EXPORT/01-PRO-SIGNALS/signals.html` — 589 lines

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
<title>SHADDAI · Signals</title>
<meta name="description" content="Live calls — list, bubbles, heatmap, ranked. Pump.fun pre-bond and post-bond, boosted, and the top 25 on DEX." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
/* ══ SIGNALS ══════════════════════════════════════════════════════════════
   Built as an APP, not a page. The window is the frame: header and filters
   are fixed, only the results pane scrolls, and nothing ever moves the whole
   document. That is the difference between "a website on a phone" and
   something usable one-handed while standing up.

   Big and bold on purpose, matching Simple Mode. This screen is read at a
   glance in bad light with a moving thumb — small type is not a style choice
   here, it is a failure.

   FILTERS ARE REMEMBERED. Someone who only trades post-bond with socials
   should not re-pick that every visit.
   ══════════════════════════════════════════════════════════════════════════ */
:root{
  --shell:#06080b; --void:#06080b; --void2:#0a0e13; --card:#0e141a;
  --ink:#e9efe9; --ink-soft:#93a49b; --ink-faint:#5c6b64;
  --edge:rgba(120,150,140,.2); --edge2:rgba(120,150,140,.34);
  --emerald:#00ff9c; --gold:#e8c45c;
  /* Performance ramp — semantic, deliberately NOT the brand palette.
     A loss must never render "on brand". */
  --up3:#00ff9c; --up2:#4ade80; --up1:#a3e635;
  --flat:#7d8d86; --dn1:#fbbf24; --dn2:#fb7185; --dn3:#ef4444;
  --f-display:'Cinzel',serif; --f-mono:'IBM Plex Mono',ui-monospace,monospace;
  --hdr:52px; --rails:96px;
}
*{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html,body{ margin:0; padding:0; height:100%; overflow:hidden; }  /* the window IS the frame */
body{ background:var(--void); color:var(--ink); font-family:var(--f-mono);
  display:flex; flex-direction:column; -webkit-font-smoothing:antialiased; }
@media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }

/* ── header ────────────────────────────────────────────────────────────── */
header{ flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:8px;
  height:var(--hdr); padding:0 12px; padding-top:env(safe-area-inset-top);
  border-bottom:1px solid var(--edge); background:var(--shell); }
.brand{ display:flex; align-items:center; gap:9px; min-width:0; }
.brand b{ font-family:var(--f-display); font-weight:900; font-size:19px; letter-spacing:.1em; }
.pill{ display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600;
  letter-spacing:.1em; color:var(--emerald); border:1px solid rgba(0,255,156,.35);
  padding:4px 9px; border-radius:2px; }
.pill .d{ width:6px; height:6px; border-radius:50%; background:var(--emerald);
  box-shadow:0 0 8px var(--emerald); animation:pulse 2.4s ease-in-out infinite; }
@keyframes pulse{ 50%{opacity:.3} }
header a.x{ font-size:20px; color:var(--ink-soft); text-decoration:none; width:44px; height:44px;
  display:grid; place-items:center; }

/* ── filter rails ──────────────────────────────────────────────────────── */
.rails{ flex:0 0 auto; background:var(--shell); border-bottom:1px solid var(--edge); }
.rail{ display:flex; gap:6px; overflow-x:auto; padding:8px 12px;
  scrollbar-width:none; -ms-overflow-style:none; }
.rail::-webkit-scrollbar{ display:none; }
.rail + .rail{ padding-top:0; }
.chip{ flex:0 0 auto; min-height:44px; padding:0 15px; display:inline-flex; align-items:center; gap:7px;
  border:1px solid var(--edge); border-radius:3px; background:var(--card); color:var(--ink-soft);
  font-family:var(--f-mono); font-size:13px; font-weight:600; letter-spacing:.05em;
  cursor:pointer; white-space:nowrap; transition:background .15s, color .15s, border-color .15s; }
.chip[aria-pressed=true]{ background:var(--emerald); color:#04120c; border-color:var(--emerald); }
.rail.modes .chip{ font-size:15px; padding:0 17px; }
.rail.modes .chip[aria-pressed=true]{ background:var(--gold); border-color:var(--gold); color:#140f02; }
.chip .ct{ font-size:11px; opacity:.6; font-weight:500; }

/* ── the one scrolling surface ─────────────────────────────────────────── */
main{ flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden;
  -webkit-overflow-scrolling:touch; padding:10px 12px calc(20px + env(safe-area-inset-bottom)); }
.bar{ display:flex; justify-content:space-between; align-items:baseline; gap:10px;
  font-size:12px; color:var(--ink-faint); letter-spacing:.08em; margin-bottom:9px; }
.bar b{ color:var(--ink); font-size:15px; }
.empty{ padding:56px 14px; text-align:center; color:var(--ink-faint); font-size:14px; line-height:1.7; }
.view{ display:none; } .view.on{ display:block; }

/* ── avatar, shared ────────────────────────────────────────────────────── */
.av{ flex:0 0 auto; width:60px; height:60px; border-radius:50%; background:var(--void2);
  border:1px solid var(--edge2); object-fit:cover; display:block; }
.av.ph{ display:grid; place-items:center; font-size:15px; font-weight:700; color:var(--ink-faint); }

/* ── LIST — big rows ───────────────────────────────────────────────────── */
.row{ display:flex; align-items:center; gap:13px; border:1px solid var(--edge);
  border-left:5px solid var(--pc,var(--flat)); background:var(--card);
  padding:15px 15px; margin-bottom:9px; min-height:92px; cursor:pointer; }
/* The contract address on the face of the row. It is the thing someone copies
   to buy, so making them open a sheet to see it costs a tap at the exact
   moment speed matters. Truncated head+tail — the middle of a mint carries no
   recognition value, but the ends do. */
.row .ca{ font-size:11px; color:var(--ink-faint); letter-spacing:.02em; margin-top:5px;
  display:flex; align-items:center; gap:7px; }
.row .ca b{ color:var(--ink-soft); font-weight:400; }
.row .cabtn{ border:1px solid var(--edge2); background:none; color:var(--ink-faint);
  font-family:var(--f-mono); font-size:9.5px; letter-spacing:.1em; text-transform:uppercase;
  padding:4px 8px; border-radius:2px; cursor:pointer; min-height:28px; }
.row .cabtn:active{ color:var(--emerald); border-color:var(--emerald); }
.row .mid{ flex:1 1 auto; min-width:0; }
.row .sym{ font-size:23px; font-weight:700; letter-spacing:.03em; color:var(--ink);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.row .sub{ font-size:12px; color:var(--ink-faint); margin-top:4px; display:flex; gap:8px;
  align-items:center; flex-wrap:wrap; }
.row .mult{ flex:0 0 auto; font-size:30px; font-weight:700; color:var(--pc,var(--flat));
  font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
.so{ display:inline-flex; gap:4px; align-items:center; }
.so i{ font-style:normal; font-size:12px; opacity:.9; }
.tag{ border:1px solid var(--edge2); padding:2px 6px; border-radius:2px; font-size:10px;
  font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
.tag.pre{ color:var(--gold); border-color:rgba(232,196,92,.45); }
.tag.bond{ color:var(--emerald); border-color:rgba(0,255,156,.45); }
.tag.boost{ color:#c4b5fd; border-color:rgba(196,181,253,.45); }

/* ── BUBBLES ───────────────────────────────────────────────────────────── */
#bubbles{ position:relative; width:100%; height:100%; min-height:340px; }
#bubbles canvas{ width:100%; height:100%; display:block; touch-action:pan-y; }
#v-bub.on{ height:100%; }

/* ── HEATMAP — bigger cells, logo behind ───────────────────────────────── */
.heat{ display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:6px; }
.cell{ position:relative; aspect-ratio:1; border:0; padding:7px; overflow:hidden; cursor:pointer;
  display:flex; flex-direction:column; justify-content:space-between; align-items:flex-start;
  font-family:var(--f-mono); color:#04120c; }
.cell img{ position:absolute; right:-4px; top:-4px; width:56px; height:56px; border-radius:50%;
  opacity:.26; object-fit:cover; }
.cell .s{ position:relative; font-size:15px; font-weight:700; line-height:1.05; max-width:100%;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell .m{ position:relative; font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
.cell .so{ position:absolute; left:7px; bottom:7px; font-size:10px; opacity:.75; }
.cell.dark{ color:#f4fbf7; }

/* ── RANKED ────────────────────────────────────────────────────────────── */
.rank{ display:flex; align-items:center; gap:12px; padding:12px 4px;
  border-bottom:1px solid var(--edge); cursor:pointer; min-height:70px; }
.rank .n{ flex:0 0 auto; font-family:var(--f-display); font-weight:900; font-size:21px;
  color:var(--ink-faint); min-width:1.8ch; font-variant-numeric:tabular-nums; }
.rank:nth-child(1) .n{ color:var(--gold); font-size:25px; }
.rank:nth-child(2) .n{ color:#cbd5e1; }
.rank:nth-child(3) .n{ color:#d19a66; }
.rank .b{ flex:1 1 auto; min-width:0; }
.rank .b .s{ font-size:20px; font-weight:700; color:var(--ink); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.rank .b .u{ font-size:12px; color:var(--ink-faint); margin-top:3px; }
.rank .v{ flex:0 0 auto; font-size:26px; font-weight:700; font-variant-numeric:tabular-nums;
  color:var(--pc,var(--flat)); }

/* ── sheet ─────────────────────────────────────────────────────────────── */
#sheet{ position:fixed; inset:0; z-index:70; display:none; }
#sheet.on{ display:block; }
#sheet .scrim{ position:absolute; inset:0; background:rgba(0,0,0,.74); }
#sheet .panel{ position:absolute; left:0; right:0; bottom:0; background:var(--card);
  border-top:3px solid var(--pc,var(--emerald)); padding:20px 18px calc(22px + env(safe-area-inset-bottom));
  max-height:86vh; overflow-y:auto; }
#sheet .top{ display:flex; align-items:center; gap:13px; }
#sheet .top .av{ width:56px; height:56px; }
#sheet h3{ font-family:var(--f-display); font-weight:900; font-size:25px; margin:0; letter-spacing:.03em; }
#sheet .sub{ font-size:12px; color:var(--ink-faint); margin-top:4px; }
#sheet dl{ display:grid; grid-template-columns:1fr 1fr; gap:12px 14px; margin:20px 0 0; }
#sheet dt{ font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint); }
#sheet dd{ margin:3px 0 0; font-size:17px; font-weight:600; font-variant-numeric:tabular-nums; }
#sheet .links{ display:flex; gap:7px; flex-wrap:wrap; margin-top:16px; }
#sheet .links a{ min-height:42px; padding:0 14px; display:inline-flex; align-items:center; gap:6px;
  border:1px solid var(--edge2); color:var(--ink-soft); text-decoration:none; border-radius:2px;
  font-size:12px; font-weight:600; }
#sheet .acts{ display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
#sheet .acts a, #sheet .acts button{ flex:1 1 140px; min-height:54px; display:inline-flex;
  align-items:center; justify-content:center; border:1px solid var(--edge2); background:none;
  color:var(--ink-soft); font-family:var(--f-mono); font-size:13px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; text-decoration:none; border-radius:3px; cursor:pointer; }
#sheet .acts .pri{ background:var(--emerald); color:#04120c; border-color:var(--emerald); }
#sheet .note{ margin-top:14px; font-size:11px; color:var(--ink-faint); line-height:1.65; }

/* On a desktop the phone view is not the right tool — offer the terminal
   rather than silently being the lesser of the two. Hidden below 820px, where
   this view IS the right tool. */
#toTerm{ display:none; }
@media(min-width:820px){
  #toTerm{ display:inline-flex; align-items:center; gap:7px; min-height:38px; padding:0 14px;
    border:1px solid var(--gold); color:var(--gold); background:none; border-radius:3px;
    font-family:var(--f-mono); font-size:11px; font-weight:600; letter-spacing:.12em;
    text-transform:uppercase; text-decoration:none; margin-right:8px; }
  #toTerm:hover{ background:var(--gold); color:#140f02; }
}
</style>
</head>
<body>

<header>
  <div class="brand"><b>SIGNALS</b><span class="pill"><span class="d"></span><span id="liveN">—</span></span></div>
  <a id="toTerm" href="/pro-signals.html?full=1">▤ Full terminal</a>
  <a class="x" href="/index.html" aria-label="Close">&times;</a>
</header>

<div class="rails">
  <div class="rail modes" id="modes" role="tablist" aria-label="View">
    <button class="chip" data-m="list" aria-pressed="true">📋 List</button>
    <button class="chip" data-m="bub"  aria-pressed="false">🫧 Bubbles</button>
    <button class="chip" data-m="heat" aria-pressed="false">🔲 Heatmap</button>
    <button class="chip" data-m="rank" aria-pressed="false">🏆 Ranked</button>
  </div>
  <div class="rail" id="cats" aria-label="Category"></div>
  <div class="rail" id="filters" aria-label="Filters">
    <button class="chip" data-t="1"  aria-pressed="false">1h</button>
    <button class="chip" data-t="6"  aria-pressed="false">6h</button>
    <button class="chip" data-t="24" aria-pressed="true">24h</button>
    <button class="chip" data-t="0"  aria-pressed="false">All</button>
    <button class="chip" data-s="any" aria-pressed="false">🔗 Has socials</button>
    <button class="chip" data-s="tw"  aria-pressed="false">𝕏 Twitter</button>
    <button class="chip" data-s="none" aria-pressed="false">⚠ No socials</button>
  </div>
</div>

<main>
  <div class="bar"><span><b id="cN">…</b> <span id="cW"></span></span><span id="cE"></span></div>
  <div class="view on" id="v-list"></div>
  <div class="view" id="v-bub"><div id="bubbles"><canvas id="bcv"></canvas></div></div>
  <div class="view" id="v-heat"><div class="heat" id="heatGrid"></div></div>
  <div class="view" id="v-rank"></div>
</main>

<div id="sheet" role="dialog" aria-modal="true" aria-label="Coin detail">
  <div class="scrim" data-close></div><div class="panel" id="panel"></div>
</div>

<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ALL = [], TOP = [], VIEW = [], INFO = {};

  /* Saved parameters. Someone who only trades post-bond with socials should
     not re-pick that on every visit. Wrapped because storage throws in
     private mode and a crashed preference read must not blank the page. */
  var P = { mode: 'list', cat: 'all', hours: 24, social: '' };
  try { Object.assign(P, JSON.parse(localStorage.getItem('shd_sig_v1') || '{}')); } catch (e) {}
  function save() { try { localStorage.setItem('shd_sig_v1', JSON.stringify(P)); } catch (e) {} }

  /* Real `source` values from the feed, named the way a trader says them.
     Pre-bond and post-bond are pump.fun's bonding curve specifically. */
  var CATS = [
    { id: 'all',   label: 'All',          srcs: null },
    { id: 'pre',   label: 'Pre-bond',     srcs: ['new_pools'], note: 'pump.fun, still on the curve' },
    { id: 'post',  label: 'Post-bond',    srcs: ['bonded'],    note: 'pump.fun, graduated' },
    { id: 'boost', label: 'Boosted',      srcs: ['boosted'],   note: 'paid promotion running' },
    { id: 'trend', label: 'Trending',     srcs: ['trending', 'trending_pools'] },
    { id: 'top',   label: 'Top 25 DEX',   srcs: null, top: true, note: 'most boosted right now' },
  ];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* Head and tail of a mint. The middle carries no recognition value; the ends
     are what someone checks against a chart or a wallet. */
  function shortCA(m) {
    m = String(m || '');
    return m.length > 14 ? m.slice(0, 6) + '…' + m.slice(-5) : m;
  }
  function mult(c) { var m = Number(c.curMult); return isFinite(m) && m > 0 ? m : 0; }
  function ago(ts) { var m = (Date.now() - (ts || 0)) / 60000;
    if (!ts) return ''; if (m < 1) return 'now'; if (m < 60) return Math.round(m) + 'm';
    if (m < 1440) return Math.round(m / 60) + 'h'; return Math.round(m / 1440) + 'd'; }
  function money(n) { n = Number(n) || 0;
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'; return '$' + n.toFixed(0); }
  function rampHex(m) { if (!m) return '#7d8d86';
    if (m >= 5) return '#00ff9c'; if (m >= 2) return '#4ade80'; if (m >= 1.15) return '#a3e635';
    if (m >= .85) return '#7d8d86'; if (m >= .5) return '#fbbf24'; if (m >= .25) return '#fb7185';
    return '#ef4444'; }
  function catOf(c) { var s = c.source;
    if (s === 'new_pools') return { c: 'pre', l: 'pre-bond' };
    if (s === 'bonded') return { c: 'bond', l: 'bonded' };
    if (s === 'boosted') return { c: 'boost', l: 'boosted' };
    return { c: '', l: s || '' }; }
  function info(c) { return c.__top ? c : (INFO[c.mint] || null); }
  function avatar(c, cls) {
    var i = info(c), sym = (c.symbol || c.name || '?').slice(0, 2).toUpperCase();
    return i && i.image
      ? '<img class="av ' + (cls || '') + '" src="' + esc(i.image) + '" alt="" loading="lazy" ' +
        'onerror="this.outerHTML=\'<div class=&quot;av ph&quot;>' + esc(sym) + '</div>\'">'
      : '<div class="av ph ' + (cls || '') + '">' + esc(sym) + '</div>';
  }
  function socialBits(c) {
    var i = info(c); if (!i || !i.socials) return '';
    var s = i.socials, out = [];
    if (s.twitter) out.push('𝕏'); if (s.telegram) out.push('✈'); if (s.website) out.push('🌐');
    return out.length ? '<span class="so"><i>' + out.join('</i><i>') + '</i></span>' : '';
  }

  /* ── filter ────────────────────────────────────────────────────────────── */
  function applyFilters() {
    var def = CATS.find(function (c) { return c.id === P.cat; });
    if (def && def.top) { VIEW = TOP.slice(); render(); return; }

    var cut = P.hours ? Date.now() - P.hours * 3600000 : 0;
    VIEW = ALL.filter(function (c) {
      if (c.closed) return false;                       // active only, always
      if (def && def.srcs && def.srcs.indexOf(c.source) === -1) return false;
      if (cut && (c.ts || 0) < cut) return false;
      if (P.social) {
        var i = INFO[c.mint];
        if (P.social === 'none') { if (i && i.socials && i.socials.any) return false; }
        else if (!i || !i.socials) return false;        // unknown is not a match
        else if (P.social === 'any' && !i.socials.any) return false;
        else if (P.social === 'tw' && !i.socials.twitter) return false;
      }
      return true;
    });
    render();
  }

  /* ── renderers ─────────────────────────────────────────────────────────── */
  function renderList() {
    var by = VIEW.slice().sort(function (a, b) {
      return P.cat === 'top' ? (a.rank || 0) - (b.rank || 0) : (b.ts || 0) - (a.ts || 0); });
    $('v-list').innerHTML = by.length ? by.map(function (c) {
      var m = mult(c), k = catOf(c), col = c.__top ? rampHex(1 + (c.chg24 || 0) / 100) : rampHex(m);
      var big = c.__top ? ((c.chg24 >= 0 ? '+' : '') + Math.round(c.chg24 || 0) + '%')
                        : (m ? m.toFixed(2) + 'x' : '—');
      var sub = c.__top ? (money(c.vol24) + ' vol · boost ' + c.boost)
                        : (ago(c.ts) + ' · ' + money(c.curFdv || c.entryFdv));
      return '<div class="row" style="--pc:' + col + '" data-mint="' + esc(c.mint) + '">' +
        avatar(c) +
        '<div class="mid"><div class="sym">' + esc(c.symbol || c.name || '?') + '</div>' +
        '<div class="sub"><span>' + esc(sub) + '</span>' + socialBits(c) +
          (k.l ? '<span class="tag ' + k.c + '">' + esc(k.l) + '</span>' : '') + '</div>' +
        '<div class="ca"><b>' + esc(shortCA(c.mint)) + '</b>' +
          '<button class="cabtn" data-ca="' + esc(c.mint) + '">copy</button></div></div>' +
        '<div class="mult">' + big + '</div></div>';
    }).join('') : emptyMsg();
  }

  function renderRank() {
    var by = VIEW.slice().sort(function (a, b) {
      return c2(b) - c2(a); }).slice(0, 60);
    function c2(x) { return x.__top ? (x.chg24 || 0) : mult(x); }
    $('v-rank').innerHTML = by.length ? by.map(function (c, i) {
      var m = mult(c), col = c.__top ? rampHex(1 + (c.chg24 || 0) / 100) : rampHex(m);
      var big = c.__top ? ((c.chg24 >= 0 ? '+' : '') + Math.round(c.chg24 || 0) + '%')
                        : (m ? m.toFixed(2) + 'x' : '—');
      return '<div class="rank" style="--pc:' + col + '" data-mint="' + esc(c.mint) + '">' +
        '<span class="n">' + (i + 1) + '</span>' + avatar(c) +
        '<span class="b"><span class="s">' + esc(c.symbol || c.name || '?') + '</span>' +
        '<span class="u">' + (c.__top ? money(c.vol24) + ' vol' : ago(c.ts) + ' · ' + money(c.curFdv || c.entryFdv)) +
        '</span></span><span class="v">' + big + '</span></div>';
    }).join('') : emptyMsg();
  }

  function renderHeat() {
    var by = VIEW.slice().sort(function (a, b) {
      return (b.__top ? (b.chg24 || 0) : mult(b) * 100) - (a.__top ? (a.chg24 || 0) : mult(a) * 100); });
    $('heatGrid').innerHTML = by.length ? by.map(function (c) {
      var m = mult(c), v = c.__top ? 1 + (c.chg24 || 0) / 100 : m, bg = rampHex(v);
      var big = c.__top ? Math.round(c.chg24 || 0) + '%' : (m ? (m >= 10 ? Math.round(m) : m.toFixed(1)) + 'x' : '—');
      var i = info(c);
      // text colour computed against the fill, not assumed
      var dark = (v < .5 && v > 0) || v === 0;
      return '<button class="cell' + (dark ? ' dark' : '') + '" style="background:' + bg + '" data-mint="' + esc(c.mint) + '">' +
        (i && i.image ? '<img src="' + esc(i.image) + '" alt="" loading="lazy">' : '') +
        '<span class="s">' + esc((c.symbol || c.name || '?').slice(0, 8)) + '</span>' +
        '<span class="m">' + big + '</span>' +
        (i && i.socials && i.socials.twitter ? '<span class="so">𝕏</span>' : '') + '</button>';
    }).join('') : emptyMsg();
  }

  var bub = { nodes: [], raf: 0 };
  function renderBub() {
    var cv = $('bcv'), wrap = $('bubbles');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = wrap.offsetWidth, H = wrap.offsetHeight || 380;
    if (!W) return;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var by = VIEW.slice().sort(function (a, b) { return mult(b) - mult(a); }).slice(0, 60);
    var sz = by.map(function (c) { return Number(c.curFdv || c.entryFdv || c.vol24) || 1; });
    var mx = Math.max.apply(null, sz.concat([1])), area = W * H;
    bub.nodes = by.map(function (c) {
      var f = (Number(c.curFdv || c.entryFdv || c.vol24) || 1) / mx;
      var r = Math.max(19, Math.min(Math.sqrt(area * f * .05 / Math.PI), Math.min(W, H) * .2));
      return { c: c, r: r, x: Math.random() * (W - 2 * r) + r, y: Math.random() * (H - 2 * r) + r,
               m: c.__top ? 1 + (c.chg24 || 0) / 100 : mult(c) };
    });
    cancelAnimationFrame(bub.raf);
    var steps = 0;
    (function relax() {
      for (var i = 0; i < bub.nodes.length; i++) {
        var a = bub.nodes[i];
        for (var j = i + 1; j < bub.nodes.length; j++) {
          var b = bub.nodes[j], dx = b.x - a.x, dy = b.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy) || .01, need = a.r + b.r + 3;
          if (d < need) { var p = (need - d) / d * .5;
            a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
        }
        a.x = Math.max(a.r, Math.min(W - a.r, a.x));
        a.y = Math.max(a.r, Math.min(H - a.r, a.y));
      }
      ctx.clearRect(0, 0, W, H);
      bub.nodes.forEach(function (n) {
        var col = rampHex(n.m);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = col + '30'; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.stroke();
        if (n.r > 24) {
          ctx.textAlign = 'center'; ctx.fillStyle = '#e9efe9';
          ctx.font = '700 ' + Math.min(15, n.r * .42) + 'px IBM Plex Mono, monospace';
          ctx.fillText((n.c.symbol || '?').slice(0, 6), n.x, n.y - 1);
          ctx.fillStyle = col;
          ctx.font = '700 ' + Math.min(14, n.r * .38) + 'px IBM Plex Mono, monospace';
          ctx.fillText(n.c.__top ? Math.round(n.c.chg24 || 0) + '%' : (n.m ? n.m.toFixed(1) + 'x' : '—'),
                       n.x, n.y + Math.min(16, n.r * .48));
        }
      });
      if (++steps < 80) bub.raf = requestAnimationFrame(relax);
    })();
  }
  $('bcv').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = bub.nodes.length - 1; i >= 0; i--) { var n = bub.nodes[i];
      if ((x - n.x) * (x - n.x) + (y - n.y) * (y - n.y) <= n.r * n.r) { openSheet(n.c.mint); return; } }
  });

  function emptyMsg() {
    return '<div class="empty">Nothing matches.<br>' +
      (P.social ? 'Try clearing the socials filter.' : 'Try a wider time window.') + '</div>';
  }
  function render() {
    $('cN').textContent = VIEW.length;
    $('cW').textContent = P.cat === 'top' ? 'boosted now' : (P.hours ? 'in ' + P.hours + 'h' : 'all time');
    $('cE').textContent = P.social === 'tw' ? 'with 𝕏' : P.social === 'any' ? 'with socials'
                        : P.social === 'none' ? 'no socials' : '';
    $('liveN').textContent = VIEW.length;
    ['list', 'bub', 'heat', 'rank'].forEach(function (m) { $('v-' + m).classList.toggle('on', m === P.mode); });
    if (P.mode === 'list') renderList(); else if (P.mode === 'rank') renderRank();
    else if (P.mode === 'heat') renderHeat(); else renderBub();
  }

  /* ── sheet ─────────────────────────────────────────────────────────────── */
  function openSheet(mint) {
    var c = VIEW.concat(ALL, TOP).find(function (x) { return x.mint === mint; });
    if (!c) return;
    var m = mult(c), i = info(c) || {}, s = i.socials || {};
    var col = c.__top ? rampHex(1 + (c.chg24 || 0) / 100) : rampHex(m);
    var links = (s.links || []).map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.type || 'link') + '</a>'; }).join('');
    if (s.site) links += '<a href="' + esc(s.site) + '" target="_blank" rel="noopener">website</a>';

    $('panel').style.setProperty('--pc', col);
    $('panel').innerHTML =
      '<div class="top">' + avatar(c) + '<div><h3>' + esc(c.symbol || c.name || '?') + '</h3>' +
      '<div class="sub">' + esc((c.name || '').slice(0, 52)) + (c.ts ? ' · ' + ago(c.ts) + ' ago' : '') + '</div></div></div>' +
      '<dl>' +
      (c.__top
        ? '<div><dt>24h</dt><dd style="color:' + col + '">' + (c.chg24 >= 0 ? '+' : '') + (c.chg24 || 0).toFixed(1) + '%</dd></div>' +
          '<div><dt>1h</dt><dd>' + (c.chg1h >= 0 ? '+' : '') + (c.chg1h || 0).toFixed(1) + '%</dd></div>' +
          '<div><dt>Volume 24h</dt><dd>' + money(c.vol24) + '</dd></div>' +
          '<div><dt>Liquidity</dt><dd>' + money(c.liq) + '</dd></div>' +
          '<div><dt>Boost</dt><dd>' + (c.boost || 0) + '</dd></div>' +
          '<div><dt>Socials</dt><dd style="font-size:14px">' + (s.any ? 'yes' : 'none') + '</dd></div>'
        : '<div><dt>Now</dt><dd style="color:' + col + '">' + (m ? m.toFixed(2) + 'x' : '—') + '</dd></div>' +
          '<div><dt>Peak</dt><dd>' + (Number(c.peakMult) ? Number(c.peakMult).toFixed(2) + 'x' : '—') + '</dd></div>' +
          '<div><dt>Market cap</dt><dd>' + money(c.curFdv || c.entryFdv) + '</dd></div>' +
          '<div><dt>Called at</dt><dd>' + money(c.entryFdv) + '</dd></div>' +
          '<div><dt>Risk</dt><dd style="font-size:14px">' + esc(c.riskTier || '—') + '</dd></div>' +
          '<div><dt>Socials</dt><dd style="font-size:14px">' + (s.any ? (s.twitter ? '𝕏 yes' : 'yes') : 'none') + '</dd></div>') +
      '</dl>' +
      (links ? '<div class="links">' + links + '</div>' : '') +
      '<div class="acts">' +
        '<a class="pri" href="' + esc(i.pairUrl || ('https://dexscreener.com/solana/' + c.mint)) + '" target="_blank" rel="noopener">Chart</a>' +
        '<button type="button" id="cpy">Copy CA</button>' +
        '<button type="button" data-close>Close</button></div>' +
      '<p class="note">Not advice. This is what the scanner saw, with the numbers behind it.' +
      (s.any ? '' : ' <b style="color:#fbbf24">No socials found — treat with care.</b>') + '</p>';
    $('sheet').classList.add('on');
    var cpy = $('cpy');
    if (cpy) cpy.addEventListener('click', function () {
      var ok = function () { cpy.textContent = 'Copied'; setTimeout(function () { cpy.textContent = 'Copy CA'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.mint).then(ok, fb); else fb();
      function fb() { var t = document.createElement('textarea'); t.value = c.mint;
        t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); ok(); } catch (e) {} document.body.removeChild(t); }
    });
  }
  document.addEventListener('click', function (e) {
    // Copy-CA must not also open the detail sheet — the row underneath it is
    // clickable, so this has to claim the event before it bubbles.
    var ca = e.target.closest('[data-ca]');
    if (ca) {
      e.stopPropagation(); e.preventDefault();
      var v = ca.getAttribute('data-ca'), was = ca.textContent;
      var ok = function () { ca.textContent = 'copied'; setTimeout(function () { ca.textContent = was; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, fb); else fb();
      function fb() { var t = document.createElement('textarea'); t.value = v;
        t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); ok(); } catch (err) {} document.body.removeChild(t); }
      return;
    }
    if (e.target.closest('[data-close]') || e.target.classList.contains('scrim')) { $('sheet').classList.remove('on'); return; }
    var hit = e.target.closest('[data-mint]');
    if (hit && !e.target.closest('#sheet')) openSheet(hit.dataset.mint);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('sheet').classList.remove('on'); });

  /* ── chips ─────────────────────────────────────────────────────────────── */
  $('modes').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    [].forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    P.mode = b.dataset.m; save(); render();
  });
  $('cats').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    [].forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    P.cat = b.dataset.c; save();
    if (P.cat === 'top' && !TOP.length) loadTop(); else applyFilters();
  });
  $('filters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.t !== undefined) {
      [].forEach.call(this.querySelectorAll('[data-t]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      P.hours = Number(b.dataset.t);
    } else {
      // socials chips toggle off when tapped again — a filter you cannot clear
      // is a trap
      var on = b.getAttribute('aria-pressed') === 'true';
      [].forEach.call(this.querySelectorAll('[data-s]'), function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (!on) { b.setAttribute('aria-pressed', 'true'); P.social = b.dataset.s; } else P.social = '';
    }
    save(); applyFilters();
  });

  function buildCats() {
    $('cats').innerHTML = CATS.map(function (c) {
      var n = c.top ? (TOP.length || 25)
            : c.srcs ? ALL.filter(function (x) { return !x.closed && c.srcs.indexOf(x.source) !== -1; }).length
            : ALL.filter(function (x) { return !x.closed; }).length;
      return '<button class="chip" data-c="' + c.id + '" aria-pressed="' + (c.id === P.cat) + '"' +
        (c.note ? ' title="' + esc(c.note) + '"' : '') + '>' + c.label + ' <span class="ct">' + n + '</span></button>';
    }).join('');
  }
  function restoreChips() {
    [].forEach.call($('modes').children, function (x) { x.setAttribute('aria-pressed', String(x.dataset.m === P.mode)); });
    [].forEach.call($('filters').querySelectorAll('[data-t]'), function (x) { x.setAttribute('aria-pressed', String(Number(x.dataset.t) === P.hours)); });
    [].forEach.call($('filters').querySelectorAll('[data-s]'), function (x) { x.setAttribute('aria-pressed', String(x.dataset.s === P.social)); });
  }

  var rz; window.addEventListener('resize', function () {
    clearTimeout(rz); rz = setTimeout(function () { if (P.mode === 'bub') renderBub(); }, 220); });

  /* ── data ──────────────────────────────────────────────────────────────── */
  function enrichVisible() {
    // Only what is on screen, newest first — enrichment is decoration and must
    // never delay the first paint or hammer a free API.
    var mints = ALL.filter(function (c) { return !c.closed; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
      .slice(0, 90).map(function (c) { return c.mint; })
      .filter(function (m) { return !(m in INFO); });
    if (!mints.length) return;
    fetch('/api/pro-signals/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mints: mints }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { Object.assign(INFO, d.tokens || {}); render(); })
      .catch(function () {});
  }
  function loadTop() {
    fetch('/api/pro-signals/top-dex?limit=25').then(function (r) { return r.json(); })
      .then(function (d) {
        TOP = (d.pairs || []).map(function (x) { x.__top = true; return x; });
        buildCats(); applyFilters();
      }).catch(function () { applyFilters(); });
  }
  function load() {
    fetch('/api/pro-signals/feed').then(function (r) { return r.json(); })
      .then(function (d) {
        ALL = (d.calls || []).filter(function (c) { return c && c.mint && c.source !== 'test' && c.source !== 'seed'; });
        buildCats(); restoreChips(); applyFilters(); enrichVisible();
        if (P.cat === 'top') loadTop();
      })
      .catch(function () { $('cN').textContent = '—';
        $('v-list').innerHTML = '<div class="empty">Feed unavailable.<br>Try again shortly.</div>'; });
  }
  load();
  setInterval(load, 60000);
})();
</script>
</body>
</html>

```

## ENRICHMENT — logos and socials

`_GROK-EXPORT/01-PRO-SIGNALS/token-enrich.js` — 225 lines

```javascript
/* ══════════════════════════════════════════════════════════════════════════
   TOKEN ENRICHMENT — logos, socials and live pair data for a list of mints.

   The signal feed stores what the scanner saw when it called a coin: mint,
   symbol, entry FDV, multiples. It has no logo and no socials, so the signals
   UI could show neither — and "does this coin have a Twitter" is one of the
   first things anyone checks before buying.

   DexScreener's token endpoint carries all of it, keyless:
     https://api.dexscreener.com/latest/dex/tokens/<comma separated mints>
   returning info.imageUrl, info.socials[{type,url}], info.websites[] plus
   live price, volume and priceChange.

   THREE THINGS THIS FILE EXISTS TO GET RIGHT:

   1. BATCHING. The endpoint takes up to 30 addresses per call. Asking for 300
      coins one at a time is 300 requests and a rate-limit ban; asking in
      batches of 30 is ten.
   2. CACHING. The signals page refreshes every 60s and several people may have
      it open. Without a cache that is a request storm against a free API that
      owes us nothing.
   3. NEVER FAILING THE CALLER. Enrichment is decoration. If DexScreener is
      slow or down the signals still have to render — so every failure path
      returns "no extra data" rather than an error.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const BASE = 'https://api.dexscreener.com/latest/dex/tokens/';
const BATCH = 30;                  // the endpoint's documented ceiling
const TTL_MS = 90 * 1000;          // a logo does not change; price does
const MAX_CACHE = 4000;

const cache = new Map();           // mint -> { at, data }

function fresh(mint) {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return null;
}

function remember(mint, data) {
  // Bounded, oldest-first. An unbounded Map here is a slow memory leak in a
  // long-running server, and this one is fed by user-supplied mint lists.
  if (cache.size >= MAX_CACHE) {
    const drop = Math.ceil(MAX_CACHE * 0.2);
    let i = 0;
    for (const k of cache.keys()) { cache.delete(k); if (++i >= drop) break; }
  }
  cache.set(mint, { at: Date.now(), data });
}

/* One token can have many pairs. The one that matters is the deepest — that is
   where price is real and where a buyer would actually land. */
function bestPair(pairs) {
  return pairs.reduce((best, p) => {
    const l = Number((p.liquidity && p.liquidity.usd) || 0);
    const bl = best ? Number((best.liquidity && best.liquidity.usd) || 0) : -1;
    return l > bl ? p : best;
  }, null);
}

function shape(pair) {
  if (!pair) return null;
  const info = pair.info || {};
  const socials = Array.isArray(info.socials) ? info.socials : [];
  const websites = Array.isArray(info.websites) ? info.websites : [];
  const has = (t) => socials.some((s) => String(s.type || '').toLowerCase() === t);

  return {
    symbol: (pair.baseToken && pair.baseToken.symbol) || null,
    image: info.imageUrl || null,
    // Typed flags rather than raw arrays: the UI filters on "has a Twitter",
    // and asking every caller to re-derive that from a list invites drift.
    socials: {
      any: socials.length > 0 || websites.length > 0,
      twitter: has('twitter'),
      telegram: has('telegram'),
      discord: has('discord'),
      website: websites.length > 0,
      links: socials.slice(0, 4).map((s) => ({ type: s.type, url: s.url })),
      site: (websites[0] && websites[0].url) || null,
    },
    priceUsd: Number(pair.priceUsd) || null,
    liq: Number((pair.liquidity && pair.liquidity.usd) || 0),
    vol24: Number((pair.volume && pair.volume.h24) || 0),
    vol1h: Number((pair.volume && pair.volume.h1) || 0),
    chg24: Number((pair.priceChange && pair.priceChange.h24) || 0),
    chg1h: Number((pair.priceChange && pair.priceChange.h1) || 0),
    pairUrl: pair.url || null,
    dex: pair.dexId || null,
    pairCreatedAt: pair.pairCreatedAt || null,
  };
}

async function fetchBatch(mints) {
  const out = {};
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);   // never hang a page render
    const res = await fetch(BASE + mints.join(','), { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('dexscreener ' + res.status);
    const data = await res.json();

    const byMint = {};
    for (const p of (data.pairs || [])) {
      const addr = p.baseToken && p.baseToken.address;
      if (!addr) continue;
      (byMint[addr] = byMint[addr] || []).push(p);
    }
    for (const m of mints) {
      const shaped = shape(bestPair(byMint[m] || []));
      out[m] = shaped;
      remember(m, shaped);       // cache misses too, so a dud is not re-fetched
    }
  } catch (e) {
    // Decoration must never break the page. Record nothing so the next call
    // retries rather than caching a failure as "this coin has no logo".
    console.warn('[token-enrich] batch failed:', e && e.message);
    for (const m of mints) if (!(m in out)) out[m] = null;
  }
  return out;
}

/**
 * Enrich a list of mints. Returns { <mint>: {image, socials, ...} | null }.
 * Never throws.
 *
 * @param {string[]} mints
 * @param {number} [cap] hard ceiling on how many to look up (default 120)
 */
async function enrich(mints, cap) {
  const list = [...new Set((mints || []).filter(Boolean))].slice(0, cap || 120);
  const out = {};
  const need = [];

  for (const m of list) {
    const hit = fresh(m);
    if (hit !== null) out[m] = hit; else need.push(m);
  }
  if (!need.length) return out;

  const batches = [];
  for (let i = 0; i < need.length; i += BATCH) batches.push(need.slice(i, i + BATCH));

  // Parallel, but bounded by the cap above — ten batches at most by default.
  const results = await Promise.all(batches.map(fetchBatch));
  for (const r of results) Object.assign(out, r);
  return out;
}

/* The coins currently being pushed hardest on DexScreener, with logos and
   socials already attached.

   Source is /token-boosts/top/v1, NOT the pair search. Two earlier attempts
   were wrong in instructive ways:
     · /latest/dex/pairs/solana?limit=25 is not an endpoint — it returns an
       HTML error page, which is why /top-dex answered "Unexpected token '<'".
     · /latest/dex/search?q=SOL returns whatever matches the string, so the top
       result was SOL itself on $128k volume, almost none of it with a logo.

   The boosts feed is the honest answer to "what is being promoted right now",
   carries `icon` and `links` natively, and doubles as the boost signal the
   product already cares about. Live price and volume are layered on top from
   the token endpoint, so a boosted coin with no liquidity is still visible as
   exactly that rather than silently omitted. */
async function topDex(limit) {
  const n = Math.max(1, Math.min(Number(limit) || 25, 50));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('dexscreener ' + res.status);

    const raw = await res.json();
    const rows = (Array.isArray(raw) ? raw : (raw.data || []))
      .filter((x) => x && x.chainId === 'solana' && x.tokenAddress)
      .slice(0, n);
    if (!rows.length) return [];

    // live numbers for the same set, in one batched call
    const live = await enrich(rows.map((r) => r.tokenAddress), n);

    return rows.map((r, i) => {
      const L = live[r.tokenAddress] || {};
      const links = Array.isArray(r.links) ? r.links : [];
      const typed = (t) => links.some((l) => String(l.type || l.label || '').toLowerCase() === t);
      const site = links.find((l) => !l.type && l.url) || null;

      return {
        rank: i + 1,
        mint: r.tokenAddress,
        symbol: (L.symbol) || '',
        name: String(r.description || '').split(String.fromCharCode(10))[0].slice(0, 60),
        boost: Number(r.totalAmount) || 0,
        // the boost feed's own icon wins — it is the artwork the team paid to show
        image: r.icon || L.image || null,
        socials: {
          any: links.length > 0 || !!(L.socials && L.socials.any),
          twitter: typed('twitter') || !!(L.socials && L.socials.twitter),
          telegram: typed('telegram') || !!(L.socials && L.socials.telegram),
          discord: typed('discord') || !!(L.socials && L.socials.discord),
          website: !!site || !!(L.socials && L.socials.website),
          links: links.slice(0, 4).map((l) => ({ type: l.type || 'website', url: l.url })),
          site: site ? site.url : (L.socials && L.socials.site) || null,
        },
        priceUsd: L.priceUsd || null,
        liq: L.liq || 0,
        vol24: L.vol24 || 0,
        vol1h: L.vol1h || 0,
        chg24: L.chg24 || 0,
        chg1h: L.chg1h || 0,
        pairUrl: L.pairUrl || r.url || null,
        dex: L.dex || null,
      };
    });
  } catch (e) {
    console.warn('[token-enrich] topDex failed:', e && e.message);
    return [];
  }
}

module.exports = { enrich, topDex, _cacheSize: () => cache.size };

```

## THE ROUTES

`_GROK-EXPORT/01-PRO-SIGNALS/pro-signals-routes.js` — 370 lines

```javascript
/**
 * Pro Signals API Routes
 * - GET /api/pro-signals/feed — filtered signals based on user preferences
 * - GET /api/pro-signals/top-dex — top 25 DEX tokens
 * - GET /api/pro-signals/tracked-wallets — what tracked wallets are holding
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Load calls from tg-calls.json
function loadCalls() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tg-calls.json'), 'utf8'));
    return data.calls || [];
  } catch {
    return [];
  }
}

// Load user preferences (strictness, risk filter, etc)
function loadUserPrefs(userId) {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'user-prefs.json'), 'utf8'));
    return prefs[userId] || { strictness: 50, riskFilter: 'all', showQuickXs: true };
  } catch {
    return { strictness: 50, riskFilter: 'all', showQuickXs: true };
  }
}

// Save user preferences (only affects their dashboard, not TG)
function saveUserPrefs(userId, prefs) {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'user-prefs.json'), 'utf8')) || {};
    all[userId] = prefs;
    fs.writeFileSync(path.join(DATA_DIR, 'user-prefs.json'), JSON.stringify(all, null, 2));
  } catch (e) {
    console.error('Error saving prefs:', e);
  }
}

// Categorize call by risk
function getRiskTier(call) {
  const source = call.source || '';
  if (source.includes('pre')) return 'risky'; // pre-bond
  if (source.includes('bond') || source.includes('seed')) return 'medium'; // bonded, seed
  if (source.includes('trending') || source.includes('gecko')) return 'safe'; // established
  return 'medium';
}

// Check if call hit 2x+ quickly
function isQuickXs(call) {
  if (!call.peakMult) return false;
  const now = Date.now();
  const age = now - call.ts;
  const dayMs = 24 * 60 * 60 * 1000;
  return call.peakMult >= 2 && age < dayMs * 7; // Hit 2x+ within 7 days
}

// Filter calls by strictness (0-100 scale)
// 0-25: only established (safe)
// 25-50: established + medium
// 50-75: all risk tiers
// 75-100: all + more signals
function filterByStrictness(calls, strictness) {
  return calls.filter(call => {
    const risk = getRiskTier(call);
    if (strictness < 25) return risk === 'safe';
    if (strictness < 50) return ['safe', 'medium'].includes(risk);
    return true; // all tiers
  });
}

// Score calls for "bid recommendations" (top opportunities)
function scoreCall(call) {
  let score = 0;

  // Current multiplier (higher is better, capped at 10x for scoring)
  if (call.curMult) {
    score += Math.min(call.curMult, 10) * 5;
  }

  // Peak potential (unrealized gains - biggest weight)
  if (call.peakMult && call.curMult) {
    const potential = call.peakMult / call.curMult;
    score += Math.min(potential, 10) * 15; // Heavy weight on upside
  }

  // Milestones hit (momentum indicator)
  if (call.milestones) {
    score += call.milestones.length * 3;
  }

  // Volume trend (if available)
  if (call.volumeTrend && call.volumeTrend > 1) {
    score += Math.min(call.volumeTrend * 5, 20);
  }

  // Holder growth (if available)
  if (call.holderGrowth && call.holderGrowth > 1) {
    score += Math.min(call.holderGrowth * 3, 15);
  }

  // Recency (fresher signals are hotter)
  const age = Date.now() - call.ts;
  const dayMs = 24 * 60 * 60 * 1000;
  if (age < dayMs * 1) score += 25; // < 1 day
  else if (age < dayMs * 3) score += 18; // < 3 days
  else if (age < dayMs * 7) score += 12; // < 1 week
  else if (age < dayMs * 30) score += 6;

  // Risk bonus (risky calls have higher upside, should be rewarded)
  const risk = getRiskTier(call);
  if (risk === 'risky') score += 10;
  else if (risk === 'medium') score += 5;

  // Liquidity bonus (established pools have better entry/exit)
  if (call.liquidity && call.liquidity > 50000) {
    score += Math.min(call.liquidity / 100000, 8);
  }

  // Anti-rug factor (if verified safe)
  if (call.verified || call.safeScore > 80) {
    score += 8;
  }

  return Math.round(score);
}

// ─── API ENDPOINTS ───────────────────────────────────────────

// GET /api/pro-signals/feed — filtered signals
router.get('/feed', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'guest';
    const { strictness, riskFilter, showQuickXs } = req.query;

    // Load user prefs or use query params
    let prefs = loadUserPrefs(userId);
    if (strictness !== undefined) prefs.strictness = parseInt(strictness);
    if (riskFilter !== undefined) prefs.riskFilter = riskFilter;
    if (showQuickXs !== undefined) prefs.showQuickXs = showQuickXs === 'true';

    // Load and filter calls
    let calls = loadCalls();

    // Apply strictness filter
    calls = filterByStrictness(calls, prefs.strictness);

    // Apply risk filter
    if (prefs.riskFilter !== 'all') {
      calls = calls.filter(c => getRiskTier(c) === prefs.riskFilter);
    }

    // Sort by score (bid opportunities first)
    calls = calls.map(c => ({
      ...c,
      score: scoreCall(c),
      riskTier: getRiskTier(c),
      isQuickXs: isQuickXs(c),
    })).sort((a, b) => b.score - a.score);

    res.json({
      userId,
      prefs,
      count: calls.length,
      calls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pro-signals/prefs — save user preferences
router.post('/prefs', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'guest';
    const { strictness, riskFilter, showQuickXs } = req.body;

    const prefs = { strictness, riskFilter, showQuickXs };
    saveUserPrefs(userId, prefs);

    res.json({ success: true, prefs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/top-dex — top 25 DEX tokens
/* GET /top-dex?limit=25 — the busiest Solana pairs right now, WITH logos and
   socials. The previous implementation called /latest/dex/pairs/solana?limit=25,
   which is not a DexScreener endpoint — it returned an HTML error page, so the
   route answered "Unexpected token '<'". See lib/token-enrich.js. */
router.get('/top-dex', async (req, res) => {
  try {
    const enrich = require('../lib/token-enrich');
    const pairs = await enrich.topDex(req.query.limit);
    res.json({ source: 'dexscreener', count: pairs.length, pairs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /enrich { mints: [...] } — logos, socials and live pair data.
   POST because a 300-mint list does not belong in a query string. Enrichment
   is decoration: a failure returns nulls, never an error, so the signals
   still render when DexScreener is down. */
router.post('/enrich', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const enrich = require('../lib/token-enrich');
    const mints = (req.body && req.body.mints) || [];
    if (!Array.isArray(mints)) return res.status(400).json({ ok: false, error: 'mints must be an array' });
    res.json({ ok: true, tokens: await enrich.enrich(mints, req.body.cap) });
  } catch (err) {
    res.json({ ok: false, tokens: {} });
  }
});

// GET /api/pro-signals/tracked-wallets — what tracked wallets hold
router.get('/tracked-wallets', (req, res) => {
  try {
    const { timeframe } = req.query; // 24h, 48h, 1w, 1m, etc

    // Load tracked wallets from config
    let wallets = [];
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wallets.json'), 'utf8'));
      wallets = cfg.wallets || [];
    } catch {
      wallets = [];
    }

    res.json({
      timeframe: timeframe || '24h',
      wallets,
      count: wallets.length,
      note: 'Holdings data would come from Helius/Solana RPC in production',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/bid-recommendations — top 5 calls to bid on
router.get('/bid-recommendations', (req, res) => {
  try {
    let calls = loadCalls()
      .map(c => ({
        ...c,
        score: scoreCall(c),
        riskTier: getRiskTier(c),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({
      recommendations: calls,
      note: 'Top 5 opportunities based on score (potential, momentum, risk)',
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/hot — streaming hot signals (real-time feel)
router.get('/hot', (req, res) => {
  try {
    const calls = loadCalls()
      .map(c => ({
        ...c,
        score: scoreCall(c),
        riskTier: getRiskTier(c),
      }))
      .filter(c => {
        // Only very recent, high-scoring signals
        const age = Date.now() - c.ts;
        const dayMs = 24 * 60 * 60 * 1000;
        return age < dayMs && c.score > 50;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json({
      hot: calls,
      count: calls.length,
      updated: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pro-signals/broadcast — broadcast signal to TG + store
router.post('/broadcast', async (req, res) => {
  try {
    const { symbol, score, riskTier, action } = req.body;

    if (!symbol || score === undefined) {
      return res.json({ status: 'error', message: 'Missing symbol or score' });
    }

    // Format for Telegram
    const emoji = action === 'long' ? '📈' : action === 'short' ? '📉' : '⚡';
    const riskEmoji = riskTier === 'risky' ? '⚠️' : riskTier === 'medium' ? '⏰' : '✅';
    const content = `${emoji} *ZEROX SIGNAL* ${riskEmoji}

*${symbol}*
Score: \`${score}\`
Risk: ${riskTier}
Action: ${action.toUpperCase()}

Posted: ${new Date().toLocaleString()}`;

    // Post to Telegram via social API
    const socialRes = await fetch('http://localhost:3000/api/social/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        content
      })
    }).catch(() => ({ json: async () => ({ status: 'error' }) }));

    const posted = await socialRes.json();

    // Store broadcast in history
    const broadcasts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'broadcasts.json'), 'utf8').catch(() => '[]') || '[]');
    broadcasts.unshift({
      symbol,
      score,
      riskTier,
      action,
      posted: posted.status === 'sent',
      timestamp: Date.now()
    });
    try {
      fs.writeFileSync(path.join(DATA_DIR, 'broadcasts.json'), JSON.stringify(broadcasts.slice(0, 100)));
    } catch (e) {}

    res.json({
      status: 'broadcast',
      symbol,
      score,
      posted: posted.status === 'sent'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/history — broadcast history
router.get('/history', (req, res) => {
  try {
    const broadcasts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'broadcasts.json'), 'utf8') || '[]');
    res.json({
      history: broadcasts.slice(0, 50),
      count: broadcasts.length
    });
  } catch (err) {
    res.json({ history: [], count: 0 });
  }
});

module.exports = router;

```
