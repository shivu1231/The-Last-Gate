import * as THREE from 'three';
import { BAYMAX_SCALE as BS } from './baymax';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { buildSanFransokyo } from '../environment/SanFransokyoSkyline';
import { chipOutline } from '../characters/RedChip.js';
import type { BaymaxPose as BaymaxPose } from './baymax';
import type { HiroPose } from '../characters/HiroModel';

/**
 * The other side: San Fransokyo as it should be, quiet at dusk. A small lawn on the waterfront,
 * a railing, the water, the bridge's red towers across the bay and the city lit beyond it.
 * Everything obeys gravity here. The same group is drawn through the open gate (into a render
 * target) and is then the set itself once they cross.
 *
 * HOME_GATE is where the gate opens on this side: the portal's centre maps onto it.
 */
export const HOME_GATE = new THREE.Vector3(0, 3.4, 7);
export const HOME_BAYMAX = new THREE.Vector3(-0.6, 0, 2.4);
/**
 * The healthcare chip came through ahead of them and landed in a harbour litter bin, poking out of
 * the top. The bin stands where the lawn meets the promenade path, a few metres off, and Hiro walks
 * over to it (tracker: the bin shouldn't sit right beside him as if put there for him).
 */
export const CARE_BIN_AT = new THREE.Vector3(3.4, 0, -2);
export const CARE_CHIP_AT = new THREE.Vector3(3.4, 0.9, -2);
const CARE_CHIP_TILT = new THREE.Euler(-0.35, 0, 0.5);

const SKY_FS = `varying vec3 vDir;void main(){float h=normalize(vDir).y;
vec3 top=vec3(.2,.17,.36);vec3 mid=vec3(.357,.294,.541);vec3 low=vec3(.98,.62,.45);vec3 glow=vec3(1.,.8,.6);
vec3 c=mix(low,mid,smoothstep(.0,.22,h));c=mix(c,top,smoothstep(.22,.7,h));
float sun=pow(max(0.,dot(normalize(vDir),normalize(vec3(-.25,.06,-1.)))),40.);
c+=glow*sun*.8+low*smoothstep(.08,-.05,h)*.2;gl_FragColor=vec4(c,1.);}`;
const WATER_FS = `varying vec2 vUv;varying vec3 vWorld;uniform float uTime;void main(){
float d=clamp(-vWorld.z/220.,0.,1.);vec3 near=vec3(.16,.16,.3);vec3 far=vec3(.85,.56,.48);
vec3 c=mix(near,far,pow(d,.7));
float streak=pow(max(0.,sin(vWorld.x*.9+sin(vWorld.z*.35+uTime*.6)*1.5)),18.)*(1.-d*.6);
float sunPath=exp(-pow((vWorld.x+.25*-vWorld.z*.25)/(6.+d*30.),2.))*d;
c+=vec3(1.,.75,.55)*(streak*.18+sunPath*.35*(.6+.4*sin(vWorld.z*1.3+uTime*1.4)));
gl_FragColor=vec4(c,1.);}`;

/**
 * Build the green healthcare card with the same keyed insertion outline.
 */
export function createCareChip(sceneKit: SceneKit) {
  // The healthcare chip: the combat chip's outline, soft green, a white cross.
  const chip = new THREE.Group();
  chip.name = 'care-chip';
  const body = sceneKit.ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#2f8f5f',
      roughness: 0.3,
      metalness: 0.5,
      clearcoat: 0.7,
      emissive: '#0d3a22',
      emissiveIntensity: 0.5,
    }),
  );
  const geometry = sceneKit.ownGeometry(
    new THREE.ExtrudeGeometry(chipOutline(), {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0028,
      bevelSegments: 3,
      curveSegments: 6,
    }),
  );
  geometry.translate(0, 0, -0.006);
  chip.add(new THREE.Mesh(geometry, body));
  const glow = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#9dffc8', toneMapped: false }),
  );
  const white = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#f7f4ef', toneMapped: false }),
  );
  for (const [width, height] of [
    [0.05, 0.014],
    [0.014, 0.05],
  ]) {
    const material = new THREE.Mesh(
      sceneKit.ownGeometry(new THREE.PlaneGeometry(width, height)),
      white,
    );
    material.position.set(-0.012, 0.03, 0.0095);
    chip.add(material);
  }
  const line = new THREE.Mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(0.0042, 0.15)),
    glow,
  );
  line.position.set(0.054, 0.004, 0.0094);
  chip.add(line);
  const gold = sceneKit.ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#d3a55c',
      roughness: 0.24,
      metalness: 1,
    }),
  );
  for (let index = 0; index < 7; index++) {
    const material2 = new THREE.Mesh(sceneKit.boxGeo, gold);
    material2.scale.set(0.011, 0.026, 0.0016);
    material2.position.set(-0.054 + index * 0.018, -0.088, 0.0088);
    chip.add(material2);
  }
  return { chip, glow, body };
}

