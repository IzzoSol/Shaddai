/**
 * ZEROX Market Intelligence - Signal Categories & Chart View
 * Pre-Bond | Almost Bond | Migrated
 * Click cards to view live charts
 */

let _currentSignal = null;

// Render signal card — uses premium cinematic styling with trading strategies
function renderSignalCard(signal, category) {
  if (typeof createCinematicCard === 'function') {
    return createCinematicCard(signal, category);
  }

  // Fallback to basic card if premium JS not loaded
  const riskColor = signal.riskTier === 'risky' ? '#ff6b35' : signal.riskTier === 'medium' ? '#ffc84a' : '#00ff9c';
  const riskEmoji = signal.riskTier === 'risky' ? '🔥' : signal.riskTier === 'medium' ? '⏰' : '✅';

  return `
    <div onclick="openChartModal(${JSON.stringify(signal).replace(/"/g, '&quot;')})"
      style="background:linear-gradient(135deg,rgba(255,107,53,0.1),rgba(232,160,32,0.05));border:2px solid ${riskColor};border-radius:8px;padding:16px;cursor:pointer;transition:all .2s;min-height:140px;display:flex;flex-direction:column">

      <!-- Header: Symbol + Score -->
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
        <div>
          <div style="font-size:20px;font-weight:900;color:var(--text);letter-spacing:.5px">${signal.symbol}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px">Entry FDV: $${(signal.entryFdv || 0).toLocaleString()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:900;color:${riskColor}">${riskEmoji} ${signal.riskTier}</div>
          <div style="font-size:13px;font-weight:800;color:var(--P);text-shadow:0 0 8px rgba(232,160,32,.4)">SCORE ${Math.round(signal.score || 0)}</div>
        </div>
      </div>

      <!-- Key Metrics: Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:11px">
        <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;border-left:2px solid var(--S)">
          <div style="color:var(--muted);font-size:8px;font-weight:700">CURRENT</div>
          <div style="color:var(--S);font-weight:800;margin-top:2px">${signal.curMult ? signal.curMult.toFixed(2)+'×' : '—'}</div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;border-left:2px solid #ffc84a">
          <div style="color:var(--muted);font-size:8px;font-weight:700">PEAK</div>
          <div style="color:#ffc84a;font-weight:800;margin-top:2px">${signal.peakMult ? signal.peakMult.toFixed(2)+'×' : '—'}</div>
        </div>
      </div>

      <!-- Bundles & Snipers -->
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;font-size:9px">
        ${signal.bundleSize ? `<div style="background:rgba(176,127,255,0.2);border:1px solid rgba(176,127,255,0.4);color:#b07fff;padding:4px 8px;border-radius:3px;font-weight:700">📦 BUNDLE ${(signal.bundleSize/1000).toFixed(1)}K</div>` : ''}
        ${signal.sniperCount ? `<div style="background:rgba(255,107,53,0.2);border:1px solid rgba(255,107,53,0.4);color:#ff6b35;padding:4px 8px;border-radius:3px;font-weight:700">🎯 SNIPERS ${signal.sniperCount}</div>` : ''}
        ${signal.holders ? `<div style="background:rgba(34,211,238,0.2);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;padding:4px 8px;border-radius:3px;font-weight:700">👥 ${signal.holders.toLocaleString()}</div>` : ''}
        ${signal.liquidity ? `<div style="background:rgba(0,255,156,0.2);border:1px solid rgba(0,255,156,0.4);color:var(--S);padding:4px 8px;border-radius:3px;font-weight:700">💧 $${(signal.liquidity/1000).toFixed(0)}K</div>` : ''}
      </div>

      <!-- Footer: Click hint -->
      <div style="flex:1;display:flex;align-items:flex-end">
        <div style="font-size:8px;color:var(--muted);font-style:italic">Click for strategy & chart →</div>
      </div>
    </div>
  `;
}

// Load Pre-Bond signals
async function loadPreBond() {
  try {
    const res = await fetch('/api/pro-signals/feed?strictness=50&riskFilter=risky', {
      headers: { 'x-user-id': _userId }
    });
    const data = await res.json();

    if (data.calls && data.calls.length > 0) {
      const html = data.calls.slice(0, 12).map(s => renderSignalCard(s, 'pre-bond')).join('');
      document.getElementById('preBond-list').innerHTML = html;
    } else {
      document.getElementById('preBond-list').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:10px">No pre-bond signals found</div>';
    }
  } catch (e) {
    console.error('Pre-bond load error:', e);
  }
}

// Load Almost Bond signals
async function loadAlmostBond() {
  try {
    const res = await fetch('/api/pro-signals/feed?strictness=50&riskFilter=medium', {
      headers: { 'x-user-id': _userId }
    });
    const data = await res.json();

    if (data.calls && data.calls.length > 0) {
      const html = data.calls.slice(0, 12).map(s => renderSignalCard(s, 'almost-bond')).join('');
      document.getElementById('almostBond-list').innerHTML = html;
    } else {
      document.getElementById('almostBond-list').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:10px">No almost-bond signals found</div>';
    }
  } catch (e) {
    console.error('Almost-bond load error:', e);
  }
}

