/**
 * context-compress.js
 * -------------------
 * Deterministic context-compaction utilities for the SHADDAI agent engine.
 *
 * The agent engine runs an LLM orchestration loop (up to 4 iterations). The whole
 * OpenAI-style `messages` array is re-sent on every iteration, so large tool
 * outputs (JSON market lists, news feeds, search results) get paid for again and
 * again. These helpers shrink the payload BEFORE an LLM call without losing the
 * important recent context (system prompt + most recent user turn + last N msgs).
 *
 * Design guarantees:
 *   - PURE / DETERMINISTIC: same input -> same output, no clocks/randomness.
 *   - NEVER THROWS: all functions are wrapped to fall back gracefully.
 *   - NON-MUTATING: inputs are never modified; new arrays/objects are returned.
 *   - ZERO DEPENDENCIES: Node built-ins only.
 */

'use strict';

/**
 * estimateTokens(str) -> integer
 * Rough token estimate ~ ceil(length / 4). Tolerates non-strings (coerced via
 * String()), and null/undefined -> 0. Result is always an integer >= 0.
 */
function estimateTokens(str) {
  try {
    if (str === null || str === undefined) return 0;
    const s = typeof str === 'string' ? str : String(str);
    if (s.length === 0) return 0;
    return Math.max(0, Math.ceil(s.length / 4));
  } catch (_e) {
    return 0;
  }
}

/**
 * compressToolOutput(content, maxChars = 800) -> string
 * Shrinks a single tool/message content string.
 *   - If content length <= maxChars, returned as-is (coerced to string).
 *   - If it parses as a JSON ARRAY: keep the first K items whose serialized form
 *     stays under maxChars, append "… (+N more items omitted)".
 *   - Otherwise: keep head (~70% of maxChars) + tail (~25% of maxChars) joined by
 *     "\n…[compressed N chars]…\n".
 * Always returns a string. Never throws.
 */
function compressToolOutput(content, maxChars = 800) {
  try {
    const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 800;
    const s = typeof content === 'string' ? content : safeStringify(content);

    if (s.length <= limit) return s;

    // Try JSON array path.
    const arrResult = tryCompressJsonArray(s, limit);
    if (arrResult !== null) return arrResult;

    // Fallback: head + tail truncation.
    return headTailTruncate(s, limit);
  } catch (_e) {
    // Absolute last resort: hard slice.
    try {
      return String(content).slice(0, 800);
    } catch (_e2) {
      return '';
    }
  }
}

/**
 * compactHistory(messages, opts = {}) -> { messages, before, after, saved }
 * Compresses older/oversized messages while keeping important context full.
 *
 * opts.budget     (default 3000): estimated-token threshold. If the whole history
 *                                 is already under budget, return an unchanged copy.
 * opts.keepRecent (default 4):    most recent N messages kept FULL.
 * opts.maxChars   (default 800):  per-message compression target.
 *
 * Always keeps the first `system` message full and the most recent `user`
 * message full. Returns a NEW array; input is never mutated.
 */
function compactHistory(messages, opts = {}) {
  try {
    if (!Array.isArray(messages)) {
      return { messages: [], before: 0, after: 0, saved: 0 };
    }

    const budget = numOr(opts.budget, 3000);
    const keepRecent = Math.max(0, numOr(opts.keepRecent, 4));
    const maxChars = numOr(opts.maxChars, 800);

    const before = totalTokens(messages);

    // Already under budget -> return an unchanged (deep-ish) copy.
    if (before <= budget) {
      const copy = messages.map(cloneMessage);
      return { messages: copy, before, after: before, saved: 0 };
    }

    const n = messages.length;
    const recentStart = Math.max(0, n - keepRecent);

    // Index of the first system message (kept full).
    const firstSystemIdx = messages.findIndex(
      (m) => m && m.role === 'system'
    );

    // Index of the most recent user message (kept full).
    let lastUserIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    const out = messages.map((msg, i) => {
      const clone = cloneMessage(msg);

      // Protected: recent window, first system, last user.
      if (i >= recentStart || i === firstSystemIdx || i === lastUserIdx) {
        return clone;
      }

      if (!msg || typeof msg !== 'object') return clone;

      const content = msg.content;
      const isTool = msg.role === 'tool';

      // Only compress string content; leave structured content alone.
      if (typeof content !== 'string') {
        return clone;
      }

      const tooLong = content.length > maxChars;
      if (isTool || tooLong) {
        clone.content = compressToolOutput(content, maxChars);
      }
      return clone;
    });

    const after = totalTokens(out);
    return { messages: out, before, after, saved: before - after };
  } catch (_e) {
    // Never throw: return a safe copy.
    const safe = Array.isArray(messages) ? messages.map(cloneMessage) : [];
    const t = totalTokens(safe);
    return { messages: safe, before: t, after: t, saved: 0 };
  }
}

/* ------------------------------- helpers ------------------------------- */

function numOr(v, dflt) {
  return Number.isFinite(v) ? v : dflt;
}

function safeStringify(v) {
  try {
    if (v === null || v === undefined) return '';
    return JSON.stringify(v);
  } catch (_e) {
    try {
      return String(v);
    } catch (_e2) {
      return '';
    }
  }
}

function cloneMessage(msg) {
  if (msg === null || typeof msg !== 'object') return msg;
  // Shallow clone is enough to avoid mutating the original message object's
  // top-level fields (we only reassign `content`). Nested structures are not
  // mutated by this module.
  return Object.assign({}, msg);
}

function messageContentLength(msg) {
  if (!msg || typeof msg !== 'object') return 0;
  const c = msg.content;
  if (typeof c === 'string') return c.length;
  return safeStringify(c).length;
}

function totalTokens(messages) {
  let sum = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') {
      sum += estimateTokens(m);
      continue;
    }
    const c = m.content;
    sum += typeof c === 'string' ? estimateTokens(c) : estimateTokens(safeStringify(c));
    // Account for tool_calls payloads if present.
    if (m.tool_calls) sum += estimateTokens(safeStringify(m.tool_calls));
  }
  return sum;
}

function tryCompressJsonArray(s, limit) {
  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (_e) {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0) return null;

  // Grow the kept slice until adding the next item would exceed the limit
  // (leaving room for the marker).
  let kept = [];
  for (let i = 0; i < parsed.length; i++) {
    const candidate = parsed.slice(0, i + 1);
    const omitted = parsed.length - candidate.length;
    const marker = omitted > 0 ? ` … (+${omitted} more items omitted)` : '';
    const serialized = safeStringify(candidate) + marker;
    if (serialized.length > limit && kept.length > 0) {
      break;
    }
    kept = candidate;
    if (serialized.length > limit) {
      // Even a single item overflows; stop here to keep at least one.
      break;
    }
  }

  const omitted = parsed.length - kept.length;
  const marker = omitted > 0 ? ` … (+${omitted} more items omitted)` : '';
  return safeStringify(kept) + marker;
}

function headTailTruncate(s, limit) {
  const headLen = Math.max(1, Math.floor(limit * 0.7));
  const tailLen = Math.max(0, Math.floor(limit * 0.25));
  const head = s.slice(0, headLen);
  const tail = tailLen > 0 ? s.slice(s.length - tailLen) : '';
  const removed = s.length - head.length - tail.length;
  if (removed <= 0) return s;
  return `${head}\n…[compressed ${removed} chars]…\n${tail}`;
}

module.exports = {
  estimateTokens,
  compressToolOutput,
  compactHistory,
};
