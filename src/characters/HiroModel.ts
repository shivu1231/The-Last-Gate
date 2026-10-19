import * as T from 'three';

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
  walk: number; stride: number;
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
  look: number; lookUp: number;
  /** Both hands up in front of the chest, holding a device. */
  hold: number;
  /** Right fist out at shoulder height (the fist bump). */
  bump: number;
  /** Facing, radians about Y. */
  yaw: number;
};
export const hiroRest = (): HiroPose => ({ walk: 0, stride: 0, lean: 0, haul: 0, kneel: 0, reach: 0, reachL: 0, look: 0, lookUp: 0, hold: 0, bump: 0, yaw: 0 });

const LEG = { thigh: .37, shin: .35, ankle: .075 };
const HIP_Y = LEG.thigh + LEG.shin + LEG.ankle + .015;

/** Denim: a fine diagonal twill with fading, drawn once. */
function denimTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 256; i += 3) { x.strokeStyle = `rgba(0,0,0,${.1 + (i % 7 === 0 ? .06 : 0)})`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); }
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .12})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1 + Math.random() * 2); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 6); t.colorSpace = T.SRGBColorSpace; return t;
}
/** Knit: soft horizontal ribs for the hoodie's cuffs and hem, a faint fleece speckle elsewhere. */
function knitTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * .06})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = T.SRGBColorSpace; return t;
}

