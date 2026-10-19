import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { concreteTexture } from '../presentation/Surfaces';
import {
  Dressing,
  cityMaterials,
  dressRoof,
  type RandomSource,
} from '../environment/CityDressing';

/** Solid, static set dressing. Repeated surfaces are baked by material into a handful of draws. */
export function batchStaticGeometry(sceneKit: SceneKit) {
  sceneKit.root.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  sceneKit.root.traverse((sceneObject) => {
    if (
      !(sceneObject instanceof THREE.Mesh) ||
      sceneObject instanceof THREE.InstancedMesh ||
      Array.isArray(sceneObject.material) ||
      sceneObject.material.transparent
    )
      return;
    const geometry = sceneObject.geometry
      .clone()
      .applyMatrix4(sceneObject.matrixWorld);
    const compatible = geometry.index ? geometry.toNonIndexed() : geometry;
    if (compatible !== geometry) geometry.dispose();
    if (!compatible.getAttribute('uv'))
      compatible.setAttribute(
        'uv',
        new THREE.BufferAttribute(
          new Float32Array(compatible.getAttribute('position').count * 2),
          2,
        ),
      );
    const list = batches.get(sceneObject.material) ?? [];
    list.push(compatible);
    batches.set(sceneObject.material, list);
    remove.push(sceneObject);
  });
  remove.forEach((material2) => material2.removeFromParent());
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(sceneKit.ownGeometry(merged), material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    sceneKit.root.add(mesh);
  }
  sceneKit.root.traverse((sceneObject) => {
    sceneObject.updateMatrix();
    sceneObject.matrixAutoUpdate = false;
  });
  sceneKit.root.matrixAutoUpdate = true;
  return sceneKit;
}

/**
 * Create the material palette used by the surrounding city dressing.
 */
function palette(sceneKit: SceneKit) {
  const materials = {
    structure: sceneKit.standard('#344345', 0.78, 0.38),
    panel: sceneKit.standard('#59615b', 0.9, 0.16),
    enamel: sceneKit.standard('#84958a', 0.52, 0.32),
    dark: sceneKit.standard('#141f22', 0.7, 0.3),
    metal: sceneKit.standard('#768481', 0.38, 0.7),
    brass: sceneKit.standard('#a48656', 0.4, 0.65),
    rubber: sceneKit.standard('#20282a', 0.96, 0.02),
    cream: sceneKit.standard('#c4bca2', 0.8, 0.12),
    warm: sceneKit.basic('#e7c998', 1.15),
    cool: sceneKit.basic('#70bdc0', 0.75),
    glazing: sceneKit.standard('#233e44', 0.19, 0.7),
    red: sceneKit.standard('#a15c43', 0.67, 0.24),
  };
  // Fine aggregate and worn paint break up broad surfaces; one small texture per environment.
  const texture = concreteTexture();
  for (const material of [
    materials.panel,
    materials.enamel,
    materials.structure,
  ]) {
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = 0.008;
  }
  const dispose = sceneKit.dispose.bind(sceneKit);
  sceneKit.dispose = () => {
    dispose();
    texture.dispose();
  };
  return materials;
}

/**
 * Build a tube along the existing authored utility route.
 */
function pipe(
  sceneKit: SceneKit,
  startPoint: THREE.Vector3,
  endPoint: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  parent: THREE.Object3D = sceneKit.root,
) {
  const delta = endPoint.clone().sub(startPoint);
  const object = sceneKit.mesh(
    sceneKit.ownGeometry(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 10),
    ),
    material,
    {
      p: startPoint
        .clone()
        .add(endPoint)
        .multiplyScalar(0.5)
        .toArray() as ScenePlacement['p'],
    },
    parent,
  );
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
}

