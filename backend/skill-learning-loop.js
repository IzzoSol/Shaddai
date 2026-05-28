/**
 * SKILL LEARNING LOOP — Auto-create and improve skills from agent experience
 * Based on Hermes Agent's learning loop architecture
 *
 * Concept: When agents complete complex tasks, the system:
 * 1. Captures the execution pattern (steps, inputs, outputs)
 * 2. Analyzes success/failure signals
 * 3. Creates reusable skills automatically
 * 4. Improves skills based on usage feedback
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillLearningLoop {
  constructor(skillsManager, skillsDir = path.join(__dirname, 'agents')) {
    this.skillsManager = skillsManager;
    this.skillsDir = skillsDir;

    // Track execution patterns for skill creation
    this.executionHistory = [];
    this.skillPerformance = new Map();
    this.pendingSkillCreation = [];

    // Configuration
    this.minExecutionsBeforeSkillCreation = 2; // Create skill after 2 successful executions
    this.successThresholdForSkill = 0.7; // 70% success rate to create skill
    this.skillImprovementInterval = 5; // Review skills every 5 executions

    this._ensureSkillsDir();
  }

  _ensureSkillsDir() {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * CAPTURE EXECUTION
   * Record when an agent completes a task
   */
  recordExecution(agentName, taskDescription, executionDetails) {
    const execution = {
      id: `exec-${crypto.randomBytes(6).toString('hex')}`,
      agent: agentName,
      task: taskDescription,
      timestamp: new Date().toISOString(),
      details: executionDetails,
      steps: executionDetails.steps || [],
      inputs: executionDetails.inputs || {},
      outputs: executionDetails.outputs || {},
      success: executionDetails.success !== false,
      duration: executionDetails.duration || 0,
      errors: executionDetails.errors || []
    };

    this.executionHistory.push(execution);

    // Check if we should create a skill from this pattern
    this._checkSkillCreationTrigger(agentName, taskDescription, execution);

    // Improve existing skills based on this execution
    this._improveExistingSkills(agentName, taskDescription, execution);

    return execution;
  }

  /**
   * CHECK SKILL CREATION TRIGGER
   * Determine if a task pattern should become a reusable skill
   */
  _checkSkillCreationTrigger(agentName, taskDescription, execution) {
    // Find similar executions
    const similarExecutions = this.executionHistory.filter(e =>
      e.agent === agentName &&
      e.task.toLowerCase().includes(taskDescription.toLowerCase().split(' ')[0])
    );

    // Check if we have enough successful executions
    const successfulExecutions = similarExecutions.filter(e => e.success);
    const successRate = similarExecutions.length > 0
      ? successfulExecutions.length / similarExecutions.length
      : 0;

    // Trigger skill creation if pattern is strong
    if (
      similarExecutions.length >= this.minExecutionsBeforeSkillCreation &&
      successRate >= this.successThresholdForSkill
    ) {
      this._createSkillFromPattern(agentName, taskDescription, similarExecutions);
    }
  }

  /**
   * CREATE SKILL FROM PATTERN
   * Auto-generate a new skill from successful execution patterns
   */
  _createSkillFromPattern(agentName, taskDescription, executions) {
    // Analyze pattern from executions
    const pattern = this._analyzeExecutionPattern(executions);

    if (!pattern) return;

    // Extract common steps, inputs, outputs
    const skillContent = this._generateSkillMarkdown(
      agentName,
      taskDescription,
      pattern,
      executions
    );

    // Create skill file
    const skillName = this._generateSkillName(taskDescription);
    const skillPath = path.join(
      this.skillsDir,
      agentName.toLowerCase(),
      `${skillName}`,
      'SKILL.md'
    );

    // Ensure directory exists
    const skillDir = path.dirname(skillPath);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    // Write skill file
    fs.writeFileSync(skillPath, skillContent, 'utf8');

    // Register with skills manager
    const skillMetadata = {
      name: skillName,
      agent: agentName,
      source: 'auto-generated',
      created: new Date().toISOString(),
      successRate: (executions.filter(e => e.success).length / executions.length * 100).toFixed(1) + '%',
      executionCount: executions.length,
      filePath: skillPath
    };

    this.skillPerformance.set(skillName, {
      executions: 0,
      successes: 0,
      failures: 0,
      totalTime: 0,
      created: new Date().toISOString(),
      versions: [skillMetadata]
    });

    console.log(`[LEARNING] Auto-created skill: ${skillName} for ${agentName}`);

    return { skillName, skillPath, metadata: skillMetadata };
  }

  /**
   * ANALYZE EXECUTION PATTERN
   * Extract common structure from multiple executions
   */
  _analyzeExecutionPattern(executions) {
    if (executions.length === 0) return null;

    // Find common steps
    const commonSteps = this._findCommonSteps(executions);

    // Extract common inputs/outputs
    const commonInputs = this._findCommonInputs(executions);
    const commonOutputs = this._findCommonOutputs(executions);

    // Calculate average duration
    const avgDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0) / executions.length;

    return {
      commonSteps,
      commonInputs,
      commonOutputs,
      avgDuration,
      executionCount: executions.length,
      successRate: executions.filter(e => e.success).length / executions.length
    };
  }

  _findCommonSteps(executions) {
    if (!executions[0] || !executions[0].steps) return [];

    const firstSteps = executions[0].steps;
    const commonSteps = firstSteps.filter(step =>
      executions.every(e =>
        e.steps && e.steps.some(s => s.type === step.type)
      )
    );

    return commonSteps;
  }

  _findCommonInputs(executions) {
    if (!executions[0]) return {};

    const firstInputKeys = Object.keys(executions[0].inputs || {});
    const common = {};

    firstInputKeys.forEach(key => {
      if (executions.every(e => key in (e.inputs || {}))) {
        common[key] = 'string'; // Infer type as string (could be more sophisticated)
      }
    });

    return common;
  }

  _findCommonOutputs(executions) {
    if (!executions[0]) return {};

    const firstOutputKeys = Object.keys(executions[0].outputs || {});
    const common = {};

    firstOutputKeys.forEach(key => {
      if (executions.every(e => key in (e.outputs || {}))) {
        common[key] = 'string';
      }
    });

    return common;
  }

  /**
   * GENERATE SKILL MARKDOWN
   * Create a well-formatted skill file
   */
  _generateSkillMarkdown(agentName, taskDescription, pattern, executions) {
    const skillName = this._generateSkillName(taskDescription);
    const successRate = (executions.filter(e => e.success).length / executions.length * 100).toFixed(1);

    const markdown = `# ${skillName}

**Agent:** ${agentName}
**Category:** auto-generated
**Tags:** learned, ${taskDescription.toLowerCase().split(' ').slice(0, 2).join(', ')}
**Success Rate:** ${successRate}%
**Auto-Created:** ${new Date().toISOString()}

## Description

This skill was automatically created by the SHADDAI learning loop after ${executions.length} successful executions of a similar task pattern.

**Task Pattern:** ${taskDescription}

## Capabilities

- Executes complex multi-step tasks
- Learns from success/failure patterns
- Self-improves over time
- Compatible with all agent types

## Expected Inputs

${Object.entries(pattern.commonInputs).map(([key]) => `- \`${key}\`: (string) Input parameter`).join('\n') || '- Context-dependent inputs'}

