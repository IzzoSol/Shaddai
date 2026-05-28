/**
 * BACKGROUND JOBS — Continuous system maintenance and optimization
 * Runs independently: memory consolidation, skill optimization, analytics, cleanup
 */

class BackgroundJobs {
  constructor(orchestrator, memorySystem, optimizer, database, skillLearningLoop) {
    this.orchestrator = orchestrator;
    this.memorySystem = memorySystem;
    this.optimizer = optimizer;
    this.database = database;
    this.skillLearningLoop = skillLearningLoop;

    this.jobs = new Map();
    this.isRunning = false;
    this.results = [];
  }

  /**
   * START ALL JOBS
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[BACKGROUND JOBS] Starting...');

    // Memory consolidation every 5 minutes
    this._scheduleJob('consolidate-memory', 5 * 60 * 1000, this.consolidateMemories.bind(this));

    // Skill optimization every 10 minutes
    this._scheduleJob('optimize-skills', 10 * 60 * 1000, this.optimizeSkills.bind(this));

    // Analytics summary every 15 minutes
    this._scheduleJob('update-analytics', 15 * 60 * 1000, this.updateAnalytics.bind(this));

    // Database cleanup every 30 minutes
    this._scheduleJob('cleanup-database', 30 * 60 * 1000, this.cleanupDatabase.bind(this));

    // Forget old memories every 60 minutes
    this._scheduleJob('forget-old-memories', 60 * 60 * 1000, this.forgetOldMemories.bind(this));

    // Health check every 5 minutes
    this._scheduleJob('health-check', 5 * 60 * 1000, this.performHealthCheck.bind(this));

    console.log('[BACKGROUND JOBS] Started. 6 jobs scheduled.');
  }

  /**
   * STOP ALL JOBS
   */
  stop() {
    this.isRunning = false;

    for (const [name, handle] of this.jobs) {
      clearInterval(handle);
    }

    this.jobs.clear();
    console.log('[BACKGROUND JOBS] Stopped.');
  }

  /**
   * SCHEDULE JOB
   */
  _scheduleJob(name, interval, fn) {
    const handle = setInterval(async () => {
      try {
        const result = await fn();
        this.results.push({
          jobName: name,
          status: 'SUCCESS',
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.results.push({
          jobName: name,
          status: 'ERROR',
          error: error.message,
          timestamp: new Date().toISOString()
        });

        console.error(`[BACKGROUND JOBS] ${name} failed:`, error.message);
      }
    }, interval);

    this.jobs.set(name, handle);
  }

  /**
   * CONSOLIDATE MEMORIES
   * Merge similar memories to reduce storage
   */
  async consolidateMemories() {
    try {
      const before = this.memorySystem.episodic.length;
      const result = this.memorySystem.consolidateMemories();
      const after = this.memorySystem.episodic.length;

      return {
        action: 'consolidate-memories',
        before,
        after,
        merged: result.merged,
        saved: after < before
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * OPTIMIZE SKILLS
   * Analyze and suggest optimizations for underperforming skills
   */
  async optimizeSkills() {
    try {
      const skills = Array.from(this.orchestrator.skillMetrics.entries());

      if (skills.length === 0) {
        return { action: 'optimize-skills', optimized: 0, message: 'No skills to optimize' };
      }

      const optimized = [];

      for (const [name, metrics] of skills) {
        if (metrics.executions < 2) continue; // Skip skills with few executions

        const successRate = metrics.successCount / metrics.executions;
        const avgDuration = metrics.totalDuration / metrics.executions;

        // Flag for optimization if:
        // - Success rate < 80% OR
        // - Average duration > 5000ms
        if (successRate < 0.8 || avgDuration > 5000) {
          const roadmap = this.optimizer.getOptimizationRoadmap(name);

          optimized.push({
            skillName: name,
            successRate: (successRate * 100).toFixed(1) + '%',
            avgDuration: avgDuration.toFixed(0) + 'ms',
            optimizationsNeeded: roadmap.roadmap.length
          });
        }
      }

      return {
        action: 'optimize-skills',
        skillsAnalyzed: skills.length,
        skillsOptimized: optimized.length,
        optimizations: optimized
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * UPDATE ANALYTICS
   * Generate system analytics summary
   */
  async updateAnalytics() {
    try {
      const stats = this.orchestrator.getStats();

      const summary = {
        timestamp: new Date().toISOString(),
        totalExecutions: stats.totalExecutions,
        systemHealth: stats.systemHealth,
        topSkills: stats.topSkills?.slice(0, 5),
        agentPerformance: stats.agents?.map(a => ({
          agent: a.agent,
          executions: a.executions,
          successRate: a.successRate
        })),
        modelDistribution: stats.modelDistribution
      };

      // Save to database
      await this.database.saveSkillMetrics('_system_analytics', summary);

      return {
        action: 'update-analytics',
        summary
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * CLEANUP DATABASE
   * Archive old executions, remove duplicates
   */
  async cleanupDatabase() {
    try {
      // Archive executions older than 90 days
      const archived = await this.database.cleanupOldData(90);

      // Get database size
      const size = this.database.getDatabaseSize();

      return {
        action: 'cleanup-database',
        archived: archived.archived,
        databaseSize: size
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * FORGET OLD MEMORIES
   * Remove low-importance old memories
   */
  async forgetOldMemories() {
    try {
      const result = this.memorySystem.forgetOld(
        30,  // Older than 30 days
        0.3  // Importance threshold
      );

      return {
        action: 'forget-old-memories',
        removed: result.removed,
        remaining: result.remaining
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * PERFORM HEALTH CHECK
   * Verify system is functioning properly
   */
  async performHealthCheck() {
    try {
      const orchestratorHealth = this.orchestrator.getStats()?.systemHealth;
      const dbSize = this.database.getDatabaseSize();

      const status = {
        timestamp: new Date().toISOString(),
        orchestrator: orchestratorHealth?.status,
        databaseSize: dbSize.total,
        executionCount: dbSize.executionCount,
        memoryCount: dbSize.memoryCount
      };

      // Check for issues
      const issues = [];

      if (orchestratorHealth?.status === 'degraded') {
        issues.push('Orchestrator degraded');
      }

      if (dbSize.total > '500 MB') {
        issues.push('Database size exceeding threshold');
      }

      return {
        action: 'health-check',
        status,
        issues
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * GET JOB RESULTS
   * View recent job execution results
   */
  getResults(limit = 50) {
    return this.results.slice(-limit);
  }

  /**
   * GET JOB STATUS
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsScheduled: this.jobs.size,
      jobs: Array.from(this.jobs.keys()),
      recentResults: this.results.slice(-10)
    };
  }

  /**
   * CLEAR RESULTS
   */
  clearResults() {
    const count = this.results.length;
    this.results = [];
    return { cleared: count };
  }
}

module.exports = BackgroundJobs;
