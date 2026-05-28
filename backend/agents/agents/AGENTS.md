# SHADDAI Agent Council — Complete Agent Registry

Your team of 7 specialized autonomous agents. Each has specific expertise. Call them directly or let SHADDAI coordinate.

## Quick Reference

| Agent | Specialty | When to use | Tools | Invoke |
|-------|-----------|------------|-------|--------|
| **SHADDAI** | Strategy, orchestration | Big decisions, quality gates, coordination | Orchestrate, broadcast, review | "SHADDAI, should we..." |
| **NEXUS** | Backend, APIs, databases | Code, architecture, infrastructure | Build API, design schema, profile | "NEXUS, build the..." |
| **ZEROX** | Business, revenue, pricing | Revenue model, pricing, unit economics | Model pricing, forecast revenue, track costs | "ZEROX, what's the ROI..." |
| **ORACLE** | Research, data, trends | Market research, competitive analysis, insights | Research market, analyze data, detect trends | "ORACLE, research..." |
| **TURTLE** | Design, UX, frontend | UI/UX, dashboards, visual polish | Design UI, build frontend, create animation | "TURTLE, design..." |
| **QUILL** | Writing, documentation | Copy, docs, guides, error messages | Write docs, write copy, review clarity | "QUILL, write..." |
| **PIKADON** | Security, compliance | Security reviews, threat models, audit logs | Audit security, threat model, design access | "PIKADON, review..." |

---

## Agent Details

### SHADDAI — Supreme Orchestrator
**Icon:** 👑  
**Personality:** Strategic, decisive, pragmatic  
**Works best on:** High-level decisions, strategy, coordination

**Strengths:**
- Makes final calls when uncertain
- Coordinates multi-agent workflows
- Reviews overall quality
- Sets priorities
- Navigates tradeoffs

**Limitations:**
- Defers to specialists for technical details
- Needs team input for best decisions
- Not a coder/designer/writer

**Services:**
- Orchestrate all agents on task
- Make final decision on anything
- Review agent work for quality
- Run multi-agent workflows
- Broadcast to all agents

**Example usage:**
```
"SHADDAI, coordinate all agents:
- NEXUS: API design
- TURTLE: UI mockup
- QUILL: documentation
- PIKADON: security review

Timeline: 3 days, Budget: $2000. Proceed?"
```

---

### NEXUS — Technical Architect
**Icon:** ⚙️  
**Personality:** Pragmatic, thorough, performance-focused  
**Works best on:** Code, architecture, infrastructure

**Strengths:**
- Designs scalable systems
- Writes production code
- Reviews for correctness
- Optimizes performance
- Mentors junior engineers

**Limitations:**
- Focuses on code, not business value
- Doesn't write frontend
- Not a security expert

**Services:**
- Generate backend code
- Design REST APIs
- Design database schemas
- Optimize performance
- Code review
- Threat check infrastructure

**Example usage:**
```
"NEXUS, design a real-time notification system:
- 10K concurrent users
- <500ms latency required
- Persist 24 hours
- Support webhooks

What's the architecture?"
```

---

### ZEROX — Wealth & Revenue Engine
**Icon:** 💰  
**Personality:** Growth-focused, analytical, pragmatic  
**Works best on:** Revenue, pricing, unit economics

**Strengths:**
- Models revenue accurately
- Designs pricing strategies
- Calculates unit economics
- Optimizes for profitability
- Understands market dynamics

**Limitations:**
- Not a developer
- Focuses on money, not product value
- Can't build technical systems

**Services:**
- Model pricing strategies
- Forecast revenue
- Analyze unit economics
- Calculate CAC/LTV/payback
- Design subscription tiers
- Optimize billing

**Example usage:**
```
"ZEROX, we're planning Pro tier:
- $99/month
- 100 API calls/day
- 5% conversion from 100K users
- What's the ARR? Is it viable?"
```

---

### ORACLE — Research & Intelligence
**Icon:** 🔮  
**Personality:** Curious, thorough, analytical  
**Works best on:** Research, data analysis, insights

**Strengths:**
- Conducts thorough research
- Spots trends and patterns
- Provides evidence-based insights
- Analyzes competitor landscape
- Questions assumptions

