import * as THREE from 'three';
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
let template: Promise<THREE.Object3D> | null = null;
export const loadArmouredTemplate = () =>
  (template ??= new GLTFLoader()
    .loadAsync(ARMOUR_URL)
    .then((group) => mergeRigid(group.scene)));

/**
 * glTF splits each multi-material mesh into one mesh per material, so the suit arrives as dozens of
 * small draws. The rigid pieces riding the same bone are merged into one mesh per material per bone
 * (tracker PW-08); the skinned pieces stay as they are.
 */
function mergeRigid(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const groups = new Map<
      THREE.Object3D,
      Map<THREE.Material, THREE.BufferGeometry[]>
    >(),
    merged: THREE.Mesh[] = [];
  scene.traverse((sceneObject) => {
    if (
      !(sceneObject instanceof THREE.Mesh) ||
      sceneObject instanceof THREE.SkinnedMesh ||
      Array.isArray(sceneObject.material)
    )
      return;
    let sceneObject2: THREE.Object3D | null = sceneObject.parent;
    while (sceneObject2 && !(sceneObject2 instanceof THREE.Bone))
      sceneObject2 = sceneObject2.parent;
    if (!sceneObject2) return;
    const byMat = groups.get(sceneObject2) ?? new Map();
    groups.set(sceneObject2, byMat);
    const group = sceneObject.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4()
          .copy(sceneObject2.matrixWorld)
          .invert()
          .multiply(sceneObject.matrixWorld),
      );
    for (const key of Object.keys(group.attributes))
      if (!['position', 'normal', 'uv'].includes(key))
        group.deleteAttribute(key);
    if (!group.getAttribute('uv'))
      group.setAttribute(
        'uv',
        new THREE.BufferAttribute(
          new Float32Array(group.getAttribute('position').count * 2),
          2,
        ),
      );
    const list = byMat.get(sceneObject.material) ?? [];
    list.push(group.index ? group.toNonIndexed() : group);
    byMat.set(sceneObject.material, list);
    merged.push(sceneObject);
  });
  merged.forEach((material2) => material2.removeFromParent());
  for (const [bone, byMat] of groups)
    for (const [material3, list] of byMat) {
      const geometry = mergeGeometries(list, false);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material3);
      mesh.name = `armour-${bone.name}-${material3.name}`;
      bone.add(mesh);
    }
  return scene;
}

const name = (name2: string) => THREE.PropertyBinding.sanitizeNodeName(name2);
const RED = '#b0121c',
  PURPLE = '#5b2b8c';
