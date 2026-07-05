// shaddai-kb.js — Local, self-contained knowledge base for the SHADDAI agent (Supreme Orchestrator / Strategy).
// No network, no APIs, no dependencies. Pure evergreen business, product, growth, and leadership knowledge.
// Contract: { agent, domains, entries:[{keys,title,text}], lookup(query) }

const entries = [
  // ---------------------------------------------------------------- BUSINESS MODELS
  {
    keys: ['saas', 'software as a service', 'saas model', 'cloud software'],
    title: 'SaaS (Software as a Service)',
    text: 'SaaS delivers software over the internet on a recurring subscription rather than a one-time license, so the vendor hosts, updates, and maintains it. The model produces predictable recurring revenue, high gross margins (often 70-85%), and continuous customer relationships. Success depends on low churn and expanding accounts over time, because acquisition costs are recovered only across many months. Key levers are retention, net revenue retention, and efficient go-to-market.'
  },
  {
    keys: ['subscription', 'recurring revenue', 'subscription model', 'annual plan', 'monthly plan'],
    title: 'Subscription Model',
    text: 'A subscription charges customers on a recurring cadence (monthly or annual) for ongoing access, converting one-time sales into predictable, compounding revenue. Annual plans improve cash flow and reduce churn but require larger upfront commitment, so many vendors discount them. The core discipline is retention: because revenue depends on customers staying, the product must deliver continuous value, and reducing churn is often more valuable than adding new customers.'
  },
  {
    keys: ['marketplace', 'two sided market', 'platform', 'network effects', 'liquidity'],
    title: 'Marketplaces',
    text: 'A marketplace connects two sides (buyers and sellers) and monetizes the transactions between them, without owning inventory. The central challenge is the chicken-and-egg cold start: neither side shows up without the other, so founders often subsidize or manually seed the constrained side first. Success is measured by liquidity (the probability a listing transacts quickly) and network effects, where more participants make the platform more valuable. Defensibility comes from liquidity and trust that are hard for competitors to replicate.'
  },
  {
    keys: ['take rate', 'commission', 'transaction fee', 'rake', 'platform fee'],
    title: 'Take Rate',
    text: 'Take rate is the percentage a marketplace keeps from each transaction (gross transaction value times take rate equals revenue). It must be high enough to build a real business but low enough that both sides prefer the platform to going direct or to a competitor. Typical take rates range widely (2-30%) depending on value added, frequency, and alternatives. Raising take rate too aggressively invites disintermediation, where users transact off-platform to avoid the fee.'
  },
  {
    keys: ['freemium', 'free tier', 'free plan', 'free to paid', 'upsell'],
    title: 'Freemium',
    text: 'Freemium offers a capable free tier to drive adoption and virality, then converts a fraction of users to paid plans for advanced features, higher limits, or team capabilities. It works when the product has low marginal cost to serve free users and a natural upgrade trigger (usage limits, collaboration, professional needs). Typical free-to-paid conversion is low (often 2-5%), so it requires huge top-of-funnel volume. The risk is giving away so much that few ever need to pay.'
  },
  {
    keys: ['usage based', 'usage based pricing', 'pay as you go', 'consumption', 'metered billing'],
    title: 'Usage-Based Pricing',
    text: 'Usage-based (consumption) pricing charges in proportion to what customers actually use (API calls, compute, seats, credits), aligning cost with value received. It lowers the barrier to start (pay for a little) and lets revenue expand naturally as customers grow, driving strong net revenue retention. Downsides are less predictable revenue and customer bill anxiety, so many vendors combine a base subscription with usage overages and spending caps or alerts.'
  },
  {
    keys: ['transactional', 'one time purchase', 'perpetual license', 'transactional revenue'],
    title: 'Transactional & One-Time Revenue',
    text: 'Transactional models earn revenue per purchase or per transaction rather than on a recurring basis, which is simple but requires constantly re-acquiring demand. Perpetual licenses sell software once with optional maintenance fees. These models can produce large upfront cash but lack the predictable compounding of subscriptions, so many companies layer on recurring services, support, or subscription tiers to smooth and grow revenue.'
  },
  {
    keys: ['unit economics', 'contribution margin', 'gross margin', 'cost to serve', 'per unit profit'],
    title: 'Unit Economics',
    text: 'Unit economics measure the profitability of a single customer or transaction: revenue per unit minus the direct (variable) costs to deliver it equals contribution margin. Healthy unit economics mean each customer generates more lifetime value than it costs to acquire and serve, so growth is profitable rather than value-destroying. Watch gross margin (revenue minus cost of goods sold) and cost-to-serve; if the core unit loses money, scaling only deepens losses.'
  },
  {
    keys: ['platform strategy', 'ecosystem', 'developer platform', 'api business', 'flywheel'],
    title: 'Platform & Ecosystem Strategy',
    text: 'A platform creates value by enabling third parties (developers, partners, sellers) to build on top of it, turning a product into an ecosystem. Ecosystems create a flywheel: more participants attract more users, which attracts more participants, compounding value and defensibility. The trade-off is control versus openness—too closed limits growth, too open risks quality and channel conflict. Platforms win by making others successful and taking a fair cut of the value created.'
  },

  // ---------------------------------------------------------------- METRICS
  {
    keys: ['mrr', 'arr', 'monthly recurring revenue', 'annual recurring revenue', 'recurring revenue metric'],
    title: 'MRR & ARR',
    text: 'MRR (Monthly Recurring Revenue) is the normalized, predictable subscription revenue expected each month; ARR (Annual Recurring Revenue) is MRR times 12. Track them as the heartbeat of a subscription business and decompose changes into new, expansion, contraction, and churned MRR to see what drives growth. Only count recurring revenue—exclude one-time fees—so the number reflects durable, forecastable income.'
  },
  {
    keys: ['churn', 'churn rate', 'customer churn', 'revenue churn', 'logo churn', 'attrition'],
    title: 'Churn',
    text: 'Churn is the rate at which customers (logo churn) or revenue (revenue churn) leave over a period. It compounds brutally: 5% monthly churn means losing nearly half your customers a year, capping growth no matter how fast you acquire. Revenue churn can be offset by expansion from remaining customers (net revenue retention). Reducing churn is usually the highest-leverage improvement because it raises lifetime value and makes acquisition spend pay back.'
  },
  {
    keys: ['ltv', 'lifetime value', 'customer lifetime value', 'clv'],
    title: 'LTV (Customer Lifetime Value)',
    text: 'LTV is the total gross profit you expect from a customer over their entire relationship. A common estimate is average revenue per account times gross margin divided by churn rate, so lower churn and higher margins directly increase LTV. LTV sets the ceiling on how much you can profitably spend to acquire a customer. Use gross-margin-based LTV, not raw revenue, to avoid overstating what a customer is truly worth.'
  },
  {
    keys: ['cac', 'customer acquisition cost', 'acquisition cost', 'blended cac'],
    title: 'CAC (Customer Acquisition Cost)',
    text: 'CAC is the fully-loaded cost to acquire one paying customer: total sales and marketing spend divided by new customers won in that period. Include salaries, ad spend, tools, and commissions for an honest number, and track by channel to reallocate budget to efficient sources. Blended CAC averages all channels; paid CAC isolates advertising. Rising CAC without rising LTV signals a growth-efficiency problem.'
  },
  {
    keys: ['ltv cac', 'ltv:cac', 'ltv to cac', 'ltv cac ratio', 'what is ltv cac'],
    title: 'LTV:CAC Ratio',
    text: 'The LTV:CAC ratio compares the lifetime value of a customer to the cost to acquire them, measuring acquisition efficiency and business health. A ratio around 3:1 is a common healthy benchmark: below ~1:1 you lose money on every customer, while much above 3:1 may mean you are under-investing in growth. Pair it with CAC payback period, because a great ratio still hurts if cash is tied up too long. Improve it by lowering CAC, raising LTV (retention, expansion, margin), or both.'
  },
  {
    keys: ['payback period', 'cac payback', 'payback', 'months to recover cac'],
    title: 'CAC Payback Period',
    text: 'CAC payback is how many months of gross-margin revenue it takes to recover the cost of acquiring a customer. Shorter is better because it frees cash to reinvest in growth; SaaS benchmarks are often under 12 months (great) to around 18 (acceptable). Long payback strains cash flow even with a healthy LTV:CAC ratio, forcing more funding. It directly governs how fast you can grow without running out of money.'
  },
  {
    keys: ['activation', 'activation rate', 'aha moment', 'onboarding', 'time to value'],
    title: 'Activation',
    text: 'Activation is the point a new user first experiences the product’s core value (the "aha moment"), and activation rate measures how many signups reach it. It is the hinge between acquisition and retention: users who activate stick around, those who do not churn quickly. Shorten time-to-value with focused onboarding that guides users to the key action fast. Improving activation often lifts every downstream metric.'
  },
  {
    keys: ['retention', 'retention rate', 'retention curve', 'cohort retention', 'net revenue retention', 'nrr'],
    title: 'Retention & Net Revenue Retention',
    text: 'Retention measures how many users or how much revenue you keep over time; plotting cohorts reveals whether the curve flattens (product-market fit) or decays to zero (a leaky bucket). Net Revenue Retention (NRR) tracks revenue from existing customers including expansion minus churn and contraction; above 100% means the base grows even with zero new customers, the hallmark of great SaaS. Retention is the foundation of durable growth because it compounds.'
  },
  {
    keys: ['nps', 'net promoter score', 'customer satisfaction', 'csat', 'promoters detractors'],
    title: 'NPS (Net Promoter Score)',
    text: 'NPS asks how likely customers are to recommend you (0-10) and subtracts the percentage of detractors (0-6) from promoters (9-10), yielding a score from -100 to +100. It is a simple, comparable pulse of customer loyalty and word-of-mouth potential. Treat it as a directional signal alongside behavioral data (retention, usage), not gospel, and always read the verbatim comments to learn why. Rising NPS often precedes organic growth.'
  },
  {
    keys: ['arpu', 'average revenue per user', 'arpa', 'revenue per account'],
    title: 'ARPU / ARPA',
    text: 'ARPU (Average Revenue Per User) or ARPA (per account) is total revenue divided by the number of users or accounts, showing how much each customer is worth on average. Rising ARPU from upsells, cross-sells, and tier upgrades expands revenue without new acquisition, improving unit economics. Segment ARPU by plan and cohort to spot which customers to pursue and where expansion opportunities lie.'
  },
  {
    keys: ['burn rate', 'runway', 'cash burn', 'net burn', 'default alive'],
    title: 'Burn Rate & Runway',
    text: 'Burn rate is how much cash a company spends beyond revenue each month; runway is cash on hand divided by net burn, i.e., months until you run out. A company is "default alive" if its current trajectory reaches profitability before running out, and "default dead" if not. Managing burn and extending runway buys time to hit milestones and raise on better terms. Always know your runway and the milestone the next raise requires.'
  },
  {
    keys: ['north star metric', 'north star', 'key metric', 'one metric that matters', 'okr metric'],
    title: 'North Star Metric',
    text: 'A North Star Metric is the single measure that best captures the core value customers get and predicts sustainable growth (e.g., nights booked, messages sent, weekly active teams). It aligns the whole company on outcomes rather than vanity numbers, and good ones are leading indicators of retention and revenue. Choose a metric that improves only when customers genuinely win, so gaming it also grows the business.'
  },

  // ---------------------------------------------------------------- PRODUCT
  {
    keys: ['mvp', 'minimum viable product', 'prototype', 'build measure learn', 'lean startup'],
    title: 'MVP (Minimum Viable Product)',
    text: 'An MVP is the smallest version of a product that delivers real value and lets you test the riskiest assumptions with real users, minimizing wasted effort. It is a learning tool inside the build-measure-learn loop, not a low-quality product—it should do one thing well. Ship it to validate demand and gather feedback before investing in scale. The goal is maximum validated learning per unit of effort.'
  },
  {
    keys: ['pmf', 'product market fit', 'product-market fit', 'demand', 'must have'],
    title: 'Product-Market Fit (PMF)',
    text: 'Product-market fit is the point where a product satisfies strong market demand—customers adopt, retain, refer, and pull the product from you faster than you can supply it. Signals include flattening retention curves, organic word-of-mouth, and users who would be "very disappointed" without you (the Sean Ellis 40% test). Before PMF, focus on finding it, not scaling; premature growth spending on a leaky product burns cash. PMF is the single most important early milestone.'
  },
  {
    keys: ['positioning', 'differentiation', 'value proposition', 'category', 'messaging'],
    title: 'Positioning',
    text: 'Positioning defines how customers perceive your product relative to alternatives: who it is for, what category it competes in, and why it is uniquely better for a specific segment. Strong positioning makes the value obvious and shortens sales cycles, while weak positioning forces buyers to figure it out themselves. Anchor to the best alternative your customers would otherwise use, then highlight the differentiated value only you deliver. Positioning shapes pricing, messaging, and roadmap.'
  },
  {
    keys: ['moat', 'moats', 'competitive advantage', 'defensibility', 'barriers to entry'],
    title: 'Moats & Defensibility',
    text: 'A moat is a durable competitive advantage that protects profits from competitors. Classic moats are network effects (value grows with users), switching costs (painful to leave), economies of scale (lower cost per unit), brand, and proprietary technology or data. Moats matter because without them success invites copycats that erode margins. Build moats deliberately—most early advantages (a feature, being first) are shallow and fade.'
  },
  {
    keys: ['roadmap', 'product roadmap', 'prioritization', 'backlog', 'planning'],
    title: 'Product Roadmap',
    text: 'A roadmap communicates the direction and sequence of what you will build and, crucially, why, tied to strategy and outcomes rather than a fixed feature list with dates. Good roadmaps organize around problems and goals (now/next/later) so teams stay adaptable as they learn. Ruthless prioritization is the core skill: with limited resources, saying no to good ideas to fund the highest-impact ones is what creates focus and results.'
  },
  {
    keys: ['rice', 'ice', 'prioritization framework', 'rice score', 'reach impact confidence effort'],
    title: 'RICE & ICE Prioritization',
    text: 'RICE scores initiatives by Reach (how many users), Impact (how much it moves the goal), Confidence (how sure you are), and Effort, computing (Reach × Impact × Confidence) ÷ Effort so higher scores rank first. ICE is a lighter version using Impact, Confidence, and Ease. These frameworks force explicit assumptions and comparable scoring, reducing bias toward loud voices or shiny features. They are aids to judgment, not substitutes—garbage estimates yield garbage rankings.'
  },
  {
    keys: ['jobs to be done', 'jtbd', 'customer needs', 'job story', 'outcome driven'],
    title: 'Jobs to be Done (JTBD)',
    text: 'Jobs-to-be-Done frames products around the underlying progress a customer is trying to make ("hire" a product to get a job done), not demographics or features. The classic example: people don’t want a drill, they want a hole—actually, a shelf on the wall. Focusing on the job reveals real competitors and unmet needs, guiding differentiation and roadmap. It keeps teams solving customer problems rather than adding features nobody hired the product for.'
  },
  {
    keys: ['discovery', 'customer discovery', 'user research', 'validation', 'assumptions'],
    title: 'Product Discovery',
    text: 'Product discovery is the continuous work of deciding what to build by testing assumptions with real customers before committing engineering effort. Techniques include customer interviews, prototypes, and small experiments to validate that a problem is real, the solution works, and people will pay. It de-risks the roadmap and prevents building things nobody wants. Talk to users about problems, not just proposed features, and separate what people say from what they do.'
  },
  {
    keys: ['feature creep', 'scope', 'simplicity', 'saying no', 'focus product'],
    title: 'Focus & Scope Control',
    text: 'Feature creep dilutes a product by adding capabilities that increase complexity faster than value, confusing users and slowing the team. Great products do a few things exceptionally rather than many things adequately, and every added feature has an ongoing maintenance and cognitive cost. Protect focus by tying additions to strategy and killing features that few use. Simplicity is a competitive advantage, not a limitation.'
  },

  // ---------------------------------------------------------------- GROWTH
  {
    keys: ['aarrr', 'pirate metrics', 'funnel', 'acquisition activation retention referral revenue', 'growth funnel'],
    title: 'AARRR (Pirate Metrics) Funnel',
    text: 'AARRR breaks growth into five stages: Acquisition (users find you), Activation (first great experience), Retention (they come back), Referral (they invite others), and Revenue (they pay). Measuring each stage reveals the biggest leak to fix next, so you optimize the bottleneck rather than pouring more into a broken funnel. Retention usually deserves attention before scaling acquisition, because retaining users compounds while a leaky funnel wastes spend.'
  },
  {
    keys: ['acquisition channels', 'channels', 'marketing channels', 'seo', 'paid ads', 'content marketing'],
    title: 'Acquisition Channels',
    text: 'Growth channels include organic (SEO, content), paid (search and social ads), viral/referral, sales-led (outbound, partnerships), and product-led. Early on, focus on one or two channels that fit your product and customer rather than spreading thin, and measure CAC and payback per channel. Channels saturate and costs rise over time, so build compounding channels (content, community, referrals) alongside paid, which stops the moment you stop spending.'
  },
  {
    keys: ['growth loops', 'loops', 'viral loop', 'flywheel', 'compounding growth', 'referral loop'],
    title: 'Growth Loops',
    text: 'A growth loop is a self-reinforcing cycle where the output of using the product drives new acquisition (e.g., users create content that ranks in search and attracts more users, who create more content). Unlike a linear funnel, loops compound: each cycle feeds the next, lowering reliance on paid acquisition. Viral loops, content loops, and paid loops (reinvesting revenue into ads) are common types. Designing loops into the product creates durable, efficient growth.'
  },
  {
    keys: ['plg', 'product led growth', 'product-led', 'self serve', 'bottoms up'],
    title: 'Product-Led Growth (PLG)',
    text: 'Product-Led Growth uses the product itself as the primary driver of acquisition, conversion, and expansion—users try it free, get value quickly, and upgrade or invite teammates without heavy sales. It lowers CAC and scales efficiently when the product delivers fast, obvious value and has natural expansion triggers (collaboration, usage limits). PLG demands excellent onboarding and self-serve UX, and often pairs with sales for larger accounts (product-led sales).'
  },
  {
    keys: ['pricing', 'pricing strategy', 'value based pricing', 'price optimization', 'willingness to pay'],
    title: 'Pricing Strategy',
    text: 'Pricing is one of the highest-leverage and most under-tested growth levers; small changes flow straight to the bottom line. Value-based pricing sets price by the value delivered to the customer (their willingness to pay), not your costs or competitors. Anchor pricing to a value metric that scales with customer success (seats, usage, outcomes) so revenue grows as customers get more value. Test pricing regularly—most companies charge too little and rarely revisit it.'
  },
  {
    keys: ['pricing tiers', 'tiers', 'good better best', 'packaging', 'plans', 'tiering'],
    title: 'Pricing Tiers & Packaging',
    text: 'Tiering (good-better-best) segments customers by willingness to pay and needs, capturing more value across the market than a single price. A typical structure is a free or low entry tier, a core paid tier for most customers, and a premium/enterprise tier with advanced features and support. Use a clear value metric to move customers up tiers as they grow, and avoid too many tiers, which cause decision paralysis. Anchor the middle tier as the intended default.'
  },
  {
    keys: ['conversion rate optimization', 'cro', 'conversion', 'ab testing', 'experiment', 'landing page'],
    title: 'Conversion & Experimentation',
    text: 'Conversion optimization improves the percentage of visitors who take a desired action (sign up, upgrade) through clearer messaging, reduced friction, and trust signals. Run A/B tests to compare variants with real users, ensuring statistical significance and testing one meaningful change at a time. Prioritize high-traffic, high-impact points (pricing page, onboarding). Small conversion gains compound across the whole funnel, but avoid over-testing trivial elements at the expense of bigger bets.'
  },
  {
    keys: ['virality', 'viral coefficient', 'k factor', 'referral program', 'word of mouth'],
    title: 'Virality & Referrals',
    text: 'Virality measures how existing users generate new users; the viral coefficient (k-factor) is invites sent times conversion rate—k above 1 means self-sustaining exponential growth (rare). Even sub-viral referral (k below 1) meaningfully lowers CAC by amplifying other channels. Build sharing into the core workflow and reward both referrer and referee. Sustainable word-of-mouth ultimately comes from a product worth talking about, not just incentives.'
  },
  {
    keys: ['expansion revenue', 'upsell', 'cross sell', 'land and expand', 'account expansion'],
    title: 'Expansion Revenue',
    text: 'Expansion grows revenue from existing customers via upsells (higher tiers), cross-sells (additional products), and seat or usage growth, and it is far cheaper than new acquisition. The "land and expand" motion starts small in an account then grows footprint as value is proven. Strong expansion drives net revenue retention above 100%, meaning the business grows even without new logos. Design pricing and product so success naturally leads customers to spend more.'
  },
  {
    keys: ['funnel optimization', 'drop off', 'bottleneck', 'conversion funnel', 'leaky bucket'],
    title: 'Funnel Analysis',
    text: 'A funnel maps the steps from first touch to desired outcome, revealing where users drop off so you can fix the biggest leak. The largest single drop-off is usually the highest-leverage fix, and improving an early stage multiplies through all later stages. Combine quantitative drop-off data with qualitative research to understand why users leave. Avoid the "leaky bucket" trap of pouring acquisition into a funnel that does not retain—patch retention first.'
  },

  // ---------------------------------------------------------------- LEADERSHIP / STRATEGY
  {
    keys: ['okr', 'okrs', 'objectives and key results', 'goal setting', 'alignment'],
    title: 'OKRs (Objectives and Key Results)',
    text: 'OKRs align an organization by pairing a qualitative Objective (where we want to go) with a few measurable Key Results (how we know we got there). They cascade from company to team so everyone pulls in the same direction, and they favor a small number of ambitious, outcome-focused goals over long task lists. Set them quarterly, review often, and grade honestly. OKRs work when they measure outcomes (impact) rather than output (activity).'
  },
  {
    keys: ['first principles', 'first-principles', 'reasoning from scratch', 'fundamental truths'],
    title: 'First-Principles Thinking',
    text: 'First-principles thinking breaks a problem down to its fundamental, undeniable truths and reasons up from there, instead of reasoning by analogy or copying what others do. It surfaces assumptions that "everyone knows" but that may be wrong or changeable, opening room for breakthrough solutions and better cost structures. It is slower and harder than analogy but essential for genuine innovation and for questioning inherited constraints. Ask "what do we actually know is true here?"'
  },
  {
    keys: ['tradeoffs', 'trade-offs', 'opportunity cost', 'decision making', 'prioritization strategy'],
    title: 'Trade-offs & Opportunity Cost',
    text: 'Strategy is fundamentally about trade-offs: choosing what to do implies choosing what not to do, and every yes has an opportunity cost—the value of the best alternative forgone. Trying to be everything to everyone yields a mediocre, undifferentiated product. Great leaders make deliberate trade-offs (focus, positioning, resource allocation) and communicate the reasoning. Recognizing opportunity cost prevents scattering scarce time and capital across too many bets.'
  },
  {
    keys: ['go no go', 'go/no-go', 'decision gate', 'launch decision', 'kill criteria'],
    title: 'Go/No-Go Decisions',
    text: 'A go/no-go decision is a gate where you decide whether to proceed, based on predefined criteria (readiness, quality, risk, market signals) rather than sunk cost or emotion. Set clear thresholds in advance so the decision is objective, and empower a clear owner to make the call. Distinguish reversible ("two-way door") decisions—decide fast, learn, adjust—from irreversible ones that warrant more deliberation. Killing or delaying a launch that isn’t ready protects the brand and users.'
  },
  {
    keys: ['strategy', 'business strategy', 'competitive strategy', 'strategic planning', 'vision'],
    title: 'Strategy Fundamentals',
    text: 'Strategy is a coherent set of choices about where to play and how to win that creates a sustainable advantage, not a list of goals or aspirations. A good strategy diagnoses the key challenge, sets a guiding policy, and specifies coordinated actions. It requires focus—concentrating resources on a decisive point rather than spreading them—and honest assessment of your real advantages. Vision inspires direction; strategy defines the path and the trade-offs to get there.'
  },
  {
    keys: ['decision making', 'reversible decisions', 'two way door', 'bias for action', 'speed'],
    title: 'Decision-Making Speed',
    text: 'Most decisions are reversible "two-way doors" that should be made quickly by the people closest to the problem, because the cost of delay usually exceeds the cost of being occasionally wrong. Reserve slow, careful analysis for irreversible "one-way door" decisions with large consequences. High-velocity decision-making with about 70% of the information you wish you had, plus the willingness to correct course, beats waiting for certainty. Bias for action compounds into speed of learning.'
  },
  {
    keys: ['delegation', 'ownership', 'accountability', 'raci', 'single threaded owner'],
    title: 'Delegation & Ownership',
    text: 'Effective leaders delegate outcomes with clear ownership rather than dictating tasks, freeing themselves to focus on the highest-leverage work. Every important initiative needs a single accountable owner (a single-threaded leader) so it does not stall in diffusion of responsibility. Delegate authority along with responsibility, set clear expectations and guardrails, and hold owners accountable for results, not activity. Trust with verification builds capable teams that scale beyond the founder.'
  },
  {
    keys: ['focus', 'saying no', 'priorities', 'essentialism', 'the one thing'],
    title: 'Focus & Saying No',
    text: 'The scarcest resource in any venture is focus: attempting many priorities at once means none get the attention to succeed. Disciplined leaders identify the one or few things that matter most right now and say no to everything else, even good opportunities, to concentrate force. Focus creates momentum and clarity for the team. As the saying goes, if everything is a priority, nothing is—strategy is as much about what you decline as what you pursue.'
  },
  {
    keys: ['culture', 'company culture', 'values', 'hiring', 'team building'],
    title: 'Culture & Team',
    text: 'Culture is the set of behaviors an organization actually rewards and tolerates—it is shaped by what leaders do, promote, and permit, not by posters of values. A strong culture aligns people so they make good decisions without constant oversight, which becomes critical as the company scales. Hiring is the highest-leverage culture lever: A-players attract A-players, and one bad hire in a small team can be corrosive. Hire for both capability and values fit, and address misfits quickly.'
  },

  // ---------------------------------------------------------------- FUNDRAISING / FINANCE
  {
    keys: ['fundraising', 'venture capital', 'vc', 'seed round', 'series a', 'raising money'],
    title: 'Fundraising',
    text: 'Fundraising exchanges equity for capital to accelerate growth, and each stage (pre-seed, seed, Series A, and beyond) expects specific milestones—seed proves the idea and early traction, Series A proves repeatable growth and unit economics. Raise enough to hit the next meaningful milestone plus buffer, since each round should be raised from a position of demonstrated progress. Investors fund momentum and a credible path to a large outcome. Only raise venture capital if the business can plausibly become very large.'
  },
  {
    keys: ['dilution', 'cap table', 'equity', 'ownership stake', 'option pool', 'valuation'],
    title: 'Dilution, Cap Table & Valuation',
    text: 'Each funding round issues new shares, diluting existing owners’ percentage in exchange for capital and a higher company value. The cap table tracks who owns what, including the option pool reserved for employees. Valuation sets the price of those shares; a higher valuation reduces dilution but sets a higher bar for the next round (avoid a down round). Optimize for the value of your stake (percentage times company value), not just minimizing dilution—owning less of a much bigger company is the goal.'
  },
  {
    keys: ['runway strategy', 'default alive', 'profitability', 'path to profitability', 'break even'],
    title: 'Path to Profitability',
    text: 'A path to profitability shows how and when revenue will exceed costs, giving control over your own destiny instead of depending on the next raise. Being "default alive" means your current growth and burn reach profitability before cash runs out. Even venture-backed companies benefit from a credible path, because it strengthens fundraising leverage and survives downturns. Balance growth investment against burn so you are never one failed raise away from collapse.'
  },
  {
    keys: ['gross margin', 'margins', 'cost of goods sold', 'cogs', 'operating margin'],
    title: 'Margins',
    text: 'Gross margin is revenue minus the direct cost of delivering the product (COGS: hosting, support, payment fees), expressed as a percentage; software often reaches 70-85%. High gross margins mean more of each dollar funds growth and profit, and they make LTV and unit economics work. Operating margin further subtracts fixed costs (R&D, S&M, G&A). Watch that variable costs (infrastructure, third-party fees) don’t quietly erode margins as you scale.'
  },
  {
    keys: ['revenue model', 'monetization', 'how to make money', 'revenue streams', 'pricing model choice'],
    title: 'Choosing a Revenue Model',
    text: 'The right monetization model depends on how customers derive and perceive value: subscriptions suit continuous value, usage-based suits variable consumption, marketplaces suit facilitated transactions, and freemium suits high-volume, viral products. Align the pricing metric with the customer’s value metric so cost scales with benefit received. Many businesses blend models (base subscription plus usage). Test and iterate—monetization is rarely right on the first try and strongly shapes growth dynamics.'
  },
  {
    keys: ['tam', 'sam', 'som', 'market size', 'total addressable market'],
    title: 'Market Sizing (TAM/SAM/SOM)',
    text: 'TAM (Total Addressable Market) is the total demand if you captured everyone; SAM (Serviceable Available Market) is the portion your product and reach can actually serve; SOM (Serviceable Obtainable Market) is what you can realistically win near-term. Size markets bottom-up (number of customers times price) rather than top-down percentages of huge numbers, which is more credible. A large TAM matters for venture-scale ambition, but winning a focused SOM first is how you get there.'
  },
  {
    keys: ['financial forecasting', 'projections', 'budget', 'financial model', 'assumptions model'],
    title: 'Financial Forecasting',
    text: 'A financial model projects revenue, costs, and cash based on explicit assumptions (growth rate, churn, CAC, conversion), turning strategy into numbers you can pressure-test. Its value is less in exact prediction and more in clarifying which levers matter most and stress-testing scenarios (base, upside, downside). Keep assumptions visible and tie them to real data as it arrives. Use it to plan hiring, spend, and fundraising timing, and update it as reality diverges.'
  }
];

