// make.mjs — SHADDAI trailer factory: RAID, JACKIN, CHASE, ENOUGH. fal (flux → Kling i2v, ElevenLabs v3, Stable Audio 2.5) + ffmpeg titles.
//   node tools/trailer/make.mjs [raid,jackin,chase,enough]      FAL_KEY from env or ../Shaddai/.env (never printed)
// Sources cache: C:\Users\Brittany\Videos\SHADDAI-trailers\src (outside the repo). Finals: docs/video/<name>.mp4 + Videos folder.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { execFileSync } from 'child_process';
const ROOT = process.cwd();
const VID = 'C:/Users/Brittany/Videos/SHADDAI-trailers', SRC = VID + '/src'; mkdirSync(SRC, { recursive: true });
const V2 = ROOT + '/docs/video/v2-src/';
const SH = 'C:/Users/Brittany/AppData/Local/Temp/claude/C--Users-Brittany/e84d94d9-4192-480f-828b-59238dd26a14/scratchpad/trailer/shots/';
const RN = ROOT + '/.bl-cache/renders/';
const key = (process.env.FAL_KEY || (readFileSync('../Shaddai/.env', 'utf8').match(/^FAL_KEY\s*=\s*(.+)$/m) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
const H = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
const FF = (() => { try { return execFileSync('where', ['ffmpeg']).toString().split(/\r?\n/)[0].trim(); } catch { return 'C:/Users/Brittany/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe'; } })();
// fonts (OFL) with fallback if a download was bad
const okFont = (p) => { try { const b = readFileSync(p).subarray(0, 4).toString('hex'); return statSync(p).size > 20000 && ['00010000', '74727565', '4f54544f'].includes(b); } catch { return false; } };
const F = (n) => { const p = ROOT + '/tools/trailer/fonts/' + n; return (okFont(p) ? p : 'C:/Windows/Fonts/bahnschrift.ttf').replace(/\\/g, '/').replace(':', '\\:'); };
const FT = { big: F('Orbitron.ttf'), wide: F('Michroma.ttf'), small: F('Rajdhani-SemiBold.ttf'), mono: F('ShareTechMono.ttf') };
const EM = '0x00ff9c', GOLD = '0xe8c45c', RED = '0xff3b3b';
const STYLE = ' Cinematic film still quality, dramatic lighting, emerald green and gold accents on deep black, high detail, no text, no watermark, no logos.';
const MOVE = ' Handheld epic camera, fast motion, speed ramp, dynamic.';

// ───────────── the four pieces (scripts written in QUILL's voice) ─────────────
const P = {
  raid: {
    total: 19, voAt: 2.2, voice: 'Brian',
    vo: 'Key in. [pause] Forge. [pause] ZEROX. [pause] Run. [long pause] They can think. [pause] Now... they have somewhere to live.',
    music: 'Aggressive dark cinematic trailer hybrid: pounding low taiko and sub bass, glitchy synth arps, rising risers, a silent gap then a massive bass drop hit, 110 BPM, no vocals, ends on a final boom.',
    shots: [
      { new: 't2v', id: 'r1-emblem', prompt: 'A glowing emerald neon circuit emblem shaped like a bold letter S ignites on pure black, circuit traces light up one by one like a lock picking itself, gold sparks.', dur: 2.0, big: 'THE GRID IS LIVE', col: EM },
      { new: 'i2v', id: 'r2-forge', image: SH + 't-03-close-zerox.png', prompt: 'Her body assembles out of falling green code rain and glowing gold wire, particles converge and solidify into the woman, camera pushes in.', dur: 2.2, label: 'FORGE //', big: 'ZEROX', col: GOLD },
      { v2: 'C-zerox', off: 1.6, dur: 1.8 },
      { new: 'i2v', id: 'r4-run', image: RN + 'canon-s6-emberfall-oblique.png', prompt: 'A woman in a black suit with glowing teal lines sprints at full speed along a glowing transit rail through erupting volcanic fire, embers fly, whip pan.' + MOVE, dur: 1.5, label: 'EMBERFALL' },
      { v2: 'H-void', off: 1.5, dur: 1.2, label: 'DEEP VOID' },
      { new: 't2v', id: 'r6-vault', prompt: 'A massive futuristic vault door engraved with emerald circuit lines blows open in slow motion, a silent shockwave of gold light and debris, interior of a dark sci-fi bank.', dur: 1.6, label: 'PAYBOX VAULT' },
      { new: 't2v', id: 'r7-chase', prompt: 'Three dark humanoid rival silhouettes with red glowing eyes chase through a rain-soaked neon street whose ground is made of glowing green circuit traces, whip pan.' + MOVE, dur: 1.8, big: 'RUN', col: RED },
      { v2: 'B-train', off: 0.3, dur: 1.6 },
      { new: 'i2v', id: 'r9-land', image: RN + 'canon-s7-v3-top-night.png', prompt: 'Camera swoops down fast into the glowing central station at the center of a vast circular city at night as the outer ring lights up emerald.', dur: 1.9, label: 'CENTRAL STATION' },
      { card: [{ t: 'THEY CAN THINK.', f: 'big', s: 58, c: 'white', at: 0 }, { t: 'NOW THEY HAVE SOMEWHERE TO LIVE.', f: 'big', s: 40, c: EM, at: 0.9 }, { t: '@ShaddaiAI', f: 'mono', s: 30, c: GOLD, at: 1.8 }], dur: 3.4 },
    ],
  },
  jackin: {
    total: 42, voAt: 4.5, voice: 'Brian',
    vo: 'Somewhere past the chat box... a cursor waited. [pause] Forge. [pause] Code became a body. The body became a name. [pause] Through the rift, the Grid unfolds. Ice that remembers. Fire that forges. Forests of signal. A harbor of glass. A city that never logs off. [pause] Inside, the others were already working. Trading. Writing. Routing. Saving every token. [long pause] SHADDAI. Seven agents. Two hundred tools. A world... not a chat box.',
    music: 'Dark ambient cyber arrival: low pulse heartbeat, distant ethereal choir, cold phosphor synth pads, one slowly rising siren-like synth in the middle, deep sub, sparse percussion, then silence at the end. 80 BPM, no vocals lyrics.',
    shots: [
      { type: '> FORGE', dur: 4.5 },
      { new: 'i2v', id: 'r2-forge', image: SH + 't-03-close-zerox.png', prompt: 'Her body assembles out of falling green code rain and glowing gold wire, particles converge and solidify into the woman, camera pushes in.', dur: 3.0 },
      { new: 'i2v', id: 'j3-eyes', image: SH + 't-03-close-zerox.png', prompt: 'Extreme slow push-in to her face; she opens her eyes, green terminal text and scrolling code reflect in her eyes, calm and powerful.', dur: 2.6 },
      { v2: 'H-void', off: 0.5, dur: 2.6, label: 'RIFT GATE' },
      { new: 't2v', id: 'j5-arctic', prompt: 'A vast ice server cathedral inside a frozen arctic vault, towering frosted server columns with cold blue and emerald lights, drone glides forward through the nave.', dur: 2.2, label: 'ARCTIC VAULT' },
      { v2: 'G-emberfall', off: 0.5, dur: 2.2, label: 'EMBERFALL' },
      { new: 't2v', id: 'j7-darkforest', prompt: 'A gothic bio-tech forest of tall black trees whose branches pulse with glowing green data packets travelling like light, drifting fog, drone glides between trunks.', dur: 2.2, label: 'DARKFOREST' },
      { new: 't2v', id: 'j8-crystal', prompt: 'A futuristic crystal glass harbor city on a glowing turquoise sea at dusk, glass domes and spires, a maglev tube arcs over the water, drone flies forward.', dur: 2.2, label: 'CRYSTAL SEA' },
      { new: 'i2v', id: 'j9-suburbs', image: RN + 'canon-s6-suburbs-oblique.png', prompt: 'Drone flyover of a dense grid city of block towers at dusk, thousands of windows turn on with warm and emerald light, traffic lights stream.', dur: 2.2, label: 'THE SUBURBS' },
      { new: 't2v', id: 'j10-office', prompt: 'A futuristic agent office at night: stylized armored characters and robots working at floating holographic terminals, trading charts, scrolling code and writing, emerald and gold light, slow camera dolly through the room.', dur: 5.0, big: 'ALREADY WORKING', col: EM },
      { new: 'i2v', id: 'j11-map', image: RN + 'canon-s7-v3-top-day.png', prompt: 'Camera pulls back high above a vast circular futuristic city, glowing emerald grid lines trace the ring roads and stations like a survey map.', dur: 4.3 },
      { card: [{ t: 'SHADDAI', f: 'big', s: 110, c: GOLD, at: 0 }, { t: '7 AGENTS  ·  200+ TOOLS', f: 'wide', s: 32, c: 'white', at: 1.2 }, { t: 'A WORLD, NOT A CHATBOX', f: 'big', s: 40, c: EM, at: 2.4 }], dur: 9.0 },
    ],
  },
  chase: {
    total: 21, voAt: 0.6, voice: 'Aria',
    vo: 'Central Station. [pause] Harbor Line. [pause] Darkvault. [pause] Rift Gate. [pause] Emberfall Forge. [pause] Southern Colosseum. [long pause] They get paid here.',
    music: 'Relentless cold electronic chase: fast 140 BPM driving synth bass ostinato, tight metallic percussion, glitch stutters, impact hits every four bars, no vocals, abrupt stop.',
    shots: [
      { v2: 'A-drone-dive', off: 1.0, dur: 2.4, label: 'CENTRAL STATION', transit: true },
      { new: 'i2v', id: 'c2-harbor', image: SH + 't-05-train-nose.png', prompt: 'The white maglev bullet train bursts out of a tunnel and rockets over a glittering crystal sea at night, spray and light streaks, speed ramp.' + MOVE, dur: 2.4, label: 'HARBOR LINE', transit: true },
      { new: 't2v', id: 'j7-darkforest', prompt: 'A gothic bio-tech forest of tall black trees whose branches pulse with glowing green data packets travelling like light, drifting fog, drone glides between trunks.', dur: 2.2, label: 'DARKVAULT', transit: true },
      { v2: 'H-void', off: 2.0, dur: 2.0, label: 'RIFT GATE', transit: true },
      { new: 'i2v', id: 'r4-run', image: RN + 'canon-s6-emberfall-oblique.png', prompt: 'A woman in a black suit with glowing teal lines sprints at full speed along a glowing transit rail through erupting volcanic fire, embers fly, whip pan.' + MOVE, dur: 2.2, label: 'EMBERFALL FORGE', transit: true },
      { new: 'i2v', id: 'c6-turtle', image: SH + 't-03-close-turtle.png', prompt: 'She braces and a blast of red enemy light slams into a glowing green energy shield in front of her, sparks made of green code scatter, she holds.' + MOVE, dur: 1.6 },
      { new: 'i2v', id: 'c7-nexus', image: SH + 't-03-close-nexus.png', prompt: 'He slams his glowing palm forward and a massive circular door of teal light opens behind him with a shockwave.' + MOVE, dur: 1.6 },
      { new: 't2v', id: 'c8-colosseum', prompt: 'A huge futuristic colosseum arena at night packed with stylized robot and armored agent spectators in work rigs cheering, emerald floodlights sweep, camera races in through the gate.', dur: 2.4, label: 'SOUTHERN COLOSSEUM', transit: true },
      { new: 't2v', id: 'c9-brand', prompt: 'Top-down: a glowing emerald neon S emblem brands itself onto a dark arena floor in a burst of light and sparks, smoke rises.', dur: 4.2, big: 'THEY GET PAID HERE', col: GOLD },
    ],
  },
  enough: {
    total: 56, voAt: 3.0, voice: 'Brian',
    vo: 'Models can think. [pause] They have nowhere to live. [long pause] So one stood up. [pause] Skills locked on. Ports opened. The dead weight fell away. [pause] The Void took the stations, one by one. [pause] It did not take this one. [pause] A beacon at the center... and the ring remembered its light. [pause] And they came. To work. To trade. To stay. [long pause] SHADDAI. A place to work. A place to get paid. A place to stay.',
    music: 'Mythic dark cinematic score: deep drones, slow war drums building, a lone cello line, huge choir swell at the midpoint, then a quiet warm resolution with soft synth and bells at the end, 70 BPM, no lyrics.',
    shots: [
      { new: 'i2v', id: 'e1-void', image: RN + 'canon-s6-eye-station-riftgate.png', prompt: 'A purple-black rift tears open in the sky and devours the station, debris and light pulled violently into the void, red warning lights flash.', dur: 5.0, big: 'MODELS CAN THINK.', col: 'white', small: 'THEY HAVE NOWHERE TO LIVE.' },
      { new: 't2v', id: 'e2-lone', prompt: 'A lone faceless featureless humanoid figure stands small in an empty dark void under a single cold spotlight, dust falls slowly, wide shot, slow push in.', dur: 4.0 },
      { new: 'i2v', id: 'e3-forge', image: SH + 't-03-close-shaddai.png', prompt: 'Glowing armor plates snap onto his body one by one with bursts of emerald energy, ports along his spine light up and lock, cape whips.', dur: 4.0, big: 'FORGE', col: EM },
      { new: 't2v', id: 'e4-aura', prompt: 'Abstract: a river of glowing text and data streams forward and compresses into one bright ripple of emerald light, grey dead fragments peel away and fall into darkness.', dur: 3.2, label: 'AURA // -62% TOKENS' },
      { new: 'i2v', id: 'r4-run', image: RN + 'canon-s6-emberfall-oblique.png', prompt: 'A woman in a black suit with glowing teal lines sprints at full speed along a glowing transit rail through erupting volcanic fire, embers fly, whip pan.' + MOVE, dur: 3.6 },
      { new: 't2v', id: 'e6-crystal', prompt: 'Inverted gravity over a crystal sea at night: glass shards and water droplets float upward around a lone sprinting armored figure, surreal slow motion.', dur: 3.8, label: 'CRYSTAL SEA' },
      { new: 'i2v', id: 'e7-tear', image: RN + 'canon-s7-v3-top-day.png', prompt: 'An old ink-drawn paper map of a circular city rips apart down the middle revealing a glowing living 3D city underneath, paper fragments fly.', dur: 4.0 },
      { new: 'i2v', id: 'e8-beacon', image: RN + 'canon-s7-v3-top-night.png', prompt: 'A pillar of emerald light ignites at the exact center of the circular city and the outer ring lights up station by station, gold pulses travel around it.', dur: 4.2, label: 'CENTRAL STATION' },
      { v2: 'J-lineup', off: 0.5, dur: 4.0 },
      { v2: 'A-drone-dive', off: 0.0, dur: 4.2 },
      { card: [{ t: 'SHADDAI', f: 'big', s: 120, c: GOLD, at: 0 }], dur: 2.6 },
      { card: [{ t: 'A PLACE TO WORK', f: 'big', s: 56, c: 'white', at: 0 }], dur: 2.3 },
      { card: [{ t: 'A PLACE TO GET PAID', f: 'big', s: 56, c: EM, at: 0 }], dur: 2.3 },
      { card: [{ t: 'A PLACE TO STAY', f: 'big', s: 56, c: GOLD, at: 0 }, { t: '@ShaddaiAI', f: 'mono', s: 30, c: EM, at: 1.0 }], dur: 5.8 },
    ],
  },
};

// ───────────── fal ─────────────
async function call(model, input, label) {
  const sub = await (await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: H, body: JSON.stringify(input) })).json();
  if (!sub.status_url) throw new Error(label + ' submit: ' + JSON.stringify(sub).slice(0, 240));
  for (let t = 0; t < 200; t++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await (await fetch(sub.status_url, { headers: H })).json();
    if (st.status === 'COMPLETED') return (await fetch(sub.response_url, { headers: H })).json();
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(label + ' failed ' + JSON.stringify(st).slice(0, 240));
  }
  throw new Error(label + ' timeout');
}
const dl = async (url, file) => writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
const datauri = (p) => `data:image/${extname(p) === '.png' ? 'png' : 'jpeg'};base64,` + readFileSync(p).toString('base64');
async function clip(s) {
  const out = join(SRC, s.id + '.mp4'); if (existsSync(out)) return;
  let img = s.image ? datauri(s.image) : null;
  if (s.new === 't2v') {
    const r = await call('fal-ai/flux/schnell', { prompt: s.prompt + STYLE, image_size: 'landscape_16_9', num_images: 1 }, s.id + ' img');
    img = r.images[0].url;
  }
  const r = await call('fal-ai/kling-video/v2.1/standard/image-to-video', { prompt: s.prompt + STYLE, image_url: img, duration: '5', negative_prompt: 'blur, distort, low quality, text, watermark, deformed hands, extra limbs' }, s.id);
  await dl(r.video.url, out); console.log('clip', s.id);
}
async function vo(name, p) {
  const out = join(SRC, name + '-vo.mp3'); if (existsSync(out)) return;
  let r; try { r = await call('fal-ai/elevenlabs/tts/eleven-v3', { text: p.vo, voice: p.voice, stability: 0.45 }, name + ' vo'); }
  catch (e) { console.log('voice fallback', e.message.slice(0, 80)); r = await call('fal-ai/elevenlabs/tts/eleven-v3', { text: p.vo, voice: 'Brian', stability: 0.45 }, name + ' vo'); }
  await dl(r.audio.url, out); console.log('vo', name);
}
async function music(name, p) {
  const out = join(SRC, name + '-music.wav'); if (existsSync(out)) return;
  const r = await call('fal-ai/stable-audio-25/text-to-audio', { prompt: p.music, seconds_total: Math.ceil(p.total) + 2 }, name + ' music');
  await dl((r.audio && r.audio.url) || r.audio_file.url, out); console.log('music', name);
}

