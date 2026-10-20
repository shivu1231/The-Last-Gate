import * as THREE from 'three';
import { createFracture } from '../scenes/fracture/createFracture';
import { RenderQuality } from '../systems/RenderQuality';
import { PhaseTwoCamera } from './PhaseTwoCamera';
import { PhaseTwoPost } from './PhaseTwoPost';
import { PhaseTwoDirector } from './model';
import type { ChapterWorld } from './SceneKit';
import type { PhaseTwoAudio } from './PhaseTwoAudio';

/** All live Phase II systems share this single update and are owned by its lifetime.
 *  The sequence is fracture -> afterimage; following the stored trace leaves for recovery. */
export class PhaseTwoRuntime {
  readonly cameraDirector = new PhaseTwoCamera();
  private world: ChapterWorld;
  private root = new THREE.Group();
  private post: PhaseTwoPost;
  private quality = new RenderQuality(false);
  private pointer = new THREE.Vector2(3, 3);
  private projected = new THREE.Vector3();
  private projectedB = new THREE.Vector3();
  private focusA = new THREE.Vector3();
  private focusB = new THREE.Vector3();
  private width = 1920;
  private height = 1080;
  private statsTime = 0;
  private alive = true;
  private cleanup: (() => void)[] = [];

  constructor(
    private gl: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    readonly director: PhaseTwoDirector,
    private audio: PhaseTwoAudio,
    private setDpr: (value: number) => void,
  ) {
    this.root.name = 'PHASE II / active systems';
    this.scene.add(this.root);
    this.scene.background = new THREE.Color('#081421');
    this.scene.fog = new THREE.FogExp2('#12273b', 0.0075);
    this.scene.environmentIntensity = 0.15;
    const ambient = new THREE.HemisphereLight('#aecce8', '#081121', 2.1);
    const key = new THREE.DirectionalLight('#c9e3f0', 3.3);
    key.position.set(-10, 16, 8);
    const fill = new THREE.DirectionalLight('#3b74a6', 1.4);
    fill.position.set(14, 3, -24);
    this.root.add(ambient, key, fill);
    this.post = new PhaseTwoPost(gl, scene, camera);
    this.world = createFracture(this.director);
    this.root.add(this.world.root);
    this.resize(gl.domElement.clientWidth, gl.domElement.clientHeight);
    this.installInput();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const ratio =
      this.quality.level === 'LOW'
        ? 0.85
        : this.quality.level === 'MEDIUM'
          ? 1
          : Math.min(devicePixelRatio, 1.25);
    this.setDpr(ratio);
    this.post.resize(width, height, ratio);
  }

  private installInput() {
    const canvas = this.gl.domElement;
    const move = (event: PointerEvent) => {
      this.pointer.set(
        (event.clientX / this.width) * 2 - 1,
        -((event.clientY / this.height) * 2 - 1),
      );
      this.cameraDirector.pointer.set(this.pointer.x, -this.pointer.y);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (this.director.focused) this.director.act();
    };
    const release = () => {
      this.director.recording = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('button,input,select'))
      )
        return;
      if (event.code === 'KeyE') {
        event.preventDefault();
        if (!event.repeat) this.director.act();
        this.director.recording = true;
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'KeyE') this.director.recording = false;
    };
    const visibility = () => {
      this.director.paused = document.hidden;
      if (document.hidden) release();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    document.addEventListener('visibilitychange', visibility);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('blur', release);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      document.removeEventListener('visibilitychange', visibility);
    });
  }

  private focus() {
    const state = this.director.getSnapshot();
    const trace = state.stage === 'afterimage' && !state.stored;
    if (!trace || this.pointer.x > 2) {
      this.director.focused = false;
      return;
    }
    this.focusA.set(-4, 1.1, -5);
    this.focusB.set(8.5, 5.4, -55);
    this.projected.copy(this.focusA).project(this.camera);
    this.projectedB.copy(this.focusB).project(this.camera);
    const ax = this.projected.x,
      ay = this.projected.y,
      deltaX = this.projectedB.x - ax,
      deltaY = this.projectedB.y - ay;
    const timeSeconds = THREE.MathUtils.clamp(
      ((this.pointer.x - ax) * deltaX + (this.pointer.y - ay) * deltaY) /
        Math.max(0.0001, deltaX * deltaX + deltaY * deltaY),
      0,
      1,
    );
    const distance = Math.hypot(
      ((this.pointer.x - ax - deltaX * timeSeconds) * this.width) / this.height,
      this.pointer.y - ay - deltaY * timeSeconds,
    );
    this.director.focused = distance < 0.085;
  }

  update(delta: number) {
    if (!this.alive || this.director.paused) return;
    const deltaSeconds = Math.min(delta, 0.05);
    this.focus();
    this.director.step(deltaSeconds);
    const depth = this.director,
      state = depth.getSnapshot();
    this.cameraDirector.update(this.camera, depth, deltaSeconds);
    this.world.update(depth.time, deltaSeconds);
    this.audio.update(depth);
    if (this.quality.sample(delta, !document.hidden)) {
      this.post.setLow(this.quality.level === 'LOW');
      this.resize(this.width, this.height);
    }
    const arrival =
      state.stage === 'fracture'
        ? 1 - THREE.MathUtils.smoothstep(depth.stageTime, 1.3, 5.5)
        : 0;
    this.gl.toneMappingExposure = 1.12;
    this.gl.info.reset();
    this.post.render(deltaSeconds, depth.time, arrival, 0);
    this.statsTime += deltaSeconds;
    if (this.statsTime > 0.25) {
      this.statsTime = 0;
      const canvas = this.gl.domElement;
      canvas.dataset.phase2 = state.stage;
      canvas.dataset.chapter = 'fracture';
      canvas.dataset.model = String(state.model);
      canvas.dataset.drawCalls = String(this.gl.info.render.calls);
      canvas.dataset.triangles = String(this.gl.info.render.triangles);
      canvas.dataset.geometries = String(this.gl.info.memory.geometries);
      canvas.dataset.quality = this.quality.level;
      canvas.style.cursor = depth.focused ? 'crosshair' : 'default';
    }
  }
  dispose() {
    this.alive = false;
    this.cleanup.forEach((fn) => fn());
    this.world.dispose();
    this.post.dispose();
    this.root.removeFromParent();
    this.scene.fog = null;
    this.scene.background = null;
  }
}