/**
 * Build the final waterfront and the healthcare-chip retrieval area.
 */
export function createHome() {
  const sceneKit = new SceneKit('phase6-home');
  const random = seeded(1123),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  const warmStone = sceneKit.standard('#b8a690', 0.85, 0.02),
    lawn = sceneKit.standard('#4f6a4c', 0.95, 0),
    path = sceneKit.standard('#9b8f84', 0.9, 0.02);
  const rail = sceneKit.standard('#2f3640', 0.5, 0.6),
    vermilion = sceneKit.standard('#a8443a', 0.6, 0.2),
    city = sceneKit.standard('#5d6175', 0.9, 0.05);
  // Sky and water.
  const sky = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.SphereGeometry(400, 32, 16)),
    sceneKit.ownMaterial(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader:
          'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: SKY_FS,
      }),
    ),
    { p: [0, 0, 0] },
  );
  sky.renderOrder = -1;
  const waterMat = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      fog: false,
      vertexShader:
        'varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: WATER_FS,
    }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(600, 300)),
    waterMat,
    { p: [0, -1.2, -156], r: [-Math.PI / 2, 0, 0] },
  );
  // Lawn and promenade, the sea wall and its railing.
  sceneKit.box({ p: [0, -0.6, 6], s: [60, 1.2, 26] }, warmStone);
  sceneKit.box({ p: [0, 0.01, 4], s: [60, 0.03, 16] }, lawn);
  sceneKit.box({ p: [0, 0.02, -4.2], s: [60, 0.03, 3.6] }, path);
  sceneKit.box({ p: [0, -0.7, -6.3], s: [60, 1.4, 0.6] }, warmStone);
  for (let xPosition = -29; xPosition <= 29; xPosition += 2)
    sceneKit.box({ p: [xPosition, 0.55, -6.1], s: [0.06, 1.1, 0.06] }, rail);
  sceneKit.box({ p: [0, 1.1, -6.1], s: [60, 0.06, 0.08] }, rail);
  sceneKit.box({ p: [0, 0.6, -6.1], s: [60, 0.03, 0.04] }, rail);
  // Benches and lamps along the promenade, lit.
  const lamps: THREE.Vector3[] = [];
  for (const xPosition2 of [-12, -4, 6, 14]) {
    sceneKit.box({ p: [xPosition2, 2, -4.9], s: [0.1, 4, 0.1] }, rail);
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.SphereGeometry(0.2, 14, 10)),
      sceneKit.basic('#ffd29a', 1.6),
      { p: [xPosition2, 4.05, -4.9] },
    );
    lamps.push(new THREE.Vector3(xPosition2, 3.8, -4.6));
  }
  for (const xPosition3 of [-8, 10]) {
    sceneKit.box(
      { p: [xPosition3, 0.45, -3.4], s: [1.8, 0.08, 0.5] },
      sceneKit.standard('#7a5a44', 0.8, 0),
    );
    sceneKit.box(
      { p: [xPosition3, 0.75, -3.62], s: [1.8, 0.45, 0.06] },
      sceneKit.standard('#7a5a44', 0.8, 0),
    );
    for (const deltaX of [-0.75, 0.75])
      sceneKit.box(
        { p: [xPosition3 + deltaX, 0.22, -3.4], s: [0.06, 0.44, 0.45] },
        rail,
      );
  }
  // A cherry tree on the lawn, and petals in the air.
  sceneKit.box(
    { p: [-6.5, 1.4, 4], s: [0.3, 2.8, 0.3], r: [0, 0, 0.08] },
    sceneKit.standard('#4a3a32', 0.9, 0),
  );
  const blossom: ScenePlacement[] = [];
  for (let index = 0; index < 26; index++) {
    const firstValue = random() * Math.PI * 2,
      radius = randomBetween(0.2, 1.8);
    blossom.push({
      p: [
        -6.5 + Math.cos(firstValue) * radius,
        randomBetween(2.6, 4.2),
        4 + Math.sin(firstValue) * radius,
      ],
      s: [
        randomBetween(0.6, 1.1),
        randomBetween(0.5, 0.8),
        randomBetween(0.6, 1.1),
      ],
    });
  }
  sceneKit.instances(
    blossom,
    sceneKit.standard('#e8a8b8', 0.8, 0),
    sceneKit.sphereGeo,
  );
  const PETALS = 70,
    petalPos = new Float32Array(PETALS * 3);
  for (let index2 = 0; index2 < PETALS; index2++)
    petalPos.set(
      [randomBetween(-12, 6), randomBetween(0, 5), randomBetween(-4, 9)],
      index2 * 3,
    );
  const petalGeo = sceneKit.ownGeometry(new THREE.BufferGeometry());
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(
    petalGeo,
    sceneKit.ownMaterial(
      new THREE.PointsMaterial({
        color: '#f3c2cd',
        size: 0.06,
        sizeAttenuation: true,
      }),
    ),
  );
  sceneKit.root.add(petals);
  // Across the water: San Fransokyo at sunset (environment/SanFransokyoSkyline.ts).
  const sf = buildSanFransokyo(sceneKit, new THREE.Vector3(-0.25, 0.06, -1));
  // A tram line pole and overhead wire running along the promenade.
  for (const xPosition4 of [-20, 0, 20])
    sceneKit.box({ p: [xPosition4, 3, 11], s: [0.12, 6, 0.12] }, rail);
  sceneKit.line(
    [
      new THREE.Vector3(-30, 5.8, 11),
      new THREE.Vector3(0, 5.5, 11),
      new THREE.Vector3(30, 5.8, 11),
    ],
    '#2f3640',
    0.9,
  );

  // Light: low warm sun from across the water, dusk-purple sky fill, warm lamps.
  const hemi = new THREE.HemisphereLight('#b9a6d8', '#40353a', 1.15);
  sceneKit.root.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb07a', 2.2);
  sun.position.set(-20, 12, -40);
  sceneKit.root.add(sun);
  const back = new THREE.DirectionalLight('#8f86c9', 0.7);
  back.position.set(10, 8, 20);
  sceneKit.root.add(back);
  for (const point of lamps) {
    const light = new THREE.PointLight('#ffcf8a', 3, 9, 1.8);
    light.position.copy(point);
    sceneKit.root.add(light);
  }
  // Warm pools on the path under each lamp, and dusk haze over the water so the far shore sits in air.
  for (const point2 of lamps)
    sceneKit.haze(
      { p: [point2.x, 0.05, -4.4], s: [5.5, 4.2, 1], r: [-Math.PI / 2, 0, 0] },
      '#ffb46a',
      0.2,
    );
  sceneKit.haze({ p: [30, 6, -118], s: [520, 34, 1] }, '#ffb08a', 0.14);
  // The gate on this side, closing behind them.
  const gateMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: '#b9a6ff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const gate = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CircleGeometry(3.1, 64)),
    gateMat,
    { p: [HOME_GATE.x, HOME_GATE.y, HOME_GATE.z] },
  );
  const gateLight = new THREE.PointLight('#9a86e0', 0, 18, 1.6);
  gateLight.position.copy(HOME_GATE).add(new THREE.Vector3(0, 0, -1.5));
  sceneKit.root.add(gateLight);

  const care = createCareChip(sceneKit);
  // The bin: a slatted harbour litter bin with a lid ring; the chip sticks up out of the rubbish.
  const binMat = sceneKit.ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#2f4a44',
      roughness: 0.6,
      metalness: 0.4,
    }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(
      new THREE.CylinderGeometry(0.3, 0.26, 0.82, 16, 1, true),
    ),
    binMat,
    { p: [CARE_BIN_AT.x, 0.41, CARE_BIN_AT.z] },
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.TorusGeometry(0.3, 0.025, 8, 24)),
    binMat,
    { p: [CARE_BIN_AT.x, 0.83, CARE_BIN_AT.z], r: [Math.PI / 2, 0, 0] },
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CircleGeometry(0.29, 16)),
    sceneKit.ownMaterial(
      new THREE.MeshStandardMaterial({ color: '#3b3226', roughness: 1 }),
    ),
    { p: [CARE_BIN_AT.x, 0.78, CARE_BIN_AT.z], r: [-Math.PI / 2, 0, 0] },
  );
  care.chip.position.copy(CARE_CHIP_AT);
  care.chip.rotation.copy(CARE_CHIP_TILT);
  care.chip.scale.setScalar(1);
  sceneKit.root.add(care.chip);
  const careLight = new THREE.PointLight('#7dffb0', 0, 2.2, 2);
  careLight.position.copy(CARE_CHIP_AT).add(new THREE.Vector3(0, 0.25, 0));
  sceneKit.root.add(careLight);

  return {
    root: sceneKit.root,
    care,
    careLight,
    kit: sceneKit,
    background: new THREE.Color('#2a2440'),
    fog: new THREE.Fog('#b07f7e', 60, 480),
    update(
      timeSeconds: number,
      deltaSeconds: number,
      scaleFactor: { gate: number; careBlink: number },
    ) {
      waterMat.uniforms.uTime.value = timeSeconds;
      sf.update(timeSeconds, deltaSeconds);
      for (let index3 = 0; index3 < PETALS; index3++) {
        const elementIndex = index3 * 3;
        petalPos[elementIndex] +=
          deltaSeconds * (0.35 + Math.sin(timeSeconds + index3) * 0.1);
        petalPos[elementIndex + 1] -=
          deltaSeconds * (0.18 + (index3 % 5) * 0.03);
        petalPos[elementIndex + 2] +=
          Math.sin(timeSeconds * 0.7 + index3) * deltaSeconds * 0.1;
        if (petalPos[elementIndex + 1] < 0) {
          petalPos[elementIndex + 1] = 5;
          petalPos[elementIndex] = randomBetween(-12, 2);
        }
      }
      petalGeo.attributes.position.needsUpdate = true;
      gate.visible = scaleFactor.gate > 0.001;
      gateMat.opacity = scaleFactor.gate * 0.85;
      gate.scale.setScalar(Math.max(0.001, scaleFactor.gate));
      gateLight.intensity = scaleFactor.gate * 20;
      // The chip's last signal: a slow green pulse.
      const pulse =
        scaleFactor.careBlink *
        (0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(timeSeconds * 2.2)), 6));
      care.glow.color.set('#9dffc8').multiplyScalar(0.4 + pulse * 2.2);
      careLight.intensity = pulse * 2.4;
    },
    dispose() {
      sf.dispose();
      sceneKit.dispose();
    },
  };
}
/**
 * Data contract used by the final pursuit and restoration.
 */
