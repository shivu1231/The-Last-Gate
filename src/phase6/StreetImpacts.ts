import * as THREE from 'three';

/** Fixed pools: a missed shot travels to its target, breaks up there, then leaves a fading scar. */
export function createStreetImpacts(
  parent: THREE.Object3D,
  onImpact: (at: THREE.Vector3, wall: boolean) => void,
) {
  const root = new THREE.Group();
  root.name = 'street-impact-pool';
  parent.add(root);
  const shotGeo = new THREE.SphereGeometry(0.07, 8, 6),
    chipGeo = new THREE.TetrahedronGeometry(0.13),
    markGeo = new THREE.CircleGeometry(0.65, 12);
  const hot = new THREE.MeshBasicMaterial({
    color: '#ffc58e',
    toneMapped: false,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: '#777b7b',
    roughness: 1,
  });
  const shots = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(shotGeo, hot);
    mesh.visible = false;
    root.add(mesh);
    return {
      mesh,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      age: 0,
      duration: 0.5,
      wall: false,
    };
  });
  const fragments = Array.from({ length: 18 }, () => {
    const mesh = new THREE.Mesh(chipGeo, stone);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), age: 9 };
  });
  const marks = Array.from({ length: 6 }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: '#171b20',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(markGeo, material);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, material, age: 30 };
  });
  let shotIndex = 0,
    fragmentIndex = 0,
    markIndex = 0;
  const impact = (at: THREE.Vector3, wall: boolean) => {
    const mark = marks[markIndex++ % marks.length];
    mark.age = 0;
    mark.mesh.visible = true;
    mark.mesh.position.copy(at);
    mark.mesh.rotation.set(
      wall ? 0 : -Math.PI / 2,
      wall ? (at.x > 0 ? -Math.PI / 2 : Math.PI / 2) : 0,
      0,
    );
    if (!wall) mark.mesh.position.y = 0.025;
    for (let index = 0; index < 3; index++) {
      const chip = fragments[fragmentIndex++ % fragments.length];
      chip.age = 0;
      chip.mesh.visible = true;
      chip.mesh.position.copy(at);
      chip.mesh.scale.setScalar(0.5 + index * 0.25);
      chip.velocity.set(
        wall ? -Math.sign(at.x) * 2 : index - 1,
        1.8 + index * 0.5,
        (index - 1) * 1.6,
      );
    }
    onImpact(at, wall);
  };
  return {
    impact,
    fire(from: THREE.Vector3, to: THREE.Vector3, wall = false) {
      const shot = shots[shotIndex++ % shots.length];
      shot.from.copy(from);
      shot.to.copy(to);
      shot.wall = wall;
      shot.age = 0;
      shot.duration = THREE.MathUtils.clamp(from.distanceTo(to) / 24, 0.2, 0.8);
      shot.mesh.position.copy(from);
      shot.mesh.visible = true;
    },
    update(deltaSeconds: number) {
      for (const shot of shots)
        if (shot.mesh.visible) {
          shot.age += deltaSeconds;
          const progress = Math.min(1, shot.age / shot.duration);
          shot.mesh.position.lerpVectors(shot.from, shot.to, progress);
          if (progress === 1) {
            shot.mesh.visible = false;
            impact(shot.to, shot.wall);
          }
        }
      for (const chip of fragments)
        if (chip.mesh.visible) {
          chip.age += deltaSeconds;
          chip.velocity.y -= 12 * deltaSeconds;
          chip.mesh.position.addScaledVector(chip.velocity, deltaSeconds);
          chip.mesh.rotation.x += deltaSeconds * 4;
          chip.mesh.rotation.z += deltaSeconds * 3;
          if (chip.mesh.position.y < 0.08) {
            chip.mesh.position.y = 0.08;
            chip.velocity.set(0, 0, 0);
          }
          if (chip.age > 4) chip.mesh.visible = false;
        }
      for (const mark of marks)
        if (mark.mesh.visible) {
          mark.age += deltaSeconds;
          mark.material.opacity = 0.65 * Math.max(0, 1 - mark.age / 24);
          if (mark.age >= 24) mark.mesh.visible = false;
        }
    },
    dispose() {
      root.removeFromParent();
      shotGeo.dispose();
      chipGeo.dispose();
      markGeo.dispose();
      hot.dispose();
      stone.dispose();
      marks.forEach((material) => material.material.dispose());
    },
  };
}
