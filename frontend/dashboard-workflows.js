/**
 * SHADDAI Dashboard Workflows v62 — Complete Integration
 *
 * Brings the dashboard to life by wiring all forms and buttons to backend APIs.
 * Handles:
 * - Job posting and management
 * - Bidding on jobs
 * - Job award and execution
 * - Skill execution with real-time status
 * - Payment and escrow management
 * - Real-time updates via polling
 *
 * Environment: Frontend (Browser)
 * Backend API: http://localhost:3000/api
 * Polling Interval: 2 seconds for real-time updates
 */

// ============================================
// CONFIGURATION
// ============================================

const API_BASE = 'http://localhost:3000/api';
const POLLING_INTERVAL = 2000; // 2 seconds
const CACHE_TTL = 30000; // 30 seconds

// Global state
const dashboardState = {
  userId: null,
  authToken: null,
  currentUser: null,
  jobs: [],
  bids: [],
  executions: [],
  generatedFiles: [],
  pollingTimer: null,
  cache: new Map(),
  stats: {
    totalEarnings: 0,
    activeJobs: 0,
    completedJobs: 0,
    averageBidTime: 0,
    successRate: 0
  }
};

// ============================================
// LOGGER & ERROR HANDLING
// ============================================

class DashboardLogger {
  static log(action, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[DASHBOARD] [${timestamp}] ${action}`, data);
  }

  static error(action, error) {
    const timestamp = new Date().toISOString();
    console.error(`[DASHBOARD ERROR] [${timestamp}] ${action}`, error);
  }

  static warn(action, data = {}) {
    console.warn(`[DASHBOARD WARN] ${action}`, data);
  }

  static success(action, data = {}) {
    console.log(`[DASHBOARD SUCCESS] ${action}`, data);
  }
}

// Error handler with user-friendly messages
function handleError(error, context = '') {
  DashboardLogger.error(context, error);

  let userMessage = 'An error occurred. Please try again.';

  if (error.response?.status === 401) {
    userMessage = 'Session expired. Please log in again.';
    redirectToLogin();
  } else if (error.response?.status === 403) {
    userMessage = 'You do not have permission to perform this action.';
  } else if (error.response?.status === 404) {
    userMessage = 'Resource not found.';
  } else if (error.response?.status === 500) {
    userMessage = 'Server error. Please try again later.';
  } else if (error.message === 'Network Error') {
    userMessage = 'Network connection failed. Check your internet.';
  }

  showNotification(userMessage, 'error');
  return { error: userMessage };
}

// ============================================
// UI HELPERS
// ============================================

function showNotification(message, type = 'info') {
  const id = `notif-${Date.now()}`;
  const notifEl = document.createElement('div');

  const colors = {
    'info': '#00e5a0',
    'success': '#00e5a0',
    'error': '#ff4070',
    'warning': '#ffb020'
  };

  notifEl.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: rgba(0, 0, 0, 0.95);
    border: 1px solid ${colors[type]};
    color: ${colors[type]};
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 12px;
    max-width: 300px;
    z-index: 10000;
    word-wrap: break-word;
    animation: slideIn 0.3s ease-out;
    id: ${id}
  `;

  notifEl.textContent = message;
  document.body.appendChild(notifEl);

  setTimeout(() => {
    notifEl.style.opacity = '0';
    notifEl.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => notifEl.remove(), 300);
  }, 5000);
}

