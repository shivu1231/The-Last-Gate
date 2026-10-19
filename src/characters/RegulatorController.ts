import * as THREE from 'three';
import gsap from 'gsap';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  edgeWear,
  grain,
  grime,
  paint,
  scratches,
  seeded,
  wornPaint,
} from '../phase4/canvasTex';

/**
 * Hiro's own controller for the PR-6: a handheld remote he built to pair with the regulator in
 * Baymax's back. Same family as the PR-6 itself (worn grey paint chipped to bare metal, gunmetal
 * end caps with bolts, a small analogue OUTPUT gauge, a red/black chevron panel) with one guarded
 * toggle: flip the red cover up, push the bat forward and the limit is on.
 *
 * Built in metres, about 15 cm long: long axis on Z (the tip, with its stub aerial, toward -Z),
 * face up (+Y), origin at the middle of the grip.
 *
 * createFirstPersonHands() is the pair of hands that hold it, for a camera at Hiro's eye.
 */
export type LimiterController = {
  root: THREE.Object3D;
  /** Snap to on (limit on: guard up, bat forward, needle at 35 %, lamp lit) or off. */
  setOn(on: boolean): void;
  isOn(): boolean;
  /** The animated parts, 0..1. press() drives these; set them directly for a custom move. */
  state: { guard: number; toggle: number; lamp: number; gauge: number };
  /** Lamp pulse and needle jitter. Optional: setOn/press already pose everything. */
  update(timeSeconds: number): void;
  /** World position of the guard's lip and of the toggle bat (where a thumb or finger goes). */
  guardWorld(out?: THREE.Vector3): THREE.Vector3;
  toggleWorld(out?: THREE.Vector3): THREE.Vector3;
  dispose(): void;
};

/** Output when limited, as the dial reads it. */
const LIMIT = 0.35;

/**
 * Paint the regulator dial markings into its embedded texture.
 */
function gaugeFace() {
  return paint(256, 256, (drawingContext, width) => {
    const componentValue = width / 2,
      result = seeded(14);
    drawingContext.fillStyle = '#e6dfcb';
    drawingContext.fillRect(0, 0, width, width);
    grain(drawingContext, width, width, result, 1800, 0.08);
    grime(drawingContext, width, width, result, 3, '60,48,30', 0.16);
    drawingContext.translate(componentValue, componentValue);
    drawingContext.strokeStyle = '#b3201c';
    drawingContext.lineWidth = 14;
    drawingContext.beginPath();
    drawingContext.arc(0, 0, 96, -Math.PI / 2 + 0.62, -Math.PI / 2 + 2.36);
    drawingContext.stroke();
    drawingContext.strokeStyle = '#1b1a18';
    drawingContext.fillStyle = '#1b1a18';
    drawingContext.textAlign = 'center';
    drawingContext.textBaseline = 'middle';
    for (let index = 0; index <= 20; index++) {
      const firstValue = ((-135 + index * 13.5) * Math.PI) / 180,
        major = index % 5 === 0,
        value = major ? 80 : 90;
      drawingContext.lineWidth = major ? 4.5 : 2;
      drawingContext.beginPath();
      drawingContext.moveTo(
        Math.sin(firstValue) * value,
        -Math.cos(firstValue) * value,
      );
      drawingContext.lineTo(
        Math.sin(firstValue) * 104,
        -Math.cos(firstValue) * 104,
      );
      drawingContext.stroke();
    }
    drawingContext.font = '700 22px "IBM Plex Mono", monospace';
    drawingContext.fillText('OUT', 0, 44);
    drawingContext.font = '600 26px "Space Grotesk", Arial, sans-serif';
    drawingContext.fillText('0', -62, 58);
    drawingContext.fillText('10', 64, 58);
    drawingContext.beginPath();
    drawingContext.arc(0, 0, 120, 0, Math.PI * 2);
    drawingContext.lineWidth = 12;
    drawingContext.strokeStyle = '#2a2826';
    drawingContext.stroke();
  });
}
/**
 * Paint the remote hazard markings into a reusable texture.
 */
function chevrons() {
  return paint(256, 128, (drawingContext, width, height) => {
    const result = seeded(31);
    drawingContext.fillStyle = '#141414';
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.fillStyle = '#c4231c';
    for (let index = 0; index < 4; index++) {
      const x0 = 18 + index * 60;
      drawingContext.beginPath();
      drawingContext.moveTo(x0, 16);
      drawingContext.lineTo(x0 + 36, 64);
      drawingContext.lineTo(x0, 112);
      drawingContext.lineTo(x0 + 22, 112);
      drawingContext.lineTo(x0 + 58, 64);
      drawingContext.lineTo(x0 + 22, 16);
      drawingContext.closePath();
      drawingContext.fill();
    }
    grain(drawingContext, width, height, result, 2000, 0.22);
    scratches(drawingContext, width, height, result, 14, '220,210,200', 0.5);
    edgeWear(drawingContext, width, height, result, '#8d8a84', 8, 0.8);
  });
}
/**
 * Paint the remote identification label.
 */
function label() {
  return paint(256, 64, (drawingContext, width, height) => {
    const result = seeded(9);
    drawingContext.fillStyle = '#d9d2bf';
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.fillStyle = '#26241f';
    drawingContext.fillRect(0, 0, 70, height);
    drawingContext.fillStyle = '#d9d2bf';
    drawingContext.font = '700 30px "Space Grotesk", Arial, sans-serif';
    drawingContext.textBaseline = 'middle';
    drawingContext.fillText('PR-6', 6, 33);
    drawingContext.fillStyle = '#26241f';
    drawingContext.font = '600 21px "IBM Plex Mono", monospace';
    drawingContext.fillText('LINK · LIMIT', 82, 22);
    drawingContext.fillText('HH-01  ·  H.H.', 82, 46);
    grain(drawingContext, width, height, result, 1500, 0.12);
    scratches(drawingContext, width, height, result, 10, '120,110,90', 0.5);
  });
}

/**
 * Build the handheld regulator remote with its guarded switch and output dial.
 */
