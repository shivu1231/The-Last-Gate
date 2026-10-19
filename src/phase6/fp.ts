import * as T from 'three';
import { reducedMotion } from '../config/experience';

/**
 * Hiro's eyes. The director moves `feet` along whatever path the moment needs and names a point to
 * look at; the rig turns that into a camera: eye height, a head bob and sway paced by real ground
 * covered, a slight forward lean at speed, breathing when still, and a footstep callback on every
 * footfall (left/right, how fast) for sound and shake.
 */
export type Footstep = (side: -1 | 1, speed: number) => void;

const WALK_STRIDE = .72, RUN_STRIDE = 1.35;

export class FirstPerson {
  readonly feet = new T.Vector3();
  /** Smoothed ground speed, m/s. */
  speed = 0;
  /** Step phase in radians: one footfall per π. */
  gait = 0;
  eye = 1.56;
  private last = new T.Vector3();
  /** Where he's looking, as heading and pitch (smoothed as angles, so a turn never swings through his own head). */
  private yaw = 0;
  private pitch = 0;
  private fresh = true;
  private step = 0;
  private euler = new T.Euler(0, 0, 0, 'YXZ');

  /** Jump straight to a pose (a cut): no speed, no smoothing from where it was. */
  place(feet: T.Vector3) {
    this.feet.copy(feet); this.last.copy(feet); this.speed = 0;
    this.fresh = true;
  }

  /** The eye's position this frame (before bob), for aiming. */
  eyeAt(out = new T.Vector3()) { return out.set(this.feet.x, this.feet.y + this.eye, this.feet.z); }

  /** A look point between `a` and `b` turned through heading and pitch, not cut straight across. */
  static blend(eye: T.Vector3, a: T.Vector3, b: T.Vector3, k: number, out = new T.Vector3()) {
    const ang = (p: T.Vector3) => { const d = p.clone().sub(eye); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
    const [ya, pa] = ang(a), [yb, pb] = ang(b);
    let dy = yb - ya; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const y = ya + dy * k, p = pa + (pb - pa) * k;
    return out.set(eye.x - Math.sin(y) * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z - Math.cos(y) * Math.cos(p) * 10);
  }

  update(cam: T.PerspectiveCamera, dt: number, t: number, s: { look: T.Vector3; eye: number; steady?: boolean; lookRate?: number; pointer?: T.Vector2; freeLook?: number; onStep?: Footstep }) {
    const moved = Math.hypot(this.feet.x - this.last.x, this.feet.z - this.last.z);
    this.last.copy(this.feet);
    const v = dt > 0 ? Math.min(9, moved / dt) : 0;
    this.speed = T.MathUtils.damp(this.speed, v, 6, dt);
    const run = s.steady ? 0 : T.MathUtils.smoothstep(this.speed, 2.2, 4);
    this.gait += moved / T.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, run) * Math.PI;
    const k = Math.floor(this.gait / Math.PI);
    if (k !== this.step) { this.step = k; if (this.speed > .25) s.onStep?.(k % 2 ? 1 : -1, this.speed); }
    this.eye = T.MathUtils.damp(this.eye, s.eye, 5, dt);

    const moving = s.steady ? 0 : T.MathUtils.smoothstep(this.speed, .1, 1), m = reducedMotion ? .25 : 1;
    const amp = T.MathUtils.lerp(.028, .062, run) * moving * m;
    const bob = (Math.abs(Math.sin(this.gait)) - .6) * amp;
    const sway = Math.sin(this.gait) * T.MathUtils.lerp(.018, .034, run) * moving * m;
    const breathe = s.steady ? 0 : Math.sin(t * 1.5) * .007 * (1 - moving);

    cam.position.set(this.feet.x, this.feet.y + this.eye + bob + breathe, this.feet.z);
    const d = s.look.clone().sub(cam.position);
    const ty = Math.atan2(-d.x, -d.z), tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
    if (this.fresh) { this.yaw = ty; this.pitch = tp; this.fresh = false; }
    const turn = 1 - Math.exp(-dt * (s.lookRate ?? 5));
    let dy = ty - this.yaw; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.yaw += dy * turn; this.pitch += (tp - this.pitch) * turn;
    cam.quaternion.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, 'YXZ'));
    // Sideways sway along the camera's own right, a little roll with each step, lean into a run.
    cam.translateX(sway);
    cam.rotateZ(-Math.sin(this.gait) * T.MathUtils.lerp(.004, .011, run) * moving * m);
    cam.rotateX(-run * .05);
    if (s.pointer && s.freeLook) { cam.rotateY(-s.pointer.x * .45 * s.freeLook); cam.rotateX(-s.pointer.y * .22 * s.freeLook); }
  }
}