export type Home = ReturnType<typeof createHome>;

// ─────────────────────────────────────────────────────────────── directing the home beat

const RED_OFF = new THREE.Color('#0b0f11'),
  CARE_WHITE = new THREE.Color('#f4f8ff');
const sm = (easedProgress: number, firstValue: number, secondValue: number) =>
  THREE.MathUtils.smoothstep(easedProgress, firstValue, secondValue);
const vector = (xPosition: number, yPosition: number, zPosition: number) =>
  new THREE.Vector3(xPosition, yPosition, zPosition);
/** Where Hiro kneels at Baymax's side (clear of his arm), and where he steps back to as he gets up. */
export const HIRO_KNEEL = new THREE.Vector3(
  HOME_BAYMAX.x + 2.5 * BS + 0.25,
  0,
  HOME_BAYMAX.z + 0.35 * BS,
);
/** Where Hiro stands at the bin, on his side of it. */
const BIN_SPOT = CARE_BIN_AT.clone().add(
  HIRO_KNEEL.clone().sub(CARE_BIN_AT).setY(0).setLength(0.6),
);
/** The fetch (care 'fetch'): up off his knee, over to the bin, the chip out of it, and a jog back to him. */
const F_RISE = 0.6,
  F_OUT = 2.8,
  F_PICK = 0.9,
  F_BACK = 2,
  F_KNEEL = 0.6,
  F_HOME = F_RISE + F_OUT + F_PICK;
