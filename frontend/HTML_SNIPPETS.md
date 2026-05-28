# SHADDAI Dashboard HTML Snippets

Ready-to-use HTML code for integrating dashboard workflows. Copy and paste into your index.html.

## Script Include

Add to your HTML `<head>`:

```html
<script src="/frontend/dashboard-workflows.js"></script>
```

---

## Complete Job Posting Form

```html
<div class="job-posting-section">
  <h3>Post a New Job</h3>
  
  <form id="jobPostForm" style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
    
    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Job Title</label>
      <input 
        type="text" 
        name="jobTitle" 
        class="input"
        placeholder="e.g., Build React Dashboard, Write Technical Blog Post"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Description</label>
      <textarea 
        name="jobDescription" 
        class="input"
        rows="4"
        placeholder="Describe the job in detail. What are the requirements? What will the deliverable look like?"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit; resize: vertical;"
      ></textarea>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Budget (USD)</label>
        <input 
          type="number" 
          name="jobBudget" 
          min="10"
          max="100000"
          step="10"
          placeholder="500"
          required
          style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
        >
      </div>
      
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Deadline</label>
        <input 
          type="date" 
          name="jobDeadline"
          required
          style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
        >
      </div>
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Required Skills (comma-separated)</label>
      <input 
        type="text" 
        name="jobSkills" 
        placeholder="e.g., React, Node.js, PostgreSQL, API Design"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Category</label>
      <select 
        name="jobCategory"
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
        <option value="general">General</option>
        <option value="coding">Coding & Development</option>
        <option value="design">Design & UI/UX</option>
        <option value="content">Content & Writing</option>
        <option value="analysis">Analysis & Research</option>
        <option value="marketing">Marketing & Growth</option>
      </select>
    </div>

    <button 
      type="submit"
      style="width: 100%; padding: 10px; background: var(--accent); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px;"
      onmouseover="this.style.opacity='0.8'"
      onmouseout="this.style.opacity='1'"
    >
      Post Job
    </button>
  </form>
</div>
```

---

## Skill Execution Form

```html
<div class="skill-execution-section">
  <h3>Execute a Skill</h3>
  
  <form id="skillExecForm" style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
    
    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Select Skill</label>
      <select 
        name="skillName"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
        <option value="">-- Choose a skill --</option>
        <option value="create-video">Create Video (TURTLE)</option>
        <option value="build-api">Build API (NEXUS)</option>
        <option value="write-docs">Write Documentation (QUILL)</option>
        <option value="analyze-market">Analyze Market (ORACLE)</option>
        <option value="design-ui">Design UI Component (TURTLE)</option>
        <option value="security-audit">Security Audit (PIKADON)</option>
        <option value="financial-modeling">Financial Modeling (ZEROX)</option>
      </select>
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Topic or Instructions</label>
      <textarea 
        name="skillTopic"
        rows="4"
        placeholder="Describe what you want created. Be specific about requirements, style, tone, etc."
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit; resize: vertical;"
      ></textarea>
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Additional Parameters (optional)</label>
      <input 
        type="text" 
        name="skillParam"
        placeholder="e.g., duration=10min, language=Spanish, style=corporate"
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
    </div>

    <button 
      type="submit"
      style="width: 100%; padding: 10px; background: var(--accent); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px;"
      onmouseover="this.style.opacity='0.8'"
      onmouseout="this.style.opacity='1'"
    >
      Execute Skill
    </button>
  </form>

  <!-- Results Display -->
  <div id="taskAiOutput" style="display: none; margin-top: 16px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 8px; padding: 12px; max-height: 400px; overflow-y: auto;">
    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 700;">EXECUTION RESULTS:</div>
    <pre style="margin: 0; color: var(--text-primary); font-size: 10px; white-space: pre-wrap; word-wrap: break-word;"></pre>
  </div>

  <!-- Download Links -->
  <div id="taskAiActions" style="display: none; margin-top: 12px; gap: 8px; display: flex;">
    <button class="btn btn-accent" onclick="downloadLastFile()" style="flex: 1; padding: 8px; font-size: 11px;">
      📥 Download Result
    </button>
    <button class="btn btn-ghost" onclick="closeTaskOutput()" style="flex: 1; padding: 8px; font-size: 11px;">
      ✕ Close
    </button>
  </div>
</div>
```

---

## Bidding Form

```html
<div class="bidding-section" data-job-id="JOB_ID_PLACEHOLDER">
  <h3>Place Your Bid</h3>
  
  <form id="bidForm" style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
    
    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Your Bid Amount (USD)</label>
      <input 
        type="number" 
        name="bidAmount"
        min="1"
        max="100000"
        step="1"
        placeholder="450"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Estimated Delivery Time</label>
      <input 
        type="text" 
        name="estimatedTime"
        placeholder="e.g., 5 days, 1 week"
        value="3 days"
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit;"
      >
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">Why You? (Your Pitch)</label>
      <textarea 
        name="bidMessage"
        rows="4"
        placeholder="Why are you the best fit for this job? Highlight relevant experience, past projects, or unique skills."
        required
        style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit; resize: vertical;"
      ></textarea>
    </div>

    <button 
      type="submit"
      style="width: 100%; padding: 10px; background: var(--accent); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px;"
      onmouseover="this.style.opacity='0.8'"
      onmouseout="this.style.opacity='1'"
    >
      Place Bid
    </button>
  </form>
</div>
```

