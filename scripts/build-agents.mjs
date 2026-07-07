// Bake curated, animation-complete, texture-optimized agent GLBs.
// All Meshy rigs share an identical 24-bone skeleton, so any named clip can be
// retargeted onto any body by bone name. We rebuild a clean clip list per body.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const W = 'C:\\Users\\Brittany\\OneDrive\\Desktop\\SHADDAI WORLD';
const OUT = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\public\\assets\\agents';

const f = {
  emeraldMerged: `${W}\\Meshy_AI_Emerald_Enforcer_biped\\Meshy_AI_Emerald_Enforcer_biped\\Meshy_AI_Emerald_Enforcer_biped_Meshy_AI_Meshy_Merged_Animations.glb`,
  neonMerged:    `${W}\\Meshy_AI_Neon_Valkyrie_biped\\Meshy_AI_Neon_Valkyrie_biped\\Meshy_AI_Neon_Valkyrie_biped_Meshy_AI_Meshy_Merged_Animations.glb`,
  arcanaMerged:  `${W}\\Meshy_AI_Violet_Arcana_biped (1)\\Meshy_AI_Violet_Arcana_biped\\Meshy_AI_Violet_Arcana_biped_Meshy_AI_Meshy_Merged_Animations.glb`,
  hammerMerged:  `${W}\\Meshy_AI_Crimson_Hammer_Knight_biped\\Meshy_AI_Crimson_Hammer_Knight_biped\\Meshy_AI_Crimson_Hammer_Knight_biped_Meshy_AI_Meshy_Merged_Animations.glb`,
  sentBase:    `${W}\\Meshy_AI_Crimson_Sentinel_biped (1)\\Meshy_AI_Crimson_Sentinel_biped\\Meshy_AI_Crimson_Sentinel_biped_Character_output.glb`,
  sentCombat:  `${W}\\Meshy_AI_Crimson_Sentinel_biped (1)\\Meshy_AI_Crimson_Sentinel_biped\\Meshy_AI_Crimson_Sentinel_biped_Animation_Combat_Stance_withSkin.glb`,
  sentBackflip:`${W}\\Meshy_AI_Crimson_Sentinel_biped (1)\\Meshy_AI_Crimson_Sentinel_biped\\Meshy_AI_Crimson_Sentinel_biped_Animation_Backflip_withSkin.glb`,
  sentRun:     `${W}\\Meshy_AI_Crimson_Sentinel_biped (1)\\Meshy_AI_Crimson_Sentinel_biped\\Meshy_AI_Crimson_Sentinel_biped_Animation_Running_withSkin.glb`,
  sentWalk:    `${W}\\Meshy_AI_Crimson_Sentinel_biped (1)\\Meshy_AI_Crimson_Sentinel_biped\\Meshy_AI_Crimson_Sentinel_biped_Animation_Walking_withSkin.glb`,
};

// output CODE -> { base, clips: { standardName: [srcFile, srcClipName] } }
// idle uses the Sentinel Combat_Stance for everyone → consistent combat idle.
const BUILD = {
  ZEROX: { base: f.emeraldMerged, clips: {
    idle:[f.sentCombat,'Armature|Combat_Stance|baselayer'], walk:[f.emeraldMerged,'Walking'], run:[f.emeraldMerged,'Running'],
    attack1:[f.emeraldMerged,'Double_Combo_Attack'], attack2:[f.emeraldMerged,'Triple_Combo_Attack'],
    heavy:[f.emeraldMerged,'Reaping_Swing'], flip:[f.emeraldMerged,'360_Power_Spin_Jump'] } },
  TURTLE: { base: f.neonMerged, clips: {
    idle:[f.sentCombat,'Armature|Combat_Stance|baselayer'], walk:[f.neonMerged,'Walking'], run:[f.neonMerged,'Running'],
    attack1:[f.neonMerged,'Kung_Fu_Punch'], attack2:[f.neonMerged,'Thrust_Slash'],
    heavy:[f.neonMerged,'Lunge_Roundhouse_Kick'], flip:[f.neonMerged,'Backflip_Sweep_Kick'] } },
  ORACLE: { base: f.arcanaMerged, clips: {
    idle:[f.sentCombat,'Armature|Combat_Stance|baselayer'], walk:[f.arcanaMerged,'Walking'], run:[f.arcanaMerged,'Running'],
    attack1:[f.arcanaMerged,'Right_Jab_from_Guard'], attack2:[f.arcanaMerged,'High_Kick'],
    heavy:[f.arcanaMerged,'Right_Hand_Sword_Slash'], flip:[f.arcanaMerged,'Backflip_and_Hooks'] } },
  PIKADON: { base: f.hammerMerged, clips: {
    idle:[f.sentCombat,'Armature|Combat_Stance|baselayer'], walk:[f.hammerMerged,'Walking'], run:[f.hammerMerged,'Running'],
    attack1:[f.hammerMerged,'Attack'], attack2:[f.hammerMerged,'Elbow_Strike'],
    heavy:[f.hammerMerged,'Axe_Spin_Attack'], flip:[f.hammerMerged,'Backflip_and_Hooks'] } },
  // Villain: Sentinel body has no attacks of its own → borrow from Emerald (shared skeleton).
  VILLAIN: { base: f.sentBase, clips: {
    idle:[f.sentCombat,'Armature|Combat_Stance|baselayer'], walk:[f.sentWalk,'Armature|walking_man|baselayer'], run:[f.sentRun,'Armature|running|baselayer'],
    attack1:[f.emeraldMerged,'Double_Combo_Attack'], attack2:[f.emeraldMerged,'Triple_Combo_Attack'],
    heavy:[f.emeraldMerged,'Reaping_Swing'], flip:[f.sentBackflip,'Armature|Backflip|baselayer'] } },
};