export const FETCH_PICK = F_RISE + F_OUT + 0.45,
  FETCH_END = F_HOME + F_BACK + F_KNEEL;
/** Turn from heading a to b by k, the short way round. */
const turn = (firstValue: number, secondValue: number, blendFactor: number) =>
  firstValue +
  (((((secondValue - firstValue + Math.PI * 3) % (Math.PI * 2)) + Math.PI * 2) %
    (Math.PI * 2)) -
    Math.PI) *
    blendFactor;
export const HIRO_STAND = new THREE.Vector3(
  HOME_BAYMAX.x + 2.75 * BS + 0.45,
  0,
  HOME_BAYMAX.z - 1.05 * BS,
);
/** Where Hiro steps in to for the fist bump. */
export const HIRO_BUMP = new THREE.Vector3(
  HOME_BAYMAX.x + 1.65 * BS + 0.3,
  0,
  HOME_BAYMAX.z - 1.55 * BS,
);

/**
 * Data contract used by the final pursuit and restoration.
 */
export type HomeCast = {
  baymax: {
    root: THREE.Object3D;
    pose: BaymaxPose;
    dock: THREE.Object3D;
    handWorld(out?: THREE.Vector3): THREE.Vector3;
    headWorld(out?: THREE.Vector3): THREE.Vector3;
  };
  hiro: {
    root: THREE.Object3D;
    pose: HiroPose;
    handWorld(out?: THREE.Vector3): THREE.Vector3;
  };
};
/**
 * Data contract used by the final pursuit and restoration.
 */
