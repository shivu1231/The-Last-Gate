import * as THREE from 'three';
import { BayKit, type Vector3Tuple } from './bayKit';
import {
  edgeWear,
  grain,
  grime,
  hazard,
  paint,
  rust,
  scratches,
  seeded,
  sign,
  wornPaint,
} from './canvasTex';
import { createLimiter, type Limiter } from './limiter';

/**
 * Bay 6, inside: the robotics maintenance hall at the end of the walk. Same world as every earlier
 * phase (slate architecture, cyan haze through high glazing, warm work lights, the displaced city
 * hanging beyond the back windows), dressed as a working bay abandoned mid-shift: an empty robot
 * cradle under a gantry crane, a tool wall and benches on the left, pallet racking on the right, a
 * mezzanine with a control booth at the back. The live street cable from the walk comes in under
 * the door and runs to the corner under the stairs, where crates hide a steel case. The power
 * regulator is inside it, still on charge.
 *
 * Hall: x −11…11, z 0 (door) … −34 (back wall), roof trusses at 8.6 m. Units are metres.
 */

export const EYE = 1.62;
/**
 * Data contract used by Bay 6 and its city approach.
 */
export type BayCameraView = { pos: Vector3Tuple; look: Vector3Tuple };
export const VIEWS = {
  gate: { pos: [4.7, EYE, -0.75], look: [1.5, 2.1, -11] },
  hub: { pos: [0.4, EYE, -4.6], look: [-0.5, 2.4, -18] },
  cradle: { pos: [5.4, EYE, -8.6], look: [2, 2.1, -15.4] },
  bench: { pos: [-7.3, EYE, -9.9], look: [-10.2, 1.05, -11.7] },
  toolwall: { pos: [-6.9, EYE, -15.3], look: [-11, 2.05, -17.2] },
  crates: { pos: [-5.6, EYE, -24.4], look: [-8.4, 0.7, -27.3] },
  box: { pos: [-7.75, 1.2, -26.5], look: [-9.3, 0.28, -27.4] },
} satisfies Record<string, BayCameraView>;
/** Where Hiro walks when he follows the cable: from the benches, down the left aisle, to the stairs. */
export const CABLE_WALK: Vector3Tuple[] = [
  [-7.3, EYE, -9.9],
  [-6.5, EYE, -13],
  [-6.3, EYE, -18],
  [-6.1, EYE, -22],
  [-5.6, EYE, -24.4],
];

/** The live street cable: in under the door, along the benches, to the case under the stairs. */
export const CABLE_PATH: Vector3Tuple[] = [
  [3.4, 0.05, 9],
  [3.3, 0.05, 4],
  [3.1, 0.05, 0.4],
  [2.6, 0.05, -1.4],
  [0.2, 0.05, -3.6],
  [-4.4, 0.05, -5.7],
  [-7.4, 0.05, -7.4],
  [-8.6, 0.05, -10.6],
  [-8.4, 0.05, -15],
  [-8.2, 0.05, -19.6],
  [-7.7, 0.05, -23.4],
  [-7.6, 0.05, -26.2],
  [-8.3, 0.08, -26.7],
  [-8.9, 0.22, -26.75],
];

/**
 * Data contract used by Bay 6 and its city approach.
 */
export type BayState = {
  cleared: number;
  latches: [boolean, boolean];
  lid: boolean;
  lift: number;
  charge: number;
};

const BOX_POS = new THREE.Vector3(-9.3, 0, -27.4);

/**
 * Build Bay 6, its interactive storage case, equipment and authored inspection views.
 */
