import * as T from 'three';
import type { PhaseTwoDirector } from './model';

export class PhaseTwoCamera {
  pointer = new T.Vector2();
  private smooth = new T.Vector2();
  private position = new T.Vector3(0, 2.1, 10);
  private target = new T.Vector3(0, 2.8, -24);
  private look = new T.Vector3(0, 2.8, -24);
  private roll = 0;
  private first = true;

  update(camera: T.PerspectiveCamera, director: PhaseTwoDirector, dt: number) {
    const s = director.getSnapshot(), t = director.stageTime;
    const weightless = s.stage === 'fracture' ? 1 - T.MathUtils.smoothstep(t, 1.5, 7.5) : 0;
    const damp = 1 - Math.exp(-dt * (weightless ? 1.3 : 3.5));
    this.smooth.lerp(this.pointer, damp);
    this.position.set(0, 2.1, 10);
    this.target.set(.5, 3.1, -26);
    const mouse = .24;
    this.position.x += this.smooth.x * mouse;
    this.position.y -= this.smooth.y * mouse * .55;
    this.position.x += Math.sin(director.time * .24) * .14 * weightless;
    this.position.y += Math.cos(director.time * .21) * .2 * weightless;
    this.target.x += this.smooth.x * mouse * 1.4;
    this.target.y -= this.smooth.y * mouse;
    const roll = weightless * (-.28 + Math.sin(director.time * .5) * .06);
    const speed = this.first ? 1 : 1 - Math.exp(-dt * 2.4);
    camera.position.lerp(this.position, speed);
    this.look.lerp(this.target, speed);
    this.roll = T.MathUtils.lerp(this.roll, roll, speed);
    camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    camera.lookAt(this.look);
    camera.fov = T.MathUtils.lerp(camera.fov, 51, speed);
    camera.updateProjectionMatrix();
    this.first = false;
  }
}
