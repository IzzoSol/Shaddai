# SHADDAI Dashboard Integration Guide

Complete guide for wiring the frontend HTML to the `dashboard-workflows.js` backend integration layer.

## Quick Start

### 1. Include the Script

Add this to your HTML `<head>` or before closing `</body>`:

```html
<script src="/frontend/dashboard-workflows.js"></script>
```

### 2. Forms Setup

Wire your forms by adding `id` attributes and form field names matching the expected structure.

---

## Form Integration Examples

### Job Posting Form

HTML Structure:
```html
<form id="jobPostForm">
  <input type="text" name="jobTitle" placeholder="Job title" required>
  <textarea name="jobDescription" placeholder="Job description" required></textarea>
  <input type="number" name="jobBudget" placeholder="Budget (USD)" required>
  <input type="text" name="jobSkills" placeholder="Skills needed (comma-separated)" required>
  <input type="date" name="jobDeadline" required>
  <select name="jobCategory">
    <option value="general">General</option>
    <option value="coding">Coding</option>
    <option value="design">Design</option>
  </select>
  <button type="submit">Post Job</button>
</form>
```

The form submission is automatically wired. When submitted:
1. Shows loading spinner
2. Posts to `/api/jobs` with form data
3. Shows success/error notification
4. Refreshes the jobs list
5. Resets the form

### Skill Execution Form

HTML Structure:
```html
<form id="skillExecForm">
  <select name="skillName" required>
    <option value="create-video">Create Video</option>
    <option value="build-api">Build API</option>
    <option value="write-docs">Write Documentation</option>
    <option value="analyze-market">Analyze Market</option>
  </select>
  <textarea name="skillTopic" placeholder="Topic or script..." required></textarea>
  <input type="text" name="skillParam" placeholder="Additional parameters">
  <button type="submit">Execute Skill</button>
</form>

<div id="taskAiOutput" style="display:none">
  <!-- Results appear here -->
</div>
```

When submitted, the skill executes on the backend and automatically:
1. Starts polling for status updates
2. Updates progress bar in real-time
3. Shows results when complete
4. Provides download links for generated files

### Bidding Form

HTML Structure:
```html
<form id="bidForm" data-job-id="JOB_ID_HERE">
  <input type="number" name="bidAmount" placeholder="Your bid amount" required>
  <textarea name="bidMessage" placeholder="Why you're the best fit..." required></textarea>
  <input type="text" name="estimatedTime" placeholder="Estimated delivery time" value="3 days">
  <button type="submit">Place Bid</button>
</form>
```

Key: Set `data-job-id` attribute to specify which job the bid is for.

---

## Real-Time Status Updates

### Execution Status Display

HTML Structure:
```html
<div data-execution-id="EXECUTION_ID_HERE" class="execution-status">
  <div class="progress-bar"></div>
  <span class="status">pending</span>
  <div class="result"></div>
</div>
```

The dashboard automatically:
1. Polls `/api/executions/{id}` every 2 seconds
2. Updates the progress bar
3. Updates status text
4. Displays results when complete
5. Stops polling when execution finishes

---

## JavaScript API

### Direct Function Calls

You can call these functions directly from your page:

#### Create a Job
```javascript
await createJob({
  title: 'Build a homepage',
  description: 'Create a modern landing page',
  budget: 500,
  skillsNeeded: 'React, CSS, Design',
  deadline: '2024-06-01',
  category: 'coding'
});
```

#### Place a Bid
```javascript
await placeBid('job-id-123', {
  amount: 450,
  message: 'I have 5 years of experience...',
  estimatedTime: '5 days'
});
```

#### Award a Job
```javascript
await awardJob('job-id-123', 'bid-id-456');
// Automatically starts polling execution status
```

#### Execute a Skill
```javascript
await executeSkill({
  skillName: 'create-video',
  topic: 'How to learn React',
  parameters: {
    duration: 5,
    language: 'English'
  }
});
// Automatically starts polling for results
```

#### Get Active Jobs
```javascript
const jobs = await getJobs();
console.log(jobs.jobs);
```

#### Get Executions
```javascript
const executions = await getExecutions(20); // Last 20 executions
executions.forEach(exec => {
  console.log(exec.id, exec.status, exec.progress);
});
```

#### Download Generated File
```javascript
await downloadGeneratedFile('my-video.mp4');
```

#### Release Payment (Escrow)
```javascript
await releaseEscrow('job-id-123', 450);
```

---

## User Authentication

### Login Flow

HTML for login form:
```html
<form id="loginForm" onsubmit="handleLogin(event)">
  <input type="email" id="email" placeholder="Email" required>
  <input type="password" id="password" placeholder="Password" required>
  <button type="submit">Login</button>
</form>

<script>
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  await login(email, password);
}
</script>
```

The `login()` function:
1. Sends credentials to `/api/auth/login`
2. Stores auth token in localStorage
3. Redirects to dashboard on success
4. Shows error message on failure

### Logout

```javascript
logout(); // Clears token and redirects to login
```

### Auto-Restore Session

The dashboard automatically restores auth from localStorage:
```javascript
// Called automatically in initializeDashboard()
restoreAuthFromStorage(); // Returns true if token found
```

---

## Real-Time Polling System

The dashboard polls for updates automatically every 5 seconds:

```javascript
// Manually start auto-polling
startAutoPolling();

// Manually poll a single execution
startExecutionPolling('execution-id-123');

// Polling stops automatically when execution finishes
```

---

## Notifications & UI Feedback

