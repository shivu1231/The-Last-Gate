import * as THREE from 'three';
import { createArmouredBaymax, mountArmour } from '../characters/SolidArmour';
import { createLimiter } from '../phase4/limiter';
import { assets } from '../systems/AssetManager';
import { mountChestBay } from '../characters/ChestBay';
import {
  configureLaterArmour,
  createSurfaceContact,
  LATER_BAYMAX_SCALE,
  REGULATOR_WORLD_SCALE,
} from '../characters/LaterBaymax';
import { createRegulatorMount } from '../characters/RegulatorMount';

/**
 * The same Baymax as Phase 5 (the shell GLB, the Phase 1 skin, armour and chest bay), hinged so he
 * can get up and move: hips and ankles for the legs, shoulders for the arms, the head as is. The
 * shell is authored sitting, legs forward; `sit` 1 is that pose, 0 is standing.
 *
 * Every frame the director writes a Pose and calls update(); nothing here keeps story state.
 */
export type BaymaxPose = {
  sit: number;
  lie: number;
  lean: number;
  guard: number;
  punch: number;
  hold: number;
  stride: number;
  gait: number;
  dangle: number;
  yaw: number;
  head: [number, number, number];
  eyes: THREE.Color;
  eyeGlow: number;
  thrust: number;
  sputter: number;
  open: number;
  chipGlow: number;
  chipInBay: boolean;
  careSeated: boolean;
  /** 0..1 how much of the combat armour he's wearing (the combat chip's; it comes off at the boot). */
  armour: number;
  /** The fitted limiter is switched on (Hiro's regulator remote). */
  limiterOn: number;
  /** 0..1 arms trailing up over his head (lying, dragged by the feet). */
  overhead: number;
  /**
   * 0..1 through the staged get-up from lying on his back: sit up (pushing on the ground behind),
   * settle, lean over his feet with his hands planted, push up, wobble to a stand. Overrides
   * lie/sit/lean while above 0. Like tension and sluggish, it is cleared after each update(), so
   * the director writes it every frame it wants it.
   */
  getUp: number;
  /** Force the combat tension or the limited sluggishness (otherwise read from guard, eyes and sputter). */
  tension: number;
  sluggish: number;
};
export const restPose = (): BaymaxPose => ({
  sit: 1,
  lie: 0,
  lean: 0,
  guard: 0,
  punch: 0,
  hold: 0,
  stride: 0,
  gait: 0,
  dangle: 0,
  yaw: 0,
  head: [0, 0, 0],
  eyes: new THREE.Color('#0b0f11'),
  eyeGlow: 0,
  thrust: 0,
  sputter: 0,
  open: 0,
  chipGlow: 0,
  chipInBay: true,
  careSeated: false,
  getUp: 0,
  tension: 0,
  sluggish: 0,
  armour: 1,
  overhead: 0,
  limiterOn: 0,
});

const FLAME_VS =
  'varying vec2 vUv;varying float vFace;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vFace=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}';
// A soft additive jet: white core into orange, flickering along its length.
const FLAME_FS = `varying vec2 vUv;varying float vFace;uniform float uTime;uniform float uPower;
void main(){float along=vUv.y;float core=pow(vFace,1.6);
float flick=.75+.25*sin(uTime*53.+along*17.)*sin(uTime*31.+vUv.x*9.);
float a=core*pow(1.-along,1.4)*uPower*flick;
vec3 c=mix(vec3(1.,.36,.12),vec3(1.,.93,.78),pow(1.-along,3.));
gl_FragColor=vec4(c*a*1.6,a);}`;

/**
 * His size in Phase 6. Armoured and standing, the model is about 4.4 m at scale 1 (measured from the
 * skinned vertices, helmet to boots), which made him tower over Hiro (1.65 m) and pushed his legs out of
 * frame in every close shot. At this scale he stands about 3.5 m, with his whole body readable at medium distance.
 */
export const BAYMAX_SCALE = LATER_BAYMAX_SCALE;

/**
 * Build the shared Baymax body and its pose/interaction hierarchy.
 */
