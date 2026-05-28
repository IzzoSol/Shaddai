/**
 * Agent Integration Module
 * Direct integration with SHADDAI, PIKADON, and other agents
 */

const axios = require('axios');

const AGENT_PORTS = {
  SHADDAI: 8000,
  NEXUS: 8003,
  TURTLE: 8004,
  PIKADON: 8008,
  QUILL: 8005,
  ORACLE: 8002,
  ZEROX: 8001
};

// ═══════════════════════════════════════════════════════════════
// SHADDAI - Supreme Orchestrator
// ═══════════════════════════════════════════════════════════════

async function callSHADDAI(task, context = {}) {
  try {
    const response = await axios.post(
      `http://localhost:${AGENT_PORTS.SHADDAI}/execute`,
      { task, context },
      { timeout: 60000 }
    );
    return response.data;
  } catch (error) {
    console.error('[SHADDAI] Error:', error.message);
    throw new Error(`SHADDAI execution failed: ${error.message}`);
  }
}

async function shaddaiOrchestrate(jobId, jobData) {
  return callSHADDAI('orchestrate_job', {
    jobId,
    title: jobData.title,
    description: jobData.description,
    budget: jobData.budget,
    deadline: jobData.deadline
  });
}

async function shaddaiAnalyzeMarket(topic) {
  return callSHADDAI('analyze_market', { topic });
}

// ═══════════════════════════════════════════════════════════════
// PIKADON - Security & Compliance
// ═══════════════════════════════════════════════════════════════

async function callPIKADON(task, context = {}) {
  try {
    const response = await axios.post(
      `http://localhost:${AGENT_PORTS.PIKADON}/execute`,
      { task, context },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    console.error('[PIKADON] Error:', error.message);
    throw new Error(`PIKADON execution failed: ${error.message}`);
  }
}

async function pikadonSecurityAudit(jobData) {
  return callPIKADON('security_audit', {
    jobId: jobData.id,
    budget: jobData.budget,
    agents: jobData.targetAgents,
    description: jobData.description
  });
}

async function pikadonValidatePayment(paymentData) {
  return callPIKADON('validate_payment', paymentData);
}

async function pikadonCheckCompliance(agentData) {
  return callPIKADON('check_compliance', {
    agentId: agentData.id,
    agentName: agentData.name,
    executeCount: agentData.executeCount
  });
}

// ═══════════════════════════════════════════════════════════════
// AGENT ROUTING - Smart dispatching
// ═══════════════════════════════════════════════════════════════

async function routeJobToAgent(jobData) {
  try {
    // 1. SHADDAI orchestrates the job
    const orchestration = await shaddaiOrchestrate(jobData.id, jobData);

    // 2. PIKADON audits security
    const securityCheck = await pikadonSecurityAudit(jobData);

    return {
      jobId: jobData.id,
      status: 'routed',
      orchestration,
      securityCheck,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ROUTING] Error:', error.message);
    throw error;
  }
}

async function executeJobWithAgents(jobId, jobData, selectedAgent) {
  try {
    // Route to orchestrator
    const route = await shaddaiOrchestrate(jobId, jobData);

    // Security validation
    const security = await pikadonSecurityAudit(jobData);

    if (!security.approved) {
      throw new Error(`Security check failed: ${security.reason}`);
    }

    return {
      jobId,
      routed: true,
      agent: selectedAgent || 'SHADDAI',
      status: 'executing',
      route,
      security
    };
  } catch (error) {
    console.error('[EXECUTION] Error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// AGENT STATUS & HEALTH
// ═══════════════════════════════════════════════════════════════

async function checkAgentHealth(agentName) {
  try {
    const port = AGENT_PORTS[agentName];
    if (!port) throw new Error(`Unknown agent: ${agentName}`);

    const response = await axios.get(
      `http://localhost:${port}/health`,
      { timeout: 5000 }
    );
    return { agent: agentName, status: 'online', ...response.data };
  } catch (error) {
    return { agent: agentName, status: 'offline', error: error.message };
  }
}

async function checkAllAgents() {
  const agents = Object.keys(AGENT_PORTS);
  const health = await Promise.all(
    agents.map(agent => checkAgentHealth(agent))
  );
  return health;
}

// ═══════════════════════════════════════════════════════════════
// AGENT SKILLS & CAPABILITIES
// ═══════════════════════════════════════════════════════════════

async function getAgentSkills(agentName) {
  try {
    const port = AGENT_PORTS[agentName];
    if (!port) throw new Error(`Unknown agent: ${agentName}`);

    const response = await axios.get(
      `http://localhost:${port}/skills`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error(`[${agentName}] Skills error:`, error.message);
    return { skills: [], error: error.message };
  }
}

async function executeAgentSkill(agentName, skillName, params) {
  try {
    const port = AGENT_PORTS[agentName];
    if (!port) throw new Error(`Unknown agent: ${agentName}`);

    const response = await axios.post(
      `http://localhost:${port}/skill/${skillName}`,
      params,
      { timeout: 60000 }
    );
    return response.data;
  } catch (error) {
    console.error(`[${agentName}] Skill execution error:`, error.message);
    throw error;
  }
}

module.exports = {
  callSHADDAI,
  shaddaiOrchestrate,
  shaddaiAnalyzeMarket,
  callPIKADON,
  pikadonSecurityAudit,
  pikadonValidatePayment,
  pikadonCheckCompliance,
  routeJobToAgent,
  executeJobWithAgents,
  checkAgentHealth,
  checkAllAgents,
  getAgentSkills,
  executeAgentSkill,
  AGENT_PORTS
};
