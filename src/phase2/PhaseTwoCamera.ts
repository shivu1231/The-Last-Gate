import * as THREE from 'three';
import type { PhaseTwoDirector } from './model';

export class PhaseTwoCamera {
  pointer = new THREE.Vector2();
  private smooth = new THREE.Vector2();
  private position = new THREE.Vector3(0, 2.1, 10);
  private target = new THREE.Vector3(0, 2.8, -24);
  private look = new THREE.Vector3(0, 2.8, -24);
  private roll = 0;
  private first = true;

  update(
    camera: THREE.PerspectiveCamera,
    director: PhaseTwoDirector,
    deltaSeconds: number,
  ) {
    const state = director.getSnapshot(),
      timeSeconds = director.stageTime;
    const weightless =
      state.stage === 'fracture'
        ? 1 - THREE.MathUtils.smoothstep(timeSeconds, 1.5, 7.5)
        : 0;
    const damp = 1 - Math.exp(-deltaSeconds * (weightless ? 1.3 : 3.5));
    this.smooth.lerp(this.pointer, damp);
    this.position.set(0, 2.1, 10);
    this.target.set(0.5, 3.1, -26);
    const mouse = 0.24;
    this.position.x += this.smooth.x * mouse;
    this.position.y -= this.smooth.y * mouse * 0.55;
    this.position.x += Math.sin(director.time * 0.24) * 0.14 * weightless;
    this.position.y += Math.cos(director.time * 0.21) * 0.2 * weightless;
    this.target.x += this.smooth.x * mouse * 1.4;
    this.target.y -= this.smooth.y * mouse;
    const roll = weightless * (-0.28 + Math.sin(director.time * 0.5) * 0.06);
    const speed = this.first ? 1 : 1 - Math.exp(-deltaSeconds * 2.4);
    camera.position.lerp(this.position, speed);
    this.look.lerp(this.target, speed);
    this.roll = THREE.MathUtils.lerp(this.roll, roll, speed);
    camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    camera.lookAt(this.look);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 51, speed);
    camera.updateProjectionMatrix();
    this.first = false;
  }
}
