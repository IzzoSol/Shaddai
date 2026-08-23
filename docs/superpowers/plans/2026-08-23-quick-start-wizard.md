# Quick Start Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-first, step-by-step "Quick Start" wizard where a user answers a few questions and gets a real deliverable back — starting with "Make a Website," which produces an actual live, styled HTML page at a public URL.

**Architecture:** A declarative use-case registry (`backend/quickstart-usecases.js`) drives a generic wizard UI (`public/quickstart.html`). Submitting answers POSTs to `/api/quickstart/run/:id`, which looks up the use case and runs its handler. The `make-website` handler calls QUILL (via the existing `llm-client.callLLM`, with a template fallback if the LLM call fails) for copy, fills an HTML template, and writes the result to `public/sites/<slug>/index.html` — instantly a live URL since `public/` is already served at `/`.

**Tech Stack:** Plain Node.js + Express (matches existing backend — no TypeScript, no new frameworks), vanilla HTML/CSS/JS for the wizard page (matches existing `public/*.html` standalone pages like `coin-launch.html`).

**Spec:** `docs/superpowers/specs/2026-08-23-quick-start-wizard-design.md`

## Global Constraints

- No new npm dependencies — reuse `llm-client.js`'s `callLLM` exactly as `coin-launch-routes.js` already does (agentName + maxTokens + 9s race-timeout + template fallback pattern).
- All user-supplied text (site name, tagline, answers) MUST be HTML-escaped before being embedded in generated HTML output — this page is publicly served, so unescaped input is a stored-XSS vector.
- The output directory slug MUST be sanitized (alphanumeric + hyphen only, fixed max length) — it becomes a filesystem path under `public/sites/`, so it must not allow path traversal.
- Do not touch the existing gamified onboarding whitepaper flow, `public/index.html`'s BYOK "Connect Your APIs" panel, or any Workflow Center code — this plan only adds new files plus one small link into the existing dashboard nav.
- No visible browser automation for verification — headless curl/PowerShell checks only, matching this session's established pattern.

---

### Task 1: Website generator (templates + fill function)

**Files:**
- Create: `backend/lib/website-generator.js`
- Test: `backend/tests/website-generator.test.js`

**Interfaces:**
- Produces: `module.exports = { renderWebsite(answers) -> string (full HTML document), slugify(name) -> string }`. `answers` shape: `{ siteName: string, tagline: string, about: string, style: 'minimal_dark'|'warm_light'|'bold_neon', sections: string[] (each a short paragraph), contactEmail?: string }`.

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/website-generator.test.js
const { renderWebsite, slugify } = require('../lib/website-generator');

