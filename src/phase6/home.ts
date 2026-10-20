import * as THREE from 'three';
import { BAYMAX_SCALE as BS } from './baymax';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { buildSanFransokyo } from '../environment/SanFransokyoSkyline';
import { dressHome } from './homeDressing';
import {
  buildLitterBin,
  buildParkBench,
  furnitureMaterials,
} from './streetFurniture';
import { worldSurfaces, worldMapped } from '../presentation/WorldSurfaces';
import { chipOutline } from '../characters/RedChip.js';
import type { BaymaxPose as BaymaxPose } from './baymax';
import type { HiroPose } from '../characters/HiroModel';
import type { HandPose } from '../characters/RegulatorController';

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
export const CARE_CHIP_AT = new THREE.Vector3(3.4, 0.8, -2);
const CARE_CHIP_TILT = new THREE.Euler(-0.95, 0.3, 0.42);

const SKY_FS = `varying vec3 vDir;void main(){float h=normalize(vDir).y;
vec3 top=vec3(.085,.12,.23);vec3 mid=vec3(.27,.33,.49);vec3 low=vec3(.80,.68,.60);vec3 glow=vec3(1.,.88,.76);
vec3 c=mix(low,mid,smoothstep(.0,.22,h));c=mix(c,top,smoothstep(.22,.7,h));
float sun=pow(max(0.,dot(normalize(vDir),normalize(vec3(-.25,.06,-1.)))),40.);
c+=glow*sun*.55+low*smoothstep(.08,-.05,h)*.12;gl_FragColor=vec4(c,1.);}`;
const WATER_FS = `varying vec2 vUv;varying vec3 vWorld;uniform float uTime;void main(){
float d=clamp(-vWorld.z/220.,0.,1.);vec3 near=vec3(.09,.12,.2);vec3 far=vec3(.6,.56,.58);
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
  const surface = worldSurfaces(sceneKit);
  worldMapped(warmStone, surface.stone, 2);
  const furniture = furnitureMaterials(sceneKit, surface),
    furnitureRandom = seeded(7741);
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
      sceneKit.basic('#ffe2bd', 1.5),
      { p: [xPosition2, 4.05, -4.9] },
    );
    lamps.push(new THREE.Vector3(xPosition2, 3.8, -4.6));
  }
  // Park benches facing the water (streetFurniture.ts). The one nearer the bin carries a plate.
  for (const xPosition3 of [-8, 10]) {
    const bench = buildParkBench(
      sceneKit,
      furniture,
      furnitureRandom,
      xPosition3 > 0 ? ['IN MEMORY OF TADASHI HAMADA', 'HE LOVED THIS VIEW'] : undefined,
    );
    bench.position.set(xPosition3, 0, -3.4);
    bench.rotation.y = Math.PI;
    sceneKit.root.add(bench);
  }
  // A cherry tree on the lawn, and petals in the air: a tapered trunk that forks into the crown.
  const cherryBark = sceneKit.standard('#4a3a32', 0.9, 0);
  const limb = sceneKit.ownGeometry(
    new THREE.CylinderGeometry(0.09, 0.17, 1, 8).translate(0, 0.5, 0),
  );
  for (const [height, tiltX, tiltZ, scale] of [
    [2.5, 0, 0.08, 1],
    [1.5, 0.5, -0.45, 0.62],
    [1.4, -0.55, 0.35, 0.58],
    [1.3, 0.1, 0.7, 0.55],
  ])
    sceneKit.mesh(limb, cherryBark, {
      p: [-6.5 + (scale < 1 ? 0.1 : 0), scale < 1 ? 2.1 : 0, 4],
      s: [scale, height, scale],
      r: [tiltX, 0, tiltZ],
    });
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
  // Around the edges: the street, houses, trees and furniture of a lived-in waterfront (homeDressing.ts).
  dressHome(sceneKit, { lawn, path });
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

  // Light: a low warm-neutral sun across the water rims the pair; a cool dusk sky fills them from
  // the city side and the lamps add small warm pools. The warmth reads against the corrupted world,
  // not from an orange grade.
  const hemi = new THREE.HemisphereLight('#a7b6d2', '#3a3836', 0.66);
  sceneKit.root.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd9bd', 2.1);
  sun.position.set(-20, 12, -40);
  sceneKit.root.add(sun);
  const back = new THREE.DirectionalLight('#c3cee3', 0.98);
  back.position.set(10, 8, 20);
  sceneKit.root.add(back);
  for (const point of lamps) {
    const light = new THREE.PointLight('#ffdcb0', 2.4, 9, 1.8);
    light.position.copy(point);
    sceneKit.root.add(light);
  }
  // Warm pools on the path under each lamp, and dusk haze over the water so the far shore sits in air.
  for (const point2 of lamps)
    sceneKit.haze(
      { p: [point2.x, 0.05, -4.4], s: [5.5, 4.2, 1], r: [-Math.PI / 2, 0, 0] },
      '#ffd6a6',
      0.11,
    );
  sceneKit.haze({ p: [30, 6, -118], s: [520, 34, 1] }, '#c9bdb8', 0.1);
  // The gate on this side, closing behind them.
  const gateMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: '#b4c4ff',
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
  const gateLight = new THREE.PointLight('#a3b6ec', 0, 18, 1.6);
  gateLight.position.copy(HOME_GATE).add(new THREE.Vector3(0, 0, -1.5));
  sceneKit.root.add(gateLight);

  const care = createCareChip(sceneKit);
  // The bin: a harbour litter bin (streetFurniture.ts), its plate turned to the way Hiro comes from;
  // the chip sticks up out of the rubbish in the middle.
  const { bin } = buildLitterBin(sceneKit, furniture, furnitureRandom);
  bin.position.set(CARE_BIN_AT.x, 0, CARE_BIN_AT.z);
  bin.rotation.y = Math.atan2(
    HIRO_KNEEL.x - CARE_BIN_AT.x,
    HIRO_KNEEL.z - CARE_BIN_AT.z,
  );
  sceneKit.root.add(bin);
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
    background: new THREE.Color('#1b2236'),
    fog: new THREE.Fog('#8a8e9e', 70, 520),
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
/** Where Hiro kneels at Baymax's side (clear of his arm). */
export const HIRO_KNEEL = new THREE.Vector3(
  HOME_BAYMAX.x + 2.5 * BS + 0.25,
  0,
  HOME_BAYMAX.z + 0.35 * BS,
);
/** Where Hiro stands at the bin, on his side of it. */
export const BIN_SPOT = CARE_BIN_AT.clone().add(
  HIRO_KNEEL.clone().sub(CARE_BIN_AT).setY(0).setLength(0.6),
);
/** Where Hiro steps back to, out of reach, as Baymax gets up. */
export const HIRO_STAND = new THREE.Vector3(
  HOME_BAYMAX.x + 2.75 * BS + 0.45,
  0,
  HOME_BAYMAX.z - 1.05 * BS,
);
/** First-person kneel and step-back spots: the eye sits further out than the old third-person body
 * did, so kneeling beside him frames his chest and face instead of filling the lens with his arm. */
const FP_KNEEL = HIRO_KNEEL.clone().add(new THREE.Vector3(0.7, 0, 0.1));
const FP_STAND = new THREE.Vector3(HOME_BAYMAX.x + 2.3, 0, HOME_BAYMAX.z - 2.1);
/** From his offered fist, the way Hiro stands to bump it: in front of him and to his right. */
const BUMP_FROM = new THREE.Vector3(0.55, 0, -0.85).normalize();
/** Where Hiro stands at the bin in first person: far enough back to see into it, not down a well. */
const BIN_EYE_SPOT = CARE_BIN_AT.clone().add(
  HIRO_KNEEL.clone().sub(CARE_BIN_AT).setY(0).setLength(0.78),
);
/** At the rail after the bump: Hiro at the railing, Baymax a step back on his left, both facing the water. */
export const RAIL_HIRO = new THREE.Vector3(HOME_BAYMAX.x + 1.9, 0, -5.45);
export const RAIL_BAYMAX = new THREE.Vector3(HOME_BAYMAX.x, 0, -4.7);
/** The railing's top bar, where Hiro's hand comes to rest. */
const RAIL_TOP = new THREE.Vector3(RAIL_HIRO.x - 0.12, 1.1, -6.1);
/** Kneeling and standing eye heights. */
const EYE_KNEEL = 0.95,
  EYE_STAND = 1.56;
/** The boot waits on Baymax's raised fist (his hold peaks here) until the player bumps it. */
export const BUMP_WAIT = 13.8;
/**
 * Boot time with the bump gate in it: it runs to BUMP_WAIT and holds there on his offered fist
 * until the bump, then carries on from the moment of the bump.
 */
export const bootTime = (since: number, bumpT: number) =>
  bumpT < 0 ? Math.min(since, BUMP_WAIT) : BUMP_WAIT + bumpT;

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
  care: 'ground' | 'hand' | 'open' | 'seated';
  dragPos: THREE.Vector3;
  /** Where the healthcare chip sits in Hiro's pinch (first person) while he carries it. */
  heldPos: THREE.Vector3;
  returning: number;
  camera: THREE.Camera;
  bayOpen: number;
  /** Seconds since the bump (-1 before it). */
  bumpT: number;
  /** 0..1 along the walk to the rail, and whether Hiro is walking right now. */
  rail: number;
  railMoving: boolean;
};

/**
 * Everything the home set does each frame for Baymax, the healthcare chip and (for the closing
 * credits only) Hiro's body and the camera. Otherwise Hiro is the camera: see directHomeEyes.
 *
 *   home    Baymax on his back; the chip waits in the bin, then is in Hiro's hand, then the socket.
 *   seated  the chip is in.
 *   boot    the bay closes; his eyes come on with the chime; he gets up in stages (sits up,
 *           settles, leans over his feet, pushes up, wobbles still); he looks down at Hiro and
 *           offers his fist, and holds it there until the bump; then he walks to the rail with him.
 *   end     the credits: behind the two of them at the rail, the city across the water at sunset.
 *
 * Returns the third-person lens for the credits shot; `cue` fires the chime.
 */
export function directHome(
  home: Home,
  cast: HomeCast,
  state: HomeShot,
  cue: { chime(): void },
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
    stride: 0,
  });
  pose.eyes.copy(RED_OFF);
  let fov = 44,
    shot = stage;

  // The healthcare chip: in the bin, in Hiro's pinch, following the pointer, or seated in his dock.
  const care = home.care.chip;
  if (state.care !== 'seated') {
    if (state.care === 'hand' || state.care === 'open') {
      care.position.copy(state.care === 'hand' ? state.heldPos : state.dragPos);
      care.lookAt(state.camera.position);
      care.scale.setScalar(1);
    } else {
      care.position.copy(CARE_CHIP_AT);
      care.rotation.copy(CARE_CHIP_TILT);
      care.scale.setScalar(1);
    }
    home.careLight.position.copy(care.position).add(vector(0, 0.25, 0));
    return { fov, shot };
  }
  if (care.parent !== baymax.dock) {
    baymax.dock.add(care);
    care.position.set(0, 0, 0.004);
    care.rotation.set(0, 0, 0);
    care.scale.setScalar(1);
  }
  pose.careSeated = true;
  if (stage === 'seated') return { fov, shot };

  // boot / end. `be` holds on his offered fist until the bump, and runs on into the end.
  const be = stage === 'end' ? 40 : bootTime(easedProgress, state.bumpT);
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
  // 10.6–12 he looks down at Hiro, head tilted. 12.6–13.8 he holds out his fist, and keeps it there.
  // After the bump: a little wiggle of the fist (his ba-la-la-la), then it comes down.
  const lookDown = sm(be, 10.6, 12);
  pose.head[0] += 0.22 * lookDown;
  pose.head[1] -= 0.38 * lookDown;
  pose.head[2] = -0.22 * lookDown * (1 - sm(be, 13.5, 14.5) * 0.5);
  const wiggle =
    state.bumpT > 0.45 && state.bumpT < 1.45
      ? Math.sin((state.bumpT - 0.45) * 26) * 0.07 * (1.45 - state.bumpT)
      : 0;
  pose.hold = sm(be, 12.6, 13.8) * (1 - sm(be, 15.2, 16.4)) * 0.68 + wiggle;

  // The walk to the rail: he goes with Hiro, a step behind on his left, at Hiro's pace.
  if (state.rail > 0) {
    const along = sm(state.rail, 0, 1);
    baymax.root.position.copy(HOME_BAYMAX).lerp(RAIL_BAYMAX, along);
    pose.stride = state.railMoving && along < 1 ? 0.5 : 0;
    pose.gait = along * HOME_BAYMAX.distanceTo(RAIL_BAYMAX) * 3.4;
    pose.head[0] = THREE.MathUtils.lerp(pose.head[0], 0.04, along);
    pose.head[1] = THREE.MathUtils.lerp(pose.head[1], -0.28, along);
    pose.head[2] = THREE.MathUtils.lerp(pose.head[2], -0.1, along);
  }

  if (stage === 'end') {
    // The credits: behind the two of them, high, side by side at the rail, the city beyond.
    baymax.root.position.copy(RAIL_BAYMAX);
    pose.hold = 0;
    pose.head[0] = 0.08;
    pose.head[1] = -0.3;
    pose.head[2] = -0.12;
    hiro.root.position.copy(RAIL_HIRO);
    Object.assign(pose2, {
      yaw: Math.PI,
      kneel: 0,
      walk: 0,
      stride: 0,
      bump: 0,
      lookUp: 0.05,
      look: 0.25,
      reach: 0.25,
    });
    camPos
      .set(4.8, 4.2, 6.8)
      .lerp(vector(4.1, 5, 8.8), sm(easedProgress, 0, 20));
    look.set(-6, 7, -60);
    fov = 46;
    shot = 'end';
  }
  return { fov, shot };
}

/** What Hiro's right hand does this frame (see FirstPersonHands): a pose, a point to reach for, how far. */
export type HomeHand = {
  pose: HandPose | null;
  track: THREE.Vector3 | null;
  k: number;
  reach: number;
};
/**
 * Inputs to Hiro's eyes on the home set. Progress values are the player's own walking (0..1 along
 * each leg) and the eased stand/kneel; positions are this frame's live world points.
 */
export type HomeEyesIn = {
  stage: string;
  /** home: seconds since he came clear of the gate; seated/boot: seconds into the stage. */
  e: number;
  care: HomeShot['care'];
  /** Where his feet were when the crossing ended. */
  from: THREE.Vector3;
  stand: number;
  out: number;
  back: number;
  kneel: number;
  rail: number;
  bumpT: number;
  /** Seconds at the rail (-1 before). */
  railT: number;
  /** Where he stood when he bumped (the rail walk starts there). */
  bumpFeet: THREE.Vector3 | null;
  /** 0..1 of a hold on the chip or his chest. */
  hold: number;
  chip: THREE.Vector3;
  dock: THREE.Vector3;
  head: THREE.Vector3;
  fist: THREE.Vector3;
  guide: THREE.Vector3;
};
/**
 * Hiro's eyes after the crossing: where his feet are, his eye height, what he looks at and how much
 * the player may look around it, and what his right hand does. The camera rig (fp.ts) adds the
 * walk, the breath and the free look on top.
 */
export function directHomeEyes(input: HomeEyesIn) {
  const feet = new THREE.Vector3(),
    look = new THREE.Vector3(),
    hand: HomeHand = { pose: null, track: null, k: 0, reach: 0 };
  let eye = EYE_KNEEL,
    lookRate = 3,
    freeLook = 0.55;
  const level = (point: THREE.Vector3, height: number) =>
    point.clone().setY(height);

  if (input.stage === 'home') {
    const he = input.e;
    if (input.care === 'ground') {
      // Out of the gate and down on one knee beside him; then up and over to the bin.
      feet
        .copy(input.from)
        .lerp(FP_KNEEL, sm(he, 0, 1.8))
        .lerp(BIN_EYE_SPOT, input.out)
        // Leaning in over the rim as he reaches.
        .lerp(BIN_SPOT, 0.35 * input.hold);
      eye = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(1.46, EYE_KNEEL, sm(he, 1.2, 2.4)),
        EYE_STAND,
        input.stand,
      ) -
        0.18 * input.hold;
      // His face first; at Hiro's line, the green light over by the bin; walking, the bin itself.
      look
        .copy(input.head)
        .lerp(level(input.chip, 0.7), sm(he, 2.6, 3.6))
        .lerp(
          input.chip.clone().add(vector(0, 0.12 * (1 - input.hold), 0)),
          sm(input.out, 0.7, 1),
        );
      if (input.hold > 0 && input.out > 0.98) {
        hand.pose = 'pinch';
        hand.track = input.chip;
        hand.k = input.hold;
        hand.reach = input.hold;
        freeLook = 0.2;
      }
    } else {
      // Chip in hand: back to him, down on one knee, a hand on his chest, then the socket.
      feet.copy(BIN_EYE_SPOT).lerp(FP_KNEEL, input.back);
      eye = THREE.MathUtils.lerp(EYE_STAND, EYE_KNEEL, input.kneel);
      look.copy(input.dock).lerp(input.head, 0.25 * (1 - input.kneel));
      hand.pose = 'pinch';
      hand.reach = 0.85;
      if (input.care === 'hand' && input.hold > 0 && input.kneel > 0.9) {
        hand.pose = 'press';
        hand.track = input.dock;
        hand.k = input.hold;
        hand.reach = 0.55 + 0.45 * input.hold;
      }
      if (input.care === 'open') {
        hand.track = input.guide;
        hand.k = 1;
        hand.reach = 1;
        look.copy(input.dock);
        freeLook = 0.15;
      }
    }
    return { feet, eye, look, lookRate, freeLook, hand };
  }

  if (input.stage === 'seated') {
    feet.copy(FP_KNEEL);
    look.copy(input.dock).lerp(input.head, 0.4);
    hand.pose = 'press';
    hand.track = input.dock;
    hand.k = 0.8;
    hand.reach = 0.8;
    return { feet, eye, look, lookRate, freeLook, hand };
  }

  // boot: a hand on his shell as the bay closes; up and back as he starts to move; watching him
  // rise; stepping in to his fist; the bump; then the walk to the rail beside him.
  const be = bootTime(input.e, input.bumpT);
  const resting = 1 - sm(be, 1.2, 2.2);
  if (resting > 0) {
    hand.pose = 'press';
    hand.track = input.dock;
    hand.k = resting * 0.8;
    hand.reach = resting * 0.8;
  }
  eye = THREE.MathUtils.lerp(EYE_KNEEL, EYE_STAND, sm(be, 3, 4.2));
  feet.copy(FP_KNEEL).lerp(FP_STAND, sm(be, 3.6, 5.2));
  // In for the bump: in front of him and to his right, a long arm's length off his fist, so his
  // arm, his fist and his face are all in view; Hiro leans in to meet it.
  const bumpSpot = level(input.fist, 0).addScaledVector(BUMP_FROM, 1.2);
  const standing = input.bumpFeet ?? bumpSpot;
  feet.lerp(standing, sm(be, 12, 13.2));
  if (input.bumpT >= 0)
    feet.lerp(
      level(input.fist, 0),
      0.42 * sm(input.bumpT, 0, 0.4) * (1 - sm(input.bumpT, 0.6, 1.4)),
    );
  look.copy(input.dock).lerp(input.head, sm(be, 1.6, 2.6));
  look.lerp(input.fist.clone().lerp(input.head, 0.3), sm(be, 12.4, 13.4));
  lookRate = 2.6;
  if (input.bumpT >= 0) {
    const t = input.bumpT;
    hand.pose = t < 0.55 ? 'fist' : t < 1.4 ? 'open' : null;
    hand.track = input.fist;
    hand.k = sm(t, 0, 0.42) * (1 - sm(t, 0.6, 1.3));
    hand.reach = hand.k;
    look.lerp(input.head, sm(t, 0.8, 1.8));
  }
  if (input.rail > 0) {
    // Walking to the rail beside him: eyes on the water and the city, a glance at him going.
    feet.copy(standing).lerp(RAIL_HIRO, input.rail);
    look
      .copy(input.head)
      .lerp(vector(RAIL_HIRO.x - 3, 3, -60), sm(input.rail, 0, 0.35));
    eye = EYE_STAND;
    lookRate = 2.2;
    freeLook = 0.7;
  }
  if (input.railT >= 0) {
    look.set(-6, 7, -60).lerp(input.head, 0.18 * sm(input.railT, 1.2, 2.4));
    hand.pose = 'grip';
    hand.track = RAIL_TOP;
    hand.k = sm(input.railT, 0.2, 1);
    hand.reach = hand.k;
    freeLook = 0.85;
  }
  return { feet, eye, look, lookRate, freeLook, hand };
}
