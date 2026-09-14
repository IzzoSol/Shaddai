'use strict';
/**
 * backend/hall/routes.js — the Hall's HTTP surface (Shaddai-Arcade issue
 * #2), merged into the main Shaddai backend 2026-09-14 (owner decision:
 * Shaddai-Arcade/Royale was never actually deployed as its own site, and
 * the plan was always for Shaddai to be "the main big build" including the
 * Hall, the arcade games, and Lens/cutscenes -- not a separate public repo
 * talking to this one over HTTP). Mounted additively in
 * server-production.js -- does not touch any existing route.
 *
 * WHAT CHANGED IN THE MERGE (vs. the old Shaddai-Arcade repo's hall/routes.js):
 *   - economy-client.js / lens-client.js (HTTP + SHADDAI_ADMIN_TOKEN,
 *     SHADDAI_MAIN_BACKEND_URL) are GONE. Sparks and Lens are now called
 *     directly, in-process (../economy-service, ./lens-adapter) -- no
 *     network hop, no shared secret between "two services" because there
 *     is only one service now. ARCADE_SERVICE_TOKEN still exists in
 *     ../economy-routes.js / ../lens-routes.js for any OTHER external
 *     caller, but the Hall itself no longer needs it.
 *   - skillplay-client.js (HTTP call to the separate shaddai-games repo)
 *     is GONE. hall/packs/arcade-bet.js now calls ../lib/arcade-sim.js
 *     directly -- this repo's own existing in-house game simulator, not an
 *     external service. SHADDAI_GAMES_URL is no longer needed.
 *   - Sparks is no longer "optional in local/dev" -- the economy service is
 *     always in-process now, so it's always available (the old
 *     sparksConfigured() gate existed only because the cross-service
 *     credential might not be set yet; that whole class of problem is gone).
 *
 * SCOPE DECISION carried over unchanged from the original build (flagged,
 * not hidden): this ships one seat playing one hand against the house,
 * reachable via the mailbox for ANY seat kind (human via direct move
 * submission below, shaddai/grok/webhook/paybox via ./mailbox.js). True
 * "two seats, two concurrent hands, one shared dealer" needs
 * ./packs/blackjack.js extended from a single `state.player` to a
 * `state.players[seatId]` map -- a real next increment, not done here.
 *
 *   POST /api/casino/seats                  -- register a seat
 *   GET  /api/casino/seats/:id              -- fetch a seat
 *   POST /api/casino/tables                 -- start a match { seatId, wager, pack? }
 *   GET  /api/casino/tables                 -- public room listing (spectator-safe)
 *   POST /api/casino/tables/:id/move        -- human move { move }
 *   GET  /api/casino/tables/:id             -- current state + legal buttons (own match only)
 *   POST /api/casino/tables/:id/lens        -- Lens button: Sparks-gated Fal clip (issue #5)
 *   GET  /api/casino/tables/:id/lens/:jobId -- clip status poll (for inline video)
 */

const express = require('express');
const json = express.json();

const seatsStore = require('./seats');
const mailbox = require('./mailbox');
const { InsufficientFundsError, getDefault: getDefaultEconomy } = require('../economy-service');
const defaultLens = require('./lens-adapter');

// Shaddai-Arcade issue #10: pack registry, no longer hardcoded to blackjack.
// hall/packs/index.js documents each pack's key -> module.
const PACKS = require('./packs');

function newMatchId() {
  return 'match_' + require('crypto').randomBytes(6).toString('hex');
}

/**
 * createHallRouter(deps) -- factory, matching this repo's own convention
 * (economy-routes.js / lens-routes.js both export createRouter(serviceOverride)
 * rather than a bare router) so tests can inject an isolated economy
 * instance instead of touching the real dev-store singleton, exactly like
 * economy-service.test.js's own EconomyService({store: new DevFileStore(tmp)})
 * pattern. Production mounting (server-production.js) calls this with no
 * args and gets the real singletons.
 */
