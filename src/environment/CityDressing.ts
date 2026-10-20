import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SceneKit } from '../phase2/SceneKit';
import { concreteTexture } from '../presentation/Surfaces';

/**
 * Street dressing for the city outside Bay 6 (Phases 4 to 6): storey-scaled facades, roof clutter,
 * utility poles and their wires, broken paving and a layered far skyline with San Fransokyo's
 * tiered tower caps. Everything here is static. Repeated pieces are collected per geometry and
 * material and drawn as one InstancedMesh each, so a whole street costs a dozen or so draws.
 * Nothing in this file is used by Phases 1 to 3.
 */

type Vector3Tuple = [number, number, number];
export type RandomSource = () => number;
type FacadeFace = '+x' | '-x' | '+z' | '-z';

const STOREY = 3.2;
const scratch = {
  p: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  s: new THREE.Vector3(),
  e: new THREE.Euler(),
  m: new THREE.Matrix4(),
};

/**
 * Every mesh this kit builds is named 'city-dressing' and casts no shadow, so an adaptive-quality
 * pass can drop the lot at runtime: `scene.traverse(o => { if (o.name === 'city-dressing') o.visible = false; })`.
 */

/** Collects static instances and builds them as one InstancedMesh per geometry and material. */
export class Dressing {
  private sets = new Map<
    THREE.BufferGeometry,
    Map<THREE.Material, THREE.Matrix4[]>
  >();
  readonly cyl: THREE.BufferGeometry;
  readonly cone4: THREE.BufferGeometry;
  readonly disc: THREE.BufferGeometry;
  /** Panes are single quads (2 triangles instead of a box's 12); windows are the bulk of the count. */
  readonly pane: THREE.BufferGeometry;
  constructor(readonly k: SceneKit) {
    this.cyl = k.ownGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    // A four-sided cap turned square to the walls: the tiered tower roofs of San Fransokyo.
    this.cone4 = k.ownGeometry(
      new THREE.CylinderGeometry(0, 0.5 * Math.SQRT2, 1, 4).rotateY(
        Math.PI / 4,
      ),
    );
    this.disc = k.ownGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 20));
    this.pane = k.ownGeometry(new THREE.PlaneGeometry(1, 1));
  }
  put(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix: THREE.Matrix4,
  ) {
    let byMat = this.sets.get(geometry);
    if (!byMat) this.sets.set(geometry, (byMat = new Map()));
    let list = byMat.get(material);
    if (!list) byMat.set(material, (list = []));
    list.push(matrix);
  }
  /** A piece in `frame` (a building's or the world's matrix): position, size, optional rotation. */
  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    frame: THREE.Matrix4 | null,
    point: Vector3Tuple,
    scaleVector: Vector3Tuple,
    vector?: Vector3Tuple,
  ) {
    scratch.p.set(...point);
    scratch.s.set(...scaleVector);
    scratch.q.setFromEuler(scratch.e.set(...(vector ?? [0, 0, 0])));
    const transformMatrix = new THREE.Matrix4().compose(
      scratch.p,
      scratch.q,
      scratch.s,
    );
    if (frame) transformMatrix.premultiply(frame);
    this.put(geometry, material, transformMatrix);
  }
  box(
    material: THREE.Material,
    frame: THREE.Matrix4 | null,
    point: Vector3Tuple,
    scaleVector: Vector3Tuple,
    vector?: Vector3Tuple,
  ) {
    this.add(this.k.boxGeo, material, frame, point, scaleVector, vector);
  }
  build(parent: THREE.Object3D = this.k.root) {
    const meshes: THREE.InstancedMesh[] = [];
    for (const [geometry, byMat] of this.sets)
      for (const [material, list] of byMat) {
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        mesh.name = 'city-dressing';
        mesh.castShadow = false;
        list.forEach((transformMatrix, index) =>
          mesh.setMatrixAt(index, transformMatrix),
        );
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
        meshes.push(mesh);
      }
    this.sets.clear();
    const dispose = this.k.dispose.bind(this.k);
    this.k.dispose = () => {
      meshes.forEach((material2) => material2.dispose());
      dispose();
    };
    return meshes;
  }
}

