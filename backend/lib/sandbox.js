'use strict';
const vm = require('vm');

const MAX_CODE_LENGTH = 10000;

/**
 * Run untrusted JavaScript and capture console output.
 *
 * SECURITY NOTE: this uses Node's `vm`, which is NOT a hard security boundary
 * (constructor tricks can theoretically escape). isolated-vm is the intended
 * backend but requires a C++ toolchain unavailable in this environment.
 * Therefore callers MUST gate this behind requireAdmin until a container/isolate
 * runner replaces it. See SHADDAI_REMAINING_WORK.md.
 *
 * @param {string} code
 * @param {{timeoutMs?:number}} [opts]
 * @returns {Promise<{success:boolean, output:string[], error:string|null}>}
 */
async function runSandboxedJs(code, { timeoutMs = 3000 } = {}) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
    return { success: false, output: [], error: `code must be a string ≤ ${MAX_CODE_LENGTH} characters` };
  }
  const output = [];
  // null-prototype sandbox — no require, process, global, fetch, timers.
  const sandbox = Object.create(null);
  sandbox.Math = Math;
  sandbox.JSON = JSON;
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.output = output;   // skills push return values here; included in result.output
  sandbox.console = Object.freeze({
    log:   (...a) => output.push(a.map(String).join(' ')),
    error: (...a) => output.push('ERR: '  + a.map(String).join(' ')),
    warn:  (...a) => output.push('WARN: ' + a.map(String).join(' ')),
  });
  try {
    vm.runInNewContext(code, sandbox, { timeout: timeoutMs });
    return { success: true, output, error: null };
  } catch (e) {
    return { success: false, output, error: e.message };
  }
}

module.exports = { runSandboxedJs, MAX_CODE_LENGTH, IS_HARD_ISOLATE: false };