export function createHiro() {
  const geos: T.BufferGeometry[] = [], mats: T.Material[] = [], texes: T.Texture[] = [];
  const g = <G extends T.BufferGeometry>(x: G) => { geos.push(x); return x; };
  const mat = (o: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(o); mats.push(m); return m; };
  const denim = denimTexture(), knit = knitTexture(); texes.push(denim, knit);

  const hoodie = mat({ color: '#56677d', roughness: .93, map: knit });
  const hoodieDeep = mat({ color: '#45546a', roughness: .95, map: knit });
  const rib = mat({ color: '#4b5b70', roughness: .97 });
  const tee = mat({ color: '#b3302b', roughness: .9 });
  const jeans = mat({ color: '#2d3a52', roughness: .9, map: denim });
  const jeansCuff = mat({ color: '#3d4d68', roughness: .9, map: denim });
  const skin = mat({ color: '#e3b28e', roughness: .62 });
  const skinShade = mat({ color: '#d39d7a', roughness: .7 });
  const hair = mat({ color: '#121014', roughness: .55, metalness: .05 });
  const white = mat({ color: '#f2efe9', roughness: .5 });
  const iris = mat({ color: '#4a2e1c', roughness: .3 });
  const pupil = mat({ color: '#0b0807', roughness: .2 });
  const shine = new T.MeshBasicMaterial({ color: '#ffffff' }); mats.push(shine);
  const brow = mat({ color: '#17120f', roughness: .8 });
  const lip = mat({ color: '#b97a66', roughness: .7 });
  const shoeUpper = mat({ color: '#5b6068', roughness: .75 });
  const shoeRed = mat({ color: '#b8352d', roughness: .6 });
  const sole = mat({ color: '#ece7dc', roughness: .65 });
  const lace = mat({ color: '#f4f1ea', roughness: .7 });
  const string = mat({ color: '#e9e4da', roughness: .8 });
  const metal = mat({ color: '#9aa1a8', roughness: .35, metalness: .8 });

  const add = (geo: T.BufferGeometry, m: T.Material, parent: T.Object3D, p: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]) => {
    const mesh = new T.Mesh(geo, m); mesh.position.set(...p); mesh.scale.set(...s); mesh.rotation.set(...r); parent.add(mesh); return mesh;
  };
  const joint = (parent: T.Object3D, x: number, y: number, z = 0) => { const j = new T.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  /** A lathed solid from a (radius, y) profile listed bottom to top. */
  const lathe = (profile: [number, number][], seg = 18) => g(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(Math.max(r, .0001), y)), seg));
  /** A tapered limb hanging down from its joint: r0 at the top, r1 at the bottom, rounded ends. */
  const limb = (r0: number, r1: number, len: number, seg = 14) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI / 2; pts.push([Math.cos(a) * r1, -len + Math.sin(a) * r1]); }
    for (let i = 0; i <= 5; i++) { const a = i / 5 * Math.PI / 2; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
    return lathe(pts, seg);
  };
  const sphere = g(new T.SphereGeometry(1, 22, 16));
  const lowSphere = g(new T.SphereGeometry(1, 12, 8));
  const cyl = g(new T.CylinderGeometry(1, 1, 1, 14));

  const root = new T.Group(); root.name = 'hiro'; root.scale.set(1.08, 1, 1.04);
  const body = new T.Group(); root.add(body);
  const pelvis = joint(body, 0, HIP_Y);

  // ── Hips: jeans seat and the hoodie's ribbed hem over the waistband.
  add(sphere, jeans, pelvis, [0, -.02, 0], [.155, .1, .11]);
  add(g(new T.CylinderGeometry(.152, .158, .06, 20)), jeans, pelvis, [0, .02, 0], [1, 1, .72]);

  // ── Torso.
  const spine = joint(pelvis, 0, .05);
  const chest = joint(spine, 0, .23);
  // Lower hoodie, on the spine: hem rib, belly.
  add(lathe([[.0, -.13], [.172, -.13], [.174, -.08], [.166, -.06], [.0, -.04]]), rib, spine, [0, 0, 0], [1, 1, .74]);
  add(lathe([[.0, -.07], [.17, -.07], [.163, .02], [.162, .1], [.17, .2], [.0, .26]]), hoodie, spine, [0, 0, 0], [1, 1, .74]);
  // The kangaroo pocket.
  add(g(new T.BoxGeometry(.2, .11, .02)), hoodieDeep, spine, [0, .0, .118], [1, 1, 1], [.02, 0, 0]);
  add(g(new T.BoxGeometry(.205, .012, .024)), rib, spine, [0, .055, .118]);
  // Upper hoodie, on the chest: ribcage to shoulders.
  add(lathe([[.0, -.06], [.165, -.06], [.176, .04], [.178, .12], [.165, .18], [.12, .22], [.07, .245], [.0, .25]], 22), hoodie, chest, [0, 0, 0], [1.06, 1, .74]);
  // Shoulder caps, so the arms grow out of the body rather than off it.
  for (const s of [-1, 1]) add(sphere, hoodie, chest, [s * .152, .17, -.005], [.066, .06, .078]);
  // Open zip: the red tee down the middle, zip tapes either side, the pull.
  add(g(new T.BoxGeometry(.05, .17, .01)), tee, chest, [0, .1, .128], [1, 1, 1], [-.12, 0, 0]);
  for (const s of [-1, 1]) add(g(new T.BoxGeometry(.008, .22, .012)), metal, chest, [s * .029, .07, .127], [1, 1, 1], [-.1, 0, s * .02]);
  add(g(new T.BoxGeometry(.012, .022, .006)), metal, chest, [.03, -.04, .13]);
  // The hood bunched round the neck and lying on the back.
  add(g(new T.TorusGeometry(.085, .035, 10, 22)), hoodieDeep, chest, [0, .235, -.01], [1.15, 1, .95], [Math.PI / 2 - .25, 0, 0]);
  add(sphere, hoodieDeep, chest, [0, .17, -.1], [.12, .1, .05], [.35, 0, 0]);
  // Drawstrings with their white aglets.
  for (const s of [-1, 1]) {
    add(cyl, string, chest, [s * .05, .13, .128], [.004, .14, .004], [-.12, 0, s * .06]);
    add(cyl, white, chest, [s * .054, .055, .136], [.0055, .022, .0055], [-.12, 0, 0]);
  }

  // ── Neck and head.
  const neck = joint(chest, 0, .24);
  add(limb(.042, .045, .07, 12), skin, neck, [0, .05, -.005]);
  const head = joint(neck, 0, .065);
  const HEAD_Y = .1;
  // Skull and face: a slightly long oval, the jaw narrowing toward a small chin.
  add(sphere, skin, head, [0, HEAD_Y, 0], [.098, .112, .104]);
  add(sphere, skin, head, [0, HEAD_Y - .042, .012], [.083, .075, .088]);
  add(sphere, skin, head, [0, HEAD_Y - .085, .055], [.034, .025, .03]);
  // Ears.
  for (const s of [-1, 1]) add(sphere, skinShade, head, [s * .098, HEAD_Y - .008, -.005], [.018, .03, .02], [0, s * .3, 0]);
  // Nose and mouth.
  add(sphere, skinShade, head, [0, HEAD_Y - .032, .104], [.013, .016, .014]);
  add(g(new T.CapsuleGeometry(.004, .024, 3, 8)), lip, head, [0, HEAD_Y - .064, .097], [1, 1, .6], [0, 0, Math.PI / 2]);
  // The eyes: big, wide set, brown, each with a highlight. They are what makes him read as Hiro.
  const eyes: T.Group[] = [];
  for (const s of [-1, 1]) {
    const eye = joint(head, s * .038, HEAD_Y + .002, .085);
    add(sphere, white, eye, [0, 0, 0], [.022, .026, .016]);
    add(sphere, iris, eye, [0, -.001, .011], [.0145, .0165, .008]);
    add(sphere, pupil, eye, [0, -.001, .0155], [.007, .008, .004]);
    add(lowSphere, shine, eye, [s * -.004 + .003, .007, .019], [.0035, .0035, .002]);
    // Upper lid line and the heavy brow above.
    add(g(new T.CapsuleGeometry(.0035, .036, 3, 8)), brow, eye, [0, .024, .01], [1, 1, .7], [0, 0, Math.PI / 2 + s * .12]);
    add(g(new T.CapsuleGeometry(.006, .038, 3, 8)), brow, head, [s * .04, HEAD_Y + .046, .092], [1, 1, .6], [0, 0, Math.PI / 2 - s * .18]);
    eyes.push(eye);
  }

  // Hair: a dense black mop. A cap over the crown, back and sides, then tufts: spiky and pushed
  // back and out on top, longer at the nape, and a heavy fringe falling over the brow.
  add(sphere, hair, head, [0, HEAD_Y + .03, -.014], [.113, .108, .116]);
  add(sphere, hair, head, [0, HEAD_Y - .03, -.045], [.1, .085, .08]);
  const tuft = g(new T.ConeGeometry(.034, .1, 6, 1)); tuft.translate(0, .05, 0);
  const placeTuft = (dir: T.Vector3, len: number, width: number, from: T.Vector3) => {
    const m = new T.Mesh(tuft, hair); m.position.copy(from); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    m.scale.set(width, len, width * .8); head.add(m); return m;
  };
  const rnd = (() => { let s = 77; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const centre = new T.Vector3(0, HEAD_Y + .02, -.01);
  for (let i = 0; i < 80; i++) {
    // Spread over the upper and back hemisphere, avoiding the face.
    const az = rnd() * Math.PI * 2, el = .1 + rnd() * 1.35;
    const n = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    if (n.z > .35 && n.y < .75) continue;
    const from = n.clone().multiplyScalar(.092).add(centre);
    // Tufts flick up and back, with a messy random kick.
    const dir = n.clone().multiplyScalar(1.4).add(new T.Vector3((rnd() - .5) * .8, .15 + rnd() * .3, -.3 + (rnd() - .5) * .4));
    placeTuft(dir, .32 + rnd() * .38 + (n.y > .8 ? .1 : 0), 1.05 + rnd() * .55, from.addScaledVector(n, -.012));
  }
  // Nape and sides over the ears: shorter, pointing down and out.
  for (let i = 0; i < 12; i++) {
    const az = Math.PI * (.35 + i / 11 * 1.3), n = new T.Vector3(Math.sin(az), -.15, Math.cos(az));
    placeTuft(n.clone().add(new T.Vector3(0, -.9, 0)), .35 + rnd() * .3, .8, n.clone().multiplyScalar(.095).add(new T.Vector3(0, HEAD_Y - .01, -.01)));
  }
  // The fringe: five heavy locks falling forward and down across the forehead, swept to his right.
  for (let i = 0; i < 6; i++) {
    const x = -.06 + i * .024, from = new T.Vector3(x, HEAD_Y + .085, .04 + (1 - Math.abs(x) / .07) * .02);
    placeTuft(new T.Vector3(.25 + x * 2, -.55, 1), .55 + rnd() * .25, .85, from);
  }

  // ── Arms.
  const arms: { shoulder: T.Group; elbow: T.Group; wrist: T.Group; fingers: T.Group }[] = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(chest, side * .175, .17);
    add(limb(.055, .047, .26), hoodie, shoulder);
    const elbow = joint(shoulder, 0, -.27);
    add(limb(.047, .042, .2), hoodie, elbow);
    // Ribbed cuff pushed up a little at the wrist.
    add(g(new T.CylinderGeometry(.04, .036, .045, 14)), rib, elbow, [0, -.215, 0]);
    const wrist = joint(elbow, 0, -.245);
    add(limb(.024, .024, .02, 10), skin, wrist, [0, .012, 0]);
    // Hand: palm block, a thumb, four fingers as one curled mitten (enough at third-person range).
    add(sphere, skin, wrist, [0, -.045, .004], [.024, .042, .014]);
    const fingers = joint(wrist, 0, -.08);
    add(g(new T.CapsuleGeometry(.0125, .03, 4, 8)), skin, fingers, [0, -.018, 0], [1.75, 1, .9]);
    add(g(new T.CapsuleGeometry(.0095, .03, 4, 8)), skin, wrist, [side * -.02, -.05, .016], [1, 1, 1], [.5, 0, side * .5]);
    arms.push({ shoulder, elbow, wrist, fingers });
  }

  // ── Legs.
  const legs: { hip: T.Group; knee: T.Group; ankle: T.Group; heel: T.Object3D; toe: T.Object3D; cap: T.Object3D }[] = [];
  for (const side of [-1, 1]) {
    const hip = joint(pelvis, side * .085, -.015);
    add(limb(.078, .056, LEG.thigh), jeans, hip);
    const knee = joint(hip, 0, -LEG.thigh);
    add(limb(.056, .047, LEG.shin), jeans, knee);
    // The rolled cuff above the high-top.
    add(g(new T.CylinderGeometry(.056, .054, .04, 16)), jeansCuff, knee, [0, -LEG.shin + .06, 0]);
    const ankle = joint(knee, 0, -LEG.shin);
    // High-top sneaker: ankle collar, upper, red side panel, white toe cap and sole, laces.
    add(g(new T.CylinderGeometry(.05, .052, .075, 16)), shoeUpper, ankle, [0, -.012, -.004]);
    add(sphere, shoeUpper, ankle, [0, -.042, .045], [.05, .036, .1]);
    add(sphere, shoeRed, ankle, [side * .006, -.04, .02], [.052, .03, .07]);
    add(sphere, white, ankle, [0, -.052, .118], [.045, .026, .042]);
    add(g(new T.BoxGeometry(.098, .028, .21)), sole, ankle, [0, -.07, .04]);
    add(sphere, sole, ankle, [0, -.07, .14], [.049, .014, .035]);
    add(sphere, sole, ankle, [0, -.07, -.065], [.049, .014, .03]);
    for (let i = 0; i < 4; i++) add(g(new T.BoxGeometry(.05, .005, .008)), lace, ankle, [0, -.01 - i * .012 + .02, .05 + i * .016], [1, 1, 1], [.5, 0, 0]);
    // Contact points for the ground solve.
    const heel = joint(ankle, 0, -.084, -.08), toe = joint(ankle, 0, -.084, .16), cap = joint(knee, 0, 0, 0);
    legs.push({ hip, knee, ankle, heel, toe, cap });
  }
  root.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });

  const pose = hiroRest();
  const tmp = new T.Vector3(), inv = new T.Matrix4();
  let blinkAt = 2.2;
  return {
    root, pose,
    /** World position of the right hand's grip. */
    handWorld: (out = new T.Vector3()) => arms[1].fingers.getWorldPosition(out),
    /** World position of the left hand's grip. */
    leftHandWorld: (out = new T.Vector3()) => arms[0].fingers.getWorldPosition(out),
    headWorld: (out = new T.Vector3()) => head.localToWorld(out.set(0, HEAD_Y, 0)),
    /** Joints, for anything that needs to attach to him (a device in his hand). */
    joints: { pelvis, spine, chest, neck, head, arms, legs },
    update(t = performance.now() / 1000) {
      const p = pose;
      const kneel = p.kneel, haul = p.haul, hold = p.hold, bump = p.bump;
      const breathe = Math.sin(t * 1.7) * (1 - p.stride);
      root.rotation.y = p.yaw;

      // Torso: lean into the run, back on the drag, upright over the knee; a breath; walk twist.
      const sw = Math.sin(p.walk) * p.stride;
      spine.rotation.set(p.lean * .25 - haul * .32 + kneel * .1 + breathe * .01, -sw * .12, 0);
      chest.rotation.set(p.lean * .18 - haul * .18 + kneel * .05 - breathe * .015, -sw * .1, 0);
      pelvis.rotation.set(-haul * .1, sw * .14, Math.cos(p.walk) * p.stride * .04);
      neck.rotation.set(-p.lookUp * .3 + haul * .25 - p.lean * .2 + kneel * .05, p.look * .7, 0);
      head.rotation.set(-p.lookUp * .35 + haul * .1, p.look * .4, 0);
      // Blink every few seconds.
      if (t > blinkAt + .12) blinkAt = t + 2 + (t * 7.13 % 1) * 3;
      const lid = t > blinkAt && t < blinkAt + .12 ? .1 : 1;
      eyes.forEach(e => { e.scale.y = lid; });

      // Legs: a walk cycle (thigh swings, the knee folds through the swing, toes lift at heel
      // strike), the braced drag, and the kneel (right knee down, left foot planted forward).
      legs.forEach(({ hip, knee, ankle }, i) => {
        const ph = p.walk + (i === 0 ? 0 : Math.PI), A = p.stride;
        const thigh = -Math.sin(ph) * .5 * A;
        const fold = Math.max(0, Math.cos(ph)) * 1.0 * A + .08 * A;
        const kneeling = i === 1 ? { hip: .12, knee: 1.75, ankle: -.65 } : { hip: -1.45, knee: 1.5, ankle: -.05 };
        hip.rotation.x = T.MathUtils.lerp(thigh - haul * .45, kneeling.hip, kneel);
        hip.rotation.z = (i === 0 ? -1 : 1) * (.03 + kneel * (i === 0 ? .12 : .02));
        knee.rotation.x = T.MathUtils.lerp(fold + haul * .55, kneeling.knee, kneel);
        ankle.rotation.x = T.MathUtils.lerp(-Math.max(0, Math.sin(ph)) * .3 * A - haul * .15 + (fold - .08 * A) * -.2, kneeling.ankle, kneel);
      });

      // Arms: hanging relaxed with a little bend, swinging against the legs; the drag, the hold,
      // the reaches and the bump layered on top.
      arms.forEach(({ shoulder, elbow, wrist, fingers }, i) => {
        const s = i === 0 ? -1 : 1, ph = p.walk + (i === 0 ? Math.PI : 0);
        const reach = i === 1 ? p.reach : p.reachL, bmp = i === 1 ? bump : 0;
        const swing = Math.sin(ph) * .55 * p.stride * (1 - haul) * (1 - hold);
        let sx = -swing - haul * 1.25 - hold * .55 - reach * (1.05 - kneel * .25) - bmp * 1.45 - kneel * .15;
        const sz = s * (.1 + breathe * .01 + haul * .05 - hold * .12 + reach * .05);
        let ex = -.22 - p.stride * .55 - hold * 1.45 - haul * .2 + reach * .1 - bmp * .25;
        if (kneel > 0 && i === 0 && reach === 0) { sx -= kneel * .2; ex -= kneel * .55; } // left forearm resting on the raised knee
        shoulder.rotation.set(sx, 0, sz);
        shoulder.rotation.y = s * (hold * .35 + haul * .1);
        elbow.rotation.set(ex, 0, 0);
        elbow.rotation.y = -s * hold * .5;
        wrist.rotation.set(hold * .4 + bmp * .2, 0, s * hold * .3);
        fingers.rotation.x = -.35 - (bmp + haul + hold) * .9;
      });

      // Ground: drop or lift the pelvis until his lowest contact (heel, toe or kneeling knee) is on y = 0.
      pelvis.position.y = HIP_Y; body.position.y = 0;
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      let low = Infinity;
      for (const l of legs) for (const c of [l.heel, l.toe, l.cap]) { c.getWorldPosition(tmp).applyMatrix4(inv); low = Math.min(low, tmp.y - (c === l.cap ? .056 : 0)); }
      body.position.y = -low;
      // Haul: hips sit back behind the feet.
      body.position.z = -haul * .1 - kneel * .05;
    },
    dispose() { geos.forEach(x => x.dispose()); mats.forEach(m => m.dispose()); texes.forEach(x => x.dispose()); root.removeFromParent(); },
  };
}
export type Hiro = ReturnType<typeof createHiro>;
