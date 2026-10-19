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
  const pins: { light: Light; owner: Object3D; visible: boolean; intensity: number }[] = [];
  scene.traverse(o => { const l = o as Light; if (l.isLight && o.parent && o.parent !== scene) pins.push({ light: l, owner: o.parent, visible: true, intensity: 0 }); });
  const rig = new Group(); rig.name = 'light-pins'; scene.add(rig);
  for (const p of pins) { rig.add(p.light); p.light.matrixWorldAutoUpdate = false; }
  const shown = (o: Object3D) => { let x: Object3D | null = o; while (x) { if (!x.visible) return false; if (x === scene) return true; x = x.parent; } return false; };
  return {
    /** Call right before rendering: place each light from its old owner and dim the hidden ones. */
    before() {
      scene.updateMatrixWorld();
      for (const p of pins) {
        p.visible = p.light.visible; p.intensity = p.light.intensity;
        if (!p.visible || !shown(p.owner)) p.light.intensity = 0;
        p.light.visible = true;
        p.light.updateMatrix(); p.light.matrixWorld.multiplyMatrices(p.owner.matrixWorld, p.light.matrix);
      }
    },
    /** Call right after rendering: hand the lights' own values back. */
    after() { for (const p of pins) { p.light.visible = p.visible; p.light.intensity = p.intensity; } },
    dispose() { for (const p of pins) { p.light.matrixWorldAutoUpdate = true; p.owner.add(p.light); } rig.removeFromParent(); },
  };
}
