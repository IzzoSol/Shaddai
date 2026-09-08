// SHADDAI media engine sidecar - ensure() checks health and spawns the
// engine (backend/media-engine/api) when it is not already reachable on
// MEDIA_ENGINE_PORT (default 9000). The engine needs Node 24+ so that
// isolated-vm can load its prebuilt ABI addon; set MEDIA_ENGINE_NODE to the
// node binary path (default 'node').

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.MEDIA_ENGINE_PORT) || 9000;
const HOST = '127.0.0.1';
const ENGINE_DIR = process.env.MEDIA_ENGINE_DIR || path.join(__dirname, 'media-engine', 'api');
const ENGINE_NODE = process.env.MEDIA_ENGINE_NODE || 'node';

let child = null;
let started = false;

function up(timeout) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: timeout || 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function start() {
  child = spawn(ENGINE_NODE, ['src/engine'], { cwd: ENGINE_DIR, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const tag = '[media-engine]';
  child.stdout.on('data', (d) => process.stdout.write(tag + ' ' + d));
  child.stderr.on('data', (d) => process.stderr.write(tag + ' ' + d));
  child.on('exit', (code, sig) => {
    console.log(tag + ' exited' + (code !== null ? ' code=' + code : ' sig=' + sig));
    child = null;
    started = false;
  });
  started = true;
  console.log(tag + ' spawned (' + ENGINE_NODE + ' ' + ENGINE_DIR + ')');
}

async function ensure() {
  if (await up()) {
    if (started) console.log('[media-engine] already reachable on ' + HOST + ':' + PORT);
    return true;
  }
  start();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await up(1000)) { console.log('[media-engine] up on ' + HOST + ':' + PORT); return true; }
  }
  console.log('[media-engine] WARN: still not reachable; set MEDIA_ENGINE_NODE to a Node 24+ binary that can load isolated-vm.');
  return false;
}

module.exports = { ensure, isRunning: () => !!child, port: PORT };