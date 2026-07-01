/**
 * tool-selector.js — SHADDAI relevance-based tool selector
 *
 * PURPOSE
 *   The agent orchestration loop (backend/agent-engine.js) currently sends a
 *   FIXED ~14-tool catalog to the LLM on every iteration. Most of those tools
 *   are irrelevant to the current goal, which wastes prompt tokens. This module
 *   ranks the full TOOLS catalog by relevance to the goal so the loop can send
 *   only the most relevant subset.
 *
 * GUARANTEES
 *   - Pure: no side effects, no I/O, no mutation of inputs.
 *   - Zero dependencies: Node built-ins only (none actually needed).
 *   - Deterministic: same inputs -> same output (stable tie-break by index).
 *   - Never throws: tolerates missing/malformed fields, bad opts, non-arrays.
 *
 * API
 *   selectTools(goal, tools, opts = {}) -> Array (ranked subset of `tools`)
 *
 *   opts:
 *     max     (default 8)  max number of RANKED tools to return.
 *     min     (default 3)  always return at least this many (pad w/ top scorers).
 *     always  (default []) tool NAMES to pin to the front if present in `tools`.
 *     agent   (optional)   preferred agent; small score bonus if tool.agents
 *                          includes it (soft preference, not a hard filter).
 */

'use strict';

// Common words that carry no relevance signal. Lowercase, punctuation-stripped.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'for', 'is', 'in', 'with', 'your',
  'on', 'at', 'by', 'or', 'as', 'it', 'this', 'that', 'be', 'are', 'was',
  'i', 'me', 'my', 'we', 'you', 'do', 'does', 'what', 'whats', 'how', 'get',
  'from', 'into', 'out', 'up', 'so', 'if', 'then', 'can', 'will', 'about'
]);

// Weights for where a matching token appears.
const NAME_WEIGHT = 3;
const TEXT_WEIGHT = 1;
const AGENT_BONUS = 0.5;

/**
 * Tokenize free text into lowercase word tokens.
 * Matches the existing repo style: lowercase -> strip punctuation -> split.
 * @returns {string[]}
 */
function tokenize(text) {
  if (text == null) return [];
  let s;
  try {
    s = String(text);
  } catch (_) {
    return [];
  }
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(function (t) {
      return t.length > 0 && !STOPWORDS.has(t);
    });
}

/** Build a Set of unique tokens. */
function tokenSet(text) {
  return new Set(tokenize(text));
}

/**
 * Collect the searchable "text" portion of a tool (description + schema).
 * Name is handled separately because it is weighted higher.
 * @returns {string}
 */
function toolText(tool) {
  if (!tool || typeof tool !== 'object') return '';
  const parts = [];
  if (tool.description != null) parts.push(String(tool.description));
  const schema = tool.schema;
  if (schema && typeof schema === 'object') {
    for (const key in schema) {
      if (Object.prototype.hasOwnProperty.call(schema, key)) {
        parts.push(String(key));
        const v = schema[key];
        if (v != null) parts.push(String(v));
      }
    }
  }
  return parts.join(' ');
}

/** Safe tool name as a string (may be ''). */
function toolName(tool) {
  if (!tool || typeof tool !== 'object' || tool.name == null) return '';
  try {
    return String(tool.name);
  } catch (_) {
    return '';
  }
}

/**
 * Score a single tool against the goal token set.
 * @returns {number}
 */
function scoreTool(tool, goalTokens, agent) {
  let score = 0;

  const nameTokens = tokenSet(toolName(tool));
  for (const t of nameTokens) {
    if (goalTokens.has(t)) score += NAME_WEIGHT;
  }

  const textTokens = tokenSet(toolText(tool));
  for (const t of textTokens) {
    if (goalTokens.has(t)) score += TEXT_WEIGHT;
  }

  if (agent && tool && Array.isArray(tool.agents)) {
    if (tool.agents.indexOf(agent) !== -1) score += AGENT_BONUS;
  }

  return score;
}

/** Coerce a value to a finite non-negative integer with a fallback. */
function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i < 0 ? 0 : i;
}

/**
 * Select the most relevant tools for a goal.
 * @param {string} goal
 * @param {Array<object>} tools
 * @param {object} [opts]
 * @returns {Array<object>}
 */
function selectTools(goal, tools, opts) {
  // Defensive normalization — never throw.
  if (!Array.isArray(tools)) return [];
  const options = opts && typeof opts === 'object' ? opts : {};

  const max = toInt(options.max, 8);
  let min = toInt(options.min, 3);
  const always = Array.isArray(options.always) ? options.always : [];
  const agent = typeof options.agent === 'string' ? options.agent : null;

  // min should never exceed available tools.
  if (min > tools.length) min = tools.length;

  // Resolve always-included tools (preserve first occurrence, original order).
  const alwaysNames = new Set();
  for (const a of always) {
    if (a != null) alwaysNames.add(String(a));
  }
  const pinned = [];
  const pinnedIdx = new Set();
  if (alwaysNames.size > 0) {
    for (let i = 0; i < tools.length; i++) {
      const nm = toolName(tools[i]);
      if (nm && alwaysNames.has(nm) && !pinnedIdx.has(i)) {
        pinned.push(tools[i]);
        pinnedIdx.add(i);
      }
    }
  }

  const goalStr = goal == null ? '' : String(goal);
  const hasSignal = goalStr.trim().length > 0;

  // No ranking signal: return the first N tools unchanged (excluding nothing).
  if (!hasSignal) {
    const count = Math.max(min, Math.min(max, tools.length));
    // Still honor `always`: pin them to front, then fill from the head.
    if (pinned.length === 0) {
      return tools.slice(0, count);
    }
    const out = pinned.slice();
    for (let i = 0; i < tools.length && out.length < count + pinned.length; i++) {
      if (!pinnedIdx.has(i)) out.push(tools[i]);
    }
    return out;
  }

  const goalTokens = tokenSet(goalStr);

  // Score every non-pinned tool.
  const scored = [];
  for (let i = 0; i < tools.length; i++) {
    if (pinnedIdx.has(i)) continue;
    scored.push({ tool: tools[i], score: scoreTool(tools[i], goalTokens, agent), idx: i });
  }

  // Sort by score desc, stable tie-break by original index asc.
  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });

  // How many ranked tools to keep. At least `min` (padding with score-0
  // entries), at most `max`. `min` counts pinned tools too.
  const minRanked = Math.max(0, min - pinned.length);
  const keep = Math.max(minRanked, Math.min(max, scored.length));

  const ranked = scored.slice(0, keep).map(function (s) {
    return s.tool;
  });

  return pinned.concat(ranked);
}

module.exports = { selectTools, tokenize };
