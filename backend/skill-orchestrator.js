/**
 * SKILL ORCHESTRATOR — Central Hub for Skill Execution
 * Coordinates: skill execution, model routing, learning loop, memory system, performance tracking
 *
 * This is where everything comes together:
 * Agent → Orchestrator → (Smart Router selects model) → (Skill Executor runs skill)
 *   → (Learning Loop records & auto-creates skills) → (Memory System stores & recalls)
 *   → Response back to Agent
 */

const path = require('path');

class SkillOrchestrator {
  constructor(skillsManager, smartRouter, skillExecutor, skillLearningLoop, memorySystem, database) {
    this.skillsManager = skillsManager;
    this.smartRouter = smartRouter;
    this.skillExecutor = skillExecutor;
    this.skillLearningLoop = skillLearningLoop;
    this.memorySystem = memorySystem;
    this.database = database;

    // Execution tracking
    this.executionHistory = [];
    this.agentExecutionStats = new Map();
    this.skillMetrics = new Map();
  }

  /**
   * ORCHESTRATE SKILL EXECUTION
   * Main entry point: agent requests skill execution
   */
  async executeSkillForAgent(agentName, skillName, inputs = {}, context = {}) {
    const executionId = `orch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Step 1: Get skill
      const skill = this.skillsManager.getSkill(skillName);
      if (!skill) {
        return {
          status: 'ERROR',
          error: `Skill not found: ${skillName}`,
          executionId,
          agent: agentName,
          timestamp: new Date().toISOString()
        };
      }

      // Step 2: Retrieve relevant memories for agent context
      const memoryContext = this.memorySystem.buildMemoryContext(
        agentName,
        `${skillName}: ${skill.description || ''}`
      );

      // Step 3: Select optimal model using smart router
      const modelSelection = this.smartRouter.selectModel(
        skillName,
        {
          estimatedTokens: inputs.estimatedTokens || 2000,
          maxBudget: inputs.maxBudget || null,
          speedRequired: inputs.speedRequired || null,
          qualityRequired: inputs.qualityRequired || null
        }
      );

      // Step 4: Execute skill
      const executionResult = await this.skillExecutor.executeSkill(
        skillName,
        inputs,
        { ...context, agent: agentName, memoryContext, selectedModel: modelSelection.model }
      );

      // Step 5: Record execution (triggers learning loop)
      const recordedExecution = {
        executionId,
        agentName,
        skillName,
        inputs,
        outputs: executionResult.outputs,
        success: executionResult.status === 'SUCCESS',
        duration: Date.now() - startTime,
        modelUsed: modelSelection.model,
        costEstimate: this._estimateCost(modelSelection.model, executionResult),
        timestamp: new Date().toISOString()
      };

      // Record with learning loop (may trigger auto-skill creation)
      await this.skillLearningLoop.recordExecution(
        agentName,
        skillName,
        {
          success: recordedExecution.success,
          duration: recordedExecution.duration,
          inputs,
          outputs: executionResult.outputs,
          steps: executionResult.steps || [],
          errors: executionResult.errors || []
        }
      );

      // Step 6: Store episodic memory for agent
      this.memorySystem.storeEpisodic(
        agentName,
        {
          description: `Executed skill: ${skillName}`,
          success: recordedExecution.success,
          duration: recordedExecution.duration,
          model: modelSelection.model,
          cost: recordedExecution.costEstimate
        },
        [skillName, 'skill-execution', recordedExecution.success ? 'success' : 'failure']
      );

      // Step 7: Update routing metrics for next time
      this.smartRouter.recordExecution(
        modelSelection.model,
        skillName,
        {
          success: recordedExecution.success,
          cost: recordedExecution.costEstimate,
          latency: recordedExecution.duration,
          tokensUsed: executionResult.tokensUsed || 0
        }
      );

      // Step 8: Track skill performance
      this._updateSkillMetrics(skillName, recordedExecution);

      // Step 9: Track agent stats
      this._updateAgentStats(agentName, recordedExecution);

      // Step 10: Save to database
      await this.database.saveExecution(recordedExecution);

      // Return complete result
      return {
        status: 'SUCCESS',
        executionId,
        agent: agentName,
        skill: skillName,
        outputs: executionResult.outputs,
        steps: executionResult.steps,
        success: recordedExecution.success,
        duration: recordedExecution.duration,
        modelUsed: modelSelection.model,
        modelReason: modelSelection.reason,
        costEstimate: recordedExecution.costEstimate,
        memoryRecalled: memoryContext ? true : false,
        timestamp: recordedExecution.timestamp
      };

    } catch (error) {
      console.error(`[ORCHESTRATOR] Error executing ${skillName} for ${agentName}:`, error.message);
      return {
        status: 'ERROR',
        error: error.message,
        executionId,
        agent: agentName,
        skill: skillName,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * BATCH EXECUTE SKILLS
   * Execute multiple skills in sequence or parallel
   */
  async batchExecuteSkills(agentName, skillRequests, options = {}) {
    const parallel = options.parallel || false;
    const stopOnError = options.stopOnError !== false;

    const results = [];

    if (parallel) {
      // Execute all in parallel
      const promises = skillRequests.map(req =>
        this.executeSkillForAgent(agentName, req.skillName, req.inputs, req.context)
      );
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      // Execute sequentially
      for (const request of skillRequests) {
        const result = await this.executeSkillForAgent(
          agentName,
          request.skillName,
          request.inputs,
          request.context
        );

        results.push(result);

        if (stopOnError && result.status === 'ERROR') {
          break;
        }
      }
    }

    return {
      total: skillRequests.length,
      successful: results.filter(r => r.status === 'SUCCESS').length,
      failed: results.filter(r => r.status === 'ERROR').length,
      results
    };
  }

  /**
   * RECALL CONTEXT FOR AGENT
   * Get relevant memories before executing task
   */
  recallContextForAgent(agentName, taskDescription, options = {}) {
    const memories = this.memorySystem.recallRelevant(agentName, taskDescription, {
      maxResults: options.maxResults || 5,
      types: options.types || ['episodic', 'procedural']
    });

    const memoryBlock = this.memorySystem.buildMemoryContext(agentName, taskDescription);

    return {
      memories,
      formattedContext: memoryBlock,
      count: memories.length,
      isEmpty: memories.length === 0
    };
  }

  /**
   * SUGGEST NEXT SKILL
   * Based on agent's execution history, suggest what to do next
   */
  suggestNextSkill(agentName, currentTask) {
    const agentStats = this.agentExecutionStats.get(agentName);
    if (!agentStats) return null;

    // Get skills this agent commonly uses
    const commonSkills = agentStats.frequentlyUsed
      .filter(s => s.successRate > 0.7)
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 5);

    // Search for related skills
    const relatedSkills = this.skillsManager.searchSkills(currentTask, {
      agent: agentName,
      limit: 5
    });

    return {
      basedOnHistory: commonSkills,
      relatedToTask: relatedSkills,
      recommendation: relatedSkills[0] || commonSkills[0]
    };
  }

  /**
   * GET SKILL RECOMMENDATIONS
   * What skills improved most recently? What should agent focus on?
   */
  getSkillRecommendations(agentName, limit = 10) {
    const agentStats = this.agentExecutionStats.get(agentName);
    if (!agentStats) return [];

    return agentStats.frequentlyUsed
      .sort((a, b) => {
        // Prioritize: recently improved, high success rate, frequently used
        const aScore = (a.recentImprovement || 0) * 0.4 + a.successRate * 0.3 + (a.executions / 100) * 0.3;
        const bScore = (b.recentImprovement || 0) * 0.4 + b.successRate * 0.3 + (b.executions / 100) * 0.3;
        return bScore - aScore;
      })
      .slice(0, limit)
      .map(s => ({
        skillName: s.name,
        executions: s.executions,
        successRate: (s.successRate * 100).toFixed(1) + '%',
        avgTime: s.avgDuration + 'ms',
        recentTrend: s.recentImprovement ? 'improving' : 'stable'
      }));
  }

  /**
   * GET ORCHESTRATOR STATS
   * Overall system performance
   */
  getStats(agentName = null) {
    if (agentName) {
      return this.agentExecutionStats.get(agentName) || {
        agent: agentName,
        executions: 0,
        successRate: 'N/A',
        totalTime: 0,
        mostUsedSkill: 'N/A'
      };
    }

    // Aggregate stats across all agents
    const stats = {
      totalExecutions: this.executionHistory.length,
      agents: Array.from(this.agentExecutionStats.entries()).map(([agent, data]) => ({
        agent,
        executions: data.totalExecutions,
        successRate: (data.successCount / data.totalExecutions * 100).toFixed(1) + '%',
        avgDuration: (data.totalDuration / data.totalExecutions).toFixed(0) + 'ms'
      })),
      topSkills: Array.from(this.skillMetrics.values())
        .sort((a, b) => b.executions - a.executions)
        .slice(0, 10)
        .map(s => ({
          skillName: s.name,
          executions: s.executions,
          successRate: (s.successCount / s.executions * 100).toFixed(1) + '%',
          avgCost: '$' + (s.totalCost / s.executions).toFixed(4)
        })),
      modelDistribution: this.smartRouter.getModelStats(),
      systemHealth: this._calculateSystemHealth()
    };

    return stats;
  }

  /**
   * UPDATE SKILL METRICS
   * Track performance of each skill
   */
  _updateSkillMetrics(skillName, execution) {
    if (!this.skillMetrics.has(skillName)) {
      this.skillMetrics.set(skillName, {
        name: skillName,
        executions: 0,
        successCount: 0,
        totalCost: 0,
        totalDuration: 0,
        lastExecution: null
      });
    }

    const metrics = this.skillMetrics.get(skillName);
    metrics.executions++;
    if (execution.success) metrics.successCount++;
    metrics.totalCost += execution.costEstimate || 0;
    metrics.totalDuration += execution.duration || 0;
    metrics.lastExecution = execution.timestamp;
  }

  /**
   * UPDATE AGENT STATS
   * Track which skills each agent uses and their performance
   */
  _updateAgentStats(agentName, execution) {
    if (!this.agentExecutionStats.has(agentName)) {
      this.agentExecutionStats.set(agentName, {
        agent: agentName,
        totalExecutions: 0,
        successCount: 0,
        totalDuration: 0,
        totalCost: 0,
        frequentlyUsed: [],
        lastExecution: null
      });
    }

    const stats = this.agentExecutionStats.get(agentName);
    stats.totalExecutions++;
    if (execution.success) stats.successCount++;
    stats.totalDuration += execution.duration || 0;
    stats.totalCost += execution.costEstimate || 0;
    stats.lastExecution = execution.timestamp;

    // Track which skills this agent uses
    let skillEntry = stats.frequentlyUsed.find(s => s.name === execution.skillName);
    if (!skillEntry) {
      skillEntry = {
        name: execution.skillName,
        executions: 0,
        successRate: 0,
        avgDuration: 0
      };
      stats.frequentlyUsed.push(skillEntry);
    }

    skillEntry.executions++;
    skillEntry.avgDuration = stats.totalDuration / stats.totalExecutions;
    skillEntry.successRate = stats.successCount / stats.totalExecutions;
  }

  /**
   * ESTIMATE COST
   * Based on model and execution result
   */
  _estimateCost(modelKey, executionResult) {
    const model = this.smartRouter.modelMetrics.get(modelKey);
    if (!model) return 0;

    const tokensUsed = executionResult.tokensUsed || 1000; // Default estimate
    return tokensUsed * model.costPerToken;
  }

  /**
   * CALCULATE SYSTEM HEALTH
   * Overall performance metric
   */
  _calculateSystemHealth() {
    if (this.executionHistory.length === 0) {
      return { status: 'unknown', score: 0 };
    }

    const successful = this.executionHistory.filter(e => e.success).length;
    const successRate = successful / this.executionHistory.length;

    const avgCost = this.executionHistory.reduce((sum, e) => sum + (e.costEstimate || 0), 0) / this.executionHistory.length;
    const avgDuration = this.executionHistory.reduce((sum, e) => sum + (e.duration || 0), 0) / this.executionHistory.length;

    let score = successRate * 100; // 0-100 based on success rate

    // Penalize slow execution
    if (avgDuration > 5000) score -= 10;
    if (avgDuration > 10000) score -= 20;

    // Penalize high cost
    if (avgCost > 0.01) score -= 5;
    if (avgCost > 0.05) score -= 15;

    const status = score >= 80 ? 'healthy' : score >= 60 ? 'caution' : 'degraded';

    return {
      status,
      score: Math.max(0, Math.min(100, score)).toFixed(1),
      successRate: (successRate * 100).toFixed(1) + '%',
      avgCost: '$' + avgCost.toFixed(4),
      avgDuration: avgDuration.toFixed(0) + 'ms'
    };
  }

  /**
   * GET OPTIMIZATION OPPORTUNITIES
   * What should be improved?
   */
  getOptimizations() {
    const suggestions = [];

    // Check skill performance
    for (const [name, metrics] of this.skillMetrics) {
      const successRate = metrics.successCount / metrics.executions;

      if (successRate < 0.7) {
        suggestions.push({
          type: 'skill-reliability',
          skill: name,
          severity: 'high',
          message: `Success rate ${(successRate * 100).toFixed(0)}% is below 70%. Review and optimize.`,
          action: 'review-skill-errors'
        });
      }

      const avgDuration = metrics.totalDuration / metrics.executions;
      if (avgDuration > 5000) {
        suggestions.push({
          type: 'skill-performance',
          skill: name,
          severity: 'medium',
          message: `Average duration ${avgDuration.toFixed(0)}ms. Optimize slow steps.`,
          action: 'profile-skill-steps'
        });
      }

      const avgCost = metrics.totalCost / metrics.executions;
      if (avgCost > 0.01) {
        suggestions.push({
          type: 'skill-cost',
          skill: name,
          severity: 'low',
          message: `Average cost $${avgCost.toFixed(4)}. Consider cheaper model.`,
          action: 'route-to-cheaper-model'
        });
      }
    }

    // Check agent performance
    for (const [agent, stats] of this.agentExecutionStats) {
      const successRate = stats.successCount / stats.totalExecutions;

      if (successRate < 0.75) {
        suggestions.push({
          type: 'agent-performance',
          agent,
          severity: 'high',
          message: `Agent success rate ${(successRate * 100).toFixed(0)}%. Inject relevant memories.`,
          action: 'enhance-memory-context'
        });
      }
    }

    return suggestions.sort((a, b) => {
      const severityMap = { high: 0, medium: 1, low: 2 };
      return severityMap[a.severity] - severityMap[b.severity];
    });
  }

  /**
   * EXPORT STATE
   * Save full orchestrator state
   */
  exportState() {
    return {
      executionHistory: this.executionHistory,
      agentStats: Array.from(this.agentExecutionStats.entries()).map(([agent, stats]) => ({
        agent,
        ...stats
      })),
      skillMetrics: Array.from(this.skillMetrics.entries()).map(([skill, metrics]) => ({
        skill,
        ...metrics
      })),
      systemHealth: this._calculateSystemHealth(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SkillOrchestrator;