// Load Migrated (safe) signals
async function loadMigrated() {
  try {
    const res = await fetch('/api/pro-signals/feed?strictness=50&riskFilter=safe', {
      headers: { 'x-user-id': _userId }
    });
    const data = await res.json();

    if (data.calls && data.calls.length > 0) {
      const html = data.calls.slice(0, 12).map(s => renderSignalCard(s, 'migrated')).join('');
      document.getElementById('migrated-list').innerHTML = html;
    } else {
      document.getElementById('migrated-list').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:10px">No migrated signals found</div>';
    }
  } catch (e) {
    console.error('Migrated load error:', e);
  }
}

// Open chart modal — prioritize cinematic modal if available
function openChartModal(signal) {
  _currentSignal = signal;

  // Use premium cinematic modal if available
  if (typeof openCinematicModal === 'function') {
    openCinematicModal(signal);
    return;
  }

  // Fallback to basic modal
  document.getElementById('modalSymbol').textContent = signal.symbol;
  document.getElementById('modalMeta').textContent = `Risk: ${signal.riskTier} · Score: ${Math.round(signal.score || 0)}`;

  // Set DexScreener link
  document.getElementById('dexLink').href = `https://dexscreener.com/solana/${signal.mint || signal.symbol}`;

  // Render metrics grid
  const metricsHtml = `
    <div style="background:var(--cgrd);border:1px solid var(--border);padding:12px;border-radius:6px">
      <div style="font-size:9px;color:var(--muted);font-weight:700;margin-bottom:6px">CURRENT METRICS</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
        <div><div style="color:var(--muted);font-size:8px">Current Mult</div><div style="color:var(--S);font-weight:800;margin-top:2px">${signal.curMult ? signal.curMult.toFixed(2)+'×' : '—'}</div></div>
        <div><div style="color:var(--muted);font-size:8px">Peak Mult</div><div style="color:#ffc84a;font-weight:800;margin-top:2px">${signal.peakMult ? signal.peakMult.toFixed(2)+'×' : '—'}</div></div>
        <div><div style="color:var(--muted);font-size:8px">Entry FDV</div><div style="color:var(--C);font-weight:800;margin-top:2px">$${(signal.entryFdv || 0).toLocaleString()}</div></div>
        <div><div style="color:var(--muted);font-size:8px">Holders</div><div style="color:var(--text);font-weight:800;margin-top:2px">${(signal.holders || 0).toLocaleString()}</div></div>
      </div>
    </div>

    <div style="background:var(--cgrd);border:1px solid var(--border);padding:12px;border-radius:6px;margin-top:8px">
      <div style="font-size:9px;color:var(--muted);font-weight:700;margin-bottom:6px">SUPPLY & LIQUIDITY</div>
      <div style="display:flex;justify-content:space-between;font-size:10px">
        <div><div style="color:var(--muted);font-size:8px">Liquidity</div><div style="color:var(--S);font-weight:800;margin-top:2px">$${(signal.liquidity || 0).toLocaleString()}</div></div>
        <div><div style="color:var(--muted);font-size:8px">Volume 24H</div><div style="color:var(--text);font-weight:800;margin-top:2px">$${(signal.volume24h || 0).toLocaleString()}</div></div>
      </div>
    </div>
  `;
  document.getElementById('modalMetrics').innerHTML = metricsHtml;

  // Render details
  const detailsHtml = `
    <div style="font-family:'Syncopate',sans-serif;font-size:9px;letter-spacing:2px;color:var(--P);font-weight:800;margin-bottom:12px">SIGNAL ANALYSIS</div>
    <div style="font-size:9px;color:var(--text2);line-height:1.6">
      <div style="margin-bottom:8px"><span style="color:var(--muted)">Source:</span> ${signal.source || '—'}</div>
      <div style="margin-bottom:8px"><span style="color:var(--muted)">Risk Tier:</span> <span style="color:${signal.riskTier === 'risky' ? '#ff6b35' : signal.riskTier === 'medium' ? '#ffc84a' : 'var(--S)'};font-weight:700">${signal.riskTier.toUpperCase()}</span></div>
      ${signal.bundleSize ? `<div style="margin-bottom:8px"><span style="color:var(--muted)">Bundle Size:</span> ${(signal.bundleSize/1000).toFixed(1)}K tokens</div>` : ''}
      ${signal.sniperCount ? `<div style="margin-bottom:8px"><span style="color:var(--muted)">Snipers:</span> ${signal.sniperCount} wallets</div>` : ''}
      <div style="margin-top:12px;padding:10px;background:rgba(0,255,156,0.1);border-left:2px solid var(--S);border-radius:3px">
        <div style="font-size:8px;color:var(--muted);font-weight:700;margin-bottom:4px">💡 OPPORTUNITY</div>
        <div>Potential: ${signal.peakMult && signal.curMult ? Math.round(((signal.peakMult / signal.curMult) - 1) * 100)}% upside remaining</div>
      </div>
    </div>
  `;
  document.getElementById('modalDetails').innerHTML = detailsHtml;

  // Show modal
  document.getElementById('chartModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

// Close chart modal
function closeChartModal() {
  document.getElementById('chartModal').style.display = 'none';
  document.body.style.overflow = 'auto';
  _currentSignal = null;
}

// Hook tab switching
const origSwitch = window.switchTab;
window.switchTab = function(tab, el) {
  origSwitch(tab, el);
  setTimeout(() => {
    if (tab === 'sig') loadPreBond();
    else if (tab === 'almost') loadAlmostBond();
    else if (tab === 'migrated') loadMigrated();
  }, 50);
};

// Load on init
if (ok()) {
  setTimeout(() => {
    loadPreBond();
    loadAlmostBond();
    loadMigrated();
  }, 1000);
}
