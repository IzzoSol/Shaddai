const { vttToMarkedText, fmtMarker } = require('../scripts/vtt-parse');
const ragIndex = require('../rag-index');

const SAMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello and welcome to this video

2
00:00:04.500 --> 00:00:08.000
<c>Today we're</c> talking about hashing

00:01:05.000 --> 00:01:09.000
Let's get started with the details
`;

describe('fmtMarker', () => {
  test('formats seconds under an hour as MM:SS', () => {
    expect(fmtMarker(1)).toBe('00:01');
    expect(fmtMarker(65)).toBe('01:05');
    expect(fmtMarker(599)).toBe('09:59');
  });
  test('formats seconds past an hour as H:MM:SS', () => {
    expect(fmtMarker(3661)).toBe('1:01:01');
  });
});

describe('vttToMarkedText', () => {
  test('strips WEBVTT header, cue numbers, timing lines, and tags', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    expect(out).not.toMatch(/WEBVTT/);
    expect(out).not.toMatch(/-->/);
    expect(out).not.toMatch(/<c>/);
    expect(out).toContain('Hello and welcome to this video');
    expect(out).toContain('Today we\'re talking about hashing');
  });

  test('inserts one bracketed marker per cue, before the caption text', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    expect(out).toContain('[00:01] Hello and welcome to this video');
    expect(out).toContain('[00:04] Today we\'re talking about hashing');
    expect(out).toContain('[01:05] Let\'s get started with the details');
  });

  test('produced markers are recognized as real by rag-index parseTimeMarkers', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    const words = out.split(/\s+/).filter(Boolean);
    const markers = ragIndex._internal.parseTimeMarkers(words);
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });
});
