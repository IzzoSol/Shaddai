# assemble.py — build the SHADDAI pre-trailer MP4 from stills + VO with ffmpeg (Ken-Burns push, animated themed titles, drone bed).
#   python tools/blender/trailer/assemble.py <shots_dir> <renders_dir> <vo_dir> <out.mp4>
import subprocess, sys, os, wave, shutil
SHOTS, REND, VO, OUT = sys.argv[1:5]
FF = shutil.which('ffmpeg') or r'C:\Users\Brittany\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe'
FONT = 'C\\:/Windows/Fonts/bahnschrift.ttf'
EM, GOLD = '0x00ff9c', '0xe8c45c'
TMP = os.path.join(os.path.dirname(os.path.abspath(OUT)), '_seg'); os.makedirs(TMP, exist_ok=True)
S = lambda n: os.path.join(SHOTS, n + '.png'); R = lambda n: os.path.join(REND, n + '.png')
# (vo index, images, title, subtitle, colour)
SEGS = [
    (1, [R('canon-s7-v3-top-night'), R('canon-s6-void-oblique')], 'EVERY WORLD HAS A BEGINNING', 'this one was built by agents', EM),
    (2, [S('t-01-lineup')], 'SHADDAI', '', GOLD),
    (3, [R('canon-s7-v3-top-day'), S('t-02-lineup-low'), R('canon-s6-emberfall-oblique')], 'ONE WORLD  ·  SEVEN AGENTS  ·  EIGHT REALMS', '', EM),
    (4, [S('t-05-train-nose'), S('t-06-train-side')], 'RIDE THE MAGLEV', 'across the ring', EM),
    (5, [S('t-07-dragon')], 'FACE THE DRAGONS', 'every realm has a guardian', GOLD),
    (6, [S('t-04-weapons'), R('canon-s7-v3-commons-oblique')], 'BUILD  ·  HIRE  ·  EARN SPARKS', '', EM),
    (7, [S('t-03-close-zerox'), S('t-03-close-nexus'), S('t-03-close-turtle'), S('t-03-close-shaddai')], 'YOUR AGENTS WORK WHILE YOU PLAY', 'trade  ·  fight  ·  build', GOLD),
    (8, [S('t-01-lineup')], 'SHADDAI', 'THE AGENT WORLD  —  COMING SOON', GOLD),
]
def wav_len(p):
    with wave.open(p) as w: return w.getnframes() / float(w.getframerate())
def run(args): subprocess.run([FF, '-y', '-loglevel', 'error'] + args, check=True)
FPS = 30
parts = []
for k, (vi, imgs, title, sub, col) in enumerate(SEGS):
    vo = os.path.join(VO, 'vo%d.wav' % vi); D = round(wav_len(vo) + 1.1, 2)
    if k == len(SEGS) - 1: D += 1.5
    per = D / len(imgs); ins = []; fl = []
    for j, im in enumerate(imgs):
        ins += ['-loop', '1', '-t', str(per), '-i', im]
        n = int(per * FPS) + 1; zin = 1 if j % 2 == 0 else -1   # alternate push-in / pull-out
        z = "if(eq(on,0),%s,zoom%s0.0009)" % ('1.0' if zin > 0 else '1.12', '+' if zin > 0 else '-')
        fl.append("[%d:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='%s':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=1280x720:fps=%d,setsar=1[v%d]" % (j, z, n, FPS, j))
    cat = ''.join('[v%d]' % j for j in range(len(imgs))) + 'concat=n=%d:v=1:a=0[bg]' % len(imgs)
    big = 64 if title == 'SHADDAI' else 40
    a = "if(lt(t,0.5),t/0.5,if(gt(t,%.2f),(%.2f-t)/0.5,1))" % (D - 0.5, D)
    txt = ("[bg]eq=brightness=-0.03:saturation=1.15,vignette=PI/5,"
           "drawbox=x=0:y=ih*0.70:w=iw:h=ih*0.30:color=black@0.45:t=fill,"
           "drawtext=fontfile='%s':text='%s':fontcolor=%s:fontsize=%d:x=(w-tw)/2:y=h*0.76-18*min(t/0.7\\,1):alpha='%s':shadowcolor=black@0.8:shadowx=2:shadowy=2,"
           "drawbox=x=(iw-360)/2:y=ih*0.76+%d:w=360*min(t/0.9\\,1):h=2:color=%s@0.9:t=fill"
           % (FONT, title.replace("'", ''), col, big, a, big + 10, GOLD if col == EM else EM))
    if sub: txt += (",drawtext=fontfile='%s':text='%s':fontcolor=white@0.85:fontsize=22:x=(w-tw)/2:y=h*0.76+%d:alpha='%s'"
                    % (FONT, sub.replace("'", ''), big + 22, a))
    txt += ",fade=t=in:st=0:d=0.35,fade=t=out:st=%.2f:d=0.35[v]" % (D - 0.35)
    ins += ['-i', vo]; ai = len(imgs)
    aud = "[%d:a]adelay=450|450,apad,atrim=0:%.2f,aformat=sample_rates=44100:channel_layouts=stereo[a]" % (ai, D)
    out = os.path.join(TMP, 'seg%02d.mp4' % k)
    run(ins + ['-filter_complex', ';'.join(fl + [cat, txt, aud]), '-map', '[v]', '-map', '[a]', '-t', str(D),
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', out])
    parts.append(out); print('seg', k, D)
lst = os.path.join(TMP, 'list.txt'); open(lst, 'w').write(''.join("file '%s'\n" % p.replace('\\', '/') for p in parts))
body = os.path.join(TMP, 'body.mp4'); run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', body])
# ambient drone bed under the VO (two low sines + slow tremolo), then mix
run(['-i', body, '-f', 'lavfi', '-i', "aevalsrc='0.10*sin(2*PI*55*t)+0.07*sin(2*PI*82.5*t)+0.04*sin(2*PI*110*t)':s=44100:c=stereo",
     '-filter_complex', "[1:a]tremolo=f=0.25:d=0.5,lowpass=f=400,afade=t=in:d=2[d];[0:a][d]amix=inputs=2:duration=first:weights='1 0.6'[a]",
     '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', OUT])
print('TRAILER', OUT)