export function createServiceBay() {
  const sceneKit = new BayKit('bay-6');
  const result = seeded(6606),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + result() * (endValue - startValue),
    pick = <X>(xs: X[]) => xs[Math.floor(result() * xs.length)];

  // ── Surfaces ───────────────────────────────────────────────────────────────────────────────
  const concreteTex = sceneKit.tex(
    paint(1024, 1024, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(11);
      drawingContext.fillStyle = '#4a545c';
      drawingContext.fillRect(0, 0, width, height);
      grime(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        40,
        '30,36,42',
        0.3,
      );
      grime(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        30,
        '120,130,138',
        0.12,
      );
      grain(drawingContext, width, height, rotationQuaternion, 60000, 0.16);
      // Hairline cracks and the slab joint along the tile border.
      drawingContext.strokeStyle = 'rgba(24,28,32,.55)';
      drawingContext.lineWidth = 1.3;
      for (let index = 0; index < 14; index++) {
        drawingContext.beginPath();
        let px = rotationQuaternion() * width,
          py = rotationQuaternion() * height;
        drawingContext.moveTo(px, py);
        for (let segmentIndex = 0; segmentIndex < 6; segmentIndex++) {
          px += (rotationQuaternion() - 0.5) * 90;
          py += (rotationQuaternion() - 0.5) * 90;
          drawingContext.lineTo(px, py);
        }
        drawingContext.stroke();
      }
      drawingContext.fillStyle = 'rgba(18,22,26,.9)';
      drawingContext.fillRect(0, 0, width, 5);
      drawingContext.fillRect(0, 0, 5, height);
      // Oil drips and tyre scuffs.
      for (let index2 = 0; index2 < 9; index2++) {
        const cx = rotationQuaternion() * width,
          cy = rotationQuaternion() * height,
          rr = 10 + rotationQuaternion() * 50,
          group = drawingContext.createRadialGradient(cx, cy, 0, cx, cy, rr);
        group.addColorStop(0, 'rgba(12,12,14,.55)');
        group.addColorStop(1, 'rgba(12,12,14,0)');
        drawingContext.fillStyle = group;
        drawingContext.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
    }),
  );
  const floorMat = sceneKit.std({
    map: sceneKit.repeat(concreteTex, 5, 8),
    bumpMap: sceneKit.repeat(concreteTex, 5, 8),
    bumpScale: 1.2,
    roughness: 0.86,
    metalness: 0.04,
  });
  const cladTex = sceneKit.tex(
    paint(512, 512, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(21);
      drawingContext.fillStyle = '#3d4b59';
      drawingContext.fillRect(0, 0, width, height);
      for (let index = 0; index < width; index += 32) {
        const group = drawingContext.createLinearGradient(
          index,
          0,
          index + 32,
          0,
        );
        group.addColorStop(0, 'rgba(255,255,255,.08)');
        group.addColorStop(0.35, 'rgba(0,0,0,.22)');
        group.addColorStop(0.5, 'rgba(255,255,255,.12)');
        group.addColorStop(1, 'rgba(0,0,0,.08)');
        drawingContext.fillStyle = group;
        drawingContext.fillRect(index, 0, 32, height);
      }
      grain(drawingContext, width, height, rotationQuaternion, 12000, 0.1);
      for (let index2 = 0; index2 < 30; index2++) {
        drawingContext.fillStyle = `rgba(14,18,22,${0.08 + rotationQuaternion() * 0.18})`;
        drawingContext.fillRect(
          rotationQuaternion() * width,
          0,
          2 + rotationQuaternion() * 6,
          height * (0.2 + rotationQuaternion() * 0.8),
        );
      }
      rust(drawingContext, width, height, rotationQuaternion, 6);
    }),
  );
  const plinthTex = sceneKit.tex(
    paint(512, 256, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(31);
      drawingContext.fillStyle = '#4a545c';
      drawingContext.fillRect(0, 0, width, height);
      grain(drawingContext, width, height, rotationQuaternion, 9000, 0.16);
      grime(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        12,
        '20,24,28',
        0.3,
      );
      const group = drawingContext.createLinearGradient(
        0,
        height * 0.5,
        0,
        height,
      );
      group.addColorStop(0, 'rgba(10,12,14,0)');
      group.addColorStop(1, 'rgba(10,12,14,.5)');
      drawingContext.fillStyle = group;
      drawingContext.fillRect(0, 0, width, height);
    }),
  );
  const treadTex = sceneKit.tex(
    paint(128, 128, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(41);
      drawingContext.fillStyle = '#6e767b';
      drawingContext.fillRect(0, 0, width, height);
      for (let index = 0; index < 4; index++)
        for (let segmentIndex = 0; segmentIndex < 4; segmentIndex++) {
          drawingContext.save();
          drawingContext.translate(index * 32 + 16, segmentIndex * 32 + 16);
          drawingContext.rotate((index + segmentIndex) % 2 ? 0.78 : -0.78);
          drawingContext.fillStyle = 'rgba(200,205,208,.5)';
          drawingContext.fillRect(-9, -2.5, 18, 5);
          drawingContext.fillStyle = 'rgba(0,0,0,.35)';
          drawingContext.fillRect(-9, 2.5, 18, 1.5);
          drawingContext.restore();
        }
      grain(drawingContext, width, height, rotationQuaternion, 900, 0.2);
    }),
  );
  const tread = sceneKit.std({
    map: treadTex,
    bumpMap: treadTex,
    bumpScale: 2,
    roughness: 0.45,
    metalness: 0.85,
  });
  tread.map!.wrapS = tread.map!.wrapT = THREE.RepeatWrapping;
  const clad = sceneKit.std({
    map: cladTex,
    bumpMap: cladTex,
    bumpScale: 1.5,
    roughness: 0.62,
    metalness: 0.5,
  });
  cladTex.wrapS = cladTex.wrapT = THREE.RepeatWrapping;
  const plinth = sceneKit.std({
    map: plinthTex,
    roughness: 0.9,
    metalness: 0.02,
  });
  plinthTex.wrapS = plinthTex.wrapT = THREE.RepeatWrapping;

  const worn = (
    base: string,
    seed: number,
    material: THREE.MeshStandardMaterialParameters = {},
    metal = '#c9c6bd',
  ) => {
    const timeSeconds = sceneKit.tex(
      wornPaint(base, seed, { metal, size: 256 }),
    );
    return sceneKit.std({
      map: timeSeconds,
      bumpMap: timeSeconds,
      bumpScale: 0.8,
      roughness: 0.6,
      metalness: 0.45,
      ...material,
    });
  };
  const steel = worn('#4c5c6a', 51),
    steelDark = worn('#27323c', 52, { roughness: 0.5 }),
    slate = worn('#3a4857', 53);
  const craneYellow = worn('#c49a24', 54, { metalness: 0.35 }, '#8c8a84'),
    rackYellow = worn('#b88f2a', 55, { metalness: 0.35 }, '#7b7a75');
  const rackBlue = worn('#33536a', 56),
    chestRed = worn('#7c2722', 57, { metalness: 0.5 }),
    chestTeal = worn('#2b5a64', 58, { metalness: 0.5 });
  const caseGreen = worn('#3f4b44', 59, { metalness: 0.55 }),
    panelGrey = worn('#7b858a', 60, { metalness: 0.4 });
  const chrome = sceneKit.std({
    color: '#b9c0c4',
    roughness: 0.26,
    metalness: 0.95,
  });
  const iron = sceneKit.std({
    color: '#2a2f33',
    roughness: 0.55,
    metalness: 0.8,
  });
  const rubber = sceneKit.std({
    color: '#141618',
    roughness: 0.85,
    metalness: 0,
  });
  const padRubber = sceneKit.std({
    color: '#22262a',
    roughness: 0.9,
    metalness: 0,
  });
  const woodTex = (seed: number, label: string) =>
    sceneKit.tex(
      paint(256, 256, (drawingContext, width, height) => {
        const rotationQuaternion = seeded(seed);
        drawingContext.fillStyle = '#8a6a46';
        drawingContext.fillRect(0, 0, width, height);
        for (let index = 0; index < 4; index++) {
          drawingContext.fillStyle = `rgba(${rotationQuaternion() > 0.5 ? '255,230,190' : '40,24,10'},${0.06 + rotationQuaternion() * 0.1})`;
          drawingContext.fillRect(0, index * 64, width, 64);
          drawingContext.fillStyle = 'rgba(30,18,8,.6)';
          drawingContext.fillRect(0, index * 64, width, 3);
        }
        for (let index2 = 0; index2 < 160; index2++) {
          drawingContext.strokeStyle = `rgba(60,38,18,${rotationQuaternion() * 0.25})`;
          drawingContext.lineWidth = 1;
          drawingContext.beginPath();
          const yPosition = rotationQuaternion() * height;
          drawingContext.moveTo(0, yPosition);
          drawingContext.bezierCurveTo(
            width * 0.3,
            yPosition + (rotationQuaternion() - 0.5) * 6,
            width * 0.7,
            yPosition + (rotationQuaternion() - 0.5) * 6,
            width,
            yPosition + (rotationQuaternion() - 0.5) * 4,
          );
          drawingContext.stroke();
        }
        drawingContext.fillStyle = 'rgba(22,22,22,.72)';
        drawingContext.font = '700 30px "IBM Plex Mono", monospace';
        drawingContext.textAlign = 'center';
        drawingContext.fillText(label, width / 2, height * 0.55);
        drawingContext.font = '16px "IBM Plex Mono", monospace';
        drawingContext.fillText('▲ THIS WAY UP', width / 2, height * 0.72);
        edgeWear(
          drawingContext,
          width,
          height,
          rotationQuaternion,
          'rgba(50,32,16,.8)',
          10,
          0.6,
        );
        grime(drawingContext, width, height, rotationQuaternion, 6);
      }),
    );
  const crates = ['B6-0413', 'ロボ部品', 'SERVO ×4', 'B6-0688'].map(
    (textValue, index) =>
      sceneKit.std({
        map: woodTex(70 + index, textValue),
        roughness: 0.85,
        metalness: 0,
      }),
  );
  const glass = sceneKit.flat(
    sceneKit.own(
      new THREE.MeshStandardMaterial({
        color: '#7fb6d4',
        roughness: 0.08,
        metalness: 0.2,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    ),
  );
  const skyGlass = sceneKit.flat(sceneKit.glow('#2f6c8f', 0.8));
  const warmBar = sceneKit.flat(sceneKit.glow('#ffd59a', 2.2)),
    coolBar = sceneKit.flat(sceneKit.glow('#bfeaff', 1.6));
  const hazardMat = sceneKit.std({
    map: sceneKit.tex(hazard(512, 64)),
    roughness: 0.7,
    metalness: 0.1,
  });
  const hazardTile = sceneKit.repeat(hazardMat.map!, 1, 1);
  const hazardFloor = sceneKit.flat(
    sceneKit.std({
      map: hazardTile,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  const lineYellow = sceneKit.flat(
    sceneKit.std({
      color: '#c99a26',
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );

  // ── Floor, walls, roof ─────────────────────────────────────────────────────────────────────
  sceneKit.mesh(
    new THREE.PlaneGeometry(22, 34),
    floorMat,
    [0, 0, -17],
    sceneKit.root,
    [-Math.PI / 2, 0, 0],
  ).castShadow = false;
  // Outside apron, so the first frames (still at the gate) have ground under them.
  sceneKit.box(plinth, [0, -0.15, 7], [30, 0.3, 14], undefined, 3);
  // Painted lanes, the cradle bay box and the big bay number.
  for (const xPosition of [-5.2, 5.2])
    sceneKit.box(lineYellow, [xPosition, 0.006, -12], [0.12, 0.012, 22]);
  sceneKit.box(lineYellow, [0, 0.006, -1.2], [10.5, 0.012, 0.12]);
  for (const [px, pz, scaleX, scaleZ] of [
    [2, -11.6, 6.6, 0.3],
    [2, -18.4, 6.6, 0.3],
    [-1.15, -15, 0.3, 7.1],
    [5.15, -15, 0.3, 7.1],
  ] as const)
    sceneKit.box(hazardFloor, [px, 0.008, pz], [scaleX, 0.012, scaleZ]);
  const numberMat = sceneKit.flat(
    sceneKit.std({
      map: sceneKit.tex(
        sign([['06', 0.9]], {
          w: 512,
          h: 512,
          bg: 'rgba(0,0,0,0)',
          fg: 'rgba(222,214,192,.72)',
          worn: 1.6,
          seed: 9,
        }),
      ),
      transparent: true,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  );
  sceneKit.plane(numberMat, [-2.2, 0.01, -6.2], 3.6, 3.6, [-Math.PI / 2, 0, 0]);
  // Drain channel across the floor.
  for (let index3 = 0; index3 < 26; index3++)
    sceneKit.box(iron, [-6.5 + index3 * 0.5, 0.004, -20.3], [0.42, 0.01, 0.32]);
  // Oil stains under the cradle and the racks.
  const stain = sceneKit.flat(
    sceneKit.std({
      map: sceneKit.tex(
        paint(256, 256, (drawingContext) => {
          const group = drawingContext.createRadialGradient(
            128,
            128,
            0,
            128,
            128,
            128,
          );
          group.addColorStop(0, 'rgba(8,8,9,.7)');
          group.addColorStop(0.5, 'rgba(8,8,9,.3)');
          group.addColorStop(1, 'rgba(8,8,9,0)');
          drawingContext.fillStyle = group;
          drawingContext.fillRect(0, 0, 256, 256);
        }),
      ),
      transparent: true,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
  );
  for (const [xPosition2, zPosition, scaleFactor] of [
    [2.4, -14.5, 3.2],
    [1, -16.6, 1.8],
    [8.6, -9, 1.6],
    [-8.8, -12.4, 1.4],
    [-4, -3, 1.1],
    [6, -27, 2.2],
  ])
    sceneKit.plane(
      stain,
      [xPosition2, 0.012, zPosition],
      scaleFactor,
      scaleFactor * randomBetween(0.6, 1),
      [-Math.PI / 2, 0, randomBetween(0, 3)],
    );

  // Side walls: concrete plinth, ribbed cladding, H-columns, girts, a clerestory band.
  for (const side of [-1, 1]) {
    const xPosition3 = side * 11.15;
    sceneKit.box(
      plinth,
      [xPosition3, 0.7, -17],
      [0.3, 1.4, 34],
      undefined,
      2.4,
    );
    sceneKit.box(clad, [xPosition3, 4.1, -17], [0.2, 5.4, 34], undefined, 3);
    sceneKit.box(clad, [xPosition3, 9.3, -17], [0.2, 1.4, 34], undefined, 3);
    sceneKit.box(
      skyGlass,
      [xPosition3 - side * 0.02, 7.8, -17],
      [0.12, 1.6, 33.6],
    );
    for (let zPosition2 = -0.6; zPosition2 > -34; zPosition2 -= 2.2)
      sceneKit.box(
        steelDark,
        [xPosition3 - side * 0.02, 7.8, zPosition2],
        [0.16, 1.62, 0.08],
      );
    for (const yPosition2 of [1.45, 6.85, 8.7])
      sceneKit.box(
        steel,
        [xPosition3 - side * 0.15, yPosition2, -17],
        [0.14, 0.2, 34],
      );
    for (let zPosition3 = -2.2; zPosition3 > -34; zPosition3 -= 4.2) {
      sceneKit.box(
        steel,
        [xPosition3 - side * 0.2, 4.6, zPosition3],
        [0.32, 9.2, 0.06],
      );
      sceneKit.box(
        steel,
        [xPosition3 - side * 0.2, 4.6, zPosition3 - 0.16],
        [0.32, 9.2, 0.06],
      );
      sceneKit.box(
        steel,
        [xPosition3 - side * 0.2, 4.6, zPosition3 - 0.08],
        [0.06, 9.2, 0.32],
      );
      sceneKit.box(
        steel,
        [xPosition3 - side * 0.55, 7.05, zPosition3 - 0.08],
        [0.7, 0.4, 0.3],
      ); // crane runway corbel
      for (const yPosition3 of [0.5, 8.2])
        for (const deltaZ of [-0.12, 0])
          sceneKit.cyl(
            chrome,
            [xPosition3 - side * 0.37, yPosition3, zPosition3 + deltaZ - 0.02],
            0.02,
            0.06,
            'x',
            6,
          );
    }
  }
  // Back wall: plinth, cladding, and a band of windows onto the displaced city.
  sceneKit.box(plinth, [0, 0.7, -34.15], [22, 1.4, 0.3], undefined, 2.4);
  sceneKit.box(clad, [0, 3.7, -34.15], [22, 4.6, 0.2], undefined, 3);
  sceneKit.box(clad, [0, 9.6, -34.15], [22, 0.8, 0.2], undefined, 3);
  sceneKit.box(glass, [0, 7.6, -34.1], [21.6, 3.2, 0.04]);
  for (let xPosition4 = -10.8; xPosition4 <= 10.81; xPosition4 += 1.8)
    sceneKit.box(steelDark, [xPosition4, 7.6, -34.05], [0.09, 3.25, 0.12]);
  for (const yPosition4 of [6.02, 7.6, 9.18])
    sceneKit.box(steelDark, [0, yPosition4, -34.05], [21.8, 0.09, 0.12]);
  // Front wall around the roller door; the door is jammed part-open.
  for (const side of [-1, 1]) {
    sceneKit.box(
      plinth,
      [side * 7.1, 0.7, 0.15],
      [8, 1.4, 0.3],
      undefined,
      2.4,
    );
    sceneKit.box(clad, [side * 7.1, 5.2, 0.15], [8, 7.6, 0.2], undefined, 3);
    sceneKit.box(steel, [side * 3.15, 2.2, 0.1], [0.3, 4.4, 0.45]);
  }
  sceneKit.box(clad, [0, 7.2, 0.15], [6.2, 5.6, 0.2], undefined, 3);
  sceneKit.box(steelDark, [0, 4.75, -0.1], [6.6, 0.7, 0.7]); // door drum housing
  // The shutter is down (Hiro came in by the side door); the street cable squeezes under it.
  for (let yPosition5 = 0.12; yPosition5 < 4.3; yPosition5 += 0.21)
    sceneKit.box(slate, [0, yPosition5 + 0.1, 0.02], [5.95, 0.19, 0.06]);
  sceneKit.box(hazardMat, [0, 0.1, -0.02], [5.95, 0.12, 0.08]);
  // The side door from inside, swung shut behind him: frame, push bar, a line of light at the sill.
  sceneKit.box(steelDark, [4.7, 1.08, -0.02], [1.08, 2.18, 0.1]);
  sceneKit.box(panelGrey, [4.7, 1.04, -0.08], [0.92, 2.04, 0.05]);
  sceneKit.box(chrome, [4.7, 1.0, -0.16], [0.7, 0.05, 0.06]);
  sceneKit.box(
    sceneKit.flat(sceneKit.glow('#ffcf8f', 1.6)),
    [4.7, 1.5, -0.11],
    [0.36, 0.5, 0.01],
  );
  sceneKit.box(
    sceneKit.flat(sceneKit.glow('#ffb46a', 1.4)),
    [4.7, 0.012, -0.2],
    [0.9, 0.01, 0.14],
  );
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign([['非常口 · EXIT', 0.5]], {
          w: 512,
          h: 128,
          bg: '#1f6b3a',
          fg: '#ffffff',
        }),
      ),
      roughness: 0.6,
    }),
    [4.7, 2.42, -0.08],
    0.6,
    0.15,
    [0, Math.PI, 0],
  );
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['BAY 6 · ロボ整備', 0.34],
            ['ROBOTICS MAINTENANCE', 0.22],
          ],
          { w: 1024, h: 256, bg: '#1d2732', fg: '#e8cf9c', worn: 0.8 },
        ),
      ),
      roughness: 0.7,
    }),
    [0, 5.9, 0.27],
    5.4,
    1.35,
  );

  // Roof: trusses every 4.2 m, purlins, roof deck, three skylights (one broken through).
  for (let zPosition4 = -2.2; zPosition4 > -34; zPosition4 -= 4.2) {
    sceneKit.box(steel, [0, 8.7, zPosition4], [22, 0.16, 0.14]);
    sceneKit.box(steel, [0, 9.9, zPosition4], [22, 0.16, 0.14]);
    for (let xPosition5 = -10.5; xPosition5 < 10.5; xPosition5 += 1.5) {
      sceneKit.beam(
        steel,
        [xPosition5, 8.7, zPosition4],
        [xPosition5 + 0.75, 9.9, zPosition4],
        0.07,
      );
      sceneKit.beam(
        steel,
        [xPosition5 + 0.75, 9.9, zPosition4],
        [xPosition5 + 1.5, 8.7, zPosition4],
        0.07,
      );
    }
  }
  for (let xPosition6 = -10; xPosition6 <= 10; xPosition6 += 2)
    sceneKit.box(steelDark, [xPosition6, 10.05, -17], [0.12, 0.14, 34]);
  const deck = sceneKit.std({
    color: '#1d2833',
    roughness: 0.8,
    metalness: 0.4,
  });
  for (const [x0, x1] of [
    [-11, -6.6],
    [-3.6, 2.2],
    [5.2, 11],
  ])
    sceneKit.box(deck, [(x0 + x1) / 2, 10.2, -17], [x1 - x0, 0.1, 34]);
  for (const [x0, x1] of [
    [-6.6, -3.6],
    [2.2, 5.2],
  ]) {
    sceneKit.box(steelDark, [(x0 + x1) / 2, 10.15, -17], [x1 - x0, 0.06, 34]);
    for (let zPosition5 = -1; zPosition5 > -34; zPosition5 -= 2.1) {
      // The skylight over the back left is blown out by the displacement; its panes are missing.
      const broken = x0 < 0 && zPosition5 < -19 && zPosition5 > -30;
      if (!broken || result() > 0.65)
        sceneKit.box(
          skyGlass,
          [(x0 + x1) / 2, 10.12, zPosition5 - 1.05],
          [x1 - x0 - 0.1, 0.03, 2],
        );
      sceneKit.box(
        steelDark,
        [(x0 + x1) / 2, 10.13, zPosition5],
        [x1 - x0, 0.08, 0.08],
      );
    }
  }
  sceneKit.box(deck, [-5.1, 10.2, -10], [3, 0.1, 18]); // decked-over half of the left skylight

  // Hanging LED bars on chains, in two rows over the aisles.
  const lampBars: THREE.Mesh[] = [];
  for (const xPosition7 of [-4.2, 6.8])
    for (let zPosition6 = -4; zPosition6 > -32; zPosition6 -= 5.6) {
      sceneKit.box(steelDark, [xPosition7, 6.9, zPosition6], [0.3, 0.12, 2.4]);
      for (const deltaZ2 of [-1, 1])
        sceneKit.box(
          iron,
          [xPosition7, 7.8, zPosition6 + deltaZ2],
          [0.02, 1.8, 0.02],
        );
      const bar = sceneKit.mesh(
        new THREE.BoxGeometry(0.18, 0.03, 2.25),
        xPosition7 < 0 && zPosition6 < -26
          ? sceneKit.flat(sceneKit.glow('#ffd59a', 2.2))
          : warmBar,
        [xPosition7, 6.83, zPosition6],
      );
      lampBars.push(bar);
    }
  const flickerBar = lampBars.find(
    (material) => material.position.x < 0 && material.position.z < -26,
  )!;

  // Cable trays along both walls at 6 m, carrying bundles that drop to the panels and benches.
  const trayCables = [
    sceneKit.std({ color: '#151719', roughness: 0.7 }),
    sceneKit.std({ color: '#2a3c4a', roughness: 0.6 }),
    sceneKit.std({ color: '#5b2b24', roughness: 0.6 }),
  ];
  for (const side of [-1, 1]) {
    const xPosition8 = side * 10.55;
    for (const deltaX of [-0.22, 0.22])
      sceneKit.box(chrome, [xPosition8 + deltaX, 6.1, -17], [0.04, 0.12, 33.5]);
    for (let zPosition7 = -0.5; zPosition7 > -34; zPosition7 -= 0.45)
      sceneKit.box(chrome, [xPosition8, 6.06, zPosition7], [0.46, 0.03, 0.04]);
    for (let index4 = 0; index4 < 4; index4++)
      sceneKit.box(
        trayCables[index4 % 3],
        [xPosition8 - 0.15 + index4 * 0.1, 6.14, -17],
        [0.06, 0.06, 33.4],
      );
    for (let zPosition8 = -3; zPosition8 > -34; zPosition8 -= 6)
      sceneKit.beam(
        steelDark,
        [side * 11.05, 6.4, zPosition8],
        [xPosition8, 6.04, zPosition8],
        0.05,
      );
  }

  // ── Gantry crane over the cradle ───────────────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    sceneKit.box(steel, [side * 10.4, 7.35, -17], [0.3, 0.3, 34]);
    sceneKit.box(chrome, [side * 10.4, 7.52, -17], [0.08, 0.05, 34]);
  }
  const BZ = -14.6;
  sceneKit.box(craneYellow, [0, 7.75, BZ], [20.4, 0.7, 0.5]);
  sceneKit.box(craneYellow, [0, 7.75, BZ - 0.9], [20.4, 0.7, 0.5]);
  for (const side of [-1, 1]) {
    sceneKit.box(craneYellow, [side * 10.1, 7.65, BZ - 0.45], [0.7, 0.55, 2.6]);
    for (const deltaZ3 of [-1, 1])
      sceneKit.cyl(
        iron,
        [side * 10.4, 7.55, BZ - 0.45 + deltaZ3],
        0.16,
        0.2,
        'x',
        16,
      );
  }
  for (let xPosition9 = -9.6; xPosition9 < 9.6; xPosition9 += 1.2)
    sceneKit.box(
      hazardMat,
      [xPosition9 + 0.6, 7.75, BZ + 0.26],
      [1.2, 0.14, 0.02],
    );
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign([['5 t', 0.7]], { w: 256, h: 256, bg: '#c49a24', fg: '#16171a' }),
      ),
      roughness: 0.7,
    }),
    [-6, 7.75, BZ + 0.27],
    0.55,
    0.55,
  );
  const TX = 2;
  sceneKit.box(steelDark, [TX, 8.2, BZ - 0.45], [1.4, 0.5, 1.9]);
  sceneKit.cyl(iron, [TX, 7.95, BZ - 0.45], 0.32, 1.1, 'x', 20);
  for (let index5 = 0; index5 < 14; index5++)
    sceneKit.put(
      new THREE.TorusGeometry(0.05, 0.014, 6, 12),
      iron,
      [TX, 7.6 - index5 * 0.085, BZ - 0.45],
      [0, index5 % 2 ? Math.PI / 2 : 0, 0],
    );
  sceneKit.box(craneYellow, [TX, 6.25, BZ - 0.45], [0.42, 0.5, 0.28]);
  sceneKit.cyl(chrome, [TX, 6.25, BZ - 0.45], 0.12, 0.32, 'z', 16);
  sceneKit.put(
    new THREE.TorusGeometry(0.17, 0.05, 10, 20, Math.PI * 1.4),
    iron,
    [TX, 5.75, BZ - 0.45],
    [0, 0, -Math.PI * 0.2],
  );
  sceneKit.box(rubber, [TX + 0.4, 5.5, BZ - 0.45], [0.1, 0.18, 0.06]); // pendant controller
  sceneKit.beam(
    rubber,
    [TX + 0.4, 7.95, BZ - 0.45],
    [TX + 0.4, 5.6, BZ - 0.45],
    0.015,
  );
  // Festoon cable loops along the runway.
  for (let zPosition9 = -2; zPosition9 > -32; zPosition9 -= 2)
    sceneKit.sag(
      trayCables[0],
      [9.8, 7.3, zPosition9],
      [9.8, 7.3, zPosition9 - 2],
      0.45,
      0.03,
    );

  // ── The cradle: a robot service stand, empty ───────────────────────────────────────────────
  const CX = 2,
    CZ = -15;
  sceneKit.box(tread, [CX, 0.18, CZ], [5.6, 0.36, 6.2], undefined, 0.8);
  sceneKit.box(hazardMat, [CX, 0.37, CZ + 3.11], [5.6, 0.02, 0.14]);
  for (const scaleZ2 of [-1, 1])
    sceneKit.box(steelDark, [CX, 0.18, CZ + scaleZ2 * 3.12], [5.7, 0.38, 0.1]);
  for (const scaleX2 of [-1, 1])
    sceneKit.box(steelDark, [CX + scaleX2 * 2.82, 0.18, CZ], [0.1, 0.38, 6.3]);
  // Two masts and a crossbeam.
  for (const scaleX3 of [-1, 1]) {
    const mx = CX + scaleX3 * 2.35;
    sceneKit.box(steel, [mx, 2.9, CZ - 1.6], [0.42, 5.1, 0.42], undefined);
    sceneKit.box(steelDark, [mx, 0.62, CZ - 1.6], [0.8, 0.14, 0.8]);
    for (let yPosition6 = 0.9; yPosition6 < 5.2; yPosition6 += 0.45)
      sceneKit.box(
        steelDark,
        [mx - scaleX3 * 0.22, yPosition6, CZ - 1.6],
        [0.02, 0.08, 0.3],
      );
    // Padded support arms reaching in, upper and lower, with hydraulic rams.
    for (const [yPosition7, reach] of [
      [1.4, 1.05],
      [2.75, 0.9],
    ]) {
      sceneKit.box(
        slate,
        [mx - (scaleX3 * reach) / 2, yPosition7, CZ - 1.4],
        [reach, 0.22, 0.3],
      );
      sceneKit.box(
        padRubber,
        [mx - scaleX3 * (reach + 0.08), yPosition7, CZ - 1.4],
        [0.16, 0.5, 0.5],
      );
      sceneKit.cyl(
        chrome,
        [mx - scaleX3 * 0.3, yPosition7 - 0.25, CZ - 1.4],
        0.035,
        0.42,
        'y',
        10,
      );
      sceneKit.cyl(
        iron,
        [mx - scaleX3 * 0.3, yPosition7 - 0.48, CZ - 1.4],
        0.06,
        0.3,
        'y',
        12,
      );
    }
  }
  sceneKit.box(steel, [CX, 5.35, CZ - 1.6], [5.2, 0.36, 0.42]);
  sceneKit.box(hazardMat, [CX, 5.35, CZ - 1.38], [5.1, 0.12, 0.02]);
  // Back frame with a padded backrest.
  sceneKit.box(steel, [CX, 2.5, CZ - 2.8], [3.6, 0.2, 0.2]);
  sceneKit.box(steel, [CX, 1.1, CZ - 2.8], [3.6, 0.2, 0.2]);
  for (const scaleX4 of [-1.7, 1.7])
    sceneKit.box(steel, [CX + scaleX4, 1.8, CZ - 2.8], [0.2, 1.6, 0.2]);
  sceneKit.box(padRubber, [CX, 1.8, CZ - 2.62], [2.4, 1.1, 0.18]);
  // Service umbilicals dropping from the crossbeam, ending in dangling connectors.
  for (let index6 = 0; index6 < 7; index6++) {
    const xPosition10 = CX - 1.8 + index6 * 0.6,
      len = randomBetween(1.6, 2.6),
      sway = randomBetween(-0.3, 0.3);
    sceneKit.tube(
      trayCables[index6 % 3],
      [
        [xPosition10, 5.2, CZ - 1.6],
        [xPosition10 + sway * 0.4, 4.2, CZ - 1.2],
        [xPosition10 + sway, 5.2 - len, CZ - 0.9],
      ],
      0.035,
      24,
      6,
    );
    sceneKit.cyl(
      chrome,
      [xPosition10 + sway, 5.2 - len - 0.07, CZ - 0.9],
      0.055,
      0.14,
      'y',
      10,
    );
  }
  // Two articulated service arms parked on the masts, tool heads down.
  for (const scaleX5 of [-1, 1]) {
    const base: Vector3Tuple = [CX + scaleX5 * 2.1, 4.1, CZ - 1.3],
      elbow: Vector3Tuple = [CX + scaleX5 * 1.2, 4.55, CZ - 0.4],
      wrist: Vector3Tuple = [CX + scaleX5 * 0.75, 3.4, CZ + 0.2];
    sceneKit.cyl(steelDark, base, 0.2, 0.3, 'x', 16);
    sceneKit.beam(slate, base, elbow, 0.18);
    sceneKit.cyl(steelDark, elbow, 0.15, 0.26, 'x', 16);
    sceneKit.beam(slate, elbow, wrist, 0.14);
    sceneKit.cyl(iron, wrist, 0.1, 0.22, 'y', 12);
    sceneKit.cyl(
      chrome,
      [wrist[0], wrist[1] - 0.22, wrist[2]],
      0.03,
      0.28,
      'y',
      8,
    );
    sceneKit.tube(
      trayCables[0],
      [
        [base[0], base[1] + 0.15, base[2]],
        [elbow[0], elbow[1] + 0.18, elbow[2]],
        [wrist[0], wrist[1] + 0.15, wrist[2]],
      ],
      0.025,
      20,
      6,
    );
  }
  // Diagnostic monitor on a swing arm: nobody in the stand.
  const scanTex = sceneKit.tex(
    paint(512, 320, (drawingContext, width, height) => {
      drawingContext.fillStyle = '#071a24';
      drawingContext.fillRect(0, 0, width, height);
      drawingContext.strokeStyle = 'rgba(120,220,255,.12)';
      for (let index = 0; index < width; index += 24) {
        drawingContext.beginPath();
        drawingContext.moveTo(index, 0);
        drawingContext.lineTo(index, height);
        drawingContext.stroke();
      }
      for (let index2 = 0; index2 < height; index2 += 24) {
        drawingContext.beginPath();
        drawingContext.moveTo(0, index2);
        drawingContext.lineTo(width, index2);
        drawingContext.stroke();
      }
      drawingContext.strokeStyle = 'rgba(140,230,255,.55)';
      drawingContext.setLineDash([8, 6]);
      drawingContext.lineWidth = 3;
      drawingContext.beginPath();
      drawingContext.ellipse(width * 0.32, height * 0.38, 46, 40, 0, 0, 7);
      drawingContext.stroke();
      drawingContext.beginPath();
      drawingContext.ellipse(
        width * 0.32,
        height * 0.72,
        80,
        70,
        0,
        Math.PI,
        0,
      );
      drawingContext.stroke();
      drawingContext.setLineDash([]);
      drawingContext.fillStyle = '#9fe6ff';
      drawingContext.font = '600 30px "IBM Plex Mono", monospace';
      drawingContext.fillText('STAND 6', width * 0.58, 70);
      drawingContext.font = '22px "IBM Plex Mono", monospace';
      drawingContext.fillStyle = 'rgba(159,230,255,.7)';
      ['NO UNIT', 'LAST JOB  03:12', 'PWR REG  ON CHARGE'].forEach(
        (timeSeconds, index7) =>
          drawingContext.fillText(timeSeconds, width * 0.58, 120 + index7 * 36),
      );
      drawingContext.fillStyle = '#ffb35c';
      drawingContext.fillText('● STANDBY', width * 0.58, 270);
    }),
  );
  const screen = sceneKit.flat(
    sceneKit.own(
      new THREE.MeshBasicMaterial({ map: scanTex, toneMapped: false }),
    ),
  );
  sceneKit.box(steelDark, [CX + 3.3, 1.2, CZ + 2.4], [0.12, 2.4, 0.12]);
  sceneKit.box(steelDark, [CX + 3.3, 0.05, CZ + 2.4], [0.6, 0.1, 0.6]);
  sceneKit.beam(
    steel,
    [CX + 3.3, 2.3, CZ + 2.4],
    [CX + 2.8, 2.35, CZ + 3.1],
    0.07,
  );
  sceneKit.box(
    iron,
    [CX + 2.8, 2.3, CZ + 3.15],
    [0.86, 0.56, 0.06],
    [0, 0.45, 0],
  );
  sceneKit.plane(
    screen,
    [
      CX + 2.8 + Math.sin(0.45) * 0.035,
      2.3,
      CZ + 3.15 + Math.cos(0.45) * 0.035,
    ],
    0.8,
    0.5,
    [0, 0.45, 0],
  );

  // ── Left wall: shadow boards, benches, chests, panels ──────────────────────────────────────
  const boardTex = (seed: number) =>
    sceneKit.tex(
      paint(1024, 640, (drawingContext, width, height) => {
        const rotationQuaternion = seeded(seed);
        drawingContext.fillStyle = '#c4bca7';
        drawingContext.fillRect(0, 0, width, height);
        drawingContext.fillStyle = 'rgba(40,36,30,.55)';
        for (let index = 12; index < width; index += 24)
          for (
            let segmentIndex = 12;
            segmentIndex < height;
            segmentIndex += 24
          ) {
            drawingContext.beginPath();
            drawingContext.arc(index, segmentIndex, 3, 0, 7);
            drawingContext.fill();
          }
        // Painted tool outlines. Most are empty: someone left with the tools.
        drawingContext.fillStyle = 'rgba(30,34,38,.82)';
        for (let index2 = 0; index2 < 26; index2++) {
          const cx = 60 + (index2 % 9) * 110 + rotationQuaternion() * 20,
            cy = 90 + Math.floor(index2 / 9) * 190 + rotationQuaternion() * 30,
            kind = Math.floor(rotationQuaternion() * 4);
          drawingContext.save();
          drawingContext.translate(cx, cy);
          drawingContext.rotate((rotationQuaternion() - 0.5) * 0.3);
          if (kind === 0) {
            drawingContext.fillRect(-7, -60, 14, 100);
            drawingContext.beginPath();
            drawingContext.arc(0, -68, 20, 0, 7);
            drawingContext.fill();
          } else if (kind === 1) {
            drawingContext.fillRect(-10, -20, 20, 70);
            drawingContext.fillRect(-4, -70, 8, 50);
          } else if (kind === 2) {
            drawingContext.fillRect(-30, -10, 60, 30);
            drawingContext.fillRect(-8, 20, 16, 40);
          } else {
            drawingContext.beginPath();
            drawingContext.arc(0, 0, 32, 0, 7);
            drawingContext.fill();
            drawingContext.fillStyle = '#c4bca7';
            drawingContext.beginPath();
            drawingContext.arc(0, 0, 14, 0, 7);
            drawingContext.fill();
            drawingContext.fillStyle = 'rgba(30,34,38,.82)';
          }
          drawingContext.restore();
        }
        grain(drawingContext, width, height, rotationQuaternion, 30000, 0.12);
        grime(
          drawingContext,
          width,
          height,
          rotationQuaternion,
          22,
          '40,34,26',
          0.25,
        );
        edgeWear(
          drawingContext,
          width,
          height,
          rotationQuaternion,
          '#8b8478',
          14,
          0.5,
        );
      }),
    );
  const boards = [
    sceneKit.std({ map: boardTex(81), roughness: 0.85 }),
    sceneKit.std({ map: boardTex(82), roughness: 0.85 }),
    sceneKit.std({ map: boardTex(83), roughness: 0.85 }),
  ];
  boards.forEach((material, index) => {
    const zPosition10 = -8 - index * 4.4;
    sceneKit.box(steelDark, [-10.92, 2.2, zPosition10], [0.08, 2.6, 4.3]);
    sceneKit.plane(material, [-10.86, 2.2, zPosition10], 4.1, 2.5, [
      0,
      Math.PI / 2,
      0,
    ]);
    // The tools that stayed: wrenches, drivers, mallets and coils hung on the board.
    for (let timeSeconds = 0; timeSeconds < 9; timeSeconds++) {
      const tz = zPosition10 - 1.8 + randomBetween(0, 3.6),
        ty = randomBetween(1.3, 3.2),
        kind = Math.floor(result() * 3);
      if (kind === 0) {
        sceneKit.box(
          chrome,
          [-10.8, ty, tz],
          [0.03, 0.42, 0.05],
          [randomBetween(-0.2, 0.2), 0, 0],
        );
        sceneKit.cyl(chrome, [-10.8, ty + 0.24, tz], 0.055, 0.03, 'x', 10);
      } else if (kind === 1) {
        sceneKit.cyl(
          pick([chestRed, rubber, craneYellow]),
          [-10.8, ty, tz],
          0.03,
          0.18,
          'y',
          8,
        );
        sceneKit.cyl(chrome, [-10.8, ty + 0.2, tz], 0.008, 0.22, 'y', 6);
      } else
        sceneKit.put(
          new THREE.TorusGeometry(0.12, 0.02, 6, 16),
          pick([trayCables[1], trayCables[2], craneYellow]),
          [-10.8, ty, tz],
          [0, Math.PI / 2, 0],
        );
    }
    sceneKit.box(steelDark, [-10.7, 3.85, zPosition10], [0.5, 0.7, 4.2]); // wall cabinet above
    for (let depth = 0; depth < 3; depth++)
      sceneKit.box(
        chrome,
        [-10.44, 3.85, zPosition10 - 1.4 + depth * 1.4],
        [0.03, 0.03, 0.4],
      );
  });
  // Three benches: steel frame, worn timber top, drawers, a vice, and the clutter of a stopped job.
  const timber = sceneKit.std({
    map: sceneKit.tex(
      paint(512, 128, (drawingContext, width, height) => {
        const rotationQuaternion = seeded(91);
        drawingContext.fillStyle = '#6b5136';
        drawingContext.fillRect(0, 0, width, height);
        for (let index = 0; index < 90; index++) {
          drawingContext.strokeStyle = `rgba(30,18,8,${rotationQuaternion() * 0.3})`;
          drawingContext.beginPath();
          const yPosition = rotationQuaternion() * height;
          drawingContext.moveTo(0, yPosition);
          drawingContext.lineTo(
            width,
            yPosition + (rotationQuaternion() - 0.5) * 5,
          );
          drawingContext.stroke();
        }
        grime(
          drawingContext,
          width,
          height,
          rotationQuaternion,
          18,
          '15,10,6',
          0.4,
        );
        scratches(
          drawingContext,
          width,
          height,
          rotationQuaternion,
          60,
          '200,170,130',
          0.3,
        );
      }),
    ),
    roughness: 0.7,
  });
  for (let index8 = 0; index8 < 3; index8++) {
    const zPosition11 = -7.9 - index8 * 4.4;
    sceneKit.box(timber, [-10.05, 0.98, zPosition11], [1, 0.07, 3.8]);
    for (const deltaZ4 of [-1.8, 1.8])
      for (const deltaX2 of [-0.42, 0.42])
        sceneKit.box(
          steelDark,
          [-10.05 + deltaX2, 0.48, zPosition11 + deltaZ4],
          [0.06, 0.94, 0.06],
        );
    sceneKit.box(steelDark, [-10.05, 0.2, zPosition11], [0.96, 0.04, 3.7]);
    sceneKit.box(panelGrey, [-10.05, 0.62, zPosition11 - 1.1], [0.9, 0.6, 1.2]);
    for (let depth2 = 0; depth2 < 3; depth2++) {
      sceneKit.box(
        steelDark,
        [-9.59, 0.78 - depth2 * 0.18, zPosition11 - 1.1],
        [0.02, 0.14, 1.1],
      );
      sceneKit.box(
        chrome,
        [-9.57, 0.78 - depth2 * 0.18, zPosition11 - 1.1],
        [0.02, 0.025, 0.3],
      );
    }
    // Vice at the bench end.
    sceneKit.box(iron, [-9.75, 1.12, zPosition11 + 1.5], [0.22, 0.2, 0.3]);
    sceneKit.box(iron, [-9.75, 1.12, zPosition11 + 1.22], [0.22, 0.2, 0.08]);
    sceneKit.cyl(chrome, [-9.75, 1.12, zPosition11 + 1.05], 0.015, 0.3, 'z', 8);
    // Parts trays and loose hardware.
    for (let progress = 0; progress < 4; progress++)
      sceneKit.box(
        pick([chestTeal, slate, panelGrey]),
        [
          -10.2 + randomBetween(-0.2, 0.2),
          1.05,
          zPosition11 - 0.4 + progress * 0.34,
        ],
        [0.3, 0.08, 0.28],
      );
    for (let progress2 = 0; progress2 < 12; progress2++)
      sceneKit.cyl(
        pick([chrome, iron]),
        [
          -10.05 + randomBetween(-0.4, 0.4),
          1.03,
          zPosition11 + randomBetween(-1.6, 1.6),
        ],
        randomBetween(0.008, 0.02),
        randomBetween(0.01, 0.05),
        'y',
        6,
      );
    // A servo motor and a gearbox half taken apart.
    sceneKit.cyl(steel, [-10.1, 1.12, zPosition11 + 0.5], 0.1, 0.22, 'x', 16);
    sceneKit.cyl(chrome, [-9.93, 1.12, zPosition11 + 0.5], 0.02, 0.14, 'x', 8);
    sceneKit.put(
      new THREE.TorusGeometry(0.1, 0.025, 6, 18),
      chrome,
      [-10.25, 1.03, zPosition11 + 0.95],
      [Math.PI / 2, 0, 0],
    );
    // Under-bench storage bins.
    for (let secondValue = 0; secondValue < 4; secondValue++)
      sceneKit.box(
        pick([chestTeal, craneYellow, slate]),
        [-10.1, 0.32, zPosition11 + 0.2 + secondValue * 0.4],
        [0.6, 0.2, 0.34],
      );
  }
  // Bench lamps and monitors: the middle bench still has power.
  for (let index9 = 0; index9 < 3; index9++) {
    const zPosition12 = -7.9 - index9 * 4.4;
    sceneKit.beam(
      steelDark,
      [-10.4, 1.02, zPosition12 + 0.9],
      [-10.3, 1.7, zPosition12 + 0.9],
      0.025,
    );
    sceneKit.beam(
      steelDark,
      [-10.3, 1.7, zPosition12 + 0.9],
      [-9.95, 1.62, zPosition12 + 0.7],
      0.025,
    );
    sceneKit.put(
      new THREE.ConeGeometry(0.1, 0.14, 14, 1, true),
      steelDark,
      [-9.92, 1.56, zPosition12 + 0.68],
      [0, 0, 0.5],
    );
    sceneKit.box(
      iron,
      [-10.45, 1.32, zPosition12 - 0.6],
      [0.06, 0.5, 0.8],
      [0, 0, -0.12],
    );
  }
  const monitorTex = sceneKit.tex(
    paint(512, 320, (drawingContext, width, height) => {
      drawingContext.fillStyle = '#061620';
      drawingContext.fillRect(0, 0, width, height);
      drawingContext.fillStyle = '#8fdcf7';
      drawingContext.font = '600 26px "IBM Plex Mono", monospace';
      drawingContext.fillText('B6 SERVICE LOG', 24, 44);
      drawingContext.font = '20px "IBM Plex Mono", monospace';
      drawingContext.fillStyle = 'rgba(143,220,247,.75)';
      [
        '03:02  STAND 6 CLEARED',
        '03:05  CRANE PARKED',
        '03:09  PR-6 TO CHARGE',
        '03:10  CASE UNDER STAIRS',
        '03:12  EVACUATE BAY',
      ].forEach((timeSeconds, index) =>
        drawingContext.fillText(timeSeconds, 24, 96 + index * 38),
      );
      drawingContext.fillStyle = '#ffb35c';
      drawingContext.fillRect(24, 286, 140, 6);
    }),
  );
  const monitor = sceneKit.flat(
    sceneKit.own(
      new THREE.MeshBasicMaterial({ map: monitorTex, toneMapped: false }),
    ),
  );
  sceneKit.plane(monitor, [-10.41, 1.34, -12.9], 0.74, 0.46, [
    0,
    Math.PI / 2 - 0.12,
    0,
  ]);
  const deadScreen = sceneKit.flat(
    sceneKit.std({ color: '#0b1014', roughness: 0.15, metalness: 0.6 }),
  );
  for (const zPosition13 of [-8.5, -17.3])
    sceneKit.plane(deadScreen, [-10.41, 1.34, zPosition13], 0.74, 0.46, [
      0,
      Math.PI / 2 - 0.12,
      0,
    ]);
  // The job card, pinned under the lamp on the middle bench.
  const cardTex = sceneKit.tex(
    paint(512, 360, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(97);
      drawingContext.fillStyle = '#efe7d2';
      drawingContext.fillRect(0, 0, width, height);
      drawingContext.fillStyle = '#c8102e';
      drawingContext.fillRect(0, 0, width, 40);
      drawingContext.fillStyle = '#efe7d2';
      drawingContext.font = '700 26px "Space Grotesk", Arial';
      drawingContext.fillText('JOB CARD · BAY 6', 18, 29);
      drawingContext.fillStyle = '#2a2e33';
      drawingContext.font = '24px "IBM Plex Mono", monospace';
      [
        'UNIT  PR-6 regulator',
        'STATUS  on charge',
        'NOTE  do not unplug!',
        '       spare is boxed',
      ].forEach((timeSeconds, index) =>
        drawingContext.fillText(timeSeconds, 18, 90 + index * 44),
      );
      drawingContext.strokeStyle = '#2a2e33';
      drawingContext.lineWidth = 3;
      drawingContext.beginPath();
      drawingContext.moveTo(300, 280);
      drawingContext.bezierCurveTo(340, 250, 380, 320, 470, 270);
      drawingContext.stroke();
      grain(drawingContext, width, height, rotationQuaternion, 9000, 0.08);
      grime(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        8,
        '60,40,20',
        0.25,
      );
    }),
  );
  sceneKit.plane(
    sceneKit.flat(
      sceneKit.std({
        map: cardTex,
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    ),
    [-9.95, 1.017, -11.75],
    0.32,
    0.23,
    [-Math.PI / 2, 0, -1.4],
  );
  // Rolling tool chests and a wall electrical cluster near the door.
  for (const [zPosition14, material2] of [
    [-5.6, chestRed],
    [-19.6, chestTeal],
  ] as [number, THREE.Material][]) {
    sceneKit.box(material2, [-10.3, 0.6, zPosition14], [0.75, 1.1, 1.3]);
    sceneKit.box(material2, [-10.3, 1.32, zPosition14], [0.72, 0.32, 1.25]);
    for (let depth3 = 0; depth3 < 6; depth3++)
      sceneKit.box(
        chrome,
        [-9.91, 0.2 + depth3 * 0.17, zPosition14],
        [0.02, 0.02, 0.6],
      );
    for (const deltaZ5 of [-0.55, 0.55])
      sceneKit.cyl(
        rubber,
        [-10.3, 0.06, zPosition14 + deltaZ5],
        0.06,
        0.06,
        'x',
        10,
      );
  }
  for (let index10 = 0; index10 < 4; index10++) {
    const xPosition11 = -9.4 + index10 * 0.95;
    sceneKit.box(panelGrey, [xPosition11, 2.2, -0.12], [0.8, 1.2, 0.26]);
    sceneKit.box(hazardMat, [xPosition11, 2.86, -0.24], [0.3, 0.08, 0.01]);
    sceneKit.box(steelDark, [xPosition11, 4.1, -0.08], [0.07, 2.6, 0.07]); // conduit up to the tray
  }
  sceneKit.box(panelGrey, [-5.2, 1.6, -0.14], [1.5, 2, 0.3]);
  sceneKit.cyl(chestRed, [-3.75, 0.82, -0.22], 0.09, 0.5, 'y', 14);
  sceneKit.cyl(rubber, [-3.75, 1.12, -0.22], 0.03, 0.1, 'y', 8);
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['消火器', 0.4],
            ['FIRE', 0.3],
          ],
          { w: 256, h: 256, bg: '#a51d1d', fg: '#fff' },
        ),
      ),
      roughness: 0.8,
    }),
    [-3.75, 1.55, -0.06],
    0.3,
    0.3,
  );
  // Lockers between the benches and the stairs.
  for (let index11 = 0; index11 < 6; index11++) {
    const zPosition15 = -20.8 - index11 * 0.52;
    sceneKit.box(rackBlue, [-10.8, 1, zPosition15], [0.5, 2, 0.5]);
    sceneKit.box(steelDark, [-10.54, 1.62, zPosition15], [0.02, 0.05, 0.3]);
    sceneKit.box(chrome, [-10.53, 1.1, zPosition15 + 0.16], [0.02, 0.14, 0.03]);
    if (index11 === 3)
      sceneKit.box(
        rackBlue,
        [-10.25, 1, zPosition15 - 0.1],
        [0.03, 1.95, 0.48],
        [0, 0.9, 0],
      ); // a door left hanging open
  }

  // ── Right wall: pallet racking with crates, drums and boxed robot parts ───────────────────
  for (let zPosition16 = -4; zPosition16 >= -24; zPosition16 -= 2.85)
    for (const deltaX3 of [-0.55, 0.55]) {
      sceneKit.box(
        rackBlue,
        [10.2 + deltaX3, 2.7, zPosition16],
        [0.09, 5.4, 0.09],
      );
      for (let yPosition8 = 0.3; yPosition8 < 5.3; yPosition8 += 0.7)
        sceneKit.beam(
          rackBlue,
          [10.2 + deltaX3, yPosition8, zPosition16],
          [10.2 + deltaX3, yPosition8 + 0.7, zPosition16],
          0.02,
        );
    }
  for (let zPosition17 = -4; zPosition17 >= -24; zPosition17 -= 2.85)
    for (let yPosition9 = 0.3; yPosition9 < 5.3; yPosition9 += 0.7)
      sceneKit.beam(
        rackBlue,
        [9.65, yPosition9, zPosition17],
        [10.75, yPosition9 + 0.35, zPosition17],
        0.02,
      );
  for (const yPosition10 of [1.6, 3.2, 4.8])
    for (const deltaX4 of [-0.55, 0.55])
      sceneKit.box(
        rackYellow,
        [10.2 + deltaX4, yPosition10, -14],
        [0.07, 0.14, 20],
      );
  for (let bay = 0; bay < 7; bay++) {
    const zPosition18 = -5.43 - bay * 2.85;
    for (const yPosition11 of [0, 1.67, 3.27, 4.87]) {
      if (result() < 0.12) continue;
      sceneKit.box(
        timber,
        [10.2, yPosition11 + 0.07, zPosition18],
        [1.1, 0.12, 1.25],
      );
      const kind = result();
      if (kind < 0.45) {
        const height2 = randomBetween(0.5, 1.1),
          width2 = randomBetween(0.8, 1.1);
        sceneKit.box(
          pick(crates),
          [
            10.2,
            yPosition11 + 0.13 + height2 / 2,
            zPosition18 + randomBetween(-0.1, 0.1),
          ],
          [1, height2, width2],
          [0, randomBetween(-0.06, 0.06), 0],
        );
        if (result() > 0.5)
          sceneKit.box(
            pick(crates),
            [10.1, yPosition11 + 0.13 + height2 + 0.25, zPosition18],
            [0.6, 0.5, 0.6],
            [0, randomBetween(-0.3, 0.3), 0],
          );
      } else if (kind < 0.7)
        for (const deltaZ6 of [-0.3, 0.3])
          sceneKit.cyl(
            pick([rackBlue, chestTeal, panelGrey]),
            [10.2, yPosition11 + 0.13 + 0.45, zPosition18 + deltaZ6],
            0.28,
            0.9,
            'y',
            18,
          );
      else if (kind < 0.88)
        for (let secondValue2 = 0; secondValue2 < 6; secondValue2++)
          sceneKit.box(
            pick([slate, panelGrey, craneYellow]),
            [
              10.15 + (secondValue2 % 2) * 0.3 - 0.15,
              yPosition11 + 0.25 + Math.floor(secondValue2 / 2) * 0.25,
              zPosition18 - 0.4 + (secondValue2 % 3) * 0.4,
            ],
            [0.28, 0.22, 0.36],
          );
      else {
        sceneKit.put(
          new THREE.SphereGeometry(0.42, 18, 12),
          sceneKit.std({
            color: '#d9dcdc',
            roughness: 0.35,
            metalness: 0.05,
            transparent: true,
            opacity: 0.78,
          }),
          [10.2, yPosition11 + 0.55, zPosition18],
          undefined,
          [1, 0.85, 1],
        );
      }
    }
  }
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['ラック B', 0.34],
            ['SPARES · KEEP AISLE CLEAR', 0.2],
          ],
          { w: 1024, h: 256, bg: '#1d2732', fg: '#e8e2d0', worn: 0.6 },
        ),
      ),
      roughness: 0.7,
    }),
    [9.55, 5.55, -14],
    3.2,
    0.8,
    [0, -Math.PI / 2, 0],
  );
  // On the floor: a pallet jack, drums and a spare robot arm on trestles.
  sceneKit.box(craneYellow, [8.2, 0.12, -6.6], [0.55, 0.14, 1.2]);
  sceneKit.beam(steelDark, [8.2, 0.2, -6], [8.2, 1.15, -5.6], 0.05);
  sceneKit.box(rubber, [8.2, 1.18, -5.55], [0.4, 0.06, 0.06]);
  for (const [xPosition12, zPosition19] of [
    [8.4, -24.6],
    [7.8, -25.2],
    [8.6, -25.5],
  ]) {
    sceneKit.cyl(
      rackBlue,
      [xPosition12, 0.45, zPosition19],
      0.29,
      0.9,
      'y',
      18,
    );
    sceneKit.cyl(chrome, [xPosition12, 0.91, zPosition19], 0.3, 0.02, 'y', 18);
  }
  for (const zPosition20 of [-19.6, -22.2]) {
    sceneKit.beam(
      steelDark,
      [7.4, 0, zPosition20],
      [7.7, 0.75, zPosition20],
      0.05,
    );
    sceneKit.beam(
      steelDark,
      [8, 0, zPosition20],
      [7.7, 0.75, zPosition20],
      0.05,
    );
    sceneKit.box(steelDark, [7.7, 0.77, zPosition20], [0.6, 0.05, 0.1]);
  }
  const armWhite = sceneKit.std({
    color: '#d7d9d6',
    roughness: 0.42,
    metalness: 0.1,
  });
  sceneKit.cyl(armWhite, [7.7, 1.05, -20.9], 0.26, 2.2, 'z', 22, 0.22);
  sceneKit.put(
    new THREE.SphereGeometry(0.3, 20, 14),
    steelDark,
    [7.7, 1.05, -19.75],
  );
  sceneKit.cyl(armWhite, [7.7, 1.05, -23], 0.2, 1.6, 'z', 20, 0.16);
  sceneKit.box(hazardMat, [7.7, 1.33, -21.4], [0.06, 0.02, 0.6]);

  // ── Back: mezzanine, stairs, control booth, charging docks ────────────────────────────────
  sceneKit.box(tread, [0, 3.35, -32.1], [22, 0.14, 4], undefined, 0.8);
  sceneKit.box(steel, [0, 3.18, -30.15], [22, 0.3, 0.2]);
  for (const xPosition13 of [-6, -1, 4, 9])
    sceneKit.box(steel, [xPosition13, 1.6, -30.25], [0.28, 3.2, 0.28]);
  for (let xPosition14 = -8.3; xPosition14 <= 11; xPosition14 += 1.2)
    sceneKit.box(craneYellow, [xPosition14, 3.95, -30.12], [0.05, 1.1, 0.05]);
  for (const yPosition12 of [4.45, 3.95])
    sceneKit.box(craneYellow, [1.35, yPosition12, -30.12], [19.3, 0.05, 0.05]);
  sceneKit.box(craneYellow, [1.35, 3.5, -30.1], [19.3, 0.14, 0.02]);
  // Stairs up the left side; the space under them is where the case hides.
  const SX = -9.2,
    S0 = -24,
    S1 = -30,
    steps = 18;
  for (let index12 = 0; index12 < steps; index12++) {
    const timeSeconds2 = (index12 + 0.5) / steps;
    sceneKit.box(
      tread,
      [SX, (3.35 * (index12 + 1)) / steps, S0 + (S1 - S0) * timeSeconds2],
      [1.3, 0.05, 0.3],
      undefined,
      0.8,
    );
  }
  for (const deltaX5 of [-0.67, 0.67]) {
    sceneKit.beam(
      steel,
      [SX + deltaX5, 0, S0],
      [SX + deltaX5, 3.35, S1],
      0.06,
      0.25,
    );
    for (const timeSeconds3 of [0, 0.25, 0.5, 0.75, 1])
      sceneKit.box(
        craneYellow,
        [
          SX + deltaX5,
          3.35 * timeSeconds3 + 0.5,
          S0 + (S1 - S0) * timeSeconds3,
        ],
        [0.04, 1, 0.04],
      );
    sceneKit.beam(
      craneYellow,
      [SX + deltaX5, 1, S0],
      [SX + deltaX5, 4.35, S1],
      0.045,
    );
  }
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign([['NO STEP · 立入注意', 0.4]], {
          w: 512,
          h: 128,
          bg: '#c49a24',
          fg: '#16171a',
        }),
      ),
      roughness: 0.7,
    }),
    [SX + 0.7, 0.85, S0 - 0.7],
    0.9,
    0.22,
    [0, Math.PI / 2, 0],
  );
  // Control booth on the mezzanine, lit from inside.
  const booth = slate;
  sceneKit.box(booth, [7.2, 4.9, -32.6], [6.6, 0.05, 2.8]);
  sceneKit.box(booth, [7.2, 6.4, -32.6], [6.6, 0.1, 2.8]);
  for (const xPosition15 of [3.9, 10.5])
    sceneKit.box(booth, [xPosition15, 5.15, -32.6], [0.1, 2.5, 2.8]);
  sceneKit.box(booth, [7.2, 3.95, -31.2], [6.6, 1, 0.1]);
  sceneKit.box(
    sceneKit.flat(sceneKit.glow('#ffcf8f', 0.55)),
    [7.2, 5.2, -33.9],
    [6.4, 2.4, 0.05],
  );
  sceneKit.box(glass, [7.2, 5.2, -31.2], [6.4, 1.5, 0.03]);
  for (let xPosition16 = 4.1; xPosition16 < 10.5; xPosition16 += 1.6)
    sceneKit.box(steelDark, [xPosition16, 5.2, -31.18], [0.06, 1.55, 0.06]);
  sceneKit.box(iron, [7.2, 4.65, -32], [5, 0.5, 0.6]);
  for (let index13 = 0; index13 < 5; index13++)
    sceneKit.box(
      sceneKit.flat(sceneKit.glow(index13 === 2 ? '#ff7a5c' : '#7fe0ff', 1.2)),
      [5.4 + index13 * 0.9, 4.92, -31.85],
      [0.3, 0.02, 0.14],
    );
  sceneKit.box(steelDark, [9.6, 6.75, -33], [1.2, 0.6, 0.9]); // AC unit
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['BAY 06', 0.5],
            ['ロボット整備 · ROBOTICS MAINTENANCE', 0.15],
          ],
          { w: 1024, h: 384, bg: '#283746', fg: '#e8e2d0', worn: 1.2 },
        ),
      ),
      roughness: 0.7,
    }),
    [-4.2, 5.2, -34.02],
    6.2,
    2.3,
  );
  // Charging docks under the mezzanine: tall cabinets, cyan status strips, coiled leads.
  const dockGlow = sceneKit.flat(sceneKit.glow('#57d2ff', 1.8)),
    dockDim = sceneKit.flat(sceneKit.glow('#1d4a5c', 1));
  for (let index14 = 0; index14 < 4; index14++) {
    const xPosition17 = -4.6 + index14 * 2.6;
    sceneKit.box(panelGrey, [xPosition17, 1.25, -33.55], [1.3, 2.5, 0.8]);
    sceneKit.box(steelDark, [xPosition17, 1.25, -33.14], [1.1, 2.2, 0.02]);
    sceneKit.box(
      index14 === 1 ? dockDim : dockGlow,
      [xPosition17 - 0.4, 1.9, -33.12],
      [0.06, 0.9, 0.02],
    );
    sceneKit.put(
      new THREE.TorusGeometry(0.26, 0.04, 8, 22),
      trayCables[index14 % 3],
      [xPosition17 + 0.25, 1, -33.08],
    );
    sceneKit.plane(
      sceneKit.std({
        map: sceneKit.tex(
          sign([[`DOCK ${index14 + 1}`, 0.5]], {
            w: 256,
            h: 128,
            bg: '#1d2732',
            fg: '#9fe6ff',
          }),
        ),
        roughness: 0.7,
      }),
      [xPosition17 + 0.1, 2.15, -33.12],
      0.5,
      0.25,
    );
  }

  // ── Entrance clutter and signs ─────────────────────────────────────────────────────────────
  for (const xPosition18 of [-3.6, 3.6])
    for (const zPosition21 of [-1, -2.6]) {
      sceneKit.cyl(
        craneYellow,
        [xPosition18, 0.55, zPosition21],
        0.1,
        1.1,
        'y',
        14,
      );
      sceneKit.cyl(
        hazardMat,
        [xPosition18, 0.9, zPosition21],
        0.102,
        0.14,
        'y',
        14,
      );
    }
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['CAUTION', 0.34],
            ['OVERHEAD CRANE · 頭上注意', 0.2],
          ],
          { w: 1024, h: 320, bg: '#c49a24', fg: '#16171a', worn: 0.8 },
        ),
      ),
      roughness: 0.7,
      side: THREE.DoubleSide,
    }),
    [2, 6.2, -6.4],
    3,
    0.94,
  );
  for (const deltaX6 of [-1.3, 1.3])
    sceneKit.box(iron, [2 + deltaX6, 7.3, -6.4], [0.02, 1.6, 0.02]);
  sceneKit.plane(
    sceneKit.std({
      map: sceneKit.tex(
        sign(
          [
            ['ヘルメット着用', 0.3],
            ['HARD HATS ON', 0.26],
          ],
          { w: 512, h: 384, bg: '#2d5b8a', fg: '#fff', worn: 0.5 },
        ),
      ),
      roughness: 0.7,
    }),
    [10.95, 2.4, -2.4],
    0.8,
    0.6,
    [0, -Math.PI / 2, 0],
  );
  // A ladder against the racks, cable spools, a toppled bin.
  for (const deltaZ7 of [-0.22, 0.22])
    sceneKit.beam(
      craneYellow,
      [9.35, 0, -2.6 + deltaZ7],
      [9.05, 3.4, -2.4 + deltaZ7],
      0.05,
    );
  for (let index15 = 1; index15 < 11; index15++)
    sceneKit.beam(
      chrome,
      [9.35 - index15 * 0.028, index15 * 0.3, -2.82],
      [9.35 - index15 * 0.028, index15 * 0.3, -2.38],
      0.025,
    );
  for (const [xPosition19, zPosition22, rr] of [
    [6.6, -3.2, 0.5],
    [7.4, -3.4, 0.38],
    [-1.4, -31.6, 0.45],
  ]) {
    sceneKit.cyl(timber, [xPosition19, rr, zPosition22], rr, 0.12, 'z', 20);
    sceneKit.cyl(
      timber,
      [xPosition19, rr, zPosition22 - 0.5],
      rr,
      0.12,
      'z',
      20,
    );
    sceneKit.cyl(
      trayCables[0],
      [xPosition19, rr, zPosition22 - 0.25],
      rr * 0.75,
      0.4,
      'z',
      18,
    );
  }
  sceneKit.cyl(slate, [-6.2, 0.3, -14.6], 0.3, 0.6, 'z', 14);
  sceneKit.box(crates[1], [-5.6, 0.03, -14.3], [0.4, 0.06, 0.3], [0, 0.6, 0]);
  // Debris from the displacement: ceiling panels down, papers, fragments.
  sceneKit.box(deck, [-4.4, 0.1, -24.2], [2.6, 0.05, 1.8], [0.18, 0.3, 0.06]);
  sceneKit.box(deck, [-3.9, 0.45, -25.4], [2, 0.05, 1.4], [0.5, -0.4, 0.3]);
  const paper = sceneKit.flat(
    sceneKit.std({
      color: '#a9a598',
      roughness: 0.9,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  for (let index16 = 0; index16 < 16; index16++)
    sceneKit.plane(
      paper,
      [randomBetween(-8, 8), 0.015, randomBetween(-28, -2)],
      0.21,
      0.29,
      [-Math.PI / 2, 0, randomBetween(0, 6)],
    );
  for (let index17 = 0; index17 < 36; index17++) {
    const scaleFactor2 = randomBetween(0.03, 0.11);
    sceneKit.box(
      pick([plinth, slate, iron]),
      [randomBetween(-9, 9), scaleFactor2 / 3, randomBetween(-30, -2)],
      [scaleFactor2 * randomBetween(1, 2), scaleFactor2 * 0.6, scaleFactor2],
      [randomBetween(-0.3, 0.3), randomBetween(0, 3), randomBetween(-0.3, 0.3)],
    );
  }

  // ── The live cable, the case, the crates ───────────────────────────────────────────────────
  const cableMat = sceneKit.flat(
    sceneKit.own(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHot: { value: 1 } },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec2 vUv;uniform float uTime;uniform float uHot;void main(){float band=pow(max(0.,sin((vUv.x*38.-uTime*1.8)*3.14159)),18.);vec3 base=vec3(.05,.07,.08);vec3 hot=vec3(1.,.66,.32);gl_FragColor=vec4(base+hot*(.16+band*1.7)*uHot,1.);}',
      }),
    ),
  );
  sceneKit.mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        CABLE_PATH.map((point) => new THREE.Vector3(...point)),
      ),
      500,
      0.045,
      8,
    ),
    cableMat,
    [0, 0, 0],
  );
  // Cable clips holding it to the floor.
  const clipCurve = new THREE.CatmullRomCurve3(
    CABLE_PATH.map((point) => new THREE.Vector3(...point)),
  );
  for (let timeSeconds4 = 0.12; timeSeconds4 < 0.9; timeSeconds4 += 0.045) {
    const point2 = clipCurve.getPointAt(timeSeconds4),
      depth4 = clipCurve.getTangentAt(timeSeconds4);
    sceneKit.box(
      iron,
      [point2.x, 0.06, point2.z],
      [0.16, 0.05, 0.06],
      [0, Math.atan2(depth4.x, depth4.z), 0],
    );
  }

  // The case: a steel service case under the stairs, long side facing the hall.
  const box = new THREE.Group();
  box.position.copy(BOX_POS);
  box.name = 'case';
  const caseTex = sceneKit.tex(
    paint(512, 256, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(101);
      drawingContext.fillStyle = '#3f4b44';
      drawingContext.fillRect(0, 0, width, height);
      grain(drawingContext, width, height, rotationQuaternion, 9000, 0.14);
      grime(drawingContext, width, height, rotationQuaternion, 10);
      scratches(drawingContext, width, height, rotationQuaternion, 70);
      rust(drawingContext, width, height, rotationQuaternion, 5);
      drawingContext.fillStyle = 'rgba(222,214,192,.85)';
      drawingContext.font = '700 46px "IBM Plex Mono", monospace';
      drawingContext.fillText('B6 · SPARE', 140, 118);
      drawingContext.font = '22px "IBM Plex Mono", monospace';
      drawingContext.fillText('KEEP ON CHARGE · 充電中', 140, 156);
      drawingContext.fillStyle = '#d9a91e';
      drawingContext.fillRect(30, 90, 80, 80);
      drawingContext.fillStyle = '#16171a';
      drawingContext.font = '700 64px Arial';
      drawingContext.fillText('⚡', 40, 152);
      edgeWear(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        '#a9aaa4',
        16,
        0.9,
      );
    }),
  );
  const caseFront = sceneKit.std({
    map: caseTex,
    roughness: 0.55,
    metalness: 0.55,
  });
  const value = 1.36,
    value2 = 0.4,
    value3 = 0.62,
    LID = 0.14;
  const shell = new THREE.Group();
  box.add(shell);
  // Lower shell, front face printed, ribs and corner guards.
  // Open-topped: a floor and four walls, so the foam and the regulator sit inside.
  const WALL = 0.03;
  sceneKit.mesh(
    new THREE.BoxGeometry(value3, WALL, value),
    caseGreen,
    [0, 0.02 + WALL / 2, 0],
    shell,
  );
  for (const xPosition20 of [-value3 / 2 + WALL / 2, value3 / 2 - WALL / 2])
    sceneKit.mesh(
      new THREE.BoxGeometry(WALL, value2, value),
      caseGreen,
      [xPosition20, value2 / 2 + 0.02, 0],
      shell,
    );
  for (const zPosition23 of [-value / 2 + WALL / 2, value / 2 - WALL / 2])
    sceneKit.mesh(
      new THREE.BoxGeometry(value3 - WALL * 2, value2, WALL),
      caseGreen,
      [0, value2 / 2 + 0.02, zPosition23],
      shell,
    );
  sceneKit.mesh(
    new THREE.PlaneGeometry(value - 0.1, value2 - 0.08),
    caseFront,
    [value3 / 2 + 0.003, value2 / 2 + 0.02, 0],
    shell,
    [0, Math.PI / 2, 0],
  );
  for (const zPosition24 of [-value / 2 + 0.02, value / 2 - 0.02])
    for (const xPosition21 of [-value3 / 2 + 0.02, value3 / 2 - 0.02])
      sceneKit.mesh(
        new THREE.BoxGeometry(0.07, value2 + 0.02, 0.07),
        steelDark,
        [xPosition21, value2 / 2 + 0.02, zPosition24],
        shell,
      );
  for (const zPosition25 of [-0.25, 0.25])
    sceneKit.mesh(
      new THREE.BoxGeometry(value3 + 0.02, 0.03, 0.05),
      steelDark,
      [0, value2 - 0.02, zPosition25],
      shell,
    );
  for (const zPosition26 of [-value / 2 - 0.04, value / 2 + 0.04]) {
    sceneKit.mesh(
      new THREE.TorusGeometry(0.08, 0.016, 8, 16, Math.PI),
      chrome,
      [0, value2 * 0.7, zPosition26],
      shell,
      [0, Math.PI / 2, 0],
    );
  }
  for (const zPosition27 of [-0.5, 0.5])
    for (const xPosition22 of [-0.22, 0.22])
      sceneKit.mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
        rubber,
        [xPosition22, 0.01, zPosition27],
        shell,
      );
  // Foam bed, cut to the regulator's shape, and the charging socket the cable feeds.
  const foam = sceneKit.std({
    map: sceneKit.tex(
      paint(256, 256, (drawingContext, width, height) => {
        const rotationQuaternion = seeded(111);
        drawingContext.fillStyle = '#26292c';
        drawingContext.fillRect(0, 0, width, height);
        for (let index = 0; index < 3000; index++) {
          const group = rotationQuaternion() > 0.5 ? 255 : 0;
          drawingContext.fillStyle = `rgba(${group},${group},${group},.07)`;
          drawingContext.beginPath();
          drawingContext.arc(
            rotationQuaternion() * width,
            rotationQuaternion() * height,
            1 + rotationQuaternion() * 2,
            0,
            7,
          );
          drawingContext.fill();
        }
      }),
    ),
    roughness: 1,
    metalness: 0,
  });
  sceneKit.mesh(
    new THREE.BoxGeometry(value3 - WALL * 2, value2 - 0.12, value - WALL * 2),
    foam,
    [0, 0.05 + (value2 - 0.12) / 2, 0],
    shell,
  );
  for (const xPosition23 of [-0.24, 0.24])
    sceneKit.mesh(
      new THREE.BoxGeometry(0.08, 0.1, value - 0.1),
      foam,
      [xPosition23, value2 - 0.07, 0],
      shell,
    );
  sceneKit.mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.06, 14).rotateX(Math.PI / 2),
    steelDark,
    [value3 / 2 - 0.1, value2 * 0.55, value / 2 + 0.02],
    shell,
  );
  const caseLed = sceneKit.flat(
    sceneKit.own(
      new THREE.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false }),
    ),
  );
  sceneKit.mesh(
    new THREE.SphereGeometry(0.014, 10, 8),
    caseLed,
    [value3 / 2 + 0.01, value2 - 0.08, value / 2 - 0.14],
    shell,
  );
  // Two over-centre latches on the front.
  const latches: THREE.Group[] = [];
  for (const zPosition28 of [-0.38, 0.38]) {
    const latch = new THREE.Group();
    latch.position.set(value3 / 2 + 0.02, value2 - 0.02, zPosition28);
    latch.userData.part = latches.length === 0 ? 'latch0' : 'latch1';
    box.add(latch);
    sceneKit.mesh(
      new THREE.BoxGeometry(0.03, 0.14, 0.1),
      chrome,
      [0, -0.06, 0],
      latch,
    );
    sceneKit.mesh(
      new THREE.BoxGeometry(0.02, 0.04, 0.07),
      craneYellow,
      [0.016, -0.12, 0],
      latch,
    );
    sceneKit
      .mesh(
        new THREE.BoxGeometry(0.03, 0.05, 0.14),
        steelDark,
        [-0.005, -0.17, 0],
        box,
      )
      .position.set(value3 / 2 + 0.01, value2 - 0.2, zPosition28);
    latches.push(latch);
  }
  // Lid, hinged along the back edge, foam lined.
  const lid = new THREE.Group();
  lid.position.set(-value3 / 2, value2 + 0.02, 0);
  lid.userData.part = 'lid';
  box.add(lid);
  sceneKit.mesh(
    new THREE.BoxGeometry(value3, LID, value),
    caseGreen,
    [value3 / 2, LID / 2, 0],
    lid,
  );
  sceneKit.mesh(
    new THREE.PlaneGeometry(value - 0.1, LID - 0.04),
    sceneKit.std({
      map: wornPaintTex(sceneKit, '#3f4b44', 121),
      roughness: 0.55,
      metalness: 0.55,
    }),
    [value3 + 0.003, LID / 2, 0],
    lid,
    [0, Math.PI / 2, 0],
  );
  for (const zPosition29 of [-0.42, 0, 0.42])
    sceneKit.mesh(
      new THREE.BoxGeometry(value3 - 0.1, 0.025, 0.06),
      steelDark,
      [value3 / 2, LID + 0.012, zPosition29],
      lid,
    );
  sceneKit.mesh(
    new THREE.BoxGeometry(value3 - 0.08, 0.03, value - 0.08),
    foam,
    [value3 / 2, -0.015, 0],
    lid,
  );
  for (const zPosition30 of [-0.45, 0, 0.45])
    sceneKit.mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.14, 12).rotateX(Math.PI / 2),
      chrome,
      [0, 0, zPosition30],
      lid,
    );
  const caseGlow = new THREE.PointLight('#9fe6ff', 0, 2.6, 2);
  caseGlow.position.set(0, value2 + 0.25, 0);
  box.add(caseGlow);
  sceneKit.root.add(box);

  // The regulator, lying face up in the foam.
  const limiter: Limiter = createLimiter();
  limiter.cables.visible = false;
  const restPos = new THREE.Vector3(BOX_POS.x + 0.15, value2 - 0.1, BOX_POS.z),
    restQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2, 'YXZ'),
    );
  limiter.scale.setScalar(1.08);
  limiter.position.copy(restPos);
  limiter.quaternion.copy(restQuat);
  sceneKit.root.add(limiter);

  // Crates stacked in front of the case, with a tarp over the top crate.
  const crateGroup = new THREE.Group();
  crateGroup.name = 'crates';
  sceneKit.root.add(crateGroup);
  type Crate = {
    mesh: THREE.Object3D;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromR: THREE.Euler;
    toR: THREE.Euler;
    delay: number;
  };
  const crateList: Crate[] = [];
  const addCrate = (
    point: Vector3Tuple,
    scaleVector: Vector3Tuple,
    rotationY: number,
    to: Vector3Tuple,
    toR: Vector3Tuple,
    delay: number,
    material = pick(crates),
  ) => {
    const material3 = sceneKit.mesh(
      new THREE.BoxGeometry(...scaleVector),
      material,
      point,
      crateGroup,
      [0, rotationY, 0],
    );
    for (const deltaY of [
      -scaleVector[1] / 2 + 0.04,
      scaleVector[1] / 2 - 0.04,
    ])
      sceneKit.mesh(
        new THREE.BoxGeometry(
          scaleVector[0] + 0.01,
          0.05,
          scaleVector[2] + 0.01,
        ),
        steelDark,
        [0, deltaY, 0],
        material3,
      );
    crateList.push({
      mesh: material3,
      from: material3.position.clone(),
      to: new THREE.Vector3(...to),
      fromR: material3.rotation.clone(),
      toR: new THREE.Euler(...toR),
      delay,
    });
  };
  addCrate(
    [-8.25, 0.4, -27.15],
    [0.8, 0.8, 0.9],
    0.1,
    [-8.6, 0.4, -25.0],
    [0, 0.7, 0],
    0,
  );
  addCrate(
    [-8.2, 0.38, -28.15],
    [0.75, 0.76, 0.8],
    -0.12,
    [-7.9, 0.38, -29.7],
    [0, -0.6, 0],
    0.12,
  );
  addCrate(
    [-8.85, 0.36, -26.2],
    [0.72, 0.72, 0.72],
    0.35,
    [-9.4, 0.36, -25.0],
    [0, -0.4, 0],
    0.22,
  );
  addCrate(
    [-8.2, 1.08, -27.55],
    [0.7, 0.6, 0.75],
    0.25,
    [-6.9, 0.3, -29.1],
    [0, 1.2, Math.PI / 2],
    0.3,
  );
  // A tarp thrown over the case behind them.
  const tarp = sceneKit.mesh(
    new THREE.BoxGeometry(0.8, 0.04, 1.6),
    sceneKit.std({ color: '#2e4a5c', roughness: 0.85 }),
    [-9.3, 0.6, -27.4],
    crateGroup,
    [0, 0, 0.08],
  );
  for (const side of [-1, 1])
    sceneKit.mesh(
      new THREE.BoxGeometry(0.04, 0.42, 1.6),
      tarp.material as THREE.Material,
      [side * 0.41, -0.2, 0],
      tarp,
      [0, 0, side * -0.12],
    );
  crateList.push({
    mesh: tarp,
    from: tarp.position.clone(),
    to: new THREE.Vector3(-10.3, 0.05, -25.6),
    fromR: tarp.rotation.clone(),
    toR: new THREE.Euler(0, 0.6, 0),
    delay: 0.45,
  });
  crateGroup.userData.part = 'crates';

  sceneKit.finish();

  // ── Atmosphere: shafts of light, haze, dust ───────────────────────────────────────────────
  const shaftMat = sceneKit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        color: { value: new THREE.Color('#9fd6f2') },
        opacity: { value: 0.085 },
        uTime: { value: 0 },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 vUv;uniform vec3 color;uniform float opacity;uniform float uTime;void main(){float edge=smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x);float fall=pow(vUv.y,1.4);float n=.75+.25*sin(vUv.x*31.+uTime*.3)*sin(vUv.x*13.-uTime*.2);gl_FragColor=vec4(color,edge*fall*opacity*n);}',
    }),
  );
  for (const [xPosition24, zPosition31, width3] of [
    [-5.1, -22.5, 2.6],
    [-5.1, -26.8, 2.6],
    [3.7, -9, 2.4],
    [3.7, -19, 2.4],
    [3.7, -27, 2.2],
  ]) {
    const shaft = sceneKit.mesh(
      new THREE.PlaneGeometry(width3, 10.4),
      shaftMat,
      [xPosition24 - 0.9, 5.1, zPosition31],
      sceneKit.root,
      [0, 0, -0.16],
    );
    shaft.castShadow = shaft.receiveShadow = false;
    const shaft2 = sceneKit.mesh(
      new THREE.PlaneGeometry(width3, 10.4),
      shaftMat,
      [xPosition24 - 0.9, 5.1, zPosition31],
      sceneKit.root,
      [0, Math.PI / 2, -0.16],
    );
    shaft2.castShadow = shaft2.receiveShadow = false;
  }
  const hazeMat = (color: string, opacity: number) =>
    sceneKit.own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          color: { value: new THREE.Color(color) },
          opacity: { value: opacity },
        },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec2 vUv;uniform vec3 color;uniform float opacity;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),2.2);gl_FragColor=vec4(color,a*opacity);}',
      }),
    );
  for (const [point3, scaleVector2, colorValue, offset] of [
    [[0, 6.5, -33.6], [22, 6, 1], '#4fa3cf', 0.22],
    [[-9.6, 1.7, -11.6], [2.6, 1.6, 1], '#ffb46a', 0.16],
    [[2, 3.4, -14], [8, 6, 1], '#88c6e6', 0.07],
    [[-8.4, 0.9, -27], [2.4, 1.6, 1], '#ffb46a', 0.12],
    [[0, 2.4, 0.6], [7, 4.2, 1], '#ffb066', 0.18],
  ] as [Vector3Tuple, Vector3Tuple, string, number][]) {
    const material4 = sceneKit.mesh(
      new THREE.PlaneGeometry(1, 1),
      hazeMat(colorValue, offset),
      point3,
      sceneKit.root,
    );
    material4.scale.set(...scaleVector2);
    material4.castShadow = material4.receiveShadow = false;
  }
  const DUST = 900,
    dustGeo = sceneKit.geo(new THREE.BufferGeometry()),
    dp = new Float32Array(DUST * 3),
    ds = new Float32Array(DUST);
  for (let index18 = 0; index18 < DUST; index18++) {
    dp[index18 * 3] = randomBetween(-10, 10);
    dp[index18 * 3 + 1] = randomBetween(0.2, 9);
    dp[index18 * 3 + 2] = randomBetween(-33, -1);
    ds[index18] = result();
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(ds, 1));
  const dustMat = sceneKit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader:
        'attribute float seed;uniform float uTime;varying float vA;void main(){vec3 p=position;p.x+=sin(uTime*.12+seed*40.)*.4;p.y+=sin(uTime*.08+seed*20.)*.3;p.z+=cos(uTime*.1+seed*30.)*.4;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(1.5+seed*2.5)*(14./-mv.z);vA=.25+.5*seed;}',
      fragmentShader:
        'varying float vA;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(c));gl_FragColor=vec4(vec3(1.,.93,.82),a*vA*.55);}',
    }),
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  sceneKit.root.add(dust);

  // Beyond the back windows: the glow over the displaced city, behind its skyline.
  const skyTex = sceneKit.tex(
    paint(16, 256, (drawingContext, width, height) => {
      const group = drawingContext.createLinearGradient(0, 0, 0, height);
      group.addColorStop(0, '#060d16');
      group.addColorStop(0.45, '#14324c');
      group.addColorStop(0.7, '#3d86ad');
      group.addColorStop(0.82, '#7cc4e4');
      group.addColorStop(1, '#16314a');
      drawingContext.fillStyle = group;
      drawingContext.fillRect(0, 0, width, height);
    }),
  );
  const sky = sceneKit.mesh(
    new THREE.PlaneGeometry(420, 150),
    sceneKit.flat(
      sceneKit.own(
        new THREE.MeshBasicMaterial({
          map: skyTex,
          fog: false,
          toneMapped: false,
          depthWrite: false,
        }),
      ),
    ),
    [0, 30, -170],
  );
  sky.renderOrder = -1;

  // Fragments of the displaced city hanging under the broken skylight, turning slowly.
  const fragments: THREE.Mesh[] = [];
  for (let index19 = 0; index19 < 7; index19++) {
    const material5 = sceneKit.mesh(
      new THREE.BoxGeometry(
        randomBetween(0.3, 0.9),
        randomBetween(0.08, 0.3),
        randomBetween(0.3, 0.8),
      ),
      pick([deck, plinth, slate]),
      [
        randomBetween(-7, -3.5),
        randomBetween(6.4, 8.6),
        randomBetween(-29, -20),
      ],
      sceneKit.root,
      [randomBetween(0, 3), randomBetween(0, 3), randomBetween(0, 3)],
    );
    fragments.push(material5);
  }

  // ── Lights ─────────────────────────────────────────────────────────────────────────────────
  const lights = new THREE.Group();
  sceneKit.root.add(lights);
  const hemi = new THREE.HemisphereLight('#7aa0c0', '#0c1218', 0.62);
  lights.add(hemi);
  const moon = new THREE.DirectionalLight('#a9d4ef', 2.3);
  moon.position.set(6, 16, -8);
  moon.target.position.set(-2, 0, -18);
  lights.add(moon, moon.target);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  Object.assign(moon.shadow.camera, {
    left: -20,
    right: 20,
    top: 20,
    bottom: -20,
    near: 1,
    far: 50,
  });
  const spot = new THREE.SpotLight('#ffecd8', 85, 16, 0.55, 0.65, 1.6);
  spot.position.set(2, 8.4, -12);
  spot.target.position.set(2, 0, -15.5);
  lights.add(spot, spot.target);
  const benchLamp = new THREE.PointLight('#ffb867', 9, 6.5, 1.6);
  benchLamp.position.set(-9.9, 1.6, -11.6);
  lights.add(benchLamp);
  const corner = new THREE.PointLight('#ffb867', 4, 6, 1.6);
  corner.position.set(-7.4, 2.1, -26.4);
  lights.add(corner);
  const boothLight = new THREE.PointLight('#ffcf8f', 6, 9, 1.6);
  boothLight.position.set(7.2, 5.4, -32.4);
  lights.add(boothLight);

  // ── Animation ──────────────────────────────────────────────────────────────────────────────
  const anim = { cleared: 0, latch: [0, 0], lid: 0, lift: 0 };
  const hold = new THREE.Vector3(),
    holdQ = new THREE.Quaternion(),
    tmpQ = new THREE.Quaternion(),
    tilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.32, -0.42, 0.06),
    );
  const ease = (inputValue: number) =>
    inputValue * inputValue * (3 - 2 * inputValue);
  let shadowTick = 0;
  const shadowWas = [0, 0, 0, 0, 0];

  return {
    root: sceneKit.root,
    box,
    crates: crateGroup,
    limiter,
    anchors: {
      cradle: new THREE.Vector3(CX, 3.2, CZ - 1.4),
      jobcard: new THREE.Vector3(-9.95, 1.12, -11.75),
      toolwall: new THREE.Vector3(-10.8, 2.6, -16.6),
      cable: new THREE.Vector3(-8.5, 0.2, -12.6),
      crates: new THREE.Vector3(-8.2, 1.5, -27.4),
      latch0: new THREE.Vector3(),
      latch1: new THREE.Vector3(),
      lid: new THREE.Vector3(),
      regulator: new THREE.Vector3(),
    },
    /** Whether the shadow map needs redrawing this frame (set by update). */
    shadowsDirty: true,
    /** Moves the animated parts toward the state; `camera` places the regulator in Hiro's hands. */
    update(
      timeSeconds: number,
      deltaSeconds: number,
      state: BayState,
      camera: THREE.Camera,
    ) {
      cableMat.uniforms.uTime.value = timeSeconds;
      shaftMat.uniforms.uTime.value = timeSeconds;
      dustMat.uniforms.uTime.value = timeSeconds;
      cableMat.uniforms.uHot.value = 1 - state.lift * 0.7;
      const depth = (rate: number) => 1 - Math.exp(-deltaSeconds * rate);
      const was = shadowWas;
      was[0] = anim.cleared;
      was[1] = anim.latch[0];
      was[2] = anim.latch[1];
      was[3] = anim.lid;
      was[4] = anim.lift;
      anim.cleared += (state.cleared - anim.cleared) * depth(2.2);
      anim.latch[0] += ((state.latches[0] ? 1 : 0) - anim.latch[0]) * depth(9);
      anim.latch[1] += ((state.latches[1] ? 1 : 0) - anim.latch[1]) * depth(9);
      anim.lid += ((state.lid ? 1 : 0) - anim.lid) * depth(2.4);
      anim.lift += (state.lift - anim.lift) * depth(3);
      // Shadows only change when a caster moves: crates, latches, lid, or the regulator (which rides
      // with the camera once lifted). The fragments under the skylight turn a few milliradians a
      // second, well under a shadow texel per redraw at one frame in eight.
      const moved =
        Math.abs(anim.cleared - was[0]) +
          Math.abs(anim.latch[0] - was[1]) +
          Math.abs(anim.latch[1] - was[2]) +
          Math.abs(anim.lid - was[3]) +
          Math.abs(anim.lift - was[4]) >
        1e-5;
      this.shadowsDirty = moved || anim.lift > 1e-3 || ++shadowTick % 8 === 0;
      for (const context of crateList) {
        const resonance = ease(
          THREE.MathUtils.clamp(
            (anim.cleared - context.delay) / (1 - context.delay),
            0,
            1,
          ),
        );
        context.mesh.position.lerpVectors(context.from, context.to, resonance);
        context.mesh.position.y += Math.sin(Math.PI * resonance) * 0.25;
        context.mesh.rotation.set(
          THREE.MathUtils.lerp(context.fromR.x, context.toR.x, resonance),
          THREE.MathUtils.lerp(context.fromR.y, context.toR.y, resonance),
          THREE.MathUtils.lerp(context.fromR.z, context.toR.z, resonance),
        );
      }
      latches.forEach((group, index) => {
        group.rotation.z = anim.latch[index] * 1.9;
      });
      lid.rotation.z = ease(anim.lid) * 1.95;
      caseGlow.intensity = ease(anim.lid) * 1.8 * (1 - anim.lift);
      caseLed.color.set(
        state.lid
          ? '#7dffa6'
          : Math.sin(timeSeconds * 3) > 0
            ? '#ffb35c'
            : '#3a2410',
      );
      // Regulator: in the foam, or held up in front of Hiro, turning slightly in his hands.
      const resonance2 = ease(anim.lift);
      camera.updateMatrixWorld();
      hold.set(-0.16, -0.1, -1.5).applyMatrix4(camera.matrixWorld);
      holdQ
        .copy(camera.quaternion)
        .multiply(tilt)
        .multiply(
          tmpQ.setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            Math.sin(timeSeconds * 0.6) * 0.12,
          ),
        );
      limiter.position.lerpVectors(restPos, hold, resonance2);
      limiter.position.y += Math.sin(Math.PI * resonance2) * 0.25;
      limiter.quaternion.slerpQuaternions(restQuat, holdQ, resonance2);
      limiter.scale.setScalar(THREE.MathUtils.lerp(1.08, 1, resonance2));
      limiter.cables.visible = resonance2 > 0.35;
      limiter.setGauge(
        THREE.MathUtils.lerp(
          0.08,
          0.55 +
            Math.sin(timeSeconds * 2.1) * 0.03 +
            Math.sin(timeSeconds * 7.3) * 0.01,
          Math.max(state.charge, resonance2),
        ),
      );
      limiter.led.color.set(
        resonance2 > 0.5 ? '#7dffa6' : state.lid ? '#ffb35c' : '#2a3a33',
      );
      // Practicals: one bar at the back flickers; the corner light breathes; fragments drift.
      const callback =
        Math.sin(timeSeconds * 23) * Math.sin(timeSeconds * 7.1) > 0.55 ||
        Math.sin(timeSeconds * 1.3) > 0.96
          ? 0.15
          : 1;
      (flickerBar.material as THREE.MeshBasicMaterial).color
        .set('#ffd59a')
        .multiplyScalar(2.2 * callback);
      corner.intensity =
        (3.6 + Math.sin(timeSeconds * 1.7) * 0.4) * callback +
        caseGlow.intensity * 0.2;
      fragments.forEach((material, index) => {
        material.rotation.x += deltaSeconds * 0.05 * (index % 2 ? 1 : -1);
        material.rotation.y += deltaSeconds * 0.04;
        material.position.y +=
          Math.sin(timeSeconds * 0.5 + index) * deltaSeconds * 0.02;
      });
      // Interaction anchors, for the screen pins.
      latches[0].getWorldPosition(this.anchors.latch0);
      latches[1].getWorldPosition(this.anchors.latch1);
      this.anchors.lid
        .copy(BOX_POS)
        .add(new THREE.Vector3(0.1, value2 + 0.25, 0));
      this.anchors.regulator.copy(restPos).setY(value2 + 0.2);
    },
    dispose() {
      limiter.dispose();
      sceneKit.dispose();
    },
  };
}

