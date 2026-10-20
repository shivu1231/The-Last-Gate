import { CatmullRomCurve3, MathUtils, Vector2, Vector3 } from 'three';
import type { Phase } from '../state/SceneStateManager';
import { useSceneState } from '../state/SceneStateManager';
import { HOLD_TIME } from '../config/shell';
import { reducedMotion } from '../config/experience';

export type BeatId =
  | 'launch'
  | 'silhouette'
  | 'overhead'
  | 'rooftop'
  | 'tear-pass'
  | 'final';
export type SequenceEvent =
  | { type: 'beat'; beat: BeatId }
  | { type: 'impact'; position: Vector3; power: number; tear: boolean }
  | { type: 'charge'; position: Vector3 }
  | { type: 'discharge'; from: Vector3; to: Vector3 }
  | { type: 'flyby'; position: Vector3 };

/** Hiro's escape line: authored, never free-roam. Eye height sits ~1.6m above the asphalt. */
export const CHASE_PATH = new CatmullRomCurve3(
  [
    new Vector3(1.05, 1.42, -6.7),
    new Vector3(0.15, 1.44, -9.4),
    new Vector3(-1.35, 1.45, -12.6),
    new Vector3(-2.45, 1.45, -16.2),
    new Vector3(-1.2, 1.46, -19.6),
    new Vector3(1.0, 1.46, -22.7),
    new Vector3(1.55, 1.45, -25.4),
    new Vector3(1.3, 1.45, -27.1),
  ],
  false,
  'centripetal',
);
export const CHASE_LENGTH = CHASE_PATH.getLength();
/** One continuous run. Distance markers no longer leave Baymax hovering between attacks. */
export const CHASE_BEATS: { id: BeatId; at: number }[] = [
  { id: 'silhouette', at: 0 },
  { id: 'overhead', at: 0.13 },
  { id: 'rooftop', at: 0.42 },
  { id: 'final', at: 0.81 },
];
const RUN_SECONDS = 9.5;
/** The dimensional seam the final blast rips open (matches the anomaly in PortalDimension). */
export const SEAM_POSITION = new Vector3(1.8, 4.2, -34);
/** Outer right shoulder meets this broken frame once, 1.45 seconds into displacement. */
export const PULL_CONTACT_POSITION = new Vector3(2.7, 6.2, -46.54);
type Attack = {
  at: number;
  kind: 'charge' | 'discharge' | 'impact' | 'flyby';
  to?: [number, number, number];
  power?: number;
  tear?: boolean;
  slowmo?: number;
};
/** Every violent act is authored: when it charges, where it lands, and whether it tears the dimension. */
const ATTACKS: Record<BeatId, Attack[]> = {
  launch: [{ at: 0.8, kind: 'charge' }],
  // A close pass, a three-shot ranged burst, then the landing.
  silhouette: [],
  overhead: [{ at: 1.3, kind: 'flyby' }],
  rooftop: [
    { at: 0.75, kind: 'charge' },
    {
      at: 1.45,
      kind: 'discharge',
      to: [-4.6, -0.12, -21.2],
      power: 0.8,
      tear: false,
    },
    { at: 1.7, kind: 'charge' },
    {
      at: 1.95,
      kind: 'discharge',
      to: [-4.6, -0.12, -21.2],
      power: 0.4,
      tear: false,
    },
    { at: 2.15, kind: 'charge' },
    {
      at: 2.4,
      kind: 'discharge',
      to: [-4.6, -0.12, -21.2],
      power: 0.32,
      tear: false,
    },
  ],
  'tear-pass': [
    { at: 0, kind: 'impact', to: [5.6, 2.3, -23.6], power: 0.42, tear: true },
    {
      at: 0.62,
      kind: 'impact',
      to: [0, 2, -21],
      power: 0.25,
      tear: false,
      slowmo: 0.28,
    },
  ],
  // The last attack is Baymax himself: a dive whose shockwave splits the seam behind him.
  final: [
    { at: 1.05, kind: 'charge' },
    {
      at: 2.35,
      kind: 'impact',
      to: [1.9, -0.12, -30.4],
      power: 1.1,
      tear: true,
    },
  ],
};

/**
 * Shared, mutable, per-frame sequence state. Systems read it every frame; React only
 * hears about discrete phase changes. Nothing here allocates per frame.
 */
