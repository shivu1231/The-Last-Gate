import type { Material, Object3D, Texture } from 'three';

// Resources tagged shared (see SharedResources) are never disposed by a scene teardown.
const SHARED = Symbol('lattice.shared');
type Tagged = { [SHARED]?: true };

export function markShared<T extends object>(resource: T): T { (resource as Tagged)[SHARED] = true; return resource; }
export const isShared = (resource: object) => (resource as Tagged)[SHARED] === true;

function disposeMaterial(material: Material, seen: Set<object>) {
  if (seen.has(material) || isShared(material)) return;
  seen.add(material);
  for (const value of Object.values(material)) {
    const texture = value as Texture | null;
    if (texture && typeof texture === 'object' && (texture as Texture).isTexture && !seen.has(texture) && !isShared(texture)) {
      seen.add(texture); texture.dispose();
    }
  }
  material.dispose();
}

/** Deep-dispose geometry, materials and textures under an object, skipping shared resources. */
export function disposeObject(root: Object3D) {
  const seen = new Set<object>();
  root.traverse(object => {
    const node = object as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[]; dispose?: () => void };
    if (node.geometry && !seen.has(node.geometry) && !isShared(node.geometry)) { seen.add(node.geometry); node.geometry.dispose(); }
    if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) disposeMaterial(material, seen);
    // InstancedMesh / skeleton helpers
    if (typeof node.dispose === 'function' && (node as { isInstancedMesh?: boolean }).isInstancedMesh) node.dispose();
  });
}
