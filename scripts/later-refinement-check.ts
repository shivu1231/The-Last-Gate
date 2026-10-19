import * as THREE from 'three';
import { createBaymax, restPose } from '../src/phase6/baymax';
import { downshiftDpr } from '../src/performance/AdaptiveDpr';
import { facilityCameraRoute, FACILITY_SHOTS } from '../src/phase5/cameraRoute';
import { createFacility } from '../src/phase5/facility';
import { createStreetImpacts } from '../src/phase6/StreetImpacts';
import { haulProgress } from '../src/phase6/haulMotion';
import { createBay } from '../src/phase5/bay';
const group = await createBaymax();
const suit = group.model;
const surfaces: THREE.Mesh[] = [];
suit.traverse((sceneObject) => {
  if (
    sceneObject instanceof THREE.Mesh &&
    !Array.isArray(sceneObject.material) &&
    sceneObject.material.userData.combatSurface
  )
    surfaces.push(sceneObject);
});
if (surfaces.length < 15)
  throw new Error(
    `Canonical combat finish missing from body parts: ${surfaces.length}`,
  );
if (
  suit.getObjectByName('armour-abdomen') ||
  suit.getObjectByName('plate-inflatable-body')
)
  throw new Error('Duplicate shells overlap the canonical body');
const mount = group.model.getObjectByName('regulator-chest-supports');
if (!mount || mount.children.length !== 4)
  throw new Error('Regulator lacks four physical chest supports');
const unit = group.model.getObjectByName('power-regulator')!;
if (Math.abs(unit.getWorldScale(new THREE.Vector3()).x - 1) > 0.001)
  throw new Error('Fitted unit changes the original Bay 6 world scale');
for (const support of mount.children) {
  const geometry = (support as THREE.Mesh).geometry as THREE.CylinderGeometry;
  if (geometry.parameters.height > 0.25)
    throw new Error('Regulator floats on overlong supports');
}
let previous = 0;
for (let index = 1; index <= 10000; index++) {
  const next = haulProgress(index / 10000, 10);
  if (next < previous || next - previous > 0.0004)
    throw new Error('Haul reverses or starts with an impulse');
  previous = next;
}
if (previous !== 1 || haulProgress(0.01, 10) !== 0)
  throw new Error('Haul lacks brace or final settle');
const results = [];
for (const pose of [
  { sit: 0 },
  { sit: 0.7 },
  { sit: 0, stride: 0.8, gait: 1.2 },
  { sit: 0, lie: 1, overhead: 1 },
  { sit: 0, getUp: 0.45 },
  { sit: 0, armour: 0 },
]) {
  Object.assign(group.pose, restPose(), pose);
  for (let index2 = 0; index2 < 60; index2++) {
    if (pose.getUp) group.pose.getUp = pose.getUp;
    group.update(index2 / 60);
  }
  group.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  suit.traverseVisible((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      (sceneObject.material as THREE.Material).name === 'inflatable'
    ) {
      const single = new THREE.Box3().makeEmpty();
      const vector = new THREE.Vector3();
      for (
        let index3 = 0;
        index3 < sceneObject.geometry.attributes.position.count;
        index3++
      ) {
        sceneObject
          .getVertexPosition(index3, vector)
          .applyMatrix4(sceneObject.matrixWorld);
        single.expandByPoint(vector);
      }
      box.union(single);
    }
  });
  if (Math.abs(box.min.y) > 0.025)
    throw new Error(`Contact ${JSON.stringify(pose)}: ${box.min.y}`);
  if (pose.armour === 0)
    for (const mesh of surfaces) {
      const shader = {
        uniforms: {},
        vertexShader: '',
        fragmentShader: '',
      } as Parameters<THREE.Material['onBeforeCompile']>[0];
      (mesh.material as THREE.Material).onBeforeCompile(
        shader,
        {} as THREE.WebGLRenderer,
      );
      if (shader.uniforms.uCombatFinish.value !== 0)
        throw new Error('Combat finish remains after healthcare chip');
    }
  results.push({ pose: pose, minY: box.min.y, height: box.max.y - box.min.y });
}
if (group.bay.root.parent !== suit || group.bay.root.parent?.type === 'Bone')
  throw new Error('Chip bay left the shared body');
