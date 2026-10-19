import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit } from '../phase2/SceneKit';

/** Collapse the authored solid detail without joining independently moving assemblies. */
export function batchSolids(root: THREE.Group, kit: SceneKit) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<
    THREE.Material,
    { geometry: THREE.BufferGeometry[]; objects: THREE.Mesh[] }
  >();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      Array.isArray(object.material) ||
      object.material.transparent ||
      object instanceof THREE.InstancedMesh
    )
      return;
    const copy = object.geometry
      .clone()
      .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const geometry = copy.index ? copy.toNonIndexed() : copy;
    if (copy !== geometry) copy.dispose();
    const bucket = buckets.get(object.material) ?? {
      geometry: [],
      objects: [],
    };
    bucket.geometry.push(geometry);
    bucket.objects.push(object);
    buckets.set(object.material, bucket);
  });
  for (const [material, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometry);
    bucket.geometry.forEach((geometry2) => geometry2.dispose());
    if (!geometry) continue;
    bucket.objects.forEach((object) => object.removeFromParent());
    const mesh = kit.mesh(
      kit.ownGeometry(geometry),
      material,
      { p: [0, 0, 0] },
      root,
    );
    mesh.receiveShadow = true;
  }
}

/**
 * Build the existing connector/link geometry between the supplied endpoints.
 */
export function link(
  kit: SceneKit,
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  sides = 8,
) {
  const delta = to.clone().sub(from);
  const geometry = kit.ownGeometry(
    new THREE.CylinderGeometry(radius, radius, delta.length(), sides),
  );
  const mesh = kit.mesh(geometry, material, { p: [0, 0, 0] }, parent);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return mesh;
}

