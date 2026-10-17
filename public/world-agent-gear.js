/* world-agent-gear.js — agent accessories (Blender kit K16): caps, visors, halos, headphones, chains, cowls, capes,
 * backpacks, bangles, holo wrist bands, utility belts. Rigid items that ride one bone of the shared Meshy agent rig.
 *
 *   WorldAgentGear.load(THREE, GLTFLoader) → Promise<[names]>
 *   WorldAgentGear.items                   → [{ name, slot, bone }]
 *   WorldAgentGear.equip(model, name)      → Object3D | null   (one item per slot+bone, e.g. 'wrist:LeftForeArm': equipping replaces it)
 *   WorldAgentGear.unequip(model, key)     WorldAgentGear.equipped(model) → { 'slot:bone': name }
 *
 * Each GLB node acc_<slot>_<name> has its origin at its bone's joint on the reference rig (NEXUS, bind pose) and
 * extras { bone, slot, ref_head_m }. equip() puts the skeleton in bind pose, places the item at the bone's world
 * position with the model's world rotation and a scale of |Head → head_end| / ref_head_m (so it fits any agent size),
 * then parents it to the bone with that transform baked in — it follows walk/run/attack clips from then on.
 */
(function (root) {
  'use strict';
  var URLS = ['/assets/kits/shaddai_accessories_v01.glb', '/assets/kits/shaddai_weapons_v01.glb'];   // accessories (K16) + weapons/orbs (K17)
  var src = {}, items = [], THREE_ = null;

  function findBone(model, name) {
    var hit = null; model.traverse(function (o) { if (!hit && o.isBone && o.name === name) hit = o; }); return hit;
  }
  function skeletons(model) {
    var out = []; model.traverse(function (o) { if (o.isSkinnedMesh && o.skeleton && out.indexOf(o.skeleton) < 0) out.push(o.skeleton); }); return out;
  }

  var api = {
    items: items,
    _add: function (o, THREE) { if (THREE) THREE_ = THREE; src[o.name] = o; items.push({ name: o.name, slot: o.userData.slot, bone: o.userData.bone }); },   // loader + tests
    load: function (THREE, GLTFLoader) {
      THREE_ = THREE;
      if (api._p) return api._p;
      var loader = new GLTFLoader();
      api._p = Promise.all(URLS.map(function (url) {
        return new Promise(function (resolve) {
          loader.load(url, function (gltf) {
            gltf.scene.traverse(function (o) { if (o.name && o.name.indexOf('acc_') === 0 && o.userData && o.userData.bone) api._add(o); });
            resolve();
          }, undefined, function (e) { console.warn('[agent-gear] kit failed to load:', url, e && e.message); resolve(); });
        });
      })).then(function () { return items.map(function (i) { return i.name; }); });
      return api._p;
    },
    equip: function (model, name) {
      var s = src[name], T = THREE_; if (!s || !T || !model) return null;
      var bone = findBone(model, s.userData.bone), head = findBone(model, 'Head'), top = findBone(model, 'head_end');
      if (!bone) { console.warn('[agent-gear] no bone', s.userData.bone, 'on', model.name); return null; }
      var key = s.userData.slot + ':' + s.userData.bone; api.unequip(model, key);
      // bind pose for a clean measurement, remember the current pose to restore it
      var sk = skeletons(model), saved = [];
      sk.forEach(function (k) { k.bones.forEach(function (b) { saved.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]); }); k.pose(); });
      model.updateMatrixWorld(true);
      var bp = new T.Vector3().setFromMatrixPosition(bone.matrixWorld), q = new T.Quaternion(), sc = new T.Vector3(), p0 = new T.Vector3();
      model.matrixWorld.decompose(p0, q, sc);
      var k = sc.y * (s.userData.ref_head_m || 0.196);                                // fallback: model scale only
      if (head && top) k = new T.Vector3().setFromMatrixPosition(head.matrixWorld).distanceTo(new T.Vector3().setFromMatrixPosition(top.matrixWorld));
      var scale = k / (s.userData.ref_head_m || 0.196);
      var item = s.clone(true); item.name = name; item.userData.gearSlot = key;
      var Wi = new T.Matrix4().compose(bp, q, new T.Vector3(scale, scale, scale));
      item.matrixAutoUpdate = true;
      new T.Matrix4().copy(bone.matrixWorld).invert().multiply(Wi).decompose(item.position, item.quaternion, item.scale);
      bone.add(item);
      saved.forEach(function (r) { r[0].position.copy(r[1]); r[0].quaternion.copy(r[2]); r[0].scale.copy(r[3]); });
      model.updateMatrixWorld(true);
      return item;
    },
    unequip: function (model, key) {
      var gone = []; model.traverse(function (o) { if (o.userData && o.userData.gearSlot === key) gone.push(o); });
      gone.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    },
    equipped: function (model) {
      var out = {}; model.traverse(function (o) { if (o.userData && o.userData.gearSlot) out[o.userData.gearSlot] = o.name; }); return out;
    }
  };
  root.WorldAgentGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
