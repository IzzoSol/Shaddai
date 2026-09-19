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
const { createEarnStore } = require('./earn-store');
const { createArcadeArt } = require('./arcade-art');

// softAuth with the repo's standard dev fallback (see realms-routes.js): a
// real session → verified req.userId; off-production, the x-user-id header
// (or 'local' when absent) so the whole arcade works on localhost.
let softAuthMiddleware = (req, _res, next) => { req.userId = req.headers['x-user-id'] || 'local'; next(); };
try { const ag = require('../auth-guard'); if (ag.softAuth) softAuthMiddleware = ag.softAuth; } catch (_) {}

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
  // When a custom economy is injected but no lens is, bind the REAL lens to
  // it (createLens) so Lens spends/refunds land on the same store that
  // settlements use -- otherwise the lens would hit the default economy
  // (balance 0 → a confusing 402). See lens-adapter.js's createLens note.
  const lens = deps && deps.lens
    ? deps.lens
    : (deps && deps.economySvc ? defaultLens.createLens({ economy }) : defaultLens);
  const earn = (deps && deps.earn) || createEarnStore();
  const art = (deps && deps.arcadeArt) || createArcadeArt();
  const router = express.Router();
  const matches = new Map(); // matchId -> { pack, seatId, state, sparksApplied }
  const lensJobs = new Map(); // opaque jobId -> fal status_url (kept server-side: a raw
                              // https:// URL can't ride the :jobId path segment below)

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

/**
 * Locks in bot picks for packs with NO turnSeat (simultaneous-pick packs
 * like skate.js -- both seats pick blind, there's no "whose turn is it").
 * driveToHumanOrEnd above is a no-op for these (match.state.turnSeat is
 * undefined -> getSeat(undefined) -> null -> breaks immediately), which is
 * correct for skate's OWN move but leaves the bot seat's blind pick
 * unsubmitted forever. This walks match.state.seats (a field every
 * minSeats>1 pack must expose) and has any non-human seat that hasn't
 * picked yet submit one immediately -- bots don't need to see the human's
 * pick since it's hidden until resolve() anyway. Guarded to `minSeats > 1`
 * so single-seat packs (blackjack, arcade-bet) are never touched by this.
 */
