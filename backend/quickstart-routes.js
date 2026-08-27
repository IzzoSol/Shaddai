'use strict';
// Quick Start wizard API — mounted with no prefix (routes declare their own /api/quickstart/... paths),
// matching how coin-launch-routes.js is mounted in server-production.js.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const json = express.json();

const { verifyFirebaseToken, rateLimit } = require('./auth-guard');

const { USE_CASES } = require('./quickstart-usecases');
const { renderWebsite, slugify } = require('./lib/website-generator');

let callLLM = null;
try { ({ callLLM } = require('./llm-client')); } catch (_) {}

const SITES_DIR = path.join(__dirname, '..', 'public', 'sites');

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

// The run endpoint writes files to disk, so it is both identified and rate limited.
// verifyFirebaseToken sets req.userId from a verified Firebase ID token and hard-blocks
// unidentified callers when REQUIRE_AUTH=true (production); locally, with REQUIRE_AUTH
// unset, it falls back to the x-user-id header so dev tooling keeps working.
// Listing use cases above stays public — it reveals nothing and writes nothing.
router.post('/api/quickstart/run/:id',
  rateLimit({ windowMs: 60000, max: 10 }),
  verifyFirebaseToken,
  json,
  async (req, res) => {
  const useCase = findUseCase(req.params.id);
  if (!useCase) return res.status(404).json({ ok: false, error: 'Unknown use case' });

  const answers = (req.body && req.body.answers) || {};

  if (useCase.id === 'make-website') {
    const siteName = String(answers.siteName || '').trim();
    if (!siteName) return res.status(400).json({ ok: false, error: 'siteName is required' });

    const dirName = siteDirName(siteName, req.userId);
    const sections = await expandSections(answers.about, siteName);
    const html = renderWebsite({ ...answers, siteName, sections });

    const dir = path.join(SITES_DIR, dirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');

    return res.json({ ok: true, outputType: 'website', url: `/sites/${dirName}/`, previewHtml: html });
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
