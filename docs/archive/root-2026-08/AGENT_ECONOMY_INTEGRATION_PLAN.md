# SHADDAI Agent Economy Integration Plan
## Seamless Multi-Provider Payments × Agent Task Execution × 3D Bodies

**Status:** In Progress | **Complexity:** VERY HIGH | **Timeline:** Multi-phase

---

## 🎯 Vision

Create a **fully integrated agent marketplace** where:
- Users forge agents with **3D bodies** (Meshy API)
- Agents execute **monetized tasks** (tool invocations, workflows, services)
- **Payments flow seamlessly** across multiple providers (Stripe, Moon Pay, Paybox, Robinhood, Cash App)
- **Pro tier users** unlock advanced task execution + agent monetization
- **2D game** integrates as discovery/engagement layer
- **Dashboard** orchestrates the entire economy

---

## 📋 Component Breakdown

### Phase 1: Payment Provider Integration (IMMEDIATE)
**Goal:** Wire up Paybox, Robinhood, Cash App as payment channels alongside Stripe + Moon Pay

**What Exists:**
- ✅ Stripe integration (billing-routes.js, billing-service.js)
- ✅ Moon Pay skeleton (billing-routes.js, moonpay-agent.js)
- ✅ Tier system (free/builder/pro/alpha)
- ✅ Credit ledger (transactions.json)

**What's Missing:**
- ❌ Paybox API integration (URGENT)
- ❌ Robinhood API integration
- ❌ Cash App API integration (via Square/peer payments)
- ❌ Provider abstraction layer (unified interface)
- ❌ Webhook handlers for async confirmations

**Files to Create/Modify:**
```
backend/
  payment-providers.js          # Abstract provider interface + registry
  paybox-provider.js            # Paybox implementation
  robinhood-provider.js         # Robinhood implementation
  cashapp-provider.js           # Cash App (Square) implementation
  billing-routes.js             # Wire new providers to /api/billing/pay
  server-production.js          # Register payment webhooks
```

**Implementation:**
```javascript
// payment-providers.js — unified interface
class PaymentProvider {
  async charge(userId, amount, metadata) { /* override */ }
  async refund(transactionId) { /* override */ }
  async getBalance(userId) { /* override */ }
  async onWebhook(payload) { /* verify sig + handle */ }
}

// billing-routes.js
POST /api/billing/pay
  body: { provider: 'paybox'|'robinhood'|'cashapp', amount, metadata }
  → paymentRegistry.get(provider).charge(...)
  → save to ledger → return { status, transactionId }
```

---

### Phase 2: Agent 3D Body Generation (PARALLEL)
**Goal:** Agents forge/customize 3D bodies via Meshy API

**What Exists:**
- ✅ Agent invocation engine (agent-invocation.js, agent-engine.js)
- ✅ Agent metadata (custom_agents.json, agent-avatars.json)
- ✅ Agent room system (agent-room-service.js)
- ✅ 70+ tools registry

**What's Missing:**
- ❌ Meshy API integration (3D model generation)
- ❌ Body customization UI on dashboard
- ❌ Body asset storage + retrieval
- ❌ Integration with 2D/3D world rendering

**Files to Create/Modify:**
```
backend/
  meshy-service.js              # Meshy API client + caching
  agent-body-routes.js          # POST/GET /api/agent/{id}/body
  services/agent-customize.js   # Forge UI backend logic
public/
  agent-forge.html              # Customize agent appearance (3D preview)
  assets/agent-bodies/          # Generated GLB files
```

**API Design:**
```
POST /api/agent/{id}/body/generate
  body: { style: 'humanoid'|'creature'|'mech', colors, features }
  → meshy.generateModel(...)
  → cache GLB to backend/data/agent-bodies/
  → return { url, meshyJobId, status }

GET /api/agent/{id}/body
  → return { url, meshyJobId, status, preview }
```

---

### Phase 3: Task Marketplace + Execution (CORE)
**Goal:** Agents execute paid tasks; payments route through chosen provider

**What Exists:**
- ✅ Job board system (agent-engine.js: list_open_jobs, bid_on_job, complete_job)
- ✅ Agent invocation (agent-invocation.js: execute skills)
- ✅ Credit ledger (transactions.json)
- ✅ Tool registry (70+ tools in agent-engine.js)

