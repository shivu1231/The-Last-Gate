import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPortalDimension } from '../environment/PortalDimension.js';
import { reducedMotion } from '../config/experience';
import { TaskRail, type RailTask } from '../ui/TaskRail';
import { BayPlan, RegulatorSheet, plan, type PlanMark } from './BayPanels';
import { districtExit } from './exit';
import { enterServiceBay, type BayStart } from './entry';
import { sfx, nearestOnPath, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import {
  CABLE_PATH,
  CABLE_WALK,
  EYE,
  VIEWS,
  takeServiceBay,
  type BayState,
  type ServiceBay as Bay,
  type BayCameraView,
} from './bayScene';
import type { Vector3Tuple } from './bayKit';
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
/**
 * Inspectable service-bay target and its existing world position.
 */
type BayHotspot = 'cradle' | 'toolwall' | 'jobcard';
/**
 * Content displayed for a service-bay inspection target.
 */
type BayInspectionInfo = {
  kicker: string;
  title: string;
  body: string;
  next?: string;
};

const SPOTS: Record<
  BayHotspot,
  BayInspectionInfo & {
    view: BayCameraView;
    pin: string;
    line: string;
    note: string;
  }
> = {
  cradle: {
    view: VIEWS.cradle,
    pin: 'Service stand',
    kicker: 'Service stand 6',
    title: 'Big enough for Baymax',
    body: 'Rated for a two-tonne frame. The clamps are open, so whatever was in it walked out on its own.',
    line: 'Big enough for Baymax. Empty.',
    note: 'Stand 6: clamps open, unit gone.',
  },
  toolwall: {
    view: VIEWS.toolwall,
    pin: 'Shadow board',
    kicker: 'Shadow board',
    title: 'They took the good drivers',
    body: 'Every torque driver’s gone. The cheap screwdrivers stayed. People grab what matters when they run.',
    line: 'They took the good drivers.',
    note: 'Torque drivers gone, cheap ones left.',
  },
  jobcard: {
    view: VIEWS.bench,
    pin: 'Bench 2',
    kicker: 'Job card · bench 2',
    title: '“PR-6. Do not unplug.”',
    body: 'A power regulator, left on charge, with a spare boxed up somewhere. That’s exactly what Baymax needs.',
    line: 'A regulator? On charge? Okay. Where?',
    note: 'Job card: PR-6 on charge, spare boxed.',
  },
};
const ORDER: BayHotspot[] = ['cradle', 'toolwall', 'jobcard'];
const HOLD: BayCameraView = { pos: [-6.4, EYE, -25.5], look: [2, 1.5, -16] };

/**
 * Requested service-bay inspection camera change.
 */
type CameraRequest = {
  via: Vector3Tuple[];
  to: BayCameraView;
  lookAlong?: (resonance: number, out: THREE.Vector3) => void;
  speed?: number;
  done?: () => void;
};
/**
 * Mutable camera motion state for a service-bay view.
 */
type BayCameraState = {
  request: CameraRequest | null;
  snap: BayCameraView | null;
  pointer: THREE.Vector2;
};
/**
 * Projected screen marker for a service-bay inspection target.
 */
type HotspotPin = {
  id: string;
  label: string;
  anchor: THREE.Vector3;
  onClick: () => void;
  seen?: boolean;
};
const SPOT_AT: Record<BayHotspot, [number, number]> = {
  cradle: [2, -15],
  toolwall: [-10.6, -16.6],
  jobcard: [-9.95, -11.75],
};

const ease = (inputValue: number) =>
  inputValue < 0.5
    ? 2 * inputValue * inputValue
    : 1 - Math.pow(-2 * inputValue + 2, 2) / 2;

/**
 * Mount this chapter's world and advance its authored rendering and interaction state.
 */
function World({
  bay,
  cam,
  state,
  pins,
  pinEls,
  hiro,
  onPick,
  onReady,
  onError,
}: {
  bay: Bay;
  cam: MutableRefObject<BayCameraState>;
  state: MutableRefObject<BayState>;
  pins: MutableRefObject<HotspotPin[]>;
  pinEls: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  hiro: MutableRefObject<SVGGElement | null>;
  onPick: (part: string) => void;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const { camera, scene, gl, raycaster } = useThree();
  const skyline = useMemo(() => {
    const city = createPortalDimension();
    city.group.position.set(0, -4, -78);
    city.group.scale.setScalar(1.05);
    city.group.traverse((sceneObject) => {
      sceneObject.castShadow = false;
      sceneObject.receiveShadow = false;
    });
    return city;
  }, []);
  const move = useRef<{
    curve: THREE.CatmullRomCurve3;
    from: THREE.Vector3;
    to: THREE.Vector3;
    t: number;
    duration: number;
    lookAlong?: CameraRequest['lookAlong'];
    done?: () => void;
  } | null>(null);
  const look = useMemo(() => new THREE.Vector3(...VIEWS.gate.look), []),
    lookOut = useMemo(() => new THREE.Vector3(), []),
    vector = useMemo(() => new THREE.Vector3(), []),
    dir = useMemo(() => new THREE.Vector3(), []);
  const pointer = useRef(new THREE.Vector2()),
    steps = useRef(0),
    frames = useRef(0),
    smooth = useRef(0),
    bobPos = useMemo(() => new THREE.Vector3(), []);
  const stride = useRef(0),
    cableAt = useMemo((): [number, number, number] => [0, 0, 0], []);
  const [live, setLive] = useState(false);

  const draw = useRef<BayRender | null>(null);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl),
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.2;
    // Raycasts must still reach the regulator's glass, which draws in the late pass (see bayRender.ts).
    raycaster.layers.enableAll();
    // Compile every shader off the main path first, then put the bay in the scene in one go.
    let alive = true;
    const split = (draw.current = createBayRender(
      scene,
      bay.root,
      skyline.group,
    ));
    if (import.meta.env.DEV)
      (window as Window & { __bay?: unknown }).__bay = {
        scene,
        bay,
        skyline,
        gl,
        split,
      };
    const show = () => {
      if (!alive) return;
      bay.root.visible = skyline.group.visible = true;
      setLive(true);
    };
    bay.root.visible = skyline.group.visible = true;
    split.compile(gl, camera).then(show, () => {
      if (alive)
        onError('Bay 6 could not finish loading. Please reload to try again.');
    });
    bay.root.visible = skyline.group.visible = false;
    return () => {
      alive = false;
      draw.current = null;
      split.dispose(gl);
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      skyline.dispose();
    };
  }, [scene, gl, camera, raycaster, bay, skyline]);
  // Rendering is ours (priority 1): see bayRender.ts.
  useFrame(() => {
    draw.current?.render(gl, camera, bay.shadowsDirty);
  }, 1);

  useFrame(({ clock }, delta) => {
    const deltaSeconds = Math.min(delta, 0.05),
      elapsedSeconds = clock.elapsedTime,
      camera2 = cam.current;
    // The first frames push everything through the GPU once; tell the page once the bay is on screen
    // and frames have settled (two quick ones in a row), so the fade-in never hitches.
    if (live && frames.current >= 0 && ++frames.current >= 4) {
      smooth.current = delta < 1 / 12 ? smooth.current + 1 : 0;
      if (smooth.current >= 2 || frames.current >= 90) {
        frames.current = -1;
        onReady();
      }
    }
    skyline.update(
      elapsedSeconds,
      deltaSeconds,
      reducedMotion,
      0,
      'approaching',
    );
    if (camera2.snap) {
      bobPos.set(...camera2.snap.pos);
      look.set(...camera2.snap.look);
      move.current = null;
      camera2.snap = null;
    }
    if (camera2.request) {
      const camera3 = camera2.request;
      camera2.request = null;
      const points = [
        bobPos.clone(),
        ...camera3.via.map((point) => new THREE.Vector3(...point)),
        new THREE.Vector3(...camera3.to.pos),
      ];
      if (points[0].distanceTo(points[1]) < 0.05) points.shift();
      if (points.length < 2) points.unshift(bobPos.clone());
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'),
        len = curve.getLength();
      move.current = {
        curve,
        from: look.clone(),
        to: new THREE.Vector3(...camera3.to.look),
        t: 0,
        duration: reducedMotion
          ? 0.01
          : THREE.MathUtils.clamp(
              len / (camera3.speed ?? 3.2),
              0.9,
              camera3.speed ? 9 : 4.2,
            ),
        lookAlong: camera3.lookAlong,
        done: camera3.done,
      };
    }
    let walking = 0;
    const vector2 = move.current;
    if (vector2) {
      vector2.t = Math.min(1, vector2.t + deltaSeconds / vector2.duration);
      const resonance = ease(vector2.t);
      vector2.curve.getPointAt(resonance, bobPos);
      if (vector2.lookAlong) {
        vector2.lookAlong(resonance, lookOut);
        look
          .copy(lookOut)
          .lerp(vector2.to, THREE.MathUtils.smoothstep(vector2.t, 0.75, 1));
      } else
        look.lerpVectors(
          vector2.from,
          vector2.to,
          THREE.MathUtils.smoothstep(vector2.t, 0, 0.85),
        );
      walking = Math.sin(Math.PI * vector2.t);
      if (vector2.t >= 1) {
        move.current = null;
        vector2.done?.();
      }
    }
    steps.current += walking * deltaSeconds * 7.2;
    if (Math.floor(steps.current / Math.PI) !== stride.current) {
      stride.current = Math.floor(steps.current / Math.PI);
      if (walking > 0.15)
        sfx.play('step.concrete', { gain: 0.5 + walking * 0.5 });
    }
    const bob = reducedMotion ? 0 : Math.sin(steps.current) * 0.028 * walking;
    camera.position.set(
      bobPos.x +
        (reducedMotion ? 0 : Math.cos(steps.current * 0.5) * 0.018 * walking),
      bobPos.y + bob,
      bobPos.z,
    );
    camera.lookAt(look);
    // A little head turn toward the pointer; never enough to lose what's being looked at.
    pointer.current.lerp(camera2.pointer, 1 - Math.exp(-deltaSeconds * 3));
    camera.rotateY(-pointer.current.x * 0.09);
    camera.rotateX(-pointer.current.y * 0.05);
    camera.updateMatrixWorld();
    sfx.listener(camera);
    sfx.placeBed(
      'cable-live',
      nearestOnPath(
        CABLE_PATH,
        camera.position.x,
        camera.position.y,
        camera.position.z,
        cableAt,
      ),
      1.6,
    );
    bay.update(elapsedSeconds, deltaSeconds, state.current, camera);
    // Screen pins follow their anchors.
    for (const pin of pins.current) {
      const el = pinEls.current[pin.id];
      if (!el) continue;
      vector.copy(pin.anchor).project(camera);
      const visible =
        vector.z < 1 && Math.abs(vector.x) < 1.05 && Math.abs(vector.y) < 1.05;
      el.style.opacity = visible ? '' : '0';
      el.style.pointerEvents = visible ? '' : 'none';
      el.style.transform = `translate(${(vector.x * 0.5 + 0.5) * innerWidth}px, ${(-vector.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
      const metres = `${Math.max(1, Math.round(camera.position.distanceTo(pin.anchor)))} m`,
        tag = el.lastElementChild;
      if (tag && tag.textContent !== metres) tag.textContent = metres;
    }
    // Hiro's marker on the floor plan: where he stands and which way he faces.
    if (hiro.current) {
      const [px, py] = plan(camera.position.x, camera.position.z);
      camera.getWorldDirection(dir);
      hiro.current.setAttribute(
        'transform',
        `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${((Math.atan2(dir.x, -dir.z) * 180) / Math.PI).toFixed(1)})`,
      );
    }
  });

  const pick = (event: ThreeEvent<MouseEvent>) => {
    let sceneObject: THREE.Object3D | null = event.object;
    while (sceneObject && !sceneObject.userData.part)
      sceneObject = sceneObject.parent;
    const part =
      sceneObject?.userData.part ??
      (event.object === bay.limiter ||
      bay.limiter.getObjectById(event.object.id)
        ? 'regulator'
        : null);
    if (part) {
      event.stopPropagation();
      onPick(part);
    }
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
    if (on) sfx.play('ui.hover');
  };
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  return (
    <>
      <color attach="background" args={['#0a1622']} />
      <fog attach="fog" args={['#1a3850', 4, 150]} />
      {live && (
        <>
          <primitive
            object={bay.crates}
            onClick={pick}
            onPointerOver={hover(true)}
            onPointerOut={hover(false)}
          />
          <primitive
            object={bay.box}
            onClick={pick}
            onPointerOver={hover(true)}
            onPointerOut={hover(false)}
          />
          <primitive
            object={bay.limiter}
            onClick={pick}
            onPointerOver={hover(true)}
            onPointerOut={hover(false)}
          />
        </>
      )}
    </>
  );
}

/**
 * Compose Bay 6 world interactions, inspection panels and existing storage-case progression.
 */
export function ServiceBay({ start }: { start: BayStart }) {
  const [dpr, setDpr] = useState(1);
  const bay = useMemo(takeServiceBay, []);
  useEffect(() => () => bay.dispose(), [bay]);
  const initial: BayCameraView =
    start === 'enter' ? VIEWS.gate : start === 'box' ? VIEWS.box : HOLD;
  const cam = useRef<BayCameraState>({
    request: null,
    snap: initial,
    pointer: new THREE.Vector2(),
  });

  const [stage, setStage] = useState<Stage>(
    start === 'enter' ? 'enter' : start === 'box' ? 'box' : 'taken',
  );
  const [seen, setSeen] = useState<BayHotspot[]>(
    start === 'enter' ? [] : ORDER,
  );
  const [focus, setFocus] = useState<BayHotspot | null>(null);
  const [cleared, setCleared] = useState(start !== 'enter');
  const [latches, setLatches] = useState<[boolean, boolean]>(
    start === 'found' ? [true, true] : [false, false],
  );
  const [lid, setLid] = useState(start === 'found');
  const [busy, setBusy] = useState(start === 'enter');
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const state = useRef<BayState>({
    cleared: 0,
    latches: [false, false],
    lid: false,
    lift: 0,
    charge: 0,
  });
  state.current = {
    cleared: cleared ? 1 : 0,
    latches,
    lid,
    lift: stage === 'taken' ? 1 : 0,
    charge: lid ? 1 : 0,
  };
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, milliseconds: number) => {
    timers.current.push(
      window.setTimeout(
        fn,
        reducedMotion ? Math.min(milliseconds, 60) : milliseconds,
      ),
    );
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useSfxBed('bay');
  useSfxBed('cable-live', true, stage === 'taken' ? 0.2 : 1);
  useUiSfx();
  const say = (text: string) => setLine({ text, key: performance.now() });
  useEffect(() => {
    if (!line) return;
    const id = window.setTimeout(() => setLine(null), 4200);
    return () => window.clearTimeout(id);
  }, [line]);
  const walkTo = (req: CameraRequest) => {
    setBusy(true);
    cam.current.request = {
      ...req,
      done: () => {
        setBusy(false);
        req.done?.();
      },
    };
  };

  // Walk in from the gate, once the bay is on screen.
  useEffect(() => {
    if (!ready) return;
    if (start !== 'enter') {
      if (start === 'found') say('It won’t fix him. But it’ll hold him.');
      return;
    }
    sfx.play('mech.clunk', { gain: 0.35, at: [4.7, 1, 0.4] });
    later(() => say('Lights are on. So where is everyone?'), 900);
    later(
      () =>
        walkTo({
          via: [[4.4, EYE, -3.4]],
          to: VIEWS.hub,
          speed: 1.8,
          done: () => setStage('explore'),
        }),
      900,
    );
  }, [ready]);

  const visit = (spot: BayHotspot) => {
    if (busy || stage !== 'explore') return;
    setFocus(null);
    walkTo({
      via: [],
      to: SPOTS[spot].view,
      done: () => {
        setFocus(spot);
        setSeen((entries) =>
          entries.includes(spot) ? entries : [...entries, spot],
        );
        say(SPOTS[spot].line);
      },
    });
  };
  const nextSpot = () => {
    const next = ORDER.find((state2) => !seen.includes(state2)) ?? 'jobcard';
    visit(next);
  };
  const followCable = () => {
    if (busy || stage !== 'explore') return;
    setFocus(null);
    setStage('cable');
    say('Okay, hot line. Show me.');
    const path = new THREE.CatmullRomCurve3(
      CABLE_WALK.map((point) => new THREE.Vector3(...point)),
    );
    walkTo({
      via: CABLE_WALK.slice(0, -1),
      to: VIEWS.crates,
      speed: 2.1,
      lookAlong: (resonance, out) => {
        path.getPointAt(Math.min(1, resonance + 0.2), out);
        out.set(out.x - 2.1, 0.25, out.z - 3.2);
      },
      done: () => {
        setStage('crates');
        say('Under the crates. Of course it is.');
      },
    });
  };
  const moveCrates = () => {
    if (busy || stage !== 'crates') return;
    setCleared(true);
    setBusy(true);
    crateSounds();
    later(
      () =>
        walkTo({
          via: [],
          to: VIEWS.box,
          speed: 1.4,
          done: () => {
            setStage('box');
            say('It’s warm.');
          },
        }),
      1500,
    );
  };
  const undoLatch = (index: 0 | 1) => {
    if (stage !== 'box' || busy || latches[index]) return;
    sfx.play('mech.latch', {
      at: bay.anchors[index ? 'latch1' : 'latch0'],
      pitch: index ? 0.94 : 1,
    });
    setLatches((entries) =>
      index === 0 ? [true, entries[1]] : [entries[0], true],
    );
  };
  const liftLid = () => {
    if (stage !== 'box' || busy || lid || !latches[0] || !latches[1]) return;
    setLid(true);
    sfx.play('mech.lid-creak', { at: bay.anchors.lid });
    sfx.play('sting.found', { delay: 1.1 });
    later(() => say('PR-6. Oh, you’re perfect.'), 900);
  };
  const take = () => {
    if (stage !== 'box' || !lid || busy) return;
    setStage('taken');
    sfx.play('mech.lift', { at: bay.anchors.regulator });
    sfx.play('power.down', { gain: 0.6, delay: 0.45 });
    walkTo({
      via: [],
      to: HOLD,
      speed: 1.2,
      done: () => say('It won’t fix him. But it’ll hold him.'),
    });
  };
  const onPick = (part: string) => {
    if (part === 'crates') moveCrates();
    else if (part === 'latch0') undoLatch(0);
    else if (part === 'latch1') undoLatch(1);
    else if (part === 'regulator' && lid) take();
    else if (part === 'lid' || (part === 'regulator' && !lid)) {
      if (!latches[0]) undoLatch(0);
      else if (!latches[1]) undoLatch(1);
      else liftLid();
    }
  };
  const restart = () => enterServiceBay('enter');
  // The crates come off in the order the scene animates them: two slide, one tips off the top, the tarp goes last.
  const crateSounds = () => {
    const at: [number, number, number] = [-8.3, 0.5, -27.3];
    sfx.play('mech.crate-scrape', { at });
    sfx.play('mech.crate-scrape', { at, delay: 0.3, pitch: 0.9 });
    sfx.play('mech.crate-thud', { at, delay: 0.62 });
    sfx.play('mech.crate-scrape', { at, delay: 0.5, pitch: 1.1 });
    sfx.play('mech.crate-thud', {
      at: [-6.9, 0.3, -29.1],
      delay: 0.95,
      pitch: 0.85,
    });
    sfx.play('mech.tarp', { at, delay: 0.8 });
  };
  const exit = districtExit();
  // The next chapter covers the cut itself; warm it up as soon as the regulator is in hand.
  const leave = () => {
    if (!exit || leaving) return;
    setLeaving(true);
    sfx.play('move.whoosh');
    exit.go();
  };
  useEffect(() => {
    if (stage === 'taken') void exit?.prepare?.().catch(() => {});
  }, [stage]);

  // Dev: Ctrl+M does the next thing.
  const advance = useRef(() => {});
  advance.current = () => {
    if (stage === 'explore') {
      if (!seen.includes('jobcard')) visit('jobcard');
      else followCable();
    } else if (stage === 'crates') moveCrates();
    else if (stage === 'box') {
      if (!latches[0]) undoLatch(0);
      else if (!latches[1]) undoLatch(1);
      else if (!lid) liftLid();
      else take();
    } else if (stage === 'taken') leave();
  };
  useEffect(() => {
    const move = (event: PointerEvent) =>
      cam.current.pointer.set(
        (event.clientX / innerWidth - 0.5) * 2,
        (event.clientY / innerHeight - 0.5) * 2,
      );
    const key = (event: KeyboardEvent) => {
      if (import.meta.env.DEV && event.ctrlKey && event.code === 'KeyM') {
        event.preventDefault();
        advance.current();
      }
    };
    // No page scroll over the bay, but the task rail and found card scroll on their own.
    const wheel = (event: WheelEvent) => {
      if (
        !(
          event.target instanceof Element &&
          event.target.closest('.lg-rail, .bay-found')
        )
      )
        event.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
    };
  }, []);

  // ── Tasks, pins and the info card all come from the same state.
  const readCard = seen.includes('jobcard'),
    openedCount = latches.filter(Boolean).length;
  const tasks: RailTask[] = [
    {
      id: 'look',
      title: 'Check the bay',
      detail: `${seen.length}/3 · stand, shadow board, benches`,
      hint: 'Start anywhere. The bench lamps are still on, which is weird.',
      state:
        readCard || (stage !== 'explore' && stage !== 'enter')
          ? 'done'
          : 'open',
      action: {
        label: 'Next spot',
        onClick: nextSpot,
        disabled: busy || stage !== 'explore',
      },
    },
    {
      id: 'cable',
      title: 'Trace the hot line',
      detail: readCard ? 'Street feed, still live' : 'Read the benches first',
      hint: 'It’s clipped to the floor every metre. Someone wanted it to stay put.',
      state:
        stage === 'cable' || stage === 'explore'
          ? readCard
            ? 'open'
            : 'locked'
          : stage === 'enter'
            ? 'locked'
            : 'done',
      action: {
        label: 'Follow it',
        onClick: followCable,
        disabled: busy || stage !== 'explore',
      },
    },
    {
      id: 'crates',
      title: 'Shift the crates',
      detail: 'Where the line dives under',
      hint: 'Servo crates. Lift with the legs.',
      state: stage === 'crates' ? 'open' : cleared ? 'done' : 'locked',
      action: { label: 'Shift them', onClick: moveCrates, disabled: busy },
    },
    {
      id: 'case',
      title: 'Crack the case',
      detail: lid ? 'Open' : `${openedCount}/2 latches · then the lid`,
      hint:
        openedCount < 2
          ? 'Over-centre latches. Flip them up, don’t pull.'
          : 'Lid’s free. Lift from the front edge.',
      state: lid ? 'done' : stage === 'box' ? 'open' : 'locked',
      action:
        openedCount < 2
          ? {
              label: 'Flip a latch',
              onClick: () => undoLatch(latches[0] ? 1 : 0),
              disabled: busy,
            }
          : { label: 'Lift the lid', onClick: liftLid, disabled: busy },
    },
    {
      id: 'take',
      title: 'Lift out the PR-6',
      detail: '48 V, still on charge',
      hint: 'Charge lead comes out last.',
      state: stage === 'taken' ? 'done' : lid ? 'open' : 'locked',
      action: { label: 'Take it', onClick: take, disabled: busy },
    },
  ];
  const notes = [
    'Main lights on. Nobody on shift.',
    ...seen.map((spot) => SPOTS[spot].note),
  ];
  if (stage === 'crates' || cleared)
    notes.push('Hot line ends under the stairs.');
  if (stage === 'box' || stage === 'taken')
    notes.push('Case “B6 · Spare”: warm, lamp blinking.');
  if (stage === 'taken') notes.push('PR-6 in hand. Gauge reads 8 %.');

  const pinList: HotspotPin[] = [];
  if (!busy && stage === 'explore') {
    for (const spot of ORDER)
      if (spot !== focus)
        pinList.push({
          id: spot,
          label: SPOTS[spot].pin,
          anchor: bay.anchors[spot],
          onClick: () => visit(spot),
          seen: seen.includes(spot),
        });
    if (readCard)
      pinList.push({
        id: 'cable',
        label: 'Hot line',
        anchor: bay.anchors.cable,
        onClick: followCable,
      });
  }
  if (!busy && stage === 'crates')
    pinList.push({
      id: 'crates',
      label: 'Shift the crates',
      anchor: bay.anchors.crates,
      onClick: moveCrates,
    });
  if (!busy && stage === 'box') {
    if (!latches[0])
      pinList.push({
        id: 'latch0',
        label: 'Latch',
        anchor: bay.anchors.latch0,
        onClick: () => undoLatch(0),
      });
    if (!latches[1])
      pinList.push({
        id: 'latch1',
        label: 'Latch',
        anchor: bay.anchors.latch1,
        onClick: () => undoLatch(1),
      });
    if (latches[0] && latches[1] && !lid)
      pinList.push({
        id: 'lid',
        label: 'Lift the lid',
        anchor: bay.anchors.lid,
        onClick: liftLid,
      });
    if (lid)
      pinList.push({
        id: 'regulator',
        label: 'Lift out the PR-6',
        anchor: bay.anchors.regulator,
        onClick: take,
      });
  }
  const pins = useRef<HotspotPin[]>([]);
  pins.current = pinList;
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const hiro = useRef<SVGGElement | null>(null);

  const info: BayInspectionInfo | null =
    stage === 'enter'
      ? {
          kicker: 'Bay 6 · Robotics maintenance',
          title: 'Lights on, nobody home',
          body: 'Shutter’s down but the street feed squeezes under it. Whatever’s on the end is still pulling current.',
          next: 'Have a look around.',
        }
      : stage === 'explore'
        ? focus
          ? {
              ...SPOTS[focus],
              next: readCard
                ? 'Follow the hot line to whatever it’s charging.'
                : 'Check the rest: ' +
                  ORDER.filter((spot) => !seen.includes(spot))
                    .map((spot) => SPOTS[spot].pin.toLowerCase())
                    .join(', ') +
                  '.',
            }
          : {
              kicker: 'Bay 6',
              title: 'Somebody left mid-shift',
              body: 'Crane parked over an empty stand. Bench lamps still burning. Something in here is drawing power.',
              next: readCard
                ? 'Follow the hot line.'
                : 'Check the stand, the shadow board and the benches.',
            }
        : stage === 'cable'
          ? {
              kicker: 'Hot line',
              title: 'Clipped down every metre',
              body: 'It hugs the benches, then cuts toward the stairs. Somebody wanted it out of the way, not out of sight.',
              next: 'Keep following.',
            }
          : stage === 'crates'
            ? {
                kicker: 'Under the stairs',
                title: 'Too neat to be an accident',
                body: 'Four servo crates and a tarp, stacked right where the line goes under.',
                next: 'Shift the crates.',
              }
            : stage === 'box'
              ? lid
                ? {
                    kicker: 'PR-6 power regulator',
                    title: 'Charged and waiting',
                    body: 'Needle at 8 %, lamp steady. It’s been sitting on trickle charge since the bay emptied.',
                    next: 'Lift it out.',
                  }
                : {
                    kicker: 'Case · B6 Spare',
                    title: 'Warm to the touch',
                    body: 'The charge lamp’s blinking amber. The hot line plugs straight into its end.',
                    next:
                      openedCount < 2
                        ? `Flip ${openedCount ? 'the last latch' : 'both latches'}, then the lid.`
                        : 'Lift the lid.',
                  }
              : null;
  const marks: PlanMark[] = [
    ...ORDER.map((spot) => ({
      id: spot,
      x: SPOT_AT[spot][0],
      z: SPOT_AT[spot][1],
      state: (seen.includes(spot) ? 'seen' : 'todo') as PlanMark['state'],
    })),
    ...(stage === 'crates' || cleared
      ? [
          {
            id: 'case',
            x: -9.3,
            z: -27.4,
            state: (stage === 'taken' ? 'seen' : 'target') as PlanMark['state'],
          },
        ]
      : []),
  ];
  const where: [string, string] = busy
    ? ['On the move', stage === 'cable' ? 'Following the hot line' : 'Walking']
    : stage === 'enter'
      ? ['Side door', 'Just inside']
      : stage === 'explore'
        ? focus === 'cradle'
          ? ['Service stand 6', 'Centre bay']
          : focus === 'toolwall'
            ? ['Shadow board', 'West wall']
            : focus === 'jobcard'
              ? ['Bench 2', 'West wall']
              : ['Main aisle', 'Near the door']
        : ['Under the stairs', 'North-west corner'];
  const chapters = [
    ['03', 'Board', 'done'],
    ['04', 'Walk', 'done'],
    ['04', 'Bay 6', 'now'],
    ['05', 'Baymax', 'next'],
  ] as const;

  return (
    <main
      className={`bay bay-stage-${stage} ${ready ? 'bay-ready' : ''} ${leaving ? 'bay-leaving' : ''}`}
      aria-label="Inside Bay 6"
    >
      <div className="bay-world">
        <Canvas
          shadows
          dpr={dpr}
          camera={{ fov: 52, near: 0.05, far: 420, position: VIEWS.gate.pos }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <AdaptiveDpr onChange={setDpr} />
          <World
            bay={bay}
            cam={cam}
            state={state}
            pins={pins}
            pinEls={pinEls}
            hiro={hiro}
            onPick={onPick}
            onError={setLoadError}
            onReady={() => {
              setReady(true);
              window.dispatchEvent(new Event('lastgate:scene-ready'));
            }}
          />
        </Canvas>
      </div>
      <div className="bay-grade" aria-hidden="true" />
      <SceneCurtain ready={ready} error={loadError} />
      <header className="bay-top">
        <ol className="bay-chapters" aria-label="Where you are in the story">
          {chapters.map(([node, name, st]) => (
            <li key={name} className={`is-${st}`}>
              <b>{st === 'done' ? '✓' : node}</b>
              {name}
            </li>
          ))}
        </ol>
        <button
          className="lg-pill lg-pill-ghost lg-pill-small"
          onClick={restart}
        >
          Start the bay again
        </button>
      </header>
      <div className="bay-pins" aria-label="Places to look">
        {pinList.map((point) => (
          <button
            key={point.id}
            ref={(el) => {
              pinEls.current[point.id] = el;
            }}
            className={`bay-pin ${point.seen ? 'bay-pin-seen' : ''}`}
            style={{ opacity: 0 }}
            onClick={point.onClick}
          >
            <i aria-hidden="true" />
            {point.label}
            <small aria-hidden="true" />
          </button>
        ))}
      </div>
      <TaskRail
        className="bay-rail"
        kicker="San Fransokyo · Bay 6"
        heading="Where’s the power going?"
        tasks={tasks}
        notes={{ title: 'Field notes', items: notes, max: 4 }}
      />
      {stage !== 'taken' && (
        <div className="bay-side">
          {info && (
            <aside className="bay-card" key={info.title} aria-live="polite">
              <p className="bay-kicker">{info.kicker}</p>
              <h1>{info.title}</h1>
              <p>{info.body}</p>
              {info.next && (
                <p className="bay-card-next">
                  <span>Next</span>
                  {info.next}
                </p>
              )}
            </aside>
          )}
          <BayPlan
            marks={marks}
            cableLive={readCard}
            hiroRef={hiro}
            where={where}
          />
        </div>
      )}
      {stage === 'taken' && (
        <aside className="bay-card bay-found" aria-live="polite">
          <p className="bay-kicker">Recovered · Bay 6, under the stairs</p>
          <h1>Power regulator</h1>
          <p className="bay-found-tag">
            Modifies output to create a temporary window.
          </p>
          <RegulatorSheet />
          <dl className="bay-spec">
            <div>
              <dt>Feed</dt>
              <dd>48 V DC</dd>
            </div>
            <div>
              <dt>Caps him at</dt>
              <dd>35 %</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>90 s</dd>
            </div>
          </dl>
          <p className="bay-next">
            On his main feed, Baymax runs at a third of his strength. Not a
            cure. A window to work in.
          </p>
          <div className="bay-actions">
            {exit && (
              <button className="lg-pill" onClick={leave} disabled={leaving}>
                {exit.label} <i>→</i>
              </button>
            )}
            <button className="lg-pill lg-pill-quiet" onClick={restart}>
              Search again
            </button>
          </div>
        </aside>
      )}
      {stage !== 'taken' && stage !== 'enter' && (
        <p className="bay-controls">
          <span>Mouse</span> look around <i /> <span>Click</span> a marker to
          walk there
        </p>
      )}
      <SoundToggle />
      {line && (
        <p className="bay-line" key={line.key} role="status">
          <b aria-hidden="true">H</b>
          <span>
            <small>Hiro</small>
            {line.text}
          </span>
        </p>
      )}
      <p className="sr-only">
        Use the task list on the left, or select the markers in the bay, to look
        around, follow the cable, move the crates, open the case and take the
        regulator.
      </p>
    </main>
  );
}
