import * as T from 'three';
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

type V3 = [number, number, number];
export type Rand = () => number;
type Face = '+x' | '-x' | '+z' | '-z';

const STOREY = 3.2;
const scratch = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3(), e: new T.Euler(), m: new T.Matrix4() };

/**
 * Every mesh this kit builds is named 'city-dressing' and casts no shadow, so an adaptive-quality
 * pass can drop the lot at runtime: `scene.traverse(o => { if (o.name === 'city-dressing') o.visible = false; })`.
 */

/** Collects static instances and builds them as one InstancedMesh per geometry and material. */
export class Dressing {
  private sets = new Map<T.BufferGeometry, Map<T.Material, T.Matrix4[]>>();
  readonly cyl: T.BufferGeometry;
  readonly cone4: T.BufferGeometry;
  readonly disc: T.BufferGeometry;
  /** Panes are single quads (2 triangles instead of a box's 12); windows are the bulk of the count. */
  readonly pane: T.BufferGeometry;
  constructor(readonly k: SceneKit) {
    this.cyl = k.ownGeometry(new T.CylinderGeometry(.5, .5, 1, 10));
    // A four-sided cap turned square to the walls: the tiered tower roofs of San Fransokyo.
    this.cone4 = k.ownGeometry(new T.CylinderGeometry(0, .5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4));
    this.disc = k.ownGeometry(new T.CylinderGeometry(.5, .5, 1, 20));
    this.pane = k.ownGeometry(new T.PlaneGeometry(1, 1));
  }
  put(geometry: T.BufferGeometry, material: T.Material, matrix: T.Matrix4) {
    let byMat = this.sets.get(geometry); if (!byMat) this.sets.set(geometry, byMat = new Map());
    let list = byMat.get(material); if (!list) byMat.set(material, list = []);
    list.push(matrix);
  }
  /** A piece in `frame` (a building's or the world's matrix): position, size, optional rotation. */
  add(geometry: T.BufferGeometry, material: T.Material, frame: T.Matrix4 | null, p: V3, s: V3, r?: V3) {
    scratch.p.set(...p); scratch.s.set(...s); scratch.q.setFromEuler(scratch.e.set(...(r ?? [0, 0, 0])));
    const m = new T.Matrix4().compose(scratch.p, scratch.q, scratch.s);
    if (frame) m.premultiply(frame);
    this.put(geometry, material, m);
  }
  box(material: T.Material, frame: T.Matrix4 | null, p: V3, s: V3, r?: V3) { this.add(this.k.boxGeo, material, frame, p, s, r); }
  build(parent: T.Object3D = this.k.root) {
    const meshes: T.InstancedMesh[] = [];
    for (const [geometry, byMat] of this.sets) for (const [material, list] of byMat) {
      const mesh = new T.InstancedMesh(geometry, material, list.length); mesh.name = 'city-dressing'; mesh.castShadow = false;
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
      mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh); meshes.push(mesh);
    }
    this.sets.clear();
    const dispose = this.k.dispose.bind(this.k);
    this.k.dispose = () => { meshes.forEach(m => m.dispose()); dispose(); };
    return meshes;
  }
}

/** One shared set of city materials per scene kit. */
export function cityMaterials(k: SceneKit) {
  const asphaltMap = concreteTexture(); asphaltMap.repeat.set(3, 20);
  const asphalt = k.standard('#3b464c', .93, .04); asphalt.map = asphaltMap; asphalt.bumpMap = asphaltMap; asphalt.bumpScale = .02;
  const dispose = k.dispose.bind(k); k.dispose = () => { dispose(); asphaltMap.dispose(); };
  return {
    asphalt,
    glass: k.standard('#1b2a33', .2, .75),
    frame: k.standard('#141b20', .7, .35),
    sill: k.standard('#66716f', .75, .3),
    trim: k.standard('#2a363d', .8, .3),
    unit: k.standard('#8a9190', .55, .45),
    rust: k.standard('#6d4b39', .85, .3),
    steel: k.standard('#4d595e', .5, .65),
    patch: k.standard('#2b3439', .97, .02),
    puddle: k.standard('#34434b', .14, .35),
    crack: k.standard('#1a2126', 1, 0),
    cable: k.standard('#121619', .8, .2),
    warm: k.basic('#ffc47a', 1.05),
    curtain: k.basic('#c98e52', .55),
    cool: k.basic('#a9dbe6', .7),
    aviation: k.basic('#ff4632', 1.6),
    neon: [k.basic('#ff5a8a', 1.4), k.basic('#7fe6ff', 1.2), k.basic('#ffb15e', 1.35)],
  };
}
export type CityMaterials = ReturnType<typeof cityMaterials>;