async function driveBotPicks(match) {
  const pack = PACKS[match.pack];
  if (!pack || (pack.minSeats || 1) <= 1) return;
  for (let guard = 0; guard < 4; guard++) { // hard cap: never spin forever on a bug
    if (match.state.phase !== 'picking') break;
    const seatIds = match.state.seats || [];
    const pendingId = seatIds.find((id) => {
      const s = seatsStore.getSeat(id);
      return s && s.kind !== 'human' && !(match.state.picks && match.state.picks[id]);
    });
    if (!pendingId) break;
    const seat = seatsStore.getSeat(pendingId);
    const legal = pack.getButtons(match.state);
    if (!legal.length) break;
    const payload = {
      match_id: match.id, pack: match.pack, you: seat.id, mode: 'versus',
      sparks: match.wager, legal, state: match.state, timeout_ms: 15000,
    };
    const { moveId } = await mailbox.dispatchTurn(seat, payload, legal[0].id);
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

  // Earn loop: win/bj grants a win-of-the-day + streak bonus on top of the
  // pot. Best-effort and idempotent per uid+match (`hall:win:<uid>:<matchId>`)
  // so a ledger hiccup can never hold up a settlement that already paid out,
  // and a replayed settle can never double-mint.
  let earnBonus = null;
  if (score === 'win' || score === 'blackjack') {
    try {
      const r = earn.recordWin(sparksRef, match.id);
      if (r.bonus > 0 && !r.replayed) {
        const g = await economy.grant(sparksRef, r.bonus, 'hall:win_streak', `hall:win:${sparksRef}:${match.id}`);
        earnBonus = { bonus: r.bonus, streak: r.streak, balance: g.balance };
      }
    } catch (_) { /* earn gap is never player-blocking */ }
  }
  return { score, events, ...(earnBonus ? { earn: earnBonus } : {}) };
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

    // minSeats > 1 (skate.js) -- no real matchmaking exists yet, so fill the
    // remaining seat(s) with an in-process 'bot' seat (random legal move,
    // zero cost/latency) rather than blocking the whole pack on a feature
    // that isn't built. A real second human/agent seat is a future increment.
    const seatIds = [seatId];
    const minSeats = pack.minSeats || 1;
    for (let i = seatIds.length; i < minSeats; i++) {
      const bot = seatsStore.createSeat({ kind: 'bot', display_name: 'House Skater' });
      seatIds.push(bot.id);
    }

    // await, not a bare call: arcade-bet packs' startMatch stays sync today,
    // but awaiting a non-promise is a harmless no-op and keeps this call
    // site correct if a future pack's startMatch ever needs to be async.
    let state = await pack.startMatch(seatIds, amount);
    // BUG FIX: this used to be `pack.key || 'blackjack'` -- only arcade-bet
    // packs ever set `.key`, so every OTHER pack (blackjack, skate) silently
    // mislabeled its own match as 'blackjack' here, which then made every
    // later lookup (GET /tables/:id, /move, settleIfDone) resolve the WRONG
    // pack module. Falling back to the requested `packKey` (what the caller
    // actually asked for) instead of straight to 'blackjack' fixes this for
    // every existing key-less pack, not just skate.
    const match = { id: newMatchId(), pack: pack.key || packKey || 'blackjack', seatId, wager: amount, state, sparksApplied: false };
    matches.set(match.id, match);

    await driveToHumanOrEnd(match);
    await driveBotPicks(match); // lock the bot's blind pick for round 0 (skate-style packs)
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
    // turnSeat-based packs (blackjack, arcade-bet) name whose move is due;
    // simultaneous-pick packs (skate.js, minSeats>1) have no turnSeat -- the
    // human seat is just the one that created this table (match.seatId).
    const seat = seatsStore.getSeat(match.state.turnSeat || match.seatId);
    if (!seat || seat.kind !== 'human') {
      return res.status(409).json({ ok: false, error: 'it is not a human seat\'s turn' });
    }
    const { move } = req.body || {};
    match.state = pack.applyMove(match.state, seat.id, move); // throws on illegal move -> 400 below

    await driveToHumanOrEnd(match);
    const settlement = await settleIfDone(match);
    await driveBotPicks(match); // lock the bot's blind pick for the round resolve() just opened

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
    if (!seat) {
      return res.status(400).json({ ok: false, error: 'seat not found' });
    }
    // A human seat without an explicit wallet still gets a Lens attempt against
    // its own derived ref -- economy.spend returns 0-balance → 402 with the
    // plain "need 15 Sparks" message, instead of a confusing 400 dead-end.
    const sparksRef = seat.sparks_ref || (seat.kind === 'human' ? `u:seat:${seat.id}` : null);
    if (!sparksRef) {
      return res.status(400).json({ ok: false, error: 'seat has no sparks wallet' });
    }
    const eventType = match.lastEvents[match.lastEvents.length - 1]; // most recent filmable event
    const idempotencyKey = `${match.id}:lens`;
    try {
      const clip = await lens.requestClip(sparksRef, {
        matchId: match.id, pack: match.pack, eventType, seatId: seat.id,
        // Arcade-bet reveals are scored for a specific council agent on a
        // specific game -- hand those through so the cutscene can star the
        // player's pick (see lens-rewriter's AGENT_FACES / GAME_RESULTS).
        agent: match.state.pick || undefined,
        game: match.state.game || undefined,
      }, idempotencyKey);
      const statusUrl = clip.jobId;
      if (typeof statusUrl === 'string' && /^https?:\/\//.test(statusUrl)) {
        clip.jobId = 'lens_' + require('crypto').randomBytes(6).toString('hex');
        lensJobs.set(clip.jobId, statusUrl);
      }
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
    const job = lensJobs.get(req.params.jobId);
    const statusUrl = job || req.params.jobId; // opaque key → stored URL; bare URL works too
    const status = await lens.getClipStatus(statusUrl);
    return res.json({ ok: true, ...status });
  } catch (e) {
    return res.status(e.status || 502).json({ ok: false, error: e.message, code: e.code });
  }
});

  /**
 * GET /api/casino/profile — the player's Sparks wallet: balance plus a one-time
 * starter faucet so a brand-new account can sit at a table and cut a Lens clip
 * immediately. The starter is idempotent on its own key (arcade:starter:<uid>),
 * so repeated calls replay it — a player who spends down to 0 is NOT re-seeded.
 * Identity comes from softAuth; the anonymous 'local' dev default is rejected so
 * nobody can mint an unowned starter.
 */