/** One shared set of city materials per scene kit. */
export function cityMaterials(sceneKit: SceneKit) {
  const asphaltMap = concreteTexture();
  asphaltMap.repeat.set(3, 20);
  const asphalt = sceneKit.standard('#3b464c', 0.93, 0.04);
  asphalt.map = asphaltMap;
  asphalt.bumpMap = asphaltMap;
  asphalt.bumpScale = 0.02;
  const dispose = sceneKit.dispose.bind(sceneKit);
  sceneKit.dispose = () => {
    dispose();
    asphaltMap.dispose();
  };
  return {
    asphalt,
    glass: sceneKit.standard('#1b2a33', 0.2, 0.75),
    frame: sceneKit.standard('#141b20', 0.7, 0.35),
    sill: sceneKit.standard('#66716f', 0.75, 0.3),
    trim: sceneKit.standard('#2a363d', 0.8, 0.3),
    unit: sceneKit.standard('#8a9190', 0.55, 0.45),
    rust: sceneKit.standard('#6d4b39', 0.85, 0.3),
    steel: sceneKit.standard('#4d595e', 0.5, 0.65),
    patch: sceneKit.standard('#2b3439', 0.97, 0.02),
    puddle: sceneKit.standard('#34434b', 0.14, 0.35),
    crack: sceneKit.standard('#1a2126', 1, 0),
    cable: sceneKit.standard('#121619', 0.8, 0.2),
    warm: sceneKit.basic('#ffc47a', 1.05),
    curtain: sceneKit.basic('#c98e52', 0.55),
    cool: sceneKit.basic('#a9dbe6', 0.7),
    aviation: sceneKit.basic('#ff4632', 1.6),
    neon: [
      sceneKit.basic('#ff5a8a', 1.4),
      sceneKit.basic('#7fe6ff', 1.2),
      sceneKit.basic('#ffb15e', 1.35),
    ],
  };
}
export type CityMaterials = ReturnType<typeof cityMaterials>;

/** A building's local frame: centred on its footprint, base at y = 0. */
export function buildingFrame(
  xPosition: number,
  zPosition: number,
  rotationY = 0,
  tilt = 0,
  yPosition = 0,
) {
  const sceneObject = new THREE.Object3D();
  sceneObject.position.set(xPosition, yPosition, zPosition);
  sceneObject.rotation.set(0, rotationY, tilt);
  sceneObject.updateMatrix();
  return sceneObject.matrix.clone();
}

/**
 * Upper-storey facade detail on the chosen faces of a w×h×d block in `frame`. Storey-height
 * windows (frame, glass, sill), floor bands, AC units, balconies, a drain pipe, broken panes.
 */
