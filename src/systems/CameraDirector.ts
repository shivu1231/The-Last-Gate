import { CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useSceneState, type Phase } from '../state/SceneStateManager';
import { reducedMotion } from '../config/experience';
import { cameraRig } from './CameraRig';
import { CHASE_PATH, type SequenceDirector } from './SequenceDirector';
import { ZoomController } from './ZoomController';

const span = (inputValue: number, startValue: number, endValue: number) =>
  MathUtils.smoothstep(inputValue, startValue, endValue);
/** How long each shot takes to arrive from wherever the previous one left the camera. */
const BLEND: Partial<Record<Phase, number>> = {
  'portal-sighted': 2.4,
  'call-baymax': 1.6,
  'to-portal': 1.2,
  'through-portal': 0.5,
  'sf-arrival': 1.3,
  'sf-turnback': 1.6,
  'back-decision': 1,
  'back-through': 0.3,
  reentry: 0.25,
  discovery: 2.4,
  inspected: 2.4,
  'chip-focus': 2.2,
  'chip-reaching': 1.2,
  'chip-held': 0.9,
  'chest-focus': 1.4,
  'panel-opening': 1.2,
  'socket-ready': 1,
  inserting: 0.8,
  silence: 0.6,
  booting: 2.6,
  diagnostic: 2.2,
  corrupting: 2.4,
  threat: 1.5,
  ignition: 0.5,
  chase: 0.01,
  fracture: 1.2,
  pulled: 0.4,
  handoff: 0.01,
};
const PULL = new CatmullRomCurve3([
  new Vector3(1.3, 1.45, -27.1),
  new Vector3(1.55, 3.4, -30.4),
  new Vector3(1.8, 6.2, -33.8),
  new Vector3(1.85, 7.1, -40),
  new Vector3(1.9, 7.2, -49),
]);
const INSPECT_AIM = new Vector3(4.14, 1.3, -9.02);
/**
 * How far the viewer can turn Hiro's head with the pointer, per beat (yaw, pitch in radians).
 * Wide while exploring, tight while a hand is busy or a beat is locked.
 */
const LOOK: Partial<Record<Phase, [number, number]>> = {
  awakening: [0.18, 0.1],
  'portal-sighted': [0.4, 0.2],
  'call-baymax': [0.4, 0.2],
  'to-portal': [0.35, 0.18],
  'through-portal': [0.05, 0.03],
  'sf-arrival': [0.45, 0.24],
  'sf-turnback': [0.3, 0.16],
  'back-decision': [0.1, 0.06],
  'back-through': [0.05, 0.03],
  reentry: [0.03, 0.02],
  approaching: [0.62, 0.3],
  discovery: [0.48, 0.24],
  inspected: [0.48, 0.24],
  'chip-focus': [0.2, 0.12],
  'chip-reaching': [0.14, 0.09],
  'chip-held': [0.16, 0.1],
  'chest-focus': [0.2, 0.12],
  'panel-opening': [0.2, 0.12],
  'socket-ready': [0.08, 0.05],
  inserting: [0.08, 0.05],
  silence: [0.22, 0.12],
  booting: [0.32, 0.16],
  diagnostic: [0.32, 0.16],
  corrupting: [0.24, 0.13],
  threat: [0.1, 0.06],
  ignition: [0.2, 0.12],
  chase: [0.34, 0.14],
  fracture: [0.22, 0.13],
  pulled: [0.1, 0.06],
  handoff: [0.4, 0.22],
};
/**
 * Beats where the viewer can zoom, and how far (-1 pulled back … 1 close in). Only the shots that
 * wait on the player: every scripted move (reaching, the redirect, the panel, the dock) owns the
 * lens, and any zoom eases back out while it plays. Limits are per shot so the near chest shots
 * never push into the shell and the wide ones never back into the street.
 */
const ZOOM_SHOTS: Partial<Record<Phase, [number, number]>> = {
  'chip-focus': [-0.55, 0.7],
  'chest-focus': [-0.6, 0.55],
  'socket-ready': [-0.5, 0.3],
};
export const ZOOM_PHASES = Object.keys(ZOOM_SHOTS) as Phase[];
/**
 * Beats where the keep-Baymax-in-frame guard stays off: he is elsewhere (the other side of the
 * portal), the camera isn't on yet, or the shot deliberately turns its back on him. The whole
 * escape faces the gate (tracker S-01: the guard was dragging the walk to the portal round to
 * Baymax, so Hiro walked in backwards); call-baymax aims at him on its own, and the hurt
 * re-entry twists round to watch the gate seal.
 */
const AWAY = new Set<Phase>([
  'loading',
  'portal-sighted',
  'call-baymax',
  'to-portal',
  'through-portal',
  'sf-arrival',
  'sf-turnback',
  'back-decision',
  'back-through',
  'reentry',
]);
/**
 * Where the hurt re-entry leaves Hiro lying (z). The run back through the ring (z 24) ends a few
 * metres past it, not halfway to Baymax (tracker S-09). ExperienceDirector places the debris round it.
 */
export const REENTRY_Z = 16.6;
const RUN_END = REENTRY_Z + 2.9;
/** The gate's plane (createPortalGate(24) in ExperienceDirector). */
const RING_Z = 24;
/**
 * Data contract used by shared runtime services.
 */
