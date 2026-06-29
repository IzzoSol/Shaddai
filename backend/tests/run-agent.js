#!/usr/bin/env node
/**
 * SHADDAI Agent Test Runner
 * Usage: node run-agent.js <agentName> <prompt>
 *        node run-agent.js zerox "What is the BTC price?"
 *
 * Also works as a promptfoo exec provider — promptfoo passes the rendered
 * prompt as the last CLI argument and reads stdout as the response.
 *
 * Flow:
 *   1. POST to /api/agent/run  → get taskId
 *   2. Poll  /api/agent/status/:taskId every 2s (up to 30s timeout)
 *   3. Print final output to stdout
 */

'use strict';

const BASE_URL = process.env.SHADDAI_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 30000;

// ── Argument parsing ──────────────────────────────────────────────────────────
// When called by promptfoo the full rendered prompt is the last arg.
// When called manually: node run-agent.js <agent> <prompt...>
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node run-agent.js [agentName] <prompt>');
  console.error('  agentName defaults to SHADDAI if omitted.');
  process.exit(1);
}

// Detect if first arg looks like an agent name (single word, no spaces, ≤12 chars)
const KNOWN_AGENTS = ['shaddai','zerox','oracle','nexus','turtle','quill','pikadon'];
let agentName = 'SHADDAI';
let promptText = '';

if (args.length === 1) {
  // Just a prompt, no agent prefix
  promptText = args[0];
} else {
  const maybeAgent = args[0].toLowerCase().replace(/[^a-z]/g, '');
  if (KNOWN_AGENTS.includes(maybeAgent)) {
    agentName = args[0].toUpperCase();
    promptText = args.slice(1).join(' ');
  } else {
    // First word might be embedded in prompt (e.g. "ZEROX What is BTC?")
    promptText = args.join(' ');
  }
}

// Also check if the prompt itself starts with an agent name
const firstWord = promptText.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
if (KNOWN_AGENTS.includes(firstWord)) {
  agentName = promptText.split(/\s+/)[0].toUpperCase();
  promptText = promptText.split(/\s+/).slice(1).join(' ');
}

// ── HTTP helpers (native fetch, Node 18+) ────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Sleep helper ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  // Step 1: Submit task
  let taskId;
  let submitData;
  try {
    submitData = await post('/api/agent/run', {
      agent: agentName,
      prompt: promptText,
      userId: 'test-runner',
      sessionId: `test-${Date.now()}`
    });
    taskId = submitData.taskId || submitData.id || submitData.task_id;
  } catch (err) {
    // Some backends return the result immediately (synchronous mode)
    // Check if the error response contains a result
    process.stderr.write(`[run-agent] Submit error: ${err.message}\n`);
    process.exit(1);
  }

  // If the response already contains the final output (sync mode), print and exit
  const immediateResult = submitData.result || submitData.output || submitData.response || submitData.content;
  if (immediateResult && typeof immediateResult === 'string' && immediateResult.length > 5) {
    process.stdout.write(immediateResult);
    process.exit(0);
  }

  if (!taskId) {
    // No taskId and no immediate result — try to extract any text
    const fallback = JSON.stringify(submitData);
    process.stdout.write(fallback);
    process.exit(0);
  }

  // Step 2: Poll for result
  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    let statusData;
    try {
      statusData = await get(`/api/agent/status/${taskId}`);
    } catch (err) {
      process.stderr.write(`[run-agent] Poll error: ${err.message}\n`);
      continue;
    }

    const status = statusData.status || statusData.state || '';
    const result = statusData.result || statusData.output || statusData.response || statusData.content;

    if (status === 'done' || status === 'complete' || status === 'completed' || status === 'success') {
      const output = typeof result === 'string' ? result : JSON.stringify(result);
      process.stdout.write(output);
      process.exit(0);
    }

    if (status === 'error' || status === 'failed' || status === 'failure') {
      const errMsg = statusData.error || statusData.message || JSON.stringify(statusData);
      process.stderr.write(`[run-agent] Task failed: ${errMsg}\n`);
      // Still output whatever we got so promptfoo can evaluate partial results
      if (result) process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result));
      process.exit(1);
    }

    // Still pending/running — continue polling
    process.stderr.write(`[run-agent] Status: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)\n`);
  }

  // Timeout
  process.stderr.write(`[run-agent] Timeout after ${TIMEOUT_MS / 1000}s waiting for task ${taskId}\n`);
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`[run-agent] Fatal: ${err.message}\n`);
  process.exit(1);
});
