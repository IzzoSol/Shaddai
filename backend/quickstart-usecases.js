// backend/quickstart-usecases.js
'use strict';
//
// The Quick Start catalog. A use case is DATA, not code — adding one means adding an
// entry here, no handler to write. The generic runner in quickstart-routes.js fills the
// `template` placeholders with the user's answers and asks the named agent to produce
// the output. Only use cases that need to write real files (make-website) get a special
// handler.
//
// Fields:
//   id, label, icon, category, description  — catalog/UI
//   questions[]                             — {key, prompt, type, placeholder?, options?}
//                                             type: text | textarea | select | email
//   agent                                   — which of the 7 answers (steers the persona)
//   system                                  — the agent's instruction for this job
//   template                                — user message; `{key}` is replaced by the answer
//   outputType                              — 'text' (default) or 'website'
//
// SECURITY: `template` and `system` are SERVER-ONLY. The catalog endpoint strips them
// before sending, so prompt wording is never exposed to the client and can't be edited
// by the caller.

const CATEGORIES = [
  { id: 'build',    label: 'Build Something',   icon: '🛠️' },
  { id: 'write',    label: 'Writing',           icon: '✍️' },
  { id: 'business', label: 'Business & Money',  icon: '💰' },
  { id: 'social',   label: 'Social & Marketing',icon: '📣' },
  { id: 'work',     label: 'Work & Admin',      icon: '📋' },
  { id: 'dev',      label: 'Code & Technical',  icon: '💻' },
  { id: 'life',     label: 'Personal',          icon: '🌱' },
];

// Shorthand for the very common "one textarea in, good text out" shape.
function simple(id, label, icon, category, description, agent, system, questions, template) {
  return { id, label, icon, category, description, agent, system, questions, template };
}

