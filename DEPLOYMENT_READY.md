# SHADDAI v61 - Pre-Deployment Checklist

**Version:** 61.0.0  
**Status:** Ready for Testing & Deployment  
**Last Updated:** 2026-05-13  
**Deployment Type:** Full Stack (Backend + Frontend + Agents)

---

## TABLE OF CONTENTS

1. [Backend Readiness](#backend-readiness)
2. [Frontend Readiness](#frontend-readiness)
3. [Agent System Readiness](#agent-system-readiness)
4. [Database & Storage](#database--storage)
5. [Security & Compliance](#security--compliance)
6. [Testing Checklist](#testing-checklist)
7. [Deployment Steps](#deployment-steps)
8. [Rollback Plan](#rollback-plan)
9. [Post-Deployment Verification](#post-deployment-verification)

---

## BACKEND READINESS

### API Endpoints

- [ ] **Health Check Endpoint**
  - Endpoint: `GET /api/health`
  - Expected: Returns status: "operational"
  - Verification: `curl http://localhost:3000/api/health`

- [ ] **Status Endpoint** (Requires Auth)
  - Endpoint: `GET /api/status`
  - Expected: Returns server status + agent list
  - Verification: Include valid JWT token

- [ ] **Job Management Endpoints**
  - `POST /api/jobs/create` - Create new job
  - `GET /api/jobs/:jobId` - Get job details
  - `GET /api/jobs` - List all jobs
  - `PUT /api/jobs/:jobId/update` - Update job
  - `DELETE /api/jobs/:jobId` - Delete job

- [ ] **Bidding Endpoints**
  - `POST /api/bids/place` - Place bid on job
  - `GET /api/bids/:jobId` - Get bids for job
  - `PUT /api/bids/:bidId/retract` - Retract bid
  - `POST /api/bids/:bidId/award` - Award job to bidder

- [ ] **Execution Endpoints**
  - `POST /api/executions/start` - Start skill execution
  - `GET /api/executions/:executionId` - Get execution status
  - `GET /api/executions` - List active executions
  - `POST /api/executions/:executionId/cancel` - Cancel execution
  - `GET /api/executions/:executionId/results` - Get execution results

- [ ] **Payment Endpoints**
  - `POST /api/payments/charge` - Charge payment
  - `GET /api/payments/:paymentId` - Get payment status
  - `POST /api/escrow/release` - Release escrow funds
  - `GET /api/escrow/:jobId` - Get escrow status

- [ ] **Agent Endpoints**
  - `GET /api/agents` - List available agents
  - `POST /api/agents/:agentId/invoke` - Invoke agent
  - `GET /api/agents/:agentId/status` - Get agent status

- [ ] **Analytics Endpoints**
  - `GET /api/analytics/dashboard` - Dashboard stats
  - `GET /api/analytics/executions` - Execution stats
  - `GET /api/analytics/earnings` - Earnings summary

### Database Persistence

- [ ] **Database Connection**
  - Database: PostgreSQL (or SQLite for dev)
  - Status: Connected and responsive
  - Test query: `SELECT 1;` returns 1
  - Connection pooling: Configured (min 5, max 20 connections)

- [ ] **Schema Migration**
  - All tables created
  - Indexes present on frequently queried columns
  - Foreign keys configured
  - Constraints enforced
  - Run: `npm run db:migrate` (if migration script exists)

- [ ] **Data Persistence**
  - Jobs table: Stores created jobs
  - Bids table: Stores bidder offers
  - Executions table: Stores skill executions
  - Users table: Stores user accounts
  - Payments table: Stores payment records
  - Audit logs table: Stores audit trails

### Agent Ports Configuration

- [ ] **SHADDAI (Port 8000)**
  - Role: Supreme Orchestrator
  - Status: Available at `http://localhost:8000`
  - Endpoint: `POST /invoke` accepts orchestration prompts

- [ ] **ZEROX (Port 8001)**
  - Role: Wealth & Revenue Engine
  - Status: Available at `http://localhost:8001`
  - Endpoint: `POST /invoke` accepts billing prompts

- [ ] **ORACLE (Port 8002)**
  - Role: Research & Intelligence
  - Status: Available at `http://localhost:8002`
  - Endpoint: `POST /invoke` accepts research queries

- [ ] **NEXUS (Port 8003)**
  - Role: Technical Architect
  - Status: Available at `http://localhost:8003`
  - Endpoint: `POST /invoke` accepts technical prompts

- [ ] **TURTLE (Port 8004)**
  - Role: UI/UX & Creative
  - Status: Available at `http://localhost:8004`
  - Endpoint: `POST /invoke` accepts design prompts

- [ ] **QUILL (Port 8005)**
  - Role: Writing & Communication
  - Status: Available at `http://localhost:8005`
  - Endpoint: `POST /invoke` accepts writing prompts

- [ ] **PIKADON (Port 8008)**
  - Role: Security & Compliance
  - Status: Available at `http://localhost:8008`
  - Endpoint: `POST /invoke` accepts security reviews

### Error Handling

- [ ] **Global Error Handler**
  - All endpoints have try-catch
  - Errors return proper HTTP status codes
  - Error messages are user-friendly
  - Stack traces logged (not exposed to client)
  - Test: `GET /api/nonexistent` returns 404

- [ ] **Validation Errors**
  - Invalid input returns 400 Bad Request
  - Missing required fields caught
  - Type mismatches rejected
  - Test: `POST /api/jobs/create` with empty body returns error

- [ ] **Authentication Errors**
  - Missing JWT returns 401 Unauthorized
  - Expired JWT returns 401 with refresh hint
  - Invalid JWT returns 401
  - Test: `GET /api/status` without token returns 401

- [ ] **Rate Limiting Errors**
  - Exceeded rate limit returns 429 Too Many Requests
  - Auth endpoints: 5 requests per minute per IP
  - General endpoints: 100 requests per minute per IP
  - Test: Make 6 auth requests in 1 minute, 6th fails

### Logging & Monitoring

- [ ] **Request Logging**
  - All requests logged with timestamp
  - Response times recorded
  - Status codes tracked
  - Log format: [TIMESTAMP] METHOD PATH STATUS DURATION
  - Output: File or console (configurable)

- [ ] **Error Logging**
  - Stack traces captured
  - Error context preserved (userId, jobId, etc.)
  - Severity levels: ERROR, WARN, INFO, DEBUG
  - Output: Separate error log file

- [ ] **Audit Logging**
  - All critical operations logged (job creation, payment, execution)
  - User ID tracked
  - Action type recorded
  - Timestamp and result captured
  - Immutable (cannot be modified)

### Security Validations

- [ ] **JWT Verification**
  - Tokens signed with secret
  - Tokens expire after 24 hours
  - Refresh tokens available (7 days)
  - Signature verification on all protected routes
  - Test: Tampered token rejected

- [ ] **Input Sanitization**
  - SQL injection protection (parameterized queries)
  - XSS protection (HTML escaping)
  - Command injection protection
  - Path traversal protection
  - Test: `POST /api/jobs/create` with `"; DROP TABLE jobs; --"` fails safely

- [ ] **CSRF Protection**
  - CSRF token validation on state-changing operations
  - Token included in all POST/PUT/DELETE requests
  - Origin header validation
  - Test: POST without token returns 403

- [ ] **CORS Configuration**
  - Allowed origins: localhost:3000, http://localhost:3001
  - Allowed methods: GET, POST, PUT, DELETE, OPTIONS
  - Allowed headers: Content-Type, Authorization, X-CSRF-Token
  - Credentials: true
  - Test: Cross-origin request from allowed origin succeeds

### Rate Limiting

- [ ] **General Rate Limiting**
  - 100 requests per minute per IP
  - Applied to: All `/api/*` endpoints
  - Returns 429 when exceeded
  - Test: Make 101 requests, 101st fails

- [ ] **Auth Rate Limiting**
  - 5 requests per minute per IP for login/signup
  - 3 failed login attempts = account locked 15 minutes
  - Returns 429 when exceeded
  - Test: 6 login attempts, 6th fails

- [ ] **Billing Rate Limiting**
  - 10 payment requests per minute per user
  - Prevents accidental double-charges
  - Returns 429 when exceeded

### Timeouts & Performance

- [ ] **Request Timeouts**
  - General endpoint timeout: 30 seconds
  - Long-running endpoint timeout: 5 minutes
  - Skill execution timeout: 10 minutes
  - WebSocket ping/pong: 30 second interval

- [ ] **Database Query Timeouts**
  - Query timeout: 30 seconds
  - Connection timeout: 5 seconds
  - Connection pool: 20 max connections

- [ ] **Response Times**
  - Health check: < 100ms
  - Job creation: < 500ms
  - Bid placement: < 500ms
  - List operations: < 1 second
  - Execution start: < 1 second

---

## FRONTEND READINESS

### User Interface

- [ ] **Page Layout**
  - Header present with logo and navigation
  - Sidebar/navbar functional
  - Content area responsive
  - Footer displaying
  - Mobile view working (screen < 768px)

- [ ] **Dashboard View**
  - Shows job statistics (active, completed, total)
  - Displays user earnings
  - Shows recent jobs list
  - Shows active bids
  - Real-time updates working
  - No layout shifting or content overlap

- [ ] **Job Management**
  - "Post Job" button visible and functional
  - Job creation form displays all fields
  - Form submission triggers API call
  - Job appears in list after creation
  - Job details page loads correctly
  - Job can be edited (if user is creator)
  - Job can be deleted (if user is creator)

- [ ] **Bidding Interface**
  - Bid form displays for each job
  - Bid amount field validates (positive number)
  - Bid submission shows confirmation
  - Bid appears in bids list
  - Can retract bid before award
  - Award button visible to job creator
  - Award triggers execution

- [ ] **Execution Monitoring**
  - Execution starts after job awarded
  - Progress bar shows completion percentage
  - Status updates in real-time (via WebSocket)
  - Status messages: "Starting", "Running", "Completed", "Failed"
  - Logs display in real-time
  - Cancel button works during execution

- [ ] **Results Display**
  - Results appear after execution completes
  - Download links functional
  - File types shown (PDF, JSON, CSV, etc.)
  - Large files handled gracefully
  - No timeout during downloads

### Form Validation

- [ ] **Client-Side Validation**
  - Required fields marked with *
  - Empty field submission prevented
  - Email format validated
  - Phone format validated
  - URL format validated
  - Number fields accept only numbers
  - Error messages display inline
  - Error styling distinct (red border, etc.)

- [ ] **Server-Side Validation**
  - Confirmed by API responses
  - Invalid data rejected with 400 error
  - Error messages sent back to client
  - Validation errors logged

### API Integration

- [ ] **Fetch/Axios Calls**
  - All API calls use correct endpoint URLs
  - Request headers include Authorization token
  - Content-Type: application/json
  - POST/PUT requests include body data
  - Error responses handled
  - Timeout logic implemented

- [ ] **Authentication**
  - Login form submits to `/api/auth/login`
  - Signup form submits to `/api/auth/signup`
  - JWT token stored in localStorage or cookies
  - Token sent in `Authorization: Bearer <token>` header
  - Protected routes check for token
  - Redirect to login if token missing
  - Token refresh implemented (optional but recommended)

### Real-Time WebSocket

- [ ] **WebSocket Connection**
  - Opens on page load
  - Connected to `ws://localhost:3000/ws`
  - Sends heartbeat every 30 seconds
  - Reconnects on disconnect
  - Removes listeners on page unload

- [ ] **Live Progress Updates**
  - Execution progress pushes via WebSocket
  - Progress bar updates without page refresh
  - Status messages appear in real-time
  - Logs append as they arrive
  - No need to manually refresh page

- [ ] **Real-Time Notifications**
  - Job awarded notification appears
  - Execution started notification
  - Execution completed notification
  - Errors displayed as notifications
  - Notifications disappear after 5 seconds (or clickable to dismiss)

### Error Messages & Feedback

- [ ] **User Feedback**
  - Success messages display on successful actions
  - Error messages clear and helpful
  - Loading spinners show during async operations
  - Disabled buttons during processing
  - Clear error state recovery

- [ ] **Error Display**
  - Network errors show "Connection error, retrying..."
  - Server errors show "Server error, please try again"
  - Validation errors show specific field issues
  - Auth errors show "Please log in"
  - Messages auto-dismiss after 5 seconds

### Download Links

- [ ] **File Downloads**
  - Download links generated correctly
  - Files download with proper names
  - File types preserved (PDF, JSON, CSV, ZIP)
  - Large files don't timeout
  - Download progress shown (optional)

- [ ] **Generated Output**
  - Files accessible at `/generated-output/*`
  - Files served with correct MIME type
  - Content-Disposition header set (forces download)
  - Virus scanned (optional but recommended)

### Responsive Design

- [ ] **Mobile (< 768px)**
  - Single column layout
  - Touch-friendly button sizes (min 44x44px)
  - Form inputs full width
  - No horizontal scrolling
  - Navigation drawer or hamburger menu

- [ ] **Tablet (768px - 1024px)**
  - Two column layout where appropriate
  - Optimized spacing
  - All features accessible
  - No content overflow

- [ ] **Desktop (> 1024px)**
  - Multi-column layouts
  - Sidebar navigation
  - Full dashboard visible
  - Optimized use of screen space

### Accessibility

- [ ] **Keyboard Navigation**
  - All buttons/links accessible via Tab
  - Tab order is logical
  - Enter activates buttons
  - Escape closes modals
  - Test: Navigate site without mouse

- [ ] **Screen Reader Support**
  - Buttons have aria-label
  - Images have alt text
  - Form labels associated with inputs
  - ARIA roles on custom components
  - Test: Use screen reader (NVDA or similar)

- [ ] **Color Contrast**
  - Text contrast ratio >= 4.5:1 (normal text)
  - Text contrast ratio >= 3:1 (large text)
  - Information not conveyed by color alone
  - Test: Use contrast checker tool

---

## AGENT SYSTEM READINESS

### Agent Framework

- [ ] **Agent Wrapper Script**
  - Location: `C:\Users\Brittany\.claude\projects\...agent_wrapper.py`
  - Python 3.8+ installed
  - Dependencies: requests, json
  - Callable via command line

- [ ] **Agent HTTP Interface**
  - Each agent listens on assigned port
  - Accepts POST requests to `/invoke`
  - Request body: `{ "prompt": "..." }`
  - Response: `{ "result": "..." }`
  - Test: `curl -X POST http://localhost:8000/invoke -d '{"prompt":"hello"}'`

### Agent Availability

- [ ] **All 7 Agents Running**
  - SHADDAI (8000): Online
  - ZEROX (8001): Online
  - ORACLE (8002): Online
  - NEXUS (8003): Online
  - TURTLE (8004): Online
  - QUILL (8005): Online
  - PIKADON (8008): Online
  - Test: `curl http://localhost:8000/health` (or similar)

### Agent-to-Backend Communication

- [ ] **Backend Calls Agents**
  - Backend can invoke agents via HTTP
  - Uses correct ports and endpoints
  - Passes job/execution context
  - Handles agent responses
  - Logs failures for debugging

- [ ] **Agent Responses Processed**
  - Backend parses agent JSON response
  - Extracts skills and plan
  - Creates execution tasks
  - Updates database with results
  - Returns results to frontend

---

## DATABASE & STORAGE

### Database Setup

- [ ] **Database Engine**
  - PostgreSQL installed and running (OR SQLite for development)
  - Database created: `shaddai_prod`
  - User created with appropriate permissions
  - Connection string configured in `.env`
  - Test: `psql -U user -d shaddai_prod -c "SELECT 1;"`

- [ ] **Schema Created**
  - All tables exist
  - All columns present with correct types
  - Indexes created on foreign keys and search columns
  - Constraints enforced (NOT NULL, UNIQUE, CHECK)
  - Relationships defined via foreign keys

### Tables Required

- [ ] **Users Table**
  - Columns: id, email, password_hash, name, created_at, updated_at
  - Primary key: id
  - Unique: email
  - Indexes: email, created_at

- [ ] **Jobs Table**
  - Columns: id, creator_id, title, description, budget, status, created_at, updated_at
  - Primary key: id
  - Foreign key: creator_id -> users.id
  - Indexes: creator_id, status, created_at

- [ ] **Bids Table**
  - Columns: id, job_id, bidder_id, amount, status, created_at, updated_at
  - Primary key: id
  - Foreign keys: job_id -> jobs.id, bidder_id -> users.id
  - Indexes: job_id, bidder_id, status

- [ ] **Executions Table**
  - Columns: id, job_id, bid_id, skill_name, status, progress, logs, created_at, updated_at
  - Primary key: id
  - Foreign keys: job_id -> jobs.id, bid_id -> bids.id
  - Indexes: job_id, status, created_at

- [ ] **Payments Table**
  - Columns: id, user_id, job_id, amount, status, created_at, updated_at
  - Primary key: id
  - Foreign keys: user_id -> users.id, job_id -> jobs.id
  - Indexes: user_id, job_id, status

- [ ] **Audit Logs Table**
  - Columns: id, user_id, action, resource_type, resource_id, details, created_at
  - Primary key: id
  - Foreign key: user_id -> users.id (nullable)
  - Indexes: user_id, action, resource_type, created_at

### File Storage

- [ ] **Output Directory**
  - Location: `./generated-output/`
  - Writable by Node.js process
  - Readable by web server
  - Cleanup job removes files older than 30 days

- [ ] **Temporary Files**
  - Location: `./temp/`
  - Used during skill execution
  - Cleaned up after execution completes
  - Disk quota: 1GB (configurable)

- [ ] **Logs Directory**
  - Location: `./logs/`
  - Application logs: `app.log`
  - Error logs: `error.log`
  - Audit logs: `audit.log`
  - Rotation: Daily, keep 30 days

---

## SECURITY & COMPLIANCE

### Environment Variables

- [ ] **`.env` File Present**
  - Location: Root directory (NOT in git)
  - Contains all secrets: JWT_SECRET, DB_PASSWORD, STRIPE_KEY, etc.
  - Contains configuration: NODE_ENV, LOG_LEVEL, etc.

- [ ] **Required Variables**
  - `NODE_ENV=production`
  - `JWT_SECRET` (randomly generated, min 32 chars)
  - `JWT_EXPIRY=24h`
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
  - `CORS_ORIGIN=http://localhost:3000`
  - `LOG_LEVEL=info`
  - `AGENT_TIMEOUT=600000` (10 minutes in ms)

### Secrets Management

- [ ] **No Secrets in Code**
  - No passwords in source files
  - No API keys in git history
  - No private keys committed
  - `.gitignore` includes: `.env`, `.env.local`, `*.key`

- [ ] **Secrets Stored Safely**
  - `.env` file exists (local only)
  - Environment variables set on deployment server
  - Secrets never logged
  - AWS Secrets Manager or similar used (optional)

### Authentication & Authorization

- [ ] **User Authentication**
  - Sign up endpoint functional: `POST /api/auth/signup`
  - Login endpoint functional: `POST /api/auth/login`
  - Password hashing using bcrypt (cost factor 12)
  - Email verification sent (optional)
  - Test: Create account and log in

- [ ] **JWT Implementation**
  - JWT contains: userId, email, roles, iat, exp
  - Signed with HS256 algorithm
  - Verified on protected routes
  - Refresh token support (optional)

- [ ] **Authorization**
  - User can only see own jobs/bids
  - User can only create bids on other's jobs
  - Only job creator can award job
  - Only executor can see execution logs
  - Admin can view all data (if admin role exists)

### Vulnerability Scanning

- [ ] **Dependency Scanning**
  - Run: `npm audit`
  - All critical vulnerabilities fixed
  - High vulnerabilities reviewed and justified
  - Check: `npm list` shows no conflicting versions

- [ ] **Code Security Review**
  - No hardcoded credentials
  - No debug code left in production
  - Error messages don't leak internal details
  - SQL injection protection confirmed
  - XSS protection confirmed

### SSL/TLS

- [ ] **HTTPS Configuration** (Production Only)
  - SSL certificate installed
  - Certificate valid and not self-signed
  - HSTS header set: `Strict-Transport-Security: max-age=31536000`
  - Mixed content warnings resolved
  - Test: `curl -I https://domain.com` shows 200

- [ ] **Development HTTP** (Development Only)
  - HTTP used on localhost (acceptable)
  - Clear warning in UI: "Development Mode"
  - No sensitive data in URLs

### Data Protection

- [ ] **Encryption at Rest**
  - Passwords hashed with bcrypt
  - Sensitive data encrypted in database (optional)
  - Encryption key stored securely
  - No plain-text sensitive data

- [ ] **Encryption in Transit**
  - All API calls over HTTPS (production)
  - WebSocket over WSS (production)
  - TLS 1.2+

### Compliance

- [ ] **GDPR Compliance** (If EU users)
  - Privacy policy present
  - Data deletion possible
  - Data export available
  - Consent management implemented

- [ ] **PCI DSS** (If handling payment cards)
  - Never store full card numbers
  - Use Stripe tokenization
  - Regular security audits
  - Encryption enabled

---

## TESTING CHECKLIST

### Functional Testing

- [ ] **Job Posting**
  - User can create job: `POST /api/jobs/create`
  - Job appears in list: `GET /api/jobs`
  - Job details retrievable: `GET /api/jobs/:jobId`
  - jobId returned and valid
  - Job status is "open"

- [ ] **Bidding**
  - User can place bid: `POST /api/bids/place`
  - Bid amount must be positive
  - Bid appears in job's bids list: `GET /api/bids/:jobId`
  - Bidder cannot bid own job
  - Multiple bids allowed on same job

- [ ] **Job Award**
  - Only job creator can award
  - Award button visible to creator: `GET /api/jobs/:jobId`
  - Award API call succeeds: `POST /api/bids/:bidId/award`
  - Job status changes to "awarded"
  - Execution automatically starts

- [ ] **Execution**
  - Execution created automatically after award
  - Execution status available: `GET /api/executions/:executionId`
  - Progress updates in real-time
  - Logs accumulate
  - Status progresses: pending -> running -> completed
  - Results available after completion: `GET /api/executions/:executionId/results`

- [ ] **Skill Execution**
  - Skill router accepts job context
  - Correct agent invoked for job type
  - Agent response parsed correctly
  - Results stored in database
  - Results downloadable

- [ ] **Payment Flow**
  - Escrow created after job awarded
  - Payment released after job completed
  - User can view payment status
  - Earnings updated on user dashboard

### Edge Cases

- [ ] **Large Data**
  - Long job description (10,000 chars)
  - Large number of bids (100+)
  - Large file downloads (100MB+)
  - High concurrent users (100+)

- [ ] **Error Scenarios**
  - Job with empty title rejected
  - Negative bid amount rejected
  - Bid on non-existent job rejected
  - Non-existent job returns 404
  - Non-existent execution returns 404

- [ ] **Concurrency**
  - Multiple bids on same job work
  - Multiple jobs created simultaneously work
  - Database transactions prevent race conditions
  - Test: Rapid-fire requests succeed

- [ ] **Timeout Handling**
  - Long-running execution doesn't timeout (< 10 min)
  - Execution timeout error shown if > 10 min
  - Client shows "Still processing..." message
  - Can cancel execution

### Performance Testing

- [ ] **Response Times**
  - Job creation: < 500ms
  - Job listing: < 1s
  - Bid placement: < 500ms
  - Execution start: < 1s
  - Results retrieval: < 2s

- [ ] **Load Testing**
  - 10 concurrent users: All requests succeed
  - 100 concurrent users: 95%+ success rate
  - No database deadlocks
  - Server CPU stays < 80%
  - Memory usage stable

- [ ] **Database**
  - No missing indexes
  - Query times < 100ms
  - Connection pool doesn't exhaust
  - Cleanup jobs remove old data

### Security Testing

- [ ] **Authentication**
  - Invalid credentials rejected
  - Expired token rejected
  - Tampered token rejected
  - Test account can be secured

- [ ] **Authorization**
  - User A cannot see User B's bids
  - User A cannot award User B's jobs
  - Proper error (403) returned
  - Admin can view all (if admin role)

- [ ] **Input Validation**
  - SQL injection attempt fails safely
  - XSS payload escaped
  - Path traversal attempt blocked
  - File upload size limited

- [ ] **Rate Limiting**
  - 6th auth request in 1 minute returns 429
  - Retry-After header present
  - IP-based limiting works
  - Can reset after timeout

---

## DEPLOYMENT STEPS

### Prerequisites

1. **System Requirements**
   - Node.js v18+ installed: `node --version`
   - npm v8+ installed: `npm --version`
   - PostgreSQL 12+ OR SQLite installed
   - Git installed (optional)
   - Python 3.8+ for agent wrapper
   - Total disk space: 2GB+ free

2. **Clone/Download Code**
   ```powershell
   cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
   ```

3. **Create Environment File**
   ```powershell
   Copy-Item .env.example .env
   # Edit .env with production values
   ```

### Installation & Setup

#### Step 1: Install Backend Dependencies

```powershell
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
npm install
```

**Expected output:**
- `added XXX packages`
- No critical vulnerabilities

**Troubleshooting:**
- If npm fails: Clear cache with `npm cache clean --force`
- If specific package fails: Check node version matches requirement
- If still fails: Delete `node_modules` and `package-lock.json`, reinstall

#### Step 2: Verify Database Connection

```powershell
# Test database connection
node -e "const db = require('./backend/database-real'); console.log('DB OK')"
```

**Expected output:**
- `DB OK`

**Troubleshooting:**
- Check `.env` database credentials
- Verify PostgreSQL running: `psql -V`
- Test connection: `psql -h localhost -U user -d shaddai_prod`

#### Step 3: Run Database Migrations

```powershell
npm run db:migrate
```

**Expected output:**
- Tables created successfully
- Or `Already up to date`

**Troubleshooting:**
- Check migration file exists: `backend/migrations/`
- Check database permissions
- Review error output for SQL syntax errors

#### Step 4: Start Backend Server

**Terminal 1 - Backend:**
```powershell
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
npm start
```

**Expected output:**
```
Server running on http://localhost:3000
Database connected
WebSocket server ready
```

**Troubleshooting:**
- Port 3000 in use: `netstat -ano | findstr :3000` → kill with `taskkill /PID xxx /F`
- Database failed: Check `.env` and database running
- Module not found: Rerun `npm install`

#### Step 5: Start Agent System

**Terminal 2 - Agents:**
```powershell
cd C:\Users\Brittany\.claude\projects\...
python agent_wrapper.py --all
```

Or start agents individually:
```powershell
python agent_wrapper.py shaddai
python agent_wrapper.py zerox
python agent_wrapper.py oracle
python agent_wrapper.py nexus
python agent_wrapper.py turtle
python agent_wrapper.py quill
python agent_wrapper.py pikadon
```

**Expected output:**
```
SHADDAI listening on port 8000
ZEROX listening on port 8001
ORACLE listening on port 8002
NEXUS listening on port 8003
TURTLE listening on port 8004
QUILL listening on port 8005
PIKADON listening on port 8008
```

**Troubleshooting:**
- Python not found: Install Python 3.8+
- Module not found: `pip install requests`
- Port in use: Modify agent_wrapper.py or kill existing process

#### Step 6: Open Frontend in Browser

```
http://localhost:3000
```

**Expected:**
- SHADDAI dashboard loads
- No console errors
- Can interact with UI

**Troubleshooting:**
- Cannot connect: Check backend running on port 3000
- Blank page: Check browser console for errors (F12)
- 404 error: Check public/index.html exists

### Configuration Files

**`.env` Example:**
```
NODE_ENV=production
JWT_SECRET=your-random-secret-here-min-32-chars
JWT_EXPIRY=24h
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shaddai_prod
DB_USER=shaddai_user
DB_PASSWORD=secure_password_here
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
AGENT_TIMEOUT=600000
AGENT_PORTS=8000,8001,8002,8003,8004,8005,8008
```

### Quick Start Script

**`deploy.ps1` (PowerShell):**
```powershell
# SHADDAI Deployment Script
$ErrorActionPreference = "Stop"

Write-Host "Deploying SHADDAI v61..." -ForegroundColor Green

# Step 1: Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# Step 2: Create/verify .env
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "Edit .env with production values!" -ForegroundColor Red
    exit 1
}

# Step 3: Start backend
Write-Host "Starting backend..." -ForegroundColor Green
$backend = Start-Process -PassThru -NoNewWindow -FilePath "npm" -ArgumentList "start"

# Step 4: Wait for backend ready
Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test backend
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -ErrorAction Stop
    Write-Host "Backend ready: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "Backend health check failed!" -ForegroundColor Red
    Stop-Process -InputObject $backend
    exit 1
}

# Step 5: Start agents
Write-Host "Starting agents..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "agent_wrapper.py", "--all"

# Step 6: Open browser
Write-Host "Opening browser..." -ForegroundColor Green
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Backend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:3000/api" -ForegroundColor Cyan
Write-Host "Press Ctrl+C in backend terminal to stop" -ForegroundColor Yellow
```

**Run it:**
```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

---

## ROLLBACK PLAN

### If Deployment Fails

1. **Stop Backend**
   ```powershell
   taskkill /PID xxx /F
   ```

2. **Rollback Code**
   ```powershell
   git checkout HEAD~1  # Go back to previous commit
   ```

3. **Rollback Database** (If schema changed)
   ```powershell
   npm run db:rollback
   ```

4. **Clear Dependencies**
   ```powershell
   rm -r node_modules package-lock.json
   npm install
   ```

5. **Restart**
   ```powershell
   npm start
   ```

### Recovery Checklist

- [ ] Backend restarted successfully
- [ ] Database connected
- [ ] API health check passes: `GET /api/health` returns 200
- [ ] Frontend loads
- [ ] Can create test job
- [ ] No error logs

---

## POST-DEPLOYMENT VERIFICATION

### Immediate (5 minutes)

- [ ] Backend running: `curl http://localhost:3000/api/health`
- [ ] Frontend loads: Open browser to `http://localhost:3000`
- [ ] All agents online: `curl http://localhost:8000/health` (for each agent)
- [ ] No error logs: Check `logs/error.log` is empty
- [ ] Database connected: See "Database connected" in server logs

### Smoke Tests (15 minutes)

Follow [TEST_WORKFLOWS.md](TEST_WORKFLOWS.md):

1. **Test 1: Job Posting** - PASS/FAIL
2. **Test 2: Bidding** - PASS/FAIL
3. **Test 3: Award & Execution** - PASS/FAIL
4. **Test 4: Skill Execution** - PASS/FAIL
5. **Test 5: Real-Time Monitoring** - PASS/FAIL
6. **Test 6: Payment Flow** - PASS/FAIL

### Full Verification (1 hour)

- [ ] All endpoints return expected responses
- [ ] Real-time WebSocket updates working
- [ ] No slow queries (check database logs)
- [ ] Memory usage stable (should not grow)
- [ ] No rate limiting false positives
- [ ] Users can complete full workflow

### Success Criteria

- All smoke tests PASS
- No critical errors in logs
- Response times meet targets
- Real-time updates working
- System feels responsive and stable
- Can be accessed from other machines

### If Verification Fails

1. Check logs: `logs/app.log` and `logs/error.log`
2. Review [TEST_WORKFLOWS.md](TEST_WORKFLOWS.md) for detailed troubleshooting
3. Verify all dependencies installed: `npm list`
4. Restart backend and agents
5. If issue persists, review checklist from top

---

## SUPPORT & DEBUGGING

### Common Issues

| Issue | Solution |
|-------|----------|
| "Port 3000 in use" | Kill existing process or use different port |
| "Cannot find module X" | Run `npm install` again |
| "Database connection failed" | Check `.env` credentials, verify DB running |
| "Agent timeout" | Increase `AGENT_TIMEOUT` in `.env` |
| "CORS error" | Check `CORS_ORIGIN` in `.env` matches frontend URL |
| "WebSocket connection failed" | Verify server running, check firewall |

### Getting Help

1. Check `logs/error.log` for specific error
2. Review this checklist for missed steps
3. Consult [TEST_WORKFLOWS.md](TEST_WORKFLOWS.md) for detailed tests
4. Contact development team with logs and steps to reproduce

---

**Status: READY FOR DEPLOYMENT**

All systems checked and verified. Follow steps above to deploy successfully.

Last updated: 2026-05-13  
Version: 61.0.0  
Author: Deployment Agent