export class SequenceDirector {
  phase: Phase = 'loading';
  phaseTime = 0;
  time = 0;
  // Input
  pointer = new Vector2();
  pointerDown = false;
  keyHold = false;
  sprint = false;
  holdProgress = 0;
  lastInput = 0;
  /** A short press still counts: once latched, the hold completes on its own. */
  latch = false;
  // Shell
  alignment = 0;
  docked = false;
  // Chase
  chase = 0;
  chaseSpeed = 0;
  beatIndex = -1;
  beatTime = 0;
  private runTime = 0;
  // Camera impulses
  shake = 0;
  kick = new Vector3();
  fovKick = 0;
  slowmo = 1;
  lookBias = new Vector3();
  lookWeight = 0;
  // Grade and world response
  warp = 0;
  warpCenter = new Vector2(0.5, 0.5);
  flash = 0;
  whiteout = 0;
  red = 0;
  tear = 0;
  corridor = 0;
  collapse = 0;
  /** Baymax's arm muzzle in world space; BaymaxController writes it every frame. */
  muzzle = new Vector3(2.7, 2.2, -11);
  swipeTarget = new Vector3(-4, -0.12, -16);
  private listeners = new Set<(event: SequenceEvent) => void>();
  private replay = -1;
  private fired = 0;
  private attackBeat: BeatId | null = null;
  private pending: { at: number; to: Vector3; power: number; tear: boolean }[] =
    [];

