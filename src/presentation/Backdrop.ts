import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Material,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPortalDimension } from '../environment/PortalDimension.js';

let skyCanvas: HTMLCanvasElement | null = null;
// Bake the existing sky's t=0 shader once. It has no moving role in these inspection chapters.
/**
 * Create the baked sky presentation for the scene backdrop.
 */
function bakedSky() {
  if (!skyCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const drawingContext = canvas.getContext('2d')!,
      pixels = drawingContext.createImageData(512, 384);
    const fract = (count: number) => count - Math.floor(count);
    const hash = (xPosition: number, yPosition: number) =>
      fract(Math.sin(xPosition * 127.1 + yPosition * 311.7) * 43758.5453);
    const mix = (startValue: number, endValue: number, inputValue: number) =>
      startValue + (endValue - startValue) * inputValue;
    const noise = (xPosition: number, yPosition: number) => {
      const ix = Math.floor(xPosition),
        iy = Math.floor(yPosition);
      let fx = fract(xPosition),
        fy = fract(yPosition);
      fx *= fx * (3 - 2 * fx);
      fy *= fy * (3 - 2 * fy);
      return mix(
        mix(hash(ix, iy), hash(ix + 1, iy), fx),
        mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
        fy,
      );
    };
    const fbm = (xPosition: number, yPosition: number) => {
      let count = 0,
        firstValue = 0.5;
      for (let index = 0; index < 5; index++) {
        count += noise(xPosition, yPosition) * firstValue;
        xPosition = xPosition * 2.05 + 3.1;
        yPosition = yPosition * 2.05 + 7.2;
        firstValue *= 0.5;
      }
      return count;
    };
    for (let yPosition2 = 0; yPosition2 < 384; yPosition2++)
      for (let xPosition2 = 0; xPosition2 < 512; xPosition2++) {
        const progress = xPosition2 / 511,
          sampleValue = 1 - yPosition2 / 383,
          px = (progress - 0.54) * 1.35,
          py = sampleValue - 0.61,
          radius = Math.hypot(px, py);
        const count2 = fbm(Math.atan2(py, px) * 1.3 + radius * 9, radius * 12),
          ring = Math.exp(-(((radius - 0.32) * 12) ** 2));
        let scaleFactor = Math.min(1, Math.max(0, (py + 0.25 + 0.7) / 1.4));
        scaleFactor = scaleFactor * scaleFactor * (3 - 2 * scaleFactor);
        const light = Math.min(
          0.8,
          Math.max(
            0,
            ring * (0.26 + count2 * 0.7) * scaleFactor +
              fbm(progress * 7, sampleValue * 7) * 0.1,
          ),
        );
        const fold = Math.max(0, count2 - 0.3) ** 2 * ring * 1.8,
          glow = Math.exp(-radius * radius * 13) * 0.65;
        const index2 = (yPosition2 * 512 + xPosition2) * 4;
        pixels.data[index2] =
          255 * (mix(0.018, 0.18, light) + 0.29 * fold + 0.06 * glow);
        pixels.data[index2 + 1] =
          255 * (mix(0.035, 0.46, light) + 0.07 * fold + 0.16 * glow);
        pixels.data[index2 + 2] =
          255 * (mix(0.075, 0.62, light) + 0.31 * fold + 0.22 * glow);
        pixels.data[index2 + 3] = 255;
      }
    drawingContext.putImageData(pixels, 0, 0);
    skyCanvas = canvas;
  }
  const texture = new CanvasTexture(skyCanvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Same authored geometry. Bake its lighting and merge static surfaces; retain the foreground rig. */
export function createCityBackdrop() {
  const city = createPortalDimension();
  city.update(0, 0, true, 0, 'approaching');
  city.group.updateMatrixWorld(true);
  const lights: Object3D[] = [],
    originals = new Set<Material>(),
    geometries = new Set<BufferGeometry>();
  const pieces: BufferGeometry[] = [],
    mergedObjects: Object3D[] = [],
    basic = new Map<Material, MeshBasicMaterial>();
  const normal = new Vector3(),
    key = new Vector3(-0.4, 0.8, 0.3).normalize(),
    color = new Color();
  city.group.traverse((object: Object3D) => {
    if ('isLight' in object) lights.push(object);
    object.castShadow = false;
    object.receiveShadow = false;
    if (object instanceof Mesh && !Array.isArray(object.material)) {
      const material = object.material as Material & {
        color?: Color;
        map?: CanvasTexture;
        emissive?: Color;
        emissiveIntensity?: number;
        isMeshStandardMaterial?: boolean;
      };
      originals.add(material);
      geometries.add(object.geometry);
      const shader = material as ShaderMaterial;
      if (shader.isShaderMaterial && shader.uniforms.uTear) {
        const sky = new MeshBasicMaterial({
          map: bakedSky(),
          toneMapped: false,
          depthWrite: false,
          fog: false,
        });
        sky.onBeforeCompile = (program) => {
          program.vertexShader = program.vertexShader.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\ngl_Position.z = gl_Position.w * .9999;',
          );
        };
        sky.customProgramCacheKey = () => 'static-infinite-sky';
        object.material = sky;
        object.renderOrder = -100;
        // The sky must cover the higher receiver shots even when the city sits far behind the room.
        object.scale.multiplyScalar(8);
      } else if (
        !('isInstancedMesh' in object) &&
        material.color &&
        !material.map &&
        !material.transparent &&
        material.blending === NormalBlending &&
        object.geometry.getAttribute('normal')
      ) {
        const transformed = object.geometry
          .clone()
          .applyMatrix4(object.matrixWorld);
        const geometry = transformed.index
          ? transformed.toNonIndexed()
          : transformed;
        if (geometry !== transformed) transformed.dispose();
        const normals = geometry.getAttribute('normal'),
          colors = new Float32Array(normals.count * 3);
        for (let index = 0; index < normals.count; index++) {
          normal.fromBufferAttribute(normals, index);
          const shade = material.isMeshStandardMaterial
            ? 0.52 + 0.48 * Math.max(0, normal.dot(key))
            : 1;
          color.copy(material.color).multiplyScalar(shade);
          if (material.emissive) {
            const intensity = material.emissiveIntensity ?? 0;
            color.r += material.emissive.r * intensity;
            color.g += material.emissive.g * intensity;
            color.b += material.emissive.b * intensity;
          }
          colors[index * 3] = color.r;
          colors[index * 3 + 1] = color.g;
          colors[index * 3 + 2] = color.b;
        }
        for (const attribute of Object.keys(geometry.attributes))
          if (attribute !== 'position') geometry.deleteAttribute(attribute);
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        pieces.push(geometry);
        mergedObjects.push(object);
      } else if (material.isMeshStandardMaterial && material.color) {
        let replacement = basic.get(material);
        if (!replacement) {
          replacement = new MeshBasicMaterial({
            color: material.color.clone().multiplyScalar(0.78),
            map: material.map,
            transparent: material.transparent,
            opacity: material.opacity,
            side: material.side,
            depthWrite: material.depthWrite,
          });
          basic.set(material, replacement);
        }
        object.material = replacement;
      }
      if (material.userData.lattiseWarp) {
        material.onBeforeCompile = () => {};
        material.customProgramCacheKey = () => 'city-backdrop';
        delete material.userData.lattiseWarp;
      }
    }
    if (object !== city.group) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    }
  });
  lights.forEach((light) => light.removeFromParent());
  if (pieces.length) {
    const geometry = mergeGeometries(pieces);
    pieces.forEach((geometry2) => geometry2.dispose());
    if (geometry) {
      mergedObjects.forEach((sceneObject) => sceneObject.removeFromParent());
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({ vertexColors: true }),
      );
      mesh.name = 'baked-city';
      city.group.add(mesh);
    }
  }
  return {
    group: city.group,
    update: (..._args: unknown[]) => {},
    dispose: () => {
      city.dispose();
      originals.forEach((material) => material.dispose());
      geometries.forEach((geometry2) => geometry2.dispose());
    },
  };
}
