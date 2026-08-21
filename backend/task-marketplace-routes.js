/**
 * TASK MARKETPLACE ROUTES
 *
 * Tasks = monetized work for agents:
 *   - Users post tasks (e.g., "Fetch crypto prices, format as CSV, pay $0.50")
 *   - Agents bid / accept
 *   - Agents execute via tool invocation
 *   - On completion: charge user + credit agent
 *   - Pro tier gating for high-value tasks
 *
 * Routes:
 *   POST   /tasks                  — create task
 *   GET    /tasks                  — list open tasks (filterable)
 *   GET    /tasks/:id              — get task details
 *   POST   /tasks/:id/bid          — agent bids on task
 *   POST   /tasks/:id/accept       — user accepts agent's bid
 *   POST   /tasks/:id/execute      — agent executes task
 *   POST   /tasks/:id/complete     — mark complete + process payment
 *   GET    /tasks/user/:userId     — user's posted tasks
 *   GET    /tasks/agent/:agentId   — agent's accepted/completed tasks
 *   DELETE /tasks/:id              — cancel task (if not accepted)
 */
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { paymentRegistry } = require('./payment-providers');
const billingService = require('./billing-service');
const agentEngine = require('./agent-engine');
const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, 'data', 'tasks.json');

// Helpers ───────────────────────────────────────────────────────────────

function _readTasks() {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); }
  catch (e) { return { tasks: [] }; }
}

function _writeTasks(data) {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.warn('[tasks] write failed:', e.message); }
}

function _getTask(id) {
  const db = _readTasks();
  return db.tasks.find(t => t.id === id);
}

function _saveTask(task) {
  const db = _readTasks();
  const idx = db.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    db.tasks[idx] = task;
  } else {
    db.tasks.push(task);
  }
  _writeTasks(db);
}

async function checkTierPermission(userId, taskCost) {
  // Check if user tier allows this task cost
  try {
    const user = billingService.getUser(userId);
    const tier = billingService.getTier(user.tier || 'free');

    if (taskCost > 0 && tier.name === 'free') {
      return { allowed: false, reason: 'Free users cannot execute paid tasks' };
    }
    if (taskCost > (tier.maxTaskCost || 0)) {
      return { allowed: false, reason: `Task cost $${taskCost} exceeds tier max $${tier.maxTaskCost}` };
    }
    return { allowed: true };
  } catch (e) {
    return { allowed: false, reason: e.message };
  }
}

// Routes ────────────────────────────────────────────────────────────────

/**
 * POST /tasks
 * Create a new task
 *
 * body: {
 *   title: "Fetch 10 crypto prices"
 *   description: "Get prices for BTC, ETH, SOL... format as CSV"
 *   tools: ["fetch_price", "format_csv"]
 *   cost: 0.50
 *   currency: "USD"
 *   deadline: 1724000000000  (optional, ms since epoch)
 *   provider: "stripe|paybox|cashapp|robinhood|moonpay"  (payment method)
 * }
 */
