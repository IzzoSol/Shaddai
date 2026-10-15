# quickcut.py - ffmpeg-only hype trailers from existing renders (no Blender, no fal). python quickcut.py <out_dir>
import subprocess, sys, os, shutil
R='.bl-cache/renders/'; VO='tools/blender/trailer/vo/'; OUT=sys.argv[1]
FF=shutil.which('ffmpeg'); FONT='C\:/Windows/Fonts/bahnschrift.ttf'; EM='0x00ff9c'; GOLD='0xe8c45c'
SEG=3.6; XF=0.5
def esc(s): return s.replace("'","").replace(':','\:')
def build(name, shots, vos, endline):
    n=len(shots); inputs=[]; fc=[]
    for i,(img,title,col,sub) in enumerate(shots):
        inputs+=['-loop','1','-t',str(SEG+XF+0.2),'-i',R+img]
        zin = (i%2==0)
        z = "min(zoom+0.0009,1.28)" if zin else "if(eq(on,0),1.28,max(zoom-0.0009,1.0))"
        pan = "x='iw/2-(iw/zoom/2)+sin(on/40)*30':y='ih/2-(ih/zoom/2)'"
        dt = ''
        if title: dt += f",drawtext=fontfile='{FONT}':text='{esc(title)}':fontsize=132:fontcolor={col}:borderw=3:bordercolor=black@0.7:x=(w-tw)/2:y=h*0.42:alpha='min(1,t/0.35)*min(1,({SEG}-t)/0.3)'"
        if sub: dt += f",drawtext=fontfile='{FONT}':text='{esc(sub)}':fontsize=42:fontcolor=white:borderw=2:bordercolor=black@0.7:x=(w-tw)/2:y=h*0.62:alpha='min(1,(t-0.3)/0.4)*min(1,({SEG}-t)/0.3)'"
        fc.append(f"[{i}:v]scale=2400:-2,zoompan=z='{z}':{pan}:d={int((SEG+XF+0.2)*30)}:s=1920x1080:fps=30,"
                  f"eq=contrast=1.18:saturation=1.45:brightness=-0.03,split[a{i}][b{i}];[b{i}]gblur=sigma=22,eq=brightness=0.02[g{i}];[a{i}][g{i}]blend=all_mode=screen:all_opacity=0.45,"
                  f"noise=alls=9:allf=t,vignette=PI/4.2{dt},format=yuv420p[v{i}]")
    last='v0'
    for i in range(1,n):
        off=round(i*(SEG)-0.0,2)
        fc.append(f"[{last}][v{i}]xfade=transition={'fadewhite' if i%3==0 else ('slideleft' if i%2 else 'circleopen')}:duration={XF}:offset={round(i*SEG-XF+0.5,2)}[x{i}]"); last=f'x{i}'
    total=round(n*SEG+0.5,2)
    fc.append(f"[{last}]fade=t=in:st=0:d=0.5,fade=t=out:st={total-0.9}:d=0.9,drawtext=fontfile='{FONT}':text='{esc(endline)}':fontsize=54:fontcolor={GOLD}:x=(w-tw)/2:y=h*0.88:alpha='if(gt(t,{total-3.2}),min(1,(t-{total-3.2})/0.6),0)'[vout]")
    ai=len(shots); vin=[]; af=[]
    for k,(f,at) in enumerate(vos):
        inputs+=['-i',VO+f]; af.append(f"[{ai+k}:a]adelay={int(at*1000)}|{int(at*1000)},volume=1.6[vo{k}]"); vin.append(f'[vo{k}]')
    inputs+=['-f','lavfi','-t',str(total),'-i',f"aevalsrc='0.35*sin(2*PI*(45+t*2)*t)*(0.55+0.45*sin(2*PI*2.2*t))+0.10*sin(2*PI*(110+t*22)*t)*(t/{total})+0.05*sin(2*PI*880*t)*pow(max(0,sin(2*PI*4.4*t)),8)':s=44100:c=stereo"]
    af.append(f"[{ai+len(vos)}:a]lowpass=f=2500,volume=0.55,afade=t=in:d=1,afade=t=out:st={total-1.5}:d=1.5[bed]")
    af.append(''.join(vin)+'[bed]'+f"amix=inputs={len(vin)+1}:normalize=0,alimiter=limit=0.95[aout]")
    o=os.path.join(OUT,name)
    subprocess.run([FF,'-y','-loglevel','error']+inputs+['-filter_complex',';'.join(fc+af),'-map','[vout]','-map','[aout]','-t',str(total),'-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k',o],check=True)
    print('made',o,os.path.getsize(o)//1024,'KB')
build('SHADDAI-trailer-1-THE-WORLD.mp4',[
 ('canon-s7-v3-top-night.png','EVERY WORLD',EM,'has a beginning'),
 ('canon-s6-void-oblique.png','THIS ONE',GOLD,'was built by agents'),
 ('canon-s7-v3-commons-oblique.png','SHADDAI',GOLD,'one world  -  seven agents  -  eight realms'),
 ('canon-s6-emberfall-oblique.png','RIDE THE RING',EM,'maglev across every realm'),
 ('game-dragon-check.png','FACE THE DRAGONS',GOLD,'guardians of every realm'),
 ('sc-lineup.png','YOUR AGENTS',EM,'trade  -  build  -  fight'),
 ('canon-s7-v3-cam-gate-night.png','EARN SPARKS',GOLD,'even while you sleep')],
 [('vo1.wav',0.4),('vo2.wav',4.0),('vo3.wav',7.4),('vo4.wav',11.0),('vo5.wav',14.6),('vo7.wav',18.2)],'SHADDAI  -  THE AGENT WORLD')
build('SHADDAI-trailer-2-COLOSSEUM-AND-ICE.mp4',[
 ('tour-09-colosseum.png','THE COLOSSEUM',GOLD,'32,000 seats  -  one arena'),
 ('sc-lineup-a.png','THE CHAMPIONS',EM,'seven agents enter'),
 ('tour-12-arctic-vault.png','THE ICE VILLAIN',EM,'awakens in the vault'),
 ('canon-s7-v3-race-quarter.png','HOVER  -  TRAIN  -  RACE',GOLD,'the whole grid is your arena'),
 ('game-dragon-check.png','DRAGONS ABOVE',EM,'fire  -  frost  -  storm'),
 ('sc-lineup-b.png','ONLY ONE',GOLD,'walks out'),
 ('canon-s7-v3-top-night.png','SHADDAI',EM,'coming soon')],
 [('vo6.wav',0.6),('vo7.wav',7.5),('vo8.wav',16.0)],'SHADDAI  -  ENTER THE ARENA')