  on(listener: (event: SequenceEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(event: SequenceEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  get beat(): BeatId | null {
    return this.beatIndex < 0 ? null : CHASE_BEATS[this.beatIndex].id;
  }
  get holding() {
    return this.pointerDown || this.keyHold;
  }

  update(delta: number) {
    const state = useSceneState.getState(),
      deltaSeconds = Math.min(delta, 0.25);
    if (state.replay !== this.replay) {
      this.replay = state.replay;
      this.reset();
    }
    if (state.phase !== this.phase) {
      this.phase = state.phase;
      this.phaseTime = 0;
      this.latch = false;
      this.enter(state.phase);
    }
    const scaled = deltaSeconds * this.slowmo;
    this.phaseTime += scaled;
    this.time += deltaSeconds;
    // Holds commit only on hold phases; releasing drains smoothly instead of snapping.
    const holdPhase =
      state.phase === 'chip-focus' || state.phase === 'chest-focus';
    this.holdProgress =
      holdPhase && (this.holding || this.latch)
        ? Math.min(1, this.holdProgress + deltaSeconds / HOLD_TIME)
        : Math.max(0, this.holdProgress - deltaSeconds * 2.4);
    if (holdPhase && this.holdProgress >= 1) {
      this.holdProgress = 0;
      this.latch = false;
      state.interact();
    }
    if (state.phase === 'chase') this.updateChase(deltaSeconds);
    this.updateAttacks(
      state.phase === 'ignition'
        ? 'launch'
        : state.phase === 'chase'
          ? this.beat
          : null,
      state.phase === 'ignition' ? this.phaseTime : this.beatTime,
    );
    if (
      state.phase === 'chase' &&
      this.beat === 'final' &&
      this.beatTime > 3.55
    )
      state.advance('chase');
    this.updateSignals(state.phase, deltaSeconds);
    // Impulses decay; the camera reads them as a damped spring.
    this.shake = Math.max(0, this.shake - deltaSeconds * 1.6);
    this.flash = Math.max(0, this.flash - deltaSeconds * 2.2);
    this.warp = Math.max(0, this.warp - deltaSeconds * 1.15);
    this.fovKick = MathUtils.damp(this.fovKick, 0, 3.2, deltaSeconds);
    this.kick.multiplyScalar(Math.exp(-deltaSeconds * 3.4));
    this.slowmo = MathUtils.damp(this.slowmo, 1, 2.2, deltaSeconds);
  }
  /** One violent beat: shake, warp centred on screen-space impact, flash, and a camera shove. */
  impulse(power: number, screen?: Vector2, shove?: Vector3) {
    const scale = reducedMotion ? 0.25 : 1;
    this.shake = Math.min(1.2, this.shake + power * 0.55 * scale);
    this.flash = Math.min(1, this.flash + power * 0.35);
    this.warp = Math.min(1, this.warp + power * 0.8 * scale);
    this.fovKick += power * 3.5 * scale;
    if (screen) this.warpCenter.copy(screen);
    if (shove) this.kick.addScaledVector(shove, scale);
  }
  private updateAttacks(beat: BeatId | null, timeSeconds: number) {
    if (beat !== this.attackBeat) {
      this.attackBeat = beat;
      this.fired = 0;
    }
    const list = beat ? ATTACKS[beat] : [];
    while (this.fired < list.length && timeSeconds >= list[this.fired].at) {
      const firstEntry = list[this.fired++],
        to = firstEntry.to
          ? new Vector3(...firstEntry.to)
          : beat === 'overhead'
            ? this.swipeTarget.clone()
            : undefined;
      if (firstEntry.kind === 'charge')
        this.emit({ type: 'charge', position: this.muzzle.clone() });
      else if (firstEntry.kind === 'flyby') {
        this.emit({ type: 'flyby', position: this.muzzle.clone() });
        this.impulse(0.14);
      } else if (firstEntry.kind === 'discharge' && to) {
        this.emit({ type: 'discharge', from: this.muzzle.clone(), to });
        // The bolt travels; the world answers when it arrives.
        this.pending.push({
          at: this.time + Math.min(0.32, this.muzzle.distanceTo(to) / 60),
          to,
          power: firstEntry.power ?? 1,
          tear: firstEntry.tear ?? false,
        });
      } else if (to) {
        this.emit({
          type: 'impact',
          position: to,
          power: firstEntry.power ?? 0.5,
          tear: firstEntry.tear ?? false,
        });
        if (firstEntry.slowmo) this.slowmo = firstEntry.slowmo;
      }
    }
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const point = this.pending[index];
      if (this.time < point.at) continue;
      this.pending.splice(index, 1);
      this.emit({
        type: 'impact',
        position: point.to,
        power: point.power,
        tear: point.tear,
      });
    }
  }
  private reset() {
    this.pending.length = 0;
    this.attackBeat = null;
    this.fired = 0;
    this.chase = 0;
    this.chaseSpeed = 0;
    this.beatIndex = -1;
    this.beatTime = 0;
    this.runTime = 0;
    this.alignment = 0;
    this.docked = false;
    this.red = 0;
    this.tear = 0;
    this.corridor = 0;
    this.collapse = 0;
    this.whiteout = 0;
    this.warp = 0;
    this.flash = 0;
    this.shake = 0;
    this.slowmo = 1;
    this.kick.set(0, 0, 0);
    this.lookWeight = 0;
  }
  private enter(phase: Phase) {
    if (phase === 'awakening') this.reset();
    if (phase === 'ignition') this.emit({ type: 'beat', beat: 'launch' });
    if (phase === 'chase') {
      this.chase = 0;
      this.beatIndex = -1;
      this.runTime = 0;
    }
  }
  private updateChase(deltaSeconds: number) {
    const input = this.sprint || this.holding;
    if (input) this.lastInput = performance.now() / 1000;
    // The action owns its cadence; sprint changes Hiro's footfall/FOV, not the time
    // Baymax spends hanging motionless at the end of a completed animation.
    const before = this.chase;
    this.runTime += deltaSeconds * this.slowmo;
    this.chase = Math.min(0.86, this.runTime / RUN_SECONDS);
    this.chaseSpeed = MathUtils.damp(
      this.chaseSpeed,
      ((this.chase - before) / Math.max(deltaSeconds, 0.001)) *
        (input ? 1.12 : 1),
      7,
      deltaSeconds,
    );
    const nextBeat = CHASE_BEATS[this.beatIndex + 1];
    this.beatTime += deltaSeconds * this.slowmo;
    if (nextBeat && this.chase >= nextBeat.at) {
      this.beatIndex++;
      this.beatTime = 0;
      this.emit({ type: 'beat', beat: nextBeat.id });
    }
  }
  private updateSignals(phase: Phase, deltaSeconds: number) {
    const timeSeconds = this.phaseTime,
      damp = (sampleValue: number, to: number, length = 2) =>
        MathUtils.damp(sampleValue, to, length, deltaSeconds);
    const red =
      phase === 'corrupting'
        ? MathUtils.smoothstep(timeSeconds, 0.4, 4.4) * 0.7
        : ['threat', 'ignition', 'chase', 'fracture', 'pulled'].includes(phase)
          ? 1
          : phase === 'diagnostic'
            ? MathUtils.smoothstep(timeSeconds, 4.8, 6.6) * 0.12
            : 0;
    this.red = damp(this.red, red, 1.6);
    const tear =
      phase === 'chase'
        ? 0.15 + this.beatIndex * 0.15
        : phase === 'fracture'
          ? 0.9
          : phase === 'pulled'
            ? 1
            : phase === 'ignition'
              ? 0.08
              : 0;
    this.tear = damp(this.tear, tear, 1.2);
    this.corridor =
      phase === 'fracture'
        ? MathUtils.smoothstep(timeSeconds, 0.25, 3.2)
        : phase === 'pulled' || phase === 'handoff'
          ? 1
          : 0;
    this.collapse =
      phase === 'pulled'
        ? MathUtils.smoothstep(timeSeconds, 0.1, 3)
        : phase === 'fracture'
          ? MathUtils.smoothstep(timeSeconds, 3.6, 5.6) * 0.25
          : 0;
    const white =
      phase === 'pulled'
        ? MathUtils.smoothstep(timeSeconds, 3.35, 4.7)
        : phase === 'handoff'
          ? 1 - MathUtils.smoothstep(timeSeconds, 0.5, 3.4)
          : 0;
    this.whiteout = white;
  }
}
