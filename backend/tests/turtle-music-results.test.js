'use strict';
const results = require('../lib/turtle-music-results');

beforeEach(() => results._clear());

describe('turtle-music-results', () => {
  test('create returns an id and get retrieves the tracks for the right chat', () => {
    const tracks = [{ name: 'A', artist: 'X' }, { name: 'B', artist: 'Y' }];
    const id = results.create('123', tracks);
    expect(typeof id).toBe('string');
    expect(results.get(id, '123')).toEqual(tracks);
  });

  test('get returns null for the wrong chat id', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }]);
    expect(results.get(id, '999')).toBeNull();
  });

  test('get returns null for an unknown id', () => {
    expect(results.get('deadbeef', '123')).toBeNull();
  });

  test('get returns null once the entry is older than the TTL', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }], 1000);
    expect(results.get(id, '123', 1000 + results.TTL_MS + 1)).toBeNull();
  });

  test('get still returns the tracks just under the TTL', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }], 1000);
    expect(results.get(id, '123', 1000 + results.TTL_MS - 1)).not.toBeNull();
  });
});
