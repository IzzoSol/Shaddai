'use strict';

/**
 * SHADDAI tools-social.js
 * Real X/Twitter + Telegram tools for SHADDAI agents.
 * Inspired by nirholas/XActions — the "post to X/TG" end of the agent workflow.
 *
 * Self-contained. No new npm deps — uses axios (already a dep) + node crypto.
 *
 * Register from your wiring file with:
 *   Object.assign(TOOLS, require('./tools-social'));
 *
 * Tools:
 *   search_x         — read recent tweets   (needs X_BEARER_TOKEN, app-only bearer)
 *   get_x_profile    — fetch a user by handle (needs X_BEARER_TOKEN)
 *   post_to_x        — post a tweet          (needs OAuth1.0a user context:
 *                       X_API_KEY + X_API_SECRET + X_ACCESS_TOKEN + X_ACCESS_SECRET)
 *   post_to_telegram — send a Telegram message (needs TELEGRAM_BOT_TOKEN)
 */

const axios  = require('axios');
const crypto = require('crypto');
// BYOK fallback: env vars win, then keys saved via POST /api/social/keys
// (backend/data/social-keys.json, gitignored). Honest needsAuth when neither is set.
const socialKeys = require('./social-keys');

// ─── helpers ────────────────────────────────────────────────────────────────

/** Wrap a promise so it rejects after `ms` milliseconds (mirrors tools-extra.js). */
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    )
  ]);
}

