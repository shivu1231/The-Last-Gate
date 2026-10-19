import type { Material, Object3D, Texture } from 'three';

// Resources tagged shared (see SharedResources) are never disposed by a scene teardown.
const SHARED = Symbol('lattice.shared');
/**
 * Resource metadata used to protect shared GPU allocations.
 */
type SharedResourceTag = { [SHARED]?: true };

/**
 * Mark a GPU resource as shared so scene-local cleanup does not dispose another owner's data.
 */
export function markShared<T extends object>(resource: T): T {
  (resource as SharedResourceTag)[SHARED] = true;
  return resource;
}
export const isShared = (resource: object) =>
  (resource as SharedResourceTag)[SHARED] === true;

/**
 * Dispose a material and its owned textures using the existing shared-resource rules.
 */
function disposeMaterial(material: Material, seen: Set<object>) {
  if (seen.has(material) || isShared(material)) return;
  seen.add(material);
  for (const value of Object.values(material)) {
    const texture = value as Texture | null;
    if (
      texture &&
      typeof texture === 'object' &&
      (texture as Texture).isTexture &&
      !seen.has(texture) &&
      !isShared(texture)
    ) {
      seen.add(texture);
      texture.dispose();
    }
  }
  material.dispose();
}

/** Deep-dispose geometry, materials and textures under an object, skipping shared resources. */
export function disposeObject(root: Object3D) {
  const seen = new Set<object>();
  root.traverse((object) => {
    const node = object as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
      dispose?: () => void;
    };
    if (node.geometry && !seen.has(node.geometry) && !isShared(node.geometry)) {
      seen.add(node.geometry);
      node.geometry.dispose();
    }
    if (node.material)
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        disposeMaterial(material, seen);
    // InstancedMesh / skeleton helpers
    if (
      typeof node.dispose === 'function' &&
      (node as { isInstancedMesh?: boolean }).isInstancedMesh
    )
      node.dispose();
  });
}
