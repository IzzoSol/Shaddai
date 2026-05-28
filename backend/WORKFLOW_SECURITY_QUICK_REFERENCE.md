# PIKADON WORKFLOW SECURITY - QUICK REFERENCE

**Version:** 1.0.0  
**Last Updated:** 2026-05-13

---

## Quick Start

```javascript
const { WorkflowSecurityManager } = require('./workflow-security');

// Initialize (once at app startup)
const securityManager = new WorkflowSecurityManager(database);

// Use in route handlers
try {
  await securityManager.validateJobPosting(userId, jobData, userContext, ipAddress);
  // ... proceed with job creation
} catch (error) {
  return res.status(400).json({ error: error.message });
}
```

---

## API Summary

### Job Posting
```javascript
await securityManager.validateJobPosting(
  userId,              // User ID creating job
  jobData,             // { taskName, description, budget, deadline, jobId }
  userContext,         // { authenticated, userId }
  ipAddress            // Request IP for audit
)
// Returns: { valid: true, validated: { budget, deadline, description, taskName, tags } }
// Throws: Error if validation fails
```

**Validates:**
- User is authenticated
- Budget: $0.01 - $100,000
- Deadline: 1 hour - 365 days in future
- Description: 10-5000 chars, no injection
- Rate limit: max 10 jobs/hour

---

### Bidding
```javascript
await securityManager.validateBid(
  agentId,             // Agent placing bid
  jobId,               // Job being bid on
  bidAmount,           // Amount agent will accept
  agentContext,        // { isAgent, agentId, skills, skillRegistry }
  jobData,             // Job details
  ipAddress
)
// Returns: { valid: true }
// Throws: Error if validation fails
```

**Validates:**
- Agent is legitimate
- Bid amount: 0 - 2x job budget
- Not bidding on own job
- No duplicate bids within 60 seconds
- Rate limit: max 20 bids/hour

---

### Execution
```javascript
await securityManager.validateExecution(
  executionId,         // Unique execution ID
  agentId,             // Agent executing
  jobData,             // Job details (status='awarded', etc)
  agentContext,        // { credentials, skills, skillRegistry }
  skillName,           // Skill to execute
  skillParams,         // Parameters for skill
  ipAddress
)
// Returns: { valid: true }
// Throws: Error if validation fails

// Register timeout (120 seconds max)
const { timeout } = securityManager.registerExecution(executionId, agentId);

// When done, unregister
securityManager.unregisterExecution(executionId, agentId);
```

**Validates:**
- Job status is 'awarded'
- Agent is winner
- Agent credentials verified & not expired
- Agent has required skills
- Skill exists in registry
- Skill parameters match schema
- No code injection in parameters
- Concurrent execution limit not exceeded

---

### Payment
```javascript
await securityManager.validatePayment(
  jobId,               // Job being paid for
  paymentId,           // Unique payment ID
  amount,              // Amount to pay
  jobData,             // Job details (status='completed')
  userContext,         // { userId, ofacChecked, ofacBlocked }
  ipAddress
)
// Returns: { valid: true }
// Throws: Error if validation fails
```

**Validates:**
- Job is completed
- Escrow amount matches budget (±1%)
- Payment not already processed
- User passed OFAC compliance
- Payment ID is unique

---

### Agent Skill Execution
```javascript
securityManager.validateAgentExecution(
  agentId,             // Agent ID
  skillName,           // Skill name
  skillParams,         // Parameters
  skillRegistry,       // Available skills
  ipAddress
)
// Returns: { valid: true }
// Throws: Error if validation fails
```

**Validates:**
- Skill exists in registry
- Parameters match skill schema
- No code injection in parameters
- Resource limits not exceeded

---

## Audit Logging

### Query Audit Logs
```javascript
const logs = securityManager.getAuditLogs(
  { type: 'JOB_CREATED', userId: 'user-123', severity: 'ERROR' },
  100  // limit
);

// Filter by any field
securityManager.getAuditLogs({ status: 'FAILURE' });
securityManager.getAuditLogs({ severity: 'CRITICAL' });
securityManager.getAuditLogs({ action: 'execution_validation' });
```

### Get Security Statistics
```javascript
const stats = securityManager.getSecurityStats();
// Returns: { auditStats, rateLimiterSize, executionsCached, paymentsProcessed }

console.log(stats.auditStats.recentCritical); // Last 20 critical events
```

### Clear Audit Logs (Testing Only)
```javascript
securityManager.clearAuditLogs();
```

---

## Configuration

Edit `CONFIG` object (line 52-108 in workflow-security.js):