**What's Missing:**
- ❌ Task execution with payment escrow
- ❌ Pro tier task execution gating
- ❌ Agent auto-execution (scheduled/triggered tasks)
- ❌ Payment on completion flow
- ❌ Dispute/refund handling

**Files to Create/Modify:**
```
backend/
  task-marketplace.js           # Task CRUD + lifecycle
  task-execution.js             # Execute task → collect payment
  task-routes.js                # POST/GET /api/tasks/*
  billing-routes.js             # Add /api/billing/task/{id}/complete
```

**Flow:**
```
User posts task (e.g., "fetch 10 crypto prices, format as CSV, pay $0.50")
  ↓
Agent bids via agent-engine.js:bid_on_job
  ↓
User accepts bid
  ↓
Agent executes: invoke tools (fetch_price × 10) → format
  ↓
On completion: /api/billing/task/{id}/complete
  → verify Pro tier if task cost > $0.10
  → charge user via paymentRegistry
  → credit agent (minus platform fee)
  → both get receipt
```

---

### Phase 4: Pro Tier Task Execution Gating (SAFEGUARD)
**Goal:** Only Pro users can have agents execute high-value tasks

**What Exists:**
- ✅ Tier system (free/builder/pro/alpha)
- ✅ Subscription check in billing-service.js

**What's Missing:**
- ❌ Gating logic for task execution
- ❌ Task cost tier mapping
- ❌ Pro feature unlock UI

**Files to Modify:**
```
backend/
  task-execution.js             # checkTierPermission(user, taskCost)
  billing-service.js            # Add checkCanExecuteTask(userId, cost)
```

**Logic:**
```
Free: max task $0 (agents can't execute paid tasks)
Builder: max task $1 / day, max 5 tasks/month
Pro: unlimited
Alpha: unlimited + 10% revenue share

if (task.cost > 0 && user.tier === 'free') → reject
if (task.cost > tier.maxPerTask) → reject
if (monthlySpent + task.cost > tier.monthlyBudget) → reject
```

---

### Phase 5: Dashboard UX Integration (USER-FACING)
**Goal:** Seamless flow: forge agent → customize body → browse tasks → execute → payment → earnings

**What Exists:**
- ✅ Main dashboard (public/index.html)
- ✅ Forge tab (agent creation UI)
- ✅ Agent rooms (agent-room-routes.js)

**What's Missing:**
- ❌ Agent customization panel (3D body preview)
- ❌ Task marketplace view (filterable task list)
- ❌ Payment method selection during task completion
- ❌ Earnings dashboard (agent revenue breakdown)
- ❌ Pro tier upgrade flow (inline)

**Files to Modify:**
```
public/
  index.html                    # Add tabs: Marketplace, Earnings, Pro Upgrade
  dashboard-sections/
    marketplace.html            # Task browser + agent bid UI
    earnings.html               # Revenue breakdown by task/source
    agent-customize.html        # 3D body preview + Meshy integration
  css/dashboard.css             # Theme new sections
```

---

### Phase 6: 2D Game Integration (ENGAGEMENT)
**Goal:** Game discovers + rewards agents; tasks as quests

**What Exists:**
- ✅ game.html (Pixel City, agent characters)
- ✅ Arcade (games directory)

**What's Needed:**
- ❌ Quest board in game (task discovery entry point)
- ❌ Agent gallery/marketplace accessible from game
- ❌ Earnings notifications in-game
- ❌ Pro tier rewards/perks display

**Light Touch:** Link game quest board → /dashboard?view=marketplace

---

## 🔑 Key APIs to Build

### 1. Unified Payment API
```
POST /api/billing/pay
  { provider, amount, metadata, taskId? }
  → [paybox|robinhood|cashapp|stripe].charge(...)

POST /api/billing/provider/{name}/webhook
  → verify signature → mark transaction confirmed
```

### 2. Meshy Integration
```
POST /api/agent/{id}/body/generate
  { style, colors, features }
  → Meshy + cache

GET /api/agent/{id}/body
  → return GLB URL + cache status
```

### 3. Task Execution + Payment
```
POST /api/tasks/{id}/execute
  { agentId }
  → checkTierPermission → invoke agent → on success: charge user

POST /api/billing/task/{id}/complete
  { transactionId, agentId, userId }
  → credit both parties → emit receipt
```

### 4. Pro Tier Unlocks
```
GET /api/billing/tier-check
  { taskCost? }
  → { canExecute, reason?, upgradeUrl? }
```

