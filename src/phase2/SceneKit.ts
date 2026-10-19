import * as THREE from 'three';

/**
 * Position, scale and rotation for a generated scene object.
 */
export type ScenePlacement = {
  p: [number, number, number];
  s?: [number, number, number];
  r?: [number, number, number];
};
/**
 * Data contract used by the retained fracture sequence.
 */
export type ChapterWorld = {
  root: THREE.Group;
  update: (time: number, deltaSeconds: number) => void;
  dispose: () => void;
};

/** One resource owner per chapter; no module-level GPU resources survive an exit. */
export class SceneKit {
  root = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  boxGeo = this.ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  sphereGeo = this.ownGeometry(new THREE.IcosahedronGeometry(1, 1));
  concrete = this.standard('#485f72', 0.91, 0.06);
  edge = this.standard('#1d3042', 0.78, 0.25);
  metal = this.standard('#637d8c', 0.45, 0.64);
  dark = this.standard('#101d2a', 0.9, 0.22);
  ivory = this.standard('#b5cbd1', 0.6, 0.25);
  cyan = this.basic('#b2eaff', 1.5);
  dim = this.basic('#366783', 0.7);
  private dummy = new THREE.Object3D();
  constructor(name: string) {
    this.root.name = name;
  }
  ownGeometry<G extends THREE.BufferGeometry>(geometry: G): G {
    this.geometries.add(geometry);
    return geometry;
  }
  ownMaterial<M extends THREE.Material>(material: M): M {
    this.materials.add(material);
    return material;
  }
  standard(color: string, roughness = 0.8, metalness = 0.2) {
    return this.ownMaterial(
      new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    );
  }
  basic(color: string, intensity = 1) {
    return this.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
      }),
    );
  }
  box(
    point: ScenePlacement,
    material: THREE.Material = this.concrete,
    parent: THREE.Object3D = this.root,
  ) {
    const material2 = new THREE.Mesh(this.boxGeo, material);
    this.pose(material2, point);
    material2.receiveShadow = true;
    parent.add(material2);
    return material2;
  }
  mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    point: ScenePlacement,
    parent: THREE.Object3D = this.root,
  ) {
    const material2 = new THREE.Mesh(this.ownGeometry(geometry), material);
    this.pose(material2, point);
    parent.add(material2);
    return material2;
  }
  pose(object: THREE.Object3D, placement: ScenePlacement) {
    object.position.set(...placement.p);
    if (placement.s) object.scale.set(...placement.s);
    if (placement.r) object.rotation.set(...placement.r);
  }
  instances(
    poses: ScenePlacement[],
    material: THREE.Material = this.concrete,
    geometry: THREE.BufferGeometry = this.boxGeo,
    parent: THREE.Object3D = this.root,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, material, poses.length);
    for (let index = 0; index < poses.length; index++) {
      this.dummy.position.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.pose(this.dummy, poses[index]);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }
  line(
    points: THREE.Vector3[],
    color = '#83c7e1',
    opacity = 0.5,
    parent: THREE.Object3D = this.root,
  ) {
    const geometry = this.ownGeometry(
      new THREE.BufferGeometry().setFromPoints(points),
    );
    const material = this.ownMaterial(
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    const line = new THREE.Line(geometry, material);
    parent.add(line);
    return line;
  }
  label(
    text: string,
    point: ScenePlacement,
    width = 5,
    color = '#a6d5e5',
    parent: THREE.Object3D = this.root,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const drawingContext = canvas.getContext('2d')!;
    let size = 46;
    drawingContext.font = `500 ${size}px "IBM Plex Mono",monospace`;
    drawingContext.fillStyle = color;
    while (
      drawingContext.measureText(text.split('\n')[0]).width > 1000 &&
      size > 22
    ) {
      size -= 2;
      drawingContext.font = `500 ${size}px "IBM Plex Mono",monospace`;
    }
    text
      .split('\n')
      .forEach((line, index) =>
        drawingContext.fillText(line, 12, 78 + index * 42),
      );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.add(texture);
    const material = this.ownMaterial(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    return this.mesh(
      this.ownGeometry(new THREE.PlaneGeometry(width, width / 8)),
      material,
      point,
      parent,
    );
  }
  haze(point: ScenePlacement, color = '#397895', opacity = 0.13) {
    const material = this.ownMaterial(
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
          'varying vec2 vUv;uniform vec3 color;uniform float opacity;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),3.);gl_FragColor=vec4(color,a*opacity);}',
      }),
    );
    return this.mesh(
      this.ownGeometry(new THREE.PlaneGeometry(1, 1)),
      material,
      point,
    );
  }
  dispose() {
    this.root.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((timeSeconds) => timeSeconds.dispose());
    this.root.clear();
  }
}
/**
 * Return a deterministic random source so rebuilding preserves the authored layout.
 */
export function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/**
 * Apply the existing interpolation curve without changing its timing or bounds.
 */
export function ease(startValue: number, endValue: number, inputValue: number) {
  return THREE.MathUtils.smoothstep(inputValue, startValue, endValue);
}
