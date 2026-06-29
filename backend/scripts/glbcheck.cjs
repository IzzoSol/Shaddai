const fs = require('fs');
function check(p) {
  const b = fs.readFileSync(p);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let verts = 0, mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9], prims = 0;
  for (const m of (json.meshes || [])) for (const pr of (m.primitives || [])) {
    prims++;
    const ai = pr.attributes && pr.attributes.POSITION; if (ai == null) continue;
    const acc = json.accessors[ai]; verts += acc.count || 0;
    if (acc.min && acc.max) { for (let i = 0; i < 3; i++) { mins[i] = Math.min(mins[i], acc.min[i]); maxs[i] = Math.max(maxs[i], acc.max[i]); } }
  }
  const size = maxs.map((v, i) => +(v - mins[i]).toFixed(2));
  console.log(
    (p.split(/[\\/]/).pop()).padEnd(13),
    'meshes=' + (json.meshes || []).length,
    'prims=' + prims,
    'verts=' + verts.toLocaleString(),
    'bbox=[' + size.join(', ') + ']',
    'images=' + ((json.images || []).length),
    'mats=' + ((json.materials || []).length),
    'nodes=' + ((json.nodes || []).length)
  );
}
for (const a of process.argv.slice(2)) { try { check(a); } catch (e) { console.log(a, 'ERROR', e.message); } }
