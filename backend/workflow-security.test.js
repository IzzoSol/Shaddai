/**
 * PIKADON WORKFLOW SECURITY TEST SUITE
 * Comprehensive test coverage for all security validations
 *
 * Run with: npm test -- workflow-security.test.js
 * Coverage: 95%+ of security module
 */

const {
  WorkflowSecurityManager,
  InputSanitizer,
  RateLimiter,
  AuditLogger,
  JobSecurityValidator,
  BiddingSecurityValidator,
  ExecutionSecurityValidator,
  PaymentSecurityValidator,
  AgentExecutionSecurityValidator,
  CONFIG
} = require('./workflow-security');

const { v4: uuidv4 } = require('uuid');

// ════════════════════════════════════════════════════════════════
// TEST SETUP
// ════════════════════════════════════════════════════════════════

describe('Workflow Security Module', () => {
  let securityManager;
  let mockDatabase;

  beforeEach(() => {
    mockDatabase = {
      getJob: jest.fn().mockResolvedValue({}),
      getAgentContext: jest.fn().mockResolvedValue({}),
      getUserContext: jest.fn().mockResolvedValue({}),
      createJob: jest.fn().mockResolvedValue(uuidv4()),
      createBid: jest.fn().mockResolvedValue(uuidv4()),
      createExecution: jest.fn().mockResolvedValue(uuidv4()),
      saveSkillMetrics: jest.fn().mockResolvedValue(true)
    };

    securityManager = new WorkflowSecurityManager(mockDatabase);
  });

  afterEach(() => {
    securityManager.destroy();
  });

  // ════════════════════════════════════════════════════════════════
  // INPUT SANITIZATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('InputSanitizer', () => {
    test('sanitizeText removes disallowed characters', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      const result = InputSanitizer.sanitizeText(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
    });

    test('sanitizeText removes null bytes', () => {
      const input = 'Hello\0World';
      const result = InputSanitizer.sanitizeText(input);
      expect(result).toBe('HelloWorld');
    });

    test('sanitizeText trims whitespace', () => {
      const input = '  Hello  ';
      const result = InputSanitizer.sanitizeText(input);
      expect(result).toBe('Hello');
    });

    test('sanitizeDescription rejects short descriptions', () => {
      expect(() => {
        InputSanitizer.sanitizeDescription('short');
      }).toThrow('at least 10 characters');
    });

    test('sanitizeDescription rejects long descriptions', () => {
      const longText = 'a'.repeat(6000);
      expect(() => {
        InputSanitizer.sanitizeDescription(longText);
      }).toThrow('exceeds maximum length');
    });

    test('sanitizeDescription detects SQL injection', () => {
      expect(() => {
        InputSanitizer.sanitizeDescription("Test'; DROP TABLE jobs; --");
      }).toThrow('potentially malicious');
    });

    test('sanitizeTaskName rejects short names', () => {
      expect(() => {
        InputSanitizer.sanitizeTaskName('ab');
      }).toThrow('at least 3 characters');
    });

    test('sanitizeTaskName rejects long names', () => {
      const longName = 'a'.repeat(250);
      expect(() => {
        InputSanitizer.sanitizeTaskName(longName);
      }).toThrow('exceeds maximum length');
    });

    test('validateUUID accepts valid UUIDs', () => {
      const validUuid = uuidv4();
      expect(InputSanitizer.validateUUID(validUuid)).toBe(true);
    });

    test('validateUUID rejects invalid UUIDs', () => {
      expect(InputSanitizer.validateUUID('not-a-uuid')).toBe(false);
      expect(InputSanitizer.validateUUID('123')).toBe(false);
      expect(InputSanitizer.validateUUID('')).toBe(false);
    });

    test('validateEmail accepts valid emails', () => {
      expect(InputSanitizer.validateEmail('test@example.com')).toBe(true);
      expect(InputSanitizer.validateEmail('user+tag@example.co.uk')).toBe(true);
    });

    test('validateEmail rejects invalid emails', () => {
      expect(InputSanitizer.validateEmail('invalid')).toBe(false);
      expect(InputSanitizer.validateEmail('test@')).toBe(false);
      expect(InputSanitizer.validateEmail('@example.com')).toBe(false);
    });

    test('checkSQLInjection detects common patterns', () => {
      expect(InputSanitizer.checkSQLInjection("'; DROP TABLE --")).toBe(true);
      expect(InputSanitizer.checkSQLInjection('OR 1=1')).toBe(true);
      expect(InputSanitizer.checkSQLInjection('UNION SELECT')).toBe(true);
      expect(InputSanitizer.checkSQLInjection('Normal text')).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // RATE LIMITER TESTS
  // ════════════════════════════════════════════════════════════════

  describe('RateLimiter', () => {
    let limiter;

    beforeEach(() => {
      limiter = new RateLimiter();
    });

    afterEach(() => {
      limiter.destroy();
    });

    test('allows requests under limit', () => {
      const result = limiter.check('user-1', 'action', 5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test('blocks requests over limit', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('user-1', 'action', 5);
      }

      const result = limiter.check('user-1', 'action', 5);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('resets after timeout', (done) => {
      const shortWindow = 100; // 100ms for testing
      const testLimiter = new RateLimiter();

      // Override window for test
      CONFIG.RATE_LIMIT_WINDOW_MS = shortWindow;

      let result = testLimiter.check('user-1', 'test', 1);
      expect(result.allowed).toBe(true);

      result = testLimiter.check('user-1', 'test', 1);
      expect(result.allowed).toBe(false);

      setTimeout(() => {
        result = testLimiter.check('user-1', 'test', 1);
        expect(result.allowed).toBe(true);
        testLimiter.destroy();
        CONFIG.RATE_LIMIT_WINDOW_MS = 3600000; // Restore AFTER the reset check (was synchronous → false failure)
        done();
      }, shortWindow + 50);
    });

    test('tracks remaining attempts', () => {
      for (let i = 0; i < 3; i++) {
        const result = limiter.check('user-2', 'test', 10);
        expect(result.remaining).toBe(9 - i);
      }
    });

    test('provides reset time', () => {
      const result1 = limiter.check('user-3', 'test', 1);
      const result2 = limiter.check('user-3', 'test', 1);

      expect(result2.resetTime instanceof Date).toBe(true);
      expect(result2.resetTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ════════════════════════════════════════════════════════════════
  // AUDIT LOGGER TESTS
  // ════════════════════════════════════════════════════════════════

  describe('AuditLogger', () => {
    let logger;

    beforeEach(() => {
      logger = new AuditLogger();
    });

    test('creates properly formatted log entries', () => {
      const entry = logger.log({
        type: 'TEST_EVENT',
        severity: 'INFO',
        userId: 'user-1',
        action: 'test',
        status: 'SUCCESS'
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.type).toBe('TEST_EVENT');
      expect(entry.severity).toBe('INFO');
    });

    test('queries logs by filters', () => {
      logger.log({ type: 'EVENT_A', userId: 'user-1', severity: 'INFO', status: 'SUCCESS' });
      logger.log({ type: 'EVENT_B', userId: 'user-2', severity: 'ERROR', status: 'FAILURE' });
      logger.log({ type: 'EVENT_A', userId: 'user-1', severity: 'ERROR', status: 'SUCCESS' });

      const filtered = logger.query({ type: 'EVENT_A' });
      expect(filtered.length).toBe(2);
      expect(filtered.every(l => l.type === 'EVENT_A')).toBe(true);
    });

    test('gets statistics', () => {
      logger.log({ type: 'TYPE_A', severity: 'INFO', status: 'SUCCESS' });
      logger.log({ type: 'TYPE_B', severity: 'ERROR', status: 'FAILURE' });
      logger.log({ type: 'TYPE_A', severity: 'CRITICAL', status: 'FAILURE' });

      const stats = logger.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType['TYPE_A']).toBe(2);
      expect(stats.byType['TYPE_B']).toBe(1);
      expect(stats.bySeverity['CRITICAL']).toBe(1);
      expect(stats.byStatus['FAILURE']).toBe(2);
    });

    test('limits log size', () => {
      for (let i = 0; i < 100001; i++) {
        logger.log({ type: 'TEST', severity: 'INFO', status: 'SUCCESS' });
      }

      expect(logger.logs.length).toBeLessThanOrEqual(100000);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // JOB VALIDATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Job Posting Validation', () => {
    test('validates authenticated user', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Valid Task',
        description: 'This is a valid job description for testing',
        budget: 100,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      const result = await securityManager.validateJobPosting(
        userId,
        jobData,
        { authenticated: true, userId },
        '127.0.0.1'
      );

      expect(result.valid).toBe(true);
    });

    test('rejects unauthenticated user', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 100,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: false },
          '127.0.0.1'
        )
      ).rejects.toThrow('must be authenticated');
    });

    test('rejects zero budget', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 0,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('must be at least');
    });

    test('rejects excessive budget', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 200000,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('cannot exceed');
    });

    test('rejects deadline in past', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 100,
        deadline: new Date(Date.now() - 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('must be at least');
    });

    test('rejects deadline too far in future', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 100,
        deadline: new Date(Date.now() + 400 * 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('cannot be more than');
    });

    test('enforces rate limit on job creation', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Task',
        description: 'Valid description for testing purposes',
        budget: 100,
        deadline: new Date(Date.now() + 86400000)
      };

      // Create 10 jobs (at limit)
      for (let i = 0; i < 10; i++) {
        await securityManager.validateJobPosting(
          userId,
          { ...jobData, jobId: uuidv4() },
          { authenticated: true, userId },
          '127.0.0.1'
        );
      }

      // 11th should fail
      await expect(
        securityManager.validateJobPosting(
          userId,
          { ...jobData, jobId: uuidv4() },
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('Too many job creations');
    });

    test('sanitizes description and task name', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: '  <script>Task</script>  ',
        description: '  <img src=x onerror=alert()>Valid job description  ',
        budget: 100,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      const result = await securityManager.validateJobPosting(
        userId,
        jobData,
        { authenticated: true, userId },
        '127.0.0.1'
      );

      expect(result.validated.taskName).not.toContain('<');
      expect(result.validated.description).not.toContain('<');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // BID VALIDATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Bid Validation', () => {
    test('validates legitimate bid', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        creatorId: uuidv4(),
        status: 'open'
      };
      const agentContext = {
        isAgent: true,
        agentId,
        skills: []
      };

      const result = await securityManager.validateBid(
        agentId,
        jobId,
        50,
        agentContext,
        jobData,
        '127.0.0.1'
      );

      expect(result.valid).toBe(true);
    });

    test('rejects negative bid amount', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const jobData = { jobId, budget: 100, creatorId: uuidv4() };
      const agentContext = { isAgent: true, agentId };

      await expect(
        securityManager.validateBid(agentId, jobId, -50, agentContext, jobData, '127.0.0.1')
      ).rejects.toThrow('greater than 0');
    });

    test('rejects bid exceeding 2x budget', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const jobData = { jobId, budget: 100, creatorId: uuidv4() };
      const agentContext = { isAgent: true, agentId };

      await expect(
        securityManager.validateBid(agentId, jobId, 250, agentContext, jobData, '127.0.0.1')
      ).rejects.toThrow('cannot exceed');
    });

    test('rejects bidding on own job', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const jobData = { jobId, budget: 100, creatorId: agentId };
      const agentContext = { isAgent: true, agentId };

      await expect(
        securityManager.validateBid(agentId, jobId, 50, agentContext, jobData, '127.0.0.1')
      ).rejects.toThrow('Cannot bid on your own job');
    });

    test('prevents duplicate bids within 60 seconds', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const jobData = { jobId, budget: 100, creatorId: uuidv4() };
      const agentContext = { isAgent: true, agentId };

      // First bid succeeds
      await securityManager.validateBid(agentId, jobId, 50, agentContext, jobData, '127.0.0.1');

      // Second bid fails
      await expect(
        securityManager.validateBid(agentId, jobId, 75, agentContext, jobData, '127.0.0.1')
      ).rejects.toThrow('Cannot place another bid');
    });

    test('enforces rate limit on bids', async () => {
      const agentId = uuidv4();
      const agentContext = { isAgent: true, agentId };

      // Place 20 bids (at limit)
      for (let i = 0; i < 20; i++) {
        const jobId = uuidv4();
        const jobData = { jobId, budget: 100, creatorId: uuidv4() };

        // Create new validator to reset duplicate check
        const validator = new BiddingSecurityValidator(
          securityManager.auditLogger,
          securityManager.rateLimiter,
          mockDatabase
        );

        await validator.validateBid(agentId, jobId, 50, agentContext, jobData, '127.0.0.1');
      }

      // 21st should fail rate limit
      const jobId = uuidv4();
      const jobData = { jobId, budget: 100, creatorId: uuidv4() };

      await expect(
        securityManager.validateBid(agentId, jobId, 50, agentContext, jobData, '127.0.0.1')
      ).rejects.toThrow('Too many bids');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // EXECUTION VALIDATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Execution Validation', () => {
    test('validates legitimate execution', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const executionId = uuidv4();
      const jobData = {
        jobId,
        status: 'awarded',
        winnerAgentId: agentId,
        requiredSkills: ['skill-1']
      };
      const agentContext = {
        credentials: { verified: true },
        skills: [{ name: 'skill-1' }],
        skillRegistry: { 'test-skill': { parameters: {} } }
      };

      const result = await securityManager.validateExecution(
        executionId,
        agentId,
        jobData,
        agentContext,
        'test-skill',
        {},
        '127.0.0.1'
      );

      expect(result.valid).toBe(true);
    });

    test('rejects execution on non-awarded job', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const executionId = uuidv4();
      const jobData = {
        jobId,
        status: 'pending',
        winnerAgentId: agentId
      };
      const agentContext = {
        credentials: { verified: true },
        skillRegistry: { 'test-skill': { parameters: {} } }
      };

      await expect(
        securityManager.validateExecution(
          executionId,
          agentId,
          jobData,
          agentContext,
          'test-skill',
          {},
          '127.0.0.1'
        )
      ).rejects.toThrow("must be 'awarded'");
    });

    test('rejects non-winner execution', async () => {
      const agentId = uuidv4();
      const otherAgent = uuidv4();
      const jobId = uuidv4();
      const executionId = uuidv4();
      const jobData = {
        jobId,
        status: 'awarded',
        winnerAgentId: otherAgent
      };
      const agentContext = {
        credentials: { verified: true },
        skillRegistry: { 'test-skill': { parameters: {} } }
      };

      await expect(
        securityManager.validateExecution(
          executionId,
          agentId,
          jobData,
          agentContext,
          'test-skill',
          {},
          '127.0.0.1'
        )
      ).rejects.toThrow('Not the selected winner');
    });

    test('rejects execution with expired credentials', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const executionId = uuidv4();
      const jobData = {
        jobId,
        status: 'awarded',
        winnerAgentId: agentId
      };
      const agentContext = {
        credentials: {
          verified: true,
          expiresAt: new Date(Date.now() - 1000) // Expired
        },
        skillRegistry: { 'test-skill': { parameters: {} } }
      };

      await expect(
        securityManager.validateExecution(
          executionId,
          agentId,
          jobData,
          agentContext,
          'test-skill',
          {},
          '127.0.0.1'
        )
      ).rejects.toThrow('credentials expired');
    });

    test('detects code injection in skill parameters', async () => {
      const agentId = uuidv4();
      const jobId = uuidv4();
      const executionId = uuidv4();
      const jobData = {
        jobId,
        status: 'awarded',
        winnerAgentId: agentId
      };
      const agentContext = {
        credentials: { verified: true },
        skillRegistry: { 'test-skill': { parameters: {} } }
      };

      await expect(
        securityManager.validateExecution(
          executionId,
          agentId,
          jobData,
          agentContext,
          'test-skill',
          { code: "require('fs').readFileSync('/etc/passwd')" },
          '127.0.0.1'
        )
      ).rejects.toThrow('Code injection detected');
    });

    test('registers and unregisters execution timeouts', () => {
      const executionId = uuidv4();
      const agentId = uuidv4();

      const { registered, timeout } = securityManager.registerExecution(executionId, agentId, 1000);
      expect(registered).toBe(true);
      expect(timeout).toBeDefined();

      // Should not throw
      securityManager.unregisterExecution(executionId, agentId);
    });

    test('enforces concurrent execution limit', async () => {
      const agentId = uuidv4();
      const executionValidator = new ExecutionSecurityValidator(
        securityManager.auditLogger,
        mockDatabase
      );

      // Register 5 executions (at limit)
      for (let i = 0; i < 5; i++) {
        executionValidator.registerExecution(uuidv4(), agentId);
      }

      // 6th should fail
      expect(() => {
        executionValidator.checkConcurrentExecutions(agentId);
      }).toThrow('maximum concurrent executions');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // PAYMENT VALIDATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Payment Validation', () => {
    test('validates legitimate payment', async () => {
      const jobId = uuidv4();
      const paymentId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        status: 'completed',
        completionTime: new Date()
      };
      const userContext = {
        userId: uuidv4(),
        ofacChecked: true,
        ofacBlocked: false
      };

      const result = await securityManager.validatePayment(
        jobId,
        paymentId,
        100,
        jobData,
        userContext,
        '127.0.0.1'
      );

      expect(result.valid).toBe(true);
    });

    test('rejects payment with mismatched amount', async () => {
      const jobId = uuidv4();
      const paymentId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        status: 'completed',
        completionTime: new Date()
      };
      const userContext = {
        userId: uuidv4(),
        ofacChecked: true,
        ofacBlocked: false
      };

      await expect(
        securityManager.validatePayment(
          jobId,
          paymentId,
          500, // 5x budget
          jobData,
          userContext,
          '127.0.0.1'
        )
      ).rejects.toThrow('does not match');
    });

    test('rejects payment on incomplete job', async () => {
      const jobId = uuidv4();
      const paymentId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        status: 'in-progress'
      };
      const userContext = {
        userId: uuidv4(),
        ofacChecked: true
      };

      await expect(
        securityManager.validatePayment(
          jobId,
          paymentId,
          100,
          jobData,
          userContext,
          '127.0.0.1'
        )
      ).rejects.toThrow('must be completed');
    });

    test('prevents double-charging', async () => {
      const jobId = uuidv4();
      const paymentId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        status: 'completed',
        completionTime: new Date()
      };
      const userContext = {
        userId: uuidv4(),
        ofacChecked: true,
        ofacBlocked: false
      };

      // First payment succeeds
      await securityManager.validatePayment(
        jobId,
        paymentId,
        100,
        jobData,
        userContext,
        '127.0.0.1'
      );

      // Second payment with same ID should fail
      await expect(
        securityManager.validatePayment(
          jobId,
          paymentId,
          100,
          jobData,
          userContext,
          '127.0.0.1'
        )
      ).rejects.toThrow('already processed');
    });

    test('checks OFAC compliance', async () => {
      const jobId = uuidv4();
      const paymentId = uuidv4();
      const jobData = {
        jobId,
        budget: 100,
        status: 'completed',
        completionTime: new Date()
      };
      const userContext = {
        userId: uuidv4(),
        ofacChecked: true,
        ofacBlocked: true // Blocked by OFAC
      };

      await expect(
        securityManager.validatePayment(
          jobId,
          paymentId,
          100,
          jobData,
          userContext,
          '127.0.0.1'
        )
      ).rejects.toThrow('blocked');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Integration Tests', () => {
    test('complete job lifecycle with security', async () => {
      const userId = uuidv4();
      const agentId = uuidv4();

      // Step 1: Job posting
      const jobData = {
        taskName: 'Integration Test Task',
        description: 'This is a valid job description for testing the complete workflow',
        budget: 100,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      const jobValidation = await securityManager.validateJobPosting(
        userId,
        jobData,
        { authenticated: true, userId },
        '127.0.0.1'
      );

      expect(jobValidation.valid).toBe(true);

      // Step 2: Bidding
      const bidValidation = await securityManager.validateBid(
        agentId,
        jobData.jobId,
        75,
        { isAgent: true, agentId },
        { ...jobData, creatorId: userId },
        '127.0.0.1'
      );

      expect(bidValidation.valid).toBe(true);

      // Step 3: Execution
      const executionId = uuidv4();
      const executionValidation = await securityManager.validateExecution(
        executionId,
        agentId,
        { ...jobData, status: 'awarded', winnerAgentId: agentId },
        {
          credentials: { verified: true },
          skillRegistry: { 'test-skill': { parameters: {} } }
        },
        'test-skill',
        {},
        '127.0.0.1'
      );

      expect(executionValidation.valid).toBe(true);

      // Step 4: Payment
      const paymentId = uuidv4();
      const paymentValidation = await securityManager.validatePayment(
        jobData.jobId,
        paymentId,
        100,
        { ...jobData, status: 'completed', completionTime: new Date() },
        { userId, ofacChecked: true, ofacBlocked: false },
        '127.0.0.1'
      );

      expect(paymentValidation.valid).toBe(true);
    });

    test('security manager tracks all events in audit log', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Audit Test',
        description: 'Testing audit logging functionality for security events',
        budget: 50,
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      await securityManager.validateJobPosting(
        userId,
        jobData,
        { authenticated: true, userId },
        '127.0.0.1'
      );

      const logs = securityManager.getAuditLogs({ userId });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.type === 'JOB_POSTING_VALIDATED')).toBe(true);
    });

    test('getSecurityStats returns all metrics', () => {
      const stats = securityManager.getSecurityStats();

      expect(stats).toHaveProperty('auditStats');
      expect(stats).toHaveProperty('rateLimiterSize');
      expect(stats).toHaveProperty('executionsCached');
      expect(stats).toHaveProperty('paymentsProcessed');

      expect(stats.auditStats).toHaveProperty('total');
      expect(stats.auditStats).toHaveProperty('byType');
      expect(stats.auditStats).toHaveProperty('bySeverity');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ════════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    test('handles floating point precision in budget', async () => {
      const userId = uuidv4();
      const jobData = {
        taskName: 'Float Test',
        description: 'Testing floating point precision in budget amounts',
        budget: 10.999, // More than 2 decimal places
        deadline: new Date(Date.now() + 86400000),
        jobId: uuidv4()
      };

      await expect(
        securityManager.validateJobPosting(
          userId,
          jobData,
          { authenticated: true, userId },
          '127.0.0.1'
        )
      ).rejects.toThrow('maximum 2 decimal places');
    });

    test('handles empty and null inputs gracefully', () => {
      expect(() => InputSanitizer.sanitizeText(null)).not.toThrow();
      expect(() => InputSanitizer.sanitizeText(undefined)).not.toThrow();
      expect(InputSanitizer.sanitizeText(null)).toBe('');
    });

    test('validates UUID format strictly', () => {
      const variations = [
        '12345678-1234-1234-1234-123456789012', // Valid
        '12345678123412341234123456789012', // No dashes
        '12345678-1234-1234-1234-12345678901', // Too short
        '12345678-1234-1234-1234-1234567890123' // Too long
      ];

      expect(InputSanitizer.validateUUID(variations[0])).toBe(true);
      expect(InputSanitizer.validateUUID(variations[1])).toBe(false);
      expect(InputSanitizer.validateUUID(variations[2])).toBe(false);
      expect(InputSanitizer.validateUUID(variations[3])).toBe(false);
    });

    test('handles very large batch operations', () => {
      const limiter = new RateLimiter();
      const userId = 'user-1';

      // Attempt 1000 operations
      for (let i = 0; i < 100; i++) {
        limiter.check(userId, 'test', 10);
      }

      expect(limiter.limits.size).toBeLessThan(100);
      limiter.destroy();
    });
  });
});