function showLoadingSpinner(text = 'Processing...') {
  const spinner = document.createElement('div');
  spinner.id = 'dashboardLoadingSpinner';
  spinner.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    border: 1px solid var(--accent);
    padding: 30px;
    border-radius: 8px;
    text-align: center;
    z-index: 10001;
    color: var(--text-primary);
    font-size: 14px;
  `;

  spinner.innerHTML = `
    <div style="width:40px;height:40px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px"></div>
    ${text}
  `;

  document.body.appendChild(spinner);
  return spinner;
}

function hideLoadingSpinner() {
  const spinner = document.getElementById('dashboardLoadingSpinner');
  if (spinner) {
    spinner.style.transition = 'opacity 0.3s ease-out';
    spinner.style.opacity = '0';
    setTimeout(() => spinner.remove(), 300);
  }
}

// ============================================
// API HELPERS
// ============================================

async function apiCall(method, endpoint, data = null, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (dashboardState.authToken) {
      config.headers['Authorization'] = `Bearer ${dashboardState.authToken}`;
    }

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    DashboardLogger.log(`API ${method}`, { endpoint, data });

    const response = await fetch(url, config);

    if (!response.ok) {
      throw {
        response: {
          status: response.status,
          statusText: response.statusText
        },
        message: await response.text()
      };
    }

    const result = await response.json();
    DashboardLogger.success(`API ${method}`, { endpoint, result });
    return result;
  } catch (error) {
    handleError(error, `API ${method} ${endpoint}`);
    throw error;
  }
}

// ============================================
// AUTHENTICATION
// ============================================

async function login(email, password) {
  try {
    showLoadingSpinner('Logging in...');

    const result = await apiCall('POST', '/auth/login', {
      email,
      password
    });

    dashboardState.userId = result.user.id;
    dashboardState.authToken = result.token;
    dashboardState.currentUser = result.user;

    // Store auth token in localStorage
    localStorage.setItem('authToken', result.token);
    localStorage.setItem('userId', result.user.id);

    hideLoadingSpinner();
    showNotification('Logged in successfully!', 'success');

    // Redirect to dashboard
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 1000);

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Login failed');
  }
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  dashboardState.authToken = null;
  dashboardState.userId = null;

  apiCall('POST', '/auth/logout').catch(() => {});

  window.location.href = '/login';
}

function restoreAuthFromStorage() {
  const token = localStorage.getItem('authToken');
  const userId = localStorage.getItem('userId');

  if (token && userId) {
    dashboardState.authToken = token;
    dashboardState.userId = userId;
    return true;
  }

  return false;
}

// ============================================
// JOB POSTING WORKFLOW
// ============================================

async function createJob(jobData) {
  try {
    showLoadingSpinner('Creating job...');

    const payload = {
      title: jobData.title,
      description: jobData.description,
      budget: parseFloat(jobData.budget),
      skillsNeeded: jobData.skillsNeeded ? jobData.skillsNeeded.split(',').map(s => s.trim()) : [],
      deadline: jobData.deadline,
      category: jobData.category || 'general'
    };

    const result = await apiCall('POST', '/jobs', payload);

    hideLoadingSpinner();
    showNotification(`Job created! ID: ${result.id}`, 'success');

    // Refresh jobs list
    await refreshJobsList();

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Job creation failed');
  }
}

async function getJobs(filters = {}) {
  try {
    // Check cache first
    const cacheKey = `jobs_${JSON.stringify(filters)}`;
    const cached = dashboardState.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    let endpoint = '/jobs';
    if (Object.keys(filters).length > 0) {
      const params = new URLSearchParams(filters);
      endpoint += `?${params.toString()}`;
    }

    const result = await apiCall('GET', endpoint);

    dashboardState.jobs = result.jobs || result;
    dashboardState.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch jobs');
  }
}

async function getJobDetails(jobId) {
  try {
    const result = await apiCall('GET', `/jobs/${jobId}`);
    return result;
  } catch (error) {
    return handleError(error, `Failed to fetch job ${jobId}`);
  }
}

async function refreshJobsList() {
  const jobs = await getJobs();
  if (jobs.error) return;

  updateJobsUI(jobs.jobs || jobs);
}

function updateJobsUI(jobs) {
  const container = document.getElementById('jobsList') || document.getElementById('agentsView');
  if (!container) return;

  // This would be updated based on your actual UI structure
  DashboardLogger.log('Jobs list updated', { count: jobs.length });
}

// ============================================
// BIDDING SYSTEM
// ============================================

async function placeBid(jobId, bidData) {
  try {
    showLoadingSpinner('Placing bid...');

    const payload = {
      amount: parseFloat(bidData.amount),
      message: bidData.message,
      estimatedTime: bidData.estimatedTime || '3 days'
    };

    const result = await apiCall('POST', `/jobs/${jobId}/bids`, payload);

    hideLoadingSpinner();
    showNotification('Bid placed successfully!', 'success');

    // Refresh bids
    await refreshBidsList(jobId);

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Bid placement failed');
  }
}

async function getBidsForJob(jobId) {
  try {
    const result = await apiCall('GET', `/jobs/${jobId}/bids`);
    dashboardState.bids = result.bids || result;
    return result;
  } catch (error) {
    return handleError(error, `Failed to fetch bids for job ${jobId}`);
  }
}

async function refreshBidsList(jobId) {
  const bids = await getBidsForJob(jobId);
  if (bids.error) return;

  DashboardLogger.log('Bids list updated', { jobId, count: bids.bids?.length || 0 });
}

// ============================================
// JOB AWARD & EXECUTION
// ============================================

async function awardJob(jobId, bidId) {
  try {
    showLoadingSpinner('Awarding job...');

    const result = await apiCall('POST', `/jobs/${jobId}/award`, {
      bidId
    });

    hideLoadingSpinner();
    showNotification('Job awarded! Execution started.', 'success');

    // Start polling execution status
    startExecutionPolling(result.executionId);

    // Refresh jobs
    await refreshJobsList();

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Job award failed');
  }
}

// ============================================
// SKILL EXECUTION
// ============================================

async function executeSkill(skillData) {
  try {
    showLoadingSpinner('Executing skill...');

    const payload = {
      skill: skillData.skillName,
      topic: skillData.topic,
      parameters: skillData.parameters || {},
      priority: skillData.priority || 'normal'
    };

    const result = await apiCall('POST', '/agents/task', payload);

    hideLoadingSpinner();
    showNotification(`Skill execution started! Task ID: ${result.id}`, 'success');

    // Start polling
    startExecutionPolling(result.id);

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Skill execution failed');
  }
}

async function getExecutions(limit = 20) {
  try {
    const result = await apiCall('GET', `/executions?limit=${limit}`);
    dashboardState.executions = result.executions || result;
    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch executions');
  }
}

async function getExecutionStatus(executionId) {
  try {
    const result = await apiCall('GET', `/executions/${executionId}`);
    return result;
  } catch (error) {
    return handleError(error, `Failed to fetch execution status ${executionId}`);
  }
}

// ============================================
// REAL-TIME STATUS POLLING
// ============================================

function startExecutionPolling(executionId) {
  DashboardLogger.log('Started polling execution', { executionId });

  const pollFunction = async () => {
    try {
      const execution = await getExecutionStatus(executionId);

      if (execution.error) {
        DashboardLogger.error('Polling error', execution.error);
        return;
      }

      // Update UI with status
      updateExecutionUI(execution);

      // Stop polling if execution is complete
      if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
        DashboardLogger.log('Execution polling complete', { executionId, status: execution.status });
        showNotification(`Execution ${execution.status}!`, execution.status === 'completed' ? 'success' : 'error');
        return;
      }

      // Continue polling
      setTimeout(pollFunction, POLLING_INTERVAL);
    } catch (error) {
      DashboardLogger.error('Polling error', error);
      setTimeout(pollFunction, POLLING_INTERVAL);
    }
  };

  pollFunction();
}

function updateExecutionUI(execution) {
  // Update progress bar if exists
  const progressBar = document.querySelector(`[data-execution-id="${execution.id}"] .progress-bar`);
  if (progressBar) {
    progressBar.style.width = `${execution.progress || 0}%`;
  }

  // Update status text
  const statusEl = document.querySelector(`[data-execution-id="${execution.id}"] .status`);
  if (statusEl) {
    statusEl.textContent = execution.status;
    statusEl.style.color = execution.status === 'completed' ? 'var(--success)' : 'var(--text-secondary)';
  }

  // Update result if complete
  if (execution.status === 'completed' && execution.result) {
    const resultEl = document.querySelector(`[data-execution-id="${execution.id}"] .result`);
    if (resultEl) {
      resultEl.innerHTML = `<pre>${JSON.stringify(execution.result, null, 2)}</pre>`;
    }
  }

  DashboardLogger.log('Execution updated', execution);
}

// ============================================
// GENERATED FILES & DOWNLOADS
// ============================================

async function getGeneratedFiles() {
  try {
    const result = await apiCall('GET', '/generated-files');
    dashboardState.generatedFiles = result.files || result;
    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch generated files');
  }
}

async function downloadGeneratedFile(filename) {
  try {
    // Use direct download link
    const url = `${API_BASE}/generated-files/${encodeURIComponent(filename)}`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    showNotification(`Downloading ${filename}...`, 'success');
  } catch (error) {
    handleError(error, `Failed to download file ${filename}`);
  }
}

// ============================================
// PAYMENT & ESCROW MANAGEMENT
// ============================================

async function releaseEscrow(jobId, amount) {
  try {
    showLoadingSpinner('Releasing escrow...');

    const result = await apiCall('POST', `/jobs/${jobId}/release-payment`, {
      amount
    });

    hideLoadingSpinner();
    showNotification(`Payment released: $${amount}`, 'success');

    // Refresh user stats
    await refreshUserStats();

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Payment release failed');
  }
}

async function getUserStats() {
  try {
    const result = await apiCall('GET', '/billing/tiers');
    dashboardState.stats = result;
    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch user stats');
  }
}

async function refreshUserStats() {
  const stats = await getUserStats();
  if (stats.error) return;

  updateStatsUI(stats);
}

function updateStatsUI(stats) {
  // Update earnings
  const earningsEl = document.getElementById('statBackendEarnings');
  if (earningsEl && stats.earnings !== undefined) {
    earningsEl.textContent = `$${stats.earnings.toFixed(2)}`;
  }

  // Update active jobs
  const jobsEl = document.getElementById('statBackendJobs');
  if (jobsEl && stats.activeJobs !== undefined) {
    jobsEl.textContent = stats.activeJobs;
  }

  DashboardLogger.log('Stats updated', stats);
}

// ============================================
// BATCH OPERATIONS
// ============================================

async function createBatchJobs(jobsList) {
  try {
    showLoadingSpinner(`Creating ${jobsList.length} jobs...`);

    const result = await apiCall('POST', '/batch/jobs', {
      jobs: jobsList
    });

    hideLoadingSpinner();
    showNotification(`${jobsList.length} jobs created!`, 'success');

    // Refresh jobs
    await refreshJobsList();

    return result;
  } catch (error) {
    hideLoadingSpinner();
    return handleError(error, 'Batch job creation failed');
  }
}

// ============================================
// MARKETPLACE ANALYTICS
// ============================================

async function getMarketplaceAnalytics() {
  try {
    const result = await apiCall('GET', '/marketplace');
    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch marketplace analytics');
  }
}

async function getDashboardAnalytics() {
  try {
    const result = await apiCall('GET', '/analytics/dashboard');
    return result;
  } catch (error) {
    return handleError(error, 'Failed to fetch dashboard analytics');
  }
}

// ============================================
// INITIALIZATION
// ============================================

async function initializeDashboard() {
  DashboardLogger.log('Initializing dashboard...');

  // Restore auth from storage
  if (!restoreAuthFromStorage()) {
    window.location.href = '/login';
    return;
  }

  try {
    // Load initial data
    await Promise.all([
      refreshJobsList(),
      refreshUserStats(),
      getExecutions()
    ]);

    // Start auto-polling for updates
    startAutoPolling();

    DashboardLogger.success('Dashboard initialized');
  } catch (error) {
    DashboardLogger.error('Dashboard initialization failed', error);
  }
}

function startAutoPolling() {
  // Poll for new executions every 5 seconds
  setInterval(async () => {
    const executions = await getExecutions();
    if (executions.error) return;

    // Update any running executions
    executions.forEach(exec => {
      if (exec.status === 'running' || exec.status === 'pending') {
        updateExecutionUI(exec);
      }
    });
  }, 5000);
}

// ============================================
// FORM HANDLING
// ============================================

function setupFormHandlers() {
  // Job posting form
  const jobForm = document.getElementById('jobPostForm');
  if (jobForm) {
    jobForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(jobForm);
      const jobData = {
        title: formData.get('jobTitle'),
        description: formData.get('jobDescription'),
        budget: formData.get('jobBudget'),
        skillsNeeded: formData.get('jobSkills'),
        deadline: formData.get('jobDeadline'),
        category: formData.get('jobCategory')
      };

      const result = await createJob(jobData);
      if (!result.error) {
        jobForm.reset();
      }
    });
  }

  // Skill execution form
  const skillForm = document.getElementById('skillExecForm');
  if (skillForm) {
    skillForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(skillForm);
      const skillData = {
        skillName: formData.get('skillName'),
        topic: formData.get('skillTopic'),
        parameters: {
          customParam: formData.get('skillParam')
        }
      };

      const result = await executeSkill(skillData);
      if (!result.error) {
        skillForm.reset();
      }
    });
  }

  // Bid form
  const bidForm = document.getElementById('bidForm');
  if (bidForm) {
    bidForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const jobId = bidForm.dataset.jobId;
      const formData = new FormData(bidForm);
      const bidData = {
        amount: formData.get('bidAmount'),
        message: formData.get('bidMessage'),
        estimatedTime: formData.get('estimatedTime')
      };

      const result = await placeBid(jobId, bidData);
      if (!result.error) {
        bidForm.reset();
      }
    });
  }
}

// ============================================
// UTILS
// ============================================

function redirectToLogin() {
  window.location.href = '/login';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

// ============================================
// EXPORTS FOR TESTING
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createJob,
    placeBid,
    awardJob,
    executeSkill,
    getJobs,
    getExecutions,
    releaseEscrow,
    initializeDashboard
  };
}

// ============================================
// AUTO-INITIALIZE ON LOAD
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  DashboardLogger.log('DOM loaded, setting up handlers');
  setupFormHandlers();

  // Only auto-init if we're on the dashboard
  if (window.location.pathname.includes('dashboard')) {
    initializeDashboard();
  }
});
