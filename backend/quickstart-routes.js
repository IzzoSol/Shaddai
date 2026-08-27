'use strict';
// Quick Start wizard API — mounted with no prefix (routes declare their own /api/quickstart/... paths),
// matching how coin-launch-routes.js is mounted in server-production.js.
//
// One generic runner serves the whole catalog: a use case supplies a system instruction
// and a template, the chosen agent supplies the voice, and the answers fill the blanks.
// Adding a use case means adding data to quickstart-usecases.js — no handler to write.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const json = express.json();

const { verifyFirebaseToken, rateLimit } = require('./auth-guard');
const { USE_CASES, CATEGORIES, publicCatalog } = require('./quickstart-usecases');
const { renderWebsite, slugify } = require('./lib/website-generator');
const { listAgents, resolveAgent, systemPromptFor } = require('./lib/agent-registry');

let callLLM = null;
try { ({ callLLM } = require('./llm-client')); } catch (_) {}

const SITES_DIR = path.join(__dirname, '..', 'public', 'sites');
const LLM_TIMEOUT_MS = 30000;

function findUseCase(id) {
  return USE_CASES.find((u) => u.id === id) || null;
}

// Every generated site lives at `<slug>-<ownerTag>`, where ownerTag is a short stable
// hash of the caller's user id. Two people who both name their site "Coffee Shop" get
// two different directories, so neither can silently overwrite the other; the SAME
// person regenerating that name lands back on their own directory (an update, not a
// duplicate). The hash is hex only, so the caller's id can never influence the path
// shape even if it contains slashes or dots.
function ownerTag(userId) {
  return crypto.createHash('sha256').update(String(userId || 'anon')).digest('hex').slice(0, 8);
}

function siteDirName(siteName, userId) {
  return `${slugify(siteName)}-${ownerTag(userId)}`;
}

// Fill `{key}` placeholders from the user's answers. Missing answers become an explicit
// "(not provided)" rather than a stray literal `{key}`, so the model is never handed a
// placeholder it might echo back into the output.
function fillTemplate(template, answers) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    const v = answers[key];
    return (v == null || String(v).trim() === '') ? '(not provided)' : String(v).trim();
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
  ]);
}

// Run one text-output use case as the chosen agent.
async function runTextUseCase(useCase, agent, answers) {
  if (!callLLM) {
    const err = new Error('No AI provider is connected yet. Add a Groq or OpenAI key, or point at a local Ollama, then try again.');
    err.userFacing = true;
    throw err;
  }
  const system = systemPromptFor(agent, useCase.system);
  const user = fillTemplate(useCase.template, answers);

  const r = await withTimeout(
    callLLM(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { agentName: agent.isCustom ? 'SHADDAI' : agent.name, maxTokens: 2000 }
    ),
    LLM_TIMEOUT_MS,
    'That took too long. Try again, or shorten what you pasted in.'
  );

  const content = (r && r.content) ? String(r.content).trim() : '';
  if (!content) {
    const err = new Error('The agent came back empty. Try again.');
    err.userFacing = true;
    throw err;
  }
  return content;
}

// Ask the acting agent to expand a short "about" blurb into 2-3 section paragraphs.
// Falls back to splitting the about text itself if the LLM is unavailable — building a
// website must never hard-fail just because no provider is connected.
async function expandSections(about, siteName, agent) {
  if (callLLM) {
    try {
      const r = await withTimeout(
        callLLM([
          { role: 'system', content: systemPromptFor(agent, 'You write short, punchy website section copy. Reply ONLY with a JSON array of 2-3 short strings (1-2 sentences each). No preamble, no markdown.') },
          { role: 'user', content: `Site: ${siteName}\nAbout: ${about}\n\nWrite 2-3 short website sections expanding on this.` },
        ], { agentName: agent.isCustom ? 'SHADDAI' : agent.name, maxTokens: 400 }),
        9000, 'llm-timeout'
      );
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

// ── Catalog ────────────────────────────────────────────────────────────────────
// Public: reveals nothing sensitive and writes nothing. Prompt wording is stripped by
// publicCatalog() so the client sees only identity and questions.
router.get('/api/quickstart/usecases', (req, res) => {
  res.json({ ok: true, useCases: publicCatalog(), categories: CATEGORIES });
});

// Who can run a job — the council plus the caller's forged agents.
router.get('/api/quickstart/agents', (req, res) => {
  res.json({ ok: true, agents: listAgents() });
});

// ── Runner ─────────────────────────────────────────────────────────────────────
// Writes files and spends LLM tokens, so it is both identified and rate limited.
// verifyFirebaseToken sets req.userId from a verified Firebase ID token and hard-blocks
// unidentified callers when REQUIRE_AUTH=true (production); locally, with REQUIRE_AUTH
// unset, it falls back to the x-user-id header so dev tooling keeps working.
router.post('/api/quickstart/run/:id',
  rateLimit({ windowMs: 60000, max: 10 }),
  verifyFirebaseToken,
  json,
  async (req, res) => {
    const useCase = findUseCase(req.params.id);
    if (!useCase) return res.status(404).json({ ok: false, error: 'Unknown use case' });

    const answers = (req.body && req.body.answers) || {};
    const agent = resolveAgent(req.body && req.body.agentId);
    const agentStamp = { id: agent.id, name: agent.name, emoji: agent.emoji, accent: agent.accent };

    try {
      if (useCase.outputType === 'website') {
        const siteName = String(answers.siteName || '').trim();
        if (!siteName) return res.status(400).json({ ok: false, error: 'siteName is required' });

        const dirName = siteDirName(siteName, req.userId);
        const sections = await expandSections(answers.about, siteName, agent);
        const html = renderWebsite({ ...answers, siteName, sections, agent });

        const dir = path.join(SITES_DIR, dirName);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');

        return res.json({
          ok: true, outputType: 'website', url: `/sites/${dirName}/`,
          previewHtml: html, agent: agentStamp,
        });
      }

      const content = await runTextUseCase(useCase, agent, answers);
      return res.json({ ok: true, outputType: 'text', content, agent: agentStamp });
    } catch (e) {
      // userFacing errors are written for the person reading them; anything else is an
      // internal fault and gets a generic message rather than leaking a stack detail.
      const msg = e && (e.userFacing || /took too long/i.test(e.message))
        ? e.message
        : 'Something went wrong running that. Try again.';
      if (!e || !e.userFacing) console.warn('[quickstart] run failed:', e && e.message);
      return res.status(502).json({ ok: false, error: msg });
    }
  });

module.exports = router;
