// Sound synthesizer — SHADDAI original.
//   node synth.mjs cues.json out/sound.wav
// cues.json: [{ "at": 0.5, "voice": "tick" }, { "at": 2, "voice": "swell", "gain": 0.8 }, ...]
// Voices are small envelope-shaped oscillators; add your own to VOICES.
// Output: 48 kHz, 16-bit, mono WAV.
import { readFileSync, writeFileSync } from 'node:fs';

const RATE = 48000;
const TAU = Math.PI * 2;
const cues = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const length = Math.ceil((Math.max(...cues.map((c) => c.at)) + 3) * RATE);
const mix = new Float32Array(length);

// Own noise source so output is identical on every run.
let lcg = 0x1badf00d;
const hiss = () => ((lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0) / 2147483648) - 1;

const env = (t, attack, decay) => Math.min(1, t / attack) * Math.exp(-t / decay);
const sine = (hz, t) => Math.sin(TAU * hz * t);

// voice: [duration seconds, (t) => sample]
const VOICES = {
  tick:  [0.06, (t) => sine(2400, t) * env(t, 0.001, 0.012) * 0.45],
  blip:  [0.18, (t) => sine(520 * Math.pow(2, t * 5), t) * env(t, 0.004, 0.05) * 0.4],
  kick:  [0.55, (t) => sine(48 + 110 * Math.exp(-t * 28), t) * env(t, 0.002, 0.16) * 0.95],
  snap:  [0.20, (t) => (hiss() * 0.6 + sine(190, t) * 0.4) * env(t, 0.001, 0.045) * 0.55],
  swell: [1.20, (t) => hiss() * Math.pow(Math.min(1, t / 1.1), 2.2) * Math.exp(-Math.max(0, t - 1.1) * 30) * 0.28],
  chime: [1.40, (t) => (sine(880, t) + 0.5 * sine(1320, t) + 0.25 * sine(1760, t)) * env(t, 0.003, 0.35) * 0.22],
};

for (const cue of cues) {
  const voice = VOICES[cue.voice];
  if (!voice) throw new Error('unknown voice: ' + cue.voice);
  const [dur, fn] = voice, gain = cue.gain ?? 1, start = Math.round(cue.at * RATE);
  const n = Math.min(Math.round(dur * RATE), length - start);
  for (let i = 0; i < n; i++) mix[start + i] += fn(i / RATE) * gain;
}

// Soft-limit so stacked cues never clip.
const pcm = Buffer.alloc(44 + length * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + length * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(length * 2, 40);
for (let i = 0; i < length; i++) pcm.writeInt16LE(Math.round(Math.tanh(mix[i]) * 32767), 44 + i * 2);
writeFileSync(process.argv[3], pcm);