### Show Notification
```javascript
showNotification('Job created!', 'success');
// Types: 'info', 'success', 'error', 'warning'
```

### Show Loading Spinner
```javascript
const spinner = showLoadingSpinner('Processing your request...');
// Later...
hideLoadingSpinner();
```

---

## Error Handling

All API calls automatically handle errors with user-friendly messages:

- **401 Unauthorized** → Redirects to login
- **403 Forbidden** → Shows permission error
- **404 Not Found** → Shows resource not found message
- **500 Server Error** → Shows retry message
- **Network Error** → Shows connection error

Example of custom error handling:
```javascript
try {
  await createJob(jobData);
} catch (error) {
  console.error('Failed:', error.message);
}
```

---

## UI State Management

### Access Global State
```javascript
console.log(dashboardState.jobs);        // All jobs
console.log(dashboardState.executions);  // All executions
console.log(dashboardState.bids);        // All bids
console.log(dashboardState.currentUser); // Logged-in user
console.log(dashboardState.stats);       // User statistics
```

### Cache System

The dashboard implements smart caching to reduce API calls:
- Cache TTL: 30 seconds
- Automatic invalidation on updates
- Manual cache access:

```javascript
// Cache is used automatically
// To manually clear:
dashboardState.cache.clear();
```

---

## Logging & Debugging

### Console Logging

All actions are logged to browser console with `[DASHBOARD]` prefix:

```javascript
// In browser console:
DashboardLogger.log('Custom action', { data: 123 });
DashboardLogger.error('Error occurred', error);
DashboardLogger.warn('Warning message');
DashboardLogger.success('Success!');
```

### Check Dashboard State
```javascript
// In browser console:
console.log(dashboardState);
```

---

## API Endpoints Reference

All endpoints are automatically handled. For reference:

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/{jobId}` - Get job details
- `POST /api/jobs` - Create job
- `GET /api/jobs/{jobId}/bids` - Get bids for job
- `POST /api/jobs/{jobId}/bids` - Place bid
- `POST /api/jobs/{jobId}/award` - Award job
- `POST /api/jobs/{jobId}/release-payment` - Release escrow

### Skills & Execution
- `POST /api/agents/task` - Execute skill
- `GET /api/executions` - List executions
- `GET /api/executions/{id}` - Get execution status
- `GET /api/generated-files` - List generated files
- `GET /api/generated-files/{name}` - Download file

### Auth & User
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/billing/tiers` - User stats & earnings

### Analytics
- `GET /api/marketplace` - Marketplace analytics
- `GET /api/analytics/dashboard` - Dashboard analytics
- `POST /api/batch/jobs` - Create multiple jobs

---

## Advanced: Batch Operations

### Create Multiple Jobs at Once
```javascript
const jobs = [
  {
    title: 'Build API',
    description: 'Create REST API',
    budget: 1000,
    skillsNeeded: 'Node.js, MongoDB',
    deadline: '2024-06-01'
  },
  {
    title: 'Design UI',
    description: 'Design dashboard',
    budget: 500,
    skillsNeeded: 'Figma, UI Design',
    deadline: '2024-05-25'
  }
];

await createBatchJobs(jobs);
```

---

## Example: Complete Workflow

```html
<!DOCTYPE html>
<html>
<head>
  <script src="/frontend/dashboard-workflows.js"></script>
</head>
<body>

<h1>SHADDAI Dashboard</h1>

<!-- Job Posting -->
<section id="postJob">
  <h2>Post a Job</h2>
  <form id="jobPostForm">
    <input type="text" name="jobTitle" placeholder="Job title" required>
    <textarea name="jobDescription" placeholder="Description" required></textarea>
    <input type="number" name="jobBudget" placeholder="Budget" required>
    <input type="text" name="jobSkills" placeholder="Skills (comma-separated)" required>
    <input type="date" name="jobDeadline" required>
    <button type="submit">Post Job</button>
  </form>
</section>

<!-- Skill Execution -->
<section id="execSkill">
  <h2>Execute a Skill</h2>
  <form id="skillExecForm">
    <select name="skillName" required>
      <option value="create-video">Create Video</option>
      <option value="build-api">Build API</option>
    </select>
    <textarea name="skillTopic" placeholder="Topic" required></textarea>
    <button type="submit">Execute</button>
  </form>
  <div id="taskAiOutput"></div>
</section>

<script>
// The forms are automatically wired!
// Just add id attributes and proper form names.
</script>

</body>
</html>
```

---

## Troubleshooting

### Dashboard won't load
- Check browser console for errors
- Verify auth token in localStorage
- Check that backend API is running on port 3000

### API calls failing
- Check network tab in DevTools
- Verify `/api` endpoints are available
- Check CORS headers if cross-origin

### Polling not updating
- Check `POLLING_INTERVAL` constant (default 2000ms)
- Verify execution IDs are correct
- Check backend is returning status updates

### Forms not submitting
- Verify form has correct `id` attribute
- Check form field names match expected structure
- Open console to see error messages

---

## Production Checklist

- [ ] Update `API_BASE` to production URL
- [ ] Enable CORS for production domain
- [ ] Test all forms with real data
- [ ] Verify auth token storage is secure
- [ ] Set up error tracking (Sentry, etc)
- [ ] Configure logging to external service
- [ ] Test on mobile devices
- [ ] Optimize images and assets
- [ ] Minify and bundle JavaScript
- [ ] Set up CDN for static assets

---

**Version:** v62  
**Last Updated:** 2024-05-13  
**Maintained By:** TURTLE Agent
