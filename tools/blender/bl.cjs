// Run Python in the OPEN Blender through the MCP-for-Blender add-on socket (localhost:9876).
//   node tools/blender/bl.cjs <file.py> [KEY=VALUE ...]   → KEY/VALUE land in bpy.app.driver_namespace first
//                                                            (sent every run, so a File→New in Blender can't lose them)
//   node tools/blender/bl.cjs -e "python code"
//   node tools/blender/bl.cjs --info                       → scene info
const net = require('net'), fs = require('fs');
const a = process.argv.slice(2);
function prelude(kv) {
  return ['import bpy'].concat(kv.map((x) => {
    const i = x.indexOf('='), v = x.slice(i + 1);
    return 'bpy.app.driver_namespace[' + JSON.stringify(x.slice(0, i)) + '] = ' + (/^-?[0-9.]+$/.test(v) ? v : JSON.stringify(v));
  })).join('\n') + '\n';
}
const msg = a[0] === '--info' ? { type: 'get_scene_info', params: {} }
  : { type: 'execute_code', params: { code: a[0] === '-e' ? a[1] : prelude(a.slice(1)) + fs.readFileSync(a[0], 'utf8') } };
const s = net.connect(9876, '127.0.0.1', () => s.write(JSON.stringify(msg)));
let buf = '';
s.on('data', (d) => { buf += d; try { const r = JSON.parse(buf); console.log(typeof r.result === 'object' ? JSON.stringify(r.result, null, 1).slice(0, 6000) : r); if (r.status === 'error') process.exitCode = 1; s.end(); } catch (e) { /* partial */ } });
s.on('error', (e) => { console.log('SOCKET ERR', e.message); process.exit(1); });
s.setTimeout(600000, () => { console.log('TIMEOUT'); s.destroy(); });
