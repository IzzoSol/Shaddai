# repairs UTF-8-read-as-cp1252 mojibake (e.g. "âŒ‚" -> "⌂") in place. usage: python tools/fix-mojibake.py file...
import sys
def tob(ch):
    try: return ch.encode('cp1252')[0]
    except Exception:
        o=ord(ch); return o if o<0x100 else None
def fix(s):
    out=[];i=0;n=0
    while i<len(s):
        b=tob(s[i])
        if b is not None and 0xC2<=b<=0xF4:
            need=1 if b<0xE0 else (2 if b<0xF0 else 3)
            seg=s[i+1:i+1+need]; bs=[tob(c) for c in seg]
            if len(seg)==need and all(x is not None and 0x80<=x<=0xBF for x in bs):
                try:
                    out.append(bytes([b]+bs).decode('utf-8')); i+=1+need; n+=1; continue
                except Exception: pass
        out.append(s[i]); i+=1
    return ''.join(out),n
tot=0
for f in sys.argv[1:]:
    raw=open(f,encoding='utf-8',newline='').read()
    # run twice: handles double-double encoding
    t,n1=fix(raw); t,n2=fix(t)
    if n1+n2: open(f,'w',encoding='utf-8',newline='').write(t)
    print(f,n1+n2); tot+=n1+n2