/** The same open workshop is seen from the lane and from the component-search apron. */
export function createBaySixArchitecture() {
  const sceneKit = new SceneKit('bay6-architecture'),
    material = palette(sceneKit);
  const slab = concreteTexture();
  slab.repeat.set(4, 4);
  const floor = sceneKit.standard('#67736b', 0.94, 0.03);
  floor.map = slab;
  floor.bumpMap = slab;
  floor.bumpScale = 0.018;
  // Doorway is genuinely open: deep service hall, solid jambs and a raised rolling shutter.
  sceneKit.box({ p: [0, -0.1, -4], s: [11.5, 0.24, 10.5] }, floor);
  for (const xPosition of [-5.3, 5.3])
    sceneKit.box(
      { p: [xPosition, 2.6, -4.3], s: [0.65, 5.2, 9] },
      material.panel,
    );
  sceneKit.box({ p: [0, 2.6, -8.7], s: [11.2, 5.2, 0.4] }, material.panel);
  for (const xPosition2 of [-4, 4]) {
    sceneKit.box(
      { p: [xPosition2, 2.65, 0.05], s: [0.42, 5.3, 0.7] },
      material.structure,
    );
    sceneKit.box(
      { p: [xPosition2, 0.8, 0.46], s: [0.48, 1.6, 0.16] },
      material.brass,
    );
    for (let yPosition = 0.18; yPosition < 1.6; yPosition += 0.3)
      sceneKit.box(
        {
          p: [xPosition2, yPosition, 0.55],
          s: [0.49, 0.11, 0.025],
          r: [0, 0, -0.5],
        },
        material.dark,
      );
  }
  // Office glazing, gate controls and electrical distribution flank the service opening.
  for (const side of [-1, 1]) {
    const xPosition3 = side * 4.7;
    sceneKit.box(
      { p: [xPosition3, 2.55, 0.02], s: [1.25, 5.1, 0.55] },
      material.enamel,
    );
    sceneKit.box(
      { p: [xPosition3, 2.72, 0.32], s: [0.94, 1.38, 0.07] },
      material.dark,
    );
    sceneKit.box(
      { p: [xPosition3, 2.72, 0.37], s: [0.77, 1.2, 0.035] },
      material.glazing,
    );
    for (const yPosition2 of [2.34, 2.72, 3.1])
      sceneKit.box(
        { p: [xPosition3, yPosition2, 0.41], s: [0.88, 0.035, 0.045] },
        material.metal,
      );
    sceneKit.box(
      { p: [xPosition3, 2.72, 0.41], s: [0.035, 1.3, 0.045] },
      material.metal,
    );
    sceneKit.box(
      { p: [xPosition3, 0.75, 0.31], s: [0.95, 1.05, 0.08] },
      material.structure,
    );
    for (let yPosition3 = 0.35; yPosition3 < 1.2; yPosition3 += 0.12)
      sceneKit.box(
        { p: [xPosition3, yPosition3, 0.37], s: [0.76, 0.035, 0.055] },
        material.dark,
      );
  }
  sceneKit.box({ p: [-3.6, 1.2, 0.6], s: [0.26, 0.52, 0.18] }, material.dark);
  sceneKit.box({ p: [-3.6, 1.3, 0.71], s: [0.17, 0.14, 0.018] }, material.cool);
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12)),
    material.red,
    { p: [-3.6, 1.1, 0.72], r: [Math.PI / 2, 0, 0] },
  );
  sceneKit.box({ p: [3.6, 1.2, 0.6], s: [0.28, 0.42, 0.18] }, material.dark);
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 12)),
    material.brass,
    { p: [3.6, 1.2, 0.73], r: [Math.PI / 2, 0, 0] },
  );
  sceneKit.box(
    { p: [0, 4.9, 0.05], s: [11.3, 0.85, 0.85] },
    material.structure,
  );
  sceneKit.box({ p: [0, 4.95, 0.51], s: [10.7, 0.57, 0.06] }, material.dark);
  sceneKit.label(
    'BAY 6  /  ROBOTICS MAINTENANCE',
    { p: [0.08, 4.95, 0.56] },
    9.7,
    '#d7ceb3',
  );
  sceneKit.label(
    'ロボティクス整備   /   NORTH SERVICE',
    { p: [-0.6, 4.57, 0.57] },
    4.8,
    '#91b4b0',
  );
  sceneKit.box({ p: [0, 4.2, -0.1], s: [7.5, 0.85, 0.33] }, material.enamel);
  for (let yPosition4 = 3.87; yPosition4 < 4.56; yPosition4 += 0.12)
    sceneKit.box(
      { p: [0, yPosition4, 0.08], s: [7.5, 0.028, 0.045] },
      material.metal,
    );
  // Solid roof and upper service offices give the workshop a complete architectural silhouette.
  sceneKit.box(
    { p: [0, 5.58, -4.3], s: [11.7, 0.32, 9.5] },
    material.structure,
  );
  for (const xPosition4 of [-5.7, 5.7])
    sceneKit.box(
      { p: [xPosition4, 5.98, -4.3], s: [0.22, 0.65, 9.6] },
      material.enamel,
    );
  for (const zPosition of [0.45, -9.05])
    sceneKit.box(
      { p: [0, 5.98, zPosition], s: [11.6, 0.65, 0.22] },
      material.enamel,
    );
  sceneKit.box({ p: [0, 7.25, -6.1], s: [10.5, 3, 5.3] }, material.panel);
  sceneKit.box(
    { p: [0, 8.85, -6.1], s: [10.9, 0.25, 5.7] },
    material.structure,
  );
  for (let xPosition5 = -4; xPosition5 <= 4; xPosition5 += 1.6) {
    sceneKit.box(
      { p: [xPosition5, 7.35, -3.42], s: [1.3, 1.65, 0.08] },
      material.dark,
    );
    sceneKit.box(
      { p: [xPosition5, 7.35, -3.36], s: [1.13, 1.45, 0.04] },
      xPosition5 === 0 ? material.warm : material.glazing,
    );
    sceneKit.box(
      { p: [xPosition5, 6.48, -3.3], s: [1.5, 0.09, 0.3] },
      material.metal,
    );
  }
  for (const side of [-1, 1])
    for (const zPosition2 of [-4.4, -6.2, -8])
      sceneKit.box(
        { p: [side * 5.29, 7.3, zPosition2], s: [0.08, 1.4, 1.15] },
        material.glazing,
      );
  for (const xPosition6 of [-3.1, 3.1]) {
    sceneKit.box(
      { p: [xPosition6, 6.15, -1.5], s: [1.6, 0.8, 1.5] },
      material.enamel,
    );
    for (let zPosition3 = -2.1; zPosition3 < -0.8; zPosition3 += 0.15)
      sceneKit.box(
        { p: [xPosition6, 6.57, zPosition3], s: [1.4, 0.035, 0.045] },
        material.dark,
      );
  }
  // Roof trusses, a short gantry track and high clerestory glazing add real parallax.
  for (const zPosition4 of [-0.65, -3.5, -6.5]) {
    sceneKit.box(
      { p: [0, 4.65, zPosition4], s: [10.3, 0.19, 0.22] },
      material.structure,
    );
    pipe(
      sceneKit,
      new THREE.Vector3(-4.9, 4.65, zPosition4),
      new THREE.Vector3(0, 5.35, zPosition4),
      0.055,
      material.metal,
    );
    pipe(
      sceneKit,
      new THREE.Vector3(4.9, 4.65, zPosition4),
      new THREE.Vector3(0, 5.35, zPosition4),
      0.055,
      material.metal,
    );
    sceneKit.box(
      { p: [0, 4.45, zPosition4], s: [4.8, 0.045, 0.16] },
      material.warm,
    );
  }
  for (const xPosition7 of [-2.8, 2.8])
    sceneKit.box(
      { p: [xPosition7, 4.85, -4.4], s: [0.12, 0.22, 8] },
      material.metal,
    );
  for (let xPosition8 = -4.6; xPosition8 < 5; xPosition8 += 1.45) {
    sceneKit.box(
      { p: [xPosition8, 3.95, -8.45], s: [1.2, 0.9, 0.08] },
      material.glazing,
    );
    sceneKit.box(
      { p: [xPosition8, 3.95, -8.37], s: [0.025, 0.9, 0.04] },
      material.metal,
    );
  }
  // Tool wall, machinist's bench and storage drawers. Warm work lights retain the opening palette.
  sceneKit.box({ p: [0, 1.75, -8.33], s: [5.1, 2.1, 0.12] }, material.dark);
  for (let xPosition9 = -2.4; xPosition9 <= 2.4; xPosition9 += 0.3)
    sceneKit.box(
      { p: [xPosition9, 1.85, -8.23], s: [0.015, 1.8, 0.025] },
      material.metal,
    );
  for (let index = 0; index < 12; index++) {
    const xPosition10 = -2.2 + index * 0.4;
    sceneKit.box(
      {
        p: [xPosition10, 1.8 + (index % 3) * 0.15, -8.13],
        s: [0.055, 0.4 + (index % 2) * 0.15, 0.045],
        r: [0, 0, index % 2 ? -0.12 : 0.12],
      },
      index % 3 ? material.cream : material.brass,
    );
  }
  sceneKit.box({ p: [0, 0.85, -7.65], s: [5.3, 0.16, 1] }, material.metal);
  for (const xPosition11 of [-1.9, 1.9]) {
    sceneKit.box(
      { p: [xPosition11, 0.4, -7.66], s: [1, 0.8, 0.85] },
      material.enamel,
    );
    for (let yPosition5 = 0.16; yPosition5 < 0.8; yPosition5 += 0.2) {
      sceneKit.box(
        { p: [xPosition11, yPosition5, -7.21], s: [0.9, 0.17, 0.045] },
        material.structure,
      );
      sceneKit.box(
        { p: [xPosition11, yPosition5, -7.17], s: [0.4, 0.025, 0.035] },
        material.metal,
      );
    }
  }
  sceneKit.box({ p: [0, 3, -7.9], s: [5.4, 0.1, 0.38] }, material.structure);
  sceneKit.box({ p: [0, 2.94, -7.8], s: [4.9, 0.035, 0.15] }, material.warm);
  // A service arm on its maintenance stand: articulated links, axle housings and a real gripper.
  const arm = new THREE.Group();
  arm.position.set(-3.65, 0, -5.65);
  arm.rotation.y = -0.3;
  sceneKit.root.add(arm);
  sceneKit.box({ p: [0, 0.22, 0], s: [1.2, 0.44, 1] }, material.structure, arm);
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CylinderGeometry(0.36, 0.42, 0.35, 20)),
    material.metal,
    { p: [0, 0.6, 0] },
    arm,
  );
  for (const [firstEntries, secondEntries] of [
    [
      [0, 0.8, 0],
      [0.1, 2.05, -0.15],
    ],
    [
      [0.1, 2.05, -0.15],
      [1.05, 2.65, 0.1],
    ],
    [
      [1.05, 2.65, 0.1],
      [1.48, 2.15, 0.55],
    ],
  ] as [number[], number[]][]) {
    pipe(
      sceneKit,
      new THREE.Vector3(...firstEntries),
      new THREE.Vector3(...secondEntries),
      0.16,
      material.enamel,
      arm,
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 16)),
      material.dark,
      { p: firstEntries as ScenePlacement['p'], r: [Math.PI / 2, 0, 0] },
      arm,
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 16)),
      material.brass,
      { p: firstEntries as ScenePlacement['p'], r: [Math.PI / 2, 0, 0] },
      arm,
    );
  }
  for (const xPosition12 of [1.35, 1.61])
    sceneKit.box(
      {
        p: [xPosition12, 1.96, 0.6],
        s: [0.08, 0.35, 0.12],
        r: [0.2, 0, xPosition12 < 1.5 ? -0.2 : 0.2],
      },
      material.metal,
      arm,
    );
  sceneKit.label(
    'ACTUATOR SERVICE  /  06',
    { p: [-3.85, 0.58, -4.94] },
    1.8,
    '#c1b99d',
  );
  // Side service cabinets, conduit runs and compressed-air cylinder.
  for (let index2 = 0; index2 < 3; index2++) {
    const xPosition13 = 3.25 + index2 * 0.55;
    sceneKit.box(
      { p: [xPosition13, 1.1, -8.13], s: [0.48, 2.1, 0.58] },
      index2 === 1 ? material.enamel : material.structure,
    );
    sceneKit.box(
      { p: [xPosition13, 1.65, -7.8], s: [0.33, 0.22, 0.035] },
      material.dark,
    );
    sceneKit.box(
      { p: [xPosition13, 1.65, -7.77], s: [0.22, 0.025, 0.015] },
      material.cool,
    );
    for (let yPosition6 = 0.4; yPosition6 < 0.95; yPosition6 += 0.11)
      sceneKit.box(
        { p: [xPosition13, yPosition6, -7.79], s: [0.32, 0.026, 0.03] },
        material.dark,
      );
  }
  for (const xPosition14 of [-5.01, 5.01]) {
    pipe(
      sceneKit,
      new THREE.Vector3(xPosition14, 0.2, -0.4),
      new THREE.Vector3(xPosition14, 3.6, -0.4),
      0.06,
      material.metal,
    );
    pipe(
      sceneKit,
      new THREE.Vector3(xPosition14, 3.6, -0.4),
      new THREE.Vector3(xPosition14, 3.6, -8.2),
      0.06,
      material.metal,
    );
  }
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CapsuleGeometry(0.2, 1.05, 4, 12)),
    material.red,
    { p: [4.62, 0.8, -5.4] },
  );
  pipe(
    sceneKit,
    new THREE.Vector3(4.62, 1.5, -5.4),
    new THREE.Vector3(4.62, 1.72, -5.4),
    0.035,
    material.brass,
  );
  // Pavement markings and fasteners are part of the same baked draw batches.
  for (const xPosition15 of [-3.25, 3.25])
    sceneKit.box(
      { p: [xPosition15, 0.034, -2.9], s: [0.07, 0.02, 6] },
      material.brass,
    );
  for (let xPosition16 = -3.65; xPosition16 < 3.7; xPosition16 += 0.42)
    sceneKit.box(
      { p: [xPosition16, 0.045, 0.6], s: [0.18, 0.025, 0.58], r: [0, 0.5, 0] },
      material.brass,
    );
  for (const xPosition17 of [-4, 4])
    for (const yPosition7 of [0.2, 1.65, 3.4, 4.75])
      sceneKit.mesh(
        sceneKit.ownGeometry(
          new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8),
        ),
        material.metal,
        { p: [xPosition17, yPosition7, 0.43], r: [Math.PI / 2, 0, 0] },
      );
  const kit = batchStaticGeometry(sceneKit),
    disposeKit = kit.dispose.bind(kit);
  kit.dispose = () => {
    disposeKit();
    slab.dispose();
  };
  return kit;
}