/** A building's local frame: centred on its footprint, base at y = 0. */
export function buildingFrame(x: number, z: number, ry = 0, tilt = 0, y = 0) {
  const o = new T.Object3D(); o.position.set(x, y, z); o.rotation.set(0, ry, tilt); o.updateMatrix(); return o.matrix.clone();
}

/**
 * Upper-storey facade detail on the chosen faces of a w×h×d block in `frame`. Storey-height
 * windows (frame, glass, sill), floor bands, AC units, balconies, a drain pipe, broken panes.
 */
export function dressFacade(d: Dressing, m: CityMaterials, frame: T.Matrix4, w: number, h: number, depth: number, faces: Face[], random: Rand, opts: { from?: number; style?: 'apartment' | 'office' | 'works'; lit?: number; storey?: number } = {}) {
  const storey = opts.storey ?? STOREY, k = storey / STOREY, from = opts.from ?? 4.2, style = opts.style ?? (['apartment', 'office', 'works'] as const)[Math.floor(random() * 3)], lit = opts.lit ?? .1;
  for (const face of faces) {
    const alongX = face === '+z' || face === '-z';
    const sign = face[0] === '+' ? 1 : -1, half = alongX ? depth / 2 : w / 2, span = alongX ? w : depth;
    // Face coordinates: u along the wall, y up, n out of it.
    const at = (u: number, y: number, n: number): V3 => alongX ? [u, y, sign * (half + n)] : [sign * (half + n), y, u];
    const size = (su: number, sy: number, sn: number): V3 => alongX ? [su, sy, sn] : [sn, sy, su];
    const facing: V3 = [0, alongX ? (sign > 0 ? 0 : Math.PI) : sign * Math.PI / 2, 0];
    const pane = (material: T.Material, u: number, y: number, n: number, su: number, sy: number) => d.add(d.pane, material, frame, at(u, y, n), [su, sy, 1], facing);
    const bay = style === 'works' ? 3 : style === 'office' ? 1.6 : 2.3;
    const cols = Math.max(1, Math.floor((span - .8) / bay)), u0 = -(cols - 1) * bay / 2;
    let row = 0;
    for (let y = from; y + 2 * k < h; y += storey, row++) {
      const cy = y + 1.35 * k;
      d.box(m.trim, frame, at(0, y - .1, .06), size(span + .04, .16, .12));
      if (style === 'office') {
        pane(m.glass, 0, cy, .05, span - .7, 1.7 * k);
        for (let c = 0; c <= cols; c++) pane(m.frame, u0 - bay / 2 + c * bay, cy, .07, .08, 1.75 * k);
        for (let c = 0; c < cols; c++) { const r = random(); if (r < lit) pane(r < lit * .7 ? m.warm : m.cool, u0 + c * bay, cy, .06, bay - .14, 1.6 * k); }
        continue;
      }
      const ww = style === 'works' ? 2.4 : 1.25, wh = (style === 'works' ? 2.1 : 1.6) * k;
      for (let c = 0; c < cols; c++) {
        const u = u0 + c * bay, r = random();
        pane(m.frame, u, cy, .035, ww + .18, wh + .18);
        const glass = r < lit * .7 ? m.warm : r < lit ? m.curtain : r > .96 ? m.frame : m.glass;
        pane(glass, u, cy, .065, ww, wh);
        if (style === 'works') { pane(m.frame, u, cy, .075, .05, wh); pane(m.frame, u, cy + .3, .075, ww, .05); }
        d.box(m.sill, frame, at(u, cy - wh / 2 - .1, .12), size(ww + .3, .08, .22));
        if (style === 'apartment' && random() < .28) d.box(m.unit, frame, at(u + ww * .3, cy - wh / 2 - .45, .3), size(.75, .48, .5));
      }
      // Every other storey of an apartment block carries a balcony run on one bay.
      if (style === 'apartment' && row % 2 === 1 && cols > 1) {
        const u = u0 + Math.floor(random() * cols) * bay;
        d.box(m.sill, frame, at(u, y + .02, .55), size(bay - .2, .12, 1.1));
        d.box(m.steel, frame, at(u, y + .55, 1.08), size(bay - .2, .05, .04));
        d.box(m.steel, frame, at(u, y + .3, 1.08), size(bay - .2, .5, .015));
      }
    }
    // A drain pipe on the wall's edge, and a vent stack near the top.
    d.add(d.cyl, m.steel, frame, at(span / 2 - .35, h / 2, .14), [.14, h, .14]);
    if (random() > .5) d.box(m.unit, frame, at(-span / 2 + 1, h - 1.3, .2), size(.9, .6, .35));
  }
}

