import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { JourneyWorld } from '../recovery/journey';
import { createInternals, type Internals } from './internals';

const prepared = new WeakMap<JourneyWorld, Internals>();

export function muteDistantLights(world: JourneyWorld) {
  const muted: Object3D[] = [];
  for (const root of [world.district.group, world.baymax]) root.traverse(object => {
    if (!('isPointLight' in object) || !object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (parent === world.bay.root) return;
    object.visible = false; muted.push(object);
  });
  return () => { muted.forEach(light => { light.visible = true; }); };
}

/** Prepare the real internals and both shell passes while the incoming Canvas is covered. */
export async function prepareEngineering(world: JourneyWorld, renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  if (prepared.has(world)) return;
  const internals = createInternals(world.baymax); prepared.set(world, internals);
  const materials = internals.shellMaterials([world.bay.root]);
  const originals = new Map(materials.map(m => [m, { transparent: m.transparent, depthWrite: m.depthWrite, opacity: m.opacity }]));
  const restoreLights = muteDistantLights(world);
  // compileAsync traverses materials, including the hidden internals; no ongoing render loop.
  try {
    await renderer.compileAsync(scene, camera);
    for (const m of materials) { m.transparent = true; m.forceSinglePass = true; m.needsUpdate = true; }
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const [m, original] of originals) { Object.assign(m, original); m.needsUpdate = true; }
    restoreLights(); internals.root.visible = false;
  }
}

export function claimInternals(world: JourneyWorld) {
  const internals = prepared.get(world) ?? createInternals(world.baymax); prepared.delete(world); return internals;
}

export function disposePreparedEngineering(world: JourneyWorld) {
  prepared.get(world)?.dispose(); prepared.delete(world);
}