/** Close urban detail along the existing guided route; fixed meshes, no running city simulation. */
export function createServiceStreetDetail() {
  const sceneKit = new SceneKit('north-service-street-detail'),
    material = palette(sceneKit);
  const random = seeded(61243),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  // Roof plant, tanks, masts and signs (instanced), on their own seed so the street layout holds.
  const dress = new Dressing(sceneKit),
    cm = cityMaterials(sceneKit),
    roofRandom: RandomSource = seeded(61244);
  const map = concreteTexture();
  map.repeat.set(6, 40);
  const paving = sceneKit.standard('#67736f', 0.94, 0.02);
  paving.map = map;
  paving.bumpMap = map;
  paving.bumpScale = 0.018;
  sceneKit.box({ p: [0, 0.025, -28], s: [12.2, 0.035, 83] }, paving);
  const shops = [
    'MIYAZAKI  /  MACHINE WORKS',
    '港湾工具  /  HARBOUR TOOLS',
    'NORTH SERVICE  /  ELECTRICAL',
    'ROBOTRONICS  /  PARTS + REPAIR',
  ];
  for (const side of [-1, 1]) {
    const blocks = [
      { z: 5, w: 10, h: 11, d: 8 },
      { z: -7, w: 10, h: 18, d: 10 },
      { z: -20, w: 12, h: 13, d: 9 },
      { z: -34, w: 11, h: 23, d: 12 },
      { z: -47, w: 10, h: 10, d: 8 },
      { z: -58, w: 8, h: 16, d: 11 },
    ];
    blocks.forEach(
      ({ z: zPosition, w: width, h: height2, d: depth }, index) => {
        const shop = new THREE.Group();
        shop.position.set(side * 6.65, 0, zPosition + (side > 0 ? -0.7 : 0));
        shop.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        sceneKit.root.add(shop);
        const facade =
          index % 3 === 0
            ? material.enamel
            : index % 3 === 1
              ? material.panel
              : material.structure;
        const height = height2 + (side > 0 ? 2 : 0);
        sceneKit.box(
          { p: [0, height / 2, -depth / 2 - 0.2], s: [width, height, depth] },
          facade,
          shop,
        );
        sceneKit.box(
          { p: [0, 0.18, 0.05], s: [width + 0.25, 0.36, 1.1] },
          material.structure,
          shop,
        );
        sceneKit.box(
          { p: [0, 4.1, 0.05], s: [width + 0.2, 0.22, 0.55] },
          material.metal,
          shop,
        );
        sceneKit.box(
          {
            p: [0, height + 0.12, -depth / 2],
            s: [width + 0.5, 0.3, depth + 0.6],
          },
          material.dark,
          shop,
        );
        for (const xPosition of [-width / 2, width / 2])
          sceneKit.box(
            {
              p: [xPosition, height + 0.45, -depth / 2],
              s: [0.2, 0.7, depth + 0.5],
            },
            material.panel,
            shop,
          );
        sceneKit.box(
          { p: [0, height + 0.45, 0.18], s: [width, 0.7, 0.18] },
          material.panel,
          shop,
        );
        sceneKit.box(
          { p: [width * 0.18, height + 0.7, -depth * 0.62], s: [2, 1.2, 2.4] },
          material.metal,
          shop,
        );
        shop.updateMatrix();
        dressRoof(
          dress,
          cm,
          shop.matrix
            .clone()
            .multiply(
              new THREE.Matrix4().makeTranslation(0, 0, -depth / 2 - 0.2),
            ),
          width,
          height + 0.3,
          depth,
          roofRandom,
          { parapet: false, sign: index === 2 || index === 5 },
        );
        // Three kinds of street frontage: workshop shutter, glazed parts shop, recessed loading bay.
        if (index % 3 === 0) {
          sceneKit.box(
            { p: [-0.9, 1.9, 0.04], s: [width * 0.65, 3.3, 0.15] },
            material.dark,
            shop,
          );
          for (let yPosition = 0.4; yPosition < 3.4; yPosition += 0.18)
            sceneKit.box(
              { p: [-0.9, yPosition, 0.13], s: [width * 0.62, 0.12, 0.09] },
              material.metal,
              shop,
            );
          sceneKit.box(
            { p: [-0.9, 3.65, 0.5], s: [width * 0.7, 0.15, 1.3] },
            material.enamel,
            shop,
          );
        } else if (index % 3 === 1) {
          sceneKit.box(
            { p: [-1, 1.95, 0.04], s: [width * 0.65, 2.9, 0.15] },
            material.dark,
            shop,
          );
          for (
            let xPosition2 = -width * 0.36;
            xPosition2 < width * 0.2;
            xPosition2 += 1.6
          ) {
            sceneKit.box(
              { p: [xPosition2, 1.95, 0.14], s: [1.35, 2.6, 0.05] },
              material.glazing,
              shop,
            );
            sceneKit.box(
              { p: [xPosition2, 1.08, 0.18], s: [1.36, 0.055, 0.06] },
              material.metal,
              shop,
            );
          }
          sceneKit.box(
            {
              p: [-1, 3.55, 0.68],
              s: [width * 0.7, 0.14, 1.7],
              r: [0.09, 0, 0],
            },
            material.red,
            shop,
          );
          sceneKit.box(
            { p: [-1, 3.44, 1.45], s: [width * 0.65, 0.04, 0.06] },
            material.warm,
            shop,
          );
        } else {
          sceneKit.box(
            { p: [-1, 1.8, 0.025], s: [width * 0.62, 3.5, 0.12] },
            material.dark,
            shop,
          );
          for (const xPosition3 of [-width * 0.4, width * 0.22])
            sceneKit.box(
              { p: [xPosition3, 1.9, 0.4], s: [0.32, 3.8, 0.9] },
              material.enamel,
              shop,
            );
          sceneKit.box(
            { p: [-1, 3.9, 0.4], s: [width * 0.7, 0.35, 0.9] },
            material.structure,
            shop,
          );
          for (const xPosition4 of [-2, 0])
            sceneKit.box(
              { p: [xPosition4, 0.55, 0.15], s: [1.2, 1.1, 0.25] },
              material.brass,
              shop,
            );
        }
        sceneKit.box(
          { p: [width * 0.34, 1.55, 0.08], s: [1.25, 3, 0.18] },
          material.dark,
          shop,
        );
        sceneKit.box(
          { p: [width * 0.34, 2, 0.2], s: [0.96, 1.55, 0.035] },
          index === 4 ? material.warm : material.glazing,
          shop,
        );
        sceneKit.box(
          { p: [width * 0.34 + 0.4, 1.3, 0.24], s: [0.035, 0.35, 0.06] },
          material.brass,
          shop,
        );
        sceneKit.box(
          { p: [-0.4, 4.48, 0.12], s: [width * 0.85, 0.55, 0.22] },
          material.dark,
          shop,
        );
        if (index !== 3)
          sceneKit.label(
            shops[(index + (side > 0 ? 1 : 0)) % shops.length],
            { p: [-0.4, 4.48, 0.25] },
            width * 0.78,
            index % 2 ? '#b1cfca' : '#dfc39b',
            shop,
          );
        const columns = Math.floor(width / 2.3),
          rows = Math.floor((height - 5) / 2.5);
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < columns; col++) {
            const xPosition5 = (col - (columns - 1) / 2) * 2.3,
              yPosition2 = 5.65 + row * 2.5;
            sceneKit.box(
              { p: [xPosition5, yPosition2, -0.13], s: [1.5, 1.65, 0.18] },
              material.dark,
              shop,
            );
            sceneKit.box(
              { p: [xPosition5, yPosition2, 0.01], s: [1.25, 1.4, 0.06] },
              (row * 3 + col + index) % 11 === 0
                ? material.warm
                : material.glazing,
              shop,
            );
            sceneKit.box(
              { p: [xPosition5, yPosition2 - 0.85, 0.13], s: [1.7, 0.1, 0.38] },
              material.metal,
              shop,
            );
          }
        // Windows continue around solid end walls, so alleys reveal depth instead of blank planes.
        for (const edge of [-1, 1])
          for (
            let yPosition3 = 5.65;
            yPosition3 < height - 1;
            yPosition3 += 2.5
          )
            for (
              let zPosition2 = -2;
              zPosition2 > -depth + 1;
              zPosition2 -= 2.3
            )
              sceneKit.box(
                {
                  p: [edge * (width / 2 + 0.025), yPosition3, zPosition2],
                  s: [0.06, 1.4, 1.15],
                },
                material.glazing,
                shop,
              );
        for (const yPosition4 of [4.9, height - 1])
          sceneKit.box(
            {
              p: [0, yPosition4, -depth / 2],
              s: [width + 0.18, 0.13, depth + 0.2],
            },
            material.metal,
            shop,
          );
        pipe(
          sceneKit,
          new THREE.Vector3(width / 2 - 0.3, 0.4, 0.24),
          new THREE.Vector3(width / 2 - 0.3, height, 0.24),
          0.05,
          material.metal,
          shop,
        );
        if (index === 1 || index === 3) {
          const localX = -width * 0.35;
          for (const deltaX of [-0.32, 0.32])
            sceneKit.box(
              {
                p: [localX + deltaX, height * 0.55, 0.5],
                s: [0.045, height * 0.8, 0.045],
              },
              material.metal,
              shop,
            );
          for (let yPosition5 = 2; yPosition5 < height - 1; yPosition5 += 0.4)
            sceneKit.box(
              { p: [localX, yPosition5, 0.5], s: [0.65, 0.035, 0.05] },
              material.metal,
              shop,
            );
          for (const yPosition6 of [6, 11])
            if (yPosition6 < height)
              sceneKit.box(
                { p: [localX, yPosition6, 0.75], s: [1.35, 0.1, 1.4] },
                material.structure,
                shop,
              );
        }
      },
    );
    // Raised service walk, drainage slots, bollards and conduits catch light close to camera.
    sceneKit.box(
      { p: [side * 5.6, 0.13, -28], s: [1.1, 0.26, 82] },
      material.panel,
    );
    for (let zPosition3 = 7; zPosition3 > -60; zPosition3 -= 3) {
      sceneKit.box(
        { p: [side * 5, 0.043, zPosition3], s: [0.36, 0.025, 0.85] },
        material.dark,
      );
      for (let deltaZ = -0.3; deltaZ <= 0.3; deltaZ += 0.15)
        sceneKit.box(
          {
            p: [side * 5, 0.062, zPosition3 + deltaZ],
            s: [0.32, 0.025, 0.025],
          },
          material.metal,
        );
    }
    for (let zPosition4 = 3; zPosition4 > -60; zPosition4 -= 14) {
      sceneKit.mesh(
        sceneKit.ownGeometry(new THREE.CylinderGeometry(0.095, 0.13, 0.85, 12)),
        material.structure,
        { p: [side * 4.6, 0.45, zPosition4] },
      );
      sceneKit.mesh(
        sceneKit.ownGeometry(
          new THREE.CylinderGeometry(0.102, 0.102, 0.14, 12),
        ),
        material.brass,
        { p: [side * 4.6, 0.7, zPosition4] },
      );
    }
  }
  // Cable trays and suspended service lines: an occupied city, not free-standing cubes.
  for (const zPosition5 of [-10, -35, -52]) {
    sceneKit.box(
      { p: [0, 7.7, zPosition5], s: [13.7, 0.17, 0.3] },
      material.structure,
    );
    for (const xPosition6 of [-6.2, 6.2])
      sceneKit.box(
        { p: [xPosition6, 5.8, zPosition5], s: [0.14, 4.1, 0.14] },
        material.metal,
      );
    for (const xPosition7 of [-0.4, 0, 0.4]) {
      const points = [
        new THREE.Vector3(-6.2, 7.4 + xPosition7, zPosition5),
        new THREE.Vector3(0, 6.6 + xPosition7, zPosition5 + 0.3),
        new THREE.Vector3(6.2, 7.4 + xPosition7, zPosition5),
      ];
      sceneKit.mesh(
        sceneKit.ownGeometry(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            24,
            0.022,
            5,
            false,
          ),
        ),
        material.rubber,
        { p: [0, 0, 0] },
      );
    }
  }
  // Broken pavement and compact cargo stacks preserve the safe guided center lane.
  for (let index2 = 0; index2 < 16; index2++) {
    const side = index2 % 2 ? -1 : 1,
      xPosition8 = side * randomBetween(3.6, 4.6),
      zPosition6 = randomBetween(-57, 5);
    sceneKit.box(
      {
        p: [xPosition8, 0.2, zPosition6],
        s: [randomBetween(0.35, 0.9), 0.28, randomBetween(0.4, 1)],
        r: [
          randomBetween(-0.15, 0.15),
          randomBetween(-1, 1),
          randomBetween(-0.2, 0.2),
        ],
      },
      index2 % 3 ? material.panel : material.dark,
    );
  }
  for (const [xPosition9, zPosition7] of [
    [-4.2, -17],
    [4.2, -45],
  ]) {
    sceneKit.box(
      { p: [xPosition9, 0.5, zPosition7], s: [0.95, 0.9, 1.1] },
      material.enamel,
    );
    for (const xx of [-0.32, 0.32])
      sceneKit.box(
        {
          p: [xPosition9 + xx, 0.52, zPosition7 + 0.56],
          s: [0.035, 0.85, 0.035],
        },
        material.metal,
      );
    sceneKit.box(
      { p: [xPosition9, 0.75, zPosition7 + 0.575], s: [0.56, 0.18, 0.02] },
      material.brass,
    );
  }
  const kit = batchStaticGeometry(sceneKit);
  dress.build();
  const disposeKit = kit.dispose.bind(kit);
  kit.dispose = () => {
    disposeKit();
    map.dispose();
  };
  return kit;
}

