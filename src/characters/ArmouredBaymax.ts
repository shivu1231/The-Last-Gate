import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Armoured Baymax (tracker PW-03): "Armored Baymax (from Disney's Big Hero 6)" by DoodleNotes1,
 * CC BY 3.0, non-commercial fan art (public/models/baymax-armoured.CREDITS.txt).
 *
 * The model is a rigged suit. It is mounted inside the white Baymax rig of each chapter (a child of
 * the white model, scaled so hips and shoulders line up) and posed every frame from the same joints
 * that rig already drives: drive() takes the white rig's arm, leg and head rotations, so every walk,
 * flight, fall and get-up carries over. set(k) runs the swap: 0 = white Baymax, 1 = armoured; in
 * between the plates arrive one by one, core first, and the suit and face come in at the end.
 *
 * The source rig moves its hands by IK, with the hand bones hanging off the root, so drive() carries
 * each hand on the end of its forearm itself.
 */
export const ARMOUR_URL = '/models/baymax-armoured.glb';
let template: Promise<T.Object3D> | null = null;
export const loadArmouredTemplate = () => (template ??= new GLTFLoader().loadAsync(ARMOUR_URL).then(g => mergeRigid(g.scene)));

/**
 * glTF splits each multi-material mesh into one mesh per material, so the suit arrives as dozens of
 * small draws. The rigid pieces riding the same bone are merged into one mesh per material per bone
 * (tracker PW-08); the skinned pieces stay as they are.
 */
function mergeRigid(scene: T.Object3D) {
  scene.updateMatrixWorld(true);
  const groups = new Map<T.Object3D, Map<T.Material, T.BufferGeometry[]>>(), merged: T.Mesh[] = [];
  scene.traverse(o => {
    if (!(o instanceof T.Mesh) || o instanceof T.SkinnedMesh || Array.isArray(o.material)) return;
    let b: T.Object3D | null = o.parent; while (b && !(b instanceof T.Bone)) b = b.parent;
    if (!b) return;
    const byMat = groups.get(b) ?? new Map(); groups.set(b, byMat);
    const g = o.geometry.clone().applyMatrix4(new T.Matrix4().copy(b.matrixWorld).invert().multiply(o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const list = byMat.get(o.material) ?? []; list.push(g.index ? g.toNonIndexed() : g); byMat.set(o.material, list); merged.push(o);
  });
  merged.forEach(o => o.removeFromParent());
  for (const [bone, byMat] of groups) for (const [mat, list] of byMat) {
    const geo = mergeGeometries(list, false); if (!geo) continue;
    const mesh = new T.Mesh(geo, mat); mesh.name = `armour-${bone.name}-${mat.name}`; bone.add(mesh);
  }
  return scene;
}

const name = (n: string) => T.PropertyBinding.sanitizeNodeName(n);
const RED = '#b0121c', PURPLE = '#5b2b8c';
function material(original: string, eye?: T.Material): T.Material {
  const phys = (color: string, metalness: number, roughness: number, extra: T.MeshPhysicalMaterialParameters = {}) =>
    new T.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: .35, clearcoatRoughness: .3, ...extra });
  if (original === 'Black' && eye) return eye;
  if (original.startsWith('RED')) return phys(RED, .45, .3);
  if (original.startsWith('purple')) return phys(PURPLE, .4, .35);
  if (original === 'Silver' || original === 'Metal') return phys('#a3abb2', .85, .28, { clearcoat: 0 });
  if (original === 'BLACK_Skin') return phys('#17191d', .2, .65, { clearcoat: .1 });
  if (original === 'TRANSPARENT') return new T.MeshPhysicalMaterial({ color: '#9fc4d8', metalness: 0, roughness: .05, transmission: 0, transparent: true, opacity: .18, depthWrite: false });
  if (original === 'Black') return new T.MeshBasicMaterial({ color: '#0b0f11' });
  return phys('#eee8dc', 0, .78, { clearcoat: .02, sheen: .3 });
}

export type ArmourJoints = {
  /** Arm rotations in the white model's frame, relative to hanging at his side (as the white rig's shoulder pivots). */
  armL?: T.Quaternion; armR?: T.Quaternion;
  /** Leg rotations relative to hanging straight down. */
  legL?: T.Quaternion; legR?: T.Quaternion;
  /** Head rotation relative to its rest. */
  head?: T.Quaternion;
  /** Elbow bend in radians (forearm forward from the upper arm); default a relaxed .3. */
  elbowL?: number; elbowR?: number;
  /** Knee bend in radians (shin back from the thigh); default straight. */
  kneeL?: number; kneeR?: number;
};

