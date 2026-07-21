/* ══════════════════════════════════════════════════════════════════
   SHADDAI — MEDIA STUDIO v2  (media-studio.js)
   Big creative suite: Image · Video (40-shot camera library) · Music ·
   Voice · Writer · Clipper · Signal · Series · Gallery. Bold simple flow,
   per-tool API-detect ("No APIs found" + inline key), gated via SHDFree.
   window.openMediaStudio(tool). Self-contained overlay, no deps.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__mediaStudioV2) return; window.__mediaStudioV2 = true;

  var TOOLS = [
    { id: 'image', ic: '🎨', name: 'Image Gen', sub: 'prompt · style · negative', models: ['Flux', 'Midjourney', 'Leonardo', 'Pollinations (free)'] },
    { id: 'video', ic: '🎬', name: 'Video Studio', sub: 'shots · storyboard · hook', models: ['Runway', 'Kling', 'Pika', 'HeyGen'] },
    { id: 'music', ic: '🎵', name: 'Music + Audio', sub: 'lyrics · beats · sound', models: ['Suno', 'Udio', 'Splash'] },
    { id: 'voice', ic: '🎙️', name: 'Voice / TTS', sub: 'clone · generate · script', models: ['Web Speech (free)', 'ElevenLabs', 'VoiceBox'] },
    { id: 'writer', ic: '✍️', name: 'AI Writer', sub: 'threads · captions · blogs', models: ['QUILL'] },
    { id: 'clipper', ic: '✂️', name: 'Video Clipper', sub: 'long → vertical shorts', models: ['ffmpeg', 'Whisper'] },
    { id: 'signal', ic: '📈', name: 'Chart Signal', sub: 'ticker → signal post', models: ['ORACLE'] },
    { id: 'series', ic: '🗂️', name: 'Content Series', sub: 'topic → day-by-day', models: ['QUILL'] },
    { id: 'gallery', ic: '🖼️', name: 'Gallery', sub: 'saved · export', models: [] }
  ];

  // 40+ camera shots (grouped) — each is a ready prompt snippet.
  var SHOTS = [
    ['Pan/Tilt', 'Static', 'locked-off static shot. Hold one fixed camera position for the full clip. Keep the same angle, height, lens and composition end to end.'],
    ['Pan/Tilt', 'Pan right', 'pan right. Rotate the camera horizontally left→right from a fixed point, smooth constant rotation, horizon level, settle on a clear final composition.'],
    ['Pan/Tilt', 'Pan left', 'pan left. Rotate horizontally right→left from a fixed point, smooth constant rotation, horizon level, settle on a clear final frame.'],
    ['Pan/Tilt', 'Whip pan right', 'whip pan right. Rotate rapidly toward a target on the right, fast snap with brief motion blur, land on a second readable target, settle sharp.'],
    ['Pan/Tilt', 'Whip pan left', 'whip pan left. Rotate rapidly toward a target on the left, fast snap with motion blur, land sharp on a second composition.'],
    ['Pan/Tilt', 'Tilt up', 'tilt up. Rotate the camera upward from a fixed point, smooth constant tilt, keep the vertical subject centered, land on the upper target.'],
    ['Pan/Tilt', 'Tilt down', 'tilt down. Rotate downward from a fixed point, smooth constant tilt, keep the subject centered, land on the lower target.'],
    ['Zoom/Lens', 'Slow zoom in', 'slow zoom in. Gradually increase focal length toward a tighter frame, even speed, keep the target readable, finish stable and tight.'],
    ['Zoom/Lens', 'Slow zoom out', 'slow zoom out. Gradually widen the frame, even speed, keep the target readable as more space appears, finish stable and wide.'],
    ['Zoom/Lens', 'Fast zoom in', 'fast zoom in. Quick decisive zoom toward the target, keep it centered through the scale change, finish tight and stable.'],
    ['Zoom/Lens', 'Fast zoom out', 'fast zoom out. Quick decisive zoom away, keep the target readable as surroundings appear, finish wide and stable.'],
    ['Zoom/Lens', 'Crash zoom in', 'crash zoom in. Snap the lens rapidly toward the target, very fast and punchy, land on a bold tight composition.'],
    ['Zoom/Lens', 'Crash zoom out', 'crash zoom out. Snap rapidly away, very fast and punchy, land on a bold wide composition.'],
    ['Dolly/Track', 'Dolly in', 'dolly in. Move the camera physically forward in a straight line toward the subject, smooth push, keep height/lens consistent, finish tighter.'],
    ['Dolly/Track', 'Dolly out', 'dolly out. Move physically backward in a straight line, smooth retreat, more environment enters, finish wider.'],
    ['Dolly/Track', 'Tracking', 'tracking shot. Move through the scene with the subject, match their pace, keep them readable while the environment moves around them.'],
    ['Dolly/Track', 'Follow / OTS', 'follow shot from behind. Move behind the subject at shoulder height, match their pace, keep the route ahead readable.'],
    ['Dolly/Track', 'Reverse tracking', 'reverse tracking. Move backward in front of the walking subject, match their forward pace, keep front-facing framing stable.'],
    ['Dolly/Track', 'Side tracking', 'side tracking. Move parallel beside the subject, match their motion, keep them in side/three-quarter profile at a stable distance.'],
    ['Dolly/Track', 'Low tracking', 'low tracking. Move at ground height alongside the subject, match footsteps/wheels, keep low detail readable, ground plane moving.'],
    ['Dolly/Track', 'Vehicle tracking', 'vehicle tracking. Move with the vehicle along its route, match its pace, keep it stable while the road moves past.'],
    ['Dolly/Track', 'Chase', 'chase shot. Follow a moving subject quickly, fast reactive and close, energetic reframing, stay connected to the motion.'],
    ['Physical', 'Truck right', 'truck right. Move the camera physically right on a straight horizontal path, lens facing the same way, scene slides across frame.'],
    ['Physical', 'Truck left', 'truck left. Move physically left on a straight horizontal path, lens facing the same way, clean lateral composition.'],
    ['Physical', 'Pedestal up', 'pedestal up. Move the entire camera vertically upward in a straight line, lens level, higher framing readable.'],
    ['Physical', 'Pedestal down', 'pedestal down. Move vertically downward in a straight line, lens level, lower framing readable.'],
    ['Physical', 'Slider right', 'slider right. Slide a small distance right, slow constant motion, keep foreground/subject/background layers readable as parallax shifts.'],
    ['Physical', 'Slider left', 'slider left. Slide a small distance left, slow constant motion, parallax between layers, refined new-angle composition.'],
    ['Physical', 'Push past', 'push past / pass-by. Move forward past a foreground object or opening, smooth glide, foreground passes close, arrive beyond it.'],
    ['Physical', 'Arc right', 'arc right. Move on a shallow curved path around the subject toward the right, keep distance/height/readability, finish from a new right angle.'],
    ['Physical', 'Arc left', 'arc left. Shallow curved path around the subject to the left, consistent distance/height, finish from a new left angle.'],
    ['Physical', 'Orbit CW', 'clockwise orbit. Circle clockwise around the subject at a consistent radius, subject centered, background rotates, stable framing.'],
    ['Physical', 'Orbit CCW', 'counterclockwise orbit. Circle CCW at a consistent radius, subject centered, background rotates around them, stable end.'],
    ['Human', 'Handheld', 'handheld shot. Human operator height, natural body movement, subtle sway and micro-adjustments, subject stays readable.'],
    ['Human', 'Snorricam', 'body-mounted Snorricam. Camera fixed to the subject\'s torso/face while they move, subject centered and facing camera, background moves around them.'],
    ['Drone/Crane', 'Crane up', 'crane up. Travel smoothly upward through open space, slow controlled lift, keep subject readable, higher scale visible.'],
    ['Drone/Crane', 'Crane down', 'crane down. Travel smoothly downward, slow controlled descent, keep subject readable, lower destination visible.'],
    ['Drone/Crane', 'Drone push in', 'drone push in. Fly smoothly forward through open space toward the subject, controlled aerial glide, arrive closer.'],
    ['Drone/Crane', 'Drone pull back', 'drone pull back. Fly smoothly backward, controlled aerial retreat, more landscape appears, wide aerial composition.'],
    ['Drone/Crane', 'Helicopter', 'helicopter aerial. High altitude broad gradual flight path, steady controlled motion, landscape readable at wide scale.'],
    ['Specials', 'First-person', 'first-person view. Move forward at eye height from the character\'s POV, natural pace, visible hands/arms as reference.'],
    ['Specials', 'Tilt-shift', 'tilt-shift miniature. High angled view, small precise movement, narrow band of sharp focus with soft blur above/below, miniature scale.'],
    ['Specials', 'Infinite zoom', 'infinite zoom. Zoom continuously inward toward the exact center target, smooth accelerating, next world fills frame.'],
    ['Specials', 'Earth zoom out', 'earth zoom out. Pull upward through street→city→landscape→planet scale, rapid expanding zoom, origin implied at center.'],
    ['Specials', 'Time-lapse', 'locked-camera time-lapse. Fixed position, time moves rapidly, stable composition and horizon, visible passage of time.'],
    ['Specials', 'Pass-through', 'pass-through. Move forward toward a surface/opening and continue into the space beyond, smooth centered glide, arrive inside.']
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
  function toast(m) { try { if (window.notify) return notify(m); } catch (e) {} }
  function copy(t) { try { navigator.clipboard.writeText(t); toast('📋 Prompt copied'); } catch (e) {} }

  function css() {
    if (document.getElementById('mstudio-css')) return;
    var s = document.createElement('style'); s.id = 'mstudio-css';
    s.textContent =
      '#mstudio{position:fixed;inset:0;z-index:100035;display:none;background:radial-gradient(90% 60% at 50% -10%,rgba(168,85,247,.14),transparent 60%),#0a0518;color:#efe9ff;font-family:"Chakra Petch",sans-serif}' +
      '#mstudio.on{display:flex;flex-direction:column}' +
      '#mstudio .top{display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border-bottom:1px solid rgba(168,85,247,.2)}' +
      '#mstudio .t{font-family:"Space Grotesk";font-weight:700;font-size:15px;letter-spacing:.06em;background:linear-gradient(90deg,#a855f7,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '#mstudio .cl{background:none;border:1px solid rgba(168,85,247,.4);color:#9a86c8;border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit}' +
      '#mstudio .wrap{flex:1;display:flex;min-height:0}' +
      '#mstudio .rail{width:190px;flex:none;border-right:1px solid rgba(168,85,247,.2);padding:12px 10px;overflow:auto;background:rgba(16,10,36,.5)}' +
      '#mstudio .rb{display:flex;gap:9px;align-items:center;width:100%;text-align:left;padding:9px 10px;margin-bottom:6px;border-radius:9px;border:1px solid transparent;background:none;color:#c7b6ef;cursor:pointer;font-family:inherit}' +
      '#mstudio .rb:hover{background:rgba(168,85,247,.1)}#mstudio .rb.on{background:linear-gradient(100deg,rgba(168,85,247,.22),transparent);border-color:rgba(168,85,247,.35);color:#fff}' +
      '#mstudio .rb .i{font-size:17px}#mstudio .rb b{font-family:"Space Grotesk";font-size:13px;display:block}#mstudio .rb small{color:#9a86c8;font-size:9px}' +
      '#mstudio .stage{flex:1;overflow:auto;padding:18px 22px}' +
      '#mstudio h3{font-family:"Space Grotesk";font-size:18px;margin:0 0 3px}#mstudio .sub{font-family:"IBM Plex Mono";font-size:11px;color:#9a86c8;margin-bottom:16px}' +
      '#mstudio .api{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px}#mstudio .api .m{font-family:"IBM Plex Mono";font-size:10px;padding:6px 11px;border-radius:999px;border:1px solid rgba(168,85,247,.3);color:#c7b6ef;cursor:pointer}#mstudio .api .m.on{background:#a855f7;color:#0b0416;border-color:#a855f7}' +
      '#mstudio .noapi{border:1px solid rgba(232,196,92,.35);background:rgba(232,196,92,.06);border-radius:10px;padding:12px 14px;font-size:12px;color:#e8c45c;margin-bottom:16px}#mstudio .noapi input{margin-top:8px;width:100%;max-width:340px;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:7px;color:#efe9ff;padding:8px 10px;font-family:inherit}' +
      '#mstudio .box{width:100%;max-width:640px;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:10px;color:#efe9ff;padding:11px 13px;font-family:inherit;font-size:13px;min-height:70px}' +
      '#mstudio .go{margin-top:12px;font-family:"Space Grotesk";font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416}' +
      '#mstudio .grp{font-family:"IBM Plex Mono";font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6f5aa8;margin:18px 0 9px}' +
      '#mstudio .shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}' +
      '#mstudio .shot{border:1px solid rgba(168,85,247,.2);background:linear-gradient(160deg,rgba(24,16,46,.6),rgba(14,10,26,.4));border-radius:11px;padding:11px 12px}' +
      '#mstudio .shot b{font-family:"Space Grotesk";font-size:13px}#mstudio .shot p{font-size:10.5px;color:#9a86c8;line-height:1.4;margin:5px 0 9px}' +
      '#mstudio .shot .row{display:flex;gap:6px}#mstudio .shot button{flex:1;font-family:"Chakra Petch";font-weight:600;font-size:10.5px;padding:6px;border-radius:7px;cursor:pointer;border:1px solid rgba(168,85,247,.25);background:rgba(168,85,247,.08);color:#e7ddff}#mstudio .shot button.pri{background:#a855f7;color:#0b0416;border-color:#a855f7}';
    document.head.appendChild(s);
  }

  var root, active = 'image';
  function build() {
    css();
    root = document.createElement('div'); root.id = 'mstudio';
    root.innerHTML = '<div class="top"><div class="t">🎛️ MEDIA STUDIO</div><button class="cl" id="msClose">✕ Close</button></div>' +
      '<div class="wrap"><div class="rail">' + TOOLS.map(function (t) { return '<button class="rb" data-t="' + t.id + '"><span class="i">' + t.ic + '</span><span><b>' + t.name + '</b><small>' + t.sub + '</small></span></button>'; }).join('') + '</div>' +
      '<div class="stage" id="msStage"></div></div>';
    document.body.appendChild(root);
    root.querySelector('#msClose').onclick = close;
    root.querySelectorAll('.rb').forEach(function (b) { b.onclick = function () { show(b.dataset.t); }; });
  }
  function show(id) {
    active = id;
    root.querySelectorAll('.rb').forEach(function (b) { b.classList.toggle('on', b.dataset.t === id); });
    var t = TOOLS.filter(function (x) { return x.id === id; })[0] || TOOLS[0];
    var st = document.getElementById('msStage');
    var head = '<h3>' + t.ic + ' ' + esc(t.name) + '</h3><div class="sub">' + esc(t.sub) + '</div>' +
      (t.models.length ? '<div class="api">' + t.models.map(function (m, i) { return '<span class="m' + (i === 0 ? ' on' : '') + '">' + esc(m) + '</span>'; }).join('') + '</div>' +
        '<div class="noapi">⚠ No API key found for the paid lanes — add one to unlock full quality.<br><input placeholder="Paste an API key (stored locally)…"></div>' : '');
    if (id === 'video') { st.innerHTML = head + videoLib(); wireShots(st); }
    else if (id === 'gallery') { st.innerHTML = head + '<div class="grp">Your outputs</div><div class="sub">Saved images · video · 3D · Bazaar-collected items appear here.</div>'; }
    else { st.innerHTML = head + '<textarea class="box" placeholder="Describe what to create…"></textarea><br><button class="go" onclick="try{if(window.SHDFree)SHDFree.gate(\'media\',{label:\'generations\',onAllowed:function(){window.notify&&notify(\'⚡ Generating…\')}})}catch(e){}">✦ Generate</button>'; }
  }
  function videoLib() {
    var groups = {}; SHOTS.forEach(function (s) { (groups[s[0]] = groups[s[0]] || []).push(s); });
    var h = '<textarea class="box" placeholder="Your scene / subject…"></textarea><div class="grp" style="margin-top:14px">Camera shots — ' + SHOTS.length + ' presets · pick one, copy the prompt or turn into video</div>';
    Object.keys(groups).forEach(function (g) {
      h += '<div class="grp">' + esc(g) + '</div><div class="shots">' + groups[g].map(function (s) {
        return '<div class="shot"><b>' + esc(s[1]) + '</b><p>' + esc(s[2]) + '</p><div class="row"><button data-p="' + esc(s[2]) + '">📋 Copy</button><button class="pri" data-p="' + esc(s[2]) + '">🎬 Video</button></div></div>';
      }).join('') + '</div>';
    });
    return h;
  }
  function wireShots(st) {
    st.querySelectorAll('.shot button').forEach(function (b) {
      b.onclick = function () {
        var scene = (st.querySelector('.box') || {}).value || '';
        var prompt = (scene ? scene + ' — ' : '') + b.dataset.p;
        if (b.classList.contains('pri')) { try { if (window.SHDFree) SHDFree.gate('media', { label: 'videos', onAllowed: function () { toast('🎬 Sent to video generator: ' + b.dataset.p.slice(0, 40) + '…'); } }); } catch (e) {} }
        else copy(prompt);
      };
    });
  }

  window.openMediaStudio = function (tool) { if (!root) build(); root.classList.add('on'); document.body.style.overflow = 'hidden'; show(tool && TOOLS.some(function (t) { return t.id === tool; }) ? tool : 'image'); };
  function close() { if (root) root.classList.remove('on'); document.body.style.overflow = ''; }

  // REVERTED (owner): do NOT hijack the Media nav button. The original in-dashboard
  // Media tab — showView('media') — stays the primary experience. openMediaStudio()
  // remains available on demand for anything that explicitly calls it, but nothing
  // is auto-repointed, so the original tab and the dashboard buttons stay intact.
})();
