import gsap from 'gsap';
import { reducedMotion } from '../config/experience';
import { cinematicSignals } from '../effects/CinematicSignals';
import { cameraRig, type ShakeSource } from '../systems/CameraRig';
import type { TransitionType } from '../core/ExperienceStates';
import type { TransitionBeat, TransitionPlayer } from '../core/ExperienceFlow';

// Physical scene-to-scene transitions. Each one is four authored beats:
//   ANTICIPATION → ACTION (frame covered: scene swap happens here) → FOLLOW-THROUGH → SETTLE
// Drawn on one half-resolution 2D canvas that only renders while a transition plays,
// plus renderer/camera signals (exposure, instability, blur, FOV kick, shake).

/**
 * Screen-space motion state for one cover-transition particle.
 */
type TransitionParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  delay: number;
  tone: number;
};
/**
 * Canvas, timing and particle inputs supplied to a transition drawing function.
 */
type TransitionDrawContext = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  cover: number;
  time: number;
  beat: TransitionBeat;
  particles: TransitionParticle[];
};

/**
 * Timing, drawing and presentation policy for an authored cover effect.
 */
type TransitionSpec = {
  /** Seconds per beat. */
  beats: [
    anticipation: number,
    action: number,
    followThrough: number,
    settle: number,
  ];
  /** Cover reached at end of anticipation (it should only hint). */
  hint: number;
  particles?: number;
  draw(context: TransitionDrawContext): void;
  signals?(cover: number, beat: TransitionBeat): void;
  shake?: {
    source: ShakeSource;
    strength: number;
    at: 'action' | 'follow-through';
  };
};

const INK = '2,5,6';
const randomBetween = (startValue: number, endValue: number) =>
  startValue + Math.random() * (endValue - startValue);

