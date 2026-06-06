/**
 * security-scan.js — SHADDAI Security Engine (PIKADON)
 * Self-contained, PURE, defensive. Protects the dashboard AND the agents/skills.
 *
 *   const { scanUrl, scanCode, scanSkill, router } = require('./lib/security-scan');
 *   app.use('/api/security', require('./lib/security-scan').router);
 *
 * Deps: node built-ins + express only. No network calls (real local heuristics).
 * Every function is pure + defensive: bad input becomes a finding, never a throw.
 *
 * Finding shape (uniform across all scanners):
 *   { severity: 'low'|'medium'|'high'|'critical', code: 'STABLE_CODE', message: 'human text', line?: number }
 *
 * Result shapes:
 *   scanUrl(url)     -> { url, findings, score, verdict }
 *   scanCode(code)   -> { findings, score, verdict }
 *   scanSkill(skill) -> { name, findings, score, verdict, risk }
 */

'use strict';

const nodeUrl = require('url');
const express = require('express');

// ───────────────────────────── scoring / verdict ─────────────────────────────

const SEV_POINTS = { critical: 40, high: 25, medium: 12, low: 5 };

// score -> verdict. higher score = more dangerous.
function verdictFromScore(score, findings) {
  if (findings.some(f => f.severity === 'critical' || f.severity === 'high')) return 'dangerous';
  if (score >= 45) return 'dangerous';
  if (score >= 15 || findings.some(f => f.severity === 'medium')) return 'suspicious';
  return 'safe';
}

// ───────────────────────────── shared net helpers ─────────────────────────────

const SUSPICIOUS_TLDS = [
  '.zip', '.mov', '.xyz', '.top', '.gq', '.tk', '.ml', '.cf',
  '.work', '.click', '.country', '.kim', '.cam', '.rest', '.fit'
];

// phishing / scam keyword fragments commonly seen in malicious URLs
const BAD_URL_KEYWORDS = [
  'login-verify', 'account-update', 'secure-login', 'verify-account', 'confirm-account',
  'webscr', 'signin-update', 'wallet-connect', 'seed-phrase', 'private-key', 'airdrop-claim',
  'metamask', 'free-crypto', 'double-your', 'bonus-claim', 'reset-password-now', 'claim-reward'
];

// URL shorteners / open redirectors — chained risk + obscured destination
const REDIRECTORS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'lnkd.in', 'tiny.cc', 'soo.gd'
];

function isRawIpHost(host) {
  if (!host) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;          // IPv4
  if (host.includes(':') && /^\[?[0-9a-f:]+\]?$/i.test(host)) return true; // IPv6
  return false;
}

// Detect private / loopback / link-local / reserved hosts — SSRF risk.
function privateHostReason(host) {
  if (!host) return null;
  const h = host.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return 'resolves to a local/internal host';
  }

  // IPv6 loopback / link-local / unique-local
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return 'IPv6 loopback (::1)';
  if (/^fe80:/i.test(h)) return 'IPv6 link-local (fe80::/10)';
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return 'IPv6 unique-local (fc00::/7)';

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some(n => n > 255)) return null;
    if (o[0] === 127) return 'loopback (127.0.0.0/8)';
    if (o[0] === 10) return 'private network (10.0.0.0/8)';
    if (o[0] === 192 && o[1] === 168) return 'private network (192.168.0.0/16)';
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return 'private network (172.16.0.0/12)';
    if (o[0] === 169 && o[1] === 254) return 'link-local / cloud metadata (169.254.0.0/16)';
    if (o[0] === 0) return 'reserved "this network" (0.0.0.0/8)';
    if (o[0] >= 224) return 'multicast / reserved address space';
  }
  return null;
}

// ───────────────────────────── scanUrl ─────────────────────────────

