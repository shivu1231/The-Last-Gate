import type {
  BufferGeometry,
  Light,
  Material,
  Mesh,
  Object3D,
  Texture,
} from 'three';

// Development-only scene audit (Alt+Shift+A, or window.__lattice.audit()).
// Finds what costs draw calls / overdraw / memory so chapters can be fixed before merge:
// instancing candidates, duplicate materials, transparent overlap, shadow casters,
// oversized textures and dense meshes.

/**
 * Collect scene/rendering diagnostics.
 */
export function auditScene(root: Object3D) {
  let meshes = 0,
    visible = 0,
    transparent = 0,
    castShadow = 0,
    triangles = 0;
  const lights: string[] = [],
    shadowLights: string[] = [];
  const pairs = new Map<string, number>(),
    materials = new Set<Material>(),
    geometries = new Set<BufferGeometry>();
  const materialSignatures = new Map<string, number>(),
    textures = new Map<Texture, string>();
  const heavy: Array<{ name: string; triangles: number }> = [];

  root.traverse((object) => {
    const light = object as Light & {
      castShadow: boolean;
      shadow?: { mapSize: { x: number } };
    };
    if (light.isLight) {
      lights.push(`${light.type}${light.name ? ` ${light.name}` : ''}`);
      if (light.castShadow)
        shadowLights.push(`${light.type} ${light.shadow?.mapSize.x}px`);
    }
    const mesh = object as Mesh & { isInstancedMesh?: boolean; count?: number };
    if (
      !mesh.isMesh &&
      !(object as { isPoints?: boolean }).isPoints &&
      !(object as { isLine?: boolean }).isLine &&
      !(object as { isSprite?: boolean }).isSprite
    )
      return;
    meshes++;
    let shown = true;
    object.traverseAncestors((sceneObject) => {
      if (!sceneObject.visible) shown = false;
    });
    if (!object.visible) shown = false;
    if (shown) visible++;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      if (material.transparent && shown) transparent++;
      const signature = `${material.type}|${(material as { color?: { getHexString(): string } }).color?.getHexString?.() ?? ''}|${material.transparent}|${(material as { roughness?: number }).roughness ?? ''}`;
      materialSignatures.set(
        signature,
        (materialSignatures.get(signature) ?? 0) + 1,
      );
      for (const value of Object.values(material)) {
        const texture = value as Texture | null;
        if (
          texture &&
          typeof texture === 'object' &&
          texture.isTexture &&
          texture.image
        ) {
          const image = texture.image as { width?: number; height?: number };
          textures.set(texture, `${image.width ?? '?'}×${image.height ?? '?'}`);
        }
      }
    }
    if (mesh.castShadow && shown) castShadow++;
    const geometry = mesh.geometry as BufferGeometry | undefined;
    if (geometry) {
      geometries.add(geometry);
      const count =
        (geometry.index
          ? geometry.index.count
          : (geometry.attributes.position?.count ?? 0)) / 3;
      const instances = mesh.isInstancedMesh ? (mesh.count ?? 1) : 1;
      triangles += count * instances;
      if (count > 40000)
        heavy.push({
          name: object.name || object.type,
          triangles: Math.round(count),
        });
      if (!mesh.isInstancedMesh && shown) {
        const key = `${geometry.uuid}|${list.map((material2) => material2?.uuid).join(',')}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  });

  const instancingCandidates = [...pairs.values()]
    .filter((count) => count >= 4)
    .sort((firstValue, secondValue) => secondValue - firstValue);
  const duplicateMaterials = [...materialSignatures.entries()]
    .filter(([, count]) => count >= 3)
    .map(([sig, count]) => ({ sig, n: count }))
    .sort((firstValue, secondValue) => secondValue.n - firstValue.n)
    .slice(0, 10);
  const largeTextures = [...textures.values()].filter((size) => {
    const [width] = size.split('×').map(Number);
    return width > 2048;
  });

  const report = {
    meshes,
    visible,
    transparent,
    castShadow,
    triangles: Math.round(triangles),
    uniqueMaterials: materials.size,
    uniqueGeometries: geometries.size,
    textures: textures.size,
    lights: lights.length,
    shadowLights,
    instancingCandidates: {
      groups: instancingCandidates.length,
      meshesSaved: instancingCandidates.reduce(
        (firstValue, count) => firstValue + count - 1,
        0,
      ),
    },
    duplicateMaterials,
    largeTextures,
    heavy,
    warnings: [] as string[],
  };
  if (shadowLights.length > 1)
    report.warnings.push(
      `${shadowLights.length} shadow-casting lights — keep one primary shadow source`,
    );
  if (lights.length > 8)
    report.warnings.push(
      `${lights.length} lights — prefer emissive / baked bounce`,
    );
  if (transparent > 60)
    report.warnings.push(
      `${transparent} visible transparent draws — check fog/glow overlap`,
    );
  if (report.instancingCandidates.meshesSaved > 20)
    report.warnings.push(
      `~${report.instancingCandidates.meshesSaved} draw calls recoverable with instancing`,
    );
  if (largeTextures.length)
    report.warnings.push(`${largeTextures.length} textures above 2K`);
  return report;
}
