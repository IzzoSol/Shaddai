/**
 * SKILL BRIDGE — Agent Interface to Skill Orchestration
 * Agents use this to execute skills with full error handling, retries, and fallbacks
 *
 * Usage: agent.executeSkill('skill-name', inputs) → returns result
 */

const EventEmitter = require('events');

class SkillBridge extends EventEmitter {
  constructor(orchestrator, memorySystem, database, analytics) {
    super();
    this.orchestrator = orchestrator;
    this.memorySystem = memorySystem;
    this.database = database;
    this.analytics = analytics;

    // Retry and circuit breaker settings
    this.maxRetries = 3;
    this.retryDelay = 500;
    this.circuitBreakerThreshold = 5; // failures before circuit opens
    this.circuitBreakerTimeout = 30000; // milliseconds

    // Circuit breaker state per skill
    this.circuitBreakers = new Map();
  }

  /**
   * EXECUTE SKILL — Agent's primary interface
   * Full error handling, retries, fallbacks, analytics
   */
  async executeSkill(agentName, skillName, inputs = {}, options = {}) {
    const executionId = `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Step 1: Validate inputs
      const validation = this._validateInputs(agentName, skillName, inputs);
      if (!validation.valid) {
        return {
          status: 'VALIDATION_ERROR',
          executionId,
          agent: agentName,
          skill: skillName,
          errors: validation.errors,
          timestamp: new Date().toISOString()
        };
      }

      // Step 2: Check circuit breaker
      const breaker = this._getCircuitBreaker(skillName);
      if (breaker.isOpen) {
        return {
          status: 'CIRCUIT_BREAKER_OPEN',
          executionId,
          agent: agentName,
          skill: skillName,
          message: `Too many failures. Circuit open until ${new Date(breaker.openedAt + this.circuitBreakerTimeout).toISOString()}`,
          timestamp: new Date().toISOString()
        };
      }

      // Step 3: Execute with retries
      let lastError;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const result = await this._executeWithTimeout(
            agentName,
            skillName,
            inputs,
            options,
            executionId,
            attempt
          );

          // Success - reset circuit breaker
          breaker.failureCount = 0;
          breaker.isOpen = false;

          // Record success in analytics
          this.analytics?.recordSkillExecution({
            executionId,
            agent: agentName,
            skill: skillName,
            success: true,
            duration: Date.now() - startTime,
            attempt,
            cost: result.costEstimate
          });

          return result;

        } catch (error) {
          lastError = error;

          if (attempt < this.maxRetries) {
            // Wait before retry (exponential backoff)
            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted - update circuit breaker
      breaker.failureCount++;
      if (breaker.failureCount >= this.circuitBreakerThreshold) {
        breaker.isOpen = true;
        breaker.openedAt = Date.now();
      }

      // Record failure in analytics
      this.analytics?.recordSkillExecution({
        executionId,
        agent: agentName,
        skill: skillName,
        success: false,
        duration: Date.now() - startTime,
        error: lastError.message
      });

      return {
        status: 'ERROR',
        executionId,
        agent: agentName,
        skill: skillName,
        error: lastError.message,
        attempts: this.maxRetries,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[SKILL_BRIDGE] Fatal error in executeSkill:`, error);

      this.analytics?.recordSkillExecution({
        executionId,
        agent: agentName,
        skill: skillName,
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
        fatal: true
      });