/** Parapet and roof clutter: tanks on legs, plant, a mast with its warning lamp, a sign frame. */
export function dressRoof(d: Dressing, m: CityMaterials, frame: T.Matrix4, w: number, h: number, depth: number, random: Rand, opts: { tower?: boolean; sign?: boolean; parapet?: boolean } = {}) {
  if (opts.parapet !== false) for (const [p, s] of [[[0, h + .35, depth / 2 - .1], [w + .1, .7, .2]], [[0, h + .35, -depth / 2 + .1], [w + .1, .7, .2]], [[w / 2 - .1, h + .35, 0], [.2, .7, depth]], [[-w / 2 + .1, h + .35, 0], [.2, .7, depth]]] as [V3, V3][]) d.box(m.trim, frame, p, s);
  if (random() > .45) {
    const x = (random() - .5) * w * .5, z = (random() - .5) * depth * .4;
    d.add(d.cyl, m.rust, frame, [x, h + 2.3, z], [1.6, 1.8, 1.6]);
    d.add(d.cone4, m.trim, frame, [x, h + 3.45, z], [1.55, .5, 1.55]);
    for (const [dx, dz] of [[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]]) d.box(m.steel, frame, [x + dx, h + .7, z + dz], [.08, 1.4, .08]);
  }
  for (let i = 0, n = 1 + Math.floor(random() * 3); i < n; i++) d.box(m.unit, frame, [(random() - .5) * w * .6, h + .45, (random() - .5) * depth * .6], [1 + random(), .9, .8 + random() * .6]);
  if (random() > .55) {
    const x = (random() - .5) * w * .5, mast = 3 + random() * 4;
    d.box(m.steel, frame, [x, h + mast / 2, 0], [.07, mast, .07]);
    d.add(d.cyl, m.aviation, frame, [x, h + mast + .08, 0], [.16, .16, .16]);
  }
  if (opts.sign) {
    const n = m.neon[Math.floor(random() * m.neon.length)], sw = Math.min(w * .8, 4.5);
    for (const dx of [-sw / 3, sw / 3]) d.box(m.steel, frame, [dx, h + 1.1, depth / 2 - .6], [.09, 2.2, .09]);
    d.box(m.frame, frame, [0, h + 2.4, depth / 2 - .6], [sw, 1.2, .12]);
    d.box(n, frame, [0, h + 2.4, depth / 2 - .52], [sw * .9, .18, .02]);
    d.box(n, frame, [0, h + 2.05, depth / 2 - .52], [sw * .6, .1, .02]);
  }
  if (opts.tower) towerCap(d, m, frame, w, h, depth);
}

/** San Fransokyo's tiered caps: two flared eaves and a pointed crown. */
export function towerCap(d: Dressing, m: CityMaterials, frame: T.Matrix4, w: number, h: number, depth: number, material: T.Material = m.trim) {
  d.box(material, frame, [0, h + .12, 0], [w + 1.4, .24, depth + 1.4]);
  d.add(d.cone4, material, frame, [0, h + .7, 0], [w + 1.1, .9, depth + 1.1]);
  d.box(material, frame, [0, h + 1.6, 0], [w * .55, 1.4, depth * .55]);
  d.box(material, frame, [0, h + 2.4, 0], [w * .55 + 1, .18, depth * .55 + 1]);
  d.add(d.cone4, material, frame, [0, h + 3, 0], [w * .55 + .8, 1.1, depth * .55 + .8]);
}

