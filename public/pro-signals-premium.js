/**
 * ZEROX PREMIUM — Cinematic Trading Strategy UI
 * Swivels, rotating angles, lighting effects, deep strategies
 * Top-tier visual design with professional trading logic
 */

// TRADING STRATEGIES DATABASE
const TRADING_STRATEGIES = {
  'risky': {
    name: 'Pre-Bond Aggressive',
    emoji: '🚀',
    entryStrategy: 'Early sniping (first 5 min of pool creation)',
    takeProfitLevels: [
      { mult: 2, pct: '25%', action: 'Take partial profits' },
      { mult: 5, pct: '50%', action: 'Secure core position' },
      { mult: 10, pct: '75%', action: 'Let winners run' }
    ],
    stopLoss: '30% below entry (high volatility)',
    riskReward: '1:5 to 1:10',
    holdDuration: '1-7 days',
    tips: [
      'Watch for rug pulls: check team, renounce check',
      'Monitor bundle size: larger = safer',
      'Track sniper activity: organic growth is good',
      'Exit on exchange listings: volatility spikes'
    ]
  },
  'medium': {
    name: 'Swing Trade',
    emoji: '⚡',
    entryStrategy: 'After bonding stabilizes, momentum builds',
    takeProfitLevels: [
      { mult: 1.5, pct: '20%', action: 'Quick scalp' },
      { mult: 3, pct: '50%', action: 'Half position' },
      { mult: 5, pct: '100%', action: 'Trail stop loss' }
    ],
    stopLoss: '15% below entry (swings support)',
    riskReward: '1:3 to 1:5',
    holdDuration: '3-14 days',
    tips: [
      'Wait for consolidation after pump',
      'Watch volume profile for support',
      'Join after bonding completes',
      'Set alerts at key resistance levels'
    ]
  },
  'safe': {
    name: 'Position Building',
    emoji: '🏆',
    entryStrategy: 'Dollar-cost average over 2-4 weeks',
    takeProfitLevels: [
      { mult: 1.2, pct: '10%', action: 'Rebalance' },
      { mult: 2, pct: '30%', action: 'Lock in gains' },
      { mult: 3, pct: '70%', action: 'Hold for 6+ months' }
    ],
    stopLoss: '25% below average cost',
    riskReward: '1:2 to 1:3',
    holdDuration: '1-12 months',
    tips: [
      'DCA reduces timing risk',
      'Established projects tend to consolidate',
      'Look for ecosystem growth',
      'Consider governance participation'
    ]
  }
};

// Create cinematic card with strategy
function createCinematicCard(signal, category) {
  const strategy = TRADING_STRATEGIES[signal.riskTier];
  const riskColor = signal.riskTier === 'risky' ? '#ff6b35' : signal.riskTier === 'medium' ? '#ffc84a' : '#00ff9c';

  return `
    <div class="cinematic-card" onclick="openCinematicModal(${JSON.stringify(signal).replace(/"/g, '&quot;')})"
      style="
        background: linear-gradient(135deg, rgba(255,107,53,0.08), rgba(232,160,32,0.04));
        border: 2px solid ${riskColor};
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all .3s cubic-bezier(.34,.69,.77,.78);
        position: relative;
        overflow: hidden;
        min-height: 180px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 16px rgba(0,0,0,.2);
      "
      onmouseenter="this.style.transform='translateY(-8px)';this.style.boxShadow='0 12px 32px rgba(255,107,53,.3)';this.style.borderColor=this.style.borderColor.replace(/rgba/,'rgba')"
      onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.2)'">

      <!-- Animated Background Gradient -->
      <div style="position:absolute;inset:0;opacity:0.3;background:repeating-linear-gradient(90deg,transparent,transparent 2px,${riskColor} 2px,${riskColor} 4px);animation:scanlines 3s linear infinite;pointer-events:none;z-index:0"></div>

      <!-- Content Container -->
      <div style="position:relative;z-index:1">
        <!-- Header with Strategy -->
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
          <div>
            <div style="font-size:28px;font-weight:900;color:var(--text);letter-spacing:1px;margin-bottom:2px">${signal.symbol}</div>
            <div style="font-size:10px;color:${riskColor};font-weight:700;letter-spacing:1px">${strategy.emoji} ${strategy.name}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:900;color:var(--P);text-shadow:0 0 12px rgba(232,160,32,.6)">
              ${Math.round(signal.score || 0)}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">SCORE</div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="background:rgba(0,255,156,0.15);border:1px solid rgba(0,255,156,0.3);padding:10px;border-radius:6px">
            <div style="font-size:8px;color:var(--muted);font-weight:700;letter-spacing:0.5px;margin-bottom:3px">CURRENT</div>
            <div style="font-size:16px;font-weight:900;color:var(--S)">${signal.curMult ? signal.curMult.toFixed(2)+'×' : '—'}</div>
          </div>
          <div style="background:rgba(255,200,74,0.15);border:1px solid rgba(255,200,74,0.3);padding:10px;border-radius:6px">
            <div style="font-size:8px;color:var(--muted);font-weight:700;letter-spacing:0.5px;margin-bottom:3px">PEAK</div>
            <div style="font-size:16px;font-weight:900;color:#ffc84a">${signal.peakMult ? signal.peakMult.toFixed(2)+'×' : '—'}</div>
          </div>
        </div>

        <!-- Strategy Pills -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          ${signal.bundleSize ? `<span style="background:rgba(176,127,255,0.2);border:1px solid rgba(176,127,255,0.4);color:#b07fff;padding:5px 10px;border-radius:4px;font-size:9px;font-weight:700">📦 BUNDLES</span>` : ''}
          ${signal.sniperCount ? `<span style="background:rgba(255,107,53,0.2);border:1px solid rgba(255,107,53,0.4);color:#ff6b35;padding:5px 10px;border-radius:4px;font-size:9px;font-weight:700">🎯 SNIPERS</span>` : ''}
          <span style="background:rgba(34,211,238,0.2);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;padding:5px 10px;border-radius:4px;font-size:9px;font-weight:700">⏱️ ${strategy.holdDuration}</span>
        </div>

        <!-- CTA -->
        <div style="font-size:9px;color:var(--muted);font-style:italic">
          📊 Click for strategy & chart analysis →
        </div>
      </div>
    </div>
  `;
}