export type ShotContext = {
  chest: Vector3;
  normal: Vector3;
  chip: Vector3;
  baymax: Vector3;
  head: Vector3;
};

/** Sole owner of the camera. Each phase is a directed shot; impulses come from the sequence. */
export class CameraDirector {
  private progress = 0;
  private wakeTime = 0;
  private time = 0;
  private replay = -1;
  private keep = new Vector3();
  private keepAt = new Vector3();
  private look = new Vector3();
  private target = new Vector3();
  private gaze = new Vector3();
  private velocity = 0;
  private footfall = 0;
  public visualProgress = 0;
  public wake = 0;
  public focusDistance = 19;
  public pointer = { x: 0, y: 0 };
  public holding = false;
  private phase: Phase = 'loading';
  private shotTime = 0;
  private prevPhase: Phase = 'loading';
  private fromPos = new Vector3();
  private fromLook = new Vector3();
  private fromFov = 45;
  private fromRoll = 0;
  private pos = new Vector3();
  private aim = new Vector3();
  private fov = 45;
  private roll = 0;
  private lastPos = new Vector3();
  private lastLook = new Vector3();
  private lastRoll = 0;
  private lastFov = 45;
  private v = new Vector3();
  private v2 = new Vector3();
  private shakeT = 0;
  private focusPoint = new Vector3();
  private run = 0;
  private initialized = false;
  /** Viewer zoom while handling the chip: -1 (pulled back) … 1 (close in), clamped per shot. */
  private readonly zoomController = new ZoomController({
    min: 0,
    max: 0,
    step: 0.0022,
  });
  private zoom = 0;
  /** Sideways step on the approach (A / D, arrow keys): -1, 0 or 1 while held. */
  public strafeInput = 0;
  private strafe = 0;
  private strafeGoal = 0;
  private lookRange: [number, number] = [0.18, 0.1];
  zoomBy(amount: number) {
    this.zoomController.add(amount);
  }
  get zoomable() {
    return this.phase in ZOOM_SHOTS;
  }

