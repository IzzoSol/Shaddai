# ZEROX Signals Terminal — Call Validation & Risk Scoring System
## Complete Quality Rig & Call Performance Tracking

**Status:** ✅ SHIPPED (commits f6940a6, 81c7105, 2806506, ee89275, b1090c0)  
**Date:** 2026-08-23  
**Components:** Backend validation, PNL tracking, analytics dashboard, source scoring, quality gates

---

## 🎯 SYSTEM OVERVIEW

Every signal that goes through ZEROX now undergoes comprehensive validation and risk assessment:

1. **Pre-Post Validation** — checks FDV gates, rug scores, holder requirements, LP lock status
2. **Risk Scoring** — calculates 0-100 risk score based on on-chain metrics
3. **Viability Scoring** — calculates 0-100 quality score based on source reputation + fundamentals
4. **Call Tracking** — records entry/exit data, multipliers, all metrics
5. **Performance Analytics** — dead coin analysis, win rate tracking, source scoring
6. **Quality Optimization** — dynamic gates based on historical performance

---

## 📊 CALL VALIDATION PIPELINE

### Pre-Posting Checks (`_validateCall` in telegram-signals.js)

Every call passes through comprehensive validation:

```javascript
// FDV gates
✓ Must have entryFdv > minFdv (default $1K)
✓ Must not exceed HARD_FDV_CAP_MAX ($2M trending, $20M max)

// Rug score minimum
✓ rugScore must be ≥ RUG_MIN_SCORE (50 minimum)
✓ Checked via GoPlus + on-chain analysis

// Holder requirements
✓ Minimum holder count (default 100)
✓ Prevents concentrated token holdings

// Distribution quality
✓ Top 10 holders < maxTop10Pct% (55% max)
✓ Rejects insider/dev wallets concentration

// LP lock status
✓ LP must be ≥ 80% locked (if requireLocked=true)
✓ Protects against rug pulls

// Insider/Sniper/Bundler detection
✓ Rejects if insiders present (optional gate)
✓ Rejects if snipers present (optional gate)
✓ Rejects if bundlers present (optional gate)

// Liquidity ratio
✓ Liq/FDV ratio ≥ minLiqRatio (1% minimum)
✓ Prevents illiquid meme tokens

// Age gate
✓ Token must be ≥ 30 seconds old
✓ Rejects fresh mints and honeypots

// Risk score gate
✓ riskScore must be ≤ maxRiskScore (85 max)
✓ Dynamic gate based on fundamentals
```

Returns: `{ pass, reason, reasons[], riskScore, viabilityScore, metrics }`

---

## 🎲 RISK SCORING ALGORITHM

Each call gets a **0-100 risk score** (higher = riskier):

### Baseline: 30 points

### Top 10 Concentration Penalty
- `top10Pct > 50%` → +25 points
- `top10Pct > 40%` → +15 points
- `top10Pct > 30%` → +8 points

### Insider/Sniper Presence
- Each insider (max 5) → +3 points
- Snipers detected → +12 points
- Bundlers detected → +10 points

### LP Lock Status
- `lpPct < 50%` → +20 points (no lock = risky)
- `lpPct < 70%` → +8 points
- `lpPct >= 90%` → -10 points (bonus for heavy lock)

### Liquidity Ratio (liq/FDV)
- `liqRatio < 1%` → +15 points (illiquid)
- `liqRatio < 2%` → +8 points
- `liqRatio > 15%` → -5 points (bonus for good liq)

### Volume Metrics
- `vol24 < $10K` → +10 points (low volume)
- `vol1h/vol24 > 30%` → -5 points (good acceleration)

### Holder Count
- `holders < 100` → +12 points (concentrated)
- `holders < 500` → +6 points
- `holders > 5K` → -5 points (bonus for distribution)

### Final Score
- Capped at 0-100 range
- **Score < 40** = LOW RISK ✅ (APPROVE)
- **Score 40-65** = MEDIUM RISK ⚠️ (CAREFUL)
- **Score > 65** = HIGH RISK 🔴 (REJECT)

---

## ⭐ VIABILITY SCORING ALGORITHM

Each call gets a **0-100 viability score** (higher = better quality signal):

### Baseline: 50 points

### Source Reputation Bonus
- Bonded source → +10 points (proven)
- Pipeline source → +6 points (curated)
- Trending source → +5 points (discovery)
- Boosted source → +3 points (paid)
- Helius source → +4 points (smart money)
- Gecko source → +2 points

### LP Lock Quality
- `lpPct >= 90%` → +15 points (heavily locked)
- `lpPct >= 70%` → +8 points

### Liquidity Quality
- `liqRatio >= 10%` → +12 points (excellent)
- `liqRatio >= 3%` → +6 points (good)

