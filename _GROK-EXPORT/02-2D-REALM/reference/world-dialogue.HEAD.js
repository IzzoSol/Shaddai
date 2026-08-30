/* world-dialogue.js — SHADDAI World in-world agent dialogue system
 * Key: T — "Talk to <NAME>"  (E is already taken by building ENTER / EXIT)
 *
 * API (set by the lead after loading this script):
 *   const dialogue = window.buildWorldDialogue({ agents, getPlayer, onHire });
 *   // each frame:
 *   dialogue.update(dt);
 *   const agent = dialogue.nearestAgent(playerPos.x, playerPos.z);
 *   // on T keydown (when not open):
 *   if (agent) dialogue.open(agent.code);
 *   // movement gate:
 *   if (dialogue.isOpen()) { /* skip movement keys *\/ }
 *
 * agents  = [{ code, name, role, color, skills:[], portrait }]
 * getPlayer() → { x, z }
 * onHire(code) = optional callback
 */
(function (root) {
  'use strict';

  /* ── TALK RADIUS ─────────────────────────────────────────────────────────── */
  var TALK_RADIUS = 14;  // world units from building pos centre

  /* ── PER-AGENT GREETING LINES (personality-matched one-liners) ──────────── */
  var GREETINGS = {
    SHADDAI: 'Every empire begins with a single decision — let\'s make yours count.',
    NEXUS:   'Simple, testable, scalable — that\'s how we build things that last.',
    ZEROX:   'Show me your numbers and I\'ll show you exactly where the money\'s hiding.',
    ORACLE:  'The answer already exists — we just haven\'t looked in the right place yet.',
    TURTLE:  'Good design isn\'t decoration; it\'s the difference between ignored and loved.',
    QUILL:   'The right words at the right moment can open any door.',
    PIKADON: 'I\'ve already found three ways this could go wrong — want to hear them?'
  };

  /* ── CANNED FALLBACK REPLIES (shown when /api/agent/run is unavailable) ─── */
  var CANNED = {
    SHADDAI: 'Strategically speaking, every move you make either narrows or widens the path to dominance. What\'s your next play?',
    NEXUS:   'Break it down: what\'s the input, what\'s the expected output, and what\'s broken in between? We fix from there.',
    ZEROX:   'Every dollar has a job. Let\'s make sure yours is working overtime. What\'s your current monthly recurring revenue?',
    ORACLE:  'Interesting query. Cross-referencing known data patterns… the signal is definitely there if you know where to look.',
    TURTLE:  'Aesthetics and function converge at the limit. Tell me — what does the user feel the first second they see it?',
    QUILL:   'Clarity first, elegance second. Say it plainly to me right now — then we\'ll make it sing on the page.',
    PIKADON: 'Before I answer that, I need to know: who else currently has access to this information? Threat model first.'
  };

  /* ── ROLE LABELS (fallback if agents array omits role) ──────────────────── */
  var DEFAULT_ROLES = {
    SHADDAI: 'Supreme Orchestrator',
    NEXUS:   'Technical Architect',
    ZEROX:   'Wealth & Revenue Engine',
    ORACLE:  'Research & Intelligence',
    TURTLE:  'UI/UX & Creative',
    QUILL:   'Writing & Communication',
    PIKADON: 'Security & Compliance'
  };

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  var PANEL_CSS = [
    '#sdp-root{position:fixed;inset:0;z-index:9800;display:none;pointer-events:none;}',
    '#sdp-root.sdp-open{display:flex;align-items:center;justify-content:center;pointer-events:all;}',
