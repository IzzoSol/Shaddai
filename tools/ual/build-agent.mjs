// node build-agent.mjs <out.glb> <rigged.glb> [walk.glb] [run.glb] [action.glb]
// One agent file = rigged body + its own walk/run/action clips (renamed walk/run/attack1 for the host's aliases).
// Clips are copied channel-by-channel onto the body's bones BY NAME (same Meshy skeleton), so nothing is retargeted.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , OUT, RIG, WALK, RUN, ACT] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read(RIG), root = base.getRoot(), buf = root.listBuffers()[0];
root.listAnimations().forEach((a) => a.dispose());                 // drop the rig's placeholder clip
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
for (const [file, name] of [[WALK, 'walk'], [RUN, 'run'], [ACT, 'attack1']]) {
  if (!file) continue;
  const src = await io.read(file), anim = src.getRoot().listAnimations()[0];
  if (!anim) { console.log(`  ${name}: no clip in ${file}`); continue; }
  const out = base.createAnimation(name); let n = 0;
  for (const ch of anim.listChannels()) {
    const tn = ch.getTargetNode(), bn = tn && byName.get(tn.getName()); if (!bn) continue;
    const s = ch.getSampler();
    const inp = base.createAccessor().setArray(s.getInput().getArray().slice()).setType('SCALAR').setBuffer(buf);
    const outp = base.createAccessor().setArray(s.getOutput().getArray().slice()).setType(s.getOutput().getType()).setBuffer(buf);
    const smp = base.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    out.addSampler(smp).addChannel(base.createAnimationChannel().setTargetNode(bn).setTargetPath(ch.getTargetPath()).setSampler(smp)); n++;
  }
  console.log(`  ${name}: ${n} channels, ${(s => s)(anim.listSamplers()[0] ? anim.listSamplers()[0].getInput().getMax([])[0].toFixed(2) : '?')}s`);
}
await io.write(OUT, base);
console.log('wrote', OUT);
