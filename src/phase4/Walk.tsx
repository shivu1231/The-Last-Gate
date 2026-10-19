import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { createCityBackdrop } from '../presentation/Backdrop';
import { SceneQuality } from '../presentation/SceneQuality';
import { transitionChapter } from '../presentation/chapterTransition';
import { reducedMotion } from '../config/experience';
import { enterServiceBay } from './entry';
import { sfx, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import {
  batchStaticGeometry,
  createBaySixArchitecture,
  createServiceStreetDetail,
} from './environmentDetail';
import {
  Dressing,
  buildingFrame,
  cityMaterials,
  dressFacade,
  dressRoof,
  roadBreakup,
  skyline,
} from '../environment/CityDressing';
import './walk.css';
import { AdaptiveDpr } from '../performance/AdaptiveDpr';
import { SceneCurtain } from '../presentation/SceneCurtain';

/**
 * Between the board and Bay 6: Hiro leaves Baymax and walks the corrupted city, following the
 * one thing still alive in it, a service cable whose current runs toward Bay 6. Same world as
 * every earlier phase (slate architecture, cyan haze, displaced blocks, the fracture skyline);
 * the route ends at the maintenance yard's gate, where the bay itself (ServiceBay) picks up.
 */

const EYE = 1.62,
  GATE_Z = -64;
const PATH = new THREE.CatmullRomCurve3(
  [
    [0, EYE, 8],
    [0.8, EYE, -4],
    [-1, EYE, -16],
    [-0.6, EYE, -28],
    [0.9, EYE, -40],
    [0, EYE, -50],
    [0, EYE, -56],
  ].map(
    ([xPosition, yPosition, zPosition]) =>
      new THREE.Vector3(xPosition, yPosition, zPosition),
  ),
  false,
  'centripetal',
);
const LENGTH = PATH.getLength();
const PIPE_Z = -29;
const LINES: [number, string][] = [
  [0, 'I need something that slows him down.'],
  [0.1, 'That cable’s still live.'],
  [0.52, 'It’s feeding something up ahead.'],
  [0.93, 'Bay 6. Robotics maintenance.'],
];

/**
 * Data contract used by Bay 6 and its city approach.
 */
type WalkState = {
  p: number;
  speed: number;
  forward: boolean;
  back: boolean;
  pointer: THREE.Vector2;
  impulse: number;
};

/**
 * Build the city-walk environment and its existing entry landmarks.
 */
function buildStreet() {
  const sceneKit = new SceneKit('walk-street');
  sceneKit.concrete.color.set('#465759');
  sceneKit.ivory.color.set('#7c8c87');
  sceneKit.metal.color.set('#6b7b78');
  sceneKit.edge.color.set('#253537');
  const detail = createServiceStreetDetail();
  sceneKit.root.add(detail.root);
  const random = seeded(6061);
  const randomBetween = (startValue: number, endValue: number) =>
    startValue + random() * (endValue - startValue);

  // Ground: the service lane, with slabs heaved by the displacement.
  sceneKit.box({ p: [0, -0.3, -30], s: [13, 0.6, 84] }, sceneKit.edge);
  sceneKit.box({ p: [0, 0.01, -30], s: [12.4, 0.04, 83.4] }, sceneKit.concrete);
  const marks: ScenePlacement[] = [];
  for (let index = 0; index < 22; index++)
    marks.push({ p: [-0.15, 0.04, 8 - index * 3.4], s: [0.1, 0.02, 1.5] });
  sceneKit.instances(marks, sceneKit.metal);
  for (const [xPosition, zPosition, rotationX, rotationZ] of [
    [-3.8, -12, 0.14, 0.1],
    [4.1, -23, -0.12, -0.16],
    [-4.4, -37, 0.1, -0.08],
    [3.6, -47, -0.16, 0.12],
  ])
    sceneKit.box(
      {
        p: [xPosition, 0.1, zPosition],
        s: [3.2, 0.22, 3.6],
        r: [rotationX, randomBetween(-0.3, 0.3), rotationZ],
      },
      sceneKit.concrete,
    );
  // Kerbs and broken barriers.
  for (const side of [-1, 1])
    for (let zPosition2 = 6; zPosition2 > -60; zPosition2 -= 5.5)
      if (random() > 0.25)
        sceneKit.box(
          {
            p: [side * 5.9, 0.32, zPosition2],
            s: [0.45, 0.65, randomBetween(2.2, 4)],
            r: [0, 0, side * randomBetween(0, 0.05)],
          },
          sceneKit.ivory,
        );

  // Solid, varied blocks and their side walls are owned by the street-detail kit. Behind them, a
  // taller second row and the far city close the sky, so the street reads as one district of many.
  const dress = new Dressing(sceneKit),
    cm = cityMaterials(sceneKit),
    cityRandom = seeded(6062);
  const backTones = [
    sceneKit.standard('#3e4c50', 0.9, 0.08),
    sceneKit.standard('#5a5f5c', 0.9, 0.06),
    sceneKit.standard('#4a4642', 0.9, 0.06),
  ];
  for (const side of [-1, 1])
    for (
      let zPosition3 = 4;
      zPosition3 > -66;
      zPosition3 -= 9 + cityRandom() * 4
    ) {
      const width = 8 + cityRandom() * 5,
        depth = 8 + cityRandom() * 4,
        height = 24 + cityRandom() * 18,
        xPosition2 = side * (21 + width / 2 + cityRandom() * 4);
      const frame = buildingFrame(xPosition2, zPosition3);
      sceneKit.box(
        { p: [xPosition2, height / 2, zPosition3], s: [width, height, depth] },
        backTones[Math.floor(cityRandom() * backTones.length)],
      );
      dressFacade(
        dress,
        cm,
        frame,
        width,
        height,
        depth,
        [side > 0 ? '-x' : '+x', '+z'],
        cityRandom,
        { from: 1.2 },
      );
      dressRoof(dress, cm, frame, width, height, depth, cityRandom, {
        tower: height > 36,
      });
    }
  const far = [
    sceneKit.standard('#2c3a40', 0.9, 0.1),
    sceneKit.standard('#363d40', 0.9, 0.1),
  ];
  skyline(dress, cm, cityRandom, {
    x: [-55, 55],
    z: [-112, -88],
    count: 12,
    h: [26, 52],
    tones: far,
  });
  skyline(dress, cm, cityRandom, {
    x: [-34, 34],
    z: [32, 54],
    count: 7,
    h: [18, 36],
    facing: -1,
    tones: far,
  });
  roadBreakup(dress, cm, cityRandom, {
    x: [-4.6, 4.6],
    z: [-58, 7],
    y: 0.043,
    count: 18,
    cracks: false,
    patch: sceneKit.standard('#434d4b', 0.95, 0.02),
  });
  dress.build();
  sceneKit.haze({ p: [0, 10, -86], s: [110, 28, 1] }, '#4f8396', 0.14);
  // Floating fragments held over the street.
  for (let index2 = 0; index2 < 9; index2++)
    sceneKit.box(
      {
        p: [randomBetween(-9, 9), randomBetween(9, 18), randomBetween(-55, 0)],
        s: [
          randomBetween(0.6, 2.4),
          randomBetween(0.3, 1),
          randomBetween(0.6, 2),
        ],
        r: [randomBetween(0, 3), randomBetween(0, 3), randomBetween(0, 3)],
      },
      sceneKit.concrete,
    );

  // The fallen service pipe Hiro ducks under halfway.
  sceneKit.box(
    { p: [0, 2.05, PIPE_Z], s: [14, 0.45, 0.45], r: [0, 0.12, -0.09] },
    sceneKit.metal,
  );
  sceneKit.box(
    { p: [-6.2, 1, PIPE_Z - 0.4], s: [0.4, 2.4, 0.4], r: [0, 0, 0.5] },
    sceneKit.metal,
  );

  // Signage: bilingual, a few surviving lights. Two point toward Bay 6.
  const signs: [string, number, number, string][] = [
    ['保守区画 BAY 6  →  220 m', -3.6, -9, '#8fe9ff'],
    ['港湾サービス / HARBOUR SERVICE', 3.9, -18, '#ff9a63'],
    ['BAY 6  ロボ整備  →  80 m', -3.7, -42, '#8fe9ff'],
  ];
  for (const [text, xPosition3, zPosition4, color] of signs) {
    sceneKit.box(
      { p: [xPosition3, 1.6, zPosition4], s: [0.12, 3.2, 0.12] },
      sceneKit.metal,
    );
    // Boards face up the street, so they read as Hiro walks toward them.
    sceneKit.box(
      {
        p: [xPosition3 - Math.sign(xPosition3) * 1.5, 3.25, zPosition4],
        s: [3.6, 0.55, 0.08],
      },
      sceneKit.dark,
    );
    sceneKit.label(
      text,
      {
        p: [
          xPosition3 - Math.sign(xPosition3) * 1.5 + 0.25,
          3.22,
          zPosition4 + 0.05,
        ],
      },
      3.8,
      color,
    );
  }
  // Street lamps: two dead, two still warm.
  const lamps: THREE.Vector3[] = [];
  for (const [xPosition4, zPosition5, live] of [
    [5.3, -6, true],
    [-5.3, -20, false],
    [5.3, -36, true],
    [-5.3, -50, false],
  ] as [number, number, boolean][]) {
    sceneKit.box(
      {
        p: [xPosition4, 2.6, zPosition5],
        s: [0.14, 5.2, 0.14],
        r: [0, 0, Math.sign(xPosition4) * 0.04],
      },
      sceneKit.metal,
    );
    sceneKit.box(
      {
        p: [xPosition4 - Math.sign(xPosition4) * 0.6, 5.15, zPosition5],
        s: [1.3, 0.1, 0.1],
      },
      sceneKit.metal,
    );
    sceneKit.mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      live ? sceneKit.basic('#ffc062', 1.6) : sceneKit.dark,
      { p: [xPosition4 - Math.sign(xPosition4) * 1.2, 5.05, zPosition5] },
    );
    if (live)
      lamps.push(
        new THREE.Vector3(
          xPosition4 - Math.sign(xPosition4) * 1.2,
          4.9,
          zPosition5,
        ),
      );
  }

  // Bay 6's front. The shutter is down, so the hall inside is only seen once Hiro is in it; he
  // goes in by the lit side door on the right, the same door the bay opens behind him.
  const bay = createBaySixArchitecture();
  bay.root.position.z = GATE_Z;
  sceneKit.root.add(bay.root);
  const front = new THREE.Group();
  front.position.z = GATE_Z;
  sceneKit.root.add(front);
  const shutter = sceneKit.standard('#5d6b66', 0.55, 0.45),
    slatLine = sceneKit.standard('#2a3331', 0.7, 0.3);
  for (let yPosition = 0.12; yPosition < 3.82; yPosition += 0.21) {
    sceneKit.box(
      { p: [0, yPosition + 0.1, 0.3], s: [7.56, 0.19, 0.07] },
      shutter,
      front,
    );
    sceneKit.box(
      { p: [0, yPosition, 0.34], s: [7.56, 0.02, 0.02] },
      slatLine,
      front,
    );
  }
  sceneKit.box(
    { p: [0, 0.08, 0.36], s: [7.6, 0.16, 0.12] },
    sceneKit.dark,
    front,
  );
  sceneKit.box(
    { p: [0, 1.0, 0.37], s: [0.5, 0.06, 0.05] },
    sceneKit.metal,
    front,
  );
  // Side door, propped by the light behind it: frame, wired-glass panel, push plate, lamp, sign.
  sceneKit.box(
    { p: [4.7, 1.08, 0.48], s: [1.08, 2.18, 0.1] },
    sceneKit.dark,
    front,
  );
  sceneKit.box(
    { p: [4.7, 1.04, 0.54], s: [0.92, 2.04, 0.06] },
    sceneKit.standard('#47544f', 0.6, 0.4),
    front,
  );
  sceneKit.box(
    { p: [4.7, 1.5, 0.58], s: [0.36, 0.5, 0.02] },
    sceneKit.basic('#ffcf8f', 1.4),
    front,
  );
  sceneKit.box(
    { p: [4.42, 1.0, 0.59], s: [0.05, 0.3, 0.04] },
    sceneKit.metal,
    front,
  );
  sceneKit.box(
    { p: [4.7, 2.36, 0.56], s: [0.5, 0.1, 0.2] },
    sceneKit.dark,
    front,
  );
  sceneKit.mesh(
    new THREE.SphereGeometry(0.07, 12, 8),
    sceneKit.basic('#ffd9a0', 1.8),
    { p: [4.7, 2.28, 0.64] },
    front,
  );
  sceneKit.box(
    { p: [4.7, 0.01, 1.0], s: [1.2, 0.02, 0.9] },
    sceneKit.basic('#3a2c1a', 0.6),
    front,
  );
  sceneKit.label(
    'BAY 6 · STAFF',
    { p: [4.95, 2.6, 0.58] },
    1.6,
    '#e8cf9c',
    front,
  );
  sceneKit.haze(
    { p: [4.7, 1.4, GATE_Z + 1.1], s: [2.4, 2.8, 1] },
    '#ffb066',
    0.22,
  );
  batchStaticGeometry(sceneKit);
  return {
    kit: sceneKit,
    lamps,
    dispose: () => {
      detail.dispose();
      bay.dispose();
      sceneKit.dispose();
    },
  };
}

