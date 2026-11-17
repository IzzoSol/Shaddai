/* world-ktx2.js — KTX2 / Basis Universal, PHASE 0 (2026-11-15, realm-ktx2-phase0-2026-11-15).
 * Vendored from three r180 (npm three@0.180.0, sha256-verified per file — see KTX2_RECEIPT.md):
 *   public/vendor/three/addons/loaders/KTX2Loader.js (+ utils/WorkerPool.js,
 *   libs/ktx-parse.module.js, libs/zstddec.module.js, math/ColorSpaces.js)
 *   public/vendor/three/addons/libs/basis/{basis_transcoder.js, basis_transcoder.wasm}
 * NO .ktx2 asset ships in this phase and NO asset URL is rewritten: the only change is
 * that, with ?ktx2=1, every GLTFLoader the realm creates gets the one shared KTX2Loader
 * attached — so a future converted GLB (KHR_texture_basisu) will load instead of
 * throwing "setKTX2Loader must be called before loading KTX2 textures".
 * Flag: ?ktx2=1 = on, anything else (absent, ?ktx2=0) = off. DEFAULT OFF.
 * Flag off: installKTX2() returns false, patches nothing, imports nothing — the realm
 * behaves byte-for-byte as before (no new download, no new code path).
 * Pattern follows kit-color-fix.js and the wave-1 skin fix in world-main.js: one
 * GLTFLoader.prototype.load patch, installed once. detectSupport(renderer) is the SYNC
 * r180 call (the async variant's deprecation is r181+); it is REQUIRED before any load.
 * Fail-open: if the dynamic import or detectSupport throws, the promise resolves null,
 * the patch stays a pass-through, and plain GLBs keep loading exactly as before.
 * Runtime claims about this are SIM (no WebGL on this machine — no live browser run).
 */
const TRANSCODER_PATH = '/vendor/three/addons/libs/basis/';
const KTX2_LOADER_URL = 'three/addons/loaders/KTX2Loader.js';

export function ktx2Enabled(search) {
  const s = (search == null)
    ? (typeof location !== 'undefined' ? location.search : '')
    : search;
  return /[?&]ktx2=1\b/.test(s);
}

let _shared = null;   // the one shared KTX2Loader, once initialised
let _ready = null;    // promise resolving to the shared loader (null on failure)
let _patched = false;

function _diag() {
  try {
    if (typeof window !== 'undefined') {
      window.__ktx2 = window.__ktx2 || {};
      window.__ktx2.enabled = ktx2Enabled();
      window.__ktx2.ready = !!_shared;
      window.__ktx2.transcoderPath = TRANSCODER_PATH;
    }
  } catch (_) { /* diagnostics never break boot */ }
}

export function getKTX2Loader() { return _shared; }
export function ktx2Ready() { return !!_shared; }

/* Initialise the shared loader: dynamic import (only ever runs with the flag on) +
 * transcoder path + sync detectSupport. loaderFactory is a test seam (harness only). */
function _init(renderer, loaderFactory) {
  if (_ready) return _ready;
  const make = loaderFactory || function () { return import(KTX2_LOADER_URL); };
  _ready = Promise.resolve()
    .then(make)
    .then(function (m) {
      const KTX2Loader = (m && m.KTX2Loader) || (m && m.default);
      if (!KTX2Loader) throw new Error('KTX2Loader export missing');
      const loader = new KTX2Loader();
      loader.setTranscoderPath(TRANSCODER_PATH);
      loader.detectSupport(renderer);   // SYNC r180 call; REQUIRED before any load
      _shared = loader;
      _diag();
      return loader;
    })
    .catch(function (e) {
      try { console.warn('[ktx2] KTX2Loader unavailable, plain GLB path only:', e && e.message); } catch (_) {}
      _shared = null;
      return null;
    });
  return _ready;
}

/* Install the one-time prototype patch. Returns false when the flag is off, when
 * already installed, or when no renderer is given — the realm then behaves exactly
 * as before. Returns the init promise (resolves to the shared loader, or null) when
 * the flag is on. search / loaderFactory are test seams; production passes neither. */
export function installKTX2(GLTFLoader, renderer, search, loaderFactory) {
  if (!GLTFLoader || !GLTFLoader.prototype || !GLTFLoader.prototype.load) return false;
  if (_patched) return false;
  if (!ktx2Enabled(search)) return false;
  if (!renderer) return false;
  _diag();
  const load0 = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    try { if (_shared && !this.ktx2Loader) this.setKTX2Loader(_shared); } catch (_) {}
    return load0.call(this, url, onLoad, onProgress, onError);
  };
  GLTFLoader.prototype.__ktx2 = true;
  _patched = true;
  return _init(renderer, loaderFactory);
}
