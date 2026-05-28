/**
 * AGENT INVOKER
 * Calls local agents to perform work on the SHADDAI production build
 * Connects to agents running on ports 8000-8008
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class AgentInvoker {
  constructor() {
    this.agents = {
      SHADDAI: { name: 'SHADDAI', port: 8000, role: 'Supreme Orchestrator' },
      NEXUS: { name: 'NEXUS', port: 8003, role: 'Technical Architect' },
      TURTLE: { name: 'TURTLE', port: 8004, role: 'UI/UX & Creative' },
      PIKADON: { name: 'PIKADON', port: 8008, role: 'Security & Compliance' },
      QUILL: { name: 'QUILL', port: 8005, role: 'Writing & Communication' },
      ZEROX: { name: 'ZEROX', port: 8001, role: 'Wealth & Revenue Engine' },
      ORACLE: { name: 'ORACLE', port: 8002, role: 'Research & Intelligence' }
    };

    this.reviewDir = path.join(__dirname, '../docs/AGENT-REVIEWS');
    this.ensureReviewDir();
  }

  ensureReviewDir() {
    if (!fs.existsSync(this.reviewDir)) {
      fs.mkdirSync(this.reviewDir, { recursive: true });
    }
  }

  /**
   * Call an agent via HTTP
   */
  async callAgent(agentName, task) {
    return new Promise((resolve, reject) => {
      const agent = this.agents[agentName];
      if (!agent) {
        return reject(new Error(`Unknown agent: ${agentName}`));
      }

      const payload = JSON.stringify({
        role: agent.role,
        task: task,
        timestamp: new Date().toISOString()
      });

      const options = {
        hostname: 'localhost',
        port: agent.port,
        path: '/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        },
        timeout: 120000 // 2 minutes
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Agent timeout: ${agentName}`));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Check if agent is online
   */
  async isAgentOnline(agentName) {
    return new Promise((resolve) => {
      const agent = this.agents[agentName];
      if (!agent) return resolve(false);

      const req = http.get(`http://localhost:${agent.port}/health`, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Invoke SHADDAI to coordinate the build
   */
  async invokeShaddaiCoordinate() {
    console.log('\n[1/7] SHADDAI - Coordinating production build...');

    const task = `
Review the complete SHADDAI v61 production build:
- Location: C:\Users\Brittany\SHADDAI-FINAL-BUILD
- Frontend: /public/index.html (1.6MB)
- Backend: /backend (13 files, real skill executor)
- Database: DatabaseReal persistent storage
- API: 16 REST endpoints

Create a comprehensive project coordination report including:
1. Architecture review
2. Component integration status
3. Deployment readiness assessment
4. Performance expectations
5. Security posture
6. Recommended next steps
7. Timeline for production launch

Be strategic and executive-focused.
`;

    try {
      const result = await this.callAgent('SHADDAI', task);
      this.saveReview('SHADDAI', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke NEXUS to review backend
   */
  async invokeNexusReviewBackend() {
    console.log('[2/7] NEXUS - Reviewing backend architecture...');

    const task = `
Review the SHADDAI backend production code:

Files to review:
- server-production.js (main Express server)
- skill-executor-real.js (real agent execution)
- skill-orchestrator.js (orchestration logic)
- database-real.js (persistent storage)
- auth-service.js (authentication)
- billing-service.js (billing system)

Analyze:
1. API design (16 endpoints)
2. Performance & scalability
3. Database schema & queries
4. Error handling & logging
5. Code quality & maintainability
6. Integration architecture
7. Optimization opportunities

Provide specific recommendations for:
- Performance improvements
- Scalability enhancements
- Code refactoring
- API optimization
- Database optimization

Focus on production-readiness.
`;

    try {
      const result = await this.callAgent('NEXUS', task);
      this.saveReview('NEXUS', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke TURTLE to review frontend
   */
  async invokeTurtleReviewUI() {
    console.log('[3/7] TURTLE - Reviewing frontend design...');

    const task = `
Review the SHADDAI frontend (index.html):

File: /public/index.html (1.6MB)
- Framework: Orbitron, JetBrains Mono, Share Tech Mono fonts
- Theme Support: cyber, ember, black, soft
- Color Scheme: Accent (#00e5a0), Secondary (#ff7b3d)
- Features: Agent dashboard, job posting, execution monitoring

Evaluate:
1. Visual design quality (is it professional, distinctive, memorable?)
2. Responsiveness (mobile, tablet, desktop)
3. Accessibility (WCAG AAA compliance)
4. User experience & navigation
5. Performance (load times, animations)
6. Brand consistency
7. Theme implementation

Specific feedback on:
- Typography choices
- Color palette & contrast
- Layout & spacing
- Interactive elements
- Dark mode implementation
- Mobile-first design

Suggest improvements for:
- Aesthetics
- Usability
- Accessibility
- Performance
- Brand impact

Be creative but professional.
`;

    try {
      const result = await this.callAgent('TURTLE', task);
      this.saveReview('TURTLE', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke PIKADON to review security
   */
  async invokePikadonSecurityAudit() {
    console.log('[4/7] PIKADON - Conducting security audit...');

    const task = `
Conduct comprehensive security audit of SHADDAI production build:

Code to review:
- server-production.js
- auth-service.js
- skill-executor-real.js
- All API endpoints

Security assessment:
1. OWASP Top 10 vulnerabilities
2. Authentication & authorization
3. Input validation & sanitization
4. JWT token handling
5. CORS configuration
6. SQL injection prevention
7. XSS protection
8. CSRF protection
9. Rate limiting
10. Secret management

Specific checks:
- Is authentication properly implemented?
- Are all inputs validated?
- Are API endpoints secured?
- Is error handling safe (no info leakage)?
- Are secrets protected?
- Is CORS properly configured?
- Are there SQL injection risks?
- Are there XSS vulnerabilities?
- Is JWT implementation secure?
- Are there privilege escalation risks?

Provide:
1. List of vulnerabilities (severity levels)
2. Specific code locations
3. Detailed remediation steps
4. Security best practices
5. Compliance recommendations (GDPR, CCPA)

Focus on production safety & compliance.
`;

    try {
      const result = await this.callAgent('PIKADON', task);
      this.saveReview('PIKADON', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke QUILL to review documentation
   */
  async invokeQuillReviewDocs() {
    console.log('[5/7] QUILL - Reviewing documentation...');

    const task = `
Review and improve SHADDAI documentation:

Files to review:
- README.md (main guide)
- API_INTEGRATION_GUIDE.md (API documentation)
- START-SERVER scripts (setup instructions)
- package.json (dependencies)

Evaluation:
1. Clarity & completeness
2. Accuracy of instructions
3. Code examples (do they work?)
4. Accessibility for different skill levels
5. Consistency in terminology
6. Organization & structure
7. Visual formatting
8. Missing sections

Specific tasks:
1. Ensure all instructions are step-by-step and testable
2. Add troubleshooting section
3. Add architecture diagrams (text-based)
4. Add more real-world examples
5. Improve API documentation clarity
6. Add quick-start guide
7. Add FAQ section
8. Verify all commands work
9. Add deployment guide
10. Add monitoring/debugging tips

Provide:
- Line-by-line feedback
- Specific corrections
- New sections to add
- Examples to improve
- Structure suggestions

Target audience: developers of all skill levels
`;

    try {
      const result = await this.callAgent('QUILL', task);
      this.saveReview('QUILL', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke ZEROX to create business strategy
   */
  async invokeZeroxBusinessStrategy() {
    console.log('[6/7] ZEROX - Developing business strategy...');

    const task = `
Create comprehensive business & monetization strategy for SHADDAI marketplace:

Platform overview:
- AI Agent Marketplace
- 7 specialized agents (NEXUS, TURTLE, PIKADON, QUILL, ZEROX, ORACLE, SHADDAI)
- Real work execution & code generation
- Skill-based task management
- Subscription-based revenue

Business planning:
1. Pricing Tiers
   - Free: What features?
   - Pro: What's included? Price point?
   - Enterprise: What SLA? Custom pricing?

2. Revenue Model
   - Subscription + commission?
   - Usage-based pricing?
   - Pay-per-skill?
   - Marketplace takerate?

3. Unit Economics
   - Customer Acquisition Cost (CAC)
   - Lifetime Value (LTV)
   - Break-even point
   - Gross margin

4. Growth Strategy
   - Target customer segments
   - Marketing channels
   - Partner integrations
   - Expansion plans

5. Monetization Opportunities
   - Skill marketplace commission
   - Premium features
   - API access
   - White-label licensing
   - Enterprise support

Provide:
- Recommended pricing tiers with rationale
- Revenue projections (Year 1, 2, 3)
- Unit economics analysis
- Customer segments & TAM
- Go-to-market strategy
- Risk analysis & mitigation
- Competitive positioning
- KPIs to track

Make it realistic and ambitious.
`;

    try {
      const result = await this.callAgent('ZEROX', task);
      this.saveReview('ZEROX', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Invoke ORACLE to research market
   */
  async invokeOracleMarketResearch() {
    console.log('[7/7] ORACLE - Conducting market research...');

    const task = `
Conduct market research for SHADDAI AI Agent Marketplace:

Research areas:
1. Competitive Landscape
   - Direct competitors (Salesforce agents, Make.com, Zapier)
   - Indirect competitors (ChatGPT plugins, Claude API, etc.)
   - Market gaps & opportunities

2. Market Trends
   - AI agent adoption rates
   - Workflow automation growth
   - No-code/low-code adoption
   - Enterprise automation spending

3. Customer Needs
   - What problems does SHADDAI solve?
   - Who are the target users?
   - What are their pain points?
   - What would they pay for?

4. Technology Trends
   - LLM capabilities evolution
   - Agent framework maturity
   - Marketplace platform trends
   - Integration patterns

5. Strategic Opportunities
   - Underdeveloped market segments
   - Emerging use cases
   - Partnership opportunities
   - Potential acquisitions by larger players

6. Threats & Risks
   - Big tech competition
   - Open source alternatives
   - Technical risks
   - Regulatory changes

Provide:
- Market size estimate (TAM, SAM, SOM)
- Growth projections
- Key trends analysis
- Competitor comparison matrix
- Strengths vs. competitors
- Market positioning recommendations
- Feature prioritization based on market demand
- Timeline for market evolution

Be data-driven and realistic.
`;

    try {
      const result = await this.callAgent('ORACLE', task);
      this.saveReview('ORACLE', result);
      return result;
    } catch (error) {
      console.error('  ✗ Error:', error.message);
      return { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Save review to file
   */
  saveReview(agentName, review) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${agentName}-REVIEW-${timestamp}.md`;
    const filepath = path.join(this.reviewDir, filename);

    const content = `# ${agentName} Review
**Timestamp:** ${new Date().toISOString()}

## Review Content
${JSON.stringify(review, null, 2)}
`;

    fs.writeFileSync(filepath, content);
    console.log(`  ✓ Review saved to: ${filename}`);
  }

  /**
   * Run all agent reviews
   */
  async runFullReview() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  FULL AGENT COUNCIL REVIEW                            ║');
    console.log('║  Invoking 7 Agents to Review Production Build         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Check which agents are online
    console.log('🔍 Checking agent availability...\n');
    const availability = {};
    for (const [name, agent] of Object.entries(this.agents)) {
      const online = await this.isAgentOnline(name);
      availability[name] = online;
      const status = online ? '✓ ONLINE' : '✗ offline';
      console.log(`  ${status} - ${name} (port ${agent.port})`);
    }

    const onlineCount = Object.values(availability).filter(v => v).length;
    console.log(`\n${onlineCount}/7 agents online\n`);

    if (onlineCount === 0) {
      console.log('⚠️  No agents running. Start them with: python agent_wrapper.py --all');
      return;
    }

    // Run reviews for online agents
    const results = {};

    if (availability.SHADDAI) results.shaddai = await this.invokeShadda

iCoordinate();
    if (availability.NEXUS) results.nexus = await this.invokeNexusReviewBackend();
    if (availability.TURTLE) results.turtle = await this.invokeTurtleReviewUI();
    if (availability.PIKADON) results.pikadon = await this.invokePikadonSecurityAudit();
    if (availability.QUILL) results.quill = await this.invokeQuillReviewDocs();
    if (availability.ZEROX) results.zerox = await this.invokeZeroxBusinessStrategy();
    if (availability.ORACLE) results.oracle = await this.invokeOracleMarketResearch();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  REVIEW COMPLETE                                       ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const successCount = Object.values(results).filter(r => r.status === 'SUCCESS').length;
    console.log(`✓ ${successCount} agents completed reviews`);
    console.log(`📁 Reviews saved to: ${this.reviewDir}`);
  }
}

// Run if called directly
if (require.main === module) {
  const invoker = new AgentInvoker();
  invoker.runFullReview().catch(console.error);
}

module.exports = AgentInvoker;
