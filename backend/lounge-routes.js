'use strict';
/**
 * lounge-routes.js — GET /api/lounge/tracks -> [{title, artist, url}]
 * Thin adapter over the radio catalogue (backend/data/radio.json, owned by
 * lib/radio-routes.js): the Lounge client (world-lounge.js) is specified against a
 * bare array of exactly {title, artist, url}; the radio store carries more fields.
 * Read-only: submissions keep going through POST /api/radio/tracks.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');

const FILE = path.join(__dirname, 'data', 'radio.json');

function makeRouter() {
  const r = express.Router();
  r.get('/tracks', (_req, res) => {
    let tracks = [];
    try {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      tracks = (Array.isArray(j.tracks) ? j.tracks : [])
        .filter(t => t && t.title && t.url)
        .map(t => ({ title: String(t.title), artist: String(t.artist || ''), url: String(t.url) }));
    } catch (e) { tracks = []; }
    res.json(tracks);
  });
  return r;
}
module.exports = { makeRouter };
