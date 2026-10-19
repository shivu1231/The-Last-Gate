import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { JourneyWorld } from '../recovery/journey';
import { createInternals, type Internals } from './internals';

const prepared = new WeakMap<JourneyWorld, Internals>();

/**
 * Keep distant environmental lights out of the close engineering inspection work.
 */
export function muteDistantLights(world: JourneyWorld) {
  const muted: Object3D[] = [];
  for (const root of [world.district.group, world.baymax])
    root.traverse((object) => {
      if (!('isPointLight' in object) || !object.visible) return;
      for (let parent = object.parent; parent; parent = parent.parent)
        if (parent === world.bay.root) return;
      object.visible = false;
      muted.push(object);
    });
  return () => {
    muted.forEach((light) => {
      light.visible = true;
    });
  };
}

/** Prepare the real internals and both shell passes while the incoming Canvas is covered. */
export async function prepareEngineering(
  world: JourneyWorld,
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
) {
  if (prepared.has(world)) return;
  const internals = createInternals(world.baymax);
  prepared.set(world, internals);
  const materials = internals.shellMaterials([world.bay.root]);
  const originals = new Map(
    materials.map((material) => [
      material,
      {
        transparent: material.transparent,
        depthWrite: material.depthWrite,
        opacity: material.opacity,
      },
    ]),
  );
  const restoreLights = muteDistantLights(world);
  // compileAsync traverses materials, including the hidden internals; no ongoing render loop.
  try {
    await renderer.compileAsync(scene, camera);
    for (const material2 of materials) {
      material2.transparent = true;
      material2.forceSinglePass = true;
      material2.needsUpdate = true;
    }
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const [material3, original] of originals) {
      Object.assign(material3, original);
      material3.needsUpdate = true;
    }
    restoreLights();
    internals.root.visible = false;
  }
}

/**
 * Transfer the prepared engineering assembly to its active scene owner.
 */
export function claimInternals(world: JourneyWorld) {
  const internals = prepared.get(world) ?? createInternals(world.baymax);
  prepared.delete(world);
  return internals;
}

/**
 * Release engineering resources that were prepared but never claimed.
 */
export function disposePreparedEngineering(world: JourneyWorld) {
  prepared.get(world)?.dispose();
  prepared.delete(world);
}