/** The live service cable: lies along the kerb, current pulsing toward Bay 6. */
function buildCable() {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 60; index++) {
    const timeSeconds = index / 60,
      point = PATH.getPointAt(timeSeconds),
      tangent = PATH.getTangentAt(timeSeconds);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    points.push(
      point
        .clone()
        .addScaledVector(side, 3.2)
        .setY(0.09 + Math.max(0, Math.sin(index * 1.7)) * 0.03),
    );
  }
  // Up the gate pylon and into the yard.
  points.push(
    new THREE.Vector3(3.2, 0.09, -60),
    new THREE.Vector3(3.4, 0.12, GATE_Z + 1.1),
    new THREE.Vector3(3.6, 0.5, GATE_Z + 0.75),
    new THREE.Vector3(3.6, 1.2, GATE_Z + 0.77),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec2 vUv;uniform float uTime;void main(){float band=pow(max(0.,sin((vUv.x*46.-uTime*2.2)*3.14159)),18.);vec3 base=vec3(.05,.07,.08);vec3 hot=vec3(1.,.66,.32);gl_FragColor=vec4(base+hot*(.18+band*1.8),1.);}',
  });
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      600,
      0.045,
      8,
      false,
    ),
    material,
  );
  return { mesh, material };
}

/**
 * Mount the city walk geometry and advance the authored first-person approach.
 */
