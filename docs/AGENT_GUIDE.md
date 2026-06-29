# SHADDAI Agent Guide

Complete guide to understanding and using each of the 7 agents in SHADDAI.

## Agent Overview

SHADDAI orchestrates 7 specialized AI agents, each with specific expertise:

```
┌──────────────────────────────────────────────────────────────────┐
│                         SHADDAI (Port 8000)                      │
│         Supreme Orchestrator - Strategy & Coordination           │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│ │ NEXUS (8003)    │  │ TURTLE (8004)  │  │ QUILL (8005)     │   │
│ │ Tech Architect  │  │ Design & UX    │  │ Writing & Docs   │   │
│ └─────────────────┘  └────────────────┘  └──────────────────┘   │
│                                                                  │
│ ┌─────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│ │ PIKADON (8008)  │  │ ZEROX (8001)   │  │ ORACLE (8002)    │   │
│ │ Security & Sec  │  │ Billing & Bus  │  │ Research & Intel │   │
│ └─────────────────┘  └────────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 1. SHADDAI - Supreme Orchestrator (Port 8000)

**Role:** Strategic decision-maker, project coordinator, final arbiter

**Expertise:**
- Long-term strategy and planning
- Project coordination and reporting
- Integration of team work
- Quality sign-off
- Risk assessment

**When to Use SHADDAI:**
- You need a project coordination report
- You want strategic guidance on architecture
- You need a final quality review
- You're planning multi-agent workflows
- You want an executive summary

**Example Tasks:**

```javascript
// Coordinate a full project build
api.post('/api/agents/task', {
  agentName: 'SHADDAI',
  task: 'Create a project coordination report for building a user management system',
  context: {
    components: ['API', 'Frontend', 'Security Review', 'Documentation'],
    timeline: '2 weeks',
    team: ['NEXUS', 'TURTLE', 'PIKADON', 'QUILL']
  }
});

// Strategic planning
api.post('/api/agents/task', {
  agentName: 'SHADDAI',
  task: 'Create a phased rollout plan for launching this feature to production',
  context: {
    feature: 'Payment Integration',
    risk_level: 'high',
    constraints: 'Must maintain backward compatibility'
  }
});

// Quality review
api.post('/api/agents/task', {
  agentName: 'SHADDAI',
  task: 'Review this project plan and identify potential issues',
  context: {
    plan: 'Build API in 2 days, design UI in 1 day, deploy in 1 day',
    team_size: 3,
    critical_deadline: 'Friday'
  }
});
```

**Output:**
- Project coordination reports
- Strategic recommendations
- Risk assessments
- Timeline and resource plans
- Quality reviews

---

## 2. NEXUS - Technical Architect (Port 8003)

**Role:** Backend specialist, API architect, infrastructure expert

**Expertise:**
- REST API design and implementation
- Database schema design
- Backend architecture
- Server infrastructure
- Performance optimization
- API documentation (technical)

**When to Use NEXUS:**
- Building REST APIs
- Designing database schemas
- Implementing backend logic
- Setting up authentication/authorization
- Optimizing server performance
- Creating microservices

**Example Tasks:**

```javascript
// Build a complete REST API
api.post('/api/agents/task', {
  agentName: 'NEXUS',
  task: 'Build a complete REST API for a user management system',
  context: {
    framework: 'Express.js',
    database: 'PostgreSQL',
    entities: ['User', 'Profile', 'Settings'],
    features: ['JWT Auth', 'Rate Limiting', 'Pagination'],
    validation: true
  }
});

// Database schema design
api.post('/api/agents/task', {
  agentName: 'NEXUS',
  task: 'Design a PostgreSQL database schema for an e-commerce platform',
  context: {
    entities: ['Product', 'Order', 'Customer', 'Payment'],
    relationships: 'Customer has many Orders, Order has many Products',
    constraints: 'Must support 1M+ products'
  }
});

// Authentication system
api.post('/api/agents/task', {
  agentName: 'NEXUS',
  task: 'Build JWT authentication middleware for Express',
  context: {
    framework: 'Express.js',
    tokenExpiry: '24h',
    refreshTokens: true,
    roles: ['admin', 'user', 'guest']
  }
});

