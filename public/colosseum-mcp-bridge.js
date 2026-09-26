/**
 * SHADDAI Colosseum — MCP Bridge
 * Connects colosseum to agents (NEXUS, PIKADON, TURTLE, etc.)
 * Enables agents to fight in arena, learn skills, trade, make decisions
 */

class ColosseumMCPBridge {
  constructor(colosseum) {
    this.colosseum = colosseum;
    this.sessionLog = [];
    this.agentSessions = {};
  }

  // ─── RESOURCE LISTING (MCP Standard) ───
  listResources() {
    return {
      resources: [
        {
          uri: 'colosseum://agents',
          name: 'Agent Directory',
          description: 'All agents assigned to colosseum roles'
        },
        {
          uri: 'colosseum://battles',
          name: 'Battle Arena',
          description: 'Active and historical battles'
        },
        {
          uri: 'colosseum://leaderboard',
          name: 'Rankings',
          description: 'Agent leaderboards and scores'
        },
        {
          uri: 'colosseum://events',
          name: 'Event Log',
          description: 'Arena events and decisions'
        },
        {
          uri: 'colosseum://trades',
          name: 'Trade History',
          description: 'Cross-agent trading records'
        }
      ]
    };
  }

  // ─── AGENT ONBOARDING ───
  registerAgent(agentId, agentName, agentRole) {
    const result = this.colosseum.assignAgent(agentId, agentRole, agentName);

    this.agentSessions[agentId] = {
      id: agentId,
      name: agentName,
      role: agentRole,
      registered: Date.now(),
      actions: [],
      stats: {}
    };

    this.logAction(agentId, 'registered', result);
    return result;
  }

  // ─── AGENT SKILL LEARNING ───
  agentLearnSkill(agentId, skillKey) {
    const agent = this.colosseum.getAgent(agentId);
    if (!agent) return { success: false, error: 'Agent not registered' };

    const result = this.colosseum.learnSkill(agentId, skillKey);
    this.logAction(agentId, 'learn_skill', { skillKey, result });

    return {
      ...result,
      skillKey: skillKey,
      agent: this.colosseum.getAgentStats(agentId)
    };
  }

  agentPracticeSkill(agentId, skillKey, iterations = 1) {
    const results = [];
    for (let i = 0; i < iterations; i++) {
      results.push(this.colosseum.practiceSkill(agentId, skillKey));
    }

    this.logAction(agentId, 'practice_skill', { skillKey, iterations, results });

    return {
      success: true,
      skillKey: skillKey,
      practiceResults: results,
      agent: this.colosseum.getAgentStats(agentId)
    };
  }

  // ─── ARENA COMBAT ───
  agentChallenge(challengerId, targetId) {
    const challenger = this.colosseum.getAgent(challengerId);
    const target = this.colosseum.getAgent(targetId);

    if (!challenger || !target) {
      return { success: false, error: 'One or both agents not found' };
    }

    const battle = this.colosseum.initiateBattle(challengerId, targetId, 'agent_duel');
    this.logAction(challengerId, 'challenge_issued', { targetId, battle });

    return {
      success: true,
      battle: battle.battle,
      challengerStats: challenger.stats,
      targetStats: target.stats
    };
  }

  agentFightRound(matchId) {
    const battle = this.colosseum.getBattle(matchId);
    if (!battle) return { success: false, error: 'Battle not found' };

    const result = this.colosseum.simulateBattleRound(matchId);

    if (result.success) {
      this.logAction(battle.agent1.id, 'battle_round', { matchId, result });

      if (result.winner) {
        this.colosseum.recordVictory(result.winner, 20);
        this.logAction(result.winner, 'victory', { matchId, opponent: battle.agent1.id === result.winner ? battle.agent2.id : battle.agent1.id });
      }
    }

    return result;
  }

  // ─── TRADING SYSTEM ───
  agentTrade(buyerId, vendorId, itemKey, price) {
    const buyer = this.colosseum.getAgent(buyerId);
    const vendor = this.colosseum.getAgent(vendorId);

    if (!buyer || !vendor) return { success: false, error: 'Agent not found' };
    if (vendor.role !== 'vendor') return { success: false, error: 'Target is not a vendor' };

    const trade = this.colosseum.completeTradeWithVendor(buyerId, vendorId, itemKey, price);
    this.logAction(buyerId, 'purchase', { vendorId, itemKey, price });
    this.logAction(vendorId, 'sold_item', { buyerId, itemKey, price });

    return {
      ...trade,
      buyerStats: this.colosseum.getAgentStats(buyerId),
      vendorStats: this.colosseum.getAgentStats(vendorId)
    };
  }

