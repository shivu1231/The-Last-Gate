import * as T from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';
import { createFacility } from '../phase5/facility';

/**
 * Back at the telemetry relay, the moment Phase 5 left it: lights on, the trace still drawn into
 * the sky. Outside the blown-out back wall is the yard where Baymax followed Hiro and sat down
 * under the limit; the service road runs off it into the city.
 */
// Centred in the yard between its rails, far enough back that his reach stops short of the wall.
export const BAYMAX_YARD = new T.Vector3(.6, 0, -11.5);
/** How far toward the relay he gets under the limit before the punch: still outside the back wall. */
export const BAYMAX_REACH_Z = -10.3;
/** The relay's recorder: a rack beside the consoles, the RX/06 capture in its slot on top. */
export const RECORDER = new T.Vector3(2.55, 0, -4.35);
export const RELAY_STATE = { powered: true, leads: 3, snr: 12, az: 212, el: 38, strength: 100, traced: true, breakers: [true, true, false, false] };

export function createRelay() {
  const facility = createFacility();
  const k = new SceneKit('phase6-yard');
  const random = seeded(7117), rand = (a: number, b: number) => a + random() * (b - a);
  // Yard: hard standing outside the back wall, a fence line, crates and a road out.
  const fence = k.standard('#2f3b40', .6, .55);
  k.box({ p: [0, -.2, -24], s: [30, .4, 34] }, k.concrete);
  k.box({ p: [0, .005, -24], s: [6, .02, 34] }, k.edge);
  for (const side of [-1, 1]) for (let z = -9; z > -40; z -= 3) {
    k.box({ p: [side * 12, 1.1, z], s: [.08, 2.2, .08] }, k.metal);
    if (random() > .3) k.box({ p: [side * 12, 1.6, z - 1.5], s: [.03, 1.2, 3], r: [0, 0, side * rand(-.08, .08)] }, fence);
  }
  for (const [x, z, r] of [[-5.2, -9.6, .2], [-6.4, -10.8, -.3], [5.8, -11, .5], [4.4, -18, 0]]) k.box({ p: [x, .45, z], s: [1.1, .9, 1.1], r: [0, r, 0] }, random() > .5 ? k.ivory : k.metal);
  // He sat down against an old cable drum.
  // Keep the fallen drum off the sightline from the relay entrance to Baymax.
  k.mesh(k.ownGeometry(new T.CylinderGeometry(1.1, 1.1, 1.3, 24)), k.dark, { p: [-5.5, 1.1, BAYMAX_YARD.z - 3], r: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 6; i++) k.box({ p: [rand(-8, 8), .08, rand(-30, -9)], s: [rand(.4, 1.4), .16, rand(.4, 1)], r: [0, rand(0, 3), 0] }, k.concrete);
  // A yard lamp (lit by the relay's own lights; no extra light of its own).
  k.mesh(k.ownGeometry(new T.SphereGeometry(.14, 12, 10)), k.basic('#ffc062', 1.6), { p: [5.4, 4.2, -8.9] });
  // This post used to sit exactly between Hiro's eye and the landing mark.
  k.box({ p: [8.2, 2.1, -8.9], s: [.12, 4.2, .12] }, k.metal);
  // The recorder rack, with a slot lip on top where the capture cartridge sits.
  k.box({ p: [RECORDER.x, .5, RECORDER.z], s: [.46, 1, .38] }, k.dark);
  k.box({ p: [RECORDER.x, 1.015, RECORDER.z], s: [.5, .03, .42] }, k.metal);
  k.box({ p: [RECORDER.x, .78, RECORDER.z + .195], s: [.3, .05, .01] }, k.basic('#ffb066', 1.2));
  const root = new T.Group(); root.add(facility.root, k.root);
  return {
    root,
    update(t: number, dt: number) { facility.update(t, dt, RELAY_STATE); },
    dispose() { facility.dispose(); k.dispose(); root.removeFromParent(); },
  };
}
export type Relay = ReturnType<typeof createRelay>;
