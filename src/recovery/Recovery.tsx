import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  CatmullRomCurve3,
  MathUtils,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from 'three';
import { journeyExtension, type JourneyWorld } from './journey';
import { takeHarbour } from './HarbourWorld';
import type { RecoveryStage } from './state';
import { reducedMotion } from '../config/experience';
import { SceneQuality } from '../presentation/SceneQuality';
import { sfx, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import { SceneCurtain } from '../presentation/SceneCurtain';
import './recovery.css';

const DEV_JOURNEY =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get('recovery') === 'journey';
const PATH = new CatmullRomCurve3(
  [
    [0.4, 1.65, 9],
    [0.65, 1.6, 4],
    [-0.6, 1.65, -0.2],
    [-2.5, 2.5, -4.1],
  ].map((points) => new Vector3(...points)),
  false,
  'centripetal',
);
/**
 * Movement and look input consumed by the recovery journey.
 */
type RecoveryIntent = {
  stage: RecoveryStage;
  target: number;
  progress: number;
  velocity: number;
  forward: boolean;
  yaw: number;
  pitch: number;
  drag: boolean;
  lastX: number;
  lastY: number;
};

/**
 * Mount the recovery scene and advance its continuous approach/inspection interaction.
 */
function Scene({
  intent,
  onReady,
  onArrived,
  onError,
}: {
  intent: React.MutableRefObject<RecoveryIntent>;
  onReady: () => void;
  onArrived: () => void;
  onError: () => void;
}) {
  const { scene, camera, gl } = useThree();
  const [world, setWorld] = useState<JourneyWorld | null>(null);
  const extension = journeyExtension();
  const eye = useMemo(() => new Vector3(), []),
    look = useRef(new Vector3(1.4, 0.3, -4.8));
  const desiredLook = useMemo(() => new Vector3(), []),
    head = useRef(new Vector2()),
    headTarget = useMemo(() => new Vector2(), []);
  const notified = useRef(false),
    stride = useRef(0);
  const prepare = useMemo(
    () =>
      world && extension?.prepare
        ? () => extension.prepare!(world, gl, scene, camera)
        : undefined,
    [world, extension, gl, scene, camera],
  );
  useEffect(() => {
    let alive = true,
      mounted: JourneyWorld | null = null;
    takeHarbour()
      .then((width) => {
        if (!alive) {
          width.bay.dispose();
          width.district.dispose();
          return;
        }
        mounted = width;
        scene.add(width.district.group, width.baymax);
        setWorld(width);
      })
      .catch(onError);
    return () => {
      alive = false;
      if (mounted) extension?.disposePrepared?.(mounted);
      mounted?.bay.dispose();
      mounted?.baymax.removeFromParent();
      mounted?.district.dispose();
    };
  }, [scene, onError]);

  useFrame(({ clock }, delta) => {
    if (!world) return;
    const deltaSeconds = Math.min(delta, 0.05),
      elapsedSeconds = clock.elapsedTime,
      state = intent.current;
    // Only the few nearby practical lights animate. The background city is static.
    if (state.stage !== 'journey')
      world.district.update(elapsedSeconds, deltaSeconds, reducedMotion);
    if (state.stage === 'journey' && extension) return;
    world.bay.update({
      t: elapsedSeconds,
      open: 0,
      seated: 1,
      red: 0.9,
      seamGlow: 0.12,
    });
    if (state.stage === 'approach' && state.forward)
      state.target = Math.min(1, state.target + deltaSeconds * 0.17);
    const speed = MathUtils.clamp(
      (state.target - state.progress) * 2.8,
      -0.15,
      0.22,
    );
    state.velocity = MathUtils.damp(state.velocity, speed, 5, deltaSeconds);
    state.progress = reducedMotion
      ? state.target
      : MathUtils.clamp(state.progress + state.velocity * deltaSeconds, 0, 1);
    PATH.getPointAt(state.progress, eye);
    const moving = Math.abs(state.target - state.progress) > 0.002;
    // A footfall every half bob cycle while Hiro walks the apron.
    if (Math.floor((state.progress * 65) / Math.PI) !== stride.current) {
      stride.current = Math.floor((state.progress * 65) / Math.PI);
      if (moving) sfx.play('step.grit', { gain: 0.8 });
    }
    if (!reducedMotion) {
      eye.y +=
        Math.sin(state.progress * 65) * 0.018 * (moving ? 1 : 0) +
        Math.sin(elapsedSeconds * 0.9) * 0.008;
      eye.x += Math.sin(state.progress * 32) * 0.01 * (moving ? 1 : 0);
    }
    camera.position.copy(eye);
    desiredLook.set(
      world.district.baymaxAnchor.x,
      0.18,
      world.district.baymaxAnchor.z,
    );
    look.current.lerp(desiredLook, 1 - Math.exp(-deltaSeconds * 3.5));
    camera.lookAt(look.current);
    headTarget.set(state.yaw, state.pitch);
    head.current.lerp(headTarget, 1 - Math.exp(-deltaSeconds * 7));
    camera.rotateY(head.current.x);
    camera.rotateX(head.current.y);
    const cam = camera as PerspectiveCamera;
    cam.fov = MathUtils.damp(cam.fov, 50 - state.progress * 4, 3, deltaSeconds);
    cam.updateProjectionMatrix();
    if (state.progress > 0.985 && !notified.current) {
      notified.current = true;
      onArrived();
      sfx.play('servo.groan', { gain: 0.5, delay: 0.6 });
    }
  });
  return (
    <>
      <color attach="background" args={['#101a21']} />
      <fog attach="fog" args={['#192932', 22, 115]} />
      <SceneQuality
        ready={!!world}
        prepare={prepare}
        onReady={onReady}
        onError={onError}
      />
      {world && intent.current.stage === 'journey' && extension && (
        <extension.Scene world={world} />
      )}
    </>
  );
}

/**
 * Compose the recovery journey and its inspection/engineering overlay.
 */
export function Recovery({ active = true }: { active?: boolean }) {
  const [stage, setStage] = useState<RecoveryStage>('arrive');
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [dialogue, setDialogue] = useState(true);
  const intent = useRef<RecoveryIntent>({
    stage,
    target: DEV_JOURNEY ? 1 : 0,
    progress: DEV_JOURNEY ? 1 : 0,
    velocity: 0,
    forward: false,
    yaw: 0,
    pitch: 0,
    drag: false,
    lastX: 0,
    lastY: 0,
  });
  const extension = journeyExtension();
  intent.current.stage = stage;
  useSfxBed('harbour', active, stage === 'journey' ? 0.45 : 1);
  useSfxBed(
    'combat-hum',
    active,
    stage === 'journey' ? 0.9 : stage === 'inspect' ? 0.8 : 0.45,
  );
  useUiSfx(active);
  const callbacks = useMemo(
    () => ({
      ready: () => setReady(true),
      arrived: () =>
        setStage((state) => (state === 'journey' ? state : 'inspect')),
      error: () => setError(true),
    }),
    [],
  );
  useEffect(() => {
    if (!ready || !active) return;
    window.dispatchEvent(new Event('lastgate:scene-ready'));
    const timer = window.setTimeout(
      () => setStage(DEV_JOURNEY ? 'journey' : 'approach'),
      reducedMotion ? 100 : 650,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [ready, active]);

  useEffect(() => {
    if (stage !== 'approach' || !active) return;
    const el = document.querySelector<HTMLElement>('.recovery-world')!;
    const down = (event: Event) => {
      const point = event as PointerEvent;
      intent.current.drag = true;
      intent.current.lastX = point.clientX;
      intent.current.lastY = point.clientY;
    };
    const move = (event: PointerEvent) => {
      const index = intent.current;
      if (!index.drag) return;
      index.yaw = MathUtils.clamp(
        index.yaw - (event.clientX - index.lastX) * 0.002,
        -0.32,
        0.32,
      );
      index.pitch = MathUtils.clamp(
        index.pitch - (event.clientY - index.lastY) * 0.0015,
        -0.15,
        0.14,
      );
      index.lastX = event.clientX;
      index.lastY = event.clientY;
    };
    const up = () => {
      intent.current.drag = false;
      intent.current.forward = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        ['KeyW', 'ArrowUp', 'Space'].includes(event.code) &&
        !(event.target as HTMLElement)?.closest('button,input')
      ) {
        event.preventDefault();
        setDialogue(false);
        intent.current.forward = true;
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (['KeyW', 'ArrowUp', 'Space'].includes(event.code))
        intent.current.forward = false;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setDialogue(false);
      intent.current.target = MathUtils.clamp(
        intent.current.target + event.deltaY * 0.0007,
        0,
        1,
      );
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      up();
    };
  }, [stage, active]);

  const inspect = () => {
    sfx.play('move.whoosh');
    intent.current.yaw = 0;
    intent.current.pitch = 0;
    setDialogue(false);
    setStage('journey');
  };
  return (
    <main
      className={`recovery stage-${stage} ${ready ? 'is-ready' : ''} ${stage === 'journey' ? 'journey-live' : ''}`}
      aria-label="The Last Gate"
      data-state="BAYMAX_RECOVERY"
    >
      <div className="recovery-world">
        <Canvas
          shadows
          frameloop={active ? 'always' : 'demand'}
          camera={{ position: [0.4, 1.65, 9], fov: 50, near: 0.1, far: 160 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Scene
            intent={intent}
            onReady={callbacks.ready}
            onArrived={callbacks.arrived}
            onError={callbacks.error}
          />
        </Canvas>
      </div>
      <div className="recovery-grade" aria-hidden="true" />
      <div className="recovery-arrival" aria-hidden="true" />
      {/* The name is an intro on arrival only; it goes once Hiro reaches him. */}
      {stage === 'approach' && (
        <header className="recovery-title">
          <h1>THE LAST GATE</h1>
        </header>
      )}
      {ready && dialogue && stage !== 'journey' && (
        <p className="recovery-line" role="status">
          <small>HIRO HAMADA</small>Baymax… what happened to you?
        </p>
      )}
      {stage === 'approach' && (
        <div className="recovery-controls">
          <p>
            DRAG TO LOOK <span>·</span> HOLD W OR SCROLL TO WALK
          </p>
          <button
            className="recovery-start"
            onClick={() => {
              setDialogue(false);
              intent.current.target = Math.min(1, intent.current.target + 0.34);
            }}
          >
            MOVE CLOSER <span>↗</span>
          </button>
        </div>
      )}
      {stage === 'inspect' && (
        <div className="recovery-controls">
          <button className="recovery-start" onClick={inspect}>
            Inspect Baymax <span>→</span>
          </button>
        </div>
      )}
      {stage === 'journey' && extension && <extension.Overlay />}
      {stage !== 'journey' && (
        <p className="recovery-objective">
          <span>Objective</span>In search of the healthcare chip’s location
        </p>
      )}
      {active && ready && <SoundToggle />}
      <SceneCurtain
        ready={ready}
        error={error ? 'Baymax could not be loaded.' : ''}
      />
    </main>
  );
}
