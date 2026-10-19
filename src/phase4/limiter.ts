import * as THREE from 'three';
import {
  edgeWear,
  grain,
  grime,
  paint,
  scratches,
  seeded,
  wornPaint,
} from './canvasTex';

/**
 * The power regulator Hiro finds in Bay 6: "modifies output to create a temporary window."
 * A long, battered service unit in three body segments of slightly different heights, with bolted
 * end caps, heavy connectors and cable glands at both ends, an analogue output gauge on a dark face
 * plate, a red/black chevron warning panel and a printed spec plate. Paint is chipped back to
 * bare metal along every edge.
 *
 * Built in metres (about 1.1 m long including connectors), long axis on X, front face toward +Z,
 * resting on y = 0. Each call builds its own geometry and materials; dispose() frees them.
 */
export type Limiter = THREE.Group & {
  /** The gauge needle's pivot; setGauge drives it. */
  needle: THREE.Object3D;
  /** Status lamp beside the spec plate. */
  led: THREE.MeshBasicMaterial;
  /** The trailing yellow and black cables, so a scene can hide them. */
  cables: THREE.Group;
  /** 0 → 1 across the dial's sweep. */
  setGauge(value: number): void;
  dispose(): void;
};

export const LIMITER_LENGTH = 1.12;
/** Where the heavy black feed leaves the main cable gland (right-hand end), in the unit's own frame: x .56, y FOOT + .13. */
export const LIMITER_FEED = new THREE.Vector3(0.56, 0.146, 0);

/**
 * Paint the regulator dial markings into its embedded texture.
 */
function gaugeFace() {
  return paint(512, 512, (drawingContext, width) => {
    const componentValue = width / 2,
      result = seeded(41);
    drawingContext.fillStyle = '#e6dfcb';
    drawingContext.fillRect(0, 0, width, width);
    grain(drawingContext, width, width, result, 5000, 0.08);
    grime(drawingContext, width, width, result, 5, '60,48,30', 0.14);
    drawingContext.translate(componentValue, componentValue);
    // Red band over the top of the scale: the unlimited end.
    drawingContext.strokeStyle = '#b3201c';
    drawingContext.lineWidth = 22;
    drawingContext.beginPath();
    drawingContext.arc(0, 0, 196, -Math.PI / 2 + 0.62, -Math.PI / 2 + 2.36);
    drawingContext.stroke();
    drawingContext.strokeStyle = '#1b1a18';
    drawingContext.fillStyle = '#1b1a18';
    drawingContext.textAlign = 'center';
    drawingContext.textBaseline = 'middle';
    for (let index = 0; index <= 50; index++) {
      const firstValue = ((-135 + index * 5.4) * Math.PI) / 180,
        major = index % 5 === 0,
        value = major ? 168 : 182;
      drawingContext.lineWidth = major ? 6 : 2.5;
      drawingContext.beginPath();
      drawingContext.moveTo(
        Math.sin(firstValue) * value,
        -Math.cos(firstValue) * value,
      );
      drawingContext.lineTo(
        Math.sin(firstValue) * 206,
        -Math.cos(firstValue) * 206,
      );
      drawingContext.stroke();
      if (major) {
        drawingContext.font = '600 34px "Space Grotesk", Arial, sans-serif';
        drawingContext.fillText(
          String(index / 5),
          Math.sin(firstValue) * 136,
          -Math.cos(firstValue) * 136,
        );
      }
    }
    drawingContext.font = '600 30px "IBM Plex Mono", monospace';
    drawingContext.fillText('OUTPUT', 0, 70);
    drawingContext.font = '22px "IBM Plex Mono", monospace';
    drawingContext.fillStyle = '#5a554b';
    drawingContext.fillText('×10 %', 0, 104);
    drawingContext.beginPath();
    drawingContext.arc(0, 0, 238, 0, Math.PI * 2);
    drawingContext.lineWidth = 16;
    drawingContext.strokeStyle = '#2a2826';
    drawingContext.stroke();
  });
}

/**
 * Paint the regulator hazard-panel markings.
 */