export type HomeShot = {
  stage: string;
  e: number;
  t: number;
  dt: number;
  care: 'ground' | 'fetch' | 'hand' | 'open' | 'seated';
  fetch: number;
  dragPos: THREE.Vector3;
  returning: number;
  camera: THREE.Camera;
  bayOpen: number;
};

/**
 * Everything the home set does each frame: the gate closing, the healthcare chip on the grass (or
 * in the hand, or seated in his dock), Baymax and Hiro, and where the camera wants to be.
 *
 *   home    Baymax on his back, Hiro kneeling at his side; the chip waits on the grass.
 *   seated  the chip is in; Hiro waits with a hand on him.
 *   boot    the bay closes; his eyes come on with the chime; Hiro gets up and steps back; Baymax
 *           gets up in stages (sits up, settles, leans over his feet, pushes up, wobbles still);
 *           he looks down at Hiro; fist bump.
 *   end     the two of them at the rail, the city across the water at sunset.
 *
 * Returns the camera target and lens; `cue` fires the sounds the moment they happen.
 */
const bumpFix = new THREE.Vector3();
/** Hiro over to the bin and back: walks out, reaches in for the chip, jogs back and kneels again. */
function fetchWalk(
  factor: number,
  hiro: HomeCast['hiro'],
  pose: HomeCast['hiro']['pose'],
  look: THREE.Vector3,
  deltaSeconds: number,
  cue: { step(level: number): void },
) {
  const out = sm(factor, F_RISE, F_RISE + F_OUT),
    back = sm(factor, F_HOME, F_HOME + F_BACK);
  const at = HIRO_KNEEL.clone().lerp(BIN_SPOT, out).lerp(HIRO_KNEEL, back);
  hiro.root.position.copy(at);
  const going = out > 0 && out < 1,
    coming = back > 0 && back < 1,
    rate = going ? 8.5 : 12;
  pose.kneel =
    1 - sm(factor, 0, F_RISE) + sm(factor, FETCH_END - F_KNEEL, FETCH_END);
  pose.stride = going ? 0.55 : coming ? 0.75 : 0;
  pose.walk = going
    ? (factor - F_RISE) * rate
    : coming
      ? (factor - F_HOME) * rate
      : 0;
  if (
    (going || coming) &&
    Math.floor(pose.walk / Math.PI) !==
      Math.floor((pose.walk - deltaSeconds * rate) / Math.PI)
  )
    cue.step(0.15);
  // Facing: round to the bin, at it, then back the way he came, and round to Baymax as he kneels.
  const toBin = Math.atan2(CARE_BIN_AT.x - at.x, CARE_BIN_AT.z - at.z),
    toHim = Math.atan2(HIRO_KNEEL.x - BIN_SPOT.x, HIRO_KNEEL.z - BIN_SPOT.z);
  pose.yaw =
    factor < F_HOME - 0.1
      ? turn(-Math.PI / 2, toBin, sm(factor, 0.2, F_RISE + 0.4))
      : turn(toBin, toHim, sm(factor, F_HOME - 0.1, F_HOME + 0.3));
  if (factor > FETCH_END - F_KNEEL - 0.3)
    pose.yaw = turn(
      toHim,
      -Math.PI / 2,
      sm(factor, FETCH_END - F_KNEEL - 0.3, FETCH_END),
    );
  // At the bin: a look down into it and a reach in; then the chip held in front of him on the way back.
  const dip =
    sm(factor, F_RISE + F_OUT - 0.1, FETCH_PICK) *
    (1 - sm(factor, FETCH_PICK + 0.15, F_HOME));
  pose.reach = Math.max(dip * 0.9, factor > FETCH_PICK ? 0.35 : 0);
  pose.lookUp = -0.1 - 0.35 * dip;
  pose.look = 0;
  // The camera keeps him in view.
  look.lerp(
    at.setY(0.8),
    0.45 * sm(factor, 0, 1) * (1 - sm(factor, FETCH_END - 1, FETCH_END)),
  );
}
/**
 * Stage the home sequence by updating its existing actor poses and camera targets.
 */
