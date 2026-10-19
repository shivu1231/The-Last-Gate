import * as THREE from 'three';

/**
 * Hiro Hamada, procedural: a slight fourteen-year-old (about 1.58 m with the hair) in a blue-grey
 * hoodie over a red tee, dark rolled jeans and grey-and-red high-top sneakers, with the messy black
 * mop, big brown eyes and heavy brows. Soft lathed forms, jointed like a puppet:
 *
 *   root → pelvis → spine → chest → neck → head
 *                          chest → shoulder → elbow → wrist (each side)
 *          pelvis → hip → knee → ankle (each side)
 *
 * Every frame the caller writes `pose` and calls update(t). The figure keeps its own feet (or knee)
 * on the ground: after the joints are set, the lowest contact point is found and the pelvis is
 * lifted or dropped onto it, so walks bob and kneels sit down on their own.
 *
 * Built facing +Z, standing on y = 0, in metres.
 */
export type HiroPose = {
  /** Walk phase in radians (one footfall per PI) and how big the steps are (0 stand, 1 run). */
  walk: number;
  stride: number;
  /** Lean into a run (+) or back (-). */
  lean: number;
  /** Braced backwards drag, both hands forward holding something heavy. */
  haul: number;
  /** Down on the right knee, left foot planted. */
  kneel: number;
  /** Right hand forward and down (touch, take, place). */
  reach: number;
  /** Left hand forward and down. */
  reachL: number;
  /** Head turn (+ to his left) and tilt up (+ looks up). */
  look: number;
  lookUp: number;
  /** Both hands up in front of the chest, holding a device. */
  hold: number;
  /** Right fist out at shoulder height (the fist bump). */
  bump: number;
  /** Facing, radians about Y. */
  yaw: number;
};
export const hiroRest = (): HiroPose => ({
  walk: 0,
  stride: 0,
  lean: 0,
  haul: 0,
  kneel: 0,
  reach: 0,
  reachL: 0,
  look: 0,
  lookUp: 0,
  hold: 0,
  bump: 0,
  yaw: 0,
});

const LEG = { thigh: 0.37, shin: 0.35, ankle: 0.075 };
const HIP_Y = LEG.thigh + LEG.shin + LEG.ankle + 0.015;

/** Denim: a fine diagonal twill with fading, drawn once. */
function denimTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = '#ffffff';
  drawingContext.fillRect(0, 0, 128, 128);
  for (let index = -128; index < 256; index += 3) {
    drawingContext.strokeStyle = `rgba(0,0,0,${0.1 + (index % 7 === 0 ? 0.06 : 0)})`;
    drawingContext.lineWidth = 1.2;
    drawingContext.beginPath();
    drawingContext.moveTo(index, 0);
    drawingContext.lineTo(index + 128, 128);
    drawingContext.stroke();
  }
  for (let index2 = 0; index2 < 500; index2++) {
    drawingContext.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    drawingContext.fillRect(
      Math.random() * 128,
      Math.random() * 128,
      1,
      1 + Math.random() * 2,
    );
  }
  const timeSeconds = new THREE.CanvasTexture(canvas);
  timeSeconds.wrapS = timeSeconds.wrapT = THREE.RepeatWrapping;
  timeSeconds.repeat.set(3, 6);
  timeSeconds.colorSpace = THREE.SRGBColorSpace;
  return timeSeconds;
}
/** Knit: soft horizontal ribs for the hoodie's cuffs and hem, a faint fleece speckle elsewhere. */
function knitTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = '#ffffff';
  drawingContext.fillRect(0, 0, 64, 64);
  for (let index = 0; index < 400; index++) {
    drawingContext.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    drawingContext.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5);
  }
  const timeSeconds = new THREE.CanvasTexture(canvas);
  timeSeconds.wrapS = timeSeconds.wrapT = THREE.RepeatWrapping;
  timeSeconds.repeat.set(4, 4);
  timeSeconds.colorSpace = THREE.SRGBColorSpace;
  return timeSeconds;
}

/**
 * Build Hiro with reusable limb joints and authored character poses.
 */
