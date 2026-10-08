/* One JSON file per user, named by a hash of the user id (the id never appears
   in a filename or a URL). Atomic write. Never throws on read. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createOnboardingStore(dir) {
  const fileFor = (uid) => path.join(dir, crypto.createHash('sha256').update('onb:' + String(uid)).digest('hex').slice(0, 40) + '.json');
  const blank = () => ({ step: 0, completed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  return {
    get(uid) {
      try { return JSON.parse(fs.readFileSync(fileFor(uid), 'utf8')); } catch (_) { return blank(); }
    },
    save(uid, state) {
      fs.mkdirSync(dir, { recursive: true });
      const f = fileFor(uid), tmp = f + '.tmp';
      state.updatedAt = new Date().toISOString();
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, f);
      return state;
    },
    reset(uid) { return this.save(uid, blank()); },
  };
}

module.exports = { createOnboardingStore };