export function createLimiterController(): LimiterController {
  const geometry = new Set<THREE.BufferGeometry>(),
    material = new Set<THREE.Material>(),
    texture = new Set<THREE.Texture>();
  const geometry2 = <G extends THREE.BufferGeometry>(xPosition: G) => (
    geometry.add(xPosition),
    xPosition
  );
  const texture2 = (timeSeconds: THREE.Texture) => (
    texture.add(timeSeconds),
    timeSeconds
  );
  const std = (material2: THREE.MeshStandardMaterialParameters) => {
    const material3 = new THREE.MeshStandardMaterial(material2);
    material.add(material3);
    return material3;
  };
  const root = new THREE.Group();
  root.name = 'limiter-controller';
  const add = (
    geometry3: THREE.BufferGeometry,
    material2: THREE.Material,
    xPosition: number,
    yPosition: number,
    zPosition: number,
    parent: THREE.Object3D = root,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry2(geometry3), material2);
    mesh.position.set(xPosition, yPosition, zPosition);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    parent.add(mesh);
    return mesh;
  };

  const paintTex = texture2(
    wornPaint('#a59f92', 61, { rustSpots: 6, scratchCount: 70, size: 256 }),
  );
  const darkTex = texture2(
    wornPaint('#3b3a38', 62, {
      metal: '#a9a8a2',
      rustSpots: 2,
      scratchCount: 50,
      size: 256,
    }),
  );
  const plateTex = texture2(
    paint(128, 128, (drawingContext, width, height) => {
      const result = seeded(63);
      drawingContext.fillStyle = '#202224';
      drawingContext.fillRect(0, 0, width, height);
      grain(drawingContext, width, height, result, 1500, 0.14);
      scratches(drawingContext, width, height, result, 20, '180,180,175', 0.35);
      edgeWear(drawingContext, width, height, result, '#7d7f80', 6, 0.7);
    }),
  );
  const housing = std({
    map: paintTex,
    bumpMap: paintTex,
    bumpScale: 0.4,
    roughness: 0.6,
    metalness: 0.35,
  });
  const gunmetal = std({
    map: darkTex,
    bumpMap: darkTex,
    bumpScale: 0.4,
    roughness: 0.5,
    metalness: 0.6,
  });
  const plate = std({ map: plateTex, roughness: 0.48, metalness: 0.45 });
  const steel = std({ color: '#b3b6b6', roughness: 0.3, metalness: 0.92 });
  const darkSteel = std({ color: '#3d4144', roughness: 0.42, metalness: 0.85 });
  const rubber = std({ color: '#161718', roughness: 0.85, metalness: 0 });
  const red = std({ color: '#b51d18', roughness: 0.38, metalness: 0.25 });
  const face = std({ map: texture2(gaugeFace()), roughness: 0.55 });
  const chev = std({
    map: texture2(chevrons()),
    roughness: 0.5,
    metalness: 0.2,
  });
  const sticker = std({
    map: texture2(label()),
    roughness: 0.6,
    metalness: 0.05,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  material.add(glass);
  const lampMat = new THREE.MeshBasicMaterial({
    color: '#2a2f2a',
    toneMapped: false,
  });
  material.add(lampMat);
  const lensMat = new THREE.MeshBasicMaterial({
    color: '#4a1210',
    toneMapped: false,
  });
  material.add(lensMat);

  // Body: a rounded slab, chamfered paint worn through on the long top edges.
  const value = 0.062,
    value2 = 0.15,
    value3 = 0.026;
  const slab = (
    width: number,
    length: number,
    radius: number,
    height: number,
  ) => {
    const state2 = new THREE.Shape(),
      xPosition = -width / 2,
      yPosition = -length / 2;
    state2.moveTo(xPosition + radius, yPosition);
    state2.lineTo(xPosition + width - radius, yPosition);
    state2.quadraticCurveTo(
      xPosition + width,
      yPosition,
      xPosition + width,
      yPosition + radius,
    );
    state2.lineTo(xPosition + width, yPosition + length - radius);
    state2.quadraticCurveTo(
      xPosition + width,
      yPosition + length,
      xPosition + width - radius,
      yPosition + length,
    );
    state2.lineTo(xPosition + radius, yPosition + length);
    state2.quadraticCurveTo(
      xPosition,
      yPosition + length,
      xPosition,
      yPosition + length - radius,
    );
    state2.lineTo(xPosition, yPosition + radius);
    state2.quadraticCurveTo(
      xPosition,
      yPosition,
      xPosition + radius,
      yPosition,
    );
    const geometry3 = new THREE.ExtrudeGeometry(state2, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
      curveSegments: 5,
    });
    geometry3.rotateX(Math.PI / 2);
    geometry3.translate(0, height / 2, 0);
    return geometry3;
  };
  add(slab(value, value2, 0.01, value3), housing, 0, 0, 0);
  for (const scaleFactor of [-1, 1])
    add(
      new THREE.BoxGeometry(0.003, 0.004, value2 - 0.03),
      steel,
      scaleFactor * (value / 2 - 0.001),
      value3 / 2 + 0.0005,
      0,
      root,
      0,
      0,
      scaleFactor * 0.8,
    );
  // Rubber grips down both sides.
  for (const scaleFactor2 of [-1, 1])
    add(
      new THREE.BoxGeometry(0.005, value3 * 0.5, 0.08),
      rubber,
      scaleFactor2 * (value / 2 + 0.0012),
      -0.004,
      0.022,
    );
  // End caps, bolted. The tip carries a stub aerial and the link lens; the tail a lanyard loop.
  add(
    new THREE.BoxGeometry(value + 0.004, value3 + 0.004, 0.016),
    gunmetal,
    0,
    0,
    -value2 / 2 - 0.004,
  );
  add(
    new THREE.BoxGeometry(value + 0.004, value3 + 0.004, 0.014),
    gunmetal,
    0,
    0,
    value2 / 2 + 0.003,
  );
  for (const zPosition2 of [-value2 / 2 - 0.004, value2 / 2 + 0.003])
    for (const xPosition2 of [-0.022, 0.022])
      add(
        new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 6),
        steel,
        xPosition2,
        value3 / 2 + 0.003,
        zPosition2,
      );
  add(
    new THREE.CylinderGeometry(0.0042, 0.005, 0.028, 10),
    rubber,
    0.021,
    value3 / 2 + 0.012,
    -value2 / 2 - 0.002,
  );
  add(
    new THREE.SphereGeometry(0.0052, 10, 8),
    rubber,
    0.021,
    value3 / 2 + 0.027,
    -value2 / 2 - 0.002,
  );
  add(
    new THREE.SphereGeometry(0.0065, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    lensMat,
    -0.012,
    0,
    -value2 / 2 - 0.012,
    root,
    -Math.PI / 2,
  );
  add(
    new THREE.TorusGeometry(0.007, 0.0018, 6, 16),
    steel,
    0,
    0,
    value2 / 2 + 0.014,
    root,
    Math.PI / 2,
  );

  // Face plate.
  const top = value3 / 2 + 0.001;
  add(slab(0.04, 0.084, 0.006, 0.0016), plate, 0, top, -0.016);
  // Gauge: steel bezel, face, needle, glass.
  const gauge = new THREE.Group();
  gauge.position.set(0.003, top + 0.001, -0.042);
  root.add(gauge);
  add(
    new THREE.CylinderGeometry(0.0195, 0.0205, 0.005, 28),
    darkSteel,
    0,
    0.002,
    0,
    gauge,
  );
  add(
    new THREE.TorusGeometry(0.0178, 0.0022, 8, 28),
    steel,
    0,
    0.0048,
    0,
    gauge,
    Math.PI / 2,
  );
  add(
    new THREE.CircleGeometry(0.0172, 28),
    face,
    0,
    0.0047,
    0,
    gauge,
    -Math.PI / 2,
  );
  add(
    new THREE.CircleGeometry(0.0172, 28),
    glass,
    0,
    0.0058,
    0,
    gauge,
    -Math.PI / 2,
  );
  const needle = new THREE.Group();
  needle.position.y = 0.0052;
  gauge.add(needle);
  add(new THREE.BoxGeometry(0.0013, 0.0006, 0.0145), red, 0, 0, -0.006, needle);
  add(
    new THREE.CylinderGeometry(0.0018, 0.0018, 0.0012, 10),
    darkSteel,
    0,
    0.0004,
    0,
    needle,
  );
  // Chevron panel near the tail, the sticker beside it.
  add(
    new THREE.PlaneGeometry(0.026, 0.02),
    chev,
    0.0,
    top + 0.0014,
    0.042,
    root,
    -Math.PI / 2,
    0,
    Math.PI / 2,
  );
  add(
    new THREE.PlaneGeometry(0.048, 0.012),
    sticker,
    0,
    top + 0.0014,
    0.0635,
    root,
    -Math.PI / 2,
  );

  // The guarded toggle, toward the tip: a steel collar and bat on a pivot, the red cover hinged
  // on its tip-side edge so a thumb from the grip can get under its lip and flick it up.
  const sw = new THREE.Group();
  sw.position.set(0.002, top, 0.008);
  root.add(sw);
  add(new THREE.BoxGeometry(0.026, 0.004, 0.03), darkSteel, 0, 0.002, 0, sw);
  add(
    new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 16),
    steel,
    0,
    0.0055,
    0,
    sw,
  );
  const bat = new THREE.Group();
  bat.position.y = 0.007;
  sw.add(bat);
  add(
    new THREE.CylinderGeometry(0.0022, 0.0032, 0.017, 10),
    steel,
    0,
    0.0085,
    0,
    bat,
  );
  add(new THREE.SphereGeometry(0.0034, 10, 8), steel, 0, 0.017, 0, bat);
  const guard = new THREE.Group();
  guard.position.set(0, 0.004, -0.016);
  sw.add(guard);
  add(
    new THREE.CylinderGeometry(0.0024, 0.0024, 0.03, 10),
    steel,
    0,
    0,
    0,
    guard,
    0,
    0,
    Math.PI / 2,
  );
  // The cover: an open-bottomed box (top and two sides) so it reads as a hollow cap over the bat.
  add(
    new THREE.BoxGeometry(0.026, 0.0022, 0.031),
    red,
    0,
    0.022,
    0.0155,
    guard,
  );
  for (const scaleFactor3 of [-1, 1])
    add(
      new THREE.BoxGeometry(0.0022, 0.021, 0.031),
      red,
      scaleFactor3 * 0.012,
      0.0115,
      0.0155,
      guard,
    );
  add(new THREE.BoxGeometry(0.026, 0.021, 0.0022), red, 0, 0.0115, 0.03, guard);
  const lip = add(
    new THREE.BoxGeometry(0.014, 0.003, 0.005),
    red,
    0,
    0.007,
    0.033,
    guard,
  );
  // Two white stripes on the cover.
  const stripe = std({ color: '#ece7dc', roughness: 0.5 });
  for (const xPosition3 of [-0.006, 0.006])
    add(
      new THREE.BoxGeometry(0.0025, 0.0005, 0.028),
      stripe,
      xPosition3,
      0.0233,
      0.0155,
      guard,
    );
  // Status lamp beside the switch.
  add(
    new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 14),
    darkSteel,
    0.021,
    top + 0.0015,
    -0.012,
  );
  add(
    new THREE.SphereGeometry(0.0032, 12, 8),
    lampMat,
    0.021,
    top + 0.003,
    -0.012,
  );
  root.traverse((sceneObject) => {
    if (sceneObject instanceof THREE.Mesh) {
      sceneObject.castShadow = true;
      sceneObject.receiveShadow = true;
    }
  });

  const state = { guard: 0, toggle: 0, lamp: 0, gauge: 1 };
  let jitter = 0;
  const apply = () => {
    guard.rotation.x = -state.guard * 1.95;
    bat.rotation.x = THREE.MathUtils.lerp(0.5, -0.5, state.toggle);
    needle.rotation.y =
      (-(-135 + THREE.MathUtils.clamp(state.gauge + jitter, 0, 1) * 270) *
        Math.PI) /
      180;
  };
  const controller: LimiterController = {
    root,
    state,
    setOn(on) {
      gsap.killTweensOf(state);
      Object.assign(
        state,
        on
          ? { guard: 1, toggle: 1, lamp: 1, gauge: LIMIT }
          : { guard: 0, toggle: 0, lamp: 0, gauge: 1 },
      );
      apply();
    },
    isOn: () => state.toggle > 0.5,
    update(timeSeconds) {
      jitter =
        Math.sin(timeSeconds * 23) *
        Math.sin(timeSeconds * 7.1) *
        0.012 *
        (state.toggle > 0.5 ? 0.5 : 1);
      apply();
      lampMat.color
        .set(state.lamp > 0.5 ? '#ffb347' : '#2a2f2a')
        .multiplyScalar(
          state.lamp > 0.5 ? 1.5 + 0.35 * Math.sin(timeSeconds * 5) : 1,
        );
    },
    guardWorld: (out = new THREE.Vector3()) => lip.getWorldPosition(out),
    toggleWorld: (out = new THREE.Vector3()) =>
      bat.localToWorld(out.set(0, 0.017, 0)),
    dispose() {
      gsap.killTweensOf(state);
      root.removeFromParent();
      geometry.forEach((geometry3) => geometry3.dispose());
      material.forEach((material2) => material2.dispose());
      texture.forEach((timeSeconds) => timeSeconds.dispose());
    },
  };
  controller.setOn(false);
  return controller;
}

