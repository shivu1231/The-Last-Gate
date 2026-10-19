import {
  LOD,
  Object3D,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { markShared } from './Disposal';

// Draw-call / memory discipline helpers.
//
// shared(): one geometry/material/texture per key across every chapter, so repeated
//           windows, debris and architecture share GPU resources and batch well.
//           Shared resources are skipped by scene cleanup (disposeObject).
// distanceLOD(): Baymax / city / debris levels by distance, with hysteresis.

const cache = new Map<string, BufferGeometry | Material | Texture>();

/**
 * Create and tag a reusable GPU resource for the shared cache.
 */
export function shared<T extends BufferGeometry | Material | Texture>(
  key: string,
  make: () => T,
): T {
  let resource = cache.get(key) as T | undefined;
  if (!resource) {
    resource = markShared(make());
    cache.set(key, resource);
  }
  return resource;
}
export const sharedResourceCount = () => cache.size;

/** Free everything shared — only on full experience teardown. */
export function disposeSharedResources() {
  for (const resource of cache.values()) resource.dispose();
  cache.clear();
}

/**
 * levels: [object, distance] pairs from detailed to coarse. `null` hides the object
 * beyond that distance (silhouette background can be a separate cheap mesh).
 */
export function distanceLOD(
  levels: Array<[Object3D | null, number]>,
  hysteresis = 0.1,
) {
  const lod = new LOD();
  for (const [object, distance] of levels)
    lod.addLevel(object ?? new Object3D(), distance, hysteresis);
  lod.autoUpdate = true;
  return lod;
}
