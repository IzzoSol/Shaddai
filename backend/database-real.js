/**
 * DATABASE REAL v2 — Production-Grade Persistence
 * File-based with in-memory indexing, query optimization, cleanup, and export
 * Ready to migrate to PostgreSQL/MongoDB later
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DatabaseReal {
  constructor(storagePath = path.join(__dirname, 'data')) {
    this.storagePath = storagePath;
    this._ensureDirectories();

    // In-memory indices for fast queries (optimized)
    this.executionIndex = new Map(); // executionId → execution
    this.agentIndex = new Map(); // agentName → Set of executionIds
    this.skillIndex = new Map(); // skillName → Set of executionIds
    this.memoryIndex = new Map(); // memoryId → memory
    this.jobIndex = new Map(); // jobId → job
    this.timestampIndex = new Map(); // date → Set of executionIds
    this.statusIndex = new Map(); // status → Set of executionIds

    // Statistics cache
    this.statsCache = new Map();
    this.lastStatsUpdate = 0;

    // Load all data on startup
    this._loadAllData();

    // Periodic cleanup (every hour)
    setInterval(() => this.maintenanceRoutine(), 3600000);
  }

  /**
   * ENSURE DIRECTORIES
   */
  _ensureDirectories() {
    const dirs = [
      this.storagePath,
      path.join(this.storagePath, 'executions'),
      path.join(this.storagePath, 'memories'),
      path.join(this.storagePath, 'skills'),
      path.join(this.storagePath, 'agents'),
      path.join(this.storagePath, 'optimizations'),
      path.join(this.storagePath, 'archives'),
      path.join(this.storagePath, 'jobs'),
      path.join(this.storagePath, 'exports')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * LOAD ALL DATA — Initialize indices with optimization
   */
  _loadAllData() {
    try {
      const startTime = Date.now();

      // Load executions
      const executionDir = path.join(this.storagePath, 'executions');
      if (fs.existsSync(executionDir)) {
        const files = fs.readdirSync(executionDir).filter(f => f.endsWith('.json'));

        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(executionDir, file), 'utf8'));
            this._indexExecution(data);
          } catch (e) {
            console.warn(`[DB] Error loading execution ${file}:`, e.message);
          }
        }
      }

      // Load jobs
      const jobDir = path.join(this.storagePath, 'jobs');
      if (fs.existsSync(jobDir)) {
        const files = fs.readdirSync(jobDir).filter(f => f.endsWith('.json'));

        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(jobDir, file), 'utf8'));
            this.jobIndex.set(data.id, data);
          } catch (e) {
            console.warn(`[DB] Error loading job ${file}:`, e.message);
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[DB] Loaded ${this.executionIndex.size} executions, ${this.jobIndex.size} jobs in ${duration}ms`);
    } catch (e) {
      console.error('[DB] Error loading data:', e.message);
    }
  }

  /**
   * INDEX EXECUTION for fast queries
   */
  _indexExecution(data) {
    const id = data.executionId;

    // Main index
    this.executionIndex.set(id, data);

    // Agent index
    if (data.agentName) {
      if (!this.agentIndex.has(data.agentName)) {
        this.agentIndex.set(data.agentName, new Set());
      }
      this.agentIndex.get(data.agentName).add(id);
    }

    // Skill index
    if (data.skillName) {
      if (!this.skillIndex.has(data.skillName)) {
        this.skillIndex.set(data.skillName, new Set());
      }
      this.skillIndex.get(data.skillName).add(id);
    }

    // Status index
    if (data.status) {
      if (!this.statusIndex.has(data.status)) {
        this.statusIndex.set(data.status, new Set());
      }
      this.statusIndex.get(data.status).add(id);
    }

    // Timestamp index (by date)
    if (data.timestamp) {
      const date = data.timestamp.split('T')[0];
      if (!this.timestampIndex.has(date)) {
        this.timestampIndex.set(date, new Set());
      }
      this.timestampIndex.get(date).add(id);
    }
  }

  /**
   * SAVE EXECUTION
   */
  async saveExecution(execution) {
    try {
      const id = execution.executionId || `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const enriched = {
        ...execution,
        executionId: id,
        savedAt: new Date().toISOString()
      };

      const filename = `${id}.json`;
      const filepath = path.join(this.storagePath, 'executions', filename);

      fs.writeFileSync(filepath, JSON.stringify(enriched, null, 2));

      // Update indices
      this._indexExecution(enriched);

      // Invalidate stats cache
      this.statsCache.clear();

      return { saved: true, executionId: id };

    } catch (error) {
      console.error('[DB] Error saving execution:', error);
      return { saved: false, error: error.message };
    }
  }

  /**
   * GET EXECUTIONS FOR AGENT — Optimized with index
   */
  getExecutionsForAgent(agentName, limit = 100) {
    const ids = this.agentIndex.get(agentName);
    if (!ids) return [];

    return Array.from(ids)
      .map(id => this.executionIndex.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * GET EXECUTIONS FOR SKILL
   */
  getExecutionsForSkill(skillName, limit = 100) {
    const ids = this.skillIndex.get(skillName);
    if (!ids) return [];

    return Array.from(ids)
      .map(id => this.executionIndex.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * GET EXECUTION
   */
  getExecution(executionId) {
    return this.executionIndex.get(executionId);
  }

  /**
   * QUERY EXECUTIONS — Optimized with indices
   */
  queryExecutions(filters = {}) {
    let results = [];

    // Use indices when possible
    if (filters.agent && filters.skill) {
      // Agent AND Skill
      const agentIds = this.agentIndex.get(filters.agent) || new Set();
      const skillIds = this.skillIndex.get(filters.skill) || new Set();
      const intersection = new Set([...agentIds].filter(x => skillIds.has(x)));
      results = Array.from(intersection).map(id => this.executionIndex.get(id)).filter(Boolean);
    } else if (filters.agent) {
      // Agent only
      const ids = this.agentIndex.get(filters.agent) || new Set();
      results = Array.from(ids).map(id => this.executionIndex.get(id)).filter(Boolean);
    } else if (filters.skill) {
      // Skill only
      const ids = this.skillIndex.get(filters.skill) || new Set();
      results = Array.from(ids).map(id => this.executionIndex.get(id)).filter(Boolean);
    } else if (filters.status) {
      // Status only
      const ids = this.statusIndex.get(filters.status) || new Set();
      results = Array.from(ids).map(id => this.executionIndex.get(id)).filter(Boolean);
    } else {
      // No index available, use full scan
      results = Array.from(this.executionIndex.values());
    }

    // Apply remaining filters
    if (filters.success !== undefined) {
      results = results.filter(e => e.success === filters.success);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    if (filters.minCost !== undefined) {
      results = results.filter(e => (e.costEstimate || 0) >= filters.minCost);
    }

    if (filters.maxCost !== undefined) {
      results = results.filter(e => (e.costEstimate || 0) <= filters.maxCost);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit results
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * SAVE MEMORY
   */
  async saveMemory(memory) {
    try {
      const id = memory.id || `mem-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const enriched = {
        ...memory,
        id,
        savedAt: new Date().toISOString()
      };

      const filename = `${id}.json`;
      const filepath = path.join(this.storagePath, 'memories', filename);

      fs.writeFileSync(filepath, JSON.stringify(enriched, null, 2));
      this.memoryIndex.set(id, enriched);

      return { saved: true, memoryId: id };

    } catch (error) {
      console.error('[DB] Error saving memory:', error);
      return { saved: false, error: error.message };
    }
  }

  /**
   * GET MEMORIES
   */
  getMemories(filters = {}) {
    let results = Array.from(this.memoryIndex.values());

    if (filters.agent) {
      results = results.filter(m => m.agent === filters.agent);
    }

    if (filters.type) {
      results = results.filter(m => m.type === filters.type);
    }

    if (filters.tag) {
      results = results.filter(m => (m.tags || []).includes(filters.tag));
    }

    results.sort((a, b) => new Date(b.timestamp || b.savedAt) - new Date(a.timestamp || a.savedAt));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * SAVE JOB
   */
  async saveJob(job) {
    try {
      const id = job.id || `job_${Date.now()}`;
      const enriched = {
        ...job,
        id,
        savedAt: new Date().toISOString()
      };

      const filename = `${id}.json`;
      const filepath = path.join(this.storagePath, 'jobs', filename);

      fs.writeFileSync(filepath, JSON.stringify(enriched, null, 2));
      this.jobIndex.set(id, enriched);

      // Invalidate stats cache
      this.statsCache.clear();

      return { saved: true, jobId: id };

    } catch (error) {
      console.error('[DB] Error saving job:', error);
      return { saved: false, error: error.message };
    }
  }

  /**
   * QUERY JOBS
   */
  queryJobs(filters = {}) {
    let results = Array.from(this.jobIndex.values());

    if (filters.status) {
      results = results.filter(j => j.status === filters.status);
    }

    if (filters.agent) {
      results = results.filter(j => j.targetAgents?.includes(filters.agent));
    }

    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * GET JOB
   */
  getJob(jobId) {
    return this.jobIndex.get(jobId);
  }

  /**
   * SAVE SKILL METRICS
   */
  async saveSkillMetrics(skillName, metrics) {
    try {
      const filepath = path.join(this.storagePath, 'skills', `${skillName}.json`);
      const data = {
        skillName,
        ...metrics,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return { saved: true, skillName };

    } catch (error) {
      console.error('[DB] Error saving skill metrics:', error);
      return { saved: false, error: error.message };
    }
  }

  /**
   * GET SKILL METRICS
   */
  getSkillMetrics(skillName) {
    try {
      const filepath = path.join(this.storagePath, 'skills', `${skillName}.json`);

      if (fs.existsSync(filepath)) {
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
      }

      return null;

    } catch (error) {
      console.error('[DB] Error reading skill metrics:', error);
      return null;
    }
  }

  /**
   * GET EXECUTION STATS (cached)
   */
  getExecutionStats() {
    const now = Date.now();
    // Cache for 5 seconds
    if (this.lastStatsUpdate > now - 5000 && this.statsCache.has('execStats')) {
      return this.statsCache.get('execStats');
    }

    const stats = {
      total: this.executionIndex.size,
      byAgent: {},
      byStatus: {}
    };

    for (const [agent, ids] of this.agentIndex.entries()) {
      stats.byAgent[agent] = ids.size;
    }

    for (const [status, ids] of this.statusIndex.entries()) {
      stats.byStatus[status] = ids.size;
    }

    this.statsCache.set('execStats', stats);
    this.lastStatsUpdate = now;

    return stats;
  }

  /**
   * GET AGENT STATS
   */
  getAgentStats(agentName) {
    const executions = this.getExecutionsForAgent(agentName, 1000);

    if (executions.length === 0) {
      return {
        agent: agentName,
        totalExecutions: 0,
        successRate: '0%',
        avgDuration: 0,
        totalCost: 0
      };
    }

    const successful = executions.filter(e => e.status === 'SUCCESS').length;
    const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0);
    const totalCost = executions.reduce((sum, e) => sum + (e.costEstimate || 0), 0);

    return {
      agent: agentName,
      totalExecutions: executions.length,
      successRate: ((successful / executions.length) * 100).toFixed(1) + '%',
      avgDuration: (totalDuration / executions.length).toFixed(0) + 'ms',
      totalCost: '$' + totalCost.toFixed(4),
      recentAvgDuration: (executions.slice(0, 10).reduce((sum, e) => sum + (e.duration || 0), 0) / Math.min(10, executions.length)).toFixed(0) + 'ms'
    };
  }

  /**
   * GET STATISTICS (cached)
   */
  getStatistics(agentName = null, skillName = null) {
    let executions = Array.from(this.executionIndex.values());

    if (agentName) {
      executions = executions.filter(e => e.agentName === agentName);
    }

    if (skillName) {
      executions = executions.filter(e => e.skillName === skillName);
    }

    if (executions.length === 0) {
      return {
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        successRate: '0%',
        avgDuration: '0ms',
        totalCost: '$0.00',
        avgCost: '$0.00'
      };
    }

    const successful = executions.filter(e => e.status === 'SUCCESS').length;
    const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0);
    const totalCost = executions.reduce((sum, e) => sum + (e.costEstimate || 0), 0);

    return {
      totalExecutions: executions.length,
      successCount: successful,
      failureCount: executions.length - successful,
      successRate: ((successful / executions.length) * 100).toFixed(1) + '%',
      avgDuration: (totalDuration / executions.length).toFixed(0) + 'ms',
      totalCost: '$' + totalCost.toFixed(2),
      avgCost: '$' + (totalCost / executions.length).toFixed(6)
    };
  }

  /**
   * CLEANUP OLD DATA — Archive executions older than threshold
   */
  async cleanupOldData(ageThresholdDays = 90) {
    try {
      const threshold = Date.now() - (ageThresholdDays * 24 * 60 * 60 * 1000);
      const executionDir = path.join(this.storagePath, 'executions');
      const archiveDir = path.join(this.storagePath, 'archives');

      let archivedCount = 0;
      const toDelete = [];

      for (const [id, execution] of this.executionIndex) {
        const execTime = new Date(execution.timestamp).getTime();

        if (execTime < threshold) {
          try {
            const sourceFile = path.join(executionDir, `${id}.json`);
            const archiveFile = path.join(archiveDir, `${id}.json`);

            if (fs.existsSync(sourceFile)) {
              fs.renameSync(sourceFile, archiveFile);
              toDelete.push(id);
              archivedCount++;
            }
          } catch (e) {
            console.warn('[DB] Error archiving execution:', e.message);
          }
        }
      }

      // Remove from indices
      for (const id of toDelete) {
        const execution = this.executionIndex.get(id);
        this.executionIndex.delete(id);

        if (execution?.agentName) {
          this.agentIndex.get(execution.agentName)?.delete(id);
        }
        if (execution?.skillName) {
          this.skillIndex.get(execution.skillName)?.delete(id);
        }
        if (execution?.status) {
          this.statusIndex.get(execution.status)?.delete(id);
        }
      }

      this.statsCache.clear();

      return {
        archived: archivedCount,
        threshold: ageThresholdDays + ' days',
        remainingExecutions: this.executionIndex.size
      };

    } catch (error) {
      console.error('[DB] Error during cleanup:', error);
      return { archived: 0, error: error.message };
    }
  }

  /**
   * EXPORT DATA — Full backup with format options
   */
  async exportData(format = 'json') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let output;
      let filename;

      const backup = {
        exportedAt: new Date().toISOString(),
        executions: Array.from(this.executionIndex.values()),
        jobs: Array.from(this.jobIndex.values()),
        memories: Array.from(this.memoryIndex.values()),
        statistics: {
          totalExecutions: this.executionIndex.size,
          totalJobs: this.jobIndex.size,
          totalMemories: this.memoryIndex.size,
          agents: Array.from(this.agentIndex.keys()),
          skills: Array.from(this.skillIndex.keys())
        }
      };

      if (format === 'json') {
        filename = `backup-${timestamp}.json`;
        output = path.join(this.storagePath, 'exports', filename);
        fs.writeFileSync(output, JSON.stringify(backup, null, 2));
      } else if (format === 'csv') {
        filename = `executions-${timestamp}.csv`;
        output = path.join(this.storagePath, 'exports', filename);

        const csv = [
          'executionId,agentName,skillName,status,duration,timestamp'
        ];

        for (const exec of backup.executions) {
          csv.push(
            `"${exec.executionId}","${exec.agentName}","${exec.skillName}","${exec.status}",${exec.duration},"${exec.timestamp}"`
          );
        }

        fs.writeFileSync(output, csv.join('\n'));
      }

      const stats = fs.statSync(output);

      return {
        exported: true,
        format,
        path: output,
        filename,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        recordCount: {
          executions: backup.executions.length,
          jobs: backup.jobs.length,
          memories: backup.memories.length
        }
      };

    } catch (error) {
      console.error('[DB] Error during export:', error);
      return { exported: false, error: error.message };
    }
  }

  /**
   * GET DATABASE SIZE
   */
  getDatabaseSize() {
    try {
      const dirs = ['executions', 'memories', 'jobs', 'skills', 'archives'];
      const sizeInfo = {};
      let totalSize = 0;

      for (const dir of dirs) {
        const fullPath = path.join(this.storagePath, dir);
        if (!fs.existsSync(fullPath)) continue;

        const files = fs.readdirSync(fullPath);
        let size = 0;

        for (const file of files) {
          const stat = fs.statSync(path.join(fullPath, file));
          size += stat.size;
        }

        sizeInfo[dir] = (size / 1024 / 1024).toFixed(2) + ' MB';
        totalSize += size;
      }

      return {
        ...sizeInfo,
        total: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
        executionCount: this.executionIndex.size,
        jobCount: this.jobIndex.size,
        memoryCount: this.memoryIndex.size
      };

    } catch (error) {
      console.error('[DB] Error getting size:', error);
      return { error: error.message };
    }
  }

  /**
   * MAINTENANCE ROUTINE — Run hourly
   */
  async maintenanceRoutine() {
    try {
      console.log('[DB] Running maintenance routine...');

      // Clear old stats cache
      if (this.statsCache.size > 100) {
        this.statsCache.clear();
      }

      // Log current state
      console.log(`[DB] Indices status:
        - Executions: ${this.executionIndex.size}
        - Jobs: ${this.jobIndex.size}
        - Memories: ${this.memoryIndex.size}
        - Agents tracked: ${this.agentIndex.size}
        - Skills tracked: ${this.skillIndex.size}
      `);
    } catch (error) {
      console.error('[DB] Error during maintenance:', error);
    }
  }

  /**
   * SAVE AGENT STATE
   */
  async saveAgentState(agentName, state) {
    try {
      const filepath = path.join(this.storagePath, 'agents', `${agentName}.json`);
      const data = {
        agentName,
        ...state,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return { saved: true, agentName };

    } catch (error) {
      console.error('[DB] Error saving agent state:', error);
      return { saved: false, error: error.message };
    }
  }

  /**
   * LOAD AGENT STATES
   */
  loadAgentStates() {
    try {
      const agentDir = path.join(this.storagePath, 'agents');
      if (!fs.existsSync(agentDir)) return {};

      const states = {};
      const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const agentName = file.replace('.json', '');
        states[agentName] = JSON.parse(fs.readFileSync(path.join(agentDir, file), 'utf8'));
      }

      return states;

    } catch (error) {
      console.error('[DB] Error loading agent states:', error);
      return {};
    }
  }

  /**
   * SAVE OPTIMIZATION RECORD
   */
  async saveOptimization(optimization) {
    try {
      const id = optimization.executionId || `opt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const enriched = {
        ...optimization,
        executionId: id,
        savedAt: new Date().toISOString()
      };

      const filename = `${id}.json`;
      const filepath = path.join(this.storagePath, 'optimizations', filename);

      fs.writeFileSync(filepath, JSON.stringify(enriched, null, 2));
      return { saved: true, optimizationId: id };

    } catch (error) {
      console.error('[DB] Error saving optimization:', error);
      return { saved: false, error: error.message };
    }
  }
}

module.exports = DatabaseReal;