// ─────────────────────────────────────────────────────────────── first-person hands

/**
 * Side of the first-person hand rig.
 */
export type HandSide = 'left' | 'right';
/**
 * Named hand shapes a scene can ask for with FirstPersonHands.pose():
 * - hold: the left hand's grip on the remote (its default; solved against the remote's body).
 * - relaxed: loose, half-curled; the right hand's default at rest.
 * - open: flat and a little spread, reaching; the right hand's default at full reach.
 * - point: index out, the rest curled; for a switch, a button, a touch on a panel.
 * - pinch: thumb and index tips together; for a chip or a small part.
 * - grip: a closed wrap round something about 3 cm thick (the cartridge, a handle, a rail).
 * - press: flat palm, fingers together; pushing on a plate, a hatch, Baymax's chest.
 * - hook: fingers bent hard at the middle joints; hauling on an edge or a strap.
 */
export type HandPose =
  | 'hold'
  | 'relaxed'
  | 'open'
  | 'point'
  | 'pinch'
  | 'grip'
  | 'press'
  | 'hook';

/**
 * Data contract used by character geometry and posing.
 */
export type FirstPersonHands = {
  /** Parent it to the camera (the camera must be in the scene). Camera at Hiro's eye, -Z forward. */
  root: THREE.Object3D;
  /** Held in the left hand. */
  controller: LimiterController;
  /**
   * Every frame. walk 0..1 = speed (0 stand, 1 sprint); gait = step phase in radians (one footfall
   * per PI); raise 0..1 = controller lifted into view; reach 0..1 = right hand forward (pull a chip,
   * slot a cartridge, grip Baymax's hand).
   */
  update(
    timeSeconds: number,
    deltaSeconds: number,
    scaleFactor: { walk: number; gait: number; raise: number; reach: number },
  ): void;
  /**
   * The thumb works the guarded switch and toggles the controller: if it is off, flick the cover up
   * and push the bat forward; if it is on, pull the bat back and knock the cover shut. onClick fires
   * the moment the bat lands, onDone once the hand has settled. rate scales the speed. Returns the
   * timeline (pause or seek it for a still).
   */
  press(
    onClick: () => void,
    onDone: () => void,
    rate?: number,
  ): gsap.core.Timeline;
  /**
   * Shape a hand into a named pose; it blends there over about a fifth of a second. null hands it
   * back to its default (left: holding the remote; right: relaxed, opening as it reaches).
   */
  pose(side: HandSide, name: HandPose | null): void;
  /**
   * The right hand reaches for a world point so its grip point (rightSocket) lands on it, blended in
   * by k 0..1 over the usual reach. Clamped to arm's length. null lets go.
   */
  track(point: THREE.Vector3 | null, blendFactor?: number): void;
  /** The grip point in the right hand; it follows the pose (between the pinch, inside the grip...). Parent a held object here. */
  rightSocket: THREE.Object3D;
  dispose(): void;
};

