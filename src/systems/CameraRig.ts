import { MathUtils, type PerspectiveCamera } from 'three';
import { reducedMotion } from '../config/experience';
import { cinematicSignals } from '../effects/CinematicSignals';
import type { CameraMode } from '../core/ExperienceStates';

// One camera language for every chapter. Shot code (CameraDirector and phase shots)
// decides WHERE the camera is; the rig decides HOW it feels: damping, inertia,
// look limits, head motion and motivated shake. Call `cameraRig.apply()` once per
// frame after the shot has set position + lookAt and before updateProjectionMatrix.

export type CameraProfile = {
  /** Damping (1/s) applied to pointer look — lower is heavier. */
  lookDamping: number;
  /** Damping (1/s) for position follow — lower carries more momentum. */
  inertia: number;
  /** Max pointer look offset, radians (yaw, pitch). */
  maxLook: [number, number];
  /** Breathing / footfall amplitude multiplier. */
  headMotion: number;
  /** Fraction of shake impulses allowed through. */
  shake: number;
  /** Where depth of field should rest. */
  focus: 'subject' | 'near' | 'deep';
};

export const CAMERA_PROFILES: Record<CameraMode, CameraProfile> = {
  RECOVERY:    { lookDamping: 1.2, inertia: 1.4, maxLook: [.10, .06], headMotion: 1.4, shake: .25, focus: 'near' },
  EXPLORATION: { lookDamping: 1.8, inertia: 2.3, maxLook: [.16, .09], headMotion: 1.0, shake: .6,  focus: 'subject' },
  INTERACTION: { lookDamping: 2.6, inertia: 3.2, maxLook: [.06, .04], headMotion: .45, shake: .35, focus: 'near' },
  CHASE:       { lookDamping: 3.2, inertia: 4.5, maxLook: [.12, .07], headMotion: 1.3, shake: 1,   focus: 'deep' },
  OBSERVATION: { lookDamping: 1.1, inertia: 1.6, maxLook: [.08, .05], headMotion: .6,  shake: .5,  focus: 'subject' },
  WEIGHTLESS:  { lookDamping: .8,  inertia: .9,  maxLook: [.20, .12], headMotion: .3,  shake: .3,  focus: 'deep' },
  FINAL_RUN:   { lookDamping: 3.6, inertia: 5,   maxLook: [.10, .06], headMotion: 1.5, shake: 1,   focus: 'deep' },
  HOME:        { lookDamping: 1.4, inertia: 1.8, maxLook: [.14, .08], headMotion: .7,  shake: 0,   focus: 'deep' },
};

export type ShakeSource = 'impact' | 'baymax-attack' | 'structure' | 'portal';
type Impulse = { amp: number; decay: number; freq: number; phase: number; age: number };
const SOURCE_SHAPE: Record<ShakeSource, { decay: number; freq: number }> = {
  impact:          { decay: 7,   freq: 19 },
  'baymax-attack': { decay: 4.5, freq: 13 },
  structure:       { decay: 1.8, freq: 5 },
  portal:          { decay: 2.6, freq: 9 },
};

class CameraRig {
  mode: CameraMode = 'RECOVERY';
  /** Blended live profile; read this from shot code instead of hard-coded constants. */
  readonly profile: CameraProfile = { ...CAMERA_PROFILES.RECOVERY, maxLook: [...CAMERA_PROFILES.RECOVERY.maxLook] };
  private from: CameraProfile = CAMERA_PROFILES.RECOVERY;
  private blend = 1;
  private impulses: Impulse[] = [];

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    this.from = { ...this.profile, maxLook: [...this.profile.maxLook] };
    this.mode = mode;
    this.blend = 0;
  }

  /** Motivated shake only: an impulse that always decays to zero. `strength` 0..1. */
  shake(source: ShakeSource, strength = .5) {
    const shape = SOURCE_SHAPE[source];
    const amp = MathUtils.clamp(strength, 0, 1) * .022 * (reducedMotion ? .15 : 1);
    if (amp <= 0) return;
    if (this.impulses.length > 6) this.impulses.shift();
    this.impulses.push({ amp, decay: shape.decay, freq: shape.freq, phase: Math.random() * 100, age: 0 });
  }

  reset() { this.impulses.length = 0; }

  apply(camera: PerspectiveCamera, dt: number) {
    this.blendProfile(dt);
    let yaw = 0, pitch = 0, roll = 0;
    const allowance = this.profile.shake;
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const impulse = this.impulses[i];
      impulse.age += dt;
      const envelope = impulse.amp * Math.exp(-impulse.decay * impulse.age) * allowance;
      if (envelope < .00004) { this.impulses.splice(i, 1); continue; }
      const t = impulse.age * impulse.freq + impulse.phase;
      yaw += Math.sin(t * 1.13) * envelope;
      pitch += Math.sin(t * .91 + 1.7) * envelope * .8;
      roll += Math.sin(t * .67 + 4.1) * envelope * .55;
    }
    if (yaw || pitch || roll) { camera.rotateY(yaw); camera.rotateX(pitch); camera.rotateZ(roll); }
    // FOV kick from transitions: applied as a delta so the shot's own FOV stays authoritative.
    const kick = reducedMotion ? 0 : cinematicSignals.fov;
    if (kick !== 0) camera.fov += kick;
  }

  private blendProfile(dt: number) {
    if (this.blend >= 1) return;
    this.blend = Math.min(1, this.blend + dt / 1.2);
    const k = MathUtils.smootherstep(this.blend, 0, 1), to = CAMERA_PROFILES[this.mode], p = this.profile;
    p.lookDamping = MathUtils.lerp(this.from.lookDamping, to.lookDamping, k);
    p.inertia = MathUtils.lerp(this.from.inertia, to.inertia, k);
    p.maxLook[0] = MathUtils.lerp(this.from.maxLook[0], to.maxLook[0], k);
    p.maxLook[1] = MathUtils.lerp(this.from.maxLook[1], to.maxLook[1], k);
    p.headMotion = MathUtils.lerp(this.from.headMotion, to.headMotion, k);
    p.shake = MathUtils.lerp(this.from.shake, to.shake, k);
    p.focus = k > .5 ? to.focus : this.from.focus;
  }
}

export const cameraRig = new CameraRig();
