import * as THREE from 'three';
import {
  SceneKit,
  ease,
  seeded,
  type ScenePlacement,
} from '../../phase2/SceneKit';
import { VectorTrace } from '../../systems/afterimage/VectorTrace';
import type { PhaseTwoDirector } from '../../phase2/model';

/**
 * Build the legacy fracture set and its authored update/cleanup callbacks.
 */
export function createFracture(director: PhaseTwoDirector) {
  const sceneKit = new SceneKit('11 / THE FRACTURE');
  const random = seeded(1105);
  // A broken street is our sole frame of reference. The composition opens into absence.
  sceneKit.box(
    { p: [-1, -1.35, 5], s: [16, 0.65, 24], r: [0, 0.13, -0.025] },
    sceneKit.edge,
  );
  sceneKit.box(
    { p: [-1, -0.99, 5], s: [15.8, 0.05, 23.6], r: [0, 0.13, -0.025] },
    sceneKit.dark,
  );
  const roadMarks: ScenePlacement[] = [];
  for (let index = 0; index < 7; index++)
    roadMarks.push({
      p: [-0.5, -0.93, 13 - index * 3.1],
      s: [0.09, 0.02, 1.4],
      r: [0, 0.13, 0],
    });
  sceneKit.instances(roadMarks, sceneKit.metal);
  const rails: ScenePlacement[] = [];
  for (let index2 = 0; index2 < 10; index2++) {
    rails.push({ p: [-8.2, -0.14, 10 - index2 * 2], s: [0.055, 1.55, 0.055] });
  }
  rails.push({ p: [-8.2, 0.55, 1], s: [0.06, 0.06, 20] });
  sceneKit.instances(rails, sceneKit.metal);
  const bodies: ScenePlacement[] = [],
    edges: ScenePlacement[] = [],
    windows: ScenePlacement[] = [];
  for (let index3 = 0; index3 < 16; index3++) {
    const side = index3 % 2 ? 1 : -1,
      xPosition = side * (18 + random() * 32),
      zPosition = -22 - random() * 145,
      yPosition = -18 + random() * 50,
      width = 5 + random() * 9,
      height = 10 + random() * 24;
    const rotation = new THREE.Euler(
      (random() - 0.5) * 0.8,
      (random() - 0.5) * 0.6,
      index3 < 4 ? side * 0.65 : (random() - 0.5) * 0.3,
    );
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(xPosition, yPosition, zPosition),
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(1, 1, 1),
    );
    bodies.push({
      p: [xPosition, yPosition, zPosition],
      s: [width, height, 6],
      r: [rotation.x, rotation.y, rotation.z],
    });
    const local = (
      px: number,
      py: number,
      pz: number,
    ): [number, number, number] =>
      new THREE.Vector3(px, py, pz).applyMatrix4(transform).toArray() as [
        number,
        number,
        number,
      ];
    for (let row = 0; row < Math.floor(height / 2); row++) {
      edges.push({
        p: local(0, -height / 2 + row * 2, 3.08),
        s: [width + 0.15, 0.07, 0.12],
        r: [rotation.x, rotation.y, rotation.z],
      });
      for (let col = 0; col < 3; col++)
        windows.push({
          p: local((col - 1) * width * 0.24, -height / 2 + row * 2 + 0.7, 3.12),
          s: [width * 0.14, 1, 0.02],
          r: [rotation.x, rotation.y, rotation.z],
        });
    }
  }
  sceneKit.instances(bodies, sceneKit.concrete);
  sceneKit.instances(edges, sceneKit.edge);
  sceneKit.instances(windows, sceneKit.dim);
  // Incomplete bridge, vertical asphalt, window frames existing without walls.
  sceneKit.box(
    { p: [-24, 11, -51], s: [36, 0.7, 5], r: [0, 0.2, -0.22] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [17, 8, -36], s: [5, 0.5, 27], r: [0.95, 0, 0.4] },
    sceneKit.edge,
  );
  const loose: ScenePlacement[] = [];
  for (let index4 = 0; index4 < 24; index4++) {
    const xPosition2 = 11 + (index4 % 4) * 1.4,
      yPosition2 = 6 + Math.floor(index4 / 4) * 1.6;
    loose.push({
      p: [xPosition2, yPosition2, -23],
      s: [1.1, 0.04, 0.05],
      r: [0, 0.18, 0.16],
    });
    loose.push({
      p: [xPosition2 - 0.53, yPosition2 + 0.65, -23],
      s: [0.04, 1.3, 0.05],
      r: [0, 0.18, 0.16],
    });
  }
  sceneKit.instances(loose, sceneKit.metal);
  const fragment = new THREE.Group();
  fragment.position.set(4.9, 2.7, -14);
  sceneKit.root.add(fragment);
  sceneKit.box(
    { p: [0, 0, 0], s: [3.2, 4.8, 1.3] },
    sceneKit.concrete,
    fragment,
  );
  sceneKit.box(
    { p: [0, 0, 0.7], s: [3.3, 0.12, 0.15] },
    sceneKit.metal,
    fragment,
  );
  sceneKit.label(
    '通行止 / NO THROUGH ROAD',
    { p: [-5, 2.3, -9], r: [0, 0.2, -0.2] },
    4.5,
  );
  sceneKit.haze({ p: [-8, 5, -55], s: [65, 30, 1] }, '#48829e', 0.2);
  sceneKit.haze({ p: [27, 17, -85], s: [52, 60, 1] }, '#43416b', 0.09);
  const scar = new VectorTrace(
    new THREE.Vector3(-4, 1.1, -5),
    new THREE.Vector3(8.5, 5.4, -55),
  );
  sceneKit.root.add(scar.root);
  const diagnosis = sceneKit.label(
    'ATTACK VECTOR // 01    SOURCE // BM-01\nTARGET // HIRO     DISPLACEMENT // +18.7\nLOCAL STABILITY // 3.2 SEC',
    { p: [-0.2, 3.4, -13], r: [0, -0.12, -0.08] },
    8.8,
  );
  diagnosis.visible = false;
  const red = sceneKit.mesh(sceneKit.sphereGeo, sceneKit.basic('#e23c40', 4), {
    p: [-13, 9, -105],
    s: [0.16, 0.16, 0.16],
  });
  red.visible = false;
  const debrisPos: ScenePlacement[] = [];
  for (let index5 = 0; index5 < 50; index5++)
    debrisPos.push({
      p: [(random() - 0.5) * 45, -8 + random() * 25, -5 - random() * 60],
      s: [0.04 + random() * 0.13, 0.04, 0.08],
      r: [random(), random(), random()],
    });
  const debris = sceneKit.instances(debrisPos, sceneKit.metal);
  let releaseTime = 0;
  return {
    root: sceneKit.root,
    scar,
    update(time: number, deltaSeconds: number) {
      const state = director.getSnapshot();
      const stored = state.stored;
      fragment.position.y = 2.7 + Math.sin(time * 0.22) * 0.17;
      releaseTime = stored ? Math.min(0.28, releaseTime + deltaSeconds) : 0;
      const release = ease(0, 0.28, releaseTime);
      // Recording ends with a discontinuous local slip: the trace was holding it in place.
      fragment.rotation.z = Math.sin(time * 0.13) * 0.025 + release * 0.31;
      fragment.position.x = 4.9 + release * 1.1;
      scar.opacity(
        state.stage === 'fracture'
          ? 0.28
          : stored
            ? Math.max(0.12, 1 - release)
            : 0.85,
      );
      diagnosis.visible = state.scanning;
      debris.rotation.y = Math.sin(time * 0.035) * 0.025;
      red.visible = stored && Math.sin(time * 0.43) > 0.42;
      red.position.x = Math.sin(time * 0.19) > 0 ? -13 : 25;
    },
    dispose() {
      scar.dispose();
      sceneKit.dispose();
    },
  };
}