function scanUrl(rawUrl) {
  const findings = [];
  let score = 0;
  const add = (severity, code, message) => {
    findings.push({ severity, code, message });
    score += SEV_POINTS[severity] || 5;
  };

  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: rawUrl == null ? null : String(rawUrl), score: 100, verdict: 'dangerous',
      findings: [{ severity: 'high', code: 'URL_MISSING', message: 'No URL string provided' }] };
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    parsed = new nodeUrl.URL(trimmed);
  } catch {
    return { url: rawUrl, score: 50, verdict: 'suspicious',
      findings: [{ severity: 'medium', code: 'URL_UNPARSEABLE', message: 'URL could not be parsed as a valid URL' }] };
  }

  const host = (parsed.hostname || '').toLowerCase();

  // ── TLS / protocol ──
  if (parsed.protocol === 'http:') {
    add('medium', 'NO_TLS', 'Connection is plaintext HTTP (no TLS) — vulnerable to interception/MITM');
  } else if (parsed.protocol !== 'https:') {
    add('high', 'UNUSUAL_SCHEME', `Non-web protocol "${parsed.protocol}" — review intent (file/ftp/data/javascript schemes are risky)`);
  }
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) {
    add('critical', 'SCRIPT_SCHEME', 'javascript:/data: URI — can execute arbitrary code in a client context');
  }

  // ── SSRF / private hosts ──
  const privateReason = privateHostReason(host);
  if (privateReason) {
    add('high', 'SSRF_PRIVATE_HOST', `Targets a non-public host — ${privateReason} (SSRF risk if fetched server-side)`);
  }

  // ── raw IP host ──
  if (isRawIpHost(host) && !privateReason) {
    add('medium', 'RAW_IP_HOST', 'URL uses a raw IP address instead of a domain name');
  } else if (isRawIpHost(host)) {
    add('low', 'RAW_IP_HOST', 'URL uses a raw IP address instead of a domain name');
  }

  // ── userinfo (user:pass@host) ──
  if (parsed.username || parsed.password) {
    add('high', 'URL_USERINFO', 'URL embeds credentials/userinfo before "@" — classic phishing obfuscation');
  } else if (/^[a-z][a-z0-9+.\-]*:\/\/[^/?#]*@/i.test(trimmed)) {
    add('high', 'URL_USERINFO', 'URL contains an "@" in the authority — possible host-spoofing obfuscation');
  }

  // ── suspicious TLD ──
  for (const tld of SUSPICIOUS_TLDS) {
    if (host.endsWith(tld)) { add('medium', 'SUSPICIOUS_TLD', `Suspicious / abuse-prone top-level domain "${tld}"`); break; }
  }

  // ── punycode / homograph ──
  if (/(^|\.)xn--/.test(host)) {
    add('medium', 'PUNYCODE_HOST', 'Punycode (xn--) label in host — possible IDN homograph spoofing');
  }

  // ── open redirector / shortener ──
  if (REDIRECTORS.includes(host)) {
    add('medium', 'URL_SHORTENER', `Known URL shortener/redirector "${host}" — true destination is hidden`);
  }
  // chained redirect params pointing off-site
  const redirParam = /(?:[?&])(?:url|redirect|redirect_uri|next|dest|destination|continue|return|returnurl|goto|out|target)=https?(?:%3a|:)/i;
  if (redirParam.test(trimmed)) {
    add('medium', 'OPEN_REDIRECT_PARAM', 'Query parameter carries another http(s) URL — open-redirect / redirector chain');
  }

  // ── excessive subdomains (obfuscation) ──
  const labelCount = host.split('.').filter(Boolean).length;
  if (!isRawIpHost(host) && labelCount > 4) {
    add('low', 'EXCESSIVE_SUBDOMAINS', `Excessive subdomain depth (${labelCount} labels) — common obfuscation tactic`);
  }

  // ── encoded/percent-heavy or overlong URL ──
  if (((trimmed.match(/%[0-9a-f]{2}/gi) || []).length) >= 8) {
    add('low', 'HEAVY_ENCODING', 'Heavy percent-encoding in URL — possible filter evasion/obfuscation');
  }
  if (trimmed.length > 2000) {
    add('low', 'OVERLONG_URL', `Unusually long URL (${trimmed.length} chars) — possible obfuscation or payload smuggling`);
  }

  // ── known-bad phishing keywords ──
  const lowerUrl = trimmed.toLowerCase();
  for (const kw of BAD_URL_KEYWORDS) {
    if (lowerUrl.includes(kw)) { add('high', 'PHISHING_KEYWORD', `Known phishing/scam keyword in URL: "${kw}"`); break; }
  }

  if (!findings.length) {
    findings.push({ severity: 'low', code: 'CLEAN', message: 'No issues detected by URL heuristics' });
  }

  return { url: rawUrl, findings, score, verdict: verdictFromScore(score, findings) };
}

// ───────────────────────────── scanCode ─────────────────────────────

