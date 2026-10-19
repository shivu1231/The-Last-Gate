import * as THREE from 'three';
import { LIMITER_FEED } from '../phase4/limiter';

/** Four measured back supports connect the original unit to the actual chest surface. */
export function createRegulatorMount(
  unit: THREE.Group,
  armour: THREE.Object3D,
) {
  unit.updateWorldMatrix(true, true);
  armour.updateWorldMatrix(true, true);
  const surfaces: THREE.Object3D[] = [];
  armour.traverse((sceneObject) => {
    if (!(sceneObject instanceof THREE.Mesh)) return;
    for (
      let sceneObject2: THREE.Object3D | null = sceneObject;
      sceneObject2;
      sceneObject2 = sceneObject2.parent
    )
      if (sceneObject2 === unit) return;
    if (sceneObject.name === 'inflatable-body') surfaces.push(sceneObject);
  });
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(
      unit.matrixWorld,
    ),
    ray = new THREE.Raycaster();
  const contacts: THREE.Vector3[] = [];
  for (const xPosition of [-0.33, 0.33])
    for (const yPosition of [-0.08, 0.08]) {
      const foot = unit.localToWorld(
        new THREE.Vector3(xPosition, yPosition, -0.16),
      );
      ray.set(
        foot.clone().addScaledVector(normal, 0.6),
        normal.clone().negate(),
      );
      ray.far = 1.8;
      const hit = ray.intersectObjects(surfaces, false)[0];
      contacts.push(
        hit
          ? unit.worldToLocal(hit.point.clone())
          : new THREE.Vector3(xPosition, yPosition, -0.19),
      );
    }
  const lift = Math.max(0.008, ...contacts.map((point) => point.z + 0.168));
  const body = new THREE.Group();
  body.name = 'regulator-mounted-body';
  const parts = unit.children.slice();
  unit.add(body);
  parts.forEach((sceneObject) => body.add(sceneObject));
  const supports = new THREE.Group();
  supports.name = 'regulator-chest-supports';
  unit.add(supports);
  const material = new THREE.MeshStandardMaterial({
    color: '#33383b',
    roughness: 0.68,
    metalness: 0.35,
  });
  const geometry: THREE.BufferGeometry[] = [];
  let index = 0;
  for (const xPosition2 of [-0.33, 0.33])
    for (const yPosition2 of [-0.08, 0.08]) {
      const top = new THREE.Vector3(xPosition2, yPosition2, -0.16 + lift),
        bottom = contacts[index++],
        direction = top.clone().sub(bottom);
      const geometry2 = new THREE.CylinderGeometry(
        0.021,
        0.028,
        direction.length(),
        8,
      );
      geometry.push(geometry2);
      const support = new THREE.Mesh(geometry2, material);
      support.position.copy(top).add(bottom).multiplyScalar(0.5);
      support.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      supports.add(support);
    }
  const api = {
    contacts,
    lift,
    setFitted(blendFactor: number) {
      body.position.z = lift * blendFactor;
      supports.visible = blendFactor > 0.99;
    },
    feedWorld(out = new THREE.Vector3()) {
      return unit.localToWorld(
        out.copy(LIMITER_FEED).add(new THREE.Vector3(0, 0, body.position.z)),
      );
    },
    dispose() {
      geometry.forEach((geometry3) => geometry3.dispose());
      material.dispose();
    },
  };
  api.setFitted(1);
  return api;
}
