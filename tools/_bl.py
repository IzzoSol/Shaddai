"""tools/_bl.py - drive the owner's open Blender through the MCP addon socket (127.0.0.1:9876) when the MCP tools are down.
   python tools/_bl.py <file.py>      runs the file's code in Blender, prints the result (stdout of the code)."""
import socket, json, sys

code = open(sys.argv[1], encoding='utf-8').read()
s = socket.create_connection(("127.0.0.1", 9876), timeout=30)
s.sendall(json.dumps({"type": "execute_code", "params": {"code": code}}).encode())
s.settimeout(900); buf = b""
while True:
    chunk = s.recv(1 << 20)
    if not chunk: break
    buf += chunk
    try: res = json.loads(buf.decode()); break
    except ValueError: continue
r = res.get("result", res)
print(r.get("result", r) if isinstance(r, dict) else r)
