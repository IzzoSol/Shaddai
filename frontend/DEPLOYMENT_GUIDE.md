# SHADDAI Dashboard Deployment Guide

Complete guide for deploying the dashboard integration to production.

## Files Created

### Core Files
1. **dashboard-workflows.js** (600+ lines)
   - Main integration library
   - All API communication logic
   - Real-time polling system
   - Error handling and logging
   - State management

2. **README.md**
   - Complete documentation
   - Architecture overview
   - API reference
   - Usage examples
   - Troubleshooting guide

3. **INTEGRATION_GUIDE.md**
   - Step-by-step integration instructions
   - Form setup examples
   - JavaScript API reference
   - Real-time update patterns
   - Authentication flow

4. **HTML_SNIPPETS.md**
   - Ready-to-use HTML components
   - Copy-paste forms
   - UI examples
   - Complete example page

5. **test-integration.html**
   - Complete test suite
   - Connection validation
   - API endpoint testing
   - Form integration testing
   - Test results dashboard

---

## Quick Integration (5 Minutes)

### Step 1: Add Script Include
```html
<script src="/frontend/dashboard-workflows.js"></script>
```

### Step 2: Add Forms with IDs
```html
<form id="jobPostForm">
  <input name="jobTitle" required>
  <textarea name="jobDescription" required></textarea>
  <input name="jobBudget" type="number" required>
  <input name="jobDeadline" type="date" required>
  <button type="submit">Post Job</button>
</form>
```

### Step 3: That's It!
Forms automatically wire to backend. Dashboard initializes on load.

---

## File Structure

```
SHADDAI-FINAL-BUILD/
├── frontend/
│   ├── dashboard-workflows.js          (Main library - 600+ lines)
│   ├── README.md                       (Complete documentation)
│   ├── INTEGRATION_GUIDE.md            (Integration instructions)
│   ├── HTML_SNIPPETS.md                (Copy-paste components)
│   ├── test-integration.html           (Test suite)
│   ├── DEPLOYMENT_GUIDE.md             (This file)
│   └── USAGE_EXAMPLES.md               (Advanced examples)
│
├── backend/
│   ├── server-production.js            (Main server)
│   └── [other backend files]
│
└── public/
    └── index.html                      (Main dashboard)
```

---

## Deployment Steps

### Development Setup

1. Ensure backend is running:
```bash
cd SHADDAI-FINAL-BUILD
npm install
npm start
# Server runs on http://localhost:3000
```

2. Test integration:
```
Open: http://localhost:3000/frontend/test-integration.html
Click "Check API Health" - should show "Connected"
```

3. Include script in your HTML:
```html
<script src="/frontend/dashboard-workflows.js"></script>
```

### Production Deployment

#### Pre-Deployment Checklist

- [ ] Backend running and accessible
- [ ] API endpoints tested
- [ ] Auth token storage configured
- [ ] CORS headers enabled
- [ ] SSL/HTTPS configured
- [ ] Error tracking setup (Sentry, etc)
- [ ] Logging service configured

#### Configuration Update

Edit `dashboard-workflows.js` line 12:

**Development:**
```javascript
const API_BASE = 'http://localhost:3000/api';
```

**Production:**
```javascript
const API_BASE = 'https://api.yourdomain.com/api';
```

#### Minification (Optional)

```bash
# Install terser
npm install -g terser

# Minify the file
terser frontend/dashboard-workflows.js -o frontend/dashboard-workflows.min.js -c -m

# Use minified version in production HTML
<script src="/frontend/dashboard-workflows.min.js"></script>
```

#### Deploy Steps

1. Upload files to your server:
   ```bash
   scp -r frontend/ user@server:/var/www/shaddai/
   ```

2. Update HTML to include script:
   ```html
   <script src="/frontend/dashboard-workflows.js"></script>
   ```

3. Test login flow:
   - Navigate to login page
   - Enter credentials
   - Should redirect to dashboard
   - Should load jobs list

4. Test job creation:
   - Fill out job posting form
   - Submit
   - Should show success notification
   - Job should appear in list

