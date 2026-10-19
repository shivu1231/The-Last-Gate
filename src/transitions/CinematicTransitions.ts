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

type Particle = { x: number; y: number; vx: number; vy: number; size: number; spin: number; delay: number; tone: number };
type DrawContext = { ctx: CanvasRenderingContext2D; w: number; h: number; cover: number; time: number; beat: TransitionBeat; particles: Particle[] };

type Spec = {
  /** Seconds per beat. */
  beats: [anticipation: number, action: number, followThrough: number, settle: number];
  /** Cover reached at end of anticipation (it should only hint). */
  hint: number;
  particles?: number;
  draw(c: DrawContext): void;
  signals?(cover: number, beat: TransitionBeat): void;
  shake?: { source: ShakeSource; strength: number; at: 'action' | 'follow-through' };
};

const INK = '2,5,6';
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const SPECS: Record<Exclude<TransitionType, 'CUT'>, Spec> = {
  // Asymmetric eyelid: two quick half-closures, then the full blink.
  BLINK: {
    beats: [.45, .32, .38, .5], hint: .18,
    draw({ ctx, w, h, cover }) {
      const lid = Math.pow(cover, 1.6), cy = h * .52;
      ctx.fillStyle = `rgb(${INK})`;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, cy - (1 - lid) * h * .62);
      ctx.bezierCurveTo(w * .7, cy - (1 - lid) * h * .78, w * .3, cy - (1 - lid) * h * .7, 0, cy - (1 - lid) * h * .58);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, cy + (1 - lid) * h * .56);
      ctx.bezierCurveTo(w * .68, cy + (1 - lid) * h * .7, w * .32, cy + (1 - lid) * h * .66, 0, cy + (1 - lid) * h * .52);
      ctx.closePath(); ctx.fill();
    },
  },
  // Red system sweep: edge flicker, a scan line drops and drags a red-black field behind it.
  RED_SCAN: {
    beats: [.5, .55, .5, .7], hint: .08,
    draw({ ctx, w, h, cover, beat }) {
      const y = cover * h * 1.04;
      const field = ctx.createLinearGradient(0, y - h * .35, 0, y);
      field.addColorStop(0, 'rgba(18,2,3,.97)'); field.addColorStop(1, 'rgba(70,6,8,.88)');
      ctx.fillStyle = field; ctx.fillRect(0, 0, w, y);
      const glow = ctx.createLinearGradient(0, y - 18, 0, y + 6);
      glow.addColorStop(0, 'rgba(212,43,43,0)'); glow.addColorStop(.8, 'rgba(212,43,43,.55)'); glow.addColorStop(1, 'rgba(255,120,110,.0)');
      ctx.fillStyle = glow; ctx.fillRect(0, y - 18, w, 24);
      if (beat === 'anticipation') { ctx.fillStyle = `rgba(212,43,43,${.06 + Math.random() * .05})`; ctx.fillRect(0, 0, w, h * .04); ctx.fillRect(0, h * .96, w, h * .04); }
    },
    signals(cover) { cinematicSignals.instability = cover * .004; },
  },
  // Concrete shards cross the lens and hide the cut, then tumble out.
  DEBRIS_OCCLUSION: {
    beats: [.35, .5, .55, .5], hint: .05, particles: 26,
    draw({ ctx, w, h, cover, particles }) {
      for (const p of particles) {
        const k = Math.max(0, Math.min(1, cover * 1.25 - p.delay * .25));
        if (k <= 0) continue;
        const x = (p.x + p.vx * (1 - k)) * w, y = (p.y + p.vy * (1 - k)) * h, s = p.size * 9 * Math.max(w, h) * (.4 + k * .9);
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.spin * (1 - k) * 3);
        ctx.fillStyle = `rgba(${12 + p.tone * 18},${14 + p.tone * 18},${18 + p.tone * 20},${.92 * k + .08})`;
        ctx.beginPath(); ctx.moveTo(-s * .5, -s * .3); ctx.lineTo(s * .42, -s * .48); ctx.lineTo(s * .55, s * .2); ctx.lineTo(-s * .1, s * .52); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (cover > .82) { ctx.fillStyle = `rgba(${INK},${(cover - .82) / .18})`; ctx.fillRect(0, 0, w, h); }
    },
    shake: { source: 'impact', strength: .55, at: 'action' },
  },
  // Microbots gather at the frame edge, accelerate into the lens, then disperse.
  MICROBOT_SWARM: {
    beats: [.6, .55, .6, .55], hint: .12, particles: 420,
    draw({ ctx, w, h, cover, particles, beat }) {
      const cx = w * .5, cy = h * .5, reach = Math.hypot(cx, cy);
      ctx.fillStyle = '#05080a';
      const dispersing = beat === 'follow-through' || beat === 'settle';
      for (const p of particles) {
        const angle = Math.atan2(p.vy, p.vx), base = (1.15 - p.delay * .7) * reach;
        let r: number, size: number;
        if (dispersing) { r = reach * (.15 + (1 - cover) * 1.3) * (p.size * 18 + .4); size = p.size * w * (.4 + cover * 1.2); }
        else { r = base * (1 - Math.pow(cover, 1.7) * .92); size = p.size * w * (.25 + Math.pow(cover, 2.4) * 2.6); }
        const x = cx + Math.cos(angle + p.spin * (1 - cover)) * r, y = cy + Math.sin(angle + p.spin * (1 - cover)) * r * .62;
        ctx.fillRect(x - size * .5, y - size * .5, size, size * .62);
      }
      if (cover > .86) { ctx.fillStyle = `rgba(5,8,10,${(cover - .86) / .14})`; ctx.fillRect(0, 0, w, h); }
    },
  },
  // Space folds along horizontal seams; bands slip past one another.
  DIMENSION_FOLD: {
    beats: [.5, .6, .55, .6], hint: .1,
    draw({ ctx, w, h, cover }) {
      const bands = 9;
      for (let i = 0; i < bands; i++) {
        const y = (i / bands) * h, bh = h / bands + 1, dir = i % 2 ? 1 : -1;
        const k = Math.min(1, Math.max(0, cover * 1.4 - Math.abs(i - bands / 2) / bands * .4));
        const width = w * k, x = dir > 0 ? 0 : w - width;
        ctx.fillStyle = `rgba(${INK},${.4 + k * .6})`; ctx.fillRect(x, y, width, bh);
        ctx.fillStyle = `rgba(150,190,220,${k * (1 - k) * .5})`; ctx.fillRect(dir > 0 ? width - 2 : x, y, 2, bh);
      }
    },
    signals(cover) { cinematicSignals.instability = cover * .006; cinematicSignals.fov = -cover * 3; },
  },
  // The portal floods the sensor; the next world resolves out of white.
  PORTAL_OVEREXPOSURE: {
    beats: [.7, .5, .9, 1.1], hint: .15,
    draw({ ctx, w, h, cover }) {
      const g = ctx.createRadialGradient(w * .5, h * .48, 0, w * .5, h * .48, Math.hypot(w, h) * (.25 + cover * .6));
      g.addColorStop(0, `rgba(250,252,255,${Math.min(1, cover * 1.25)})`);
      g.addColorStop(1, `rgba(214,236,255,${cover * cover})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
    signals(cover) { cinematicSignals.exposure = cover * 1.6; cinematicSignals.blur = cover * .6; },
    shake: { source: 'portal', strength: .35, at: 'action' },
  },
  // Dense fog drifts across the lens; distance is lost, then returns.
  FOG_PASS: {
    beats: [.7, .7, .7, .8], hint: .2, particles: 24,
    draw({ ctx, w, h, cover, particles, time }) {
      for (const p of particles) {
        const x = ((p.x + 1.2 + time * p.vx * .08) % 1.4 - .2) * w, y = p.y * h, r = (.12 + p.size * 10) * w;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${92 + p.tone * 40},${112 + p.tone * 40},${128 + p.tone * 40},${Math.min(1, cover * 1.1)})`); g.addColorStop(1, 'rgba(60,80,96,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      if (cover > .7) { ctx.fillStyle = `rgba(70,88,102,${(cover - .7) / .3})`; ctx.fillRect(0, 0, w, h); }
    },
    signals(cover) { cinematicSignals.blur = cover * .8; },
  },
  // Space collapses to a point with a forward pull, then re-expands.
  DEPTH_COLLAPSE: {
    beats: [.55, .45, .5, .6], hint: .1,
    draw({ ctx, w, h, cover }) {
      const r = Math.hypot(w, h) * .6 * (1 - Math.pow(cover, .8));
      const g = ctx.createRadialGradient(w * .5, h * .5, Math.max(0, r * .55), w * .5, h * .5, Math.max(1, r));
      g.addColorStop(0, `rgba(${INK},0)`); g.addColorStop(1, `rgba(${INK},1)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (r < 2) { ctx.fillStyle = `rgb(${INK})`; ctx.fillRect(0, 0, w, h); }
    },
    signals(cover, beat) { cinematicSignals.fov = (beat === 'anticipation' ? 2 : -9) * cover; cinematicSignals.blur = cover * .5; },
    shake: { source: 'structure', strength: .4, at: 'action' },
  },
  // Something passes right in front of the lens (pillar, Baymax's body, a wall).
  CAMERA_OCCLUSION: {
    beats: [.3, .42, .42, .4], hint: .04,
    draw({ ctx, w, h, cover, beat }) {
      const travel = beat === 'follow-through' || beat === 'settle' ? 1 + (1 - cover) : cover;
      const center = (-0.4 + travel * .95) * w, width = w * .9;
      const g = ctx.createLinearGradient(center - width / 2, 0, center + width / 2, 0);
      g.addColorStop(0, `rgba(${INK},0)`); g.addColorStop(.25, `rgba(${INK},1)`); g.addColorStop(.75, `rgba(${INK},1)`); g.addColorStop(1, `rgba(${INK},0)`);
      ctx.fillStyle = g; ctx.fillRect(center - width / 2, 0, width, h);
    },
    shake: { source: 'structure', strength: .2, at: 'follow-through' },
  },
};

export const TRANSITION_TYPES = Object.keys(SPECS) as Exclude<TransitionType, 'CUT'>[];

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
  play(type: TransitionType, hooks: { covered: () => Promise<void> | void; beat: (beat: TransitionBeat) => void }): Promise<void> {
    this.cancel();
    if (type === 'CUT') return Promise.resolve(hooks.covered()).then(() => undefined);
    if (import.meta.env.DEV && type === this.last) console.info(`[lattice] ${type} used twice in a row`);
    this.last = type;
    const spec = SPECS[type];
    const scale = reducedMotion ? .55 : 1;
    const [a, b, c, d] = spec.beats.map(x => x * scale);
    const particles = makeParticles(spec.particles ?? 0);
    const state = { cover: 0, time: 0 };
    let beat: TransitionBeat = 'anticipation';
    this.resize();
    this.canvas.style.visibility = 'visible';
    const render = () => {
      const { width: w, height: h } = this.canvas;
      this.ctx.clearRect(0, 0, w, h);
      if (state.cover > .001) spec.draw({ ctx: this.ctx, w, h, cover: state.cover, time: state.time, beat, particles });
      spec.signals?.(state.cover, beat);
    };
    const setBeat = (next: TransitionBeat) => {
      beat = next; hooks.beat(next);
      if (spec.shake && spec.shake.at === next) cameraRig.shake(spec.shake.source, spec.shake.strength);
    };
    return new Promise<void>(resolve => {
      const done = () => { this.pending = null; this.clear(); resolve(); };
      this.pending = done;
      const tl = gsap.timeline({ onUpdate: render, onComplete: done });
      tl.to(state, { time: a + b + c + d, duration: a + b + c + d, ease: 'none' }, 0)
        .to(state, { cover: spec.hint, duration: a, ease: 'sine.inOut' }, 0)
        .call(() => setBeat('action'), [], a)
        .to(state, { cover: 1, duration: b, ease: 'power3.in' }, a)
        .call(() => {
          // Hold the covered frame until the swap finishes (it may build a scene).
          tl.pause();
          Promise.resolve().then(hooks.covered).catch(error => { if (import.meta.env.DEV) console.warn('[lattice] scene swap failed', error); })
            .finally(() => { if (this.timeline === tl) { setBeat('follow-through'); tl.resume(); } });
        }, [], a + b)
        .to(state, { cover: .25, duration: c, ease: 'power2.out' }, a + b + .001)
        .call(() => setBeat('settle'), [], a + b + c)
        .to(state, { cover: 0, duration: d, ease: 'sine.out' }, a + b + c);
      this.timeline = tl;
    });
  }

  cancel() {
    this.timeline?.kill(); this.timeline = null;
    const pending = this.pending; this.pending = null;
    this.clear();
    pending?.();
  }

  /** Dev: draw one frozen frame of a transition (cover 0..1) for look-dev. */
  still(type: Exclude<TransitionType, 'CUT'>, cover: number, beat: TransitionBeat = 'action') {
    this.cancel(); this.resize();
    const spec = SPECS[type], { width: w, height: h } = this.canvas;
    this.canvas.style.visibility = 'visible';
    spec.draw({ ctx: this.ctx, w, h, cover, time: 1, beat, particles: makeParticles(spec.particles ?? 0) });
  }

  dispose() { this.cancel(); this.canvas.remove(); }

  private clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.visibility = 'hidden';
    cinematicSignals.exposure = 0; cinematicSignals.instability = 0; cinematicSignals.blur = 0; cinematicSignals.fov = 0;
  }
  private resize() {
    // Half resolution: every effect here is soft or dark, the saving is free.
    const w = Math.ceil(innerWidth * .5), h = Math.ceil(innerHeight * .5);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
}

function makeParticles(count: number): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    list.push({ x: rand(-.1, 1.1), y: rand(-.1, 1.1), vx: Math.cos(angle) * rand(.6, 1.4), vy: Math.sin(angle) * rand(.6, 1.4), size: rand(.004, .03), spin: rand(-1, 1), delay: Math.random(), tone: Math.random() });
  }
  return list;
}