/**
 * Left-thumb poses (base pitch, base yaw, bend), solved against the controller as it sits in the
 * hand: resting on the face beside the switch, tucked under the guard's lip, the flick, on the bat
 * (off / on). Each puts the pad on its target and keeps the thumb out of the body; the blends press()
 * runs between them do the same.
 */
// Solved for GRIP below: pads land within ~3 mm of the lip and the bat, rest lies on the face by the chevrons.
const THUMB = {
  rest: { tx: -2.1, ty: 0.68, tb: 0.74 },
  under: { tx: -1.94, ty: 0.94, tb: 0.44 },
  lip: { tx: -1.94, ty: 0.94, tb: 0.42 },
  flick: { tx: -1.61, ty: 0.88, tb: 0.2 },
  tog: { tx: -1.77, ty: 0.89, tb: 0.28 },
  togOn: { tx: -1.35, ty: 1.03, tb: 0.36 },
};

/**
 * Where the left hand sits on the remote, in the remote's frame (face +Y, tip -Z): the palm under its
 * back and rolled up onto the left edge, the fingers run diagonally along the back toward the tip,
 * the wrist off the lower left so the forearm leaves the bottom-left corner of the frame. Solved so
 * the palm just touches the body and the thumb can reach the guard's lip and the bat.
 */
const GRIP = {
  roll: 0.7,
  yaw: 1,
  at: [-0.0584, -0.0084, 0.03] as [number, number, number],
};

/** Per finger (index → little) the curl at each joint in radians, then spread, then the thumb (base pitch, base yaw, middle, tip). */
type Shape = {
  f: [number, number, number][];
  spread: number;
  thumb: [number, number, number, number];
  at: [number, number, number];
};
const curled = (entries: number[]): [number, number, number][] =>
  entries.map((xPosition) => [xPosition * 1.15, xPosition * 1.4, xPosition]);
/** In right-hand terms; the left mirrors the yaws. `at` is the grip point in the palm's frame. */
const SHAPES: Record<Exclude<HandPose, 'hold'>, Shape> = {
  relaxed: {
    f: curled([0.55, 0.62, 0.7, 0.78]),
    spread: 0,
    thumb: [-0.2, -0.2, 0.3, 0.25],
    at: [0, -0.035, -0.07],
  },
  open: {
    f: curled([0.15, 0.2, 0.26, 0.33]),
    spread: 1,
    thumb: [-0.1, -0.4, 0.3, 0.25],
    at: [0, -0.03, -0.08],
  },
  point: {
    f: [
      [0.04, 0.06, 0.04],
      [1.15, 1.55, 1.0],
      [1.2, 1.6, 1.0],
      [1.25, 1.55, 0.95],
    ],
    spread: 0.2,
    thumb: [0.93, -1.24, 0.67, 0.59],
    at: [-0.025, -0.006, -0.145],
  },
  pinch: {
    f: [
      [0.62, 0.72, 0.4],
      [0.85, 1.05, 0.7],
      [1.0, 1.25, 0.8],
      [1.1, 1.35, 0.85],
    ],
    spread: -0.2,
    thumb: [-0.12, -0.91, 0.05, 0.04],
    at: [-0.022, -0.054, -0.094],
  },
  grip: {
    f: [
      [1.0, 1.25, 0.85],
      [1.05, 1.3, 0.9],
      [1.1, 1.35, 0.9],
      [1.15, 1.4, 0.9],
    ],
    spread: -0.3,
    thumb: [0.84, -1.09, 0.84, 0.74],
    at: [-0.004, -0.027, -0.071],
  },
  press: {
    f: [
      [0.02, 0.03, 0.02],
      [0.0, 0.02, 0.02],
      [0.02, 0.03, 0.02],
      [0.05, 0.06, 0.04],
    ],
    spread: 0.15,
    thumb: [-0.3, -0.3, 0.12, 0.08],
    at: [0, -0.02, -0.07],
  },
  hook: {
    f: [
      [0.25, 1.6, 0.9],
      [0.25, 1.65, 0.9],
      [0.28, 1.65, 0.9],
      [0.3, 1.6, 0.85],
    ],
    spread: -0.2,
    thumb: [0.36, -0.64, 0, 0],
    at: [0, -0.03, -0.11],
  },
};
/** The left hand's hold on the remote, finger by finger: each joint closed until it meets the body (see GRIP). */
const HOLD: [number, number, number][] = [
  [0.19, 0.01, 1.29],
  [0.45, 0, 0.87],
  [0.61, 0, 0],
  [0.8, 0, 0],
];

/**
 * Palm, finger and thumb nodes owned by one hand rig.
 */
type HandRig = {
  root: THREE.Group;
  fingers: THREE.Group[][];
  thumb: THREE.Group[];
  palm: THREE.Group;
};
/**
 * Callback that registers a constructed GPU resource with its owner.
 */
type OwnResource = {
  g: <G extends THREE.BufferGeometry>(xPosition: G) => G;
  skin: THREE.Material;
  skinDark: THREE.Material;
  nail: THREE.Material;
  sleeve: THREE.Material;
  cuff: THREE.Material;
};

/**
 * The palm: one smooth, slightly cupped slab instead of a cluster of balls, wider at the knuckles than
 * at the heel, the back domed a little and thicker toward the wrist. Spans z -.002 (heel) to -.076
 * (knuckles) in the hand's frame.
 */
function palmGeometry(geometry: OwnResource['g']) {
  const geometry2 = new THREE.SphereGeometry(1, 32, 20),
    position = geometry2.attributes.position,
    vector = new THREE.Vector3();
  const sp = (xPosition: number, easedProgress: number) =>
    Math.sign(xPosition) * Math.pow(Math.abs(xPosition), easedProgress);
  for (let index = 0; index < position.count; index++) {
    vector.fromBufferAttribute(position, index);
    const timeSeconds = (vector.z + 1) / 2; // 0 at the knuckles (-z), 1 at the heel
    const hx = THREE.MathUtils.lerp(0.0365, 0.03, timeSeconds * timeSeconds),
      hy = THREE.MathUtils.lerp(0.0105, 0.0135, timeSeconds),
      hz = 0.037;
    let xPosition2 = sp(vector.x, 0.55) * hx,
      yPosition = sp(vector.y, 0.7) * hy;
    const zPosition = sp(vector.z, 0.5) * hz - 0.039;
    const across = 1 - Math.min(1, (xPosition2 / hx) ** 2);
    if (yPosition > 0)
      yPosition += 0.0035 * across * (1 - timeSeconds * 0.5); // domed back
    else yPosition += 0.0022 * across * Math.sin(Math.PI * timeSeconds); // cupped palm
    // The little-finger edge drops a touch lower than the index edge, the way a hand rests.
    yPosition -= xPosition2 * 0.06;
    xPosition2 *= 1 + 0.05 * Math.sin(Math.PI * timeSeconds);
    position.setXYZ(index, xPosition2, yPosition, zPosition);
  }
  geometry2.deleteAttribute('normal');
  geometry2.deleteAttribute('uv');
  const merged = mergeVertices(geometry2);
  geometry2.dispose();
  merged.computeVertexNormals();
  return geometry(merged);
}