function chevronPanel() {
  return paint(256, 384, (drawingContext, width, height) => {
    const result = seeded(52);
    drawingContext.fillStyle = '#141414';
    drawingContext.fillRect(0, 0, width, height);
    // Three stacked chevrons pointing along the unit, like a flow arrow.
    drawingContext.fillStyle = '#c4231c';
    for (let index = 0; index < 3; index++) {
      const y0 = 40 + index * 108;
      drawingContext.beginPath();
      drawingContext.moveTo(36, y0);
      drawingContext.lineTo(150, y0 + 46);
      drawingContext.lineTo(36, y0 + 92);
      drawingContext.lineTo(36, y0 + 62);
      drawingContext.lineTo(92, y0 + 46);
      drawingContext.lineTo(36, y0 + 30);
      drawingContext.closePath();
      drawingContext.fill();
      drawingContext.beginPath();
      drawingContext.moveTo(126, y0);
      drawingContext.lineTo(226, y0 + 46);
      drawingContext.lineTo(126, y0 + 92);
      drawingContext.closePath();
      drawingContext.fill();
    }
    grain(drawingContext, width, height, result, 4000, 0.22);
    scratches(drawingContext, width, height, result, 26, '220,210,200', 0.5);
    edgeWear(drawingContext, width, height, result, '#8d8a84', 14, 0.8);
  });
}

/**
 * Paint the regulator identification and specification plate.
 */
function specPlate() {
  return paint(512, 320, (drawingContext, width, height) => {
    const result = seeded(63);
    drawingContext.fillStyle = '#d9d2bf';
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.strokeStyle = '#26241f';
    drawingContext.lineWidth = 6;
    drawingContext.strokeRect(14, 14, width - 28, height - 28);
    drawingContext.fillStyle = '#26241f';
    drawingContext.fillRect(14, 14, width - 28, 62);
    drawingContext.fillStyle = '#d9d2bf';
    drawingContext.font = '700 40px "Space Grotesk", Arial, sans-serif';
    drawingContext.textBaseline = 'middle';
    drawingContext.fillText('POWER REGULATOR', 32, 46);
    drawingContext.fillStyle = '#26241f';
    drawingContext.font = '500 25px "IBM Plex Mono", monospace';
    [
      'TYPE  PR-6 · SERVICE',
      'IN    48 V DC  12 A',
      'OUT   ADJ 0–100 %',
      'HOLD  90 s WINDOW',
      'BAY 6  ·  SN 0614',
    ].forEach((line, index) =>
      drawingContext.fillText(line, 32, 106 + index * 40),
    );
    // Barcode strip.
    for (let index2 = 0; index2 < 46; index2++)
      if (result() > 0.4)
        drawingContext.fillRect(
          372 + index2 * 2.6,
          112,
          1.6 + result() * 1.6,
          120,
        );
    grain(drawingContext, width, height, result, 6000, 0.12);
    grime(drawingContext, width, height, result, 6, '40,30,20', 0.2);
    scratches(drawingContext, width, height, result, 24, '120,110,90', 0.5);
  });
}

/**
 * Build the small repeated grip ridges on the regulator hardware.
 */
function knurl(radius: number, length: number) {
  // A connector collar with knurled ridges, lying along X.
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 28, 1);
  const point = geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < point.count; index++) {
    const firstValue = Math.atan2(point.getZ(index), point.getX(index)),
      blendFactor =
        1 + (Math.floor((firstValue / Math.PI + 1) * 14) % 2) * 0.06;
    point.setX(index, point.getX(index) * blendFactor);
    point.setZ(index, point.getZ(index) * blendFactor);
  }
  geometry.computeVertexNormals();
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/**
 * Build the Bay 6 regulator, including its dial, connectors and live indicators.
 */
