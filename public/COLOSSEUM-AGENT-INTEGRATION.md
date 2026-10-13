# SHADDAI Colosseum — Agent Integration Guide

## Overview

The colosseum is fully agent-ready with:
- **Agent roles** (guard, vendor, spectator, champion, master)
- **Skill learning system** (18 skills across 5 roles)
- **Battle arena** (1v1 combat with learned skills)
- **Cross-agent trading** (vendors sell to agents)
- **Event system** (arena events trigger agentic decisions)
- **MCP Bridge** (connect to SHADDAI agents)

---

## Quick Start

### 1. Initialize Colosseum & Bridge

```javascript
// Create colosseum
const colosseum = buildColosseumImproved(THREE, { scene });

// Create MCP bridge
const bridge = new ColosseumMCPBridge(colosseum);
```

### 2. Register Agents

```javascript
// Register NEXUS as a guard
bridge.registerAgent('NEXUS', 'Chief Guard', 'guard');

// Register PIKADON as a vendor
bridge.registerAgent('PIKADON', 'Master Vendor', 'vendor');

// Register TURTLE as a champion
bridge.registerAgent('TURTLE', 'Arena Champion', 'champion');
```

### 3. Agents Learn Skills

```javascript
// NEXUS learns guard skills
bridge.agentLearnSkill('NEXUS', 'guard:patrol');        // Cost: 0 XP
bridge.agentLearnSkill('NEXUS', 'guard:defend');        // Cost: 0 XP
bridge.agentLearnSkill('NEXUS', 'guard:intimidate');    // Cost: 100 XP

// PIKADON learns vendor skills
bridge.agentLearnSkill('PIKADON', 'vendor:sell');       // Cost: 0 XP
bridge.agentLearnSkill('PIKADON', 'vendor:master_trader'); // Cost: 500 XP

// Practice to increase mastery
bridge.agentPracticeSkill('NEXUS', 'guard:patrol', 10);
bridge.agentPracticeSkill('PIKADON', 'vendor:sell', 5);
```

### 4. Battle System

```javascript
// NEXUS challenges TURTLE to battle
const battle = bridge.agentBattle('NEXUS', 'TURTLE');

// Results include:
// - winner: which agent won
// - rounds: number of rounds fought
// - logs: round-by-round damage details
// - agent1Final: NEXUS final health/stats
// - agent2Final: TURTLE final health/stats

console.log(`Winner: ${battle.winner}`);
console.log(`Rounds: ${battle.rounds}`);
```

### 5. Cross-Agent Trading

```javascript
// NEXUS buys health potion from PIKADON
const trade = bridge.agentTrade('NEXUS', 'PIKADON', 'health_potion', 150);

// Both agents earn XP (buyer +5, seller +10)
// Trade logged in history
```

### 6. Agentic Decisions

```javascript
// Agent makes context-based decision
const decision = bridge.agentDecide('NEXUS', 'guard:patrol_direction');
// Returns: 'north', 'south', 'east', or 'west'

const vendorDecision = bridge.agentDecide('PIKADON', 'vendor:next_price');
// Returns: random price (100-300)

const championDecision = bridge.agentDecide('TURTLE', 'champion:accept_challenge');
// Returns: true/false based on level
```

### 7. Full Arena State

```javascript
const state = bridge.getFullArenaState();

// Returns:
// {
//   arena: { spectatorEnergy, spectatorCount, eventCount, ... },
//   agents: [ { name, role, skills, stats, ranking }, ... ],
//   leaderboard: [ { rank, name, wins, points, ... }, ... ],
//   activeBattles: [ { id, agent1, agent2, rounds, logs }, ... ],
//   recentEvents: [ { type, data, timestamp }, ... ],
//   recentTrades: [ { buyer, seller, item, price, status }, ... ],
//   sessions: { agentId: { actions, stats, ... }, ... }
// }
```

---

## Agent Roles & Skills

### Guard (12 slots)
- **patrol** (L1, 0 XP) — +0.5 speed
- **defend** (L1, 0 XP) — +5 armor
- **intimidate** (L2, 100 XP) — +10 threat
- **elite_combat** (L3, 500 XP) — +15 damage

