import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import type { ArmouredBaymax } from './SolidArmour';

export const LATER_BAYMAX_SCALE = 0.79;
/** Bay 6 carries the original unit at scale 1. Its fitted appearances retain that world size. */
export const REGULATOR_WORLD_SCALE = 1;

/** Later chapters reuse the existing asset; this never changes the opening's rig or materials. */
export function configureLaterArmour(suit: ArmouredBaymax) {
  if (suit.isSingleRig) return () => {};
  const redPaint = new THREE.Color('#b0121c'),
    purplePaint = new THREE.Color('#5b2b8c');
  const redundant: THREE.Object3D[] = [];
  const jointGeometry = new THREE.SphereGeometry(0.29, 20, 16);
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: '#681b28',
    metalness: 0.12,
    roughness: 0.7,
  });
  const jointCores: THREE.Mesh[] = [];
  suit.drive({});
  for (const side of ['L', 'R']) {
    const foot = suit.root.getObjectByName(
      THREE.PropertyBinding.sanitizeNodeName(`Armor_Foot.${side}`),
    );
    const shin = suit.root.getObjectByName(
      THREE.PropertyBinding.sanitizeNodeName(`Armor_L_Leg.${side}`),
    );
    if (foot && shin && foot.parent !== shin) shin.attach(foot);
    // The imported shoulder shells are open at the inner edge. The skin underneath reads as
    // a black cavity when the arm rolls back in the lying pose. A rounded, recessed joint
    // follows each upper-arm bone and keeps that edge solid without changing the live rig.
    const upperArm = suit.root.getObjectByName(
      THREE.PropertyBinding.sanitizeNodeName(`Armor_U_Arm.${side}`),
    );
    if (upperArm) {
      const core = new THREE.Mesh(jointGeometry, jointMaterial);
      core.name = `shoulder-core-${side}`;
      core.position.y = -0.08;
      core.scale.set(0.95, 1.15, 1);
      upperArm.add(core);
      jointCores.push(core);
    }
  }
  suit.root.traverse((sceneObject) => {
    if (!(sceneObject instanceof THREE.Mesh)) return;
    // The supplied model audit identifies these as a duplicate face and a coplanar visor.
    // Remove only those redundant surfaces from this instance; keep the live skeleton intact.
    if (
      sceneObject.name.endsWith('-WHITE_noTexture') ||
      sceneObject.name.endsWith('-TRANSPARENT')
    )
      redundant.push(sceneObject);
    for (const mesh of Array.isArray(sceneObject.material)
      ? sceneObject.material
      : [sceneObject.material])
      if (mesh instanceof THREE.MeshPhysicalMaterial && !mesh.transparent) {
        // The source armour and inner suit are open shells: their inner faces must remain solid
        // when a shoulder, elbow or chest turns toward the camera.
        mesh.side = THREE.DoubleSide;
        mesh.clearcoat = Math.min(mesh.clearcoat, 0.1);
        mesh.clearcoatRoughness = 0.55;
        mesh.roughness = Math.max(
          mesh.roughness,
          mesh.metalness > 0.7 ? 0.36 : 0.5,
        );
        mesh.envMapIntensity = 0.55;
        // Compatible finish from the supplied polished-model reference, on the live rig.
        if (mesh.color.equals(redPaint)) {
          mesh.metalness = 0.15;
          mesh.roughness = 0.52;
          mesh.clearcoat = 0;
        }
        if (mesh.color.equals(purplePaint)) {
          mesh.metalness = 0.12;
          mesh.roughness = 0.55;
          mesh.clearcoat = 0;
        }
      }
  });
  redundant.forEach((sceneObject) => sceneObject.removeFromParent());
  return () => {
    jointCores.forEach((core) => core.removeFromParent());
    jointGeometry.dispose();
    jointMaterial.dispose();
  };
}

/**
 * Exact surface contacts from the rendered mesh, including skinned boots, hands and back plates.
 * Weld duplicate UV/material vertices once. Runtime uses reusable vectors and the existing bones;
 * no full scene bounds, physics, geometry allocation or hidden white-shell approximation.
 */