  update(
    camera: PerspectiveCamera,
    delta: number,
    _w: number,
    _h: number,
    seq?: SequenceDirector,
    context?: ShotContext,
  ) {
    const state = useSceneState.getState(),
      deltaSeconds = Math.min(delta, 0.1);
    if (state.replay !== this.replay) {
      this.replay = state.replay;
      this.initialized = false;
      this.phase = 'loading';
      this.progress = 0;
      this.wakeTime = 0;
      this.holding = false;
      this.zoomController.reset();
      this.zoom = 0;
      this.strafe = 0;
      this.strafeGoal = 0;
    }
    this.time += deltaSeconds;
    if (state.chapter === 'BOOT') return;
    this.wakeTime += deltaSeconds;
    // Each walk beat (to the gate, then to Baymax) runs its own progress from zero.
    if (state.phase !== this.prevPhase) {
      if (state.phase === 'approaching') this.progress = 0;
      if (state.phase === 'awakening') this.wakeTime = 0;
      this.prevPhase = state.phase;
    }
    if (this.holding && state.phase === 'approaching')
      state.move(deltaSeconds * 0.052);
    const before = this.progress;
    this.progress = MathUtils.damp(
      this.progress,
      state.targetProgress,
      reducedMotion ? 20 : 2.3,
      deltaSeconds,
    );
    this.velocity = MathUtils.damp(
      this.velocity,
      (this.progress - before) / Math.max(deltaSeconds, 0.001),
      3,
      deltaSeconds,
    );
    const progress = MathUtils.smoothstep(this.progress, 0, 1);
    const wake = reducedMotion
      ? 1
      : MathUtils.smoothstep(this.wakeTime, 3.3, 10.5);
    this.look.x = MathUtils.damp(
      this.look.x,
      this.pointer.x,
      1.8,
      deltaSeconds,
    );
    this.look.y = MathUtils.damp(
      this.look.y,
      this.pointer.y,
      1.8,
      deltaSeconds,
    );
    this.gaze.x = MathUtils.damp(this.gaze.x, this.look.x, 3, deltaSeconds);
    this.gaze.y = MathUtils.damp(this.gaze.y, this.look.y, 3, deltaSeconds);
    this.footfall += Math.abs(this.velocity) * deltaSeconds * 70;
    // A free sidestep on the approach; it eases back to the authored line once he arrives.
    if (state.phase === 'approaching')
      this.strafeGoal = MathUtils.clamp(
        this.strafeGoal + this.strafeInput * deltaSeconds * 1.3,
        -1.6,
        1.6,
      );
    else this.strafeGoal = 0;
    this.strafe = MathUtils.damp(
      this.strafe,
      this.strafeGoal,
      2.4,
      deltaSeconds,
    );
    const breathing = reducedMotion ? 0 : Math.sin(this.time * 1.12) * 0.008;
    const step = reducedMotion
      ? 0
      : Math.sin(this.footfall) *
        Math.min(0.008, Math.abs(this.velocity) * 0.08);
    // The approach: unchanged from the opening.
    camera.position.set(
      MathUtils.lerp(-1.7, 1.15, progress) +
        Math.sin(progress * Math.PI) * -0.6 +
        this.look.x * 0.07 +
        this.strafe,
      MathUtils.lerp(1.05, 2.48, wake) - progress * 0.24 + breathing + step,
      MathUtils.lerp(8, -4.8, progress),
    );
    this.target.set(
      MathUtils.lerp(-0.65, 2.65, progress) +
        this.gaze.x * 0.52 +
        this.strafe * 0.6,
      MathUtils.lerp(0.3, 2.4, wake) - progress * 1.25 - this.gaze.y * 0.23,
      -14 + progress * 2,
    );
    camera.fov =
      MathUtils.lerp(51, 45, progress) +
      (reducedMotion
        ? 0
        : Math.sin(this.time * 0.9) * 0.025 + (1 - wake) * 0.2);
    let roll = reducedMotion
      ? 0
      : (1 - wake) * -0.09 +
        Math.sin(this.time * 0.43) * 0.0012 -
        this.velocity * 0.01;
    const directed =
      seq &&
      context &&
      !['loading', 'awakening', 'approaching'].includes(state.phase);
    if (directed) {
      if (state.phase !== this.phase) {
        this.phase = state.phase;
        this.shotTime = 0;
        // Blend from the lens the viewer last saw. (camera.fov was just overwritten by the approach
        // pose above, so reading it here made every beat pop wide and zoom back in.)
        this.fromPos.copy(this.lastPos);
        this.fromLook.copy(this.lastLook);
        this.fromFov = this.lastFov;
        this.fromRoll = this.lastRoll;
        // Each shot starts at its authored framing; zoom from the last shot never carries over.
        this.zoomController.setEnabled(false);
        const limits = ZOOM_SHOTS[state.phase];
        if (limits)
          this.zoomController.setLimits({
            min: limits[0],
            max: limits[1],
            step: 0.0022,
          });
        if (state.phase === 'handoff') {
          this.fromPos.set(1.9, 7.2, -44);
          this.fromLook.set(1.9, 7.2, -90);
        }
      }
      this.shotTime += deltaSeconds * seq.slowmo;
      this.shot(state.phase, this.shotTime, seq, context, camera, deltaSeconds);
      // Viewer zoom: a dolly along the shot's own line of sight plus a little lens, so the
      // chip, the seam and the socket can be studied close or seen in context. Input is ignored
      // while the shot is still arriving or a hold is pushing the camera in.
      this.zoomController.setEnabled(this.zoomable);
      this.zoomController.setScripted(
        this.shotTime < (BLEND[state.phase] ?? 1.2) || seq.holdProgress > 0,
      );
      this.zoom = this.zoomController.update(
        deltaSeconds,
        reducedMotion ? 20 : 5,
      );
      if (Math.abs(this.zoom) > 0.001) {
        this.v.subVectors(this.pos, this.aim);
        this.pos.copy(this.aim).addScaledVector(this.v, 1 - this.zoom * 0.45);
        this.fov *= 1 - this.zoom * 0.14;
      }
      if (!this.initialized) {
        this.fromPos.copy(this.pos);
        this.fromLook.copy(this.aim);
        this.fromFov = this.fov;
        this.fromRoll = this.roll;
      }
      const secondValue = reducedMotion
        ? 1
        : span(this.shotTime, 0, BLEND[state.phase] ?? 1.2);
      camera.position.lerpVectors(this.fromPos, this.pos, secondValue);
      this.target.lerpVectors(this.fromLook, this.aim, secondValue);
      this.turnBlend(camera.position, secondValue);
      camera.fov = MathUtils.lerp(this.fromFov, this.fov, secondValue);
      roll = MathUtils.lerp(this.fromRoll, this.roll, secondValue);
      this.lastFov = camera.fov;
      this.applyImpulses(camera, seq, deltaSeconds);
      // Tracker T-01: never render with the lens on the ring's plane (z 24). The near plane slices
      // the portal's stencil disc there, neither world draws and the frame flashes flat blue.
      if (
        (state.phase === 'through-portal' || state.phase === 'back-through') &&
        Math.abs(camera.position.z - RING_Z) < 0.1
      )
        camera.position.z = RING_Z + (camera.position.z < RING_Z ? -0.1 : 0.1);
    } else {
      this.phase = state.phase;
      this.lastFov = camera.fov;
    }
    camera.lookAt(this.target);
    // Free look: the pointer turns Hiro's head within limits set by the beat. Damped twice
    // (look → gaze), so it carries weight instead of tracking the mouse 1:1.
    const range = LOOK[state.phase] ?? [0.15, 0.08];
    this.lookRange[0] = MathUtils.damp(
      this.lookRange[0],
      range[0],
      2,
      deltaSeconds,
    );
    this.lookRange[1] = MathUtils.damp(
      this.lookRange[1],
      range[1],
      2,
      deltaSeconds,
    );
    camera.rotateY(-this.gaze.x * this.lookRange[0]);
    camera.rotateX(-this.gaze.y * this.lookRange[1]);
    camera.rotateZ(roll);
    cameraRig.apply(camera, deltaSeconds); // global camera language: motivated shake + transition FOV kicks
    // Tracker P1-03: whatever the shot or the free look does, Baymax stays in frame while he's in
    // this world. If he drifts past the edge margin the view turns back toward him, gently.
    if (context && !AWAY.has(state.phase)) {
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      this.keep.copy(context.baymax).setY(context.baymax.y + 1.2);
      this.keepAt.copy(this.keep).project(camera);
      const over =
        this.keepAt.z > 1
          ? 1
          : Math.max(0, Math.abs(this.keepAt.x) - 0.86) +
            Math.max(0, Math.abs(this.keepAt.y) - 0.86);
      if (over > 0) {
        const ahead = camera
          .getWorldDirection(this.keepAt)
          .multiplyScalar(camera.position.distanceTo(this.keep))
          .add(camera.position);
        camera.lookAt(ahead.lerp(this.keep, Math.min(1, over * 1.8) * 0.6));
        camera.rotateZ(roll);
      }
    }
    if (
      directed &&
      ['ignition', 'chase', 'fracture', 'pulled'].includes(state.phase) &&
      camera.aspect < 16 / 9
    )
      camera.fov = MathUtils.radToDeg(
        2 *
          Math.atan(
            (Math.tan(MathUtils.degToRad(camera.fov) / 2) * (16 / 9)) /
              camera.aspect,
          ),
      );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.initialized = true;
    this.lastPos.copy(camera.position);
    this.lastLook.copy(this.target);
    this.lastRoll = roll;
    this.visualProgress = progress;
    this.wake = wake;
    if (!directed)
      this.focusDistance = -this.focusPoint
        .set(2.7, 2, -12)
        .applyMatrix4(camera.matrixWorldInverse).z;
    if (this.progress > 0.995 && state.phase === 'approaching') state.arrive();
  }