---

## Execution Status Display

```html
<div class="execution-status-card" data-execution-id="EXECUTION_ID_PLACEHOLDER" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
  
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <span style="font-weight: 700; font-size: 11px;">Execution Status</span>
    <span class="status" style="font-size: 10px; color: var(--text-secondary); padding: 2px 8px; background: rgba(139,92,246,0.2); border-radius: 3px;">
      pending
    </span>
  </div>

  <!-- Progress Bar -->
  <div style="margin-bottom: 8px;">
    <div style="background: rgba(0,0,0,0.5); border-radius: 3px; height: 6px; overflow: hidden;">
      <div class="progress-bar" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s ease;"></div>
    </div>
    <div style="font-size: 9px; color: var(--text-muted); margin-top: 2px;">
      <span class="progress-text">0%</span>
    </div>
  </div>

  <!-- Result Container -->
  <div class="result" style="display: none; background: rgba(0,0,0,0.5); border-radius: 4px; padding: 8px; font-size: 9px; color: var(--text-primary); max-height: 200px; overflow-y: auto; font-family: monospace; white-space: pre-wrap;">
  </div>

</div>
```

---

## Jobs List Display

```html
<div class="jobs-list-section">
  <h3>Available Jobs</h3>
  
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;">
    <!-- Jobs will be rendered here dynamically -->
    <div class="job-card" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
      
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <h4 style="font-size: 13px; color: var(--text-primary); margin: 0;">Job Title</h4>
        <span class="budget" style="background: var(--accent-dim); color: var(--accent); padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700;">$500</span>
      </div>

      <p class="description" style="font-size: 11px; color: var(--text-secondary); margin: 0 0 8px 0; line-height: 1.5;"></p>

      <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
        <!-- Skills tags will be rendered here -->
        <span style="background: rgba(0,229,160,0.2); color: var(--accent); padding: 2px 6px; border-radius: 3px; font-size: 9px;">React</span>
        <span style="background: rgba(0,229,160,0.2); color: var(--accent); padding: 2px 6px; border-radius: 3px; font-size: 9px;">Node.js</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: var(--text-muted); margin-bottom: 12px;">
        <span>Deadline: <span class="deadline" style="color: var(--text-primary);">May 25, 2024</span></span>
        <span class="bid-count" style="color: var(--accent);">3 bids</span>
      </div>

      <button 
        onclick="viewJobDetails(this)"
        style="width: 100%; padding: 8px; background: rgba(0,229,160,0.2); color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; font-size: 10px; font-weight: 700; cursor: pointer;"
      >
        View & Bid
      </button>

    </div>
  </div>
</div>
```

---

## User Dashboard Stats

```html
<div class="user-stats-section" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px;">
  
  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
    <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Total Earnings</div>
    <div style="font-size: 24px; font-weight: 700; color: var(--success);" id="statBackendEarnings">$0.00</div>
  </div>

  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
    <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Active Jobs</div>
    <div style="font-size: 24px; font-weight: 700; color: var(--accent);" id="statBackendJobs">0</div>
  </div>

  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
    <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Completed Jobs</div>
    <div style="font-size: 24px; font-weight: 700; color: var(--tertiary);" id="statCompletedJobs">0</div>
  </div>

  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
    <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Success Rate</div>
    <div style="font-size: 24px; font-weight: 700; color: var(--warning);" id="statSuccessRate">0%</div>
  </div>

</div>
```

---

## Login Form

```html
<div class="login-container" style="max-width: 400px; margin: 100px auto; padding: 20px;">
  
  <h1 style="text-align: center; color: var(--accent); margin-bottom: 24px;">SHADDAI</h1>

  <form id="loginForm" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 20px;">
    
    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary);">Email Address</label>
      <input 
        type="email" 
        id="email"
        name="email"
        placeholder="you@example.com"
        required
        style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit; font-size: 12px;"
      >
    </div>

    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary);">Password</label>
      <input 
        type="password" 
        id="password"
        name="password"
        placeholder="••••••••"
        required
        style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-family: inherit; font-size: 12px;"
      >
    </div>

    <button 
      type="submit"
      style="width: 100%; padding: 12px; background: var(--accent); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 13px;"
      onmouseover="this.style.opacity='0.8'"
      onmouseout="this.style.opacity='1'"
    >
      Login
    </button>

    <div style="text-align: center; margin-top: 12px; font-size: 11px; color: var(--text-muted);">
      Don't have an account? <a href="/signup" style="color: var(--accent); text-decoration: none;">Sign up</a>
    </div>

  </form>

</div>

<script>
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  await login(email, password);
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);
</script>
```

