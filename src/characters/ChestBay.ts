import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import { createChestAccess } from './ChestAccess.js';
import { CHIP_SEAT_Z, createRedChip } from './RedChip.js';
import {
  applySkinHole,
  createArmorMaterial,
  createSkinMaterial,
} from './baymaxMaterials';

/**
 * Phase 1's chest bay, mounted on any Baymax shell clone: same spot, same components. It faces ahead
 * the way the model's own access port did (tracker S-07/T-05), not up and out along the curve of
 * his chest: Phase 1's shots look straight down it, but standing at home, seen from the front, that
 * read as tipped. Facing ahead, it's seated out to where the skin reaches under its rim.
 */
const BAY_POS = new Vector3(0.424, 2.05, 0.642);
const BAY_QUAT = new Quaternion().setFromUnitVectors(
  new Vector3(0, 0, 1),
  new Vector3(0.15, 0.08, 1).normalize(),
);
/** The bay's outer rim (ChestAccess OUTER) and how far its own skirt reaches back behind the face. */
const RIM = 0.235,
  SKIRT = 0.06;

/**
 * Data contract used by character geometry and posing.
 */
export type ChestBayState = {
  t: number;
  open: number;
  seated: number;
  red: number;
  seamGlow: number;
};

/**
 * Re-skins a cloned Baymax GLB with the Phase 1 skin/armour, mounts the exact Phase 1 chest
 * access bay on it, and seats the combat chip in the dock. Nothing here duplicates the bay or
 * chip geometry — both come from the shared ChestAccess / RedChip modules. The Phase 1
 * BaymaxController is never touched.
 */
export function mountChestBay(shell: Group) {
  const skin = createSkinMaterial();
  const armor = createArmorMaterial();
  shell.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material)) {
      const name = (object.material as { name?: string }).name;
      if (name === 'inflatable') object.material = skin;
      else if (name === 'armor') object.material = armor;
      // The baked access port is replaced by the articulated bay below.
      if (object.name === 'access-panel' || object.name === 'access-ring')
        object.visible = false;
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  const hole = applySkinHole(skin, 'baymax-skin-hole-recovery');

  const chest = createChestAccess(skin.clone());
  chest.root.position.copy(BAY_POS);
  chest.root.quaternion.copy(BAY_QUAT);
  shell.add(chest.root);
  seatOnSkin(shell, chest.root, skin);

  // The combat chip, seated in the dock exactly where Hiro left it in Phase 1.
  const { chip, glow, body } = createRedChip();
  chip.position.set(0, 0, CHIP_SEAT_Z);
  chest.dock.add(chip);
  const glowBase = new Color('#ff3a2c');

  const center = new Vector3(),
    normal = new Vector3(),
    rotationQuaternion = new Quaternion(),
    worldScale = new Vector3();

  return {
    root: chest.root,
    combatChip: chip,
    combatGlow: glow,
    /** Socket centre in world space, for camera framing. */
    dockWorld: () => chest.dockWorld(),
    /** True while the bay is open; the armour only cuts its hole then. */
    get holeOpen() {
      return chest.holeOpen as boolean;
    },
    chestWorld: (out: Vector3) => chest.root.getWorldPosition(out),
    chestNormal: (out: Vector3) =>
      out
        .set(0, 0, 1)
        .applyQuaternion(chest.root.getWorldQuaternion(rotationQuaternion))
        .normalize(),
    update({ t: timeSeconds, open, seated, red, seamGlow }: ChestBayState) {
      chest.update({
        t: timeSeconds,
        open,
        seated,
        align: 0,
        seal: 0,
        red,
        seamGlow,
      });
      // Drive the shell skin-cut from the live chest frame, scale-corrected.
      chest.root.getWorldPosition(center);
      normal
        .set(0, 0, 1)
        .applyQuaternion(chest.root.getWorldQuaternion(rotationQuaternion))
        .normalize();
      shell.getWorldScale(worldScale);
      hole.uHoleCenter.value.copy(center);
      hole.uHoleNormal.value.copy(normal);
      hole.uHoleRadius.value = chest.CAVITY * worldScale.x;
      hole.uHoleOpen.value = chest.holeOpen ? 1 : 0;
      // The combat chip keeps its own red glow; it brightens as the bay opens onto it.
      const lit = 0.25 + Math.min(1, open) * 0.75;
      glow.color.copy(glowBase).multiplyScalar(0.2 + lit * 0.8 + red * 0.3);
      (body as { emissiveIntensity: number }).emissiveIntensity =
        0.25 + lit * 0.35;
      chip.visible = open > 0.4;
    },
    dispose() {
      chest.root.removeFromParent();
      chip.traverse((sceneObject) => {
        if (sceneObject instanceof Mesh) {
          sceneObject.geometry.dispose();
          const material = sceneObject.material as
            | MeshBasicMaterial
            | MeshBasicMaterial[];
          Array.isArray(material)
            ? material.forEach((material2) => material2.dispose())
            : material.dispose();
        }
      });
      skin.dispose();
      armor.dispose();
    },
  };
}
/**
 * Data contract used by character geometry and posing.
 */
