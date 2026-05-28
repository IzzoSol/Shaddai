/**
 * AGENT INVOCATION ENGINE v2
 * Connects to REAL agents on ports 8000-8008
 * Executes skills, captures outputs, saves to database
 * Production-grade with retries, error handling, timeouts
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class AgentInvocationEngine extends EventEmitter {
  constructor(database) {
    super();
    this.db = database;

    // Agent ports - REAL agents running locally
    this.agents = {
      SHADDAI: { name: 'SHADDAI', port: 8000, role: 'Supreme Orchestrator' },
      ZEROX: { name: 'ZEROX', port: 8001, role: 'Wealth & Revenue Engine' },
      ORACLE: { name: 'ORACLE', port: 8002, role: 'Research & Intelligence' },
      NEXUS: { name: 'NEXUS', port: 8003, role: 'Technical Architect' },
      TURTLE: { name: 'TURTLE', port: 8004, role: 'UI/UX & Creative' },
      QUILL: { name: 'QUILL', port: 8005, role: 'Writing & Communication' },
      PIKADON: { name: 'PIKADON', port: 8008, role: 'Security & Compliance' }
    };

    // Execution tracking
    this.activeExecutions = new Map();
    this.executionHistory = new Map();
    this.performanceMetrics = new Map();

    // Directories for outputs
    this.outputDir = path.join(__dirname, '../generated-output');
    this.agentOutputDir = path.join(this.outputDir, 'agent-outputs');
    this.logsDir = path.join(__dirname, 'agent-logs');

    this._ensureDirectories();

    // Stats
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalDuration: 0,
      agentStats: new Map()
    };
  }

  /**
   * ENSURE DIRECTORIES exist
   */
  _ensureDirectories() {
    [this.agentOutputDir, this.logsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * INVOKE AGENT — Main method
   * Executes a skill with a specific agent
   * Handles retries, timeouts, error recovery
   */
  async invokeAgent(agentName, skillName, inputs = {}, options = {}) {
    const executionId = `exec_${crypto.randomBytes(12).toString('hex')}`;
    const startTime = Date.now();

    const agent = this.agents[agentName.toUpperCase()];
    if (!agent) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    const maxRetries = options.maxRetries || 3;
    const timeout = options.timeout || 120000; // 2 minutes
    const backoffMultiplier = options.backoffMultiplier || 2;

    // Track execution
    this.activeExecutions.set(executionId, {
      id: executionId,
      agentName,
      skillName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      duration: 0,
      retries: 0
    });

    this.emit('execution-started', { executionId, agentName, skillName });

    console.log(
      `[INVOCATION] Starting ${agentName}::${skillName} (${executionId})`
    );

    let lastError;
    let attempt = 0;

    for (attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._executeWithTimeout(
          agent,
          skillName,
          inputs,
          timeout
        );

        const duration = Date.now() - startTime;

        // Save result
        const execution = {
          id: executionId,
          agentName,
          skillName,
          inputs,
          output: result,
          status: 'success',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration,
          retries: attempt - 1,
          attempts: attempt
        };

        this.executionHistory.set(executionId, execution);
        this.activeExecutions.delete(executionId);

        // Save to database
        this.db.saveExecution(execution);

        // Save to file
        this._saveExecutionToFile(execution);

        // Update stats
        this._updateStats(agentName, skillName, true, duration);

        this.emit('execution-completed', { executionId, success: true, duration });

        console.log(
          `[INVOCATION] ${agentName}::${skillName} completed in ${duration}ms (attempt ${attempt})`
        );

        return {
          status: 'success',
          data: {
            executionId,
            agentName,
            skillName,
            output: result,
            duration,
            retries: attempt - 1
          }
        };
      } catch (error) {
        lastError = error;
        console.warn(
          `[INVOCATION] Attempt ${attempt}/${maxRetries} failed:`,
          error.message
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(
            1000 * Math.pow(backoffMultiplier, attempt - 1),
            30000
          );
          console.log(`[INVOCATION] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;

    const execution = {
      id: executionId,
      agentName,
      skillName,
      inputs,
      output: null,
      error: lastError.message,
      status: 'failed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration,
      retries: maxRetries - 1,
      attempts: maxRetries
    };

    this.executionHistory.set(executionId, execution);
    this.activeExecutions.delete(executionId);

    // Save failed execution
    this.db.saveExecution(execution);
    this._saveExecutionToFile(execution);
    this._updateStats(agentName, skillName, false, duration);

    this.emit('execution-failed', {
      executionId,
      error: lastError.message,
      duration
    });

    console.error(
      `[INVOCATION] ${agentName}::${skillName} failed after ${maxRetries} attempts:`,
      lastError.message
    );

    return {
      status: 'error',
      message: lastError.message,
      data: {
        executionId,
        agentName,
        skillName,
        duration,
        retries: maxRetries - 1,
        error: lastError.message
      }
    };
  }

  /**
   * EXECUTE WITH TIMEOUT
   * Makes HTTP request to agent with timeout guarantee
   */
  _executeWithTimeout(agent, skillName, inputs, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Timeout after ${timeout}ms`));
      }, timeout);

      this._callAgentHTTP(agent, skillName, inputs)
        .then(result => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  /**
   * CALL AGENT VIA HTTP
   * Direct HTTP request to agent port
   */
  _callAgentHTTP(agent, skillName, inputs) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        agent: agent.name,
        role: agent.role,
        skill: skillName,
        inputs: inputs,
        timestamp: new Date().toISOString()
      });

      const options = {
        hostname: 'localhost',
        port: agent.port,
        path: '/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Execution-ID': crypto.randomBytes(8).toString('hex'),
          'X-Agent': agent.name
        },
        timeout: 120000 // 2 minute socket timeout
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;

          // Emit progress if response is streaming
          this.emit('execution-progress', {
            agentName: agent.name,
            chunk: chunk.toString('utf8')
          });
        });

        res.on('end', () => {
          // Check status code
          if (res.statusCode !== 200) {
            return reject(
              new Error(`Agent returned status ${res.statusCode}: ${data}`)
            );
          }

          try {
            const result = JSON.parse(data);

            // Agent can return either { output: ... } or direct output
            if (result.output !== undefined) {
              resolve(result.output);
            } else if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result);
            }
          } catch (parseError) {
            // If not JSON, return raw response
            resolve(data);
          }
        });
      });

      req.on('error', reject);

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Agent request timeout'));
      });

      // Handle connection errors
      req.on('aborted', () => {
        reject(new Error('Agent request aborted'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * SAVE EXECUTION TO FILE
   * Persist execution results to generated-output
   */
  _saveExecutionToFile(execution) {
    try {
      const agentDir = path.join(this.agentOutputDir, execution.agentName);
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }

      const filename = path.join(
        agentDir,
        `${execution.id}-${execution.skillName}.json`
      );

      fs.writeFileSync(filename, JSON.stringify(execution, null, 2));

      // Also save to daily log
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `${execution.agentName}-${date}.log`);
      fs.appendFileSync(logFile, JSON.stringify(execution) + '\n');

      return filename;
    } catch (error) {
      console.error('[INVOCATION] Error saving execution file:', error.message);
    }
  }

  /**
   * UPDATE STATISTICS
   * Track performance by agent and skill
   */
  _updateStats(agentName, skillName, success, duration) {
    // Global stats
    this.stats.totalExecutions++;
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    this.stats.totalDuration += duration;

    // Agent stats
    const agentKey = `${agentName}::${skillName}`;
    if (!this.performanceMetrics.has(agentKey)) {
      this.performanceMetrics.set(agentKey, {
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0
      });
    }

    const metrics = this.performanceMetrics.get(agentKey);
    metrics.executions++;
    if (success) metrics.successes++;
    else metrics.failures++;
    metrics.totalDuration += duration;
    metrics.avgDuration = metrics.totalDuration / metrics.executions;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
  }

  /**
   * GET AGENT STATUS
   * Check if agent is online and responsive
   */
  async getAgentStatus(agentName) {
    const agent = this.agents[agentName.toUpperCase()];
    if (!agent) {
      return { status: 'unknown', message: 'Agent not found' };
    }

    return new Promise(resolve => {
      const req = http.get(
        `http://localhost:${agent.port}/health`,
        { timeout: 5000 },
        (res) => {
          resolve({
            status: res.statusCode === 200 ? 'online' : 'error',
            agentName: agent.name,
            port: agent.port,
            role: agent.role,
            statusCode: res.statusCode
          });
        }
      );

      req.on('error', (error) => {
        resolve({
          status: 'offline',
          agentName: agent.name,
          port: agent.port,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 'timeout',
          agentName: agent.name,
          port: agent.port
        });
      });
    });
  }

  /**
   * GET ALL AGENTS STATUS
   * Check status of all 7 agents
   */
  async getAllAgentsStatus() {
    const statusChecks = Object.keys(this.agents).map(agentName =>
      this.getAgentStatus(agentName)
    );

    const results = await Promise.all(statusChecks);
    const summary = {
      timestamp: new Date().toISOString(),
      online: results.filter(r => r.status === 'online').length,
      offline: results.filter(r => r.status === 'offline').length,
      timeout: results.filter(r => r.status === 'timeout').length,
      agents: results
    };

    return summary;
  }

  /**
   * GET EXECUTION HISTORY
   * Retrieve past executions with filtering
   */
  getExecutionHistory(options = {}) {
    let executions = Array.from(this.executionHistory.values());

    // Filter by agent
    if (options.agentName) {
      executions = executions.filter(
        e => e.agentName === options.agentName
      );
    }

    // Filter by status
    if (options.status) {
      executions = executions.filter(e => e.status === options.status);
    }

    // Sort by created date (newest first)
    executions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const start = (page - 1) * pageSize;

    return {
      total: executions.length,
      page,
      pageSize,
      executions: executions.slice(start, start + pageSize)
    };
  }

  /**
   * GET PERFORMANCE METRICS
   * Get detailed performance stats by agent/skill
   */
  getPerformanceMetrics(agentName = null) {
    const metrics = {};

    for (const [key, data] of this.performanceMetrics.entries()) {
      if (agentName && !key.startsWith(agentName)) {
        continue;
      }

      const successRate =
        data.executions > 0
          ? ((data.successes / data.executions) * 100).toFixed(1)
          : 0;

      metrics[key] = {
        ...data,
        successRate: `${successRate}%`
      };
    }

    return metrics;
  }

  /**
   * GET STATISTICS
   * Overall execution statistics
   */
  getStatistics() {
    const successRate =
      this.stats.totalExecutions > 0
        ? ((this.stats.successfulExecutions / this.stats.totalExecutions) * 100).toFixed(1)
        : 0;

    const avgDuration =
      this.stats.totalExecutions > 0
        ? Math.round(this.stats.totalDuration / this.stats.totalExecutions)
        : 0;

    return {
      totalExecutions: this.stats.totalExecutions,
      successfulExecutions: this.stats.successfulExecutions,
      failedExecutions: this.stats.failedExecutions,
      successRate: `${successRate}%`,
      totalDuration: this.stats.totalDuration,
      avgDuration: `${avgDuration}ms`,
      activeExecutions: this.activeExecutions.size,
      agents: Object.values(this.agents)
    };
  }

  /**
   * CANCEL EXECUTION
   * Stop an in-progress execution
   */
  cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return { status: 'error', message: 'Execution not found or already completed' };
    }

    this.activeExecutions.delete(executionId);
    this.emit('execution-cancelled', { executionId });

    return {
      status: 'success',
      message: `Execution ${executionId} cancelled`
    };
  }

  /**
   * GET ACTIVE EXECUTIONS
   * List all currently running executions
   */
  getActiveExecutions() {
    return {
      count: this.activeExecutions.size,
      executions: Array.from(this.activeExecutions.values())
    };
  }
}

module.exports = AgentInvocationEngine;
