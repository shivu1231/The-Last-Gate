import * as THREE from 'three';

/** The chip's silhouette: a card with one chamfered key corner. The dock repeats this exact outline. */
export const CHIP_W = 0.15,
  CHIP_H = 0.21,
  CHIP_KEY = 0.038;
/**
 * Canonical seat: the chip's centre sits this far out of the dock origin, in dock space. Its back
 * bevel then clears the dock floor and contacts, and its face sits flush with the keyed frame.
 */
export const CHIP_SEAT_Z = 0.004;
/**
 * Construct the keyed card outline shared by the combat and healthcare chips.
 */
export function chipOutline(
  width = CHIP_W,
  height = CHIP_H,
  key = CHIP_KEY,
  radius = 0.012,
) {
  const state = new THREE.Shape(),
    xPosition = -width / 2,
    yPosition = -height / 2;
  state.moveTo(xPosition + radius, yPosition);
  state.lineTo(xPosition + width - radius, yPosition);
  state.quadraticCurveTo(
    xPosition + width,
    yPosition,
    xPosition + width,
    yPosition + radius,
  );
  state.lineTo(xPosition + width, yPosition + height - key);
  state.lineTo(xPosition + width - key, yPosition + height);
  state.lineTo(xPosition + radius, yPosition + height);
  state.quadraticCurveTo(
    xPosition,
    yPosition + height,
    xPosition,
    yPosition + height - radius,
  );
  state.lineTo(xPosition, yPosition + radius);
  state.quadraticCurveTo(xPosition, yPosition, xPosition + radius, yPosition);
  return state;
}

/**
 * Precision hardware, not a toy: anodised crimson body, carbon inset with a laser-etched
 * readout, a single emissive logic line, and gold edge contacts. Local frame: face is +Z,
 * contacts at -Y (the leading edge into the socket).
 */
export function createRedChip() {
  const chip = new THREE.Group();
  chip.name = 'combat-chip';
  const body = new THREE.MeshPhysicalMaterial({
    color: '#7d1016',
    roughness: 0.27,
    metalness: 0.72,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.1,
    emissive: '#2a0204',
    emissiveIntensity: 0.4,
  });
  const bodyGeo = new THREE.ExtrudeGeometry(chipOutline(), {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0028,
    bevelSegments: 3,
    curveSegments: 6,
  });
  bodyGeo.translate(0, 0, -0.006);
  const shell = new THREE.Mesh(bodyGeo, body);
  chip.add(shell);
  // Laser-etched inset: tiny, legible only at inspection distance.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const drawingContext = canvas.getContext('2d');
  drawingContext.fillStyle = '#160a0c';
  drawingContext.fillRect(0, 0, 256, 320);
  drawingContext.strokeStyle = 'rgba(205,92,80,.38)';
  drawingContext.lineWidth = 2;
  drawingContext.strokeRect(10, 10, 236, 300);
  for (let index = 0; index < 14; index++) {
    drawingContext.fillStyle = `rgba(190,70,62,${0.08 + (index % 3) * 0.05})`;
    drawingContext.fillRect(22, 150 + index * 9, 120 + ((index * 37) % 90), 2);
  }
  drawingContext.fillStyle = '#e2a093';
  drawingContext.font = '600 34px "IBM Plex Mono",monospace';
  drawingContext.fillText('CMB-01', 22, 62);
  drawingContext.fillStyle = '#a3605a';
  drawingContext.font = '15px "IBM Plex Mono",monospace';
  drawingContext.fillText('H.HAMADA // PROTO', 22, 92);
  drawingContext.fillText('UNSAFE  —  NO CARE', 22, 116);
  drawingContext.beginPath();
  const cx = 196,
    cy = 266;
  for (let index2 = 0; index2 < 6; index2++) {
    const firstValue = (index2 / 6) * Math.PI * 2 + Math.PI / 6;
    drawingContext.lineTo(
      cx + Math.cos(firstValue) * 24,
      cy + Math.sin(firstValue) * 24,
    );
  }
  drawingContext.closePath();
  drawingContext.strokeStyle = '#d0675c';
  drawingContext.lineWidth = 3;
  drawingContext.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const inset = new THREE.Mesh(
    new THREE.PlaneGeometry(0.098, 0.122),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.42,
      metalness: 0.35,
      envMapIntensity: 0.7,
    }),
  );
  inset.position.set(-0.012, 0.018, 0.0092);
  chip.add(inset);
  // One emissive logic line: the only light the chip owns.
  const glow = new THREE.MeshBasicMaterial({
    color: '#ff3a2c',
    toneMapped: false,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.0042, 0.15), glow);
  line.position.set(0.054, 0.004, 0.0094);
  chip.add(line);
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.0042), glow);
  tick.position.set(0.046, -0.07, 0.0094);
  chip.add(tick);
  // Machined grooves catch a hard edge of light.
  const groove = new THREE.MeshStandardMaterial({
    color: '#2a0507',
    roughness: 0.5,
    metalness: 0.6,
  });
  for (const yPosition of [0.088, -0.058]) {
    const material = new THREE.Mesh(
      new THREE.BoxGeometry(0.124, 0.0022, 0.002),
      groove,
    );
    material.position.set(-0.004, yPosition, 0.0092);
    chip.add(material);
  }
  const gold = new THREE.MeshStandardMaterial({
    color: '#d3a55c',
    roughness: 0.24,
    metalness: 1,
    envMapIntensity: 1.2,
  });
  const contact = new THREE.BoxGeometry(0.011, 0.026, 0.0016);
  for (let index3 = 0; index3 < 7; index3++) {
    const material2 = new THREE.Mesh(contact, gold);
    material2.position.set(-0.054 + index3 * 0.018, -0.088, 0.0088);
    chip.add(material2);
  }
  chip.traverse((sceneObject) => {
    if (sceneObject.isMesh) {
      sceneObject.castShadow = true;
      sceneObject.receiveShadow = true;
    }
  });
  line.castShadow = tick.castShadow = false;
  return { chip, glow, body };
}
