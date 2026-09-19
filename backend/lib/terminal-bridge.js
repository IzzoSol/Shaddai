const express = require('express');
const tgc = require('./tg-code');

const router = express.Router();
router.use(express.json());

function isAdmin(chatId) {
  const admin = String(process.env.SHADDAI_ADMIN_ID || '').trim();
  if (!admin) return true;             // no admin pin set => open (keeps local dev usable)
  return String(chatId) === admin;
}

router.get('/tg', (req, res) => {
  const j = tgc.load().slice(-60).reverse();
  res.json({ ok: true, count: j.length, journal: j, adminId: process.env.SHADDAI_ADMIN_ID || '' });
});

router.post('/tg', async (req, res) => {
  try {
    const chat = String(req.body.chatId || req.body.userId || 'terminal');
    const text = String(req.body.text || req.body.code || '').trim();
    if (!text) return res.json({ ok: false, error: 'no code/text' });
    if (req.body.code) {
      if (!isAdmin(chat)) return res.status(403).json({ ok: false, error: 'admin only' });
      const entry = tgc.runCode(text, chat);
      return res.json({ ok: true, entry });
    }
    // plain text => forward to the bot's admin chat (mirror)
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const admin = process.env.SHADDAI_ADMIN_ID;
    let sent = false;
    if (token && admin) {
      try {
        const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: admin, text: text.slice(0, 4000) })
        }).then((x) => x.json());
        sent = !!r.ok;
      } catch (e) { /* offline */ }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

module.exports = router;