---

## Navigation & Buttons

```html
<!-- Main Navigation -->
<nav style="background: var(--bg-primary); border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; justify-content: space-between; align-items: center;">
  
  <h2 style="margin: 0; color: var(--accent); font-size: 16px;">SHADDAI Dashboard</h2>

  <div style="display: flex; gap: 8px;">
    <button onclick="loadJobsView()" class="btn btn-ghost" style="padding: 6px 12px; font-size: 11px; background: transparent; border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); cursor: pointer;">
      💼 Jobs
    </button>
    <button onclick="loadExecutionsView()" class="btn btn-ghost" style="padding: 6px 12px; font-size: 11px; background: transparent; border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); cursor: pointer;">
      ⚙️ Executions
    </button>
    <button onclick="loadUserDashboard()" class="btn btn-ghost" style="padding: 6px 12px; font-size: 11px; background: transparent; border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); cursor: pointer;">
      👤 Profile
    </button>
    <button onclick="logout()" class="btn btn-ghost" style="padding: 6px 12px; font-size: 11px; background: transparent; border: 1px solid var(--danger); border-radius: 4px; color: var(--danger); cursor: pointer;">
      Logout
    </button>
  </div>

</nav>
```

---

## Complete Example Page

Save as `dashboard.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SHADDAI Dashboard</title>
  <style>
    :root {
      --bg-deep: #020817;
      --bg-primary: #0c1425;
      --text-primary: #e8edf5;
      --text-secondary: #8b9dc3;
      --text-muted: #5a6b8a;
      --accent: #00e5a0;
      --border: rgba(90, 107, 138, 0.25);
      --danger: #ff4070;
      --success: #00e5a0;
      --tertiary: #00c8ff;
      --warning: #ffb020;
    }

    body {
      background: var(--bg-deep);
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    .input, .select {
      background: rgba(0,0,0,0.5);
      border: 1px solid var(--border);
      color: var(--text-primary);
      border-radius: 4px;
      padding: 8px;
      font-family: inherit;
      font-size: 12px;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      font-family: inherit;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.2s;
    }

    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-primary);
    }

    .btn-accent {
      background: var(--accent);
      color: black;
    }

    h2, h3 {
      margin-top: 0;
      color: var(--accent);
    }
  </style>
</head>
<body>

<nav style="background: var(--bg-primary); border-bottom: 1px solid var(--border); padding: 10px 20px;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <h2 style="margin: 0;">SHADDAI</h2>
    <div style="display: flex; gap: 8px;">
      <button onclick="logout()" class="btn btn-ghost">Logout</button>
    </div>
  </div>
</nav>

<div class="container">

  <!-- Dashboard Stats -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">EARNINGS</div>
      <div style="font-size: 20px; font-weight: 700; color: var(--success);" id="statBackendEarnings">$0.00</div>
    </div>
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">ACTIVE JOBS</div>
      <div style="font-size: 20px; font-weight: 700; color: var(--accent);" id="statBackendJobs">0</div>
    </div>
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">COMPLETED</div>
      <div style="font-size: 20px; font-weight: 700; color: var(--tertiary);">0</div>
    </div>
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">SUCCESS RATE</div>
      <div style="font-size: 20px; font-weight: 700; color: var(--warning);">0%</div>
    </div>
  </div>

  <!-- Post Job -->
  <section style="margin-bottom: 30px;">
    <h3>Post a Job</h3>
    <form id="jobPostForm" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
      <input type="text" name="jobTitle" class="input" placeholder="Job title" required style="width: 100%; margin-bottom: 12px;">
      <textarea name="jobDescription" class="input" rows="3" placeholder="Description" required style="width: 100%; margin-bottom: 12px;"></textarea>
      <input type="number" name="jobBudget" class="input" placeholder="Budget ($)" required style="width: 100%; margin-bottom: 12px;">
      <input type="date" name="jobDeadline" class="input" required style="width: 100%; margin-bottom: 12px;">
      <button type="submit" class="btn btn-accent">Post Job</button>
    </form>
  </section>

  <!-- Execute Skill -->
  <section>
    <h3>Execute a Skill</h3>
    <form id="skillExecForm" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
      <select name="skillName" class="select" required style="width: 100%; margin-bottom: 12px;">
        <option value="create-video">Create Video</option>
        <option value="build-api">Build API</option>
        <option value="write-docs">Write Documentation</option>
      </select>
      <textarea name="skillTopic" class="input" rows="3" placeholder="What to create..." required style="width: 100%; margin-bottom: 12px;"></textarea>
      <button type="submit" class="btn btn-accent">Execute</button>
    </form>
    <div id="taskAiOutput" style="display: none; margin-top: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 12px;"></div>
  </section>

</div>

<script src="/frontend/dashboard-workflows.js"></script>

</body>
</html>
```

---

**Ready to use!** Copy these snippets into your HTML and the forms will automatically wire to the backend.