// WebSocket real-time API
api.post('/api/agents/task', {
  agentName: 'NEXUS',
  task: 'Build a WebSocket API for real-time notifications',
  context: {
    framework: 'Node.js + ws',
    events: ['message', 'notification', 'user-join'],
    scaling: 'Support 10k concurrent users'
  }
});
```

**Output:**
- Complete API server code (index.js or server.js)
- Database migration scripts
- Authentication middleware
- Configuration files
- Performance optimization recommendations

**Skills (100+):**
- Build REST API
- Design database schema
- Implement authentication
- Build microservices
- Optimize performance
- Create Docker configuration
- Build caching layer
- Implement rate limiting

---

## 3. TURTLE - UI/UX Designer (Port 8004)

**Role:** Design specialist, frontend architect, UX expert

**Expertise:**
- React/Vue component design
- HTML/CSS implementation
- UI system design
- Animation and transitions
- Accessibility (WCAG)
- Mobile-first design
- Dark mode implementation

**When to Use TURTLE:**
- Building React components
- Designing login/signup pages
- Creating dashboards
- Building responsive layouts
- Implementing design systems
- Creating animations
- Improving accessibility

**Example Tasks:**

```javascript
// Design a complete dashboard
api.post('/api/agents/task', {
  agentName: 'TURTLE',
  task: 'Design a beautiful admin dashboard with dark mode',
  context: {
    framework: 'React',
    theme: 'dark',
    components: ['UserTable', 'Analytics', 'Settings Panel'],
    brandColors: ['#6366f1', '#f97316'],
    icons: 'lucide-react'
  }
});

// Login page
api.post('/api/agents/task', {
  agentName: 'TURTLE',
  task: 'Design a modern, accessible login page',
  context: {
    framework: 'React',
    authMethods: ['email', 'Google', 'GitHub'],
    theme: 'light',
    mobile: true,
    accessibility: 'WCAG 2.1 AA'
  }
});

// Design system component
api.post('/api/agents/task', {
  agentName: 'TURTLE',
  task: 'Create a reusable Button component with variants',
  context: {
    framework: 'React',
    variants: ['primary', 'secondary', 'danger', 'ghost'],
    sizes: ['small', 'medium', 'large'],
    states: ['normal', 'hover', 'active', 'disabled'],
    animation: true
  }
});

// Responsive layout
api.post('/api/agents/task', {
  agentName: 'TURTLE',
  task: 'Build a responsive product listing page',
  context: {
    framework: 'React',
    breakpoints: ['mobile', 'tablet', 'desktop'],
    layout: 'grid',
    items: 'products with image, title, price'
  }
});
```

**Output:**
- React/Vue component files (JSX/TSX)
- CSS modules with styling
- Responsive design implementations
- Dark mode stylesheets
- Animation code
- Accessibility attributes (ARIA)

**Skills (100+):**
- Design React components
- Build responsive layouts
- Create design systems
- Implement accessibility
- Build animations
- Design dark mode
- Create form components
- Design tables and grids

---

## 4. QUILL - Writing & Communication (Port 8005)

**Role:** Documentation specialist, technical writer, communication expert

**Expertise:**
- API documentation
- User guides
- README files
- Error messages
- Feature descriptions
- Tutorial writing
- Copy editing
- Accessibility copy

**When to Use QUILL:**
- Writing API documentation
- Creating user guides
- Improving error messages
- Writing feature descriptions
- Creating tutorials
- Improving product copy
- Technical content editing

**Example Tasks:**

```javascript
// API documentation
api.post('/api/agents/task', {
  agentName: 'QUILL',
  task: 'Write comprehensive API documentation',
  context: {
    apiName: 'User Management API',
    endpoints: [
      { method: 'GET', path: '/users', description: 'List users' },
      { method: 'POST', path: '/users', description: 'Create user' },
      { method: 'GET', path: '/users/:id', description: 'Get user' }
    ],
    tone: 'professional',
    audience: 'developers'
  }
});

// User guide
api.post('/api/agents/task', {
  agentName: 'QUILL',
  task: 'Write a getting started guide for new users',
  context: {
    product: 'SHADDAI',
    topics: ['Installation', 'First Task', 'Common Tasks', 'Troubleshooting'],
    audience: 'non-technical users',
    length: 'medium'
  }
});

// Error messages
api.post('/api/agents/task', {
  agentName: 'QUILL',
  task: 'Improve error messages for better user understanding',
  context: {
    currentMessages: [
      'Error 401: Unauthorized',
      'Error 500: Internal Server Error',
      'Error 422: Validation failed'
    ],
    tone: 'helpful and friendly'
  }
});

