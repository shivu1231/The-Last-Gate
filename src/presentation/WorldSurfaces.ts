import * as THREE from 'three';
import { seeded, type SceneKit } from '../phase2/SceneKit';

/**
 * Shared world surfaces (the home waterfront and the opening's San Fransokyo): painted siding,
 * stucco, cut stone, pavement slabs, roof tile, bark, leaves and bench timber, drawn once on small
 * canvases.
 *
 * Both sets are built from unit boxes scaled per instance or merged, so ordinary UVs would stretch
 * one texture over a whole building. `worldMapped` patches a standard material to sample its map in world space
 * instead (planar on whichever axis the surface faces), so a clapboard is the same height on a
 * kerb, a cottage and a warehouse, and instance colours still tint it. Textures are near-white so
 * the existing colours stay the colours; the maps only add the detail.
 */

type Draw = (context: CanvasRenderingContext2D, size: number, random: () => number) => void;

function canvasTexture(kit: SceneKit, size: number, seed: number, draw: Draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  draw(context, size, seeded(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  const dispose = kit.dispose.bind(kit);
  kit.dispose = () => {
    dispose();
    texture.dispose();
  };
  return texture;
}

/** Fine grain over the whole tile: the difference between a painted wall and a flat colour. */
function speckle(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  count: number,
  strength: number,
) {
  for (let index = 0; index < count; index++) {
    const shade = random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${shade},${shade},${shade},${random() * strength})`;
    context.fillRect(random() * size, random() * size, 1 + random() * 1.5, 1 + random() * 1.5);
  }
}

/** Soft blotches drawn wrapped, so the tile stays seamless. */
function blotches(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  count: number,
  color: string,
  alpha: number,
) {
  for (let index = 0; index < count; index++) {
    const x = random() * size,
      y = random() * size,
      radius = size * (0.04 + random() * 0.12),
      a = alpha * (0.4 + random() * 0.6);
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        const gradient = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        gradient.addColorStop(0, `rgba(${color},${a})`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = gradient;
        context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
  }
}

export function worldSurfaces(kit: SceneKit) {
  return {
    /** Painted clapboard, five boards to the tile (tile = 1 m). */
    siding: canvasTexture(kit, 256, 311, (context, size, random) => {
      const boards = 5,
        board = size / boards;
      for (let index = 0; index < boards; index++) {
        const y = index * board,
          gradient = context.createLinearGradient(0, y, 0, y + board);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.85, '#e9e7e2');
        gradient.addColorStop(1, '#b9b6b0');
        context.fillStyle = gradient;
        context.fillRect(0, y, size, board);
      }
      speckle(context, size, random, 2600, 0.07);
      blotches(context, size, random, 8, '120,112,100', 0.05);
    }),
    /** Stucco: a warm render with trowel mottling (tile = 3 m). */
    stucco: canvasTexture(kit, 256, 977, (context, size, random) => {
      context.fillStyle = '#f2f0eb';
      context.fillRect(0, 0, size, size);
      blotches(context, size, random, 22, '150,140,126', 0.07);
      blotches(context, size, random, 10, '255,255,255', 0.1);
      speckle(context, size, random, 6000, 0.08);
    }),
    /** Cut granite in staggered courses with mortar joints (tile = 2 m, four courses). */
    stone: canvasTexture(kit, 256, 5281, (context, size, random) => {
      context.fillStyle = '#9d988f';
      context.fillRect(0, 0, size, size);
      const courses = 4,
        course = size / courses;
      for (let row = 0; row < courses; row++) {
        const offset = row % 2 ? size / 4 : 0;
        for (let col = -1; col < 2; col++) {
          const shade = 222 + Math.floor(random() * 30);
          context.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
          context.fillRect(col * (size / 2) + offset + 2, row * course + 2, size / 2 - 4, course - 4);
        }
      }
      speckle(context, size, random, 5200, 0.1);
      blotches(context, size, random, 10, '70,66,60', 0.06);
    }),
    /** Sidewalk concrete: 1.5 m slabs with sawn joints and wear (tile = 3 m, 2 × 2 slabs). */
    slabs: canvasTexture(kit, 256, 6143, (context, size, random) => {
      context.fillStyle = '#f0eeea';
      context.fillRect(0, 0, size, size);
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 2; col++) {
          const shade = 236 + Math.floor(random() * 18);
          context.fillStyle = `rgb(${shade},${shade - 2},${shade - 5})`;
          context.fillRect(col * 128 + 1.5, row * 128 + 1.5, 125, 125);
        }
      context.fillStyle = 'rgba(80,76,70,.55)';
      context.fillRect(0, 0, size, 1.5);
      context.fillRect(0, 128, size, 1.5);
      context.fillRect(0, 0, 1.5, size);
      context.fillRect(128, 0, 1.5, size);
      speckle(context, size, random, 5000, 0.09);
      blotches(context, size, random, 12, '90,86,78', 0.06);
    }),
    /** Roof tile: overlapping courses, each with a shadowed lower lip (tile = 1 m). */
    tile: canvasTexture(kit, 128, 7717, (context, size, random) => {
      const courses = 4,
        course = size / courses;
      for (let row = 0; row < courses; row++) {
        const gradient = context.createLinearGradient(0, row * course, 0, (row + 1) * course);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.75, '#dcdcdc');
        gradient.addColorStop(1, '#8c8c8c');
        context.fillStyle = gradient;
        context.fillRect(0, row * course, size, course);
        const offset = row % 2 ? course / 2 : 0;
        context.fillStyle = 'rgba(40,40,40,.35)';
        for (let x = offset; x < size + course; x += course) context.fillRect(x, row * course, 1, course);
      }
      speckle(context, size, random, 900, 0.08);
    }),
    /** Bark: long vertical fissures (tile = 1 m). */
    bark: canvasTexture(kit, 128, 8821, (context, size, random) => {
      context.fillStyle = '#e8e2da';
      context.fillRect(0, 0, size, size);
      for (let index = 0; index < 46; index++) {
        const x = random() * size,
          width = 1 + random() * 3;
        context.fillStyle = `rgba(40,30,22,${0.15 + random() * 0.35})`;
        context.fillRect(x, 0, width, size);
        context.fillRect(x - size, 0, width, size);
      }
      speckle(context, size, random, 1200, 0.12);
    }),
    /** Leaves: dappled light and shade through a canopy (tile = 2 m). */
    leaves: canvasTexture(kit, 128, 9419, (context, size, random) => {
      context.fillStyle = '#eef0ea';
      context.fillRect(0, 0, size, size);
      blotches(context, size, random, 30, '40,52,34', 0.22);
      blotches(context, size, random, 16, '255,255,240', 0.18);
      speckle(context, size, random, 1600, 0.16);
    }),
    /** Bench timber: slat grain along the length (tile = 1 m). */
    wood: canvasTexture(kit, 128, 1229, (context, size, random) => {
      context.fillStyle = '#f2ece4';
      context.fillRect(0, 0, size, size);
      for (let index = 0; index < 40; index++) {
        const y = random() * size;
        context.fillStyle = `rgba(90,60,38,${0.08 + random() * 0.18})`;
        context.fillRect(0, y, size, 0.6 + random() * 1.6);
      }
      speckle(context, size, random, 800, 0.08);
    }),
  };
}

export type WorldSurfaces = ReturnType<typeof worldSurfaces>;

/**
 * Give a standard material `map`, sampled in world space at `metres` per tile. Shares one program
 * across every material patched this way; the tile size is a uniform.
 */
export function worldMapped<M extends THREE.MeshStandardMaterial>(
  material: M,
  map: THREE.Texture,
  metres: number,
) {
  material.map = map;
  const scale = { value: 1 / metres };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLgTile = scale;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLgWorld;\nvarying vec3 vLgNormal;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 lgWorld = vec4(transformed, 1.0);
vec3 lgNormal = objectNormal;
#ifdef USE_INSTANCING
lgWorld = instanceMatrix * lgWorld;
lgNormal = mat3(instanceMatrix) * lgNormal;
#endif
vLgWorld = (modelMatrix * lgWorld).xyz;
vLgNormal = mat3(modelMatrix) * lgNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLgWorld;\nvarying vec3 vLgNormal;\nuniform float uLgTile;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
vec3 lgAxis = abs(vLgNormal);
vec2 lgUv = lgAxis.y > max(lgAxis.x, lgAxis.z) ? vLgWorld.xz
  : (lgAxis.x > lgAxis.z ? vec2(vLgWorld.z, vLgWorld.y) : vLgWorld.xy);
diffuseColor *= texture2D(map, lgUv * uLgTile);
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'lg-world-mapped';
  material.needsUpdate = true;
  return material;
}