const USE_CASES = [
  // ── BUILD ──────────────────────────────────────────────────────────────────
  {
    id: 'make-website',
    label: 'Make a Website',
    icon: '🌐',
    category: 'build',
    description: 'Answer a few questions, get a real live website.',
    outputType: 'website',
    questions: [
      { key: 'siteName', prompt: "What's your site or business called?", type: 'text', placeholder: 'Acme Coffee' },
      { key: 'tagline', prompt: 'One line that sums it up', type: 'text', placeholder: 'Best beans in town' },
      { key: 'about', prompt: 'Tell people what this is about', type: 'textarea', placeholder: 'We roast small-batch coffee daily...' },
      {
        key: 'style', prompt: 'Pick a look', type: 'select',
        options: [
          { value: 'minimal_dark', label: 'Minimal Dark' },
          { value: 'warm_light', label: 'Warm & Light' },
          { value: 'bold_neon', label: 'Bold Neon' },
        ],
      },
      { key: 'contactEmail', prompt: 'Contact email (optional)', type: 'email', placeholder: 'hi@example.com' },
    ],
  },

  simple('landing-page-copy', 'Landing Page Copy', '📄', 'build',
    'Headline, subhead, benefits and a call to action.',
    'QUILL', 'You are a direct-response copywriter. Return a complete landing page copy deck: headline, subhead, 3 benefit bullets, social proof line, and CTA button text. Plain text with clear labels. No preamble.',
    [
      { key: 'product', prompt: 'What are you selling?', type: 'textarea', placeholder: 'A course on cold email' },
      { key: 'audience', prompt: 'Who is it for?', type: 'text', placeholder: 'Freelancers who hate selling' },
      { key: 'outcome', prompt: 'What result do they get?', type: 'text', placeholder: 'Book 5 calls a week' },
    ],
    'Product: {product}\nAudience: {audience}\nPromised outcome: {outcome}'),

  simple('name-my-business', 'Name My Business', '💡', 'build',
    'Get name ideas for a new business or product.',
    'ORACLE', 'You name companies. Return 12 candidate names in a numbered list. For each, one short line on why it works. Favour names that are short, sayable, and likely to have a findable domain. No preamble.',
    [
      { key: 'whatItDoes', prompt: 'What does the business do?', type: 'textarea', placeholder: 'We sell handmade candles online' },
      { key: 'vibe', prompt: 'What vibe do you want?', type: 'text', placeholder: 'Cozy, warm, premium' },
    ],
    'Business: {whatItDoes}\nDesired vibe: {vibe}'),

  simple('logo-brief', 'Logo & Brand Brief', '🎨', 'build',
    'A brief you can hand to a designer or an image AI.',
    'TURTLE', 'You are a brand designer. Return: a one-paragraph brand description, a 5-colour palette with hex codes, two font pairing suggestions, and three concrete logo concepts. End with a single image-generation prompt they can paste into any image AI. No preamble.',
    [
      { key: 'brand', prompt: "What's the brand called?", type: 'text', placeholder: 'Northwind Coffee' },
      { key: 'does', prompt: 'What does it do?', type: 'textarea', placeholder: 'Small-batch roastery and cafe' },
      { key: 'feel', prompt: 'How should it feel?', type: 'text', placeholder: 'Rugged, honest, outdoorsy' },
    ],
    'Brand: {brand}\nWhat it does: {does}\nDesired feel: {feel}'),

  simple('app-idea-spec', 'Spec Out an App Idea', '📱', 'build',
    'Turn a rough idea into a buildable feature spec.',
    'NEXUS', 'You are a pragmatic technical architect. Return: the core problem in one sentence, the smallest version worth shipping (list 3-5 features max), what to deliberately leave out of v1, a suggested tech stack, and the riskiest assumption to test first. No preamble.',
    [
      { key: 'idea', prompt: "What's the idea?", type: 'textarea', placeholder: 'An app that reminds you to water plants' },
      { key: 'who', prompt: 'Who would use it?', type: 'text', placeholder: 'People with too many houseplants' },
    ],
    'Idea: {idea}\nUsers: {who}'),

  simple('slide-deck', 'Build a Slide Deck', '📊', 'build',
    'A slide-by-slide outline with what goes on each one.',
    'QUILL', 'You build presentations. Return a slide-by-slide outline. For each slide: a number, a title, the 2-4 bullets that go on it, and a one-line note on what to say out loud. No preamble.',
    [
      { key: 'topic', prompt: "What's the deck about?", type: 'text', placeholder: 'Q3 results for the team' },
      { key: 'audience', prompt: 'Who are you presenting to?', type: 'text', placeholder: 'Leadership, 20 minutes' },
      { key: 'goal', prompt: 'What do you want them to do after?', type: 'text', placeholder: 'Approve next quarter budget' },
    ],
    'Topic: {topic}\nAudience: {audience}\nDesired outcome: {goal}'),

  // ── WRITE ──────────────────────────────────────────────────────────────────
  simple('write-email', 'Write an Email', '✉️', 'write',
    'Say the awkward thing, professionally.',
    'QUILL', 'You write clear, human business emails. Return a subject line and the email body. Keep it short — under 150 words unless the situation demands more. Match the requested tone exactly. No preamble.',
    [
      { key: 'about', prompt: 'What do you need to say?', type: 'textarea', placeholder: 'Tell a client the project will be 2 weeks late' },
      { key: 'to', prompt: 'Who is it to?', type: 'text', placeholder: 'A client I want to keep' },
      {
        key: 'tone', prompt: 'What tone?', type: 'select',
        options: [
          { value: 'warm and professional', label: 'Warm & professional' },
          { value: 'short and direct', label: 'Short & direct' },
          { value: 'apologetic but confident', label: 'Apologetic but confident' },
          { value: 'firm and final', label: 'Firm & final' },
        ],
      },
    ],
    'Situation: {about}\nRecipient: {to}\nTone: {tone}'),

  simple('rewrite-clearer', 'Make This Clearer', '🔍', 'write',
    'Paste anything messy, get the readable version.',
    'QUILL', 'You are an editor. Rewrite the text to be clear and direct: cut filler, shorten sentences, keep every fact and the original voice. Return ONLY the rewritten text, then a short "What I changed" list of 2-4 bullets.',
    [
      { key: 'text', prompt: 'Paste what you want cleaned up', type: 'textarea', placeholder: 'Paste your draft here...' },
    ],
    'Rewrite this:\n\n{text}'),

  simple('shorten-it', 'Shorten It', '✂️', 'write',
    'Cut it down without losing the point.',
    'QUILL', 'You cut text to length while keeping every essential point. Return only the shortened version, then a one-line note on what was dropped.',
    [
      { key: 'text', prompt: 'Paste the text', type: 'textarea', placeholder: 'Paste here...' },
      { key: 'target', prompt: 'How short?', type: 'text', placeholder: 'Half as long / one paragraph / a tweet' },
    ],
    'Cut this down to: {target}\n\n{text}'),

  simple('blog-post', 'Write a Blog Post', '📝', 'write',
    'A full post from a topic and an angle.',
    'QUILL', 'You write useful, specific blog posts — no fluff, no "in today\'s fast-paced world". Return a title, then the post with clear section headings. 600-900 words. Concrete examples over generalities.',
    [
      { key: 'topic', prompt: "What's it about?", type: 'text', placeholder: 'How we cut our AWS bill by 60%' },
      { key: 'angle', prompt: 'What point are you making?', type: 'textarea', placeholder: 'Most of the savings came from one thing nobody checks' },
      { key: 'audience', prompt: 'Who is reading?', type: 'text', placeholder: 'Startup engineers' },
    ],
    'Topic: {topic}\nAngle: {angle}\nAudience: {audience}'),

  simple('summarize', 'Summarize This', '📑', 'write',
    'Long thing in, the point out.',
    'ORACLE', 'You summarize. Return: a one-sentence bottom line, then 3-6 key points as bullets, then any action items you can identify. No preamble.',
    [
      { key: 'text', prompt: 'Paste what you need summarized', type: 'textarea', placeholder: 'Paste an article, transcript, thread...' },
    ],
    'Summarize:\n\n{text}'),

  simple('bio-writer', 'Write My Bio', '👤', 'write',
    'Three lengths, for wherever you need one.',
    'QUILL', 'You write professional bios. Return three versions clearly labelled: a one-liner (under 15 words), a short bio (about 50 words), and a full bio (about 120 words). Written in third person unless told otherwise. Confident, not boastful.',
    [
      { key: 'about', prompt: 'Who are you and what do you do?', type: 'textarea', placeholder: 'I run a design studio, 10 years experience, worked with...' },
      { key: 'where', prompt: 'Where will you use it?', type: 'text', placeholder: 'LinkedIn and a conference program' },
    ],
    'About me: {about}\nUsed for: {where}'),

  simple('reply-to-this', 'Help Me Reply', '💬', 'write',
    'Paste what they sent, get a good response.',
    'QUILL', 'You draft replies. Read the incoming message, then return a reply that achieves the stated goal. Match the register of the original. Return the reply only, then one line explaining the approach.',
    [
      { key: 'incoming', prompt: 'Paste what they sent you', type: 'textarea', placeholder: 'Paste the message...' },
      { key: 'goal', prompt: 'What do you want to happen?', type: 'text', placeholder: 'Push back on the price without losing the deal' },
    ],
    'They sent:\n{incoming}\n\nMy goal: {goal}'),

  // ── BUSINESS ───────────────────────────────────────────────────────────────
  simple('price-my-thing', 'Price My Product', '🏷️', 'business',
    'What to charge, and why.',
    'ZEROX', 'You price products for a living. Return: a recommended price with reasoning, two alternative tiers, what competitors likely charge, and the single biggest pricing mistake to avoid here. Be specific with numbers. No preamble.',
    [
      { key: 'what', prompt: 'What are you selling?', type: 'textarea', placeholder: 'A 6-week group coaching program' },
      { key: 'costs', prompt: 'What does it cost you to deliver?', type: 'text', placeholder: 'About 10 hours of my time' },
      { key: 'who', prompt: 'Who buys it?', type: 'text', placeholder: 'Solo consultants making 100k+' },
    ],
    'Product: {what}\nMy costs: {costs}\nBuyer: {who}'),

  simple('business-plan', 'One-Page Business Plan', '📈', 'business',
    'The whole plan on one page.',
    'SHADDAI', 'You write one-page business plans. Return sections: The Problem, The Solution, Who Pays, How It Makes Money, First 90 Days, Biggest Risk. Two to four sentences each. Concrete, not aspirational. No preamble.',
    [
      { key: 'idea', prompt: "What's the business?", type: 'textarea', placeholder: 'Mobile dog grooming in my city' },
      { key: 'resources', prompt: 'What do you have to start with?', type: 'text', placeholder: '$2000 and weekends' },
    ],
    'Business: {idea}\nStarting resources: {resources}'),

  simple('sales-pitch', 'Write a Sales Pitch', '🤝', 'business',
    'What to actually say to get the yes.',
    'ZEROX', 'You close deals. Return: a 30-second version, a 2-minute version, the three objections you will hear with a response to each, and the exact closing question to ask. No preamble.',
    [
      { key: 'offer', prompt: 'What are you offering?', type: 'textarea', placeholder: 'Website redesign, $4k' },
      { key: 'prospect', prompt: 'Who are you pitching?', type: 'text', placeholder: 'A restaurant owner with an old site' },
      { key: 'objection', prompt: 'What do you think they will say no because of?', type: 'text', placeholder: 'Price' },
    ],
    'Offer: {offer}\nProspect: {prospect}\nExpected objection: {objection}'),

  simple('cold-outreach', 'Cold Outreach Message', '📬', 'business',
    'A first message that gets a reply.',
    'ZEROX', 'You write cold outreach that gets replies. Return three variants of different lengths, each under 120 words. Lead with something specific about them, not about you. Ask for something small. No preamble, no "I hope this email finds you well".',
    [
      { key: 'target', prompt: 'Who are you reaching out to?', type: 'textarea', placeholder: 'Founders of Series A fintech companies' },
      { key: 'offer', prompt: 'What do you want from them?', type: 'text', placeholder: 'A 15 minute call about their onboarding' },
      { key: 'credibility', prompt: 'Why should they listen to you?', type: 'text', placeholder: 'I did this for two of their competitors' },
    ],
    'Target: {target}\nAsk: {offer}\nMy credibility: {credibility}'),

  simple('competitor-scan', 'Size Up the Competition', '🔭', 'business',
    'Who else does this and where the gap is.',
    'ORACLE', 'You do competitive analysis. Return: the likely main competitors and how they position, what they all do the same way, the gap nobody is filling, and the one positioning angle to take. Flag clearly where you are reasoning from general knowledge rather than current data. No preamble.',
    [
      { key: 'business', prompt: 'What is your business?', type: 'textarea', placeholder: 'Bookkeeping for freelance creatives' },
      { key: 'market', prompt: 'Where do you operate?', type: 'text', placeholder: 'US, online only' },
    ],
    'Business: {business}\nMarket: {market}'),

  simple('invoice-terms', 'Invoice & Payment Terms', '🧾', 'business',
    'Terms that get you paid on time.',
    'ZEROX', 'You set commercial terms for small businesses. Return: recommended payment terms, a deposit structure, a late-payment clause in plain language, and the exact line to put on the invoice. Note clearly that this is not legal advice. No preamble.',
    [
      { key: 'work', prompt: 'What work are you invoicing for?', type: 'textarea', placeholder: 'A 3-month design retainer' },
      { key: 'amount', prompt: 'Roughly how much?', type: 'text', placeholder: '$6000 total' },
      { key: 'history', prompt: 'Any history with this client?', type: 'text', placeholder: 'New client, no history' },
    ],
    'Work: {work}\nAmount: {amount}\nClient history: {history}'),

  // ── SOCIAL ─────────────────────────────────────────────────────────────────
  simple('write-social-post', 'Write a Social Post', '📣', 'social',
    'Turn an idea into a ready-to-post caption.',
    'QUILL', 'You write social posts that perform. Return three variants of the post, then a short line on which to try first and why. Match the platform\'s native format and length. No hashtag spam — three max, and only if they fit.',
    [
      { key: 'topic', prompt: "What's this post about?", type: 'textarea', placeholder: 'Launching our new coffee blend' },
      {
        key: 'platform', prompt: 'Which platform?', type: 'select',
        options: [
          { value: 'X / Twitter', label: 'X / Twitter' },
          { value: 'Instagram', label: 'Instagram' },
          { value: 'LinkedIn', label: 'LinkedIn' },
          { value: 'TikTok caption', label: 'TikTok' },
          { value: 'Facebook', label: 'Facebook' },
        ],
      },
      { key: 'tone', prompt: 'What tone?', type: 'text', placeholder: 'Fun and casual' },
    ],
    'Post about: {topic}\nPlatform: {platform}\nTone: {tone}'),

  simple('content-calendar', '30 Days of Content', '📅', 'social',
    'A month of post ideas, planned out.',
    'QUILL', 'You plan content calendars. Return 30 numbered post ideas. For each: the hook line, the format (text/image/video/carousel), and the goal (reach, trust, or sell). Vary the mix — roughly 60% value, 20% story, 20% offer. No preamble.',
    [
      { key: 'business', prompt: 'What do you do?', type: 'textarea', placeholder: 'I sell handmade leather bags' },
      { key: 'platform', prompt: 'Main platform?', type: 'text', placeholder: 'Instagram' },
      { key: 'goal', prompt: "What's the goal this month?", type: 'text', placeholder: 'Build up to a product launch' },
    ],
    'Business: {business}\nPlatform: {platform}\nMonth goal: {goal}'),

  simple('video-script', 'Short Video Script', '🎬', 'social',
    'Hook, body, payoff — timed out.',
    'TURTLE', 'You write short-form video scripts. Return the script with timestamps, the on-screen text for each beat, and a separate strong hook for the first 2 seconds. Keep it under the requested length. No preamble.',
    [
      { key: 'topic', prompt: "What's the video about?", type: 'textarea', placeholder: 'Three mistakes people make brewing coffee' },
      { key: 'length', prompt: 'How long?', type: 'text', placeholder: '30 seconds' },
      { key: 'platform', prompt: 'Where is it going?', type: 'text', placeholder: 'TikTok / Reels' },
    ],
    'Video topic: {topic}\nLength: {length}\nPlatform: {platform}'),

  simple('thread-writer', 'Write a Thread', '🧵', 'social',
    'A thread people actually finish reading.',
    'QUILL', 'You write threads that hold attention. Return numbered posts. Post 1 is the hook and must stand alone. Each post earns the next. End with a clear takeaway, not a "follow me for more". Keep each post inside the platform limit.',
    [
      { key: 'topic', prompt: "What's the thread about?", type: 'textarea', placeholder: 'What I learned launching a product to zero customers' },
      { key: 'length', prompt: 'How many posts?', type: 'text', placeholder: '7' },
    ],
    'Thread topic: {topic}\nLength: {length} posts'),

  simple('reply-to-review', 'Respond to a Review', '⭐', 'social',
    'Especially the bad ones.',
    'QUILL', 'You write public responses to customer reviews. Return the response. Acknowledge specifically, never argue, never be defensive, offer a real next step, keep it under 80 words. Remember other customers are reading this, not just the reviewer.',
    [
      { key: 'review', prompt: 'Paste the review', type: 'textarea', placeholder: 'Paste it here...' },
      { key: 'context', prompt: 'Anything we should know?', type: 'text', placeholder: 'They were right, we were short-staffed' },
    ],
    'Review:\n{review}\n\nContext: {context}'),

  // ── WORK ───────────────────────────────────────────────────────────────────
  simple('meeting-notes', 'Clean Up Meeting Notes', '🗒️', 'work',
    'Messy notes in, shareable summary out.',
    'QUILL', 'You turn raw meeting notes into a shareable summary. Return: Decisions Made, Action Items (with owner if identifiable), Open Questions, and Next Meeting. If something is unclear in the notes, say so rather than inventing it. No preamble.',
    [
      { key: 'notes', prompt: 'Paste your notes or transcript', type: 'textarea', placeholder: 'Paste here...' },
    ],
    'Clean up these meeting notes:\n\n{notes}'),

  simple('job-description', 'Write a Job Description', '📋', 'work',
    'A posting good people apply to.',
    'QUILL', 'You write job posts that attract good candidates. Return: the role in one honest sentence, what they will actually do day to day, what you need from them (5 max), what is nice to have, and what you offer. Cut corporate filler and "rockstar ninja" language. No preamble.',
    [
      { key: 'role', prompt: 'What role?', type: 'text', placeholder: 'Part-time bookkeeper' },
      { key: 'work', prompt: 'What will they actually do?', type: 'textarea', placeholder: 'Reconcile accounts, chase invoices, monthly reports' },
      { key: 'company', prompt: 'Tell them about the company', type: 'text', placeholder: '6-person design studio, fully remote' },
    ],
    'Role: {role}\nDay to day: {work}\nCompany: {company}'),

  simple('resume-tune', 'Tune My Resume', '📄', 'work',
    'Aim your resume at one specific job.',
    'ORACLE', 'You rewrite resumes to match a target role. Return: the rewritten summary, the bullets you would change and what to change them to, keywords from the job description that are missing, and what to cut. Never invent experience the person did not state.',
    [
      { key: 'resume', prompt: 'Paste your resume (or the relevant part)', type: 'textarea', placeholder: 'Paste here...' },
      { key: 'job', prompt: 'Paste the job posting', type: 'textarea', placeholder: 'Paste the posting...' },
    ],
    'My resume:\n{resume}\n\nTarget job:\n{job}'),

  simple('sop-writer', 'Write a How-To / SOP', '📘', 'work',
    'So someone else can do it without asking you.',
    'QUILL', 'You write standard operating procedures. Return numbered steps a new person could follow without asking questions. Include what they need before starting, the steps, how to know it worked, and what to do if it goes wrong. No preamble.',
    [
      { key: 'task', prompt: 'What is the process?', type: 'textarea', placeholder: 'How we onboard a new client' },
      { key: 'who', prompt: 'Who will follow it?', type: 'text', placeholder: 'A new hire on day one' },
    ],
    'Process: {task}\nAudience: {who}'),

  simple('decision-help', 'Help Me Decide', '⚖️', 'work',
    'Lay out the call and make a recommendation.',
    'SHADDAI', 'You help people make decisions. Return: what this decision really is, the honest case for each option, what you would need to know to be sure, the recommendation, and how reversible it is. Give an actual recommendation — do not sit on the fence. No preamble.',
    [
      { key: 'decision', prompt: 'What are you deciding?', type: 'textarea', placeholder: 'Quit my job to do this full time, or keep it part time' },
      { key: 'matters', prompt: 'What matters most to you here?', type: 'text', placeholder: 'Not running out of money' },
    ],
    'Decision: {decision}\nWhat matters most: {matters}'),

  simple('plan-my-week', 'Plan My Week', '🗓️', 'work',
    'Everything you have to do, ordered.',
    'SHADDAI', 'You plan weeks. Return a day-by-day plan. Put the highest-leverage work early, batch similar tasks, and explicitly name what to drop if the week goes sideways. Be realistic about how much fits. No preamble.',
    [
      { key: 'tasks', prompt: 'What is on your plate?', type: 'textarea', placeholder: 'Dump everything here, messy is fine' },
      { key: 'constraints', prompt: 'What are your constraints?', type: 'text', placeholder: 'Day job til 5, Wednesday is gone' },
      { key: 'priority', prompt: 'What matters most this week?', type: 'text', placeholder: 'Ship the client site' },
    ],
    'My tasks:\n{tasks}\n\nConstraints: {constraints}\nTop priority: {priority}'),

  // ── DEV ────────────────────────────────────────────────────────────────────
  simple('explain-code', 'Explain This Code', '🔬', 'dev',
    'What it does, in plain language.',
    'NEXUS', 'You explain code to someone still learning. Return: what it does in one sentence, a walkthrough of the important parts in plain language, and anything that looks like a bug or a risk. No condescension, no unnecessary jargon.',
    [
      { key: 'code', prompt: 'Paste the code', type: 'textarea', placeholder: 'Paste here...' },
    ],
    'Explain this code:\n\n{code}'),

  simple('fix-error', 'Fix This Error', '🐛', 'dev',
    'Paste the error, get the likely cause.',
    'NEXUS', 'You debug. Return: what the error actually means, the most likely cause, the fix with a code example, and how to confirm it worked. If you need more information to be sure, say exactly what to check rather than guessing.',
    [
      { key: 'error', prompt: 'Paste the error message', type: 'textarea', placeholder: 'Paste the full error and stack trace...' },
      { key: 'context', prompt: 'What were you doing?', type: 'text', placeholder: 'Running npm start after adding a package' },
    ],
    'Error:\n{error}\n\nContext: {context}'),

  simple('write-a-script', 'Write Me a Script', '⚙️', 'dev',
    'A small script that does one job.',
    'NEXUS', 'You write small, correct utility scripts. Return the complete script, how to run it, and what it assumes. Handle the obvious failure cases. Comment only where the reason is not obvious from the code.',
    [
      { key: 'goal', prompt: 'What should it do?', type: 'textarea', placeholder: 'Rename every file in a folder to add the date' },
      { key: 'lang', prompt: 'What language or environment?', type: 'text', placeholder: 'Python, on Windows' },
    ],
    'Task: {goal}\nEnvironment: {lang}'),

  simple('security-check', 'Check This for Security Holes', '🔐', 'dev',
    'A second pair of eyes before you ship.',
    'PIKADON', 'You review code for security defects. Return findings most severe first. For each: what the issue is, how it would actually be exploited, and the fix. If you find nothing serious, say so plainly rather than padding the list. Flag anything you are unsure about as unconfirmed.',
    [
      { key: 'code', prompt: 'Paste the code', type: 'textarea', placeholder: 'Paste here...' },
      { key: 'context', prompt: 'Where does this run?', type: 'text', placeholder: 'Public API endpoint, users are logged in' },
    ],
    'Review for security:\n{code}\n\nContext: {context}'),

  simple('regex-builder', 'Build a Regex', '🔣', 'dev',
    'Describe the pattern, get the expression.',
    'NEXUS', 'You write regular expressions. Return the expression, a plain-language breakdown of each part, three examples it matches, and three it does not. Note the flavour (JS/Python/etc) assumed.',
    [
      { key: 'want', prompt: 'What should it match?', type: 'textarea', placeholder: 'US phone numbers with or without dashes' },
      { key: 'lang', prompt: 'For what language?', type: 'text', placeholder: 'JavaScript' },
    ],
    'Match: {want}\nLanguage: {lang}'),

  simple('sql-query', 'Write a Database Query', '🗄️', 'dev',
    'Describe what you want, get the SQL.',
    'NEXUS', 'You write SQL. Return the query, a line-by-line explanation, and a note on indexes or performance if the query would be slow at scale. Ask for the schema in your answer if what was given is insufficient — do not guess column names silently.',
    [
      { key: 'want', prompt: 'What do you want to find out?', type: 'textarea', placeholder: 'Top 10 customers by spend last month' },
      { key: 'schema', prompt: 'What do your tables look like?', type: 'textarea', placeholder: 'orders(id, customer_id, total, created_at)...' },
    ],
    'Question: {want}\nSchema: {schema}'),

  // ── LIFE ───────────────────────────────────────────────────────────────────
  simple('explain-simply', 'Explain It Simply', '🧠', 'life',
    'Any topic, actually understandable.',
    'ORACLE', 'You explain things clearly. Return: the idea in one sentence, an analogy from everyday life, then the real explanation built up in steps. Match the requested level exactly. Never talk down.',
    [
      { key: 'topic', prompt: 'What do you want explained?', type: 'text', placeholder: 'How does a mortgage actually work' },
      { key: 'level', prompt: 'Explain it like I am...', type: 'text', placeholder: 'Smart but have never dealt with this' },
    ],
    'Explain: {topic}\nLevel: {level}'),

  simple('meal-plan', 'Plan My Meals', '🍽️', 'life',
    'A week of food and the shopping list.',
    'ORACLE', 'You plan meals. Return a 7-day plan, then a consolidated shopping list grouped by supermarket section. Respect every constraint given. Keep it realistic for the stated cooking skill and time.',
    [
      { key: 'people', prompt: 'How many people?', type: 'text', placeholder: '2 adults, 1 kid' },
      { key: 'constraints', prompt: 'Any restrictions or dislikes?', type: 'textarea', placeholder: 'No pork, one of us is vegetarian' },
      { key: 'effort', prompt: 'How much time do you have to cook?', type: 'text', placeholder: '30 min on weeknights' },
    ],
    'People: {people}\nRestrictions: {constraints}\nTime available: {effort}'),

  simple('gift-ideas', 'Find a Gift', '🎁', 'life',
    'For the person who is hard to buy for.',
    'ORACLE', 'You suggest gifts. Return 10 specific ideas at a range of prices — actual things, not categories. For each: why it fits this person and roughly what it costs. No generic filler like "a nice candle".',
    [
      { key: 'person', prompt: 'Who is it for?', type: 'textarea', placeholder: 'My dad, 65, retired, into woodworking and bad puns' },
      { key: 'budget', prompt: "What's the budget?", type: 'text', placeholder: 'Under $75' },
      { key: 'occasion', prompt: 'What is the occasion?', type: 'text', placeholder: 'Birthday' },
    ],
    'Recipient: {person}\nBudget: {budget}\nOccasion: {occasion}'),

  simple('difficult-conversation', 'Prep a Hard Conversation', '🫱', 'life',
    'Work out what to say before you say it.',
    'QUILL', 'You help people prepare for difficult conversations. Return: what you are actually trying to achieve, an opening line, the two or three points to make, what they will likely say and how to respond, and what a good outcome looks like. Be kind but honest about where the person may be in the wrong.',
    [
      { key: 'situation', prompt: 'What is the situation?', type: 'textarea', placeholder: 'Need to tell my business partner I want out' },
      { key: 'outcome', prompt: 'What do you want to happen?', type: 'text', placeholder: 'Leave cleanly, stay friends' },
    ],
    'Situation: {situation}\nDesired outcome: {outcome}'),

  simple('learn-something', 'Learning Plan', '🎓', 'life',
    'How to actually learn it, in order.',
    'ORACLE', 'You build learning plans. Return: what to learn in what order and why that order, roughly how long each stage takes, a concrete project at each stage to prove it stuck, and the three things beginners waste time on. No preamble.',
    [
      { key: 'skill', prompt: 'What do you want to learn?', type: 'text', placeholder: 'Enough Python to automate my job' },
      { key: 'time', prompt: 'How much time do you have?', type: 'text', placeholder: '5 hours a week' },
      { key: 'start', prompt: 'Where are you starting from?', type: 'text', placeholder: 'Total beginner' },
    ],
    'Skill: {skill}\nTime available: {time}\nStarting point: {start}'),
];

// Fields the client must never see — prompt engineering stays server-side.
const SERVER_ONLY = ['system', 'template', 'agent'];

function publicCatalog() {
  return USE_CASES.map((u) => {
    const copy = {};
    for (const k of Object.keys(u)) {
      if (!SERVER_ONLY.includes(k)) copy[k] = u[k];
    }
    return copy;
  });
}

module.exports = { USE_CASES, CATEGORIES, publicCatalog };