export function dressFacade(
  dressing: Dressing,
  materials: CityMaterials,
  frame: THREE.Matrix4,
  width: number,
  height: number,
  depth: number,
  faces: FacadeFace[],
  random: RandomSource,
  options: {
    from?: number;
    style?: 'apartment' | 'office' | 'works';
    lit?: number;
    storey?: number;
  } = {},
) {
  const storey = options.storey ?? STOREY,
    blendFactor = storey / STOREY,
    from = options.from ?? 4.2,
    style =
      options.style ??
      (['apartment', 'office', 'works'] as const)[Math.floor(random() * 3)],
    lit = options.lit ?? 0.1;
  for (const face of faces) {
    const alongX = face === '+z' || face === '-z';
    const sign = face[0] === '+' ? 1 : -1,
      half = alongX ? depth / 2 : width / 2,
      span = alongX ? width : depth;
    // Face coordinates: u along the wall, y up, n out of it.
    const at = (
      progress: number,
      yPosition: number,
      count: number,
    ): Vector3Tuple =>
      alongX
        ? [progress, yPosition, sign * (half + count)]
        : [sign * (half + count), yPosition, progress];
    const size = (su: number, scaleY: number, sn: number): Vector3Tuple =>
      alongX ? [su, scaleY, sn] : [sn, scaleY, su];
    const facing: Vector3Tuple = [
      0,
      alongX ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2,
      0,
    ];
    const pane = (
      material: THREE.Material,
      progress: number,
      yPosition: number,
      count: number,
      su: number,
      scaleY: number,
    ) =>
      dressing.add(
        dressing.pane,
        material,
        frame,
        at(progress, yPosition, count),
        [su, scaleY, 1],
        facing,
      );
    const bay = style === 'works' ? 3 : style === 'office' ? 1.6 : 2.3;
    const cols = Math.max(1, Math.floor((span - 0.8) / bay)),
      scalarValue = (-(cols - 1) * bay) / 2;
    let row = 0;
    for (
      let yPosition2 = from;
      yPosition2 + 2 * blendFactor < height;
      yPosition2 += storey, row++
    ) {
      const cy = yPosition2 + 1.35 * blendFactor;
      dressing.box(
        materials.trim,
        frame,
        at(0, yPosition2 - 0.1, 0.06),
        size(span + 0.04, 0.16, 0.12),
      );
      if (style === 'office') {
        pane(materials.glass, 0, cy, 0.05, span - 0.7, 1.7 * blendFactor);
        for (let componentValue = 0; componentValue <= cols; componentValue++)
          pane(
            materials.frame,
            scalarValue - bay / 2 + componentValue * bay,
            cy,
            0.07,
            0.08,
            1.75 * blendFactor,
          );
        for (
          let componentValue2 = 0;
          componentValue2 < cols;
          componentValue2++
        ) {
          const radius = random();
          if (radius < lit)
            pane(
              radius < lit * 0.7 ? materials.warm : materials.cool,
              scalarValue + componentValue2 * bay,
              cy,
              0.06,
              bay - 0.14,
              1.6 * blendFactor,
            );
        }
        continue;
      }
      const ww = style === 'works' ? 2.4 : 1.25,
        wh = (style === 'works' ? 2.1 : 1.6) * blendFactor;
      for (let componentValue3 = 0; componentValue3 < cols; componentValue3++) {
        const progress2 = scalarValue + componentValue3 * bay,
          radius2 = random();
        pane(materials.frame, progress2, cy, 0.035, ww + 0.18, wh + 0.18);
        const glass =
          radius2 < lit * 0.7
            ? materials.warm
            : radius2 < lit
              ? materials.curtain
              : radius2 > 0.96
                ? materials.frame
                : materials.glass;
        pane(glass, progress2, cy, 0.065, ww, wh);
        if (style === 'works') {
          pane(materials.frame, progress2, cy, 0.075, 0.05, wh);
          pane(materials.frame, progress2, cy + 0.3, 0.075, ww, 0.05);
        }
        dressing.box(
          materials.sill,
          frame,
          at(progress2, cy - wh / 2 - 0.1, 0.12),
          size(ww + 0.3, 0.08, 0.22),
        );
        if (style === 'apartment' && random() < 0.28)
          dressing.box(
            materials.unit,
            frame,
            at(progress2 + ww * 0.3, cy - wh / 2 - 0.45, 0.3),
            size(0.75, 0.48, 0.5),
          );
      }
      // Every other storey of an apartment block carries a balcony run on one bay.
      if (style === 'apartment' && row % 2 === 1 && cols > 1) {
        const progress3 = scalarValue + Math.floor(random() * cols) * bay;
        dressing.box(
          materials.sill,
          frame,
          at(progress3, yPosition2 + 0.02, 0.55),
          size(bay - 0.2, 0.12, 1.1),
        );
        dressing.box(
          materials.steel,
          frame,
          at(progress3, yPosition2 + 0.55, 1.08),
          size(bay - 0.2, 0.05, 0.04),
        );
        dressing.box(
          materials.steel,
          frame,
          at(progress3, yPosition2 + 0.3, 1.08),
          size(bay - 0.2, 0.5, 0.015),
        );
      }
    }
    // A drain pipe on the wall's edge, and a vent stack near the top.
    dressing.add(
      dressing.cyl,
      materials.steel,
      frame,
      at(span / 2 - 0.35, height / 2, 0.14),
      [0.14, height, 0.14],
    );
    if (random() > 0.5)
      dressing.box(
        materials.unit,
        frame,
        at(-span / 2 + 1, height - 1.3, 0.2),
        size(0.9, 0.6, 0.35),
      );
  }
}