// Cinematic Modal with Full Strategy
function openCinematicModal(signal) {
  const strategy = TRADING_STRATEGIES[signal.riskTier];
  const riskColor = signal.riskTier === 'risky' ? '#ff6b35' : signal.riskTier === 'medium' ? '#ffc84a' : '#00ff9c';

  const html = `
    <style>
      @keyframes scanlines { from { background-position: 0 0; } to { background-position: 0 4px; } }
      @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
      @keyframes glow { 0%, 100% { box-shadow: 0 0 20px ${riskColor}33; } 50% { box-shadow: 0 0 40px ${riskColor}66; } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

      .strategy-section {
        animation: fadeIn 0.6s ease-out;
      }
      .strategy-section:nth-child(2) { animation-delay: 0.1s; }
      .strategy-section:nth-child(3) { animation-delay: 0.2s; }
      .strategy-section:nth-child(4) { animation-delay: 0.3s; }
    </style>

    <div id="cinematicModal" style="position:fixed;inset:0;background:linear-gradient(135deg,rgba(2,4,8,.96),rgba(5,7,16,.98));display:flex;z-index:9999;overflow-y:auto;opacity:0;animation:fadeIn .4s ease-out forwards">
      <div style="max-width:1400px;margin:0 auto;width:100%;padding:40px 20px">

        <!-- HEADER -->
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid var(--border2);animation:slideDown .5s ease-out">
          <div>
            <div style="font-size:48px;font-weight:900;color:var(--text);letter-spacing:1px;line-height:1">${signal.symbol}</div>
            <div style="font-size:14px;color:${riskColor};font-weight:700;letter-spacing:1px;margin-top:8px">${strategy.emoji} ${strategy.name}</div>
          </div>
          <button onclick="closeCinematicModal()"
            style="padding:12px 20px;background:rgba(255,60,42,0.15);border:2px solid rgba(255,60,42,0.4);color:var(--A);cursor:pointer;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:1px;transition:all .2s">
            ✕ CLOSE
          </button>
        </div>

        <!-- MAIN GRID -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:40px">

          <!-- LEFT: CHART & METRICS -->
          <div class="strategy-section">
            <div style="background:linear-gradient(135deg,rgba(255,107,53,0.1),rgba(232,160,32,0.05));border:2px solid ${riskColor};border-radius:12px;padding:24px;height:500px;position:relative;overflow:hidden;box-shadow:0 0 30px ${riskColor}22">
              <div style="position:absolute;inset:0;opacity:0.1;background:repeating-linear-gradient(90deg,transparent,transparent 2px,${riskColor} 2px,${riskColor} 4px);animation:scanlines 3s linear infinite"></div>

              <div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column">
                <div style="font-family:'Syncopate',sans-serif;font-size:12px;letter-spacing:2px;color:${riskColor};font-weight:800;margin-bottom:16px">📈 LIVE CHART</div>

                <div style="flex:1;display:flex;align-items:center;justify-content:center">
                  <div style="text-align:center">
                    <div style="font-size:32px;margin-bottom:12px">📊</div>
                    <div style="font-size:13px;color:var(--text);font-weight:700;margin-bottom:8px">${signal.symbol}</div>
                    <a href="https://dexscreener.com/solana/${signal.mint || signal.symbol}" target="_blank"
                      style="color:${riskColor};text-decoration:none;font-weight:700;font-size:11px;letter-spacing:0.5px">
                      OPEN DEXSCREENER →
                    </a>
                  </div>
                </div>

                <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;font-size:10px;color:var(--muted)">
                  Current: <span style="color:var(--S);font-weight:700">${signal.curMult ? signal.curMult.toFixed(2)+'×' : '—'}</span>
                  • Peak: <span style="color:#ffc84a;font-weight:700">${signal.peakMult ? signal.peakMult.toFixed(2)+'×' : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: STRATEGY -->
          <div class="strategy-section" style="display:flex;flex-direction:column;gap:20px">
            <!-- Entry Strategy -->
            <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:12px;padding:20px">
              <div style="font-family:'Syncopate',sans-serif;font-size:10px;letter-spacing:2px;color:var(--S);font-weight:800;margin-bottom:12px">🎯 ENTRY STRATEGY</div>
              <div style="font-size:12px;color:var(--text2);line-height:1.6">${strategy.entryStrategy}</div>
              <div style="margin-top:12px;padding:12px;background:rgba(0,255,156,0.1);border-left:3px solid var(--S);border-radius:4px;font-size:10px;color:var(--muted)">
                <strong style="color:var(--text)">Risk/Reward:</strong> ${strategy.riskReward}
              </div>
            </div>

            <!-- Take Profit Levels -->
            <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:12px;padding:20px">
              <div style="font-family:'Syncopate',sans-serif;font-size:10px;letter-spacing:2px;color:#ffc84a;font-weight:800;margin-bottom:12px">💰 TAKE PROFIT LEVELS</div>
              <div style="display:flex;flex-direction:column;gap:10px">
                ${strategy.takeProfitLevels.map((level, i) => `
                  <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;border-left:3px solid #ffc84a;display:flex;justify-content:space-between;align-items:center">
                    <div>
                      <div style="font-size:11px;font-weight:700;color:var(--text)">${level.mult}× Multiplier</div>
                      <div style="font-size:9px;color:var(--muted);margin-top:2px">${level.action}</div>
                    </div>
                    <div style="font-size:13px;font-weight:800;color:#ffc84a">${level.pct}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Stop Loss -->
            <div style="background:var(--cgrd);border:1px solid rgba(255,60,42,0.3);border-radius:12px;padding:16px">
              <div style="font-family:'Syncopate',sans-serif;font-size:10px;letter-spacing:2px;color:var(--A);font-weight:800;margin-bottom:8px">🛑 STOP LOSS</div>
              <div style="font-size:13px;font-weight:700;color:var(--text)">${strategy.stopLoss}</div>
              <div style="font-size:9px;color:var(--muted);margin-top:6px">Lock losses to protect capital</div>
            </div>
          </div>
        </div>

        <!-- TIPS SECTION -->
        <div class="strategy-section" style="background:linear-gradient(135deg,rgba(176,127,255,0.1),rgba(139,92,246,0.05));border:1px solid rgba(176,127,255,0.3);border-radius:12px;padding:24px">
          <div style="font-family:'Syncopate',sans-serif;font-size:11px;letter-spacing:2px;color:#b07fff;font-weight:800;margin-bottom:16px">💡 TRADER TIPS</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">
            ${strategy.tips.map(tip => `
              <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid #b07fff;font-size:10px;color:var(--text2);line-height:1.5">
                ${tip}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- QUICK METRICS -->
        <div class="strategy-section" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:40px">
          <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px">ENTRY FDV</div>
            <div style="font-size:18px;font-weight:900;color:var(--C);margin-top:6px">$${(signal.entryFdv || 0).toLocaleString()}</div>
          </div>
          <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px">HOLDERS</div>
            <div style="font-size:18px;font-weight:900;color:var(--S);margin-top:6px">${(signal.holders || 0).toLocaleString()}</div>
          </div>
          <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px">LIQUIDITY</div>
            <div style="font-size:18px;font-weight:900;color:#ffc84a;margin-top:6px">$${(signal.liquidity/1000 || 0).toFixed(0)}K</div>
          </div>
          <div style="background:var(--cgrd);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px">HOLD TIME</div>
            <div style="font-size:18px;font-weight:900;color:${riskColor};margin-top:6px">${strategy.holdDuration}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Inject modal
  let container = document.getElementById('cinematicContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cinematicContainer';
    document.body.appendChild(container);
  }
  container.innerHTML = html;
  document.body.style.overflow = 'hidden';
}

function closeCinematicModal() {
  const container = document.getElementById('cinematicContainer');
  if (container) container.remove();
  document.body.style.overflow = 'auto';
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  .cinematic-card {
    animation: fadeIn 0.5s ease-out;
  }

  .cinematic-card:hover {
    animation: float 2s ease-in-out infinite !important;
  }
`;
document.head.appendChild(style);

// Export for use
window.createCinematicCard = createCinematicCard;
window.openCinematicModal = openCinematicModal;
window.closeCinematicModal = closeCinematicModal;