Object.assign(group.pose, restPose(), {
  sit: 0,
  lie: 1,
  armour: 1,
  guard: 0,
  open: 4.6,
  yaw: Math.PI,
});
for (let index4 = 0; index4 < 60; index4++) group.update(5 + index4 / 60);
const recoveryDock = group.dockWorld(),
  recoveryChest = group.chestWorld();
let checkedHole = false;
suit.traverse((sceneObject) => {
  if (checkedHole || !(sceneObject instanceof THREE.Mesh)) return;
  for (const material of Array.isArray(sceneObject.material)
    ? sceneObject.material
    : [sceneObject.material]) {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader:
        '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>',
    } as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    if (shader.uniforms.uHoleCenter && shader.uniforms.uCombatFinish) {
      checkedHole = true;
      if (
        (shader.uniforms.uHoleCenter.value as THREE.Vector3).distanceTo(
          recoveryChest,
        ) > 1e-5
      )
        throw new Error('Canonical cutout lags grounded chest bay');
      if (
        shader.uniforms.uHoleRadius.value >
        group.bay.root.getWorldScale(new THREE.Vector3()).x * 0.235 * 1.01
      )
        throw new Error('Cutout exceeds the physical bay rim');
    }
  }
});
if (!checkedHole) throw new Error('Chest aperture shader missing');
for (let index5 = 0; index5 < 180; index5++) {
  group.pose.tension = 0.4;
  group.pose.sluggish = 1;
  group.update(6 + index5 / 60);
  if (group.dockWorld().distanceTo(recoveryDock) > 1e-5)
    throw new Error('Unconscious chest bobs during inspection');
}
Object.assign(group.pose, restPose(), { sit: 0, lie: 1, overhead: 1 });
group.root.rotation.x = 0.18;
group.root.position.set(0, 0, -3);
const floor = (xPosition: number, zPosition: number) =>
  Math.max(0, Math.min(1.2, (zPosition + 5) * 0.2));
for (let index6 = 0; index6 < 60; index6++) group.update(index6 / 60, floor);
let penetration = 0;
const vector2 = new THREE.Vector3();
suit.traverseVisible((sceneObject) => {
  if (
    sceneObject instanceof THREE.Mesh &&
    (sceneObject.material as THREE.Material).name === 'inflatable'
  )
    for (
      let index3 = 0;
      index3 < sceneObject.geometry.attributes.position.count;
      index3++
    ) {
      sceneObject
        .getVertexPosition(index3, vector2)
        .applyMatrix4(sceneObject.matrixWorld);
      penetration = Math.max(
        penetration,
        floor(vector2.x, vector2.z) - vector2.y,
      );
    }
});
if (penetration > 0.025) throw new Error(`Ramp penetration: ${penetration}`);
group.root.rotation.x = 0;
group.root.position.set(0, 0, 0);
Object.assign(group.pose, restPose(), { sit: 0 });
const start = performance.now();
for (let index7 = 0; index7 < 300; index7++) {
  group.pose.gait = index7 / 20;
  group.pose.stride = 0.8;
  group.update(index7 / 60);
}
const milliseconds = (performance.now() - start) / 300;
if (downshiftDpr(0.8, 1 / 40, 1) > 0.8) throw new Error('DPR rose under load');
const facility = createFacility();
facility.root.updateMatrixWorld(true);
const room = facility.root.getObjectByName('relay-room-structure')!;
const ray = new THREE.Raycaster();
const dir = new THREE.Vector3();
let from = new THREE.Vector3(...FACILITY_SHOTS.power[0]);
for (const key of ['patch', 'spectrum', 'dish', 'trace', 'done'] as const) {
  for (const shot of facilityCameraRoute(from, key)) {
    const to = new THREE.Vector3(...shot.p);
    dir.subVectors(to, from);
    const length = dir.length();
    ray.set(from, dir.normalize());
    ray.far = length;
    const hits = ray
      .intersectObject(room, true)
      .filter(
        (sceneObject) =>
          sceneObject.distance > 0.01 && sceneObject.distance < length - 0.01,
      );
    if (hits.length)
      throw new Error(
        `Camera ${key}: ${hits[0].object.name} at ${hits[0].point.toArray()}`,
      );
    from.copy(to);
  }
}
const poolRoot = new THREE.Group();
let hits = 0;
const pool = createStreetImpacts(poolRoot, () => hits++);
pool.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(2, 0, 0));
for (let index8 = 0; index8 < 1800; index8++) pool.update(1 / 60);
if (
  hits !== 1 ||
  poolRoot.children[0].children.some((sceneObject) => sceneObject.visible)
)
  throw new Error('Impact did not expire');
