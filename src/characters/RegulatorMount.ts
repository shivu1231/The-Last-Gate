import * as T from 'three';
import { LIMITER_FEED } from '../phase4/limiter';

/** Four measured back supports connect the original unit to the actual chest surface. */
export function createRegulatorMount(unit: T.Group, armour: T.Object3D) {
  unit.updateWorldMatrix(true, true); armour.updateWorldMatrix(true, true);
  const surfaces: T.Object3D[] = [];
  armour.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    for (let p: T.Object3D | null = o; p; p = p.parent) if (p === unit) return;
    if (o.name === 'inflatable-body') surfaces.push(o);
  });
  const normal = new T.Vector3(0, 0, 1).transformDirection(unit.matrixWorld), ray = new T.Raycaster();
  const contacts: T.Vector3[] = [];
  for (const x of [-.33, .33]) for (const y of [-.08, .08]) {
    const foot = unit.localToWorld(new T.Vector3(x, y, -.16));
    ray.set(foot.clone().addScaledVector(normal, .6), normal.clone().negate()); ray.far = 1.8;
    const hit = ray.intersectObjects(surfaces, false)[0];
    contacts.push(hit ? unit.worldToLocal(hit.point.clone()) : new T.Vector3(x, y, -.19));
  }
  const lift = Math.max(.008, ...contacts.map(p => p.z + .168));
  const body = new T.Group(); body.name = 'regulator-mounted-body';
  const parts = unit.children.slice(); unit.add(body); parts.forEach(p => body.add(p));
  const supports = new T.Group(); supports.name = 'regulator-chest-supports'; unit.add(supports);
  const material = new T.MeshStandardMaterial({ color: '#33383b', roughness: .68, metalness: .35 });
  const geometry: T.BufferGeometry[] = [];
  let i = 0;
  for (const x of [-.33, .33]) for (const y of [-.08, .08]) {
    const top = new T.Vector3(x, y, -.16 + lift), bottom = contacts[i++], direction = top.clone().sub(bottom);
    const g = new T.CylinderGeometry(.021, .028, direction.length(), 8); geometry.push(g);
    const support = new T.Mesh(g, material); support.position.copy(top).add(bottom).multiplyScalar(.5);
    support.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); supports.add(support);
  }
  const api = {
    contacts, lift,
    setFitted(k: number) { body.position.z = lift * k; supports.visible = k > .99; },
    feedWorld(out = new T.Vector3()) { return unit.localToWorld(out.copy(LIMITER_FEED).add(new T.Vector3(0, 0, body.position.z))); },
    dispose() { geometry.forEach(g => g.dispose()); material.dispose(); },
  };
  api.setFitted(1); return api;
}
