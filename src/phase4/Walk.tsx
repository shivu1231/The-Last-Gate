import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as T from 'three';
import { SceneKit, seeded, type Pose } from '../phase2/SceneKit';
import { createCityBackdrop } from '../presentation/Backdrop';
import { SceneQuality } from '../presentation/SceneQuality';
import { transitionChapter } from '../presentation/chapterTransition';
import { reducedMotion } from '../config/experience';
import { enterServiceBay } from './entry';
import { sfx, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import { batchStaticGeometry, createBaySixArchitecture, createServiceStreetDetail } from './environmentDetail';
import { Dressing, buildingFrame, cityMaterials, dressFacade, dressRoof, roadBreakup, skyline } from '../environment/CityDressing';
import './walk.css';
import { AdaptiveDpr } from '../performance/AdaptiveDpr';
import { SceneCurtain } from '../presentation/SceneCurtain';

/**
 * Between the board and Bay 6: Hiro leaves Baymax and walks the corrupted city, following the
 * one thing still alive in it, a service cable whose current runs toward Bay 6. Same world as
 * every earlier phase (slate architecture, cyan haze, displaced blocks, the fracture skyline);
 * the route ends at the maintenance yard's gate, where the bay itself (ServiceBay) picks up.
 */

const EYE = 1.62, GATE_Z = -64;
const PATH = new T.CatmullRomCurve3([
  [0, EYE, 8], [.8, EYE, -4], [-1, EYE, -16], [-.6, EYE, -28], [.9, EYE, -40], [0, EYE, -50], [0, EYE, -56],
].map(([x, y, z]) => new T.Vector3(x, y, z)), false, 'centripetal');
const LENGTH = PATH.getLength();
const PIPE_Z = -29;
const LINES: [number, string][] = [
  [0, 'I need something that slows him down.'],
  [.1, 'That cable’s still live.'],
  [.52, 'It’s feeding something up ahead.'],
  [.93, 'Bay 6. Robotics maintenance.'],
];

type WalkState = { p: number; speed: number; forward: boolean; back: boolean; pointer: T.Vector2; impulse: number };

function buildStreet() {
  const k = new SceneKit('walk-street');
  k.concrete.color.set('#465759'); k.ivory.color.set('#7c8c87');
  k.metal.color.set('#6b7b78'); k.edge.color.set('#253537');
  const detail = createServiceStreetDetail(); k.root.add(detail.root);
  const random = seeded(6061);
  const rand = (a: number, b: number) => a + random() * (b - a);

  // Ground: the service lane, with slabs heaved by the displacement.
  k.box({ p: [0, -.3, -30], s: [13, .6, 84] }, k.edge);
  k.box({ p: [0, .01, -30], s: [12.4, .04, 83.4] }, k.concrete);
  const marks: Pose[] = []; for (let i = 0; i < 22; i++) marks.push({ p: [-.15, .04, 8 - i * 3.4], s: [.1, .02, 1.5] });
  k.instances(marks, k.metal);
  for (const [x, z, rx, rz] of [[-3.8, -12, .14, .1], [4.1, -23, -.12, -.16], [-4.4, -37, .1, -.08], [3.6, -47, -.16, .12]]) k.box({ p: [x, .1, z], s: [3.2, .22, 3.6], r: [rx, rand(-.3, .3), rz] }, k.concrete);
  // Kerbs and broken barriers.
  for (const side of [-1, 1]) for (let z = 6; z > -60; z -= 5.5) if (random() > .25) k.box({ p: [side * 5.9, .32, z], s: [.45, .65, rand(2.2, 4)], r: [0, 0, side * rand(0, .05)] }, k.ivory);

  // Solid, varied blocks and their side walls are owned by the street-detail kit. Behind them, a
  // taller second row and the far city close the sky, so the street reads as one district of many.
  const dress = new Dressing(k), cm = cityMaterials(k), cityRandom = seeded(6062);
  const backTones = [k.standard('#3e4c50', .9, .08), k.standard('#5a5f5c', .9, .06), k.standard('#4a4642', .9, .06)];
  for (const side of [-1, 1]) for (let z = 4; z > -66; z -= 9 + cityRandom() * 4) {
    const w = 8 + cityRandom() * 5, d = 8 + cityRandom() * 4, h = 24 + cityRandom() * 18, x = side * (21 + w / 2 + cityRandom() * 4);
    const frame = buildingFrame(x, z);
    k.box({ p: [x, h / 2, z], s: [w, h, d] }, backTones[Math.floor(cityRandom() * backTones.length)]);
    dressFacade(dress, cm, frame, w, h, d, [side > 0 ? '-x' : '+x', '+z'], cityRandom, { from: 1.2 });
    dressRoof(dress, cm, frame, w, h, d, cityRandom, { tower: h > 36 });
  }
  const far = [k.standard('#2c3a40', .9, .1), k.standard('#363d40', .9, .1)];
  skyline(dress, cm, cityRandom, { x: [-55, 55], z: [-112, -88], count: 12, h: [26, 52], tones: far });
  skyline(dress, cm, cityRandom, { x: [-34, 34], z: [32, 54], count: 7, h: [18, 36], facing: -1, tones: far });
  roadBreakup(dress, cm, cityRandom, { x: [-4.6, 4.6], z: [-58, 7], y: .043, count: 18, cracks: false, patch: k.standard('#434d4b', .95, .02) });
  dress.build();
  k.haze({ p: [0, 10, -86], s: [110, 28, 1] }, '#4f8396', .14);
  // Floating fragments held over the street.
  for (let i = 0; i < 9; i++) k.box({ p: [rand(-9, 9), rand(9, 18), rand(-55, 0)], s: [rand(.6, 2.4), rand(.3, 1), rand(.6, 2)], r: [rand(0, 3), rand(0, 3), rand(0, 3)] }, k.concrete);

  // The fallen service pipe Hiro ducks under halfway.
  k.box({ p: [0, 2.05, PIPE_Z], s: [14, .45, .45], r: [0, .12, -.09] }, k.metal);
  k.box({ p: [-6.2, 1, PIPE_Z - .4], s: [.4, 2.4, .4], r: [0, 0, .5] }, k.metal);

  // Signage: bilingual, a few surviving lights. Two point toward Bay 6.
  const signs: [string, number, number, string][] = [
    ['保守区画 BAY 6  →  220 m', -3.6, -9, '#8fe9ff'], ['港湾サービス / HARBOUR SERVICE', 3.9, -18, '#ff9a63'], ['BAY 6  ロボ整備  →  80 m', -3.7, -42, '#8fe9ff'],
  ];
  for (const [text, x, z, color] of signs) {
    k.box({ p: [x, 1.6, z], s: [.12, 3.2, .12] }, k.metal);
    // Boards face up the street, so they read as Hiro walks toward them.
    k.box({ p: [x - Math.sign(x) * 1.5, 3.25, z], s: [3.6, .55, .08] }, k.dark);
    k.label(text, { p: [x - Math.sign(x) * 1.5 + .25, 3.22, z + .05] }, 3.8, color);
  }
  // Street lamps: two dead, two still warm.
  const lamps: T.Vector3[] = [];
  for (const [x, z, live] of [[5.3, -6, true], [-5.3, -20, false], [5.3, -36, true], [-5.3, -50, false]] as [number, number, boolean][]) {
    k.box({ p: [x, 2.6, z], s: [.14, 5.2, .14], r: [0, 0, Math.sign(x) * .04] }, k.metal);
    k.box({ p: [x - Math.sign(x) * .6, 5.15, z], s: [1.3, .1, .1] }, k.metal);
    k.mesh(new T.SphereGeometry(.13, 12, 10), live ? k.basic('#ffc062', 1.6) : k.dark, { p: [x - Math.sign(x) * 1.2, 5.05, z] });
    if (live) lamps.push(new T.Vector3(x - Math.sign(x) * 1.2, 4.9, z));
  }

  // Bay 6's front. The shutter is down, so the hall inside is only seen once Hiro is in it; he
  // goes in by the lit side door on the right, the same door the bay opens behind him.
  const bay = createBaySixArchitecture(); bay.root.position.z = GATE_Z; k.root.add(bay.root);
  const front = new T.Group(); front.position.z = GATE_Z; k.root.add(front);
  const shutter = k.standard('#5d6b66', .55, .45), slatLine = k.standard('#2a3331', .7, .3);
  for (let y = .12; y < 3.82; y += .21) { k.box({ p: [0, y + .1, .3], s: [7.56, .19, .07] }, shutter, front); k.box({ p: [0, y, .34], s: [7.56, .02, .02] }, slatLine, front); }
  k.box({ p: [0, .08, .36], s: [7.6, .16, .12] }, k.dark, front);
  k.box({ p: [0, 1.0, .37], s: [.5, .06, .05] }, k.metal, front);
  // Side door, propped by the light behind it: frame, wired-glass panel, push plate, lamp, sign.
  k.box({ p: [4.7, 1.08, .48], s: [1.08, 2.18, .1] }, k.dark, front);
  k.box({ p: [4.7, 1.04, .54], s: [.92, 2.04, .06] }, k.standard('#47544f', .6, .4), front);
  k.box({ p: [4.7, 1.5, .58], s: [.36, .5, .02] }, k.basic('#ffcf8f', 1.4), front);
  k.box({ p: [4.42, 1.0, .59], s: [.05, .3, .04] }, k.metal, front);
  k.box({ p: [4.7, 2.36, .56], s: [.5, .1, .2] }, k.dark, front);
  k.mesh(new T.SphereGeometry(.07, 12, 8), k.basic('#ffd9a0', 1.8), { p: [4.7, 2.28, .64] }, front);
  k.box({ p: [4.7, .01, 1.0], s: [1.2, .02, .9] }, k.basic('#3a2c1a', .6), front);
  k.label('BAY 6 · STAFF', { p: [4.95, 2.6, .58] }, 1.6, '#e8cf9c', front);
  k.haze({ p: [4.7, 1.4, GATE_Z + 1.1], s: [2.4, 2.8, 1] }, '#ffb066', .22);
  batchStaticGeometry(k);
  return { kit: k, lamps, dispose: () => { detail.dispose(); bay.dispose(); k.dispose(); } };
}

/** The live service cable: lies along the kerb, current pulsing toward Bay 6. */
function buildCable() {
  const points: T.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, p = PATH.getPointAt(t), tangent = PATH.getTangentAt(t);
    const side = new T.Vector3(-tangent.z, 0, tangent.x).normalize();
    points.push(p.clone().addScaledVector(side, 3.2).setY(.09 + Math.max(0, Math.sin(i * 1.7)) * .03));
  }
  // Up the gate pylon and into the yard.
  points.push(new T.Vector3(3.2, .09, -60), new T.Vector3(3.4, .12, GATE_Z + 1.1), new T.Vector3(3.6, .5, GATE_Z + .75), new T.Vector3(3.6, 1.2, GATE_Z + .77));
  const material = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float uTime;void main(){float band=pow(max(0.,sin((vUv.x*46.-uTime*2.2)*3.14159)),18.);vec3 base=vec3(.05,.07,.08);vec3 hot=vec3(1.,.66,.32);gl_FragColor=vec4(base+hot*(.18+band*1.8),1.);}',
  });
  const mesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), 600, .045, 8, false), material);
  return { mesh, material };
}