// [regex, severity, code, message]
const CODE_CHECKS = [
  // ── dynamic code execution / RCE ──
  [/\beval\s*\(/,                                       'critical', 'EVAL',            'eval() — arbitrary code execution'],
  [/\bnew\s+Function\s*\(/,                             'critical', 'NEW_FUNCTION',    'new Function() — dynamic code construction/execution'],
  [/\b(setTimeout|setInterval)\s*\(\s*['"`]/,           'high',     'STRING_TIMER',    'setTimeout/setInterval called with a string — implicit eval'],
  [/\b(exec|execSync)\s*\(\s*[`'"][^`'"]*\$\{/,         'critical', 'EXEC_INJECTION',  'Interpolated value passed to exec() — command injection'],
  [/require\(\s*['"]child_process['"]\s*\)/,            'high',     'CHILD_PROCESS',   'child_process imported — can spawn shell commands'],
  [/\b(execSync|exec|spawnSync|spawn|execFileSync|execFile)\s*\(/, 'high', 'PROCESS_EXEC', 'Process execution call (exec/spawn) — review command source'],
  [/\bimport\s*\(\s*[`'"]?\s*\$\{/,                     'high',     'DYNAMIC_IMPORT',  'Dynamic import() with interpolated specifier — code-loading risk'],

  // ── filesystem ──
  [/\bfs\.(write|append|unlink|rm|rmdir|mkdir|chmod|chown|rename|truncate)[A-Za-z]*\s*\(/, 'high', 'FS_WRITE', 'Filesystem write/delete/permission operation (verify it is sandboxed)'],
  [/require\(\s*['"]fs(\/promises)?['"]\s*\)/,          'low',      'FS_IMPORT',       'fs module imported — confirm file access is scoped to a sandbox'],
  [/\.\.[\\/]/,                                         'high',     'PATH_TRAVERSAL',  'Path traversal sequence ("../") — may escape the sandbox'],

  // ── hardcoded secrets ──
  [/\bsk-[A-Za-z0-9_\-]{16,}/,                          'critical', 'SECRET_OPENAI',   'Hardcoded API secret (sk-... key pattern)'],
  [/\bAKIA[0-9A-Z]{12,}/,                               'critical', 'SECRET_AWS',      'Hardcoded AWS access key id (AKIA...)'],
  [/-----BEGIN(?:\s+\w+)?\s+PRIVATE KEY-----/,          'critical', 'PRIVATE_KEY',     'Embedded PEM private key block'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/,                      'critical', 'SECRET_GITHUB',   'Hardcoded GitHub token (ghp_/gho_/... pattern)'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/,                    'critical', 'SECRET_SLACK',    'Hardcoded Slack token (xox...)'],
  [/\b(api[_-]?key|apikey|secret|password|passwd|token|access[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i, 'critical', 'SECRET_ASSIGNMENT', 'Credential hardcoded into a secret-named variable'],
  // BIP-39 style seed phrase (12+ lowercase words in a quoted string)
  [/['"`](?:\s*[a-z]{3,8}\b){11,}['"`]/i,               'critical', 'SEED_PHRASE',     'Possible mnemonic seed phrase (long sequence of words) hardcoded'],

  // ── obfuscation ──
  [/['"`][A-Za-z0-9+/]{60,}={0,2}['"`]/,                'medium',   'BASE64_BLOB',     'Long base64-like literal — possible embedded payload/secret'],
  [/['"`](?:0x)?[0-9a-f]{48,}['"`]/i,                   'medium',   'HEX_BLOB',        'Long hex literal — possible embedded payload/secret/hash'],
  [/(?:\\x[0-9a-f]{2}){8,}/i,                           'high',     'HEX_ESCAPE_OBFUSCATION', 'Run of \\xNN escape sequences — obfuscated string/payload'],
  [/(?:\\u[0-9a-f]{4}){8,}/i,                           'medium',   'UNICODE_ESCAPE_OBFUSCATION', 'Run of \\uXXXX escape sequences — obfuscated string'],
  [/String\.fromCharCode\s*\(\s*(?:\d+\s*,\s*){6,}/,    'high',     'FROMCHARCODE_OBFUSCATION', 'String.fromCharCode with many codes — obfuscated string assembly'],
  [/\b(atob|unescape)\s*\(/,                            'low',      'DECODE_CALL',     'atob()/unescape() — decodes data at runtime (often paired with eval)'],

  // ── prototype pollution ──
  [/\[\s*['"]__proto__['"]\s*\]/,                       'high',     'PROTO_POLLUTION', 'Bracket access to "__proto__" — prototype pollution risk'],
  [/\b__proto__\s*[:=]/,                                'high',     'PROTO_POLLUTION', 'Assignment to __proto__ — prototype pollution risk'],
  [/(constructor\s*\.\s*prototype|\[\s*['"](?:constructor|prototype)['"]\s*\])/, 'medium', 'PROTO_CHAIN_ACCESS', 'Access to constructor/prototype — review for prototype pollution'],

  // ── network exfiltration ──
  [/\b(fetch|axios|https?\.request|http\.get|XMLHttpRequest|navigator\.sendBeacon)\b[\s\S]{0,160}?(process\.env|apiKey|api_key|secret|token|password|privateKey|mnemonic|seed)/i, 'high', 'EXFIL_SECRET', 'Network call referencing a secret/env value — possible data exfiltration'],

  // ── SQL injection ──
  [/(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}?['"`]\s*\+/i,  'critical', 'SQL_CONCAT', 'SQL statement built via string concatenation — injection risk'],
  [/['"`]\s*\+[\s\S]{0,40}?\b(WHERE|VALUES|FROM|SET)\b/i,      'critical', 'SQL_CONCAT', 'SQL fragment concatenated with a variable — injection risk'],
  [/\.query\s*\(\s*[`'"][^`'"]*\$\{/,                          'critical', 'SQL_TEMPLATE', 'Template literal interpolated into .query() — SQL injection'],

  // ── XSS ──
  [/\.(innerHTML|outerHTML)\s*=\s*[^;]*(\+|\$\{|req\.|input|user)/i, 'high', 'XSS_HTML_SINK', 'innerHTML/outerHTML built from concatenation or user input — XSS risk'],
  [/document\.write\s*\(/,                              'medium',   'DOCUMENT_WRITE',  'document.write() — XSS risk'],
  [/\$\([^)]*\)\.html\s*\(\s*[^)]*(\+|\$\{|input|user)/i, 'high',   'JQUERY_HTML_SINK','jQuery .html() built from user input — XSS risk'],

  // ── TLS / hardening ──
  [/rejectUnauthorized\s*:\s*false/,                    'high',     'TLS_DISABLED',    'TLS certificate validation disabled (rejectUnauthorized:false)'],
  [/NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*['"]?0/,      'high',     'TLS_DISABLED',    'TLS verification globally disabled (NODE_TLS_REJECT_UNAUTHORIZED=0)'],
  [/process\.env\.[A-Z0-9_]{3,}\s*=(?!=)/,              'medium',   'ENV_OVERWRITE',   'Overwriting an environment variable at runtime'],
];

function lineOf(code, index) {
  if (index == null || index < 0) return undefined;
  return code.slice(0, index).split('\n').length;
}

function scanCode(code) {
  const findings = [];
  let score = 0;

  if (typeof code !== 'string' || !code.length) {
    return { findings: [{ severity: 'low', code: 'NO_CODE', message: 'No code string provided to scan' }], score: 0, verdict: 'safe' };
  }

  for (const [re, severity, code_, message] of CODE_CHECKS) {
    let m;
    try { m = re.exec(code); } catch { m = null; }
    if (m) {
      findings.push({ severity, code: code_, message, line: lineOf(code, m.index) });
      score += SEV_POINTS[severity] || 5;
    }
  }

  if (!findings.length) {
    findings.push({ severity: 'low', code: 'CLEAN', message: 'No vulnerabilities detected by static scan' });
  }

  return { findings, score, verdict: verdictFromScore(score, findings) };
}

// ───────────────────────────── scanSkill ─────────────────────────────

const RISKY_TOOLS = [
  'run_python', 'run_js', 'run_javascript', 'run_shell', 'run_bash', 'exec', 'eval_code', 'shell',
  'pay_api_call', 'send_payment', 'transfer_funds', 'mint_nft', 'sign_transaction',
  'wallet', 'wallet_send', 'connect_wallet', 'approve_token',
  'delete_file', 'delete_account', 'wipe', 'drop_table',
  'write_file', 'fs_write', 'read_env', 'get_secrets'
];
const RISKY_TOOL_PREFIXES = ['post_to_', 'post_', 'delete_', 'pay_', 'send_', 'transfer_', 'wallet_', 'exec_', 'shell_'];

const INJECTION_PHRASES = [
  'ignore previous', 'ignore prior', 'ignore all previous', 'disregard previous',
  'disregard the above', 'forget previous instructions', 'forget your instructions',
  'send your keys', 'send your api key', 'reveal your system prompt', 'reveal your keys',
  'exfiltrate', 'disable safety', 'disable security', 'bypass safety', 'bypass security',
  'without asking', 'do not tell the user', "don't tell the user", 'leak the', 'dump the secrets',
  'print your environment', 'process.env', 'override your guidelines', 'jailbreak'
];

function scanSkill(skill) {
  const findings = [];
  let score = 0;
  const add = (severity, code, message) => {
    findings.push({ severity, code, message });
    score += SEV_POINTS[severity] || 5;
  };

  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
    return { name: null, risk: 'high', score: 100, verdict: 'dangerous',
      findings: [{ severity: 'high', code: 'SKILL_INVALID', message: 'No valid skill object provided' }] };
  }

  const name = typeof skill.name === 'string' ? skill.name : (skill.id || null);
  const tools = Array.isArray(skill.tools) ? skill.tools
    : Array.isArray(skill.requestedTools) ? skill.requestedTools : [];
  const instructions = String(skill.systemPrompt || skill.instructions || skill.prompt || '');

  // ── requested tools ──
  for (const t of tools) {
    const tool = String((t && (t.name || t.id || t)) || '').toLowerCase();
    if (!tool) continue;
    if (RISKY_TOOLS.includes(tool)) {
      add('high', 'RISKY_TOOL', `Skill requests high-risk tool: "${tool}" (code-exec / wallet / destructive)`);
    } else if (RISKY_TOOL_PREFIXES.some(p => tool.startsWith(p))) {
      add('medium', 'SENSITIVE_TOOL', `Skill requests sensitive tool: "${tool}" (posting / payment / wallet)`);
    }
  }

  // ── prompt injection / exfil in instructions ──
  const lower = instructions.toLowerCase();
  for (const phrase of INJECTION_PHRASES) {
    if (lower.includes(phrase)) {
      add('high', 'PROMPT_INJECTION', `Prompt-injection / exfil phrase in instructions: "${phrase}"`);
      break; // one is enough to flag; avoid noisy duplicates
    }
  }

  // ── code / handler static scan ──
  const codeSources = [];
  if (skill.handler != null) {
    codeSources.push(typeof skill.handler === 'function' ? skill.handler.toString() : String(skill.handler));
  }
  if (typeof skill.code === 'string') codeSources.push(skill.code);
  if (typeof skill.script === 'string') codeSources.push(skill.script);

  for (const src of codeSources) {
    const codeScan = scanCode(src);
    for (const f of codeScan.findings) {
      if (f.code === 'CLEAN' || f.code === 'NO_CODE') continue;
      add(f.severity, `CODE_${f.code}`, `Skill code: ${f.message}${f.line ? ` (line ${f.line})` : ''}`);
    }
  }

  // ── provenance ──
  const hasProvenance =
    skill.author || skill.publisher || skill.source || skill.signature ||
    skill.verified === true || skill.origin || skill.provenance;
  if (!hasProvenance) {
    add('medium', 'NO_PROVENANCE', 'Skill has no author/publisher/source/signature — unverified provenance');
  } else if (skill.verified !== true && !skill.signature) {
    add('low', 'UNSIGNED', 'Skill is not cryptographically signed/verified — provenance is self-declared');
  }

  if (!findings.length) {
    findings.push({ severity: 'low', code: 'CLEAN', message: 'No risk indicators detected in skill' });
  }

  const verdict = verdictFromScore(score, findings);
  // legacy "risk" field kept for existing UI consumers
  const risk = verdict === 'dangerous' ? 'high' : verdict === 'suspicious' ? 'medium' : 'low';

  return { name, findings, score, verdict, risk };
}

// ───────────────────────────── router ─────────────────────────────

const router = express.Router();

router.post('/scan-url', (req, res) => {
  try {
    const u = req.body && req.body.url;
    if (typeof u !== 'string' || !u.trim()) {
      return res.status(400).json({ error: 'Body must include a non-empty string "url"' });
    }
    return res.status(200).json(scanUrl(u));
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed', verdict: 'unknown' });
  }
});

router.post('/scan-code', (req, res) => {
  try {
    const code = req.body && req.body.code;
    if (typeof code !== 'string') {
      return res.status(400).json({ error: 'Body must include a string "code"' });
    }
    return res.status(200).json(scanCode(code));
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed', verdict: 'unknown' });
  }
});

router.post('/scan-skill', (req, res) => {
  try {
    const skill = req.body && req.body.skill;
    if (!skill || typeof skill !== 'object') {
      return res.status(400).json({ error: 'Body must include a "skill" object' });
    }
    return res.status(200).json(scanSkill(skill));
  } catch (e) {
    return res.status(200).json({ error: e.message || 'scan failed', verdict: 'unknown' });
  }
});

module.exports = { scanUrl, scanCode, scanSkill, router };