/** Parapet and roof clutter: tanks on legs, plant, a mast with its warning lamp, a sign frame. */
export function dressRoof(
  dressing: Dressing,
  materials: CityMaterials,
  frame: THREE.Matrix4,
  width: number,
  height: number,
  depth: number,
  random: RandomSource,
  options: { tower?: boolean; sign?: boolean; parapet?: boolean } = {},
) {
  if (options.parapet !== false)
    for (const [point, scaleVector] of [
      [
        [0, height + 0.35, depth / 2 - 0.1],
        [width + 0.1, 0.7, 0.2],
      ],
      [
        [0, height + 0.35, -depth / 2 + 0.1],
        [width + 0.1, 0.7, 0.2],
      ],
      [
        [width / 2 - 0.1, height + 0.35, 0],
        [0.2, 0.7, depth],
      ],
      [
        [-width / 2 + 0.1, height + 0.35, 0],
        [0.2, 0.7, depth],
      ],
    ] as [Vector3Tuple, Vector3Tuple][])
      dressing.box(materials.trim, frame, point, scaleVector);
  if (random() > 0.45) {
    const xPosition = (random() - 0.5) * width * 0.5,
      zPosition = (random() - 0.5) * depth * 0.4;
    dressing.add(
      dressing.cyl,
      materials.rust,
      frame,
      [xPosition, height + 2.3, zPosition],
      [1.6, 1.8, 1.6],
    );
    dressing.add(
      dressing.cone4,
      materials.trim,
      frame,
      [xPosition, height + 3.45, zPosition],
      [1.55, 0.5, 1.55],
    );
    for (const [deltaX, deltaZ] of [
      [-0.55, -0.55],
      [0.55, -0.55],
      [-0.55, 0.55],
      [0.55, 0.55],
    ])
      dressing.box(
        materials.steel,
        frame,
        [xPosition + deltaX, height + 0.7, zPosition + deltaZ],
        [0.08, 1.4, 0.08],
      );
  }
  for (
    let index = 0, count = 1 + Math.floor(random() * 3);
    index < count;
    index++
  )
    dressing.box(
      materials.unit,
      frame,
      [
        (random() - 0.5) * width * 0.6,
        height + 0.45,
        (random() - 0.5) * depth * 0.6,
      ],
      [1 + random(), 0.9, 0.8 + random() * 0.6],
    );
  if (random() > 0.55) {
    const xPosition2 = (random() - 0.5) * width * 0.5,
      mast = 3 + random() * 4;
    dressing.box(
      materials.steel,
      frame,
      [xPosition2, height + mast / 2, 0],
      [0.07, mast, 0.07],
    );
    dressing.add(
      dressing.cyl,
      materials.aviation,
      frame,
      [xPosition2, height + mast + 0.08, 0],
      [0.16, 0.16, 0.16],
    );
  }
  if (options.sign) {
    const material2 =
        materials.neon[Math.floor(random() * materials.neon.length)],
      sw = Math.min(width * 0.8, 4.5);
    for (const deltaX2 of [-sw / 3, sw / 3])
      dressing.box(
        materials.steel,
        frame,
        [deltaX2, height + 1.1, depth / 2 - 0.6],
        [0.09, 2.2, 0.09],
      );
    dressing.box(
      materials.frame,
      frame,
      [0, height + 2.4, depth / 2 - 0.6],
      [sw, 1.2, 0.12],
    );
    dressing.box(
      material2,
      frame,
      [0, height + 2.4, depth / 2 - 0.52],
      [sw * 0.9, 0.18, 0.02],
    );
    dressing.box(
      material2,
      frame,
      [0, height + 2.05, depth / 2 - 0.52],
      [sw * 0.6, 0.1, 0.02],
    );
  }
  if (options.tower) towerCap(dressing, materials, frame, width, height, depth);
}

