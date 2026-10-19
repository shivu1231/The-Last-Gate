import { MathUtils, Vector3, type Camera } from 'three';
import { reducedMotion } from '../config/experience';

/** Authored shots start at the live camera and settle with zero velocity at both ends. */
export class CameraShot {
  private key = '';
  private elapsed = 0;
  private from = new Vector3();
  private fromLook = new Vector3();
  private to = new Vector3();
  private toLook = new Vector3();
  private look = new Vector3();
  private initialized = false;

  update(camera: Camera, key: string, position: Vector3, focus: Vector3, dt: number, duration = 1.35) {
    if (this.key !== key) {
      this.key = key; this.elapsed = 0;
      this.from.copy(camera.position);
      if (!this.initialized) {
        camera.getWorldDirection(this.fromLook).multiplyScalar(Math.max(3, camera.position.distanceTo(focus))).add(camera.position);
        this.look.copy(this.fromLook); this.initialized = true;
      } else this.fromLook.copy(this.look);
      this.to.copy(position); this.toLook.copy(focus);
    }
    this.elapsed += dt;
    const t = MathUtils.clamp(this.elapsed / (reducedMotion ? .12 : duration), 0, 1);
    const e = t * t * t * (t * (t * 6 - 15) + 10);
    camera.position.lerpVectors(this.from, this.to, e);
    this.look.lerpVectors(this.fromLook, this.toLook, e);
    camera.lookAt(this.look);
    return t >= 1;
  }
}
