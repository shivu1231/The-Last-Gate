import {
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three';
import { createArmouredBaymax, mountArmour } from '../characters/SolidArmour';
import { Euler, Quaternion, type Object3D } from 'three';
import { assets } from '../systems/AssetManager';
import { mountChestBay } from '../characters/ChestBay';
import { createDistrict } from './district';
import type { JourneyWorld } from './journey';
import { LATER_BAYMAX_SCALE } from '../characters/LaterBaymax';

/**
 * Build the recovery district and place the same Baymax shell against its backstop.
 */
export async function createHarbourWorld(): Promise<JourneyWorld> {
  const model = await assets.cloneBaymax();
  const district = createDistrict();
  const meshes: Mesh[] = [];
  model.traverse((sceneObject) => {
    if (sceneObject instanceof Mesh) {
      sceneObject.castShadow = true;
      sceneObject.receiveShadow = true;
      meshes.push(sceneObject);
    }
  });
  for (const side of [-1, 1]) {
    const hip = new Group();
    hip.name = side < 0 ? 'hip-left' : 'hip-right';
    hip.position.set(side * 0.53, 0.55, 0.28);
    model.add(hip);
    model.updateMatrixWorld(true);
    for (const mesh of meshes) {
      const position = mesh.position,
        scaleX = side * position.x;
      const thigh =
        Math.abs(scaleX - 0.57) < 0.06 && Math.abs(position.y - 0.48) < 0.06;
      const foot =
        Math.abs(scaleX - 0.71) < 0.06 &&
        (Math.abs(position.y - 0.26) < 0.06 ||
          Math.abs(position.y - 0.04) < 0.06) &&
        position.z > 1.2;
      if (thigh || foot) hip.attach(mesh);
    }
    hip.rotation.set(1.08, 0, side * 0.035);
  }
  // He came down hard against the fallen service framing: pelvis low, shoulders
  // caught on the slab, legs forward and bent instead of lying flat like a prop.
  model.rotation.order = 'YXZ';
  model.rotation.set(-Math.PI / 3, -0.5, -0.035);
  model.scale.setScalar(LATER_BAYMAX_SCALE);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model),
    center = bounds.getCenter(new Vector3()),
    startPoint = district.baymaxAnchor;
  model.position.set(
    startPoint.x - center.x,
    -1.02 - bounds.min.y,
    startPoint.z - center.z,
  );
  model.updateMatrixWorld(true);
  const hips = model.children.filter((sceneObject) =>
    sceneObject.name.startsWith('hip-'),
  );
  const bay = mountChestBay(model);
  // He's been on the combat chip since the opening: armoured (tracker PW-03). The suit is posed from
  // this rig's hips; the white body hides (the chest bay stays) and he's re-seated on the suit's shape.
  const armoured = await createArmouredBaymax({
    shell: model,
    hole: () =>
      bay.holeOpen
        ? (bay.root.getObjectByName('dock')?.getWorldPosition(new Vector3()) ??
          null)
        : null,
  });
  mountArmour(armoured, model, { y: 0.55, z: 0.28 }, 2.42);
  const legQ = (sceneObject: Object3D | undefined) =>
    sceneObject
      ? new Quaternion().setFromEuler(
          new Euler(sceneObject.rotation.x - 1.42, 0, sceneObject.rotation.z),
        )
      : undefined;
  armoured.set(1);
  armoured.drive({
    legL: legQ(hips.find((sceneObject) => sceneObject.name === 'hip-right')),
    legR: legQ(hips.find((sceneObject) => sceneObject.name === 'hip-left')),
  });
  // The chest bay sits in the suit's plating, not floating where the white chest was (tracker N-03).
  armoured.seatOnPlate(bay.root, 0.2, 0.2, 0.235, 1.2);
  model.updateMatrixWorld(true);
  model.position.y += -1.02 - new Box3().setFromObject(model, true).min.y;
  model.updateMatrixWorld(true);
  const backstop = district.group.getObjectByName('recovery-backstop');
  if (backstop) {
    backstop.position.copy(model.localToWorld(new Vector3(0, 1.63, -0.76)));
    backstop.quaternion.copy(model.quaternion);
    backstop.scale.set(2.05, 1.65, 0.46).multiplyScalar(LATER_BAYMAX_SCALE);
  }
  const red = new PointLight('#ff3626', 0.35, 3.5, 2);
  red.position.set(0.42, 2.2, 0.9);
  model.add(red);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const drawingContext = canvas.getContext('2d')!,
    gradient = drawingContext.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.6)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  drawingContext.fillStyle = gradient;
  drawingContext.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas),
    material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
  const shadow = new Mesh(new PlaneGeometry(4.6, 5.6), material);
  shadow.rotation.set(-Math.PI / 2, 0, -0.5);
  shadow.position.set(startPoint.x, -1.008, startPoint.z);
  district.group.add(shadow);
  const disposeDistrict = district.dispose;
  district.dispose = () => {
    armoured.dispose();
    texture.dispose();
    material.dispose();
    shadow.geometry.dispose();
    disposeDistrict();
  };
  return { baymax: model, bay, district, armoured };
}

let prepared: Promise<JourneyWorld> | null = null;
/**
 * Share preparation of the recovery world before the opening handoff.
 */
export function preloadHarbour() {
  prepared ??= createHarbourWorld().catch((error) => {
    prepared = null;
    throw error;
  });
  return prepared;
}
/**
 * Return the prepared recovery world or start its existing build path.
 */
export function takeHarbour() {
  const world = prepared ?? createHarbourWorld();
  prepared = null;
  return world;
}