/** A real azimuth pedestal, elevation yoke and joined prime-focus reflector. */
export function createReceiver(kit: SceneKit, parent: THREE.Object3D) {
  const root = new THREE.Group();
  root.name = 'telemetry-receiver';
  root.position.set(1.6, -0.2, -14);
  parent.add(root);
  const structural = kit.standard('#80908e', 0.48, 0.68);
  const painted = kit.standard('#d6d6c9', 0.55, 0.32);
  const graphite = kit.standard('#202e32', 0.58, 0.62);
  const bronze = kit.standard('#b89b69', 0.42, 0.7);
  const rimMat = kit.standard('#e0e2d9', 0.34, 0.7);
  const tower = new THREE.Group();
  root.add(tower);
  const cylinder = (
    radius: number,
    height: number,
    points2: [number, number, number],
    material: THREE.Material,
    group: THREE.Object3D = tower,
    rotation?: [number, number, number],
  ) =>
    kit.mesh(
      kit.ownGeometry(new THREE.CylinderGeometry(radius, radius, height, 16)),
      material,
      { p: points2, r: rotation },
      group,
    );

  // Four anchored legs widen at the foot; the braces meet the legs at every bay.
  const leg = (xPosition: number, zPosition: number, yPosition: number) =>
    new THREE.Vector3(
      xPosition * (1.03 - yPosition * 0.062),
      yPosition,
      zPosition * (1.03 - yPosition * 0.062),
    );
  for (const xPosition2 of [-1, 1])
    for (const zPosition2 of [-1, 1]) {
      link(
        kit,
        tower,
        leg(xPosition2, zPosition2, 0.25),
        leg(xPosition2, zPosition2, 6.25),
        0.065,
        structural,
      );
      kit.box(
        {
          p: [xPosition2 * 1.02, 0.23, zPosition2 * 1.02],
          s: [0.5, 0.07, 0.5],
        },
        graphite,
        tower,
      );
      for (const deltaX of [-0.16, 0.16])
        for (const deltaZ of [-0.16, 0.16])
          cylinder(
            0.035,
            0.07,
            [xPosition2 * 1.02 + deltaX, 0.28, zPosition2 * 1.02 + deltaZ],
            bronze,
          );
    }
  for (let yPosition2 = 0.4; yPosition2 < 5.9; yPosition2 += 1.12) {
    for (const zPosition3 of [-1, 1]) {
      link(
        kit,
        tower,
        leg(-1, zPosition3, yPosition2),
        leg(1, zPosition3, yPosition2 + 1.12),
        0.025,
        structural,
      );
      link(
        kit,
        tower,
        leg(1, zPosition3, yPosition2),
        leg(-1, zPosition3, yPosition2 + 1.12),
        0.025,
        structural,
      );
    }
    for (const xPosition3 of [-1, 1])
      link(
        kit,
        tower,
        leg(xPosition3, -1, yPosition2),
        leg(xPosition3, 1, yPosition2 + 1.12),
        0.025,
        structural,
      );
  }
  kit.box({ p: [0, 6.25, 0], s: [1.55, 0.12, 1.55] }, structural, tower);
  for (let yPosition3 = 0.55; yPosition3 < 6.1; yPosition3 += 0.32)
    kit.box(
      {
        p: [-0.75, yPosition3, 0.86 - yPosition3 * 0.05],
        s: [0.38, 0.035, 0.035],
      },
      structural,
      tower,
    );
  cylinder(0.52, 0.15, [0, 6.38, 0], graphite);
  cylinder(0.42, 0.14, [0, 6.51, 0], bronze);
  kit.box({ p: [0.62, 6.35, 0], s: [0.44, 0.38, 0.35] }, graphite, tower);
  batchSolids(tower, kit);

  const yaw = new THREE.Group();
  yaw.name = 'receiver-azimuth-drive';
  yaw.position.y = 6.9;
  root.add(yaw);
  const yoke = new THREE.Group();
  yaw.add(yoke);
  kit.box({ p: [0, -0.29, -0.3], s: [1.65, 0.18, 0.66] }, painted, yoke);
  for (const xPosition4 of [-0.73, 0.73]) {
    kit.box(
      { p: [xPosition4, 0.02, -0.3], s: [0.15, 0.64, 0.6] },
      painted,
      yoke,
    );
    cylinder(0.2, 0.2, [xPosition4, 0.23, -0.28], graphite, yoke, [
      0,
      0,
      Math.PI / 2,
    ]);
    cylinder(0.12, 0.22, [xPosition4, 0.23, -0.28], bronze, yoke, [
      0,
      0,
      Math.PI / 2,
    ]);
  }
  kit.box({ p: [-0.98, 0.23, -0.28], s: [0.36, 0.35, 0.45] }, graphite, yoke);
  batchSolids(yoke, kit);

  const elevation = new THREE.Group();
  elevation.name = 'receiver-elevation-gimbal';
  elevation.position.set(0, 0.23, -0.28);
  yaw.add(elevation);
  const bowlGroup = new THREE.Group();
  bowlGroup.position.z = 1.16;
  elevation.add(bowlGroup);
  const profile: THREE.Vector2[] = [];
  const depth = (radius: number) => (radius * radius) / 8.6;
  // The second side gives the reflector an actual edge thickness, rather than a paper disc.
  for (let index = 0; index <= 28; index++) {
    const radius2 = (index / 28) * 1.9;
    profile.push(new THREE.Vector2(radius2, depth(radius2)));
  }
  for (let index2 = 28; index2 >= 0; index2--) {
    const radius3 = (index2 / 28) * 1.9;
    profile.push(new THREE.Vector2(radius3, depth(radius3) - 0.045));
  }
  const reflector = kit.ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#e2e0d2',
      metalness: 0.48,
      roughness: 0.44,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    }),
  );
  kit.mesh(
    kit.ownGeometry(new THREE.LatheGeometry(profile, 64).rotateX(Math.PI / 2)),
    reflector,
    { p: [0, 0, 0] },
    bowlGroup,
  );
  kit.mesh(
    kit.ownGeometry(new THREE.TorusGeometry(1.9, 0.035, 8, 80)),
    rimMat,
    { p: [0, 0, depth(1.9)] },
    bowlGroup,
  );

  // All ribs follow the rear surface; the feed braces stop on the rim's forward face.
  for (let index3 = 0; index3 < 12; index3++) {
    const firstValue = (index3 / 12) * Math.PI * 2,
      ca = Math.cos(firstValue),
      sa = Math.sin(firstValue);
    const points = Array.from({ length: 12 }, (unusedValue, segmentIndex) => {
      const radius = 0.22 + (segmentIndex / 11) * 1.65;
      return new THREE.Vector3(ca * radius, sa * radius, depth(radius) - 0.09);
    });
    kit.mesh(
      kit.ownGeometry(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          12,
          0.025,
          5,
        ),
      ),
      structural,
      { p: [0, 0, 0] },
      bowlGroup,
    );
    if (index3 % 4 === 0) {
      const from = new THREE.Vector3(ca * 1.79, sa * 1.79, depth(1.79) + 0.055);
      const to = new THREE.Vector3(ca * 0.11, sa * 0.11, 1.27);
      link(kit, bowlGroup, from, to, 0.026, graphite);
      kit.mesh(
        kit.ownGeometry(new THREE.SphereGeometry(0.055, 8, 6)),
        bronze,
        { p: from.toArray() as [number, number, number] },
        bowlGroup,
      );
    }
  }
  cylinder(0.34, 0.14, [0, 0, -0.11], graphite, bowlGroup, [Math.PI / 2, 0, 0]);
  kit.box({ p: [0, 0, -0.25], s: [0.85, 0.72, 0.24] }, painted, bowlGroup);
  // The reflector stands ahead of its pivot. The rear spindle joins it to the yoke;
  // none of the fixed bearing blocks extends through the reflecting surface.
  cylinder(0.15, 0.91, [0, 0, -0.705], graphite, bowlGroup, [
    Math.PI / 2,
    0,
    0,
  ]);
  cylinder(0.12, 0.26, [0, 0, 1.3], graphite, bowlGroup, [Math.PI / 2, 0, 0]);
  cylinder(0.18, 0.09, [0, 0, 1.13], bronze, bowlGroup, [Math.PI / 2, 0, 0]);
  kit.mesh(
    kit.ownGeometry(new THREE.TorusGeometry(0.14, 0.025, 8, 24)),
    graphite,
    { p: [0, 0, 1.08] },
    bowlGroup,
  );
  batchSolids(bowlGroup, kit);

  yaw.rotation.y = Math.PI + THREE.MathUtils.degToRad(140 - 212);
  elevation.rotation.x = -THREE.MathUtils.degToRad(15);
  return {
    root,
    update(azimuth: number, angle: number, deltaSeconds: number) {
      const target = Math.PI + THREE.MathUtils.degToRad(azimuth - 212);
      const delta = Math.atan2(
        Math.sin(target - yaw.rotation.y),
        Math.cos(target - yaw.rotation.y),
      );
      yaw.rotation.y += delta * (1 - Math.exp(-deltaSeconds * 9));
      elevation.rotation.x = THREE.MathUtils.damp(
        elevation.rotation.x,
        -THREE.MathUtils.degToRad(angle),
        9,
        deltaSeconds,
      );
    },
  };
}
