'use strict';
const src = require('../lib/music-sources');

describe('filterKnockoffs', () => {
  test('drops cover/tribute/karaoke/instrumental titled tracks by default', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Coldplay' },
      { name: 'Yellow (Karaoke Version)', artist: 'Karaoke Kings' },
      { name: 'Yellow - Tribute to Coldplay', artist: 'Tribute Band' },
      { name: 'Yellow (Instrumental)', artist: 'Session Musicians' },
      { name: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories (Cover Version)' },
    ];
    const out = src.filterKnockoffs(tracks, 'yellow');
    expect(out.map((t) => t.name)).toEqual(['Yellow']);
  });

  test('keeps knockoff-flagged results when the query itself asked for them', () => {
    const tracks = [{ name: 'Yellow (Karaoke Version)', artist: 'Karaoke Kings' }];
    const out = src.filterKnockoffs(tracks, 'yellow karaoke version');
    expect(out).toHaveLength(1);
  });
});

describe('boostCanonicalArtist', () => {
  test('sorts a track whose artist is named in the query ahead of one that is not', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Random Cover Band' },
      { name: 'Yellow', artist: 'Coldplay' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow coldplay');
    expect(out[0].artist).toBe('Coldplay');
  });

  test('does not reorder when the query names no artist at all', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Coldplay' },
      { name: 'Yellow', artist: 'Someone Else' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow');
    expect(out.map((t) => t.artist)).toEqual(['Coldplay', 'Someone Else']);
  });

  test('does not promote a track with an empty artist ahead of a real query-matched artist', () => {
    const tracks = [
      { name: 'Yellow', artist: '' },
      { name: 'Yellow', artist: 'Coldplay' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow coldplay');
    expect(out[0].artist).toBe('Coldplay');
  });

  test('an empty-artist track and a genuinely non-matching artist keep their original relative order', () => {
    const tracks = [
      { name: 'Yellow', artist: '' },
      { name: 'Yellow', artist: 'Some Other Band' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow');
    expect(out.map((t) => t.artist)).toEqual(['', 'Some Other Band']);
  });
});

describe('filterKnockoffs — Audius-specific tightening', () => {
  test('drops Audius remix/mashup/DJ-mix/boot/live results by default, but keeps the same-titled Deezer result', () => {
    const tracks = [
      { source: 'deezer', name: 'Get Lucky', artist: 'Daft Punk' },
      { source: 'audius', name: 'Get Lucky (FRASER Remix)', artist: 'FRASER' },
      { source: 'audius', name: 'Get Lucky (DJ Luciano Velocity Mix)', artist: 'Luciano Deejay' },
      { source: 'audius', name: 'Get Lucky Disco Funk Mashup', artist: 'DJ michbuze' },
      { source: 'audius', name: 'Get Lucky (DZ Live Boot)', artist: 'David Duriez' },
    ];
    const out = src.filterKnockoffs(tracks, 'daft punk get lucky');
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('deezer');
  });

  test('does not apply the Audius-specific filter to non-Audius sources', () => {
    const tracks = [{ source: 'deezer', name: 'Some Remix Mix', artist: 'A Real Label Artist' }];
    const out = src.filterKnockoffs(tracks, 'query with no knockoff words');
    expect(out).toHaveLength(1);
  });

  test('keeps an Audius remix when the query itself asks for a remix', () => {
    const tracks = [{ source: 'audius', name: 'Get Lucky (FRASER Remix)', artist: 'FRASER' }];
    const out = src.filterKnockoffs(tracks, 'get lucky fraser remix');
    expect(out).toHaveLength(1);
  });
});