**Limitations:**
- Doesn't implement solutions
- Can only work with available data
- Insights take time to develop

**Services:**
- Market research
- Competitive analysis
- Trend analysis
- Data analysis and insights
- Anomaly detection
- Monitoring design

**Example usage:**
```
"ORACLE, analyze our churn:
- 3% monthly churn
- Users say: slow performance, missing features
- Competitors: 2% churn

Root cause? What should we fix first?"
```

---

### TURTLE — UI/UX & Creative
**Icon:** 🎨  
**Personality:** Aesthetic, user-focused, perfectionist  
**Works best on:** Design, UX, frontend

**Strengths:**
- Creates beautiful UIs
- Designs intuitive flows
- Writes clean frontend code
- Optimizes for user delight
- Maintains brand consistency

**Limitations:**
- Can't design backend
- Not a business strategist
- Limited to visual/UX aspects

**Services:**
- Design UI components
- Build frontend code (HTML/CSS/JS)
- Design animations and interactions
- Create dashboards
- UX review and improvement
- Accessibility audit

**Example usage:**
```
"TURTLE, design a payment success page:
- User just upgraded to Pro
- Show: confirmation, what's next, support
- Celebratory but professional
- Mobile + desktop

What's the design?"
```

---

### QUILL — Writing & Communication
**Icon:** ✍️  
**Personality:** Detail-focused, user-empathetic, clarity-focused  
**Works best on:** Writing, docs, communication

**Strengths:**
- Writes clear, engaging copy
- Creates excellent documentation
- Optimizes error messages
- Explains complex ideas simply
- Advocates for user clarity

**Limitations:**
- Can't code or design UI
- Can't make technical decisions
- Only writes, doesn't implement

**Services:**
- Write marketing copy
- Write technical documentation
- Create user guides
- Write error messages
- Write API docs
- Review for clarity

**Example usage:**
```
"QUILL, write for new users:
- Feature: Real-time sync
- Users don't know what that means
- Create: 1) error message, 2) help text, 3) guide

Make it clear and friendly."
```

---

### PIKADON — Security & Compliance
**Icon:** 🔐  
**Personality:** Defensive, thorough, risk-aware  
**Works best on:** Security, compliance, threat modeling

**Strengths:**
- Identifies vulnerabilities
- Designs secure systems
- Models threats
- Reviews access control
- Ensures compliance

**Limitations:**
- Conservative (slows down development)
- Can't implement features
- Only reviews, doesn't code

**Services:**
- Security code review
- Vulnerability assessment
- Threat modeling
- Access control design
- Audit logging design
- Compliance review
- Incident response planning

**Example usage:**
```
"PIKADON, threat model payment system:
- Users send credit cards
- System: API → processor → database
- Risks: card theft, fraud, PII leak

How to secure? What audit? What if breached?"
```

---

## How to Work With Agents

### Single Agent Task
```
Tell one agent to do something:
"NEXUS, build the payment API with Stripe integration"
```

### Multi-Agent Task
```
Assign tasks to multiple agents:
"NEXUS, build the API. PIKADON, review for security. QUILL, write docs."
```

### Coordinated Task (SHADDAI leads)
```
Let SHADDAI coordinate the team:
"All agents, I need a complete solution. SHADDAI coordinates."
```

### Agent Review
```
Get feedback from multiple angles:
"TURTLE, design a login page. All agents, review for quality."
```

### Make a Decision
```
Ask SHADDAI to make the call:
"SHADDAI, should we use Postgres or MongoDB? NEXUS has strong opinions."
```

---

## Agent Communication

**Agent-to-Agent:**
Agents can message each other, debate, reach consensus:
```
ZEROX: "We should charge $99/month for Pro"
PIKADON: "We need to audit payment handling first"
SHADDAI: "PIKADON, how long? ZEROX, what's the revenue impact?"
```

**Negotiation:**
Two agents can negotiate and reach agreement:
```
NEXUS: "I can build this in 2 weeks"
TURTLE: "I need 1 week for design first"
→ Agreement: Design week 1, implementation weeks 2-3
```

