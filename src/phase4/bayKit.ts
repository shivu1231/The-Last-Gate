import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

/**
 * Resource owner and geometry batcher for Bay 6. Static set dressing is added piece by piece and
 * merged into one mesh per material at the end, so hundreds of props cost a few dozen draw calls.
 * Anything that moves is built as a normal mesh with `mesh()`. dispose() frees everything.
 */
export class BayKit {
  readonly root = new T.Group();
  private geometries = new Set<T.BufferGeometry>();
  private materials = new Set<T.Material>();
  private textures = new Set<T.Texture>();
  private buckets = new Map<T.Material, T.BufferGeometry[]>();
  private noShadow = new Set<T.Material>();
  private unit = new T.BoxGeometry(1, 1, 1).toNonIndexed();
  private m4 = new T.Matrix4(); private q = new T.Quaternion(); private e = new T.Euler(); private v = new T.Vector3(); private s = new T.Vector3();

  constructor(name: string) { this.root.name = name; }

  geo<G extends T.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  tex<X extends T.Texture>(t: X): X { this.textures.add(t); return t; }
  own<M extends T.Material>(m: M): M { this.materials.add(m); return m; }
  std(o: T.MeshStandardMaterialParameters) { return this.own(new T.MeshStandardMaterial(o)); }
  glow(color: string, k = 1) { return this.own(new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), toneMapped: false })); }
  /** Materials that should never cast shadows (glass, emissive panels, decals). */
  flat<M extends T.Material>(m: M): M { this.noShadow.add(m); return m; }
  repeat(t: T.Texture, x: number, y: number) { const c = t.clone(); c.wrapS = c.wrapT = T.RepeatWrapping; c.repeat.set(x, y); c.needsUpdate = true; return this.tex(c); }

  private matrix(p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) { this.e.set(r[0], r[1], r[2]); this.q.setFromEuler(this.e); return this.m4.compose(this.v.set(...p), this.q, this.s.set(...s)); }

  /** Adds a geometry to the static batch. The geometry is consumed. */
  put(g: T.BufferGeometry, m: T.Material, p: V3, r?: V3, s?: V3) {
    const piece = g.index ? g.toNonIndexed() : g;
    if (piece !== g) g.dispose();
    for (const name of Object.keys(piece.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') piece.deleteAttribute(name);
    piece.applyMatrix4(this.matrix(p, r, s));
    let list = this.buckets.get(m); if (!list) this.buckets.set(m, list = []); list.push(piece);
  }

  /**
   * A static box. With `tile`, each face's UVs are scaled by its size so tiling textures keep a
   * constant world scale instead of stretching.
   */
  box(m: T.Material, p: V3, s: V3, r?: V3, tile?: number) {
    const g = this.unit.clone();
    if (tile) {
      const uv = g.attributes.uv as T.BufferAttribute, sizes: [number, number][] = [[s[2], s[1]], [s[2], s[1]], [s[0], s[2]], [s[0], s[2]], [s[0], s[1]], [s[0], s[1]]];
      for (let i = 0; i < uv.count; i++) { const [a, b] = sizes[Math.floor(i / 6)]; uv.setXY(i, uv.getX(i) * a / tile, uv.getY(i) * b / tile); }
    }
    this.put(g, m, p, r, s);
  }

  /** A static cylinder along Y, X or Z. */
  cyl(m: T.Material, p: V3, radius: number, length: number, axis: 'x' | 'y' | 'z' = 'y', seg = 14, r2 = radius) {
    const g = new T.CylinderGeometry(radius, r2, length, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    this.put(g, m, p);
  }

  /** A beam between two points (square section). */
  beam(m: T.Material, a: V3, b: V3, w: number, h = w) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b), len = va.distanceTo(vb);
    const g = this.unit.clone(); g.scale(w, len, h);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyQuaternion(q); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.put(g, m, [0, 0, 0]);
  }

  /** A static cable or pipe through points. */
  tube(m: T.Material, points: V3[], radius: number, seg = 48, radial = 8) {
    this.put(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), seg, radius, radial), m, [0, 0, 0]);
  }

  /** A hanging cable between two points, sagging by `sag`. */
  sag(m: T.Material, a: V3, b: V3, sag: number, radius: number) {
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t]); }
    this.tube(m, pts, radius, 24, 6);
  }

  /** A flat decal or sign plane facing +Z (rotate to place). */
  plane(m: T.Material, p: V3, w: number, h: number, r?: V3) { this.put(new T.PlaneGeometry(w, h), m, p, r); }

  /** A live (unbatched) mesh. */
  mesh(g: T.BufferGeometry, m: T.Material, p: V3, parent: T.Object3D = this.root, r?: V3) {
    const o = new T.Mesh(this.geo(g), m); o.position.set(...p); if (r) o.rotation.set(...r);
    o.castShadow = !this.noShadow.has(m); o.receiveShadow = true; parent.add(o); return o;
  }

  /** Merges every batch into one mesh per material. Call once after building. */
  finish(parent: T.Object3D = this.root) {
    for (const [m, list] of this.buckets) {
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const o = new T.Mesh(this.geo(merged), m); o.castShadow = !this.noShadow.has(m); o.receiveShadow = true;
      o.matrixAutoUpdate = false; o.updateMatrix(); parent.add(o);
    }
    this.buckets.clear();
  }

  dispose() {
    this.root.removeFromParent(); this.unit.dispose();
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
    this.root.clear();
  }
}
