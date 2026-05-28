# SHADDAI Dashboard Frontend Integration

Complete frontend JavaScript library for wiring the SHADDAI dashboard UI to the backend APIs.

## Overview

This directory contains production-ready JavaScript and documentation for integrating the SHADDAI dashboard frontend with the backend API server.

**Key Features:**
- Complete job posting workflow
- Bidding system with real-time updates
- Skill execution with progress tracking
- Payment & escrow management
- Real-time status polling (2-second intervals)
- Error handling with user-friendly messages
- Authentication & session management
- Batch operations support
- Full TypeScript-compatible logging

---

## Files

### Core Implementation

#### `dashboard-workflows.js` (600+ lines)
The main integration file that brings the dashboard to life.

**What it does:**
- Handles all API communication via fetch API
- Manages authentication and session storage
- Implements job posting, bidding, awarding, and execution
- Real-time status polling for executions
- Payment processing and escrow management
- User-friendly error handling
- Comprehensive logging for debugging

**Key Functions:**
```javascript
// Authentication
login(email, password)
logout()
restoreAuthFromStorage()

// Job Management
createJob(jobData)
getJobs(filters)
getJobDetails(jobId)
refreshJobsList()

// Bidding
placeBid(jobId, bidData)
getBidsForJob(jobId)

// Job Execution
awardJob(jobId, bidId)

// Skill Execution
executeSkill(skillData)
getExecutions(limit)
getExecutionStatus(executionId)

// Real-Time Updates
startExecutionPolling(executionId)
startAutoPolling()

// Files & Payments
downloadGeneratedFile(filename)
releaseEscrow(jobId, amount)

// Batch Operations
createBatchJobs(jobsList)

// Analytics
getMarketplaceAnalytics()
getDashboardAnalytics()
```

### Documentation

#### `INTEGRATION_GUIDE.md`
Complete guide for integrating the JavaScript with your HTML.

**Covers:**
- Script inclusion
- Form setup and wiring
- Real-time status displays
- Authentication flow
- JavaScript API reference
- Polling system
- Error handling
- Production checklist

#### `HTML_SNIPPETS.md`
Ready-to-copy HTML code for all dashboard components.

**Includes:**
- Job posting form
- Skill execution form
- Bidding form
- Execution status display
- Jobs list grid
- User dashboard stats
- Login form
- Navigation bar
- Complete example page

---

## Quick Start

### 1. Include the Script

Add to your HTML:
```html
<script src="/frontend/dashboard-workflows.js"></script>
```

### 2. Wire Your Forms

Add `id` attributes to your forms:
```html
<form id="jobPostForm">
  <input name="jobTitle" required>
  <textarea name="jobDescription" required></textarea>
  <input name="jobBudget" type="number" required>
  <input name="jobDeadline" type="date" required>
  <input name="jobSkills" required>
  <button type="submit">Post Job</button>
</form>
```

That's it! The form submission is automatically wired to the backend.

### 3. Initialize Dashboard

Add to your HTML:
```html
<script>
// Auto-initializes on DOMContentLoaded
// Restores auth from localStorage
// Loads initial data
// Starts auto-polling
</script>
```

---

## Architecture

### State Management

Global state object: `dashboardState`
```javascript
{
  userId: null,
  authToken: null,
  currentUser: null,
  jobs: [],
  bids: [],
  executions: [],
  generatedFiles: [],
  cache: new Map(),
  stats: {
    totalEarnings: 0,
    activeJobs: 0,
    completedJobs: 0,
    averageBidTime: 0,
    successRate: 0
  }
}
```

### API Communication Layer

Centralized `apiCall()` function handles:
- Fetch requests
- Authentication headers
- Error handling
- Logging
- Caching

All API endpoints go through this:
```javascript
const result = await apiCall(method, endpoint, data);
// GET: apiCall('GET', '/jobs')
// POST: apiCall('POST', '/jobs', jobData)
// PUT: apiCall('PUT', `/jobs/${id}`, updateData)
```