export type ChestBay = ReturnType<typeof mountChestBay>;

/**
 * Push the bay out along its own axis until no point of the skin under its rim (the centre and two
 * rings) stands in front of its face, and give it a skin collar back to the lowest of them, so it
 * neither sinks into the curve on one side nor floats off it on the other.
 */
function seatOnSkin(shell: Group, bay: Group, skin: MeshPhysicalMaterialLike) {
  const body = shell.getObjectByName('inflatable-body') as Mesh | undefined;
  if (!body) return;
  shell.updateMatrixWorld(true);
  const transformMatrix = shell.matrixWorld.clone().invert();
  const normalVector = new Vector3(0, 0, 1).applyQuaternion(BAY_QUAT),
    vector = new Vector3(1, 0, 0).applyQuaternion(BAY_QUAT),
    vector2 = new Vector3(0, 1, 0).applyQuaternion(BAY_QUAT);
  const ray = new Raycaster(),
    vector3 = new Vector3(),
    depth = new Vector3()
      .copy(normalVector)
      .transformDirection(shell.matrixWorld)
      .negate();
  let hi = -Infinity,
    lo = Infinity;
  for (const blendFactor of [0, 0.55, 1])
    for (let index = 0; index < (blendFactor ? 20 : 1); index++) {
      const firstValue = (index / 20) * Math.PI * 2;
      vector3
        .copy(BAY_POS)
        .addScaledVector(vector, Math.cos(firstValue) * RIM * blendFactor)
        .addScaledVector(vector2, Math.sin(firstValue) * RIM * blendFactor)
        .addScaledVector(normalVector, 1)
        .applyMatrix4(shell.matrixWorld);
      ray.set(vector3, depth);
      const hit = ray.intersectObject(body, false)[0];
      if (!hit) continue;
      const zPosition = hit.point
        .applyMatrix4(transformMatrix)
        .sub(BAY_POS)
        .dot(normalVector);
      hi = Math.max(hi, zPosition);
      lo = Math.min(lo, zPosition);
    }
  if (hi === -Infinity) return;
  bay.position.copy(BAY_POS).addScaledVector(normalVector, hi + 0.004);
  const reach = hi - lo + 0.03;
  if (reach <= SKIRT) return;
  const collar = new Mesh(
    new CylinderGeometry(
      RIM + 0.012,
      RIM + 0.03,
      reach - SKIRT + 0.02,
      64,
      1,
      true,
    ),
    skin,
  );
  collar.name = 'bay-collar';
  collar.rotation.x = Math.PI / 2;
  collar.position.z = -SKIRT - (reach - SKIRT) / 2 + 0.01;
  collar.castShadow = true;
  collar.receiveShadow = true;
  bay.add(collar);
}
/**
 * Data contract used by character geometry and posing.
 */
type MeshPhysicalMaterialLike = ConstructorParameters<typeof Mesh>[1];
