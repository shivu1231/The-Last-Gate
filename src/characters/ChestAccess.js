import * as THREE from 'three';
import { chipOutline, CHIP_W, CHIP_H, CHIP_KEY } from './RedChip.js';

const ease = (inputValue) => {
  inputValue = Math.max(0, Math.min(1, inputValue));
  return inputValue * inputValue * (3 - 2 * inputValue);
};
const span = (inputValue, startValue, endValue) =>
  ease((inputValue - startValue) / (endValue - startValue));
const OUTER = 0.235,
  CAVITY = 0.196,
  DEPTH = 0.15;

/**
 * Baymax's medical access bay. Hierarchy, outermost first:
 *   OUTER  soft white collar + four iris petals that retract behind the shell
 *   MID    neutral grey mounting ring, three struts, carrier plate
 *   CORE   keyed dock whose outline repeats the chip's silhouette
 *   DETAIL broken ring traces, logic LEDs, black connector accents
 * The cavity is real depth: while the bay is open, Baymax's skin shader discards the fragments
 * inside the bay's cylinder (see BaymaxController), so the internals show through.
 * Local frame: origin on the shell surface, +Z out of the body.
 */
export function createChestAccess(skin) {
  const root = new THREE.Group();
  root.name = 'chest-access';
  const inner = new THREE.Group();
  inner.name = 'chest-internals';
  root.add(inner);
  const add = (
    geometry,
    material,
    parent = inner,
    xPosition = 0,
    yPosition = 0,
    zPosition = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(xPosition, yPosition, zPosition);
    parent.add(mesh);
    return mesh;
  };
  const housing = new THREE.MeshStandardMaterial({
    color: '#e6e1d7',
    roughness: 0.5,
    metalness: 0.02,
    envMapIntensity: 0.55,
  });
  const grey = new THREE.MeshStandardMaterial({
    color: '#8f989e',
    roughness: 0.34,
    metalness: 0.62,
    envMapIntensity: 0.9,
  });
  const greyMatte = new THREE.MeshStandardMaterial({
    color: '#5d666d',
    roughness: 0.62,
    metalness: 0.3,
    envMapIntensity: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#0b0f13',
    roughness: 0.4,
    metalness: 0.5,
    envMapIntensity: 0.3,
  });
  const cavityMat = new THREE.MeshStandardMaterial({
    color: '#1f262b',
    roughness: 0.7,
    metalness: 0.25,
    side: THREE.BackSide,
    envMapIntensity: 0.35,
  });
  // Light-emitting internals are opaque and fade by brightness: transparent objects would draw
  // after the depth mask and vanish inside the bay.
  const glowing = (hex, level = 1) => {
    const material = new THREE.MeshBasicMaterial({
      color: hex,
      toneMapped: false,
    });
    material.userData.base = new THREE.Color(hex).multiplyScalar(level);
    material.color.setRGB(0, 0, 0);
    return material;
  };
  const setGlow = (mesh, key) =>
    mesh.color.copy(mesh.userData.base).multiplyScalar(Math.max(0, key));
  const logic = glowing('#bfe9ff', 1.4),
    rails = glowing('#bfe9ff', 1.2),
    traceMat = glowing('#6fb6d8', 0.8),
    redLogic = glowing('#ff2f22', 1.6);
  const seamMat = new THREE.MeshBasicMaterial({
    color: '#cdefff',
    toneMapped: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  // --- Cavity: walls and floor.
  const wall = add(
    new THREE.CylinderGeometry(CAVITY, CAVITY * 0.93, DEPTH, 48, 1, true),
    cavityMat,
    inner,
    0,
    0,
    -DEPTH / 2,
  );
  wall.rotation.x = Math.PI / 2;
  add(
    new THREE.CircleGeometry(CAVITY * 0.94, 48),
    greyMatte,
    inner,
    0,
    0,
    -DEPTH + 0.001,
  );
  // --- MID: mounting ring, struts, carrier.
  const ring = add(
    new THREE.TorusGeometry(0.168, 0.009, 10, 64),
    grey,
    inner,
    0,
    0,
    -0.118,
  );
  for (let index = 0; index < 3; index++) {
    const firstValue = Math.PI / 2 + (index * Math.PI * 2) / 3,
      strut = add(
        new THREE.BoxGeometry(0.075, 0.014, 0.02),
        greyMatte,
        inner,
        Math.cos(firstValue) * 0.15,
        Math.sin(firstValue) * 0.15,
        -0.11,
      );
    strut.rotation.z = firstValue;
    add(
      new THREE.BoxGeometry(0.014, 0.022, 0.012),
      dark,
      inner,
      Math.cos(firstValue) * 0.182,
      Math.sin(firstValue) * 0.182,
      -0.098,
    ).rotation.z = firstValue;
  }
  const carrier = new THREE.Group();
  carrier.name = 'carrier';
  inner.add(carrier);
  carrier.position.z = -0.098;
  const plate = new THREE.Shape();
  plate.absarc(0, 0, 0.142, 0, Math.PI * 2, false);
  const plateHole = new THREE.Path();
  plateHole.setFromPoints(
    chipOutline(CHIP_W + 0.024, CHIP_H + 0.024, CHIP_KEY + 0.008, 0.016)
      .getPoints(6)
      .reverse(),
  );
  plate.holes.push(plateHole);
  add(
    new THREE.ExtrudeGeometry(plate, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
      curveSegments: 32,
    }),
    grey,
    carrier,
  );
  // --- CORE: the keyed dock. Its outline is the chip's outline.
  const dock = new THREE.Group();
  dock.name = 'dock';
  inner.add(dock);
  dock.position.z = -0.072;
  const frame = chipOutline(
    CHIP_W + 0.03,
    CHIP_H + 0.03,
    CHIP_KEY + 0.012,
    0.018,
  );
  const frameHole = new THREE.Path();
  frameHole.setFromPoints(
    chipOutline(CHIP_W + 0.008, CHIP_H + 0.008, CHIP_KEY + 0.003, 0.014)
      .getPoints(6)
      .reverse(),
  );
  frame.holes.push(frameHole);
  add(
    new THREE.ExtrudeGeometry(frame, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.0018,
      bevelSize: 0.0018,
      bevelSegments: 2,
      curveSegments: 6,
    }),
    grey,
    dock,
    0,
    0,
    -0.004,
  );
  add(
    new THREE.ShapeGeometry(
      chipOutline(CHIP_W + 0.008, CHIP_H + 0.008, CHIP_KEY + 0.003, 0.014),
    ),
    dark,
    dock,
    0,
    0,
    -0.012,
  );
  const contactGeo = new THREE.PlaneGeometry(0.011, 0.02);
  for (let index2 = 0; index2 < 7; index2++)
    add(contactGeo, logic, dock, -0.054 + index2 * 0.018, -0.082, -0.0105);
  for (const xPosition2 of [-1, 1])
    add(
      new THREE.PlaneGeometry(0.003, CHIP_H * 0.72),
      rails,
      dock,
      xPosition2 * (CHIP_W / 2 + 0.0105),
      0,
      0.0125,
    );
  // The key corner answers the chip's chamfer with a lit triangle: shape language, not arrows.
  const keyShape = new THREE.Shape();
  keyShape.moveTo(0, 0);
  keyShape.lineTo(-0.024, 0);
  keyShape.lineTo(0, -0.024);
  keyShape.closePath();
  const keyMark = add(
    new THREE.ShapeGeometry(keyShape),
    rails,
    dock,
    CHIP_W / 2 + 0.012,
    CHIP_H / 2 - CHIP_KEY + 0.012,
    0.0127,
  );
  keyMark.rotation.z = Math.PI / 4 + Math.PI / 2;
  // --- DETAIL: broken ring traces, LEDs, connectors. Organised, never cluttered.
  for (let index3 = 0; index3 < 5; index3++)
    add(
      new THREE.RingGeometry(
        0.176,
        0.1785,
        40,
        1,
        index3 * Math.PI * 0.4 + 0.08,
        Math.PI * 0.29,
      ),
      traceMat,
      inner,
      0,
      0,
      -0.0895,
    );
  const leds = [];
  for (let index4 = 0; index4 < 12; index4++) {
    const firstValue2 = (index4 / 12) * Math.PI * 2 + 0.13;
    leds.push(
      add(
        new THREE.PlaneGeometry(0.0065, 0.0065),
        logic.clone(),
        inner,
        Math.cos(firstValue2) * 0.159,
        Math.sin(firstValue2) * 0.159,
        -0.083,
      ),
    );
  }
  for (let index5 = 0; index5 < 6; index5++) {
    const firstValue3 = (index5 / 6) * Math.PI * 2 + 0.5;
    add(
      new THREE.BoxGeometry(0.012, 0.006, 0.01),
      dark,
      inner,
      Math.cos(firstValue3) * 0.188,
      Math.sin(firstValue3) * 0.188,
      -0.06,
    ).rotation.z = firstValue3;
  }
  for (const side of [-1, 1]) {
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.09, -0.11, -0.1),
      new THREE.Vector3(side * 0.135, -0.12, -0.13),
      new THREE.Vector3(side * 0.16, -0.06, -0.14),
    ]);
    add(new THREE.TubeGeometry(cable, 12, 0.0042, 6, false), greyMatte);
  }
  // Own material per trace: Material.clone() JSON-copies userData, turning the base Color into a
  // hex number and the glow into NaN, which bloom then spreads across the whole frame.
  const redTraces = [];
  for (let index6 = 0; index6 < 6; index6++) {
    const firstValue4 = -Math.PI / 2 + (index6 - 2.5) * 0.42,
      len = 0.06 + (index6 % 2) * 0.025;
    const tr = add(
      new THREE.PlaneGeometry(0.0028, len),
      glowing('#ff2f22', 1.6),
      inner,
      Math.cos(firstValue4) * (0.115 + len / 2),
      Math.sin(firstValue4) * (0.115 + len / 2),
      -0.0885,
    );
    tr.rotation.z = firstValue4 - Math.PI / 2;
    redTraces.push(tr);
  }
  inner.traverse((sceneObject) => {
    if (sceneObject.isMesh) {
      sceneObject.castShadow = false;
      sceneObject.receiveShadow = true;
    }
  });

  // --- OUTER: collar skirt fills the curve of the shell, petals iris shut over the bay.
  const collar = new THREE.Group();
  root.add(collar);
  const skirt = add(
    new THREE.CylinderGeometry(OUTER, OUTER + 0.012, 0.07, 64, 1, true),
    housing,
    collar,
    0,
    0,
    -0.03,
  );
  skirt.rotation.x = Math.PI / 2;
  add(
    new THREE.TorusGeometry(OUTER - 0.018, 0.019, 14, 72),
    housing,
    collar,
    0,
    0,
    0.002,
  ).scale.z = 0.42;
  add(
    new THREE.TorusGeometry(CAVITY + 0.004, 0.0035, 8, 72),
    grey,
    collar,
    0,
    0,
    0.006,
  );
  const seam = add(
    new THREE.TorusGeometry(CAVITY * 0.985, 0.0022, 6, 80),
    seamMat,
    collar,
    0,
    0,
    0.0135,
  );
  const petals = [];
  // Three leaves: reads as an aperture, never a reticle.
  const LEAF = (Math.PI * 2) / 3;
  for (let index7 = 0; index7 < 3; index7++) {
    const pivot = new THREE.Group();
    collar.add(pivot);
    const petal = new THREE.Mesh(
      new THREE.CylinderGeometry(
        CAVITY + 0.006,
        CAVITY + 0.006,
        0.014,
        32,
        1,
        false,
        index7 * LEAF + 0.0035,
        LEAF - 0.007,
      ),
      skin || housing,
    );
    petal.rotation.x = Math.PI / 2;
    petal.position.z = 0.004;
    pivot.add(petal);
    // Cylinder theta maps to screen angle theta-90deg once the axis is turned toward +Z.
    const firstValue5 = index7 * LEAF,
      border = firstValue5 - Math.PI / 2,
      mid = firstValue5 - Math.PI / 2 + LEAF / 2;
    const gap = new THREE.Mesh(
      new THREE.PlaneGeometry(0.0028, CAVITY * 0.96),
      seamMat,
    );
    gap.position.set(
      Math.cos(border) * CAVITY * 0.49,
      Math.sin(border) * CAVITY * 0.49,
      0.0118,
    );
    gap.rotation.z = border - Math.PI / 2;
    pivot.add(gap);
    petals.push({
      pivot,
      dir: new THREE.Vector2(Math.cos(mid), Math.sin(mid)),
    });
  }
  collar.traverse((sceneObject) => {
    if (sceneObject.isMesh) {
      sceneObject.castShadow = false;
      sceneObject.receiveShadow = true;
    }
  });
  const light = new THREE.PointLight('#cdeeff', 0, 1.4, 2);
  light.position.set(0, 0.05, 0.34);
  root.add(light);
  const dockWorld = new THREE.Vector3(),
    seatLocal = new THREE.Vector3(0, 0, -0.072);
  const blue = new THREE.Color('#cdeeff'),
    red = new THREE.Color('#ff3524'),
    color = new THREE.Color();

  const state = { hole: false };
  return {
    root,
    dock,
    seatLocal,
    CAVITY,
    /** True while the shell should be cut open over the bay. */
    get holeOpen() {
      return state.hole;
    },
    /** Socket centre in world space, for chip guidance and camera framing. */
    dockWorld() {
      return dock.localToWorld(dockWorld.set(0, 0, 0));
    },
    update({
      t: timeSeconds,
      open = 0,
      align = 0,
      seated = 0,
      seal = 0,
      red: corruption = 0,
      seamGlow = 0,
    }) {
      // open: 0..4.6 authored seconds of the reveal; seal: 0..1 closes it again.
      const pop = span(open, 0.7, 0.95) - span(open, 0.95, 1.25),
        iris = span(open, 1.2, 2.65) * (1 - ease(seal * 1.15));
      const lights = span(open, 1.55, 3.1) * (1 - ease((seal - 0.35) * 2.5));
      petals.forEach((point, index8) => {
        point.pivot.position.set(
          point.dir.x * iris * 0.2,
          point.dir.y * iris * 0.2,
          pop * 0.008 - iris * 0.045,
        );
        point.pivot.rotation.z = iris * 0.5;
      });
      const visible = open > 0.65 || (seal < 1 && seal > 0);
      inner.visible = visible;
      state.hole = visible && iris > 0.01;
      dock.position.z = -0.072 + span(open, 2.6, 3.4) * 0.018 - seated * 0.004;
      setGlow(logic, lights * (0.55 + align * 0.45));
      setGlow(rails, lights * (0.25 + align * 0.75) * (1 - seated));
      setGlow(traceMat, lights * 0.75);
      leds.forEach((led, index8) => {
        const blendFactor =
          lights *
          ease((open - 1.7 - index8 * 0.09) * 4) *
          (0.5 + 0.5 * Math.sin(timeSeconds * 2.3 + index8 * 0.8) ** 2);
        led.material.color
          .copy(color.copy(blue).lerp(red, corruption))
          .multiplyScalar(blendFactor * 1.4);
      });
      redTraces.forEach((tr, index8) => {
        const blendFactor = ease(seated * 3 - index8 * 0.35) * (1 - seal * 0.6);
        tr.visible = blendFactor > 0.01;
        setGlow(tr.material, blendFactor);
      });
      // The seam reads first, before anything moves; later it carries the corruption outward.
      seamMat.opacity = Math.max(
        span(open, 0.05, 0.55) * (1 - span(open, 1.25, 1.6)),
        seamGlow,
      );
      seamMat.color.copy(color.copy(blue).lerp(red, corruption));
      light.color.copy(
        color.copy(blue).lerp(red, Math.max(corruption, seated * 0.25)),
      );
      light.intensity =
        lights * (0.22 + align * 0.3) +
        seamGlow * 0.35 +
        seated * 0.3 * (1 - seal);
    },
  };
}