### Real-Time Updates

Two polling strategies:

1. **Manual polling** - Start when needed:
   ```javascript
   startExecutionPolling('execution-id-123');
   ```

2. **Auto polling** - Continuous background updates:
   ```javascript
   startAutoPolling(); // Every 5 seconds
   ```

### Error Handling

Automatic error handling with recovery:
- **401** → Redirect to login
- **403** → Show permission error
- **404** → Show not found
- **500** → Show server error
- **Network** → Show connection error

User-friendly notifications for all errors.

---

## API Endpoints Reference

### Jobs
```
GET    /api/jobs                      List all jobs
GET    /api/jobs/{jobId}              Get job details
POST   /api/jobs                      Create new job
GET    /api/jobs/{jobId}/bids         Get job bids
POST   /api/jobs/{jobId}/bids         Place bid
POST   /api/jobs/{jobId}/award        Award job (start execution)
POST   /api/jobs/{jobId}/release-payment  Release escrow
```

### Skill Execution
```
POST   /api/agents/task               Execute skill
GET    /api/executions                List executions
GET    /api/executions/{id}           Get execution status
GET    /api/generated-files           List generated files
GET    /api/generated-files/{name}    Download file
```

### Authentication
```
POST   /api/auth/login                User login
POST   /api/auth/logout               User logout
```

### User & Billing
```
GET    /api/billing/tiers             Get user stats & earnings
POST   /api/billing/subscribe         Subscribe to tier
```

### Analytics
```
GET    /api/marketplace               Marketplace analytics
GET    /api/analytics/dashboard       Dashboard analytics
```

### Batch Operations
```
POST   /api/batch/jobs                Create multiple jobs
```

---

## Usage Examples

### Create a Job
```javascript
const result = await createJob({
  title: 'Build React Dashboard',
  description: 'Create a modern admin dashboard...',
  budget: 1500,
  skillsNeeded: 'React, Node.js, MongoDB',
  deadline: '2024-06-15',
  category: 'coding'
});

if (!result.error) {
  console.log('Job created:', result.id);
}
```

### Place a Bid
```javascript
const result = await placeBid('job-123', {
  amount: 1400,
  message: 'I have 8 years of experience...',
  estimatedTime: '1 week'
});
```

### Award a Job
```javascript
const result = await awardJob('job-123', 'bid-456');
// Automatically starts polling execution
```

### Execute a Skill
```javascript
const result = await executeSkill({
  skillName: 'create-video',
  topic: 'How to build a React app',
  parameters: {
    duration: 10,
    language: 'English'
  }
});
// Automatically starts polling
```

### Login
```javascript
const result = await login('user@example.com', 'password123');
// Stores auth token in localStorage
// Redirects to dashboard on success
```

### Get Active Jobs
```javascript
const jobs = await getJobs();
console.log(jobs.jobs); // Array of job objects
```

---

## Configuration

Edit constants in `dashboard-workflows.js`:

```javascript
const API_BASE = 'http://localhost:3000/api';      // Backend URL
const POLLING_INTERVAL = 2000;                     // 2 seconds
const CACHE_TTL = 30000;                           // 30 seconds
```

For production:
```javascript
const API_BASE = 'https://api.shaddai.app/api';    // Production URL
```

---

## Logging & Debugging

### View Logs
```javascript
// In browser console:
DashboardLogger.log('Action', { data });
DashboardLogger.error('Error', error);
DashboardLogger.warn('Warning', { data });
DashboardLogger.success('Success', { data });
```

### Check State
```javascript
// In browser console:
console.log(dashboardState);
console.log(dashboardState.jobs);
console.log(dashboardState.currentUser);
```

### Monitor Cache
```javascript
// In browser console:
console.log(Array.from(dashboardState.cache.entries()));
```

---

## Error Handling

### Automatic Error Handling

