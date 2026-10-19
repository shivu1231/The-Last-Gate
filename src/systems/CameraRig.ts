import { MathUtils, type PerspectiveCamera } from 'three';
import { reducedMotion } from '../config/experience';
import { cinematicSignals } from '../effects/CinematicSignals';
import type { CameraMode } from '../core/ExperienceStates';

// One camera language for every chapter. Shot code (CameraDirector and phase shots)
// decides WHERE the camera is; the rig decides HOW it feels: damping, inertia,
// look limits, head motion and motivated shake. Call `cameraRig.apply()` once per
// frame after the shot has set position + lookAt and before updateProjectionMatrix.

/**
 * Data contract used by shared runtime services.
 */
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
  RECOVERY: {
    lookDamping: 1.2,
    inertia: 1.4,
    maxLook: [0.1, 0.06],
    headMotion: 1.4,
    shake: 0.25,
    focus: 'near',
  },
  EXPLORATION: {
    lookDamping: 1.8,
    inertia: 2.3,
    maxLook: [0.16, 0.09],
    headMotion: 1.0,
    shake: 0.6,
    focus: 'subject',
  },
  INTERACTION: {
    lookDamping: 2.6,
    inertia: 3.2,
    maxLook: [0.06, 0.04],
    headMotion: 0.45,
    shake: 0.35,
    focus: 'near',
  },
  CHASE: {
    lookDamping: 3.2,
    inertia: 4.5,
    maxLook: [0.12, 0.07],
    headMotion: 1.3,
    shake: 1,
    focus: 'deep',
  },
  OBSERVATION: {
    lookDamping: 1.1,
    inertia: 1.6,
    maxLook: [0.08, 0.05],
    headMotion: 0.6,
    shake: 0.5,
    focus: 'subject',
  },
  WEIGHTLESS: {
    lookDamping: 0.8,
    inertia: 0.9,
    maxLook: [0.2, 0.12],
    headMotion: 0.3,
    shake: 0.3,
    focus: 'deep',
  },
  FINAL_RUN: {
    lookDamping: 3.6,
    inertia: 5,
    maxLook: [0.1, 0.06],
    headMotion: 1.5,
    shake: 1,
    focus: 'deep',
  },
  HOME: {
    lookDamping: 1.4,
    inertia: 1.8,
    maxLook: [0.14, 0.08],
    headMotion: 0.7,
    shake: 0,
    focus: 'deep',
  },
};

/**
 * Data contract used by shared runtime services.
 */
export type ShakeSource = 'impact' | 'baymax-attack' | 'structure' | 'portal';
/**
 * Data contract used by shared runtime services.
 */
type Impulse = {
  amp: number;
  decay: number;
  freq: number;
  phase: number;
  age: number;
};
const SOURCE_SHAPE: Record<ShakeSource, { decay: number; freq: number }> = {
  impact: { decay: 7, freq: 19 },
  'baymax-attack': { decay: 4.5, freq: 13 },
  structure: { decay: 1.8, freq: 5 },
  portal: { decay: 2.6, freq: 9 },
};

/**
 * Owns shared runtime services state and its existing runtime lifecycle.
 */
class CameraRig {
  mode: CameraMode = 'RECOVERY';
  /** Blended live profile; read this from shot code instead of hard-coded constants. */
  readonly profile: CameraProfile = {
    ...CAMERA_PROFILES.RECOVERY,
    maxLook: [...CAMERA_PROFILES.RECOVERY.maxLook],
  };
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
  shake(source: ShakeSource, strength = 0.5) {
    const shape = SOURCE_SHAPE[source];
    const amplitude =
      MathUtils.clamp(strength, 0, 1) * 0.022 * (reducedMotion ? 0.15 : 1);
    if (amplitude <= 0) return;
    if (this.impulses.length > 6) this.impulses.shift();
    this.impulses.push({
      amp: amplitude,
      decay: shape.decay,
      freq: shape.freq,
      phase: Math.random() * 100,
      age: 0,
    });
  }

  reset() {
    this.impulses.length = 0;
  }

  apply(camera: PerspectiveCamera, deltaSeconds: number) {
    this.blendProfile(deltaSeconds);
    let yaw = 0,
      pitch = 0,
      roll = 0;
    const allowance = this.profile.shake;
    for (let index = this.impulses.length - 1; index >= 0; index--) {
      const impulse = this.impulses[index];
      impulse.age += deltaSeconds;
      const envelope =
        impulse.amp * Math.exp(-impulse.decay * impulse.age) * allowance;
      if (envelope < 0.00004) {
        this.impulses.splice(index, 1);
        continue;
      }
      const timeSeconds = impulse.age * impulse.freq + impulse.phase;
      yaw += Math.sin(timeSeconds * 1.13) * envelope;
      pitch += Math.sin(timeSeconds * 0.91 + 1.7) * envelope * 0.8;
      roll += Math.sin(timeSeconds * 0.67 + 4.1) * envelope * 0.55;
    }
    if (yaw || pitch || roll) {
      camera.rotateY(yaw);
      camera.rotateX(pitch);
      camera.rotateZ(roll);
    }
    // FOV kick from transitions: applied as a delta so the shot's own FOV stays authoritative.
    const kick = reducedMotion ? 0 : cinematicSignals.fov;
    if (kick !== 0) camera.fov += kick;
  }

  private blendProfile(deltaSeconds: number) {
    if (this.blend >= 1) return;
    this.blend = Math.min(1, this.blend + deltaSeconds / 1.2);
    const blendFactor = MathUtils.smootherstep(this.blend, 0, 1),
      to = CAMERA_PROFILES[this.mode],
      camera = this.profile;
    camera.lookDamping = MathUtils.lerp(
      this.from.lookDamping,
      to.lookDamping,
      blendFactor,
    );
    camera.inertia = MathUtils.lerp(this.from.inertia, to.inertia, blendFactor);
    camera.maxLook[0] = MathUtils.lerp(
      this.from.maxLook[0],
      to.maxLook[0],
      blendFactor,
    );
    camera.maxLook[1] = MathUtils.lerp(
      this.from.maxLook[1],
      to.maxLook[1],
      blendFactor,
    );
    camera.headMotion = MathUtils.lerp(
      this.from.headMotion,
      to.headMotion,
      blendFactor,
    );
    camera.shake = MathUtils.lerp(this.from.shake, to.shake, blendFactor);
    camera.focus = blendFactor > 0.5 ? to.focus : this.from.focus;
  }
}

export const cameraRig = new CameraRig();
