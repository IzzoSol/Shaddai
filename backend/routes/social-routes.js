/**
 * Social Media Routes
 * - POST /api/social/post — Send signals to Telegram/Discord
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const { requireAdmin } = require('../auth-guard');

/**
 * POST /api/social/post
 * Body: { platform: 'telegram'|'discord', content: string }
 * Returns: { status: 'sent'|'error', message?: string }
 *
 * PIKADON: this posts arbitrary content to the REAL Telegram channel / Discord
 * webhook — admin-gated. requireAdmin fails CLOSED in production if ADMIN_TOKEN
 * is unset.
 */
router.post('/post', requireAdmin, async (req, res) => {
  try {
    const { platform, content } = req.body;

    if (!platform || !content) {
      return res.json({ status: 'error', message: 'Missing platform or content' });
    }

    if (platform === 'telegram') {
      return await postToTelegram(content, res);
    } else if (platform === 'discord') {
      return await postToDiscord(content, res);
    } else {
      return res.json({ status: 'error', message: 'Unsupported platform: ' + platform });
    }
  } catch (err) {
    console.error('[social] Error:', err.message);
    res.json({ status: 'error', message: err.message });
  }
});

/**
 * Post message to Telegram
 */
async function postToTelegram(content, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.json({
      status: 'error',
      message: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env'
    });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const data = JSON.stringify({
      chat_id: chatId,
      text: content,
      parse_mode: 'Markdown'
    });

    const promise = new Promise((resolve, reject) => {
      const postReq = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      }, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.ok) {
              resolve({ status: 'sent', messageId: parsed.result.message_id });
            } else {
              reject(new Error(parsed.description || 'Telegram API error'));
            }
          } catch (e) {
            reject(new Error('Failed to parse Telegram response'));
          }
        });
      });

      postReq.on('error', reject);
      postReq.write(data);
      postReq.end();
    });

    const result = await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Telegram timeout')), 8000)
      )
    ]);

    res.json(result);
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
}

/**
 * Post message to Discord
 */
async function postToDiscord(content, res) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.json({
      status: 'error',
      message: 'DISCORD_WEBHOOK_URL not set in .env'
    });
  }

  try {
    const data = JSON.stringify({
      content: content
    });

    const promise = new Promise((resolve, reject) => {
      const postReq = https.request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      }, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => {
          if (r.statusCode >= 200 && r.statusCode < 300) {
            resolve({ status: 'sent', statusCode: r.statusCode });
          } else {
            reject(new Error(`Discord returned ${r.statusCode}`));
          }
        });
      });

      postReq.on('error', reject);
      postReq.write(data);
      postReq.end();
    });

    const result = await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Discord timeout')), 8000)
      )
    ]);

    res.json(result);
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
}

module.exports = router;