/**
 * Generate the existing service-bay paint wear texture.
 */
function wornPaintTex(sceneKit: BayKit, base: string, seed: number) {
  return sceneKit.tex(
    paint(512, 128, (drawingContext, width, height) => {
      const rotationQuaternion = seeded(seed);
      drawingContext.fillStyle = base;
      drawingContext.fillRect(0, 0, width, height);
      grain(drawingContext, width, height, rotationQuaternion, 5000, 0.14);
      scratches(drawingContext, width, height, rotationQuaternion, 40);
      grime(drawingContext, width, height, rotationQuaternion, 6);
      edgeWear(
        drawingContext,
        width,
        height,
        rotationQuaternion,
        '#a9aaa4',
        10,
        0.8,
      );
    }),
  );
}

/**
 * Compose Bay 6 world interactions, inspection panels and existing storage-case progression.
 */
export type ServiceBay = ReturnType<typeof createServiceBay>;

// The bay takes most of a second to build, so the walk starts it while its fade-out plays.
let prepared: ServiceBay | null = null;
/**
 * Warm the service bay before the chapter handoff so loading remains covered.
 */
export function prepareServiceBay() {
  prepared ??= createServiceBay();
}
/**
 * Consume the prepared service bay, building it only when no prepared instance exists.
 */
export function takeServiceBay() {
  const bay = prepared ?? createServiceBay();
  prepared = null;
  return bay;
}
