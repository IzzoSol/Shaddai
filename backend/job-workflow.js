/**
 * JOB WORKFLOW ENGINE v1
 * Complete job lifecycle management with bidding, award, execution, and payment
 * Production-grade with real data structures and audit trails
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class JobWorkflowEngine {
  constructor(database) {
    this.db = database;
    this.jobsDir = path.join(__dirname, '../generated-output/jobs');
    this.auditDir = path.join(__dirname, '../generated-output/audit');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.jobsDir, this.auditDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * CREATE JOB
   * POST /api/jobs
   * Creates a new job with full data structure
   */
  async createJob(payload) {
    try {
      const {
        title,
        description,
        budget,
        requiredSkills = [],
        deadline,
        createdBy,
        attachments = [],
        priority = 'medium',
        category = 'general'
      } = payload;

      // Validate required fields
      if (!title || !description || !budget || !createdBy) {
        throw new Error('Missing required fields: title, description, budget, createdBy');
      }

      if (budget < 5 || budget > 50000) {
        throw new Error('Budget must be between $5 and $50,000');
      }

      if (!deadline || new Date(deadline) <= new Date()) {
        throw new Error('Deadline must be in the future');
      }

      // Generate job ID
      const jobId = `job_${crypto.randomBytes(12).toString('hex')}`;

      // Calculate escrow (10% of budget, min $1)
      const escrowAmount = Math.max(Math.ceil(budget * 0.1), 1);

      const job = {
        id: jobId,
        title,
        description,
        budget,
        escrowAmount,
        requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
        deadline: new Date(deadline).toISOString(),
        createdBy,
        attachments: Array.isArray(attachments) ? attachments : [],
        priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        category,
        status: 'open', // open, in_progress, completed, cancelled
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        awardedTo: null,
        awardedAt: null,
        completedAt: null,
        cancelledAt: null,
        bidsCount: 0,
        totalBidAmount: 0,
        lowestBid: null,
        highestBid: null,
        selectedBidId: null,
        paymentStatus: 'pending', // pending, held_in_escrow, released, refunded
        completionNotes: null,
        ratings: {
          agentRating: null,
          clientRating: null
        }
      };

      // Save to database
      this.db.saveJob(job);

      // Save to file for backup
      fs.writeFileSync(
        path.join(this.jobsDir, `${jobId}.json`),
        JSON.stringify(job, null, 2)
      );

      // Audit log
      this._auditLog('JOB_CREATED', jobId, createdBy, {
        title,
        budget,
        requiredSkills
      });

      console.log(`[JOB] Created job ${jobId}: "${title}" ($${budget})`);

      return {
        status: 'success',
        data: job
      };
    } catch (error) {
      console.error('[JOB] Error creating job:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * GET JOB DETAILS
   * GET /api/jobs/:jobId
   * Returns full job with all related data
   */
  async getJobDetails(jobId) {
    try {
      const job = this.db.getJob(jobId);
      if (!job) {
        return {
          status: 'error',
          message: 'Job not found'
        };
      }

      // Get all bids for this job
      const bids = this.db.getBidsForJob(jobId) || [];
      const activeBids = bids.filter(b => b.status === 'active');
      const awardedBid = bids.find(b => b.id === job.selectedBidId);

      // Get execution if awarded
      let execution = null;
      if (job.awardedTo) {
        execution = this.db.getExecutionByJobId(jobId);
      }

      return {
        status: 'success',
        data: {
          ...job,
          bids: {
            total: bids.length,
            active: activeBids.length,
            awarded: awardedBid || null,
            all: bids
          },
          execution: execution,
          timeRemaining: this._getTimeRemaining(job.deadline),
          bidPercentage: activeBids.length > 0 ? 'high' : 'low'
        }
      };
    } catch (error) {
      console.error('[JOB] Error getting job details:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * PLACE BID
   * POST /api/jobs/:jobId/bids
   * Agent/user places a bid on a job
   */
  async placeBid(jobId, payload) {
    try {
      const { agentId, amount, message = '', skills = [] } = payload;

      if (!agentId || !amount) {
        throw new Error('Missing required fields: agentId, amount');
      }

      const job = this.db.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status !== 'open') {
        throw new Error(`Cannot bid on job with status: ${job.status}`);
      }

      if (amount < 1 || amount > job.budget * 1.5) {
        throw new Error(`Bid amount must be between $1 and $${job.budget * 1.5}`);
      }

      // Check if agent already bid
      const existingBids = this.db.getBidsForJob(jobId) || [];
      if (existingBids.some(b => b.agentId === agentId && b.status === 'active')) {
        throw new Error('Agent has already placed an active bid on this job');
      }

      const bidId = `bid_${crypto.randomBytes(12).toString('hex')}`;

      const bid = {
        id: bidId,
        jobId,
        agentId,
        amount,
        message,
        skills: Array.isArray(skills) ? skills : [],
        status: 'active', // active, withdrawn, rejected, accepted, expired
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        estimatedCompletionDays: payload.estimatedCompletionDays || 7,
        deliverySpeed: payload.deliverySpeed || 'standard', // fast, standard, relaxed
        agentRating: payload.agentRating || 4.5,
        agentReviewCount: payload.agentReviewCount || 0,
        coverLetter: payload.coverLetter || null
      };

      // Save bid
      this.db.saveBid(bid);

      // Update job stats
      job.bidsCount = (job.bidsCount || 0) + 1;
      job.totalBidAmount = (job.totalBidAmount || 0) + amount;
      if (!job.lowestBid || amount < job.lowestBid) job.lowestBid = amount;
      if (!job.highestBid || amount > job.highestBid) job.highestBid = amount;
      job.updatedAt = new Date().toISOString();
      this.db.saveJob(job);

      // Audit log
      this._auditLog('BID_PLACED', jobId, agentId, {
        bidId,
        amount,
        estimatedCompletion: bid.estimatedCompletionDays
      });

      console.log(`[BID] Agent ${agentId} placed $${amount} bid on job ${jobId}`);

      return {
        status: 'success',
        data: bid
      };
    } catch (error) {
      console.error('[BID] Error placing bid:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * GET ALL BIDS FOR JOB
   * GET /api/jobs/:jobId/bids
   * Lists all bids with sorting and filtering
   */
  async getBidsForJob(jobId, options = {}) {
    try {
      const job = this.db.getJob(jobId);
      if (!job) {
        return {
          status: 'error',
          message: 'Job not found'
        };
      }

      let bids = this.db.getBidsForJob(jobId) || [];

      // Filter by status
      if (options.status) {
        bids = bids.filter(b => b.status === options.status);
      }

      // Sort
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder === 'desc' ? -1 : 1;

      bids.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal < bVal) return -1 * sortOrder;
        if (aVal > bVal) return 1 * sortOrder;
        return 0;
      });

      // Pagination
      const page = options.page || 1;
      const pageSize = options.pageSize || 20;
      const start = (page - 1) * pageSize;
      const paginated = bids.slice(start, start + pageSize);

      return {
        status: 'success',
        data: {
          total: bids.length,
          page,
          pageSize,
          bids: paginated,
          stats: {
            averageBid: bids.length > 0 ? (bids.reduce((sum, b) => sum + b.amount, 0) / bids.length).toFixed(2) : 0,
            minBid: bids.length > 0 ? Math.min(...bids.map(b => b.amount)) : 0,
            maxBid: bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : 0
          }
        }
      };
    } catch (error) {
      console.error('[BID] Error getting bids:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * AWARD JOB TO AGENT
   * POST /api/jobs/:jobId/award
   * Selects winning bid and creates execution
   */
  async awardJob(jobId, payload) {
    try {
      const { bidId, clientId } = payload;

      if (!bidId) {
        throw new Error('Missing required field: bidId');
      }

      const job = this.db.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status !== 'open') {
        throw new Error(`Cannot award job with status: ${job.status}`);
      }

      const bid = this.db.getBid(bidId);
      if (!bid || bid.jobId !== jobId) {
        throw new Error('Bid not found for this job');
      }

      if (bid.status !== 'active') {
        throw new Error(`Cannot award with bid status: ${bid.status}`);
      }

      // Update job
      job.status = 'in_progress';
      job.awardedTo = bid.agentId;
      job.awardedAt = new Date().toISOString();
      job.selectedBidId = bidId;
      job.paymentStatus = 'held_in_escrow';
      job.updatedAt = new Date().toISOString();
      this.db.saveJob(job);

      // Update winning bid
      bid.status = 'accepted';
      bid.updatedAt = new Date().toISOString();
      this.db.saveBid(bid);

      // Reject all other bids
      const allBids = this.db.getBidsForJob(jobId) || [];
      allBids.forEach(b => {
        if (b.id !== bidId && b.status === 'active') {
          b.status = 'rejected';
          b.updatedAt = new Date().toISOString();
          this.db.saveBid(b);
        }
      });

      // Create execution record
      const executionId = `exec_${crypto.randomBytes(12).toString('hex')}`;
      const execution = {
        id: executionId,
        jobId,
        bidId,
        agentId: bid.agentId,
        clientId: clientId || job.createdBy,
        status: 'assigned', // assigned, started, in_progress, completed, failed
        budget: bid.amount,
        escrowAmount: job.escrowAmount,
        expectedCompletionDate: new Date(
          Date.now() + bid.estimatedCompletionDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        deliverables: [],
        milestones: [],
        communications: []
      };

      // Save execution
      this.db.saveExecution(execution);

      // Audit log
      this._auditLog('JOB_AWARDED', jobId, bid.agentId, {
        bidId,
        amount: bid.amount,
        agentRating: bid.agentRating
      });

      console.log(`[AWARD] Job ${jobId} awarded to agent ${bid.agentId} for $${bid.amount}`);

      return {
        status: 'success',
        data: {
          job,
          bid,
          execution
        }
      };
    } catch (error) {
      console.error('[AWARD] Error awarding job:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * COMPLETE JOB
   * POST /api/jobs/:jobId/complete
   * Mark job as complete, release escrow, process payment
   */
  async completeJob(jobId, payload) {
    try {
      const { agentId, deliverables = [], notes = '', rating = null } = payload;

      const job = this.db.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status !== 'in_progress') {
        throw new Error(`Cannot complete job with status: ${job.status}`);
      }

      const execution = this.db.getExecutionByJobId(jobId);
      if (!execution) {
        throw new Error('No execution found for this job');
      }

      if (execution.agentId !== agentId) {
        throw new Error('Only the assigned agent can complete this job');
      }

      // Update job
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.completionNotes = notes;
      job.paymentStatus = 'released';
      job.updatedAt = new Date().toISOString();

      if (rating) {
        job.ratings.agentRating = Math.min(5, Math.max(1, rating));
      }

      this.db.saveJob(job);

      // Update execution
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.deliverables = Array.isArray(deliverables) ? deliverables : [];
      execution.updatedAt = new Date().toISOString();
      this.db.saveExecution(execution);

      // Create payment record
      const paymentId = `payment_${crypto.randomBytes(12).toString('hex')}`;
      const payment = {
        id: paymentId,
        jobId,
        executionId: execution.id,
        agentId,
        clientId: job.createdBy,
        amount: execution.budget,
        escrowAmount: job.escrowAmount,
        totalAmount: execution.budget + job.escrowAmount,
        status: 'completed',
        type: 'job_completion',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      this.db.savePayment(payment);

      // Audit log
      this._auditLog('JOB_COMPLETED', jobId, agentId, {
        executionId: execution.id,
        amount: execution.budget,
        deliverables: deliverables.length,
        rating
      });

      console.log(`[COMPLETE] Job ${jobId} completed by ${agentId}. Payment: $${payment.totalAmount}`);

      return {
        status: 'success',
        data: {
          job,
          execution,
          payment
        }
      };
    } catch (error) {
      console.error('[COMPLETE] Error completing job:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * CANCEL JOB
   * POST /api/jobs/:jobId/cancel
   * Cancel job and refund escrow/bid amounts
   */
  async cancelJob(jobId, payload) {
    try {
      const { cancelledBy, reason = 'Not specified' } = payload;

      if (!cancelledBy) {
        throw new Error('Missing required field: cancelledBy');
      }

      const job = this.db.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status === 'completed' || job.status === 'cancelled') {
        throw new Error(`Cannot cancel job with status: ${job.status}`);
      }

      // Only creator or admin can cancel
      if (cancelledBy !== job.createdBy && !this._isAdmin(cancelledBy)) {
        throw new Error('Only job creator can cancel');
      }

      // Update job
      job.status = 'cancelled';
      job.cancelledAt = new Date().toISOString();
      job.paymentStatus = job.status === 'in_progress' ? 'refunded' : 'pending';
      job.updatedAt = new Date().toISOString();
      this.db.saveJob(job);

      // If execution exists, cancel it
      if (job.awardedTo) {
        const execution = this.db.getExecutionByJobId(jobId);
        if (execution && execution.status !== 'completed') {
          execution.status = 'failed';
          execution.updatedAt = new Date().toISOString();
          this.db.saveExecution(execution);
        }
      }

      // Create refund records
      const refunds = [];

      // Refund escrow to client
      if (job.escrowAmount > 0) {
        const refund = {
          id: `refund_${crypto.randomBytes(12).toString('hex')}`,
          jobId,
          recipientId: job.createdBy,
          amount: job.escrowAmount,
          reason: `Job cancelled: ${reason}`,
          type: 'escrow_refund',
          status: 'completed',
          createdAt: new Date().toISOString()
        };
        this.db.saveRefund(refund);
        refunds.push(refund);
      }

      // Refund bid to agent if awarded
      if (job.awardedTo) {
        const bid = this.db.getBid(job.selectedBidId);
        if (bid) {
          const refund = {
            id: `refund_${crypto.randomBytes(12).toString('hex')}`,
            jobId,
            bidId: bid.id,
            recipientId: job.awardedTo,
            amount: bid.amount,
            reason: `Job cancelled: ${reason}`,
            type: 'bid_refund',
            status: 'completed',
            createdAt: new Date().toISOString()
          };
          this.db.saveRefund(refund);
          refunds.push(refund);
        }
      }

      // Audit log
      this._auditLog('JOB_CANCELLED', jobId, cancelledBy, {
        reason,
        status: job.status,
        refunds: refunds.length
      });

      console.log(`[CANCEL] Job ${jobId} cancelled. Refunds issued: ${refunds.length}`);

      return {
        status: 'success',
        data: {
          job,
          refunds
        }
      };
    } catch (error) {
      console.error('[CANCEL] Error cancelling job:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * WITHDRAW BID
   * POST /api/jobs/:jobId/bids/:bidId/withdraw
   * Agent withdraws their bid before it's awarded
   */
  async withdrawBid(jobId, bidId, payload) {
    try {
      const { agentId } = payload;

      const bid = this.db.getBid(bidId);
      if (!bid || bid.jobId !== jobId) {
        throw new Error('Bid not found');
      }

      if (bid.agentId !== agentId) {
        throw new Error('Only the bidding agent can withdraw');
      }

      if (bid.status !== 'active') {
        throw new Error(`Cannot withdraw bid with status: ${bid.status}`);
      }

      // Update bid
      bid.status = 'withdrawn';
      bid.updatedAt = new Date().toISOString();
      this.db.saveBid(bid);

      // Update job counts
      const job = this.db.getJob(jobId);
      if (job) {
        job.bidsCount = Math.max(0, job.bidsCount - 1);
        job.updatedAt = new Date().toISOString();
        this.db.saveJob(job);
      }

      // Audit log
      this._auditLog('BID_WITHDRAWN', jobId, agentId, { bidId });

      console.log(`[BID] Agent ${agentId} withdrew bid ${bidId}`);

      return {
        status: 'success',
        data: bid
      };
    } catch (error) {
      console.error('[BID] Error withdrawing bid:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * LIST JOBS
   * GET /api/jobs
   * List jobs with filtering and sorting
   */
  async listJobs(options = {}) {
    try {
      let jobs = Array.from(this.db.jobIndex?.values() || []);

      // Filter by status
      if (options.status) {
        jobs = jobs.filter(j => j.status === options.status);
      }

      // Filter by creator
      if (options.createdBy) {
        jobs = jobs.filter(j => j.createdBy === options.createdBy);
      }

      // Filter by category
      if (options.category) {
        jobs = jobs.filter(j => j.category === options.category);
      }

      // Filter by budget range
      if (options.minBudget || options.maxBudget) {
        jobs = jobs.filter(j =>
          (!options.minBudget || j.budget >= options.minBudget) &&
          (!options.maxBudget || j.budget <= options.maxBudget)
        );
      }

      // Sort
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

      jobs.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (typeof aVal === 'string') {
          return aVal.localeCompare(bVal) * sortOrder;
        }
        if (aVal < bVal) return -1 * sortOrder;
        if (aVal > bVal) return 1 * sortOrder;
        return 0;
      });

      // Pagination
      const page = options.page || 1;
      const pageSize = options.pageSize || 20;
      const start = (page - 1) * pageSize;
      const paginated = jobs.slice(start, start + pageSize);

      return {
        status: 'success',
        data: {
          total: jobs.length,
          page,
          pageSize,
          jobs: paginated
        }
      };
    } catch (error) {
      console.error('[JOB] Error listing jobs:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * HELPER: Get time remaining until deadline
   */
  _getTimeRemaining(deadline) {
    const now = new Date();
    const end = new Date(deadline);
    const diff = end - now;

    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  }

  /**
   * HELPER: Check if user is admin
   */
  _isAdmin(userId) {
    // TODO: Check against admin users list or role in database
    return userId === 'admin' || userId?.startsWith('admin_');
  }

  /**
   * AUDIT LOG
   * Log all job events for compliance and debugging
   */
  _auditLog(event, jobId, userId, details = {}) {
    const auditEntry = {
      event,
      jobId,
      userId,
      details,
      timestamp: new Date().toISOString()
    };

    const auditFile = path.join(this.auditDir, 'job-audit.log');
    fs.appendFileSync(auditFile, JSON.stringify(auditEntry) + '\n');
  }
}

module.exports = JobWorkflowEngine;