/** San Fransokyo's tiered caps: two flared eaves and a pointed crown. */
export function towerCap(
  dressing: Dressing,
  materials: CityMaterials,
  frame: THREE.Matrix4,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material = materials.trim,
) {
  dressing.box(
    material,
    frame,
    [0, height + 0.12, 0],
    [width + 1.4, 0.24, depth + 1.4],
  );
  dressing.add(
    dressing.cone4,
    material,
    frame,
    [0, height + 0.7, 0],
    [width + 1.1, 0.9, depth + 1.1],
  );
  dressing.box(
    material,
    frame,
    [0, height + 1.6, 0],
    [width * 0.55, 1.4, depth * 0.55],
  );
  dressing.box(
    material,
    frame,
    [0, height + 2.4, 0],
    [width * 0.55 + 1, 0.18, depth * 0.55 + 1],
  );
  dressing.add(
    dressing.cone4,
    material,
    frame,
    [0, height + 3, 0],
    [width * 0.55 + 0.8, 1.1, depth * 0.55 + 0.8],
  );
}

/**
 * Far skyline: towers in two or three depth bands beyond a street's end, lit window strips facing
 * the street, tiered caps on some, and a few with an upper section sheared off and hanging.
 */
export function skyline(
  dressing: Dressing,
  materials: CityMaterials,
  random: RandomSource,
  material2: {
    x: [number, number];
    z: [number, number];
    count: number;
    h: [number, number];
    facing?: number;
    tones: THREE.Material[];
  },
) {
  const lerp = (entries: [number, number]) =>
    entries[0] + random() * (entries[1] - entries[0]);
  for (let index = 0; index < material2.count; index++) {
    const xPosition = lerp(material2.x),
      zPosition = lerp(material2.z),
      width = 6 + random() * 9,
      dd = 6 + random() * 8,
      height = lerp(material2.h);
    const tilt = random() > 0.8 ? (random() - 0.5) * 0.12 : 0;
    const frame = buildingFrame(
      xPosition,
      zPosition,
      (random() - 0.5) * 0.3,
      tilt,
      -1,
    );
    const tone = material2.tones[Math.floor(random() * material2.tones.length)];
    dressing.box(tone, frame, [0, height / 2, 0], [width, height, dd]);
    // Window strips on the street-facing face, a few of them lit.
    const face = material2.facing ?? 1,
      fz = face * (dd / 2 + 0.05);
    for (let yPosition = 4; yPosition < height - 2; yPosition += STOREY) {
      const radius = random();
      dressing.add(
        dressing.pane,
        radius < 0.12
          ? materials.warm
          : radius < 0.16
            ? materials.cool
            : materials.glass,
        frame,
        [0, yPosition, fz],
        [width - 1, 1.2, 1],
        [0, face > 0 ? 0 : Math.PI, 0],
      );
    }
    if (random() < 0.35) towerCap(dressing, materials, frame, width, height, dd);
    else if (random() < 0.4) {
      // Sheared off by the rupture: the top storeys hang offset, turned, with a gap below them.
      const top = 4 + random() * 6;
      dressing.box(
        tone,
        frame,
        [(random() - 0.5) * 3, height + 1.5 + top / 2, (random() - 0.5) * 2],
        [width * 0.9, top, dd * 0.9],
        [
          (random() - 0.5) * 0.25,
          (random() - 0.5) * 0.5,
          (random() - 0.5) * 0.3,
        ],
      );
    } else if (random() < 0.6) {
      dressing.box(
        materials.steel,
        frame,
        [width * 0.2, height + 3, 0],
        [0.12, 6, 0.12],
      );
      dressing.add(
        dressing.cyl,
        materials.aviation,
        frame,
        [width * 0.2, height + 6.1, 0],
        [0.3, 0.3, 0.3],
      );
    }
  }
}