/** RFC-3986 percent-encoding required by OAuth1.0a. */
function pctEncode(str) {
  return encodeURIComponent(String(str)).replace(
    /[!*'()]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * Build an OAuth 1.0a `Authorization` header (HMAC-SHA1) for a request.
 * Self-contained — uses only node crypto. `params` are extra OAuth params
 * (none needed for a JSON-body POST since the body is not form-encoded).
 */
function buildOAuth1Header({ method, url, consumerKey, consumerSecret, token, tokenSecret, params = {} }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
    ...params
  };

  // Signature base string: collect + sort all params (oauth + query), encode.
  const allParams = { ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${pctEncode(k)}=${pctEncode(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    pctEncode(url),
    pctEncode(paramString)
  ].join('&');

  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${pctEncode(k)}="${pctEncode(oauthParams[k])}"`)
    .join(', ');

  return header;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry (plain object, ready for Object.assign into TOOLS)
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  search_x: {
    name: 'search_x',
    description: 'Search recent (last ~7 days) tweets on X/Twitter via API v2 (GET /2/tweets/search/recent). App-only bearer token works for read. Returns top matching tweets with text, author and metrics.',
    schema: {
      query: 'string — X search query, e.g. "solana airdrop -is:retweet lang:en"',
      limit: 'number — max results 10-100 (default 10)'
    },
    agents: ['ORACLE', 'ZEROX', 'PIKADON'],
    async execute({ query, limit = 10 } = {}) {
      const bearer = socialKeys.getXKeys().bearer;
      if (!bearer) {
        return JSON.stringify({
          success: false,
          needsKey: true,
          error: 'Reading X needs X_BEARER_TOKEN (app-only bearer) in backend/.env — create one at developer.x.com'
        });
      }
      if (!query) return JSON.stringify({ success: false, error: 'query is required' });

      // X API requires max_results between 10 and 100.
      const max = Math.min(Math.max(parseInt(limit, 10) || 10, 10), 100);
      try {
        const resp = await withTimeout(
          axios.get('https://api.x.com/2/tweets/search/recent', {
            params: {
              query,
              max_results: max,
              'tweet.fields': 'created_at,public_metrics,author_id,lang',
              expansions: 'author_id',
              'user.fields': 'username,name'
            },
            timeout: 12000,
            headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': 'SHADDAI-Agent/2.0' }
          }),
          14000
        );

        const data  = resp.data || {};
        const users = {};
        (data.includes?.users || []).forEach(u => { users[u.id] = u; });

        const results = (data.data || []).map(t => ({
          id: t.id,
          text: t.text,
          author: users[t.author_id]
            ? { username: users[t.author_id].username, name: users[t.author_id].name }
            : { author_id: t.author_id },
          created_at: t.created_at || null,
          lang: t.lang || null,
          metrics: t.public_metrics || {},
          url: users[t.author_id]
            ? `https://x.com/${users[t.author_id].username}/status/${t.id}`
            : `https://x.com/i/web/status/${t.id}`
        }));

        return JSON.stringify({
          success: true,
          query,
          returned: results.length,
          resultCount: data.meta?.result_count ?? results.length,
          results
        });
      } catch (err) {
        const detail = err.response?.data || err.message;
        return JSON.stringify({
          success: false,
          status: err.response?.status || null,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
      }
    }
  },

  get_x_profile: {
    name: 'get_x_profile',
    description: 'Fetch an X/Twitter user profile by @username via API v2 (GET /2/users/by/username/:name). App-only bearer token works. Returns name, bio, follower/following counts and verified status.',
    schema: {
      username: 'string — handle without the @, e.g. "jack"'
    },
    agents: ['ORACLE', 'ZEROX'],
    async execute({ username } = {}) {
      const bearer = socialKeys.getXKeys().bearer;
      if (!bearer) {
        return JSON.stringify({
          success: false,
          needsKey: true,
          error: 'Reading X needs X_BEARER_TOKEN (app-only bearer) in backend/.env — create one at developer.x.com'
        });
      }
      if (!username) return JSON.stringify({ success: false, error: 'username is required' });

      const handle = String(username).replace(/^@/, '').trim();
      try {
        const resp = await withTimeout(
          axios.get(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`, {
            params: {
              'user.fields': 'description,public_metrics,verified,created_at,location,url,profile_image_url'
            },
            timeout: 12000,
            headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': 'SHADDAI-Agent/2.0' }
          }),
          14000
        );

        const u = resp.data?.data;
        if (!u) {
          return JSON.stringify({ success: false, error: `User @${handle} not found`, raw: resp.data || null });
        }

        return JSON.stringify({
          success: true,
          id: u.id,
          username: u.username,
          name: u.name,
          bio: u.description || '',
          verified: !!u.verified,
          location: u.location || '',
          url: u.url || '',
          created_at: u.created_at || null,
          metrics: u.public_metrics || {},
          profileUrl: `https://x.com/${u.username}`
        });
      } catch (err) {
        const detail = err.response?.data || err.message;
        return JSON.stringify({
          success: false,
          status: err.response?.status || null,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
      }
    }
  },

  post_to_x: {
    name: 'post_to_x',
    description: 'Post a tweet to X/Twitter (POST /2/tweets). Posting requires OAuth1.0a USER context: X_API_KEY + X_API_SECRET + X_ACCESS_TOKEN + X_ACCESS_SECRET. Without the user tokens it returns a clean needsAuth error and never fakes a post.',
    schema: {
      text: 'string — tweet content (max 280 chars)',
      reply_to: 'string — optional tweet ID to reply to'
    },
    agents: ['QUILL', 'TURTLE', 'SHADDAI'],
    async execute({ text, reply_to } = {}) {
      const _xk = socialKeys.getXKeys();
      const consumerKey    = _xk.apiKey;
      const consumerSecret = _xk.apiSecret;
      const accessToken    = _xk.accessToken;
      const accessSecret   = _xk.accessSecret;

      // Posting is a USER-context action — app-only bearer cannot do it.
      if (!accessToken || !accessSecret) {
        return JSON.stringify({
          success: false,
          needsAuth: true,
          error: 'Posting needs X_ACCESS_TOKEN + X_ACCESS_SECRET (OAuth1.0a user context) in backend/.env'
        });
      }
      if (!consumerKey || !consumerSecret) {
        return JSON.stringify({
          success: false,
          needsAuth: true,
          error: 'Posting needs X_API_KEY + X_API_SECRET (OAuth1.0a app credentials) in backend/.env'
        });
      }
      if (!text || !String(text).trim()) {
        return JSON.stringify({ success: false, error: 'text is required' });
      }
      if (String(text).length > 280) {
        return JSON.stringify({ success: false, error: `text exceeds 280 chars (${text.length})` });
      }

      const url = 'https://api.x.com/2/tweets';
      const body = { text: String(text) };
      if (reply_to) body.reply = { in_reply_to_tweet_id: String(reply_to) };

      try {
        // OAuth1.0a header. JSON body is NOT included in the signature base
        // (only the method + URL + oauth params), which is correct for v2 JSON posts.
        const authHeader = buildOAuth1Header({
          method: 'POST',
          url,
          consumerKey,
          consumerSecret,
          token: accessToken,
          tokenSecret: accessSecret
        });

        const resp = await withTimeout(
          axios.post(url, body, {
            timeout: 12000,
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
              'User-Agent': 'SHADDAI-Agent/2.0'
            }
          }),
          14000
        );

        const d = resp.data?.data || {};
        return JSON.stringify({
          success: true,
          id: d.id || null,
          text: d.text || body.text,
          url: d.id ? `https://x.com/i/web/status/${d.id}` : null
        });
      } catch (err) {
        const detail = err.response?.data || err.message;
        return JSON.stringify({
          success: false,
          status: err.response?.status || null,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
      }
    }
  },

  post_to_telegram: {
    name: 'post_to_telegram',
    description: 'Send a message to a Telegram chat/channel via the Bot API (POST /bot<token>/sendMessage). Requires TELEGRAM_BOT_TOKEN; chat_id comes from the arg or TELEGRAM_CHAT_ID. Supports HTML/Markdown parse modes.',
    schema: {
      message: 'string — message text to send',
      chat_id: 'string — optional chat/channel id; falls back to TELEGRAM_CHAT_ID',
      parse_mode: 'string — optional: HTML, Markdown, or MarkdownV2'
    },
    agents: ['QUILL', 'SHADDAI', 'PIKADON'],
    async execute({ message, chat_id, parse_mode } = {}) {
      const _tg = socialKeys.getTelegramKeys();
      const token = _tg.botToken;
      if (!token) {
        return JSON.stringify({
          success: false,
          needsKey: true,
          error: 'Telegram posting needs TELEGRAM_BOT_TOKEN in backend/.env — create a bot via @BotFather'
        });
      }

      const chatId = chat_id || _tg.chatId;
      if (!chatId) {
        return JSON.stringify({
          success: false,
          needsKey: true,
          error: 'No chat_id — pass chat_id or set TELEGRAM_CHAT_ID in backend/.env'
        });
      }
      if (!message || !String(message).trim()) {
        return JSON.stringify({ success: false, error: 'message is required' });
      }

      const payload = { chat_id: chatId, text: String(message) };
      if (parse_mode) payload.parse_mode = parse_mode;

      try {
        const resp = await withTimeout(
          axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          }),
          12000
        );

        const r = resp.data || {};
        return JSON.stringify({
          success: !!r.ok,
          messageId: r.result?.message_id || null,
          chatId,
          date: r.result?.date || null
        });
      } catch (err) {
        const detail = err.response?.data || err.message;
        return JSON.stringify({
          success: false,
          status: err.response?.status || null,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
      }
    }
  }

};
