import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Sphere,
  Vector3,
  type Camera,
  type Material,
} from 'three';
import { quality } from './Quality';

// GPU microbot / debris swarm: thousands of instances, ONE draw call, zero per-bot JS per frame.
// Motion lives in the vertex shader (uTime + per-instance seed). Formation changes are a
// single uniform (uMorph) blending each bot from `home` to `target`, so a GSAP tween on
// one number animates the whole swarm. Never build a microbot as a React component.
//
//   const swarm = new InstancedSwarm({ count: 6000, home, target });
//   scene.add(swarm.mesh); gsap.to(swarm.uniforms.uMorph, { value: 1, duration: 2.4 });
//   each frame: swarm.update(elapsed, camera)  // time + distance-based density

export type SwarmOptions = {
  count: number;
  /** xyz per instance (length = count*3). Defaults to a loose cloud. */
  home?: Float32Array;
  /** xyz per instance for the formed shape (LATTICE structure, wall, etc.). */
  target?: Float32Array;
  geometry?: BufferGeometry;
  material?: Material;
  color?: Color | string;
  /** Bot scale in world units. */
  size?: number;
  /** Distance where density starts dropping and where it reaches `minDensity`. */
  lod?: { near: number; far: number; minDensity: number };
  castShadow?: boolean;
};

const botGeometry = new BoxGeometry(1, 0.38, 0.62);

export class InstancedSwarm {
  readonly mesh: InstancedMesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uMorph: { value: 0 },
    uJitter: { value: 1 },
    uScatter: { value: 0 },
  };
  private capacity: number;
  private lod: Required<SwarmOptions>['lod'];
  private center = new Vector3();
  private ownsMaterial: boolean;

  constructor(options: SwarmOptions) {
    const { count, size = 0.05, color = '#20262b' } = options;
    this.capacity = count;
    this.lod = options.lod ?? { near: 8, far: 60, minDensity: 0.25 };
    // Per-swarm instance attributes live on the geometry, so each swarm gets its own (cheap) copy.
    const geometry = (options.geometry ?? botGeometry).clone();
    this.ownsMaterial = !options.material;
    const material =
      options.material ??
      new MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.78 });
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.castShadow = options.castShadow ?? false; // swarms read through silhouette, not shadow
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = true;

    const home = options.home ?? cloud(count, 6);
    const target = options.target ?? home;
    const seeds = new Float32Array(count);
    // Shuffle so that drawing the first N instances (density LOD) keeps an even spread.
    const order = Array.from(
      { length: count },
      (_, index) => index,
    ).sort(() => Math.random() - 0.5);
    const homes = new Float32Array(count * 3),
      targets = new Float32Array(count * 3);
    order.forEach((source, index) => {
      homes.set(home.subarray(source * 3, source * 3 + 3), index * 3);
      targets.set(target.subarray(source * 3, source * 3 + 3), index * 3);
      seeds[index] = Math.random();
    });
    geometry.setAttribute('aHome', new InstancedBufferAttribute(homes, 3));
    geometry.setAttribute(
      'aTarget',
      new InstancedBufferAttribute(targets, 3),
    );
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    const scale = new Matrix4().makeScale(size, size, size);
    for (let index2 = 0; index2 < count; index2++)
      this.mesh.setMatrixAt(index2, scale);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.computeBounds(homes, targets);

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aHome; attribute vec3 aTarget; attribute float aSeed;
          uniform float uTime; uniform float uMorph; uniform float uJitter; uniform float uScatter;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float m = smoothstep(aSeed * .35, .65 + aSeed * .35, uMorph);
          vec3 p = mix(aHome, aTarget, m);
          float s = aSeed * 6.2831;
          p += uJitter * (1. - m * .85) * vec3(sin(uTime * 1.3 + s), sin(uTime * 1.7 + s * 1.3), cos(uTime * 1.1 + s)) * .12;
          p += uScatter * normalize(p - vec3(0.) + .001) * (1.5 + aSeed * 4.);
          float a = uTime * (0.6 + aSeed) + s;
          transformed.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * transformed.xz;`,
        )
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          mvPosition.xyz += p;
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    material.customProgramCacheKey = () => 'lattice-instanced-swarm';
  }

  /** Cheap per-frame: one uniform + one count write. */
  update(elapsed: number, camera?: Camera) {
    this.uniforms.uTime.value = elapsed;
    let density = quality().density;
    if (camera) {
      const distance = camera.position.distanceTo(this.center);
      const blendFactor = Math.min(
        1,
        Math.max(
          0,
          (distance - this.lod.near) / (this.lod.far - this.lod.near),
        ),
      );
      density *= 1 - blendFactor * (1 - this.lod.minDensity);
    }
    this.mesh.count = Math.max(
      1,
      Math.round(this.capacity * Math.min(1, density)),
    );
  }

  dispose() {
    this.mesh.removeFromParent();
    if (this.ownsMaterial) (this.mesh.material as Material).dispose();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }

  private computeBounds(home: Float32Array, target: Float32Array) {
    const points: Vector3[] = [];
    for (const list of [home, target])
      for (let index = 0; index < list.length; index += 3 * 16)
        points.push(new Vector3(list[index], list[index + 1], list[index + 2]));
    const sphere = new Sphere().setFromPoints(points);
    sphere.radius += 6; // jitter + scatter headroom
    this.center.copy(sphere.center);
    this.mesh.boundingSphere = sphere;
    this.mesh.geometry.boundingSphere = sphere.clone();
  }
}

/**
 * Generate the deterministic initial particle positions for an instanced swarm.
 */
function cloud(count: number, radius: number) {
  const out = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const progress = Math.random() * 2 - 1,
      firstValue = Math.random() * Math.PI * 2,
      radius2 = radius * Math.cbrt(Math.random());
    out[index * 3] =
      Math.sqrt(1 - progress * progress) * Math.cos(firstValue) * radius2;
    out[index * 3 + 1] = progress * radius2;
    out[index * 3 + 2] =
      Math.sqrt(1 - progress * progress) * Math.sin(firstValue) * radius2;
  }
  return out;
}