## Expected Outputs

${Object.entries(pattern.commonOutputs).map(([key]) => `- \`${key}\`: (string) Output result`).join('\n') || '- Task completion status'}

## Execution Pattern

Learned from ${executions.length} executions:

1. **Analyze**: Break down the task into steps
2. **Plan**: Create execution plan based on inputs
3. **Execute**: Run steps in sequence
4. **Validate**: Check outputs match expected format
5. **Improve**: Store results for future optimization

Average execution time: ${(pattern.avgDuration / 1000).toFixed(2)} seconds

## Performance

- **Executions:** ${executions.length}
- **Success Rate:** ${successRate}%
- **Avg Duration:** ${(pattern.avgDuration / 1000).toFixed(2)}s

## Notes

This is a learned skill — it will improve as agents use it and provide feedback.
The skill system tracks success rates and suggests optimizations automatically.
`;

    return markdown;
  }

  /**
   * IMPROVE EXISTING SKILLS
   * Update skill performance metrics and suggest improvements
   */
  _improveExistingSkills(agentName, taskDescription, execution) {
    // Find skills that might apply to this task
    const catalog = this.skillsManager.exportCatalog('json');

    for (const skill of catalog.skills || []) {
      if (this._skillMatchesExecution(skill, taskDescription)) {
        const perf = this.skillPerformance.get(skill.name) || {
          executions: 0,
          successes: 0,
          failures: 0,
          totalTime: 0,
          versions: []
        };

        perf.executions++;
        if (execution.success) {
          perf.successes++;
        } else {
          perf.failures++;
        }
        perf.totalTime += execution.duration || 0;

        this.skillPerformance.set(skill.name, perf);

        // Check if skill needs improvement
        if (perf.executions % this.skillImprovementInterval === 0) {
          this._suggestSkillImprovement(skill.name, perf);
        }
      }
    }
  }

  _skillMatchesExecution(skill, taskDescription) {
    const skillDesc = (skill.description || '').toLowerCase();
    const taskDesc = taskDescription.toLowerCase();

    const keywords = taskDesc.split(' ').filter(w => w.length > 3);
    return keywords.some(kw => skillDesc.includes(kw));
  }

  _suggestSkillImprovement(skillName, performance) {
    const successRate = performance.successes / performance.executions;
    const avgTime = performance.totalTime / performance.executions;

    if (successRate < 0.8) {
      console.log(`[LEARNING] Skill "${skillName}" has low success rate (${(successRate * 100).toFixed(1)}%) — suggest improvements`);
    }

    if (avgTime > 5000) { // 5 seconds
      console.log(`[LEARNING] Skill "${skillName}" is slow (${(avgTime / 1000).toFixed(2)}s) — optimize for performance`);
    }

    this.pendingSkillCreation.push({
      skillName,
      action: 'improve',
      reason: successRate < 0.8 ? 'low-success-rate' : 'performance',
      timestamp: new Date().toISOString(),
      metrics: {
        successRate: (successRate * 100).toFixed(1) + '%',
        avgTime: (avgTime / 1000).toFixed(2) + 's',
        executions: performance.executions
      }
    });
  }

  /**
   * GENERATE SKILL NAME
   * Convert task description to a clean skill name
   */
  _generateSkillName(taskDescription) {
    return taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-');
  }

  /**
   * GET SKILL PERFORMANCE METRICS
   * Return performance data for a skill
   */
  getSkillMetrics(skillName) {
    return this.skillPerformance.get(skillName) || null;
  }

  /**
   * GET ALL LEARNED SKILLS
   * Return skills created by the learning loop
   */
  getLearnedSkills() {
    const learned = [];

    for (const [skillName, metrics] of this.skillPerformance) {
      if (metrics.versions && metrics.versions[0]?.source === 'auto-generated') {
        learned.push({
          name: skillName,
          executions: metrics.executions,
          successRate: (metrics.successes / metrics.executions * 100).toFixed(1) + '%',
          created: metrics.created
        });
      }
    }

    return learned;
  }

  /**
   * GET PENDING IMPROVEMENTS
   * Return skills that need optimization
   */
  getPendingImprovements() {
    return this.pendingSkillCreation;
  }

  /**
   * MEMORY RECALL
   * Inject relevant past executions into agent context
   */
  recallRelevantMemory(agentName, taskDescription, limit = 3) {
    const relevant = this.executionHistory
      .filter(e => e.agent === agentName)
      .filter(e => e.task.toLowerCase().includes(taskDescription.toLowerCase().split(' ')[0]))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    if (relevant.length === 0) return '';

    const memoryBlock = relevant.map(e =>
      `## Memory: ${e.task}\n` +
      `Status: ${e.success ? '✓ Success' : '✗ Failed'}\n` +
      `Time: ${new Date(e.timestamp).toLocaleString()}\n` +
      `Duration: ${(e.duration / 1000).toFixed(2)}s\n` +
      `${e.errors.length > 0 ? 'Errors: ' + e.errors.join(', ') : ''}`
    ).join('\n\n');

    return `<memory-context>\n${memoryBlock}\n</memory-context>`;
  }

  /**
   * EXPORT LEARNING STATE
   * Save learning loop state to disk
   */
  exportState(outputPath) {
    const state = {
      exportedAt: new Date().toISOString(),
      executionHistory: this.executionHistory,
      skillPerformance: Array.from(this.skillPerformance.entries()),
      pendingImprovements: this.pendingSkillCreation,
      stats: {
        totalExecutions: this.executionHistory.length,
        successRate: (this.executionHistory.filter(e => e.success).length / this.executionHistory.length * 100).toFixed(1),
        learnedSkills: this.getLearnedSkills().length,
        averageExecutionTime: (this.executionHistory.reduce((sum, e) => sum + (e.duration || 0), 0) / this.executionHistory.length / 1000).toFixed(2)
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(state, null, 2));
    return state;
  }
}

module.exports = SkillLearningLoop;
