import * as THREE from 'three';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createInternals } from '../src/engineering/internals';
import { createBaymax } from '../src/phase6/baymax';
import { createHiro } from '../src/characters/HiroModel';
import { createLimiter } from '../src/phase4/limiter';
import {
  createFirstPersonHands,
  createLimiterController,
} from '../src/characters/RegulatorController';
import { createRedChip } from '../src/characters/RedChip.js';
import { createCareChip, createHome } from '../src/phase6/home';
import { SceneKit } from '../src/phase2/SceneKit';
import { createServiceBay } from '../src/phase4/bayScene';
import { createFacility } from '../src/phase5/facility';
import { createStreet, createCartridge } from '../src/phase6/street';
import { createDistrict } from '../src/recovery/district';
import { createPortalDimension } from '../src/environment/PortalDimension.js';
import { createSanFransokyo } from '../src/environment/HarbourCity';
import { createPortalGate } from '../src/environment/RiftGate';
const out = process.env.LAST_GATE_MODELS_OUT || 'artifacts/models';
await fs.mkdir(out, { recursive: true });
const manifest: any[] = [];
/**
 * Clone a runtime model into its existing portable glTF representation.
 */
function portable(root: THREE.Object3D, combat = false) {
  const clone = root.clone(true);
  clone.visible = true;
  const remove: THREE.Object3D[] = [];
  clone.traverse((sceneObject) => {
    if (
      sceneObject instanceof THREE.Points ||
      sceneObject instanceof THREE.Light
    ) {
      remove.push(sceneObject);
      return;
    }
    if (!(sceneObject instanceof THREE.Mesh)) return;
    const convert = (material: THREE.Material) => {
      if (material instanceof THREE.ShaderMaterial) {
        const textValue = material.uniforms;
        return new THREE.MeshStandardMaterial({
          color: textValue.uBase?.value?.isColor
            ? textValue.uBase.value
            : textValue.uColor?.value?.isColor
              ? textValue.uColor.value
              : '#6b8797',
          roughness: 0.8,
          side: material.side,
          transparent: material.transparent,
          opacity: material.opacity,
        });
      }
      const material2 = material.clone() as THREE.MeshStandardMaterial;
      material2.onBeforeCompile = () => {};
      if (material2.color) {
        const peak = Math.max(
          material2.color.r,
          material2.color.g,
          material2.color.b,
          1,
        );
        material2.color.multiplyScalar(1 / peak);
      }
      return material2;
    };
    sceneObject.material = Array.isArray(sceneObject.material)
      ? sceneObject.material.map(convert)
      : convert(sceneObject.material);
    if (
      combat &&
      !Array.isArray(sceneObject.material) &&
      sceneObject.material.userData.combatSurface
    ) {
      const detail =
        sceneObject.name === 'inflatable-body' ||
        sceneObject.parent?.name === 'dormant-head';
      const geometry = detail
          ? new TessellateModifier(0.055, 3).modify(sceneObject.geometry)
          : sceneObject.geometry.clone(),
        position = geometry.attributes.position,
        col = new Float32Array(position.count * 3);
      const red = new THREE.Color('#a91e2b'),
        purple = new THREE.Color('#563580'),
        white = new THREE.Color('#f6f8fa'),
        color = new THREE.Color();
      const torso = sceneObject.name === 'inflatable-body',
        head = sceneObject.parent?.name === 'dormant-head',
        hand = /^(hand-|finger-)/.test(sceneObject.name);
      for (let index = 0; index < position.count; index++) {
        color.copy(hand ? purple : red);
        if (torso) {
          const xPosition = Math.abs(position.getX(index) / 0.84),
            yPosition = Math.abs((position.getY(index) - 1.3) / 0.57),
            edge = Math.max(
              xPosition,
              yPosition,
              (xPosition + yPosition) * 0.71,
            ),
            front = THREE.MathUtils.smoothstep(position.getZ(index), 0.2, 0.45);
          color.lerp(
            purple,
            (1 - THREE.MathUtils.smoothstep(edge, 0.96, 1)) * front,
          );
          color.lerp(
            red.clone().multiplyScalar(0.46),
            (1 - THREE.MathUtils.smoothstep(Math.abs(edge - 1), 0.012, 0.027)) *
              front,
          );
        }
        if (head) {
          const radius = Math.hypot(
            position.getX(index) / 0.86,
            (position.getY(index) - 0.015) / 0.65,
          );
          color.lerp(
            white,
            (1 - THREE.MathUtils.smoothstep(radius, 0.96, 1)) *
              THREE.MathUtils.smoothstep(position.getZ(index), 0.45, 0.58),
          );
        }
        color.toArray(col, index * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      sceneObject.geometry = geometry;
      const material3 = sceneObject.material as THREE.MeshStandardMaterial;
      material3.color.set('white');
      material3.vertexColors = true;
      material3.roughness = 0.66;
      material3.metalness = 0.12;
    }
  });
  remove.forEach((sceneObject) => sceneObject.removeFromParent());
  clone.updateMatrixWorld(true);
  return clone;
}
/**
 * Export and record one model in the existing GLB collection.
 */
async function save(
  name: string,
  root: THREE.Object3D,
  source: string,
  combat = false,
) {
  const model = portable(root, combat);
  model.name = name;
  const binary = await new GLTFExporter().parseAsync(model, {
    binary: true,
    onlyVisible: true,
    maxTextureSize: 2048,
  });
  const bytes = Buffer.from(binary as ArrayBuffer);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw Error('Invalid GLB ' + name);
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const box = new THREE.Box3().setFromObject(model),
    size = box.getSize(new THREE.Vector3());
  if (!json.meshes?.length || !size.toArray().every(Number.isFinite))
    throw Error('Empty model ' + name);
  await fs.writeFile(`${out}/${name}.glb`, bytes);
  manifest.push({
    file: `${name}.glb`,
    source,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    meshes: json.meshes.length,
    textures: json.textures?.length ?? 0,
    sizeMetres: size.toArray(),
  });
  console.log(name, bytes.length, json.meshes.length);
}
const group = await createBaymax();
group.pose.sit = 0;
group.pose.armour = 1;
for (let index2 = 0; index2 < 90; index2++) group.update(index2 / 60, () => 0);
await save('baymax-combat', group.root, 'src/phase6/baymax.ts', true);
group.bay.update({ t: 2, open: 4.6, seated: 1, red: 1, seamGlow: 0.2 });
await save(
  'chip-bay-interior',
  group.bay.root,
  'src/characters/ChestBay.ts',
  true,
);
group.pose.armour = 0;
group.pose.careSeated = true;
group.pose.chipInBay = false;
group.update(2, () => 0);
await save('baymax-healthcare', group.root, 'src/phase6/baymax.ts');
const engineering = createInternals(new THREE.Group());
for (let index3 = 0; index3 < 30; index3++)
  engineering.update(index3 / 30, 0.1, {
    mode: 'xray',
    selected: null,
    rerouted: false,
    plugAngle: 0,
    plugSeated: false,
    actuatorAngle: 0,
    actuatorReset: false,
  });
await save(
  'engineering-internals',
  engineering.root,
  'src/engineering/internals.ts',
);
await save('hiro', createHiro().root, 'src/characters/HiroModel.ts');
await save('power-regulator', createLimiter(), 'src/phase4/limiter.ts');
await save(
  'pr6-remote',
  createLimiterController().root,
  'src/characters/RegulatorController.ts',
);
const hands = createFirstPersonHands();
hands.update(0, 1 / 60, { walk: 0, gait: 0, raise: 1, reach: 0 });
await save(
  'first-person-hands-remote',
  hands.root,
  'src/characters/RegulatorController.ts',
);
await save('combat-chip', createRedChip().chip, 'src/characters/RedChip.js');
await save(
  'healthcare-chip',
  createCareChip(new SceneKit('care-chip')).chip,
  'src/phase6/home.ts',
);
await save('reader-cartridge', createCartridge().root, 'src/phase6/street.ts');
for (const [name, fn, source] of [
  [
    'portal-dimension',
    createPortalDimension,
    'src/environment/PortalDimension.js',
  ],
  ['opening-harbour', createSanFransokyo, 'src/environment/HarbourCity.ts'],
  ['recovery-district', createDistrict, 'src/recovery/district.ts'],
  ['service-bay-06', createServiceBay, 'src/phase4/bayScene.ts'],
  ['relay-facility', createFacility, 'src/phase5/facility.ts'],
  ['portal-street', createStreet, 'src/phase6/street.ts'],
  ['ending-waterfront', createHome, 'src/phase6/home.ts'],
  ['portal-frame', createPortalGate, 'src/environment/RiftGate.ts'],
] as const) {
  const set = fn();
  await save(name, (set as any).root ?? (set as any).group, source);
}
await fs.copyFile(
  'public/models/baymax-shell.glb',
  `${out}/baymax-shell-source.glb`,
);
await fs.writeFile(
  `${out}/manifest.json`,
  JSON.stringify(
    {
      units: 'metres',
      up: '+Y',
      models: manifest,
      sourceGLB: 'baymax-shell-source.glb',
    },
    null,
    2,
  ),
);
await fs.writeFile(
  `${out}/README.txt`,
  `THE LAST GATE — MODEL COLLECTION\n\nCurrent website character, prop and environment geometry exported as binary glTF (.glb).\nUnits: metres. Up: +Y. Embedded procedural textures. Combat finish baked into vertex colours.\n\nEach environment file includes its buildings, furniture and smaller props. The manifest identifies the source factory, dimensions, mesh count, texture count and SHA-256 for each export. The source Baymax GLB is also included unchanged. The retired separate armour asset is not used by the current website and is excluded.\n\nThese are static scene/rig snapshots. Gameplay animation, controller logic, shader effects, portal render targets, particles and camera choreography remain authored in the website source; GLB does not reproduce that runtime. Shader-only surfaces use a neutral portable material. Inspection assembly is supplied separately. Inactive effects and hidden runtime alternates are excluded.\n\nNo extra branding or authorship claims have been added. Existing project and third-party rights continue to apply.\n`,
);
console.log('Exported', manifest.length, 'models to', out);
