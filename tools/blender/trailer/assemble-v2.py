# assemble-v2.py — SHADDAI trailer v2: fal action/drone clips cut to the ElevenLabs VO + Stable Audio score, themed kinetic titles.
#   python tools/blender/trailer/assemble-v2.py <v2_dir with clips/vo.mp3/music.wav> <out.mp4>
import subprocess, sys, os, shutil
D, OUT = sys.argv[1], sys.argv[2]
FF = shutil.which('ffmpeg') or next(os.path.join(r, 'ffmpeg.exe') for r, _, f in os.walk(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages')) if 'ffmpeg.exe' in f)
FONT = 'C\\:/Windows/Fonts/bahnschrift.ttf'; EM, GOLD, W = '0x00ff9c', '0xe8c45c', 'white'
VO_AT = 4.0
# (clip, clip offset s, start, end, big title, big colour, small line) — times on the trailer clock
SEQ = [
    ('A-drone-dive', 0.0, 0.0, 4.0, 'THE GRID', EM, ''),
    ('H-void', 0.5, 4.0, 7.2, '', '', 'Models can think, but they had nowhere to live.'),
    ('J-lineup', 0.0, 7.2, 9.9, '', '', 'Until now.'),
    ('B-train', 0.3, 9.9, 15.0, 'SHADDAI', GOLD, 'Seven agents  ·  Eight realms  ·  One Grid'),
    ('C-zerox', 1.6, 15.0, 16.35, 'THEY TRADE', EM, 'ZEROX'),
    ('D-nexus', 1.6, 16.35, 17.7, 'THEY BUILD', EM, 'NEXUS'),
    ('E-turtle', 1.4, 17.7, 19.0, 'THEY FIGHT', GOLD, 'TURTLE'),
    ('G-emberfall', 0.5, 19.0, 20.3, 'RIDE THE RING', EM, ''),
    ('F-dragon', 1.2, 20.3, 23.0, 'FACE THE GUARDIANS', GOLD, ''),
    ('I-shaddai', 1.0, 23.0, 26.3, 'YOUR AGENTS WORK', EM, 'and earn, even while you sleep'),
    ('J-lineup', 2.0, 26.3, 29.2, 'SHADDAI', GOLD, ''),
]
END_AT, TOTAL = 29.2, 34.0
TMP = os.path.join(os.path.dirname(os.path.abspath(OUT)), '_seg2'); os.makedirs(TMP, exist_ok=True)
def run(a): subprocess.run([FF, '-y', '-loglevel', 'error'] + a, check=True)
def esc(s): return s.replace("'", '').replace(':', '\\:')
def titles(dur, big, col, small):
    f = []
    a = "if(lt(t,0.25),t/0.25,if(gt(t,%.2f),(%.2f-t)/0.25,1))" % (dur - 0.25, dur)
    if big:
        fs = 118 if big == 'SHADDAI' else (76 if len(big) < 14 else 60)
        # punch-in: starts 12% larger and settles (kinetic), slight upward drift
        f.append("drawtext=fontfile='%s':text='%s':fontcolor=%s:fontsize='%d*(1+0.12*max(0\\,1-t/0.35))':x=(w-tw)/2:y=(h-th)/2-10*min(t/0.6\\,1):alpha='%s':shadowcolor=black@0.85:shadowx=3:shadowy=3:borderw=1:bordercolor=black@0.4"
                 % (FONT, esc(big), col, fs, a))
        f.append("drawbox=x=(iw-%d)/2:y=ih/2+%d:w=%d*min(t/0.5\\,1):h=3:color=%s@0.95:t=fill" % (fs * 5, fs // 2 + 14, fs * 5, GOLD if col == EM else EM))
    if small:
        f.append("drawtext=fontfile='%s':text='%s':fontcolor=white@0.92:fontsize=30:x=(w-tw)/2:y=h*0.86:alpha='%s':shadowcolor=black@0.9:shadowx=2:shadowy=2"
                 % (FONT, esc(small), a))
    return ','.join(f)
parts = []
for k, (clip, off, t0, t1, big, col, small) in enumerate(SEQ):
    dur = round(t1 - t0, 3); src = os.path.join(D, clip + '.mp4'); out = os.path.join(TMP, 's%02d.mp4' % k)
    vf = "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,eq=contrast=1.08:saturation=1.15,vignette=PI/5"
    t = titles(dur, big, col, small)
    if t: vf += ',' + t
    run(['-ss', str(off), '-t', str(dur), '-i', src, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out]); parts.append(out)
# end card: black, glowing SHADDAI + tagline, slow fade
dur = TOTAL - END_AT; out = os.path.join(TMP, 'end.mp4')
end = ("drawtext=fontfile='%s':text='SHADDAI':fontcolor=%s:fontsize=130:x=(w-tw)/2:y=(h-th)/2-40:alpha='min(t/0.8\\,1)':shadowcolor=0x00ff9c@0.5:shadowx=0:shadowy=0:borderw=2:bordercolor=0x00ff9c@0.35,"
       "drawbox=x=(iw-520)/2:y=ih/2+38:w=520*min(t/1.0\\,1):h=3:color=0x00ff9c@0.9:t=fill,"
       "drawtext=fontfile='%s':text='INTELLIGENCE HAS A PLACE':fontcolor=white@0.9:fontsize=34:x=(w-tw)/2:y=h/2+62:alpha='min(max(t-0.6\\,0)/0.8\\,1)',"
       "fade=t=out:st=%.2f:d=1.2" % (FONT, GOLD, FONT, dur - 1.2))
run(['-f', 'lavfi', '-i', 'color=c=0x06080b:s=1280x720:r=30:d=%.2f' % dur, '-vf', end, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out]); parts.append(out)
lst = os.path.join(TMP, 'list.txt'); open(lst, 'w').write(''.join("file '%s'\n" % p.replace('\\', '/') for p in parts))
body = os.path.join(TMP, 'body.mp4'); run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', body])
# audio: score (trimmed, faded) ducked under the VO; VO starts at VO_AT
ms = int(VO_AT * 1000)
run(['-i', body, '-i', os.path.join(D, 'music.wav'), '-i', os.path.join(D, 'vo.mp3'), '-filter_complex',
     "[1:a]atrim=0:%.2f,afade=t=in:d=0.6,afade=t=out:st=%.2f:d=2.5,volume=0.9[m];"
     "[2:a]adelay=%d|%d,volume=1.6,apad[v];[v]asplit[v1][v2];"
     "[m][v1]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[md];"
     "[md][v2]amix=inputs=2:duration=first:normalize=0[a]" % (TOTAL, TOTAL - 2.5, ms, ms),
     '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(TOTAL), OUT])
print('TRAILER', OUT)
