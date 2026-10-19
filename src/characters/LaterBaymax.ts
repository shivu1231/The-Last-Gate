import * as T from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import type { ArmouredBaymax } from './SolidArmour';

export const LATER_BAYMAX_SCALE = .79;
/** Bay 6 carries the original unit at scale 1. Its fitted appearances retain that world size. */
export const REGULATOR_WORLD_SCALE = 1;

/** Later chapters reuse the existing asset; this never changes the opening's rig or materials. */
export function configureLaterArmour(suit: ArmouredBaymax) {
  if (suit.isSingleRig) return () => {};
  const redPaint = new T.Color('#b0121c'), purplePaint = new T.Color('#5b2b8c');
  const redundant: T.Object3D[] = [];
  const jointGeometry = new T.SphereGeometry(.29, 20, 16);
  const jointMaterial = new T.MeshStandardMaterial({ color: '#681b28', metalness: .12, roughness: .7 });
  const jointCores: T.Mesh[] = [];
  suit.drive({});
  for (const side of ['L', 'R']) {
    const foot = suit.root.getObjectByName(T.PropertyBinding.sanitizeNodeName(`Armor_Foot.${side}`));
    const shin = suit.root.getObjectByName(T.PropertyBinding.sanitizeNodeName(`Armor_L_Leg.${side}`));
    if (foot && shin && foot.parent !== shin) shin.attach(foot);
    // The imported shoulder shells are open at the inner edge. The skin underneath reads as
    // a black cavity when the arm rolls back in the lying pose. A rounded, recessed joint
    // follows each upper-arm bone and keeps that edge solid without changing the live rig.
    const upperArm = suit.root.getObjectByName(T.PropertyBinding.sanitizeNodeName(`Armor_U_Arm.${side}`));
    if (upperArm) {
      const core = new T.Mesh(jointGeometry, jointMaterial);
      core.name = `shoulder-core-${side}`;
      core.position.y = -.08;
      core.scale.set(.95, 1.15, 1);
      upperArm.add(core);
      jointCores.push(core);
    }
  }
  suit.root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    // The supplied model audit identifies these as a duplicate face and a coplanar visor.
    // Remove only those redundant surfaces from this instance; keep the live skeleton intact.
    if (o.name.endsWith('-WHITE_noTexture') || o.name.endsWith('-TRANSPARENT')) redundant.push(o);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshPhysicalMaterial && !m.transparent) {
      // The source armour and inner suit are open shells: their inner faces must remain solid
      // when a shoulder, elbow or chest turns toward the camera.
      m.side = T.DoubleSide;
      m.clearcoat = Math.min(m.clearcoat, .1); m.clearcoatRoughness = .55;
      m.roughness = Math.max(m.roughness, m.metalness > .7 ? .36 : .5); m.envMapIntensity = .55;
      // Compatible finish from the supplied polished-model reference, on the live rig.
      if (m.color.equals(redPaint)) { m.metalness = .15; m.roughness = .52; m.clearcoat = 0; }
      if (m.color.equals(purplePaint)) { m.metalness = .12; m.roughness = .55; m.clearcoat = 0; }
    }
  });
  redundant.forEach(o => o.removeFromParent());
  return () => {
    jointCores.forEach(core => core.removeFromParent());
    jointGeometry.dispose(); jointMaterial.dispose();
  };
}

/**
 * Exact surface contacts from the rendered mesh, including skinned boots, hands and back plates.
 * Weld duplicate UV/material vertices once. Runtime uses reusable vectors and the existing bones;
 * no full scene bounds, physics, geometry allocation or hidden white-shell approximation.
 */
export function createSurfaceContact(source: T.Object3D | T.Mesh[]) {
  const meshes: T.Mesh[] = [];
  if (Array.isArray(source)) meshes.push(...source);
  else source.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
  const entries = meshes.filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => !m.transparent || m.opacity > .9)).map(mesh => {
    const p = mesh.geometry.getAttribute('position'), si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
    const seen = new Set<string>(), groups = new Map<string, { point: T.Vector3; index: number }[]>();
    for (let i = 0; i < p.count; i++) {
      let key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
      if (si && sw) key += `/${si.getX(i)},${si.getY(i)},${si.getZ(i)},${si.getW(i)}/${sw.getX(i)},${sw.getY(i)},${sw.getZ(i)},${sw.getW(i)}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Vertices with the same skin weights share one affine transform. Only their convex
        // hull can touch a plane, even after the bones move; interior vertices need no skinning.
        const skin = si && sw ? key.substring(key.indexOf('/')) : '';
        const group = groups.get(skin) ?? []; groups.set(skin, group);
        group.push({ point: new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)), index: i });
      }
    }
    const indices: number[] = [];
    for (const group of groups.values()) {
      if (group.length < 5) { indices.push(...group.map(v => v.index)); continue; }
      const hull = new ConvexHull().setFromPoints(group.map(v => v.point));
      if (!hull.faces.length) { indices.push(...group.map(v => v.index)); continue; }
      const outer = new Set<T.Vector3>();
      for (const face of hull.faces) { let edge = face.edge; do { outer.add(edge.head().point); edge = edge.next; } while (edge !== face.edge); }
      for (const v of group) if (outer.has(v.point)) indices.push(v.index);
    }
    return { mesh, indices: Uint32Array.from(indices) };
  });
  const v = new T.Vector3(), base = new T.Vector3(), skinned = new T.Vector3();
  const skeletons = new Map<T.Skeleton, T.Matrix4[]>();
  for (const { mesh } of entries) if (mesh instanceof T.SkinnedMesh && !skeletons.has(mesh.skeleton)) skeletons.set(mesh.skeleton, mesh.skeleton.bones.map(() => new T.Matrix4()));
  return {
    points: entries.reduce((n, e) => n + e.indices.length, 0),
    correction(plane: number, floor?: (x: number, z: number) => number) {
      let delta = -Infinity;
      for (const [skeleton, matrices] of skeletons) matrices.forEach((matrix, i) => matrix.multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i]));
      for (const { mesh, indices } of entries) {
        if (!mesh.visible) continue;
        const position = mesh.geometry.getAttribute('position');
        const skin = mesh instanceof T.SkinnedMesh ? mesh : null;
        const si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
        for (const i of indices) {
          v.fromBufferAttribute(position, i);
          if (skin) {
            base.copy(v).applyMatrix4(skin.bindMatrix); v.set(0, 0, 0);
            const matrices = skeletons.get(skin.skeleton)!;
            for (let j = 0; j < 4; j++) { const weight = sw.getComponent(i, j); if (weight) v.addScaledVector(skinned.copy(base).applyMatrix4(matrices[si.getComponent(i, j)]), weight); }
            v.applyMatrix4(skin.bindMatrixInverse);
          }
          v.applyMatrix4(mesh.matrixWorld);
          delta = Math.max(delta, (floor ? floor(v.x, v.z) : plane) - v.y);
        }
      }
      return Number.isFinite(delta) ? delta : 0;
    },
  };
}