function WalkWorld({ state, onProgress }: { state: React.MutableRefObject<WalkState>; onProgress: (p: number) => void }) {
  const { camera, scene } = useThree();
  const street = useMemo(buildStreet, []);
  const cable = useMemo(buildCable, []);
  const skyline = useMemo(() => {
    const city = createCityBackdrop();
    city.group.position.set(0, -6, -128); city.group.scale.setScalar(1.3);
    city.group.traverse(o => { o.castShadow = false; });
    return city;
  }, []);
  const look = useMemo(() => new T.Vector3(), []), ahead = useMemo(() => new T.Vector3(), []), gate = useMemo(() => new T.Vector3(0, 2, GATE_Z), []);
  const steps = useRef(0), reported = useRef(-1), initialized = useRef(false), stride = useRef(0), ducked = useRef(false);
  const head = useMemo(() => new T.Vector2(), []), pos = useMemo(() => new T.Vector3(), []);

  useEffect(() => {
    scene.add(street.kit.root, cable.mesh, skyline.group);
    return () => { scene.remove(street.kit.root, cable.mesh, skyline.group); street.dispose(); cable.mesh.geometry.dispose(); cable.material.dispose(); skyline.dispose(); };
  }, [scene, street, cable, skyline]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, .05), t = clock.elapsedTime, s = state.current;
    cable.material.uniforms.uTime.value = t;
    // Walk: held input sets a pace, a scroll adds a step; the path is the only way.
    const goal = s.forward ? 3.3 : s.back ? -1.4 : 0;
    s.speed = T.MathUtils.damp(s.speed, goal + s.impulse * 3.5, 3, dt); s.impulse = Math.max(0, s.impulse - dt * 2.2);
    s.p = T.MathUtils.clamp(s.p + s.speed * dt / LENGTH, 0, 1);
    steps.current += Math.abs(s.speed) * dt * 2.1;
    PATH.getPointAt(s.p, pos);
    const bob = reducedMotion ? 0 : Math.sin(steps.current * 2) * .02 * Math.min(1, Math.abs(s.speed) / 2.5);
    const duck = Math.exp(-Math.pow((pos.z - PIPE_Z) / 1.6, 2)) * .5;
    // Footfalls on the bob, louder with pace; the pipe groans overhead as he ducks under it.
    if (Math.floor(steps.current / (Math.PI / 2)) !== stride.current) { stride.current = Math.floor(steps.current / (Math.PI / 2)); if (Math.abs(s.speed) > .4) sfx.play('step.grit', { gain: Math.min(1, .45 + Math.abs(s.speed) / 4) }); }
    if (duck > .3 !== ducked.current) { ducked.current = duck > .3; if (ducked.current) sfx.play('move.duck', { at: [0, 2.05, PIPE_Z] }); }
    camera.position.set(pos.x + (reducedMotion ? 0 : Math.sin(steps.current) * .012), pos.y + bob - duck, pos.z);
    // Look down the route; near the end, the gate takes over. The pointer turns the head.
    PATH.getPointAt(Math.min(1, s.p + .05), ahead);
    if (!initialized.current) { look.copy(ahead); initialized.current = true; }
    look.lerp(ahead.lerp(gate, T.MathUtils.smoothstep(s.p, .8, 1)), 1 - Math.exp(-dt * 4));
    if (look.lengthSq() === 0) look.copy(ahead);
    camera.lookAt(look);
    head.lerp(s.pointer, 1 - Math.exp(-dt * 5));
    camera.rotateY(-head.x * .38); camera.rotateX(-head.y * .17);
    camera.updateMatrixWorld(); sfx.listener(camera); sfx.placeBed('cable-live', [pos.x + 3.2, .1, pos.z], 2.4);
    const rounded = Math.round(s.p * 100);
    if (rounded !== reported.current) { reported.current = rounded; onProgress(s.p); }
  });

  return <>
    <color attach="background" args={['#0a1622']} />
    <fog attach="fog" args={['#172d39', 20, 135]} />
    <hemisphereLight args={['#a1c2cc', '#151c1d', .95]} />
    <directionalLight position={[-8, 16, 6]} intensity={2} color="#d5dfdb" />
    <pointLight position={[0, 3.1, GATE_Z + 3]} intensity={10} distance={14} color="#ffd3a0" />
    <pointLight position={[4.7, 2.2, GATE_Z + 1.4]} intensity={6} distance={7} color="#ffc27a" />
    {street.lamps.map((p, i) => <pointLight key={i} position={p} intensity={5} distance={11} color="#ffc062" />)}
  </>;
}