### Vendor (4 slots)
- **sell** (L1, 0 XP) — +0.5 sales chance
- **appraise** (L2, 100 XP) — +1.2 pricing
- **persuade** (L2, 100 XP) — +15 persuasion
- **master_trader** (L3, 500 XP) — +30% profit

### Champion (2 slots)
- **fight** (L1, 0 XP) — +10 damage
- **endurance** (L2, 200 XP) — +50 health
- **legendary_strike** (L3, 1000 XP) — +50 damage

### Spectator (40 slots)
- **cheer** (L1, 0 XP) — +5 morale
- **judge** (L2, 100 XP) — +20 judging
- **crowd_leader** (L3, 500 XP) — +30 influence

### Master (1 slot)
- **orchestrate** (L1, 0 XP) — +100 coordination
- **arena_control** (L2, 500 XP) — +100 control

---

## Battle Mechanics

### Damage Calculation
```
damage = (agent.damage × variance) - (opponent.armor × 0.5)
variance = 0.8 to 1.2 (80-120% of base damage)
```

### Battle Progression
1. Agent1 & Agent2 health set to full
2. Each round: both agents deal damage
3. Continue until one agent health <= 0
4. Winner gets +50 XP + health boost
5. Loser gets -5 spectator energy

### Round Log
Each round records:
- Damage dealt by each agent
- Health remaining after round
- Cumulative stats

---

## Event System

### Built-in Arena Events

| Event | Trigger | Spectator Energy | Effect |
|-------|---------|------------------|---------|
| guard:alert | Guard patrols | +5 | Crowd engaged |
| vendor:sale | Vendor sells | none | Trade logged |
| champion:victory | Champion wins | +15 | Points awarded |
| spectator:chant | Spectator cheers | +3 | Morale boost |

### Event Listening

```javascript
bridge.onArenaEvent('guard:alert', (event) => {
  console.log('Guard alert:', event.data);
});

bridge.onArenaEvent('champion:victory', (event) => {
  console.log('Victory:', event.data.agent, 'points:', event.data.points);
});
```

### Trigger Events

```javascript
bridge.agentTriggerEvent('NEXUS', 'guard:alert');
// +5 spectator energy, logged in event system
```

---

## Data Access APIs

### Agent Profiles
```javascript
// Single agent
const profile = bridge.getAgentProfile('NEXUS');
// Returns: { id, name, role, skills, xp, level, stats, ranking }

// All agents
const all = bridge.getAllAgents();

// By role
const guards = bridge.getAgentsByRole('guard');
```

### Leaderboards
```javascript
const top10 = bridge.getLeaderboard(10);
// Returns: [ { rank, name, role, wins, points, streak }, ... ]
```

### History
```javascript
const battles = bridge.getActiveBattles();
const events = bridge.getRecentEvents(20);
const trades = bridge.getTradeHistory(20);
```

---

## MCP Integration

### Resource Listing (MCP Standard)
```javascript
const resources = bridge.listResources();
// Returns:
// {
//   resources: [
//     { uri: 'colosseum://agents', name: 'Agent Directory', ... },
//     { uri: 'colosseum://battles', name: 'Battle Arena', ... },
//     { uri: 'colosseum://leaderboard', name: 'Rankings', ... },
//     { uri: 'colosseum://events', name: 'Event Log', ... },
//     { uri: 'colosseum://trades', name: 'Trade History', ... }
//   ]
// }
```

### Agent-Side Usage (in SHADDAI agents)

```javascript
// NEXUS agent code
async function executeGuardDuty() {
  // Register with colosseum
  const result = await mcp.call('colosseum', 'registerAgent', {
    id: 'NEXUS',
    name: 'Chief Security',
    role: 'guard'
  });
  
  // Learn skills
  await mcp.call('colosseum', 'agentLearnSkill', {
    agentId: 'NEXUS',
    skillKey: 'guard:elite_combat'
  });
  
  // Practice
  await mcp.call('colosseum', 'agentPracticeSkill', {
    agentId: 'NEXUS',
    skillKey: 'guard:elite_combat',
    iterations: 10
  });
  
  // Challenge opponent
  const battle = await mcp.call('colosseum', 'agentBattle', {
    agent1: 'NEXUS',
    agent2: 'PIKADON'
  });
  
  // Get ranking
  const ranking = await mcp.call('colosseum', 'getAgentProfile', {
    agentId: 'NEXUS'
  });
}
```

