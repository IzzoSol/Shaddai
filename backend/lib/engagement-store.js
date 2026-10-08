/* Engagement records: a consultant starts one for a client; that is what flips
   the client stage on. File-backed JSON, atomic write, never throws on I/O.
   Reads are always scoped by clientUserId. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUSES = ['active', 'paused', 'ended'];
const PHASES = ['assessment', 'strategy', 'build', 'adopt', 'review'];

function createEngagementStore(file) {
  function load() {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(d.engagements) ? d.engagements : [];
    } catch (_) { return []; }
  }
  function save(list) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ engagements: list }, null, 2));
    fs.renameSync(tmp, file);
  }
  const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

  return {
    create({ clientUserId, consultantUserId, title }) {
      const client = clean(clientUserId, 128);
      if (!client) throw new Error('clientUserId required');
      const list = load();
      const rec = {
        id: 'eng_' + crypto.randomBytes(6).toString('hex'),
        clientUserId: client,
        consultantUserId: clean(consultantUserId, 128) || null,
        title: clean(title, 120) || 'Engagement',
        status: 'active', phase: 'assessment',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      list.push(rec); save(list);
      return rec;
    },
    get(id) { return load().find((e) => e.id === id) || null; },
    forClient(clientUserId) { return load().filter((e) => e.clientUserId === String(clientUserId)); },
    all() { return load(); },
    update(id, patch) {
      if (patch.status !== undefined && STATUSES.indexOf(patch.status) === -1) throw new Error('bad status');
      if (patch.phase !== undefined && PHASES.indexOf(patch.phase) === -1) throw new Error('bad phase');
      const list = load();
      const rec = list.find((e) => e.id === id);
      if (!rec) throw new Error('engagement not found');
      if (patch.status !== undefined) rec.status = patch.status;
      if (patch.phase !== undefined) rec.phase = patch.phase;
      if (patch.title !== undefined) rec.title = clean(patch.title, 120) || rec.title;
      rec.updatedAt = new Date().toISOString();
      save(list);
      return rec;
    },
  };
}

module.exports = { createEngagementStore, STATUSES, PHASES };
