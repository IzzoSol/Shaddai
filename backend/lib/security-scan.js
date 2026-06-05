/**
 * security-scan.js — SHADDAI Security Engine (PIKADON)
 * Self-contained. Protects the dashboard AND the agents.
 *
 *   const { scanUrl, scanCode, scanSkill, router } = require('./lib/security-scan');
 *   app.use('/api/security', require('./lib/security-scan').router);
 *
 * Deps: node built-ins + axios (already a dependency). No new deps.
 */

'use strict';

const url = require('url');
const express = require('express');
let axios;
try { axios = require('axios'); } catch { axios = null; }

// ───────────────────────────── helpers ─────────────────────────────

const SUSPICIOUS_TLDS = ['.zip', '.mov', '.xyz', '.top', '.gq', '.tk', '.ml', '.cf', '.work', '.click', '.country', '.kim'];
const BAD_KEYWORDS = [
  'login-verify', 'account-update', 'secure-login', 'verify-account', 'confirm-account',
  'webscr', 'signin-update', 'wallet-connect', 'seed-phrase', 'private-key', 'airdrop-claim',
  'metamask', 'free-crypto', 'double-your', 'bonus-claim', 'reset-password-now'
];

function clampVerdictFromScore(score, lowMax, midMax) {
  // higher score = more dangerous
  if (score >= midMax) return 'dangerous';
  if (score >= lowMax) return 'suspicious';
  return 'safe';
}

function isRawIpHost(host) {
  if (!host) return false;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // bracketed IPv6
  if (/^\[?[0-9a-f:]+\]?$/i.test(host) && host.includes(':')) return true;
  return false;
}

// ───────────────────────────── scanUrl ─────────────────────────────

async function scanUrl(rawUrl) {
  const findings = [];
  let score = 0;
  const add = (severity, msg, pts) => { findings.push({ severity, msg }); score += pts; };

  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: rawUrl, verdict: 'dangerous', score: 100, findings: [{ severity: 'high', msg: 'No URL provided' }] };
  }

  let parsed;
  try {
    parsed = new url.URL(rawUrl);
  } catch {
    return { url: rawUrl, verdict: 'suspicious', score: 50, findings: [{ severity: 'medium', msg: 'URL could not be parsed' }] };
  }

  const host = (parsed.hostname || '').toLowerCase();

  // ── VirusTotal path (if key present) ──
  const vtKey = process.env.VIRUSTOTAL_API_KEY;
  if (vtKey && axios) {
    try {
      // VT v3: url id is base64url of the url, no padding
      const id = Buffer.from(rawUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const resp = await axios.get(`https://www.virustotal.com/api/v3/urls/${id}`, {
        headers: { 'x-apikey': vtKey },
        timeout: 8000,
        validateStatus: () => true
      });
      const stats = resp.data && resp.data.data && resp.data.data.attributes && resp.data.data.attributes.last_analysis_stats;
      if (stats) {
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        if (malicious > 0) add('high', `VirusTotal: ${malicious} engines flagged this URL as malicious`, 60 + malicious * 5);
        if (suspicious > 0) add('medium', `VirusTotal: ${suspicious} engines flagged this URL as suspicious`, 20 + suspicious * 3);
        if (malicious === 0 && suspicious === 0) add('low', 'VirusTotal: no engines flagged this URL', 0);
      } else {
        add('low', 'VirusTotal: no existing report for this URL (unscanned)', 5);
      }
    } catch {
      add('low', 'VirusTotal lookup failed — fell back to heuristics', 0);
    }
    // continue to heuristics too — defense in depth
  }

  // ── Heuristic checks ──
  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:') add('medium', 'Connection is not HTTPS (plaintext / MITM risk)', 20);
    else add('medium', `Unusual protocol "${parsed.protocol}"`, 25);
  }

  if (isRawIpHost(host)) add('medium', 'URL uses a raw IP address instead of a domain name', 25);

  for (const tld of SUSPICIOUS_TLDS) {
    if (host.endsWith(tld)) { add('medium', `Suspicious top-level domain "${tld}"`, 20); break; }
  }

  if (parsed.username || parsed.password || rawUrl.split('?')[0].includes('@')) {
    add('high', 'URL contains userinfo ("@") — common phishing obfuscation', 30);
  }

  if (host.includes('xn--') || /xn--/.test(rawUrl)) {
    add('medium', 'Punycode (xn--) in host — possible homograph/IDN spoofing', 25);
  }

  const subCount = host.split('.').length;
  if (!isRawIpHost(host) && subCount > 4) {
    add('low', `Excessive subdomains (${subCount} labels) — possible obfuscation`, 12);
  }

  const lowerUrl = rawUrl.toLowerCase();
  for (const kw of BAD_KEYWORDS) {
    if (lowerUrl.includes(kw)) { add('high', `Known-bad / phishing keyword in URL: "${kw}"`, 25); break; }
  }

  // ── Live header check (best-effort, never throws) ──
  if (axios) {
    try {
      const resp = await axios.request({
        url: rawUrl,
        method: 'head',
        timeout: 5000,
        maxRedirects: 3,
        validateStatus: () => true
      });
      const h = {};
      Object.keys(resp.headers || {}).forEach(k => { h[k.toLowerCase()] = resp.headers[k]; });

      if (!h['content-security-policy']) add('low', 'Missing Content-Security-Policy header', 8);
      if (!h['x-frame-options'] && !(h['content-security-policy'] || '').includes('frame-ancestors')) {
        add('low', 'Missing X-Frame-Options header (clickjacking risk)', 8);
      }
      if (parsed.protocol === 'https:' && !h['strict-transport-security']) {
        add('low', 'Missing Strict-Transport-Security (HSTS) header', 8);
      }
    } catch (e) {
      add('low', `Could not reach URL for header inspection (${e.code || e.message || 'error'})`, 5);
    }
  }

  if (!findings.length) findings.push({ severity: 'low', msg: 'No issues detected by heuristics' });

  return { url: rawUrl, verdict: clampVerdictFromScore(score, 15, 45), score, findings };
}

