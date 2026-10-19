import { Group, type Light, type Object3D, type Scene } from 'three';

/**
 * Keep every light in a scene counted, whatever is hidden (tracker R-01).
 *
 * three.js builds each lit material's shader for the number of *visible* lights, so a light (or the
 * group holding it) switching visibility mid-sequence recompiles every material on the next frame,
 * which stalls the rupture for seconds. Pinned lights move into a rig that is always drawn; while
 * their own flag or any of their old ancestors is hidden they just shine at zero intensity, so the
 * count, and every program the boot warm-up compiled, stays the same from start to finish.
 */
export function pinLights(scene: Scene) {
  const pins: {
    light: Light;
    owner: Object3D;
    visible: boolean;
    intensity: number;
  }[] = [];
  scene.traverse((sceneObject) => {
    const camera = sceneObject as Light;
    if (camera.isLight && sceneObject.parent && sceneObject.parent !== scene)
      pins.push({
        light: camera,
        owner: sceneObject.parent,
        visible: true,
        intensity: 0,
      });
  });
  const rig = new Group();
  rig.name = 'light-pins';
  scene.add(rig);
  for (const camera2 of pins) {
    rig.add(camera2.light);
    camera2.light.matrixWorldAutoUpdate = false;
  }
  const shown = (sceneObject: Object3D) => {
    let sceneObject2: Object3D | null = sceneObject;
    while (sceneObject2) {
      if (!sceneObject2.visible) return false;
      if (sceneObject2 === scene) return true;
      sceneObject2 = sceneObject2.parent;
    }
    return false;
  };
  return {
    /** Call right before rendering: place each light from its old owner and dim the hidden ones. */
    before() {
      scene.updateMatrixWorld();
      for (const camera of pins) {
        camera.visible = camera.light.visible;
        camera.intensity = camera.light.intensity;
        if (!camera.visible || !shown(camera.owner)) camera.light.intensity = 0;
        camera.light.visible = true;
        camera.light.updateMatrix();
        camera.light.matrixWorld.multiplyMatrices(
          camera.owner.matrixWorld,
          camera.light.matrix,
        );
      }
    },
    /** Call right after rendering: hand the lights' own values back. */
    after() {
      for (const camera of pins) {
        camera.light.visible = camera.visible;
        camera.light.intensity = camera.intensity;
      }
    },
    dispose() {
      for (const camera of pins) {
        camera.light.matrixWorldAutoUpdate = true;
        camera.owner.add(camera.light);
      }
      rig.removeFromParent();
    },
  };
}