export function Walk() {
  const [dpr, setDpr] = useState(1);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onReady = useCallback(() => setReady(true), []);
  const onLoadError = useCallback(() => setLoadError('The street could not be loaded.'), []);
  const state = useRef<WalkState>({ p: 0, speed: 0, forward: false, back: false, pointer: new T.Vector2(), impulse: 0 });
  const [progress, setProgress] = useState(0);
  const [moved, setMoved] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const said = useRef(new Set<number>());
  const arrived = progress > .985;
  useSfxBed('street'); useSfxBed('cable-live', true, .7); useUiSfx();
  // Development only: lets tooling place Hiro along the route (window.__lastGateWalk.p = 0..1).
  useEffect(() => { if (import.meta.env.DEV) (window as Window & { __lastGateWalk?: WalkState }).__lastGateWalk = state.current; }, []);

  useEffect(() => {
    for (const [at, text] of LINES) if (progress >= at && !said.current.has(at)) { said.current.add(at); setLine(text); }
  }, [progress]);
  useEffect(() => { if (!line) return; const t = window.setTimeout(() => setLine(null), 3600); return () => window.clearTimeout(t); }, [line]);

  const enter = useCallback(() => {
    if (leaving) return; setLeaving(true); sfx.play('mech.latch'); sfx.play('mech.lid-creak', { gain: .6, delay: .2 });
    void import('./ServiceBay');
    // Build the bay under the chapter cover, so it's ready when the cover lifts.
    transitionChapter(() => { void import('./bayScene').then(m => { m.prepareServiceBay(); enterServiceBay(); }); }, true);
  }, [leaving]);

  useEffect(() => {
    const s = state.current, fwd = ['KeyW', 'ArrowUp', 'Space'], back = ['KeyS', 'ArrowDown'];
    const down = (e: KeyboardEvent) => {
      if (fwd.includes(e.code)) { e.preventDefault(); s.forward = true; setMoved(true); }
      if (back.includes(e.code)) { e.preventDefault(); s.back = true; }
      if ((e.code === 'KeyE' || e.code === 'Enter') && s.p > .985) enter();
    };
    const up = (e: KeyboardEvent) => { if (fwd.includes(e.code)) s.forward = false; if (back.includes(e.code)) s.back = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); if (e.deltaY > 0) { s.impulse = Math.min(1.4, s.impulse + .45); setMoved(true); } };
    const move = (e: PointerEvent) => s.pointer.set((e.clientX / innerWidth - .5) * 2, (e.clientY / innerHeight - .5) * 2);
    const press = (e: PointerEvent) => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) { s.forward = true; setMoved(true); } };
    const release = () => { s.forward = false; };
    const blur = () => { s.forward = false; s.back = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move); window.addEventListener('pointerdown', press); window.addEventListener('pointerup', release); window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', press); window.removeEventListener('pointerup', release); window.removeEventListener('blur', blur);
    };
  }, [enter]);

  const metres = Math.max(0, Math.round((1 - progress) * LENGTH + (0 - GATE_Z - 56)));
  return <main className={`walk ${leaving ? 'walk-leaving' : ''}`} aria-label="The walk to Bay 6">
    <div className="walk-world"><Canvas dpr={dpr} camera={{ fov: 54, near: .1, far: 460, position: [0, EYE, 8] }} gl={{ antialias: true, powerPreference: 'high-performance' }}><AdaptiveDpr onChange={setDpr} />
      <WalkWorld state={state} onProgress={setProgress} />
      <SceneQuality manageDpr={false} onReady={onReady} onError={onLoadError} />
    </Canvas></div>
    <div className="walk-grade" aria-hidden="true" />
    <div className="walk-objective" role="status"><span>FOLLOW THE LIVE CABLE</span><b>Bay 6 <i>·</i> {metres} m</b></div>
    {line && <p className="walk-line" key={line} role="status"><small>HIRO</small>{line}</p>}
    {!moved && !arrived && <p className="walk-hint">HOLD <b>W</b> · SPACE · OR THE MOUSE TO WALK <i>·</i> SCROLL TO STEP</p>}
    {arrived && <button className="walk-enter" onClick={enter}>Enter Bay 6 <i>→</i></button>}
    <SoundToggle />
    <SceneCurtain ready={ready} error={loadError} />
    <p className="sr-only">Hold W, Space or the mouse button to walk along the street, or scroll to step. Move the pointer to look around. At the gate, press Enter or E, or select Enter Bay 6.</p>
  </main>;
}
