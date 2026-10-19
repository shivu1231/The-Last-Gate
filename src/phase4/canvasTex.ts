import * as T from 'three';

/** Small canvas-texture toolkit for Bay 6: every surface is painted in code, nothing is loaded. */

export type Rand = () => number;
export function seeded(seed: number): Rand { return () => { seed = (seed * 1664525 + 1013904223) >>>0; return seed / 4294967296; }; }

export function paint(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Fine grain: thousands of light and dark flecks so no surface reads as flat colour. */
export function grain(x: CanvasRenderingContext2D, w: number, h: number, r: Rand, count: number, strength = .18) {
  for (let i = 0; i < count; i++) {
    const v = r() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${r() * strength})`;
    x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Soft dark patches: grime, oil, handling marks. */
export function grime(x: CanvasRenderingContext2D, w: number, h: number, r: Rand, count: number, color = '20,16,12', alpha = .22) {
  for (let i = 0; i < count; i++) {
    const cx = r() * w, cy = r() * h, rad = 8 + r() * Math.max(w, h) * .18;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${color},${alpha * (.4 + r() * .6)})`); g.addColorStop(1, `rgba(${color},0)`);
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}

export function scratches(x: CanvasRenderingContext2D, w: number, h: number, r: Rand, count: number, color = '235,232,224', alpha = .45) {
  x.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const sx = r() * w, sy = r() * h, a = r() * Math.PI, len = 6 + r() * w * .18;
    x.strokeStyle = `rgba(${color},${alpha * r()})`; x.lineWidth = .6 + r() * 1.4;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * len * .5 + (r() - .5) * 6, sy + Math.sin(a) * len * .5 + (r() - .5) * 6, sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
}

/**
 * Chipped paint along the texture border. Box faces map the whole texture, so the border lands on
 * the object's edges: that's where hands, tools and knocks wear paint back to bare metal.
 */
export function edgeWear(x: CanvasRenderingContext2D, w: number, h: number, r: Rand, metal = '#d6d3cb', depth = 22, density = 1) {
  const n = Math.round((w + h) * 1.1 * density);
  for (let i = 0; i < n; i++) {
    const side = Math.floor(r() * 4), t = r(), d = Math.pow(r(), 2.4) * depth, s = 1 + r() * 5 * (1 - d / depth);
    const px = side === 0 ? t * w : side === 1 ? t * w : side === 2 ? d : w - d;
    const py = side === 0 ? d : side === 1 ? h - d : t * h;
    x.fillStyle = metal; x.globalAlpha = .55 + r() * .45;
    x.beginPath(); x.ellipse(px, py, s * (1 + r()), s, r() * Math.PI, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(15,14,12,.55)'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
}

export function rust(x: CanvasRenderingContext2D, w: number, h: number, r: Rand, count: number) {
  for (let i = 0; i < count; i++) {
    const cx = r() * w, cy = r() * h, rad = 2 + r() * 9;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(110,52,24,.75)'); g.addColorStop(.6, 'rgba(140,74,36,.35)'); g.addColorStop(1, 'rgba(140,74,36,0)');
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    // Run-off streak below a rust spot.
    if (r() > .6) { x.fillStyle = 'rgba(110,60,30,.18)'; x.fillRect(cx - 1, cy, 2, rad * (3 + r() * 5)); }
  }
}

/** Worn painted metal: base coat, grain, grime, scratches, rust spots and chipped edges. */
export function wornPaint(base: string, seed: number, opts: { metal?: string; rustSpots?: number; scratchCount?: number; wear?: number; size?: number } = {}) {
  const r = seeded(seed), size = opts.size ?? 512;
  return paint(size, size, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    grain(x, w, h, r, w * 14, .12);
    grime(x, w, h, r, 14);
    scratches(x, w, h, r, opts.scratchCount ?? 60);
    rust(x, w, h, r, opts.rustSpots ?? 6);
    edgeWear(x, w, h, r, opts.metal ?? '#d6d3cb', w * .05, opts.wear ?? 1);
    // Dirt settles toward the bottom edge.
    const g = x.createLinearGradient(0, h * .6, 0, h); g.addColorStop(0, 'rgba(25,20,15,0)'); g.addColorStop(1, 'rgba(25,20,15,.35)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}

/** Stencilled or printed text on a coloured ground; lines are [text, size as fraction of height]. */
export function sign(lines: [string, number][], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; align?: CanvasTextAlign; border?: boolean; worn?: number; seed?: number } = {}) {
  const w = opts.w ?? 1024, h = opts.h ?? 256, r = seeded(opts.seed ?? 7);
  return paint(w, h, x => {
    x.fillStyle = opts.bg ?? '#1c2430'; x.fillRect(0, 0, w, h);
    if (opts.border) { x.strokeStyle = opts.fg ?? '#e8e2d0'; x.lineWidth = h * .03; x.strokeRect(h * .05, h * .05, w - h * .1, h - h * .1); }
    x.fillStyle = opts.fg ?? '#e8e2d0'; x.textAlign = opts.align ?? 'center'; x.textBaseline = 'middle';
    const total = lines.reduce((s, [, k]) => s + k * 1.18, 0); let y = h / 2 - total * h / 2;
    for (const [text, k] of lines) {
      x.font = `${opts.font ?? '700'} ${Math.round(k * h)}px "Space Grotesk", "Arial Narrow", Arial, sans-serif`;
      y += k * h * .59; x.fillText(text, opts.align === 'left' ? h * .12 : w / 2, y); y += k * h * .59;
    }
    if (opts.worn) { grain(x, w, h, r, w * 6 * opts.worn, .2); grime(x, w, h, r, Math.round(6 * opts.worn)); scratches(x, w, h, r, Math.round(30 * opts.worn), '0,0,0', .3); }
  });
}

/** Diagonal yellow/black hazard stripes. */
export function hazard(w = 512, h = 64, worn = .8, seed = 3) {
  const r = seeded(seed);
  return paint(w, h, x => {
    x.fillStyle = '#d9a91e'; x.fillRect(0, 0, w, h); x.fillStyle = '#16171a';
    for (let i = -h; i < w + h; i += h) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + h * .5, h); x.lineTo(i + h, 0); x.lineTo(i + h * .5, 0); x.fill(); }
    grain(x, w, h, r, w * 8 * worn, .25); scratches(x, w, h, r, 40 * worn, '40,40,40', .5); grime(x, w, h, r, 8 * worn);
  });
}