// Release notes
api.post('/api/agents/task', {
  agentName: 'QUILL',
  task: 'Write release notes for v2.0',
  context: {
    changes: ['New payment system', 'Redesigned dashboard', 'API v2'],
    breaking_changes: ['Deprecated /v1 endpoints'],
    audience: 'all users'
  }
});
```

**Output:**
- Markdown documentation files
- API documentation with examples
- README files
- User guides and tutorials
- Improved copy and error messages
- Release notes
- Feature descriptions

**Skills (100+):**
- Write API documentation
- Create user guides
- Improve error messages
- Write tutorials
- Create release notes
- Write feature descriptions
- Edit technical content
- Create FAQ documents

---

## 5. PIKADON - Security & Compliance (Port 8008)

**Role:** Security expert, compliance specialist, code auditor

**Expertise:**
- Code security review
- Vulnerability assessment
- Compliance auditing (GDPR, SOC2, etc.)
- Secret management
- Access control design
- Security testing
- Audit logging
- Penetration testing recommendations

**When to Use PIKADON:**
- Reviewing code for security issues
- Assessing compliance requirements
- Designing access control
- Planning security hardening
- Auditing authentication systems
- Planning disaster recovery
- Creating security policies

**Example Tasks:**

```javascript
// Security code review
api.post('/api/agents/task', {
  agentName: 'PIKADON',
  task: 'Review this API code for security vulnerabilities',
  context: {
    code: `const app = express();
app.post('/api/users', (req, res) => {
  const user = { email: req.body.email, password: req.body.password };
  db.users.save(user);
  res.json(user);
});`,
    severity: 'high',
    focus: ['authentication', 'data validation', 'encryption']
  }
});

// Compliance audit
api.post('/api/agents/task', {
  agentName: 'PIKADON',
  task: 'Audit our system for GDPR compliance',
  context: {
    systems: ['User database', 'File storage', 'Logging system'],
    requirements: ['Data deletion', 'Data export', 'Consent tracking'],
    scope: 'EU user data'
  }
});

// Access control design
api.post('/api/agents/task', {
  agentName: 'PIKADON',
  task: 'Design role-based access control (RBAC) for the platform',
  context: {
    roles: ['admin', 'moderator', 'user'],
    resources: ['Users', 'Content', 'Analytics'],
    model: 'RBAC'
  }
});

// Security hardening plan
api.post('/api/agents/task', {
  agentName: 'PIKADON',
  task: 'Create a security hardening plan for production',
  context: {
    environment: 'production',
    criticality: 'high',
    threats: ['SQL injection', 'XSS', 'CSRF', 'rate limiting'],
    budget: 'standard'
  }
});
```

**Output:**
- Security audit reports
- Vulnerability assessments
- Remediation recommendations
- Security policies
- Compliance documentation
- Access control matrix
- Security testing plans

**Skills (100+):**
- Code security review
- Vulnerability assessment
- Design access control
- Create compliance plans
- Security hardening
- Penetration testing plan
- Create audit logs
- Design disaster recovery

---

## 6. ZEROX - Wealth & Revenue Engine (Port 8001)

**Role:** Business logic specialist, billing expert, revenue strategist

**Expertise:**
- Billing system design
- Pricing strategy
- Subscription management
- Revenue modeling
- Cost analysis
- Payment integration
- Financial reporting
- Unit economics

**When to Use ZEROX:**
- Designing pricing tiers
- Building billing systems
- Creating revenue models
- Analyzing unit economics
- Implementing payment processing
- Planning financial projections
- Optimizing for profitability

**Example Tasks:**

```javascript
// Pricing strategy
api.post('/api/agents/task', {
  agentName: 'ZEROX',
  task: 'Design a pricing strategy for SaaS product',
  context: {
    product: 'API Platform',
    costPerUser: 5,
    targetMarket: 'developers',
    tiers: 3,
    goal: 'maximize revenue without losing customers'
  }
});

// Billing system
api.post('/api/agents/task', {
  agentName: 'ZEROX',
  task: 'Design a billing system with monthly subscriptions',
  context: {
    tiers: [
      { name: 'Free', price: 0, limits: { requests: 1000 } },
      { name: 'Pro', price: 29, limits: { requests: 100000 } },
      { name: 'Enterprise', price: 'custom', limits: { requests: 'unlimited' } }
    ],
    paymentMethod: 'Stripe'
  }
});

