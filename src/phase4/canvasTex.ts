import * as THREE from 'three';

/** Small canvas-texture toolkit for Bay 6: every surface is painted in code, nothing is loaded. */

export type RandomSource = () => number;
export function seeded(seed: number): RandomSource {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Draw a procedural canvas texture.
 */
export function paint(
  width: number,
  height: number,
  draw: (
    drawingContext: CanvasRenderingContext2D,
    width2: number,
    height2: number,
  ) => void,
  srgb = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Fine grain: thousands of light and dark flecks so no surface reads as flat colour. */
export function grain(
  drawingContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RandomSource,
  count: number,
  strength = 0.18,
) {
  for (let index = 0; index < count; index++) {
    const value = result() > 0.5 ? 255 : 0;
    drawingContext.fillStyle = `rgba(${value},${value},${value},${result() * strength})`;
    drawingContext.fillRect(
      result() * width,
      result() * height,
      1 + result() * 2,
      1 + result() * 2,
    );
  }
}

/** Soft dark patches: grime, oil, handling marks. */
export function grime(
  drawingContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RandomSource,
  count: number,
  color = '20,16,12',
  alpha = 0.22,
) {
  for (let index = 0; index < count; index++) {
    const cx = result() * width,
      cy = result() * height,
      rad = 8 + result() * Math.max(width, height) * 0.18;
    const group = drawingContext.createRadialGradient(cx, cy, 0, cx, cy, rad);
    group.addColorStop(0, `rgba(${color},${alpha * (0.4 + result() * 0.6)})`);
    group.addColorStop(1, `rgba(${color},0)`);
    drawingContext.fillStyle = group;
    drawingContext.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}

/**
 * Paint the seeded surface-wear details into the supplied canvas.
 */
export function scratches(
  drawingContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RandomSource,
  count: number,
  color = '235,232,224',
  alpha = 0.45,
) {
  drawingContext.lineCap = 'round';
  for (let index = 0; index < count; index++) {
    const scaleX = result() * width,
      scaleY = result() * height,
      firstValue = result() * Math.PI,
      len = 6 + result() * width * 0.18;
    drawingContext.strokeStyle = `rgba(${color},${alpha * result()})`;
    drawingContext.lineWidth = 0.6 + result() * 1.4;
    drawingContext.beginPath();
    drawingContext.moveTo(scaleX, scaleY);
    drawingContext.quadraticCurveTo(
      scaleX + Math.cos(firstValue) * len * 0.5 + (result() - 0.5) * 6,
      scaleY + Math.sin(firstValue) * len * 0.5 + (result() - 0.5) * 6,
      scaleX + Math.cos(firstValue) * len,
      scaleY + Math.sin(firstValue) * len,
    );
    drawingContext.stroke();
  }
}

/**
 * Chipped paint along the texture border. Box faces map the whole texture, so the border lands on
 * the object's edges: that's where hands, tools and knocks wear paint back to bare metal.
 */
export function edgeWear(
  drawingContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RandomSource,
  metal = '#d6d3cb',
  depth = 22,
  density = 1,
) {
  const count = Math.round((width + height) * 1.1 * density);
  for (let index = 0; index < count; index++) {
    const side = Math.floor(result() * 4),
      timeSeconds = result(),
      depth2 = Math.pow(result(), 2.4) * depth,
      scaleFactor = 1 + result() * 5 * (1 - depth2 / depth);
    const px =
      side === 0
        ? timeSeconds * width
        : side === 1
          ? timeSeconds * width
          : side === 2
            ? depth2
            : width - depth2;
    const py =
      side === 0 ? depth2 : side === 1 ? height - depth2 : timeSeconds * height;
    drawingContext.fillStyle = metal;
    drawingContext.globalAlpha = 0.55 + result() * 0.45;
    drawingContext.beginPath();
    drawingContext.ellipse(
      px,
      py,
      scaleFactor * (1 + result()),
      scaleFactor,
      result() * Math.PI,
      0,
      Math.PI * 2,
    );
    drawingContext.fill();
  }
  drawingContext.globalAlpha = 1;
  drawingContext.strokeStyle = 'rgba(15,14,12,.55)';
  drawingContext.lineWidth = 2;
  drawingContext.strokeRect(1, 1, width - 2, height - 2);
}

/**
 * Paint the seeded surface-wear details into the supplied canvas.
 */
export function rust(
  drawingContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RandomSource,
  count: number,
) {
  for (let index = 0; index < count; index++) {
    const cx = result() * width,
      cy = result() * height,
      rad = 2 + result() * 9;
    const group = drawingContext.createRadialGradient(cx, cy, 0, cx, cy, rad);
    group.addColorStop(0, 'rgba(110,52,24,.75)');
    group.addColorStop(0.6, 'rgba(140,74,36,.35)');
    group.addColorStop(1, 'rgba(140,74,36,0)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    // Run-off streak below a rust spot.
    if (result() > 0.6) {
      drawingContext.fillStyle = 'rgba(110,60,30,.18)';
      drawingContext.fillRect(cx - 1, cy, 2, rad * (3 + result() * 5));
    }
  }
}

/** Worn painted metal: base coat, grain, grime, scratches, rust spots and chipped edges. */
export function wornPaint(
  base: string,
  seed: number,
  options: {
    metal?: string;
    rustSpots?: number;
    scratchCount?: number;
    wear?: number;
    size?: number;
  } = {},
) {
  const result = seeded(seed),
    size = options.size ?? 512;
  return paint(size, size, (drawingContext, width, height) => {
    drawingContext.fillStyle = base;
    drawingContext.fillRect(0, 0, width, height);
    grain(drawingContext, width, height, result, width * 14, 0.12);
    grime(drawingContext, width, height, result, 14);
    scratches(
      drawingContext,
      width,
      height,
      result,
      options.scratchCount ?? 60,
    );
    rust(drawingContext, width, height, result, options.rustSpots ?? 6);
    edgeWear(
      drawingContext,
      width,
      height,
      result,
      options.metal ?? '#d6d3cb',
      width * 0.05,
      options.wear ?? 1,
    );
    // Dirt settles toward the bottom edge.
    const group = drawingContext.createLinearGradient(
      0,
      height * 0.6,
      0,
      height,
    );
    group.addColorStop(0, 'rgba(25,20,15,0)');
    group.addColorStop(1, 'rgba(25,20,15,.35)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(0, 0, width, height);
  });
}

/** Stencilled or printed text on a coloured ground; lines are [text, size as fraction of height]. */
export function sign(
  lines: [string, number][],
  options: {
    w?: number;
    h?: number;
    bg?: string;
    fg?: string;
    font?: string;
    align?: CanvasTextAlign;
    border?: boolean;
    worn?: number;
    seed?: number;
  } = {},
) {
  const width = options.w ?? 1024,
    height = options.h ?? 256,
    result = seeded(options.seed ?? 7);
  return paint(width, height, (drawingContext) => {
    drawingContext.fillStyle = options.bg ?? '#1c2430';
    drawingContext.fillRect(0, 0, width, height);
    if (options.border) {
      drawingContext.strokeStyle = options.fg ?? '#e8e2d0';
      drawingContext.lineWidth = height * 0.03;
      drawingContext.strokeRect(
        height * 0.05,
        height * 0.05,
        width - height * 0.1,
        height - height * 0.1,
      );
    }
    drawingContext.fillStyle = options.fg ?? '#e8e2d0';
    drawingContext.textAlign = options.align ?? 'center';
    drawingContext.textBaseline = 'middle';
    const total = lines.reduce(
      (scaleFactor, [, blendFactor]) => scaleFactor + blendFactor * 1.18,
      0,
    );
    let yPosition = height / 2 - (total * height) / 2;
    for (const [text, blendFactor2] of lines) {
      drawingContext.font = `${options.font ?? '700'} ${Math.round(blendFactor2 * height)}px "Space Grotesk", "Arial Narrow", Arial, sans-serif`;
      yPosition += blendFactor2 * height * 0.59;
      drawingContext.fillText(
        text,
        options.align === 'left' ? height * 0.12 : width / 2,
        yPosition,
      );
      yPosition += blendFactor2 * height * 0.59;
    }
    if (options.worn) {
      grain(
        drawingContext,
        width,
        height,
        result,
        width * 6 * options.worn,
        0.2,
      );
      grime(
        drawingContext,
        width,
        height,
        result,
        Math.round(6 * options.worn),
      );
      scratches(
        drawingContext,
        width,
        height,
        result,
        Math.round(30 * options.worn),
        '0,0,0',
        0.3,
      );
    }
  });
}

/** Diagonal yellow/black hazard stripes. */
export function hazard(width = 512, height = 64, worn = 0.8, seed = 3) {
  const result = seeded(seed);
  return paint(width, height, (drawingContext) => {
    drawingContext.fillStyle = '#d9a91e';
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.fillStyle = '#16171a';
    for (let index = -height; index < width + height; index += height) {
      drawingContext.beginPath();
      drawingContext.moveTo(index, height);
      drawingContext.lineTo(index + height * 0.5, height);
      drawingContext.lineTo(index + height, 0);
      drawingContext.lineTo(index + height * 0.5, 0);
      drawingContext.fill();
    }
    grain(drawingContext, width, height, result, width * 8 * worn, 0.25);
    scratches(
      drawingContext,
      width,
      height,
      result,
      40 * worn,
      '40,40,40',
      0.5,
    );
    grime(drawingContext, width, height, result, 8 * worn);
  });
}