/**
 * Far skyline: towers in two or three depth bands beyond a street's end, lit window strips facing
 * the street, tiered caps on some, and a few with an upper section sheared off and hanging.
 */
export function skyline(d: Dressing, m: CityMaterials, random: Rand, o: { x: [number, number]; z: [number, number]; count: number; h: [number, number]; facing?: number; tones: T.Material[] }) {
  const lerp = (r: [number, number]) => r[0] + random() * (r[1] - r[0]);
  for (let i = 0; i < o.count; i++) {
    const x = lerp(o.x), z = lerp(o.z), w = 6 + random() * 9, dd = 6 + random() * 8, h = lerp(o.h);
    const tilt = random() > .8 ? (random() - .5) * .12 : 0;
    const frame = buildingFrame(x, z, (random() - .5) * .3, tilt, -1);
    const tone = o.tones[Math.floor(random() * o.tones.length)];
    d.box(tone, frame, [0, h / 2, 0], [w, h, dd]);
    // Window strips on the street-facing face, a few of them lit.
    const face = o.facing ?? 1, fz = face * (dd / 2 + .05);
    for (let y = 4; y < h - 2; y += STOREY) {
      const r = random();
      d.add(d.pane, r < .12 ? m.warm : r < .16 ? m.cool : m.glass, frame, [0, y, fz], [w - 1, 1.2, 1], [0, face > 0 ? 0 : Math.PI, 0]);
    }
    if (random() < .35) towerCap(d, m, frame, w, h, dd);
    else if (random() < .4) {
      // Sheared off by the rupture: the top storeys hang offset, turned, with a gap below them.
      const top = 4 + random() * 6;
      d.box(tone, frame, [(random() - .5) * 3, h + 1.5 + top / 2, (random() - .5) * 2], [w * .9, top, dd * .9], [(random() - .5) * .25, (random() - .5) * .5, (random() - .5) * .3]);
    } else if (random() < .6) {
      d.box(m.steel, frame, [w * .2, h + 3, 0], [.12, 6, .12]);
      d.add(d.cyl, m.aviation, frame, [w * .2, h + 6.1, 0], [.3, .3, .3]);
    }
  }
}

/** Patched asphalt, manholes, cracks and standing water across a stretch of road (y = surface). */
export function roadBreakup(d: Dressing, m: CityMaterials, random: Rand, o: { x: [number, number]; z: [number, number]; y: number; count: number; cracks?: boolean; patch?: T.Material }) {
  const lerp = (r: [number, number]) => r[0] + random() * (r[1] - r[0]);
  for (let i = 0; i < o.count; i++) {
    const x = lerp(o.x), z = lerp(o.z), kind = random();
    if (kind < .35) d.box(o.patch ?? m.patch, null, [x, o.y + .004, z], [1 + random() * 1.8, .008, 1 + random() * 2.2], [0, (random() - .5) * .3, 0]);
    else if (kind < .5) d.add(d.disc, m.puddle, null, [x, o.y + .007, z], [.8 + random() * 1.4, .006, .5 + random() * 1], [0, random() * 3, 0]);
    else if (kind < .65) { d.add(d.disc, m.steel, null, [x, o.y + .01, z], [.8, .02, .8]); d.add(d.disc, m.crack, null, [x, o.y + .012, z], [.6, .02, .6]); }
    else if (o.cracks !== false) { let a = random() * Math.PI, cx = x, cz = z; for (let j = 0; j < 4; j++) { const len = .3 + random() * .7; d.box(m.crack, null, [cx, o.y + .009, cz], [.016, .006, len], [0, a, 0]); cx += Math.sin(a) * len * .5; cz += Math.cos(a) * len * .5; a += (random() - .5) * 1.2; } }
  }
}