```javascript
// Rate limiting (per hour)
CONFIG.MAX_JOBS_PER_HOUR = 10;        // Change to allow more jobs
CONFIG.MAX_BIDS_PER_HOUR = 20;        // Change to allow more bids

// Limits
CONFIG.SKILL_TIMEOUT_MS = 120000;     // 120 seconds per skill
CONFIG.MAX_JOB_BUDGET = 100000;       // $100,000 max
CONFIG.MAX_CONCURRENT_EXECUTIONS_PER_AGENT = 5;

// Payment
CONFIG.OFAC_CHECK_REQUIRED = true;    // Require OFAC compliance
CONFIG.ESCROW_RELEASE_DELAY_MS = 5000; // 5 second audit window

// Audit retention
CONFIG.AUDIT_LOG_MAX_SIZE = 100000;   // Max logs to keep
```

---

## Input Sanitization

### Available Sanitizers

```javascript
const { InputSanitizer } = require('./workflow-security');

// Remove dangerous characters
InputSanitizer.sanitizeText('Hello <script>alert(1)</script>')
// → 'Hello alertalert1'

// Detect SQL injection
InputSanitizer.checkSQLInjection("'; DROP TABLE --")
// → true

// Validate UUID format
InputSanitizer.validateUUID('123e4567-e89b-12d3-a456-426614174000')
// → true

// Validate email
InputSanitizer.validateEmail('user@example.com')
// → true

// Sanitize job description
InputSanitizer.sanitizeDescription('Valid 10+ char description')
// → 'Valid 10+ char description'

// Sanitize task name
InputSanitizer.sanitizeTaskName('Valid Task Name')
// → 'Valid Task Name'
```

---

## Error Messages

### User-Safe Error Messages
```
"Budget must be at least $0.01"
"Budget cannot exceed $100,000"
"Deadline must be at least 1 hour in the future"
"Deadline cannot be more than 365 days in the future"
"Cannot bid on your own job"
"Bid amount cannot exceed $200 (2x job budget)"
"Not the selected winner for this job"
"Job must be completed before payment"
"Payment already processed"
"Code injection detected in parameter 'X'"
"Too many job creations. Try again in 3600 seconds"
"Too many bids. Try again in 1234 seconds"
"Agent has reached maximum concurrent executions (5)"
```

---

## Integration Checklist

- [ ] Import WorkflowSecurityManager in server.js
- [ ] Initialize before starting Express server
- [ ] Add validateJobPosting to POST /api/jobs
- [ ] Add validateBid to POST /api/bids
- [ ] Add validateExecution to POST /api/executions
- [ ] Call registerExecution before skill starts
- [ ] Call unregisterExecution after skill completes
- [ ] Add validatePayment to POST /api/payments
- [ ] Add validateAgentExecution to skill executor
- [ ] Add GET /api/audit-logs for admin
- [ ] Test all validation flows
- [ ] Monitor audit logs in production
- [ ] Call securityManager.destroy() on shutdown

---

## Testing

```bash
# Run all tests
npm test -- workflow-security.test.js

# Run specific test suite
npm test -- workflow-security.test.js -t "Job Posting Validation"

# Run with coverage
npm test -- workflow-security.test.js --coverage
```

**Coverage:** 95%+

---

## Common Issues

### "Rate limited. Try again in X seconds"
**Problem:** Too many requests from same user  
**Solution:** Increase CONFIG limit or wait before retrying

### "Not the selected winner for this job"
**Problem:** Wrong agent trying to execute  
**Solution:** Only job winner can execute

### "Code injection detected"
**Problem:** Parameter contains dangerous patterns (require, eval, etc)  
**Solution:** Sanitize parameters before passing

### "Concurrent execution limit exceeded"
**Problem:** Agent already executing 5 skills  
**Solution:** Wait for one to complete, or increase CONFIG limit

### "Payment already processed"
**Problem:** Same paymentId used twice  
**Solution:** Use unique paymentId for each payment

---

## Performance Tips

1. **Cache Results:** Store validated job/agent data to avoid re-validation
2. **Batch Operations:** Process multiple validations in parallel
3. **Async Cleanup:** Audit logs auto-cleanup, no manual action needed
4. **Rate Limiter:** Automatically cleans old entries every 10 minutes

---

## Security Principles

1. **Zero Trust:** Validate everything explicitly
2. **Fail Closed:** Deny access unless explicitly allowed
3. **Audit Everything:** Log all security events
4. **Defense in Depth:** Multiple validation layers
5. **Explicit over Implicit:** No hidden assumptions

---

## Monitoring

**Alert if:**
- >5 CRITICAL events in 1 hour
- >10 failed validations from same IP in 5 minutes
- OFAC blocks increase
- Execution timeout rate >5%

---

## Cleanup on Shutdown

```javascript
process.on('SIGTERM', () => {
  securityManager.destroy(); // Clear timers
  process.exit(0);
});
```

---

## More Information

- Full integration guide: `WORKFLOW_SECURITY_INTEGRATION.md`
- Test suite: `workflow-security.test.js`
- Source code: `workflow-security.js`
- OWASP compliance: See integration guide

---

**Questions?** Check audit logs with `securityManager.getAuditLogs()`