function lookup(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const stop = new Set(['the', 'a', 'an', 'of', 'is', 'to', 'in', 'on', 'and', 'or', 'for', 'what', 'how', 'do', 'does', 'vs', 'me', 'my', 'i', 'about', 'with', 'explain', 'tell']);
  const qWords = q.split(/[^a-z0-9:+]+/).filter(w => w && !stop.has(w));

  let best = null;
  let bestScore = 0;

  for (const e of entries) {
    let score = 0;
    const titleLower = e.title.toLowerCase();

    for (const key of e.keys) {
      const k = key.toLowerCase();
      if (q.includes(k)) {
        score += 5 + k.split(/\s+/).length * 3;
      }
    }

    if (q.includes(titleLower)) score += 6;

    const keyWords = new Set();
    for (const key of e.keys) {
      for (const w of key.toLowerCase().split(/[^a-z0-9:+]+/)) {
        if (w && !stop.has(w)) keyWords.add(w);
      }
    }
    for (const w of titleLower.split(/[^a-z0-9:+]+/)) {
      if (w && !stop.has(w)) keyWords.add(w);
    }
    for (const w of qWords) {
      if (keyWords.has(w)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (!best || bestScore < 2) return null;
  return { title: best.title, text: best.text };
}

module.exports = {
  agent: 'SHADDAI',
  domains: [
    'business-models', 'metrics', 'product', 'growth', 'leadership', 'fundraising', 'unit-economics'
  ],
  entries,
  lookup
};