function material(original: string, eye?: THREE.Material): THREE.Material {
  const phys = (
    color: string,
    metalness: number,
    roughness: number,
    extra: THREE.MeshPhysicalMaterialParameters = {},
  ) =>
    new THREE.MeshPhysicalMaterial({
      color,
      metalness,
      roughness,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      ...extra,
    });
  if (original === 'Black' && eye) return eye;
  if (original.startsWith('RED')) return phys(RED, 0.45, 0.3);
  if (original.startsWith('purple')) return phys(PURPLE, 0.4, 0.35);
  if (original === 'Silver' || original === 'Metal')
    return phys('#a3abb2', 0.85, 0.28, { clearcoat: 0 });
  if (original === 'BLACK_Skin')
    return phys('#17191d', 0.2, 0.65, { clearcoat: 0.1 });
  if (original === 'TRANSPARENT')
    return new THREE.MeshPhysicalMaterial({
      color: '#9fc4d8',
      metalness: 0,
      roughness: 0.05,
      transmission: 0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
  if (original === 'Black')
    return new THREE.MeshBasicMaterial({ color: '#0b0f11' });
  return phys('#eee8dc', 0, 0.78, { clearcoat: 0.02, sheen: 0.3 });
}

/**
 * Joint rotations passed through the armour integration contract.
 */
export type ArmourJoints = {
  /** Arm rotations in the white model's frame, relative to hanging at his side (as the white rig's shoulder pivots). */
  armL?: THREE.Quaternion;
  armR?: THREE.Quaternion;
  /** Leg rotations relative to hanging straight down. */
  legL?: THREE.Quaternion;
  legR?: THREE.Quaternion;
  /** Head rotation relative to its rest. */
  head?: THREE.Quaternion;
  /** Elbow bend in radians (forearm forward from the upper arm); default a relaxed .3. */
  elbowL?: number;
  elbowR?: number;
  /** Knee bend in radians (shin back from the thigh); default straight. */
  kneeL?: number;
  kneeR?: number;
};

/**
 * Owned armour geometry and its authored attachment state.
 */
type ArmourPiece = {
  mesh: THREE.Mesh;
  mats: THREE.Material[];
  orig: { transparent: boolean; opacity: number; depthWrite: boolean }[];
  base: THREE.Vector3;
  delay: number;
  late: boolean;
};

/**
 * Apply the combat presentation and expose the joint/chest mounting contract.
 */
export async function createArmouredBaymax(
  options: { eye?: THREE.Material; hole?: () => THREE.Vector3 | null } = {},
) {
  const src = await loadArmouredTemplate();
  const root = new THREE.Group();
  root.name = 'armoured-baymax';
  const suit = cloneSkinned(src);
  root.add(suit);
  root.updateMatrixWorld(true);
  const bone = (name2: string) =>
    suit.getObjectByName(name(name2)) as THREE.Bone;
  const hips = bone('Armor_Hips'),
    chest = bone('Armor_Chest'),
    head = bone('Armor_Head');
  const uArm = { L: bone('Armor_U_Arm.L'), R: bone('Armor_U_Arm.R') },
    lArm = { L: bone('Armor_L_Arm.L'), R: bone('Armor_L_Arm.R') };
  const hand = { L: bone('Armor_Hand.L'), R: bone('Armor_Hand.R') },
    pad = { L: bone('Armor_Shoulder.L'), R: bone('Armor_Shoulder.R') };
  const uLeg = { L: bone('Armor_U_Leg.L'), R: bone('Armor_U_Leg.R') },
    lLeg = { L: bone('Armor_L_Leg.L'), R: bone('Armor_L_Leg.R') };

  // Rest pose in the root's frame (root is at the identity here).
  const relQ = (sceneObject: THREE.Object3D) =>
    sceneObject.getWorldQuaternion(new THREE.Quaternion());
  const relM = (sceneObject: THREE.Object3D) => sceneObject.matrixWorld.clone();
  const restQ = new Map<THREE.Object3D, THREE.Quaternion>(
    [hips, chest, head, uArm.L, uArm.R, uLeg.L, uLeg.R, pad.L, pad.R].map(
      (sceneObject) => [sceneObject, relQ(sceneObject)],
    ),
  );
  const parentQ = (sceneObject: THREE.Object3D) =>
    restQ.get(sceneObject.parent!) ?? relQ(sceneObject.parent!);
  const parentRest = new Map(
    [uArm.L, uArm.R, uLeg.L, uLeg.R, head, pad.L, pad.R].map((sceneObject) => [
      sceneObject,
      parentQ(sceneObject),
    ]),
  );
  // Arms rest in a T: the swing that hangs each one at his side, a little out from the body.
  const hang = (side: 'L' | 'R') => {
    const from = lArm[side]
      .getWorldPosition(new THREE.Vector3())
      .sub(uArm[side].getWorldPosition(new THREE.Vector3()))
      .normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      from,
      new THREE.Vector3(side === 'L' ? 0.08 : -0.08, -1, 0).normalize(),
    );
  };
  const hangQ = { L: hang('L'), R: hang('R') };
  const restF = { L: relQ(lArm.L), R: relQ(lArm.R) },
    bendQ = new THREE.Quaternion(),
    vector = new THREE.Vector3(1, 0, 0),
    invU = new THREE.Quaternion(),
    invH = new THREE.Quaternion();
  const legDown = (side: 'L' | 'R') => {
    const from = lLeg[side]
      .getWorldPosition(new THREE.Vector3())
      .sub(uLeg[side].getWorldPosition(new THREE.Vector3()))
      .normalize();
    // A little out from straight down: his thigh plates are wider than his hips, so straight legs grind through each other (tracker Q-05).
    return new THREE.Quaternion().setFromUnitVectors(
      from,
      new THREE.Vector3(side === 'L' ? 0.16 : -0.16, -1, 0).normalize(),
    );
  };
  const legQ = { L: legDown('L'), R: legDown('R') };
  const restS = { L: relQ(lLeg.L), R: relQ(lLeg.R) },
    invL = new THREE.Quaternion(),
    invD = new THREE.Quaternion();
  // Each hand rides on the end of its forearm, as it sat at rest.
  const handOffset = {
    L: relM(lArm.L).invert().multiply(relM(hand.L)),
    R: relM(lArm.R).invert().multiply(relM(hand.R)),
  };
  // Feet: points at the bottom of each lower leg (and a little under it, the sole), for grounding.
  const feet = (['L', 'R'] as const).map((state) => {
    const sceneObject = new THREE.Object3D();
    lLeg[state].add(sceneObject);
    const tip = lLeg[state].getWorldPosition(new THREE.Vector3()),
      knee = uLeg[state].getWorldPosition(new THREE.Vector3());
    sceneObject.position.copy(
      lLeg[state].worldToLocal(
        tip.clone().addScaledVector(tip.clone().sub(knee).normalize(), 0.52),
      ),
    );
    return sceneObject;
  });

  // Materials: restyled to match the project (red, purple, black suit, white face); the chest plate
  // and suit get a hole over the chest bay so the chips stay reachable.
  const hole = { c: new THREE.Vector3(), r: 0.42 };
  const pieces: ArmourPiece[] = [],
    centre = new THREE.Box3()
      .setFromObject(suit)
      .getCenter(new THREE.Vector3());
  suit.traverse((sceneObject) => {
    if (!(sceneObject instanceof THREE.Mesh)) return;
    const originals = Array.isArray(sceneObject.material)
      ? sceneObject.material
      : [sceneObject.material];
    const material2 = originals.map((mesh) => {
      const material3 = material(mesh.name, options.eye);
      if (
        material3 !== options.eye &&
        material3 instanceof THREE.MeshPhysicalMaterial &&
        options.hole
      ) {
        material3.onBeforeCompile = (shader) => {
          shader.uniforms.uHole = { value: hole.c };
          shader.uniforms.uHoleR = { value: hole.r };
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vArmourWorld;',
            )
            .replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\nvArmourWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nuniform vec3 uHole;uniform float uHoleR;varying vec3 vArmourWorld;',
            )
            .replace(
              'void main() {',
              'void main() {\nif (uHoleR > 0. && distance(vArmourWorld, uHole) < uHoleR) discard;',
            );
        };
      }
      return material3;
    });
    sceneObject.material = Array.isArray(sceneObject.material)
      ? material2
      : material2[0];
    // The inner suit and chest plates carry his whole silhouette; the small pieces skip the shadow pass (tracker PW-08).
    sceneObject.castShadow = /INSIDE|Chest/.test(sceneObject.name);
    sceneObject.receiveShadow = true;
    sceneObject.frustumCulled = false;
    const late =
      /INSIDE|Baymax\.00/.test(sceneObject.name) ||
      (sceneObject instanceof THREE.SkinnedMesh &&
        /INSIDE/.test(sceneObject.name));
    pieces.push({
      mesh: sceneObject,
      mats: material2,
      orig: material2.map((material3) => ({
        transparent: material3.transparent,
        opacity: material3.opacity,
        depthWrite: material3.depthWrite,
      })),
      base: sceneObject.scale.clone(),
      delay: sceneObject
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(centre),
      late,
    });
  });
  const order = pieces
    .filter((point) => !point.late)
    .sort((firstEntry, secondEntry) => firstEntry.delay - secondEntry.delay);
  order.forEach((point, index) => {
    point.delay = index / Math.max(1, order.length - 1);
  });
  const tmpQ = new THREE.Quaternion(),
    tmpM = new THREE.Matrix4(),
    transformMatrix = new THREE.Matrix4(),
    id = new THREE.Quaternion();

  let shown = -1;
  const updateChestHole = (radius?: number) => {
    const height = options.hole?.();
    if (height) {
      hole.c.copy(height);
      hole.r =
        radius ?? (0.58 * root.getWorldScale(new THREE.Vector3()).x) / 1.5;
    } else hole.r = 0;
  };
  const api = {
    root,
    feet,
    /** Refresh after an outer rig applies a final world-space contact correction. */
    updateChestHole,
    /** Bone rest heights in the model's own units (for mounting it inside a white rig). */
    joints: {
      hipY: uLeg.L.getWorldPosition(new THREE.Vector3()).y,
      hipZ: uLeg.L.getWorldPosition(new THREE.Vector3()).z,
      shoulderY: uArm.L.getWorldPosition(new THREE.Vector3()).y,
    },
    /** Pose the suit from the white rig's joint rotations. */
    drive(segmentIndex: ArmourJoints) {
      const set = (
        sceneObject: THREE.Bone,
        rotationQuaternion: THREE.Quaternion,
      ) => {
        sceneObject.quaternion
          .copy(parentRest.get(sceneObject)!)
          .invert()
          .multiply(rotationQuaternion);
      };
      for (const state of ['L', 'R'] as const) {
        const arm = state === 'L' ? segmentIndex.armL : segmentIndex.armR,
          leg = state === 'L' ? segmentIndex.legL : segmentIndex.legR;
        tmpQ
          .copy(arm ?? id)
          .multiply(hangQ[state])
          .multiply(restQ.get(uArm[state])!);
        set(uArm[state], tmpQ);
        // The pad rides up with the arm a little.
        tmpQ
          .copy(id)
          .slerp(arm ?? id, 0.3)
          .multiply(restQ.get(pad[state])!);
        set(pad[state], tmpQ);
        tmpQ
          .copy(leg ?? id)
          .multiply(legQ[state])
          .multiply(restQ.get(uLeg[state])!);
        set(uLeg[state], tmpQ);
        // Elbow: the forearm bends forward in the hanging arm's frame, whatever the shoulder does.
        bendQ.setFromAxisAngle(
          vector,
          -((state === 'L' ? segmentIndex.elbowL : segmentIndex.elbowR) ?? 0.3),
        );
        invU.copy(restQ.get(uArm[state])!).invert();
        invH.copy(hangQ[state]).invert();
        lArm[state].quaternion
          .copy(invU)
          .multiply(invH)
          .multiply(bendQ)
          .multiply(hangQ[state])
          .multiply(restF[state]);
        // Knee: the shin swings back in the straightened leg's frame, the same way (tracker R-04).
        bendQ.setFromAxisAngle(
          vector,
          (state === 'L' ? segmentIndex.kneeL : segmentIndex.kneeR) ?? 0,
        );
        invL.copy(restQ.get(uLeg[state])!).invert();
        invD.copy(legQ[state]).invert();
        lLeg[state].quaternion
          .copy(invL)
          .multiply(invD)
          .multiply(bendQ)
          .multiply(legQ[state])
          .multiply(restS[state]);
      }
      tmpQ.copy(segmentIndex.head ?? id).multiply(restQ.get(head)!);
      set(head, tmpQ);
      // Hands onto the forearms.
      root.updateMatrixWorld(true);
      transformMatrix.copy(root.matrixWorld).invert();
      for (const state2 of ['L', 'R'] as const) {
        tmpM
          .copy(transformMatrix)
          .multiply(lArm[state2].matrixWorld)
          .multiply(handOffset[state2]);
        const parentRel = new THREE.Matrix4()
          .copy(transformMatrix)
          .multiply(hand[state2].parent!.matrixWorld);
        tmpM.premultiply(parentRel.invert());
        tmpM.decompose(
          hand[state2].position,
          hand[state2].quaternion,
          hand[state2].scale,
        );
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
      const vector2 = chest.getWorldPosition(new THREE.Vector3()),
        rotationQuaternion = root.getWorldQuaternion(new THREE.Quaternion()),
        sc = root.getWorldScale(new THREE.Vector3()).x;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
          rotationQuaternion,
        ),
        side = new THREE.Vector3(1, 0, 0).applyQuaternion(rotationQuaternion),
        upv = new THREE.Vector3(0, 1, 0).applyQuaternion(rotationQuaternion);
      const aim = vector2
        .clone()
        .addScaledVector(side, lateral * sc)
        .addScaledVector(upv, up * sc);
      // Skinned plates are only posed at render time: bring their skeletons up to date first, so the
      // ray meets what will actually be drawn.
      const meshes: THREE.Object3D[] = [];
      suit.traverse((sceneObject) => {
        if (sceneObject instanceof THREE.SkinnedMesh)
          sceneObject.skeleton.update();
        if (sceneObject instanceof THREE.Mesh) meshes.push(sceneObject);
      });
      const hit = new THREE.Raycaster(
        aim.clone().addScaledVector(fwd, 3 * sc),
        fwd.clone().negate(),
        0,
        6 * sc,
      ).intersectObjects(meshes, false)[0];
      const normal = hit?.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : fwd.clone();
      if (normal.dot(fwd) < 0) normal.negate();
      return {
        point: hit ? hit.point.clone() : aim.addScaledVector(fwd, 0.6 * sc),
        normal,
        bone: chest as THREE.Object3D,
      };
    },
    /**
     * A frame lying along the chest plating at (lateral, up): x runs up his body along the plate's
     * slope (the chord between two spots `span` apart), y points out of the plate, z completes it.
     * A long box set on this frame touches the plate at both ends instead of rocking on its middle.
     */
    chestFrame(lateral: number, up: number, span = 0.1) {
      const startPoint = api.chestSpot(lateral, up - span),
        endPoint = api.chestSpot(lateral, up + span),
        vector2 = api.chestSpot(lateral, up);
      const xPosition = endPoint.point
        .clone()
        .sub(startPoint.point)
        .normalize();
      const normalVector = startPoint.normal
        .clone()
        .add(endPoint.normal)
        .add(vector2.normal)
        .normalize();
      normalVector
        .addScaledVector(xPosition, -normalVector.dot(xPosition))
        .normalize();
      return {
        point: startPoint.point.clone().add(endPoint.point).multiplyScalar(0.5),
        x: xPosition,
        n: normalVector,
        z: new THREE.Vector3().crossVectors(xPosition, normalVector),
        bone: chest as THREE.Object3D,
      };
    },
    /** Fix an object flat on the chest plating at (lateral, up): its +Y out of the plate, its X along his body. */
    mountOnChest(obj: THREE.Object3D, lateral: number, up: number) {
      const vector2 = api.chestFrame(lateral, up);
      const mw = new THREE.Matrix4()
        .makeBasis(vector2.x, vector2.n, vector2.z)
        .setPosition(vector2.point.addScaledVector(vector2.n, -0.02))
        .scale(obj.getWorldScale(new THREE.Vector3()));
      chest.add(obj);
      obj.matrix.copy(
        new THREE.Matrix4().copy(chest.matrixWorld).invert().multiply(mw),
      );
      obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    },
    /**
     * Seat a round part (the chip bay) on the chest plating at (lateral, up) without it sinking into the
     * curved plate (tracker R-02): it sits on the highest point under its rim, enlarged by `grow`, and a
     * dark housing runs from its edge down into the plate all round. `rim` is its radius in its own units.
     */
    seatOnPlate(
      obj: THREE.Object3D,
      lateral: number,
      up: number,
      rim: number,
      grow = 1,
      face = 0.7,
    ) {
      const sc = root.getWorldScale(new THREE.Vector3()).x,
        scaleVector = obj.getWorldScale(new THREE.Vector3()).x * grow;
      const vector2 = api.chestFrame(lateral, up, 0.06),
        radius = (rim * scaleVector) / sc;
      // Face it mostly straight ahead, as on his chest in Phase 1, not along the plate's curve (tracker S-07).
      const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(
        root.getWorldQuaternion(new THREE.Quaternion()),
      );
      const normalVector = vector2.n.clone().lerp(ahead, face).normalize();
      let hi = -Infinity,
        lo = Infinity;
      // Sample the plate across the whole face (three rings and the centre), so no ridge pokes through it.
      for (const blendFactor of [0, 0.4, 0.75, 1.05])
        for (let index = 0; index < (blendFactor ? 16 : 1); index++) {
          const firstValue = (index / 16) * Math.PI * 2,
            height = api
              .chestSpot(
                lateral + Math.cos(firstValue) * radius * blendFactor,
                up + Math.sin(firstValue) * radius * blendFactor,
              )
              .point.sub(vector2.point)
              .dot(normalVector);
          hi = Math.max(hi, height);
          if (blendFactor >= 1) lo = Math.min(lo, height);
        }
      const lift = Math.max(0, hi) + 0.004 * sc,
        sink = Math.max(0, -lo) + 0.02 * sc;
      const undo = seatOn(obj, {
        point: vector2.point.clone().addScaledVector(normalVector, lift),
        normal: normalVector,
        bone: vector2.bone,
      });
      obj.scale.multiplyScalar(grow);
      const depth = (lift + sink) / scaleVector;
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(rim * 1.04, rim * 1.1, depth, 40, 1, true),
        new THREE.MeshStandardMaterial({
          color: '#23262b',
          roughness: 0.55,
          metalness: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      housing.name = 'bay-housing';
      housing.rotation.x = Math.PI / 2;
      housing.position.z = -depth / 2 + 0.004;
      obj.add(housing);
      // The white chest's skin collar (ChestBay) stays behind on the white body.
      const collar = obj.getObjectByName('bay-collar');
      if (collar) collar.visible = false;
      return () => {
        housing.removeFromParent();
        housing.geometry.dispose();
        (housing.material as THREE.Material).dispose();
        if (collar) collar.visible = true;
        undo();
      };
    },
    /** His helmet in world space (the camera's eye target once he's armoured). */
    headWorld: (out = new THREE.Vector3()) =>
      head.localToWorld(out.set(0, 0.12, 0.05)),
    /** Lowest point of his feet in world space (for sitting him on the ground). */
    footLow() {
      let low = Infinity;
      const vector2 = new THREE.Vector3();
      for (const sceneObject of feet)
        low = Math.min(low, sceneObject.getWorldPosition(vector2).y);
      return low;
    },
    /** 0 = no armour … 1 = fully armoured. Plates arrive core first; the suit and face come in last. */
    set(blendFactor: number) {
      if (blendFactor === shown) return;
      shown = blendFactor;
      root.visible = blendFactor > 0;
      for (const point of pieces) {
        const local = point.late
          ? THREE.MathUtils.smoothstep(blendFactor, 0.8, 1)
          : THREE.MathUtils.clamp(
              (blendFactor - point.delay * 0.55) / 0.45,
              0,
              1,
            );
        const easedProgress = local * local * (3 - 2 * local);
        point.mesh.visible = local > 0;
        if (!point.late)
          point.mesh.scale
            .copy(point.base)
            .multiplyScalar(1 + (1 - easedProgress) * 0.2);
        point.mats.forEach((material2, index) => {
          if (material2 === options.eye) return;
          const offset = point.orig[index];
          if (easedProgress < 1) {
            material2.transparent = true;
            material2.opacity = offset.opacity * easedProgress;
            material2.depthWrite = offset.depthWrite && easedProgress > 0.5;
          } else {
            material2.transparent = offset.transparent;
            material2.opacity = offset.opacity;
            material2.depthWrite = offset.depthWrite;
          }
        });
      }
    },
    /** True once the white body underneath is fully covered (callers hide it then). */
    covers: (blendFactor: number) => blendFactor >= 0.98,
    dispose() {
      root.removeFromParent();
      pieces.forEach((point) =>
        point.mats.forEach((material2) => {
          if (material2 !== options.eye) material2.dispose();
        }),
      );
    },
  };
  api.drive({});
  api.set(0);
  return api;
}
export type ArmouredBaymax = Awaited<ReturnType<typeof createArmouredBaymax>>;

/** Mount the suit inside a white rig: scale and place it so its hips and shoulders meet the white rig's. */
export function mountArmour(
  group: ArmouredBaymax,
  white: THREE.Object3D,
  hip: { y: number; z: number },
  shoulderY: number,
) {
  const scaleFactor =
    (shoulderY - hip.y) / (group.joints.shoulderY - group.joints.hipY);
  group.root.scale.setScalar(scaleFactor);
  group.root.position.set(
    0,
    hip.y - group.joints.hipY * scaleFactor,
    hip.z - group.joints.hipZ * scaleFactor,
  );
  white.add(group.root);
  return scaleFactor;
}

/**
 * Seat an object on a spot of the suit (its +Z out of the surface, its +Y toward his head), parented
 * to the chest bone so it moves with him. Returns a function that puts it back where it was.
 */
export function seatOn(
  obj: THREE.Object3D,
  spot: { point: THREE.Vector3; normal: THREE.Vector3; bone: THREE.Object3D },
  depth = 0,
) {
  const parent = obj.parent!,
    position = obj.position.clone(),
    quat = obj.quaternion.clone(),
    scl = obj.scale.clone();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
    spot.bone.getWorldQuaternion(new THREE.Quaternion()),
  );
  const zPosition = spot.normal.clone().normalize(),
    xPosition = new THREE.Vector3().crossVectors(up, zPosition).normalize(),
    yPosition = new THREE.Vector3().crossVectors(zPosition, xPosition);
  const worldScale = obj.getWorldScale(new THREE.Vector3());
  spot.bone.add(obj);
  const transformMatrix = new THREE.Matrix4()
    .makeBasis(xPosition, yPosition, zPosition)
    .setPosition(spot.point.clone().addScaledVector(zPosition, -depth))
    .scale(worldScale);
  obj.matrix.copy(
    new THREE.Matrix4()
      .copy(spot.bone.matrixWorld)
      .invert()
      .multiply(transformMatrix),
  );
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  return () => {
    parent.add(obj);
    obj.position.copy(position);
    obj.quaternion.copy(quat);
    obj.scale.copy(scl);
  };
}
