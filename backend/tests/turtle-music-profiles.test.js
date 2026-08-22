'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const profiles = require('../lib/turtle-music-profiles');

function tmpFile(tag) {
  return path.join(os.tmpdir(), `tmb-${tag}-${crypto.randomBytes(6).toString('hex')}.json`);
}

let file;
beforeEach(() => {
  file = tmpFile('profiles');
  profiles._useStore(profiles.makeStore(file));
});
afterEach(() => { try { fs.unlinkSync(file); } catch (_) {} });

describe('turtle-music-profiles', () => {
  const track = { name: 'Yellow', artist: 'Coldplay' };

  test('getProfile returns an empty shape for a new user', async () => {
    const p = await profiles.getProfile('u1');
    expect(p.favorites).toEqual([]);
    expect(p.playlists).toEqual({});
    expect(p.history).toEqual([]);
  });

  test('addFavorite adds a track and dedupes on a repeat add', async () => {
    const r1 = await profiles.addFavorite('u1', track);
    expect(r1).toEqual({ ok: true, dup: false });
    const r2 = await profiles.addFavorite('u1', track);
    expect(r2).toEqual({ ok: true, dup: true });
    const favs = await profiles.listFavorites('u1');
    expect(favs).toHaveLength(1);
  });

  test('addFavorite rejects once the cap is reached', async () => {
    for (let i = 0; i < profiles.FAV_CAP; i++) {
      await profiles.addFavorite('u1', { name: 'T' + i, artist: 'A' });
    }
    const r = await profiles.addFavorite('u1', { name: 'over', artist: 'A' });
    expect(r).toEqual({ ok: false, reason: 'cap' });
  });

  test('playlist create/add/get/list/delete round-trip', async () => {
    expect(await profiles.createPlaylist('u1', 'Chill')).toEqual({ ok: true });
    expect(await profiles.createPlaylist('u1', 'Chill')).toEqual({ ok: false, reason: 'exists' });
    expect(await profiles.addToPlaylist('u1', 'Chill', track)).toEqual({ ok: true });
    expect(await profiles.addToPlaylist('u1', 'Missing', track)).toEqual({ ok: false, reason: 'missing' });
    expect(await profiles.getPlaylist('u1', 'Chill')).toEqual([track]);
    expect(await profiles.listPlaylists('u1')).toEqual(['Chill']);
    expect(await profiles.deletePlaylist('u1', 'Chill')).toEqual({ ok: true });
    expect(await profiles.getPlaylist('u1', 'Chill')).toBeNull();
  });

  test('pushHistory caps history at HISTORY_CAP and increments totalPlays', async () => {
    for (let i = 0; i < profiles.HISTORY_CAP + 5; i++) {
      await profiles.pushHistory('u1', { name: 'T' + i, artist: 'A' });
    }
    const h = await profiles.getHistory('u1');
    expect(h).toHaveLength(profiles.HISTORY_CAP);
    expect(h[h.length - 1].name).toBe('T' + (profiles.HISTORY_CAP + 4));
    const s = await profiles.profileSummary('u1');
    expect(s.totalPlays).toBe(profiles.HISTORY_CAP + 5);
  });

  test('profileSummary reflects favorites and playlist counts', async () => {
    await profiles.addFavorite('u1', track);
    await profiles.createPlaylist('u1', 'Chill');
    const s = await profiles.profileSummary('u1');
    expect(s.favorites).toBe(1);
    expect(s.playlists).toBe(1);
  });
});
