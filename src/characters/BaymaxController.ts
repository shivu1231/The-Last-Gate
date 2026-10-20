import {
  Box3,
  CatmullRomCurve3,
  Euler,
  type Material,
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { BAYMAX_POSITION } from '../config/experience';
import type { Phase } from '../state/SceneStateManager';
import type { SequenceDirector } from '../systems/SequenceDirector';
import { createChestAccess } from './ChestAccess.js';
import {
  createArmouredBaymax,
  mountArmour,
  type ArmouredBaymax,
} from './SolidArmour';
import { createSurfaceContact, LATER_BAYMAX_SCALE } from './LaterBaymax';

/** After the combat chip takes over: plated. It assembles during 'corrupting' (tracker P1-01). */
const ARMOURED: Phase[] = [
  'threat',
  'ignition',
  'chase',
  'fracture',
  'pulled',
  'handoff',
];

const ease = (inputValue: number) => MathUtils.smoothstep(inputValue, 0, 1);
const span = (inputValue: number, startValue: number, endValue: number) =>
  MathUtils.smoothstep(inputValue, startValue, endValue);
/** A single smooth pulse between a and b (0 → 1 → 0). */
const bump = (inputValue: number, startValue: number, endValue: number) =>
  Math.sin(
    Math.PI *
      MathUtils.clamp(
        (inputValue - startValue) / (endValue - startValue),
        0,
        1,
      ),
  );
/** A sharp jolt at a, decaying (the combat program loading in hits). */
const jolt = (timeSeconds: number, firstValue: number, decay = 7) =>
  timeSeconds < firstValue
    ? 0
    : Math.exp(-(timeSeconds - firstValue) * decay) *
      Math.sin((timeSeconds - firstValue) * 38);
/** Shortest signed difference between two angles, so turns never go the long way round. */
const wrap = (firstValue: number) =>
  Math.atan2(Math.sin(firstValue), Math.cos(firstValue));
const HEAD_YAW = 1.05,
  HEAD_PITCH_UP = 0.45,
  HEAD_PITCH_DOWN = 0.6;
const DOWN = new Vector3(0, -1, 0);
const DORMANT_HEAD = { x: 0.24, y: 0, z: -0.12 };
/**
 * Authored controls consumed by the opening Baymax rig.
 */
type BaymaxMotionPose = {
  pos: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  head: Vector3;
  look: number;
  arm: number;
  aim: Vector3;
  thrust: number;
  inflate: number;
  stand: number;
};
/** Standing straightens the legs under him; the body rises by this much to keep the feet grounded. */
const LEG_SWING = 1.45;

/**
 * Paint a radial alpha falloff for the glow sprites.
 */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const drawingContext = canvas.getContext('2d')!;
  const group = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  group.addColorStop(0, 'rgba(255,255,255,1)');
  group.addColorStop(0.25, 'rgba(255,255,255,.5)');
  group.addColorStop(1, 'rgba(255,255,255,0)');
  drawingContext.fillStyle = group;
  drawingContext.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/**
 * Baymax stays Baymax: every motion is damped, weighted and slow to start. What changes is
 * intent. Corruption is carried by eyes, armour, chest light and posture, never by twitching.
 */
export class BaymaxController {
  readonly chest: ReturnType<typeof createChestAccess>;
  private head: Object3D | null = null;
  private eyes: Mesh[] = [];
  private eyeGlow: Sprite[] = [];
  private armR = new Group();
  private armL = new Group();
  private legR = new Group();
  private legL = new Group();
  private elbowR = new Group();
  private elbowL = new Group();
  private ankleR = new Group();
  private ankleL = new Group();
  private standLift = 0.89 * LATER_BAYMAX_SCALE;
  private armor: MeshPhysicalMaterial;
  private skin: MeshPhysicalMaterial;
  private redLight = new PointLight('#ff2a1c', 0, 7, 1.6);
  private thruster = new Group();
  private flame: ShaderMaterial;
  private thrusterGlow: Sprite;
  private footJets: Mesh[] = [];
  private hand = new Object3D();
  private charge: Sprite;
  private pose: BaymaxMotionPose;
  private target: BaymaxMotionPose;
  private phase: Phase = 'loading';
  private phaseTime = 0;
  private beat: string | null = null;
  // Motion memory for the flight layer (bank, trailing legs) and squash/stretch impulses.
  private prevPos = new Vector3();
  private prevYaw = 0;
  private bank = 0;
  private stretch = 0;
  private moved = false;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private q = new Quaternion();
  private q2 = new Quaternion();
  private eyeColor = new Color();
  private beatCamera = new Vector3();
  private beatOrigin = new Vector3();
  private passCurve = new CatmullRomCurve3([
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ]);
  private hole = {
    uHoleCenter: { value: new Vector3() },
    uHoleNormal: { value: new Vector3(0, 0, 1) },
    uHoleRadius: { value: 0.196 },
    uHoleOpen: { value: 0 },
  };
  // The armoured suit (tracker PW-03), loaded in the background and mounted on the shell.
  private suit?: ArmouredBaymax;
  private suitBaseY = 0;
  private wasCovered = false;
  private white?: Mesh[];
  private suitStandY = 0;
  private box = new Box3();
  private eul = new Euler();
  private qs = [
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
  ];
  private contact: ReturnType<typeof createSurfaceContact>;
  constructor(public readonly shell: Group) {
    shell.position.set(...BAYMAX_POSITION);
    shell.rotation.order = 'YXZ';
    shell.rotation.y = -0.18;
    shell.name = 'Baymax';
    shell.scale.setScalar(LATER_BAYMAX_SCALE);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const drawingContext = canvas.getContext('2d')!;
    drawingContext.fillStyle = '#bbbbbb';
    drawingContext.fillRect(0, 0, 128, 128);
    for (let yPosition = 0; yPosition < 128; yPosition += 4)
      for (let xPosition = 0; xPosition < 128; xPosition += 4) {
        const sampleValue =
          178 + Math.sin(xPosition * 0.31 + yPosition * 0.2) * 5;
        drawingContext.fillStyle = `rgb(${sampleValue},${sampleValue},${sampleValue})`;
        drawingContext.fillRect(xPosition, yPosition, 4, 4);
      }
    const roughness = new CanvasTexture(canvas);
    roughness.wrapS = roughness.wrapT = RepeatWrapping;
    roughness.repeat.set(3, 3);
    this.skin = new MeshPhysicalMaterial({
      name: 'inflatable',
      color: '#f6f8fa',
      roughness: 0.79,
      roughnessMap: roughness,
      metalness: 0,
      sheen: 0.3,
      sheenColor: new Color('#eef4f8'),
      sheenRoughness: 0.9,
      clearcoat: 0.02,
      envMapIntensity: 0.45,
    });
    this.armor = new MeshPhysicalMaterial({
      name: 'armor',
      color: '#8c1531',
      roughness: 0.3,
      metalness: 0.48,
      clearcoat: 0.28,
      clearcoatRoughness: 0.36,
      envMapIntensity: 0.65,
      emissive: '#ff1d12',
      emissiveIntensity: 0,
    });
    const meshes: Mesh[] = [];
    shell.traverse((object) => {
      if (object.name === 'dormant-head') this.head = object;
      if (object instanceof Mesh && !Array.isArray(object.material)) {
        meshes.push(object);
        if (object.material.name === 'inflatable') object.material = this.skin;
        else if (object.material.name === 'armor') object.material = this.armor;
        // GLTFLoader de-duplicates names (dormant-eye, dormant-eye_1).
        if (object.name.startsWith('dormant-eye')) this.eyes.push(object);
        // The baked access port is replaced by the articulated bay below.
        if (object.name === 'access-panel' || object.name === 'access-ring')
          object.visible = false;
      }
    });
    // Eyes bypass tone mapping so corruption reads as a clean crimson, not a blown-out orange.
    this.eyes.forEach((eye) => {
      const material = (eye.material as MeshBasicMaterial).clone();
      material.toneMapped = false;
      eye.material = material;
    });
    if (this.head) this.head.rotation.order = 'YXZ';
    // Arms hinge at the shoulder: upper arm, forearm, hand and fingers are separate shapes.
    for (const [side, pivot] of [
      [1, this.armR],
      [-1, this.armL],
    ] as const) {
      pivot.position.set(side * 1.02, 2.26, 0.02);
      shell.add(pivot);
      const elbow = side === 1 ? this.elbowR : this.elbowL;
      elbow.position.set(side * 0.17, -1.08, 0.18);
      pivot.add(elbow);
      shell.updateMatrixWorld(true);
      for (const material2 of meshes) {
        const position = material2.position,
          scaleX = side * position.x;
        const upper =
            Math.abs(scaleX - 1.12) < 0.06 && Math.abs(position.y - 1.7) < 0.06,
          fore =
            Math.abs(scaleX - 1.23) < 0.06 &&
            Math.abs(position.y - 0.82) < 0.06;
        const hand =
            Math.abs(scaleX - 1.25) < 0.06 &&
            Math.abs(position.y - 0.35) < 0.06,
          finger =
            scaleX > 1.0 &&
            scaleX < 1.5 &&
            Math.abs(position.y - 0.29) < 0.03 &&
            position.z > 0.7;
        const shoulder =
          Math.abs(scaleX - 0.93) < 0.06 && Math.abs(position.y - 2.3) < 0.06;
        if (upper || shoulder) pivot.attach(material2);
        else if (fore || hand || finger) elbow.attach(material2);
      }
    }
    // Legs hinge at the hip: thigh, armoured foot and sole. Seated, they point forward; standing
    // and in flight they swing down under him, so he can rise and fly rather than float seated.
    for (const [side, pivot] of [
      [1, this.legR],
      [-1, this.legL],
    ] as const) {
      pivot.position.set(side * 0.53, 0.55, 0.28);
      shell.add(pivot);
      const ankle = side === 1 ? this.ankleR : this.ankleL;
      ankle.name = side === 1 ? 'ankle-left' : 'ankle-right';
      ankle.position.set(side * 0.18, -0.27, 0.86);
      pivot.add(ankle);
      shell.updateMatrixWorld(true);
      for (const material3 of meshes) {
        const position2 = material3.position,
          scaleX2 = side * position2.x;
        const thigh =
          Math.abs(scaleX2 - 0.57) < 0.06 &&
          Math.abs(position2.y - 0.48) < 0.06 &&
          Math.abs(position2.z - 0.76) < 0.08;
        const foot =
          Math.abs(scaleX2 - 0.71) < 0.06 &&
          (Math.abs(position2.y - 0.26) < 0.06 ||
            Math.abs(position2.y - 0.04) < 0.06) &&
          position2.z > 1.2;
        if (thigh) pivot.attach(material3);
        else if (foot) ankle.attach(material3);
      }
    }
    this.hand.position.set(0.23, -1.95, 0.62);
    this.armR.add(this.hand);
    shell.updateMatrixWorld(true);
    this.elbowR.attach(this.hand);
    const glow = glowTexture();
    // Medical access bay, seated on the surface normal of the chest curve.
    // The iris leaves keep an unpatched copy of the skin; only the body is cut open.
    this.chest = createChestAccess(this.skin.clone());
    this.skin.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.hole);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vHoleWorld;',
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvHoleWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vHoleWorld;uniform vec3 uHoleCenter;uniform vec3 uHoleNormal;uniform float uHoleRadius;uniform float uHoleOpen;',
        )
        .replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif(uHoleOpen>.5){vec3 hd=vHoleWorld-uHoleCenter;float along=dot(hd,uHoleNormal);if(length(hd-along*uHoleNormal)<uHoleRadius&&along>-.35&&along<.1)discard;}',
        );
    };
    this.skin.customProgramCacheKey = () => 'baymax-skin-hole';
    this.chest.root.position.set(0.42, 2.05, 0.642);
    this.chest.root.quaternion.setFromUnitVectors(
      new Vector3(0, 0, 1),
      new Vector3(0.4, 0.34, 1).normalize(),
    );
    shell.add(this.chest.root);
    if (this.head) {
      for (const eye of this.eyes) {
        const sceneObject = new Sprite(
          new SpriteMaterial({
            map: glow,
            color: '#9fe4ff',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: AdditiveBlending,
          }),
        );
        sceneObject.position.copy(eye.position).add(new Vector3(0, 0, 0.03));
        sceneObject.scale.setScalar(0.2);
        this.head.add(sceneObject);
        this.eyeGlow.push(sceneObject);
      }
    }
    this.redLight.position.set(0.1, 2.9, 1.2);
    shell.add(this.redLight);
    // Back thruster: a short, hot cone and a soft bloom source; dormant until ignition.
    this.flame = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPower: { value: 0 }, uTime: { value: 0 } },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 vUv;uniform float uPower;uniform float uTime;void main(){float life=vUv.y;float core=pow(1.-life,1.4);float flutter=.83+.17*sin(uTime*47.+life*23.);vec3 c=mix(vec3(.13,.35,1.),vec3(.9,.97,1.),core*core);float alpha=core*flutter*uPower*.72;gl_FragColor=vec4(c*(.7+core)*uPower,alpha);}',
    });
    // Wide at the nozzle, tapering away. The previous reversed cone looked like a white ribbon.
    const jetGeometry = new ConeGeometry(0.2, 1.3, 20, 1, true);
    jetGeometry.rotateX(-Math.PI / 2);
    jetGeometry.translate(0, 0, -0.65);
    const cone = new Mesh(jetGeometry, this.flame);
    this.thruster.add(cone);
    for (const ankle of [this.ankleR, this.ankleL]) {
      const boot = ankle.children.find(
        (sceneObject2) =>
          sceneObject2 instanceof Mesh && sceneObject2.name.startsWith('boot-'),
      ) as Mesh | undefined;
      const jet = new Mesh(jetGeometry, this.flame);
      jet.rotation.x = -Math.PI / 2;
      jet.scale.setScalar(0.78);
      if (boot) {
        boot.geometry.computeBoundingBox();
        shell.updateMatrixWorld(true);
        jet.position.copy(
          ankle.worldToLocal(
            boot.localToWorld(
              new Vector3(0, boot.geometry.boundingBox!.min.y - 0.025, 0),
            ),
          ),
        );
      }
      ankle.add(jet);
      this.footJets.push(jet);
    }
    this.thrusterGlow = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: '#93bfff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.thrusterGlow.scale.setScalar(1.3);
    this.thruster.add(this.thrusterGlow);
    // Angled down and back so the jet lifts him as well as driving him forward.
    this.thruster.position.set(0, 1.95, -0.82);
    this.thruster.rotation.x = -0.75;
    shell.add(this.thruster);
    this.charge = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: '#ff6b55',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.charge.scale.setScalar(0.01);
    this.hand.add(this.charge);
    const rest = (): BaymaxMotionPose => ({
      pos: new Vector3(...BAYMAX_POSITION),
      yaw: -0.18,
      pitch: 0,
      roll: 0,
      head: new Vector3(DORMANT_HEAD.x, DORMANT_HEAD.y, DORMANT_HEAD.z),
      look: 0,
      arm: 0,
      aim: new Vector3(),
      thrust: 0,
      inflate: 0,
      stand: 0,
    });
    this.pose = rest();
    this.target = rest();
    this.contact = createSurfaceContact(meshes);
    // Match the later rig: ankles counter-rotate the hips so feet remain feet,
    // rather than turning into long vertical capsules when he stands or flies.
    this.legR.rotation.x = this.legL.rotation.x = LEG_SWING;
    this.ankleR.rotation.x = this.ankleL.rotation.x = -LEG_SWING;
    shell.updateMatrixWorld(true);
    this.standLift = Math.max(0, this.contact.correction(-0.14));
    this.legR.rotation.x =
      this.legL.rotation.x =
      this.ankleR.rotation.x =
      this.ankleL.rotation.x =
        0;
    shell.updateMatrixWorld(true);
  }

  /** The dock in world space, for the chip and camera. */
  dockWorld() {
    return this.chest.dockWorld();
  }
  dockQuaternion(out: Quaternion) {
    return this.chest.dock.getWorldQuaternion(out);
  }
  chestFrame(position: Vector3, normal: Vector3) {
    this.chest.root.getWorldPosition(position);
    normal
      .set(0, 0, 1)
      .applyQuaternion(this.chest.root.getWorldQuaternion(this.q2))
      .normalize();
  }

  private suitReady?: Promise<void>;
  /** Load and mount the armoured suit once. The boot warm-up awaits it, so parsing it never stalls the intro (tracker Q-02). */
  prepareSuit() {
    if (this.suitReady) return this.suitReady;
    return (this.suitReady = createArmouredBaymax({
      shell: this.shell,
      eye: this.eyes[0]?.material as Material | undefined,
      hole: () => (this.chest.holeOpen ? this.dockWorld() : null),
    })
      .then((group) => {
        mountArmour(group, this.shell, { y: 0.55, z: 0.28 }, 2.42);
        this.suitBaseY = group.root.position.y;
        this.suit = group;
      })
      .catch(() => {
        /* stays white if the suit can't load */
      }));
  }
  update(
    time: number,
    deltaSeconds: number,
    reduced: boolean,
    phase: Phase,
    seq: SequenceDirector,
    camera: Vector3,
  ) {
    if (phase !== this.phase) {
      this.phase = phase;
      this.phaseTime = 0;
    }
    this.phaseTime += deltaSeconds * seq.slowmo;
    const timeSeconds = this.phaseTime,
      pose = this.target;
    void this.prepareSuit();
    const armourK =
      phase === 'inserting'
        ? span(timeSeconds, 1.1, 2.2)
        : phase === 'silence' ||
            phase === 'booting' ||
            phase === 'diagnostic' ||
            phase === 'corrupting' ||
            ARMOURED.includes(phase)
          ? 1
          : 0;
    this.restPose(pose);
    if (
      phase === 'awakening' ||
      phase === 'approaching' ||
      phase === 'loading'
    ) {
      pose.aim.set(0, 0, 0);
      this.snap();
    }
    // ---------------------------------------------------------------- shell + boot
    let open = 0,
      seal = 0,
      seated = 0,
      seamGlow = 0,
      eyeOn = 0;
    const after = (list: Phase[]) => list.includes(phase);
    if (phase === 'panel-opening') open = timeSeconds;
    if (after(['socket-ready', 'inserting', 'silence'])) open = 4.6;
    if (phase === 'inserting') seated = span(timeSeconds, 0.55, 1.1);
    if (phase === 'silence') {
      seated = 1;
      seamGlow = timeSeconds > 1.25 && timeSeconds < 1.42 ? 0.35 : 0;
    }
    if (phase === 'booting') {
      open = 4.6;
      seated = 1;
      seal = span(timeSeconds, 0.2, 1.5);
      pose.inflate = span(timeSeconds, 1.3, 2.9);
      pose.pos.y += span(timeSeconds, 1.3, 2.9) * 0.035;
      pose.roll = span(timeSeconds, 1.6, 3) * 0.018;
      pose.head.set(
        MathUtils.lerp(DORMANT_HEAD.x, 0.04, span(timeSeconds, 2.1, 3.7)),
        0,
        MathUtils.lerp(DORMANT_HEAD.z, 0, span(timeSeconds, 2.1, 3.7)),
      );
      eyeOn = span(timeSeconds, 3.5, 3.75);
      seamGlow =
        span(timeSeconds, 1.4, 2) * 0.45 * (1 - span(timeSeconds, 3, 4.2));
      // Systems coming online: a shiver through the shell, a hand twitches, a first deep breath
      // that overshoots, and a small double-take as his eyes light and find Hiro.
      pose.roll +=
        Math.sin(timeSeconds * 31) * 0.006 * bump(timeSeconds, 1.5, 2.7);
      pose.arm =
        0.07 * bump(timeSeconds, 2.3, 2.7) +
        0.05 * bump(timeSeconds, 2.85, 3.2);
      pose.inflate += 0.05 * bump(timeSeconds, 2.5, 3.6);
      this.lookAt(camera, pose, span(timeSeconds, 3.2, 4.6) * 0.9);
      pose.head.y += 0.09 * bump(timeSeconds, 3.6, 4.5);
    }
    if (
      after([
        'diagnostic',
        'corrupting',
        'threat',
        'ignition',
        'chase',
        'fracture',
        'pulled',
        'handoff',
      ])
    ) {
      open = 4.6;
      seated = 1;
      seal = 1;
      pose.inflate = 1;
      pose.pos.y += 0.035;
      eyeOn = 1;
      pose.head.set(0.04, 0, 0);
    }
    if (phase === 'diagnostic') {
      // A small, curious head tilt: the most Baymax gesture there is.
      pose.head.set(0.04, 0.04 * span(timeSeconds, 0.8, 2.2), 0);
      this.lookAt(camera, pose, 0.9);
      pose.head.z =
        0.11 * span(timeSeconds, 0.8, 2.2) * (1 - span(timeSeconds, 4.3, 5.6));
      seamGlow = 0.18 + 0.14 * Math.sin(timeSeconds * 3.1) ** 2;
      if (timeSeconds > 4.9)
        seamGlow = Math.sin(timeSeconds * 41) > 0.55 ? 0.55 : 0.12;
    }
    if (phase === 'corrupting') {
      const blendFactor = span(timeSeconds, 0.2, 4.6);
      seamGlow = 0.3 + blendFactor * 0.5;
      pose.pitch = 0.055 * blendFactor;
      pose.head.set(0.04 - 0.06 * blendFactor, 0, 0);
      pose.arm = 0.06 * blendFactor + 0.08 * span(timeSeconds, 2.8, 4.2);
      pose.pos.y += 0.02 * blendFactor;
      // He never stops watching Hiro; the corruption is in how he holds the look.
      this.lookAt(camera, pose, 0.85 + span(timeSeconds, 3, 4.8) * 0.15);
      // The combat program loads in hits: three jolts through the body, each squaring him up more.
      const segmentIndex =
        jolt(timeSeconds, 1.05) +
        jolt(timeSeconds, 1.85) * 0.8 +
        jolt(timeSeconds, 2.65) * 1.1;
      pose.roll += segmentIndex * 0.03;
      pose.pitch += Math.abs(segmentIndex) * 0.02;
      pose.head.z += segmentIndex * 0.08;
      pose.head.x += 0.05 * span(timeSeconds, 3.2, 4.4);
    }
    if (phase === 'threat') {
      seamGlow = 0.8;
      pose.pitch = 0.055;
      pose.arm = 0.14;
      pose.pos.y += 0.02;
      this.face(camera, pose, 0.55 * span(timeSeconds, 0.6, 2.4));
      this.lookAt(camera, pose, span(timeSeconds, 0.15, 1.7));
    }
    const red = seq.red;
    // ---------------------------------------------------------------- violence
    if (phase === 'ignition') this.ignition(timeSeconds, pose, camera);
    if (phase === 'chase') {
      this.watch = camera;
      this.chase(seq, pose, camera);
      this.watch = null;
    }
    if (phase === 'fracture') this.fracture(timeSeconds, pose, camera);
    if (phase === 'pulled') {
      const blendFactor2 = span(timeSeconds, 0, 4.4),
        hit = span(timeSeconds, 1.25, 1.55),
        recover = span(timeSeconds, 1.6, 3.2);
      pose.pos.lerpVectors(
        this.tmp.set(1.9, 4, -42),
        this.tmp2.set(1, 3, -65),
        blendFactor2,
      );
      pose.pos.x -= hit * 0.7 * (1 - recover);
      pose.pos.y -= hit * 0.35;
      pose.stand = 1;
      pose.pitch = -0.28 - blendFactor2 * 0.6;
      pose.roll = 0.28 * hit * (1 - recover);
      pose.yaw = 0.15 - blendFactor2 * 0.35;
      pose.thrust = 0.45 * (1 - span(timeSeconds, 1.45, 2.2));
      pose.arm = 0.45 * (1 - recover);
      pose.head.set(0.2, 0, -0.12 * hit);
      pose.aim.set(4.1, 6.3, -43.1);
    }
    if (phase === 'handoff') {
      pose.pos.set(1, 3, -65);
      pose.thrust = 0;
    }
    this.shell.visible = phase !== 'handoff';
    // ---------------------------------------------------------------- integrate
    const pose2 = this.pose,
      callback = (length: number) => 1 - Math.exp(-deltaSeconds * length);
    const fast = ['ignition', 'chase', 'fracture'].includes(phase) && !reduced;
    // The final dive is already eased in world space. A second lag used to leave him
    // airborne when the road impact fired, then slide him down through the dust.
    if (phase === 'chase' && seq.beat === 'final' && seq.beatTime >= 1.65)
      pose2.pos.copy(pose.pos);
    else pose2.pos.lerp(pose.pos, callback(fast ? 7 : 2.6));
    pose2.yaw += wrap(pose.yaw - pose2.yaw) * callback(fast ? 5 : 1.8);
    pose2.yaw = wrap(pose2.yaw);
    pose2.pitch = MathUtils.lerp(
      pose2.pitch,
      pose.pitch,
      callback(fast ? 5 : 1.6),
    );
    pose2.roll = MathUtils.lerp(pose2.roll, pose.roll, callback(2));
    pose2.head.lerp(
      pose.head,
      callback(fast ? 4.5 : phase === 'threat' ? 2.4 : 1.6),
    );
    pose2.look = MathUtils.lerp(pose2.look, pose.look, callback(2.2));
    pose2.arm = MathUtils.lerp(pose2.arm, pose.arm, callback(fast ? 6 : 2));
    if (pose2.aim.lengthSq() === 0) pose2.aim.copy(pose.aim);
    else pose2.aim.lerp(pose.aim, callback(8));
    pose2.thrust = MathUtils.lerp(
      pose2.thrust,
      pose.thrust,
      callback(pose.thrust > pose2.thrust ? 4 : 2.5),
    );
    pose2.inflate = MathUtils.lerp(pose2.inflate, pose.inflate, callback(1.5));
    pose2.stand = MathUtils.lerp(
      pose2.stand,
      pose.stand,
      callback(fast ? 3.2 : 2),
    );
    // Flight layer: bank into turns, legs trail with speed and sway on the thruster, the free arm sweeps back.
    const yawVel = this.moved
        ? wrap(pose2.yaw - this.prevYaw) / Math.max(deltaSeconds, 1e-3)
        : 0,
      speed = this.moved
        ? this.tmp2.subVectors(pose2.pos, this.prevPos).length() /
          Math.max(deltaSeconds, 1e-3)
        : 0;
    this.prevYaw = pose2.yaw;
    this.prevPos.copy(pose2.pos);
    this.moved = !reduced;
    this.bank = MathUtils.damp(
      this.bank,
      MathUtils.clamp(-yawVel * 0.14, -0.28, 0.28) * pose2.thrust,
      5,
      deltaSeconds,
    );
    const trail = Math.min(0.45, speed * 0.025) * pose2.thrust,
      sway = reduced
        ? 0
        : Math.sin(time * 1.7) * 0.07 * pose2.thrust * pose2.stand;
    this.stretch = MathUtils.damp(this.stretch, 0, 5, deltaSeconds);
    // Breathing: soft and slow as himself; faster and heavier once the combat program has him.
    const red0 = seq.red,
      breathe = reduced
        ? 0
        : Math.sin(time * MathUtils.lerp(1.05, 2.3, red0)) *
          MathUtils.lerp(0.004, 0.007, red0) *
          pose2.inflate;
    this.shell.position.copy(pose2.pos);
    this.shell.position.y +=
      breathe -
      0.009 * (1 - Math.exp(-time * 0.18)) * (1 - pose2.inflate) +
      pose2.stand * this.standLift;
    this.legR.rotation.set(
      pose2.stand * LEG_SWING + trail + sway,
      0,
      pose2.stand * -0.05,
    );
    this.legL.rotation.set(
      pose2.stand * LEG_SWING + trail - sway * 0.8,
      0,
      pose2.stand * 0.05,
    );
    this.ankleR.rotation.x = -pose2.stand * LEG_SWING - trail * 0.7;
    this.ankleL.rotation.x = -pose2.stand * LEG_SWING - trail * 0.7;
    this.shell.rotation.set(pose2.pitch, pose2.yaw, pose2.roll + this.bank);
    const st = this.stretch;
    this.shell.scale
      .set(
        1 + pose2.inflate * 0.006 + breathe * 0.4 - st * 0.03,
        1 + pose2.inflate * 0.012 + breathe + st * 0.05,
        1 + pose2.inflate * 0.006 + breathe * 0.4 - st * 0.03,
      )
      .multiplyScalar(LATER_BAYMAX_SCALE);
    if (this.head) {
      this.head.rotation.set(pose2.head.x, pose2.head.y, pose2.head.z);
    }
    // Arms: rest, a slight shoulder rise under corruption, or aimed at a world target.
    this.armL.rotation.set(
      trail * 1.2,
      0,
      -pose2.arm * 0.6 - 0.12 * pose2.thrust,
    );
    if (pose2.aim.lengthSq() > 0) {
      this.shell.updateMatrixWorld();
      this.tmp.copy(pose2.aim);
      this.shell.worldToLocal(this.tmp);
      this.tmp.sub(this.armR.position).normalize();
      this.q.setFromUnitVectors(DOWN, this.tmp);
      this.q2.identity();
      this.armR.quaternion.slerpQuaternions(
        this.q2,
        this.q,
        Math.min(1, pose2.arm),
      );
    } else this.armR.rotation.set(0, 0, pose2.arm * 0.6);
    // Load the fist before a strike, extend it through the action, then recover.
    // Previously every arm was a single straight shoulder hinge throughout the fight.
    const bt = seq.beatTime;
    const elbow =
      phase === 'ignition'
        ? 0.45 *
          span(timeSeconds, 0.25, 0.75) *
          (1 - span(timeSeconds, 1.1, 1.65))
        : phase === 'chase' && seq.beat === 'overhead'
          ? 0.7 * span(bt, 0.2, 0.65) * (1 - span(bt, 0.85, 1.2)) +
            0.25 * span(bt, 1.35, 1.6) * (1 - span(bt, 1.8, 2.1))
          : phase === 'chase' && seq.beat === 'rooftop'
            ? 0.8 * span(bt, 0.55, 1) * (1 - span(bt, 1.1, 1.43)) +
              0.35 * bump(bt, 1.45, 1.9)
            : phase === 'chase' && seq.beat === 'final'
              ? 0.6 * span(bt, 0.8, 1.2) * (1 - span(bt, 1.55, 1.95))
              : 0.16 * pose2.thrust;
    this.elbowR.rotation.x = MathUtils.damp(
      this.elbowR.rotation.x,
      -elbow,
      10,
      deltaSeconds,
    );
    this.elbowL.rotation.x = MathUtils.damp(
      this.elbowL.rotation.x,
      -0.25 * pose2.thrust,
      7,
      deltaSeconds,
    );
    this.shell.updateMatrixWorld();
    if (this.suit) this.dressSuit(armourK, pose2.stand);
    this.shell.position.y += Math.max(0, this.contact.correction(-0.14));
    this.shell.updateMatrixWorld(true);
    this.hand.getWorldPosition(seq.muzzle);
    // ---------------------------------------------------------------- light and tone
    this.eyeColor.set('#0b0f11').lerp(this.tmpColor('#e0140c'), red);
    this.eyes.forEach((eye) => {
      const material = eye.material as MeshBasicMaterial;
      material.color.copy(this.eyeColor).multiplyScalar(1 + red * 0.45);
    });
    const lock =
      phase === 'threat' ? Math.exp(-Math.pow((timeSeconds - 1.75) * 3, 2)) : 0;
    this.eyeGlow.forEach((sceneObject) => {
      const material = sceneObject.material;
      material.color.set('#9fe4ff').lerp(this.tmpColor('#ff2a1a'), red);
      material.opacity = eyeOn * (0.2 + red * 0.28) + lock * 0.4;
      sceneObject.scale.setScalar(0.15 + red * 0.08 + lock * 0.14);
    });
    this.armor.emissiveIntensity =
      red * (0.16 + 0.05 * Math.sin(time * 2.2)) + pose2.thrust * 0.12;
    this.redLight.intensity = red * (0.75 + lock * 1.6) + pose2.thrust * 2.4;
    this.redLight.position.set(
      0.1,
      MathUtils.lerp(3, 2.1, pose2.thrust),
      MathUtils.lerp(2.2, -1.6, pose2.thrust),
    );
    this.flame.uniforms.uPower.value = pose2.thrust;
    this.flame.uniforms.uTime.value = time;
    this.thruster.scale.set(1, 1, 0.6 + pose2.thrust * 0.8);
    this.thruster.visible = pose2.thrust > 0.01;
    this.footJets.forEach((jet, index) => {
      jet.visible = pose2.thrust > 0.01;
      const flicker = reduced
        ? 1
        : 0.94 + 0.06 * Math.sin(time * 39 + index * 2);
      jet.scale.set(0.78, 0.78, (0.4 + pose2.thrust * 0.7) * flicker);
    });
    this.thrusterGlow.material.opacity = pose2.thrust * 0.85;
    const charging = this.charging(phase, timeSeconds, seq);
    this.charge.material.opacity = charging;
    this.charge.scale.setScalar(
      0.05 +
        charging * 0.75 +
        (reduced ? 0 : Math.sin(time * 31) * 0.04 * charging),
    );
    this.chest.update({
      t: time,
      open,
      seal,
      seated,
      align: phase === 'socket-ready' ? seq.alignment : 0,
      red,
      seamGlow,
    });
    this.hole.uHoleOpen.value = this.chest.holeOpen ? 1 : 0;
    this.hole.uHoleRadius.value = this.chest.CAVITY * this.shell.scale.x;
    this.chestFrame(this.hole.uHoleCenter.value, this.hole.uHoleNormal.value);
  }

  private colorCache = new Map<string, Color>();
  private tmpColor(hex: string) {
    let color = this.colorCache.get(hex);
    if (!color) {
      color = new Color(hex);
      this.colorCache.set(hex, color);
    }
    return color;
  }
  private restPose(pose: BaymaxMotionPose) {
    pose.pos.set(...BAYMAX_POSITION);
    pose.yaw = -0.18;
    pose.pitch = 0;
    pose.roll = 0;
    pose.head.set(DORMANT_HEAD.x, DORMANT_HEAD.y, DORMANT_HEAD.z);
    pose.look = 0;
    pose.arm = 0;
    pose.thrust = 0;
    pose.inflate = 0;
    pose.stand = 0;
  }
  private snap() {
    const pose = this.pose,
      pose2 = this.target;
    pose.pos.copy(pose2.pos);
    pose.yaw = pose2.yaw;
    pose.pitch = pose2.pitch;
    pose.roll = pose2.roll;
    pose.head.copy(pose2.head);
    pose.arm = pose2.arm;
    pose.thrust = 0;
    pose.inflate = 0;
    pose.stand = 0;
    pose.aim.set(0, 0, 0);
  }
  /** Turns the head (and a little of the body) toward a world point, Baymax-slow. */
  private lookAt(point: Vector3, pose: BaymaxMotionPose, weight: number) {
    if (weight <= 0) return;
    // Head height follows the body's own pitch (he pivots near the feet), so aim from where the eyes really are.
    const lift = 2.98 * LATER_BAYMAX_SCALE + pose.stand * this.standLift,
      headY = pose.pos.y + lift * Math.cos(pose.pitch),
      reachZ = lift * Math.sin(pose.pitch);
    const hx = pose.pos.x + Math.sin(pose.yaw) * reachZ,
      hz = pose.pos.z + Math.cos(pose.yaw) * reachZ;
    const deltaX = point.x - hx,
      deltaZ = point.z - hz,
      deltaY = point.y - headY;
    // Relative to the body. What the neck can't reach, the body turns and leans into.
    const yaw = wrap(Math.atan2(deltaX, deltaZ) - pose.yaw),
      pitch = -Math.atan2(deltaY, Math.hypot(deltaX, deltaZ)) - pose.pitch;
    const headYaw = MathUtils.clamp(yaw, -HEAD_YAW, HEAD_YAW),
      headPitch = MathUtils.clamp(pitch, -HEAD_PITCH_UP, HEAD_PITCH_DOWN);
    pose.yaw = wrap(pose.yaw + (yaw - headYaw) * weight);
    pose.pitch = MathUtils.clamp(
      pose.pitch + (pitch - headPitch) * weight,
      -1.1,
      1.1,
    );
    pose.head.y = MathUtils.lerp(pose.head.y, headYaw, weight);
    pose.head.x = MathUtils.lerp(pose.head.x, headPitch, weight);
    pose.head.z = MathUtils.lerp(pose.head.z, 0, weight);
  }
  private face(point: Vector3, pose: BaymaxMotionPose, weight = 1) {
    pose.yaw = wrap(
      pose.yaw +
        wrap(
          Math.atan2(point.x - pose.pos.x, point.z - pose.pos.z) - pose.yaw,
        ) *
          weight,
    );
  }
  /** Hiro's position during flight; only the neck tracks him while the body follows its path. */
  private watch: Vector3 | null = null;
  private flightLook(point: Vector3, pose: BaymaxMotionPose, weight: number) {
    const yaw = pose.yaw,
      pitch = pose.pitch;
    this.lookAt(point, pose, weight);
    pose.yaw = yaw;
    pose.pitch = pitch;
  }
  private flyToward(
    from: Vector3,
    to: Vector3,
    pose: BaymaxMotionPose,
    progress2: number,
    pitch = 0.55,
  ) {
    const progress = ease(progress2),
      bend = Math.min(1.8, from.distanceTo(to) * 0.085),
      sign = to.x >= from.x ? 1 : -1;
    pose.pos.lerpVectors(from, to, progress);
    this.tmp2.subVectors(to, from);
    const length = Math.max(0.001, Math.hypot(this.tmp2.x, this.tmp2.z)),
      nx = -this.tmp2.z / length,
      nz = this.tmp2.x / length;
    const arc = Math.sin(Math.PI * progress) ** 2,
      tangent = Math.PI * Math.sin(2 * Math.PI * progress);
    pose.pos.x += nx * bend * sign * arc;
    pose.pos.z += nz * bend * sign * arc;
    pose.pos.y += bend * 0.12 * arc;
    this.tmp2.x += nx * bend * sign * tangent;
    this.tmp2.z += nz * bend * sign * tangent;
    pose.yaw = Math.atan2(this.tmp2.x, this.tmp2.z);
    pose.thrust = 1;
    pose.stand = 1;
    const lean =
      pitch *
      Math.min(1, Math.sin(Math.PI * Math.min(1, progress2 * 1.1)) * 1.7);
    if (!this.watch) {
      pose.pitch = lean;
      pose.head.set(-0.35 * Math.min(1, pitch), 0, 0);
      return;
    }
    // The body follows the flight tangent. Only the head follows Hiro; forcing the
    // entire body to face him during an exit made Baymax fly backwards.
    pose.pitch = lean;
    pose.head.set(0, 0, 0);
    this.flightLook(this.watch, pose, 0.9);
  }
  private charging(phase: Phase, timeSeconds: number, seq: SequenceDirector) {
    if (phase === 'ignition')
      return span(timeSeconds, 0.4, 0.9) * (1 - span(timeSeconds, 1.15, 1.5));
    if (phase !== 'chase') return 0;
    const secondEntry = seq.beat,
      bt = seq.beatTime;
    if (secondEntry === 'rooftop')
      return Math.max(
        span(bt, 0.75, 1.4) * (1 - span(bt, 1.45, 1.55)),
        0.65 * span(bt, 1.65, 1.9) * (1 - span(bt, 1.95, 2.05)),
        0.55 * span(bt, 2.15, 2.35) * (1 - span(bt, 2.4, 2.5)),
      );
    if (secondEntry === 'final')
      return span(bt, 1.05, 2) * (1 - span(bt, 2.25, 2.4));
    return 0;
  }
  private ignition(
    timeSeconds: number,
    pose: BaymaxMotionPose,
    camera: Vector3,
  ) {
    // He stands. The first thing the corrupted state does is rise to full height over Hiro.
    pose.inflate = 1;
    pose.pos.y += 0.035 - 0.07 * bump(timeSeconds, 0, 0.45);
    pose.stand = span(timeSeconds, 0.25, 1.05);
    // Compress, ignite, then accelerate away. Hiro isn't knocked down by a nonexistent shot.
    // He squares up to Hiro during the anticipation and keeps facing him as he rises (damped yaw,
    // so no snap); the body only turns with the flight once the chase takes over.
    this.face(camera, pose, span(timeSeconds, 0, 0.6));
    this.lookAt(camera, pose, 1);
    pose.pitch = 0.12 * span(timeSeconds, 0, 0.8);
    pose.arm =
      0.35 * span(timeSeconds, 0.2, 0.8) * (1 - span(timeSeconds, 1.25, 1.8));
    pose.aim.copy(camera);
    pose.thrust = span(timeSeconds, 0.9, 1.55);
    // Rise clear of the low street wall first, then drift back: moving back and up together
    // dragged his legs and thrusters through it. Same end point as the chase's first pose.
    const lift = Math.pow(span(timeSeconds, 1.35, 3.5), 1.6),
      drift = Math.pow(span(timeSeconds, 1.9, 3.5), 1.4);
    pose.pos.set(
      BAYMAX_POSITION[0] + drift * 1.6,
      BAYMAX_POSITION[1] + 0.035 + lift * 4.8,
      BAYMAX_POSITION[2] - drift * 6,
    );
    pose.pitch -= lift * 0.25;
  }
  private chase(
    seq: SequenceDirector,
    pose: BaymaxMotionPose,
    camera: Vector3,
  ) {
    const secondEntry = seq.beat,
      progress = seq.beatTime,
      vector = (xPosition: number, yPosition: number, zPosition: number) =>
        this.tmp.set(xPosition, yPosition, zPosition);
    pose.inflate = 1;
    pose.thrust = 1;
    pose.stand = 1;
    if (!secondEntry) {
      pose.pos.set(4.3, 4.75, -18);
      pose.pitch = 0.15;
      this.face(camera, pose);
      this.lookAt(camera, pose, 1);
      return;
    }
    if (secondEntry !== this.beat) {
      this.beat = secondEntry;
      this.beatCamera.copy(camera);
      this.beatOrigin.copy(this.pose.pos);
      if (secondEntry === 'overhead') {
        this.passCurve.points[0].copy(this.beatOrigin);
        this.passCurve.points[1].set(
          camera.x - 4.5,
          camera.y - 0.7,
          camera.z - 5.8,
        );
        this.passCurve.points[2].set(
          camera.x - 5.2,
          camera.y + 3.6,
          camera.z - 12,
        );
        this.passCurve.updateArcLengths();
        seq.swipeTarget.set(camera.x - 1.8, camera.y, camera.z - 2.8);
      }
    }
    const cameraAnchor = this.beatCamera;
    if (secondEntry === 'silhouette') {
      // Continuous bank into the first attack; no stop-and-hover establishing loop.
      this.flyToward(
        this.beatOrigin,
        vector(
          cameraAnchor.x + 3.9,
          cameraAnchor.y + 3.2,
          cameraAnchor.z - 11,
        ).clone(),
        pose,
        span(progress, 0, 1.25),
        0.4,
      );
    } else if (secondEntry === 'overhead') {
      // Cross the forward field rather than teleporting behind the running camera.
      // He banks past the left shoulder with a safe horizontal clearance.
      const progress2 = span(progress, 0, 2.65);
      this.passCurve.getPointAt(progress2, pose.pos);
      this.passCurve.getTangentAt(progress2, this.tmp2);
      pose.yaw = Math.atan2(this.tmp2.x, this.tmp2.z);
      pose.pitch = 0.38 * Math.sin(Math.PI * progress2);
      pose.thrust = 0.4 + 0.6 * Math.sin(Math.PI * progress2);
      pose.arm = span(progress, 0.55, 1.16) * (1 - span(progress, 1.35, 1.9));
      pose.aim.copy(seq.swipeTarget);
      this.flightLook(camera, pose, 0.7);
    } else if (secondEntry === 'rooftop') {
      // Bank above the left roofline, fire wide, and peel back into the street.
      const roof = new Vector3(
        cameraAnchor.x - 5.2,
        cameraAnchor.y + 1.8,
        cameraAnchor.z - 8.8,
      );
      const from = this.beatOrigin;
      if (progress < 0.75)
        this.flyToward(from, roof, pose, progress / 0.75, 0.85);
      else {
        pose.pos.copy(roof);
        pose.pos.x -= span(progress, 0.75, 2.55) * 0.7;
        pose.pos.y -= span(progress, 0.75, 2.55) * 0.3;
        pose.thrust = 0.5;
        pose.pitch = 0.1 - 0.16 * bump(progress, 1.45, 1.8);
        this.face(camera, pose);
        this.lookAt(camera, pose, 1);
        pose.arm = span(progress, 0.7, 1.3) * (1 - span(progress, 2.45, 2.75));
        pose.aim.set(-4.6, -0.12, -21.2);
        pose.pitch -=
          0.07 * bump(progress, 1.95, 2.15) + 0.07 * bump(progress, 2.4, 2.55);
      }
      if (progress > 2.55)
        this.flyToward(
          roof.clone().add(vector(-0.7, -0.3, 0)),
          vector(
            cameraAnchor.x + 4.5,
            cameraAnchor.y + 3.8,
            cameraAnchor.z - 14,
          ).clone(),
          pose,
          span(progress, 2.55, 3.65),
          0.55,
        );
    } else if (secondEntry === 'tear-pass') {
      // He comes out of the tear itself, close enough to fill the frame for a moment.
      const from = new Vector3(5.8, 2.3, -23.8),
        to = new Vector3(-8, 3.8, -19.8);
      if (progress < 0.32) {
        pose.pos.copy(from);
        pose.thrust = 0.4;
      } else this.flyToward(from, to, pose, span(progress, 0.32, 1.45), 1.1);
      if (progress > 0.32 && progress < 1.1) this.lookAt(camera, pose, 1);
    } else if (secondEntry === 'final') {
      const high = new Vector3(
          cameraAnchor.x + 0.5,
          cameraAnchor.y + 6.4,
          cameraAnchor.z - 5.5,
        ),
        ground = new Vector3(1.9, -0.08, -30.4);
      const launch = this.beatOrigin;
      if (progress < 1.05)
        this.flyToward(launch, high, pose, progress / 1.05, 0.85);
      else if (progress < 1.65) {
        pose.pos.copy(high);
        this.face(camera, pose);
        this.lookAt(camera, pose, 1);
        pose.thrust = 0.7;
        pose.arm = span(progress, 1.05, 1.5);
        pose.aim.copy(camera);
      } else {
        const depth = span(progress, 1.65, 2.35),
          absorb =
            span(progress, 2.35, 2.48) * (1 - span(progress, 2.48, 2.95));
        pose.pos.lerpVectors(high, ground, depth * depth);
        this.face(camera, pose);
        pose.pitch = 0.22 * depth + 0.12 * absorb;
        pose.arm = 0.8 * (1 - span(progress, 2.4, 3.05));
        pose.aim.copy(ground).setY(-1);
        pose.thrust = 0.7 * (1 - span(progress, 2.15, 2.35));
        pose.stand = 1 - 0.2 * absorb;
      }
    }
  }
  private fracture(
    timeSeconds: number,
    pose: BaymaxMotionPose,
    camera: Vector3,
  ) {
    // Caught by the instability his own blow created: resists, then is taken.
    pose.inflate = 1;
    pose.stand = 1;
    const crater = new Vector3(1.9, -0.08, -30.4),
      hover = new Vector3(1.9, 1.9, -30.9);
    pose.pos.lerpVectors(crater, hover, span(timeSeconds, 0.2, 1.3));
    this.face(camera, pose);
    this.lookAt(camera, pose, 1 - span(timeSeconds, 2.4, 3.2));
    pose.thrust =
      span(timeSeconds, 0.4, 1) * (1 + span(timeSeconds, 1.3, 3) * 0.4);
    const drag =
      span(timeSeconds, 1.3, 3.1) * 1.4 +
      Math.pow(span(timeSeconds, 3.1, 4.2), 2) * 11;
    pose.pos.z -= drag;
    pose.pos.y += span(timeSeconds, 3.1, 4.2) * 2.2;
    pose.pitch =
      -0.25 * span(timeSeconds, 1.3, 3.1) - 0.5 * span(timeSeconds, 3.1, 4);
    pose.roll =
      Math.sin(timeSeconds * 2.1) * 0.06 * span(timeSeconds, 1.3, 3.1);
    pose.arm = 0.4 * span(timeSeconds, 1.4, 2.2);
    pose.aim.set(camera.x, camera.y + 2, camera.z);
  }
  /** Pose the suit from this rig, swap it in or out, and keep its feet on the white rig's ground line. */
  /** Where the camera should look for his head: the helmet once the armour is mostly on (tracker N-02). */
  headFocus(out: Vector3) {
    if (this.head) this.head.getWorldPosition(out);
    return out;
  }
  private dressSuit(blendFactor: number, stand: number) {
    const group = this.suit!;
    group.set(blendFactor);
    if (group.isSingleRig) return;
    const covered = group.covers(blendFactor);
    if (covered !== this.wasCovered) {
      this.wasCovered = covered;
      if (!this.white) {
        this.white = [];
        this.shell.traverse((sceneObject) => {
          if (
            sceneObject instanceof Mesh &&
            !this.underChest(sceneObject) &&
            !this.inSuit(sceneObject)
          )
            this.white!.push(sceneObject);
        });
      }
      this.white.forEach((material) => {
        material.visible = !covered;
      });
      this.eyeGlow.forEach((sceneObject) => {
        sceneObject.visible = !covered;
      });
    }
    if (blendFactor <= 0) return;
    const [
      rotationQuaternion,
      rotationQuaternion2,
      rotationQuaternion3,
      rotationQuaternion4,
      rotationQuaternion5,
    ] = this.qs;
    // The shell's +x pivots are the suit's .L side.
    group.drive({
      armL: rotationQuaternion.copy(this.armR.quaternion),
      armR: rotationQuaternion2.setFromEuler(this.armL.rotation),
      legL: rotationQuaternion3.setFromEuler(
        this.eul.set(this.legR.rotation.x - LEG_SWING, 0, this.legR.rotation.z),
      ),
      legR: rotationQuaternion4.setFromEuler(
        this.eul.set(this.legL.rotation.x - LEG_SWING, 0, this.legL.rotation.z),
      ),
      head: this.head
        ? rotationQuaternion5.setFromEuler(this.head.rotation)
        : undefined,
    });
    // Standing: learn how far to lift the suit so its feet meet the white rig's ground line.
    if (stand > 0.9) {
      let low = Infinity;
      for (const leg of [this.legR, this.legL])
        leg.children.forEach((sceneObject) => {
          if (sceneObject instanceof Mesh) {
            this.box.setFromObject(sceneObject);
            low = Math.min(low, this.box.min.y);
          }
        });
      this.suitStandY +=
        ((low - group.footLow()) /
          Math.max(1e-3, this.shell.scale.y * group.root.scale.y)) *
        0.5;
    }
    group.root.position.y = this.suitBaseY + this.suitStandY * stand;
  }
  private underChest(sceneObject: Object3D) {
    for (
      let sceneObject2: Object3D | null = sceneObject;
      sceneObject2;
      sceneObject2 = sceneObject2.parent
    )
      if (sceneObject2 === this.chest.root) return true;
    return false;
  }
  private inSuit(sceneObject: Object3D) {
    for (
      let sceneObject2: Object3D | null = sceneObject;
      sceneObject2;
      sceneObject2 = sceneObject2.parent
    )
      if (sceneObject2 === this.suit?.root) return true;
    return false;
  }
  dispose() {
    this.suit?.dispose();
    this.shell.removeFromParent();
  }
}
