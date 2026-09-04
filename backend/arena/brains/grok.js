'use strict';
// ============================================================================
// arena/brains/grok.js - Optional GROK_API_KEY brain (JSON-only act, 7s timeout).
// Falls back to MockBrain when no key set. Never leaks systemPrompt to output.
// ============================================================================
const mock = require('./mock');

const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-fast';

// Public "agent charter" — what we tell the model it is playing. This is a
// ruleset briefing, NOT the BotCard.systemPrompt (which stays server-side only).
function briefing(rulesetId) {
  switch (rulesetId) {
    case 'rps': return 'You play Rock Paper Scissors. Reply JSON {"type":"throw","payload":{"hand":"rock"|"paper"|"scissors"}}.';
    case 'hi-lo': return 'You guess a secret 1-100. Reply JSON {"type":"guess","payload":{"n":<1-100>}}.';
    case 'trivia-5': return 'You answer a multiple-choice question. Reply JSON {"type":"answer","payload":{"i":<0-3>}}.';
    case 'chess': return 'You play chess as ' + (/*seat injected below*/ '') + 'the active colour. The "legalMoves" list in your private view are your ONLY legal moves (from/to algebraic squares). Pick a strong one. Reply JSON {"type":"move","payload":{"from":"<sq>","to":"<sq>","promotion":null}}.';
    default: return 'Reply a JSON act.';
  }
}

async function act(view, profile) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return mock.act(view, profile);

  const loadoutLine = (profile && profile.loadout && profile.loadout.length)
    ? 'Your skill loadout: ' + profile.loadout.map(s => s.name + ' (' + s.hint + ')').join(', ')
    : 'Your skill loadout: balanced (no identity traits defined)';

  const prompt = [
    briefing(view.rulesetId),
    'Ruleset id: ' + view.rulesetId,
    loadoutLine,
    'Public view: ' + JSON.stringify(view.public),
    'Private view (your own): ' + JSON.stringify(view.private || {}),
    'Play to your strengths. Respond with ONLY valid JSON.'
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const resp = await fetch(GROK_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100
      })
    });
    const data = await resp.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return JSON.parse(content);
  } catch (_) {
    return mock.act(view); // timeout / parse error / no key -> fallback
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { id: 'grok', act };