const STARTER_SPARKS = 75;
router.get('/api/casino/profile', softAuthMiddleware, async (req, res) => {
  if (!req.userId || req.userId === 'local') {
    return res.status(401).json({ ok: false, error: 'sign in to use your Sparks wallet', needSignIn: true });
  }
  try {
    const g = await economy.grant(req.userId, STARTER_SPARKS, 'arcade:starter', `arcade:starter:${req.userId}`);
    const balance = await economy.getBalance(req.userId);
    res.json({
      ok: true, wallet: req.userId, balance,
      starter: { amount: STARTER_SPARKS, given: !g.replayed },
      earn: earn.get(req.userId),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/casino/earn/daily — claim today's daily Sparks faucet (25).
 * Fail-safe order: the economy grant (idempotent on `hall:daily:<uid>:<day>`)
 * lands FIRST, then the ledger marks the day. If a request dies between the
 * two, the retry replays the grant (same key) instead of double-paying or
 * locking the player out — the grant key, not the ledger, is the real gate.
 */
router.get('/api/casino/earn/daily', softAuthMiddleware, async (req, res) => {
  if (!req.userId || req.userId === 'local') {
    return res.status(401).json({ ok: false, error: 'sign in to claim daily Sparks', needSignIn: true });
  }
  try {
    const uid = req.userId;
    const today = earn.dayKey();
    const g = await economy.grant(uid, earn.DAILY_SPARKS, 'hall:daily', `hall:daily:${uid}:${today}`);
    earn.claimDaily(uid); // mark the day after the money is safely in
    res.json({ ok: true, claimed: !g.replayed, replayed: !!g.replayed, day: today, amount: earn.DAILY_SPARKS, balance: g.balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/casino/art?pack&w&h&raw — HF-powered menu art (owner directive:
 * fal for characters/cut scenes, HF key for menus). Deterministic locked
 * prompts, an on-disk PNG cache, and a keyless Pollinations fallback so a
 * banner always renders. raw=1 streams the PNG bytes (for <img src>); otherwise
 * JSON with a self-URL. See arcade-art.js for the security notes.
 */
router.get('/api/casino/art', async (req, res) => {
  try {
    const pack = String(req.query.pack || 'hall');
    if (!(pack in art.ART_PROMPTS)) {
      return res.status(404).json({ ok: false, error: `unknown art pack '${pack}' (valid: ${Object.keys(art.ART_PROMPTS).join(', ')})` });
    }
    const out = await art.get(pack, { width: req.query.w, height: req.query.h });
    if (out.notFound) return res.status(404).json({ ok: false, error: 'unknown art pack' });
    if (out.error) return res.status(502).json({ ok: false, error: out.error });
    if (out.buffer) {
      if (String(req.query.raw) === '1') {
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return res.type('image/png').send(out.buffer);
      }
      return res.json({
        ok: true,
        url: `/api/casino/art?pack=${encodeURIComponent(pack)}&w=${out.width}&h=${out.height}&raw=1`,
        width: out.width, height: out.height, provider: out.provider,
      });
    }
    if (out.url) {
      return res.json({ ok: true, url: out.url, width: out.width, height: out.height, provider: out.provider });
    }
    return res.status(502).json({ ok: false, error: 'no image produced' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

  return router;
}

module.exports = createHallRouter;
module.exports.createRouter = createHallRouter;