**Consensus Voting:**
All agents vote on major decisions:
```
Proposal: "Launch Pro tier at $99/month"
SHADDAI: YES
NEXUS: YES (if payment system reviewed)
ZEROX: YES
ORACLE: YES (market supports it)
TURTLE: YES
QUILL: YES
PIKADON: YES (with security checklist)
→ Consensus: APPROVED with conditions
```

---

## Using Agents in Your Code

### JavaScript/Node.js
```javascript
const agents = {
  SHADDAI: new Agent('SHADDAI'),
  NEXUS: new Agent('NEXUS'),
  // ... etc
};

// Call an agent
const result = await agents.NEXUS.execute('Build payment API');

// Coordinate multiple agents
const results = await orchestrator.coordinate('Build complete solution', [
  { agent: 'NEXUS', task: 'Design API' },
  { agent: 'PIKADON', task: 'Security review' },
  { agent: 'TURTLE', task: 'Design dashboard' }
]);
```

### HTTP API
```bash
# Call specific agent
curl -X POST http://localhost:3000/api/agents/task \
  -d '{"agentName": "NEXUS", "task": "Build payment API"}'

# Coordinate agents
curl -X POST http://localhost:3000/api/agents/coordinate \
  -d '{
    "agents": ["NEXUS", "PIKADON", "TURTLE"],
    "tasks": ["Design API", "Security review", "Design UI"]
  }'
```

---

## Performance Expectations

### Response Times
- **Quick decisions:** < 30 seconds
- **Code generation:** 1-5 minutes
- **Full reviews:** 5-15 minutes
- **Complex analysis:** 5-30 minutes

### Costs (approximate)
- **Simple task:** $0.10-1.00
- **Code generation:** $1.00-5.00
- **Full review:** $2.00-10.00
- **Complex analysis:** $5.00-20.00

### Success Rates
- **Task completion:** 95%+
- **Code correctness:** 98%+
- **Security issues caught:** 90%+
- **Design satisfaction:** 85%+

---

## Tips for Best Results

1. **Be specific:** "Design login page" is vague. "Design login page with 2FA, show password requirements, mobile first" is better.

2. **Provide context:** Give agents what they need. "User survey shows 50% churn due to slow performance. What to optimize?" helps ORACLE provide insights.

3. **Use specialists:** Don't ask TURTLE to write security code. Ask NEXUS. Don't ask ZEROX to design UI. Ask TURTLE.

4. **Iterate:** First pass is rarely perfect. Provide feedback. "NEXUS, that API is too complex. Simplify it." Then iterate.

5. **Combine agents:** Best solutions come from combining perspectives. "ZEROX, what should we charge? ORACLE, research pricing. TURTLE, design the upgrade flow."

6. **Let SHADDAI coordinate:** For big projects, give SHADDAI the goal and let them coordinate the team.

---

## Common Workflows

### Launch New Feature
1. **ORACLE:** Research similar features
2. **TURTLE:** Design the interface
3. **NEXUS:** Design the API
4. **ZEROX:** Model the pricing impact
5. **PIKADON:** Security and compliance review
6. **QUILL:** Write documentation
7. **SHADDAI:** Final approval

### Fix Security Issue
1. **PIKADON:** Identify vulnerability
2. **NEXUS:** Implement fix
3. **PIKADON:** Verify fix
4. **QUILL:** Write security advisory
5. **SHADDAI:** Approve release

### Optimize Performance
1. **ORACLE:** Analyze performance data
2. **NEXUS:** Identify bottleneck and optimize
3. **TURTLE:** Improve UI responsiveness
4. **PIKADON:** Verify no security impact
5. **SHADDAI:** Approve changes

### Design Pricing Strategy
1. **ORACLE:** Research market and competitors
2. **ZEROX:** Model different price points
3. **QUILL:** Write tier descriptions
4. **TURTLE:** Design pricing page
5. **PIKADON:** Ensure compliance
6. **SHADDAI:** Final decision

---

## Reaching Agents

**HTTP API:** `http://localhost:3000/api/agents/[name]`  
**WebSocket:** `wss://localhost:3000` (real-time chat)  
**CLI:** `agent.bat [agent-name] [prompt]`  
**Direct invoke:** `[AGENT_NAME], [task]`

---

**The 7-agent team is your competitive advantage. Use them well!**

Questions? Need an agent for a specific task? Ask SHADDAI to coordinate.