All API calls automatically handle errors:
```javascript
try {
  const result = await createJob(data);
  if (result.error) {
    // Error was handled, notification shown
    return;
  }
  // Success
} catch (error) {
  // Unexpected error
  console.error(error);
}
```

### Custom Error Handling

```javascript
try {
  await createJob(jobData);
} catch (error) {
  console.error('Custom handling:', error);
}
```

### User Notifications

```javascript
showNotification('Success!', 'success');     // Green
showNotification('Warning', 'warning');      // Orange
showNotification('Error', 'error');          // Red
showNotification('Info', 'info');            // Cyan
```

---

## Performance

### Caching
- 30-second cache for API responses
- Automatic invalidation on updates
- Manual cache clearing available

### Polling
- 2-second execution status polling
- 5-second auto-polling for background updates
- Automatic polling stops when execution completes

### Optimization Tips
- Use batch operations for multiple jobs
- Cache frequently accessed data
- Adjust polling intervals based on needs
- Minify JavaScript for production

---

## Security

### Authentication
- JWT tokens stored in localStorage
- Auto-included in all API requests
- Auto-logout on 401 response
- Session restoration from storage

### CORS
- CORS configured on backend
- Cross-origin requests supported
- Production domain whitelist recommended

### Input Validation
- Form field validation before submission
- Backend validation of all data
- XSS protection via content encoding
- CSRF tokens supported (if configured on backend)

---

## Mobile Support

The dashboard is fully responsive:
- Mobile-friendly forms
- Touch-friendly buttons
- Responsive grid layouts
- Optimized for small screens

---

## Browser Support

Works on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Requirements:**
- ES6 JavaScript support
- Fetch API
- LocalStorage
- Flexbox CSS

---

## Troubleshooting

### Dashboard won't load
1. Check browser console for errors
2. Verify auth token in localStorage
3. Confirm backend running on port 3000

### API calls failing
1. Check Network tab in DevTools
2. Verify `/api` endpoints available
3. Check CORS headers

### Polling not updating
1. Verify execution IDs are correct
2. Check backend returning status
3. Verify POLLING_INTERVAL not too large

### Forms not submitting
1. Check form has correct `id` attribute
2. Verify field names match structure
3. Check console for validation errors

---

## Production Deployment

### Pre-Deployment Checklist
- [ ] Update `API_BASE` to production URL
- [ ] Test all forms with real data
- [ ] Verify auth token storage secure
- [ ] Set up error tracking (Sentry)
- [ ] Configure logging service
- [ ] Test on mobile devices
- [ ] Minify JavaScript
- [ ] Set up CDN for assets
- [ ] Configure CORS headers
- [ ] Enable HTTPS everywhere

### Build Steps
```bash
# Minify JavaScript
npm install -g terser
terser dashboard-workflows.js -o dashboard-workflows.min.js -c -m

# Bundle with HTML
# Include minified version in production HTML
```

### Deployment
1. Update `API_BASE` to production URL
2. Deploy minified `dashboard-workflows.js`
3. Update HTML to include script
4. Test login and core workflows
5. Monitor error tracking logs

---

## Support & Maintenance

### Version
**v62** - Production Ready

### Last Updated
May 13, 2024

### Maintained By
TURTLE Agent

### License
MIT

---

## API Examples

### Complete Workflow

```javascript
// 1. Login
await login('user@example.com', 'password');

// 2. Create a job
const job = await createJob({
  title: 'Build API',
  description: '...',
  budget: 1000,
  skillsNeeded: 'Node.js',
  deadline: '2024-06-01'
});

// 3. Wait for bids
const bids = await getBidsForJob(job.id);

// 4. Award best bid
const result = await awardJob(job.id, bids[0].id);
// Automatically polls execution status

// 5. Download results
await downloadGeneratedFile('result.zip');

// 6. Release payment
await releaseEscrow(job.id, 1000);
```

---

For detailed integration instructions, see **INTEGRATION_GUIDE.md**.  
For ready-to-use HTML, see **HTML_SNIPPETS.md**.