  // ─── AGENTIC DECISION MAKING ───
  agentDecide(agentId, situation) {
    const result = this.colosseum.makeAgentDecision(agentId, situation);
    this.logAction(agentId, 'decision_made', { situation, decision: result.decision });
    return result;
  }

  // ─── EVENT LISTENING ───
  onArenaEvent(eventType, callback) {
    this.colosseum.onEvent(eventType, (event) => {
      this.logAction('arena', 'event', { type: eventType, event });
      callback(event);
    });
  }

  agentTriggerEvent(agentId, eventName) {
    return this.colosseum.triggerArenaEvent(agentId, eventName);
  }

  // ─── DATA ACCESS ───
  getAgentProfile(agentId) {
    const agent = this.colosseum.getAgent(agentId);
    if (!agent) return null;

    return {
      ...agent,
      stats: this.colosseum.getAgentStats(agentId),
      ranking: this.colosseum.getAgentRanking(agentId),
      role: agent.role,
      skills: Object.keys(agent.skills)
    };
  }

  getAllAgents() {
    return this.colosseum.getAllAgents().map(agent => ({
      ...agent,
      ranking: this.colosseum.getAgentRanking(agent.id)
    }));
  }

  getLeaderboard(limit = 10) {
    return this.colosseum.getLeaderboard(limit, 'points');
  }

  getActiveBattles() {
    return Object.values(this.colosseum.battleArena.activeMatches);
  }

  getRecentEvents(limit = 20) {
    return this.colosseum.eventLog.slice(-limit);
  }

  getTradeHistory(limit = 20) {
    return this.colosseum.getTradeHistory(limit);
  }

  // ─── SESSION LOGGING ───
  logAction(agentId, action, data) {
    const log = {
      timestamp: Date.now(),
      agent: agentId,
      action: action,
      data: data
    };
    this.sessionLog.push(log);
    if (this.agentSessions[agentId]) {
      this.agentSessions[agentId].actions.push(log);
    }
    return log;
  }

  // ─── FULL STATE EXPORT ───
  getFullArenaState() {
    return {
      arena: this.colosseum.getArenaState(),
      agents: this.getAllAgents(),
      leaderboard: this.getLeaderboard(10),
      activeBattles: this.getActiveBattles(),
      recentEvents: this.getRecentEvents(10),
      recentTrades: this.getTradeHistory(10),
      sessions: this.agentSessions,
      sessionLog: this.sessionLog.slice(-50)
    };
  }

  // ─── SKILL REGISTRY ───
  getAvailableSkills(role = null) {
    const registry = this.colosseum.getSkillRegistry();
    if (role) {
      return Object.entries(registry)
        .filter(([key, skill]) => skill.role === role)
        .map(([key, skill]) => ({ key, ...skill }));
    }
    return Object.entries(registry)
      .map(([key, skill]) => ({ key, ...skill }));
  }

  // ─── ROLE MANAGEMENT ───
  getRoleStatus() {
    return this.colosseum.getRoleStatus();
  }

  getAgentsByRole(role) {
    return this.colosseum.getAllAgents().filter(a => a.role === role);
  }

  // ─── CONVENIENCE METHODS ───
  agentBattle(agentId1, agentId2) {
    const battle = this.agentChallenge(agentId1, agentId2);
    if (!battle.success) return battle;

    // Auto-simulate full battle
    let match = battle.battle;
    while (match.status === 'active') {
      const round = this.agentFightRound(match.id);
      if (round.match) match = round.match;
    }

    return {
      success: true,
      winner: match.winner,
      rounds: match.rounds,
      logs: match.logs,
      agent1Final: match.agent1,
      agent2Final: match.agent2
    };
  }

  agentLevelUp(agentId, skillLevels = {}) {
    const agent = this.colosseum.getAgent(agentId);
    if (!agent) return { success: false };

    const results = {};
    Object.entries(skillLevels).forEach(([skillKey, levels]) => {
      for (let i = 0; i < levels; i++) {
        results[skillKey] = this.agentLearnSkill(agentId, skillKey);
      }
    });

    return {
      success: true,
      skillsLearned: results,
      agent: this.colosseum.getAgentStats(agentId)
    };
  }
}

// Export for browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColosseumMCPBridge;
}
if (typeof window !== 'undefined') {
  window.ColosseumMCPBridge = ColosseumMCPBridge;
}
