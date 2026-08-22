'use strict';
const session = require('../lib/turtle-music-session');

beforeEach(() => { session._clearAll(); jest.useRealTimers(); });

describe('turtle-music-session', () => {
  test('startSession sets the queue and current track at position 0', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c1', tracks, 'u1');
    expect(session.current('c1')).toEqual(tracks[0]);
    expect(session.upcoming('c1')).toEqual([tracks[1]]);
    expect(session.getSession('c1').ownerId).toBe('u1');
  });

  test('advance moves to the next track and returns null past the end', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c1', tracks, 'u1');
    expect(session.advance('c1')).toEqual(tracks[1]);
    expect(session.advance('c1')).toBeNull();
  });

  test('armTimer fires the callback after the current track duration', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    jest.advanceTimersByTime(9999);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('pause cancels a pending timer and armTimer no-ops while paused', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    expect(session.pause('c1')).toBe(true);
    jest.advanceTimersByTime(20000);
    expect(cb).not.toHaveBeenCalled();
    expect(session.armTimer('c1', cb)).toBe(false);
    jest.useRealTimers();
  });

  test('resume clears the paused flag but does not itself re-arm', () => {
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    session.pause('c1');
    expect(session.resume('c1')).toBe(true);
    expect(session.getSession('c1').paused).toBe(false);
    expect(session.resume('c1')).toBe(false); // already resumed, nothing to do
  });

  test('enqueue appends to an existing session or starts a new one', () => {
    expect(session.enqueue('c2', { name: 'A' })).toEqual([{ name: 'A' }]);
    expect(session.current('c2')).toEqual({ name: 'A' });
    session.enqueue('c2', { name: 'B' });
    expect(session.upcoming('c2')).toEqual([{ name: 'B' }]);
  });

  test('current is null once a session\'s queue is fully drained via advance()', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c1', tracks, 'u1');
    expect(session.advance('c1')).toEqual(tracks[1]);
    expect(session.advance('c1')).toBeNull(); // queue exhausted
    // The session object itself still exists (getSession is non-null) —
    // but current() must report nothing is actively playing. Bot-level
    // callers (e.g. queueTrack) rely on this to distinguish "genuinely
    // playing" from "exhausted session sitting idle".
    expect(session.getSession('c1')).not.toBeNull();
    expect(session.current('c1')).toBeNull();
  });

  test('clearSession removes the session and cancels any timer', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    session.clearSession('c1');
    jest.advanceTimersByTime(20000);
    expect(cb).not.toHaveBeenCalled();
    expect(session.getSession('c1')).toBeNull();
    jest.useRealTimers();
  });

  test('startSession defaults radio to true; setRadio/isRadio toggle it', () => {
    session.startSession('c3', [{ name: 'A', duration: 10 }], 'u1');
    expect(session.isRadio('c3')).toBe(true);
    expect(session.setRadio('c3', false)).toBe(false);
    expect(session.isRadio('c3')).toBe(false);
    expect(session.setRadio('c3', true)).toBe(true);
    expect(session.isRadio('c3')).toBe(true);
  });

  test('isRadio defaults to true when no session exists yet', () => {
    expect(session.isRadio('never-started')).toBe(true);
  });

  test('lastPlayed returns the last track in the queue even after it drains', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c4', tracks, 'u1');
    session.advance('c4');
    session.advance('c4'); // drains past the end
    expect(session.current('c4')).toBeNull();
    expect(session.lastPlayed('c4')).toEqual(tracks[1]);
  });

  test('appendAndAdvance pushes new tracks and returns the first newly-added one', () => {
    const tracks = [{ name: 'A', duration: 10 }];
    session.startSession('c5', tracks, 'u1');
    session.advance('c5'); // drain
    expect(session.current('c5')).toBeNull();
    const next = session.appendAndAdvance('c5', [{ name: 'B', duration: 10 }, { name: 'C', duration: 10 }]);
    expect(next).toEqual({ name: 'B', duration: 10 });
    expect(session.current('c5')).toEqual({ name: 'B', duration: 10 });
    expect(session.upcoming('c5')).toEqual([{ name: 'C', duration: 10 }]);
  });

  test('queueKeys returns lowercase name|artist keys for every track in the queue', () => {
    const tracks = [{ name: 'Yellow', artist: 'Coldplay' }, { name: 'Get Lucky', artist: 'Daft Punk' }];
    session.startSession('c6', tracks, 'u1');
    const keys = session.queueKeys('c6');
    expect(keys.has('yellow|coldplay')).toBe(true);
    expect(keys.has('get lucky|daft punk')).toBe(true);
    expect(keys.size).toBe(2);
  });

  test('queueKeys returns an empty set when there is no session', () => {
    expect(session.queueKeys('never-started').size).toBe(0);
  });

  test('trimPlayed drops already-played tracks off the front once the queue exceeds maxLen, keeping pos consistent', () => {
    const tracks = Array.from({ length: 10 }, (_, i) => ({ name: 'T' + i, duration: 10 }));
    session.startSession('c7', tracks, 'u1');
    for (let i = 0; i < 8; i++) session.advance('c7'); // pos = 8
    expect(session.current('c7')).toEqual({ name: 'T8', duration: 10 });
    const trimmed = session.trimPlayed('c7', 5, 2); // maxLen=5 < queue.length=10 → trims, keeping 2 before pos
    expect(trimmed).toBe(true);
    expect(session.getSession('c7').queue.length).toBe(4); // [T6,T7,T8,T9]
    expect(session.current('c7')).toEqual({ name: 'T8', duration: 10 }); // pos re-aligned to the same track
  });

  test('trimPlayed is a no-op when the queue is not over maxLen', () => {
    session.startSession('c8', [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }], 'u1');
    expect(session.trimPlayed('c8', 200, 20)).toBe(false);
    expect(session.getSession('c8').queue.length).toBe(2);
  });
});
