import {
  CanvasTexture,
  Color,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { Phase } from '../state/SceneStateManager';
import { useSceneState } from '../state/SceneStateManager';
import type { SequenceDirector } from '../systems/SequenceDirector';
import type { BaymaxController } from './BaymaxController';
import { CHIP_SEAT_Z, createRedChip } from './RedChip.js';
import { LATER_BAYMAX_SCALE } from './LaterBaymax';

const span = (inputValue: number, startValue: number, endValue: number) =>
  MathUtils.smoothstep(inputValue, startValue, endValue);
/** The canonical dock-space seat, in world units at Baymax's scale. */
const SEAT = CHIP_SEAT_Z * LATER_BAYMAX_SCALE;
/** Ground rest: beside Baymax's open hand, catching the only warm light on the street. */
const GROUND = new Vector3(4.02, -0.138, -10.48);
/** Camera-space poses: inspection sits centred and close; the hand rests low right. */
const INSPECT = new Vector3(0.03, -0.045, -0.8),
  HAND = new Vector3(0.2, -0.16, -0.82);
const MAGNET = 0.17;

/**
 * Owns the chip from the asphalt to the socket. Movement is always damped toward an authored
 * target so the object has weight; guidance near the dock is magnetic, never a snap.
 */
export class ChipController {
  readonly group = new Group();
  private chip: Group;
  private glow: MeshBasicMaterial;
  private body: { emissiveIntensity: number };
  private light = new PointLight('#ff3a26', 0.6, 2.2, 1.7);
  private contact: Mesh;
  private phase: Phase = 'loading';
  private t = 0;
  private pos = new Vector3().copy(GROUND);
  private quat = new Quaternion();
  private targetPos = new Vector3();
  private targetQuat = new Quaternion();
  private groundQuat = new Quaternion();
  private faceQuat = new Quaternion();
  private tmpQ = new Quaternion();
  private v = new Vector3();
  private v2 = new Vector3();
  private dockPos = new Vector3();
  private dockNormal = new Vector3();
  private ray = new Raycaster();
  private plane = new Plane();
  private hit = new Vector3();
  private guided = new Vector3();
  private aligned = 0;
  private lastPointer = new Vector2(9, 9);
  private pointerActive = false;
  private idle = 0;
  constructor() {
    const { chip, glow, body } = createRedChip();
    this.chip = chip;
    this.glow = glow;
    this.body = body;
    // One canonical card: the same world size as the dock it seats in (Baymax's shell scale) and as
    // the card Hiro later pulls and plays into the reader. At 1:1 it overran its own keyed frame.
    chip.scale.setScalar(LATER_BAYMAX_SCALE);
    this.group.add(chip);
    this.group.name = 'Chip';
    this.groundQuat
      .setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
      .multiply(this.tmpQ.setFromAxisAngle(new Vector3(0, 0, 1), -0.42));
    this.quat.copy(this.groundQuat);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const drawingContext = canvas.getContext('2d')!;
    const group = drawingContext.createRadialGradient(32, 32, 2, 32, 32, 32);
    group.addColorStop(0, 'rgba(0,0,0,.8)');
    group.addColorStop(1, 'rgba(0,0,0,0)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(0, 0, 64, 64);
    this.contact = new Mesh(
      new PlaneGeometry(0.36, 0.42),
      new MeshBasicMaterial({
        map: new CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      }),
    );
    this.contact.rotation.set(-Math.PI / 2, 0, -0.42);
    this.contact.position.set(GROUND.x, -0.146, GROUND.z);
    this.group.add(this.contact);
    this.group.add(this.light);
  }

  update(
    time: number,
    deltaSeconds: number,
    reduced: boolean,
    phase: Phase,
    seq: SequenceDirector,
    camera: PerspectiveCamera,
    baymax: BaymaxController | null,
  ) {
    if (phase !== this.phase) {
      this.phase = phase;
      this.t = 0;
      this.aligned = 0;
      this.idle = 0;
      if (phase === 'socket-ready') {
        this.pointerActive = false;
        this.lastPointer.copy(seq.pointer);
        this.guided.copy(this.pos);
      }
    }
    this.t += deltaSeconds;
    const timeSeconds = this.t;
    const pulse = reduced
      ? 0.5
      : Math.pow(Math.max(0, Math.sin(time * 0.63)), 12);
    let lerp = 8,
      light = 0.55 + pulse * 0.45,
      glow = 0.75 + pulse * 0.25,
      lift = 0;
    const camQ = camera.quaternion,
      toWorld = (local: Vector3, out: Vector3) =>
        out.copy(local).applyQuaternion(camQ).add(camera.position);
    this.faceQuat.copy(camQ);
    this.baymax = baymax;
    if (baymax) {
      baymax.chestFrame(this.v2, this.dockNormal);
      this.dockPos.copy(baymax.dockWorld());
    }
    const onGround = [
      'loading',
      'awakening',
      'portal-sighted',
      'call-baymax',
      'to-portal',
      'through-portal',
      'sf-arrival',
      'sf-turnback',
      'back-decision',
      'back-through',
      'reentry',
      'approaching',
      'discovery',
      'inspected',
      'chip-focus',
    ].includes(phase);
    if (onGround) {
      this.targetPos.copy(GROUND);
      this.targetQuat.copy(this.groundQuat);
      if (phase === 'chip-focus') {
        // Resistance: the chip lifts a few millimetres and shivers while the hold builds.
        lift = seq.holdProgress;
        this.targetPos.y +=
          lift * 0.035 + (reduced ? 0 : Math.sin(time * 38) * 0.0016 * lift);
        light += 0.35 + lift * 0.8;
        glow = 1;
      }
      lerp = 14;
    } else if (phase === 'chip-reaching') {
      // Unstick, rise in an arc, turn the face toward Hiro, settle with a little overshoot.
      const progress = span(timeSeconds, 0.25, 1.75),
        arc = Math.sin(progress * Math.PI) * 0.18;
      toWorld(INSPECT, this.v);
      this.targetPos.lerpVectors(GROUND, this.v, progress);
      this.targetPos.y += arc + (timeSeconds < 0.25 ? timeSeconds * 0.06 : 0);
      this.targetQuat.slerpQuaternions(
        this.groundQuat,
        this.faceQuat,
        span(timeSeconds, 0.35, 1.6),
      );
      lerp = timeSeconds < 0.3 ? 3 : 10;
      light = 1.1;
      glow = 1;
    } else if (phase === 'chip-held') {
      // Inspection beat: a slow turn shows face, edge and contacts. Then it drops to the hand.
      const down = span(timeSeconds, 1.65, 2.6);
      toWorld(this.v2.lerpVectors(INSPECT, HAND, down), this.targetPos);
      const turn =
          (1 - down) * (reduced ? 0 : Math.sin(timeSeconds * 1.25) * 0.38),
        tilt =
          (1 - down) *
          (reduced ? 0 : Math.sin(timeSeconds * 0.8) * 0.12 + 0.08);
      this.targetQuat
        .copy(this.faceQuat)
        .multiply(this.tmpQ.setFromEuler(this.eul(tilt, turn, 0.12 * down)));
      lerp = 7;
      light = 1.05;
      glow = 1;
    } else if (phase === 'chest-focus' || phase === 'panel-opening') {
      toWorld(HAND, this.targetPos);
      this.targetPos.y += reduced ? 0 : Math.sin(time * 1.2) * 0.004;
      this.targetQuat
        .copy(this.faceQuat)
        .multiply(this.tmpQ.setFromEuler(this.eul(0.08, -0.18, 0.18)));
      lerp = 12;
      light = 0.95;
      glow = 0.9;
    } else if (phase === 'socket-ready' && baymax) {
      this.guide(deltaSeconds, seq, camera, reduced);
      lerp = 9;
      light = 0.9 + this.aligned * 0.9;
      glow = 0.9 + this.aligned * 0.1;
    } else if (phase === 'inserting' && baymax) {
      // Orient, seat, press. The click lands at 1.05s.
      const press = span(timeSeconds, 0.5, 1.05);
      this.dockAxes(this.targetQuat);
      this.targetPos
        .copy(this.dockPos)
        .addScaledVector(this.dockNormal, MathUtils.lerp(0.07, SEAT, press));
      lerp = timeSeconds < 0.5 ? 10 : 22;
      light = 1.2 - press * 0.6;
      glow = 1;
    } else if (baymax) {
      this.dockAxes(this.targetQuat);
      this.targetPos.copy(this.dockPos).addScaledVector(this.dockNormal, SEAT);
      lerp = 30;
      light =
        phase === 'silence'
          ? 0.25 + (timeSeconds > 1.25 && timeSeconds < 1.4 ? 0.6 : 0)
          : 0;
      glow = phase === 'silence' || phase === 'booting' ? 0.65 : 0;
    }
    const blendFactor = 1 - Math.exp(-deltaSeconds * lerp);
    this.pos.lerp(this.targetPos, blendFactor);
    this.quat.slerp(this.targetQuat, blendFactor);
    this.chip.position.copy(this.pos);
    this.chip.quaternion.copy(this.quat);
    this.chip.visible = ![
      'diagnostic',
      'corrupting',
      'threat',
      'ignition',
      'chase',
      'fracture',
      'pulled',
      'handoff',
    ].includes(phase);
    this.glow.color.copy(this.glowBase).multiplyScalar(0.15 + glow * 0.85);
    this.body.emissiveIntensity = 0.25 + glow * 0.35;
    // Light hugs the chip face so the red falls on the asphalt, then on Baymax's white shell.
    // On the ground the light pools on asphalt; in hand it sits back so the face never clips.
    // Near the dock the red stays outside the bay: the internals keep their own cool light.
    const docking =
      phase === 'socket-ready' ||
      phase === 'inserting' ||
      phase === 'silence' ||
      phase === 'booting';
    this.v
      .set(0, -0.05, onGround ? 0.06 : docking ? 0.35 : -0.3)
      .applyQuaternion(this.quat);
    this.light.position.copy(this.pos).add(this.v);
    if (onGround) this.light.position.y = 0.17;
    this.light.intensity = this.chip.visible
      ? light * (onGround ? 1 : docking ? 0.12 : 0.5)
      : 0;
    const contactFade = onGround
      ? 1 - lift * 0.6
      : Math.max(0, 1 - timeSeconds * 3) * (phase === 'chip-reaching' ? 1 : 0);
    (this.contact.material as MeshBasicMaterial).opacity = 0.7 * contactFade;
  }
  private euler = new Euler();
  private eul(xPosition: number, yPosition: number, zPosition: number) {
    return this.euler.set(xPosition, yPosition, zPosition);
  }
  private baymax: BaymaxController | null = null;
  /** The chip's frame matches the dock's by construction: face +Z, contacts -Y, chamfer top right. */
  private dockAxes(out: Quaternion) {
    if (this.baymax) this.baymax.dockQuaternion(out);
  }
  private guide(
    deltaSeconds: number,
    seq: SequenceDirector,
    camera: PerspectiveCamera,
    reduced: boolean,
  ) {
    const front = this.v
      .copy(this.dockPos)
      .addScaledVector(this.dockNormal, 0.07);
    if (seq.pointer.distanceToSquared(this.lastPointer) > 0.0004) {
      this.pointerActive = true;
      this.idle = 0;
      this.lastPointer.copy(seq.pointer);
    } else this.idle += deltaSeconds;
    // Pointer drives the chip across a plane just above the chest, clamped to the chest's reach.
    this.plane.setFromNormalAndCoplanarPoint(this.dockNormal, front);
    this.ray.setFromCamera(seq.pointer, camera);
    // The guided point persists: the pointer steers it, the assist draws it in, nothing resets it.
    if (
      this.pointerActive &&
      this.ray.ray.intersectPlane(this.plane, this.hit)
    ) {
      this.hit.sub(front).clampLength(0, 0.55).add(front);
      this.guided.lerp(this.hit, 1 - Math.exp(-deltaSeconds * 14));
    }
    // Keyboard (hold E / Space) and long idleness both let the dock draw the chip in.
    const assist = seq.keyHold ? 1 : span(this.idle, 7, 11) * 0.6;
    if (assist > 0)
      this.guided.lerp(front, 1 - Math.exp(-deltaSeconds * 2.2 * assist));
    const depth = this.guided.distanceTo(front),
      magnet = Math.pow(1 - Math.min(1, depth / MAGNET), 2);
    this.targetPos.copy(this.guided).lerp(front, magnet * 0.85);
    const free = this.freeQ
      .copy(camera.quaternion)
      .multiply(
        this.tmpQ.setFromEuler(
          this.eul(0.12, -0.35 * (1 - magnet), 0.25 * (1 - magnet)),
        ),
      );
    this.dockAxes(this.targetQuat);
    this.targetQuat.slerp(free, 1 - magnet);
    const alignment = MathUtils.smoothstep(1 - depth / MAGNET, 0.1, 0.92);
    seq.alignment = MathUtils.damp(seq.alignment, alignment, 8, deltaSeconds);
    this.aligned = seq.alignment;
    // Commit: seated long enough, or a deliberate press once it is close.
    this.holdAligned =
      seq.alignment > 0.93 ? this.holdAligned + deltaSeconds : 0;
    if (
      this.holdAligned > (reduced ? 0.1 : 0.32) ||
      (seq.pointerDown && seq.alignment > 0.6)
    ) {
      this.holdAligned = 0;
      useSceneState.getState().interact();
    }
  }
  private holdAligned = 0;
  private freeQ = new Quaternion();
  private glowBase = new Color('#ff3a2c');
}