/**
 * One hand in its own frame: wrist at the origin, fingers along -Z, palm facing -Y, back of the
 * hand +Y; the thumb on +X for a left hand, -X for a right. The hoodie sleeve runs back along +Z.
 * Contract kept for the scenes that drive it directly (phase 6's haul): root.children[0] is the
 * sleeve (a lathe authored .32 long on its local Y), [1] the cuff; palm, fingers[4][3], thumb[3].
 */
function buildHand(side: -1 | 1, own: OwnResource): HandRig {
  const { g: geometry, skin, skinDark, nail, sleeve, cuff } = own;
  const root = new THREE.Group();
  const sphere = geometry(new THREE.SphereGeometry(1, 16, 12));
  // A finger segment along -Z, capped at both ends, a touch flatter than it is wide.
  const seg = (len: number, scalarValue: number, scalarValue2: number) => {
    const screenVector: THREE.Vector2[] = [];
    for (let index = 0; index <= 5; index++) {
      const firstValue = -Math.PI / 2 + ((index / 5) * Math.PI) / 2;
      screenVector.push(
        new THREE.Vector2(
          Math.max(0.0001, Math.cos(firstValue) * scalarValue2),
          -len + Math.sin(firstValue) * scalarValue2,
        ),
      );
    }
    for (let index2 = 1; index2 <= 5; index2++) {
      const firstValue2 = ((index2 / 5) * Math.PI) / 2;
      screenVector.push(
        new THREE.Vector2(
          Math.max(0.0001, Math.cos(firstValue2) * scalarValue),
          Math.sin(firstValue2) * scalarValue,
        ),
      );
    }
    const geometry2 = geometry(new THREE.LatheGeometry(screenVector, 14));
    geometry2.rotateX(Math.PI / 2);
    geometry2.scale(1, 0.88, 1);
    return geometry2; // lathe +Y (base) → +Z, its -len tip → -Z
  };
  // Hoodie sleeve: soft fabric that bunches toward the cuff (a lathe with a few folds), over a
  // ribbed cuff that sits snug on the wrist. Scaled on y by the haul to reach back to the shoulder,
  // so the profile is authored along a unit-ish length (.32).
  const sleeveProfile: THREE.Vector2[] = [];
  for (let index3 = 0; index3 <= 20; index3++) {
    const sampleValue = index3 / 20,
      fold =
        Math.sin(sampleValue * Math.PI * 4.2) *
        0.0028 *
        (1 - sampleValue) *
        (1 - sampleValue);
    sleeveProfile.push(
      new THREE.Vector2(
        0.044 +
          sampleValue * 0.01 +
          fold +
          Math.sin(sampleValue * Math.PI) * 0.004,
        (sampleValue - 0.5) * 0.32,
      ),
    );
  }
  const slGeo = geometry(new THREE.LatheGeometry(sleeveProfile, 22));
  slGeo.scale(1, 1, 0.86);
  const sl = new THREE.Mesh(slGeo, sleeve);
  sl.rotation.x = Math.PI / 2;
  sl.position.z = 0.2;
  root.add(sl);
  const cf = new THREE.Mesh(
    geometry(new THREE.CylinderGeometry(0.037, 0.041, 0.045, 22)),
    cuff,
  );
  cf.rotation.x = Math.PI / 2;
  cf.position.z = 0.036;
  cf.scale.set(1, 1, 0.86);
  root.add(cf);
  // Rib lines round the cuff (children of the cuff, so they follow it when the haul resizes it).
  // One merged mesh for the four ribs (one draw instead of four).
  const ribs = [0.018, 0.029, 0.04, 0.051].map((zPosition) =>
    new THREE.TorusGeometry(0.0385, 0.0017, 5, 22)
      .rotateX(Math.PI / 2)
      .translate(0, zPosition - 0.036, 0),
  );
  cf.add(new THREE.Mesh(geometry(mergeGeometries(ribs)), cuff));
  ribs.forEach((geometry2) => geometry2.dispose());

  const palm = new THREE.Group();
  root.add(palm);
  // Wrist: narrower than the palm and oval, running into the cuff.
  const wrist = new THREE.Mesh(
    geometry(new THREE.CylinderGeometry(0.025, 0.027, 0.05, 18)),
    skin,
  );
  wrist.rotation.x = Math.PI / 2;
  wrist.scale.set(1.2, 1, 0.74);
  wrist.position.z = 0.014;
  palm.add(wrist);
  palm.add(new THREE.Mesh(palmGeometry(geometry), skin));
  // Thenar pad at the thumb's root, on the palm side.
  const pad = new THREE.Mesh(sphere, skin);
  pad.scale.set(0.016, 0.013, 0.026);
  pad.position.set(side * 0.022, -0.006, -0.024);
  pad.rotation.y = side * 0.35;
  palm.add(pad);
  // Fingers: index, middle, ring, little; three tapering segments each, a nail on the last.
  const fingers: THREE.Group[][] = [];
  const specs: [number, number, number[]][] = [
    [0.025, 0.0082, [0.034, 0.023, 0.019]],
    [0.0085, 0.0086, [0.037, 0.026, 0.02]],
    [-0.0085, 0.0081, [0.035, 0.024, 0.019]],
    [-0.024, 0.007, [0.028, 0.019, 0.016]],
  ];
  for (const [x0, radius, lens] of specs) {
    const joints: THREE.Group[] = [];
    let parent: THREE.Object3D = palm,
      zPosition2 = -0.075 + Math.abs(x0) * 0.32;
    lens.forEach((len, index) => {
      const segmentIndex = new THREE.Group();
      segmentIndex.position.set(
        index === 0 ? side * x0 : 0,
        index === 0 ? 0.001 : 0,
        zPosition2,
      );
      parent.add(segmentIndex);
      const scalarValue = radius * (1 - index * 0.09),
        scalarValue2 =
          radius * (1 - (index + 1) * 0.09) * (index === 2 ? 0.92 : 1);
      segmentIndex.add(
        new THREE.Mesh(seg(len, scalarValue, scalarValue2), skin),
      );
      // A soft knuckle on the back of each first joint (same skin, just a slightly warmer tone).
      if (index === 0) {
        const material = new THREE.Mesh(sphere, skinDark);
        material.scale.set(radius * 0.95, radius * 0.62, radius * 0.95);
        material.position.set(0, radius * 0.38, 0.001);
        segmentIndex.add(material);
      }
      if (index === 2) {
        const material2 = new THREE.Mesh(sphere, nail);
        material2.scale.set(
          scalarValue2 * 0.78,
          scalarValue2 * 0.26,
          len * 0.36,
        );
        material2.position.set(0, scalarValue2 * 0.74, -len * 0.6);
        segmentIndex.add(material2);
      }
      joints.push(segmentIndex);
      parent = segmentIndex;
      zPosition2 = -len;
    });
    fingers.push(joints);
  }
  // Thumb: from the heel of the palm, angled out and forward; the first segment is the fleshy base.
  const thumbBase = new THREE.Group();
  thumbBase.position.set(side * 0.03, -0.007, -0.016);
  thumbBase.rotation.set(0, side * -0.7, side * 0.5);
  palm.add(thumbBase);
  const thumb: THREE.Group[] = [];
  {
    let parent: THREE.Object3D = thumbBase,
      zPosition3 = 0;
    (
      [
        [0.04, 0.0122, 0.0108],
        [0.029, 0.0104, 0.0095],
        [0.023, 0.0093, 0.0078],
      ] as const
    ).forEach(([len, value, value2], index) => {
      const segmentIndex = new THREE.Group();
      segmentIndex.position.z = zPosition3;
      parent.add(segmentIndex);
      segmentIndex.add(new THREE.Mesh(seg(len, value, value2), skin));
      if (index === 2) {
        const material = new THREE.Mesh(sphere, nail);
        material.scale.set(0.0066, 0.0024, 0.0085);
        material.position.set(0, 0.0071, -len * 0.58);
        segmentIndex.add(material);
      }
      thumb.push(segmentIndex);
      parent = segmentIndex;
      zPosition3 = -len;
    });
  }
  return { root, fingers, thumb, palm };
}