### Holder Diversity
- `holders >= 5K` → +10 points (well distributed)
- `holders >= 1K` → +6 points
- `holders >= 500` → +3 points

### Volume Momentum
- `vol24 >= $100K` → +8 points (strong volume)
- `vol24 >= $50K` → +4 points

### Final Score
- Capped at 0-100 range
- **Score > 70** = EXCELLENT ⭐⭐⭐
- **Score 50-70** = GOOD ⭐⭐
- **Score < 50** = FAIR ⭐

---

## 📋 RECORDED METRICS (Per Call)

Each call recorded to `data/tg-calls.json` now includes:

```javascript
{
  mint,                    // Token address
  chain,                   // blockchain (solana/ethereum/etc)
  name, symbol,           // Token name/symbol
  source,                 // Where signal came from
  entryFdv,              // FDV at call time
  entryPrice,            // Price at call time
  
  // Risk & Quality Scores
  riskScore,             // 0-100 (higher = riskier)
  viabilityScore,        // 0-100 (higher = better)
  
  // On-Chain Metrics
  holders,               // Total holder count
  liq,                   // Liquidity in USD
  vol1h,                 // 1h volume
  vol24,                 // 24h volume
  
  // Distribution Quality
  top10Pct,              // Top 10 holders %
  lpPct,                 // LP locked %
  insiders,              // Number of insider wallets
  bundlers,              // Bundler detected
  snipers,               // Snipers detected
  rugScore,              // GoPlus rug score
  
  // Calculated Ratios
  liqRatio,              // (liq / fdv) * 100
  holderDensity,         // fdv / holders
  vol24Ratio,            // (vol24 / fdv) * 100
  
  // Tracking
  ts,                    // Timestamp called
  peakMult,              // Highest multiplier hit
  curMult,               // Current multiplier
  curFdv,                // Current FDV
  milestones,            // [2x, 5x, 10x achieved]
  closed,                // Dead/closed signal
}
```

---

## 📈 PERFORMANCE ANALYTICS

### Metrics Available (GET `/api/signals/analytics`)

```json
{
  "metrics": {
    "totalCalls": 542,           // All-time signals
    "recentCalls": 100,          // Last 100
    "recent2xCount": 48,         // Hit 2x+ in last 100
    "recent5xCount": 12,         // Hit 5x+ in last 100
    "recent2xRate": "48.0%",     // Win rate %
    "recent5xRate": "12.0%"      // Moon rate %
  },
  "analysis": {
    "deadCount": 87,             // Dead coins (mult < 0.5)
    "winCount": 156,             // Winners (mult >= 2)
    "winRate": "28.8%",          // Overall win rate
    "topFailPatterns": [         // Worst sources
      "trending",
      "pre_bonding"
    ],
    "topWinPatterns": [          // Best sources
      "bonded",
      "pipeline",
      "helius"
    ]
  },
  "sourceScores": {              // 0-100 per source
    "bonded": 72,
    "pipeline": 68,
    "trending": 42,
    "helius": 65,
    "boosted": 38
  }
}
```

### Dead Coin Analysis (`_analyzeDeadCoins`)

Identifies pattern failures:
- Groups failed calls by source
- Calculates source-specific win rates
- Highlights worst/best performers
- Weights recent calls higher

---

## 🎯 DYNAMIC QUALITY GATES

Quality multiplier (`_qualityMult`) adjusts gate strictness:

```javascript
// Base multiplier by time
PEAK_HOUR (20-21h, 14h UTC) → 0.8×  // Loosen 20% (better win rate)
DEAD_HOUR (9h, 13h, 15h, 22h) → 2.0× // Tighten 2× (block bad calls)
WEEKEND → 0.85×                      // Slight loosening
NORMAL → 1.25×                       // Mild tightening

// Dynamic adjustment by win rate
winRate < 25% → mult *= 1.5 (TIGHTEN HARD)
winRate > 40% → mult *= 0.9 (LOOSEN)
```

This means:
- **High win rate windows** → allow more calls
- **Low win rate windows** → require stricter fundamentals
- **Dead hours** → maximum rigor (only best calls)

---

## 🔌 API ENDPOINTS

### Validate a Proposed Call
```
POST /api/signals/validate
Body: { 
  mint, entryFdv, holders, rugScore, lpPct, liq, vol24, 
  insiders, bundlers, snipers, top10Pct, source 
}
Response: { validation, riskScore, viabilityScore, metrics }
```

### Get Performance Analytics
```
GET /api/signals/analytics
Response: { metrics, analysis, sourceScores, generatedAt }
```

### Get Quality Gates Config
```
GET /api/signals/audit
Response: { config: { hardFdvCap, rugMinScore, ageGateSeconds, ... } }
```

