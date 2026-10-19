import { CanvasTexture, Color, MeshPhysicalMaterial, RepeatWrapping, Vector3 } from 'three';

/**
 * Baymax's shell materials, matching the Phase 1 look so the recovery Baymax is visibly the
 * same character. Warm ivory inflatable skin and deep crimson metallic combat armour.
 * Kept here as a small shared module so Phase 2 reuses the exact material language without
 * importing the Phase 1 controller (which carries corruption, chase and flight logic).
 */
export function createSkinMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#bbbbbb'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
    const v = 178 + Math.sin(x * .31 + y * .2) * 5; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 4, 4);
  }
  const roughness = new CanvasTexture(canvas); roughness.wrapS = roughness.wrapT = RepeatWrapping; roughness.repeat.set(3, 3);
  return new MeshPhysicalMaterial({ name: 'inflatable', color: '#f6f8fa', roughness: .79, roughnessMap: roughness, metalness: 0, sheen: .3, sheenColor: new Color('#eef4f8'), sheenRoughness: .9, clearcoat: .02, envMapIntensity: .45 });
}

export function createArmorMaterial() {
  return new MeshPhysicalMaterial({ name: 'armor', color: '#8c1531', roughness: .3, metalness: .48, clearcoat: .28, clearcoatRoughness: .36, envMapIntensity: .65, emissive: '#ff1d12', emissiveIntensity: 0 });
}

export type SkinHole = {
  uHoleCenter: { value: Vector3 };
  uHoleNormal: { value: Vector3 };
  uHoleRadius: { value: number };
  uHoleOpen: { value: number };
};

/**
 * The exact skin-cut technique from Phase 1: while the bay is open, fragments of the soft shell
 * inside the bay's cylinder are discarded so the internals show through a real cavity rather than
 * floating in front of the body. Returns the uniforms to drive each frame from the mounted bay.
 */
export function applySkinHole(skin: MeshPhysicalMaterial, cacheKey = 'baymax-skin-hole'): SkinHole {
  const hole: SkinHole = { uHoleCenter: { value: new Vector3() }, uHoleNormal: { value: new Vector3(0, 0, 1) }, uHoleRadius: { value: .196 }, uHoleOpen: { value: 0 } };
  skin.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, hole);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHoleWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHoleWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHoleWorld;uniform vec3 uHoleCenter;uniform vec3 uHoleNormal;uniform float uHoleRadius;uniform float uHoleOpen;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(uHoleOpen>.5){vec3 hd=vHoleWorld-uHoleCenter;float along=dot(hd,uHoleNormal);if(length(hd-along*uHoleNormal)<uHoleRadius&&along>-.35&&along<.1)discard;}');
  };
  skin.customProgramCacheKey = () => cacheKey;
  return hole;
}
