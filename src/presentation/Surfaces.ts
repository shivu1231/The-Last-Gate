import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Deterministic aggregate and service seams, shared visually with the opening's worn street. */
export function concreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = '#adb1a9';
  drawingContext.fillRect(0, 0, 512, 512);
  let seed = 6218;
  const randomBetween = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 16000; index++) {
    const sampleValue = 80 + Math.floor(randomBetween() * 100);
    drawingContext.fillStyle = `rgba(${sampleValue},${sampleValue},${sampleValue},${0.03 + randomBetween() * 0.1})`;
    drawingContext.fillRect(
      randomBetween() * 512,
      randomBetween() * 512,
      1 + randomBetween() * 2,
      1 + randomBetween() * 2,
    );
  }
  drawingContext.strokeStyle = '#454c4738';
  drawingContext.lineWidth = 1.5;
  for (let xPosition = 0; xPosition < 512; xPosition += 256) {
    drawingContext.beginPath();
    drawingContext.moveTo(xPosition, 0);
    drawingContext.lineTo(xPosition + 2, 512);
    drawingContext.stroke();
  }
  for (let yPosition = 0; yPosition < 512; yPosition += 256) {
    drawingContext.beginPath();
    drawingContext.moveTo(0, yPosition);
    drawingContext.lineTo(512, yPosition + 1);
    drawingContext.stroke();
  }
  for (let index2 = 0; index2 < 4; index2++) {
    let xPosition2 = randomBetween() * 512,
      yPosition2 = randomBetween() * 512;
    drawingContext.beginPath();
    drawingContext.moveTo(xPosition2, yPosition2);
    for (let segmentIndex = 0; segmentIndex < 5; segmentIndex++) {
      xPosition2 += randomBetween() * 50 - 25;
      yPosition2 += randomBetween() * 40;
      drawingContext.lineTo(xPosition2, yPosition2);
    }
    drawingContext.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
