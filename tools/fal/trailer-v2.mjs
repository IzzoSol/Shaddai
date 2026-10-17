// trailer-v2.mjs — fal assets for the SHADDAI trailer v2: Kling i2v action/drone clips from our renders + ElevenLabs VO + Stable Audio score.
//   node tools/fal/trailer-v2.mjs <outdir> [only=clipA,vo,music]   (FAL_KEY from env or ../Shaddai/.env; never printed)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
const OUT = process.argv[2]; const ONLY = (process.argv.find((a) => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const key = (process.env.FAL_KEY || (readFileSync('../Shaddai/.env', 'utf8').match(/^FAL_KEY\s*=\s*(.+)$/m) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
if (!key) { console.error('no FAL_KEY'); process.exit(1); }
const H = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
const SH = 'C:/Users/Brittany/AppData/Local/Temp/claude/C--Users-Brittany/e84d94d9-4192-480f-828b-59238dd26a14/scratchpad/trailer/shots/';
const RN = '.bl-cache/renders/';
const uri = (p) => `data:image/${extname(p) === '.png' ? 'png' : 'jpeg'};base64,` + readFileSync(p).toString('base64');
const STYLE = ' Cinematic, dramatic lighting, emerald green and gold accents on dark, high detail, smooth camera, no text, no watermark.';
const CLIPS = [
  ['A-drone-dive', RN + 'canon-s7-v3-top-night.png', 'FPV drone dives fast from high altitude toward the glowing central station of a vast circular futuristic city at night, emerald neon grid lights rushing past, volumetric fog.'],
  ['B-train', SH + 't-06-train-side.png', 'A sleek white maglev bullet train rockets past at night, emerald light strips streaking, strong motion blur, camera tracking alongside then the train whooshes out of frame.'],
  ['C-zerox', SH + 't-03-close-zerox.png', 'The woman in the black suit with glowing teal lines lowers her arms into a fighting stance and draws a glowing cyan katana, lightning crackles along the blade, hair moves, camera slowly pushes in.'],
  ['D-nexus', SH + 't-03-close-nexus.png', 'The armored man lowers his arms, raises his right forearm, a wrist cannon charges with crackling teal electric energy and fires a bright beam, sparks, camera shakes slightly.'],
  ['E-turtle', SH + 't-03-close-turtle.png', 'The woman with bright green curly hair drops into a stance and swings a glowing electric green spiked flail on a chain in a wide arc, green lightning trails, energetic.'],
  ['F-dragon', SH + 't-07-dragon.png', 'The dark dragon rears up, spreads its huge wings and breathes a torrent of fire toward the camera, embers and heat shimmer, low dramatic angle.'],
  ['G-emberfall', RN + 'canon-s6-emberfall-oblique.png', 'FPV drone flies fast and low over volcanic mountain ridges with rivers of glowing orange lava, embers and smoke, a futuristic bridge crossing a chasm.'],
  ['H-void', RN + 'canon-s6-void-oblique.png', 'Drone orbits over a purple misty void realm; the glowing spiral rift gate portal ignites, pulses of violet energy ripple outward.'],
  ['I-shaddai', SH + 't-03-close-shaddai.png', 'The hooded emerald and gold sorcerer lowers his arms then raises one hand; a glowing emerald S-sigil ring forms and spins in front of his palm, cape billows, a wave of green energy.'],
  ['J-lineup', SH + 't-01-lineup.png', 'Seven heroes stand in a line; they lower their arms into confident poses as emerald and gold light sweeps across them; camera slowly cranes up and pulls back.'],
];
const VO = 'Models can think... but they had nowhere to live. [pause] Until now. [pause] SHADDAI. [pause] Seven agents. Eight realms. One Grid. They trade. They build. They fight beside you. Ride the ring. Face the guardians. Your agents work, and earn... even while you sleep. [pause] SHADDAI. Intelligence has a place.';
const MUSIC = 'Cinematic late-night synthwave arrival theme: warm analog synth pads, distant ethereal choir, deep low cinematic percussion and taiko hits building slowly, a heartbeat sub pulse, epic but restrained, no vocals lyrics, 90 BPM, builds to a big final hit then a soft tail.';

async function call(model, input, label) {
  const sub = await (await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: H, body: JSON.stringify(input) })).json();
  if (!sub.status_url) throw new Error(label + ' submit: ' + JSON.stringify(sub).slice(0, 300));
  for (let t = 0; t < 180; t++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await (await fetch(sub.status_url, { headers: H })).json();
    if (st.status === 'COMPLETED') return (await fetch(sub.response_url, { headers: H })).json();
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(label + ' failed ' + JSON.stringify(st).slice(0, 300));
  }
  throw new Error(label + ' timeout');
}
async function save(url, file) { writeFileSync(join(OUT, file), Buffer.from(await (await fetch(url)).arrayBuffer())); console.log('saved', file); }
const want = (id) => !ONLY.length || ONLY.includes(id);
const jobs = [];
for (const [id, img, p] of CLIPS) if (want(id) && !existsSync(join(OUT, id + '.mp4')))
  jobs.push(() => call('fal-ai/kling-video/v2.1/standard/image-to-video', { prompt: p + STYLE, image_url: uri(img), duration: '5', negative_prompt: 'blur, distort, low quality, text, watermark, extra limbs, deformed hands' }, id)
    .then((r) => save(r.video.url, id + '.mp4')));
if (want('vo') && !existsSync(join(OUT, 'vo.mp3')))
  jobs.push(() => call('fal-ai/elevenlabs/tts/eleven-v3', { text: VO, voice: 'Brian', stability: 0.5 }, 'vo').then((r) => save(r.audio.url, 'vo.mp3')));
if (want('music') && !existsSync(join(OUT, 'music.wav')))
  jobs.push(() => call('fal-ai/stable-audio-25/text-to-audio', { prompt: MUSIC, seconds_total: 64 }, 'music').then((r) => save((r.audio && r.audio.url) || r.audio_file.url, 'music.wav')));
// 3 at a time (network only; light on the laptop)
let i = 0, fails = 0;
async function worker() { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { fails++; console.log('ERR', e.message); } } }
await Promise.all([worker(), worker(), worker()]);
console.log('DONE fails=' + fails);