/** Compact yard neighbors retain depth in the workshop's wide shots at low draw cost. */
export function createYardSurroundings() {
  const sceneKit = new SceneKit('bay6-yard-surroundings'),
    material = palette(sceneKit);
  for (const [xPosition, zPosition, width, height, depth] of [
    [-10, -15, 6, 10, 8],
    [11, -16, 7, 12, 9],
    [-9, -29, 7, 15, 8],
    [15, -31, 8, 17, 11],
    [-13, 3, 7, 8, 8],
    [13, 4, 7, 9, 8],
  ]) {
    sceneKit.box(
      { p: [xPosition, height / 2, zPosition], s: [width, height, depth] },
      material.panel,
    );
    for (let yPosition = 1.5; yPosition < height; yPosition += 2.1)
      for (let xx = -width / 2 + 0.8; xx < width / 2; xx += 1.6) {
        sceneKit.box(
          {
            p: [xPosition + xx, yPosition, zPosition + depth / 2 + 0.025],
            s: [1.1, 1.25, 0.07],
          },
          material.dark,
        );
        sceneKit.box(
          {
            p: [xPosition + xx, yPosition, zPosition + depth / 2 + 0.07],
            s: [0.9, 1.05, 0.035],
          },
          Math.round(yPosition + xx) % 9 ? material.glazing : material.warm,
        );
        sceneKit.box(
          {
            p: [xPosition + xx, yPosition - 0.66, zPosition + depth / 2 + 0.2],
            s: [1.25, 0.09, 0.45],
          },
          material.metal,
        );
      }
    for (const side of [-1, 1])
      for (let yPosition2 = 1.5; yPosition2 < height; yPosition2 += 2.1)
        for (let zz = -depth / 2 + 1; zz < depth / 2; zz += 1.9) {
          sceneKit.box(
            {
              p: [
                xPosition + side * (width / 2 + 0.035),
                yPosition2,
                zPosition + zz,
              ],
              s: [0.07, 1.25, 1.15],
            },
            material.dark,
          );
          sceneKit.box(
            {
              p: [
                xPosition + side * (width / 2 + 0.08),
                yPosition2,
                zPosition + zz,
              ],
              s: [0.035, 1.05, 0.95],
            },
            material.glazing,
          );
          sceneKit.box(
            {
              p: [
                xPosition + side * (width / 2 + 0.14),
                yPosition2 - 0.67,
                zPosition + zz,
              ],
              s: [0.3, 0.09, 1.3],
            },
            material.metal,
          );
        }
    sceneKit.box(
      {
        p: [xPosition, height + 0.85, zPosition],
        s: [width * 0.45, 1.3, depth * 0.35],
      },
      material.dark,
    );
    for (let yPosition3 = 3; yPosition3 < height; yPosition3 += 4.2)
      sceneKit.box(
        {
          p: [xPosition, yPosition3, zPosition + depth / 2 + 0.05],
          s: [width, 0.12, 0.3],
        },
        material.structure,
      );
    sceneKit.box(
      {
        p: [xPosition, height + 0.18, zPosition],
        s: [width + 0.3, 0.3, depth + 0.3],
      },
      material.structure,
    );
  }
  sceneKit.box({ p: [0, -0.25, -15], s: [45, 0.45, 62] }, material.structure);
  for (const xPosition2 of [-4.65, 4.65]) {
    for (let zPosition2 = 11; zPosition2 > -8; zPosition2 -= 3) {
      sceneKit.box(
        { p: [xPosition2, 0.6, zPosition2], s: [0.11, 1.2, 0.11] },
        material.metal,
      );
      for (const yPosition4 of [0.45, 1])
        sceneKit.box(
          { p: [xPosition2, yPosition4, zPosition2 - 1.5], s: [0.06, 0.06, 3] },
          material.structure,
        );
    }
  }
  return batchStaticGeometry(sceneKit);
}