function WalkWorld({
  state,
  onProgress,
}: {
  state: React.MutableRefObject<WalkState>;
  onProgress: (progress: number) => void;
}) {
  const { camera, scene } = useThree();
  const street = useMemo(buildStreet, []);
  const cable = useMemo(buildCable, []);
  const skyline = useMemo(() => {
    const city = createCityBackdrop();
    city.group.position.set(0, -6, -128);
    city.group.scale.setScalar(1.3);
    city.group.traverse((sceneObject) => {
      sceneObject.castShadow = false;
    });
    return city;
  }, []);
  const look = useMemo(() => new THREE.Vector3(), []),
    ahead = useMemo(() => new THREE.Vector3(), []),
    gate = useMemo(() => new THREE.Vector3(0, 2, GATE_Z), []);
  const steps = useRef(0),
    reported = useRef(-1),
    initialized = useRef(false),
    stride = useRef(0),
    ducked = useRef(false);
  const head = useMemo(() => new THREE.Vector2(), []),
    position = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    scene.add(street.kit.root, cable.mesh, skyline.group);
    return () => {
      scene.remove(street.kit.root, cable.mesh, skyline.group);
      street.dispose();
      cable.mesh.geometry.dispose();
      cable.material.dispose();
      skyline.dispose();
    };
  }, [scene, street, cable, skyline]);

  useFrame(({ clock }, delta) => {
    const deltaSeconds = Math.min(delta, 0.05),
      elapsedSeconds = clock.elapsedTime,
      state2 = state.current;
    cable.material.uniforms.uTime.value = elapsedSeconds;
    // Walk: held input sets a pace, a scroll adds a step; the path is the only way.
    const goal = state2.forward ? 3.3 : state2.back ? -1.4 : 0;
    state2.speed = THREE.MathUtils.damp(
      state2.speed,
      goal + state2.impulse * 3.5,
      3,
      deltaSeconds,
    );
    state2.impulse = Math.max(0, state2.impulse - deltaSeconds * 2.2);
    state2.p = THREE.MathUtils.clamp(
      state2.p + (state2.speed * deltaSeconds) / LENGTH,
      0,
      1,
    );
    steps.current += Math.abs(state2.speed) * deltaSeconds * 2.1;
    PATH.getPointAt(state2.p, position);
    const bob = reducedMotion
      ? 0
      : Math.sin(steps.current * 2) *
        0.02 *
        Math.min(1, Math.abs(state2.speed) / 2.5);
    const duck = Math.exp(-Math.pow((position.z - PIPE_Z) / 1.6, 2)) * 0.5;
    // Footfalls on the bob, louder with pace; the pipe groans overhead as he ducks under it.
    if (Math.floor(steps.current / (Math.PI / 2)) !== stride.current) {
      stride.current = Math.floor(steps.current / (Math.PI / 2));
      if (Math.abs(state2.speed) > 0.4)
        sfx.play('step.grit', {
          gain: Math.min(1, 0.45 + Math.abs(state2.speed) / 4),
        });
    }
    if (duck > 0.3 !== ducked.current) {
      ducked.current = duck > 0.3;
      if (ducked.current) sfx.play('move.duck', { at: [0, 2.05, PIPE_Z] });
    }
    camera.position.set(
      position.x + (reducedMotion ? 0 : Math.sin(steps.current) * 0.012),
      position.y + bob - duck,
      position.z,
    );
    // Look down the route; near the end, the gate takes over. The pointer turns the head.
    PATH.getPointAt(Math.min(1, state2.p + 0.05), ahead);
    if (!initialized.current) {
      look.copy(ahead);
      initialized.current = true;
    }
    look.lerp(
      ahead.lerp(gate, THREE.MathUtils.smoothstep(state2.p, 0.8, 1)),
      1 - Math.exp(-deltaSeconds * 4),
    );
    if (look.lengthSq() === 0) look.copy(ahead);
    camera.lookAt(look);
    head.lerp(state2.pointer, 1 - Math.exp(-deltaSeconds * 5));
    camera.rotateY(-head.x * 0.38);
    camera.rotateX(-head.y * 0.17);
    camera.updateMatrixWorld();
    sfx.listener(camera);
    sfx.placeBed('cable-live', [position.x + 3.2, 0.1, position.z], 2.4);
    const rounded = Math.round(state2.p * 100);
    if (rounded !== reported.current) {
      reported.current = rounded;
      onProgress(state2.p);
    }
  });

  return (
    <>
      <color attach="background" args={['#0a1622']} />
      <fog attach="fog" args={['#172d39', 20, 135]} />
      {/* Cool, low sky fill and a neutral key; the warm service practicals at the bay door are the
          brightest pocket on the street, so the light itself leads the walk toward Bay 6. */}
      <hemisphereLight args={['#9cb9c6', '#121819', 0.62]} />
      <directionalLight position={[-8, 16, 6]} intensity={2.15} color="#d3dde0" />
      <pointLight
        position={[0, 3.1, GATE_Z + 3]}
        intensity={11}
        distance={14}
        color="#ffdcb4"
      />
      <pointLight
        position={[4.7, 2.2, GATE_Z + 1.4]}
        intensity={6}
        distance={7}
        color="#ffc27a"
      />
      {street.lamps.map((point, index) => (
        <pointLight
          key={index}
          position={point}
          intensity={4}
          distance={11}
          color="#ffd6a4"
        />
      ))}
    </>
  );
}