export function createSurfaceContact(source: THREE.Object3D | THREE.Mesh[]) {
  const meshes: THREE.Mesh[] = [];
  if (Array.isArray(source)) meshes.push(...source);
  else
    source.traverse((sceneObject) => {
      if (sceneObject instanceof THREE.Mesh) meshes.push(sceneObject);
    });
  const entries = meshes
    .filter((mesh) =>
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(
        (material) => !material.transparent || material.opacity > 0.9,
      ),
    )
    .map((mesh) => {
      const point = mesh.geometry.getAttribute('position'),
        si = mesh.geometry.getAttribute('skinIndex'),
        sw = mesh.geometry.getAttribute('skinWeight');
      const seen = new Set<string>(),
        groups = new Map<string, { point: THREE.Vector3; index: number }[]>();
      for (let index = 0; index < point.count; index++) {
        let key = `${point.getX(index)},${point.getY(index)},${point.getZ(index)}`;
        if (si && sw)
          key += `/${si.getX(index)},${si.getY(index)},${si.getZ(index)},${si.getW(index)}/${sw.getX(index)},${sw.getY(index)},${sw.getZ(index)},${sw.getW(index)}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Vertices with the same skin weights share one affine transform. Only their convex
          // hull can touch a plane, even after the bones move; interior vertices need no skinning.
          const skin = si && sw ? key.substring(key.indexOf('/')) : '';
          const group = groups.get(skin) ?? [];
          groups.set(skin, group);
          group.push({
            point: new THREE.Vector3(
              point.getX(index),
              point.getY(index),
              point.getZ(index),
            ),
            index: index,
          });
        }
      }
      const indices: number[] = [];
      for (const group of groups.values()) {
        if (group.length < 5) {
          indices.push(...group.map((vector) => vector.index));
          continue;
        }
        const hull = new ConvexHull().setFromPoints(
          group.map((vector) => vector.point),
        );
        if (!hull.faces.length) {
          indices.push(...group.map((vector) => vector.index));
          continue;
        }
        const outer = new Set<THREE.Vector3>();
        for (const face of hull.faces) {
          let edge = face.edge;
          do {
            outer.add(edge.head().point);
            edge = edge.next;
          } while (edge !== face.edge);
        }
        for (const vector2 of group)
          if (outer.has(vector2.point)) indices.push(vector2.index);
      }
      return { mesh, indices: Uint32Array.from(indices) };
    });
  const vector3 = new THREE.Vector3(),
    base = new THREE.Vector3(),
    skinned = new THREE.Vector3();
  const skeletons = new Map<THREE.Skeleton, THREE.Matrix4[]>();
  for (const { mesh } of entries)
    if (mesh instanceof THREE.SkinnedMesh && !skeletons.has(mesh.skeleton))
      skeletons.set(
        mesh.skeleton,
        mesh.skeleton.bones.map(() => new THREE.Matrix4()),
      );
  return {
    points: entries.reduce(
      (count, material) => count + material.indices.length,
      0,
    ),
    correction(
      plane: number,
      floor?: (xPosition: number, zPosition: number) => number,
    ) {
      let delta = -Infinity;
      for (const [skeleton, matrices] of skeletons)
        matrices.forEach((matrix, index) =>
          matrix.multiplyMatrices(
            skeleton.bones[index].matrixWorld,
            skeleton.boneInverses[index],
          ),
        );
      for (const { mesh, indices } of entries) {
        if (!mesh.visible) continue;
        const position = mesh.geometry.getAttribute('position');
        const skin = mesh instanceof THREE.SkinnedMesh ? mesh : null;
        const si = mesh.geometry.getAttribute('skinIndex'),
          sw = mesh.geometry.getAttribute('skinWeight');
        for (const index2 of indices) {
          vector3.fromBufferAttribute(position, index2);
          if (skin) {
            base.copy(vector3).applyMatrix4(skin.bindMatrix);
            vector3.set(0, 0, 0);
            const matrices = skeletons.get(skin.skeleton)!;
            for (let segmentIndex = 0; segmentIndex < 4; segmentIndex++) {
              const weight = sw.getComponent(index2, segmentIndex);
              if (weight)
                vector3.addScaledVector(
                  skinned
                    .copy(base)
                    .applyMatrix4(
                      matrices[si.getComponent(index2, segmentIndex)],
                    ),
                  weight,
                );
            }
            vector3.applyMatrix4(skin.bindMatrixInverse);
          }
          vector3.applyMatrix4(mesh.matrixWorld);
          delta = Math.max(
            delta,
            (floor ? floor(vector3.x, vector3.z) : plane) - vector3.y,
          );
        }
      }
      return Number.isFinite(delta) ? delta : 0;
    },
  };
}