export function createHiro() {
  const geometry: THREE.BufferGeometry[] = [],
    material: THREE.Material[] = [],
    texture: THREE.Texture[] = [];
  const geometry2 = <G extends THREE.BufferGeometry>(xPosition: G) => {
    geometry.push(xPosition);
    return xPosition;
  };
  const material2 = (material3: THREE.MeshStandardMaterialParameters) => {
    const material4 = new THREE.MeshStandardMaterial(material3);
    material.push(material4);
    return material4;
  };
  const denim = denimTexture(),
    knit = knitTexture();
  texture.push(denim, knit);

  const hoodie = material2({ color: '#56677d', roughness: 0.93, map: knit });
  const hoodieDeep = material2({
    color: '#45546a',
    roughness: 0.95,
    map: knit,
  });
  const rib = material2({ color: '#4b5b70', roughness: 0.97 });
  const tee = material2({ color: '#b3302b', roughness: 0.9 });
  const jeans = material2({ color: '#2d3a52', roughness: 0.9, map: denim });
  const jeansCuff = material2({ color: '#3d4d68', roughness: 0.9, map: denim });
  const skin = material2({ color: '#e3b28e', roughness: 0.62 });
  const skinShade = material2({ color: '#d39d7a', roughness: 0.7 });
  const hair = material2({
    color: '#121014',
    roughness: 0.55,
    metalness: 0.05,
  });
  const white = material2({ color: '#f2efe9', roughness: 0.5 });
  const iris = material2({ color: '#4a2e1c', roughness: 0.3 });
  const pupil = material2({ color: '#0b0807', roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  material.push(shine);
  const brow = material2({ color: '#17120f', roughness: 0.8 });
  const lip = material2({ color: '#b97a66', roughness: 0.7 });
  const shoeUpper = material2({ color: '#5b6068', roughness: 0.75 });
  const shoeRed = material2({ color: '#b8352d', roughness: 0.6 });
  const sole = material2({ color: '#ece7dc', roughness: 0.65 });
  const lace = material2({ color: '#f4f1ea', roughness: 0.7 });
  const string = material2({ color: '#e9e4da', roughness: 0.8 });
  const metal = material2({
    color: '#9aa1a8',
    roughness: 0.35,
    metalness: 0.8,
  });

  const add = (
    geometry3: THREE.BufferGeometry,
    material3: THREE.Material,
    parent: THREE.Object3D,
    points: [number, number, number] = [0, 0, 0],
    entries: [number, number, number] = [1, 1, 1],
    entries2: [number, number, number] = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(geometry3, material3);
    mesh.position.set(...points);
    mesh.scale.set(...entries);
    mesh.rotation.set(...entries2);
    parent.add(mesh);
    return mesh;
  };
  const joint = (
    parent: THREE.Object3D,
    xPosition: number,
    yPosition: number,
    zPosition = 0,
  ) => {
    const segmentIndex = new THREE.Group();
    segmentIndex.position.set(xPosition, yPosition, zPosition);
    parent.add(segmentIndex);
    return segmentIndex;
  };
  /** A lathed solid from a (radius, y) profile listed bottom to top. */
  const lathe = (profile: [number, number][], seg = 18) =>
    geometry2(
      new THREE.LatheGeometry(
        profile.map(
          ([radius, yPosition]) =>
            new THREE.Vector2(Math.max(radius, 0.0001), yPosition),
        ),
        seg,
      ),
    );
  /** A tapered limb hanging down from its joint: r0 at the top, r1 at the bottom, rounded ends. */
  const limb = (
    scalarValue: number,
    scalarValue2: number,
    len: number,
    seg = 14,
  ) => {
    const points: [number, number][] = [];
    for (let index = 0; index <= 5; index++) {
      const firstValue = -Math.PI / 2 + ((index / 5) * Math.PI) / 2;
      points.push([
        Math.cos(firstValue) * scalarValue2,
        -len + Math.sin(firstValue) * scalarValue2,
      ]);
    }
    for (let index2 = 0; index2 <= 5; index2++) {
      const firstValue2 = ((index2 / 5) * Math.PI) / 2;
      points.push([
        Math.cos(firstValue2) * scalarValue,
        Math.sin(firstValue2) * scalarValue,
      ]);
    }
    return lathe(points, seg);
  };
  const sphere = geometry2(new THREE.SphereGeometry(1, 22, 16));
  const lowSphere = geometry2(new THREE.SphereGeometry(1, 12, 8));
  const cyl = geometry2(new THREE.CylinderGeometry(1, 1, 1, 14));

  const root = new THREE.Group();
  root.name = 'hiro';
  root.scale.set(1.08, 1, 1.04);
  const body = new THREE.Group();
  root.add(body);
  const pelvis = joint(body, 0, HIP_Y);

  // ── Hips: jeans seat and the hoodie's ribbed hem over the waistband.
  add(sphere, jeans, pelvis, [0, -0.02, 0], [0.155, 0.1, 0.11]);
  add(
    geometry2(new THREE.CylinderGeometry(0.152, 0.158, 0.06, 20)),
    jeans,
    pelvis,
    [0, 0.02, 0],
    [1, 1, 0.72],
  );

  // ── Torso.
  const spine = joint(pelvis, 0, 0.05);
  const chest = joint(spine, 0, 0.23);
  // Lower hoodie, on the spine: hem rib, belly.
  add(
    lathe([
      [0.0, -0.13],
      [0.172, -0.13],
      [0.174, -0.08],
      [0.166, -0.06],
      [0.0, -0.04],
    ]),
    rib,
    spine,
    [0, 0, 0],
    [1, 1, 0.74],
  );
  add(
    lathe([
      [0.0, -0.07],
      [0.17, -0.07],
      [0.163, 0.02],
      [0.162, 0.1],
      [0.17, 0.2],
      [0.0, 0.26],
    ]),
    hoodie,
    spine,
    [0, 0, 0],
    [1, 1, 0.74],
  );
  // The kangaroo pocket.
  add(
    geometry2(new THREE.BoxGeometry(0.2, 0.11, 0.02)),
    hoodieDeep,
    spine,
    [0, 0.0, 0.118],
    [1, 1, 1],
    [0.02, 0, 0],
  );
  add(
    geometry2(new THREE.BoxGeometry(0.205, 0.012, 0.024)),
    rib,
    spine,
    [0, 0.055, 0.118],
  );
  // Upper hoodie, on the chest: ribcage to shoulders.
  add(
    lathe(
      [
        [0.0, -0.06],
        [0.165, -0.06],
        [0.176, 0.04],
        [0.178, 0.12],
        [0.165, 0.18],
        [0.12, 0.22],
        [0.07, 0.245],
        [0.0, 0.25],
      ],
      22,
    ),
    hoodie,
    chest,
    [0, 0, 0],
    [1.06, 1, 0.74],
  );
  // Shoulder caps, so the arms grow out of the body rather than off it.
  for (const scaleFactor of [-1, 1])
    add(
      sphere,
      hoodie,
      chest,
      [scaleFactor * 0.152, 0.17, -0.005],
      [0.066, 0.06, 0.078],
    );
  // Open zip: the red tee down the middle, zip tapes either side, the pull.
  add(
    geometry2(new THREE.BoxGeometry(0.05, 0.17, 0.01)),
    tee,
    chest,
    [0, 0.1, 0.128],
    [1, 1, 1],
    [-0.12, 0, 0],
  );
  for (const scaleFactor2 of [-1, 1])
    add(
      geometry2(new THREE.BoxGeometry(0.008, 0.22, 0.012)),
      metal,
      chest,
      [scaleFactor2 * 0.029, 0.07, 0.127],
      [1, 1, 1],
      [-0.1, 0, scaleFactor2 * 0.02],
    );
  add(
    geometry2(new THREE.BoxGeometry(0.012, 0.022, 0.006)),
    metal,
    chest,
    [0.03, -0.04, 0.13],
  );
  // The hood bunched round the neck and lying on the back.
  add(
    geometry2(new THREE.TorusGeometry(0.085, 0.035, 10, 22)),
    hoodieDeep,
    chest,
    [0, 0.235, -0.01],
    [1.15, 1, 0.95],
    [Math.PI / 2 - 0.25, 0, 0],
  );
  add(
    sphere,
    hoodieDeep,
    chest,
    [0, 0.17, -0.1],
    [0.12, 0.1, 0.05],
    [0.35, 0, 0],
  );
  // Drawstrings with their white aglets.
  for (const scaleFactor3 of [-1, 1]) {
    add(
      cyl,
      string,
      chest,
      [scaleFactor3 * 0.05, 0.13, 0.128],
      [0.004, 0.14, 0.004],
      [-0.12, 0, scaleFactor3 * 0.06],
    );
    add(
      cyl,
      white,
      chest,
      [scaleFactor3 * 0.054, 0.055, 0.136],
      [0.0055, 0.022, 0.0055],
      [-0.12, 0, 0],
    );
  }

  // ── Neck and head.
  const neck = joint(chest, 0, 0.24);
  add(limb(0.042, 0.045, 0.07, 12), skin, neck, [0, 0.05, -0.005]);
  const head = joint(neck, 0, 0.065);
  const HEAD_Y = 0.1;
  // Skull and face: a slightly long oval, the jaw narrowing toward a small chin.
  add(sphere, skin, head, [0, HEAD_Y, 0], [0.098, 0.112, 0.104]);
  add(sphere, skin, head, [0, HEAD_Y - 0.042, 0.012], [0.083, 0.075, 0.088]);
  add(sphere, skin, head, [0, HEAD_Y - 0.085, 0.055], [0.034, 0.025, 0.03]);
  // Ears.
  for (const scaleFactor4 of [-1, 1])
    add(
      sphere,
      skinShade,
      head,
      [scaleFactor4 * 0.098, HEAD_Y - 0.008, -0.005],
      [0.018, 0.03, 0.02],
      [0, scaleFactor4 * 0.3, 0],
    );
  // Nose and mouth.
  add(
    sphere,
    skinShade,
    head,
    [0, HEAD_Y - 0.032, 0.104],
    [0.013, 0.016, 0.014],
  );
  add(
    geometry2(new THREE.CapsuleGeometry(0.004, 0.024, 3, 8)),
    lip,
    head,
    [0, HEAD_Y - 0.064, 0.097],
    [1, 1, 0.6],
    [0, 0, Math.PI / 2],
  );
  // The eyes: big, wide set, brown, each with a highlight. They are what makes him read as Hiro.
  const eyes: THREE.Group[] = [];
  for (const scaleFactor5 of [-1, 1]) {
    const eye = joint(head, scaleFactor5 * 0.038, HEAD_Y + 0.002, 0.085);
    add(sphere, white, eye, [0, 0, 0], [0.022, 0.026, 0.016]);
    add(sphere, iris, eye, [0, -0.001, 0.011], [0.0145, 0.0165, 0.008]);
    add(sphere, pupil, eye, [0, -0.001, 0.0155], [0.007, 0.008, 0.004]);
    add(
      lowSphere,
      shine,
      eye,
      [scaleFactor5 * -0.004 + 0.003, 0.007, 0.019],
      [0.0035, 0.0035, 0.002],
    );
    // Upper lid line and the heavy brow above.
    add(
      geometry2(new THREE.CapsuleGeometry(0.0035, 0.036, 3, 8)),
      brow,
      eye,
      [0, 0.024, 0.01],
      [1, 1, 0.7],
      [0, 0, Math.PI / 2 + scaleFactor5 * 0.12],
    );
    add(
      geometry2(new THREE.CapsuleGeometry(0.006, 0.038, 3, 8)),
      brow,
      head,
      [scaleFactor5 * 0.04, HEAD_Y + 0.046, 0.092],
      [1, 1, 0.6],
      [0, 0, Math.PI / 2 - scaleFactor5 * 0.18],
    );
    eyes.push(eye);
  }

  // Hair: a dense black mop. A cap over the crown, back and sides, then tufts: spiky and pushed
  // back and out on top, longer at the nape, and a heavy fringe falling over the brow.
  add(sphere, hair, head, [0, HEAD_Y + 0.03, -0.014], [0.113, 0.108, 0.116]);
  add(sphere, hair, head, [0, HEAD_Y - 0.03, -0.045], [0.1, 0.085, 0.08]);
  const tuft = geometry2(new THREE.ConeGeometry(0.034, 0.1, 6, 1));
  tuft.translate(0, 0.05, 0);
  const placeTuft = (
    dir: THREE.Vector3,
    len: number,
    width: number,
    from: THREE.Vector3,
  ) => {
    const material3 = new THREE.Mesh(tuft, hair);
    material3.position.copy(from);
    material3.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    material3.scale.set(width, len, width * 0.8);
    head.add(material3);
    return material3;
  };
  const random = (() => {
    let scaleFactor6 = 77;
    return () =>
      (scaleFactor6 = (scaleFactor6 * 1664525 + 1013904223) >>> 0) / 4294967296;
  })();
  const centre = new THREE.Vector3(0, HEAD_Y + 0.02, -0.01);
  for (let index3 = 0; index3 < 80; index3++) {
    // Spread over the upper and back hemisphere, avoiding the face.
    const az = random() * Math.PI * 2,
      el = 0.1 + random() * 1.35;
    const normalVector = new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    );
    if (normalVector.z > 0.35 && normalVector.y < 0.75) continue;
    const from = normalVector.clone().multiplyScalar(0.092).add(centre);
    // Tufts flick up and back, with a messy random kick.
    const dir = normalVector
      .clone()
      .multiplyScalar(1.4)
      .add(
        new THREE.Vector3(
          (random() - 0.5) * 0.8,
          0.15 + random() * 0.3,
          -0.3 + (random() - 0.5) * 0.4,
        ),
      );
    placeTuft(
      dir,
      0.32 + random() * 0.38 + (normalVector.y > 0.8 ? 0.1 : 0),
      1.05 + random() * 0.55,
      from.addScaledVector(normalVector, -0.012),
    );
  }
  // Nape and sides over the ears: shorter, pointing down and out.
  for (let index4 = 0; index4 < 12; index4++) {
    const az = Math.PI * (0.35 + (index4 / 11) * 1.3),
      normalVector2 = new THREE.Vector3(Math.sin(az), -0.15, Math.cos(az));
    placeTuft(
      normalVector2.clone().add(new THREE.Vector3(0, -0.9, 0)),
      0.35 + random() * 0.3,
      0.8,
      normalVector2
        .clone()
        .multiplyScalar(0.095)
        .add(new THREE.Vector3(0, HEAD_Y - 0.01, -0.01)),
    );
  }
  // The fringe: five heavy locks falling forward and down across the forehead, swept to his right.
  for (let index5 = 0; index5 < 6; index5++) {
    const xPosition2 = -0.06 + index5 * 0.024,
      from = new THREE.Vector3(
        xPosition2,
        HEAD_Y + 0.085,
        0.04 + (1 - Math.abs(xPosition2) / 0.07) * 0.02,
      );
    placeTuft(
      new THREE.Vector3(0.25 + xPosition2 * 2, -0.55, 1),
      0.55 + random() * 0.25,
      0.85,
      from,
    );
  }

  // ── Arms.
  const arms: {
    shoulder: THREE.Group;
    elbow: THREE.Group;
    wrist: THREE.Group;
    fingers: THREE.Group;
  }[] = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(chest, side * 0.175, 0.17);
    add(limb(0.055, 0.047, 0.26), hoodie, shoulder);
    const elbow = joint(shoulder, 0, -0.27);
    add(limb(0.047, 0.042, 0.2), hoodie, elbow);
    // Ribbed cuff pushed up a little at the wrist.
    add(
      geometry2(new THREE.CylinderGeometry(0.04, 0.036, 0.045, 14)),
      rib,
      elbow,
      [0, -0.215, 0],
    );
    const wrist = joint(elbow, 0, -0.245);
    add(limb(0.024, 0.024, 0.02, 10), skin, wrist, [0, 0.012, 0]);
    // Hand: palm block, a thumb, four fingers as one curled mitten (enough at third-person range).
    add(sphere, skin, wrist, [0, -0.045, 0.004], [0.024, 0.042, 0.014]);
    const fingers = joint(wrist, 0, -0.08);
    add(
      geometry2(new THREE.CapsuleGeometry(0.0125, 0.03, 4, 8)),
      skin,
      fingers,
      [0, -0.018, 0],
      [1.75, 1, 0.9],
    );
    add(
      geometry2(new THREE.CapsuleGeometry(0.0095, 0.03, 4, 8)),
      skin,
      wrist,
      [side * -0.02, -0.05, 0.016],
      [1, 1, 1],
      [0.5, 0, side * 0.5],
    );
    arms.push({ shoulder, elbow, wrist, fingers });
  }

  // ── Legs.
  const legs: {
    hip: THREE.Group;
    knee: THREE.Group;
    ankle: THREE.Group;
    heel: THREE.Object3D;
    toe: THREE.Object3D;
    cap: THREE.Object3D;
  }[] = [];
  for (const side of [-1, 1]) {
    const hip = joint(pelvis, side * 0.085, -0.015);
    add(limb(0.078, 0.056, LEG.thigh), jeans, hip);
    const knee = joint(hip, 0, -LEG.thigh);
    add(limb(0.056, 0.047, LEG.shin), jeans, knee);
    // The rolled cuff above the high-top.
    add(
      geometry2(new THREE.CylinderGeometry(0.056, 0.054, 0.04, 16)),
      jeansCuff,
      knee,
      [0, -LEG.shin + 0.06, 0],
    );
    const ankle = joint(knee, 0, -LEG.shin);
    // High-top sneaker: ankle collar, upper, red side panel, white toe cap and sole, laces.
    add(
      geometry2(new THREE.CylinderGeometry(0.05, 0.052, 0.075, 16)),
      shoeUpper,
      ankle,
      [0, -0.012, -0.004],
    );
    add(sphere, shoeUpper, ankle, [0, -0.042, 0.045], [0.05, 0.036, 0.1]);
    add(
      sphere,
      shoeRed,
      ankle,
      [side * 0.006, -0.04, 0.02],
      [0.052, 0.03, 0.07],
    );
    add(sphere, white, ankle, [0, -0.052, 0.118], [0.045, 0.026, 0.042]);
    add(
      geometry2(new THREE.BoxGeometry(0.098, 0.028, 0.21)),
      sole,
      ankle,
      [0, -0.07, 0.04],
    );
    add(sphere, sole, ankle, [0, -0.07, 0.14], [0.049, 0.014, 0.035]);
    add(sphere, sole, ankle, [0, -0.07, -0.065], [0.049, 0.014, 0.03]);
    for (let index6 = 0; index6 < 4; index6++)
      add(
        geometry2(new THREE.BoxGeometry(0.05, 0.005, 0.008)),
        lace,
        ankle,
        [0, -0.01 - index6 * 0.012 + 0.02, 0.05 + index6 * 0.016],
        [1, 1, 1],
        [0.5, 0, 0],
      );
    // Contact points for the ground solve.
    const heel = joint(ankle, 0, -0.084, -0.08),
      toe = joint(ankle, 0, -0.084, 0.16),
      cap = joint(knee, 0, 0, 0);
    legs.push({ hip, knee, ankle, heel, toe, cap });
  }
  root.traverse((sceneObject) => {
    if (sceneObject instanceof THREE.Mesh) {
      sceneObject.castShadow = true;
      sceneObject.receiveShadow = true;
    }
  });

  const pose = hiroRest();
  const scratchVector = new THREE.Vector3(),
    transformMatrix = new THREE.Matrix4();
  let blinkAt = 2.2;
  return {
    root,
    pose,
    /** World position of the right hand's grip. */
    handWorld: (out = new THREE.Vector3()) =>
      arms[1].fingers.getWorldPosition(out),
    /** World position of the left hand's grip. */
    leftHandWorld: (out = new THREE.Vector3()) =>
      arms[0].fingers.getWorldPosition(out),
    headWorld: (out = new THREE.Vector3()) =>
      head.localToWorld(out.set(0, HEAD_Y, 0)),
    /** Joints, for anything that needs to attach to him (a device in his hand). */
    joints: { pelvis, spine, chest, neck, head, arms, legs },
    update(timeSeconds = performance.now() / 1000) {
      const pose2 = pose;
      const kneel = pose2.kneel,
        haul = pose2.haul,
        hold = pose2.hold,
        bump = pose2.bump;
      const breathe = Math.sin(timeSeconds * 1.7) * (1 - pose2.stride);
      root.rotation.y = pose2.yaw;

      // Torso: lean into the run, back on the drag, upright over the knee; a breath; walk twist.
      const sw = Math.sin(pose2.walk) * pose2.stride;
      spine.rotation.set(
        pose2.lean * 0.25 - haul * 0.32 + kneel * 0.1 + breathe * 0.01,
        -sw * 0.12,
        0,
      );
      chest.rotation.set(
        pose2.lean * 0.18 - haul * 0.18 + kneel * 0.05 - breathe * 0.015,
        -sw * 0.1,
        0,
      );
      pelvis.rotation.set(
        -haul * 0.1,
        sw * 0.14,
        Math.cos(pose2.walk) * pose2.stride * 0.04,
      );
      neck.rotation.set(
        -pose2.lookUp * 0.3 + haul * 0.25 - pose2.lean * 0.2 + kneel * 0.05,
        pose2.look * 0.7,
        0,
      );
      head.rotation.set(-pose2.lookUp * 0.35 + haul * 0.1, pose2.look * 0.4, 0);
      // Blink every few seconds.
      if (timeSeconds > blinkAt + 0.12)
        blinkAt = timeSeconds + 2 + ((timeSeconds * 7.13) % 1) * 3;
      const lid =
        timeSeconds > blinkAt && timeSeconds < blinkAt + 0.12 ? 0.1 : 1;
      eyes.forEach((group) => {
        group.scale.y = lid;
      });

      // Legs: a walk cycle (thigh swings, the knee folds through the swing, toes lift at heel
      // strike), the braced drag, and the kneel (right knee down, left foot planted forward).
      legs.forEach(({ hip, knee, ankle }, index) => {
        const ph = pose2.walk + (index === 0 ? 0 : Math.PI),
          firstValue = pose2.stride;
        const thigh = -Math.sin(ph) * 0.5 * firstValue;
        const fold =
          Math.max(0, Math.cos(ph)) * 1.0 * firstValue + 0.08 * firstValue;
        const kneeling =
          index === 1
            ? { hip: 0.12, knee: 1.75, ankle: -0.65 }
            : { hip: -1.45, knee: 1.5, ankle: -0.05 };
        hip.rotation.x = THREE.MathUtils.lerp(
          thigh - haul * 0.45,
          kneeling.hip,
          kneel,
        );
        hip.rotation.z =
          (index === 0 ? -1 : 1) * (0.03 + kneel * (index === 0 ? 0.12 : 0.02));
        knee.rotation.x = THREE.MathUtils.lerp(
          fold + haul * 0.55,
          kneeling.knee,
          kneel,
        );
        ankle.rotation.x = THREE.MathUtils.lerp(
          -Math.max(0, Math.sin(ph)) * 0.3 * firstValue -
            haul * 0.15 +
            (fold - 0.08 * firstValue) * -0.2,
          kneeling.ankle,
          kneel,
        );
      });

      // Arms: hanging relaxed with a little bend, swinging against the legs; the drag, the hold,
      // the reaches and the bump layered on top.
      arms.forEach(({ shoulder, elbow, wrist, fingers }, index) => {
        const state = index === 0 ? -1 : 1,
          ph = pose2.walk + (index === 0 ? Math.PI : 0);
        const reach = index === 1 ? pose2.reach : pose2.reachL,
          bmp = index === 1 ? bump : 0;
        const swing =
          Math.sin(ph) * 0.55 * pose2.stride * (1 - haul) * (1 - hold);
        let scaleX =
          -swing -
          haul * 1.25 -
          hold * 0.55 -
          reach * (1.05 - kneel * 0.25) -
          bmp * 1.45 -
          kneel * 0.15;
        const scaleZ =
          state *
          (0.1 + breathe * 0.01 + haul * 0.05 - hold * 0.12 + reach * 0.05);
        let ex =
          -0.22 -
          pose2.stride * 0.55 -
          hold * 1.45 -
          haul * 0.2 +
          reach * 0.1 -
          bmp * 0.25;
        if (kneel > 0 && index === 0 && reach === 0) {
          scaleX -= kneel * 0.2;
          ex -= kneel * 0.55;
        } // left forearm resting on the raised knee
        shoulder.rotation.set(scaleX, 0, scaleZ);
        shoulder.rotation.y = state * (hold * 0.35 + haul * 0.1);
        elbow.rotation.set(ex, 0, 0);
        elbow.rotation.y = -state * hold * 0.5;
        wrist.rotation.set(hold * 0.4 + bmp * 0.2, 0, state * hold * 0.3);
        fingers.rotation.x = -0.35 - (bmp + haul + hold) * 0.9;
      });

      // Ground: drop or lift the pelvis until his lowest contact (heel, toe or kneeling knee) is on y = 0.
      pelvis.position.y = HIP_Y;
      body.position.y = 0;
      root.updateMatrixWorld(true);
      transformMatrix.copy(root.matrixWorld).invert();
      let low = Infinity;
      for (const group2 of legs)
        for (const sceneObject of [group2.heel, group2.toe, group2.cap]) {
          sceneObject
            .getWorldPosition(scratchVector)
            .applyMatrix4(transformMatrix);
          low = Math.min(
            low,
            scratchVector.y - (sceneObject === group2.cap ? 0.056 : 0),
          );
        }
      body.position.y = -low;
      // Haul: hips sit back behind the feet.
      body.position.z = -haul * 0.1 - kneel * 0.05;
    },
    dispose() {
      geometry.forEach((geometry3) => geometry3.dispose());
      material.forEach((material3) => material3.dispose());
      texture.forEach((texture2) => texture2.dispose());
      root.removeFromParent();
    },
  };
}
/**
 * Data contract used by character geometry and posing.
 */
export type Hiro = ReturnType<typeof createHiro>;