describe('slugify', () => {
  test('lowercases, replaces spaces with hyphens', () => {
    expect(slugify('My Cool Site')).toBe('my-cool-site');
  });
  test('strips unsafe characters (no path traversal)', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a/b\\c:d*e?f')).toBe('a-b-c-d-e-f');
  });
  test('caps length and falls back on empty input', () => {
    expect(slugify('')).toBe('site');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe('renderWebsite', () => {
  const base = {
    siteName: 'Acme Coffee',
    tagline: 'Best beans in town',
    about: 'We roast small-batch coffee daily.',
    style: 'warm_light',
    sections: ['Fresh roasted every morning.', 'Locally sourced beans.'],
    contactEmail: 'hi@acme.test',
  };

  test('embeds the site name and tagline', () => {
    const html = renderWebsite(base);
    expect(html).toContain('Acme Coffee');
    expect(html).toContain('Best beans in town');
  });

  test('HTML-escapes user-supplied text (XSS safety)', () => {
    const html = renderWebsite({ ...base, siteName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renders every section paragraph', () => {
    const html = renderWebsite(base);
    expect(html).toContain('Fresh roasted every morning.');
    expect(html).toContain('Locally sourced beans.');
  });

  test('falls back to the minimal_dark style for an unknown style key', () => {
    const html = renderWebsite({ ...base, style: 'not-a-real-style' });
    expect(html).toContain('<!doctype html>');
  });

  test('is a complete HTML document', () => {
    const html = renderWebsite(base);
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/website-generator.test.js`
Expected: FAIL with "Cannot find module '../lib/website-generator'"

- [ ] **Step 3: Write the implementation**

```js
// backend/lib/website-generator.js
'use strict';

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'site';
}

const STYLES = {
  minimal_dark: { bg: '#0b0b0d', panel: '#141418', ink: '#f5f6f8', muted: '#9aa0aa', accent: '#00e5ff' },
  warm_light:   { bg: '#faf6f0', panel: '#ffffff', ink: '#211a12', muted: '#6b6156', accent: '#c9622a' },
  bold_neon:    { bg: '#050814', panel: '#0a1030', ink: '#e6f7ff', muted: '#8aa0c8', accent: '#ff2bd6' },
};
function styleOf(key) { return STYLES[key] || STYLES.minimal_dark; }

function renderWebsite(answers) {
  const a = answers || {};
  const st = styleOf(a.style);
  const siteName = esc(a.siteName || 'My Site');
  const tagline = esc(a.tagline || '');
  const about = esc(a.about || '');
  const sections = (Array.isArray(a.sections) ? a.sections : [])
    .map((s) => `<p class="section">${esc(s)}</p>`)
    .join('\n      ');
  const contact = a.contactEmail
    ? `<a class="contact" href="mailto:${esc(a.contactEmail)}">${esc(a.contactEmail)}</a>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${siteName}</title>
<style>
  :root { --bg:${st.bg}; --panel:${st.panel}; --ink:${st.ink}; --muted:${st.muted}; --accent:${st.accent}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--ink); line-height:1.6; }
  header { padding: 64px 20px 40px; text-align:center; }
  h1 { font-size: clamp(28px, 6vw, 48px); margin:0 0 12px; }
  .tagline { color: var(--accent); font-size: clamp(16px, 3vw, 20px); margin:0; }
  main { max-width: 720px; margin: 0 auto; padding: 0 20px 60px; }
  .about { background: var(--panel); border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .section { background: var(--panel); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  footer { text-align:center; padding: 30px 20px; color: var(--muted); font-size: 14px; }
  .contact { color: var(--accent); text-decoration:none; }
</style>
</head>
<body>
  <header>
    <h1>${siteName}</h1>
    <p class="tagline">${tagline}</p>
  </header>
  <main>
    <div class="about">${about}</div>
    ${sections}
  </main>
  <footer>
    ${contact}
  </footer>
</body>
</html>`;
}

module.exports = { renderWebsite, slugify };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/website-generator.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/lib/website-generator.js backend/tests/website-generator.test.js
git commit -m "feat(quickstart): add website template generator with XSS-safe escaping"
```

---

### Task 2: Use-case registry

**Files:**
- Create: `backend/quickstart-usecases.js`
- Test: `backend/tests/quickstart-usecases.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly (the registry references the handler by name; Task 3 wires the actual function in).
- Produces: `module.exports = { USE_CASES: [{ id, label, icon, description, questions: [{key, prompt, type, options?, placeholder?}] }] }`. Every use case's `questions[].key` values are the exact keys the wizard UI will send as `answers` in the POST body.

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/quickstart-usecases.test.js
const { USE_CASES } = require('../quickstart-usecases');

describe('quickstart use-case registry', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(USE_CASES)).toBe(true);
    expect(USE_CASES.length).toBeGreaterThanOrEqual(3);
  });

  test('every use case has required fields and unique id', () => {
    const ids = new Set();
    for (const uc of USE_CASES) {
      expect(typeof uc.id).toBe('string');
      expect(uc.id.length).toBeGreaterThan(0);
      expect(ids.has(uc.id)).toBe(false);
      ids.add(uc.id);
      expect(typeof uc.label).toBe('string');
      expect(typeof uc.description).toBe('string');
      expect(Array.isArray(uc.questions)).toBe(true);
      expect(uc.questions.length).toBeGreaterThan(0);
    }
  });

  test('every question has a key, prompt, and valid type', () => {
    const validTypes = new Set(['text', 'textarea', 'select', 'email']);
    for (const uc of USE_CASES) {
      for (const q of uc.questions) {
        expect(typeof q.key).toBe('string');
        expect(typeof q.prompt).toBe('string');
        expect(validTypes.has(q.type)).toBe(true);
        if (q.type === 'select') {
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('the make-website use case exists with the fields website-generator expects', () => {
    const site = USE_CASES.find((u) => u.id === 'make-website');
    expect(site).toBeTruthy();
    const keys = site.questions.map((q) => q.key);
    expect(keys).toEqual(expect.arrayContaining(['siteName', 'tagline', 'about', 'style']));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/quickstart-usecases.test.js`
Expected: FAIL with "Cannot find module '../quickstart-usecases'"

- [ ] **Step 3: Write the implementation**

```js
// backend/quickstart-usecases.js
'use strict';

const USE_CASES = [
  {
    id: 'make-website',
    label: 'Make a Website',
    icon: '🌐',
    description: 'Answer a few questions, get a real live website.',
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
  {
    id: 'write-social-post',
    label: 'Write a Social Post',
    icon: '📣',
    description: 'Turn an idea into a ready-to-post caption.',
    questions: [
      { key: 'topic', prompt: "What's this post about?", type: 'text', placeholder: 'Launching our new coffee blend' },
      {
        key: 'platform', prompt: 'Which platform?', type: 'select',
        options: [
          { value: 'twitter', label: 'X / Twitter' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'linkedin', label: 'LinkedIn' },
        ],
      },
      { key: 'tone', prompt: 'What tone?', type: 'text', placeholder: 'Fun and casual' },
    ],
  },
  {
    id: 'name-my-business',
    label: 'Name My Business',
    icon: '💡',
    description: 'Get name ideas for a new business or product.',
    questions: [
      { key: 'whatItDoes', prompt: 'What does the business do?', type: 'textarea', placeholder: 'We sell handmade candles online' },
      { key: 'vibe', prompt: 'What vibe do you want?', type: 'text', placeholder: 'Cozy, warm, premium' },
    ],
  },
];

module.exports = { USE_CASES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/quickstart-usecases.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/quickstart-usecases.js backend/tests/quickstart-usecases.test.js
git commit -m "feat(quickstart): add use-case registry (make-website + 2 stub flows)"
```

---

### Task 3: Quick Start routes (list use cases, run one)

**Files:**
- Create: `backend/quickstart-routes.js`
- Modify: `backend/server-production.js` — mount the new router (find where other feature routers are mounted, e.g. near `coin-launch-routes`, and add one `app.use(...)` line following that exact pattern)
- Test: `backend/tests/quickstart-routes.test.js`

**Interfaces:**
- Consumes: `USE_CASES` from Task 2 (`backend/quickstart-usecases.js`), `renderWebsite`/`slugify` from Task 1 (`backend/lib/website-generator.js`), `callLLM` from `backend/llm-client.js` (existing — same call shape already used in `coin-launch-routes.js`: `callLLM([{role,content}...], { agentName, maxTokens })` returning `{ content, provider }`, reject on timeout).
- Produces: `GET /api/quickstart/usecases` → `{ ok: true, useCases: USE_CASES }`. `POST /api/quickstart/run/:id` with body `{ answers: {...} }` → for `make-website`: `{ ok: true, outputType: 'website', url: '/sites/<slug>/', previewHtml: '<full html string>' }`; for other use cases (this task only implements make-website's real handler — the two stub use cases return `{ ok: true, outputType: 'text', content: '<message explaining this flow is coming soon>' }` so the wizard UI has something real to render for every registry entry without needing LLM calls wired for them yet).

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/quickstart-routes.test.js
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'sites');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(require('../quickstart-routes'));
  return app;
}

afterAll(() => {
  // Clean up any site dirs this test run created.
  try {
    for (const d of fs.readdirSync(OUTPUT_DIR)) {
      if (d.startsWith('test-quickstart-')) {
        fs.rmSync(path.join(OUTPUT_DIR, d), { recursive: true, force: true });
      }
    }
  } catch (_) {}
});

describe('GET /api/quickstart/usecases', () => {
  test('returns the use-case registry', async () => {
    const res = await request(buildApp()).get('/api/quickstart/usecases');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.useCases)).toBe(true);
    expect(res.body.useCases.find((u) => u.id === 'make-website')).toBeTruthy();
  });
});

describe('POST /api/quickstart/run/make-website', () => {
  test('writes a real HTML file under public/sites and returns its URL', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .send({
        answers: {
          siteName: 'Test-Quickstart-Site',
          tagline: 'A test tagline',
          about: 'A test about section.',
          style: 'minimal_dark',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputType).toBe('website');
    expect(res.body.url).toMatch(/^\/sites\/test-quickstart-site/);
    expect(res.body.previewHtml).toContain('Test-Quickstart-Site');

    const written = fs.readFileSync(
      path.join(OUTPUT_DIR, 'test-quickstart-site', 'index.html'), 'utf8'
    );
    expect(written).toContain('A test tagline');
  });

  test('rejects a missing siteName with a 400, does not write a file', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .send({ answers: { tagline: 'no name given' } });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('POST /api/quickstart/run/:id for a stub use case', () => {
  test('returns a text placeholder without erroring', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/write-social-post')
      .send({ answers: { topic: 'test', platform: 'twitter', tone: 'fun' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputType).toBe('text');
    expect(typeof res.body.content).toBe('string');
  });
});

describe('POST /api/quickstart/run/:id for an unknown id', () => {
  test('returns 404', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/not-a-real-usecase')
      .send({ answers: {} });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Check test dependencies, then run to verify failure**

Check `supertest` is available: `cd backend && node -e "require('supertest')"` — if that errors, add it: `npm install --save-dev supertest`.

Run: `cd backend && npx jest tests/quickstart-routes.test.js`
Expected: FAIL with "Cannot find module '../quickstart-routes'"

- [ ] **Step 3: Write the implementation**

```js
// backend/quickstart-routes.js
'use strict';
// Quick Start wizard API — mounted with no prefix (routes declare their own /api/quickstart/... paths),
// matching how coin-launch-routes.js is mounted in server-production.js.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const { USE_CASES } = require('./quickstart-usecases');
const { renderWebsite, slugify } = require('./lib/website-generator');

let callLLM = null;
try { ({ callLLM } = require('./llm-client')); } catch (_) {}

const SITES_DIR = path.join(__dirname, '..', 'public', 'sites');

function findUseCase(id) {
  return USE_CASES.find((u) => u.id === id) || null;
}

// Ask QUILL to expand a short "about" blurb into 2-3 short section paragraphs.
// Falls back to using the about text itself (split on sentences) if the LLM call fails —
// this handler must never hard-fail just because an LLM provider is unavailable.
async function expandSections(about, siteName) {
  if (callLLM) {
    try {
      const r = await Promise.race([
        callLLM([
          { role: 'system', content: 'You write short, punchy website section copy. Reply ONLY with a JSON array of 2-3 short strings (1-2 sentences each). No preamble, no markdown.' },
          { role: 'user', content: `Site: ${siteName}\nAbout: ${about}\n\nWrite 2-3 short website sections expanding on this.` },
        ], { agentName: 'QUILL', maxTokens: 400 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('llm-timeout')), 9000)),
      ]);
      const fence = r && r.content && r.content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const body = fence ? fence[1] : (r && r.content);
      const m = body && body.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr) && arr.length) return arr.map(String).filter(Boolean).slice(0, 3);
      }
    } catch (_) { /* fall through to template fallback */ }
  }
  return String(about || '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
}

router.get('/api/quickstart/usecases', (req, res) => {
  res.json({ ok: true, useCases: USE_CASES });
});

router.post('/api/quickstart/run/:id', json, async (req, res) => {
  const useCase = findUseCase(req.params.id);
  if (!useCase) return res.status(404).json({ ok: false, error: 'Unknown use case' });

  const answers = (req.body && req.body.answers) || {};

  if (useCase.id === 'make-website') {
    const siteName = String(answers.siteName || '').trim();
    if (!siteName) return res.status(400).json({ ok: false, error: 'siteName is required' });

    const slug = slugify(siteName);
    const sections = await expandSections(answers.about, siteName);
    const html = renderWebsite({ ...answers, siteName, sections });

    const dir = path.join(SITES_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');

    return res.json({ ok: true, outputType: 'website', url: `/sites/${slug}/`, previewHtml: html });
  }

  // Stub use cases: acknowledge the answers, return an honest "coming soon" text result
  // rather than pretending to run a flow that doesn't have a real handler yet.
  return res.json({
    ok: true,
    outputType: 'text',
    content: `"${useCase.label}" is coming soon. We've saved what you told us:\n\n${
      Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n')
    }`,
  });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/quickstart-routes.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Mount the router in server-production.js**

Find the line where `coin-launch-routes` (or a similarly-shaped standalone feature router) is required and mounted with `app.use(...)`. Add, immediately after that line:

```js
app.use(require('./quickstart-routes'));
```

- [ ] **Step 6: Verify the server still boots**

Run: `cd backend && node --check server-production.js` (syntax check) then start it (`node server-production.js`), wait for it to finish its startup log lines, hit `curl http://localhost:3000/api/quickstart/usecases` and confirm it returns the registry JSON. Kill the server after confirming.

- [ ] **Step 7: Commit**

```bash
git add backend/quickstart-routes.js backend/tests/quickstart-routes.test.js backend/server-production.js
git commit -m "feat(quickstart): add /api/quickstart routes, mount in server"
```

---

### Task 4: Wizard UI page

**Files:**
- Create: `public/quickstart.html`

**Interfaces:**
- Consumes: `GET /api/quickstart/usecases` and `POST /api/quickstart/run/:id` from Task 3 (exact response shapes as documented in Task 3's Interfaces section).
- Produces: a standalone page at `/quickstart.html`, no dependency on `index.html`'s internals — self-contained like `coin-launch.html`.

- [ ] **Step 1: Write the page**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quick Start — SHADDAI</title>
<style>
  :root { --bg:#0b0b0d; --panel:#16161a; --ink:#f5f6f8; --muted:#9aa0aa; --accent:#00e5ff; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, Segoe UI, sans-serif; display:flex; flex-direction:column; }
  header { padding: 20px; text-align:center; border-bottom: 1px solid rgba(255,255,255,0.08); }
  header h1 { margin:0; font-size: 20px; }
  main { flex:1; max-width: 480px; width:100%; margin: 0 auto; padding: 24px 20px 40px; display:flex; flex-direction:column; }
  .card { background: var(--panel); border-radius: 16px; padding: 24px; }
  .picker-grid { display:grid; gap: 12px; }
  .picker-item { background: var(--panel); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 18px; text-align:left; color:var(--ink); font-size: 16px; cursor:pointer; display:flex; gap:12px; align-items:center; }
  .picker-item:active { transform: scale(0.98); }
  .picker-item .icon { font-size: 28px; }
  .picker-item .meta { display:flex; flex-direction:column; gap:2px; }
  .picker-item .desc { color: var(--muted); font-size: 13px; }
  .progress { display:flex; gap:6px; justify-content:center; margin-bottom: 20px; }
  .progress .dot { width:8px; height:8px; border-radius:50%; background: rgba(255,255,255,0.15); }
  .progress .dot.active { background: var(--accent); }
  .prompt { font-size: 18px; font-weight:600; margin-bottom: 16px; }
  input[type=text], input[type=email], textarea, select {
    width:100%; padding: 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);
    background: #0d0d10; color: var(--ink); font-size: 16px; margin-bottom: 20px;
  }
  textarea { min-height: 100px; resize: vertical; }
  .btn-row { display:flex; gap:10px; }
  button { flex:1; padding: 14px; border-radius: 10px; border:none; font-size:16px; font-weight:600; cursor:pointer; }
  .btn-next { background: var(--accent); color:#001318; }
  .btn-back { background: transparent; color: var(--muted); border: 1px solid rgba(255,255,255,0.15); }
  .spinner { text-align:center; padding: 40px 0; color: var(--muted); }
  .result-frame { width:100%; height: 50vh; border:none; border-radius: 12px; background:#fff; margin-bottom:16px; }
  .result-url { display:block; text-align:center; color: var(--accent); word-break: break-all; margin-bottom: 16px; }
  .result-text { white-space: pre-wrap; background:#0d0d10; border-radius:10px; padding:16px; font-size:14px; }
</style>
</head>
<body>
<header><h1>⚡ Quick Start</h1></header>
<main id="app"><div class="spinner">Loading...</div></main>

<script>
(function () {
  const app = document.getElementById('app');
  let useCases = [];
  let current = null;   // the selected use case object
  let step = 0;         // index into current.questions
  let answers = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadUseCases() {
    const res = await fetch('/api/quickstart/usecases');
    const data = await res.json();
    useCases = (data && data.useCases) || [];
    renderPicker();
  }

  function renderPicker() {
    current = null; step = 0; answers = {};
    app.innerHTML = `
      <div class="picker-grid">
        ${useCases.map((u, i) => `
          <button class="picker-item" data-idx="${i}">
            <span class="icon">${esc(u.icon || '✨')}</span>
            <span class="meta">
              <strong>${esc(u.label)}</strong>
              <span class="desc">${esc(u.description || '')}</span>
            </span>
          </button>
        `).join('')}
      </div>
    `;
    app.querySelectorAll('.picker-item').forEach((el) => {
      el.addEventListener('click', () => {
        current = useCases[Number(el.dataset.idx)];
        step = 0;
        renderQuestion();
      });
    });
  }

  function renderProgress() {
    const total = current.questions.length;
    return `<div class="progress">${current.questions.map((_, i) =>
      `<span class="dot${i <= step ? ' active' : ''}"></span>`).join('')}</div>`;
  }

  function renderQuestion() {
    const q = current.questions[step];
    let field;
    if (q.type === 'textarea') {
      field = `<textarea id="qfield" placeholder="${esc(q.placeholder || '')}">${esc(answers[q.key] || '')}</textarea>`;
    } else if (q.type === 'select') {
      field = `<select id="qfield">${q.options.map((o) =>
        `<option value="${esc(o.value)}" ${answers[q.key] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
      ).join('')}</select>`;
    } else {
      field = `<input type="${q.type === 'email' ? 'email' : 'text'}" id="qfield" placeholder="${esc(q.placeholder || '')}" value="${esc(answers[q.key] || '')}">`;
    }
    app.innerHTML = `
      <div class="card">
        ${renderProgress()}
        <div class="prompt">${esc(q.prompt)}</div>
        ${field}
        <div class="btn-row">
          <button class="btn-back" id="backBtn">${step === 0 ? 'Cancel' : 'Back'}</button>
          <button class="btn-next" id="nextBtn">${step === current.questions.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;
    document.getElementById('backBtn').addEventListener('click', () => {
      if (step === 0) { renderPicker(); return; }
      answers[q.key] = document.getElementById('qfield').value;
      step -= 1;
      renderQuestion();
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
      answers[q.key] = document.getElementById('qfield').value;
      if (step === current.questions.length - 1) {
        runUseCase();
      } else {
        step += 1;
        renderQuestion();
      }
    });
  }

  async function runUseCase() {
    app.innerHTML = '<div class="spinner">Working on it…</div>';
    try {
      const res = await fetch(`/api/quickstart/run/${encodeURIComponent(current.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Something went wrong');
      renderResult(data);
    } catch (e) {
      app.innerHTML = `<div class="card"><div class="prompt">Something went wrong</div><p>${esc(e.message)}</p>
        <div class="btn-row"><button class="btn-back" id="retryBtn">Start Over</button></div></div>`;
      document.getElementById('retryBtn').addEventListener('click', renderPicker);
    }
  }

  function renderResult(data) {
    let body = '';
    if (data.outputType === 'website') {
      body = `
        <iframe class="result-frame" srcdoc="${esc(data.previewHtml)}"></iframe>
        <a class="result-url" href="${esc(data.url)}" target="_blank">${esc(location.origin + data.url)}</a>
      `;
    } else {
      body = `<div class="result-text">${esc(data.content || '')}</div>`;
    }
    app.innerHTML = `
      <div class="card">
        <div class="prompt">🎉 Done!</div>
        ${body}
        <div class="btn-row"><button class="btn-next" id="againBtn">Make Another</button></div>
      </div>
    `;
    document.getElementById('againBtn').addEventListener('click', renderPicker);
  }

  loadUseCases();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify it's served**

Start the backend (`cd backend && node server-production.js`), wait for it to finish booting, then `curl -s http://localhost:3000/quickstart.html | grep -o "Quick Start"` (or the PowerShell equivalent `Select-String`) and confirm it matches. Kill the server after confirming.

- [ ] **Step 3: Commit**

```bash
git add public/quickstart.html
git commit -m "feat(quickstart): add mobile-first Quick Start wizard page"
```

---

### Task 5: Link Quick Start from the main dashboard

**Files:**
- Modify: `public/index.html` — add exactly one nav entry linking to `/quickstart.html`

**Interfaces:**
- Consumes: nothing new — this is a static link.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Find a suitable nav location**

Search `public/index.html` for the main top-level nav bar (the element containing the `onclick="showView(...)"` buttons referenced in earlier session research — 70 such calls exist). Identify one clearly top-level, always-visible nav container (not buried in a sub-tab).

- [ ] **Step 2: Add the link**

Add one new nav button/link that opens `/quickstart.html` in the same tab (plain `<a href="/quickstart.html">⚡ Quick Start</a>` styled to match the surrounding nav items' existing classes — copy the class names from an adjacent nav button so it inherits the current visual style rather than introducing new styling). Do not add any new JS function — this is a plain link, no `showView()` wiring needed since Quick Start is a standalone page, not an in-dashboard view.

- [ ] **Step 3: Verify with node --check**

Run the same inline-script extraction + `node --check` pattern used earlier this session (extract every `<script>` block except `type="importmap"` and check each with `new Function(...)`) to confirm the small HTML edit didn't break any script block's balance.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(quickstart): link Quick Start wizard from main dashboard nav"
```

---

## Self-Review Notes

- **Spec coverage:** mobile-first wizard UI (Task 4), use-case registry pattern (Task 2), one real flagship flow with live URL output (Tasks 1+3), BYOK/onboarding untouched (no task touches them), MCP already covers this once shipped (no task needed — confirmed in brainstorming, `shaddai_orchestrate` reaches new capability automatically since it goes through the same agent/LLM layer).
- **Type consistency checked:** `renderWebsite(answers)` signature (Task 1) matches the call site in Task 3's `quickstart-routes.js`. `USE_CASES` shape (Task 2) matches what Task 4's wizard UI reads (`icon`, `label`, `description`, `questions[].{key,prompt,type,options,placeholder}`). Response shape `{ok, outputType, url, previewHtml}` / `{ok, outputType, content}` produced in Task 3 matches exactly what Task 4's `renderResult()` reads.
- **No placeholders:** every step has real, complete code — no TBDs.