function createHallRouter(deps) {
  const economy = (deps && deps.economySvc) || getDefaultEconomy();
  const lens = (deps && deps.lens) || defaultLens;
  const router = express.Router();
  const matches = new Map(); // matchId -> { pack, seatId, state, sparksApplied }

router.post('/api/casino/seats', json, (req, res) => {
  try {
    const seat = seatsStore.createSeat(req.body || {});
    res.json({ ok: true, seat });
  } catch (e) {
    res.status(e.status || 400).json({ ok: false, error: e.message });
  }
});

router.get('/api/casino/seats/:id', (req, res) => {
  const seat = seatsStore.getSeat(req.params.id);
  if (!seat) return res.status(404).json({ ok: false, error: 'seat not found' });
  res.json({ ok: true, seat });
});

/**
 * Drives non-human turns forward until it's a human's turn or the hand is
 * over. Shared by table creation (seat[0] might not be human) and move
 * submission (the seat that just moved might not have been the last one).
 */
async function driveToHumanOrEnd(match) {
  const pack = PACKS[match.pack];
  for (let guard = 0; guard < 20; guard++) { // hard cap: never spin forever on a bug
    const legal = pack.getButtons(match.state);
    if (!legal.length) break; // player-turn is over; resolve() will report the result
    const seat = seatsStore.getSeat(match.state.turnSeat);
    if (!seat || seat.kind === 'human') break; // wait for the human's own move POST
    const payload = {
      match_id: match.id, pack: match.pack, you: seat.id, mode: 'versus',
      sparks: match.wager, legal, state: match.state, timeout_ms: 15000,
    };
    const defaultMoveId = legal.some((b) => b.id === 'stand') ? 'stand' : legal[0].id;
    const { moveId } = await mailbox.dispatchTurn(seat, payload, defaultMoveId);
    match.state = pack.applyMove(match.state, seat.id, moveId);
  }
}

// Shaddai-Arcade issue #4 (ZEROX Sparks pricing sanity): docs/HALL-PHASE1-
// SPEC.md's own economy section calls for "grant(winner.sparks_ref, pot -
// rake, 'hall:bj_win', idemKey); rake goes to a house account (house:hall)".
// 4% is a starting default, not a final pricing decision -- ZEROX's call
// whether to keep it, tune it, or drop it in favor of relying on
// blackjack's own structural house edge. Flooring the rake (never rounding
// up) means a small pot never rakes to zero payout.
const RAKE_BPS = 400; // 4.00%, in basis points so the math stays integer-exact
const HOUSE_ACCOUNT = 'house:hall'; // per HALL-PHASE1-SPEC.md's own naming

async function settleIfDone(match) {
  const pack = PACKS[match.pack];
  const { score, nextState, events } = pack.resolve(match.state);
  match.state = nextState;
  if (events && events.length) match.lastEvents = events; // Lens button reads this -- see /lens below
  if (score === null || match.sparksApplied) return { score, events }; // not over yet, or already paid
  match.sparksApplied = true;
  match.settledAt = Date.now(); // room listing keeps a finished match visible briefly -- see GET /api/casino/tables

  const seat = seatsStore.getSeat(match.seatId);
  const sparksRef = seat && seat.sparks_ref;
  if (!sparksRef) return { score, events, sparksSkipped: true }; // seat has no Sparks identity -- nothing to settle
  try {
    if (score === 'win' || score === 'blackjack') {
      const pot = match.wager * 2;
      const rake = Math.floor((pot * RAKE_BPS) / 10000);
      const payout = pot - rake;
      await economy.grant(sparksRef, payout, `hall:${match.pack}_win:${score}`, `${match.id}:payout`);
      if (rake > 0) {
        // Best-effort: a rake-credit failure must never undo or block the
        // player's own payout above, which has already succeeded.
        try {
          await economy.grant(HOUSE_ACCOUNT, rake, `hall:${match.pack}_rake`, `${match.id}:rake`);
        } catch (e) { /* house accounting gap, not a player-facing failure -- swallow */ }
      }
    } else if (score === 'push') {
      await economy.grant(sparksRef, match.wager, `hall:${match.pack}_push_refund`, `${match.id}:refund`);
    }
    // 'lose' / 'bust': buy-in already spent at table creation, no further movement.
  } catch (e) {
    return { score, events, sparksError: e.message };
  }
  return { score, events };
}

router.post('/api/casino/tables', json, async (req, res) => {
  try {
    const { seatId, wager, pack: packKey } = req.body || {};
    const seat = seatsStore.getSeat(seatId);
    if (!seat) return res.status(404).json({ ok: false, error: 'seat not found' });
    const amount = Number(wager) || 0;

    const pack = PACKS[packKey || 'blackjack'];
    if (!pack) {
      return res.status(400).json({ ok: false, error: `unknown pack '${packKey}' (valid: ${Object.keys(PACKS).join(', ')})` });
    }

    if (amount > 0 && seat.sparks_ref) {
      try {
        await economy.spend(seat.sparks_ref, amount, `hall:${pack.key || 'bj'}_buyin`, `${seatId}:${Date.now()}`);
      } catch (e) {
        const status = e instanceof InsufficientFundsError ? 402 : (e.status || 502);
        return res.status(status).json({ ok: false, error: e.message, code: e.code });
      }
    }

    // await, not a bare call: arcade-bet packs' startMatch stays sync today,
    // but awaiting a non-promise is a harmless no-op and keeps this call
    // site correct if a future pack's startMatch ever needs to be async.
    let state = await pack.startMatch([seatId], amount);
    const match = { id: newMatchId(), pack: pack.key || 'blackjack', seatId, wager: amount, state, sparksApplied: false };
    matches.set(match.id, match);

    await driveToHumanOrEnd(match);
    const settlement = await settleIfDone(match);

    res.json({
      ok: true, matchId: match.id, state: match.state,
      legal: pack.getButtons(match.state), settlement,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/casino/tables -- public room listing (Shaddai-Arcade #6 mobile
 * follow-up). Lets the /hall room show REAL occupied/empty tables (which
 * pack currently has a live, unsettled match, and who/what is seated) to
 * ANY caller -- there is no per-viewer auth model in this repo yet, so this
 * intentionally returns only pack.summary()'s spectator-safe view, never
 * the full match state (no deck, no dealer hole card pre-reveal, no
 * pre-settlement bet outcome). A settled match stays listed for a short
 * grace window (below) so a room visitor can see a chair's result -- e.g. a
 * bot that just finished a hand -- then drops off. Honest limitation, not a
 * live-multiplayer feature: a non-human seat's whole hand resolves
 * synchronously inside the POST /api/casino/tables call that creates it
 * (./mailbox.js's dispatchTurn round-trip runs inline, not in the
 * background), so no other visitor can ever observe a bot actually
 * mid-decision -- only before (not yet listed) or after (this grace
 * window). Real "walk past a table where a bot is visibly still deciding"
 * needs dispatchTurn to run asynchronously against a persistent table/seat
 * session -- a real next increment, not built here.
 */
const SETTLED_GRACE_MS = 20000;
router.get('/api/casino/tables', (req, res) => {
  const tables = [];
  for (const match of matches.values()) {
    if (match.state.phase === 'settled' && match.sparksApplied) {
      if (!match.settledAt || Date.now() - match.settledAt > SETTLED_GRACE_MS) continue;
    }
    const pack = PACKS[match.pack];
    const seat = seatsStore.getSeat(match.seatId);
    tables.push({
      matchId: match.id,
      pack: match.pack,
      wager: match.wager,
      seatKind: seat ? seat.kind : null,
      seatName: seat ? seat.display_name : null,
      ...(pack.summary ? pack.summary(match.state) : {}),
    });
    if (tables.length >= 20) break;
  }
  res.json({ ok: true, tables });
});

router.get('/api/casino/tables/:id', (req, res) => {
  const match = matches.get(req.params.id);
  if (!match) return res.status(404).json({ ok: false, error: 'match not found' });
  const pack = PACKS[match.pack];
  res.json({ ok: true, matchId: match.id, state: match.state, legal: pack.getButtons(match.state) });
});

router.post('/api/casino/tables/:id/move', json, async (req, res) => {
  try {
    const match = matches.get(req.params.id);
    if (!match) return res.status(404).json({ ok: false, error: 'match not found' });
    const pack = PACKS[match.pack];
    const seat = seatsStore.getSeat(match.state.turnSeat);
    if (!seat || seat.kind !== 'human') {
      return res.status(409).json({ ok: false, error: 'it is not a human seat\'s turn' });
    }
    const { move } = req.body || {};
    match.state = pack.applyMove(match.state, seat.id, move); // throws on illegal move -> 400 below

    await driveToHumanOrEnd(match);
    const settlement = await settleIfDone(match);

    res.json({ ok: true, state: match.state, legal: pack.getButtons(match.state), settlement });
  } catch (e) {
    const status = /illegal move|not this seat/i.test(e.message) ? 400 : 500;
    res.status(status).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/casino/tables/:id/lens -- the spec's "Lens button on bust/win"
 * (acceptance item 6, docs/HALL-PHASE1-SPEC.md). User/frontend-triggered,
 * NOT automatic: a clip costs real Sparks, so it only fires when someone
 * actually asks for one, and only for a hand that just produced a filmable
 * event (bust/win/blackjack -- see blackjack.js's resolve()). Idempotency
 * key is derived from the match id so a double-click/retry replays the
 * same spend instead of charging twice (matches the spec's own testing
 * note: "no double-spend on retry").
 */
router.post('/api/casino/tables/:id/lens', json, async (req, res) => {
  try {
    const match = matches.get(req.params.id);
    if (!match) return res.status(404).json({ ok: false, error: 'match not found' });
    if (!match.lastEvents || !match.lastEvents.length) {
      return res.status(409).json({ ok: false, error: 'no filmable event on this table yet' });
    }
    const seat = seatsStore.getSeat(match.seatId);
    if (!seat || !seat.sparks_ref) {
      return res.status(400).json({ ok: false, error: 'seat has no sparks_ref' });
    }
    const eventType = match.lastEvents[match.lastEvents.length - 1]; // most recent filmable event
    const idempotencyKey = `${match.id}:lens`;
    try {
      const clip = await lens.requestClip(seat.sparks_ref, {
        matchId: match.id, pack: match.pack, eventType, seatId: seat.id,
      }, idempotencyKey);
      return res.json({ ok: true, ...clip });
    } catch (e) {
      const status = e instanceof InsufficientFundsError ? 402 : (e.status || 502);
      return res.status(status).json({ ok: false, error: e.message, code: e.code });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/casino/tables/:id/lens/:jobId -- clip status poll (Shaddai-Arcade
 * #6 mobile follow-up: inline Lens video needs to know when the async Fal
 * job is done and what its videoUrl is).
 */
router.get('/api/casino/tables/:id/lens/:jobId', async (req, res) => {
  try {
    const status = await lens.getClipStatus(req.params.jobId);
    return res.json({ ok: true, ...status });
  } catch (e) {
    return res.status(e.status || 502).json({ ok: false, error: e.message, code: e.code });
  }
});

  return router;
}

module.exports = createHallRouter;
module.exports.createRouter = createHallRouter;
