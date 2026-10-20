import * as THREE from 'three';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { createCityBackdrop } from '../presentation/Backdrop';
import { concreteTexture } from '../presentation/Surfaces';

/** A camera beat along the service lane: where the eye rests and what it looks toward. */
export type Stop = { name: string; pos: THREE.Vector3; look: THREE.Vector3 };

/**
 * A compact, highly directed slice of the same corrupted San Fransokyo — a damaged harbour
 * service district. Three depth layers (foreground framing, the service lane and its shops,
 * the broken skyline and dimensional fracture beyond). Baymax lies in the robotics bay on the
 * right, framed by a maintenance gantry that collapsed against the wall behind him.
 *
 * Art direction continues Phase 1: neutral/slate architecture, cyan atmospheric depth, warm
 * practical lights, and a single red presence on Baymax. The location changes, not the look.
 */
export function createDistrict() {
  const group = new THREE.Group();
  group.name = 'harbour-service-district';
  const random = seeded(4821);

  // --- Background: the displaced portal city, pushed far back and down for a skyline.
  const city = createCityBackdrop();
  const cityGroup = city.group as THREE.Group;
  cityGroup.position.set(2, -1.5, -34);
  cityGroup.scale.setScalar(1.15);
  group.add(cityGroup);

  const sceneKit = new SceneKit('district-props');
  sceneKit.concrete.color.set('#3f4b50');
  sceneKit.ivory.color.set('#77827f');
  sceneKit.edge.color.set('#243036');
  sceneKit.metal.color.set('#687674');
  sceneKit.dim.color.set('#294954');
  group.add(sceneKit.root);

  // Warmer practical materials layered onto the Phase 1 slate palette.
  const warmDim = sceneKit.basic('#c9772f', 1);
  const sign = sceneKit.basic('#7fe6ff', 1.4);
  const signWarm = sceneKit.basic('#ff8a53', 1.2);
  const amber = sceneKit.basic('#ffc15a', 1.5);
  const rust = sceneKit.standard('#5a4336', 0.85, 0.25);
  const shutter = sceneKit.standard('#39474f', 0.5, 0.7);
  const floorTexture = concreteTexture();
  floorTexture.repeat.set(3, 7);
  const floor = sceneKit.standard('#68736e', 0.94, 0.02);
  floor.map = floorTexture;
  floor.bumpMap = floorTexture;
  floor.bumpScale = 0.025;

  // === GROUND: the service lane, with slabs shifted by dimensional distortion. ===
  sceneKit.box(
    { p: [1, -1.4, -6], s: [13, 0.6, 30], r: [0, 0.04, 0] },
    sceneKit.edge,
  );
  sceneKit.box(
    { p: [1, -1.06, -6], s: [12.6, 0.05, 29.6], r: [0, 0.04, 0] },
    floor,
  );
  // Lifted / rotated road pieces near the fracture.
  sceneKit.box(
    { p: [-3.6, -0.7, -14], s: [4.5, 0.2, 5], r: [0.22, 0.1, 0.16] },
    sceneKit.concrete,
  );
  sceneKit.box(
    { p: [5.2, -0.55, -16], s: [3.4, 0.18, 4], r: [-0.18, -0.2, -0.12] },
    sceneKit.concrete,
  );
  const marks: ScenePlacement[] = [];
  for (let index = 0; index < 9; index++)
    marks.push({
      p: [0.4, -1.02, 7 - index * 2.6],
      s: [0.12, 0.02, 1.3],
      r: [0, 0.04, 0],
    });
  sceneKit.instances(marks, sceneKit.metal);

  // === LEFT: broken shopfronts, a service shop with shutter, signage, vending. ===
  for (let index2 = 0; index2 < 4; index2++) {
    const zPosition = 2 - index2 * 5.5,
      height = 7 + random() * 4;
    sceneKit.box(
      {
        p: [-6.6, height / 2 - 1.1, zPosition],
        s: [3.2, height, 4.4],
        r: [0, 0.12, 0.02 * (index2 % 2 ? 1 : -1)],
      },
      sceneKit.ivory,
    );
    // Window rows.
    const win: ScenePlacement[] = [];
    for (let radius = 0; radius < Math.floor(height / 1.8); radius++)
      for (let componentValue = 0; componentValue < 2; componentValue++)
        win.push({
          p: [
            -5.02,
            -0.2 + radius * 1.8,
            zPosition - 0.9 + componentValue * 1.8,
          ],
          s: [0.02, 1, 0.9],
          r: [0, 0.12, 0],
        });
    sceneKit.instances(win, sceneKit.dim);
  }
  // The service shop: open bay with a half-dropped robotics-maintenance shutter.
  sceneKit.box(
    { p: [-4.5, 0.5, 1.2], s: [0.25, 3.6, 3.6], r: [0, 0.12, 0] },
    rust,
  );
  sceneKit.box(
    { p: [-4.4, 1.9, 1.2], s: [0.12, 1.6, 3.4], r: [0, 0.12, 0] },
    shutter,
  );
  for (let index3 = 0; index3 < 7; index3++)
    sceneKit.box(
      {
        p: [-4.38, 1.2 + index3 * 0.2, 1.2],
        s: [0.06, 0.04, 3.3],
        r: [0, 0.12, 0],
      },
      sceneKit.dark,
    );
  // Bilingual signage (San Fransokyo), one surviving cyan, one dead warm.
  sceneKit.label(
    'ロボ整備 / ROBOTICS SVC',
    { p: [-4.2, 3.1, 2], r: [0, 0.12 + Math.PI / 2, 0] },
    3.4,
    '#8fe9ff',
  );
  sceneKit.label(
    '港湾 24 / BAY 24',
    { p: [-4.9, 1.4, -4.4], r: [0, 0.12 + Math.PI / 2, 0] },
    2.6,
    '#ff9a63',
  );
  sceneKit.mesh(new THREE.PlaneGeometry(3.7, 0.6), sceneKit.dark, {
    p: [-4.24, 3.1, 2],
    r: [0, 0.12 + Math.PI / 2, 0],
  });
  // Vending / service units with their own glow.
  for (const [zPosition2, material] of [
    [-1.3, sign],
    [-2.6, signWarm],
  ] as const) {
    sceneKit.box(
      { p: [-3.9, -0.35, zPosition2], s: [0.9, 1.5, 0.8], r: [0, 0.1, 0] },
      rust,
    );
    sceneKit.mesh(new THREE.PlaneGeometry(0.55, 1), material, {
      p: [-3.42, -0.3, zPosition2],
      r: [0, 0.1 + Math.PI / 2, 0],
    });
  }

  // === RIGHT: the robotics bay where Baymax lies, screened by a collapsed gantry. ===
  sceneKit.box(
    { p: [7, 1.3, -5], s: [3, 9, 6], r: [0, -0.16, -0.03] },
    sceneKit.ivory,
  );
  // A loose wall panel, propped against the bay's face rather than out on the apron.
  sceneKit.box(
    { p: [5.4, 0.6, -3.6], s: [0.2, 3.4, 3.4], r: [0, -0.16, 0.04] },
    rust,
  );
  // Collapsed maintenance gantry, fallen against the bay wall behind him: it frames Baymax, never hides him.
  sceneKit.box(
    { p: [6.3, 0.9, -9], s: [3.2, 0.4, 0.4], r: [0.1, 0.3, -0.5] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [5.3, 0.4, -9.3], s: [0.35, 2.6, 0.35], r: [0.3, 0, 0.55] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [7.1, 1.5, -9.6], s: [2.6, 0.35, 0.35], r: [-0.1, -0.2, 0.35] },
    sceneKit.metal,
  );
  // A broken concrete section under the fallen gantry gives Baymax's shoulders
  // a believable resting point while keeping the chest bay and both legs clear.
  sceneKit.box(
    { p: [2.7, -0.54, -7.35], s: [2.05, 1.65, 0.46] },
    sceneKit.concrete,
  ).name = 'recovery-backstop';
  sceneKit.box(
    { p: [7.1, -0.55, -1.6], s: [1.8, 0.9, 1.4], r: [0, 0.2, 0.12] },
    sceneKit.concrete,
  );
  // A charging point beside the bay (its light steadies later, in engineering).
  sceneKit.box(
    { p: [5.25, -0.55, -6.5], s: [0.5, 1.1, 0.5], r: [0, -0.1, 0] },
    rust,
  );
  sceneKit.mesh(new THREE.PlaneGeometry(0.3, 0.5), warmDim, {
    p: [5.25, -0.3, -6.22],
    r: [0, 0, 0],
  });
  // A maintenance cart with a tool bench.
  sceneKit.box(
    { p: [-1.2, -0.7, -9], s: [1.4, 0.7, 0.9], r: [0, 0.3, 0] },
    rust,
  );
  sceneKit.box(
    { p: [-1.2, -0.32, -9], s: [1.5, 0.08, 1], r: [0, 0.3, 0] },
    sceneKit.metal,
  );
  // The service apron he lies on: worn ground and painted corner marks, kept clear of debris.
  const paint = sceneKit.standard('#b89a52', 0.85, 0.05);
  sceneKit.box(
    { p: [2.4, -1.025, -4.8], s: [5.6, 0.01, 5], r: [0, 0.04, 0] },
    sceneKit.edge,
  );
  for (const [cx, cz, scaleX, scaleZ] of [
    [-1, -1, 1, 1],
    [1, -1, -1, 1],
    [-1, 1, 1, -1],
    [1, 1, -1, -1],
  ] as const) {
    const xPosition = 2.4 + cx * 2.7,
      zPosition3 = -4.8 + cz * 2.4;
    sceneKit.box(
      {
        p: [xPosition + scaleX * 0.4, -1.015, zPosition3],
        s: [0.8, 0.012, 0.08],
        r: [0, 0.04, 0],
      },
      paint,
    );
    sceneKit.box(
      {
        p: [xPosition, -1.015, zPosition3 + scaleZ * 0.4],
        s: [0.08, 0.012, 0.8],
        r: [0, 0.04, 0],
      },
      paint,
    );
  }

  // === FOREGROUND: utility poles, hanging cables, a broken street light framing the shot. ===
  sceneKit.box(
    { p: [-2.2, 1.5, 6.5], s: [0.18, 6, 0.18], r: [0, 0, 0.04] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [-2.2, 4.2, 6.2], s: [2.2, 0.14, 0.14], r: [0, 0, -0.12] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [6.2, 2, 5.5], s: [0.2, 7, 0.2], r: [0, 0, -0.05] },
    sceneKit.metal,
  );
  // A broken, amber street lamp — one of the only warm sources near the lane.
  sceneKit.mesh(new THREE.SphereGeometry(0.16, 12, 10), amber, {
    p: [6.2, 5.3, 5.5],
  });
  // Drooping cables between the poles.
  for (let index4 = 0; index4 < 4; index4++) {
    const sag = 0.5 + index4 * 0.18,
      points = [
        new THREE.Vector3(-2.2, 4.1 - index4 * 0.25, 6.2),
        new THREE.Vector3(2, 3.2 - sag, 4),
        new THREE.Vector3(6.2, 4 - index4 * 0.25, 5.4),
      ];
    sceneKit.line(
      new THREE.CatmullRomCurve3(points).getPoints(28),
      '#0c1620',
      0.85,
    );
  }

  // === DISTANCE: monorail remains, a collapsed pedestrian bridge, the dimensional fracture. ===
  sceneKit.box(
    { p: [-8, 6, -24], s: [1, 0.9, 26], r: [0, 0.14, 0.05] },
    sceneKit.edge,
  );
  for (let index5 = 0; index5 < 6; index5++)
    sceneKit.box(
      {
        p: [-8 + index5 * 0.4, 2.6 + index5 * 0.4, -16 - index5 * 3],
        s: [0.5, 7, 0.5],
        r: [0, 0, 0.08],
      },
      sceneKit.dark,
    );
  // Collapsed pedestrian bridge, sheared mid-span.
  sceneKit.box(
    { p: [3, 5.5, -22], s: [10, 0.5, 2], r: [-0.12, 0.1, -0.22] },
    sceneKit.concrete,
  );
  sceneKit.box(
    { p: [8.5, 3, -22], s: [0.5, 5, 2], r: [0, 0, 0.1] },
    sceneKit.edge,
  );
  // The dimensional fracture: cyan/violet light bleeding between displaced blocks.
  const fractureMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#7fd6ff').multiplyScalar(1.6),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const fracture = sceneKit.mesh(
    new THREE.PlaneGeometry(1.4, 18),
    fractureMat,
    { p: [-2, 6, -30], r: [0, 0.1, 0.3] },
  );
  sceneKit.haze({ p: [-2, 6, -29], s: [10, 16, 1] }, '#4aa6d8', 0.2);
  sceneKit.haze({ p: [2, 0, -12], s: [14, 8, 1] }, '#2d5f82', 0.16);
  sceneKit.haze({ p: [0, 1, 2], s: [16, 10, 1] }, '#24506f', 0.1);

  // === LIGHTING: one cool key, selective warm practicals, Baymax's red is added by the scene. ===
  const hemi = new THREE.HemisphereLight('#9fb6c2', '#10171a', 0.55);
  group.add(hemi);
  const key = new THREE.DirectionalLight('#dcdfdc', 2.3);
  key.position.set(-8, 16, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 45;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  // Small depth bias plus a normal offset: tight contact under the reclined shell without acne.
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  group.add(key);
  // Warm practicals: workshop interior, the amber lamp, a vending unit.
  const shopLight = new THREE.PointLight('#ffb878', 4.6, 10, 1.8);
  shopLight.position.set(-3.8, 1.4, 1);
  group.add(shopLight);
  const lampLight = new THREE.PointLight('#ffd19a', 3.4, 9, 2);
  lampLight.position.set(6.2, 5.1, 5.2);
  group.add(lampLight);
  // Cool bleed from the fracture: a soft, unshadowed rim from behind and above the bay that traces
  // Baymax's shoulders and head and separates him from the debris wall he rests against.
  const fractureRim = new THREE.SpotLight('#8fc2e4', 34, 15, 0.62, 0.9, 2);
  fractureRim.position.set(0.6, 6.2, -11.5);
  fractureRim.target.position.set(2.4, 0.9, -4.8);
  group.add(fractureRim, fractureRim.target);

  group.position.set(0, 0, 0);

  // Authored camera beats. Baymax (anchor below) is hidden until DISCOVER.
  const stops: Stop[] = [
    {
      name: 'arrive',
      pos: new THREE.Vector3(0.4, 1.75, 9),
      look: new THREE.Vector3(0.2, 1.4, -3),
    },
    {
      name: 'lane',
      pos: new THREE.Vector3(1.4, 1.6, 4.6),
      look: new THREE.Vector3(1, 1.3, -6),
    },
    {
      name: 'corner',
      pos: new THREE.Vector3(3.3, 1.6, 2),
      look: new THREE.Vector3(4.6, 0.4, -3.6),
    },
  ];
  const baymaxAnchor = new THREE.Vector3(2.4, 0, -4.8);

  let flicker = 0;
  return {
    group,
    stops,
    baymaxAnchor,
    /** The district's own props (not the far city): what the board may hide when it blocks the view. */
    props: sceneKit.root,
    update(time: number, deltaSeconds: number, reduced: boolean) {
      flicker = reduced
        ? 1
        : 0.82 +
          0.18 *
            Math.sin(time * 23 + Math.sin(time * 7)) *
            (Math.random() > 0.04 ? 1 : 0.3);
      shopLight.intensity = 4.6 * flicker;
      fractureMat.opacity = reduced
        ? 0.9
        : 0.7 + 0.3 * Math.abs(Math.sin(time * 0.9));
      fracture.rotation.z = 0.3 + Math.sin(time * 0.3) * 0.02;
    },
    dispose() {
      floorTexture.dispose();
      city.dispose();
      sceneKit.dispose();
      group.removeFromParent();
    },
  };
}
export type District = ReturnType<typeof createDistrict>;
