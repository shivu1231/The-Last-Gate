import type { Light, Material, Object3D, Texture, WebGLRenderer } from 'three';
import type { QualityPreset } from './Quality';

// Applies the global renderer rules to whatever a chapter has built, so phase branches
// don't each need to remember them:
//  - shadow map sizes capped per preset (one primary shadow source is the target)
//  - texture anisotropy capped
// Safe to run repeatedly (idempotent) — called on chapter change and quality change.

/**
 * Data contract used by rendering and resource policy.
 */
type ShadowLight = Light & {
  shadow: {
    mapSize: {
      x: number;
      y: number;
      set(xPosition: number, yPosition: number): void;
    };
    map: { dispose(): void } | null;
    needsUpdate: boolean;
  };
};

/**
 * Apply the selected quality tier to scene lights, shadows and material budgets.
 */
export function applyRenderPolicy(
  root: Object3D,
  gl: WebGLRenderer,
  preset: QualityPreset,
) {
  const maxAniso = Math.min(
    preset.anisotropy,
    gl.capabilities.getMaxAnisotropy(),
  );
  const seenTextures = new Set<Texture>();
  root.traverse((object) => {
    const light = object as ShadowLight;
    if ((light as Light).isLight && light.castShadow && light.shadow) {
      const size = Math.min(
        preset.shadowMapSize,
        gl.capabilities.maxTextureSize,
      );
      if (light.shadow.mapSize.x !== size) {
        light.shadow.mapSize.set(size, size);
        light.shadow.map?.dispose();
        light.shadow.map = null; // reallocated at the new size
        light.shadow.needsUpdate = true;
      }
    }
    const materials = (
      object as Object3D & { material?: Material | Material[] }
    ).material;
    if (!materials) return;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      for (const value of Object.values(material)) {
        const texture = value as Texture | null;
        if (
          !texture ||
          typeof texture !== 'object' ||
          !texture.isTexture ||
          seenTextures.has(texture)
        )
          continue;
        seenTextures.add(texture);
        if (
          texture.generateMipmaps !== false &&
          texture.anisotropy !== maxAniso &&
          texture.image
        ) {
          texture.anisotropy = maxAniso;
          texture.needsUpdate = true;
        }
      }
    }
  });
}