/**
 * Compose the city approach to Bay 6 with the existing movement and entry controls.
 */
export function Walk() {
  const [dpr, setDpr] = useState(1);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onReady = useCallback(() => setReady(true), []);
  const onLoadError = useCallback(
    () => setLoadError('The street could not be loaded.'),
    [],
  );
  const state = useRef<WalkState>({
    p: 0,
    speed: 0,
    forward: false,
    back: false,
    pointer: new THREE.Vector2(),
    impulse: 0,
  });
  const [progress, setProgress] = useState(0);
  const [moved, setMoved] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const said = useRef(new Set<number>());
  const arrived = progress > 0.985;
  useSfxBed('street');
  useSfxBed('cable-live', true, 0.7);
  useUiSfx();
  // Development only: lets tooling place Hiro along the route (window.__lastGateWalk.p = 0..1).
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as Window & { __lastGateWalk?: WalkState }).__lastGateWalk =
        state.current;
  }, []);

  useEffect(() => {
    for (const [at, text] of LINES)
      if (progress >= at && !said.current.has(at)) {
        said.current.add(at);
        setLine(text);
      }
  }, [progress]);
  useEffect(() => {
    if (!line) return;
    const timeSeconds = window.setTimeout(() => setLine(null), 3600);
    return () => window.clearTimeout(timeSeconds);
  }, [line]);

  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    sfx.play('mech.latch');
    sfx.play('mech.lid-creak', { gain: 0.6, delay: 0.2 });
    void import('./ServiceBay');
    // Build the bay under the chapter cover, so it's ready when the cover lifts.
    transitionChapter(() => {
      void import('./bayScene').then((mesh) => {
        mesh.prepareServiceBay();
        enterServiceBay();
      });
    }, true);
  }, [leaving]);

  useEffect(() => {
    const state2 = state.current,
      fwd = ['KeyW', 'ArrowUp', 'Space'],
      back = ['KeyS', 'ArrowDown'];
    const down = (event: KeyboardEvent) => {
      if (fwd.includes(event.code)) {
        event.preventDefault();
        state2.forward = true;
        setMoved(true);
      }
      if (back.includes(event.code)) {
        event.preventDefault();
        state2.back = true;
      }
      if ((event.code === 'KeyE' || event.code === 'Enter') && state2.p > 0.985)
        enter();
    };
    const up = (event: KeyboardEvent) => {
      if (fwd.includes(event.code)) state2.forward = false;
      if (back.includes(event.code)) state2.back = false;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY > 0) {
        state2.impulse = Math.min(1.4, state2.impulse + 0.45);
        setMoved(true);
      }
    };
    const move = (event: PointerEvent) =>
      state2.pointer.set(
        (event.clientX / innerWidth - 0.5) * 2,
        (event.clientY / innerHeight - 0.5) * 2,
      );
    const press = (event: PointerEvent) => {
      if (
        event.button === 0 &&
        !(event.target as HTMLElement).closest('button')
      ) {
        state2.forward = true;
        setMoved(true);
      }
    };
    const release = () => {
      state2.forward = false;
    };
    const blur = () => {
      state2.forward = false;
      state2.back = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('blur', blur);
    };
  }, [enter]);

  const metres = Math.max(
    0,
    Math.round((1 - progress) * LENGTH + (0 - GATE_Z - 56)),
  );
  return (
    <main
      className={`walk ${leaving ? 'walk-leaving' : ''}`}
      aria-label="The walk to Bay 6"
    >
      <div className="walk-world">
        <Canvas
          dpr={dpr}
          camera={{ fov: 54, near: 0.1, far: 460, position: [0, EYE, 8] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <AdaptiveDpr onChange={setDpr} />
          <WalkWorld state={state} onProgress={setProgress} />
          <SceneQuality
            manageDpr={false}
            onReady={onReady}
            onError={onLoadError}
          />
        </Canvas>
      </div>
      <div className="walk-grade" aria-hidden="true" />
      <div className="walk-objective" role="status">
        <span>FOLLOW THE LIVE CABLE</span>
        <b>
          Bay 6 <i>·</i> {metres} m
        </b>
      </div>
      {line && (
        <p className="walk-line" key={line} role="status">
          <small>HIRO</small>
          {line}
        </p>
      )}
      {!moved && !arrived && (
        <p className="walk-hint">
          HOLD <b>W</b> · SPACE · OR THE MOUSE TO WALK <i>·</i> SCROLL TO STEP
        </p>
      )}
      {arrived && (
        <button className="walk-enter" onClick={enter}>
          Enter Bay 6 <i>→</i>
        </button>
      )}
      <SoundToggle />
      <SceneCurtain ready={ready} error={loadError} />
      <p className="sr-only">
        Hold W, Space or the mouse button to walk along the street, or scroll to
        step. Move the pointer to look around. At the gate, press Enter or E, or
        select Enter Bay 6.
      </p>
    </main>
  );
}