/** Patched asphalt, manholes, cracks and standing water across a stretch of road (y = surface). */
export function roadBreakup(
  dressing: Dressing,
  materials: CityMaterials,
  random: RandomSource,
  material2: {
    x: [number, number];
    z: [number, number];
    y: number;
    count: number;
    cracks?: boolean;
    patch?: THREE.Material;
  },
) {
  const lerp = (entries: [number, number]) =>
    entries[0] + random() * (entries[1] - entries[0]);
  for (let index = 0; index < material2.count; index++) {
    const xPosition = lerp(material2.x),
      zPosition = lerp(material2.z),
      kind = random();
    if (kind < 0.35)
      dressing.box(
        material2.patch ?? materials.patch,
        null,
        [xPosition, material2.y + 0.004, zPosition],
        [1 + random() * 1.8, 0.008, 1 + random() * 2.2],
        [0, (random() - 0.5) * 0.3, 0],
      );
    else if (kind < 0.5)
      dressing.add(
        dressing.disc,
        materials.puddle,
        null,
        [xPosition, material2.y + 0.007, zPosition],
        [0.8 + random() * 1.4, 0.006, 0.5 + random() * 1],
        [0, random() * 3, 0],
      );
    else if (kind < 0.65) {
      dressing.add(
        dressing.disc,
        materials.steel,
        null,
        [xPosition, material2.y + 0.01, zPosition],
        [0.8, 0.02, 0.8],
      );
      dressing.add(
        dressing.disc,
        materials.crack,
        null,
        [xPosition, material2.y + 0.012, zPosition],
        [0.6, 0.02, 0.6],
      );
    } else if (material2.cracks !== false) {
      let firstValue = random() * Math.PI,
        cx = xPosition,
        cz = zPosition;
      for (let segmentIndex = 0; segmentIndex < 4; segmentIndex++) {
        const len = 0.3 + random() * 0.7;
        dressing.box(
          materials.crack,
          null,
          [cx, material2.y + 0.009, cz],
          [0.016, 0.006, len],
          [0, firstValue, 0],
        );
        cx += Math.sin(firstValue) * len * 0.5;
        cz += Math.cos(firstValue) * len * 0.5;
        firstValue += (random() - 0.5) * 1.2;
      }
    }
  }
}

/**
 * Wooden-style utility poles along both kerbs with crossarms and a transformer now and then, and
 * the wires between them (sagging, merged into one mesh). `points` run down one side of the street.
 */
