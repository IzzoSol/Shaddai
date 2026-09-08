// SHADDAI clipper engine sidecar - ensure() checks health and spawns the
// clipper backend (backend/clipper-engine) when it is not already reachable on
// CLIPPER_PORT (default 8787). The backend uses fluent-ffmpeg + ffprobe from
// PATH (ffmpeg 8.1.2 present on this machine). Optional Whisper captions
// need WHISPER_PATH set to a whisper binary (default /opt/venv/bin/whisper).

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.CLIPPER_PORT) || 8787;
const HOST = '127.0.0.1';
const ENGINE_DIR = process.env.CLIPPER_ENGINE_DIR || path.join(__dirname, 'clipper-engine');
const ENGINE_NODE = process.env.CLIPPER_ENGINE_NODE || 'node';

let child = null;
let started = false;

function up(timeout) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/clipper/health', timeout: timeout || 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function start() {
  child = spawn(ENGINE_NODE, ['server.js'], { cwd: ENGINE_DIR, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const tag = '[clipper-engine]';
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
    if (started) console.log('[clipper-engine] already reachable on ' + HOST + ':' + PORT);
    return true;
  }
  start();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await up(1000)) { console.log('[clipper-engine] up on ' + HOST + ':' + PORT); return true; }
  }
  console.log('[clipper-engine] WARN: still not reachable; check ffmpeg is on PATH and node runs server.js.');
  return false;
}

module.exports = { ensure, isRunning: () => !!child, port: PORT, url: 'http://' + HOST + ':' + PORT };