export function createLimiter(): Limiter {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  const own = <G extends THREE.BufferGeometry>(group: G) => (
    geometries.add(group),
    group
  );
  const texture = (timeSeconds: THREE.Texture) => (
    textures.add(timeSeconds),
    timeSeconds
  );
  const std = (material: THREE.MeshStandardMaterialParameters) => {
    const material2 = new THREE.MeshStandardMaterial(material);
    materials.add(material2);
    return material2;
  };

  const root = new THREE.Group() as Limiter;
  root.name = 'power-regulator';
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    xPosition: number,
    yPosition: number,
    zPosition: number,
    parent: THREE.Object3D = root,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ) => {
    const mesh = new THREE.Mesh(own(geometry), material);
    mesh.position.set(xPosition, yPosition, zPosition);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const paintA = texture(
    wornPaint('#a59f92', 11, { rustSpots: 12, scratchCount: 110 }),
  );
  const paintB = texture(
    wornPaint('#99938a', 23, { rustSpots: 14, scratchCount: 90 }),
  );
  const paintDark = texture(
    wornPaint('#3b3a38', 37, {
      metal: '#a9a8a2',
      rustSpots: 4,
      scratchCount: 80,
    }),
  );
  const plateTex = texture(
    paint(256, 256, (drawingContext, width, height) => {
      const result = seeded(77);
      drawingContext.fillStyle = '#202224';
      drawingContext.fillRect(0, 0, width, height);
      grain(drawingContext, width, height, result, 3000, 0.14);
      scratches(drawingContext, width, height, result, 40, '180,180,175', 0.35);
      edgeWear(drawingContext, width, height, result, '#7d7f80', 10, 0.7);
    }),
  );
  const housing = std({
    map: paintA,
    bumpMap: paintA,
    bumpScale: 0.6,
    roughness: 0.62,
    metalness: 0.35,
  });
  const housing2 = std({
    map: paintB,
    bumpMap: paintB,
    bumpScale: 0.6,
    roughness: 0.66,
    metalness: 0.32,
  });
  const gunmetal = std({
    map: paintDark,
    bumpMap: paintDark,
    bumpScale: 0.5,
    roughness: 0.5,
    metalness: 0.6,
  });
  const plate = std({ map: plateTex, roughness: 0.48, metalness: 0.45 });
  const steel = std({ color: '#a7aaaa', roughness: 0.32, metalness: 0.92 });
  const darkSteel = std({ color: '#3d4144', roughness: 0.42, metalness: 0.85 });
  const bare = std({ color: '#cfccc4', roughness: 0.3, metalness: 0.95 });
  const rubber = std({ color: '#141516', roughness: 0.82, metalness: 0 });
  const yellow = std({ color: '#e0b21c', roughness: 0.42, metalness: 0.05 });
  const red = std({ color: '#b51d18', roughness: 0.4, metalness: 0.2 });
  const face = std({
    map: texture(gaugeFace()),
    roughness: 0.55,
    metalness: 0,
  });
  const chevron = std({
    map: texture(chevronPanel()),
    roughness: 0.5,
    metalness: 0.25,
  });
  const spec = std({
    map: texture(specPlate()),
    roughness: 0.6,
    metalness: 0.1,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  materials.add(glass);
  const led = new THREE.MeshBasicMaterial({
    color: '#2a3a33',
    toneMapped: false,
  });
  materials.add(led);

  const bolt = (
    xPosition: number,
    yPosition: number,
    zPosition: number,
    axis: 'x' | 'y' | 'z',
    radius = 0.009,
    parent: THREE.Object3D = root,
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      radius * 0.9,
      6,
    );
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    else if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    add(geometry, steel, xPosition, yPosition, zPosition, parent);
  };
  /** A bevel strip along a top edge: bare metal where the paint is worn through. */
  const bevel = (
    xPosition: number,
    yPosition: number,
    zPosition: number,
    len: number,
    width = 0.016,
  ) =>
    add(
      new THREE.BoxGeometry(len, width, width),
      bare,
      xPosition,
      yPosition,
      zPosition,
      root,
      Math.PI / 4,
    );

  const FOOT = 0.016;
  // ── Body segments: left module, main gauge housing, spec module. Heights step slightly.
  type Seg = {
    x0: number;
    x1: number;
    h: number;
    d: number;
    mat: THREE.Material;
  };
  const segs: Seg[] = [
    { x0: -0.4, x1: -0.185, h: 0.215, d: 0.205, mat: gunmetal },
    { x0: -0.18, x1: 0.205, h: 0.255, d: 0.232, mat: housing },
    { x0: 0.21, x1: 0.4, h: 0.228, d: 0.214, mat: housing2 },
  ];
  for (const state of segs) {
    const width2 = state.x1 - state.x0,
      cx = (state.x0 + state.x1) / 2;
    add(
      new THREE.BoxGeometry(width2, state.h, state.d),
      state.mat,
      cx,
      FOOT + state.h / 2,
      0,
    );
    bevel(cx, FOOT + state.h, state.d / 2, width2 - 0.01);
    bevel(cx, FOOT + state.h, -state.d / 2, width2 - 0.01);
    bevel(cx, FOOT, state.d / 2, width2 - 0.01, 0.012);
  }
  // Seams between segments: dark gaskets with a ring of bolts.
  for (const xPosition2 of [-0.1825, 0.2075]) {
    add(
      new THREE.BoxGeometry(0.008, 0.2, 0.2),
      rubber,
      xPosition2,
      FOOT + 0.11,
      0,
    );
    for (const yPosition2 of [0.05, 0.2])
      for (const zPosition2 of [-0.09, 0.09])
        bolt(
          xPosition2 + (xPosition2 < 0 ? 0.008 : -0.008),
          FOOT + yPosition2,
          zPosition2 * 1.24,
          'z',
          0.007,
        );
  }
  // Skid feet.
  for (const xPosition3 of [-0.33, 0.33])
    for (const zPosition3 of [-0.08, 0.08])
      add(
        new THREE.CylinderGeometry(0.018, 0.022, FOOT, 12),
        rubber,
        xPosition3,
        FOOT / 2,
        zPosition3,
      );

  // ── Main housing front: dark face plate, gauge, chevron panel.
  const frontZ = 0.232 / 2;
  add(
    new THREE.BoxGeometry(0.33, 0.2, 0.012),
    plate,
    0.012,
    FOOT + 0.128,
    frontZ + 0.006,
  );
  for (const [xPosition4, yPosition3] of [
    [-0.145, 0.04],
    [0.17, 0.04],
    [-0.145, 0.215],
    [0.17, 0.215],
  ])
    bolt(xPosition4, FOOT + yPosition3, frontZ + 0.014, 'z');
  const gauge = new THREE.Group();
  gauge.position.set(-0.06, FOOT + 0.13, frontZ + 0.012);
  root.add(gauge);
  add(
    new THREE.CylinderGeometry(0.079, 0.084, 0.03, 40).rotateX(Math.PI / 2),
    darkSteel,
    0,
    0,
    0.015,
    gauge,
  );
  add(new THREE.TorusGeometry(0.072, 0.009, 12, 48), steel, 0, 0, 0.031, gauge);
  add(new THREE.CircleGeometry(0.07, 48), face, 0, 0, 0.0305, gauge);
  add(
    new THREE.CircleGeometry(0.07, 48),
    glass,
    0,
    0,
    0.036,
    gauge,
  ).castShadow = false;
  for (let index = 0; index < 4; index++) {
    const firstValue = (index * Math.PI) / 2 + Math.PI / 4;
    bolt(
      Math.cos(firstValue) * 0.088,
      Math.sin(firstValue) * 0.088,
      0.004,
      'z',
      0.006,
      gauge,
    );
  }
  const needle = new THREE.Group();
  needle.position.z = 0.033;
  gauge.add(needle);
  add(new THREE.BoxGeometry(0.0045, 0.058, 0.002), red, 0, 0.022, 0, needle);
  add(new THREE.BoxGeometry(0.006, 0.016, 0.002), red, 0, -0.008, 0, needle);
  add(
    new THREE.CylinderGeometry(0.007, 0.007, 0.006, 16).rotateX(Math.PI / 2),
    darkSteel,
    0,
    0,
    0.002,
    needle,
  );
  // Chevron warning panel on a raised black plate.
  add(
    new THREE.BoxGeometry(0.088, 0.15, 0.01),
    rubber,
    0.095,
    FOOT + 0.13,
    frontZ + 0.016,
  );
  add(
    new THREE.PlaneGeometry(0.08, 0.142),
    chevron,
    0.095,
    FOOT + 0.13,
    frontZ + 0.0215,
  );
  for (const yPosition4 of [0.062, 0.198])
    bolt(0.095, FOOT + yPosition4, frontZ + 0.024, 'z', 0.006);
  // A dent and a gouge on the housing, the knocks it took.
  add(
    new THREE.SphereGeometry(0.03, 10, 8),
    housing,
    0.15,
    FOOT + 0.24,
    frontZ - 0.012,
  ).scale.set(1.4, 0.5, 0.5);

  // ── Left module: hatch, toggle guard, small hazard strip.
  const localX = -0.2925,
    lFront = 0.205 / 2;
  add(
    new THREE.BoxGeometry(0.15, 0.1, 0.008),
    plate,
    localX,
    FOOT + 0.12,
    lFront + 0.004,
  );
  for (const [xPosition5, yPosition5] of [
    [-0.065, 0.08],
    [0.065, 0.08],
    [-0.065, 0.16],
    [0.065, 0.16],
  ])
    bolt(localX + xPosition5, FOOT + yPosition5, lFront + 0.01, 'z', 0.006);
  const guard = new THREE.Group();
  guard.position.set(localX + 0.03, FOOT + 0.12, lFront + 0.012);
  root.add(guard);
  add(new THREE.BoxGeometry(0.04, 0.045, 0.02), red, 0, 0, 0.01, guard);
  add(
    new THREE.CylinderGeometry(0.005, 0.005, 0.03, 10).rotateX(Math.PI / 2),
    steel,
    -0.045,
    0,
    0.015,
    guard,
  );
  for (let index2 = 0; index2 < 4; index2++)
    add(
      new THREE.BoxGeometry(0.034, 0.006, 0.002),
      index2 % 2 ? rubber : yellow,
      localX - 0.04,
      FOOT + 0.045 + index2 * 0.007,
      lFront + 0.009,
    );

  // ── Spec module: printed plate, rivets, vent slots, status lamp.
  const scaleX = 0.305,
    sFront = 0.214 / 2;
  add(
    new THREE.PlaneGeometry(0.15, 0.094),
    spec,
    scaleX,
    FOOT + 0.1,
    sFront + 0.002,
  );
  for (const [xPosition6, yPosition6] of [
    [-0.07, 0.058],
    [0.07, 0.058],
    [-0.07, 0.142],
    [0.07, 0.142],
  ])
    add(
      new THREE.SphereGeometry(0.004, 8, 6),
      steel,
      scaleX + xPosition6,
      FOOT + yPosition6,
      sFront + 0.003,
    );
  for (let index3 = 0; index3 < 6; index3++)
    add(
      new THREE.BoxGeometry(0.016, 0.004, 0.004),
      rubber,
      scaleX - 0.05 + index3 * 0.02,
      FOOT + 0.19,
      sFront + 0.001,
    );
  add(
    new THREE.CylinderGeometry(0.011, 0.011, 0.01, 16).rotateX(Math.PI / 2),
    darkSteel,
    scaleX + 0.062,
    FOOT + 0.19,
    sFront + 0.004,
  );
  add(
    new THREE.SphereGeometry(0.0075, 12, 8),
    led,
    scaleX + 0.062,
    FOOT + 0.19,
    sFront + 0.009,
  );

  // ── Top spine: a stepped rib along the back with bolts, and a carry bar.
  add(
    new THREE.BoxGeometry(0.72, 0.024, 0.05),
    gunmetal,
    0,
    FOOT + 0.255 + 0.012,
    -0.06,
  );
  for (let index4 = 0; index4 < 8; index4++)
    bolt(-0.33 + index4 * 0.094, FOOT + 0.282, -0.06, 'y', 0.007);
  for (const xPosition7 of [-0.12, 0.14])
    add(
      new THREE.BoxGeometry(0.02, 0.05, 0.02),
      darkSteel,
      xPosition7,
      FOOT + 0.29,
      0.03,
    );
  add(
    new THREE.CylinderGeometry(0.009, 0.009, 0.28, 12).rotateZ(Math.PI / 2),
    steel,
    0.01,
    FOOT + 0.315,
    0.03,
  );

  // ── End caps, bolted, with connectors and cable glands.
  const caps: [number, number][] = [
    [-1, -0.43],
    [1, 0.43],
  ];
  for (const [side, xPosition8] of caps) {
    add(
      new THREE.BoxGeometry(0.06, 0.19, 0.19),
      darkSteel,
      xPosition8,
      FOOT + 0.11,
      0,
    );
    add(
      new THREE.BoxGeometry(0.064, 0.17, 0.17),
      plate,
      xPosition8 + side * 0.002,
      FOOT + 0.11,
      0,
    );
    for (const yPosition7 of [0.03, 0.19])
      for (const zPosition4 of [-0.08, 0.08])
        bolt(
          xPosition8 + side * 0.033,
          FOOT + yPosition7,
          zPosition4,
          'x',
          0.009,
        );
  }
  // Left: one heavy round connector and a small signal plug.
  add(knurl(0.05, 0.03), steel, -0.475, FOOT + 0.13, 0);
  add(
    new THREE.CylinderGeometry(0.042, 0.042, 0.05, 24).rotateZ(Math.PI / 2),
    darkSteel,
    -0.51,
    FOOT + 0.13,
    0,
  );
  add(
    new THREE.CylinderGeometry(0.03, 0.036, 0.04, 20).rotateZ(Math.PI / 2),
    rubber,
    -0.55,
    FOOT + 0.13,
    0,
  );
  add(
    new THREE.CylinderGeometry(0.018, 0.018, 0.04, 16).rotateZ(Math.PI / 2),
    steel,
    -0.475,
    FOOT + 0.05,
    0.05,
  );
  // Right: a cable gland (hex nut + taper) for the main feed, and a second, smaller gland.
  add(
    new THREE.CylinderGeometry(0.052, 0.052, 0.03, 6).rotateZ(Math.PI / 2),
    steel,
    0.475,
    FOOT + 0.13,
    0,
  );
  add(knurl(0.042, 0.03), darkSteel, 0.505, FOOT + 0.13, 0);
  add(
    new THREE.CylinderGeometry(0.024, 0.04, 0.05, 20).rotateZ(Math.PI / 2),
    rubber,
    0.54,
    FOOT + 0.13,
    0,
  );
  add(
    new THREE.CylinderGeometry(0.024, 0.024, 0.022, 6).rotateZ(Math.PI / 2),
    steel,
    0.472,
    FOOT + 0.05,
    -0.05,
  );
  add(
    new THREE.CylinderGeometry(0.012, 0.018, 0.03, 14).rotateZ(Math.PI / 2),
    rubber,
    0.495,
    FOOT + 0.05,
    -0.05,
  );

  // ── Trailing cables: yellow from both ends, the heavy black feed from the right.
  const cables = new THREE.Group();
  root.add(cables);
  const curve = (points: [number, number, number][]) =>
    new THREE.CatmullRomCurve3(
      points.map((points2) => new THREE.Vector3(...points2)),
    );
  const tube = (
    vector: THREE.Curve<THREE.Vector3>,
    radius: number,
    material: THREE.Material,
  ) =>
    add(
      new THREE.TubeGeometry(vector, 64, radius, 10),
      material,
      0,
      0,
      0,
      cables,
    );
  const lead = curve([
    [-0.57, FOOT + 0.13, 0],
    [-0.63, FOOT + 0.12, 0.01],
    [-0.7, FOOT + 0.05, 0.06],
    [-0.72, 0.012, 0.16],
    [-0.62, 0.012, 0.24],
    [-0.52, 0.012, 0.2],
  ]);
  tube(lead, 0.011, yellow);
  tube(
    curve([
      [-0.49, FOOT + 0.05, 0.05],
      [-0.55, FOOT + 0.03, 0.09],
      [-0.6, 0.009, 0.14],
      [-0.68, 0.009, 0.1],
    ]),
    0.006,
    rubber,
  );
  tube(
    curve([
      [0.56, FOOT + 0.13, 0],
      [0.63, FOOT + 0.11, -0.01],
      [0.69, 0.03, -0.04],
      [0.78, 0.02, -0.12],
      [0.86, 0.02, -0.08],
    ]),
    0.02,
    rubber,
  );
  tube(
    curve([
      [0.51, FOOT + 0.05, -0.05],
      [0.57, FOOT + 0.04, -0.08],
      [0.62, 0.01, -0.14],
      [0.58, 0.01, -0.24],
      [0.5, 0.01, -0.26],
      [0.44, 0.01, -0.22],
    ]),
    0.009,
    yellow,
  );
  // Black bands printed along the yellow lead.
  for (const timeSeconds2 of [0.25, 0.5, 0.75]) {
    const point = lead.getPointAt(timeSeconds2),
      band = add(
        new THREE.CylinderGeometry(0.0118, 0.0118, 0.012, 12),
        rubber,
        point.x,
        point.y,
        point.z,
        cables,
      );
    band.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      lead.getTangentAt(timeSeconds2),
    );
  }

  root.needle = needle;
  root.led = led;
  root.cables = cables;
  root.setGauge = (sampleValue: number) => {
    needle.rotation.z =
      (-(-135 + THREE.MathUtils.clamp(sampleValue, 0, 1) * 270) * Math.PI) /
      180;
  };
  root.setGauge(0.08);
  root.dispose = () => {
    root.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((timeSeconds) => timeSeconds.dispose());
  };
  return root;
}
