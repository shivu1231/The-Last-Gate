import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit } from '../phase2/SceneKit';

/** Collapse the authored solid detail without joining independently moving assemblies. */
export function batchSolids(root: T.Group, kit: SceneKit) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<T.Material, { geometry: T.BufferGeometry[]; objects: T.Mesh[] }>();
  root.traverse(object => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material) || object.material.transparent || object instanceof T.InstancedMesh) return;
    const copy = object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const geometry = copy.index ? copy.toNonIndexed() : copy;
    if (copy !== geometry) copy.dispose();
    const bucket = buckets.get(object.material) ?? { geometry: [], objects: [] };
    bucket.geometry.push(geometry); bucket.objects.push(object); buckets.set(object.material, bucket);
  });
  for (const [material, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometry);
    bucket.geometry.forEach(g => g.dispose());
    if (!geometry) continue;
    bucket.objects.forEach(object => object.removeFromParent());
    const mesh = kit.mesh(kit.ownGeometry(geometry), material, { p: [0, 0, 0] }, root);
    mesh.receiveShadow = true;
  }
}

export function link(kit: SceneKit, parent: T.Object3D, from: T.Vector3, to: T.Vector3, radius: number, material: T.Material, sides = 8) {
  const delta = to.clone().sub(from);
  const geometry = kit.ownGeometry(new T.CylinderGeometry(radius, radius, delta.length(), sides));
  const mesh = kit.mesh(geometry, material, { p: [0, 0, 0] }, parent);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

/** A real azimuth pedestal, elevation yoke and joined prime-focus reflector. */
export function createReceiver(kit: SceneKit, parent: T.Object3D) {
  const root = new T.Group(); root.name = 'telemetry-receiver'; root.position.set(1.6, -.2, -14); parent.add(root);
  const structural = kit.standard('#80908e', .48, .68);
  const painted = kit.standard('#d6d6c9', .55, .32);
  const graphite = kit.standard('#202e32', .58, .62);
  const bronze = kit.standard('#b89b69', .42, .7);
  const rimMat = kit.standard('#e0e2d9', .34, .7);
  const tower = new T.Group(); root.add(tower);
  const cylinder = (r: number, h: number, p: [number, number, number], material: T.Material, group: T.Object3D = tower, rotation?: [number, number, number]) =>
    kit.mesh(kit.ownGeometry(new T.CylinderGeometry(r, r, h, 16)), material, { p, r: rotation }, group);

  // Four anchored legs widen at the foot; the braces meet the legs at every bay.
  const leg = (x: number, z: number, y: number) => new T.Vector3(x * (1.03 - y * .062), y, z * (1.03 - y * .062));
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    link(kit, tower, leg(x, z, .25), leg(x, z, 6.25), .065, structural);
    kit.box({ p: [x * 1.02, .23, z * 1.02], s: [.5, .07, .5] }, graphite, tower);
    for (const dx of [-.16, .16]) for (const dz of [-.16, .16]) cylinder(.035, .07, [x * 1.02 + dx, .28, z * 1.02 + dz], bronze);
  }
  for (let y = .4; y < 5.9; y += 1.12) {
    for (const z of [-1, 1]) {
      link(kit, tower, leg(-1, z, y), leg(1, z, y + 1.12), .025, structural);
      link(kit, tower, leg(1, z, y), leg(-1, z, y + 1.12), .025, structural);
    }
    for (const x of [-1, 1]) link(kit, tower, leg(x, -1, y), leg(x, 1, y + 1.12), .025, structural);
  }
  kit.box({ p: [0, 6.25, 0], s: [1.55, .12, 1.55] }, structural, tower);
  for (let y = .55; y < 6.1; y += .32) kit.box({ p: [-.75, y, .86 - y * .05], s: [.38, .035, .035] }, structural, tower);
  cylinder(.52, .15, [0, 6.38, 0], graphite);
  cylinder(.42, .14, [0, 6.51, 0], bronze);
  kit.box({ p: [.62, 6.35, 0], s: [.44, .38, .35] }, graphite, tower);
  batchSolids(tower, kit);

  const yaw = new T.Group(); yaw.name = 'receiver-azimuth-drive'; yaw.position.y = 6.9; root.add(yaw);
  const yoke = new T.Group(); yaw.add(yoke);
  kit.box({ p: [0, -.29, -.3], s: [1.65, .18, .66] }, painted, yoke);
  for (const x of [-.73, .73]) {
    kit.box({ p: [x, .02, -.3], s: [.15, .64, .6] }, painted, yoke);
    cylinder(.2, .2, [x, .23, -.28], graphite, yoke, [0, 0, Math.PI / 2]);
    cylinder(.12, .22, [x, .23, -.28], bronze, yoke, [0, 0, Math.PI / 2]);
  }
  kit.box({ p: [-.98, .23, -.28], s: [.36, .35, .45] }, graphite, yoke);
  batchSolids(yoke, kit);

  const elevation = new T.Group(); elevation.name = 'receiver-elevation-gimbal'; elevation.position.set(0, .23, -.28); yaw.add(elevation);
  const bowlGroup = new T.Group(); bowlGroup.position.z = 1.16; elevation.add(bowlGroup);
  const profile: T.Vector2[] = [];
  const depth = (r: number) => r * r / 8.6;
  // The second side gives the reflector an actual edge thickness, rather than a paper disc.
  for (let i = 0; i <= 28; i++) { const r = i / 28 * 1.9; profile.push(new T.Vector2(r, depth(r))); }
  for (let i = 28; i >= 0; i--) { const r = i / 28 * 1.9; profile.push(new T.Vector2(r, depth(r) - .045)); }
  const reflector = kit.ownMaterial(new T.MeshStandardMaterial({ color: '#e2e0d2', metalness: .48, roughness: .44, side: T.DoubleSide, forceSinglePass: true }));
  kit.mesh(kit.ownGeometry(new T.LatheGeometry(profile, 64).rotateX(Math.PI / 2)), reflector, { p: [0, 0, 0] }, bowlGroup);
  kit.mesh(kit.ownGeometry(new T.TorusGeometry(1.9, .035, 8, 80)), rimMat, { p: [0, 0, depth(1.9)] }, bowlGroup);

  // All ribs follow the rear surface; the feed braces stop on the rim's forward face.
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const points = Array.from({ length: 12 }, (_, j) => { const r = .22 + j / 11 * 1.65; return new T.Vector3(ca * r, sa * r, depth(r) - .09); });
    kit.mesh(kit.ownGeometry(new T.TubeGeometry(new T.CatmullRomCurve3(points), 12, .025, 5)), structural, { p: [0, 0, 0] }, bowlGroup);
    if (i % 4 === 0) {
      const from = new T.Vector3(ca * 1.79, sa * 1.79, depth(1.79) + .055);
      const to = new T.Vector3(ca * .11, sa * .11, 1.27);
      link(kit, bowlGroup, from, to, .026, graphite);
      kit.mesh(kit.ownGeometry(new T.SphereGeometry(.055, 8, 6)), bronze, { p: from.toArray() as [number, number, number] }, bowlGroup);
    }
  }
  cylinder(.34, .14, [0, 0, -.11], graphite, bowlGroup, [Math.PI / 2, 0, 0]);
  kit.box({ p: [0, 0, -.25], s: [.85, .72, .24] }, painted, bowlGroup);
  // The reflector stands ahead of its pivot. The rear spindle joins it to the yoke;
  // none of the fixed bearing blocks extends through the reflecting surface.
  cylinder(.15, .91, [0, 0, -.705], graphite, bowlGroup, [Math.PI / 2, 0, 0]);
  cylinder(.12, .26, [0, 0, 1.3], graphite, bowlGroup, [Math.PI / 2, 0, 0]);
  cylinder(.18, .09, [0, 0, 1.13], bronze, bowlGroup, [Math.PI / 2, 0, 0]);
  kit.mesh(kit.ownGeometry(new T.TorusGeometry(.14, .025, 8, 24)), graphite, { p: [0, 0, 1.08] }, bowlGroup);
  batchSolids(bowlGroup, kit);

  yaw.rotation.y = Math.PI + T.MathUtils.degToRad(140 - 212);
  elevation.rotation.x = -T.MathUtils.degToRad(15);
  return {
    root,
    update(azimuth: number, angle: number, dt: number) {
      const target = Math.PI + T.MathUtils.degToRad(azimuth - 212);
      const delta = Math.atan2(Math.sin(target - yaw.rotation.y), Math.cos(target - yaw.rotation.y));
      yaw.rotation.y += delta * (1 - Math.exp(-dt * 9));
      elevation.rotation.x = T.MathUtils.damp(elevation.rotation.x, -T.MathUtils.degToRad(angle), 9, dt);
    },
  };
}