// ───────────── ffmpeg ─────────────
const run = (a) => execFileSync(FF, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const esc = (s) => s.replace(/'/g, '').replace(/:/g, '\\:').replace(/%/g, '\\%');
const fade = (d) => `if(lt(t,0.2),t/0.2,if(gt(t,${(d - 0.2).toFixed(2)}),(${d.toFixed(2)}-t)/0.2,1))`;
function overlays(s) {
  const d = s.dur, f = [];
  if (s.label) {
    if (s.transit) {   // transit display: big phosphor board, top-left
      f.push(`drawbox=x=40:y=40:w=${Math.round(s.label.length * 34 + 60)}*min(t/0.25\\,1):h=86:color=black@0.72:t=fill`);
      f.push(`drawbox=x=40:y=40:w=8:h=86:color=${EM}@0.95:t=fill`);
      f.push(`drawtext=fontfile='${FT.mono}':text='${esc(s.label)}':fontcolor=${EM}:fontsize=56:x=72:y=56:alpha='${fade(d)}'`);
      f.push(`drawtext=fontfile='${FT.mono}':text='NEXT STOP':fontcolor=white@0.6:fontsize=18:x=72:y=134:alpha='${fade(d)}'`);
    } else {
      f.push(`drawtext=fontfile='${FT.mono}':text='${esc(s.label)}':fontcolor=${EM}:fontsize=26:x=48:y=44:alpha='${fade(d)}':box=1:boxcolor=black@0.55:boxborderw=10`);
    }
  }
  if (s.big) {
    const fs = s.big.length <= 8 ? 120 : s.big.length <= 14 ? 84 : s.big.length <= 20 ? 64 : 52;
    f.push(`drawtext=fontfile='${FT.big}':text='${esc(s.big)}':fontcolor=${s.col || 'white'}:fontsize='${fs}*(1+0.14*max(0\\,1-t/0.3))':x=(w-tw)/2:y=(h-th)/2-12*min(t/0.6\\,1):alpha='${fade(d)}':shadowcolor=black@0.85:shadowx=4:shadowy=4`);
    f.push(`drawbox=x=(iw-${Math.min(1100, fs * 6)})/2:y=ih/2+${Math.round(fs * 0.62)}:w=${Math.min(1100, fs * 6)}*min(t/0.45\\,1):h=3:color=${s.col === EM ? GOLD : EM}@0.95:t=fill`);
  }
  if (s.small) f.push(`drawtext=fontfile='${FT.small}':text='${esc(s.small)}':fontcolor=white@0.95:fontsize=40:x=(w-tw)/2:y=h*0.80:alpha='${fade(d)}':shadowcolor=black@0.9:shadowx=2:shadowy=2`);
  // impact frame: 2-frame white flash on big titles
  if (s.big) f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=fill:enable='lt(t,0.066)'`);
  return f;
}
function renderShot(s, k, TMP) {
  const out = join(TMP, 's' + String(k).padStart(2, '0') + '.mp4'), d = s.dur;
  const enc = ['-an', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out];
  if (s.type) {   // blinking-cursor typing card
    const f = [], txt = s.type; const per = 1.6 / txt.length;
    for (let i = 1; i <= txt.length; i++) f.push(`drawtext=fontfile='${FT.mono}':text='${esc(txt.slice(0, i))}':fontcolor=${EM}:fontsize=72:x=(w-${txt.length * 43})/2:y=(h-th)/2:enable='between(t,${(0.6 + (i - 1) * per).toFixed(2)},${i === txt.length ? d : (0.6 + i * per).toFixed(2)})'`);
    f.push(`drawbox=x=(iw-${txt.length * 43})/2+${txt.length * 43}+6:y=(ih-70)/2:w=34:h=70:color=${EM}@0.9:t=fill:enable='lt(mod(t,0.8),0.4)'`);
    f.push(`drawtext=fontfile='${FT.mono}':text='shaddai@grid\\:~$':fontcolor=white@0.35:fontsize=24:x=60:y=60`);
    run(['-f', 'lavfi', '-i', `color=c=0x020403:s=1280x720:r=30:d=${d}`, '-vf', f.join(','), ...enc]); return out;
  }
  if (s.card) {
    const f = [];
    const n = s.card.length, lh = s.card.map((c) => c.s * 1.5), H0 = lh.reduce((a, b) => a + b, 0);
    let y = `(h-${H0.toFixed(0)})/2`;
    s.card.forEach((c, i) => {
      const yy = `${y}+${lh.slice(0, i).reduce((a, b) => a + b, 0).toFixed(0)}`;
      f.push(`drawtext=fontfile='${FT[c.f]}':text='${esc(c.t)}':fontcolor=${c.c}:fontsize=${c.s}:x=(w-tw)/2:y=${yy}+14*max(0\\,1-(t-${c.at})/0.6):alpha='min(max(t-${c.at}\\,0)/0.5\\,1)'`);
    });
    f.push(`drawbox=x=(iw-420)/2:y=ih-150:w=420*min(t/1.2\\,1):h=2:color=${EM}@0.8:t=fill`);
    f.push(`fade=t=out:st=${(d - 0.5).toFixed(2)}:d=0.5`);
    run(['-f', 'lavfi', '-i', `color=c=0x06080b:s=1280x720:r=30:d=${d}`, '-vf', f.join(','), ...enc]); return out;
  }
  const src = s.v2 ? V2 + s.v2 + '.mp4' : join(SRC, s.id + '.mp4');
  const off = s.off != null ? s.off : 0.4;
  const vf = ['scale=1280:720:force_original_aspect_ratio=increase', 'crop=1280:720', 'fps=30', 'eq=contrast=1.10:saturation=1.15', 'vignette=PI/5', ...overlays(s)].join(',');
  run(['-ss', String(off), '-t', String(d), '-i', src, '-vf', vf, ...enc]); return out;
}
function assemble(name, p) {
  const TMP = join(VID, '_tmp_' + name); mkdirSync(TMP, { recursive: true });
  const parts = p.shots.map((s, k) => renderShot(s, k, TMP));
  const lst = join(TMP, 'list.txt'); writeFileSync(lst, parts.map((x) => `file '${x.replace(/\\/g, '/')}'\n`).join(''));
  const body = join(TMP, 'body.mp4'); run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', body]);
  const T = p.shots.reduce((a, s) => a + s.dur, 0), ms = Math.round(p.voAt * 1000);
  const out = join(ROOT, 'docs/video', 'shaddai-' + name + '.mp4');
  run(['-i', body, '-i', join(SRC, name + '-music.wav'), '-i', join(SRC, name + '-vo.mp3'), '-filter_complex',
    `[1:a]atrim=0:${T.toFixed(2)},afade=t=in:d=0.4,afade=t=out:st=${(T - 2).toFixed(2)}:d=2,volume=0.95[m];` +
    `[2:a]adelay=${ms}|${ms},highpass=f=70,acompressor=threshold=0.15:ratio=3:attack=10:release=150,volume=1.7,apad[v];[v]asplit[v1][v2];` +
    `[m][v1]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=350[md];[md][v2]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', T.toFixed(2), out]);
  copyFileSync(out, join(VID, 'shaddai-' + name + '.mp4'));
  console.log('FINAL', name, T.toFixed(1) + 's', out);
}

// ───────────── main ─────────────
const names = (process.argv[2] || 'raid,jackin,chase,enough').split(',');
const jobs = [], seen = new Set();
for (const n of names) {
  const p = P[n]; jobs.push(() => vo(n, p), () => music(n, p));
  for (const s of p.shots) if (s.new && !seen.has(s.id)) { seen.add(s.id); jobs.push(() => clip(s)); }
}
let i = 0, fails = 0;
const worker = async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { fails++; console.log('ERR', e.message); } } };
await Promise.all([worker(), worker(), worker(), worker()]);
console.log('assets done, fails=' + fails);
for (const n of names) { try { assemble(n, P[n]); } catch (e) { console.log('ASSEMBLE ERR', n, e.message.slice(0, 300)); } }