      return {
        status: 'FATAL_ERROR',
        executionId,
        agent: agentName,
        skill: skillName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * EXECUTE WITH TIMEOUT
   * Prevents hanging executions
   */
  async _executeWithTimeout(agentName, skillName, inputs, options, executionId, attempt) {
    const timeout = options.timeout || 30000; // 30 second default

    return new Promise(async (resolve, reject) => {
      let completed = false;

      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Skill execution timeout after ${timeout}ms`));
        }
      }, timeout);

      try {
        const result = await this.orchestrator.executeSkillForAgent(
          agentName,
          skillName,
          inputs,
          {
            ...options,
            executionId,
            attempt,
            retryable: attempt < this.maxRetries
          }
        );

        if (!completed) {
          completed = true;
          clearTimeout(timeoutHandle);
          resolve(result);
        }

      } catch (error) {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutHandle);
          reject(error);
        }
      }
    });
  }

  /**
   * VALIDATE INPUTS
   * Check inputs match skill requirements
   */
  _validateInputs(agentName, skillName, inputs) {
    const errors = [];

    // Check agent name
    const validAgents = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
    if (!validAgents.includes(agentName)) {
      errors.push(`Invalid agent: ${agentName}`);
    }

    // Check skill name
    if (!skillName || typeof skillName !== 'string') {
      errors.push('skillName is required and must be a string');
    }

    // Check inputs is object
    if (inputs && typeof inputs !== 'object') {
      errors.push('inputs must be an object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * GET CIRCUIT BREAKER
   * Manage circuit breaker per skill
   */
  _getCircuitBreaker(skillName) {
    if (!this.circuitBreakers.has(skillName)) {
      this.circuitBreakers.set(skillName, {
        isOpen: false,
        failureCount: 0,
        openedAt: null
      });
    }

    const breaker = this.circuitBreakers.get(skillName);

    // Auto-close after timeout
    if (breaker.isOpen && Date.now() - breaker.openedAt > this.circuitBreakerTimeout) {
      breaker.isOpen = false;
      breaker.failureCount = 0;
      breaker.openedAt = null;
    }

    return breaker;
  }

  /**
   * BATCH EXECUTE SKILLS
   * Execute multiple skills with coordination
   */
  async batchExecuteSkills(agentName, skillRequests, options = {}) {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const results = [];
    const parallel = options.parallel || false;
    const stopOnError = options.stopOnError !== false;

    if (parallel) {
      // Execute all in parallel
      const promises = skillRequests.map((req, idx) =>
        this.executeSkill(agentName, req.skillName, req.inputs, {
          ...req.options,
          batchId,
          batchIndex: idx
        })
      );

      const parallelResults = await Promise.allSettled(promises);

      for (const result of parallelResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            status: 'ERROR',
            error: result.reason.message
          });

          if (stopOnError) break;
        }
      }
    } else {
      // Execute sequentially
      for (let i = 0; i < skillRequests.length; i++) {
        const req = skillRequests[i];
        const result = await this.executeSkill(agentName, req.skillName, req.inputs, {
          ...req.options,
          batchId,
          batchIndex: i
        });

        results.push(result);

        if (stopOnError && result.status === 'ERROR') {
          break;
        }
      }
    }

    return {
      batchId,
      agent: agentName,
      total: skillRequests.length,
      executed: results.length,
      successful: results.filter(r => r.status === 'SUCCESS').length,
      failed: results.filter(r => r.status !== 'SUCCESS').length,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * GET SKILL HEALTH
   * Is this skill functioning properly?
   */
  getSkillHealth(skillName) {
    const breaker = this.circuitBreakers.get(skillName);
    const metrics = this.orchestrator.skillMetrics?.get(skillName);

    if (!metrics) {
      return {
        skillName,
        status: 'UNKNOWN',
        message: 'No execution data available'
      };
    }

    const successRate = metrics.successCount / metrics.executions;
    const status = breaker?.isOpen ? 'CIRCUIT_OPEN' :
      successRate < 0.5 ? 'FAILING' :
      successRate < 0.75 ? 'DEGRADED' :
      'HEALTHY';

    return {
      skillName,
      status,
      executions: metrics.executions,
      successRate: (successRate * 100).toFixed(1) + '%',
      avgDuration: (metrics.totalDuration / metrics.executions).toFixed(0) + 'ms',
      avgCost: '$' + (metrics.totalCost / metrics.executions).toFixed(4),
      circuitBreakerOpen: breaker?.isOpen || false,
      failureCount: breaker?.failureCount || 0
    };
  }

  /**
   * PREFETCH MEMORY
   * Load relevant memories before skill execution begins
   */
  async prefetchMemory(agentName, taskDescription, options = {}) {
    try {
      const memories = this.memorySystem?.recallRelevant(agentName, taskDescription, {
        maxResults: options.maxResults || 5,
        types: options.types || ['episodic', 'procedural']
      });

      return {
        status: 'SUCCESS',
        memories,
        count: memories?.length || 0,
        formatted: this.memorySystem?.buildMemoryContext(agentName, taskDescription)
      };

    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message
      };
    }
  }

  /**
   * GET SKILL RECOMMENDATIONS
   * What should this agent do next?
   */
  getRecommendations(agentName, options = {}) {
    try {
      return this.orchestrator.getSkillRecommendations(
        agentName,
        options.limit || 10
      );

    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message
      };
    }
  }

  /**
   * HEALTH CHECK
   * Is the skill system healthy?
   */
  getSystemHealth() {
    const orchestratorHealth = this.orchestrator?.getStats();
    const openCircuits = Array.from(this.circuitBreakers.entries())
      .filter(([_, breaker]) => breaker.isOpen)
      .map(([skill, _]) => skill);

    return {
      status: openCircuits.length > 0 ? 'DEGRADED' : 'HEALTHY',
      orchestrator: orchestratorHealth?.systemHealth,
      circuitBreakersOpen: openCircuits.length,
      failingSkills: openCircuits,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SkillBridge;
