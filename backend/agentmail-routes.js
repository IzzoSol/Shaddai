// backend/agentmail-routes.js — mounted at /api/agentmail. Lets people email SHADDAI
// (shaddai@agentmail.to) and get a real, RAG-grounded reply — but SENDING is gated
// behind a draft-then-approve step, same pattern as pay-guard.js/paybox-guard.js:
// checkForNewMail() drafts a reply and parks it; a human approves before anything
// actually sends to a real person. Nothing here auto-sends.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const json = express.json();
let mail = null; try { mail = require('./agentmail-guard'); } catch (e) { console.warn('[agentmail-routes] agentmail-guard unavailable:', e.message); }

const STATE_PATH = path.join(__dirname, 'data', 'agentmail-state.json');   // { lastCheckedAt }
const DRAFTS_PATH = path.join(__dirname, 'data', 'agentmail-drafts.json'); // pending drafted replies

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function writeJson(p, v) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); }

function getDrafts() { return readJson(DRAFTS_PATH, []); }
function addDraft(d) {
  const list = getDrafts();
  const draft = { id: 'am_' + Date.now().toString(36), status: 'pending', ...d };
  list.push(draft);
  writeJson(DRAFTS_PATH, list);
  return draft;
}
function setDraftStatus(id, status) {
  const list = getDrafts();
  const d = list.find(x => x.id === id);
  if (!d) return null;
  d.status = status;
  writeJson(DRAFTS_PATH, list);
  return d;
}

/** Scan for mail received since the last check, draft a RAG-grounded SHADDAI reply for each. */
async function checkForNewMail() {
  if (!mail) return { ok: false, error: 'agentmail-guard unavailable' };
  const state = readJson(STATE_PATH, { lastCheckedAt: null });
  const r = await mail.listMessages();
  if (!r.ok) return r;
  const messages = (r.data && r.data.messages) || [];
  const since = state.lastCheckedAt ? new Date(state.lastCheckedAt).getTime() : 0;
  const existingDraftIds = new Set(getDrafts().map(d => d.message_id));
  const fresh = messages.filter(m => new Date(m.timestamp).getTime() > since && !existingDraftIds.has(m.message_id));

  const drafted = [];
  for (const m of fresh) {
    const full = await mail.getMessage(mail.DEFAULT_INBOX, m.message_id);
    const body = (full.ok && full.data && (full.data.text || full.data.preview)) || m.preview || '';
    let replyText = '';
    try {
      const { modelChat } = require('./agent-engine');
      const resp = await modelChat(
        [{ role: 'user', content: `Someone emailed SHADDAI. Subject: "${m.subject || '(no subject)'}"\n\n${body.slice(0, 2000)}\n\nWrite a helpful, concise email reply as SHADDAI.` }],
        'SHADDAI', {}
      );
      replyText = (resp && resp.content) || '';
    } catch (e) { replyText = ''; }
    const draft = addDraft({ message_id: m.message_id, from: m.from, subject: m.subject, received_body: body.slice(0, 1000), reply_text: replyText, drafted_at: new Date().toISOString() });
    drafted.push(draft);
  }
  writeJson(STATE_PATH, { lastCheckedAt: new Date().toISOString() });
  return { ok: true, checked: messages.length, drafted: drafted.length, drafts: drafted };
}

// POST /api/agentmail/check — scan inbox, draft replies (does NOT send anything)
router.post('/check', json, async (req, res) => {
  const r = await checkForNewMail();
  res.json(r);
});

// GET /api/agentmail/pending — drafted replies awaiting human approval
router.get('/pending', (req, res) => {
  res.json({ ok: true, pending: getDrafts().filter(d => d.status === 'pending') });
});

// POST /api/agentmail/approve { id, decision, edited_text? } — send (or deny) a drafted reply
router.post('/approve', json, async (req, res) => {
  const { id, decision, edited_text } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const list = getDrafts();
  const draft = list.find(x => x.id === id);
  if (!draft) return res.status(404).json({ ok: false, error: 'draft not found' });
  if (draft.status !== 'pending') return res.status(400).json({ ok: false, error: `already ${draft.status}` });

  if (decision === 'deny') { setDraftStatus(id, 'denied'); return res.json({ ok: true, status: 'denied' }); }

  const text = (edited_text || draft.reply_text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'no reply text to send' });
  const r = await mail.replyToMessage(mail.DEFAULT_INBOX, draft.message_id, { text });
  if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
  setDraftStatus(id, 'sent');
  res.json({ ok: true, status: 'sent', result: r.data });
});

// GET /api/agentmail/messages — raw inbox listing (admin/dashboard view)
router.get('/messages', async (req, res) => {
  if (!mail) return res.status(501).json({ ok: false, error: 'agentmail-guard unavailable' });
  const r = await mail.listMessages();
  res.json(r);
});

module.exports = router;
