import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Material, Mesh, MeshBasicMaterial, NormalBlending, ShaderMaterial, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPortalDimension } from '../environment/PortalDimension.js';

let skyCanvas: HTMLCanvasElement | null = null;
// Bake the existing sky's t=0 shader once. It has no moving role in these inspection chapters.
function bakedSky() {
  if (!skyCanvas) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
    const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(512, 384);
    const fract = (n: number) => n - Math.floor(n);
    const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const noise = (x: number, y: number) => { const ix = Math.floor(x), iy = Math.floor(y); let fx = fract(x), fy = fract(y); fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy); return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy); };
    const fbm = (x: number, y: number) => { let n = 0, a = .5; for (let i = 0; i < 5; i++) { n += noise(x, y) * a; x = x * 2.05 + 3.1; y = y * 2.05 + 7.2; a *= .5; } return n; };
    for (let y = 0; y < 384; y++) for (let x = 0; x < 512; x++) {
      const u = x / 511, v = 1 - y / 383, px = (u - .54) * 1.35, py = v - .61, r = Math.hypot(px, py);
      const n = fbm(Math.atan2(py, px) * 1.3 + r * 9, r * 12), ring = Math.exp(-(((r - .32) * 12) ** 2));
      let s = Math.min(1, Math.max(0, (py + .25 + .7) / 1.4)); s = s * s * (3 - 2 * s);
      const light = Math.min(.8, Math.max(0, ring * (.26 + n * .7) * s + fbm(u * 7, v * 7) * .1));
      const fold = Math.max(0, n - .3) ** 2 * ring * 1.8, glow = Math.exp(-r * r * 13) * .65;
      const i = (y * 512 + x) * 4;
      pixels.data[i] = 255 * (mix(.018, .18, light) + .29 * fold + .06 * glow);
      pixels.data[i + 1] = 255 * (mix(.035, .46, light) + .07 * fold + .16 * glow);
      pixels.data[i + 2] = 255 * (mix(.075, .62, light) + .31 * fold + .22 * glow); pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); skyCanvas = canvas;
  }
  const texture = new CanvasTexture(skyCanvas); texture.colorSpace = SRGBColorSpace; return texture;
}

/** Same authored geometry. Bake its lighting and merge static surfaces; retain the foreground rig. */
export function createCityBackdrop() {
  const city = createPortalDimension(); city.update(0, 0, true, 0, 'approaching'); city.group.updateMatrixWorld(true);
  const lights: Object3D[] = [], originals = new Set<Material>(), geometries = new Set<BufferGeometry>();
  const pieces: BufferGeometry[] = [], mergedObjects: Object3D[] = [], basic = new Map<Material, MeshBasicMaterial>();
  const normal = new Vector3(), key = new Vector3(-.4, .8, .3).normalize(), color = new Color();
  city.group.traverse((object: Object3D) => {
    if ('isLight' in object) lights.push(object);
    object.castShadow = false; object.receiveShadow = false;
    if (object instanceof Mesh && !Array.isArray(object.material)) {
      const material = object.material as Material & { color?: Color; map?: CanvasTexture; emissive?: Color; emissiveIntensity?: number; isMeshStandardMaterial?: boolean };
      originals.add(material); geometries.add(object.geometry);
      const shader = material as ShaderMaterial;
      if (shader.isShaderMaterial && shader.uniforms.uTear) {
        const sky = new MeshBasicMaterial({ map: bakedSky(), toneMapped: false, depthWrite: false, fog: false });
        sky.onBeforeCompile = program => { program.vertexShader = program.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position.z = gl_Position.w * .9999;'); };
        sky.customProgramCacheKey = () => 'static-infinite-sky';
        object.material = sky; object.renderOrder = -100;
        // The sky must cover the higher receiver shots even when the city sits far behind the room.
        object.scale.multiplyScalar(8);
      } else if (!('isInstancedMesh' in object) && material.color && !material.map && !material.transparent && material.blending === NormalBlending && object.geometry.getAttribute('normal')) {
        const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
        if (geometry !== transformed) transformed.dispose();
        const normals = geometry.getAttribute('normal'), colors = new Float32Array(normals.count * 3);
        for (let i = 0; i < normals.count; i++) {
          normal.fromBufferAttribute(normals, i);
          const shade = material.isMeshStandardMaterial ? .52 + .48 * Math.max(0, normal.dot(key)) : 1;
          color.copy(material.color).multiplyScalar(shade);
          if (material.emissive) { const intensity = material.emissiveIntensity ?? 0; color.r += material.emissive.r * intensity; color.g += material.emissive.g * intensity; color.b += material.emissive.b * intensity; }
          colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
        }
        for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position') geometry.deleteAttribute(attribute);
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); pieces.push(geometry); mergedObjects.push(object);
      } else if (material.isMeshStandardMaterial && material.color) {
        let replacement = basic.get(material);
        if (!replacement) { replacement = new MeshBasicMaterial({ color: material.color.clone().multiplyScalar(.78), map: material.map, transparent: material.transparent, opacity: material.opacity, side: material.side, depthWrite: material.depthWrite }); basic.set(material, replacement); }
        object.material = replacement;
      }
      if (material.userData.lattiseWarp) { material.onBeforeCompile = () => {}; material.customProgramCacheKey = () => 'city-backdrop'; delete material.userData.lattiseWarp; }
    }
    if (object !== city.group) { object.updateMatrix(); object.matrixAutoUpdate = false; }
  });
  lights.forEach(light => light.removeFromParent());
  if (pieces.length) {
    const geometry = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
    if (geometry) { mergedObjects.forEach(o => o.removeFromParent()); const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true })); mesh.name = 'baked-city'; city.group.add(mesh); }
  }
  return { group: city.group, update: (..._args: unknown[]) => {}, dispose: () => { city.dispose(); originals.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); } };
}
