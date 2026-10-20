import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seeded, type SceneKit } from '../phase2/SceneKit';
import { worldMapped, type WorldSurfaces } from '../presentation/WorldSurfaces';

/**
 * Close-up street furniture for the home waterfront, modelled to be looked at from a step away in
 * first person: a cast-iron park bench and a harbour litter bin. Real proportions (metres), round
 * iron sections that bend instead of boxes, rounded-edge timber with grain and slat-to-slat colour
 * drift, bolt heads, a liner bag folded over the rim, and small engraved plates. Each piece merges
 * per material (a bench is four draws, the bin about eight).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** An engraved plate: dark lettering cut into a metal or enamel face. */
function plateTexture(
  kit: SceneKit,
  lines: string[],
  face: string,
  ink: string,
  width = 512,
  height = 128,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = face;
  context.fillRect(0, 0, width, height);
  const random = seeded(4417);
  for (let index = 0; index < 1400; index++) {
    context.fillStyle = `rgba(0,0,0,${random() * 0.06})`;
    context.fillRect(random() * width, random() * height, 1 + random() * 3, 1);
  }
  context.strokeStyle = ink;
  context.globalAlpha = 0.55;
  context.lineWidth = 3;
  context.strokeRect(6, 6, width - 12, height - 12);
  context.globalAlpha = 1;
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => {
    const size = index === 0 ? height * 0.24 : height * 0.17;
    context.font = `${index === 0 ? 600 : 500} ${size}px "Space Grotesk", Arial, sans-serif`;
    context.fillText(
      line,
      width / 2,
      height * (lines.length === 1 ? 0.5 : 0.36 + index * 0.32),
      width - 40,
    );
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const dispose = kit.dispose.bind(kit);
  kit.dispose = () => {
    dispose();
    texture.dispose();
  };
  return texture;
}

/** Bake a list of [geometry, matrix] into one geometry (non-indexed, normals kept). */
function bake(parts: [THREE.BufferGeometry, THREE.Matrix4][]) {
  const geometries = parts.map(([geometry, matrix]) => {
    const copy = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
    for (const name of Object.keys(copy.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
    if (!copy.getAttribute('uv'))
      copy.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(copy.getAttribute('position').count * 2), 2),
      );
    return copy;
  });
  const merged = mergeGeometries(geometries, false)!;
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    V(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    V(sx, sy, sz),
  );

/** Shared materials for the furniture, made once per set. */
export function furnitureMaterials(kit: SceneKit, surface: WorldSurfaces) {
  return {
    /** Cast iron in a deep green-black enamel, a little worn to a satin sheen. */
    iron: kit.standard('#1b2120', 0.48, 0.72),
    /** Weathered hardwood; the grain is in world space, the colour drifts slat to slat. */
    wood: worldMapped(kit.standard('#ffffff', 0.78, 0), surface.wood, 0.6),
    bolt: kit.standard('#6b6d6c', 0.38, 0.9),
    /** The bin's painted steel, with street grime in it. */
    paint: worldMapped(kit.standard('#2b5243', 0.58, 0.32), surface.stucco, 0.7),
    /** Black refuse sack: glossy, creased plastic. */
    sack: kit.ownMaterial(
      new THREE.MeshStandardMaterial({
        color: '#0b0c0d',
        roughness: 0.32,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    ),
  };
}
export type FurnitureMaterials = ReturnType<typeof furnitureMaterials>;

/**
 * A cast-iron park bench, 1.8 m long. Local frame: x along it, +z its front, y up, origin on the
 * ground under the middle of the seat.
 */
export function buildParkBench(
  kit: SceneKit,
  materials: FurnitureMaterials,
  random: () => number,
  plate?: string[],
) {
  const bench = new THREE.Group();
  bench.name = 'park-bench';
  // The end frames: round iron bent into a raked back leg, a front leg with a flared foot, the seat
  // bearer, and an armrest that rolls over into a scroll on a short post.
  const curves: [THREE.Vector3[], number][] = [
    [[V(0, 0.01, -0.31), V(0, 0.2, -0.255), V(0, 0.42, -0.215), V(0, 0.7, -0.275), V(0, 0.97, -0.34)], 0.022],
    [[V(0, 0.01, 0.285), V(0, 0.1, 0.24), V(0, 0.28, 0.212), V(0, 0.43, 0.22)], 0.022],
    [[V(0, 0.425, 0.25), V(0, 0.415, 0.02), V(0, 0.425, -0.22)], 0.018],
    [[V(0, 0.68, -0.27), V(0, 0.672, -0.05), V(0, 0.665, 0.15), V(0, 0.64, 0.27), V(0, 0.585, 0.315), V(0, 0.525, 0.29), V(0, 0.528, 0.236), V(0, 0.567, 0.24)], 0.019],
    [[V(0, 0.43, 0.215), V(0, 0.52, 0.232), V(0, 0.6, 0.272)], 0.015],
  ];
  const iron: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const tubes = curves.map(
    ([points, radius]) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, radius, 8, false),
  );
  const pad = new THREE.BoxGeometry(0.075, 0.014, 0.11);
  const centre = new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8);
  for (const end of [-0.82, 0.82]) {
    for (const tube of tubes) iron.push([tube, at(end, 0, 0)]);
    iron.push([pad, at(end, 0.007, 0.285)], [pad, at(end, 0.007, -0.31)]);
  }
  // A centre stay under the seat, so the slats don't sag.
  iron.push([centre, at(0, 0.235, 0.0)]);
  iron.push([new THREE.BoxGeometry(0.05, 0.03, 0.44), at(0, 0.42, 0)]);
  const ironGeometry = kit.ownGeometry(bake(iron));
  tubes.forEach((tube) => tube.dispose());
  pad.dispose();
  centre.dispose();
  bench.add(new THREE.Mesh(ironGeometry, materials.iron));

  // Timber: five seat slats and three back slats, rounded on every edge, each its own shade.
  const seatSlat = kit.ownGeometry(new RoundedBoxGeometry(1.78, 0.03, 0.07, 2, 0.008));
  const backSlat = kit.ownGeometry(new RoundedBoxGeometry(1.78, 0.082, 0.028, 2, 0.008));
  const shade = () =>
    new THREE.Color('#8d6c50').offsetHSL(
      (random() - 0.5) * 0.02,
      (random() - 0.5) * 0.08,
      (random() - 0.5) * 0.08,
    );
  const RAKE = 0.21;
  const seats = new THREE.InstancedMesh(seatSlat, materials.wood, 5),
    backs = new THREE.InstancedMesh(backSlat, materials.wood, 3);
  const bolts: THREE.Matrix4[] = [];
  for (let slat = 0; slat < 5; slat++) {
    const z = -0.17 + slat * 0.084;
    seats.setMatrixAt(slat, at(0, 0.452, z, 0, 0, (random() - 0.5) * 0.004));
    seats.setColorAt(slat, shade());
    for (const end of [-0.82, 0.82]) bolts.push(at(end, 0.467, z, 0, 0, 0, 1, 0.45, 1));
  }
  for (let slat = 0; slat < 3; slat++) {
    const y = 0.6 + slat * 0.115,
      z = -0.245 - (y - 0.46) * Math.tan(RAKE);
    backs.setMatrixAt(slat, at(0, y, z, -RAKE, 0, 0));
    backs.setColorAt(slat, shade());
    for (const end of [-0.82, 0.82])
      bolts.push(at(end, y, z + 0.016, Math.PI / 2 - RAKE, 0, 0, 1, 0.45, 1));
  }
  for (const mesh of [seats, backs]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
    bench.add(mesh);
  }
  // Carriage-bolt heads where the slats meet the ends.
  const boltHead = kit.ownGeometry(
    new THREE.SphereGeometry(0.009, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  );
  const boltMesh = new THREE.InstancedMesh(boltHead, materials.bolt, bolts.length);
  bolts.forEach((matrix, index) => boltMesh.setMatrixAt(index, matrix));
  boltMesh.instanceMatrix.needsUpdate = true;
  boltMesh.computeBoundingSphere();
  bench.add(boltMesh);

  // A small brass plate screwed to the top back slat.
  if (plate) {
    const y = 0.6 + 2 * 0.115,
      z = -0.245 - (y - 0.46) * Math.tan(RAKE) + 0.017;
    const brass = kit.ownMaterial(
      new THREE.MeshStandardMaterial({
        map: plateTexture(kit, plate, '#c9a560', '#3a2a12'),
        roughness: 0.32,
        metalness: 0.85,
      }),
    );
    const mesh = new THREE.Mesh(
      kit.ownGeometry(new RoundedBoxGeometry(0.2, 0.05, 0.003, 1, 0.0012)),
      brass,
    );
    mesh.position.set(0, y, z);
    mesh.rotation.x = -RAKE;
    bench.add(mesh);
  }
  bench.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return bench;
}

/**
 * A harbour litter bin, 0.82 m to the rim. Local frame: origin on the ground at its centre, the
 * enamel plate facing +z. `top` is where its rubbish bed sits (the chip sticks up out of that).
 */
export function buildLitterBin(
  kit: SceneKit,
  materials: FurnitureMaterials,
  random: () => number,
) {
  const R = 0.3,
    H = 0.82;
  const bin = new THREE.Group();
  bin.name = 'litter-bin';

  // Cast plinth, two banding hoops, a rolled rim: one iron mesh.
  const ring = (radius: number, tube: number) => new THREE.TorusGeometry(radius, tube, 8, 40);
  const ironParts: [THREE.BufferGeometry, THREE.Matrix4][] = [
    [new THREE.CylinderGeometry(0.255, 0.285, 0.07, 28), at(0, 0.035, 0)],
    [new THREE.CylinderGeometry(0.27, 0.255, 0.02, 28), at(0, 0.08, 0)],
    [ring(R + 0.004, 0.014), at(0, 0.14, 0, Math.PI / 2)],
    [ring(R + 0.004, 0.014), at(0, 0.62, 0, Math.PI / 2)],
    [ring(R, 0.028), at(0, H, 0, Math.PI / 2)],
  ];
  bin.add(new THREE.Mesh(kit.ownGeometry(bake(ironParts)), materials.iron));
  ironParts.forEach(([geometry]) => geometry.dispose());

  // Painted steel slats, rounded, each a hair off true and a shade apart.
  const slatGeometry = kit.ownGeometry(new RoundedBoxGeometry(0.062, 0.7, 0.016, 2, 0.005));
  const count = 22,
    slats = new THREE.InstancedMesh(slatGeometry, materials.paint, count);
  const hoopBolts: THREE.Matrix4[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    slats.setMatrixAt(
      index,
      at(
        Math.sin(angle) * (R - 0.01),
        0.095 + 0.35,
        Math.cos(angle) * (R - 0.01),
        (random() - 0.5) * 0.01,
        angle,
        (random() - 0.5) * 0.008,
      ),
    );
    slats.setColorAt(
      index,
      new THREE.Color('#ffffff').offsetHSL(0, 0, (random() - 0.5) * 0.08),
    );
    if (index % 2 === 0)
      for (const y of [0.14, 0.62])
        hoopBolts.push(
          at(
            Math.sin(angle) * (R + 0.018),
            y,
            Math.cos(angle) * (R + 0.018),
            Math.PI / 2,
            0,
            -angle,
            1,
            0.5,
            1,
          ).multiply(new THREE.Matrix4().makeRotationX(0)),
        );
  }
  slats.instanceMatrix.needsUpdate = true;
  slats.instanceColor!.needsUpdate = true;
  slats.computeBoundingSphere();
  bin.add(slats);
  const boltHead = kit.ownGeometry(new THREE.SphereGeometry(0.008, 8, 5));
  const bolts = new THREE.InstancedMesh(boltHead, materials.bolt, hoopBolts.length);
  hoopBolts.forEach((matrix, index) => bolts.setMatrixAt(index, matrix));
  bolts.instanceMatrix.needsUpdate = true;
  bolts.computeBoundingSphere();
  bin.add(bolts);

  // The liner sack: down the inside, and folded out over the rim in uneven creases.
  const inside = new THREE.CylinderGeometry(R - 0.03, R - 0.05, H - 0.1, 28, 1, true);
  const fold = new THREE.CylinderGeometry(R + 0.016, R + 0.02, 0.085, 48, 3, true);
  const position = fold.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index),
      y = position.getY(index),
      z = position.getZ(index),
      angle = Math.atan2(x, z),
      crease =
        Math.sin(angle * 9 + 1.3) * 0.006 +
        Math.sin(angle * 23) * 0.003 +
        (y < 0 ? Math.sin(angle * 5) * 0.012 : 0);
    const radius = Math.hypot(x, z) + crease;
    position.setXYZ(
      index,
      Math.sin(angle) * radius,
      y + (y < 0 ? Math.sin(angle * 4 + 2) * 0.014 : 0),
      Math.cos(angle) * radius,
    );
  }
  fold.computeVertexNormals();
  bin.add(
    new THREE.Mesh(
      kit.ownGeometry(bake([[inside, at(0, 0.11 + (H - 0.1) / 2, 0)], [fold, at(0, H - 0.03, 0)]])),
      materials.sack,
    ),
  );
  inside.dispose();
  fold.dispose();

  // The enamel plate on the front.
  const enamel = kit.ownMaterial(
    new THREE.MeshStandardMaterial({
      map: plateTexture(
        kit,
        ['PORT OF SAN FRANSOKYO', 'KEEP OUR WATERFRONT CLEAN'],
        '#ece6d6',
        '#24453a',
      ),
      roughness: 0.25,
      metalness: 0.05,
    }),
  );
  const plate = new THREE.Mesh(
    kit.ownGeometry(new RoundedBoxGeometry(0.17, 0.045, 0.004, 1, 0.0015)),
    enamel,
  );
  // Bent to the barrel's curve is overkill at this size; it sits on two slats' faces.
  plate.position.set(0, 0.42, R + 0.012);
  bin.add(plate);

  // The rubbish bed under the rim, and what's on top of it.
  const top = 0.765;
  const bed = new THREE.Mesh(
    kit.ownGeometry(new THREE.CircleGeometry(R - 0.035, 24)),
    materials.sack,
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = top;
  bin.add(bed);
  const crumple = (size: number, seed: number) => {
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const jitter = seeded(seed),
      p = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < p.count; index++) {
      const k = 0.72 + jitter() * 0.4;
      p.setXYZ(index, p.getX(index) * k, p.getY(index) * k * 0.82, p.getZ(index) * k);
    }
    geometry.computeVertexNormals();
    geometry.scale(size, size, size);
    return kit.ownGeometry(geometry);
  };
  const paper = kit.standard('#e9e4d8', 0.95, 0),
    kraft = kit.standard('#a8865a', 0.95, 0);
  for (const [x, z, size, seed, material] of [
    [0.14, 0.05, 0.05, 11, paper],
    [-0.12, 0.1, 0.045, 23, kraft],
    [-0.05, -0.15, 0.056, 37, paper],
    [0.11, -0.12, 0.04, 41, paper],
    [0.19, -0.02, 0.034, 53, kraft],
    [-0.19, -0.1, 0.038, 61, paper],
    [0.02, 0.2, 0.03, 67, paper],
    [-0.15, 0.17, 0.033, 71, paper],
    [0.06, -0.2, 0.036, 79, kraft],
  ] as [number, number, number, number, THREE.Material][]) {
    const ball = new THREE.Mesh(crumple(size, seed), material);
    ball.position.set(x, top + size * 0.55, z);
    ball.rotation.set(x * 9, z * 11, x * 5);
    bin.add(ball);
  }
  // A takeaway coffee: cup, sleeve and lid, lying where it was dropped.
  const cup = new THREE.Group();
  cup.position.set(-0.16, top + 0.04, -0.01);
  cup.rotation.set(0, 0.6, Math.PI / 2 - 0.25);
  bin.add(cup);
  cup.add(
    new THREE.Mesh(
      kit.ownGeometry(new THREE.CylinderGeometry(0.036, 0.026, 0.1, 18, 1, true)),
      kit.ownMaterial(
        new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.55, side: THREE.DoubleSide }),
      ),
    ),
  );
  const sleeve = new THREE.Mesh(
    kit.ownGeometry(new THREE.CylinderGeometry(0.0345, 0.0305, 0.036, 18, 1, true)),
    kraft,
  );
  sleeve.position.y = -0.006;
  cup.add(sleeve);
  const lid = new THREE.Mesh(
    kit.ownGeometry(new THREE.CylinderGeometry(0.038, 0.037, 0.008, 18)),
    kit.standard('#1d1f20', 0.4, 0),
  );
  lid.position.y = 0.052;
  cup.add(lid);
  // A crushed soda can.
  const can = new THREE.Mesh(
    kit.ownGeometry(new THREE.CylinderGeometry(0.033, 0.03, 0.11, 18)),
    kit.standard('#a2302a', 0.3, 0.75),
  );
  can.position.set(0.04, top + 0.03, 0.15);
  can.rotation.set(0, 0.9, Math.PI / 2);
  can.scale.set(0.82, 1, 1);
  bin.add(can);
  // A flattened crisp packet, foil side up.
  const packet = new THREE.Mesh(
    kit.ownGeometry(new RoundedBoxGeometry(0.12, 0.006, 0.09, 1, 0.002)),
    kit.standard('#c8c2b0', 0.3, 0.8),
  );
  packet.position.set(-0.02, top + 0.012, -0.06);
  packet.rotation.set(0.12, 0.7, -0.08);
  bin.add(packet);
  bin.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return { bin, top };
}
