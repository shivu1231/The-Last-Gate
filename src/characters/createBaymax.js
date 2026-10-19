import * as THREE from 'three';
import { createGeometryKit } from '../systems/GeometryKit.js';
/**
 * Build the shared Baymax body and its pose/interaction hierarchy.
 */
export function createBaymax() {
  const scene = new THREE.Group();
  const { mesh, box, ellipsoid, materials } = createGeometryKit(scene);
  const baymax = new THREE.Group();
  baymax.name = 'BaymaxDormantShell';
  const torsoPoints = [
    new THREE.Vector2(0, 0.22),
    new THREE.Vector2(0.55, 0.24),
    new THREE.Vector2(0.9, 0.43),
    new THREE.Vector2(1.1, 0.75),
    new THREE.Vector2(1.16, 1.08),
    new THREE.Vector2(1.1, 1.42),
    new THREE.Vector2(0.98, 1.8),
    new THREE.Vector2(0.82, 2.15),
    new THREE.Vector2(0.66, 2.48),
    new THREE.Vector2(0.43, 2.66),
    new THREE.Vector2(0, 2.7),
  ];
  const torsoCurve = new THREE.SplineCurve(torsoPoints);
  const torso = mesh(
    new THREE.LatheGeometry(torsoCurve.getPoints(60), 64),
    materials.white,
    0,
    0,
    0.08,
    baymax,
  );
  torso.scale.z = 0.73;
  torso.name = 'inflatable-body';
  const head = new THREE.Group();
  baymax.add(head);
  head.name = 'dormant-head';
  head.position.set(0, 2.98, 0.23);
  head.rotation.x = 0.24;
  head.rotation.z = -0.12;
  ellipsoid(0.77, 0.49, 0.49, materials.white, 0, 0, 0, head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#172022' });
  ellipsoid(0.065, 0.065, 0.025, eyeMat, -0.23, 0.015, 0.49, head).name =
    'dormant-eye';
  ellipsoid(0.065, 0.065, 0.025, eyeMat, 0.23, 0.015, 0.49, head).name =
    'dormant-eye';
  box(0.46, 0.022, 0.016, eyeMat, 0, 0.015, 0.502, head);
  // Chest seam and circular medical access port. The shell remains soft; the service
  // bay underneath is a restrained, cleanly layered mechanism rather than an exposed engine.
  const access = new THREE.Group();
  access.name = 'baymax-access';
  baymax.add(access);
  access.position.set(0.42, 2.05, 0.63);
  access.rotation.y = 0.15;
  const port = mesh(
    new THREE.TorusGeometry(0.17, 0.018, 10, 48),
    materials.seam,
    0,
    0,
    0.025,
    access,
  );
  port.name = 'access-ring';
  const panel = mesh(
    new THREE.CircleGeometry(0.151, 40),
    materials.white,
    0,
    0,
    0.03,
    access,
  );
  panel.name = 'access-panel';
  const internal = new THREE.Group();
  internal.name = 'medical-interface';
  internal.visible = false;
  baymax.add(internal);
  internal.position.set(0.42, 2.05, 0.7);
  internal.rotation.y = 0.15;
  const housingMat = new THREE.MeshStandardMaterial({
    color: '#c9d0d0',
    roughness: 0.42,
    metalness: 0.32,
    envMapIntensity: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#1d2830',
    roughness: 0.38,
    metalness: 0.44,
    envMapIntensity: 0.35,
  });
  const softBlue = new THREE.MeshBasicMaterial({
    color: '#b9eaff',
    transparent: true,
    opacity: 0.78,
  });
  // Nested medical-grade layers: rim, carrier, keyed socket. No loose wiring or clutter.
  mesh(
    new THREE.CylinderGeometry(0.145, 0.145, 0.06, 32),
    housingMat,
    0,
    0,
    -0.015,
    internal,
  ).rotation.x = Math.PI / 2;
  mesh(
    new THREE.TorusGeometry(0.11, 0.012, 8, 32),
    softBlue,
    0,
    0,
    0.02,
    internal,
  );
  mesh(
    new THREE.BoxGeometry(0.16, 0.09, 0.035),
    darkMat,
    0,
    0,
    0.035,
    internal,
  );
  mesh(
    new THREE.BoxGeometry(0.105, 0.035, 0.012),
    softBlue,
    0,
    0,
    0.057,
    internal,
  );
  for (const xPosition of [-0.075, 0.075])
    mesh(
      new THREE.BoxGeometry(0.018, 0.15, 0.025),
      housingMat,
      xPosition,
      0,
      0.02,
      internal,
    );
  const seal = new THREE.Group();
  seal.name = 'access-seal';
  seal.visible = false;
  baymax.add(seal);
  seal.position.copy(access.position);
  seal.rotation.copy(access.rotation);
  mesh(
    new THREE.TorusGeometry(0.155, 0.01, 8, 40),
    materials.seam,
    0,
    0,
    0.043,
    seal,
  );
  for (let side of [-1, 1]) {
    const tag = side < 0 ? 'right' : 'left';
    ellipsoid(
      0.45,
      0.56,
      0.46,
      materials.white,
      side * 0.93,
      2.3,
      -0.03,
      baymax,
    ).rotation.z = side * 0.25;
    baymax.children.at(-1).name = `shoulder-${tag}`;
    ellipsoid(
      0.38,
      0.73,
      0.38,
      materials.white,
      side * 1.12,
      1.7,
      0.08,
      baymax,
    ).rotation.z = side * 0.12;
    baymax.children.at(-1).name = `upper-arm-${tag}`;
    ellipsoid(
      0.39,
      0.54,
      0.42,
      materials.white,
      side * 1.23,
      0.82,
      0.3,
      baymax,
    ).rotation.x = -0.16;
    baymax.children.at(-1).name = `forearm-${tag}`;
    ellipsoid(
      0.35,
      0.24,
      0.38,
      materials.white,
      side * 1.25,
      0.35,
      0.48,
      baymax,
    ).name = `hand-${tag}`;
    for (let finger = 0; finger < 3; finger++)
      ellipsoid(
        0.09,
        0.11,
        0.17,
        materials.white,
        side * 1.25 + (finger - 1) * 0.17,
        0.29,
        0.76,
        baymax,
      ).name = `finger-${tag}-${finger}`;
    const leg = ellipsoid(
      0.49,
      0.49,
      0.83,
      materials.white,
      side * 0.57,
      0.48,
      0.76,
      baymax,
    );
    leg.rotation.y = side * 0.2;
    leg.name = `thigh-${tag}`;
    ellipsoid(
      0.43,
      0.35,
      0.61,
      materials.white,
      side * 0.71,
      0.26,
      1.42,
      baymax,
    ).name = `boot-${tag}`;
    box(0.53, 0.07, 0.62, materials.dark, side * 0.71, 0.04, 1.5, baymax);
  }
  // A few armor scratches, and a dormant back thruster.
  box(
    0.025,
    0.29,
    0.012,
    materials.seam,
    -0.99,
    2.35,
    0.373,
    baymax,
  ).rotation.z = -0.4;
  box(
    0.016,
    0.19,
    0.012,
    materials.seam,
    1.06,
    2.27,
    0.365,
    baymax,
  ).rotation.z = 0.3;
  ellipsoid(0.48, 0.66, 0.26, materials.white, 0, 2.1, -0.61, baymax).name =
    'back-shell';

  return baymax;
}