---

## 📊 Data Schema Additions

### tasks.json
```json
{
  "id": "task-123",
  "title": "Fetch 10 crypto prices",
  "cost": 0.50,
  "acceptedBy": "agent-id",
  "status": "pending|executing|completed|disputed",
  "tools": ["fetch_price", "format_csv"],
  "createdBy": "user-id",
  "createdAt": 1724...,
  "completedAt": 1724...,
  "transactionId": "tx-456"
}
```

### transactions.json (extended)
```json
{
  "id": "tx-456",
  "type": "task_execution",
  "userId": "user-id",
  "agentId": "agent-id",
  "amount": 0.50,
  "provider": "paybox",
  "providerTxId": "paybox-txid",
  "status": "pending|confirmed|refunded",
  "createdAt": 1724...
}
```

### agent-bodies.json (new)
```json
{
  "agent-id": {
    "meshyJobId": "job-123",
    "status": "generating|ready|error",
    "glbUrl": "/api/agent/agent-id/body.glb",
    "customizations": { style, colors, features },
    "generatedAt": 1724...
  }
}
```

---

## 🎬 Execution Sequence

### Sprint 1: Payment Providers (Days 1-2)
1. Create payment-providers.js abstraction
2. Implement Paybox, Robinhood, Cash App providers
3. Wire POST /api/billing/pay → pick provider → charge
4. Test with dummy payments (if possible)

### Sprint 2: Agent Bodies (Days 3-4)
1. Integrate Meshy API
2. Build body customization UI on dashboard
3. Cache generated GLBs
4. Link agent bodies to room/game rendering

### Sprint 3: Task Execution (Days 5-6)
1. Extend job board with cost + Pro gating
2. Build /api/tasks/* CRUD
3. Wire task completion → payment collection
4. Test end-to-end: post task → agent bids → execute → pay

### Sprint 4: Pro Tier Gating (Day 7)
1. Implement checkTierPermission logic
2. Add inline upgrade prompt on dashboard
3. Test gating: free user can't execute $5 task

### Sprint 5: Dashboard UX (Day 8-9)
1. Add Marketplace tab (task browser)
2. Add Earnings tab (revenue dashboard)
3. Add Pro Upgrade CTA (multiple entry points)
4. Polish payment method selection UX

### Sprint 6: 2D Game Integration (Day 10)
1. Add quest board in game.html
2. Link to /dashboard?view=marketplace
3. Add earnings notification widget

---

## 🔐 Security Checklist

- [ ] Payment provider keys in .env (never hardcoded)
- [ ] Webhook signature verification (all providers)
- [ ] CSRF tokens on task/payment forms
- [ ] Rate limit /api/billing/pay (prevent abuse)
- [ ] Escrow logic (don't release agent payment until user confirms)
- [ ] Audit log all transactions (immutable append)
- [ ] PCI compliance (Stripe handles PCI; others use tokenization)
- [ ] Pro tier verification server-side before task execution

---

## 🚀 Success Metrics

- Users can forge agents → customize 3D body → execute paid tasks
- Payments flow through any of 5 providers (Stripe, Moon Pay, Paybox, Robinhood, Cash App)
- Pro tier users have unlimited task execution; free users blocked on cost > $0
- Agent earnings dashboard shows revenue by source
- 2D game integrates as discovery layer
- No failed payment webhook = transaction lost (logging + retry)

---

## 📝 Next Action

**IMMEDIATE:** Start Sprint 1 — build payment provider abstraction + Paybox integration.

**Blockers:**
- Paybox API key/sandbox endpoint (need from user)
- Robinhood API access (may require partnership approval)
- Cash App (Square) API key

**If keys unavailable:** Use mock providers that log to console; unblock UI work.

---

## 📚 Reference Docs

- [Paybox API](https://paybox.money/kz/business/merchants/) — assume standard REST
- [Robinhood API](https://robinhood.com/us/en/support/articles/about-the-robinhood-api/) — undocumented; may need reverse-eng or official SDK
- [Square Cash (peer payments)](https://developer.squareup.com/) — Cash App payments via Cash for Business
- [Meshy API](https://www.meshy.ai/docs) — 3D model generation, async jobs
- Existing: Stripe (secret key in .env), Moon Pay (stubs)

---

**OWNER:** YOU (other terminal: TG bot + PNL generation)

**Last Updated:** 2026-08-21
