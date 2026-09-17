/* ============================================================
   AUTH & TUTORIAL LOGIC – instant browser entry, TL gate,
   tutorial flags, and soft token gate (post‑TL10)
   ============================================================ */
(() => {
  // ----- Helper: read/write TL and tutorial state -----
  const TL_KEY = 'totalLevel';
  const TUTORIAL_KEY = 'tutorialDone';
  const STATE = {
    get TL() { return parseInt(localStorage.getItem(TL_KEY) || '0'); },
    set TL(v) { localStorage.setItem(TL_KEY, v.toString()); },
    get TutorialDone() { return localStorage.getItem(TUTORIAL_KEY) === '1'; },
    set TutorialDone(v) { localStorage.setItem(TUTORIAL_KEY, v ? '1' : '0'); }
  };

  // ----- Soft token gate – allow free play only if TL < 10 -----
  const CAN_PLAY = () => STATE.TL < 10;

  // ----- UI: Sign‑In Modal (simple semitransparent overlay) -----
  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'signModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.7);
      display:flex; align-items:center; justify-content:center;
      z-index:9999; color:#fff; font-family:sans-serif;
    `;
    modal.innerHTML = `
      <div style="background:#1a1a1a;padding:24px;border-radius:12px;">
        <h2>Welcome to SHADDAI</h2>
        <p>Enter a name to start (guest mode available).</p>
        <input id="playerName" placeholder="Your name (≤16 chars)" maxlength="16"
               style="width:100%;margin:12px 0;padding:8px;font-size:14px;">
        <button id="enterBtn"
                style="margin-top:8px;padding:10px 20px;background:#00e5a0;color:#04121a;">
          Continue
        </button>
        <div id="tlNotice" style="margin-top:8px;font-size:12px;color:#8fb2a4;"></div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('enterBtn').onclick = () => {
      const name = document.getElementById('playerName').value.trim() || 'Guest';
      const tl = STATE.TL;
      document.getElementById('tlNotice').textContent = 
        `Current Total Level: ${tl} ${tl >= 10 ? '(soft token gate active)' : '(free to play)'}`;
      if (!CAN_PLAY() && tl >= 10 && !localStorage.getItem('spentSpend')) {
        // first time hitting the gate – ask if they want to continue as guest
        if (!confirm('You have reached TL 10 – soft token gate active. Continue as guest?')) return;
      }
      // Record guest flag so we don’t prompt repeatedly
      localStorage.setItem('spentSpend', '1');
      STATE.TL = tl; // ensure persistence
      STATE.TutorialDone = false; // reset tutorial on new login
      modal.remove();
      startGame(name);
    };
    return modal;
  }

  // ----- Tutorial flow helper -----
  function completeStep(step) {
    // Example: step 1 = move, step 2 = interact, etc.
    // Mark as done by storing a simple object
    const steps = JSON.parse(localStorage.getItem('tutorialSteps') || '{}');
    steps[step] = true;
    localStorage.setItem('tutorialSteps', JSON.stringify(steps));
  }
  function isStepDone(step) { return !!JSON.parse(localStorage.getItem('tutorialSteps') || '{}')[step]; }

  // ----- Main game bootstrap -----
  const modal = createModal();
  document.body.appendChild(modal);

  // If player already signed in and tutorial completed, skip modal
  if (STATE.TutorialDone) {
    const name = localStorage.getItem('playerName') || 'Guest';
    modal.remove();
    startGame(name);
  }

  // ---------------------------------------------------------
  // Game entry point – called after auth
  // ---------------------------------------------------------
  function startGame(playerName) {
    // Save name for later use
    localStorage.setItem('playerName', playerName);

    // Show tutorial UI if not done
    if (!STATE.TutorialDone) {
      // Dispatch tutorial steps (simple sequence)
      const steps = ['move', 'interact', 'skill', 'market', 'housing'];
      let i = 0;
      const showNext = () => {
        if (i >= steps.length) {
          // All steps done – finalize
          STATE.TutorialDone = true;
          localStorage.setItem('tutorialDone', '1');
          // Continue to hub
          location.hash = '/hub';
          return;
        }
        // Simple tutorial popup (could be a separate module)
        alert(`Step ${i+1}: ${steps[i]}\nControls: use WASD to move, E to interact.`);
        completeStep(steps[i]);
        i++;
        setTimeout(showNext, 2000);
      };
      showNext();
    } else {
      // Tutorial already finished – just continue
      location.hash = '/hub';
    }
  }
})();