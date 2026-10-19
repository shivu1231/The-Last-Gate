import * as T from 'three';

/** Fixed pools: a missed shot travels to its target, breaks up there, then leaves a fading scar. */
export function createStreetImpacts(parent: T.Object3D, onImpact: (at: T.Vector3, wall: boolean) => void) {
  const root = new T.Group(); root.name = 'street-impact-pool'; parent.add(root);
  const shotGeo = new T.SphereGeometry(.07, 8, 6), chipGeo = new T.TetrahedronGeometry(.13), markGeo = new T.CircleGeometry(.65, 12);
  const hot = new T.MeshBasicMaterial({ color: '#ffc58e', toneMapped: false });
  const stone = new T.MeshStandardMaterial({ color: '#777b7b', roughness: 1 });
  const shots = Array.from({ length: 3 }, () => {
    const mesh = new T.Mesh(shotGeo, hot); mesh.visible = false; root.add(mesh);
    return { mesh, from: new T.Vector3(), to: new T.Vector3(), age: 0, duration: .5, wall: false };
  });
  const fragments = Array.from({ length: 18 }, () => { const mesh = new T.Mesh(chipGeo, stone); mesh.visible = false; root.add(mesh); return { mesh, velocity: new T.Vector3(), age: 9 }; });
  const marks = Array.from({ length: 6 }, () => { const material = new T.MeshBasicMaterial({ color: '#171b20', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); const mesh = new T.Mesh(markGeo, material); mesh.visible = false; root.add(mesh); return { mesh, material, age: 30 }; });
  let shotIndex = 0, fragmentIndex = 0, markIndex = 0;
  const impact = (at: T.Vector3, wall: boolean) => {
    const mark = marks[markIndex++ % marks.length]; mark.age = 0; mark.mesh.visible = true; mark.mesh.position.copy(at); mark.mesh.rotation.set(wall ? 0 : -Math.PI / 2, wall ? (at.x > 0 ? -Math.PI / 2 : Math.PI / 2) : 0, 0);
    if (!wall) mark.mesh.position.y = .025;
    for (let i = 0; i < 3; i++) { const chip = fragments[fragmentIndex++ % fragments.length]; chip.age = 0; chip.mesh.visible = true; chip.mesh.position.copy(at); chip.mesh.scale.setScalar(.5 + i * .25); chip.velocity.set((wall ? -Math.sign(at.x) * 2 : i - 1), 1.8 + i * .5, (i - 1) * 1.6); }
    onImpact(at, wall);
  };
  return {
    impact,
    fire(from: T.Vector3, to: T.Vector3, wall = false) { const shot = shots[shotIndex++ % shots.length]; shot.from.copy(from); shot.to.copy(to); shot.wall = wall; shot.age = 0; shot.duration = T.MathUtils.clamp(from.distanceTo(to) / 24, .2, .8); shot.mesh.position.copy(from); shot.mesh.visible = true; },
    update(dt: number) {
      for (const shot of shots) if (shot.mesh.visible) { shot.age += dt; const p = Math.min(1, shot.age / shot.duration); shot.mesh.position.lerpVectors(shot.from, shot.to, p); if (p === 1) { shot.mesh.visible = false; impact(shot.to, shot.wall); } }
      for (const chip of fragments) if (chip.mesh.visible) { chip.age += dt; chip.velocity.y -= 12 * dt; chip.mesh.position.addScaledVector(chip.velocity, dt); chip.mesh.rotation.x += dt * 4; chip.mesh.rotation.z += dt * 3; if (chip.mesh.position.y < .08) { chip.mesh.position.y = .08; chip.velocity.set(0, 0, 0); } if (chip.age > 4) chip.mesh.visible = false; }
      for (const mark of marks) if (mark.mesh.visible) { mark.age += dt; mark.material.opacity = .65 * Math.max(0, 1 - mark.age / 24); if (mark.age >= 24) mark.mesh.visible = false; }
    },
    dispose() { root.removeFromParent(); shotGeo.dispose(); chipGeo.dispose(); markGeo.dispose(); hot.dispose(); stone.dispose(); marks.forEach(m => m.material.dispose()); },
  };
}