/**
 * Wooden-style utility poles along both kerbs with crossarms and a transformer now and then, and
 * the wires between them (sagging, merged into one mesh). `points` run down one side of the street.
 */
export function utilityLines(d: Dressing, m: CityMaterials, random: Rand, points: [number, number][], o: { height?: number; across?: number } = {}) {
  const h = o.height ?? 8.5, tips: T.Vector3[][] = [];
  for (const [x, z] of points) {
    const lean = (random() - .5) * .06;
    d.add(d.cyl, m.trim, null, [x, h / 2, z], [.24, h, .24], [lean, 0, lean]);
    d.box(m.steel, null, [x, h - .5, z], [.12, .12, 2.2]);
    d.box(m.steel, null, [x, h - 1.2, z], [.1, .1, 1.6]);
    for (const dz of [-.9, 0, .9]) d.add(d.cyl, m.unit, null, [x, h - .35, z + dz], [.08, .2, .08]);
    if (random() > .6) { d.add(d.cyl, m.unit, null, [x + Math.sign(x) * .45, h - 2.4, z], [.55, .9, .55]); d.box(m.steel, null, [x + Math.sign(x) * .2, h - 2.4, z], [.4, .08, .08]); }
    tips.push([-.9, 0, .9].map(dz => new T.Vector3(x, h - .35, z + dz)));
  }
  const tubes: T.BufferGeometry[] = [];
  const sag = (a: T.Vector3, b: T.Vector3, drop: number) => {
    const mid = a.clone().lerp(b, .5); mid.y -= drop;
    tubes.push(new T.TubeGeometry(new T.QuadraticBezierCurve3(a, mid, b), 16, .018, 4, false));
  };
  // Wires run pole to pole along the street; every other pole drops one across to the far side.
  for (let i = 1; i < tips.length; i++) for (let j = 0; j < 3; j++) sag(tips[i - 1][j], tips[i][j], .6 + random() * .5);
  if (o.across) tips.forEach((t, i) => { if (i % 2 === 0) sag(t[1], new T.Vector3(o.across!, h - 1.6 - random(), t[1].z + (random() - .5) * 2), 1.2 + random()); });
  if (tubes.length) {
    const geometry = mergeGeometries(tubes, false); tubes.forEach(g => g.dispose());
    if (geometry) d.k.mesh(geometry, m.cable, { p: [0, 0, 0] }).name = 'city-dressing';
  }
}

/**
 * Windows for the side and back faces of boxes merged into a static mesh (the shared backdrop's
 * towers only carry them on their front). Each box is recovered from its 24 vertices, so this works
 * on any merged BoxGeometry set without touching the shared source. Boxes under `minHeight` are skipped.
 */
export function skinMergedBoxes(d: Dressing, m: CityMaterials, mesh: T.Mesh, relativeTo: T.Object3D, random: Rand, o: { storey: number; from: number; minHeight: number }) {
  const pos = mesh.geometry.getAttribute('position');
  if (!pos || pos.count % 24) return;
  relativeTo.updateMatrixWorld(true);
  const toLocal = relativeTo.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const v = new T.Vector3(), c = new T.Vector3(), faceC = (from: number) => { const f = new T.Vector3(); for (let i = 0; i < 4; i++) f.add(v.fromBufferAttribute(pos, from + i)); return f.multiplyScalar(.25); };
  for (let b = 0; b < pos.count; b += 24) {
    c.set(0, 0, 0); for (let i = 0; i < 24; i++) c.add(v.fromBufferAttribute(pos, b + i)); c.multiplyScalar(1 / 24);
    const ax = faceC(b).sub(c), ay = faceC(b + 8).sub(c), az = faceC(b + 16).sub(c);
    const w = ax.length() * 2, h = ay.length() * 2, depth = az.length() * 2;
    if (h < o.minHeight || w < 1 || depth < 1) continue;
    const base = c.clone().sub(ay);
    const frame = new T.Matrix4().makeBasis(ax.normalize(), ay.normalize(), az.normalize()).setPosition(base).premultiply(toLocal);
    dressFacade(d, m, frame, w, h, depth, ['+x', '-x', '-z'], random, { from: o.from, storey: o.storey, style: 'apartment', lit: .07 });
  }
}