export async function createBaymax() {
  const model = await assets.cloneBaymax();
  const meshes: THREE.Mesh[] = [];
  model.traverse((sceneObject) => {
    if (sceneObject instanceof THREE.Mesh) meshes.push(sceneObject);
  });
  const near = (firstValue: number, secondValue: number, tol = 0.06) =>
    Math.abs(firstValue - secondValue) < tol;

  // Hinges, built in the authored (sitting) pose so attach() keeps every mesh where it was.
  const hips: THREE.Group[] = [],
    ankles: THREE.Group[] = [],
    shoulders: THREE.Group[] = [];
  let palm: THREE.Mesh | null = null,
    fist: THREE.Mesh | null = null;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.53, 0.55, 0.28);
    model.add(hip);
    const ankle = new THREE.Group();
    ankle.position.set(side * 0.18, -0.27, 0.86);
    hip.add(ankle);
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.98, 2.42, 0);
    model.add(shoulder);
    model.updateMatrixWorld(true);
    for (const mesh of meshes) {
      const position = mesh.position,
        scaleX = side * position.x;
      if (near(scaleX, 0.57) && near(position.y, 0.48)) hip.attach(mesh);
      else if (
        near(scaleX, 0.71) &&
        (near(position.y, 0.26) || near(position.y, 0.04)) &&
        position.z > 1.2
      )
        ankle.attach(mesh);
      else if (
        scaleX > 0.8 &&
        position.y < 2.45 &&
        !(near(position.y, 0.48) || position.z > 1.2)
      ) {
        if (near(scaleX, 1.25) && near(position.y, 0.35)) {
          if (side < 0) palm = mesh;
          else fist = mesh;
        }
        shoulder.attach(mesh);
      }
    }
    hips.push(hip);
    ankles.push(ankle);
    shoulders.push(shoulder);
  }
  const bay = mountChestBay(model);

  let head: THREE.Object3D | null = null;
  model.traverse((sceneObject) => {
    if (sceneObject.name === 'dormant-head') head = sceneObject;
  });
  const headNode = head as THREE.Object3D | null;
  const headBase = headNode ? headNode.rotation.clone() : new THREE.Euler();
  // The eyes and the line between them share one material: dark, red, or soft white.
  const eyeMat = new THREE.MeshBasicMaterial({
    color: '#0b0f11',
    toneMapped: false,
  });
  headNode?.traverse((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      sceneObject.material instanceof THREE.MeshBasicMaterial
    )
      sceneObject.material = eyeMat;
  });
  // The combat armour (tracker PW-03): the armoured suit, mounted in this rig and posed from it.
  const holeAt = new THREE.Vector3();
  const armoured = await createArmouredBaymax({
    shell: model,
    eye: eyeMat,
    hole: () =>
      bay.holeOpen
        ? bay.root.getObjectByName('dock')!.getWorldPosition(holeAt)
        : null,
  });
  mountArmour(armoured, model, { y: 0.55, z: 0.28 }, 2.42);
  const disposeArmourCores = configureLaterArmour(armoured);
  // The limiter Hiro fitted in Phase 5 stays on his chest plate (tracker N-04); Hiro's remote drives its lamp.
  // Smaller and centred on the plate, so it lies inside his outline from every angle, even lying on his back (tracker R-08).
  const limiter = createLimiter();
  limiter.scale.setScalar(
    REGULATOR_WORLD_SCALE / (armoured.root.scale.x * BAYMAX_SCALE),
  );
  armoured.root.add(limiter);
  armoured.drive({});
  armoured.mountOnChest(limiter, 0, -0.45);
  // Fitted, not stuck on: the loose trailing leads go, and one heavy feed runs from the unit's main
  // gland into the rim of his chest bay, so it reads as wired into his power system. Built once the
  // bay is seated (both ends ride the chest bone, so it holds in any pose).
  limiter.cables.visible = false;
  const feedMat = new THREE.MeshStandardMaterial({
    color: '#15171a',
    roughness: 0.62,
    metalness: 0.15,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: '#c9762e',
    roughness: 0.45,
    metalness: 0.4,
  });
  let feed: THREE.Group | null = null;
  let regulatorMount: ReturnType<typeof createRegulatorMount>;
  const buildFeed = () => {
    const bone = limiter.parent!;
    bone.updateWorldMatrix(true, true);
    const normalVector = new THREE.Vector3(0, 0, 1).transformDirection(
      limiter.matrixWorld,
    );
    const along = new THREE.Vector3(1, 0, 0).transformDirection(
      limiter.matrixWorld,
    );
    const startPoint = regulatorMount.feedWorld(),
      vector = dock.getWorldPosition(new THREE.Vector3());
    const rim = bay.root.getWorldScale(new THREE.Vector3()).x * 0.235;
    const to = startPoint.clone().sub(vector);
    to.addScaledVector(normalVector, -to.dot(normalVector)).normalize();
    const endPoint = vector
      .clone()
      .addScaledVector(to, rim * 0.98)
      .addScaledVector(normalVector, 0.006);
    const lift = Math.max(0.03, startPoint.distanceTo(endPoint) * 0.22);
    const points = [
      startPoint,
      startPoint
        .clone()
        .addScaledVector(along, 0.03)
        .addScaledVector(normalVector, lift * 0.5),
      startPoint
        .clone()
        .lerp(endPoint, 0.5)
        .addScaledVector(normalVector, lift),
      endPoint.clone().addScaledVector(normalVector, lift * 0.4),
      endPoint,
    ].map((point) => bone.worldToLocal(point.clone()));
    const scaleVector = bone.getWorldScale(new THREE.Vector3()).x;
    const group = new THREE.Group();
    group.name = 'regulator-feed';
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          24,
          0.0095 / scaleVector,
          8,
        ),
        feedMat,
      ),
    );
    // A plug collar where it goes into the bay.
    const plug = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.015 / scaleVector,
        0.013 / scaleVector,
        0.03 / scaleVector,
        12,
      ),
      collarMat,
    );
    plug.position.copy(points[4]);
    plug.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      points[4].clone().sub(points[3]).normalize(),
    );
    group.add(plug);
    bone.add(group);
    feed = group;
  };
  // Phase 6 opens armoured: start fully on, so the warm-up draw compiles the opaque plates it will really use (tracker R-05).
  armoured.set(1);
  regulatorMount = createRegulatorMount(limiter, armoured.root);
  // Phase 6 finish: the suit's clear coat made the plates read as glossy toy plastic under the street
  // lights. Painted, worn armour instead: a thin, rougher coat and a little more grain in the paint.
  // (These materials belong to this suit instance, so earlier phases keep their own.)
  armoured.root.traverse((sceneObject) => {
    if (!(sceneObject instanceof THREE.Mesh)) return;
    for (const mesh2 of Array.isArray(sceneObject.material)
      ? sceneObject.material
      : [sceneObject.material])
      if (mesh2 instanceof THREE.MeshPhysicalMaterial && !mesh2.transparent) {
        mesh2.clearcoat = Math.min(mesh2.clearcoat, 0.1);
        mesh2.clearcoatRoughness = 0.55;
        mesh2.roughness = Math.max(
          mesh2.roughness,
          mesh2.metalness > 0.7 ? 0.36 : 0.5,
        );
      }
  });
  // While armoured the chest bay sits in the suit's chest plating (tracker N-03); it goes back on the white chest at the boot.
  let unseatBay: (() => void) | null = null;
  const under = (sceneObject: THREE.Object3D, roots: THREE.Object3D[]) => {
    for (
      let sceneObject2: THREE.Object3D | null = sceneObject;
      sceneObject2;
      sceneObject2 = sceneObject2.parent
    )
      if (roots.includes(sceneObject2)) return true;
    return false;
  };

  // Jets: two from the back pack, one under each foot.
  const flameMat = new THREE.ShaderMaterial({
    vertexShader: FLAME_VS,
    fragmentShader: FLAME_FS,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  // Base at the nozzle (origin), tip 1.6 m down -Y.
  const flameGeo = new THREE.ConeGeometry(0.2, 1.6, 14, 1, true);
  flameGeo.rotateX(Math.PI);
  flameGeo.translate(0, -0.8, 0);
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const back = new THREE.Mesh(flameGeo, flameMat);
    back.position.set(side * 0.26, 1.75, -0.78);
    back.rotation.x = 0.45;
    model.add(back);
    flames.push(back);
  }
  for (const ankle of ankles) {
    const foot = new THREE.Mesh(flameGeo, flameMat);
    const boot = ankle.children.find(
      (sceneObject) =>
        sceneObject instanceof THREE.Mesh &&
        sceneObject.name.startsWith('boot-'),
    ) as THREE.Mesh | undefined;
    if (boot) {
      boot.geometry.computeBoundingBox();
      const sole = boot.geometry.boundingBox!;
      model.updateMatrixWorld(true);
      foot.position.copy(
        ankle.worldToLocal(
          boot.localToWorld(
            new THREE.Vector3(
              (sole.min.x + sole.max.x) / 2,
              sole.min.y - 0.025,
              (sole.min.z + sole.max.z) / 2,
            ),
          ),
        ),
      );
    } else foot.position.set(0, -0.3, 0.42);
    foot.scale.setScalar(0.8);
    ankle.add(foot);
    flames.push(foot);
  }
  flames.forEach((material) => {
    material.renderOrder = 5;
    material.frustumCulled = false;
  });
  const jetLight = new THREE.PointLight('#ff8a46', 0, 9, 1.8);
  // Thrust light ignites at once but falls off over a fraction of a second when output is cut.
  let jetLevel = 0,
    jetAt = 0;
  jetLight.position.set(0, -0.6, 0);
  model.add(jetLight);

  // The combat chip in his dock; once the bay opens after the fall its glow pulses (the bay's own light follows it).
  const combatChip = bay.root.getObjectByName('combat-chip')!;
  const dock = bay.root.getObjectByName('dock')!;

  // His standing head height, measured once. (Each frame the shell itself is sat on the ground.)
  const root = new THREE.Group();
  root.name = 'baymax-phase6';
  const body = new THREE.Group();
  root.add(body);
  body.add(model);
  const setLegs = (sit: number) => {
    hips.forEach((group) => {
      group.rotation.x = (1 - sit) * 1.42;
    });
    ankles.forEach((group) => {
      group.rotation.x = -(1 - sit) * 1.42;
    });
  };
  const lowest = () => {
    model.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(model).min.y;
  };
  setLegs(0);
  const standDrop = -lowest();
  model.updateMatrixWorld(true);
  const headHeight =
    ((headNode ? headNode.getWorldPosition(new THREE.Vector3()).y : 3) +
      standDrop) *
    BAYMAX_SCALE;
  setLegs(1);
  root.scale.setScalar(BAYMAX_SCALE);

  const pose = restPose();
  // Smoothed copies of the pose (springs) and the rig's own memory.
  const cur: Record<string, number> = {
    guard: 0,
    punch: 0,
    lean: 0,
    hold: 0,
    dangle: 0,
    stride: 0,
    h0: 0,
    h1: 0,
    h2: 0,
    yaw: 0,
    squash: 0,
    pitch: 0,
    bank: 0,
    flail: 0,
    flop: 0,
    wob: 0,
    land: 0,
    choke: 0,
    lunge: 0,
  };
  const velocity: Record<string, number> = Object.fromEntries(
    Object.keys(cur).map((key) => [key, 0]),
  );
  let last = -1,
    lastDt = 1 / 60,
    first = true,
    shuffle = 0,
    lastStep = 0,
    stoodUp = false,
    braced = false,
    prevVy = 0;
  // Regulator reactions: the switch-on edge, and the jets coughing out under the limit.
  let prevLimiter = -1,
    prevThrust = 0,
    coughAt = -9;
  // His own motion, measured from where the director put him: flight posture and falls read it.
  const prevPos = new THREE.Vector3(),
    rawV = new THREE.Vector3(),
    velS = new THREE.Vector3(),
    accS = new THREE.Vector3(),
    rawA = new THREE.Vector3(),
    wp = new THREE.Vector3();
  const spring = (
    key: string,
    target: number,
    blendFactor: number,
    zeta: number,
    snap: boolean,
  ) => {
    if (snap) {
      cur[key] = target;
      velocity[key] = 0;
      return;
    }
    velocity[key] +=
      ((target - cur[key]) * blendFactor * blendFactor -
        2 * zeta * blendFactor * velocity[key]) *
      lastDt;
    cur[key] += velocity[key] * lastDt;
  };
  const kick = (amount: number) => {
    velocity.squash += amount * 6;
  };
  const mode = { tense: 0, slug: 0 };
  meshes.forEach((mesh) => mesh.geometry.computeBoundingBox());
  // While he's armoured: the white body hides (the chest bay stays), and his torso plus the suit's feet ground him.
  const whiteParts = meshes.filter((material) => !under(material, [bay.root]));
  const qA = new THREE.Quaternion(),
    qB = new THREE.Quaternion(),
    qC = new THREE.Quaternion(),
    qD = new THREE.Quaternion(),
    qH = new THREE.Quaternion(),
    rotationEuler = new THREE.Euler(),
    headRest = new THREE.Quaternion();
  const armourContact = createSurfaceContact(whiteParts),
    whiteContact = armourContact;
  const worldOrigin = new THREE.Vector3(),
    correction = new THREE.Vector3();
  const armourHand = (side: 'L' | 'R') => (side === 'R' ? palm : fist);
  // The suit's shins (knee end, ankle end), for Hiro taking him by the legs.
  const leg = (state: 'L' | 'R') => [
    hips[state === 'L' ? 1 : 0],
    ankles[state === 'L' ? 1 : 0],
  ];
  const legBones = { L: leg('L'), R: leg('R') };
  const bootMeshes = (state: 'L' | 'R') => {
    const out: THREE.Mesh[] = [];
    ankles[state === 'L' ? 1 : 0].traverse((sceneObject) => {
      if (
        sceneObject instanceof THREE.Mesh &&
        sceneObject.name.startsWith('boot-')
      )
        out.push(sceneObject);
    });
    return out;
  };
  const boots = {
    L: { bone: legBones.L[1], meshes: bootMeshes('L') },
    R: { bone: legBones.R[1], meshes: bootMeshes('R') },
  };
  return {
    root,
    model,
    bay,
    pose,
    combatChip,
    dock,
    eyeMat,
    /** World position of the dock (the chip's seat). */
    dockWorld: (out = new THREE.Vector3()) => dock.getWorldPosition(out),
    headWorld: (out = new THREE.Vector3()) =>
      pose.armour > 0.5
        ? armoured.headWorld(out)
        : (headNode ?? model).getWorldPosition(out),
    /** His right hand (the one Hiro takes). */
    handWorld: (out = new THREE.Vector3()) =>
      (pose.armour > 0.5
        ? (armourHand('R') ?? model)
        : (palm ?? model)
      ).getWorldPosition(out),
    /** His other hand, the one `punch` drives (and the fist bump). */
    fistWorld: (out = new THREE.Vector3()) =>
      (pose.armour > 0.5
        ? (armourHand('L') ?? model)
        : ((fist as THREE.Mesh | null) ?? model)
      ).getWorldPosition(out),
    headHeight,
    chestWorld: (out = new THREE.Vector3()) => bay.chestWorld(out),
    /** The suit's ankle joint and the knee end of that shin ('L' is his left), for taking him by the legs. */
    ankleWorld: (side: 'L' | 'R', out = new THREE.Vector3()) =>
      legBones[side][1].getWorldPosition(out),
    kneeWorld: (side: 'L' | 'R', out = new THREE.Vector3()) =>
      legBones[side][0].getWorldPosition(out),
    /** That leg's boot: the bone it rides on and its meshes (to find where a hand meets it). */
    boot: (side: 'L' | 'R') => boots[side],
    /** His current (smoothed) facing. */
    facing: () => cur.yaw,
    /**
     * Motion beats a director can fire on top of the pose (each is an impulse that plays out and
     * settles by itself; strength about 0..1.5):
     * jolt: the regulator biting (body snaps back, arms drop, eyes stutter, the gauge slams into the red).
     * Fired automatically when limiterOn switches on and when the jets cough out under the limit.
     * impact: a heavy touchdown (knees take it, he sinks and rises). Fired automatically when his root
     * stops falling faster than about 2 m/s; call it for landings the director places without a fall.
     * lunge: a committed surge forward (torso pitches in, both arms drive forward).
     */
    jolt: (blendFactor = 1) => {
      velocity.choke += 10 * blendFactor;
      kick(0.5 * blendFactor);
    },
    impact: (blendFactor = 1) => {
      velocity.land += 9 * blendFactor;
      kick(0.8 * blendFactor);
    },
    lunge: (blendFactor = 1) => {
      velocity.lunge += 8 * blendFactor;
    },
    update(
      timeSeconds: number,
      floor?: (xPosition: number, zPosition: number) => number,
    ) {
      armoured.set(pose.armour);
      limiter.visible = pose.armour > 0.5;
      // The regulator reads his load: the needle rides just under its limit while he pushes against it,
      // and when it bites (cur.choke, last frame's) it slams into the red and the lamp flares white.
      const bite = Math.max(0, cur.choke);
      limiter.led.color.set(
        bite > 0.25 ? '#fff1c4' : pose.limiterOn > 0.5 ? '#ffb15a' : '#2a3a33',
      );
      limiter.setGauge(
        pose.limiterOn > 0.5
          ? 0.33 +
              Math.min(0.06, pose.thrust * 0.05 + pose.stride * 0.03) +
              Math.min(0.5, bite * 0.7) +
              Math.sin(timeSeconds * 9) * 0.006 +
              Math.sin(timeSeconds * 61) * 0.01 * bite
          : 0.05,
      );
      // The white body is the solid inner rig at every stage; plates disappear at the healthcare chip.
      const pose2 = pose;
      const gap = last < 0 ? 1 : timeSeconds - last;
      last = timeSeconds;
      const deltaSeconds = Math.min(0.05, Math.max(0, gap));
      lastDt = deltaSeconds;
      // A long gap (a cut, a stage entered cold, the tab coming back) snaps instead of easing.
      const inert =
        pose2.lie > 0.99 &&
        pose2.getUp <= 0 &&
        pose2.thrust < 0.01 &&
        pose2.eyeGlow < 0.01;
      const snap = deltaSeconds === 0 || gap > 0.25 || first || inert;
      if (inert) {
        mode.tense = mode.slug = 0;
        for (const key of [
          'flop',
          'wob',
          'land',
          'choke',
          'lunge',
          'squash',
          'flail',
          'bank',
          'pitch',
        ]) {
          cur[key] = 0;
          velocity[key] = 0;
        }
      }
      first = false;

      // ── Mode: combat tension (red eyes, guard up, full power) vs limited sluggishness.
      const red =
        pose2.eyeGlow > 0.5 && pose2.eyes.r > 0.5 && pose2.eyes.g < 0.4 ? 1 : 0;
      const upright = (1 - pose2.lie) * (1 - pose2.sit);
      const tenseTarget = inert
        ? 0
        : Math.max(
            pose2.tension,
            pose2.guard *
              red *
              (1 - Math.min(1, pose2.sputter)) *
              upright *
              (1 - pose2.dangle * 0.6),
          );
      const slugTarget = inert
        ? 0
        : Math.max(pose2.sluggish, Math.min(1, pose2.sputter) * upright);
      mode.tense +=
        (tenseTarget - mode.tense) *
        (snap ? 1 : 1 - Math.exp(-deltaSeconds * 4));
      mode.slug +=
        (slugTarget - mode.slug) * (snap ? 1 : 1 - Math.exp(-deltaSeconds * 2));
      const tense = mode.tense,
        slug = mode.slug;

      // ── Motion: velocity and acceleration of the root, smoothed, in his own frame.
      root.getWorldPosition(wp);
      if (snap) {
        prevPos.copy(wp);
        velS.set(0, 0, 0);
        accS.set(0, 0, 0);
        rawV.set(0, 0, 0);
      } else {
        rawV.copy(wp).sub(prevPos).divideScalar(Math.max(deltaSeconds, 1e-3));
        prevPos.copy(wp);
        rawA.copy(rawV).sub(velS).divideScalar(Math.max(deltaSeconds, 1e-3));
        accS.lerp(rawA, 1 - Math.exp(-deltaSeconds * 4));
        velS.lerp(rawV, 1 - Math.exp(-deltaSeconds * 8));
      }
      const fy = Math.sin(cur.yaw),
        fz = Math.cos(cur.yaw);
      const fwdSpeed = velS.x * fy + velS.z * fz,
        sideSpeed = velS.x * fz - velS.z * fy;
      const fwdAcc = accS.x * fy + accS.z * fz,
        sideAcc = accS.x * fz - accS.z * fy;
      const air = Math.min(1, pose2.dangle);
      // Flight: pitch into the speed and flare back when braking; bank into turns.
      spring(
        'pitch',
        air *
          THREE.MathUtils.clamp(fwdSpeed * 0.045 - fwdAcc * 0.025, -0.5, 0.55),
        4,
        0.72,
        snap,
      );
      spring(
        'bank',
        air *
          THREE.MathUtils.clamp(
            -sideAcc * 0.035 - sideSpeed * 0.02,
            -0.55,
            0.55,
          ),
        3.4,
        0.7,
        snap,
      );
      const sweep =
        air * THREE.MathUtils.clamp(Math.abs(fwdSpeed) * 0.07, 0, 0.85);
      // Falling without thrust: arms and legs flail. Landing hard: a big squash, limbs flop, a wobble.
      const dropping =
        THREE.MathUtils.clamp((-rawV.y - 2) / 4, 0, 1) *
        (1 - Math.min(1, pose2.thrust * 2));
      spring('flail', dropping, 8, 0.6, snap);
      if (!snap && prevVy < -4 && rawV.y > -1.2) {
        kick(1.6);
        velocity.flop += 7;
        velocity.wob += 2.6 * (Math.sin(timeSeconds * 13) > 0 ? 1 : -1);
      }
      // Any real touchdown (a burst ending, a drop onto his feet): the knees take it and he sinks, then rises.
      if (!snap && prevVy < -2.2 && rawV.y > -0.8 && pose2.lie < 0.5)
        velocity.land +=
          THREE.MathUtils.clamp((-prevVy - 1.5) / 5, 0.25, 1) * 9;
      // The regulator biting: switched on under him, or the jets coughing out mid-flight.
      if (
        !snap &&
        prevLimiter >= 0 &&
        prevLimiter <= 0.5 &&
        pose2.limiterOn > 0.5
      )
        velocity.choke += 10;
      if (
        !snap &&
        pose2.sputter > 0 &&
        prevThrust > 0.45 &&
        pose2.thrust < 0.3 &&
        timeSeconds - coughAt > 0.5
      ) {
        coughAt = timeSeconds;
        velocity.choke += 4.5;
        kick(0.4);
      }
      prevLimiter = pose2.limiterOn;
      prevThrust = pose2.thrust;
      prevVy = snap ? 0 : rawV.y;
      spring('flop', 0, 6, 0.3, false);
      spring('wob', 0, 4, 0.32, false);
      spring('land', 0, 5, 0.55, false);
      spring('choke', 0, 6, 0.42, false);
      spring('lunge', 0, 4.5, 0.6, false);
      const landK = Math.max(0, cur.land),
        choke = Math.max(0, cur.choke),
        lungeK = cur.lunge;
      // Hovering on the jets: never frozen. A slow bob on two rhythms, the legs drifting under him.
      const hover =
        cur.dangle * Math.min(1, pose2.thrust * 1.6) * (1 - pose2.lie);
      // How quickly he answers: snappy when fighting, syrupy when the limit is on.
      const rate =
        THREE.MathUtils.lerp(1, 1.8, tense) *
        THREE.MathUtils.lerp(1, 0.38, slug);

      // ── The staged get-up overrides the seat, lean and arms (lying → sat up → crouch → stand).
      let lie = pose2.lie,
        sit = pose2.sit,
        lean = pose2.lean,
        push = 0,
        brace = 0,
        tuck = 0;
      if (pose2.getUp > 0) {
        const scalarValue = pose2.getUp,
          callback = (firstValue: number, secondValue: number) =>
            THREE.MathUtils.smootherstep(scalarValue, firstValue, secondValue);
        const sitUp = callback(0, 0.28),
          settle = callback(0.3, 0.42),
          crouch = callback(0.42, 0.64),
          rise = callback(0.62, 0.86);
        lie = 1 - sitUp;
        sit = sitUp * (1 - crouch * 0.62) * (1 - rise);
        lean =
          crouch * 0.52 * (1 - rise) + rise * 0.1 * (1 - callback(0.86, 1));
        push = sitUp * (1 - settle); // hands pushing on the ground behind him as he sits up
        brace = crouch * (1 - rise * 0.8); // hands planted at his sides as he leans over his feet
        tuck = Math.sin(Math.PI * sitUp) * 0.35 + crouch * 0.25 * (1 - rise);
        // Rocks forward twice to build up momentum, sinks into the push, rises, then settles.
        lean += Math.sin(Math.PI * 2 * callback(0.46, 0.62)) * 0.08;
        if (scalarValue > 0.6 && !braced) {
          braced = true;
          kick(0.55);
        }
        if (scalarValue > 0.86 && !stoodUp) {
          stoodUp = true;
          kick(0.9);
          velocity.wob += 1.8;
        }
        if (scalarValue < 0.5) {
          stoodUp = false;
          braced = false;
        }
      }
      // Upright in the suit, a `sit` is a crouch: knees bend and the hips sink over the feet (the
      // landing, the wind-up before a burst), not the authored seat that swings the legs out in front.
      let crouch = 0;
      if (pose2.getUp <= 0 && pose2.armour > 0.5 && lie < 0.5) {
        crouch = sit;
        sit = 0;
      }
      crouch = Math.min(1, crouch + landK * 0.55);

      // ── Springs: what the director asks for, with weight. Arms overshoot a little.
      spring('guard', pose2.guard, 9 * rate, 0.75, snap);
      spring(
        'punch',
        pose2.punch,
        (pose2.punch > cur.punch ? 11 : 6) * rate,
        0.62,
        snap,
      );
      spring(
        'lean',
        lean + tense * 0.07 + slug * 0.06 + crouch * 0.38,
        6 * rate,
        0.8,
        snap,
      );
      spring('hold', pose2.hold, 5 * rate, 0.85, snap);
      spring('dangle', pose2.dangle, 4.5, 0.7, snap);
      spring('stride', pose2.stride, 5 * rate, 1, snap);
      spring('h0', pose2.head[0], 7 * rate, 0.7, snap);
      spring('h1', pose2.head[1], 7 * rate, 0.7, snap);
      spring('h2', pose2.head[2], 7 * rate, 0.7, snap);
      // Facing: big jumps (a new shot) snap; anything else turns the body round with lag, the
      // head leading into the turn.
      let yawErr = Math.atan2(
        Math.sin(pose2.yaw - cur.yaw),
        Math.cos(pose2.yaw - cur.yaw),
      );
      if (snap || Math.abs(yawErr) > 1.6) {
        cur.yaw = pose2.yaw;
        velocity.yaw = 0;
        yawErr = 0;
      } else {
        const width = 5 * rate;
        velocity.yaw +=
          (yawErr * width * width - 2 * 0.9 * width * velocity.yaw) *
          deltaSeconds;
        cur.yaw += velocity.yaw * deltaSeconds;
      }
      // Turning on the spot shuffles the feet.
      const turning =
        Math.min(1, Math.abs(velocity.yaw) * 1.4) *
        (1 - cur.stride) *
        upright *
        (1 - cur.dangle);
      if (turning > 0.05) shuffle += deltaSeconds * 7 * Math.max(0.4, turning);
      const shuffleAmp = turning * 0.35;

      // ── Steps: footfalls kick the shell's jiggle; the weight rolls over the stance foot.
      const stride = cur.stride,
        gait = pose2.gait;
      const step = Math.floor(gait / Math.PI);
      if (step !== lastStep) {
        if (stride > 0.2 && !snap) kick(0.35 + slug * 0.35 + stride * 0.2);
        lastStep = step;
      }
      spring('squash', 0, 9, 0.28, false);
      const swing = Math.sin(gait) * stride + Math.sin(shuffle) * shuffleAmp;
      const heavy = 1 + slug * 0.7;

      // Suit knees: soft at rest, folding through the swing (the leg moving forward), hanging when airborne.
      const knee = (scaleFactor: number) =>
        (1 - sit) *
        (1 - lie) *
        (0.1 +
          stride * 0.85 * Math.max(0, -scaleFactor * Math.cos(gait)) +
          cur.dangle * 0.35 +
          crouch * 1.45 +
          hover * (0.12 + 0.06 * Math.sin(timeSeconds * 1.3 + scaleFactor)));
      // Legs: sitting ↔ standing, the stride, the dangle when airborne; kept vertical under a lean.
      const legLean = cur.lean * (1 - sit) * (1 - lie) * 0.85;
      hips.forEach((group, index) => {
        const state = index === 0 ? 1 : -1;
        group.rotation.x =
          (1 - sit) * (1.42 + state * swing * 0.45 - cur.dangle * 0.18) -
          legLean -
          tuck * 0.6 * sit +
          sweep * 0.35 +
          cur.flail * Math.sin(timeSeconds * 8 + index * Math.PI) * 0.32 +
          cur.flop * 0.12 -
          crouch * (1 - lie) * 0.95 +
          hover * (Math.sin(timeSeconds * 1.3 + index * 1.9) * 0.06 - 0.08) +
          choke * 0.18;
        // Heavy steps swing out round the hip a little (more under the limit).
        group.rotation.z =
          -state * cur.dangle * 0.06 -
          state * brace * 0.05 -
          state * Math.max(0, state * Math.cos(gait)) * stride * 0.05 * heavy;
      });
      ankles.forEach((group, index) => {
        const state = index === 0 ? 1 : -1;
        group.rotation.x =
          -(1 - sit) * 1.42 +
          cur.dangle * 0.55 +
          Math.max(0, -state * swing) * 0.3 +
          tuck * 0.4;
      });

      // Arms: hanging, guard, punch, hold; combat tremor; the sluggish droop; get-up push and brace.
      const tremor = tense * Math.sin(timeSeconds * 29) * 0.012;
      const sag =
        slug * (0.18 + 0.1 * Math.max(0, Math.sin(timeSeconds * 0.9)));
      shoulders.forEach((sh, index) => {
        const right = index === 1,
          state = right ? 1 : -1;
        const guard = cur.guard * (1 - slug * 0.3);
        const fwd =
          guard * (0.55 + tense * 0.1) +
          (right ? cur.punch * 1.05 : -cur.punch * 0.25) +
          (!right ? cur.hold * 0.5 : 0) +
          Math.sin(gait - 0.5 + (right ? 0 : Math.PI)) * stride * 0.24 * heavy -
          sag * (1 - guard) +
          tremor +
          cur.flail * (0.9 + 0.4 * Math.sin(timeSeconds * 9 + index * 2)) -
          push * 0.9 +
          brace * 0.25 +
          pose2.overhead * 2.7 -
          choke * 0.75 +
          lungeK * (right ? 0.5 : 0.3) +
          crouch * 0.3 * (1 - guard);
        // Lying, the arms rest back along the ground.
        sh.rotation.x =
          -fwd + lie * (1 - cur.hold) * 0.35 + sweep * 0.6 + cur.flop * 0.28;
        sh.rotation.z =
          state *
          (sweep * 0.12 +
            cur.flail * (0.35 + 0.3 * Math.sin(timeSeconds * 7 + index)) +
            guard * 0.2 +
            cur.dangle * 0.32 +
            (!right ? cur.hold * 0.55 : 0) +
            push * 0.2 +
            brace * 0.32 -
            sag * 0.05 +
            tense * 0.04 +
            choke * 0.32 +
            hover * (0.08 + 0.05 * Math.sin(timeSeconds * 1.1 + index)));
        sh.rotation.y = -state * guard * 0.2;
      });

      // Body: lean, the weight shift and roll over the stance foot, the jiggle.
      const shift = Math.sin(gait) * stride * 0.075 * heavy;
      body.rotation.set(
        cur.lean * (1 - lie) -
          (lie * Math.PI) / 2 +
          cur.pitch +
          Math.abs(Math.sin(gait)) * stride * 0.03 * heavy +
          (lungeK * 0.3 - choke * 0.22) * (1 - lie),
        0,
        (Math.sin(gait) * stride * 0.07 * heavy +
          Math.sin(shuffle) * shuffleAmp * 0.04 +
          cur.wob * 0.09) *
          (1 - lie) +
          cur.bank,
      );
      body.position.set(shift * (1 - lie), 0, lie * 0.9);
      const sq = cur.squash;
      body.scale.set(1 + sq * 0.03, 1 - sq * 0.045, 1 + sq * 0.03);
      // Find the lowest point of the shell (not the jets or the bay) and sit it on the ground.
      root.rotation.y = cur.yaw;
      root.updateMatrixWorld(true);
      if (headNode) {
        const lead = THREE.MathUtils.clamp(yawErr * 0.55, -0.5, 0.5);
        headNode.rotation.set(
          headBase.x +
            cur.h0 +
            tense * 0.1 +
            slug * 0.1 +
            tuck * 0.3 -
            push * 0.1 +
            Math.sin(gait * 2 - 0.8) * stride * 0.035 -
            cur.flail * 0.25 -
            cur.pitch * 0.4 -
            choke * 0.3 +
            Math.sin(timeSeconds * 47) * choke * 0.05 +
            crouch * 0.12,
          headBase.y + cur.h1 + lead,
          headBase.z * (1 - cur.guard) + cur.h2,
        );
      }
      model.updateMatrixWorld(true);
      // Pose the suit from this rig: shoulder pivots (side +1 is his left), hips (relative to straight down), head.
      if (pose.armour > 0) {
        headRest.setFromEuler(headBase).invert();
        armoured.drive({
          armL: qA.setFromEuler(shoulders[1].rotation),
          armR: qB.setFromEuler(shoulders[0].rotation),
          // The suit's thighs are far bigger than the white legs: a shorter swing, and the knee folds
          // as each leg comes through, so the plates don't drive up into his belly (tracker R-04/R-05).
          legL: qC.setFromEuler(
            rotationEuler.set(
              (hips[1].rotation.x - 1.42) * 0.7,
              0,
              hips[1].rotation.z,
            ),
          ),
          legR: qD.setFromEuler(
            rotationEuler.set(
              (hips[0].rotation.x - 1.42) * 0.7,
              0,
              hips[0].rotation.z,
            ),
          ),
          kneeL: knee(-1),
          kneeR: knee(1),
          head: headNode
            ? qH.setFromEuler(headNode.rotation).multiply(headRest)
            : undefined,
          // Elbows: bent up in guard, straightening into a punch or reaching overhead.
          // Guard: forearms forward and a little up, a ready stance rather than hands in the air (tracker S-06).
          elbowL:
            0.3 +
            cur.guard * 0.45 -
            cur.punch * 0.6 -
            pose2.overhead * 0.2 +
            cur.flail * 0.3,
          elbowR:
            0.3 +
            cur.guard * 0.45 -
            cur.hold * 0.5 -
            pose2.overhead * 0.2 +
            cur.flail * 0.3,
        });
      }
      if (pose.armour > 0.5 && !unseatBay)
        unseatBay = armoured.seatOnPlate(bay.root, 0.2, 0.2, 0.235, 1.2);
      if (pose.armour <= 0.5 && unseatBay) {
        unseatBay();
        unseatBay = null;
      }
      if (unseatBay && !feed) buildFeed();
      if (feed) feed.visible = limiter.visible;
      root.updateMatrixWorld(true);
      root.getWorldPosition(worldOrigin);
      const delta = (
        pose.armour > 0.5 ? armourContact : whiteContact
      ).correction(worldOrigin.y, floor);
      // Translate in world up even on a tilted ramp. Compression belongs in knees/body scale,
      // never in a negative Y offset added after the feet have been grounded.
      correction.copy(worldOrigin);
      correction.y += delta;
      root.worldToLocal(correction);
      body.position.add(correction);
      if (pose2.dangle > 0.1 && root.position.y > 0.2)
        body.position.y += Math.max(
          0,
          hover *
            (Math.sin(timeSeconds * 2.4) * 0.025 +
              Math.sin(timeSeconds * 1.05 + 1) * 0.02),
        );
      root.updateMatrixWorld(true);
      eyeMat.color
        .copy(pose2.eyes)
        .multiplyScalar(
          (1 +
            pose2.eyeGlow *
              (0.8 + tense * 0.25 * (0.5 + 0.5 * Math.sin(timeSeconds * 6)))) *
            (1 -
              Math.min(0.7, choke) *
                (Math.sin(timeSeconds * 53) > 0 ? 0.8 : 0)),
        );
      pose2.getUp = 0;
      pose2.tension = 0;
      pose2.sluggish = 0;
      // Jets: power, with a broken stutter when the limit starves them.
      const stutter =
        pose2.sputter > 0
          ? Math.sin(timeSeconds * 41) * Math.sin(timeSeconds * 13.7) > 0.1
            ? 1
            : 0.15
          : 1;
      const power =
        pose2.thrust *
        THREE.MathUtils.lerp(
          1,
          stutter * (0.35 + 0.25 * Math.sin(timeSeconds * 9)),
          pose2.sputter,
        );
      flameMat.uniforms.uTime.value = timeSeconds;
      flameMat.uniforms.uPower.value = power;
      flames.forEach((material) => {
        material.visible = power > 0.02;
        material.scale.y =
          (material.parent === model ? 1 : 0.8) * (0.5 + power * 0.9);
      });
      const jetStep = Math.min(0.1, Math.max(0, timeSeconds - jetAt));
      jetAt = timeSeconds;
      jetLevel =
        power * 9 >= jetLevel
          ? power * 9
          : THREE.MathUtils.damp(jetLevel, power * 9, 11, jetStep);
      jetLight.intensity = jetLevel < 0.01 ? 0 : jetLevel;
      // The bay: its own authored opening; the combat chip's glow grows into the missing piece.
      const pulse = pose2.chipGlow * (1 + 0.45 * Math.sin(timeSeconds * 4));
      bay.update({
        t: timeSeconds,
        open: pose2.open,
        seated: pose2.chipInBay && !pose2.careSeated ? 1 : 0,
        red: pose2.careSeated ? 0 : Math.min(1, 0.9 + pulse * 0.1),
        seamGlow: pose2.careSeated ? 0.05 : 0.12 + pulse * 0.6,
      });
      // Ground contact moved the whole actor after drive(). Keep the fragment cutout on the
      // live dock, otherwise solid chest plating appears inside the open canonical bay.
      armoured.updateChestHole(0.235 * bay.root.getWorldScale(worldOrigin).x);
      combatChip.visible = pose2.chipInBay && pose2.open > 0.4;
    },
    dispose() {
      feed?.traverse((sceneObject) => {
        if (sceneObject instanceof THREE.Mesh) sceneObject.geometry.dispose();
      });
      feedMat.dispose();
      collarMat.dispose();
      regulatorMount.dispose();
      limiter.dispose();
      disposeArmourCores();
      armoured.dispose();
      bay.dispose();
      flameGeo.dispose();
      flameMat.dispose();
      eyeMat.dispose();
      root.removeFromParent();
    },
  };
}
export type Baymax = Awaited<ReturnType<typeof createBaymax>>;