### Get Call Details
```
GET /api/signals/token/:mint
Response: { token: { mint, symbol, holders, fdv, multiplier, status, ... } }
```

---

## 🎯 SOURCE QUALITY SCORING

Each source rated 0-100 based on historical 2x+ win rate:

```javascript
sourceScore = (winners / totalCalls) * 100
// Min 15, Max 95 with 3+ call minimum
```

**Example Scores:**
- Bonded (72%) = Score 72 ⭐⭐
- Pipeline (68%) = Score 68 ⭐⭐
- Helius (65%) = Score 65 ⭐
- Trending (42%) = Score 42 ⚠️
- Boosted (38%) = Score 38 🔴

Sources with **score < 50** trigger:
- Stricter FDV caps
- Require higher holder count
- Demand better LP lock %
- May be de-prioritized or disabled

---

## 🔐 QUALITY GATES IN ACTION

**Example 1: Premium Bonded Call**
```
Token: SMASH (bonded source)
FDV: $8K ✓ (within bonded cap)
Holders: 420 ✓ (> 100)
LP: 92% locked ✓ (excellent)
Top 10: 28% ✓ (< 55%)
Rug Score: 78 ✓ (> 50)
Risk Score: 32 ✅ (LOW RISK)
Viability: 71 ⭐⭐ (GOOD)
Status: APPROVE → POST TO CHANNEL
```

**Example 2: Risky Trending Call**
```
Token: RUGPULL (trending source)
FDV: $500K ✗ (exceeds $2M trending cap)
Holders: 45 ✗ (< 100 minimum)
LP: 15% locked ✗ (< 80%)
Top 10: 62% ✗ (> 55%)
Rug Score: 38 ✗ (< 50)
Risk Score: 84 🔴 (HIGH RISK)
Viability: 22 🔴 (POOR)
Status: REJECT → DO NOT POST
```

---

## 📊 INTEGRATION WITH CALL TRACKING

When a call is posted:
1. ✅ Passes validation gate
2. 📝 Gets recorded with all metrics
3. 🔄 Tracker starts monitoring multiplier
4. 📈 Updates performance in real-time
5. 📊 Analytics recalculate next poll cycle
6. 🔄 Quality gates adjust for next batch

---

## 🚀 RECOMMENDED ENHANCEMENTS (Next Iteration)

### Short Term (This Week)
- [ ] Wire HuggingFace image generation for PNL cards (full photo, not SVG)
- [ ] Add whale wallet tracking to risk assessment
- [ ] Time-weighted win rate (recent calls weighted higher)
- [ ] Smart money integration (track smart wallet entries)

### Medium Term (This Month)
- [ ] Machine learning model to predict 2x hits based on entry metrics
- [ ] Sentiment-weighted scoring (Twitter mentions + Discord activity)
- [ ] Multi-chain support (Ethereum, Base, Polygon rug detection)
- [ ] Historical correlation patterns ("this pattern hit 5x 87% of the time")

### Long Term (2026-09)
- [ ] Integration with TensorTrade for ML signal optimization
- [ ] Real-time holder movement tracking (HODL vs panic sellers)
- [ ] Liquidity depth analysis (MEV/sandwich protection)
- [ ] Integration with CCXT for 120+ DEX data sources

---

## 🔥 OPEN SOURCE TOOLS TO INTEGRATE

### High Priority
- **freqtrade** (github.com/freqtrade/freqtrade) — Trading bot with signal backtesting
- **CCXT** (github.com/ccxt/ccxt) — 120+ DEX APIs unified
- **tensortrade** (github.com/tensortrade-org/tensortrade) — ML signal framework

### Medium Priority
- **DeFiHQ/rug-pull-detector** — ML rug detection models
- **Tribler/Tribler** — Token analytics + risk scoring
- **MLflow** — Track model performance across calls

### Reference
- **Phantom SDK** — Token holder analytics
- **Orca Whirlpools** — Solana DeFi analytics

---

## 📝 SUMMARY

**ZEROX Signals Terminal now has:**

✅ Comprehensive pre-post validation checking 12+ gates  
✅ Dual-score system (Risk 0-100, Viability 0-100)  
✅ Call tracking with 25+ metrics per signal  
✅ Dead coin analysis identifying bad sources  
✅ Source quality scoring (0-100 per source)  
✅ Dynamic quality gates based on win rates  
✅ Real-time analytics dashboard  
✅ PNL image generation (master prompt system)  
✅ Performance trending and optimization feedback loop  

**Next: Lock in the best sources, phase out the worst, and watch signal quality improve week-over-week.**

---

**Deployed:** Commits f6940a6, 81c7105, 2806506, ee89275, b1090c0  
**Live at:** https://shaddai-g81x.onrender.com/pro-signals.html