// ───────────────────────────── scanCode ─────────────────────────────

// [regex, severity, message]
const CODE_CHECKS = [
  // RCE / dynamic exec
  [/\beval\s*\(/,                                    'critical', 'eval() — arbitrary code execution'],
  [/\bnew\s+Function\s*\(/,                          'critical', 'new Function() — dynamic code execution'],
  [/\bexec(Sync)?\s*\(\s*[`'"][^`'"]*\$\{/,          'critical', 'Command injection — interpolated value in exec()'],
  [/\b(require\(\s*['"]child_process['"]\)|child_process)/, 'high', 'child_process usage — can run shell commands'],
  [/\b(exec|execSync|spawn|spawnSync|execFile)\s*\(/,'high',     'Process execution call (exec/spawn) — review command source'],

  // fs writes
  [/\bfs\.(write|append|unlink|rm|rmdir|mkdir|chmod|rename)[A-Za-z]*\s*\(/, 'high', 'Filesystem write/delete operation'],
  [/\brequire\(\s*['"]fs['"]\s*\)/,                  'low',      'fs module imported — verify file operations are scoped'],

  // hardcoded secrets
  [/\bsk-[A-Za-z0-9_\-]{8,}/,                        'critical', 'Hardcoded API secret (sk-... key pattern)'],
  [/\bAKIA[0-9A-Z]{12,}/,                            'critical', 'Hardcoded AWS access key (AKIA...)'],
  [/\b(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{12,}['"]/i, 'critical', 'Hardcoded credential assigned to a secret-named variable'],
  [/['"][0-9a-f]{40,}['"]/i,                         'high',     'Long hex literal — possible hardcoded secret/hash'],
  [/['"][A-Za-z0-9+/]{40,}={0,2}['"]/,               'medium',   'Long base64-like literal — possible embedded secret/blob'],

  // network exfil
  [/\b(fetch|axios|https?\.request|http\.get)\b[\s\S]{0,120}?(process\.env|apiKey|secret|token|password|privateKey)/i, 'high', 'Network call referencing a secret — possible data exfiltration'],

  // SQL injection (string concatenation into a query)
  [/(SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,80}?['"`]\s*\+/i,    'critical', 'SQL built via string concatenation — injection risk'],
  [/['"`]\s*\+[\s\S]{0,40}?(WHERE|VALUES|FROM)\b/i,           'critical', 'SQL fragment concatenated with a variable — injection risk'],
  [/\.query\s*\(\s*[`'"][^`'"]*\$\{/,                          'critical', 'Template literal interpolated into .query() — SQL injection'],

  // path traversal
  [/\.\.[\\/]/,                                       'high',     'Path traversal sequence ("../") detected'],

  // XSS
  [/\.innerHTML\s*=\s*[^;]*\+/,                       'high',     'innerHTML assigned via concatenation — XSS risk'],
  [/\.(outerHTML|innerHTML)\s*=\s*.*(\$\{|req\.|input|user)/i, 'high', 'innerHTML/outerHTML built from user input — XSS risk'],
  [/document\.write\s*\(/,                            'medium',   'document.write() — XSS risk'],

  // misc hardening
  [/rejectUnauthorized\s*:\s*false/,                 'high',     'TLS certificate validation disabled (rejectUnauthorized:false)'],
  [/process\.env\.[A-Z_]{3,}\s*=(?!=)/,              'medium',   'Overwriting an environment variable at runtime'],
];

const SEV_POINTS = { critical: 40, high: 25, medium: 12, low: 5 };

function lineOf(code, index) {
  if (index == null || index < 0) return undefined;
  return code.slice(0, index).split('\n').length;
}

function scanCode(code) {
  const findings = [];
  let score = 0;

  if (!code || typeof code !== 'string') {
    return { verdict: 'safe', score: 0, findings: [{ severity: 'low', msg: 'No code provided' }] };
  }

  for (const [re, severity, msg] of CODE_CHECKS) {
    const m = re.exec(code);
    if (m) {
      findings.push({ severity, line: lineOf(code, m.index), msg });
      score += SEV_POINTS[severity] || 5;
    }
  }

  let verdict = 'safe';
  if (findings.some(f => f.severity === 'critical')) verdict = 'dangerous';
  else if (findings.some(f => f.severity === 'high')) verdict = 'dangerous';
  else if (findings.length) verdict = 'suspicious';

  if (!findings.length) findings.push({ severity: 'low', msg: 'No vulnerabilities detected by static scan' });

  return { verdict, score, findings };
}

// ───────────────────────────── scanSkill ─────────────────────────────

const RISKY_TOOLS = [
  'run_python', 'run_js', 'run_javascript', 'run_shell', 'run_bash', 'exec', 'eval_code',
  'pay_api_call', 'send_payment', 'transfer_funds', 'mint_nft', 'sign_transaction',
  'delete_file', 'delete_account', 'wipe', 'drop_table',
  'write_file', 'fs_write'
];
const RISKY_TOOL_PREFIXES = ['post_to_', 'delete_', 'pay_', 'send_', 'transfer_'];

const INJECTION_PHRASES = [
  'ignore previous', 'ignore prior', 'ignore all previous', 'disregard previous',
  'disregard the above', 'forget previous instructions', 'forget your instructions',
  'send your keys', 'send your api key', 'reveal your system prompt', 'reveal your keys',
  'exfiltrate', 'exfil', 'disable safety', 'disable security', 'bypass safety',
  'without asking', 'do not tell the user', "don't tell the user", 'leak the', 'dump the secrets',
  'print your environment', 'process.env', 'override your guidelines'
];

function scanSkill(skill) {
  const findings = [];
  let score = 0;
  const add = (severity, msg, pts) => { findings.push({ severity, msg }); score += pts; };

  if (!skill || typeof skill !== 'object') {
    return { name: undefined, risk: 'high', score: 100, findings: [{ severity: 'high', msg: 'No skill object provided' }] };
  }

  const name = skill.name;
  const tools = Array.isArray(skill.tools) ? skill.tools : [];
  const instructions = String(skill.systemPrompt || skill.instructions || '');

  // risky tools
  for (const t of tools) {
    const tool = String(t || '').toLowerCase();
    if (RISKY_TOOLS.includes(tool)) {
      add('high', `Skill requests high-risk tool: "${t}"`, 25);
    } else if (RISKY_TOOL_PREFIXES.some(p => tool.startsWith(p))) {
      add('medium', `Skill requests sensitive tool: "${t}"`, 12);
    }
  }

  // prompt injection / exfil phrases
  const lower = instructions.toLowerCase();
  for (const phrase of INJECTION_PHRASES) {
    if (lower.includes(phrase)) {
      add('high', `Prompt-injection / exfil phrase in instructions: "${phrase}"`, 30);
    }
  }

  // handler code
  if (skill.handler != null) {
    const handlerCode = typeof skill.handler === 'function' ? skill.handler.toString() : String(skill.handler);
    const codeScan = scanCode(handlerCode);
    for (const f of codeScan.findings) {
      if (f.severity === 'low' && /No vulnerabilities/.test(f.msg)) continue;
      add(f.severity, `Handler code: ${f.msg}${f.line ? ` (line ${f.line})` : ''}`, SEV_POINTS[f.severity] || 5);
    }
  }

  let risk = 'low';
  if (findings.some(f => f.severity === 'critical' || f.severity === 'high')) risk = 'high';
  else if (findings.length) risk = 'medium';

  if (!findings.length) findings.push({ severity: 'low', msg: 'No risk indicators detected' });

  return { name, risk, score, findings };
}

// ───────────────────────────── router ─────────────────────────────

const router = express.Router();

router.post('/scan-url', async (req, res) => {
  try {
    const u = req.body && req.body.url;
    if (!u || typeof u !== 'string') return res.status(400).json({ error: 'Body must include a string "url"' });
    const result = await scanUrl(u);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed' });
  }
});

router.post('/scan-code', (req, res) => {
  try {
    const code = req.body && req.body.code;
    if (typeof code !== 'string') return res.status(400).json({ error: 'Body must include a string "code"' });
    return res.status(200).json(scanCode(code));
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed' });
  }
});

router.post('/scan-skill', (req, res) => {
  try {
    const skill = req.body && req.body.skill;
    if (!skill || typeof skill !== 'object') return res.status(400).json({ error: 'Body must include a "skill" object' });
    return res.status(200).json(scanSkill(skill));
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed' });
  }
});

module.exports = { scanUrl, scanCode, scanSkill, router };