export function utilityLines(
  dressing: Dressing,
  materials: CityMaterials,
  random: RandomSource,
  points: [number, number][],
  offset: { height?: number; across?: number } = {},
) {
  const height = offset.height ?? 8.5,
    tips: THREE.Vector3[][] = [];
  for (const [xPosition, zPosition] of points) {
    const lean = (random() - 0.5) * 0.06;
    dressing.add(
      dressing.cyl,
      materials.trim,
      null,
      [xPosition, height / 2, zPosition],
      [0.24, height, 0.24],
      [lean, 0, lean],
    );
    dressing.box(
      materials.steel,
      null,
      [xPosition, height - 0.5, zPosition],
      [0.12, 0.12, 2.2],
    );
    dressing.box(
      materials.steel,
      null,
      [xPosition, height - 1.2, zPosition],
      [0.1, 0.1, 1.6],
    );
    for (const deltaZ of [-0.9, 0, 0.9])
      dressing.add(
        dressing.cyl,
        materials.unit,
        null,
        [xPosition, height - 0.35, zPosition + deltaZ],
        [0.08, 0.2, 0.08],
      );
    if (random() > 0.6) {
      dressing.add(
        dressing.cyl,
        materials.unit,
        null,
        [xPosition + Math.sign(xPosition) * 0.45, height - 2.4, zPosition],
        [0.55, 0.9, 0.55],
      );
      dressing.box(
        materials.steel,
        null,
        [xPosition + Math.sign(xPosition) * 0.2, height - 2.4, zPosition],
        [0.4, 0.08, 0.08],
      );
    }
    tips.push(
      [-0.9, 0, 0.9].map(
        (deltaZ2) =>
          new THREE.Vector3(xPosition, height - 0.35, zPosition + deltaZ2),
      ),
    );
  }
  const tubes: THREE.BufferGeometry[] = [];
  const sag = (
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    drop: number,
  ) => {
    const mid = startPoint.clone().lerp(endPoint, 0.5);
    mid.y -= drop;
    tubes.push(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(startPoint, mid, endPoint),
        16,
        0.018,
        4,
        false,
      ),
    );
  };
  // Wires run pole to pole along the street; every other pole drops one across to the far side.
  for (let index = 1; index < tips.length; index++)
    for (let segmentIndex = 0; segmentIndex < 3; segmentIndex++)
      sag(
        tips[index - 1][segmentIndex],
        tips[index][segmentIndex],
        0.6 + random() * 0.5,
      );
  if (offset.across)
    tips.forEach((tip, index2) => {
      if (index2 % 2 === 0)
        sag(
          tip[1],
          new THREE.Vector3(
            offset.across!,
            height - 1.6 - random(),
            tip[1].z + (random() - 0.5) * 2,
          ),
          1.2 + random(),
        );
    });
  if (tubes.length) {
    const geometry = mergeGeometries(tubes, false);
    tubes.forEach((geometry2) => geometry2.dispose());
    if (geometry)
      dressing.k.mesh(geometry, materials.cable, { p: [0, 0, 0] }).name =
        'city-dressing';
  }
}

/**
 * Windows for the side and back faces of boxes merged into a static mesh (the shared backdrop's
 * towers only carry them on their front). Each box is recovered from its 24 vertices, so this works
 * on any merged BoxGeometry set without touching the shared source. Boxes under `minHeight` are skipped.
 */
export function skinMergedBoxes(
  dressing: Dressing,
  materials: CityMaterials,
  mesh: THREE.Mesh,
  relativeTo: THREE.Object3D,
  random: RandomSource,
  offset: { storey: number; from: number; minHeight: number },
) {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.count % 24) return;
  relativeTo.updateMatrixWorld(true);
  const toLocal = relativeTo.matrixWorld
    .clone()
    .invert()
    .multiply(mesh.matrixWorld);
  const vector = new THREE.Vector3(),
    vector2 = new THREE.Vector3(),
    faceC = (from: number) => {
      const vector3 = new THREE.Vector3();
      for (let index = 0; index < 4; index++)
        vector3.add(vector.fromBufferAttribute(position, from + index));
      return vector3.multiplyScalar(0.25);
    };
  for (let secondValue = 0; secondValue < position.count; secondValue += 24) {
    vector2.set(0, 0, 0);
    for (let index2 = 0; index2 < 24; index2++)
      vector2.add(vector.fromBufferAttribute(position, secondValue + index2));
    vector2.multiplyScalar(1 / 24);
    const ax = faceC(secondValue).sub(vector2),
      ay = faceC(secondValue + 8).sub(vector2),
      az = faceC(secondValue + 16).sub(vector2);
    const width = ax.length() * 2,
      height = ay.length() * 2,
      depth = az.length() * 2;
    if (height < offset.minHeight || width < 1 || depth < 1) continue;
    const base = vector2.clone().sub(ay);
    const frame = new THREE.Matrix4()
      .makeBasis(ax.normalize(), ay.normalize(), az.normalize())
      .setPosition(base)
      .premultiply(toLocal);
    dressFacade(
      dressing,
      materials,
      frame,
      width,
      height,
      depth,
      ['+x', '-x', '-z'],
      random,
      {
        from: offset.from,
        storey: offset.storey,
        style: 'apartment',
        lit: 0.07,
      },
    );
  }
}