  /** Writes the authored shot for this phase into pos / aim / fov / roll / focusDistance. */
  private shot(
    phase: Phase,
    timeSeconds: number,
    seq: SequenceDirector,
    context: ShotContext,
    camera: PerspectiveCamera,
    deltaSeconds: number,
  ) {
    const vector = this.pos,
      vector2 = this.aim,
      breathe = reducedMotion ? 0 : Math.sin(this.time * 1.05),
      sway = reducedMotion ? 0 : 1;
    const lookX = this.gaze.x * sway,
      lookY = this.gaze.y * sway;
    this.roll = 0;
    const chestShot = (distance: number, lift: number, fov: number) => {
      vector.copy(context.chest).addScaledVector(context.normal, distance);
      vector.y += lift;
      vector.x -= 0.06;
      vector2.copy(context.chest).addScaledVector(context.normal, -0.04);
      this.fov = fov;
    };
    switch (phase) {
      case 'portal-sighted': {
        // Just awake. He turns and finds the gate still burning behind him.
        const blendFactor = span(timeSeconds, 0, 3.2);
        vector.set(
          -0.6 + lookX * 0.1,
          2.3 + breathe * 0.006,
          10.6 - blendFactor * 0.4,
        );
        vector2.set(0 + lookX * 0.4, 4 - lookY * 0.2, 22);
        this.fov = 52 - blendFactor * 2;
        this.focusDistance = vector.distanceTo(this.v.set(0, 4.2, 24));
        break;
      }
      case 'call-baymax': {
        // A glance back at Baymax — come on, we have to go.
        vector.set(-1.1, 2.3 + breathe * 0.006, 10.2);
        vector2.copy(context.baymax).setY(1.5);
        vector2.x += lookX * 0.35;
        this.fov = 50;
        this.focusDistance = vector.distanceTo(context.baymax);
        break;
      }
      case 'to-portal': {
        // Automatic walk to the gate (part of the cinematic; no input needed).
        const progress = span(timeSeconds, 0.2, 4);
        vector.set(
          lookX * 0.12 +
            (reducedMotion ? 0 : Math.sin(timeSeconds * 3.3) * 0.03),
          2.52 + breathe * 0.006,
          MathUtils.lerp(10.2, 20.6, progress),
        );
        vector2.set(lookX * 0.3, 4 - lookY * 0.2, 24);
        this.fov = 50;
        this.focusDistance = vector.distanceTo(this.v.set(0, 4.2, 24));
        break;
      }
      case 'through-portal': {
        const blendFactor2 = span(timeSeconds, 0, 2);
        vector.set(0, 2.6, MathUtils.lerp(20.6, 28, blendFactor2));
        vector2.set(0, 8, 90);
        this.fov =
          MathUtils.lerp(50, 56, span(timeSeconds, 0.15, 1.1)) -
          span(timeSeconds, 1.4, 2) * 2;
        this.focusDistance = 12;
        break;
      }
      case 'sf-arrival': {
        // Out onto the overlook: a slow pan across the bay, the bridge and the whole skyline.
        const blendFactor3 = span(timeSeconds, 0, 4);
        vector.set(
          MathUtils.lerp(0, -1.4, blendFactor3),
          MathUtils.lerp(2.6, 3, blendFactor3),
          MathUtils.lerp(28, 31.5, blendFactor3) + lookX * 0.1,
        );
        vector2.set(
          MathUtils.lerp(-18, 10, blendFactor3) + lookX * 0.6,
          MathUtils.lerp(13, 16, blendFactor3) - lookY * 0.3,
          110,
        );
        this.fov = MathUtils.lerp(56, 52, blendFactor3);
        this.focusDistance = 42;
        break;
      }
      case 'sf-turnback': {
        // Look through the opening at Baymax, rather than above him at its bright rim.
        const blendFactor4 = span(timeSeconds, 0, 2.7);
        vector.set(
          MathUtils.lerp(-1.4, 0, blendFactor4),
          MathUtils.lerp(3, 2.5, blendFactor4),
          31.5,
        );
        vector2.copy(context.baymax);
        vector2.y += 1.25;
        vector2.x += lookX * 0.2;
        this.fov = MathUtils.lerp(52, 40, blendFactor4);
        this.focusDistance = vector.distanceTo(vector2);
        break;
      }
      case 'back-decision': {
        // A brief decision, then a committed step back into the failing portal.
        const blendFactor5 = span(timeSeconds, 0.65, 2.8);
        vector.set(0, 2.5, MathUtils.lerp(31.5, 27, blendFactor5));
        vector2.copy(context.baymax).setY(context.baymax.y + 1.25);
        vector2.lerp(this.v.set(0, 3.4, 24), blendFactor5 * 0.6);
        this.fov = 40 + blendFactor5 * 4;
        this.focusDistance = vector.distanceTo(vector2);
        break;
      }
      case 'back-through': {
        // Run and jump back through the ring into the dimension; the landing lands in 'reentry'.
        const whoosh = span(timeSeconds, 0.15, 1.1),
          cross = span(timeSeconds, 0.1, 1.9);
        vector.set(
          MathUtils.lerp(0, -0.8, span(timeSeconds, 1, 2.2)),
          2.5,
          MathUtils.lerp(27, RUN_END, cross),
        );
        vector2.set(
          0,
          MathUtils.lerp(4, 3, span(timeSeconds, 0.2, 1.6)),
          MathUtils.lerp(24, -6, span(timeSeconds, 0.2, 1.6)),
        );
        this.fov = MathUtils.lerp(46, 58, whoosh);
        this.roll = whoosh * 0.06;
        this.focusDistance = 12;
        break;
      }
      case 'reentry': {
        // The crossing throws him down hard. Still on the ground he twists to look back, and
        // watches the gate seal behind him (RiftGate.seal); then he goes still, knocked out.
        const hit = span(timeSeconds, 0, 0.45),
          reel = span(timeSeconds, 0.5, 2.6),
          turn = span(timeSeconds, 0.75, 1.8),
          settle = span(timeSeconds, 3.1, 4.6);
        vector.set(
          -1.2 +
            (reducedMotion
              ? 0
              : Math.sin(timeSeconds * 17) * 0.025 * (1 - reel)),
          MathUtils.lerp(1.4, 0.52, hit) + breathe * 0.01,
          MathUtils.lerp(RUN_END - 0.9, REENTRY_Z, hit),
        );
        // Turn by heading and pitch (not by sliding the aim point), so the look back swings
        // round past his shoulder instead of through the sky.
        this.v
          .set(
            MathUtils.lerp(-0.6, 1.6, hit),
            MathUtils.lerp(2.2, 3.2, hit),
            MathUtils.lerp(-11, -13, hit),
          )
          .sub(vector);
        // Lying only a few metres short of the ring now, he looks at its lower half so the road and
        // the implosion share the frame instead of the lens craning into the sky.
        this.v2.set(0, 1.8, 24).sub(vector);
        const yaw = MathUtils.lerp(
          Math.atan2(this.v.x, this.v.z),
          Math.atan2(this.v2.x, this.v2.z),
          turn,
        );
        const pitch =
          MathUtils.lerp(
            Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z)),
            Math.atan2(this.v2.y, Math.hypot(this.v2.x, this.v2.z)),
            turn,
          ) -
          settle * 0.3;
        vector2
          .set(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch),
          )
          .multiplyScalar(12)
          .add(vector);
        // The rock's hit (tracker N-01): his head snaps round and down.
        const knock = reducedMotion ? 0 : span(timeSeconds, 2.95, 3.08);
        if (knock > 0) {
          vector2.x += knock * 5;
          vector2.y -= knock * 4;
          vector.y -= knock * 0.12;
        }
        this.fov =
          MathUtils.lerp(58, 46, span(timeSeconds, 0.4, 1.9)) + settle * 4;
        this.roll =
          (reducedMotion ? 0 : Math.sin(timeSeconds * 6) * 0.055 * (1 - reel)) +
          hit * 0.1 * (1 - turn) +
          settle * 0.14;
        this.focusDistance = MathUtils.lerp(
          10,
          vector.distanceTo(this.v2.set(0, 4.2, 24)),
          turn,
        );
        break;
      }
      case 'discovery':
      case 'inspected': {
        // The world narrows: a slow push toward the shell, lower and closer, with less wander.
        const blendFactor6 = span(timeSeconds, 0, 9);
        vector.set(
          MathUtils.lerp(1.45, 1.95, blendFactor6) + lookX * 0.04,
          MathUtils.lerp(2.15, 1.92, blendFactor6) + breathe * 0.006,
          MathUtils.lerp(-5.4, -6.9, blendFactor6),
        );
        vector2.set(
          2.72 + lookX * 0.25,
          MathUtils.lerp(1.35, 1.5, blendFactor6) - lookY * 0.12,
          -11.6,
        );
        this.fov = MathUtils.lerp(44, 40, blendFactor6);
        this.focusDistance = vector.distanceTo(context.baymax) - 0.4;
        break;
      }
      case 'chip-focus': {
        const commit = seq.holdProgress;
        vector.set(
          4.42 + lookX * 0.03,
          1.62 + breathe * 0.006 - commit * 0.14,
          -7.95 - commit * 0.36,
        );
        vector2.copy(context.chip).lerp(context.chest, 0.18 - commit * 0.18);
        vector2.y += 0.05;
        vector2.x += lookX * 0.12;
        this.fov = 42 - commit * 3;
        this.focusDistance = vector.distanceTo(context.chip);
        break;
      }
      case 'chip-reaching': {
        // The aim is a fixed point in front of Hiro's hands; the chip rises into it.
        vector.set(
          4.36,
          MathUtils.lerp(1.46, 1.66, span(timeSeconds, 0.3, 1.9)),
          -8.3 + span(timeSeconds, 0, 1.5) * 0.08,
        );
        vector2.lerpVectors(
          this.v.set(4.02, -0.1, -10.48),
          INSPECT_AIM,
          span(timeSeconds, 0.2, 1.7),
        );
        this.fov = MathUtils.lerp(39, 35, span(timeSeconds, 0, 2));
        this.focusDistance = vector.distanceTo(context.chip);
        break;
      }
      case 'chip-held': {
        // Inspection, then a deliberate redirect: the chest becomes the focal plane.
        const turn = span(timeSeconds, 1.55, 2.7);
        this.v.set(4.36, 1.66, -8.22);
        chestShot(2.05, 0.3, 38);
        vector.lerpVectors(this.v, vector, turn);
        vector2.lerpVectors(INSPECT_AIM, vector2, turn);
        this.fov = MathUtils.lerp(35, 38, turn);
        this.focusDistance = MathUtils.lerp(
          camera.position.distanceTo(context.chip),
          vector.distanceTo(context.chest),
          turn,
        );
        break;
      }
      case 'chest-focus': {
        chestShot(
          1.95 - seq.holdProgress * 0.22,
          0.28 - seq.holdProgress * 0.05,
          38 - seq.holdProgress * 2,
        );
        vector.y += breathe * 0.005;
        vector2.x += lookX * 0.05;
        this.focusDistance = vector.distanceTo(context.chest);
        break;
      }
      case 'panel-opening': {
        chestShot(
          MathUtils.lerp(1.72, 1.28, span(timeSeconds, 0.4, 3.8)),
          MathUtils.lerp(0.22, 0.14, span(timeSeconds, 0.4, 3.8)),
          MathUtils.lerp(37, 34, span(timeSeconds, 0, 4)),
        );
        this.focusDistance = vector.distanceTo(context.chest);
        break;
      }
      case 'socket-ready':
      case 'inserting': {
        chestShot(
          phase === 'inserting'
            ? MathUtils.lerp(1.16, 1.04, span(timeSeconds, 0, 1))
            : 1.16,
          0.12,
          34,
        );
        vector.y += breathe * 0.002;
        if (
          phase === 'inserting' &&
          timeSeconds > 1.03 &&
          timeSeconds < 1.2 &&
          !reducedMotion
        )
          vector.addScaledVector(
            context.normal,
            -0.006 * Math.sin((timeSeconds - 1.03) * 60),
          );
        this.focusDistance = vector.distanceTo(context.chest);
        break;
      }
      case 'silence': {
        chestShot(
          MathUtils.lerp(1.04, 1.12, span(timeSeconds, 0, 2.4)),
          0.12,
          34,
        );
        vector.y += breathe * 0.006;
        this.focusDistance = vector.distanceTo(context.chest);
        break;
      }
      case 'booting': {
        // Observational: Hiro straightens and steps back to watch the whole of him wake.
        const blendFactor7 = span(timeSeconds, 0.8, 3.6);
        chestShot(1.12, 0.12, 34);
        this.v.set(2.32, 2.12, -8.55);
        vector.lerp(this.v, blendFactor7);
        vector2.lerp(
          this.v2.set(
            2.82,
            MathUtils.lerp(2.1, 2.45, span(timeSeconds, 2.4, 4.2)),
            -11.6,
          ),
          blendFactor7,
        );
        this.fov = MathUtils.lerp(34, 42, blendFactor7);
        this.focusDistance = vector.distanceTo(context.chest);
        break;
      }
      case 'diagnostic': {
        vector.set(2.34 + breathe * 0.004, 2.16, -8.7);
        vector2.set(2.8, 2.5, -11.65);
        this.fov = 41;
        this.focusDistance = vector.distanceTo(context.head);
        break;
      }
      case 'corrupting': {
        const blendFactor8 = span(timeSeconds, 0, 4.8);
        vector.set(
          MathUtils.lerp(2.34, 2.46, blendFactor8),
          MathUtils.lerp(2.16, 2.42, blendFactor8),
          MathUtils.lerp(-8.7, -9.25, blendFactor8),
        );
        vector2
          .copy(context.head)
          .setY(context.head.y - 0.12 * (1 - blendFactor8));
        this.fov = MathUtils.lerp(41, 36, blendFactor8);
        // Tracker N-02: the armour assembles over him here and is far bulkier than the soft shell, so
        // Hiro backs off along the same line of sight as it builds, keeping head and shoulders in frame.
        this.v.subVectors(vector, vector2).normalize();
        vector.addScaledVector(this.v, 2.8 * span(timeSeconds, 0.6, 3.6));
        vector.y += 0.35 * span(timeSeconds, 0.6, 3.6);
        vector2.y += 0.3 * span(timeSeconds, 0.6, 3.6);
        this.focusDistance = vector.distanceTo(context.head);
        break;
      }
      case 'threat': {
        // Locked. No sway. At the lock, a slow dolly-zoom presses the eyes forward.
        const lock = span(timeSeconds, 1.7, 3.4);
        vector.set(2.55, 2.62, -9.55 + lock * 0.25);
        vector2.copy(context.head);
        vector2.y -= 0.02;
        this.v.subVectors(vector, vector2).normalize();
        vector.addScaledVector(this.v, 2.8 - lock * 0.6);
        vector.y += 0.35;
        vector2.y += 0.3;
        this.fov = MathUtils.lerp(34, 29.5, lock);
        this.focusDistance = vector.distanceTo(context.head);
        break;
      }
      case 'ignition': {
        // Stay on Hiro's feet and follow the complete launch; no unmotivated fall/roll.
        const back = span(timeSeconds, 0, 1.4);
        vector.set(
          MathUtils.lerp(2.55, 1.05, back),
          MathUtils.lerp(2.5, 1.5, back),
          MathUtils.lerp(-6.8, -6.7, back),
        );
        vector2.copy(context.baymax).setY(context.baymax.y + 1.35);
        this.fov = MathUtils.lerp(42, 58, back);
        this.roll = 0;
        this.focusDistance = vector.distanceTo(context.baymax) + 0.5;
        break;
      }
      case 'chase': {
        const progress2 = Math.min(1, seq.chase),
          rise = span(timeSeconds, 0.1, 1.15);
        CHASE_PATH.getPointAt(progress2, vector);
        const speed = seq.chaseSpeed * CHASE_PATH.getLength();
        this.run += deltaSeconds * speed * 2.2;
        const instability = span(timeSeconds, 1.8, 5.2);
        const bob = reducedMotion
            ? 0
            : Math.abs(Math.sin(this.run)) * 0.07 * Math.min(1, speed / 2.2),
          side = reducedMotion
            ? 0
            : Math.sin(this.run * 0.5) * 0.04 * Math.min(1, speed / 2.2);
        vector.y += bob;
        vector.x += side;
        // Look well down the line; near the end, the seam itself becomes the destination.
        CHASE_PATH.getPointAt(Math.min(1, progress2 + 0.16), vector2);
        vector2.y = MathUtils.lerp(vector2.y + 0.9, vector2.y + 0.15, rise);
        vector2.lerp(this.v2.set(1.8, 3.4, -34), span(progress2, 0.7, 1) * 0.6);
        if (!reducedMotion && instability > 0) {
          vector.x += Math.sin(timeSeconds * 2.1) * 0.018 * instability;
          vector.y += Math.sin(timeSeconds * 1.7) * 0.012 * instability;
          vector2.x += Math.sin(timeSeconds * 1.3 + 1) * 0.055 * instability;
          this.roll += Math.sin(timeSeconds * 1.1) * 0.012 * instability;
        }
        // Glances: the director pulls Hiro's eyes to Baymax when he is the threat on screen.
        const width = this.glance(seq);
        if (width > 0) {
          vector2.lerp(
            this.v.copy(context.baymax).setY(context.baymax.y + 1.4),
            width,
          );
        }
        // See the miss as well as the shooter. Looking only at his chest hid every
        // projectile strike beneath the screen, making the attack feel disconnected.
        const shot =
          seq.beat === 'rooftop'
            ? span(seq.beatTime, 0.75, 1.15) *
              (1 - span(seq.beatTime, 2.6, 2.85))
            : 0;
        if (shot > 0) vector2.lerp(this.v.set(-4.6, -0.12, -21.2), shot * 0.55);
        // Never crane straight up: keep the street, and whatever is about to hit it, in frame.
        const reach = Math.hypot(vector2.x - vector.x, vector2.z - vector.z);
        if (width < 0.6)
          vector2.y = Math.min(vector2.y, vector.y + reach * 0.42);
        vector2.x += lookX * 1.2;
        vector2.y -= lookY * 0.6;
        this.fov = Math.max(
          58 + Math.min(3, speed),
          MathUtils.radToDeg(
            2 * Math.atan(2.5 / Math.max(3, vector.distanceTo(context.baymax))),
          ),
        );
        this.fov += shot * 17;
        if (seq.beat === 'overhead')
          this.fov +=
            10 *
            span(seq.beatTime, 0.55, 1) *
            (1 - span(seq.beatTime, 1.65, 2.3));
        this.roll = side * -0.18;
        this.focusDistance = 12;
        break;
      }
      case 'fracture': {
        const blendFactor9 = span(timeSeconds, 0, 5.6),
          disorient = span(timeSeconds, 0.8, 4.8);
        vector.set(
          1.3 +
            (reducedMotion
              ? 0
              : Math.sin(timeSeconds * 23) *
                (0.01 + 0.055 * disorient) *
                blendFactor9),
          1.46 +
            (reducedMotion
              ? 0
              : Math.sin(timeSeconds * 19) * 0.035 * disorient),
          -27.1 + span(timeSeconds, 1.2, 3) * 0.35,
        );
        vector2.set(1.85, MathUtils.lerp(3.2, 5.4, blendFactor9), -31.5);
        if (!reducedMotion) {
          vector2.x += Math.sin(timeSeconds * 14) * 0.18 * disorient;
          this.roll = Math.sin(timeSeconds * 9) * 0.09 * disorient;
        }
        this.fov = MathUtils.lerp(48, 60, blendFactor9);
        this.focusDistance = 6;
        break;
      }
      case 'pulled': {
        const resist = span(timeSeconds, 0, 0.9),
          drag = Math.pow(span(timeSeconds, 0.9, 4.4), 1.7);
        PULL.getPointAt(drag, vector);
        vector.z += resist * 0.3 * (1 - drag);
        PULL.getPointAt(Math.min(1, drag + 0.12), vector2);
        vector2.y += 0.4 * (1 - drag);
        vector2.lerp(
          this.v.copy(context.baymax).add(this.v2.set(0, 1.4, 0)),
          0.72 * (1 - span(timeSeconds, 2.6, 3.6)),
        );
        this.fov = MathUtils.lerp(58, 82, drag);
        this.roll = drag * 0.9;
        this.focusDistance = 8;
        break;
      }
      case 'handoff': {
        // Through. A slow re-orientation in the corridor that leads deeper.
        const blendFactor10 = span(timeSeconds, 0, 26);
        vector.set(
          1.9 + Math.sin(timeSeconds * 0.2) * 0.15,
          7.2 + Math.sin(timeSeconds * 0.27) * 0.12,
          MathUtils.lerp(-44, -56, blendFactor10),
        );
        vector2.set(1.9, 7.2, -90);
        this.fov = MathUtils.lerp(70, 58, span(timeSeconds, 0, 6));
        this.roll = 0.5 * (1 - span(timeSeconds, 0, 5));
        this.focusDistance = 18;
        break;
      }
      default: {
        vector.copy(camera.position);
        vector2.copy(this.target);
        this.fov = camera.fov;
      }
    }
  }
  /**
   * Tracker T-01: a big turn between shots (the glance back at Baymax and round to the portal
   * again, about 170°) can't blend its look-at point in a straight line: the point passes beside
   * Hiro's head and the view whips through the dark void off the street in a couple of frames,
   * which reads as a black flicker. Large turns blend heading and pitch instead, at an even rate,
   * dipping a little toward the road on the way round. Small turns keep the point blend.
   */
  private turnBlend(position: Vector3, secondValue: number) {
    if (secondValue <= 0 || secondValue >= 1) return;
    this.v.subVectors(this.fromLook, this.fromPos);
    this.v2.subVectors(this.aim, this.pos);
    const scalarValue = this.v.length(),
      scalarValue2 = this.v2.length();
    if (scalarValue < 1e-3 || scalarValue2 < 1e-3) return;
    const width = MathUtils.smoothstep(this.v.angleTo(this.v2), 0.6, 1.2);
    if (width <= 0) return;
    const yaw0 = Math.atan2(this.v.x, this.v.z),
      pitch0 = Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z));
    const yaw1 = Math.atan2(this.v2.x, this.v2.z),
      pitch1 = Math.atan2(this.v2.y, Math.hypot(this.v2.x, this.v2.z));
    let turn = yaw1 - yaw0;
    turn -= Math.PI * 2 * Math.round(turn / (Math.PI * 2));
    const yaw = yaw0 + turn * secondValue,
      pitch =
        MathUtils.lerp(pitch0, pitch1, secondValue) -
        Math.sin(Math.PI * secondValue) *
          0.16 *
          Math.min(1, Math.abs(turn) / 2);
    this.v
      .set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      )
      .multiplyScalar(MathUtils.lerp(scalarValue, scalarValue2, secondValue))
      .add(position);
    this.target.lerp(this.v, width);
  }
  private glance(seq: SequenceDirector) {
    const secondEntry = seq.beat,
      timeSeconds = seq.beatTime;
    // Keep tracking across beat boundaries. Resetting to zero used to whip Hiro's
    // gaze to the road on each new attack, then whip it back up to Baymax.
    if (
      secondEntry === 'silhouette' ||
      secondEntry === 'overhead' ||
      secondEntry === 'rooftop'
    )
      return 1;
    if (secondEntry === 'tear-pass')
      return (
        0.7 * span(timeSeconds, 0.2, 0.45) * (1 - span(timeSeconds, 1.1, 1.6))
      );
    if (secondEntry === 'final') return 1;
    return 0;
  }
  /** Shake is noise, not random jitter; kicks are damped shoves; FOV punches on hits. */
  private applyImpulses(
    camera: PerspectiveCamera,
    seq: SequenceDirector,
    deltaSeconds: number,
  ) {
    if (reducedMotion) {
      camera.fov += seq.fovKick * 0.2;
      return;
    }
    this.shakeT += deltaSeconds * (7 + seq.shake * 4);
    const scaleFactor = seq.shake * seq.shake;
    const sampleNoise = (offset: number) =>
      Math.sin(this.shakeT * 0.72 + offset) * 0.68 +
      Math.sin(this.shakeT * 1.31 + offset * 2.1) * 0.32;
    camera.position.x += sampleNoise(0) * scaleFactor * 0.035 + seq.kick.x;
    camera.position.y += sampleNoise(3) * scaleFactor * 0.03 + seq.kick.y * 0.6;
    camera.position.z += seq.kick.z;
    this.target.x += sampleNoise(7) * scaleFactor * 0.065;
    this.target.y += sampleNoise(11) * scaleFactor * 0.055;
    camera.fov += seq.fovKick;
  }
  resetPointer() {
    this.pointer = { x: 0, y: 0 };
    this.holding = false;
    this.strafeInput = 0;
    this.zoomController.reset();
  }
  skipAwakening() {
    this.wakeTime = 12;
  }
}
