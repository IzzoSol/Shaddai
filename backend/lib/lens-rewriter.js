'use strict';
/**
 * backend/lib/lens-rewriter.js — LENS's locked-contract rewriter
 * (Shaddai-Arcade issue #5, docs/HALL-PHASE1-SPEC.md's "LENS (Fal)" section).
 *
 * Expanded to support all SHADDAI arcade games:
 * - Basketball (NEON HOOPS)
 * - Football (GRID GRIDIRON)
 * - Dodgeball (GRID DODGEBALL)
 * - Sigil-storm (SIGIL STORM)
 * - Blackjack (BONUS)
 *
 * Compresses a filmable game moment into the locked contract
 * {SCENE_LOCK, CAST_LOCK, EVENT, LAW, DURATION} before reaching Fal.
 *
 * CAST_LOCK is deterministically chosen from fixed character roster.
 * No freeform text is accepted - events are predefined and locked.
 */

// Original-cast-only roster
const CAST_LOCK = Object.freeze([
  'Hall Tech Support',
  'Nova',
  'Patch',
  'Volt',
  'Sol',
  'Player (red beanie)',
  'Gunner'
]);

const LAW = 'Original cast only. No real celebrity names or likenesses, ever. Cinematic performance with studio quality lights.';

// Council persona faces for per-agent reveals (arcade-bet packs). All original
// fictional characters of the SHADDAI universe — the no-celebrity rule holds.
const AGENT_FACES = Object.freeze({
  SHADDAI: 'the regal SHADDAI, executive leader in a sharp dark suit with a confident flourish',
  NEXUS: 'the quick-witted engineer NEXUS, glasses on, sleeves rolled, already smiling',
  ZEROX: 'the sharp trader ZEROX in a tailored blazer, cool and money-focused',
  ORACLE: 'the knowing strategist ORACLE, hooded, reading the room in an instant',
  TURTLE: 'the bright designer TURTLE, stylish with playful energy and a grin',
  QUILL: 'the precise writer QUILL, calm and measured, pen tucked behind an ear',
  PIKADON: 'the watchful guard PIKADON, composed stance, always scanning the crowd',
});

// Arcade-bet reveal scenes per game × result, with a {agent} slot filled in at
// contract time. These turn the pack's "<key>_win"/"<key>_lose" events into
// filmable cutscenes featuring the player's picked agent.
const GAME_RESULTS = Object.freeze({
  basketball: Object.freeze({
    win: '{agent} stands at center court as the NEON HOOPS buzzer sounds. A glowing basketball arcs in slow motion through the net, the crowd erupts and confetti rains down.',
    lose: '{agent} watches a last NEON HOOPS shot clank off the rim. The arena buzz drops low and the lights dim to purple as the scoreboard flashes the loss.',
  }),
  football: Object.freeze({
    win: '{agent} breaks through the final GRID GRIDIRON defenders, plants the ball as the stadium lights blaze and golden confetti fires from the pylons.',
    lose: '{agent} is stopped short of the GRID GRIDIRON endzone, helmet tipping back as the clock hits zero and the home crowd falls quiet.',
  }),
  dodgeball: Object.freeze({
    win: '{agent} makes the final GRID DODGEBALL dodge, spinning past a stray ball as the arena flashes victory colors and the ref signals the win.',
    lose: '{agent} is caught by a last GRID DODGEBALL shot, knocked back toward the pads as the exit lights come on.',
  }),
  'sigil-storm': Object.freeze({
    win: '{agent} plants the final sigil as the SIGIL STORM sky splits into gold. Ancient glyphs flare and fuse into a victory seal overhead.',
    lose: '{agent} braces as a SIGIL STORM wave crashes past, glyphs flickering out one by one while the storm closes overhead.',
  }),
});