5. Monitor error logs:
   - Check browser console
   - Check server logs
   - Verify Sentry/error tracking

---

## Environment Configuration

### API Endpoint

Update the base API URL for your environment:

```javascript
// dashboard-workflows.js, line 12

// Development (localhost)
const API_BASE = 'http://localhost:3000/api';

// Staging
const API_BASE = 'https://staging-api.shaddai.app/api';

// Production
const API_BASE = 'https://api.shaddai.app/api';
```

### Polling Intervals

Adjust polling speeds based on your needs:

```javascript
// dashboard-workflows.js, lines 13-14

const POLLING_INTERVAL = 2000;  // 2 seconds for execution status
const CACHE_TTL = 30000;        // 30 seconds cache
```

### CORS Configuration

On your backend (server-production.js):

```javascript
const cors = require('cors');

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5000',
    'https://dashboard.shaddai.app',
    'https://app.shaddai.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

---

## Testing Before Deployment

### 1. Unit Tests

Open `test-integration.html` and run all tests:
```
http://localhost:3000/frontend/test-integration.html
```

Expected results:
- ✓ API Health: Connected
- ✓ Dashboard State: Ready
- ✓ Logging System: All methods work
- ✓ Notifications: 3 notifications shown
- ✓ GET /jobs: Loaded X
- ✓ GET /marketplace: Data loaded
- ✓ GET /analytics: Data loaded
- ✓ GET /executions: Loaded X
- ✓ GET /generated-files: Loaded X

### 2. Manual Workflow Test

```javascript
// In browser console:

// 1. Login
await login('test@example.com', 'password123');

// 2. Create job
const job = await createJob({
  title: 'Test Job',
  description: 'Testing the integration',
  budget: 100,
  skillsNeeded: 'Testing',
  deadline: '2024-06-01'
});
console.log('Job created:', job.id);

// 3. Get jobs
const jobs = await getJobs();
console.log('Jobs:', jobs.length);

// 4. Check state
console.log('Dashboard state:', dashboardState);
```

### 3. Form Integration Test

1. Navigate to dashboard
2. Fill out job posting form
3. Click "Post Job"
4. Should show loading spinner
5. Should show success notification
6. Form should reset
7. Job should appear in list

### 4. Error Handling Test

Test various error scenarios:

```javascript
// In browser console:

// Test invalid credentials
await login('invalid@example.com', 'wrongpassword');
// Should show error notification

// Test network error
// Disconnect internet, try API call
// Should show connection error

// Test invalid job data
await createJob({
  title: '',  // Empty required field
  description: '',
  budget: -100  // Invalid negative budget
});
// Should show validation error
```

---

## Monitoring & Maintenance

### Error Tracking

Set up error tracking service (e.g., Sentry):

```javascript
// Add to dashboard-workflows.js after line 20

if (window.location.hostname.includes('shaddai.app')) {
  // Initialize Sentry for production
  Sentry.init({
    dsn: 'your-sentry-dsn-here',
    environment: 'production'
  });
}
```

### Performance Monitoring

Monitor key metrics:

```javascript
// In browser console:

// Check cache performance
console.log(dashboardState.cache.stats());

// Check polling activity
console.log(dashboardState.pollingTimer);