const _cache = new Map();
async function load(file){ if(!_cache.has(file)) _cache.set(file, await io.read(file)); return _cache.get(file); }

// deep-copy one AnimationClip from src doc into dst doc, retargeting channels by node name.
function copyClip(dst, dstNodesByName, src, clipName, outName){
  const anim = src.getRoot().listAnimations().find(a => a.getName() === clipName);
  if(!anim) throw new Error(`clip not found: ${clipName}`);
  const dstBuf = dst.getRoot().listBuffers()[0];
  const out = dst.createAnimation(outName);
  const samplerMap = new Map();
  for(const s of anim.listSamplers()){
    const mk = (acc) => { const na = dst.createAccessor().setType(acc.getType()).setBuffer(dstBuf);
      na.setArray(acc.getArray().slice()); if(acc.getNormalized()) na.setNormalized(true); return na; };
    const ns = dst.createAnimationSampler().setInterpolation(s.getInterpolation())
      .setInput(mk(s.getInput())).setOutput(mk(s.getOutput()));
    out.addSampler(ns); samplerMap.set(s, ns);
  }
  let bound = 0, missed = 0;
  for(const ch of anim.listChannels()){
    const tn = ch.getTargetNode(); const nm = tn && tn.getName();
    const dstNode = nm && dstNodesByName.get(nm);
    if(!dstNode){ missed++; continue; }
    out.addChannel(dst.createAnimationChannel().setTargetNode(dstNode)
      .setTargetPath(ch.getTargetPath()).setSampler(samplerMap.get(ch.getSampler())));
    bound++;
  }
  return { bound, missed };
}

async function resizeTextures(doc, max=1024){
  for(const tex of doc.getRoot().listTextures()){
    const img = tex.getImage(); if(!img) continue;
    const mime = tex.getMimeType();
    const pipe = sharp(Buffer.from(img)).resize(max, max, { fit:'inside', withoutEnlargement:true });
    const buf = mime === 'image/png' ? await pipe.png().toBuffer() : await pipe.jpeg({ quality:88 }).toBuffer();
    tex.setImage(new Uint8Array(buf));
  }
}

for(const [code, cfg] of Object.entries(BUILD)){
  const dst = await load(cfg.base);
  // clone the base doc so caches stay pristine for reuse (Sentinel files used twice)
  const doc = await io.readBinary(await io.writeBinary(dst));
  // strip the base body's own animations — we rebuild a clean curated list
  for(const a of doc.getRoot().listAnimations()) a.dispose();
  const nodesByName = new Map();
  for(const n of doc.getRoot().listNodes()) if(n.getName()) nodesByName.set(n.getName(), n);
  const report = [];
  for(const [outName, [srcFile, clipName]] of Object.entries(cfg.clips)){
    const src = srcFile === cfg.base ? dst : await load(srcFile);
    const r = copyClip(doc, nodesByName, src, clipName, outName);
    report.push(`${outName}:${clipName}(${r.bound}b${r.missed?'/'+r.missed+'miss':''})`);
  }
  // NO weld/dedup/prune — those retriangulate/merge skinned verts and DEFORMED the bodies
  // (TURTLE/ZEROX warped). Keep the owner's mesh byte-for-byte; only resize textures for size.
  await resizeTextures(doc, 1024);
  const outPath = path.join(OUT, `${code}.glb`);
  await io.write(outPath, doc);
  const kb = (await import('fs')).statSync(outPath).size / 1024;
  console.log(`\n✓ ${code}.glb  ${kb.toFixed(0)} KB\n  ${report.join('  ')}`);
}
console.log('\nDone.');
