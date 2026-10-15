# ZEROX skill: Smart-Money entry models (checklist form)

Source: owner's sheet `smc-entry-models-source.jpg` (found 2026-10-02). Four named setups, each a checklist a chart must satisfy before ZEROX calls it a valid setup. **Education and signal-scoring only: ZEROX never executes trades; every call carries a risk note and "not financial advice".**

Glossary: **HTF** higher timeframe · **POI** point of interest (an HTF level or zone price reacts to) · **Liquidity grab** price sweeps a prior low/high to take stops, then reverses · **MSS / shift** market structure shift: price breaks the last swing in the new direction · **FVG** fair value gap (3-candle imbalance) · **PVG** price value gap (same idea) · **IDM** internal liquidity (a minor sweep inside the move) · **Discount** the lower half of the range (for longs) · **OTE** optimal trade entry, the 0.62 to 0.79 retracement band · **R:R** risk to reward.

| # | Model | Checklist (all boxes = valid) | Shape in one line |
|---|---|---|---|
| 1 | HTF POI + shift + FVG | HTF liquidity grab · HTF POI · MSS (shift) · FVG/PVG in discount · good R:R | price sweeps lows into an HTF POI, shifts structure up, retraces into the FVG, then runs |
| 2 | HTF POI + shift + IDM + FVG | HTF liquidity grab · HTF POI · MSS (shift) · IDM (internal liquidity swept) · FVG in discount · good R:R | as Model 1, with one extra small sweep (IDM) before the entry FVG |
| 3 | HTF POI + shift + FVG + OTE | HTF liquidity grab · HTF POI · MSS (shift) · FVG in discount inside the 0.62 to 0.79 retracement · good R:R | Model 1 but the FVG must sit in the OTE band of the shift leg |
| 4 | Box setup | Consolidation range (the "original consolidation") · HTF liquidity grab (sweep below the box) · HTF POI · retest of the original consolidation · good R:R | range forms, price sweeps below it into an HTF POI, reclaims, retests the box, then runs |

## How ZEROX uses it (to wire later)
- `scoreSetup(candles, model)` returns `{ model, checks:{name:bool}, score: n/5, verdict:'valid'|'forming'|'no' }`; a model is `valid` only when every box is true.
- Signals feed: attach the model name + which boxes are ticked to each call; show it in the Navi SIGNALS tab and the TG signals bot.
- Teaching mode: Academy lesson per model (diagram, checklist, three real examples, three failures); quiz = "which box is missing?".
- Guardrails: paper-trade only (`zerox_paper_open`), always show invalidation level (the sweep low) and R:R; no auto-execution, ever.

## Data (machine readable)
```json
{
  "models": [
    { "id": "m1-poi-shift-fvg", "name": "HTF POI + shift + FVG", "checks": ["htf_liquidity_grab", "htf_poi", "mss_shift", "fvg_in_discount", "good_rr"] },
    { "id": "m2-poi-shift-idm-fvg", "name": "HTF POI + shift + IDM + FVG", "checks": ["htf_liquidity_grab", "htf_poi", "mss_shift", "idm_swept", "fvg_in_discount", "good_rr"] },
    { "id": "m3-poi-shift-fvg-ote", "name": "HTF POI + shift + FVG + OTE", "checks": ["htf_liquidity_grab", "htf_poi", "mss_shift", "fvg_in_ote_062_079", "good_rr"] },
    { "id": "m4-box", "name": "Box setup", "checks": ["consolidation_range", "htf_liquidity_grab", "htf_poi", "retest_of_consolidation", "good_rr"] }
  ]
}
```
