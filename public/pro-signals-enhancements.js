/**
 * ZEROX Market Intelligence Engine - Signal Enhancements
 * Real-time hot signals, live broadcast, enhanced scoring
 */

// Load hot signals (real-time feel)
async function loadHotSignals(){
  try{
    const res = await fetch('/api/pro-signals/hot', {
      headers: { 'x-user-id': _userId }
    });
    const data = await res.json();

    if(data.hot && data.hot.length > 0){
      const hotHtml = data.hot.map((s, idx) => `
        <div class="sc" style="animation:slideIn ${0.3 + idx * 0.1}s ease-out">
          <div class="stop">
            <div class="sav" style="background:linear-gradient(135deg,#ff6b35,#ffb020);font-size:11px;font-weight:700">🔥</div>
            <div class="ssym" style="color:#ff6b35">${s.symbol}</div>
            <div class="ssp"></div>
            <div class="smlt up">${s.curMult ? s.curMult.toFixed(2)+'×' : '—'}</div>
          </div>
          <div class="smeta">
            <b>SCORE:</b> ${Math.round(s.score)} ·
            <b>RISK:</b> ${s.riskTier.toUpperCase()} ·
            <b>PEAK:</b> ${s.peakMult ? s.peakMult.toFixed(2)+'×' : '—'}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button onclick="broadcastSignal('${s.symbol}', ${s.score}, '${s.riskTier}')"
              style="flex:1;padding:6px;background:rgba(255,107,53,0.2);border:1px solid rgba(255,107,53,0.5);color:#ff6b35;font-size:8px;font-weight:700;cursor:pointer;border-radius:3px">
              📢 BROADCAST
            </button>
          </div>
        </div>
      `).join('');

      const slist = document.getElementById('slist');
      if(slist && !slist.innerHTML.includes('CONNECTING')){
        slist.innerHTML = hotHtml + slist.innerHTML;
      }
    }
  }catch(e){
    console.error('Hot signals error:', e);
  }
}

// Broadcast signal to Telegram + log
async function broadcastSignal(symbol, score, riskTier){
  try{
    const action = score > 70 ? 'strong-buy' : score > 50 ? 'buy' : 'watch';
    const res = await fetch('/api/pro-signals/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, score, riskTier, action })
    });
    const data = await res.json();

    if(data.posted){
      showToast(`📢 ${symbol} signal broadcast to Telegram!`, 'success');
    } else {
      showToast(`Signal scored ${score} but not posted (check TG config)`, 'info');
    }
  }catch(e){
    showToast('Broadcast error: ' + e.message, 'error');
  }
}

// Load broadcast history
async function loadBroadcastHistory(){
  try{
    const res = await fetch('/api/pro-signals/history', {
      headers: { 'x-user-id': _userId }
    });
    const data = await res.json();
    console.log('Recent broadcasts:', data.history.slice(0, 5));
  }catch(e){
    console.error('History error:', e);
  }
}

// Toast notifications
function showToast(msg, type = 'info'){
  let toast = document.getElementById('signal-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'signal-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 18px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;font-size:11px;font-family:"Share Tech Mono",monospace;z-index:9999;max-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.4);animation:slideUp .3s ease-out';
    document.body.appendChild(toast);
  }

  if(type === 'success') toast.style.borderColor = 'rgba(0,255,156,0.5)';
  else if(type === 'error') toast.style.borderColor = 'rgba(255,60,42,0.5)';

  toast.textContent = msg;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => { toast.style.display = 'none'; toast.style.opacity = '1'; }, 300);
  }, 3000);
}

// Auto-refresh hot signals every 5 minutes
setInterval(loadHotSignals, 5 * 60 * 1000);

// Load on init
if(ok()){
  setTimeout(() => {
    loadHotSignals();
    loadBroadcastHistory();
  }, 1000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateX(-20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .sc { animation: slideIn 0.3s ease-out; }
`;
document.head.appendChild(style);