// Filmable events - one for each major typeable moment in each game
const EVENT_SCENES = Object.freeze({
  // ============================================
  // BASKETBALL (NEON HOOPS) - basketball.html
  // ============================================
  made_shot: 'A basketball player makes a clean, graceful jump shot. The ball arcs through the air and swishes through the net with perfect form, allowing a small splash effect.',
  miss: 'A basketball player attempts a shot but misses. The ball clanks harshly off the rim, bouncing back with a metallic clang and scattering across the court.',
  dunk: 'A powerful slam dunk. The player explodes upward, releasing the ball with immense force through the hoop. An explosive backdrop and loud crowd reaction.',
  three_point: 'A thunderous three-pointer from beyond the arc. The basketball starts its journey in slow motion, glowing with golden light before swishing through the net.',
  street_dunk: 'An alley-oop slam dunk. A teammate lobbs the basketball high just as another player sprints past the rim and catches it for a massive slam.',
  corridor_steal: 'A clean steal. An off-ball defender reaches in, intercepts a pass with lightning speed, and quickly regains possession.',

  // ============================================
  // FOOTBALL (GRID GRIDIRON) - football.html
  // ============================================
  touchdown: 'A powerful touchdown run. The player breaks through defenders with explosive force, surging across the goal line with cinematic impactful motion.',
  interception: 'A perfectly timed interception. A defender reads the play, reacts quickly, and catches the football in mid-air before being tackled.',
  punt_return: 'A spectacular kickoff return. The returner catches the ball, shakes off tacklers, and races downfield with incredible speed and momentum.',
  fumble: 'A dropped football after being tackled. The ball squirts loose, bouncing across the field as players scramble for possession.',
  field_goal: 'A focused field goal. The player lines up and kicks the football through the upright from distance, precision kicking in slow motion.',

  // ============================================
  // DODGEBALL (GRID DODGEBALL) - dodgeball.html
  // ============================================
  hit: 'A direct dodgeball hit. The projectile strikes an opponent with force, sending them backward as the impact glows with impact energy.',
  dodge: 'A split-second dodge. An opponent reacts by ducking or sidestepping, narrowly avoiding an incoming dodgeball with impressive reflex.',
  dodge_skill: 'A special dodge skill activation. The player activates protective shielding that absorbs the dodgeball with a shimmering effect.',
  bail: 'A player being knocked out by consecutive hits. After several impacts, the player falls to the ground defeated as bystanders react.',

  // ============================================
  // SIGIL-STORM (SIGIL STORM) - sigil-storm.html
  // ============================================
  sigil_cast: 'A powerful sigil being cast with glowing magical energy. Ancient symbols flare with power as they materialize in mid-air.',
  beam_attack: 'An energy beam firing from weapon. A concentrated blast of energy shoots forward, incinerating targets with intense luminous effects.',
  special_skill: 'A unique special ability activation. The player unleashes an impactful visual skill with particles and dynamic lighting.',
  combo: 'An exceptionally long combo streak with progressive power buildup. The character builds up energy as they land hits in rapid succession.',

  // ============================================
  // BLACKJACK (BONUS) - blackjack.js
  // ============================================
  bust: 'A blackjack player looks shocked as the total passes 21, signaling a bust with the dealer sweeping the bet.',
  win: 'A blackjack player celebrates excitedly as chips are pushed toward them after a winning hand at the casino table.',
  blackjack: 'An intense blackjack card game. The seated character reveals a natural blackjack as the dealer turns over the hole card.',
  push: 'A blackjack player receives their bet back after a push (tie) with no winner.',
});

const DEFAULT_DURATION_SEC = 5;
const MAX_DURATION_SEC = 10;

/**
 * Deterministic seat->cast mapping. Never influenced by free text.
 */
function pickCast(seatId) {
  const s = String(seatId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAST_LOCK[h % CAST_LOCK.length];
}

/**
 * buildLensContract({ matchId, pack, eventType, seatId, durationSec, agent, game })
 *   -> { SCENE_LOCK, CAST_LOCK, EVENT, LAW, DURATION, matchId, pack, prompt }
 * Throws on an eventType outside EVENT_SCENES (or, for arcade-bet reveals,
 * a game/result combination unknown to GAME_RESULTS).
 */
function buildLensContract(opts) {
  const { matchId, pack, eventType, seatId, durationSec, agent, game } = opts || {};

  // Arcade-bet reveals arrive as "<pack>_win" / "<pack>_lose" and carry the
  // picked agent + game from the match state — map them to a per-agent scene.
  const reveal = /^.+_(win|lose)$/.exec(eventType || '');
  const arcade = game && GAME_RESULTS[game] && reveal ? GAME_RESULTS[game][reveal[1]] : null;
  const agentFace = agent && AGENT_FACES[agent];
  const scene = arcade
    ? arcade.replace('{agent}', agentFace ? `${agent}, ${agentFace}` : 'a hall player')
    : EVENT_SCENES[eventType];
  if (!scene) {
    throw new Error(`lens-rewriter: unfilmable event type '${eventType}' (expected one of: ${Object.keys(EVENT_SCENES).join(', ')} or a game/result pair)`);
  }

  const cast = agentFace ? agent : pickCast(seatId);
  const duration = Number(durationSec) > 0 ? Math.min(Number(durationSec), MAX_DURATION_SEC) : DEFAULT_DURATION_SEC;
  const contract = {
    SCENE_LOCK: scene,
    CAST_LOCK: cast,
    EVENT: eventType,
    LAW,
    DURATION: duration,
  };
  const prompt = `${contract.SCENE_LOCK} Character: ${contract.CAST_LOCK}. ${contract.LAW} Duration: ${contract.DURATION} seconds.`;
  return { ...contract, matchId: matchId || null, pack: pack || null, prompt };
}

module.exports = { buildLensContract, CAST_LOCK, AGENT_FACES, GAME_RESULTS, LAW, EVENT_SCENES };