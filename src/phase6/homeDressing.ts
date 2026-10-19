import * as THREE from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';
import { concreteTexture } from '../presentation/Surfaces';

/**
 * Background dressing for the home waterfront: the street behind the lawn with its row of San
 * Fransokyo houses, the taller waterfront block to the west, park and street trees, kerbs, paving,
 * planters, lamps, a tram stop and overhead wires, and the hills of the city stepping away inland.
 *
 * It only adds things around the edges. Nothing goes inside the story area (the lawn between the
 * benches, the bin, the promenade in front of them, and the gate), and nothing stands in the end
 * shot's line of sight over the rail. Every repeated piece is one InstancedMesh per geometry and
 * material (colour varies per instance), the whole set adds about thirty draws, and it adds no
 * lights: windows and lamp heads are emissive, so the existing lamps and sun do the lighting.
 */

type V3 = [number, number, number];

/** Collects instances per geometry + material, each with its own colour, and builds them once. */
class Batch {
  private sets = new Map<
    THREE.BufferGeometry,
    Map<THREE.Material, { m: THREE.Matrix4; c: THREE.Color }[]>
  >();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private white = new THREE.Color('#ffffff');
  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    p: V3,
    s: V3,
    r: V3 = [0, 0, 0],
    color: THREE.Color = this.white,
  ) {
    let byMat = this.sets.get(geometry);
    if (!byMat) this.sets.set(geometry, (byMat = new Map()));
    let list = byMat.get(material);
    if (!list) byMat.set(material, (list = []));
    this.q.setFromEuler(this.e.set(...r));
    list.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(...p),
        this.q,
        new THREE.Vector3(...s),
      ),
      c: color,
    });
  }
  build(kit: SceneKit) {
    const meshes: THREE.InstancedMesh[] = [];
    for (const [geometry, byMat] of this.sets)
      for (const [material, list] of byMat) {
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        mesh.name = 'home-dressing';
        list.forEach(({ m, c }, index) => {
          mesh.setMatrixAt(index, m);
          mesh.setColorAt(index, c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        kit.root.add(mesh);
        meshes.push(mesh);
      }
    this.sets.clear();
    return meshes;
  }
}

/** Soft grass: mottled blades and faint mowing bands, so the lawn is not one flat colour. */
function lawnTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c9cdbf';
  context.fillRect(0, 0, 256, 256);
  const random = seeded(4471);
  for (let band = 0; band < 4; band++) {
    context.fillStyle = band % 2 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.025)';
    context.fillRect(0, band * 64, 256, 64);
  }
  for (let index = 0; index < 9000; index++) {
    const value = 150 + Math.floor(random() * 105);
    context.fillStyle = `rgba(${value},${value},${value - 10},${0.08 + random() * 0.16})`;
    context.fillRect(random() * 256, random() * 256, 1, 1 + random() * 3);
  }
  for (let index = 0; index < 40; index++) {
    context.fillStyle = `rgba(90,96,80,${0.02 + random() * 0.03})`;
    context.beginPath();
    context.arc(random() * 256, random() * 256, 6 + random() * 18, 0, 7);
    context.fill();
  }
  return canvas;
}

/** Promenade paving: running-bond granite setts with darker joints and a little wear. */
function pavingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const random = seeded(8813);
  context.fillStyle = '#6f6a65';
  context.fillRect(0, 0, 256, 256);
  const rows = 8,
    rowH = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? 32 : 0;
    for (let col = -1; col < 4; col++) {
      const value = 196 + Math.floor(random() * 40);
      context.fillStyle = `rgb(${value},${value - 4},${value - 9})`;
      context.fillRect(col * 64 + offset + 1.5, row * rowH + 1.5, 61, rowH - 3);
    }
  }
  for (let index = 0; index < 5000; index++) {
    context.fillStyle = `rgba(60,58,54,${random() * 0.08})`;
    context.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1);
  }
  return canvas;
}

/** Asphalt that reads as a street at dusk rather than a grey slab. */
function asphaltTexture() {
  const texture = concreteTexture();
  texture.repeat.set(10, 2);
  return texture;
}

