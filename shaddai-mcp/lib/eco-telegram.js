// Telegram spine — one @ShaddaiHall bot, users bind chat_id. Zero-dep (raw
// fetch to api.telegram.org). Auto-loads TELEGRAM_BOT_TOKEN + TELEGRAM_HALL_CHAT_ID
// from backend/.env. Everything degrades to a clear note when no token is set.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const BINDS = path.join(DATA, 'eco-telegram.json');

(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line.trim());
        if (m && /^(TELEGRAM_)/.test(m[1]) && (process.env[m[1]] === undefined || process.env[m[1]] === '')) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          process.env[m[1]] = v;
        }
      }
    }
  } catch (_) {}
})();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HALL = process.env.TELEGRAM_HALL_CHAT_ID || '';
function ready() { return TOKEN ? null : 'TELEGRAM_BOT_TOKEN not set (put it in backend/.env). Sending to Telegram disabled.'; }
function bind(userId, chatId) {
  const d = loadBinds();
  d.chats[String(userId)] = { chat_id: String(chatId), bound_at: new Date().toISOString() };
  saveBinds(d);
  return d.chats[String(userId)];
}
function chatFor(userId) {
  const d = loadBinds();
  return (d.chats[String(userId)] && d.chats[String(userId)].chat_id) || HALL || null;
}
function loadBinds() { try { return JSON.parse(fs.readFileSync(BINDS, 'utf8')) || { chats: {} }; } catch (_) { return { chats: {} }; } }
function saveBinds(d) { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(BINDS, JSON.stringify(d, null, 2)); return true; } catch (_) { return false; } }

async function post(text, chatId) {
  const err = ready();
  if (err) return { error: err };
  const id = chatId || HALL;
  if (!id) return { error: 'no chat target — pass chat_id or set TELEGRAM_HALL_CHAT_ID, or bind a user via hall_bind' };
  try {
    const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: id, text: String(text).slice(0, 4000), parse_mode: 'Markdown', disable_web_page_preview: true }), signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    return j.ok ? { ok: true, chat_id: id, message_id: j.result && j.result.message_id } : { error: 'telegram returned: ' + JSON.stringify(j).slice(0, 200) };
  } catch (e) { return { error: 'telegram post failed: ' + ((e && e.message) || e) }; }
}

module.exports = { ready, bind, chatFor, post, HALL, TOKEN };