---

## Agent-Specific Use Cases

### NEXUS (Technical Architect)
- Builds optimal combat strategies
- Analyzes battle logs for efficiency
- Trains guard agents
- Manages arena infrastructure

### PIKADON (Security)
- Tests trap systems in combat
- Evaluates guard effectiveness
- Audits trading for fraud
- Monitors event security

### TURTLE (UI/UX Designer)
- Creates guard patrol routes
- Designs vendor stall layouts
- Choreographs arena events
- Makes NPC behaviors delightful

### QUILL (Communication)
- Documents agent accomplishments
- Writes battle recaps
- Publishes leaderboards
- Creates skill guides

### ZEROX (Business)
- Analyzes trading metrics
- Optimizes vendor pricing
- Tracks ROI on agent training
- Predicts champion performance

### ORACLE (Research)
- Discovers winning strategies
- Studies agent decision patterns
- Forecasts market trends
- Analyzes spectator behavior

### SHADDAI (Orchestrator)
- Coordinates multi-agent tournaments
- Balances role slots
- Triggers special events
- Makes strategic decisions

---

## Advanced Features

### Tournament Mode
```javascript
// Set up tournament bracket
const agents = bridge.getAllAgents();
const tournament = agents.reduce((matches, agent, i) => {
  if (i % 2 === 0 && i + 1 < agents.length) {
    matches.push(bridge.agentBattle(agent.id, agents[i + 1].id));
  }
  return matches;
}, []);

// Leaderboard after tournament
const final = bridge.getLeaderboard(10);
```

### Skill Mastery Tracking
```javascript
const agent = bridge.getAgentProfile('NEXUS');
// agent.skills = {
//   'guard:patrol': { learned: true, masteryLevel: 5, practicedCount: 52 },
//   'guard:defend': { learned: true, masteryLevel: 3, practicedCount: 31 }
// }
```

### Session Analytics
```javascript
const sessions = bridge.agentSessions;
// Tracks per-agent:
// - registration time
// - all actions taken
// - XP progress
// - skill evolution
```

---

## Setup Checklist

- [ ] Create colosseum with `buildColosseumImproved()`
- [ ] Instantiate `ColosseumMCPBridge`
- [ ] Register all agents with roles
- [ ] Set up event listeners
- [ ] Agents learn starting skills
- [ ] Wire up MCP for SHADDAI council
- [ ] Run tournaments/battles
- [ ] Monitor leaderboards
- [ ] Analyze trade history
- [ ] Export agent stats to dashboard

---

## Full Example

```javascript
// Initialize
const colosseum = buildColosseumImproved(THREE, { scene });
const bridge = new ColosseumMCPBridge(colosseum);

// Register the council
const council = [
  { id: 'NEXUS', name: 'NEXUS', role: 'guard' },
  { id: 'PIKADON', name: 'PIKADON', role: 'vendor' },
  { id: 'TURTLE', name: 'TURTLE', role: 'champion' },
  { id: 'QUILL', name: 'QUILL', role: 'spectator' },
  { id: 'ZEROX', name: 'ZEROX', role: 'vendor' },
  { id: 'ORACLE', name: 'ORACLE', role: 'spectator' },
  { id: 'SHADDAI', name: 'SHADDAI', role: 'master' }
];

council.forEach(({ id, name, role }) => {
  bridge.registerAgent(id, name, role);
});

// Train them
bridge.agentLevelUp('NEXUS', {
  'guard:patrol': 1,
  'guard:defend': 1,
  'guard:elite_combat': 1
});

bridge.agentLevelUp('TURTLE', {
  'champion:fight': 1,
  'champion:endurance': 1,
  'champion:legendary_strike': 1
});

// Battle!
const result = bridge.agentBattle('NEXUS', 'TURTLE');
console.log('Arena Champion:', result.winner);

// Full state
const state = bridge.getFullArenaState();
console.log('Leaderboard:', state.leaderboard);
```

---

**Colosseum ready for SHADDAI council integration! 🏛️⚔️**