/** The grip's transform in the remote's frame (see GRIP). */
function gripTransform(obj: THREE.Object3D, gp = GRIP) {
  const normalVector = new THREE.Vector3(
    Math.sin(gp.roll),
    Math.cos(gp.roll),
    0,
  );
  const vector = new THREE.Vector3(Math.cos(gp.yaw), 0, -Math.sin(gp.yaw));
  vector.addScaledVector(normalVector, -vector.dot(normalVector)).normalize();
  const vector2 = normalVector.clone().negate(),
    vector3 = vector.clone().negate(),
    vector4 = new THREE.Vector3().crossVectors(vector2, vector3);
  obj.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(vector4, vector2, vector3),
  );
  obj.position.fromArray(gp.at);
}

/** Set a hand's joints from a shape (yaws mirrored for the left hand). */
function applyShape(
  height: HandRig,
  side: -1 | 1,
  entries: [number, number, number][],
  spread: number,
  th: [number, number, number, number],
) {
  height.fingers.forEach((segmentIndex, index) => {
    segmentIndex[0].rotation.set(
      -entries[index][0],
      side * (index - 1.5) * spread * 0.1,
      0,
    );
    segmentIndex[1].rotation.x = -entries[index][1];
    segmentIndex[2].rotation.x = -entries[index][2];
  });
  height.thumb[0].rotation.set(th[0], -side * th[1], 0);
  height.thumb[1].rotation.x = -th[2];
  height.thumb[2].rotation.x = -th[3];
}

/** A shape being blended toward: its current values and where they are going. */
type Blend = {
  f: [number, number, number][];
  spread: number;
  thumb: [number, number, number, number];
  at: THREE.Vector3;
};
const blendOf = (state: Shape): Blend => ({
  f: state.f.map((xPosition) => [...xPosition] as [number, number, number]),
  spread: state.spread,
  thumb: [...state.thumb],
  at: new THREE.Vector3().fromArray(state.at),
});
/**
 * Apply the existing interpolation curve without changing its timing or bounds.
 */
function damp(secondEntry: Blend, to: Shape, blendFactor: number) {
  secondEntry.f.forEach((xPosition, index) => {
    for (let segmentIndex = 0; segmentIndex < 3; segmentIndex++)
      xPosition[segmentIndex] +=
        (to.f[index][segmentIndex] - xPosition[segmentIndex]) * blendFactor;
  });
  secondEntry.spread += (to.spread - secondEntry.spread) * blendFactor;
  for (let segmentIndex2 = 0; segmentIndex2 < 4; segmentIndex2++)
    secondEntry.thumb[segmentIndex2] +=
      (to.thumb[segmentIndex2] - secondEntry.thumb[segmentIndex2]) *
      blendFactor;
  secondEntry.at.x += (to.at[0] - secondEntry.at.x) * blendFactor;
  secondEntry.at.y += (to.at[1] - secondEntry.at.y) * blendFactor;
  secondEntry.at.z += (to.at[2] - secondEntry.at.z) * blendFactor;
}
/** The right hand's default: relaxed, opening as it reaches (q 0..1). */
function reachShape(resonance: number, out: Shape) {
  const entries = [0.55, 0.62, 0.7, 0.78],
    dc = [0.4, 0.42, 0.44, 0.45];
  for (let index = 0; index < 4; index++) {
    const componentValue = entries[index] - resonance * dc[index];
    out.f[index][0] = componentValue * 1.15;
    out.f[index][1] = componentValue * 1.4;
    out.f[index][2] = componentValue;
  }
  out.spread = resonance;
  out.thumb[0] = -0.2 + resonance * 0.1;
  out.thumb[1] = -0.2 - resonance * 0.2;
  out.thumb[2] = 0.3;
  out.thumb[3] = 0.25;
  for (let segmentIndex = 0; segmentIndex < 3; segmentIndex++)
    out.at[segmentIndex] = THREE.MathUtils.lerp(
      SHAPES.relaxed.at[segmentIndex],
      SHAPES.open.at[segmentIndex],
      resonance,
    );
  return out;
}

/**
 * Build camera-relative hand rigs and the remote grip used by authored interactions.
 */