export function directHome(
  home: Home,
  cast: HomeCast,
  state: HomeShot,
  cue: { chime(): void; step(level: number): void; done(): void },
  camPos: THREE.Vector3,
  look: THREE.Vector3,
) {
  const { baymax, hiro } = cast,
    pose = baymax.pose,
    pose2 = hiro.pose;
  const { stage, e: easedProgress, t: timeSeconds, dt: deltaSeconds } = state;
  home.update(timeSeconds, deltaSeconds, {
    gate: 0,
    careBlink: state.care === 'seated' ? 0 : 1,
  });
  baymax.root.position.copy(HOME_BAYMAX);
  Object.assign(pose, {
    armour: 1,
    yaw: Math.PI,
    lie: 1,
    sit: 0,
    guard: 0,
    open: state.bayOpen,
    chipInBay: false,
    eyeGlow: 0,
    careSeated: state.care === 'seated',
  });
  pose.eyes.copy(RED_OFF);
  hiro.root.position.copy(HIRO_KNEEL);
  Object.assign(pose2, {
    yaw: -Math.PI / 2,
    kneel: 1,
    look: -0.15,
    lookUp: -0.25,
    reach: 0,
    walk: 0,
    stride: 0,
    bump: 0,
  });
  camPos.set(6.4, 3.5, 5.2);
  look.set(-0.7, 0.8, 2.9);
  let fov = 44,
    shot = stage;

  // The healthcare chip: on the grass, in the hand, sliding back, or seated in his dock.
  const care = home.care.chip;
  if (state.care !== 'seated') {
    // In Hiro's hand once he's taken it out of the bin; then following the pointer to the open socket.
    if (
      state.care === 'hand' ||
      (state.care === 'fetch' && state.fetch >= FETCH_PICK)
    ) {
      hiro.handWorld(care.position);
      care.lookAt(state.camera.position);
      care.scale.setScalar(1.3);
    } else if (state.care === 'open') {
      care.position.copy(state.dragPos);
      care.lookAt(state.camera.position);
      care.scale.setScalar(1.3);
    } else {
      care.position.copy(CARE_CHIP_AT);
      care.rotation.copy(CARE_CHIP_TILT);
      care.scale.setScalar(1);
    }
    home.careLight.position.copy(care.position).add(vector(0, 0.25, 0));
    if (stage === 'home') {
      // Coming through: the camera settles as Hiro drops to his knee beside him.
      camPos
        .set(3, 3.8, 11.5)
        .lerp(vector(6.4, 3.5, 5.2), sm(easedProgress, 0, 3.5));
      look
        .set(-0.5, 0.8, 1.5)
        .lerp(vector(-0.7, 0.8, 2.9), sm(easedProgress, 0, 3.5));
      pose2.kneel = sm(easedProgress, 0.8, 2.4);
      pose2.reach =
        state.care === 'ground'
          ? 0.35 * sm(easedProgress, 2, 3)
          : state.care === 'hand'
            ? 0.55
            : 0.7;
      pose2.lookUp = -0.3;
      // Until he has it, a wider shot that takes in the bin by the path as well.
      if (state.care === 'ground' || state.care === 'fetch') {
        camPos
          .set(3, 3.8, 11.5)
          .lerp(vector(7.4, 3.6, 5.4), sm(easedProgress, 0, 3.5));
        look
          .set(-0.5, 0.8, 1.5)
          .lerp(vector(0.9, 0.7, 1), sm(easedProgress, 0, 3.5));
      }
      if (state.care === 'fetch') {
        fetchWalk(state.fetch, hiro, pose2, look, deltaSeconds, cue);
        // Placed again now he's moved: the chip goes where his hand is, not where he knelt.
        if (state.fetch >= FETCH_PICK) {
          hiro.root.updateMatrixWorld(true);
          hiro.handWorld(care.position);
          care.lookAt(state.camera.position);
          home.careLight.position.copy(care.position).add(vector(0, 0.25, 0));
        }
      }
    }
    return { fov, shot };
  }
  if (care.parent !== baymax.dock) {
    baymax.dock.add(care);
    care.position.set(0, 0, 0.004);
    care.rotation.set(0, 0, 0);
    care.scale.setScalar(1);
  }
  pose.careSeated = true;
  if (stage === 'seated') {
    pose2.reach = 0.55;
    pose2.lookUp = -0.2;
    return { fov, shot };
  }

  // boot / end. `be` runs on past the end of boot so the end holds the final pose.
  const be = stage === 'end' ? 40 : easedProgress;
  // 0–1.6 the bay closes. 1.9 eyes on, chime.
  pose.open = 4.6 * (1 - sm(be, 0.2, 1.6));
  const eyesOn = sm(be, 1.9, 2.9);
  // Healthcare online: clear the combat finish on the same body before he gets up.
  pose.armour = 1 - sm(be, 2.1, 4.4);
  pose.eyes.copy(RED_OFF).lerp(CARE_WHITE, eyesOn);
  pose.eyeGlow = eyesOn * 0.25;
  if (stage === 'boot' && be > 1.95 && be - deltaSeconds <= 1.95) cue.chime();
  // 2.0–3.4 his head lifts a little off the grass: he looks for who's there.
  pose.head[0] = -0.12 * sm(be, 2.2, 3.2) * (1 - sm(be, 4.4, 5.4));
  pose.head[1] = -0.35 * sm(be, 2.4, 3.4) * (1 - sm(be, 4.2, 5));
  // 4.4–10.4 the get-up.
  const scalarValue = THREE.MathUtils.clamp((be - 4.4) / 6, 0, 1);
  if (scalarValue > 0) pose.getUp = scalarValue;
  if (scalarValue >= 1) {
    pose.lie = 0;
    pose.sit = 0;
    pose.getUp = 0;
    pose.lean = 0;
  }
  // 10.6–12 he looks down at Hiro, head tilted. 12.4–14.2 the fist bump.
  const lookDown = sm(be, 10.6, 12);
  pose.head[0] += 0.22 * lookDown;
  pose.head[1] -= 0.38 * lookDown;
  pose.head[2] = -0.22 * lookDown * (1 - sm(be, 13.5, 14.5) * 0.5);
  const bump = sm(be, 12.6, 13.8) * (1 - sm(be, 15.2, 16.4) * 0.7);
  pose.hold = bump * 0.68;

  // Hiro: kneeling with a hand on his shell; at the chime he sits back; 3.0–4.2 he gets up and
  // 3.6–5.2 walks back out of reach as Baymax starts to move; watches him rise; steps in for
  // the bump.
  const getUpH = sm(be, 3, 4.2),
    back = sm(be, 3.6, 5.2),
    stepIn = sm(be, 12, 13.2);
  pose2.kneel = 1 - getUpH;
  pose2.reach = 0.4 * (1 - sm(be, 1.2, 2.2));
  const at = HIRO_KNEEL.clone().lerp(HIRO_STAND, back).lerp(HIRO_BUMP, stepIn);
  // The bump: Hiro's fist is steered onto Baymax's (measured last frame), so the two actually meet.
  const bumpK = sm(be, 12.9, 13.7) * (1 - sm(be, 15.2, 16.4));
  if (bumpK > 0.05 || bumpFix.lengthSq() > 0) {
    const gap = baymax.handWorld().sub(hiro.handWorld());
    gap.y = 0;
    bumpFix
      .addScaledVector(
        gap,
        Math.min(1, deltaSeconds * 6) * Math.min(1, bumpK * 2),
      )
      .clampLength(0, 0.8);
    if (be < 12) bumpFix.set(0, 0, 0);
  }
  at.add(bumpFix);
  hiro.root.position.copy(at);
  // Walking: legs move only while he is actually travelling.
  const moving = (back > 0 && back < 1) || (stepIn > 0 && stepIn < 1);
  pose2.stride = moving ? 0.55 : 0;
  pose2.walk = (be - 3.6) * 6.5;
  // Facing: toward Baymax's middle (or his fist for the bump).
  const target =
    stepIn > 0
      ? baymax.handWorld()
      : baymax.root.position.clone().add(vector(0, 0, -0.4));
  pose2.yaw =
    Math.atan2(target.x - at.x, target.z - at.z) -
    (back > 0 && back < 1 ? 0.5 * Math.sin(Math.PI * back) : 0);
  pose2.lookUp =
    THREE.MathUtils.lerp(-0.2, 0.15, sm(be, 1.9, 2.6)) +
    0.7 * sm(be, 5, 8) -
    0.2 * stepIn;
  pose2.bump = bumpK * 1.3;
  if (
    stage === 'boot' &&
    Math.floor(pose2.walk / Math.PI) !==
      Math.floor((pose2.walk - deltaSeconds * 6.5) / Math.PI) &&
    moving
  )
    cue.step(0.15);

  // Camera: in front, low, his face and Hiro beside him as he comes up; then wider for the bump.
  camPos.set(3.4, 2.1, -7.6).lerp(vector(2.3, 2.7, -9.4), sm(be, 4, 10));
  look.set(-1.2, 1.4, 2).lerp(vector(-1.3, 2, 2), sm(be, 4, 10));
  if (be > 11.8) {
    camPos.lerp(vector(0.9, 2, -6.9), sm(be, 11.8, 13.4));
    look.lerp(vector(-1.7, 1.8, 1.2), sm(be, 11.8, 13.4));
  }
  fov = 40;
  if (stage === 'end') {
    // Behind the two of them, high and wide: side by side, looking out over the rail at the city.
    hiro.root.position.set(
      HOME_BAYMAX.x + 1.75 * BS + 0.3,
      0,
      HOME_BAYMAX.z - 0.5 * BS,
    );
    Object.assign(pose2, {
      yaw: Math.PI,
      stride: 0,
      bump: 0,
      lookUp: 0.05,
      look: 0.25,
      kneel: 0,
      reach: 0,
    });
    pose.hold = 0;
    pose.head[0] = 0.08;
    pose.head[1] = -0.3;
    pose.head[2] = -0.12;
    camPos
      .set(5.2, 4.6, 15.5)
      .lerp(vector(4.4, 5.6, 17.5), sm(easedProgress, 0, 20));
    look.set(-6, 7, -60);
    fov = 46;
    shot = 'end';
  }
  if (stage === 'boot' && be > 17) cue.done();
  return { fov, shot };
}
