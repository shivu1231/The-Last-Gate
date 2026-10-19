import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Deterministic aggregate and service seams, shared visually with the opening's worn street. */
export function concreteTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#adb1a9'; ctx.fillRect(0, 0, 512, 512);
  let seed = 6218; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 16000; i++) { const v = 80 + Math.floor(rand() * 100); ctx.fillStyle = `rgba(${v},${v},${v},${.03 + rand() * .1})`; ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2, 1 + rand() * 2); }
  ctx.strokeStyle = '#454c4738'; ctx.lineWidth = 1.5;
  for (let x = 0; x < 512; x += 256) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2, 512); ctx.stroke(); }
  for (let y = 0; y < 512; y += 256) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + 1); ctx.stroke(); }
  for (let i = 0; i < 4; i++) { let x = rand() * 512, y = rand() * 512; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x += rand() * 50 - 25; y += rand() * 40; ctx.lineTo(x, y); } ctx.stroke(); }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = RepeatWrapping; texture.anisotropy = 4; return texture;
}