export function createFirstPersonHands(
  controller: LimiterController = createLimiterController(),
): FirstPersonHands {
  const geometry: THREE.BufferGeometry[] = [],
    material: THREE.Material[] = [];
  const geometry2 = <G extends THREE.BufferGeometry>(xPosition: G) => {
    geometry.push(xPosition);
    return xPosition;
  };
  const std = (material2: THREE.MeshStandardMaterialParameters) => {
    const material3 = new THREE.MeshStandardMaterial(material2);
    material.push(material3);
    return material3;
  };
  const phys = (material2: THREE.MeshPhysicalMaterialParameters) => {
    const material3 = new THREE.MeshPhysicalMaterial(material2);
    material.push(material3);
    return material3;
  };
  const knit = paint(
    128,
    128,
    (drawingContext, width, height) => {
      const result = seeded(77);
      drawingContext.fillStyle = '#808080';
      drawingContext.fillRect(0, 0, width, height);
      for (let yPosition = 0; yPosition < height; yPosition += 4) {
        drawingContext.fillStyle = yPosition % 8 ? '#8c8c8c' : '#747474';
        drawingContext.fillRect(0, yPosition, width, 2);
      }
      grain(drawingContext, width, height, result, 2500, 0.25);
    },
    false,
  );
  knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
  knit.repeat.set(6, 3);
  const own: OwnResource = {
    g: geometry2,
    // Skin: a warm, slightly muted tan with a soft sheen, so the form reads under any set's light
    // without going orange or plastic under the filmic tone map.
    skin: phys({
      color: '#c99b7f',
      roughness: 0.58,
      sheen: 0.35,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#f0b8a0'),
    }),
    skinDark: phys({
      color: '#c08f74',
      roughness: 0.62,
      sheen: 0.3,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#eaa894'),
    }),
    nail: std({ color: '#e3c3b2', roughness: 0.3 }),
    // Hoodie fabric: a knit bump so it reads as cloth, not a painted tube.
    sleeve: std({
      color: '#4d5d72',
      roughness: 0.95,
      bumpMap: knit,
      bumpScale: 1.4,
    }),
    cuff: std({
      color: '#404e60',
      roughness: 0.98,
      bumpMap: knit,
      bumpScale: 2,
    }),
  };
  const root = new THREE.Group();
  root.name = 'first-person-hands';
  // A soft key so the hands read whatever the set's lighting (it only reaches a metre).
  const key = new THREE.PointLight('#fff1e2', 0.9, 1.2, 2);
  key.position.set(0.15, 0.25, 0.1);
  root.add(key);

  const left = buildHand(1, own),
    right = buildHand(-1, own);
  // Each hand hangs from a mount that does the big moves (raise, reach, sway).
  const leftMount = new THREE.Group(),
    rightMount = new THREE.Group();
  root.add(leftMount, rightMount);
  // Left: the controller sits in the mount, face tilted up toward the eye, held the way a thick
  // remote is held: across the palm, fingers round its far edge, thumb free on the face (GRIP).
  const held = new THREE.Group();
  leftMount.add(held);
  held.add(controller.root);
  controller.root.position.set(0, 0, 0);
  controller.root.rotation.set(0, 0, 0);
  held.add(left.root);
  gripTransform(left.root);
  rightMount.add(right.root);
  // Right: palm down, a little turned in; it opens as it reaches.
  right.root.rotation.set(-0.2, -0.25, -0.15);
  const rightSocket = new THREE.Group();
  rightSocket.name = 'right-hand-socket';
  right.palm.add(rightSocket);
  root.traverse((sceneObject) => {
    sceneObject.frustumCulled = false;
    if (sceneObject instanceof THREE.Mesh) sceneObject.renderOrder = 2;
  });

  // Animated values; press() tweens these.
  const scaleFactor = { ...THUMB.rest, tilt: 0, nudge: 0 };
  const sm = { walk: 0, raise: 0, reach: 0, track: 0 };
  const want: Record<HandSide, HandPose | null> = { left: null, right: null };
  const tmpShape: Shape = {
    f: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    spread: 0,
    thumb: [0, 0, 0, 0],
    at: [0, 0, 0],
  };
  // The left hand's hold, its thumb rewritten each frame from s (which press() drives).
  const holdShape: Shape = {
    f: HOLD,
    spread: -0.15,
    thumb: [
      THUMB.rest.tx,
      -THUMB.rest.ty,
      THUMB.rest.tb * 0.8,
      THUMB.rest.tb * 0.7,
    ],
    at: [0, 0, 0],
  };
  const rightBlend = blendOf(reachShape(0, tmpShape));
  const leftBlend = blendOf(holdShape);
  const tracked = { on: false, point: new THREE.Vector3(), k: 1 };
  // Weight: the hands trail the head a little when it turns and settle back with a small overshoot.
  const lag = { x: 0, y: 0, vx: 0, vy: 0 },
    prevQ = new THREE.Quaternion(),
    curQ = new THREE.Quaternion(),
    dq = new THREE.Quaternion();
  let hasPrev = false;
  let timeline: gsap.core.Timeline | null = null;
  const vector = new THREE.Vector3(),
    depth = new THREE.Vector3(),
    off = new THREE.Vector3(),
    shoulder = new THREE.Vector3(0.2, -0.32, 0.05),
    transformMatrix = new THREE.Matrix4();

  const hands: FirstPersonHands = {
    root,
    controller,
    rightSocket,
    update(timeSeconds, deltaSeconds, inp) {
      const blendFactor = 1 - Math.exp(-deltaSeconds * 10);
      sm.walk += (inp.walk - sm.walk) * blendFactor;
      sm.raise += (inp.raise - sm.raise) * (1 - Math.exp(-deltaSeconds * 6));
      sm.reach += (inp.reach - sm.reach) * (1 - Math.exp(-deltaSeconds * 7));
      sm.track +=
        ((tracked.on ? tracked.k : 0) - sm.track) *
        (1 - Math.exp(-deltaSeconds * 8));
      const width = sm.walk,
        ph = inp.gait;
      // Head-turn lag: angular speed of the rig → a spring the mounts ride on. A cut resets it.
      root.getWorldQuaternion(curQ);
      if (hasPrev && deltaSeconds > 0) {
        dq.copy(prevQ).invert().multiply(curQ);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
        if (ang > 0.35) {
          lag.x = lag.y = lag.vx = lag.vy = 0;
        } else {
          const sgn = dq.w < 0 ? -1 : 1,
            sn = Math.sqrt(Math.max(1e-9, 1 - dq.w * dq.w));
          const yawRate = (((sgn * dq.y) / sn) * ang) / deltaSeconds,
            pitchRate = (((sgn * dq.x) / sn) * ang) / deltaSeconds;
          const tx = THREE.MathUtils.clamp(yawRate * 0.01, -0.025, 0.025),
            ty = THREE.MathUtils.clamp(-pitchRate * 0.01, -0.02, 0.02);
          // A stiff, slightly under-damped spring: trails, then settles with a little give.
          const kS = 140,
            kD = 16,
            height = Math.min(deltaSeconds, 1 / 30);
          lag.vx += ((tx - lag.x) * kS - lag.vx * kD) * height;
          lag.x += lag.vx * height;
          lag.vy += ((ty - lag.y) * kS - lag.vy * kD) * height;
          lag.y += lag.vy * height;
        }
      }
      prevQ.copy(curQ);
      hasPrev = true;
      const breathe = Math.sin(timeSeconds * 1.6) * 0.004 * (1 - width);
      // Walk: a dip on each footfall, a sway side to side, and a pump with the run.
      const bob = -Math.abs(Math.cos(ph)) * 0.016 * width,
        sway = Math.sin(ph) * 0.014 * width,
        pump = Math.sin(ph) * 0.05 * width * width;
      // Left hand + controller: lowered out of shot ↔ raised in front, a little left of centre. The
      // remote's weight shows as a slight lag behind the right hand.
      const radius = sm.raise;
      leftMount.position.set(
        THREE.MathUtils.lerp(-0.2, -0.085, radius) + sway + lag.x,
        THREE.MathUtils.lerp(-0.5, -0.105, radius) + bob + breathe + lag.y,
        THREE.MathUtils.lerp(-0.25, -0.36, radius) + pump,
      );
      leftMount.rotation.set(
        THREE.MathUtils.lerp(-0.9, 0.8, radius) +
          scaleFactor.tilt +
          Math.sin(ph) * 0.05 * width -
          lag.y * 2,
        THREE.MathUtils.lerp(0.4, 0.15, radius) + lag.x * 2,
        0.12 + Math.sin(ph) * 0.06 * width + scaleFactor.nudge,
      );
      // Right hand: out of shot ↔ forward and down, open. Reaching, the forearm comes in from the lower
      // right like a real arm, so the sleeve runs off the bottom corner of the frame.
      const resonance = sm.reach;
      rightMount.position.set(
        THREE.MathUtils.lerp(0.24, 0.14, resonance) - sway * 0.8 + lag.x * 0.8,
        THREE.MathUtils.lerp(-0.5, -0.19, resonance) +
          bob +
          breathe +
          lag.y * 0.8,
        THREE.MathUtils.lerp(-0.22, -0.46, resonance) - pump,
      );
      rightMount.rotation.set(
        THREE.MathUtils.lerp(-0.8, 0.4, resonance) -
          Math.sin(ph) * 0.05 * width,
        THREE.MathUtils.lerp(-0.3, 0.55, resonance),
        THREE.MathUtils.lerp(0, 0.35, resonance) - Math.sin(ph) * 0.06 * width,
      );
      // Fingers ease toward the asked-for pose, or the defaults.
      const kp = 1 - Math.exp(-deltaSeconds * 14);
      damp(
        rightBlend,
        want.right
          ? want.right === 'hold'
            ? SHAPES.grip
            : SHAPES[want.right]
          : reachShape(resonance, tmpShape),
        kp,
      );
      applyShape(right, -1, rightBlend.f, rightBlend.spread, rightBlend.thumb);
      rightSocket.position.copy(rightBlend.at);
      // Tracking: move the mount so the socket lands on the point (clamped to arm's length).
      if (sm.track > 0.001) {
        root.updateMatrixWorld(true);
        transformMatrix.copy(root.matrixWorld).invert();
        vector.copy(tracked.point).applyMatrix4(transformMatrix);
        depth.subVectors(vector, shoulder);
        const len = depth.length();
        if (len > 0.62)
          vector.copy(shoulder).addScaledVector(depth, 0.62 / len);
        // Socket's offset in the mount's frame, with the mount's current rotation.
        rightSocket.updateWorldMatrix(true, false);
        rightSocket
          .getWorldPosition(off)
          .applyMatrix4(transformMatrix)
          .sub(rightMount.position);
        rightMount.position.lerp(vector.sub(off), sm.track);
      }
      rightMount.visible =
        resonance > 0.01 ||
        width > 0.3 ||
        sm.track > 0.01 ||
        want.right !== null;
      leftMount.visible = radius > 0.01 || width > 0.3;
      // Left: holding the remote (the thumb from s, which press() drives), or a named pose.
      if (want.left && want.left !== 'hold')
        damp(leftBlend, SHAPES[want.left], kp);
      else {
        // The thumb follows press() exactly (no lag on a timed beat); the fingers settle back in.
        const th = holdShape.thumb;
        th[0] = scaleFactor.tx;
        th[1] = -scaleFactor.ty;
        th[2] = scaleFactor.tb * 0.8;
        th[3] = scaleFactor.tb * 0.7;
        damp(leftBlend, holdShape, kp);
        for (let segmentIndex = 0; segmentIndex < 4; segmentIndex++)
          leftBlend.thumb[segmentIndex] = th[segmentIndex];
      }
      applyShape(left, 1, leftBlend.f, leftBlend.spread, leftBlend.thumb);
      controller.update(timeSeconds);
    },
    press(onClick, onDone, rate = 1) {
      timeline?.kill();
      const componentValue = controller.state,
        on = controller.isOn();
      const tl = gsap.timeline({
        onComplete: onDone,
        defaults: { lazy: false },
      });
      timeline = tl;
      const to = (
        key2: keyof typeof THUMB,
        duration: number,
        ease = 'power2.inOut',
        extra: Record<string, number> = {},
      ) => ({ ...THUMB[key2], ...extra, duration, ease });
      if (!on) {
        // Thumb slides up under the lip, flicks the cover open past its stop, then pushes the bat.
        tl.to(scaleFactor, to('under', 0.3, 'power2.out', { tilt: 0.05 }))
          .to(scaleFactor, to('lip', 0.12, 'power2.in'))
          .to(scaleFactor, to('flick', 0.12, 'power2.out'))
          .to(
            componentValue,
            { guard: 1, duration: 0.26, ease: 'back.out(2.6)' },
            '<',
          )
          .to(scaleFactor, to('tog', 0.16, 'power2.inOut', { nudge: 0.02 }))
          .to(scaleFactor, to('togOn', 0.08, 'power3.in', { tilt: 0.09 }))
          .to(
            componentValue,
            { toggle: 1, duration: 0.07, ease: 'back.out(3)' },
            '<.02',
          )
          .call(() => {
            componentValue.lamp = 1;
            onClick();
          })
          .to(componentValue, {
            gauge: LIMIT,
            duration: 1.1,
            ease: 'power3.inOut',
          })
          .to(
            scaleFactor,
            to('rest', 0.4, 'power2.inOut', { tilt: 0, nudge: 0 }),
            '<.12',
          );
      } else {
        // Thumb hooks the bat back, rises over the open cover and presses it shut from on top (never
        // under its lip, where the closing cover would land on it), then goes back to the face.
        tl.to(scaleFactor, to('togOn', 0.28, 'power2.out', { tilt: 0.05 }))
          .to(scaleFactor, to('tog', 0.09, 'power3.in', { tilt: 0.08 }))
          .to(
            componentValue,
            { toggle: 0, duration: 0.07, ease: 'back.out(3)' },
            '<.02',
          )
          .call(() => {
            componentValue.lamp = 0;
            onClick();
          })
          .to(componentValue, { gauge: 1, duration: 0.8, ease: 'power2.out' })
          .to(scaleFactor, to('flick', 0.14, 'power2.out'), '<')
          .to(scaleFactor, to('lip', 0.14, 'power2.in', { tilt: 0.06 }))
          .to(
            componentValue,
            { guard: 0, duration: 0.2, ease: 'bounce.out' },
            '<.06',
          )
          .to(
            scaleFactor,
            to('rest', 0.32, 'power2.inOut', { tilt: 0, nudge: 0 }),
          );
      }
      tl.timeScale(rate);
      return tl;
    },
    pose(side, name) {
      want[side] = name;
    },
    track(point, blendFactor = 1) {
      tracked.on = !!point;
      if (point) tracked.point.copy(point);
      tracked.k = THREE.MathUtils.clamp(blendFactor, 0, 1);
    },
    dispose() {
      timeline?.kill();
      controller.dispose();
      geometry.forEach((geometry3) => geometry3.dispose());
      material.forEach((material2) => material2.dispose());
      knit.dispose();
      root.removeFromParent();
    },
  };
  (hands as unknown as { debug: unknown }).debug = {
    left,
    right,
    held,
    leftMount,
    rightMount,
    s: scaleFactor,
    hold: HOLD,
    thumbPoses: THUMB,
    grip: GRIP,
    shapes: SHAPES,
    gripTransform,
    applyShape,
  };
  return hands;
}
