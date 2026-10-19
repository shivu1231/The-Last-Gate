import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Three numeric coordinates stored as a tuple.
 */
export type Vector3Tuple = [number, number, number];

/**
 * Resource owner and geometry batcher for Bay 6. Static set dressing is added piece by piece and
 * merged into one mesh per material at the end, so hundreds of props cost a few dozen draw calls.
 * Anything that moves is built as a normal mesh with `mesh()`. dispose() frees everything.
 */
export class BayKit {
  readonly root = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private noShadow = new Set<THREE.Material>();
  private unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(name: string) {
    this.root.name = name;
  }

  geo<G extends THREE.BufferGeometry>(group: G): G {
    this.geometries.add(group);
    return group;
  }
  tex<X extends THREE.Texture>(timeSeconds: X): X {
    this.textures.add(timeSeconds);
    return timeSeconds;
  }
  own<M extends THREE.Material>(mesh: M): M {
    this.materials.add(mesh);
    return mesh;
  }
  std(material: THREE.MeshStandardMaterialParameters) {
    return this.own(new THREE.MeshStandardMaterial(material));
  }
  glow(color: string, blendFactor = 1) {
    return this.own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(blendFactor),
        toneMapped: false,
      }),
    );
  }
  /** Materials that should never cast shadows (glass, emissive panels, decals). */
  flat<M extends THREE.Material>(mesh: M): M {
    this.noShadow.add(mesh);
    return mesh;
  }
  repeat(timeSeconds: THREE.Texture, xPosition: number, yPosition: number) {
    const texture = timeSeconds.clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(xPosition, yPosition);
    texture.needsUpdate = true;
    return this.tex(texture);
  }

  private matrix(
    point: Vector3Tuple,
    vector: Vector3Tuple = [0, 0, 0],
    scaleVector: Vector3Tuple = [1, 1, 1],
  ) {
    this.e.set(vector[0], vector[1], vector[2]);
    this.q.setFromEuler(this.e);
    return this.m4.compose(
      this.v.set(...point),
      this.q,
      this.s.set(...scaleVector),
    );
  }

  /** Adds a geometry to the static batch. The geometry is consumed. */
  put(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    point: Vector3Tuple,
    vector?: Vector3Tuple,
    scaleVector?: Vector3Tuple,
  ) {
    const piece = geometry.index ? geometry.toNonIndexed() : geometry;
    if (piece !== geometry) geometry.dispose();
    for (const name of Object.keys(piece.attributes))
      if (name !== 'position' && name !== 'normal' && name !== 'uv')
        piece.deleteAttribute(name);
    piece.applyMatrix4(this.matrix(point, vector, scaleVector));
    let list = this.buckets.get(material);
    if (!list) this.buckets.set(material, (list = []));
    list.push(piece);
  }

  /**
   * A static box. With `tile`, each face's UVs are scaled by its size so tiling textures keep a
   * constant world scale instead of stretching.
   */
  box(
    material: THREE.Material,
    point: Vector3Tuple,
    scaleVector: Vector3Tuple,
    vector?: Vector3Tuple,
    tile?: number,
  ) {
    const geometry = this.unit.clone();
    if (tile) {
      const uv = geometry.attributes.uv as THREE.BufferAttribute,
        sizes: [number, number][] = [
          [scaleVector[2], scaleVector[1]],
          [scaleVector[2], scaleVector[1]],
          [scaleVector[0], scaleVector[2]],
          [scaleVector[0], scaleVector[2]],
          [scaleVector[0], scaleVector[1]],
          [scaleVector[0], scaleVector[1]],
        ];
      for (let index = 0; index < uv.count; index++) {
        const [firstValue, secondValue] = sizes[Math.floor(index / 6)];
        uv.setXY(
          index,
          (uv.getX(index) * firstValue) / tile,
          (uv.getY(index) * secondValue) / tile,
        );
      }
    }
    this.put(geometry, material, point, vector, scaleVector);
  }

  /** A static cylinder along Y, X or Z. */
  cyl(
    material: THREE.Material,
    point: Vector3Tuple,
    radius: number,
    length: number,
    axis: 'x' | 'y' | 'z' = 'y',
    seg = 14,
    scalarValue = radius,
  ) {
    const geometry = new THREE.CylinderGeometry(
      radius,
      scalarValue,
      length,
      seg,
    );
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    else if (axis === 'z') geometry.rotateX(Math.PI / 2);
    this.put(geometry, material, point);
  }

  /** A beam between two points (square section). */
  beam(
    material: THREE.Material,
    startPoint: Vector3Tuple,
    endPoint: Vector3Tuple,
    width: number,
    height = width,
  ) {
    const va = new THREE.Vector3(...startPoint),
      vb = new THREE.Vector3(...endPoint),
      len = va.distanceTo(vb);
    const geometry = this.unit.clone();
    geometry.scale(width, len, height);
    const vector = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      vb.clone().sub(va).normalize(),
    );
    geometry.applyQuaternion(vector);
    geometry.translate(
      (startPoint[0] + endPoint[0]) / 2,
      (startPoint[1] + endPoint[1]) / 2,
      (startPoint[2] + endPoint[2]) / 2,
    );
    this.put(geometry, material, [0, 0, 0]);
  }

  /** A static cable or pipe through points. */
  tube(
    material: THREE.Material,
    points: Vector3Tuple[],
    radius: number,
    seg = 48,
    radial = 8,
  ) {
    this.put(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.map((point) => new THREE.Vector3(...point)),
        ),
        seg,
        radius,
        radial,
      ),
      material,
      [0, 0, 0],
    );
  }

  /** A hanging cable between two points, sagging by `sag`. */
  sag(
    material: THREE.Material,
    startPoint: Vector3Tuple,
    endPoint: Vector3Tuple,
    sag: number,
    radius: number,
  ) {
    const points: Vector3Tuple[] = [];
    for (let index = 0; index <= 8; index++) {
      const timeSeconds = index / 8;
      points.push([
        startPoint[0] + (endPoint[0] - startPoint[0]) * timeSeconds,
        startPoint[1] +
          (endPoint[1] - startPoint[1]) * timeSeconds -
          Math.sin(Math.PI * timeSeconds) * sag,
        startPoint[2] + (endPoint[2] - startPoint[2]) * timeSeconds,
      ]);
    }
    this.tube(material, points, radius, 24, 6);
  }

  /** A flat decal or sign plane facing +Z (rotate to place). */
  plane(
    material: THREE.Material,
    point: Vector3Tuple,
    width: number,
    height: number,
    vector?: Vector3Tuple,
  ) {
    this.put(new THREE.PlaneGeometry(width, height), material, point, vector);
  }

  /** A live (unbatched) mesh. */
  mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    point: Vector3Tuple,
    parent: THREE.Object3D = this.root,
    vector?: Vector3Tuple,
  ) {
    const material2 = new THREE.Mesh(this.geo(geometry), material);
    material2.position.set(...point);
    if (vector) material2.rotation.set(...vector);
    material2.castShadow = !this.noShadow.has(material);
    material2.receiveShadow = true;
    parent.add(material2);
    return material2;
  }

  /** Merges every batch into one mesh per material. Call once after building. */
  finish(parent: THREE.Object3D = this.root) {
    for (const [material, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      list.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const material2 = new THREE.Mesh(this.geo(merged), material);
      material2.castShadow = !this.noShadow.has(material);
      material2.receiveShadow = true;
      material2.matrixAutoUpdate = false;
      material2.updateMatrix();
      parent.add(material2);
    }
    this.buckets.clear();
  }

  dispose() {
    this.root.removeFromParent();
    this.unit.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((timeSeconds) => timeSeconds.dispose());
    this.root.clear();
  }
}