const SPECS: Record<Exclude<TransitionType, 'CUT'>, TransitionSpec> = {
  // Asymmetric eyelid: two quick half-closures, then the full blink.
  BLINK: {
    beats: [0.45, 0.32, 0.38, 0.5],
    hint: 0.18,
    draw({ ctx: drawingContext, w: width, h: height, cover }) {
      const lid = Math.pow(cover, 1.6),
        cy = height * 0.52;
      drawingContext.fillStyle = `rgb(${INK})`;
      drawingContext.beginPath();
      drawingContext.moveTo(0, 0);
      drawingContext.lineTo(width, 0);
      drawingContext.lineTo(width, cy - (1 - lid) * height * 0.62);
      drawingContext.bezierCurveTo(
        width * 0.7,
        cy - (1 - lid) * height * 0.78,
        width * 0.3,
        cy - (1 - lid) * height * 0.7,
        0,
        cy - (1 - lid) * height * 0.58,
      );
      drawingContext.closePath();
      drawingContext.fill();
      drawingContext.beginPath();
      drawingContext.moveTo(0, height);
      drawingContext.lineTo(width, height);
      drawingContext.lineTo(width, cy + (1 - lid) * height * 0.56);
      drawingContext.bezierCurveTo(
        width * 0.68,
        cy + (1 - lid) * height * 0.7,
        width * 0.32,
        cy + (1 - lid) * height * 0.66,
        0,
        cy + (1 - lid) * height * 0.52,
      );
      drawingContext.closePath();
      drawingContext.fill();
    },
  },
  // Red system sweep: edge flicker, a scan line drops and drags a red-black field behind it.
  RED_SCAN: {
    beats: [0.5, 0.55, 0.5, 0.7],
    hint: 0.08,
    draw({ ctx: drawingContext, w: width, h: height, cover, beat }) {
      const yPosition = cover * height * 1.04;
      const field = drawingContext.createLinearGradient(
        0,
        yPosition - height * 0.35,
        0,
        yPosition,
      );
      field.addColorStop(0, 'rgba(18,2,3,.97)');
      field.addColorStop(1, 'rgba(70,6,8,.88)');
      drawingContext.fillStyle = field;
      drawingContext.fillRect(0, 0, width, yPosition);
      const glow = drawingContext.createLinearGradient(
        0,
        yPosition - 18,
        0,
        yPosition + 6,
      );
      glow.addColorStop(0, 'rgba(212,43,43,0)');
      glow.addColorStop(0.8, 'rgba(212,43,43,.55)');
      glow.addColorStop(1, 'rgba(255,120,110,.0)');
      drawingContext.fillStyle = glow;
      drawingContext.fillRect(0, yPosition - 18, width, 24);
      if (beat === 'anticipation') {
        drawingContext.fillStyle = `rgba(212,43,43,${0.06 + Math.random() * 0.05})`;
        drawingContext.fillRect(0, 0, width, height * 0.04);
        drawingContext.fillRect(0, height * 0.96, width, height * 0.04);
      }
    },
    signals(cover) {
      cinematicSignals.instability = cover * 0.004;
    },
  },
  // Concrete shards cross the lens and hide the cut, then tumble out.
  DEBRIS_OCCLUSION: {
    beats: [0.35, 0.5, 0.55, 0.5],
    hint: 0.05,
    particles: 26,
    draw({ ctx: drawingContext, w: width, h: height, cover, particles }) {
      for (const voice of particles) {
        const blendFactor = Math.max(
          0,
          Math.min(1, cover * 1.25 - voice.delay * 0.25),
        );
        if (blendFactor <= 0) continue;
        const xPosition = (voice.x + voice.vx * (1 - blendFactor)) * width,
          yPosition = (voice.y + voice.vy * (1 - blendFactor)) * height,
          scaleFactor =
            voice.size *
            9 *
            Math.max(width, height) *
            (0.4 + blendFactor * 0.9);
        drawingContext.save();
        drawingContext.translate(xPosition, yPosition);
        drawingContext.rotate(voice.spin * (1 - blendFactor) * 3);
        drawingContext.fillStyle = `rgba(${12 + voice.tone * 18},${14 + voice.tone * 18},${18 + voice.tone * 20},${0.92 * blendFactor + 0.08})`;
        drawingContext.beginPath();
        drawingContext.moveTo(-scaleFactor * 0.5, -scaleFactor * 0.3);
        drawingContext.lineTo(scaleFactor * 0.42, -scaleFactor * 0.48);
        drawingContext.lineTo(scaleFactor * 0.55, scaleFactor * 0.2);
        drawingContext.lineTo(-scaleFactor * 0.1, scaleFactor * 0.52);
        drawingContext.closePath();
        drawingContext.fill();
        drawingContext.restore();
      }
      if (cover > 0.82) {
        drawingContext.fillStyle = `rgba(${INK},${(cover - 0.82) / 0.18})`;
        drawingContext.fillRect(0, 0, width, height);
      }
    },
    shake: { source: 'impact', strength: 0.55, at: 'action' },
  },
  // Microbots gather at the frame edge, accelerate into the lens, then disperse.
  MICROBOT_SWARM: {
    beats: [0.6, 0.55, 0.6, 0.55],
    hint: 0.12,
    particles: 420,
    draw({ ctx: drawingContext, w: width, h: height, cover, particles, beat }) {
      const cx = width * 0.5,
        cy = height * 0.5,
        reach = Math.hypot(cx, cy);
      drawingContext.fillStyle = '#05080a';
      const dispersing = beat === 'follow-through' || beat === 'settle';
      for (const point of particles) {
        const angle = Math.atan2(point.vy, point.vx),
          base = (1.15 - point.delay * 0.7) * reach;
        let radius: number, size: number;
        if (dispersing) {
          radius = reach * (0.15 + (1 - cover) * 1.3) * (point.size * 18 + 0.4);
          size = point.size * width * (0.4 + cover * 1.2);
        } else {
          radius = base * (1 - Math.pow(cover, 1.7) * 0.92);
          size = point.size * width * (0.25 + Math.pow(cover, 2.4) * 2.6);
        }
        const xPosition =
            cx + Math.cos(angle + point.spin * (1 - cover)) * radius,
          yPosition =
            cy + Math.sin(angle + point.spin * (1 - cover)) * radius * 0.62;
        drawingContext.fillRect(
          xPosition - size * 0.5,
          yPosition - size * 0.5,
          size,
          size * 0.62,
        );
      }
      if (cover > 0.86) {
        drawingContext.fillStyle = `rgba(5,8,10,${(cover - 0.86) / 0.14})`;
        drawingContext.fillRect(0, 0, width, height);
      }
    },
  },
  // Space folds along horizontal seams; bands slip past one another.
  DIMENSION_FOLD: {
    beats: [0.5, 0.6, 0.55, 0.6],
    hint: 0.1,
    draw({ ctx: drawingContext, w: width2, h: height, cover }) {
      const bands = 9;
      for (let index = 0; index < bands; index++) {
        const yPosition = (index / bands) * height,
          bh = height / bands + 1,
          dir = index % 2 ? 1 : -1;
        const blendFactor = Math.min(
          1,
          Math.max(
            0,
            cover * 1.4 - (Math.abs(index - bands / 2) / bands) * 0.4,
          ),
        );
        const width = width2 * blendFactor,
          xPosition = dir > 0 ? 0 : width2 - width;
        drawingContext.fillStyle = `rgba(${INK},${0.4 + blendFactor * 0.6})`;
        drawingContext.fillRect(xPosition, yPosition, width, bh);
        drawingContext.fillStyle = `rgba(150,190,220,${blendFactor * (1 - blendFactor) * 0.5})`;
        drawingContext.fillRect(
          dir > 0 ? width - 2 : xPosition,
          yPosition,
          2,
          bh,
        );
      }
    },
    signals(cover) {
      cinematicSignals.instability = cover * 0.006;
      cinematicSignals.fov = -cover * 3;
    },
  },
  // The portal floods the sensor; the next world resolves out of white.
  PORTAL_OVEREXPOSURE: {
    beats: [0.7, 0.5, 0.9, 1.1],
    hint: 0.15,
    draw({ ctx: drawingContext, w: width, h: height, cover }) {
      const group = drawingContext.createRadialGradient(
        width * 0.5,
        height * 0.48,
        0,
        width * 0.5,
        height * 0.48,
        Math.hypot(width, height) * (0.25 + cover * 0.6),
      );
      group.addColorStop(0, `rgba(250,252,255,${Math.min(1, cover * 1.25)})`);
      group.addColorStop(1, `rgba(214,236,255,${cover * cover})`);
      drawingContext.fillStyle = group;
      drawingContext.fillRect(0, 0, width, height);
    },
    signals(cover) {
      cinematicSignals.exposure = cover * 1.6;
      cinematicSignals.blur = cover * 0.6;
    },
    shake: { source: 'portal', strength: 0.35, at: 'action' },
  },
  // Dense fog drifts across the lens; distance is lost, then returns.
  FOG_PASS: {
    beats: [0.7, 0.7, 0.7, 0.8],
    hint: 0.2,
    particles: 24,
    draw({ ctx: drawingContext, w: width, h: height, cover, particles, time }) {
      for (const voice of particles) {
        const xPosition =
            (((voice.x + 1.2 + time * voice.vx * 0.08) % 1.4) - 0.2) * width,
          yPosition = voice.y * height,
          radius = (0.12 + voice.size * 10) * width;
        const group = drawingContext.createRadialGradient(
          xPosition,
          yPosition,
          0,
          xPosition,
          yPosition,
          radius,
        );
        group.addColorStop(
          0,
          `rgba(${92 + voice.tone * 40},${112 + voice.tone * 40},${128 + voice.tone * 40},${Math.min(1, cover * 1.1)})`,
        );
        group.addColorStop(1, 'rgba(60,80,96,0)');
        drawingContext.fillStyle = group;
        drawingContext.fillRect(
          xPosition - radius,
          yPosition - radius,
          radius * 2,
          radius * 2,
        );
      }
      if (cover > 0.7) {
        drawingContext.fillStyle = `rgba(70,88,102,${(cover - 0.7) / 0.3})`;
        drawingContext.fillRect(0, 0, width, height);
      }
    },
    signals(cover) {
      cinematicSignals.blur = cover * 0.8;
    },
  },
  // Space collapses to a point with a forward pull, then re-expands.
  DEPTH_COLLAPSE: {
    beats: [0.55, 0.45, 0.5, 0.6],
    hint: 0.1,
    draw({ ctx: drawingContext, w: width, h: height, cover }) {
      const radius =
        Math.hypot(width, height) * 0.6 * (1 - Math.pow(cover, 0.8));
      const group = drawingContext.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.max(0, radius * 0.55),
        width * 0.5,
        height * 0.5,
        Math.max(1, radius),
      );
      group.addColorStop(0, `rgba(${INK},0)`);
      group.addColorStop(1, `rgba(${INK},1)`);
      drawingContext.fillStyle = group;
      drawingContext.fillRect(0, 0, width, height);
      if (radius < 2) {
        drawingContext.fillStyle = `rgb(${INK})`;
        drawingContext.fillRect(0, 0, width, height);
      }
    },
    signals(cover, beat) {
      cinematicSignals.fov = (beat === 'anticipation' ? 2 : -9) * cover;
      cinematicSignals.blur = cover * 0.5;
    },
    shake: { source: 'structure', strength: 0.4, at: 'action' },
  },
  // Something passes right in front of the lens (pillar, Baymax's body, a wall).
  CAMERA_OCCLUSION: {
    beats: [0.3, 0.42, 0.42, 0.4],
    hint: 0.04,
    draw({ ctx: drawingContext, w: width2, h: height, cover, beat }) {
      const travel =
        beat === 'follow-through' || beat === 'settle'
          ? 1 + (1 - cover)
          : cover;
      const center = (-0.4 + travel * 0.95) * width2,
        width = width2 * 0.9;
      const group = drawingContext.createLinearGradient(
        center - width / 2,
        0,
        center + width / 2,
        0,
      );
      group.addColorStop(0, `rgba(${INK},0)`);
      group.addColorStop(0.25, `rgba(${INK},1)`);
      group.addColorStop(0.75, `rgba(${INK},1)`);
      group.addColorStop(1, `rgba(${INK},0)`);
      drawingContext.fillStyle = group;
      drawingContext.fillRect(center - width / 2, 0, width, height);
    },
    shake: { source: 'structure', strength: 0.2, at: 'follow-through' },
  },
};