// Check API call count
DashboardLogger.log('API Stats', {
  totalCalls: window.apiCallCount || 0,
  cacheHits: dashboardState.cache.hits,
  cacheMisses: dashboardState.cache.misses
});
```

### Logging

All actions are logged to console:

```
[DASHBOARD] [2024-05-13T10:30:45.123Z] API POST, { endpoint: '/jobs', data: {...} }
[DASHBOARD SUCCESS] API POST, { endpoint: '/jobs', result: {...} }
```

View logs in browser DevTools:
1. Open DevTools (F12)
2. Go to Console tab
3. Look for [DASHBOARD] messages

---

## Rollback Procedure

If issues arise:

1. **Rollback Script**
   ```bash
   # Revert to previous version
   git checkout HEAD~1 frontend/dashboard-workflows.js
   ```

2. **Clear Cache**
   ```javascript
   // In browser console:
   dashboardState.cache.clear();
   localStorage.removeItem('authToken');
   localStorage.removeItem('userId');
   location.reload();
   ```

3. **Check Backend**
   ```bash
   # Verify backend is running
   curl http://localhost:3000/api/health
   ```

---

## Production Checklist

### Pre-Launch
- [ ] All API endpoints tested and working
- [ ] Authentication flow working (login/logout)
- [ ] Forms submitting successfully
- [ ] Real-time polling working
- [ ] Error messages user-friendly
- [ ] Mobile responsive
- [ ] Performance acceptable
- [ ] Error tracking configured
- [ ] Logs being recorded

### Security
- [ ] HTTPS enabled
- [ ] CORS whitelist configured
- [ ] Auth tokens stored securely
- [ ] API keys protected
- [ ] Input validation enabled
- [ ] XSS protection enabled
- [ ] CSRF protection enabled (if needed)

### Performance
- [ ] Script minified
- [ ] Assets cached
- [ ] Polling intervals optimized
- [ ] Database queries optimized
- [ ] Load testing passed
- [ ] Memory leaks checked

### Monitoring
- [ ] Error tracking enabled
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring enabled
- [ ] Alert system configured
- [ ] Log aggregation setup

---

## Troubleshooting Deployment

### Backend Not Connected
```
Error: Network connection failed

Solution:
1. Check backend running: curl http://localhost:3000/api/health
2. Check CORS headers
3. Check API_BASE URL in dashboard-workflows.js
4. Check firewall/network permissions
```

### Auth Token Not Persisting
```
Error: Session expired on page reload

Solution:
1. Check localStorage enabled: localStorage.setItem('test', 'test')
2. Check browser storage limits
3. Check auth token expiration time
4. Clear browser cache and retry
```

### Forms Not Submitting
```
Error: Form submission not working

Solution:
1. Check form has id attribute (id="jobPostForm")
2. Check field names match expected structure
3. Check script is loaded: window.dashboardState exists
4. Check console for JavaScript errors
```

### Real-Time Updates Not Working
```
Error: Execution status not updating

Solution:
1. Check polling enabled: dashboardState.pollingTimer
2. Check execution IDs are correct
3. Check POLLING_INTERVAL not too large
4. Check network requests in DevTools
5. Check backend returning status updates
```

---

## Upgrade Procedure

To upgrade to a newer version:

1. Backup current version:
   ```bash
   cp frontend/dashboard-workflows.js frontend/dashboard-workflows.js.backup
   ```

2. Download new version:
   ```bash
   # Get from version control or vendor
   cp new/dashboard-workflows.js frontend/
   ```

3. Test in development:
   ```
   Open test-integration.html
   Run all tests
   Verify no regressions
   ```

4. Deploy to production:
   ```bash
   scp frontend/dashboard-workflows.js user@server:/var/www/shaddai/
   ```

5. Clear cache and verify:
   ```javascript
   // In browser console on production:
   dashboardState.cache.clear();
   location.reload();
   ```

---

## Support

For issues or questions:

1. **Check Console**
   - Open DevTools (F12)
   - Look for [DASHBOARD] messages
   - Check for JavaScript errors

2. **Run Tests**
   - Open test-integration.html
   - Click test buttons
   - Check test results

3. **Check Documentation**
   - See README.md for API reference
   - See INTEGRATION_GUIDE.md for examples
   - See HTML_SNIPPETS.md for components

4. **Check Logs**
   - Server logs: `logs/` directory
   - Browser console: F12
   - Error tracking service: Sentry dashboard

---

## Version History

### v62 (Current - Production Ready)
- ✓ Complete job posting workflow
- ✓ Bidding system with real-time updates
- ✓ Skill execution with progress tracking
- ✓ Payment & escrow management
- ✓ Real-time polling system
- ✓ Error handling and recovery
- ✓ Authentication & session management
- ✓ Batch operations
- ✓ Comprehensive logging
- ✓ Full test suite

---

**Deployment Guide v62**  
Last Updated: May 13, 2024  
Maintained By: TURTLE Agent
