// Beat grid — SHADDAI original.
//   node grid.mjs --bpm 120 --bars 8 [--offset 0] [--meter 4] > grid.json
// For music you compose yourself (or synthesize), the grid is arithmetic — no analysis needed.
// For a supplied track, use analyze.py and feed its output through the same shape.
const get = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const bpm = get('bpm', 120), bars = get('bars', 8), offset = get('offset', 0), meter = get('meter', 4);

const beat = 60 / bpm;
const beats = Array.from({ length: bars * meter }, (_, i) => +(offset + i * beat).toFixed(4));
const bar = beats.filter((_, i) => i % meter === 0);
const phrase = bar.filter((_, i) => i % 4 === 0);          // every fourth bar: where the big moves go
const eighths = beats.flatMap((b) => [b, +(b + beat / 2).toFixed(4)]);

console.log(JSON.stringify({ bpm, meter, offset, seconds: +(bars * meter * beat).toFixed(3), beats, bars: bar, phrases: phrase, eighths }, null, 1));