function canvasMap(kit: SceneKit, canvas: HTMLCanvasElement, repeat: [number, number]) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  own(kit, texture);
  return texture;
}

function own(kit: SceneKit, texture: THREE.Texture) {
  const dispose = kit.dispose.bind(kit);
  kit.dispose = () => {
    dispose();
    texture.dispose();
  };
}

/** Facade colours: the bay's painted wood and stucco, warm-neutral, nothing saturated. */
const FACADES = ['#bdb19d', '#9aa59e', '#ab9d8b', '#939fab', '#b59784', '#c6bdad', '#a8a592'];
const AWNINGS = ['#3e4a5c', '#7a3d34', '#3f5446', '#5a4b3f'];
const LEAVES = ['#56704a', '#4b6544', '#627b50', '#6f7f4b', '#4f6a52'];

/**
 * Dress the home set around its story area. `lawn` and `path` are the set's own ground materials;
 * they get surface texture here so the ground no longer reads as flat single colours.
 */
export function dressHome(
  kit: SceneKit,
  ground: { lawn: THREE.MeshStandardMaterial; path: THREE.MeshStandardMaterial },
) {
  const random = seeded(2604),
    between = (a: number, b: number) => a + random() * (b - a),
    pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const color = (hex: string, jitter = 0.04) =>
    new THREE.Color(hex).offsetHSL(0, 0, (random() - 0.5) * jitter * 2);

  ground.lawn.map = canvasMap(kit, lawnTexture(), [14, 4]);
  ground.lawn.color.set('#658765');
  ground.lawn.needsUpdate = true;
  ground.path.map = canvasMap(kit, pavingTexture(), [40, 2.4]);
  ground.path.color.set('#b0a69a');
  ground.path.needsUpdate = true;

  // Shared geometry. Unit boxes and cylinders, scaled per instance.
  const box = kit.boxGeo,
    blob = kit.sphereGeo,
    cyl = kit.ownGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
    trunkGeo = kit.ownGeometry(new THREE.CylinderGeometry(0.32, 0.5, 1, 7).translate(0, 0.5, 0)),
    pane = kit.ownGeometry(new THREE.PlaneGeometry(1, 1)),
    hip = kit.ownGeometry(
      new THREE.CylinderGeometry(0, 0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4),
    );

  // Materials: white base colours so instance colours carry the variation.
  const painted = kit.standard('#ffffff', 0.86, 0.02),
    stone = kit.standard('#ffffff', 0.9, 0.02),
    trim = kit.standard('#e9e3d6', 0.7, 0.05),
    roofTile = kit.standard('#3b3f45', 0.75, 0.15),
    metal = kit.standard('#3a4148', 0.55, 0.55),
    glass = kit.standard('#4a5862', 0.3, 0.15),
    leaves = kit.ownMaterial(
      new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, flatShading: true }),
    ),
    bark = kit.standard('#4a3c33', 0.95, 0),
    lit = kit.basic('#ffcf98', 0.95),
    lampHead = kit.basic('#ffe2bd', 1.4),
    asphalt = kit.standard('#4a4e55', 0.94, 0.03),
    distant = kit.standard('#ffffff', 0.95, 0);
  const asphaltMap = asphaltTexture();
  own(kit, asphaltMap);
  asphalt.map = asphaltMap;

  const b = new Batch();

  // ---- Ground beyond the lawn -------------------------------------------------------------
  // Granite kerbs where the lawn meets the promenade and where it meets the street (flush, so no
  // walk path changes), the sidewalk, the street with its tram rails, the far sidewalk.
  b.add(box, stone, [0, 0.035, -2.42], [60, 0.05, 0.22], [0, 0, 0], color('#b9b2a6'));
  b.add(box, stone, [0, 0.05, 12.1], [180, 0.1, 0.3], [0, 0, 0], color('#b9b2a6'));
  b.add(box, painted, [0, 0.03, 13.6], [180, 0.06, 2.7], [0, 0, 0], color('#a49d94'));
  b.add(box, stone, [0, 0.07, 15.05], [180, 0.14, 0.24], [0, 0, 0], color('#bab4a8'));
  b.add(box, asphalt, [0, -0.02, 19], [180, 0.06, 7.8], [0, 0, 0]);
  for (const z of [17.6, 18.9, 20.1, 21.4])
    b.add(box, metal, [0, 0.02, z], [180, 0.03, 0.07]);
  for (let x = -86; x <= 86; x += 6)
    b.add(box, trim, [x, 0.015, 19.75], [2.6, 0.02, 0.1], [0, 0, 0], color('#d8d2c6'));
  b.add(box, stone, [0, 0.07, 22.95], [180, 0.14, 0.24], [0, 0, 0], color('#bab4a8'));
  b.add(box, painted, [0, 0.03, 24.6], [180, 0.06, 3.1], [0, 0, 0], color('#a49d94'));
  // The ground block under the street and houses (the set's own stone ends at z 19).
  b.add(box, stone, [0, -0.62, 45], [180, 1.2, 56], [0, 0, 0], color('#6b6862'));
  // The waterfront continues west and east past the lawn: paving, sea wall, rail.
  for (const side of [-1, 1]) {
    b.add(box, painted, [side * 60, -0.01, 3], [60, 0.04, 18], [0, 0, 0], color('#a8a197'));
    b.add(box, stone, [side * 60, -0.6, 3], [60, 1.2, 18.6], [0, 0, 0], color('#b8a690', 0.02));
    b.add(box, stone, [side * 60, -0.7, -6.3], [60, 1.4, 0.6], [0, 0, 0], color('#b8a690', 0.02));
    b.add(box, metal, [side * 60, 1.1, -6.1], [60, 0.06, 0.08]);
    b.add(box, metal, [side * 60, 0.6, -6.1], [60, 0.03, 0.04]);
    for (let x = 31; x <= 89; x += 2)
      b.add(box, metal, [side * x, 0.55, -6.1], [0.06, 1.1, 0.06]);
  }
  // The lawn's open ends close with a low clipped hedge and planters, not a cliff edge.
  for (const side of [-1, 1]) {
    b.add(box, leaves, [side * 30.2, 0.4, 4.8], [0.9, 0.8, 14], [0, 0, 0], color('#4c6646'));
    b.add(box, stone, [side * 30.2, 0.12, 4.8], [1.1, 0.24, 14.2], [0, 0, 0], color('#b9b2a6'));
  }
  b.add(box, leaves, [0, 0.42, 11.6], [60, 0.75, 0.7], [0, 0, 0], color('#4c6646'));

  // ---- Trees -------------------------------------------------------------------------------
  // A rounded crown of a few flattened blobs on a tapered trunk, tinted per tree.
  const tree = (x: number, z: number, height: number, spread: number) => {
    const lean: V3 = [(random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.08];
    const trunkH = height * 0.48;
    b.add(trunkGeo, bark, [x, 0, z], [0.22 * spread, trunkH, 0.22 * spread], lean);
    const tint = pick(LEAVES);
    const blobs = 4 + Math.floor(random() * 3);
    for (let index = 0; index < blobs; index++) {
      const angle = (index / blobs) * Math.PI * 2 + random();
      const radius = index === 0 ? 0 : spread * between(0.5, 0.95);
      b.add(
        blob,
        leaves,
        [
          x + Math.cos(angle) * radius,
          trunkH + height * between(0.12, 0.4),
          z + Math.sin(angle) * radius,
        ],
        [spread * between(0.9, 1.25), height * between(0.2, 0.28), spread * between(0.9, 1.25)],
        [0, random() * 3, 0],
        color(tint, 0.05),
      );
    }
  };
  // Park trees at the lawn's ends, well clear of the bench-to-bench story area.
  for (const [x, z] of [
    [-15, 8.2], [-19.5, 3.6], [-24, 8.8], [-27, 2.2], [-22, -0.6],
    [17.5, 8.6], [22, 3.4], [26, 8], [27.5, 0.6],
  ])
    tree(x, z, between(6, 7.6), between(1.6, 2.2));
  // Street trees: the near sidewalk only outside the end shot's view over the rail.
  for (const x of [-44, -35, -26, 23, 32, 41]) tree(x + between(-0.6, 0.6), 13.4, between(6.5, 8), between(1.5, 1.9));
  for (let x = -84; x <= 60; x += 9) tree(x + between(-1, 1), 24.3, between(6.5, 8.5), between(1.5, 2));

  // ---- Street furniture ---------------------------------------------------------------------
  // Lamps along the street, the same warm heads as the promenade lamps.
  const lamp = (x: number, z: number, facing: number) => {
    b.add(cyl, metal, [x, 2.5, z], [0.13, 5, 0.13]);
    b.add(box, metal, [x, 4.95, z + facing * 0.45], [0.08, 0.08, 0.9]);
    b.add(box, lampHead, [x, 4.86, z + facing * 0.85], [0.34, 0.1, 0.22]);
  };
  for (const x of [-48, -30, -14, 18, 34, 50]) lamp(x, 14.75, 1);
  for (let x = -80; x <= 64; x += 18) lamp(x + 4, 23.3, -1);
  // Bollards along the promenade kerb at the far ends of the lawn.
  for (let x = 17; x <= 29; x += 2.4)
    for (const side of [-1, 1]) b.add(cyl, metal, [side * x, 0.42, -2.62], [0.16, 0.84, 0.16]);
  // Planters with clipped shrubs on the sidewalk and the promenade ends.
  const planter = (x: number, z: number, w: number) => {
    b.add(box, stone, [x, 0.3, z], [w, 0.6, 0.9], [0, 0, 0], color('#b4ada1'));
    for (let index = 0; index < Math.round(w / 0.7); index++)
      b.add(
        blob,
        leaves,
        [x - w / 2 + 0.4 + index * 0.7, 0.78, z],
        [0.42, 0.34, 0.4],
        [0, random() * 3, 0],
        color(pick(LEAVES), 0.06),
      );
  };
  for (const x of [-38, -21, 27, 45]) planter(x, 14.4, 2.4);
  for (const x of [-34, -40, 34, 40]) planter(x, -4.4, 2.2);
  // A tram stop on the near side, under the existing overhead line: posts, roof, glass.
  const stopX = -20.5;
  b.add(box, metal, [stopX, 2.6, 13.1], [3.8, 0.1, 1.5]);
  for (const dx of [-1.8, 1.8]) b.add(box, metal, [stopX + dx, 1.3, 13.6], [0.08, 2.6, 0.08]);
  b.add(box, glass, [stopX, 1.35, 13.75], [3.5, 2.2, 0.04]);
  b.add(box, painted, [stopX, 0.45, 13.4], [2.2, 0.08, 0.4], [0, 0, 0], color('#6d5545'));
  // Hydrants, the city's own white-topped kind, and a couple of litter bins and sign posts.
  for (const x of [-31, 21, 39]) {
    b.add(cyl, painted, [x, 0.32, 14.3], [0.26, 0.64, 0.26], [0, 0, 0], color('#e7e1d4'));
    b.add(blob, painted, [x, 0.66, 14.3], [0.15, 0.1, 0.15], [0, 0, 0], color('#c9a53c'));
  }
  for (const x of [-27, 30]) b.add(cyl, metal, [x, 0.42, 14.5], [0.5, 0.84, 0.5]);
  for (const x of [-42, 25]) {
    b.add(cyl, metal, [x, 1.4, 14.7], [0.06, 2.8, 0.06]);
    b.add(box, painted, [x, 2.6, 14.7], [0.7, 0.18, 0.03], [0, 0, 0], color('#3f5446'));
  }
  // Overhead trolley wires over the street, carried on span wires between the sidewalk poles.
  const wirePoles: number[] = [];
  for (const x of [-84, -59, -34, 16, 41, 66]) {
    wirePoles.push(x);
    for (const z of [15.3, 22.7]) b.add(cyl, metal, [x, 3.6, z], [0.18, 7.2, 0.18]);
  }
  for (const z of [18.6, 20.4])
    kit.line([new THREE.Vector3(-90, 6.4, z), new THREE.Vector3(70, 6.4, z)], '#2a3036', 0.85);
  for (const x of wirePoles)
    kit.line([new THREE.Vector3(x, 6.8, 15.3), new THREE.Vector3(x, 6.45, 19.5), new THREE.Vector3(x, 6.8, 22.7)], '#2a3036', 0.75);

  // ---- The row of houses across the street ---------------------------------------------------
  // Painted three- and four-storey houses with bay windows, cornices and garage or shop fronts;
  // a few shops carry a low tiled eave, the Japanese side of the city's mix. Facing the water.
  const frontZ = 26.2;
  let x = -90;
  while (x < 66) {
    const width = between(6, 8.5),
      storeys = 3 + (random() < 0.4 ? 1 : 0),
      storeyH = 3.1,
      height = storeys * storeyH + 0.6,
      cx = x + width / 2,
      setback = between(0, 0.35),
      face = frontZ + setback,
      tint = color(pick(FACADES), 0.03);
    x += width + (random() < 0.12 ? between(1.5, 3) : 0);
    b.add(box, painted, [cx, height / 2, face + 6], [width, height, 12], [0, 0, 0], tint);
    // Cornice and floor bands.
    b.add(box, trim, [cx, height - 0.2, face - 0.18], [width + 0.2, 0.42, 0.42]);
    for (let s = 1; s < storeys; s++)
      b.add(box, trim, [cx, s * storeyH, face - 0.06], [width, 0.12, 0.14]);
    // A bay window up the upper floors on one side, and plain windows beside it.
    const bayX = cx + (random() < 0.5 ? -1 : 1) * (width / 2 - 1.7);
    const bayH = (storeys - 1) * storeyH - 0.4;
    b.add(box, painted, [bayX, storeyH + bayH / 2 + 0.2, face - 0.45], [2.6, bayH, 0.9], [0, 0, 0], tint);
    for (let s = 1; s < storeys; s++) {
      const y = s * storeyH + 1.55;
      for (const dx of [-0.85, 0, 0.85]) {
        const on = random() < 0.22;
        b.add(pane, on ? lit : glass, [bayX + dx, y, face - 0.91], [0.62, 1.6, 1], [0, Math.PI, 0]);
      }
      const otherX = bayX < cx ? cx + width / 4 : cx - width / 4;
      for (const dx of [-0.7, 0.7]) {
        const on = random() < 0.2;
        b.add(pane, on ? lit : glass, [otherX + dx, y, face - 0.01], [0.75, 1.6, 1], [0, Math.PI, 0]);
        b.add(box, trim, [otherX + dx, y - 0.88, face - 0.06], [0.95, 0.08, 0.14]);
      }
    }
    // Ground floor: a shop with an awning (some under a tiled eave) or a garage and stoop.
    if (random() < 0.45) {
      b.add(pane, random() < 0.6 ? lit : glass, [cx, 1.35, face - 0.01], [width - 1.6, 2.1, 1], [0, Math.PI, 0]);
      if (random() < 0.4) {
        b.add(box, roofTile, [cx, 2.95, face - 0.42], [width + 0.1, 0.12, 1.0], [-0.32, 0, 0]);
        b.add(box, painted, [cx - width / 4, 2.25, face - 0.06], [0.9, 0.9, 0.04], [0, 0, 0], color('#6d3a32'));
      } else
        b.add(box, painted, [cx, 2.7, face - 0.55], [width - 1.2, 0.08, 1.1], [-0.28, 0, 0], color(pick(AWNINGS), 0.03));
    } else {
      b.add(box, painted, [cx - width / 4, 1.15, face - 0.02], [width / 2 - 0.6, 2.2, 0.06], [0, 0, 0], color('#8c8378'));
      const doorX = cx + width / 4;
      b.add(pane, random() < 0.4 ? lit : glass, [doorX, 1.95, face - 0.01], [0.95, 1.9, 1], [0, Math.PI, 0]);
      for (let step = 0; step < 3; step++)
        b.add(box, stone, [doorX, 0.12 + step * 0.22, face - 1.15 + step * 0.32], [1.4, 0.24, 0.34], [0, 0, 0], color('#b4ada1'));
    }
    // Rooftop: a vent, a small plant box or a water tank on the taller ones.
    if (random() < 0.5)
      b.add(box, metal, [cx + between(-1.5, 1.5), height + 0.35, face + between(3, 8)], [1.2, 0.7, 0.9]);
    if (storeys === 4 && random() < 0.5)
      b.add(cyl, painted, [cx + between(-1, 1), height + 1.2, face + 7], [1.6, 2.2, 1.6], [0, 0, 0], color('#7d6b5a'));
  }

  // ---- The waterfront block to the west -----------------------------------------------------
  // Taller brick-and-stucco warehouses turned offices between the sea wall and the street, facing
  // the lawn across a small plaza, one with a tiered hip roof. They close the west end of the home
  // and wide shots behind the cherry tree.
  const westBlocks: [number, number, number, number, string][] = [
    // centre z, length along z, height, depth, colour
    [-0.5, 10, 17, 15, '#a98d79'],
    [8, 7, 21, 15, '#bdb2a1'],
  ];
  const westFace = -38;
  for (const [cz, length, height, depth, hex] of westBlocks) {
    const tint = color(hex, 0.02),
      cx = westFace - depth / 2;
    b.add(box, painted, [cx, height / 2, cz], [depth, height, length], [0, 0, 0], tint);
    b.add(box, trim, [westFace + 0.18, height - 0.25, cz], [0.42, 0.5, length + 0.2]);
    const floors = Math.floor((height - 1) / 3.4);
    for (let f = 1; f < floors; f++) {
      b.add(box, trim, [westFace + 0.06, f * 3.4, cz], [0.14, 0.12, length]);
      for (let w = -length / 2 + 1.2; w < length / 2 - 0.8; w += 1.6)
        b.add(pane, random() < 0.16 ? lit : glass, [westFace + 0.01, f * 3.4 + 1.6, cz + w], [1, 1.9, 1], [0, Math.PI / 2, 0]);
    }
    b.add(pane, lit, [westFace + 0.01, 1.5, cz], [length - 3, 2.2, 1], [0, Math.PI / 2, 0]);
    b.add(box, painted, [westFace + 0.6, 2.9, cz], [1.2, 0.08, length - 2.4], [0, 0, -0.25], color('#3e4a5c'));
  }
  // The tiered hip roof on the middle block: two layers of dark tile.
  b.add(hip, roofTile, [westFace - 7.5, 21 + 1.4, 8], [16.2, 2.8, 7.8]);
  b.add(box, trim, [westFace - 7.5, 21 + 3.0, 8], [8.4, 1.2, 4.2]);
  b.add(hip, roofTile, [westFace - 7.5, 21 + 4.2, 8], [9.4, 1.6, 5]);

  // ---- The hills inland ---------------------------------------------------------------------
  // Cheap stepped silhouettes, darker and cooler with distance; the fog does the rest.
  for (let index = 0; index < 70; index++) {
    const zz = between(48, 150),
      far = (zz - 48) / 102,
      xx = between(-150, 130),
      hill = 6 + 14 * Math.max(0, Math.sin((xx + 40) / 60)) + far * 10,
      w = between(6, 14),
      h = hill + between(3, 12);
    b.add(box, distant, [xx, h / 2, zz], [w, h, between(6, 12)], [0, between(-0.2, 0.2), 0], new THREE.Color('#5c6072').lerp(new THREE.Color('#7f8193'), far));
  }
  for (const [xx, zz, h] of [[-60, 110, 46], [-28, 128, 58], [36, 120, 40]])
    b.add(box, distant, [xx, h / 2, zz], [8, h, 8], [0, 0.3, 0], new THREE.Color('#6d7083'));

  return b.build(kit);
}
