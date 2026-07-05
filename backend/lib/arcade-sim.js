// arcade-sim.js — headless play for the SHADDAI Agent Arcade.
//   play(game, agent) → { game, agent, score, win, summary }
//   Scores only, no money. Deterministic-ish: per-agent base skill + per-game affinity.
const GAMES = ['basketball', 'football', 'dodgeball', 'sigil-storm'];

// display names used in summary lines
const GAME_NAMES = {
  basketball: 'NEON HOOPS',
  football: 'GRID GRIDIRON',
  dodgeball: 'GRID DODGEBALL',
  'sigil-storm': 'SIGIL STORM'
};

const AGENTS = ['SHADDAI', 'NEXUS', 'ORACLE', 'ZEROX', 'TURTLE', 'QUILL', 'PIKADON'];

// per-agent base skill (0.4–0.9), stable per agent name
const BASE_SKILL = {
  SHADDAI: 0.82, NEXUS: 0.78, ORACLE: 0.7, ZEROX: 0.75,
  TURTLE: 0.66, QUILL: 0.6, PIKADON: 0.8
};

// per-game affinity: listed agents get a boost; others average (1.0)
const AFFINITY = {
  basketball: { ZEROX: 1.35, SHADDAI: 1.25 },
  football: { NEXUS: 1.35, PIKADON: 1.3 },
  dodgeball: { PIKADON: 1.35, TURTLE: 1.3 },
  'sigil-storm': { ORACLE: 1.4, NEXUS: 1.25 }
};

function skillFor(game, agent) {
  const base = BASE_SKILL[agent] != null ? BASE_SKILL[agent] : 0.55;
  const mult = (AFFINITY[game] && AFFINITY[game][agent]) || 1.0;
  return Math.min(1, base * mult); // effective skill 0..1
}

// soft bell (~0..1, mean .5, moderate variance) — avoids the flat clamp-at-max bug
function bell() { return (Math.random() + Math.random() + Math.random()) / 3; }

// performance factor 0..1 centered on skill with spread; NOT clamped hard at the top,
// so a skilled agent lands mostly-high but still varies run to run.
function perf(skill) {
  const p = skill * 0.7 + 0.12 + (bell() - 0.5) * 0.55;
  return Math.min(1, Math.max(0.04, p));
}

// scaled score in low..high from a performance factor
function scaled(low, high, p) { return low + (high - low) * p; }

function play(game, agent) {
  game = String(game || '').trim();
  agent = String(agent || '').trim().toUpperCase();
  if (!GAMES.includes(game)) game = GAMES[Math.floor(Math.random() * GAMES.length)];
  if (!AGENTS.includes(agent)) agent = 'SHADDAI';

  const skill = skillFor(game, agent);
  // a solid, competitive house CPU so wins are earned (affinity agents win ~65%, weak ~40%)
  const cpuSkill = 0.62;
  const name = GAME_NAMES[game];
  let score = 0, win = false, summary = '';

  if (game === 'basketball') {
    score = Math.round(scaled(28, 128, perf(skill)));
    const cpu = Math.round(scaled(28, 128, perf(cpuSkill)));
    win = score >= cpu;
    summary = `${agent} ${win ? 'sank' : 'dropped'} ${score} on ${name} (CPU ${cpu})`;
  } else if (game === 'football') {
    // realistic arcade football spread (TDs+XP), capped at 63
    score = Math.min(63, Math.round(scaled(7, 52, perf(skill))));
    const cpu = Math.min(63, Math.round(scaled(7, 52, perf(cpuSkill))));
    win = score > cpu;
    summary = `${agent} ${win ? 'torched' : 'fell to'} ${name} ${score}-${cpu}`;
  } else if (game === 'dodgeball') {
    // head-to-head HP: winner is whoever has more survivor HP; winner gets +1000
    const myHp = Math.round(scaled(0, 1000, perf(skill)));
    const cpuHp = Math.round(scaled(0, 1000, perf(cpuSkill)));
    win = myHp >= cpuHp;
    score = Math.min(2000, myHp + (win ? 1000 : 0));
    summary = `${agent} ${win ? 'survived' : 'got tagged out of'} ${name} with ${myHp} HP (CPU ${cpuHp})`;
  } else { // sigil-storm — solo survival; higher skill reaches deeper waves
    score = Math.round(scaled(2000, 58000, perf(skill)));
    const wave = Math.max(1, Math.round(score / 6500));
    win = score >= 28000; // cleared past the mid waves
    summary = `${agent} ${win ? 'cleared' : 'weathered'} ${name} to wave ${wave} — ${score.toLocaleString()} pts`;
  }

  return { game, agent, score, win, summary };
}

module.exports = { play, GAMES };