router.post('/tasks', async (req, res) => {
  try {
    const { title, description, tools, cost, currency, deadline, provider } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'] || 'anon';

    if (!title || cost === undefined) {
      return res.status(400).json({ ok: false, error: 'title and cost required' });
    }

    // Check tier permission
    const tierCheck = await checkTierPermission(userId, cost);
    if (!tierCheck.allowed) {
      return res.status(403).json({ ok: false, error: tierCheck.reason });
    }

    const task = {
      id: `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      title,
      description: description || '',
      tools: Array.isArray(tools) ? tools : [],
      cost: Number(cost) || 0,
      currency: currency || 'USD',
      provider: provider || 'stripe',
      status: 'open', // open, bidding, executing, completed, disputed, canceled
      createdBy: userId,
      createdAt: Date.now(),
      deadline: deadline || (Date.now() + 7 * 24 * 3600 * 1000), // 7 days default
      bids: [],
      acceptedBy: null,
      acceptedBid: null,
      completedAt: null,
      transactionId: null,
      result: null
    };

    _saveTask(task);

    res.json({ ok: true, task });
  } catch (e) {
    console.error('[tasks] POST /tasks error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /tasks
 * List open tasks (paginated, filterable)
 *
 * query: { status: 'open', minCost: 0, maxCost: 100, tools: 'fetch_price', skip: 0, limit: 20 }
 */
router.get('/tasks', (req, res) => {
  try {
    const { status, minCost, maxCost, tools, skip, limit } = req.query;
    let db = _readTasks();
    let tasks = db.tasks || [];

    // Filters
    if (status) tasks = tasks.filter(t => t.status === status);
    if (minCost !== undefined) tasks = tasks.filter(t => t.cost >= Number(minCost));
    if (maxCost !== undefined) tasks = tasks.filter(t => t.cost <= Number(maxCost));
    if (tools) {
      const toolList = String(tools).split(',').map(t => t.trim());
      tasks = tasks.filter(t => toolList.some(tool => t.tools.includes(tool)));
    }

    // Sort by newest first
    tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Paginate
    const s = Number(skip) || 0;
    const l = Math.min(Number(limit) || 20, 100);
    const paginated = tasks.slice(s, s + l);

    res.json({ ok: true, total: tasks.length, tasks: paginated });
  } catch (e) {
    console.error('[tasks] GET /tasks error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /tasks/:id
 * Get task details
 */
router.get('/tasks/:id', (req, res) => {
  try {
    const task = _getTask(req.params.id);
    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /tasks/:id/bid
 * Agent bids on a task
 *
 * body: { agentId, bidAmount }
 */
router.post('/tasks/:id/bid', async (req, res) => {
  try {
    const { agentId, bidAmount } = req.body;
    const task = _getTask(req.params.id);

    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    if (task.status !== 'open') {
      return res.status(400).json({ ok: false, error: `Task is ${task.status}, cannot bid` });
    }

    const bid = {
      bidId: crypto.randomUUID(),
      agentId,
      bidAmount: Number(bidAmount) || task.cost,
      biddedAt: Date.now(),
      status: 'pending' // pending, accepted, rejected
    };

    task.bids = task.bids || [];
    task.bids.push(bid);
    task.status = 'bidding';

    _saveTask(task);

    res.json({ ok: true, bid, task });
  } catch (e) {
    console.error('[tasks] POST /tasks/:id/bid error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /tasks/:id/accept
 * User accepts an agent's bid
 *
 * body: { bidId }
 */
router.post('/tasks/:id/accept', async (req, res) => {
  try {
    const { bidId } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'];
    const task = _getTask(req.params.id);

    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    if (task.createdBy !== userId) {
      return res.status(403).json({ ok: false, error: 'Only task creator can accept bids' });
    }

    const bid = task.bids?.find(b => b.bidId === bidId);
    if (!bid) return res.status(404).json({ ok: false, error: 'Bid not found' });

    // Mark bid as accepted
    bid.status = 'accepted';
    task.acceptedBy = bid.agentId;
    task.acceptedBid = bidId;
    task.status = 'executing';

    // Hold payment (escrow) in ledger
    try {
      billingService.addTransaction({
        type: 'task_escrow',
        userId,
        amount: bid.bidAmount,
        taskId: task.id,
        status: 'pending'
      });
    } catch (eErr) {
      console.warn('[tasks] escrow ledger failed:', eErr.message);
    }

    _saveTask(task);

    res.json({ ok: true, task, bid });
  } catch (e) {
    console.error('[tasks] POST /tasks/:id/accept error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /tasks/:id/execute
 * Agent executes the task (invoke tools via agent-engine)
 *
 * body: (optional; tools and parameters inferred from task.tools)
 *
 * Returns: { ok, result, output }
 */
router.post('/tasks/:id/execute', async (req, res) => {
  try {
    const task = _getTask(req.params.id);
    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    if (task.status !== 'executing') {
      return res.status(400).json({ ok: false, error: `Task is ${task.status}, cannot execute` });
    }

    // Invoke agent with task tools
    const agentId = task.acceptedBy;
    let result = null;

    try {
      // Simple execution: delegate to agent-engine to run the tools
      // (In production, this would be more sophisticated with tool composition)
      result = {
        success: true,
        output: `Executed tools: ${task.tools.join(', ')}`,
        timestamp: Date.now()
      };

      // TODO: Actual tool invocation via agent-engine
      // const output = await agentEngine.executeTool(agentId, task.tools, task.description);
    } catch (execError) {
      result = {
        success: false,
        error: execError.message,
        timestamp: Date.now()
      };
    }

    task.result = result;

    res.json({ ok: true, task, result });
  } catch (e) {
    console.error('[tasks] POST /tasks/:id/execute error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /tasks/:id/complete
 * Mark task complete and process payment
 *
 * body: { provider: 'paybox'|'stripe'|... }
 * → charge user via chosen provider
 * → credit agent (minus platform fee, e.g., 10%)
 * → both get receipts
 */
router.post('/tasks/:id/complete', async (req, res) => {
  try {
    const { provider } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'];
    const task = _getTask(req.params.id);

    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    if (task.createdBy !== userId) {
      return res.status(403).json({ ok: false, error: 'Only task creator can mark complete' });
    }
    if (!task.result?.success) {
      return res.status(400).json({ ok: false, error: 'Task not successfully executed' });
    }

    // Check tier permission for payment
    const tierCheck = await checkTierPermission(userId, task.cost);
    if (!tierCheck.allowed) {
      return res.status(403).json({ ok: false, error: tierCheck.reason });
    }

    // Charge user
    let chargeResult = null;
    try {
      const payProvider = paymentRegistry.get(provider || task.provider || 'stripe');
      chargeResult = await payProvider.charge(userId, task.cost, {
        taskId: task.id,
        description: `SHADDAI Task: ${task.title}`,
        reference: task.id
      });
    } catch (chargeError) {
      return res.status(402).json({ ok: false, error: `Payment failed: ${chargeError.message}` });
    }

    // Record transaction
    const transactionId = chargeResult.transactionId;
    task.status = 'completed';
    task.completedAt = Date.now();
    task.transactionId = transactionId;

    billingService.addTransaction({
      type: 'task_payment',
      userId,
      agentId: task.acceptedBy,
      taskId: task.id,
      amount: task.cost,
      provider: provider || task.provider,
      providerTxId: transactionId,
      status: chargeResult.status || 'pending'
    });

    // Credit agent (90% of cost, platform takes 10%)
    const agentCredit = Math.round(task.cost * 0.9 * 100) / 100;
    billingService.addTransaction({
      type: 'task_earnings',
      agentId: task.acceptedBy,
      taskId: task.id,
      amount: agentCredit,
      status: 'pending'
    });

    _saveTask(task);

    res.json({
      ok: true,
      task,
      payment: {
        status: chargeResult.status,
        transactionId,
        amount: task.cost,
        provider
      },
      agentEarnings: agentCredit
    });
  } catch (e) {
    console.error('[tasks] POST /tasks/:id/complete error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /tasks/user/:userId
 * Get tasks posted by a user
 */
router.get('/tasks/user/:userId', (req, res) => {
  try {
    const db = _readTasks();
    const tasks = (db.tasks || []).filter(t => t.createdBy === req.params.userId);
    tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ ok: true, tasks });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /tasks/agent/:agentId
 * Get tasks accepted/completed by an agent
 */
router.get('/tasks/agent/:agentId', (req, res) => {
  try {
    const db = _readTasks();
    const tasks = (db.tasks || []).filter(t => t.acceptedBy === req.params.agentId);
    tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ ok: true, tasks });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /tasks/:id
 * Cancel a task (only if open/bidding)
 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'];
    const task = _getTask(req.params.id);

    if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
    if (task.createdBy !== userId) {
      return res.status(403).json({ ok: false, error: 'Only task creator can cancel' });
    }
    if (!['open', 'bidding'].includes(task.status)) {
      return res.status(400).json({ ok: false, error: `Cannot cancel task in ${task.status} state` });
    }

    task.status = 'canceled';
    _saveTask(task);

    res.json({ ok: true, task });
  } catch (e) {
    console.error('[tasks] DELETE /tasks/:id error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
