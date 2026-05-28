/**
 * SHADDAI ORCHESTRATOR v1.0
 * Integration layer that ties together all backend systems
 *
 * Responsibilities:
 * - Register all routers and middleware
 * - Create unified workflow handlers
 * - Orchestrate data flow through all subsystems
 * - Manage event emission and broadcasting
 * - Handle error recovery and state consistency
 *
 * Architecture:
 *   Job Created -> Security Check -> Start Listener
 *   Bid Placed -> Validate -> Broadcast
 *   Job Awarded -> Trigger Agent -> Stream Progress
 *   Execution Complete -> Release Payment -> Notify
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SHADDAIOrcherator extends EventEmitter {
  constructor(app, server, wss, services = {}) {
    super();

    this.app = app;
    this.server = server;
    this.wss = wss;

    // Inject services from caller
    this.database = services.database;
    this.jobWorkflow = services.jobWorkflow;
    this.agentInvocation = services.agentInvocation;
    this.authService = services.authService;
    this.billingService = services.billingService;
    this.skillExecutor = services.skillExecutor;
    this.security = services.security;
    this.logger = services.logger;
    this.cache = services.cache;
    this.requestTracker = services.requestTracker;

    // Real-time updates
    this.wsConnections = new Map();
    this.activeWorkflows = new Map();
    this.jobListeners = new Map();

    // Stats
    this.orchestratorStats = {
      workflowsProcessed: 0,
      eventsEmitted: 0,
      broadcasts: 0,
      errors: 0,
      uptime: Date.now()
    };

    this._initialize();
  }

  /**
   * INITIALIZE - Register all routers and event handlers
   */
  _initialize() {
    console.log('[ORCHESTRATOR] Initializing SHADDAI integration layer...');

    // Set up event listeners
    this._setupEventHandlers();

    // Register all routes
    this._registerRoutes();

    // Setup WebSocket handlers
    this._setupWebSocketHandlers();

    // Start monitoring systems
    this._startMonitoring();

    console.log('[ORCHESTRATOR] Integration layer ready');
  }

  /**
   * SETUP EVENT HANDLERS - Connect all subsystems via events
   */
  _setupEventHandlers() {
    // Job workflow events
    if (this.jobWorkflow) {
      this.jobWorkflow.on?.('job-created', (data) => {
        this._onJobCreated(data);
      });

      this.jobWorkflow.on?.('bid-placed', (data) => {
        this._onBidPlaced(data);
      });

      this.jobWorkflow.on?.('job-awarded', (data) => {
        this._onJobAwarded(data);
      });

      this.jobWorkflow.on?.('execution-started', (data) => {
        this._onExecutionStarted(data);
      });

      this.jobWorkflow.on?.('execution-completed', (data) => {
        this._onExecutionCompleted(data);
      });
    }

    // Agent invocation events
    if (this.agentInvocation) {
      this.agentInvocation.on?.('execution-started', (data) => {
        this._onAgentExecutionStarted(data);
      });

      this.agentInvocation.on?.('execution-completed', (data) => {
        this._onAgentExecutionCompleted(data);
      });
    }

    console.log('[ORCHESTRATOR] Event handlers registered');
  }

  /**
   * REGISTER ALL ROUTES - Mount routers from all subsystems
   */
  _registerRoutes() {
    // Health & Status
    this.app.get('/api/orchestrator/status', (req, res) => {
      res.json(this._getOrchestratorStatus());
    });

    this.app.get('/api/orchestrator/workflows', (req, res) => {
      const workflows = Array.from(this.activeWorkflows.values());
      res.json({
        active: workflows.length,
        workflows
      });
    });

    // Job Management - These route to jobWorkflow
    this.app.post('/api/jobs', async (req, res) => {
      await this._handleJobCreation(req, res);
    });

    this.app.get('/api/jobs/:jobId', async (req, res) => {
      await this._handleGetJob(req, res);
    });

    this.app.post('/api/jobs/:jobId/bids', async (req, res) => {
      await this._handleBidPlacement(req, res);
    });

    this.app.post('/api/jobs/:jobId/award', async (req, res) => {
      await this._handleJobAward(req, res);
    });

    // Agent Invocation - These route to agentInvocation
    this.app.post('/api/jobs/:jobId/execute', async (req, res) => {
      await this._handleJobExecution(req, res);
    });

    this.app.get('/api/executions/:executionId', async (req, res) => {
      await this._handleGetExecution(req, res);
    });

    // Billing & Payment
    this.app.post('/api/jobs/:jobId/payment/release', async (req, res) => {
      await this._handlePaymentRelease(req, res);
    });

    // Real-time job listener subscription
    this.app.get('/api/jobs/:jobId/listen', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const jobId = req.params.jobId;
      const listener = {
        res,
        createdAt: Date.now()
      };

      this.jobListeners.set(jobId, listener);

      // Send initial connection confirmation
      res.write(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);

      // Cleanup on disconnect
      req.on('close', () => {
        this.jobListeners.delete(jobId);
      });
    });

    console.log('[ORCHESTRATOR] Routes registered');
  }

  /**
   * SETUP WEBSOCKET HANDLERS - Real-time bidirectional communication
   */
  _setupWebSocketHandlers() {
    if (!this.wss) return;

    this.wss.on('connection', (ws, req) => {
      const clientId = crypto.randomBytes(8).toString('hex');
      this.wsConnections.set(clientId, {
        ws,
        connectedAt: Date.now(),
        subscriptions: new Set()
      });

      console.log(`[ORCHESTRATOR] WebSocket client connected: ${clientId}`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleWebSocketMessage(clientId, data, ws);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        this.wsConnections.delete(clientId);
        console.log(`[ORCHESTRATOR] WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`[ORCHESTRATOR] WebSocket error: ${clientId}`, error.message);
      });
    });
  }

  /**
   * UNIFIED WORKFLOW HANDLERS
   */

  // 1. JOB CREATED
  async _onJobCreated(data) {
    const { jobId, title, budget } = data;
    console.log(`[ORCHESTRATOR] Job created: ${jobId} - "${title}" ($${budget})`);

    const workflowId = `workflow_${jobId}_${Date.now()}`;
    const workflow = {
      id: workflowId,
      jobId,
      type: 'job_creation',
      status: 'in_progress',
      createdAt: Date.now(),
      events: [
        {
          type: 'job_created',
          timestamp: Date.now(),
          data
        }
      ]
    };

    this.activeWorkflows.set(workflowId, workflow);

    // Security validation - check for fraud indicators
    try {
      const securityCheck = await this._performSecurityCheck(jobId);
      if (!securityCheck.passed) {
        workflow.status = 'blocked';
        workflow.events.push({
          type: 'security_check_failed',
          timestamp: Date.now(),
          reason: securityCheck.reason
        });
        this.orchestratorStats.errors++;
      } else {
        workflow.status = 'open_for_bidding';
        workflow.events.push({
          type: 'security_check_passed',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[ORCHESTRATOR] Security check error:', error.message);
      this.orchestratorStats.errors++;
    }

    // Broadcast update
    this._broadcastUpdate('job_created', {
      jobId,
      title,
      budget,
      status: workflow.status
    });

    this.emit('job-created', data);
    this.orchestratorStats.workflowsProcessed++;
  }

  // 2. BID PLACED
  async _onBidPlaced(data) {
    const { jobId, bidId, agentName, amount } = data;
    console.log(`[ORCHESTRATOR] Bid placed on ${jobId}: ${agentName} - $${amount}`);

    // Validate bid against job
    try {
      const job = this.database?.getJob(jobId);
      if (!job) throw new Error('Job not found');

      if (amount > job.budget * 2) {
        console.warn(`[ORCHESTRATOR] Bid exceeds budget: ${amount} > ${job.budget}`);
      }

      // Broadcast to all clients interested in this job
      this._broadcastUpdate('bid_placed', {
        jobId,
        bidId,
        agentName,
        amount
      });

      this.emit('bid-placed', data);
    } catch (error) {
      console.error('[ORCHESTRATOR] Bid validation error:', error.message);
      this.orchestratorStats.errors++;
    }
  }

  // 3. JOB AWARDED
  async _onJobAwarded(data) {
    const { jobId, bidId, agentName } = data;
    console.log(`[ORCHESTRATOR] Job awarded: ${jobId} -> ${agentName}`);

    const workflowId = `workflow_${jobId}_awarded_${Date.now()}`;
    const workflow = {
      id: workflowId,
      jobId,
      type: 'job_execution',
      status: 'awaiting_execution',
      agentName,
      bidId,
      createdAt: Date.now(),
      events: [
        {
          type: 'job_awarded',
          timestamp: Date.now(),
          data
        }
      ]
    };

    this.activeWorkflows.set(workflowId, workflow);

    // Broadcast award notification
    this._broadcastUpdate('job_awarded', {
      jobId,
      agentName,
      bidId
    });

    // Prepare for execution
    workflow.status = 'execution_ready';
    workflow.events.push({
      type: 'execution_ready',
      timestamp: Date.now()
    });

    this.emit('job-awarded', data);
    this.orchestratorStats.workflowsProcessed++;
  }

  // 4. EXECUTION STARTED
  async _onExecutionStarted(data) {
    const { jobId, executionId, agentName } = data;
    console.log(`[ORCHESTRATOR] Execution started: ${executionId} (${agentName})`);

    // Broadcast progress
    this._broadcastUpdate('execution_started', {
      jobId,
      executionId,
      agentName,
      timestamp: Date.now()
    });

    this.emit('execution-started', data);
  }

  // 5. EXECUTION COMPLETED
  async _onExecutionCompleted(data) {
    const { jobId, executionId, agentName, result, success } = data;
    console.log(`[ORCHESTRATOR] Execution completed: ${executionId} - Success: ${success}`);

    if (success) {
      try {
        // Release payment from escrow
        const job = this.database?.getJob(jobId);
        if (job) {
          await this._releasePayment(jobId, job.escrowAmount);
        }

        // Broadcast completion
        this._broadcastUpdate('execution_completed', {
          jobId,
          executionId,
          agentName,
          success: true,
          resultSize: result ? JSON.stringify(result).length : 0
        });
      } catch (error) {
        console.error('[ORCHESTRATOR] Payment release error:', error.message);
        this.orchestratorStats.errors++;
      }
    } else {
      // Handle failure - refund escrow
      this._broadcastUpdate('execution_failed', {
        jobId,
        executionId,
        agentName,
        success: false
      });
    }

    this.emit('execution-completed', data);
  }

  // Agent execution event
  async _onAgentExecutionStarted(data) {
    const { executionId, agentName, skillName } = data;
    console.log(`[ORCHESTRATOR] Agent execution: ${agentName}::${skillName}`);

    this._broadcastUpdate('agent_execution_started', {
      executionId,
      agentName,
      skillName
    });
  }

  async _onAgentExecutionCompleted(data) {
    const { executionId, agentName, skillName, success, duration } = data;
    console.log(`[ORCHESTRATOR] Agent execution complete: ${agentName}::${skillName} (${duration}ms)`);

    this._broadcastUpdate('agent_execution_completed', {
      executionId,
      agentName,
      skillName,
      success,
      duration
    });
  }

  /**
   * REQUEST HANDLERS - Map HTTP requests to workflow actions
   */

  async _handleJobCreation(req, res) {
    try {
      const payload = req.body;

      if (!this.jobWorkflow) {
        return res.status(500).json({ error: 'Job workflow not initialized' });
      }

      const result = await this.jobWorkflow.createJob(payload);

      if (result.status === 'success') {
        this._onJobCreated({
          jobId: result.data.id,
          title: result.data.title,
          budget: result.data.budget
        });

        res.status(201).json(result.data);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      this.logger?.error('[ORCHESTRATOR]', 'Job creation failed', { error: error.message });
      this.orchestratorStats.errors++;
      res.status(500).json({ error: error.message });
    }
  }

  async _handleGetJob(req, res) {
    try {
      const { jobId } = req.params;

      if (!this.jobWorkflow) {
        return res.status(500).json({ error: 'Job workflow not initialized' });
      }

      const result = await this.jobWorkflow.getJobDetails(jobId);

      if (result.status === 'success') {
        res.json(result.data);
      } else {
        res.status(404).json({ error: result.message });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async _handleBidPlacement(req, res) {
    try {
      const { jobId } = req.params;
      const payload = req.body;

      if (!this.jobWorkflow) {
        return res.status(500).json({ error: 'Job workflow not initialized' });
      }

      const result = await this.jobWorkflow.placeBid(jobId, payload);

      if (result.status === 'success') {
        this._onBidPlaced({
          jobId,
          bidId: result.data.id,
          agentName: result.data.agentName,
          amount: result.data.amount
        });

        res.json(result.data);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      this.orchestratorStats.errors++;
      res.status(500).json({ error: error.message });
    }
  }

  async _handleJobAward(req, res) {
    try {
      const { jobId } = req.params;
      const { bidId } = req.body;

      if (!this.jobWorkflow) {
        return res.status(500).json({ error: 'Job workflow not initialized' });
      }

      const result = await this.jobWorkflow.awardJob(jobId, bidId);

      if (result.status === 'success') {
        const job = this.database?.getJob(jobId);
        this._onJobAwarded({
          jobId,
          bidId,
          agentName: job?.awardedTo
        });

        res.json(result.data);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      this.orchestratorStats.errors++;
      res.status(500).json({ error: error.message });
    }
  }

  async _handleJobExecution(req, res) {
    try {
      const { jobId } = req.params;
      const { skillName, inputs = {} } = req.body;

      if (!this.agentInvocation) {
        return res.status(500).json({ error: 'Agent invocation not initialized' });
      }

      const job = this.database?.getJob(jobId);
      if (!job || !job.awardedTo) {
        return res.status(400).json({ error: 'Job not awarded' });
      }

      const executionId = `exec_${crypto.randomBytes(12).toString('hex')}`;

      // Start execution asynchronously
      this._executeJobAsync(jobId, job.awardedTo, skillName, inputs, executionId);

      res.json({
        executionId,
        jobId,
        status: 'starting',
        agent: job.awardedTo
      });
    } catch (error) {
      this.orchestratorStats.errors++;
      res.status(500).json({ error: error.message });
    }
  }

  async _handleGetExecution(req, res) {
    try {
      const { executionId } = req.params;

      const execution = this.database?.getExecution(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      res.json(execution);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async _handlePaymentRelease(req, res) {
    try {
      const { jobId } = req.params;

      const job = this.database?.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      await this._releasePayment(jobId, job.escrowAmount);

      res.json({
        jobId,
        released: job.escrowAmount,
        status: 'released'
      });
    } catch (error) {
      this.orchestratorStats.errors++;
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * BACKGROUND EXECUTION - Run job execution async
   */
  async _executeJobAsync(jobId, agentName, skillName, inputs, executionId) {
    try {
      // Update job status
      const job = this.database?.getJob(jobId);
      if (job) {
        job.status = 'in_progress';
        job.executionId = executionId;
        this.database?.saveJob(job);
      }

      this._onExecutionStarted({ jobId, executionId, agentName });

      // Invoke agent
      const result = await this.agentInvocation.invokeAgent(
        agentName,
        skillName,
        inputs,
        { timeout: 300000 } // 5 minutes
      );

      if (result.status === 'success') {
        this._onExecutionCompleted({
          jobId,
          executionId,
          agentName,
          result: result.data,
          success: true
        });

        // Update job
        if (job) {
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          job.result = result.data;
          this.database?.saveJob(job);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('[ORCHESTRATOR] Job execution failed:', error.message);

      this._onExecutionCompleted({
        jobId,
        executionId,
        agentName,
        success: false,
        error: error.message
      });

      // Refund escrow
      const job = this.database?.getJob(jobId);
      if (job && job.paymentStatus === 'held_in_escrow') {
        await this._refundPayment(jobId, job.escrowAmount);
      }

      this.orchestratorStats.errors++;
    }
  }

  /**
   * HELPER FUNCTIONS
   */

  async _performSecurityCheck(jobId) {
    if (!this.security) {
      return { passed: true };
    }

    try {
      const job = this.database?.getJob(jobId);
      if (!job) return { passed: false, reason: 'Job not found' };

      // Basic checks
      if (job.budget < 5 || job.budget > 50000) {
        return { passed: false, reason: 'Budget out of range' };
      }

      if (new Date(job.deadline) <= new Date()) {
        return { passed: false, reason: 'Invalid deadline' };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, reason: error.message };
    }
  }

  async _releasePayment(jobId, amount) {
    if (!this.billingService) return;

    const job = this.database?.getJob(jobId);
    if (!job) throw new Error('Job not found');

    try {
      await this.billingService.releaseEscrow(jobId, amount);

      job.paymentStatus = 'released';
      this.database?.saveJob(job);

      console.log(`[ORCHESTRATOR] Payment released: ${jobId} - $${amount}`);
    } catch (error) {
      console.error('[ORCHESTRATOR] Payment release failed:', error.message);
      throw error;
    }
  }

  async _refundPayment(jobId, amount) {
    if (!this.billingService) return;

    try {
      await this.billingService.refundEscrow(jobId, amount);

      const job = this.database?.getJob(jobId);
      if (job) {
        job.paymentStatus = 'refunded';
        this.database?.saveJob(job);
      }

      console.log(`[ORCHESTRATOR] Payment refunded: ${jobId} - $${amount}`);
    } catch (error) {
      console.error('[ORCHESTRATOR] Refund failed:', error.message);
      throw error;
    }
  }

  /**
   * BROADCASTING & REAL-TIME UPDATES
   */

  _broadcastUpdate(type, data) {
    const message = JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      data
    });

    // Broadcast via WebSocket
    if (this.wsConnections) {
      for (const [clientId, conn] of this.wsConnections.entries()) {
        if (conn.ws.readyState === 1) { // OPEN
          conn.ws.send(message);
        } else {
          this.wsConnections.delete(clientId);
        }
      }
    }

    // Broadcast via SSE listeners
    if (this.jobListeners) {
      const jobId = data.jobId;
      const listener = this.jobListeners.get(jobId);
      if (listener && !listener.res.writableEnded) {
        listener.res.write(`data: ${message}\n\n`);
      }
    }

    this.orchestratorStats.broadcasts++;
    this.emit('broadcast', { type, data });
  }

  _handleWebSocketMessage(clientId, data, ws) {
    const { action, payload } = data;

    switch (action) {
      case 'subscribe':
        const conn = this.wsConnections.get(clientId);
        if (conn) {
          conn.subscriptions.add(payload.channel);
          ws.send(JSON.stringify({
            type: 'subscribed',
            channel: payload.channel
          }));
        }
        break;

      case 'unsubscribe':
        const conn2 = this.wsConnections.get(clientId);
        if (conn2) {
          conn2.subscriptions.delete(payload.channel);
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        ws.send(JSON.stringify({
          error: 'Unknown action',
          action
        }));
    }
  }

  /**
   * MONITORING & STATS
   */

  _startMonitoring() {
    // Periodic cleanup of old workflows
    setInterval(() => {
      const now = Date.now();
      const maxAge = 3600000; // 1 hour

      for (const [id, workflow] of this.activeWorkflows.entries()) {
        if (now - workflow.createdAt > maxAge) {
          this.activeWorkflows.delete(id);
        }
      }
    }, 300000); // Every 5 minutes
  }

  _getOrchestratorStatus() {
    const activeWfCount = this.activeWorkflows.size;
    const wsCount = this.wsConnections.size;
    const jobListenerCount = this.jobListeners.size;

    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.orchestratorStats.uptime,
      systems: {
        activeWorkflows: activeWfCount,
        websockets: wsCount,
        jobListeners: jobListenerCount,
        jobWorkflow: !!this.jobWorkflow,
        agentInvocation: !!this.agentInvocation,
        database: !!this.database,
        billing: !!this.billingService
      },
      stats: {
        workflowsProcessed: this.orchestratorStats.workflowsProcessed,
        eventsEmitted: this.orchestratorStats.eventsEmitted,
        broadcasts: this.orchestratorStats.broadcasts,
        errors: this.orchestratorStats.errors
      }
    };
  }
}

module.exports = SHADDAIOrcherator;
