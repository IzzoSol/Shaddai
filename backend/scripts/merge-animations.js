#!/usr/bin/env node
/* Animation merge/retarget tool — the "animation library" engine.
 *
 * Our Meshy rig uses the STANDARD humanoid bone names (Hips, LeftUpLeg, LeftLeg, LeftForeArm…),
 * the same convention Mixamo/most packs use. So any animation clip authored on that skeleton can
 * be injected into a model just by matching bone names (we strip a `mixamorig:` prefix if present).
 * One clip sourced once → applies to ALL agents (they share the skeleton). No Mixamo browser needed
 * at apply-time; just drop compatible clip GLBs in and run this.
 *
 * Usage:
 *   node merge-animations.js <target.glb> <clip1.glb> [clip2.glb ...]
 * Each clip GLB's animation(s) are copied into <target.glb> (in place). Existing clips are kept.
 */
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const fs = require('fs'), path = require('path');

// normalize bone names across conventions: strip mixamorig prefix, and map Spine1/Spine2 (Mixamo
// canonical) -> Spine01/Spine02 (our Meshy rig) so standard clips match our spine too.
const norm = n => String(n || '').replace(/^mixamorig[:_]?/i, '').toLowerCase().replace(/^spine([12])$/, (_, d) => 'spine0' + d);
const cleanName = (nm, src) => (nm || path.basename(src).replace(/\.glb$/i, ''))
  .replace(/^Armature\|/i, '').replace(/\|baselayer$/i, '').replace(/_?baselayer$/i, '') || 'clip';

(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const target = args[0];
  const clips = args.slice(1);
  if (!target || !clips.length) { console.error('usage: merge-animations.js <target.glb> <clip.glb> [clip2.glb ...]'); process.exit(1); }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);  // preserve PBR material extensions
  const tdoc = await io.read(target);
  const troot = tdoc.getRoot();
  const tbuf = troot.listBuffers()[0] || tdoc.createBuffer();

  // map normalized bone name → target node
  const tnodes = {};
  troot.listNodes().forEach(n => { const k = norm(n.getName()); if (k) tnodes[k] = n; });
  const existing = new Set(troot.listAnimations().map(a => a.getName()));

  for (const src of clips) {
    if (!fs.existsSync(src)) { console.log('  skip (missing):', src); continue; }
    const sdoc = await io.read(src);
    sdoc.getRoot().listAnimations().forEach((sa, ai) => {
      let nm = cleanName(sa.getName(), src);
      if (existing.has(nm)) nm = nm + '_' + ai;
      const tAnim = tdoc.createAnimation(nm);
      let mapped = 0, skipped = 0;
      sa.listChannels().forEach(ch => {
        const sn = ch.getTargetNode(); if (!sn) return;
        const tn = tnodes[norm(sn.getName())]; if (!tn) { skipped++; return; }
        const ss = ch.getSampler();
        const inArr = ss.getInput().getArray(), outArr = ss.getOutput().getArray();
        if (!inArr || !outArr) { skipped++; return; }
        const nin = tdoc.createAccessor().setType('SCALAR').setArray(Float32Array.from(inArr)).setBuffer(tbuf);
        const nout = tdoc.createAccessor().setType(ss.getOutput().getType()).setArray(Float32Array.from(outArr)).setBuffer(tbuf);
        const nsamp = tdoc.createAnimationSampler().setInput(nin).setOutput(nout).setInterpolation(ss.getInterpolation());
        const nch = tdoc.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(nsamp);
        tAnim.addSampler(nsamp).addChannel(nch);
        mapped++;
      });
      existing.add(nm);
      console.log(`  + "${nm}": ${mapped} channels mapped, ${skipped} unmatched`);
    });
  }

  await io.write(target, tdoc);
  console.log('done →', path.basename(target), '| clips:', tdoc.getRoot().listAnimations().map(a => a.getName()).join(', '));
})().catch(e => { console.error('merge failed:', e.message); process.exit(1); });