type Piece = { mesh: T.Mesh; mats: T.Material[]; orig: { transparent: boolean; opacity: number; depthWrite: boolean }[]; base: T.Vector3; delay: number; late: boolean };

export async function createArmouredBaymax(opts: { eye?: T.Material; hole?: () => T.Vector3 | null } = {}) {
  const src = await loadArmouredTemplate();
  const root = new T.Group(); root.name = 'armoured-baymax';
  const suit = cloneSkinned(src); root.add(suit);
  root.updateMatrixWorld(true);
  const bone = (n: string) => suit.getObjectByName(name(n)) as T.Bone;
  const hips = bone('Armor_Hips'), chest = bone('Armor_Chest'), head = bone('Armor_Head');
  const uArm = { L: bone('Armor_U_Arm.L'), R: bone('Armor_U_Arm.R') }, lArm = { L: bone('Armor_L_Arm.L'), R: bone('Armor_L_Arm.R') };
  const hand = { L: bone('Armor_Hand.L'), R: bone('Armor_Hand.R') }, pad = { L: bone('Armor_Shoulder.L'), R: bone('Armor_Shoulder.R') };
  const uLeg = { L: bone('Armor_U_Leg.L'), R: bone('Armor_U_Leg.R') }, lLeg = { L: bone('Armor_L_Leg.L'), R: bone('Armor_L_Leg.R') };

  // Rest pose in the root's frame (root is at the identity here).
  const relQ = (o: T.Object3D) => o.getWorldQuaternion(new T.Quaternion());
  const relM = (o: T.Object3D) => o.matrixWorld.clone();
  const restQ = new Map<T.Object3D, T.Quaternion>([hips, chest, head, uArm.L, uArm.R, uLeg.L, uLeg.R, pad.L, pad.R].map(b => [b, relQ(b)]));
  const parentQ = (b: T.Object3D) => restQ.get(b.parent!) ?? relQ(b.parent!);
  const parentRest = new Map([uArm.L, uArm.R, uLeg.L, uLeg.R, head, pad.L, pad.R].map(b => [b, parentQ(b)]));
  // Arms rest in a T: the swing that hangs each one at his side, a little out from the body.
  const hang = (side: 'L' | 'R') => {
    const from = lArm[side].getWorldPosition(new T.Vector3()).sub(uArm[side].getWorldPosition(new T.Vector3())).normalize();
    return new T.Quaternion().setFromUnitVectors(from, new T.Vector3(side === 'L' ? .08 : -.08, -1, 0).normalize());
  };
  const hangQ = { L: hang('L'), R: hang('R') };
  const restF = { L: relQ(lArm.L), R: relQ(lArm.R) }, bendQ = new T.Quaternion(), X = new T.Vector3(1, 0, 0), invU = new T.Quaternion(), invH = new T.Quaternion();
  const legDown = (side: 'L' | 'R') => {
    const from = lLeg[side].getWorldPosition(new T.Vector3()).sub(uLeg[side].getWorldPosition(new T.Vector3())).normalize();
    // A little out from straight down: his thigh plates are wider than his hips, so straight legs grind through each other (tracker Q-05).
    return new T.Quaternion().setFromUnitVectors(from, new T.Vector3(side === 'L' ? .16 : -.16, -1, 0).normalize());
  };
  const legQ = { L: legDown('L'), R: legDown('R') };
  const restS = { L: relQ(lLeg.L), R: relQ(lLeg.R) }, invL = new T.Quaternion(), invD = new T.Quaternion();
  // Each hand rides on the end of its forearm, as it sat at rest.
  const handOffset = { L: relM(lArm.L).invert().multiply(relM(hand.L)), R: relM(lArm.R).invert().multiply(relM(hand.R)) };
  // Feet: points at the bottom of each lower leg (and a little under it, the sole), for grounding.
  const feet = (['L', 'R'] as const).map(s => {
    const f = new T.Object3D(); lLeg[s].add(f);
    const tip = lLeg[s].getWorldPosition(new T.Vector3()), knee = uLeg[s].getWorldPosition(new T.Vector3());
    f.position.copy(lLeg[s].worldToLocal(tip.clone().addScaledVector(tip.clone().sub(knee).normalize(), .52)));
    return f;
  });

  // Materials: restyled to match the project (red, purple, black suit, white face); the chest plate
  // and suit get a hole over the chest bay so the chips stay reachable.
  const hole = { c: new T.Vector3(), r: .42 };
  const pieces: Piece[] = [], centre = new T.Box3().setFromObject(suit).getCenter(new T.Vector3());
  suit.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const originals = Array.isArray(o.material) ? o.material : [o.material];
    const mats = originals.map(m => {
      const mat = material(m.name, opts.eye);
      if (mat !== opts.eye && mat instanceof T.MeshPhysicalMaterial && opts.hole) {
        mat.onBeforeCompile = shader => {
          shader.uniforms.uHole = { value: hole.c }; shader.uniforms.uHoleR = { value: hole.r };
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArmourWorld;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvArmourWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHole;uniform float uHoleR;varying vec3 vArmourWorld;')
            .replace('void main() {', 'void main() {\nif (uHoleR > 0. && distance(vArmourWorld, uHole) < uHoleR) discard;');
        };
      }
      return mat;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
    // The inner suit and chest plates carry his whole silhouette; the small pieces skip the shadow pass (tracker PW-08).
    o.castShadow = /INSIDE|Chest/.test(o.name); o.receiveShadow = true; o.frustumCulled = false;
    const late = /INSIDE|Baymax\.00/.test(o.name) || o instanceof T.SkinnedMesh && /INSIDE/.test(o.name);
    pieces.push({ mesh: o, mats, orig: mats.map(m => ({ transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite })), base: o.scale.clone(), delay: o.getWorldPosition(new T.Vector3()).distanceTo(centre), late });
  });
  const order = pieces.filter(p => !p.late).sort((a, b) => a.delay - b.delay);
  order.forEach((p, i) => { p.delay = i / Math.max(1, order.length - 1); });
  const tmpQ = new T.Quaternion(), tmpM = new T.Matrix4(), inv = new T.Matrix4(), id = new T.Quaternion();

  let shown = -1;
  const updateChestHole = (radius?: number) => {
    const h = opts.hole?.();
    if (h) { hole.c.copy(h); hole.r = radius ?? .58 * root.getWorldScale(new T.Vector3()).x / 1.5; }
    else hole.r = 0;
  };
  const api = {
    root, feet,
    /** Refresh after an outer rig applies a final world-space contact correction. */
    updateChestHole,
    /** Bone rest heights in the model's own units (for mounting it inside a white rig). */
    joints: { hipY: uLeg.L.getWorldPosition(new T.Vector3()).y, hipZ: uLeg.L.getWorldPosition(new T.Vector3()).z, shoulderY: uArm.L.getWorldPosition(new T.Vector3()).y },
    /** Pose the suit from the white rig's joint rotations. */
    drive(j: ArmourJoints) {
      const set = (b: T.Bone, q: T.Quaternion) => { b.quaternion.copy(parentRest.get(b)!).invert().multiply(q); };
      for (const s of ['L', 'R'] as const) {
        const arm = s === 'L' ? j.armL : j.armR, leg = s === 'L' ? j.legL : j.legR;
        tmpQ.copy(arm ?? id).multiply(hangQ[s]).multiply(restQ.get(uArm[s])!); set(uArm[s], tmpQ);
        // The pad rides up with the arm a little.
        tmpQ.copy(id).slerp(arm ?? id, .3).multiply(restQ.get(pad[s])!); set(pad[s], tmpQ);
        tmpQ.copy(leg ?? id).multiply(legQ[s]).multiply(restQ.get(uLeg[s])!); set(uLeg[s], tmpQ);
        // Elbow: the forearm bends forward in the hanging arm's frame, whatever the shoulder does.
        bendQ.setFromAxisAngle(X, -((s === 'L' ? j.elbowL : j.elbowR) ?? .3));
        invU.copy(restQ.get(uArm[s])!).invert(); invH.copy(hangQ[s]).invert();
        lArm[s].quaternion.copy(invU).multiply(invH).multiply(bendQ).multiply(hangQ[s]).multiply(restF[s]);
        // Knee: the shin swings back in the straightened leg's frame, the same way (tracker R-04).
        bendQ.setFromAxisAngle(X, (s === 'L' ? j.kneeL : j.kneeR) ?? 0);
        invL.copy(restQ.get(uLeg[s])!).invert(); invD.copy(legQ[s]).invert();
        lLeg[s].quaternion.copy(invL).multiply(invD).multiply(bendQ).multiply(legQ[s]).multiply(restS[s]);
      }
      tmpQ.copy(j.head ?? id).multiply(restQ.get(head)!); set(head, tmpQ);
      // Hands onto the forearms.
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      for (const s of ['L', 'R'] as const) {
        tmpM.copy(inv).multiply(lArm[s].matrixWorld).multiply(handOffset[s]);
        const parentRel = new T.Matrix4().copy(inv).multiply(hand[s].parent!.matrixWorld);
        tmpM.premultiply(parentRel.invert());
        tmpM.decompose(hand[s].position, hand[s].quaternion, hand[s].scale);
      }
      root.updateMatrixWorld(true);
      updateChestHole();
    },
    /**
     * A spot on the chest plating: cast in from in front of his chest at (lateral, up) in the suit's
     * own units from the chest bone, and return the surface point and outward normal in world space.
     */
    chestSpot(lateral = 0, up = 0) {
      root.updateMatrixWorld(true);
      const c = chest.getWorldPosition(new T.Vector3()), q = root.getWorldQuaternion(new T.Quaternion()), sc = root.getWorldScale(new T.Vector3()).x;
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q), side = new T.Vector3(1, 0, 0).applyQuaternion(q), upv = new T.Vector3(0, 1, 0).applyQuaternion(q);
      const aim = c.clone().addScaledVector(side, lateral * sc).addScaledVector(upv, up * sc);
      // Skinned plates are only posed at render time: bring their skeletons up to date first, so the
      // ray meets what will actually be drawn.
      const meshes: T.Object3D[] = []; suit.traverse(o => { if (o instanceof T.SkinnedMesh) o.skeleton.update(); if (o instanceof T.Mesh) meshes.push(o); });
      const hit = new T.Raycaster(aim.clone().addScaledVector(fwd, 3 * sc), fwd.clone().negate(), 0, 6 * sc).intersectObjects(meshes, false)[0];
      const normal = hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : fwd.clone();
      if (normal.dot(fwd) < 0) normal.negate();
      return { point: hit ? hit.point.clone() : aim.addScaledVector(fwd, .6 * sc), normal, bone: chest as T.Object3D };
    },
    /**
     * A frame lying along the chest plating at (lateral, up): x runs up his body along the plate's
     * slope (the chord between two spots `span` apart), y points out of the plate, z completes it.
     * A long box set on this frame touches the plate at both ends instead of rocking on its middle.
     */
    chestFrame(lateral: number, up: number, span = .1) {
      const a = api.chestSpot(lateral, up - span), b = api.chestSpot(lateral, up + span), c = api.chestSpot(lateral, up);
      const x = b.point.clone().sub(a.point).normalize();
      const n = a.normal.clone().add(b.normal).add(c.normal).normalize(); n.addScaledVector(x, -n.dot(x)).normalize();
      return { point: a.point.clone().add(b.point).multiplyScalar(.5), x, n, z: new T.Vector3().crossVectors(x, n), bone: chest as T.Object3D };
    },
    /** Fix an object flat on the chest plating at (lateral, up): its +Y out of the plate, its X along his body. */
    mountOnChest(obj: T.Object3D, lateral: number, up: number) {
      const f = api.chestFrame(lateral, up);
      const mw = new T.Matrix4().makeBasis(f.x, f.n, f.z).setPosition(f.point.addScaledVector(f.n, -.02)).scale(obj.getWorldScale(new T.Vector3()));
      chest.add(obj); obj.matrix.copy(new T.Matrix4().copy(chest.matrixWorld).invert().multiply(mw)); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    },
    /**
     * Seat a round part (the chip bay) on the chest plating at (lateral, up) without it sinking into the
     * curved plate (tracker R-02): it sits on the highest point under its rim, enlarged by `grow`, and a
     * dark housing runs from its edge down into the plate all round. `rim` is its radius in its own units.
     */
    seatOnPlate(obj: T.Object3D, lateral: number, up: number, rim: number, grow = 1, face = .7) {
      const sc = root.getWorldScale(new T.Vector3()).x, s = obj.getWorldScale(new T.Vector3()).x * grow;
      const f = api.chestFrame(lateral, up, .06), r = rim * s / sc;
      // Face it mostly straight ahead, as on his chest in Phase 1, not along the plate's curve (tracker S-07).
      const ahead = new T.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new T.Quaternion()));
      const n = f.n.clone().lerp(ahead, face).normalize();
      let hi = -Infinity, lo = Infinity;
      // Sample the plate across the whole face (three rings and the centre), so no ridge pokes through it.
      for (const k of [0, .4, .75, 1.05]) for (let i = 0; i < (k ? 16 : 1); i++) {
        const a = i / 16 * Math.PI * 2, h = api.chestSpot(lateral + Math.cos(a) * r * k, up + Math.sin(a) * r * k).point.sub(f.point).dot(n);
        hi = Math.max(hi, h); if (k >= 1) lo = Math.min(lo, h);
      }
      const lift = Math.max(0, hi) + .004 * sc, sink = Math.max(0, -lo) + .02 * sc;
      const undo = seatOn(obj, { point: f.point.clone().addScaledVector(n, lift), normal: n, bone: f.bone });
      obj.scale.multiplyScalar(grow);
      const depth = (lift + sink) / s;
      const housing = new T.Mesh(new T.CylinderGeometry(rim * 1.04, rim * 1.1, depth, 40, 1, true), new T.MeshStandardMaterial({ color: '#23262b', roughness: .55, metalness: .5, side: T.DoubleSide }));
      housing.name = 'bay-housing'; housing.rotation.x = Math.PI / 2; housing.position.z = -depth / 2 + .004; obj.add(housing);
      // The white chest's skin collar (ChestBay) stays behind on the white body.
      const collar = obj.getObjectByName('bay-collar'); if (collar) collar.visible = false;
      return () => { housing.removeFromParent(); housing.geometry.dispose(); (housing.material as T.Material).dispose(); if (collar) collar.visible = true; undo(); };
    },
    /** His helmet in world space (the camera's eye target once he's armoured). */
    headWorld: (out = new T.Vector3()) => head.localToWorld(out.set(0, .12, .05)),
    /** Lowest point of his feet in world space (for sitting him on the ground). */
    footLow() { let low = Infinity; const v = new T.Vector3(); for (const f of feet) low = Math.min(low, f.getWorldPosition(v).y); return low; },
    /** 0 = no armour … 1 = fully armoured. Plates arrive core first; the suit and face come in last. */
    set(k: number) {
      if (k === shown) return; shown = k;
      root.visible = k > 0;
      for (const p of pieces) {
        const local = p.late ? T.MathUtils.smoothstep(k, .8, 1) : T.MathUtils.clamp((k - p.delay * .55) / .45, 0, 1);
        const e = local * local * (3 - 2 * local);
        p.mesh.visible = local > 0;
        if (!p.late) p.mesh.scale.copy(p.base).multiplyScalar(1 + (1 - e) * .2);
        p.mats.forEach((m, i) => {
          if (m === opts.eye) return;
          const o = p.orig[i];
          if (e < 1) { m.transparent = true; m.opacity = o.opacity * e; m.depthWrite = o.depthWrite && e > .5; }
          else { m.transparent = o.transparent; m.opacity = o.opacity; m.depthWrite = o.depthWrite; }
        });
      }
    },
    /** True once the white body underneath is fully covered (callers hide it then). */
    covers: (k: number) => k >= .98,
    dispose() { root.removeFromParent(); pieces.forEach(p => p.mats.forEach(m => { if (m !== opts.eye) m.dispose(); })); },
  };
  api.drive({}); api.set(0);
  return api;
}
export type ArmouredBaymax = Awaited<ReturnType<typeof createArmouredBaymax>>;

