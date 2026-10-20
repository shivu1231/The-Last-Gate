import * as THREE from 'three';
import { reducedMotion } from '../config/experience';

/**
 * Hiro's eyes. The director moves `feet` along whatever path the moment needs and names a point to
 * look at; the rig turns that into a camera: eye height, a head bob and sway paced by real ground
 * covered, a slight forward lean at speed, breathing when still, and a footstep callback on every
 * footfall (left/right, how fast) for sound and shake.
 */
export type Footstep = (side: -1 | 1, speed: number) => void;

const WALK_STRIDE = 0.72,
  RUN_STRIDE = 1.35;

export class FirstPerson {
  readonly feet = new THREE.Vector3();
  /** Smoothed ground speed, m/s. */
  speed = 0;
  /** Step phase in radians: one footfall per π. */
  gait = 0;
  eye = 1.56;
  private last = new THREE.Vector3();
  /** Where he's looking, as heading and pitch (smoothed as angles, so a turn never swings through his own head). */
  private yaw = 0;
  private pitch = 0;
  private fresh = true;
  private step = 0;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /** Jump straight to a pose (a cut): no speed, no smoothing from where it was. */
  place(feet: THREE.Vector3) {
    this.feet.copy(feet);
    this.last.copy(feet);
    this.speed = 0;
    this.fresh = true;
  }

  /** The eye's position this frame (before bob), for aiming. */
  eyeAt(out = new THREE.Vector3()) {
    return out.set(this.feet.x, this.feet.y + this.eye, this.feet.z);
  }

  /** A look point between `a` and `b` turned through heading and pitch, not cut straight across. */
  static blend(
    eye: THREE.Vector3,
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    blendFactor: number,
    out = new THREE.Vector3(),
  ) {
    const ang = (point: THREE.Vector3) => {
      const depth = point.clone().sub(eye);
      return [
        Math.atan2(-depth.x, -depth.z),
        Math.atan2(depth.y, Math.hypot(depth.x, depth.z)),
      ];
    };
    const [ya, pa] = ang(startPoint),
      [yb, pb] = ang(endPoint);
    let deltaY = yb - ya;
    deltaY =
      ((((deltaY + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;
    const yPosition = ya + deltaY * blendFactor,
      progress = pa + (pb - pa) * blendFactor;
    return out.set(
      eye.x - Math.sin(yPosition) * Math.cos(progress) * 10,
      eye.y + Math.sin(progress) * 10,
      eye.z - Math.cos(yPosition) * Math.cos(progress) * 10,
    );
  }

  update(
    cam: THREE.PerspectiveCamera,
    deltaSeconds: number,
    timeSeconds: number,
    scaleVector: {
      look: THREE.Vector3;
      eye: number;
      steady?: boolean;
      lookRate?: number;
      pointer?: THREE.Vector2;
      freeLook?: number;
      onStep?: Footstep;
    },
  ) {
    const moved = Math.hypot(
      this.feet.x - this.last.x,
      this.feet.z - this.last.z,
    );
    this.last.copy(this.feet);
    const sampleValue =
      deltaSeconds > 0 ? Math.min(9, moved / deltaSeconds) : 0;
    this.speed = THREE.MathUtils.damp(this.speed, sampleValue, 6, deltaSeconds);
    const run = scaleVector.steady
      ? 0
      : THREE.MathUtils.smoothstep(this.speed, 2.2, 4);
    this.gait +=
      (moved / THREE.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, run)) * Math.PI;
    const blendFactor = Math.floor(this.gait / Math.PI);
    if (blendFactor !== this.step) {
      this.step = blendFactor;
      if (this.speed > 0.25)
        scaleVector.onStep?.(blendFactor % 2 ? 1 : -1, this.speed);
    }
    this.eye = THREE.MathUtils.damp(this.eye, scaleVector.eye, 5, deltaSeconds);

    const moving = scaleVector.steady
        ? 0
        : THREE.MathUtils.smoothstep(this.speed, 0.1, 1),
      mesh = reducedMotion ? 0.25 : 1;
    const amplitude = THREE.MathUtils.lerp(0.028, 0.062, run) * moving * mesh;
    const bob = (Math.abs(Math.sin(this.gait)) - 0.6) * amplitude;
    const sway =
      Math.sin(this.gait) *
      THREE.MathUtils.lerp(0.018, 0.034, run) *
      moving *
      mesh;
    const breathe = scaleVector.steady
      ? 0
      : Math.sin(timeSeconds * 1.5) * 0.007 * (1 - moving);

    cam.position.set(
      this.feet.x,
      this.feet.y + this.eye + bob + breathe,
      this.feet.z,
    );
    const depth = scaleVector.look.clone().sub(cam.position);
    const ty = Math.atan2(-depth.x, -depth.z),
      tp = Math.atan2(depth.y, Math.hypot(depth.x, depth.z));
    if (this.fresh) {
      this.yaw = ty;
      this.pitch = tp;
      this.fresh = false;
    }
    const turn = 1 - Math.exp(-deltaSeconds * (scaleVector.lookRate ?? 5));
    let deltaY = ty - this.yaw;
    deltaY =
      ((((deltaY + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;
    this.yaw += deltaY * turn;
    this.pitch += (tp - this.pitch) * turn;
    cam.quaternion.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, 'YXZ'));
    // Sideways sway along the camera's own right, a little roll with each step, lean into a run.
    cam.translateX(sway);
    cam.rotateZ(
      -Math.sin(this.gait) *
        THREE.MathUtils.lerp(0.004, 0.011, run) *
        moving *
        mesh,
    );
    cam.rotateX(-run * 0.05);
    if (scaleVector.pointer && scaleVector.freeLook) {
      cam.rotateY(-scaleVector.pointer.x * 0.45 * scaleVector.freeLook);
      cam.rotateX(-scaleVector.pointer.y * 0.22 * scaleVector.freeLook);
    }
  }
}
