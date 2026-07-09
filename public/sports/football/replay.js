/**
 * replay.js — Pure match-record → frame-timeline builder. No DOM.
 * Works in Node (module.exports) and browser (window.FootballReplay).
 *
 * buildFrames(matchRecord) -> Frame[]
 *
 * Frame schema:
 * {
 *   t:         number,          // time in seconds (monotonic)
 *   players:   Player[],        // 8 players (4 per team)
 *   ball:      {x,y,z},
 *   field:     { los, down, distance, possession },
 *   scoreA:    number,
 *   scoreB:    number,
 *   caption:   string,
 *   eventType: string,          // raw event type that produced this frame
 *   isKeyFrame:boolean,         // true = event boundary; false = interpolated
 * }
 *
 * Player schema:
 * {
 *   id:          string,
 *   team:        'A'|'B',
 *   role:        string,        // offRole or defRole
 *   name:        string,
 *   portraitCode:string,        // e.g. 'SHADDAI', 'BOT-QB', 'BOT-RB'
 *   x:           number,        // world x (0..53.33)
 *   y:           number,        // world y (0..120, 0=teamA end zone)
 *   z:           number,        // world z (0=ground)
 *   highlight:   boolean,       // actor or target of current event
 * }
 *
 * Field model (internal state between events):
 *   lineOfScrimmage (LOS): 0..100 yard-line (0=teamA goal line, 100=teamB goal line)
 *   down: 1..4
 *   distance: yards to first down
 *   possession: 'A'|'B'
 *   scoreA / scoreB: running scores
 *
 * Interpolation: between consecutive key-frames, we generate ~8 motion frames
 * so the canvas has smooth animation at ~60fps.
 */

'use strict';

