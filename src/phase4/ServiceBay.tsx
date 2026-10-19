import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPortalDimension } from '../environment/PortalDimension.js';
import { reducedMotion } from '../config/experience';
import { TaskRail, type RailTask } from '../ui/TaskRail';
import { BayPlan, RegulatorSheet, plan, type PlanMark } from './BayPanels';
import { districtExit } from './exit';
import { enterServiceBay, type BayStart } from './entry';
import { sfx, nearestOnPath, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import { CABLE_PATH, CABLE_WALK, EYE, VIEWS, takeServiceBay, type BayState, type ServiceBay as Bay, type View } from './bayScene';
import type { V3 } from './bayKit';
import { createBayRender, type BayRender } from './bayRender';
import './bay.css';
import './bay-theme.css';
import { AdaptiveDpr } from '../performance/AdaptiveDpr';
import { SceneCurtain } from '../presentation/SceneCurtain';

/**
 * Phase 4, inside Bay 6. Hiro walks in from the gate, looks around the abandoned bay, reads a job
 * card about a regulator left on charge, follows the live street cable to the corner under the
 * stairs, moves the crates hiding a steel case, opens it and takes the power regulator. The
 * registered exit (Phase 5) then carries it back to Baymax.
 */

type Stage = 'enter' | 'explore' | 'cable' | 'crates' | 'box' | 'taken';
type Spot = 'cradle' | 'toolwall' | 'jobcard';
type Info = { kicker: string; title: string; body: string; next?: string };

const SPOTS: Record<Spot, Info & { view: View; pin: string; line: string; note: string }> = {
  cradle: { view: VIEWS.cradle, pin: 'Service stand', kicker: 'Service stand 6', title: 'Big enough for Baymax', body: 'Rated for a two-tonne frame. The clamps are open, so whatever was in it walked out on its own.', line: 'Big enough for Baymax. Empty.', note: 'Stand 6: clamps open, unit gone.' },
  toolwall: { view: VIEWS.toolwall, pin: 'Shadow board', kicker: 'Shadow board', title: 'They took the good drivers', body: 'Every torque driver’s gone. The cheap screwdrivers stayed. People grab what matters when they run.', line: 'They took the good drivers.', note: 'Torque drivers gone, cheap ones left.' },
  jobcard: { view: VIEWS.bench, pin: 'Bench 2', kicker: 'Job card · bench 2', title: '“PR-6. Do not unplug.”', body: 'A power regulator, left on charge, with a spare boxed up somewhere. That’s exactly what Baymax needs.', line: 'A regulator? On charge? Okay. Where?', note: 'Job card: PR-6 on charge, spare boxed.' },
};
const ORDER: Spot[] = ['cradle', 'toolwall', 'jobcard'];
const HOLD: View = { pos: [-6.4, EYE, -25.5], look: [2, 1.5, -16] };

type Request = { via: V3[]; to: View; lookAlong?: (q: number, out: T.Vector3) => void; speed?: number; done?: () => void };
type Cam = { request: Request | null; snap: View | null; pointer: T.Vector2 };
type Pin = { id: string; label: string; anchor: T.Vector3; onClick: () => void; seen?: boolean };
const SPOT_AT: Record<Spot, [number, number]> = { cradle: [2, -15], toolwall: [-10.6, -16.6], jobcard: [-9.95, -11.75] };

const ease = (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function World({ bay, cam, state, pins, pinEls, hiro, onPick, onReady, onError }: {
  bay: Bay; cam: MutableRefObject<Cam>; state: MutableRefObject<BayState>;
  pins: MutableRefObject<Pin[]>; pinEls: MutableRefObject<Record<string, HTMLButtonElement | null>>; hiro: MutableRefObject<SVGGElement | null>;
  onPick: (part: string) => void; onReady: () => void; onError: (message: string) => void;
}) {
  const { camera, scene, gl, raycaster } = useThree();
  const skyline = useMemo(() => {
    const city = createPortalDimension();
    city.group.position.set(0, -4, -78); city.group.scale.setScalar(1.05);
    city.group.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    return city;
  }, []);
  const move = useRef<{ curve: T.CatmullRomCurve3; from: T.Vector3; to: T.Vector3; t: number; duration: number; lookAlong?: Request['lookAlong']; done?: () => void } | null>(null);
  const look = useMemo(() => new T.Vector3(...VIEWS.gate.look), []), lookOut = useMemo(() => new T.Vector3(), []), v = useMemo(() => new T.Vector3(), []), dir = useMemo(() => new T.Vector3(), []);
  const pointer = useRef(new T.Vector2()), steps = useRef(0), frames = useRef(0), smooth = useRef(0), bobPos = useMemo(() => new T.Vector3(), []);
  const stride = useRef(0), cableAt = useMemo((): [number, number, number] => [0, 0, 0], []);
  const [live, setLive] = useState(false);

  const draw = useRef<BayRender | null>(null);
  useEffect(() => {
    const pmrem = new T.PMREMGenerator(gl), env = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    scene.environment = env; scene.environmentIntensity = .2;
    // Raycasts must still reach the regulator's glass, which draws in the late pass (see bayRender.ts).
    raycaster.layers.enableAll();
    // Compile every shader off the main path first, then put the bay in the scene in one go.
    let alive = true;
    const split = draw.current = createBayRender(scene, bay.root, skyline.group);
    if (import.meta.env.DEV) (window as Window & { __bay?: unknown }).__bay = { scene, bay, skyline, gl, split };
    const show = () => { if (!alive) return; bay.root.visible = skyline.group.visible = true; setLive(true); };
    bay.root.visible = skyline.group.visible = true;
    split.compile(gl, camera).then(show, () => { if (alive) onError('Bay 6 could not finish loading. Please reload to try again.'); });
    bay.root.visible = skyline.group.visible = false;
    return () => { alive = false; draw.current = null; split.dispose(gl); scene.environment = null; env.dispose(); pmrem.dispose(); skyline.dispose(); };
  }, [scene, gl, camera, raycaster, bay, skyline]);
  // Rendering is ours (priority 1): see bayRender.ts.
  useFrame(() => { draw.current?.render(gl, camera, bay.shadowsDirty); }, 1);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, .05), t = clock.elapsedTime, c = cam.current;
    // The first frames push everything through the GPU once; tell the page once the bay is on screen
    // and frames have settled (two quick ones in a row), so the fade-in never hitches.
    if (live && frames.current >= 0 && ++frames.current >= 4) {
      smooth.current = delta < 1 / 12 ? smooth.current + 1 : 0;
      if (smooth.current >= 2 || frames.current >= 90) { frames.current = -1; onReady(); }
    }
    skyline.update(t, dt, reducedMotion, 0, 'approaching');
    if (c.snap) { bobPos.set(...c.snap.pos); look.set(...c.snap.look); move.current = null; c.snap = null; }
    if (c.request) {
      const r = c.request; c.request = null;
      const pts = [bobPos.clone(), ...r.via.map(p => new T.Vector3(...p)), new T.Vector3(...r.to.pos)];
      if (pts[0].distanceTo(pts[1]) < .05) pts.shift();
      if (pts.length < 2) pts.unshift(bobPos.clone());
      const curve = new T.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength();
      move.current = { curve, from: look.clone(), to: new T.Vector3(...r.to.look), t: 0, duration: reducedMotion ? .01 : T.MathUtils.clamp(len / (r.speed ?? 3.2), .9, r.speed ? 9 : 4.2), lookAlong: r.lookAlong, done: r.done };
    }
    let walking = 0;
    const m = move.current;
    if (m) {
      m.t = Math.min(1, m.t + dt / m.duration);
      const q = ease(m.t);
      m.curve.getPointAt(q, bobPos);
      if (m.lookAlong) { m.lookAlong(q, lookOut); look.copy(lookOut).lerp(m.to, T.MathUtils.smoothstep(m.t, .75, 1)); }
      else look.lerpVectors(m.from, m.to, T.MathUtils.smoothstep(m.t, 0, .85));
      walking = Math.sin(Math.PI * m.t);
      if (m.t >= 1) { move.current = null; m.done?.(); }
    }
    steps.current += walking * dt * 7.2;
    if (Math.floor(steps.current / Math.PI) !== stride.current) { stride.current = Math.floor(steps.current / Math.PI); if (walking > .15) sfx.play('step.concrete', { gain: .5 + walking * .5 }); }
    const bob = reducedMotion ? 0 : Math.sin(steps.current) * .028 * walking;
    camera.position.set(bobPos.x + (reducedMotion ? 0 : Math.cos(steps.current * .5) * .018 * walking), bobPos.y + bob, bobPos.z);
    camera.lookAt(look);
    // A little head turn toward the pointer; never enough to lose what's being looked at.
    pointer.current.lerp(c.pointer, 1 - Math.exp(-dt * 3));
    camera.rotateY(-pointer.current.x * .09); camera.rotateX(-pointer.current.y * .05);
    camera.updateMatrixWorld(); sfx.listener(camera); sfx.placeBed('cable-live', nearestOnPath(CABLE_PATH, camera.position.x, camera.position.y, camera.position.z, cableAt), 1.6);
    bay.update(t, dt, state.current, camera);
    // Screen pins follow their anchors.
    for (const pin of pins.current) {
      const el = pinEls.current[pin.id]; if (!el) continue;
      v.copy(pin.anchor).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.opacity = visible ? '' : '0'; el.style.pointerEvents = visible ? '' : 'none';
      el.style.transform = `translate(${(v.x * .5 + .5) * innerWidth}px, ${(-v.y * .5 + .5) * innerHeight}px) translate(-50%, -50%)`;
      const metres = `${Math.max(1, Math.round(camera.position.distanceTo(pin.anchor)))} m`, tag = el.lastElementChild;
      if (tag && tag.textContent !== metres) tag.textContent = metres;
    }
    // Hiro's marker on the floor plan: where he stands and which way he faces.
    if (hiro.current) {
      const [px, py] = plan(camera.position.x, camera.position.z); camera.getWorldDirection(dir);
      hiro.current.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(Math.atan2(dir.x, -dir.z) * 180 / Math.PI).toFixed(1)})`);
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    let o: T.Object3D | null = e.object;
    while (o && !o.userData.part) o = o.parent;
    const part = o?.userData.part ?? (e.object === bay.limiter || bay.limiter.getObjectById(e.object.id) ? 'regulator' : null);
    if (part) { e.stopPropagation(); onPick(part); }
  };
  const hover = (on: boolean) => () => { document.body.style.cursor = on ? 'pointer' : ''; if (on) sfx.play('ui.hover'); };
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return <>
    <color attach="background" args={['#0a1622']} />
    <fog attach="fog" args={['#1a3850', 4, 150]} />
    {live && <>
      <primitive object={bay.crates} onClick={pick} onPointerOver={hover(true)} onPointerOut={hover(false)} />
      <primitive object={bay.box} onClick={pick} onPointerOver={hover(true)} onPointerOut={hover(false)} />
      <primitive object={bay.limiter} onClick={pick} onPointerOver={hover(true)} onPointerOut={hover(false)} />
    </>}
  </>;
}

export function ServiceBay({ start }: { start: BayStart }) {
  const [dpr, setDpr] = useState(1);
  const bay = useMemo(takeServiceBay, []);
  useEffect(() => () => bay.dispose(), [bay]);
  const initial: View = start === 'enter' ? VIEWS.gate : start === 'box' ? VIEWS.box : HOLD;
  const cam = useRef<Cam>({ request: null, snap: initial, pointer: new T.Vector2() });

  const [stage, setStage] = useState<Stage>(start === 'enter' ? 'enter' : start === 'box' ? 'box' : 'taken');
  const [seen, setSeen] = useState<Spot[]>(start === 'enter' ? [] : ORDER);
  const [focus, setFocus] = useState<Spot | null>(null);
  const [cleared, setCleared] = useState(start !== 'enter');
  const [latches, setLatches] = useState<[boolean, boolean]>(start === 'found' ? [true, true] : [false, false]);
  const [lid, setLid] = useState(start === 'found');
  const [busy, setBusy] = useState(start === 'enter');
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const state = useRef<BayState>({ cleared: 0, latches: [false, false], lid: false, lift: 0, charge: 0 });
  state.current = { cleared: cleared ? 1 : 0, latches, lid, lift: stage === 'taken' ? 1 : 0, charge: lid ? 1 : 0 };
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, reducedMotion ? Math.min(ms, 60) : ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useSfxBed('bay'); useSfxBed('cable-live', true, stage === 'taken' ? .2 : 1); useUiSfx();
  const say = (text: string) => setLine({ text, key: performance.now() });
  useEffect(() => { if (!line) return; const id = window.setTimeout(() => setLine(null), 4200); return () => window.clearTimeout(id); }, [line]);
  const walkTo = (req: Request) => { setBusy(true); cam.current.request = { ...req, done: () => { setBusy(false); req.done?.(); } }; };

  // Walk in from the gate, once the bay is on screen.
  useEffect(() => {
    if (!ready) return;
    if (start !== 'enter') { if (start === 'found') say('It won’t fix him. But it’ll hold him.'); return; }
    sfx.play('mech.clunk', { gain: .35, at: [4.7, 1, .4] });
    later(() => say('Lights are on. So where is everyone?'), 900);
    later(() => walkTo({ via: [[4.4, EYE, -3.4]], to: VIEWS.hub, speed: 1.8, done: () => setStage('explore') }), 900);
  }, [ready]);

  const visit = (spot: Spot) => {
    if (busy || stage !== 'explore') return;
    setFocus(null);
    walkTo({ via: [], to: SPOTS[spot].view, done: () => { setFocus(spot); setSeen(s => s.includes(spot) ? s : [...s, spot]); say(SPOTS[spot].line); } });
  };
  const nextSpot = () => { const next = ORDER.find(s => !seen.includes(s)) ?? 'jobcard'; visit(next); };
  const followCable = () => {
    if (busy || stage !== 'explore') return;
    setFocus(null); setStage('cable'); say('Okay, hot line. Show me.');
    const path = new T.CatmullRomCurve3(CABLE_WALK.map(p => new T.Vector3(...p)));
    walkTo({
      via: CABLE_WALK.slice(0, -1), to: VIEWS.crates, speed: 2.1,
      lookAlong: (q, out) => { path.getPointAt(Math.min(1, q + .2), out); out.set(out.x - 2.1, .25, out.z - 3.2); },
      done: () => { setStage('crates'); say('Under the crates. Of course it is.'); },
    });
  };
  const moveCrates = () => {
    if (busy || stage !== 'crates') return;
    setCleared(true); setBusy(true); crateSounds();
    later(() => walkTo({ via: [], to: VIEWS.box, speed: 1.4, done: () => { setStage('box'); say('It’s warm.'); } }), 1500);
  };
  const undoLatch = (i: 0 | 1) => { if (stage !== 'box' || busy || latches[i]) return; sfx.play('mech.latch', { at: bay.anchors[i ? 'latch1' : 'latch0'], pitch: i ? .94 : 1 }); setLatches(l => (i === 0 ? [true, l[1]] : [l[0], true])); };
  const liftLid = () => { if (stage !== 'box' || busy || lid || !latches[0] || !latches[1]) return; setLid(true); sfx.play('mech.lid-creak', { at: bay.anchors.lid }); sfx.play('sting.found', { delay: 1.1 }); later(() => say('PR-6. Oh, you’re perfect.'), 900); };
  const take = () => {
    if (stage !== 'box' || !lid || busy) return;
    setStage('taken'); sfx.play('mech.lift', { at: bay.anchors.regulator }); sfx.play('power.down', { gain: .6, delay: .45 });
    walkTo({ via: [], to: HOLD, speed: 1.2, done: () => say('It won’t fix him. But it’ll hold him.') });
  };
  const onPick = (part: string) => {
    if (part === 'crates') moveCrates();
    else if (part === 'latch0') undoLatch(0);
    else if (part === 'latch1') undoLatch(1);
    else if (part === 'regulator' && lid) take();
    else if (part === 'lid' || (part === 'regulator' && !lid)) { if (!latches[0]) undoLatch(0); else if (!latches[1]) undoLatch(1); else liftLid(); }
  };
  const restart = () => enterServiceBay('enter');
  // The crates come off in the order the scene animates them: two slide, one tips off the top, the tarp goes last.
  const crateSounds = () => {
    const at: [number, number, number] = [-8.3, .5, -27.3];
    sfx.play('mech.crate-scrape', { at }); sfx.play('mech.crate-scrape', { at, delay: .3, pitch: .9 }); sfx.play('mech.crate-thud', { at, delay: .62 });
    sfx.play('mech.crate-scrape', { at, delay: .5, pitch: 1.1 }); sfx.play('mech.crate-thud', { at: [-6.9, .3, -29.1], delay: .95, pitch: .85 }); sfx.play('mech.tarp', { at, delay: .8 });
  };
  const exit = districtExit();
  // The next chapter covers the cut itself; warm it up as soon as the regulator is in hand.
  const leave = () => { if (!exit || leaving) return; setLeaving(true); sfx.play('move.whoosh'); exit.go(); };
  useEffect(() => { if (stage === 'taken') void exit?.prepare?.().catch(() => {}); }, [stage]);

  // Dev: Ctrl+M does the next thing.
  const advance = useRef(() => {});
  advance.current = () => {
    if (stage === 'explore') { if (!seen.includes('jobcard')) visit('jobcard'); else followCable(); }
    else if (stage === 'crates') moveCrates();
    else if (stage === 'box') { if (!latches[0]) undoLatch(0); else if (!latches[1]) undoLatch(1); else if (!lid) liftLid(); else take(); }
    else if (stage === 'taken') leave();
  };
  useEffect(() => {
    const move = (e: PointerEvent) => cam.current.pointer.set((e.clientX / innerWidth - .5) * 2, (e.clientY / innerHeight - .5) * 2);
    const key = (e: KeyboardEvent) => { if (import.meta.env.DEV && e.ctrlKey && e.code === 'KeyM') { e.preventDefault(); advance.current(); } };
    // No page scroll over the bay, but the task rail and found card scroll on their own.
    const wheel = (e: WheelEvent) => { if (!(e.target instanceof Element && e.target.closest('.lg-rail, .bay-found'))) e.preventDefault(); };
    window.addEventListener('pointermove', move); window.addEventListener('keydown', key); window.addEventListener('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('keydown', key); window.removeEventListener('wheel', wheel); };
  }, []);

  // ── Tasks, pins and the info card all come from the same state.
  const readCard = seen.includes('jobcard'), openedCount = latches.filter(Boolean).length;
  const tasks: RailTask[] = [
    { id: 'look', title: 'Check the bay', detail: `${seen.length}/3 · stand, shadow board, benches`, hint: 'Start anywhere. The bench lamps are still on, which is weird.', state: readCard || (stage !== 'explore' && stage !== 'enter') ? 'done' : 'open', action: { label: 'Next spot', onClick: nextSpot, disabled: busy || stage !== 'explore' } },
    { id: 'cable', title: 'Trace the hot line', detail: readCard ? 'Street feed, still live' : 'Read the benches first', hint: 'It’s clipped to the floor every metre. Someone wanted it to stay put.', state: stage === 'cable' || stage === 'explore' ? (readCard ? 'open' : 'locked') : stage === 'enter' ? 'locked' : 'done', action: { label: 'Follow it', onClick: followCable, disabled: busy || stage !== 'explore' } },
    { id: 'crates', title: 'Shift the crates', detail: 'Where the line dives under', hint: 'Servo crates. Lift with the legs.', state: stage === 'crates' ? 'open' : cleared ? 'done' : 'locked', action: { label: 'Shift them', onClick: moveCrates, disabled: busy } },
    { id: 'case', title: 'Crack the case', detail: lid ? 'Open' : `${openedCount}/2 latches · then the lid`, hint: openedCount < 2 ? 'Over-centre latches. Flip them up, don’t pull.' : 'Lid’s free. Lift from the front edge.', state: lid ? 'done' : stage === 'box' ? 'open' : 'locked', action: openedCount < 2 ? { label: 'Flip a latch', onClick: () => undoLatch(latches[0] ? 1 : 0), disabled: busy } : { label: 'Lift the lid', onClick: liftLid, disabled: busy } },
    { id: 'take', title: 'Lift out the PR-6', detail: '48 V, still on charge', hint: 'Charge lead comes out last.', state: stage === 'taken' ? 'done' : lid ? 'open' : 'locked', action: { label: 'Take it', onClick: take, disabled: busy } },
  ];
  const notes = ['Main lights on. Nobody on shift.', ...seen.map(spot => SPOTS[spot].note)];
  if (stage === 'crates' || cleared) notes.push('Hot line ends under the stairs.');
  if (stage === 'box' || stage === 'taken') notes.push('Case “B6 · Spare”: warm, lamp blinking.');
  if (stage === 'taken') notes.push('PR-6 in hand. Gauge reads 8 %.');

  const pinList: Pin[] = [];
  if (!busy && stage === 'explore') {
    for (const spot of ORDER) if (spot !== focus) pinList.push({ id: spot, label: SPOTS[spot].pin, anchor: bay.anchors[spot], onClick: () => visit(spot), seen: seen.includes(spot) });
    if (readCard) pinList.push({ id: 'cable', label: 'Hot line', anchor: bay.anchors.cable, onClick: followCable });
  }
  if (!busy && stage === 'crates') pinList.push({ id: 'crates', label: 'Shift the crates', anchor: bay.anchors.crates, onClick: moveCrates });
  if (!busy && stage === 'box') {
    if (!latches[0]) pinList.push({ id: 'latch0', label: 'Latch', anchor: bay.anchors.latch0, onClick: () => undoLatch(0) });
    if (!latches[1]) pinList.push({ id: 'latch1', label: 'Latch', anchor: bay.anchors.latch1, onClick: () => undoLatch(1) });
    if (latches[0] && latches[1] && !lid) pinList.push({ id: 'lid', label: 'Lift the lid', anchor: bay.anchors.lid, onClick: liftLid });
    if (lid) pinList.push({ id: 'regulator', label: 'Lift out the PR-6', anchor: bay.anchors.regulator, onClick: take });
  }
  const pins = useRef<Pin[]>([]); pins.current = pinList;
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const hiro = useRef<SVGGElement | null>(null);

  const info: Info | null =
    stage === 'enter' ? { kicker: 'Bay 6 · Robotics maintenance', title: 'Lights on, nobody home', body: 'Shutter’s down but the street feed squeezes under it. Whatever’s on the end is still pulling current.', next: 'Have a look around.' }
      : stage === 'explore' ? (focus ? { ...SPOTS[focus], next: readCard ? 'Follow the hot line to whatever it’s charging.' : 'Check the rest: ' + ORDER.filter(spot => !seen.includes(spot)).map(spot => SPOTS[spot].pin.toLowerCase()).join(', ') + '.' }
        : { kicker: 'Bay 6', title: 'Somebody left mid-shift', body: 'Crane parked over an empty stand. Bench lamps still burning. Something in here is drawing power.', next: readCard ? 'Follow the hot line.' : 'Check the stand, the shadow board and the benches.' })
        : stage === 'cable' ? { kicker: 'Hot line', title: 'Clipped down every metre', body: 'It hugs the benches, then cuts toward the stairs. Somebody wanted it out of the way, not out of sight.', next: 'Keep following.' }
          : stage === 'crates' ? { kicker: 'Under the stairs', title: 'Too neat to be an accident', body: 'Four servo crates and a tarp, stacked right where the line goes under.', next: 'Shift the crates.' }
            : stage === 'box' ? (lid ? { kicker: 'PR-6 power regulator', title: 'Charged and waiting', body: 'Needle at 8 %, lamp steady. It’s been sitting on trickle charge since the bay emptied.', next: 'Lift it out.' }
              : { kicker: 'Case · B6 Spare', title: 'Warm to the touch', body: 'The charge lamp’s blinking amber. The hot line plugs straight into its end.', next: openedCount < 2 ? `Flip ${openedCount ? 'the last latch' : 'both latches'}, then the lid.` : 'Lift the lid.' })
              : null;
  const marks: PlanMark[] = [
    ...ORDER.map(spot => ({ id: spot, x: SPOT_AT[spot][0], z: SPOT_AT[spot][1], state: (seen.includes(spot) ? 'seen' : 'todo') as PlanMark['state'] })),
    ...(stage === 'crates' || cleared ? [{ id: 'case', x: -9.3, z: -27.4, state: (stage === 'taken' ? 'seen' : 'target') as PlanMark['state'] }] : []),
  ];
  const where: [string, string] = busy ? ['On the move', stage === 'cable' ? 'Following the hot line' : 'Walking'] : stage === 'enter' ? ['Side door', 'Just inside'] : stage === 'explore' ? (focus === 'cradle' ? ['Service stand 6', 'Centre bay'] : focus === 'toolwall' ? ['Shadow board', 'West wall'] : focus === 'jobcard' ? ['Bench 2', 'West wall'] : ['Main aisle', 'Near the door']) : ['Under the stairs', 'North-west corner'];
  const chapters = [['03', 'Board', 'done'], ['04', 'Walk', 'done'], ['04', 'Bay 6', 'now'], ['05', 'Baymax', 'next']] as const;

  return <main className={`bay bay-stage-${stage} ${ready ? 'bay-ready' : ''} ${leaving ? 'bay-leaving' : ''}`} aria-label="Inside Bay 6">
    <div className="bay-world">
      <Canvas shadows dpr={dpr} camera={{ fov: 52, near: .05, far: 420, position: VIEWS.gate.pos }} gl={{ antialias: true, powerPreference: 'high-performance' }}><AdaptiveDpr onChange={setDpr} />
        <World bay={bay} cam={cam} state={state} pins={pins} pinEls={pinEls} hiro={hiro} onPick={onPick} onError={setLoadError} onReady={() => { setReady(true); window.dispatchEvent(new Event('lastgate:scene-ready')); }} />
      </Canvas>
    </div>
    <div className="bay-grade" aria-hidden="true" />
    <SceneCurtain ready={ready} error={loadError} />
    <header className="bay-top">
      <ol className="bay-chapters" aria-label="Where you are in the story">{chapters.map(([n, name, st]) => <li key={name} className={`is-${st}`}><b>{st === 'done' ? '✓' : n}</b>{name}</li>)}</ol>
      <button className="lg-pill lg-pill-ghost lg-pill-small" onClick={restart}>Start the bay again</button>
    </header>
    <div className="bay-pins" aria-label="Places to look">
      {pinList.map(p => <button key={p.id} ref={el => { pinEls.current[p.id] = el; }} className={`bay-pin ${p.seen ? 'bay-pin-seen' : ''}`} style={{ opacity: 0 }} onClick={p.onClick}><i aria-hidden="true" />{p.label}<small aria-hidden="true" /></button>)}
    </div>
    <TaskRail className="bay-rail" kicker="San Fransokyo · Bay 6" heading="Where’s the power going?" tasks={tasks} notes={{ title: 'Field notes', items: notes, max: 4 }} />
    {stage !== 'taken' && <div className="bay-side">
      {info && <aside className="bay-card" key={info.title} aria-live="polite">
        <p className="bay-kicker">{info.kicker}</p><h1>{info.title}</h1><p>{info.body}</p>
        {info.next && <p className="bay-card-next"><span>Next</span>{info.next}</p>}
      </aside>}
      <BayPlan marks={marks} cableLive={readCard} hiroRef={hiro} where={where} />
    </div>}
    {stage === 'taken' && <aside className="bay-card bay-found" aria-live="polite">
      <p className="bay-kicker">Recovered · Bay 6, under the stairs</p>
      <h1>Power regulator</h1>
      <p className="bay-found-tag">Modifies output to create a temporary window.</p>
      <RegulatorSheet />
      <dl className="bay-spec"><div><dt>Feed</dt><dd>48 V DC</dd></div><div><dt>Caps him at</dt><dd>35 %</dd></div><div><dt>Window</dt><dd>90 s</dd></div></dl>
      <p className="bay-next">On his main feed, Baymax runs at a third of his strength. Not a cure. A window to work in.</p>
      <div className="bay-actions">
        {exit && <button className="lg-pill" onClick={leave} disabled={leaving}>{exit.label} <i>→</i></button>}
        <button className="lg-pill lg-pill-quiet" onClick={restart}>Search again</button>
      </div>
    </aside>}
    {stage !== 'taken' && stage !== 'enter' && <p className="bay-controls"><span>Mouse</span> look around <i /> <span>Click</span> a marker to walk there</p>}
    <SoundToggle />
    {line && <p className="bay-line" key={line.key} role="status"><b aria-hidden="true">H</b><span><small>Hiro</small>{line.text}</span></p>}
    <p className="sr-only">Use the task list on the left, or select the markers in the bay, to look around, follow the cable, move the crates, open the case and take the regulator.</p>
  </main>;
}