export const TRANSITION_TYPES = Object.keys(SPECS) as Exclude<
  TransitionType,
  'CUT'
>[];

export class CinematicTransitions implements TransitionPlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private timeline: gsap.core.Timeline | null = null;
  private pending: (() => void) | null = null;
  private last: TransitionType | null = null;

  constructor(host: HTMLElement = document.body) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'transition-veil';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
  }

  /** Same transition twice in a row reads as a loop; dev builds warn about it. */
  play(
    type: TransitionType,
    hooks: {
      covered: () => Promise<void> | void;
      beat: (beat: TransitionBeat) => void;
    },
  ): Promise<void> {
    this.cancel();
    if (type === 'CUT')
      return Promise.resolve(hooks.covered()).then(() => undefined);
    if (import.meta.env.DEV && type === this.last)
      console.info(`[lattice] ${type} used twice in a row`);
    this.last = type;
    const spec = SPECS[type];
    const scale = reducedMotion ? 0.55 : 1;
    const [firstValue, secondValue, componentValue, depth] = spec.beats.map(
      (xPosition) => xPosition * scale,
    );
    const particles = makeParticles(spec.particles ?? 0);
    const state = { cover: 0, time: 0 };
    let beat: TransitionBeat = 'anticipation';
    this.resize();
    this.canvas.style.visibility = 'visible';
    const render = () => {
      const { width: width, height: height } = this.canvas;
      this.ctx.clearRect(0, 0, width, height);
      if (state.cover > 0.001)
        spec.draw({
          ctx: this.ctx,
          w: width,
          h: height,
          cover: state.cover,
          time: state.time,
          beat,
          particles,
        });
      spec.signals?.(state.cover, beat);
    };
    const setBeat = (next: TransitionBeat) => {
      beat = next;
      hooks.beat(next);
      if (spec.shake && spec.shake.at === next)
        cameraRig.shake(spec.shake.source, spec.shake.strength);
    };
    return new Promise<void>((resolve) => {
      const done = () => {
        this.pending = null;
        this.clear();
        resolve();
      };
      this.pending = done;
      const tl = gsap.timeline({ onUpdate: render, onComplete: done });
      tl.to(
        state,
        {
          time: firstValue + secondValue + componentValue + depth,
          duration: firstValue + secondValue + componentValue + depth,
          ease: 'none',
        },
        0,
      )
        .to(
          state,
          { cover: spec.hint, duration: firstValue, ease: 'sine.inOut' },
          0,
        )
        .call(() => setBeat('action'), [], firstValue)
        .to(
          state,
          { cover: 1, duration: secondValue, ease: 'power3.in' },
          firstValue,
        )
        .call(
          () => {
            // Hold the covered frame until the swap finishes (it may build a scene).
            tl.pause();
            Promise.resolve()
              .then(hooks.covered)
              .catch((error) => {
                if (import.meta.env.DEV)
                  console.warn('[lattice] scene swap failed', error);
              })
              .finally(() => {
                if (this.timeline === tl) {
                  setBeat('follow-through');
                  tl.resume();
                }
              });
          },
          [],
          firstValue + secondValue,
        )
        .to(
          state,
          { cover: 0.25, duration: componentValue, ease: 'power2.out' },
          firstValue + secondValue + 0.001,
        )
        .call(
          () => setBeat('settle'),
          [],
          firstValue + secondValue + componentValue,
        )
        .to(
          state,
          { cover: 0, duration: depth, ease: 'sine.out' },
          firstValue + secondValue + componentValue,
        );
      this.timeline = tl;
    });
  }

  cancel() {
    this.timeline?.kill();
    this.timeline = null;
    const pending = this.pending;
    this.pending = null;
    this.clear();
    pending?.();
  }

  /** Dev: draw one frozen frame of a transition (cover 0..1) for look-dev. */
  still(
    type: Exclude<TransitionType, 'CUT'>,
    cover: number,
    beat: TransitionBeat = 'action',
  ) {
    this.cancel();
    this.resize();
    const spec = SPECS[type],
      { width: width, height: height } = this.canvas;
    this.canvas.style.visibility = 'visible';
    spec.draw({
      ctx: this.ctx,
      w: width,
      h: height,
      cover,
      time: 1,
      beat,
      particles: makeParticles(spec.particles ?? 0),
    });
  }

  dispose() {
    this.cancel();
    this.canvas.remove();
  }

  private clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.visibility = 'hidden';
    cinematicSignals.exposure = 0;
    cinematicSignals.instability = 0;
    cinematicSignals.blur = 0;
    cinematicSignals.fov = 0;
  }
  private resize() {
    // Half resolution: every effect here is soft or dark, the saving is free.
    const width = Math.ceil(innerWidth * 0.5),
      height = Math.ceil(innerHeight * 0.5);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}

function makeParticles(count: number): TransitionParticle[] {
  const list: TransitionParticle[] = [];
  for (let index = 0; index < count; index++) {
    const angle = randomBetween(0, Math.PI * 2);
    list.push({
      x: randomBetween(-0.1, 1.1),
      y: randomBetween(-0.1, 1.1),
      vx: Math.cos(angle) * randomBetween(0.6, 1.4),
      vy: Math.sin(angle) * randomBetween(0.6, 1.4),
      size: randomBetween(0.004, 0.03),
      spin: randomBetween(-1, 1),
      delay: Math.random(),
      tone: Math.random(),
    });
  }
  return list;
}
