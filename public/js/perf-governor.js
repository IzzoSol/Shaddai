'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// FPS-ADAPTIVE QUALITY GOVERNOR — reusable form.
//
// Ported from public/SHADDAI-WORLD-3D.html (~lines 3828-3914), where the same
// algorithm is welded to that file's own renderer/composer/bloom/agentSprites
// globals and so cannot be imported. Here the tier-change effect is a callback:
// callers apply the tier to whatever scene they own.
//
// Algorithm (unchanged from the original):
//   - EMA-smoothed fps estimate, alpha 0.18 (~5-frame reaction), seeded at 55
//     so the first few frames can't trigger a false step-up.
//   - Hard floor: EMA < 30fps drops a tier immediately, no accumulation.
//   - Step down after 0.6s sustained under 50fps; 2.5s cooldown after.
//   - Step up after 6.0s sustained over 58fps; 8.0s cooldown after.
//   - Asymmetric on purpose: drop fast (jank is felt now), recover slowly
//     (avoids oscillating across a tier boundary).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIERS = [
  { name: 'POTATO', pr: 0.55, bloomStr: 0,    cullR: 75   },
  { name: 'LOW',    pr: 0.75, bloomStr: 0,    cullR: 110  },
  { name: 'MEDIUM', pr: 1.0,  bloomStr: 0.14, cullR: 220  },
  { name: 'HIGH',   pr: 1.2,  bloomStr: 0.22, cullR: 360  },
  { name: 'ULTRA',  pr: 1.5,  bloomStr: 0.28, cullR: 9999 },
];

/**
 * Create a quality governor.
 *
 * options.tiers        — optional tier table override (defaults to the 5-tier
 *                        table above, ported verbatim from the 3D world).
 * options.onTierChange — (tierIndex, tier) => void. Called once immediately for
 *                        the starting tier, then on every tier change. This is
 *                        where a caller applies pixelRatio/bloom/cull to its own
 *                        renderer — the governor itself touches no render state.
 *
 * Returns { update(dt), getTier(), tiers }.
 *   update(dt) — call once per animation frame with delta-time in SECONDS.
 *   getTier()  — { index, name, pr, bloomStr, cullR } snapshot.
 */
function createGovernor(options) {
  const opts = options || {};
  const tiers = opts.tiers || DEFAULT_TIERS;
  const onTierChange = typeof opts.onTierChange === 'function' ? opts.onTierChange : function () {};

  const state = {
    tier: 1,      // start at LOW — smooth first impression, climbs within seconds on a fast machine
    fps: 55,      // EMA estimate, seeded to avoid false-fast on the first frames
    below45: 0,   // accumulated seconds under the step-down threshold
    above58: 0,   // accumulated seconds over the step-up threshold
    cooldown: 0,  // seconds until another tier change is allowed
  };

  function applyTier(idx) {
    let i = idx;
    if (i < 0) i = 0;
    if (i >= tiers.length) i = tiers.length - 1;
    state.tier = i;
    onTierChange(i, tiers[i]);
  }

  applyTier(state.tier); // fire once for the starting tier, matching the original's initial apply

  function update(dt) {
    const instantFps = dt > 0 ? 1 / dt : 60;
    state.fps = state.fps * 0.82 + instantFps * 0.18;

    if (state.cooldown > 0) { state.cooldown -= dt; return; }

    // Hard floor: a genuinely bad frame band drops a tier at once.
    if (state.fps < 30 && state.tier > 0) {
      applyTier(state.tier - 1);
      state.below45 = 0; state.above58 = 0; state.cooldown = 2.5;
      return;
    }

    if (state.fps < 50) {
      state.below45 += dt; state.above58 = 0;
      if (state.below45 > 0.6 && state.tier > 0) {
        applyTier(state.tier - 1);
        state.below45 = 0; state.cooldown = 2.5;
      }
    } else {
      state.below45 = Math.max(0, state.below45 - dt * 0.5); // bleed off slowly
    }

    if (state.fps > 58) {
      state.above58 += dt; state.below45 = 0;
      if (state.above58 > 6.0 && state.tier < tiers.length - 1) {
        applyTier(state.tier + 1);
        state.above58 = 0; state.cooldown = 8.0;
      }
    } else {
      state.above58 = Math.max(0, state.above58 - dt * 0.3);
    }
  }

  function getTier() {
    const t = tiers[state.tier];
    return { index: state.tier, name: t.name, pr: t.pr, bloomStr: t.bloomStr, cullR: t.cullR };
  }

  return { update, getTier, tiers };
}

// Dual environment support, WITHOUT an ESM `export` statement.
//
// The plan originally specified a guarded CJS export plus a bare
// `export { createGovernor }`, on the assumption Node/Jest would ignore the
// latter. Verified false: plain `node -e "require(...)"` tolerates it (Node's
// require-ESM support), but Jest's own module runtime throws
// `SyntaxError: Unexpected token 'export'` and the suite cannot load at all.
//
// So: CJS export for Node/Jest, and a `window` global for the browser. Browser
// callers load this with a PLAIN <script src="js/perf-governor.js"></script>
// (not type="module") and read `window.createGovernor` — see brain.html.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createGovernor, DEFAULT_TIERS };
}
if (typeof window !== 'undefined') {
  window.createGovernor = createGovernor;
  window.PERF_GOVERNOR_TIERS = DEFAULT_TIERS;
}