/** Mount the suit inside a white rig: scale and place it so its hips and shoulders meet the white rig's. */
export function mountArmour(a: ArmouredBaymax, white: T.Object3D, hip: { y: number; z: number }, shoulderY: number) {
  const s = (shoulderY - hip.y) / (a.joints.shoulderY - a.joints.hipY);
  a.root.scale.setScalar(s);
  a.root.position.set(0, hip.y - a.joints.hipY * s, hip.z - a.joints.hipZ * s);
  white.add(a.root);
  return s;
}

/**
 * Seat an object on a spot of the suit (its +Z out of the surface, its +Y toward his head), parented
 * to the chest bone so it moves with him. Returns a function that puts it back where it was.
 */
export function seatOn(obj: T.Object3D, spot: { point: T.Vector3; normal: T.Vector3; bone: T.Object3D }, depth = 0) {
  const parent = obj.parent!, pos = obj.position.clone(), quat = obj.quaternion.clone(), scl = obj.scale.clone();
  const up = new T.Vector3(0, 1, 0).applyQuaternion(spot.bone.getWorldQuaternion(new T.Quaternion()));
  const z = spot.normal.clone().normalize(), x = new T.Vector3().crossVectors(up, z).normalize(), y = new T.Vector3().crossVectors(z, x);
  const worldScale = obj.getWorldScale(new T.Vector3());
  spot.bone.add(obj);
  const m = new T.Matrix4().makeBasis(x, y, z).setPosition(spot.point.clone().addScaledVector(z, -depth)).scale(worldScale);
  obj.matrix.copy(new T.Matrix4().copy(spot.bone.matrixWorld).invert().multiply(m));
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  return () => { parent.add(obj); obj.position.copy(pos); obj.quaternion.copy(quat); obj.scale.copy(scl); };
}