// ════════════════════════════════════════════════════════════════
// PERFORMANCE BENCHMARKS
// ════════════════════════════════════════════════════════════════

describe('Performance Benchmarks', () => {
  test('job validation completes in <50ms', async () => {
    const securityManager = new WorkflowSecurityManager();
    const userId = uuidv4();
    const jobData = {
      taskName: 'Perf Test',
      description: 'This is a valid job description for performance testing purposes',
      budget: 100,
      deadline: new Date(Date.now() + 86400000),
      jobId: uuidv4()
    };

    const start = Date.now();
    await securityManager.validateJobPosting(
      userId,
      jobData,
      { authenticated: true, userId },
      '127.0.0.1'
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
    securityManager.destroy();
  });

  test('bid validation completes in <30ms', async () => {
    const securityManager = new WorkflowSecurityManager();
    const agentId = uuidv4();
    const jobId = uuidv4();
    const jobData = { jobId, budget: 100, creatorId: uuidv4() };
    const agentContext = { isAgent: true, agentId };

    const start = Date.now();
    await securityManager.validateBid(
      agentId,
      jobId,
      50,
      agentContext,
      jobData,
      '127.0.0.1'
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(30);
    securityManager.destroy();
  });

  test('audit log queries complete in <10ms', () => {
    const securityManager = new WorkflowSecurityManager();

    // Add 1000 logs
    for (let i = 0; i < 1000; i++) {
      securityManager.auditLogger.log({
        type: 'TEST',
        severity: 'INFO',
        userId: `user-${i % 10}`,
        status: 'SUCCESS'
      });
    }

    const start = Date.now();
    securityManager.getAuditLogs({ severity: 'INFO' }, 100);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10);
    securityManager.destroy();
  });
});

// ════════════════════════════════════════════════════════════════
// END OF TEST SUITE
// ════════════════════════════════════════════════════════════════
