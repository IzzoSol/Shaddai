'use strict';

/**
 * collectables-data.js
 * ----------------------------------------------------------------------------
 * Loads the 100 finished SHADDAI NFT collectable cards and makes the backend
 * SELF-CONTAINED:
 *
 *   - The canonical art lives at  <repo>/../shaddai-nft-art-v2/  (catalog.json
 *     + images/<id>.png). On first require we BOOTSTRAP-COPY catalog.json and
 *     every card png into  backend/data/collectables/  so the dashboard backend
 *     never depends on that external folder at runtime.
 *   - Thereafter everything is read from backend/data/collectables/.
 *   - Card art is served by the router at  /api/collectables/image/<id>.png ,
 *     so the resolved imageUrl on every card is relative + dashboard-friendly
 *     (the dashboard `j(u,o)` helper calls relative /api/... paths).
 *
 * Node built-ins only (fs, path). No external deps, no network, no mock data.
 */

const fs = require('fs');
const path = require('path');

// backend/data/collectables/  (self-contained home for catalog + art)
const DATA_DIR = path.join(__dirname, '..', 'data', 'collectables');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const LOCAL_CATALOG = path.join(DATA_DIR, 'catalog.json');

// Canonical source of the finished art (external, used ONCE for bootstrap).
// <repo root>/backend/collectables -> ../../.. -> Desktop -> shaddai-nft-art-v2
const SOURCE_DIR = path.join(__dirname, '..', '..', '..', 'shaddai-nft-art-v2');
const SOURCE_CATALOG = path.join(SOURCE_DIR, 'catalog.json');
const SOURCE_IMAGES = path.join(SOURCE_DIR, 'images');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* exists */ }
}

/**
 * One-time bootstrap: copy catalog.json + all card pngs from the canonical
 * art folder into backend/data/collectables/ if they are not already present.
 * Idempotent and best-effort: if the source folder is gone but the local copy
 * already exists, this is a no-op and the module still works.
 */
function bootstrap() {
  ensureDir(DATA_DIR);
  ensureDir(IMAGES_DIR);

  // catalog
  if (!fs.existsSync(LOCAL_CATALOG) && fs.existsSync(SOURCE_CATALOG)) {
    try { fs.copyFileSync(SOURCE_CATALOG, LOCAL_CATALOG); } catch (_) {}
  }

  // images — copy any card png that isn't already local
  if (fs.existsSync(SOURCE_IMAGES)) {
    let cards = [];
    try { cards = JSON.parse(fs.readFileSync(LOCAL_CATALOG, 'utf8')); } catch (_) {}
    if (!Array.isArray(cards) || !cards.length) {
      // fall back to copying everything in the source images folder
      try {
        for (const f of fs.readdirSync(SOURCE_IMAGES)) {
          if (!/\.png$/i.test(f)) continue;
          const dst = path.join(IMAGES_DIR, f);
          if (!fs.existsSync(dst)) {
            try { fs.copyFileSync(path.join(SOURCE_IMAGES, f), dst); } catch (_) {}
          }
        }
      } catch (_) {}
    } else {
      for (const c of cards) {
        const file = `${c.id}.png`;
        const dst = path.join(IMAGES_DIR, file);
        if (!fs.existsSync(dst)) {
          const srcFile = path.join(SOURCE_IMAGES, file);
          if (fs.existsSync(srcFile)) {
            try { fs.copyFileSync(srcFile, dst); } catch (_) {}
          }
        }
      }
    }
  }
}

bootstrap();

/** Resolve the public, relative image URL the dashboard fetches. */
function imageUrl(id) {
  return `/api/collectables/image/${encodeURIComponent(id)}.png`;
}

/**
 * Load the 100 cards from the local catalog and normalize each into a stable
 * shape the router + UI consume. We DO NOT mutate the catalog on disk.
 */
function loadCards() {
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(LOCAL_CATALOG, 'utf8')); } catch (_) { raw = []; }
  if (!Array.isArray(raw)) raw = [];
  return raw.map((c) => ({
    id: String(c.id),
    name: c.nm || c.name || c.id,
    rarity: String(c.rar || c.rarity || 'common').toLowerCase(),
    faction: c.faction || '',
    kind: c.kind || '',
    edition: c.num != null ? c.num : null,
    serial: c.serial || '',
    // `earned` in the catalog is the human "unlock by" text (the milestone).
    unlockText: c.earned || '',
    attributes: Array.isArray(c.attributes) ? c.attributes : [],
    imageUrl: imageUrl(String(c.id)),
  }));
}

// Cache the card list (catalog is static art metadata).
let _cards = null;
function cards() {
  if (!_cards) _cards = loadCards();
  return _cards.map((c) => ({ ...c }));
}

/** Path to a card image, path-safe (basename only, must end in .png). */
function imagePath(file) {
  const base = path.basename(String(file || ''));
  if (!/^[A-Za-z0-9._-]+\.png$/.test(base)) return null;
  const full = path.join(IMAGES_DIR, base);
  // Defense-in-depth: ensure resolved path stays inside IMAGES_DIR.
  if (!full.startsWith(IMAGES_DIR)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

module.exports = {
  DATA_DIR,
  IMAGES_DIR,
  cards,
  imageUrl,
  imagePath,
};
