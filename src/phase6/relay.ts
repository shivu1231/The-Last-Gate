import * as THREE from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';
import { createFacility } from '../phase5/facility';

/**
 * Back at the telemetry relay, the moment Phase 5 left it: lights on, the trace still drawn into
 * the sky. Outside the blown-out back wall is the yard where Baymax followed Hiro and sat down
 * under the limit; the service road runs off it into the city.
 */
// Centred in the yard between its rails, far enough back that his reach stops short of the wall.
export const BAYMAX_YARD = new THREE.Vector3(0.6, 0, -11.5);
/** How far toward the relay he gets under the limit before the punch: still outside the back wall. */
export const BAYMAX_REACH_Z = -10.3;
/** The relay's recorder: a rack beside the consoles, the RX/06 capture in its slot on top. */
export const RECORDER = new THREE.Vector3(2.55, 0, -4.35);
export const RELAY_STATE = {
  powered: true,
  leads: 3,
  snr: 12,
  az: 212,
  el: 38,
  strength: 100,
  traced: true,
  breakers: [true, true, false, false],
};

/**
 * Build relay for the final pursuit and restoration.
 */
export function createRelay() {
  const facility = createFacility();
  const sceneKit = new SceneKit('phase6-yard');
  const random = seeded(7117),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  // Yard: hard standing outside the back wall, a fence line, crates and a road out.
  const fence = sceneKit.standard('#2f3b40', 0.6, 0.55);
  sceneKit.box({ p: [0, -0.2, -24], s: [30, 0.4, 34] }, sceneKit.concrete);
  sceneKit.box({ p: [0, 0.005, -24], s: [6, 0.02, 34] }, sceneKit.edge);
  for (const side of [-1, 1])
    for (let zPosition = -9; zPosition > -40; zPosition -= 3) {
      sceneKit.box(
        { p: [side * 12, 1.1, zPosition], s: [0.08, 2.2, 0.08] },
        sceneKit.metal,
      );
      if (random() > 0.3)
        sceneKit.box(
          {
            p: [side * 12, 1.6, zPosition - 1.5],
            s: [0.03, 1.2, 3],
            r: [0, 0, side * randomBetween(-0.08, 0.08)],
          },
          fence,
        );
    }
  for (const [xPosition, zPosition2, radius] of [
    [-5.2, -9.6, 0.2],
    [-6.4, -10.8, -0.3],
    [5.8, -11, 0.5],
    [4.4, -18, 0],
  ])
    sceneKit.box(
      {
        p: [xPosition, 0.45, zPosition2],
        s: [1.1, 0.9, 1.1],
        r: [0, radius, 0],
      },
      random() > 0.5 ? sceneKit.ivory : sceneKit.metal,
    );
  // He sat down against an old cable drum.
  // Keep the fallen drum off the sightline from the relay entrance to Baymax.
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CylinderGeometry(1.1, 1.1, 1.3, 24)),
    sceneKit.dark,
    { p: [-5.5, 1.1, BAYMAX_YARD.z - 3], r: [0, 0, Math.PI / 2] },
  );
  for (let index = 0; index < 6; index++)
    sceneKit.box(
      {
        p: [randomBetween(-8, 8), 0.08, randomBetween(-30, -9)],
        s: [randomBetween(0.4, 1.4), 0.16, randomBetween(0.4, 1)],
        r: [0, randomBetween(0, 3), 0],
      },
      sceneKit.concrete,
    );
  // A yard lamp (lit by the relay's own lights; no extra light of its own).
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.SphereGeometry(0.14, 12, 10)),
    sceneKit.basic('#ffc062', 1.6),
    { p: [5.4, 4.2, -8.9] },
  );
  // This post used to sit exactly between Hiro's eye and the landing mark.
  sceneKit.box({ p: [8.2, 2.1, -8.9], s: [0.12, 4.2, 0.12] }, sceneKit.metal);
  // The recorder rack, with a slot lip on top where the capture cartridge sits.
  sceneKit.box(
    { p: [RECORDER.x, 0.5, RECORDER.z], s: [0.46, 1, 0.38] },
    sceneKit.dark,
  );
  sceneKit.box(
    { p: [RECORDER.x, 1.015, RECORDER.z], s: [0.5, 0.03, 0.42] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [RECORDER.x, 0.78, RECORDER.z + 0.195], s: [0.3, 0.05, 0.01] },
    sceneKit.basic('#ffb066', 1.2),
  );
  const root = new THREE.Group();
  root.add(facility.root, sceneKit.root);
  return {
    root,
    update(timeSeconds: number, deltaSeconds: number) {
      facility.update(timeSeconds, deltaSeconds, RELAY_STATE);
    },
    dispose() {
      facility.dispose();
      sceneKit.dispose();
      root.removeFromParent();
    },
  };
}
/**
 * Data contract used by the final pursuit and restoration.
 */
export type Relay = ReturnType<typeof createRelay>;