// IIFE-wrapped so top-level helpers (FIELD_WIDTH, FIELD_LENGTH ...) do NOT leak
// into the shared browser global scope and collide with projection.js's
// identically-named constants (which threw a redeclaration SyntaxError → the
// whole file aborted → FootballReplay was never defined).
(function (root) {

// ---------- CONSTANTS ----------
const FIELD_WIDTH   = 53.33;   // yards
const FIELD_LENGTH  = 120;     // yards (10 end zone each side)
const EZ_DEPTH      = 10;      // yards per end zone
const INTERPOLATION_STEPS = 8; // motion frames between key-frames

// ---------- FORMATION HELPERS ----------
// Returns [{ dx, dy }] offsets relative to LOS for 4 players in a simple formation.
// Offense spreads in front of LOS; defense spreads behind.
// x: 0..FIELD_WIDTH centred at ~26.67

// Field is 53.33 yds wide, centre at 26.67. Hash/number landmarks at ~18 and ~35.
// Offense lines up AT/behind the LOS (dy<=0 means back from the line toward own
// goal). Defense mirrors on the far side of the LOS (dy>0). These read as a
// sensible spread-formation snapshot rather than scattered dots.
function offensePositions(possession) {
  return [
    { role: 'QB',  dx: 26.67,  dy: -5.5 },  // QB in the pocket, behind centre
    { role: 'RB',  dx: 30.5,   dy: -6.5 },  // RB offset behind QB
    { role: 'WR',  dx: 6.5,    dy: -0.5 },  // split end, left numbers, on the line
    { role: 'TE',  dx: 46.5,   dy: -0.5 },  // flanker, right numbers
  ];
}

function defensePositions() {
  return [
    { role: 'DL',  dx: 24.5,   dy: 1.5 },   // D-line over the ball
    { role: 'LB',  dx: 30.5,   dy: 5.5 },   // linebacker off the line
    { role: 'CB',  dx: 8.0,    dy: 3.0 },   // corner over the left WR
    { role: 'S',   dx: 44.5,   dy: 9.0 },   // safety deep over right
  ];
}

/**
 * Convert LOS (0=teamA goal, 100=teamB goal) + possession side into world-Y for the line of scrimmage.
 * World-Y: 0 = teamA end zone back, 120 = teamB end zone back.
 * Yard 0 = teamA goal line = world-Y 10.
 * Yard 100 = teamB goal line = world-Y 110.
 */
function losToWorldY(los) {
  // los is 0..100, world-y is 10..110
  return EZ_DEPTH + los;
}

/**
 * Place 4 players for one team around the LOS.
 * offenseOrDefense: 'off' | 'def'
 * possession: 'A'|'B' — determines which team attacks toward teamB end zone.
 * teamSide: 'A'|'B'
 */
// Resolve a player's `agent` field (a string name OR an object {id,name,skills})
// to a display-name string. Without this, .slice/.toUpperCase hit an object and
// highlight-matching against event actor names (strings) never matches.
function agentName(a) {
  if (a == null) return 'AGENT';
  if (typeof a === 'string') return a;
  return a.name || a.id || 'AGENT';
}

function placePlayers(lineup, teamSide, possession, los, highlightName) {
  const isOffense = (teamSide === possession);
  const positions = isOffense ? offensePositions(possession) : defensePositions();
  const losY = losToWorldY(los);

  // Direction of attack: team A attacks toward higher world-Y (toward teamB end)
  // team B attacks toward lower world-Y (toward teamA end)
  // If teamA has possession: offense is at losY - offset (QB behind LOS from teamA's perspective)
  // flip if teamB has possession

  return lineup.players.slice(0, 4).map((p, i) => {
    const pos    = positions[i] || positions[positions.length - 1];
    let   worldY = losY;

    if (isOffense) {
      // Offense: QB 5 yards behind LOS, WRs at LOS level
      worldY = (possession === 'A')
        ? losY - Math.abs(pos.dy)   // attacking toward teamB → subtract from higher Y
        : losY + Math.abs(pos.dy);
    } else {
      // Defense: spread in front of LOS (from attacker's direction)
      worldY = (possession === 'A')
        ? losY + Math.abs(pos.dy)
        : losY - Math.abs(pos.dy);
    }

    // Clamp to playable field (10..110)
    worldY = Math.max(EZ_DEPTH, Math.min(FIELD_LENGTH - EZ_DEPTH, worldY));

    const nm = agentName(p.agent);
    return {
      id:           nm + '-' + teamSide,
      team:         teamSide,
      role:         isOffense ? (p.offRole || 'OFF') : (p.defRole || 'DEF'),
      name:         nm,
      portraitCode: nm,
      x:            Math.max(2, Math.min(FIELD_WIDTH - 2, pos.dx)),
      y:            worldY,
      z:            0,
      highlight:    nm === highlightName,
    };
  });
}

// ---------- BALL POSITION ----------
function ballAtLOS(los, possession) {
  const y = losToWorldY(los);
  return { x: 26.67, y, z: 0 };
}

function ballInAir(fromY, toY, t) {
  // Parabolic arc: t = 0..1
  return {
    x: 26.67,
    y: fromY + (toY - fromY) * t,
    z: 4 * 2.5 * t * (1 - t),  // peak height 2.5 world units
  };
}

// ---------- CAPTION BUILDER ----------
// Rich comic-flavored play-by-play with deterministic template pools.
// Determinism: pick index by (event.t * 7 + poolIndex) — same seed → same captions.
function buildCaption(event) {
  const a   = event.actor  || '';
  const tg  = event.target || '';
  const yds = event.detail && event.detail.yards !== undefined ? event.detail.yards : null;
  const absYds = yds !== null ? Math.abs(yds) : 0;
  const sk  = event.skill  || 'special move';

  // Deterministic pick: use event.t (number) to index into template arrays.
  // Multiply by a prime to spread the distribution.
  const tick = typeof event.t === 'number' ? Math.floor(Math.abs(event.t)) : 0;
  function pick(arr) { return arr[tick % arr.length]; }

  switch (event.type) {

    case 'snap':
      return pick([
        `🏈 ${a} steps under center — HIKE!`,
        `${a} surveys the field… SNAP!`,
        `${a} takes the snap — clock is ticking!`,
        `${a} barks out signals — HERE WE GO!`,
      ]);

    case 'handoff':
      if (tg) return pick([
        `${a} fakes the pass and SLIPS it to ${tg}!`,
        `${a} bootlegs left — feeds ${tg} through the gap!`,
        `Smooth handoff — ${a} to ${tg}, BANG!`,
        `${a} plays it close to the vest, hand-off to ${tg}!`,
      ]);
      return pick([
        `${a} keeps it himself — OFF TO THE RACES!`,
        `${a} tucks it and GOES!`,
      ]);

    case 'throw':
      if (tg && absYds > 0) return pick([
        `💥 ${a} UNCORKS a ${absYds}-yd DIME to ${tg}!`,
        `${a} drops back — LAUNCHES it ${absYds} yards toward ${tg}!`,
        `${a} threads the needle — ${absYds}-yard BULLET toward ${tg}!`,
        `${a} steps up and RIFLED it — ${absYds} yds, ${tg} GO GET IT!`,
        `AIRING IT OUT! ${a} heaves ${absYds} yards downfield!`,
      ]);
      if (tg) return pick([
        `${a} fires a dart — ${tg} in the mix!`,
        `${a} lofts it up for ${tg}!`,
      ]);
      return pick([
        `${a} drops back… releases!`,
        `${a} rolls right and lets it fly!`,
      ]);

    case 'catch':
      if (tg && absYds > 0) return pick([
        `${tg} HAULS IN a ${absYds}-yard bullet — spectacular!`,
        `${tg} snatches it! +${absYds} yards, FIRST DOWN territory!`,
        `CAUGHT! ${tg} rips in ${absYds} yards — defense in shambles!`,
        `${tg} makes the grab — gains ${absYds}! POW!`,
        `💫 ${tg} reels it in for ${absYds} big yards!`,
      ]);
      if (tg) return pick([
        `${tg} pulls it in — nice hands!`,
        `${tg} makes the catch, PUSHES upfield!`,
      ]);
      return pick([
        `Caught! Ball secured!`,
        `Grab made — moving chains!`,
      ]);

    case 'tackle':
      if (a && tg && absYds > 0) return pick([
        `${a} STONES ${tg} — wrapped up for ${absYds} yds!`,
        `${a} DRILLS ${tg} at the line — nowhere to run!`,
        `${tg} gets BURIED by ${a}! ${absYds}-yard stop!`,
        `${a} wraps up ${tg} — DOWN for ${absYds}!`,
        `BOOM! ${a} PLASTERS ${tg} — gain of ${absYds}.`,
      ]);
      if (a && tg) return pick([
        `${a} brings down ${tg} — textbook tackle!`,
        `${a} SMOTHERS ${tg} at the line!`,
      ]);
      return pick([
        `Tackle made — ball dead!`,
        `Wrapped up — no extra yards!`,
      ]);

    case 'sack':
      if (a && tg) return pick([
        `🚨 ${a} BLOWS IT UP — SACK for ${absYds > 0 ? absYds : '?'} yards!`,
        `${a} DECLEATS ${tg || 'the QB'} — MASSIVE SACK!`,
        `${a} comes FREE — SACKS ${tg || 'the QB'} COLD!`,
        `${tg || 'QB'} never saw ${a} coming — OBLITERATED!`,
        `${a} rips through — CRUSHES ${tg || 'the QB'}! SACK!!`,
      ]);
      return pick([
        `SACK! Quarterback goes DOWN!`,
        `Huge sack — big loss on the play!`,
      ]);

    case 'interception':
      if (a) return pick([
        `🪤 PICKED OFF by ${a}!! TURNOVER!`,
        `${a} JUMPS the route — TAKEAWAY! GAME CHANGER!`,
        `${a} reads it perfectly — INTERCEPTION!!`,
        `${a} steps in front — PICKS IT! 💥`,
        `PICK SIX potential! ${a} has it — GO GO GO!`,
      ]);
      return pick([
        `INTERCEPTION! Defense takes over!`,
        `PICKED OFF — turnover on the field!`,
      ]);

    case 'fumble':
      if (tg) return pick([
        `😱 FUMBLE! ${tg} COUGHS IT UP — loose ball!!`,
        `${tg} gets STRIPPED — ball is on the ground!`,
        `FUMBLE by ${tg} — who's gonna fall on it?!`,
      ]);
      return pick([
        `FUMBLE! Ball is loose!`,
        `Ball on the ground — everyone scramble!`,
      ]);

    case 'touchdown':
      if (a) return pick([
        `🏈 TOUCHDOWN ${a}!! SIX POINTS — PANDEMONIUM!`,
        `${a} CROSSES THE GOAL LINE — TOUCHDOWN!!!`,
        `${a} IS IN!! THEY SCORE!! THE CROWD GOES WILD!`,
        `💥 ${a} PUNCHES IT IN — TD ON THE BOARD!`,
        `NOTHING BUT PAY DIRT! ${a} with the TOUCHDOWN!!`,
      ]);
      return pick([
        `TOUCHDOWN!! SIX POINTS!`,
        `THEY SCORE!! TOUCHDOWN!!`,
      ]);

    case 'field_goal':
      if (a) return pick([
        `🎯 ${a} DRILLS THE FIELD GOAL — IT'S GOOD!!`,
        `${a} splits the uprights — THREE POINTS!`,
        `${a} boots it — THROUGH THE UPRIGHTS! GOOD!`,
      ]);
      return pick([
        `FIELD GOAL — IT'S GOOD! Three points!`,
        `Field goal is GOOD!`,
      ]);

    case 'punt':
      if (a && absYds > 0) return pick([
        `${a} BOOMS a ${absYds}-yard punt — field position battle!`,
        `${a} gets a leg into it — ${absYds} yards of hang time!`,
        `${a} LAUNCHES a ${absYds}-yard punt — catch it if you can!`,
      ]);
      if (a) return pick([
        `${a} drops back to punt — here it comes!`,
        `${a} punts it away — change of possession!`,
      ]);
      return pick([
        `PUNT — flip the field!`,
        `Ball going up — punt play!`,
      ]);

    case 'turnover_on_downs':
      return pick([
        `Turnover on downs — defense takes the keys!`,
        `Couldn't convert! Defense ball — 1st & 10!`,
        `4th down gamble FAILS — other team takes over!`,
        `Short! Turnover on downs — big momentum swing!`,
      ]);

    case 'drive_ended':
      return pick([
        `Drive ends — reset and reload!`,
        `That drive is finished — back to the sideline!`,
      ]);

    case 'ability_used':
      if (a) return pick([
        `⚡ ${a} ACTIVATES ${sk} — SPECIAL ABILITY TRIGGERED!`,
        `${a} goes TURBO MODE — ${sk} is LIVE!`,
        `⚡ ABILITY! ${a} unleashes ${sk} — watch out!`,
        `${a} hits the switch — ${sk} ENGAGED! WATCH THIS!`,
      ]);
      return pick([
        `⚡ ABILITY TRIGGERED — SPECIAL MOVE ACTIVATED!`,
        `SPECIAL POWER IN PLAY — look alive!`,
      ]);

    default:
      // Fallback for unknown types
      return `${event.type}${a ? ': ' + a : ''}`;
  }
}

// ---------- INTERPOLATION ----------
function interpolateFrames(frameA, frameB, steps) {
  const frames = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const players = frameA.players.map((pA, idx) => {
      const pB = frameB.players[idx] || pA;
      return Object.assign({}, pA, {
        x:         pA.x + (pB.x - pA.x) * t,
        y:         pA.y + (pB.y - pA.y) * t,
        z:         pA.z + (pB.z - pA.z) * t,
        highlight: false,
      });
    });

    // Ball interpolation
    const bA = frameA.ball, bB = frameB.ball;
    const inAir = frameA.eventType === 'throw' || frameA.eventType === 'punt';
    let ball;
    if (inAir) {
      ball = ballInAir(bA.y, bB.y, t);
      ball.x = bA.x + (bB.x - bA.x) * t;
    } else {
      ball = {
        x: bA.x + (bB.x - bA.x) * t,
        y: bA.y + (bB.y - bA.y) * t,
        z: 0,
      };
    }

    frames.push({
      t:          frameA.t + (frameB.t - frameA.t) * t,
      players,
      ball,
      field:      Object.assign({}, frameA.field),
      scoreA:     frameA.scoreA,
      scoreB:     frameB.scoreB,
      caption:    '',
      eventType:  'interpolated',
      isKeyFrame: false,
    });
  }
  return frames;
}

// ---------- MAIN EXPORT ----------
/**
 * buildFrames(matchRecord) -> Frame[]
 */
function buildFrames(matchRecord) {
  if (!matchRecord || !matchRecord.events) {
    throw new Error('replay.js: matchRecord must have an events array');
  }

  const events   = matchRecord.events;
  const lineupA  = matchRecord.lineupA || { players: [] };
  const lineupB  = matchRecord.lineupB || { players: [] };

  // Pad lineups to 4 if needed
  while (lineupA.players.length < 4) {
    lineupA.players.push({ agent: 'BOT-' + lineupA.players.length, offRole: 'OFF', defRole: 'DEF', isHero: false });
  }
  while (lineupB.players.length < 4) {
    lineupB.players.push({ agent: 'BOT-' + lineupB.players.length, offRole: 'OFF', defRole: 'DEF', isHero: false });
  }

  // Field state machine
  let los       = 35;          // start at A's 35
  let down      = 1;
  let distance  = 10;
  let possession = 'A';
  let scoreA    = 0;
  let scoreB    = 0;

  const keyFrames = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Update scores from event payload
    if (ev.scoreA !== undefined) scoreA = ev.scoreA;
    if (ev.scoreB !== undefined) scoreB = ev.scoreB;

    // Update field state from event
    const yards = ev.detail && ev.detail.yards !== undefined ? ev.detail.yards : 0;

    switch (ev.type) {
      case 'snap':
        down     = ev.detail && ev.detail.down     !== undefined ? ev.detail.down     : down;
        distance = ev.detail && ev.detail.distance !== undefined ? ev.detail.distance : distance;
        break;

      case 'catch':
      case 'handoff':
      case 'throw': {
        // Advance los toward possession's goal
        const advance = (possession === 'A') ? yards : -yards;
        los = Math.max(0, Math.min(100, los + advance));
        break;
      }

      case 'tackle':
      case 'sack': {
        const advance = (possession === 'A') ? yards : -yards;
        los = Math.max(0, Math.min(100, los + advance));
        down++;
        distance = Math.max(0, distance - yards);
        if (down > 4) {
          // Should hit turnover_on_downs but handle defensively
          possession = possession === 'A' ? 'B' : 'A';
          down = 1; distance = 10;
        }
        break;
      }

      case 'touchdown':
        los       = (possession === 'A') ? 100 : 0;
        // Kickoff: reset to 35 after TD
        setTimeout(() => {}, 0); // no-op placeholder
        break;

      case 'interception':
      case 'fumble':
        possession = possession === 'A' ? 'B' : 'A';
        down = 1; distance = 10;
        los  = Math.max(0, Math.min(100, los));
        break;

      case 'turnover_on_downs':
        possession = possession === 'A' ? 'B' : 'A';
        down = 1; distance = 10;
        break;

      case 'punt': {
        const puntYards = ev.detail && ev.detail.yards ? ev.detail.yards : 40;
        const advance   = (possession === 'A') ? puntYards : -puntYards;
        los       = Math.max(0, Math.min(100, los + advance));
        possession = possession === 'A' ? 'B' : 'A';
        down = 1; distance = 10;
        break;
      }

      case 'field_goal':
        los = 35; // reset
        break;

      case 'drive_ended':
        down = 1; distance = 10;
        break;

      default:
        break;
    }

    // Reset after score events
    if (ev.type === 'touchdown' || ev.type === 'field_goal') {
      possession = possession === 'A' ? 'B' : 'A';
      los = 35;
      down = 1; distance = 10;
    }

    // Determine actor/target names for highlight
    const actorName  = ev.actor  || null;
    const targetName = ev.target || null;

    // Build player positions
    const playersA = placePlayers(lineupA, 'A', possession, los, possession === 'A' ? actorName : targetName);
    const playersB = placePlayers(lineupB, 'B', possession, los, possession === 'B' ? actorName : targetName);

    // Adjust highlights
    [playersA, playersB].flat().forEach(p => {
      p.highlight = (p.name === actorName || p.name === targetName);
    });

    const ball  = ballAtLOS(los, possession);
    const t     = typeof ev.t === 'number' ? ev.t : i * 2;

    const frame = {
      t,
      players:   [...playersA, ...playersB],
      ball,
      field:     { los, down, distance, possession },
      scoreA,
      scoreB,
      caption:   buildCaption(ev),
      eventType: ev.type,
      isKeyFrame: true,
    };

    keyFrames.push(frame);
  }

  // Guard: if no events, return a single placeholder frame
  if (keyFrames.length === 0) {
    const playersA = placePlayers(lineupA, 'A', 'A', 35, null);
    const playersB = placePlayers(lineupB, 'B', 'A', 35, null);
    return [{
      t: 0, players: [...playersA, ...playersB],
      ball: ballAtLOS(35, 'A'),
      field: { los: 35, down: 1, distance: 10, possession: 'A' },
      scoreA: 0, scoreB: 0,
      caption: 'Waiting for kickoff…', eventType: 'idle', isKeyFrame: true,
    }];
  }

  // Expand keyFrames with interpolated motion frames
  const allFrames = [];
  for (let i = 0; i < keyFrames.length; i++) {
    allFrames.push(keyFrames[i]);
    if (i < keyFrames.length - 1) {
      const between = interpolateFrames(keyFrames[i], keyFrames[i + 1], INTERPOLATION_STEPS);
      allFrames.push(...between);
    }
  }

  return allFrames;
}

// ---------- EXPORTS ----------
const FootballReplay = { buildFrames, buildCaption, losToWorldY, FIELD_WIDTH, FIELD_LENGTH };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FootballReplay;
}
root.FootballReplay = FootballReplay;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
