/**
 * SHADDAI AgentMail Guard — read/send email for the shaddai@agentmail.to inbox.
 *
 * Real API confirmed live 2026-08-30 (https://docs.agentmail.to): plain REST,
 * Bearer auth, base https://api.agentmail.to/v0. Inbox already exists:
 * shaddai@agentmail.to (organization_id/pod_id d2221d04-2c87-461b-b4c7-0c055ba8d19b).
 *
 * SENDING mail is a real-world action (an actual person receives it) — this file
 * only wraps the API calls; callers (routes/scripts) are responsible for the same
 * "explicit permission before sending" discipline as anywhere else in SHADDAI.
 * Nothing here auto-sends on require — it's inert until something calls sendReply.
 */
const BASE_URL = 'https://api.agentmail.to/v0';
const DEFAULT_INBOX = 'shaddai@agentmail.to';

function apiKey() { return process.env.AGENTMAIL_API_KEY || ''; }

async function call(path, method, body) {
  const key = apiKey();
  if (!key) return { ok: false, error: 'AGENTMAIL_API_KEY not set in backend/.env' };
  try {
    const res = await fetch(BASE_URL + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    if (!res.ok) return { ok: false, error: (json && json.message) || `HTTP ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** List messages in the SHADDAI inbox (newest per AgentMail's own ordering). */
async function listMessages(inboxId) {
  return call(`/inboxes/${encodeURIComponent(inboxId || DEFAULT_INBOX)}/messages`);
}

/** Get one message's full content (body, headers) by id. */
async function getMessage(inboxId, messageId) {
  return call(`/inboxes/${encodeURIComponent(inboxId || DEFAULT_INBOX)}/messages/${encodeURIComponent(messageId)}`);
}

/**
 * Send a NEW message (starts a fresh thread). Real email — a real person receives
 * this. Callers must have explicit confirmation before invoking this for anything
 * other than a reply the recipient is already expecting.
 */
async function sendMessage(inboxId, { to, subject, text, html, labels }) {
  if (!to || !subject || (!text && !html)) return { ok: false, error: '"to", "subject", and "text" or "html" are required' };
  return call(`/inboxes/${encodeURIComponent(inboxId || DEFAULT_INBOX)}/messages/send`, 'POST', { to, subject, text, html, labels });
}

/** Reply within an existing thread (keeps the conversation, not a new one). */
async function replyToMessage(inboxId, messageId, { text, html }) {
  if (!text && !html) return { ok: false, error: '"text" or "html" required' };
  return call(`/inboxes/${encodeURIComponent(inboxId || DEFAULT_INBOX)}/messages/${encodeURIComponent(messageId)}/reply`, 'POST', { text, html });
}

module.exports = { DEFAULT_INBOX, listMessages, getMessage, sendMessage, replyToMessage };