pool.dispose();
console.log(
  JSON.stringify(
    {
      results,
      actorCpuMs: milliseconds,
      cameraRoutes: 'clear',
      rampPenetration: penetration,
      chipBay: 'same solid rig',
      combatSurfaces: surfaces.length,
      impacts: 'travel / impact / expire passed',
      dpr: 'pass',
    },
    null,
    2,
  ),
);
facility.dispose();
group.dispose();
const recovery = await createBay();
recovery.update(0, 1 / 60, { fitted: 0, power: 0, held: false });
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
  recovery.model.quaternion,
);
const recline =
  90 - THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)));
if (recline < 20 || recline > 35)
  throw new Error(`Recovery torso recline ${recline}`);
if (!recovery.district.group.getObjectByName('recovery-backstop'))
  throw new Error('Recovery lacks shoulder support');
for (let index9 = 0; index9 <= 100; index9++)
  recovery.update(index9 / 30, 1 / 30, {
    fitted: index9 / 100,
    power: 0,
    held: false,
  });
const recoveryUnit =
  recovery.district.group.getObjectByName('power-regulator')!;
if (Math.abs(recoveryUnit.getWorldScale(new THREE.Vector3()).x - 1) > 0.001)
  throw new Error('Installation changes original unit scale');
const readerCamera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 400),
  front = new THREE.Vector3(0, 0, 1).applyQuaternion(recovery.model.quaternion);
readerCamera.position.copy(recovery.body).addScaledVector(front, 9.8);
readerCamera.position.y = recovery.body.y + 3.6;
readerCamera.lookAt(recovery.body.clone().add(new THREE.Vector3(0, 0.3, 0)));
readerCamera.updateMatrixWorld();
const projected = new THREE.Box3();
recovery.model.traverseVisible((sceneObject) => {
  if (
    sceneObject instanceof THREE.Mesh &&
    (sceneObject.material as THREE.Material).name === 'inflatable'
  )
    for (
      let index3 = 0;
      index3 < sceneObject.geometry.attributes.position.count;
      index3++
    ) {
      sceneObject
        .getVertexPosition(index3, vector2)
        .applyMatrix4(sceneObject.matrixWorld)
        .project(readerCamera);
      projected.expandByPoint(vector2);
    }
});
if (
  projected.min.y < -0.95 ||
  projected.max.y > 0.95 ||
  projected.min.x < -0.95 ||
  projected.max.x > 0.95
)
  throw new Error('Recovery overview crops the head or feet');
console.log(
  JSON.stringify(
    {
      recoveryRecline: recline,
      recoveryFraming: 'head and feet clear',
      regulator: 'same world scale, four short back supports',
    },
    null,
    2,
  ),
);
recovery.dispose();