// Revenue projection
api.post('/api/agents/task', {
  agentName: 'ZEROX',
  task: 'Create a 5-year revenue projection',
  context: {
    currentUsers: 100,
    monthlyGrowth: 0.15,
    avgPrice: 50,
    churnRate: 0.05
  }
});

// Cost analysis
api.post('/api/agents/task', {
  agentName: 'ZEROX',
  task: 'Analyze our cost structure and find optimization opportunities',
  context: {
    costs: ['Hosting', 'Database', 'Support', 'Development'],
    revenue: 50000
  }
});
```

**Output:**
- Pricing tier designs
- Billing system specifications
- Revenue models
- Financial projections
- Cost analysis reports
- Payment integration guides
- Subscription management logic

**Skills (100+):**
- Design pricing strategy
- Build billing system
- Create revenue models
- Analyze unit economics
- Design payment flows
- Create financial projections
- Optimize for profitability
- Design subscription logic

---

## 7. ORACLE - Research & Intelligence (Port 8002)

**Role:** Research specialist, data analyst, trend forecaster

**Expertise:**
- Market research
- Competitive analysis
- Technology trend analysis
- Data analysis
- Pattern recognition
- Forecast modeling
- Opportunity identification
- Risk assessment

**When to Use ORACLE:**
- Researching market trends
- Competitive analysis
- Technology evaluation
- Data analysis
- Opportunity assessment
- Risk identification
- Trend forecasting
- Decision support

**Example Tasks:**

```javascript
// Market research
api.post('/api/agents/task', {
  agentName: 'ORACLE',
  task: 'Research the AI agent marketplace and competitive landscape',
  context: {
    market: 'AI automation',
    competitors: ['Zapier', 'Make', 'n8n'],
    focus: ['pricing', 'features', 'target customers']
  }
});

// Technology evaluation
api.post('/api/agents/task', {
  agentName: 'ORACLE',
  task: 'Evaluate best database options for our application',
  context: {
    requirements: ['Real-time', 'Scalable', 'ACID compliance'],
    scale: '1M documents',
    constraints: 'Open source preferred'
  }
});

// Data analysis
api.post('/api/agents/task', {
  agentName: 'ORACLE',
  task: 'Analyze our user engagement data and identify patterns',
  context: {
    data: 'user_id, signup_date, tasks_completed, revenue',
    goal: 'find high-value user segment'
  }
});

// Trend forecasting
api.post('/api/agents/task', {
  agentName: 'ORACLE',
  task: 'Forecast AI adoption trends for next 2 years',
  context: {
    scope: 'enterprise automation',
    region: 'global',
    focus: ['growth rate', 'key drivers', 'risks']
  }
});
```

**Output:**
- Research reports
- Competitive analysis
- Technology evaluations
- Market opportunity assessments
- Data analysis and insights
- Trend forecasts
- Risk assessments
- Decision recommendations

**Skills (100+):**
- Market research
- Competitive analysis
- Technology evaluation
- Data analysis
- Trend forecasting
- Pattern recognition
- Risk assessment
- Opportunity identification

---

## Parallel Agent Execution

Run multiple agents on the same project:

```javascript
// Concurrent execution
Promise.all([
  api.post('/api/agents/task', {
    agentName: 'NEXUS',
    task: 'Build REST API'
  }),
  api.post('/api/agents/task', {
    agentName: 'TURTLE',
    task: 'Design user interface'
  }),
  api.post('/api/agents/task', {
    agentName: 'PIKADON',
    task: 'Plan security review'
  }),
  api.post('/api/agents/task', {
    agentName: 'QUILL',
    task: 'Write documentation'
  })
]).then(results => {
  console.log('All agents completed:', results);
});
```

## Agent Communication

Use SHADDAI to coordinate between agents:

```javascript
api.post('/api/agents/task', {
  agentName: 'SHADDAI',
  task: 'Coordinate the build of a user management system',
  context: {
    components: {
      api: { agent: 'NEXUS', task: 'Build user API' },
      ui: { agent: 'TURTLE', task: 'Design user dashboard' },
      security: { agent: 'PIKADON', task: 'Review security' },
      docs: { agent: 'QUILL', task: 'Write documentation' }
    },
    timeline: '1 week',
    dependencies: {
      'ui': ['api'],
      'docs': ['api', 'ui'],
      'security': ['api']
    }
  }
});
```

---

**For full API examples, see [API Integration Guide](API_INTEGRATION_GUIDE.md)**

Last Updated: 2026-05-13
