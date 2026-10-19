import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { journeyExtension, type JourneyWorld } from './journey';
import { takeHarbour } from './HarbourWorld';
import type { RecoveryStage } from './state';
import { reducedMotion } from '../config/experience';
import { SceneQuality } from '../presentation/SceneQuality';
import { sfx, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import { SceneCurtain } from '../presentation/SceneCurtain';
import './recovery.css';

const DEV_JOURNEY = import.meta.env.DEV && new URLSearchParams(location.search).get('recovery') === 'journey';
const PATH = new CatmullRomCurve3([
  [.4, 1.65, 9], [.65, 1.6, 4], [-.6, 1.65, -.2], [-2.5, 2.5, -4.1],
].map(p => new Vector3(...p)), false, 'centripetal');
type Intent = { stage: RecoveryStage; target: number; progress: number; velocity: number; forward: boolean; yaw: number; pitch: number; drag: boolean; lastX: number; lastY: number };

function Scene({ intent, onReady, onArrived, onError }: {
  intent: React.MutableRefObject<Intent>; onReady: () => void; onArrived: () => void; onError: () => void;
}) {
  const { scene, camera, gl } = useThree();
  const [world, setWorld] = useState<JourneyWorld | null>(null);
  const extension = journeyExtension();
  const eye = useMemo(() => new Vector3(), []), look = useRef(new Vector3(1.4, .3, -4.8));
  const desiredLook = useMemo(() => new Vector3(), []), head = useRef(new Vector2()), headTarget = useMemo(() => new Vector2(), []);
  const notified = useRef(false), stride = useRef(0);
  const prepare = useMemo(() => world && extension?.prepare ? () => extension.prepare!(world, gl, scene, camera) : undefined, [world, extension, gl, scene, camera]);
  useEffect(() => {
    let alive = true, mounted: JourneyWorld | null = null;
    takeHarbour().then(w => {
      if (!alive) { w.bay.dispose(); w.district.dispose(); return; }
      mounted = w; scene.add(w.district.group, w.baymax); setWorld(w);
    }).catch(onError);
    return () => { alive = false; if (mounted) extension?.disposePrepared?.(mounted); mounted?.bay.dispose(); mounted?.baymax.removeFromParent(); mounted?.district.dispose(); };
  }, [scene, onError]);

  useFrame(({ clock }, delta) => {
    if (!world) return;
    const dt = Math.min(delta, .05), t = clock.elapsedTime, i = intent.current;
    // Only the few nearby practical lights animate. The background city is static.
    if (i.stage !== 'journey') world.district.update(t, dt, reducedMotion);
    if (i.stage === 'journey' && extension) return;
    world.bay.update({ t, open: 0, seated: 1, red: .9, seamGlow: .12 });
    if (i.stage === 'approach' && i.forward) i.target = Math.min(1, i.target + dt * .17);
    const speed = MathUtils.clamp((i.target - i.progress) * 2.8, -.15, .22);
    i.velocity = MathUtils.damp(i.velocity, speed, 5, dt);
    i.progress = reducedMotion ? i.target : MathUtils.clamp(i.progress + i.velocity * dt, 0, 1);
    PATH.getPointAt(i.progress, eye);
    const moving = Math.abs(i.target - i.progress) > .002;
    // A footfall every half bob cycle while Hiro walks the apron.
    if (Math.floor(i.progress * 65 / Math.PI) !== stride.current) { stride.current = Math.floor(i.progress * 65 / Math.PI); if (moving) sfx.play('step.grit', { gain: .8 }); }
    if (!reducedMotion) {
      eye.y += Math.sin(i.progress * 65) * .018 * (moving ? 1 : 0) + Math.sin(t * .9) * .008;
      eye.x += Math.sin(i.progress * 32) * .01 * (moving ? 1 : 0);
    }
    camera.position.copy(eye);
    desiredLook.set(world.district.baymaxAnchor.x, .18, world.district.baymaxAnchor.z);
    look.current.lerp(desiredLook, 1 - Math.exp(-dt * 3.5)); camera.lookAt(look.current);
    headTarget.set(i.yaw, i.pitch); head.current.lerp(headTarget, 1 - Math.exp(-dt * 7));
    camera.rotateY(head.current.x); camera.rotateX(head.current.y);
    const cam = camera as PerspectiveCamera;
    cam.fov = MathUtils.damp(cam.fov, 50 - i.progress * 4, 3, dt); cam.updateProjectionMatrix();
    if (i.progress > .985 && !notified.current) { notified.current = true; onArrived(); sfx.play('servo.groan', { gain: .5, delay: .6 }); }
  });
  return <>
    <color attach="background" args={['#101a21']} /><fog attach="fog" args={['#192932', 22, 115]} />
    <SceneQuality ready={!!world} prepare={prepare} onReady={onReady} onError={onError} />
    {world && intent.current.stage === 'journey' && extension && <extension.Scene world={world} />}
  </>;
}

export function Recovery({ active = true }: { active?: boolean }) {
  const [stage, setStage] = useState<RecoveryStage>('arrive');
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [dialogue, setDialogue] = useState(true);
  const intent = useRef<Intent>({ stage, target: DEV_JOURNEY ? 1 : 0, progress: DEV_JOURNEY ? 1 : 0, velocity: 0, forward: false, yaw: 0, pitch: 0, drag: false, lastX: 0, lastY: 0 });
  const extension = journeyExtension();
  intent.current.stage = stage;
  useSfxBed('harbour', active, stage === 'journey' ? .45 : 1);
  useSfxBed('combat-hum', active, stage === 'journey' ? .9 : stage === 'inspect' ? .8 : .45);
  useUiSfx(active);
  const callbacks = useMemo(() => ({ ready: () => setReady(true), arrived: () => setStage(s => s === 'journey' ? s : 'inspect'), error: () => setError(true) }), []);
  useEffect(() => {
    if (!ready || !active) return;
    window.dispatchEvent(new Event('lastgate:scene-ready'));
    const timer = window.setTimeout(() => setStage(DEV_JOURNEY ? 'journey' : 'approach'), reducedMotion ? 100 : 650);
    return () => { clearTimeout(timer); };
  }, [ready, active]);

  useEffect(() => {
    if (stage !== 'approach' || !active) return;
    const el = document.querySelector<HTMLElement>('.recovery-world')!;
    const down = (e: Event) => { const p = e as PointerEvent; intent.current.drag = true; intent.current.lastX = p.clientX; intent.current.lastY = p.clientY; };
    const move = (e: PointerEvent) => {
      const i = intent.current; if (!i.drag) return;
      i.yaw = MathUtils.clamp(i.yaw - (e.clientX - i.lastX) * .002, -.32, .32);
      i.pitch = MathUtils.clamp(i.pitch - (e.clientY - i.lastY) * .0015, -.15, .14);
      i.lastX = e.clientX; i.lastY = e.clientY;
    };
    const up = () => { intent.current.drag = false; intent.current.forward = false; };
    const keydown = (e: KeyboardEvent) => { if (['KeyW', 'ArrowUp', 'Space'].includes(e.code) && !(e.target as HTMLElement)?.closest('button,input')) { e.preventDefault(); setDialogue(false); intent.current.forward = true; } };
    const keyup = (e: KeyboardEvent) => { if (['KeyW', 'ArrowUp', 'Space'].includes(e.code)) intent.current.forward = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); setDialogue(false); intent.current.target = MathUtils.clamp(intent.current.target + e.deltaY * .0007, 0, 1); };
    el.addEventListener('pointerdown', down); el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('blur', up);
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('wheel', wheel); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); up(); };
  }, [stage, active]);

  const inspect = () => { sfx.play('move.whoosh'); intent.current.yaw = 0; intent.current.pitch = 0; setDialogue(false); setStage('journey'); };
  return <main className={`recovery stage-${stage} ${ready ? 'is-ready' : ''} ${stage === 'journey' ? 'journey-live' : ''}`} aria-label="The Last Gate" data-state="BAYMAX_RECOVERY">
    <div className="recovery-world"><Canvas shadows frameloop={active ? 'always' : 'demand'} camera={{ position: [.4, 1.65, 9], fov: 50, near: .1, far: 160 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Scene intent={intent} onReady={callbacks.ready} onArrived={callbacks.arrived} onError={callbacks.error} />
    </Canvas></div>
    <div className="recovery-grade" aria-hidden="true" /><div className="recovery-arrival" aria-hidden="true" />
    {/* The name is an intro on arrival only; it goes once Hiro reaches him. */}
    {stage === 'approach' && <header className="recovery-title"><h1>THE LAST GATE</h1></header>}
    {ready && dialogue && stage !== 'journey' && <p className="recovery-line" role="status"><small>HIRO HAMADA</small>Baymax… what happened to you?</p>}
    {stage === 'approach' && <div className="recovery-controls"><p>DRAG TO LOOK <span>·</span> HOLD W OR SCROLL TO WALK</p><button className="recovery-start" onClick={() => { setDialogue(false); intent.current.target = Math.min(1, intent.current.target + .34); }}>MOVE CLOSER <span>↗</span></button></div>}
    {stage === 'inspect' && <div className="recovery-controls"><button className="recovery-start" onClick={inspect}>Inspect Baymax <span>→</span></button></div>}
    {stage === 'journey' && extension && <extension.Overlay />}
    {stage !== 'journey' && <p className="recovery-objective"><span>Objective</span>In search of the healthcare chip’s location</p>}
    {active && ready && <SoundToggle />}
    <SceneCurtain ready={ready} error={error ? 'Baymax could not be loaded.' : ''} />
  </main>;
}
