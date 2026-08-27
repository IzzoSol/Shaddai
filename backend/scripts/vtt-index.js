'use strict';

const fs = require('fs');
const path = require('path');

function videoIdFromVttFilename(filename) {
  let vid = filename.slice(0, -'.vtt'.length);
  if (vid.endsWith('.en')) vid = vid.slice(0, -'.en'.length);
  return vid;
}

/**
 * Walk each root directory recursively and index every .vtt file by the
 * video id derived from its filename. First-found wins on id collision.
 */
function buildVttIndex(roots) {
  const index = new Map();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return; // missing/unreadable directory: skip silently
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.vtt')) {
        const vid = videoIdFromVttFilename(entry.name);
        if (!index.has(vid)) index.set(vid, full);
      }
    }
  }

  for (const root of roots) walk(root);
  return index;
}

module.exports = { buildVttIndex, videoIdFromVttFilename };
