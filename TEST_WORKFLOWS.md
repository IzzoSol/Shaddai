# SHADDAI v61 - Test Workflows

**Version:** 61.0.0  
**Purpose:** Step-by-step testing procedures for all workflows  
**Audience:** QA testers, developers, anyone deploying SHADDAI  
**Last Updated:** 2026-05-13

---

## TABLE OF CONTENTS

1. [Pre-Test Setup](#pre-test-setup)
2. [Test 1: Job Posting](#test-1-job-posting)
3. [Test 2: Bidding](#test-2-bidding)
4. [Test 3: Award & Execution](#test-3-award--execution)
5. [Test 4: Skill Execution](#test-4-skill-execution)
6. [Test 5: Real-Time Monitoring](#test-5-real-time-monitoring)
7. [Test 6: Payment Flow](#test-6-payment-flow)
8. [Test 7: Error Recovery](#test-7-error-recovery)
9. [Test 8: Performance Under Load](#test-8-performance-under-load)
10. [Test Results & Reporting](#test-results--reporting)

---

## PRE-TEST SETUP

### Environment Check

Before starting tests, verify:

```powershell
# Check Node.js
node --version
# Expected: v18+

# Check npm
npm --version
# Expected: v8+

# Check backend running
curl http://localhost:3000/api/health
# Expected: {"status": "operational"}

# Check agents running
curl http://localhost:8000/health  # SHADDAI
curl http://localhost:8001/health  # ZEROX
curl http://localhost:8002/health  # ORACLE
curl http://localhost:8003/health  # NEXUS
curl http://localhost:8004/health  # TURTLE
curl http://localhost:8005/health  # QUILL
curl http://localhost:8008/health  # PIKADON
# Expected: Each returns 200 OK
```

### Browser Setup

1. Open DevTools: `F12` or `Ctrl+Shift+I`
2. Go to Console tab
3. Go to Network tab
4. Set Network throttle to "Fast 3G" (optional, for realistic testing)
5. Navigate to `http://localhost:3000`

### Test Account Setup

If using test accounts:

```powershell
# Create test account via API
curl -X POST http://localhost:3000/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"tester@example.com\",\"password\":\"Test123!\"}"

# Or sign up via UI
# Use test account: tester@example.com / Test123!
```

### Assumptions

- Backend running on `http://localhost:3000`
- Frontend accessible at same URL
- Agents running on ports 8000-8008
- Database connected and migrated
- No rate limiting issues (or using appropriate delays)
- User logged in before starting tests

---

## TEST 1: JOB POSTING

**Objective:** Verify user can create a job and retrieve its ID

**Time:** 3-5 minutes

### Step 1A: UI Method

1. **Navigate to Dashboard**
   - Open `http://localhost:3000`
   - Verify logged in (see username in header)
   - See "Post Job" button or tab

2. **Click "Post Job"**
   - Modal or form appears
   - Fields visible:
     - Job Title (required)
     - Job Description (required)
     - Budget (required)
     - Deadline (optional)
     - Category/Type (if available)

3. **Fill Form**
   ```
   Title: "Write Blog Post About AI"
   Description: "Need a well-researched blog post about artificial intelligence trends in 2026. Should be 2000+ words, SEO optimized, with citations."
   Budget: 500
   Category: "Writing" (if available)
   Deadline: (select tomorrow's date)
   ```

4. **Submit Form**
   - Click "Post Job" or "Submit"
   - Form validates (errors highlight empty fields in red)
   - Success message appears: "Job posted successfully!"

5. **Verify Job Created**
   - Redirect to job details page OR
   - Job appears in "My Jobs" list
   - Copy/note the Job ID from URL or page
   - Example: `job_65f4a2b8c9e2d1f4`

**Expected Outcome:**
- Job created in database
- Job status: "open"
- Job visible in jobs list
- Job ID returned and valid (UUID format)

**Verification:**
- Check network tab: `POST /api/jobs/create` returns 201
- Response includes: `{ jobId: "...", status: "open", createdAt: "..." }`
- Check console: No errors logged

### Step 1B: API Method (Alternative)

```powershell
# Get auth token
$loginResponse = curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"tester@example.com\",\"password\":\"Test123!\"}"

$token = $loginResponse.token
# Save token for later tests

# Create job
$jobResponse = curl -X POST http://localhost:3000/api/jobs/create `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d @"
{
  "title": "Write Blog Post About AI",
  "description": "Need a well-researched blog post...",
  "budget": 500,
  "deadline": "2026-05-14T23:59:59Z"
}
"@

$jobId = $jobResponse.jobId
Write-Host "Job created: $jobId"
```

**Expected Response:**
```json
{
  "success": true,
  "jobId": "job_65f4a2b8c9e2d1f4",
  "status": "open",
  "createdAt": "2026-05-13T10:30:00Z"
}
```

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Title is required" | Form validation failed | Fill in all required fields |
| 400 Bad Request | Invalid data format | Check field types (budget should be number) |
| 401 Unauthorized | Not logged in | Log in first, then try again |
| 429 Too Many Requests | Rate limited | Wait 60 seconds, try again |
| Job doesn't appear | Database didn't save | Check database connection in logs |
| Blank form | Page didn't load | Refresh browser, check console errors |

### How to Verify

**In Browser DevTools:**
1. Open Network tab
2. Look for `POST /api/jobs/create` request
3. Click it, see Response tab
4. Verify `jobId` in response
5. Close tab and reload page
6. Job should still appear in list (confirming database save)

**In Database:**
```sql
SELECT id, title, creator_id, status FROM jobs ORDER BY created_at DESC LIMIT 1;
```
Should show your newly created job.

**Result: PASS / FAIL**

---

## TEST 2: BIDDING

**Objective:** Verify bidders can place bids on jobs

**Time:** 3-5 minutes

**Prerequisites:**
- Completed Test 1 (have a job ID)
- Logged in as different user (if possible) OR same user (system should handle)
- Note the Job ID from Test 1

### Step 2A: UI Method

1. **View Job Details**
   - From dashboard, click on the job created in Test 1
   - See job title, description, budget
   - See "Place Bid" button or section
   - See "Bids" list (probably empty)

2. **Place Bid**
   - Click "Place Bid"
   - Bid form appears:
     - Bid Amount (required): Enter amount (must be positive, <= budget)
     - Delivery Date (optional)
     - Cover Letter (optional)

3. **Fill Bid Form**
   ```
   Bid Amount: 450
   Delivery Date: (tomorrow or 2 days out)
   Cover Letter: "I have 10 years of writing experience. Can deliver high-quality content on schedule."
   ```

4. **Submit Bid**
   - Click "Submit Bid" or "Place Bid"
   - Success message: "Bid placed successfully!"
   - Bid appears in Bids list below job details

5. **Verify Bid Details**
   - Your username shown as bidder
   - Bid amount displayed: 450
   - Status shown as "pending" or "placed"
   - Can see "Retract" button (to cancel bid)

**Expected Outcome:**
- Bid created in database
- Bid appears in job's bids list
- Bidder cannot bid on own job (should get error)
- Multiple bidders can bid same job

**Verification:**
- Check network tab: `POST /api/bids/place` returns 201
- Response includes: `{ bidId: "...", jobId: "...", amount: 450 }`
- Bid visible in bids list without refresh

### Step 2B: API Method (Alternative)

```powershell
# Create another test account (as bidder)
$bidderSignup = curl -X POST http://localhost:3000/api/auth/signup `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"bidder@example.com\",\"password\":\"Test123!\"}"

$bidderToken = $bidderSignup.token

# Get job ID from Test 1
$jobId = "job_65f4a2b8c9e2d1f4"  # From Test 1

# Place bid
$bidResponse = curl -X POST http://localhost:3000/api/bids/place `
  -H "Authorization: Bearer $bidderToken" `
  -H "Content-Type: application/json" `
  -d @"
{
  "jobId": "$jobId",
  "amount": 450,
  "coverLetter": "I have 10 years of writing experience..."
}
"@

$bidId = $bidResponse.bidId
Write-Host "Bid placed: $bidId"
```

**Expected Response:**
```json
{
  "success": true,
  "bidId": "bid_75f4a2b8c9e2d1f5",
  "jobId": "job_65f4a2b8c9e2d1f4",
  "amount": 450,
  "status": "pending",
  "createdAt": "2026-05-13T10:35:00Z"
}
```

### Test 2C: Multiple Bids

Repeat Step 2A or 2B two more times (create 3 total bids):

1. **Bid 1:** Amount 450
2. **Bid 2:** Amount 425
3. **Bid 3:** Amount 475

Expected: All three bids appear in list, none rejected.

### Test 2D: Error Cases

1. **Bid Amount Exceeds Budget**
   - Try bidding amount > job budget
   - Expected: Error "Bid amount exceeds job budget"

2. **Bid on Own Job**
   - Log in as job creator
   - Try to bid on own job
   - Expected: Error "Cannot bid on your own job"

3. **Negative Bid**
   - Try entering -100
   - Expected: Error "Bid amount must be positive"

4. **Duplicate Bid**
   - Same user places bid twice on same job
   - Expected: Either allowed (overwrite) or error "Already bid on this job"

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Job not found" | Invalid job ID | Verify job ID from Test 1 |
| "Bid amount exceeds budget" | Bid > job budget | Enter amount <= budget |
| "Cannot bid on your own job" | Logged in as job creator | Switch to different account |
| 401 Unauthorized | Token missing or expired | Log in again, get new token |
| Bid doesn't appear | Database not saving | Check logs for database error |

### How to Verify

**In Browser:**
1. Open job detail page
2. Scroll to Bids section
3. See all 3 bids listed
4. Refresh page
5. Bids still appear (confirming DB persistence)

**In Database:**
```sql
SELECT id, job_id, bidder_id, amount, status FROM bids WHERE job_id = 'job_65f4a2b8c9e2d1f4' ORDER BY amount DESC;
```
Should show 3 bids.

**Result: PASS / FAIL**

---

## TEST 3: AWARD & EXECUTION

**Objective:** Verify job creator can award job to winning bid and trigger execution

**Time:** 5-10 minutes

**Prerequisites:**
- Completed Tests 1 & 2
- Have job ID and 3 bid IDs
- Logged in as job creator

### Step 3A: View Bids and Award

1. **View Job Bids**
   - Go to job detail page (from Test 1)
   - See all 3 bids in list:
     - Bid 1: $450
     - Bid 2: $425
     - Bid 3: $475

2. **Select Winning Bid**
   - Decide which to award (usually highest, but not required)
   - Example: Award Bid 3 ($475)

3. **Click Award**
   - Click "Award" or "Select" button next to bid
   - Confirmation dialog appears: "Award this job to [bidder name] for $475?"
   - Click "Confirm"

4. **Verify Award Succeeded**
   - Success message: "Job awarded successfully!"
   - Page updates:
     - Job status changes to "awarded"
     - "Award" buttons disappear
     - Other bids show "Job awarded to another bidder"
     - New section appears: "Execution Status"

**Expected Outcome:**
- Job status: "awarded"
- Winning bid status: "awarded"
- Losing bids status: "rejected"
- Execution automatically created
- Execution status: "pending" or "starting"

**Verification:**
- Check network tab: `POST /api/bids/:bidId/award` returns 200
- Response includes: `{ success: true, jobId: "...", executionId: "..." }`
- Execution appears in "Executions" list or dashboard

### Step 3B: Monitor Execution Start

1. **Watch Execution Status**
   - On job detail page
   - "Execution Status" section shows:
     - Status: "Starting..." or "In Progress"
     - Progress: 0%
     - Start time shown
     - Agent name: e.g., "QUILL (Writing Agent)"

2. **Real-Time Updates**
   - Progress bar updates every 1-2 seconds
   - Status changes: "Starting" → "Running" → "Completed"
   - Logs appear below progress bar
   - Each log entry: `[timestamp] [level] message`

3. **Verify Execution Created**
   - Execution ID shown on page
   - Can note this ID for later tests
   - In database: New record in executions table

### API Method (Alternative)

```powershell
# Get the job details (including bids)
$jobDetail = curl -H "Authorization: Bearer $token" `
  http://localhost:3000/api/jobs/$jobId

# Get bid ID from response
$bidId = $jobDetail.bids[2].bidId  # Third bid

# Award the job
$awardResponse = curl -X POST http://localhost:3000/api/bids/$bidId/award `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json"

$executionId = $awardResponse.executionId
Write-Host "Execution created: $executionId"

# Get execution status
curl -H "Authorization: Bearer $token" `
  http://localhost:3000/api/executions/$executionId
```

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| No "Award" button | Not logged in as job creator | Switch to creator account |
| "Execution failed to start" | Agent not running | Check agent logs, restart if needed |
| Progress bar stuck at 0% | WebSocket not connected | Check console, refresh page |
| Execution not created | Database error | Check logs/error.log |
| Bid in database but not UI | Page not refreshed | Refresh browser |

### How to Verify

**Progress Update Test:**
1. Award job
2. Open DevTools → Network tab
3. Filter for WebSocket connection
4. See frames arriving with execution updates
5. Each frame contains `{ status: "...", progress: N, logs: [...] }`

**Database Test:**
```sql
SELECT id, job_id, bid_id, status, progress FROM executions WHERE job_id = 'job_65f4a2b8c9e2d1f4' LIMIT 1;
```
Should show: status="running" or "completed", progress increasing.

**Result: PASS / FAIL**

---

## TEST 4: SKILL EXECUTION

**Objective:** Verify agent skill executes and returns results

**Time:** 5-15 minutes (depends on skill complexity)

**Prerequisites:**
- Completed Tests 1-3
- Have execution ID
- Job should be running or completed

### Step 4A: Monitor Execution Progress

1. **Watch Real-Time Progress**
   - Stay on job detail page from Test 3
   - Watch progress bar: 0% → 25% → 50% → 75% → 100%
   - Watch logs accumulate:
     ```
     [10:35:01] [INFO] Execution started
     [10:35:02] [INFO] Invoking agent: QUILL
     [10:35:05] [INFO] Agent returned plan
     [10:35:10] [INFO] Executing skill: write_blog_post
     [10:35:15] [INFO] Generating content...
     [10:36:00] [INFO] Content generated
     [10:36:05] [INFO] Generating markdown...
     [10:36:10] [INFO] Execution completed
     ```

2. **Verify Execution Completes**
   - Status changes to "Completed"
   - Progress reaches 100%
   - Green checkmark appears
   - Success message: "Execution completed successfully!"

3. **Check Results Section**
   - New "Results" section appears
   - Shows:
     - Files generated (e.g., blog_post.md, blog_post.pdf)
     - Download links
     - File sizes
     - Content preview (if text file)

### Step 4B: Download Results

1. **Download Generated File**
   - Click download link for main file
   - File downloads: e.g., "blog_post.md"
   - File size reasonable (not 0 bytes)
   - Open in text editor and verify content

2. **Verify Content Quality**
   - For blog post: Should be 2000+ words about AI
   - Should have proper structure (intro, sections, conclusion)
   - Should be readable and coherent
   - No truncated text or errors

3. **Check Associated Files**
   - If multiple files, download all
   - Example: .md + .pdf + metadata.json
   - Each file opens correctly
   - No corruption

### Step 4C: API Verification

```powershell
# Get execution details
$execution = curl -H "Authorization: Bearer $token" `
  http://localhost:3000/api/executions/$executionId

# Verify execution completed
Write-Host "Status: $($execution.status)"  # Should be "completed"
Write-Host "Progress: $($execution.progress)%"  # Should be 100
Write-Host "Files: $($execution.results.files.Count)"

# Download result file
curl -o blog_post.md `
  -H "Authorization: Bearer $token" `
  http://localhost:3000/api/executions/$executionId/results/blog_post.md
```

### Step 4D: Execution Logs

1. **View Full Logs**
   - Click "View Full Logs" button (if available)
   - See timestamped log entries:
     ```
     2026-05-13T10:35:01.234Z [INFO] Execution started by NEXUS
     2026-05-13T10:35:02.456Z [DEBUG] Context: jobId=job_65f4a2b8c9e2d1f4
     2026-05-13T10:35:03.789Z [INFO] Routing to agent: QUILL
     ...
     ```

2. **Analyze Logs**
   - No ERROR level logs (unless job intentionally failed)
   - No WARN logs (unless warnings expected)
   - DEBUG logs show execution flow
   - Timestamps increase monotonically

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Progress stuck at 0% | WebSocket disconnected | Refresh page |
| Progress stuck at X% | Agent timeout | Check AGENT_TIMEOUT in .env |
| Execution failed | Agent returned error | Check execution logs |
| No results | Results not saved | Check database permissions |
| Download link broken | File not accessible | Check `/generated-output/` exists |
| Content looks wrong | Agent quality issue | Regenerate or adjust prompt |

### How to Verify

**Check Database:**
```sql
SELECT id, skill_name, status, progress, results FROM executions 
  WHERE id = 'exec_xxx' LIMIT 1;
```
Should show: status="completed", progress=100, results not null.

**Check File System:**
```powershell
Get-ChildItem C:\Users\Brittany\SHADDAI-FINAL-BUILD\generated-output | 
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-5) }
```
Should show recently created files.

**Check Logs:**
```powershell
Get-Content logs/app.log -Tail 50
```
Should show execution progress messages.

**Result: PASS / FAIL**

---

## TEST 5: REAL-TIME MONITORING

**Objective:** Verify WebSocket real-time updates work without page refresh

**Time:** 3-5 minutes

**Prerequisites:**
- Completed Tests 1-4
- Currently viewing execution that just finished
- Browser DevTools open

### Step 5A: WebSocket Connection

1. **Open DevTools**
   - Press `F12` or `Ctrl+Shift+I`
   - Go to **Network** tab
   - Filter type: **WS** (WebSocket)

2. **Check Active WebSocket**
   - Should see connection: `ws://localhost:3000/ws`
   - Status: **101 Switching Protocols** (successful)
   - No errors
   - Connection time < 100ms

3. **Verify Connection Persistent**
   - Refresh page with `F5`
   - WebSocket reconnects automatically
   - See new WebSocket connection
   - Old connection shows status "closed"

### Step 5B: Real-Time Updates During Execution

1. **Start New Execution** (or use running one)
   - Go back to Test 3: Award another job
   - New execution starts
   - Watch progress bar update in real-time

2. **Monitor WebSocket Frames**
   - In DevTools, click WebSocket connection
   - Click **Messages** tab
   - See incoming frames like:
     ```
     {"type":"execution_update","executionId":"...","progress":25,"status":"running"}
     {"type":"execution_update","executionId":"...","progress":50,"status":"running"}
     {"type":"execution_update","executionId":"...","progress":100,"status":"completed"}
     ```

3. **No Page Refresh Needed**
   - Progress updates WITHOUT refreshing page
   - Do not press F5 during execution
   - Verify progress bar updates smoothly
   - Verify logs append in real-time

### Step 5C: Multiple Concurrent Executions

1. **Start Multiple Jobs** (if possible)
   - Quickly award 2-3 jobs to different bidders
   - Create 2-3 concurrent executions
   - See all progress bars updating simultaneously

2. **Verify Independent Updates**
   - Each execution updates independently
   - Progress bar 1: 0% → 25% → 75%
   - Progress bar 2: 0% → 10% → 80% (different timing)
   - Progress bar 3: 0% → 50% → 100%
   - No interference between updates

3. **Check WebSocket Messages**
   - See multiple execution_update messages
   - Different executionIds in messages
   - All updates arrive in real-time
   - No dropped updates

### Step 5D: Connection Failure & Recovery

1. **Simulate Disconnect** (DevTools Network Throttling)
   - DevTools → Network → Throttle: **Offline**
   - App should show "Connection lost" or "Reconnecting..."
   - Progress pauses

2. **Restore Connection**
   - DevTools → Network → Throttle: **No throttle**
   - WebSocket reconnects automatically
   - Say "Connection restored"
   - Progress resumes

3. **Verify Data Consistency**
   - All updates received correctly
   - No duplicate messages
   - Progress continuous (no gaps)

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| WebSocket connection fails | Server not listening | Verify WebSocket endpoint in server |
| Messages not received | WebSocket not properly connected | Check browser console for errors |
| Progress doesn't update | Frontend not listening for messages | Check JavaScript console for JS errors |
| Updates delayed | Slow network | Check network throttling, try on local connection |
| Reconnection not working | Browser cache issue | Clear cache and refresh |

### How to Verify

**JavaScript Console Test:**
```javascript
// In browser console, paste this:
ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Got message:', e.data);
ws.onerror = (e) => console.log('Error:', e);
// You should see "Connected" immediately
// Messages should arrive as execution progresses
```

**Server Logs:**
```powershell
# Check server logs show WebSocket connections
Get-Content logs/app.log | Select-String "WebSocket"
# Should show: "WebSocket connection established" messages
```

**Result: PASS / FAIL**

---

## TEST 6: PAYMENT FLOW

**Objective:** Verify payment and escrow flow works correctly

**Time:** 5-10 minutes

**Prerequisites:**
- Completed Tests 1-4
- Execution completed successfully
- Bidder and job creator have accounts

### Step 6A: Check Escrow Status

1. **View Job Status**
   - Go to completed job detail page
   - See "Payment Status" or "Escrow" section
   - Status should show: "Escrow Held" or "In Escrow"
   - Amount: The job budget (e.g., $500)
   - Held since: Job award time

2. **Verify Escrow Created**
   - See breakdown:
     - Job Budget: $500
     - Escrow Amount: $500
     - Status: "Active"
     - Released: "Pending completion"

### Step 6B: Mark Job Complete

1. **As Job Creator**
   - Log in as job creator
   - View awarded/completed job
   - See "Mark as Complete" button
   - Click button

2. **Confirm Completion**
   - Dialog appears: "Mark this job complete and release payment?"
   - Click "Confirm"
   - Success message: "Job marked complete. Payment processing..."

3. **Verify Status Changes**
   - Job status: "completed"
   - Escrow status: "released"
   - Payment status shows: "Processing" then "Completed"

### Step 6C: Payment Release

1. **Check Payment Details**
   - After release, see:
     - Payment ID: unique identifier
     - Amount: $500 (or winning bid amount)
     - Status: "completed" or "transferred"
     - Released: timestamp

2. **Verify Bidder Receives Payment**
   - Log in as bidder/executor
   - Go to "Earnings" or "Wallet" page
   - See transaction: "Payment received for job: $500"
   - Earnings increased by $500

3. **Verify Payout Ready**
   - If payment system integrated, see:
     - Available balance: $500
     - Can request payout (if threshold met)
     - Can use for future jobs as budget

### Step 6D: API Verification

```powershell
# Get job with payment details
$job = curl -H "Authorization: Bearer $token" `
  http://localhost:3000/api/jobs/$jobId

Write-Host "Job Status: $($job.status)"  # completed
Write-Host "Escrow Status: $($job.escrow.status)"  # released
Write-Host "Payment Status: $($job.payment.status)"  # completed

# Get execution for verification
$execution = curl -H "Authorization: Bearer $token" `
  http://localhost:3000/api/executions/$executionId

Write-Host "Execution Status: $($execution.status)"  # completed
```

### Step 6E: Error Scenarios

1. **Try to Release Without Completion**
   - Don't mark job complete
   - Try calling release payment API directly
   - Expected: Error "Job must be completed first"

2. **Try to Mark Complete as Wrong User**
   - Log in as bidder (not creator)
   - Try to mark job complete
   - Expected: Error "Only job creator can mark complete"

3. **Double Release Prevention**
   - Mark job complete once
   - Try again
   - Expected: Error "Escrow already released"

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Escrow not found" | Job not awarded | Complete Test 3 first |
| "Cannot release escrow" | Job not completed | Mark job complete first |
| Payment doesn't appear | Asynchronous processing | Wait 5-10 seconds, refresh |
| Balance doesn't update | UI not refreshed | Reload page |
| Escrow shows released but balance not updated | Race condition | Wait and refresh |

### How to Verify

**In Database:**
```sql
-- Check escrow
SELECT id, job_id, amount, status FROM escrow WHERE job_id = 'job_xxx';

-- Check payment
SELECT id, user_id, job_id, amount, status FROM payments WHERE job_id = 'job_xxx';

-- Check earnings
SELECT user_id, total_earned FROM user_earnings WHERE user_id = 'user_xxx';
```

**Expected:**
- escrow.status = "released"
- payment.status = "completed"
- user_earnings.total_earned = (previous + $500)

**Result: PASS / FAIL**

---

## TEST 7: ERROR RECOVERY

**Objective:** Verify system handles errors gracefully

**Time:** 5-10 minutes

**Prerequisites:**
- Completed Tests 1-6
- Understanding of error handling

### Step 7A: Network Errors

1. **Disconnect Network During Job Creation**
   - Open browser DevTools
   - Go to Network tab
   - Throttle to **Offline**
   - Try to create new job
   - Expected: Error message "Network error, please check connection"
   - Form doesn't submit
   - Data not lost (form still filled)

2. **Restore Network**
   - DevTools → Network → No throttle
   - Form should show "Retry" button
   - Click retry
   - Job creation should succeed

### Step 7B: Server Errors

1. **Trigger 500 Error** (Requires test endpoint)
   - API endpoint: `GET /api/test/error`
   - Expected: Error message "Server error, please try again"
   - Not a crash or blank page
   - Can continue using app

2. **Check Error Logging**
   - See error in `logs/error.log`
   - Includes timestamp and stack trace
   - User message doesn't expose details

### Step 7C: Validation Errors

1. **Invalid Job Budget**
   - Try to create job with budget = -500
   - Expected: Error "Budget must be positive"
   - Form shows in-line error on budget field
   - Field highlighted in red

2. **Missing Required Fields**
   - Try to create job without title
   - Expected: Error "Title is required"
   - Form doesn't submit
   - Other fields preserved

3. **Invalid Email Format**
   - Try to sign up with email: "notanemail"
   - Expected: Error "Invalid email format"
   - Form shows error inline

### Step 7D: Authentication Errors

1. **Expired Token**
   - Manually expire token (or wait 24 hours)
   - Try to create job
   - Expected: Redirect to login
   - Message: "Session expired, please log in"

2. **Wrong Password**
   - Try to log in with correct email, wrong password
   - Expected: Error "Invalid email or password"
   - Form preserved for retry

3. **Account Not Found**
   - Try to log in with non-existent email
   - Expected: Error "Invalid email or password" (generic, for security)

### Step 7E: Data Integrity Errors

1. **Bid Without Job**
   - Manually call API: `POST /api/bids/place` with non-existent jobId
   - Expected: Error "Job not found"
   - Status 404

2. **Award Bid Already Awarded**
   - Try to award another bid on same job (after already awarded)
   - Expected: Error "Job already awarded"
   - Status 409

3. **Concurrent Update Conflict**
   - Have two users edit same job simultaneously
   - Last write wins (or first write, depending on implementation)
   - No corruption or partial updates

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Network error" persists | Actual network issue | Check internet connection |
| "Server error" with no details | Unhelpful error message | Check server logs for real error |
| Form data lost on error | No client-side caching | Pre-filled form on retry (not required) |
| Same error happens twice | Retry not working | Check retry logic in frontend |
| Validation error wrong | Client/server mismatch | Ensure server validates same rules |

### How to Verify

**Error Logging:**
```powershell
# Check error log contains error details
Get-Content logs/error.log -Tail 20

# Should show:
# [timestamp] ERROR: Message
# Stack trace
# Context (userId, jobId, etc.)
```

**Result: PASS / FAIL**

---

## TEST 8: PERFORMANCE UNDER LOAD

**Objective:** Verify system remains responsive under concurrent load

**Time:** 10-15 minutes

**Prerequisites:**
- All previous tests passing
- System stable and ready
- Load testing tools available (optional)

### Step 8A: Rapid-Fire Requests (Manual)

1. **Create Multiple Jobs Quickly**
   - Open 3 browser tabs (or use API)
   - Each creates a job as fast as possible
   - All 3 job creations complete successfully
   - No timeouts or 500 errors
   - All jobs appear in list

2. **Concurrent Bidding**
   - Create one job
   - Have 3 users bid on it simultaneously (in 3 tabs)
   - All bids succeed
   - All bids appear in list
   - Job still responsive

### Step 8B: Load Testing with Artillery (Optional)

```powershell
# Install artillery if not present
npm install -g artillery

# Create test file: load-test.yml
@"
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 120
      arrivalRate: 50
      name: Sustained load
    - duration: 60
      arrivalRate: 10
      name: Cool down
scenarios:
  - name: SHADDAI Load Test
    flow:
      - get:
          url: /api/health
      - think: 2
      - get:
          url: /api/jobs
      - think: 2
      - post:
          url: /api/jobs/create
          json:
            title: Load test job
            description: This is a load test
            budget: 100
"@ | Out-File load-test.yml

# Run test
artillery run load-test.yml
```

**Expected Results:**
- Response time p95 < 500ms
- Success rate > 95%
- No memory leaks
- No database deadlocks

### Step 8C: Database Connection Pool

1. **Monitor Connections**
   - Create 10+ concurrent requests
   - Database should handle with connection pool
   - No "Too many connections" errors
   - Connections released properly

2. **Query Performance**
   - Jobs listing: < 1 second with 100+ jobs
   - Execution logs: < 500ms to retrieve
   - Payment lookup: < 100ms

### Step 8D: WebSocket Load

1. **Multiple Concurrent Executions**
   - Award 5 jobs to 5 different bidders simultaneously
   - 5 executions running concurrently
   - Each shows real-time updates
   - No dropped WebSocket messages
   - No lag in progress updates

### Step 8E: Memory & CPU Monitoring

```powershell
# Check process memory (PowerShell)
Get-Process node | Select-Object ProcessName, WorkingSet, CPU

# Expected:
# Memory: Stable (shouldn't grow unbounded)
# CPU: < 80% during load

# Monitor over 5 minutes
for ($i = 0; $i -lt 5; $i++) {
    Get-Process node | Select-Object ProcessName, WorkingSet, CPU
    Start-Sleep -Seconds 60
}
```

**Expected:**
- Memory stable (not growing)
- CPU returns to normal after load ends
- No memory leaks

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Request timeout | Server too slow | Check database, add indexes |
| "Too many connections" | Connection pool exhausted | Increase pool size in .env |
| Memory grows unbounded | Memory leak | Check for unclosed connections/listeners |
| WebSocket messages lost | Server overloaded | Reduce concurrent executions or add more resources |
| Database deadlock | Transaction conflict | Check transaction isolation level |

### How to Verify

**Check Logs During Load:**
```powershell
Get-Content logs/app.log -Tail -f | Select-String "error|timeout|failed"
# Should show none of these during normal load
```

**Database Connection Status:**
```sql
-- PostgreSQL
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
-- Should show max connections < pool_max_size
```

**Result: PASS / FAIL**

---

## TEST RESULTS & REPORTING

### Test Results Summary

Create a test report:

```markdown
# SHADDAI v61 Test Results

Date: 2026-05-13
Tester: [Your Name]
Version: 61.0.0
Environment: Windows 11, Node v18.x, PostgreSQL 14

## Test Results

| Test | Result | Notes |
|------|--------|-------|
| Test 1: Job Posting | PASS / FAIL | [Any issues] |
| Test 2: Bidding | PASS / FAIL | [Any issues] |
| Test 3: Award & Execution | PASS / FAIL | [Any issues] |
| Test 4: Skill Execution | PASS / FAIL | [Any issues] |
| Test 5: Real-Time Monitoring | PASS / FAIL | [Any issues] |
| Test 6: Payment Flow | PASS / FAIL | [Any issues] |
| Test 7: Error Recovery | PASS / FAIL | [Any issues] |
| Test 8: Performance Under Load | PASS / FAIL | [Any issues] |

## Summary
- Total Tests: 8
- Passed: X
- Failed: Y
- Success Rate: X%

## Critical Issues Found
[List any blocking issues]

## Recommendations
[Improvements or fixes needed]
```

### Issue Tracking

For each failed test, record:

```
**Issue:** [Short description]
- **Test:** Test # [which test failed]
- **Severity:** CRITICAL / HIGH / MEDIUM / LOW
- **Reproduction Steps:**
  1. Step 1
  2. Step 2
  3. Expected result vs actual result
- **Error Message:** [Full error text]
- **Logs:** [Relevant log snippet]
- **Suggested Fix:** [Possible solution]
- **Status:** NEW / IN PROGRESS / FIXED / DUPLICATE
```

### Sign-Off Checklist

Before deploying to production:

- [ ] All 8 tests PASSED
- [ ] No CRITICAL or HIGH severity issues
- [ ] Performance acceptable (see Test 8)
- [ ] Error logging working
- [ ] Security validations in place
- [ ] Database backups tested
- [ ] Rollback plan documented
- [ ] Team sign-off obtained

### Continuous Testing

For ongoing monitoring:

```powershell
# Run smoke tests daily
# (Example: 3 times per day)

# Test endpoint health
0 8,12,17 * * * curl http://localhost:3000/api/health

# Check error logs for issues
0 9,13,18 * * * Get-Content logs/error.log | 
    Where-Object { $_ -match "error" }
```

---

## QUICK REFERENCE

### All Tests at a Glance

| # | Test | Time | Status | Notes |
|---|------|------|--------|-------|
| 1 | Job Posting | 3-5m | | Create job, get ID |
| 2 | Bidding | 3-5m | | Place 3 bids on job |
| 3 | Award & Execution | 5-10m | | Award job, verify execution starts |
| 4 | Skill Execution | 5-15m | | Monitor progress, download results |
| 5 | Real-Time Monitoring | 3-5m | | Verify WebSocket updates |
| 6 | Payment Flow | 5-10m | | Mark complete, verify payment |
| 7 | Error Recovery | 5-10m | | Test error handling |
| 8 | Performance Under Load | 10-15m | | Concurrent requests |

**Total Time:** ~45-75 minutes for complete test cycle

### Success Criteria

All tests must PASS before production deployment:
- No unrecovered errors
- All features functional
- Real-time updates working
- Payments processing correctly
- Performance acceptable
- Security validations passing

---

**Last Updated:** 2026-05-13  
**Version:** 61.0.0  
**Author:** Deployment Agent

For issues or questions, refer to `DEPLOYMENT_READY.md` for troubleshooting.
