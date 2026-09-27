// SHADDAI bot watchdog — keeps the Temple bot + signals worker alive on this PC.
// Checks by command-line fragment, restarts any that are missing. Safe to
// run every few minutes (no overlap: marks each runner with a unique spawn).
const { execFile } = require('child_process');
const { spawn } = require('child_process');
const path = require('path');

const BACKEND = 'C:/Users/Brittany/Shaddai/backend';

const TARGETS = [
  {
    name: 'tg-temple',
    match: (cmd) => /(^|\s)telegram-bot\.js/.test(cmd || ''),
    args: ['telegram-bot.js'],
    out: 'telegram-bot.out.log',
    err: 'telegram-bot.err.log',
  },
  {
    name: 'tg-signals',
    match: (cmd) => /(^|\s)tg-signals-standalone\.js/.test(cmd || ''),
    args: ['tg-signals-standalone.js'],
    out: 'tg-signals.out.log',
    err: 'tg-signals.err.log',
  },
];

function listNodeProcs() {
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object -ExpandProperty CommandLine | Out-String",
    ], { timeout: 15000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve((stdout || '').split(/\r?\n/).filter(Boolean));
    });
  });
}

function start(target) {
  const out = require('fs').openSync(path.join(BACKEND, target.out), 'a');
  const err = require('fs').openSync(path.join(BACKEND, target.err), 'a');
  const child = spawn('node', target.args, {
    cwd: BACKEND,
    stdio: ['ignore', out, err],
    detached: true,
  });
  child.unref();
  return `[${new Date().toISOString()}] restarted ${target.name} pid=${child.pid}`;
}

async function main() {
  const cmds = await listNodeProcs();
  const results = [];
  for (const t of TARGETS) {
    const alive = cmds.some(t.match);
    if (alive) {
      results.push(`${t.name}: up`);
    } else {
      results.push(start(t));
    }
  }
  console.log(results.join(' | '));
}

main().catch((e) => console.error('[watchdog] FAILED:', e && e.stack || e));