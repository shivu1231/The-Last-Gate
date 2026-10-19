import * as THREE from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';
import { createCityBackdrop } from '../presentation/Backdrop';
import { concreteTexture } from '../presentation/Surfaces';
import {
  Dressing,
  buildingFrame,
  cityMaterials,
  dressFacade,
  dressRoof,
  skinMergedBoxes,
} from '../environment/CityDressing';
import { batchSolids, createReceiver, link } from './receiverModel';

/** Four recorded fixes, in chronological order, on the actual outgoing bearing. */
export const SIGNAL_FIXES: [number, number, number][] = [
  [1.6, 6.9, -14],
  [-2, 14, -40],
  [-6, 23, -67],
  [-9.5, 30, -95],
];

/** The middle console's readout once the receiver has the chip's last transmission: it isn't here. */
function transmissionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = '#10181b';
  drawingContext.fillRect(0, 0, 768, 384);
  drawingContext.fillStyle = '#91b7ad';
  drawingContext.font = '500 24px "IBM Plex Mono",monospace';
  drawingContext.fillText('RX / LAST TRANSMISSION', 28, 42);
  drawingContext.fillStyle = '#c6cfc2';
  drawingContext.font = '20px "IBM Plex Mono",monospace';
  [
    ['SOURCE', 'HEALTHCARE CHIP'],
    ['HEADING', 'OUTBOUND'],
    ['LAST FIX', 'OLD PORTAL SITE'],
    ['BOUNDARY', 'CROSSED'],
    ['LOCAL SIGNAL', 'NONE'],
  ].forEach(([key, textValue], index) => {
    drawingContext.fillStyle = '#7f948c';
    drawingContext.fillText(key, 28, 96 + index * 40);
    drawingContext.fillStyle = '#e6ece4';
    drawingContext.fillText(textValue, 210, 96 + index * 40);
  });
  drawingContext.fillStyle = '#F08A3C';
  drawingContext.font = '600 34px "IBM Plex Mono",monospace';
  drawingContext.fillText('NOT IN THIS CITY', 28, 330);
  // A small plan: the city ring, the track leaving it.
  drawingContext.strokeStyle = '#425a5c';
  drawingContext.lineWidth = 3;
  drawingContext.beginPath();
  drawingContext.arc(600, 190, 110, 0, Math.PI * 2);
  drawingContext.stroke();
  drawingContext.strokeStyle = '#F08A3C';
  drawingContext.setLineDash([10, 8]);
  drawingContext.beginPath();
  drawingContext.moveTo(560, 250);
  drawingContext.lineTo(640, 150);
  drawingContext.lineTo(700, 70);
  drawingContext.stroke();
  drawingContext.setLineDash([]);
  drawingContext.fillStyle = '#F08A3C';
  drawingContext.beginPath();
  drawingContext.moveTo(712, 54);
  drawingContext.lineTo(688, 66);
  drawingContext.lineTo(706, 82);
  drawingContext.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Paint the telemetry console display in its existing layout.
 */
function consoleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = '#142429';
  drawingContext.fillRect(0, 0, 768, 384);
  drawingContext.fillStyle = '#91b7ad';
  drawingContext.font = '500 25px "IBM Plex Mono",monospace';
  drawingContext.fillText('SF / TELEMETRY RELAY', 28, 42);
  drawingContext.strokeStyle = '#425a5c';
  drawingContext.lineWidth = 2;
  drawingContext.strokeRect(28, 66, 450, 274);
  for (let xPosition = 58; xPosition < 470; xPosition += 60) {
    drawingContext.beginPath();
    drawingContext.moveTo(xPosition, 66);
    drawingContext.lineTo(xPosition, 340);
    drawingContext.stroke();
  }
  for (let yPosition = 100; yPosition < 340; yPosition += 48) {
    drawingContext.beginPath();
    drawingContext.moveTo(28, yPosition);
    drawingContext.lineTo(478, yPosition);
    drawingContext.stroke();
  }
  drawingContext.strokeStyle = '#bfcea7';
  drawingContext.lineWidth = 3;
  drawingContext.beginPath();
  for (let xPosition2 = 36; xPosition2 <= 470; xPosition2 += 4) {
    const yPosition2 =
      250 -
      Math.sin(xPosition2 * 0.022) * 12 -
      110 * Math.exp(-(((xPosition2 - 315) / 18) ** 2));
    if (xPosition2 === 36) drawingContext.moveTo(xPosition2, yPosition2);
    else drawingContext.lineTo(xPosition2, yPosition2);
  }
  drawingContext.stroke();
  drawingContext.fillStyle = '#c6cfc2';
  drawingContext.font = '20px "IBM Plex Mono",monospace';
  [
    'RX / STANDBY',
    '12.0 GHz',
    'LNA  01',
    'SYNC / WAIT',
    'BAY 6 / LINK',
  ].forEach((text, index) =>
    drawingContext.fillText(text, 512, 106 + index * 48),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A damaged, inhabited relay service room; the original five repairs operate its real hardware. */
export function createFacility() {
  const sceneKit = new SceneKit('telemetry-facility');
  const random = seeded(5150),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  const city = createCityBackdrop();
  city.group.position.set(-6, -6, -52);
  city.group.scale.setScalar(1.25);
  city.group.traverse((sceneObject) => {
    sceneObject.castShadow = false;
  });
  sceneKit.root.add(city.group);
  const room = new THREE.Group();
  room.name = 'relay-room-structure';
  sceneKit.root.add(room);
  const floorMap = concreteTexture();
  floorMap.repeat.set(3, 3);
  const floorMat = sceneKit.ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#65716b',
      roughness: 0.94,
      metalness: 0.04,
      map: floorMap,
    }),
  );
  const wall = sceneKit.standard('#42504f', 0.88, 0.16),
    inset = sceneKit.standard('#293b3e', 0.72, 0.28);
  const paint = sceneKit.standard('#b8bcae', 0.65, 0.26),
    graphite = sceneKit.standard('#172629', 0.72, 0.48);
  const aluminium = sceneKit.standard('#788b87', 0.38, 0.72),
    ochre = sceneKit.standard('#ae8f54', 0.7, 0.24);
  const rubber = sceneKit.standard('#17201f', 0.96, 0.03),
    red = sceneKit.standard('#894d3d', 0.65, 0.3);
  const glowMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#bdc6ac', toneMapped: false }),
  );
  const screenMap = consoleTexture();
  const screenMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: '#061014',
      map: screenMap,
      toneMapped: false,
    }),
  );
  const readoutMap = transmissionTexture();
  const readoutMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      map: readoutMap,
      toneMapped: false,
      transparent: true,
      opacity: 0,
    }),
  );
  const ledMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#1a2a24', toneMapped: false }),
  );
  const panelMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#343d39', toneMapped: false }),
  );
  const cyl = (
    radius: number,
    height: number,
    points2: [number, number, number],
    material: THREE.Material,
    entries?: [number, number, number],
    parent: THREE.Object3D = room,
  ) =>
    sceneKit.mesh(
      sceneKit.ownGeometry(
        new THREE.CylinderGeometry(radius, radius, height, 12),
      ),
      material,
      { p: points2, r: entries },
      parent,
    );

  sceneKit.box({ p: [0, -0.2, 0], s: [17, 0.4, 15] }, floorMat, room);
  for (const xPosition of [-8.3, 8.3]) {
    sceneKit.box({ p: [xPosition, 2.4, 0], s: [0.4, 5.2, 15] }, wall, room);
    sceneKit.box(
      { p: [xPosition * 0.972, 0.17, 0], s: [0.13, 0.34, 14.6] },
      graphite,
      room,
    );
    for (let zPosition = -5.9; zPosition < 6; zPosition += 2.2) {
      sceneKit.box(
        { p: [xPosition * 0.974, 2.5, zPosition], s: [0.09, 4.4, 0.08] },
        aluminium,
        room,
      );
      sceneKit.box(
        {
          p: [xPosition * 0.971, 2.3, zPosition + 1.02],
          s: [0.025, 3.45, 1.9],
        },
        inset,
        room,
      );
      for (const yPosition of [0.65, 3.95])
        for (const deltaZ of [0.16, 1.87])
          cyl(
            0.025,
            0.032,
            [xPosition * 0.969, yPosition, zPosition + deltaZ],
            aluminium,
            [0, 0, Math.PI / 2],
          );
    }
  }
  // The opening is wider than the complete dish silhouette; no wall or roof cuts through it.
  sceneKit.box({ p: [-6.1, 2.4, -6.8], s: [4.8, 5.2, 0.4] }, wall, room);
  sceneKit.box({ p: [6.7, 2.4, -6.8], s: [3.6, 5.2, 0.4] }, wall, room);
  for (const xPosition2 of [-3.65, 4.85])
    sceneKit.box(
      { p: [xPosition2, 2.45, -6.75], s: [0.14, 4.9, 0.58] },
      aluminium,
      room,
    );
  // A complete service building. The camera exits under the rear lintel before rising.
  sceneKit.box({ p: [0, 5.18, 0.15], s: [17.35, 0.36, 15.4] }, graphite, room);
  sceneKit.box({ p: [0, 4.83, -6.8], s: [8.5, 0.32, 0.6] }, aluminium, room);
  sceneKit.box({ p: [0, 2.4, 7.35], s: [17, 5.2, 0.35] }, wall, room);
  for (const xPosition3 of [-8.5, 8.5])
    sceneKit.box(
      { p: [xPosition3, 5.55, 0.15], s: [0.22, 0.65, 15.6] },
      wall,
      room,
    );
  for (const zPosition2 of [-7.6, 7.9])
    sceneKit.box(
      { p: [0, 5.55, zPosition2], s: [17.2, 0.65, 0.22] },
      wall,
      room,
    );
  for (const zPosition3 of [-4.5, -0.3, 3.9])
    sceneKit.box(
      { p: [0, 4.94, zPosition3], s: [16.3, 0.18, 0.16] },
      aluminium,
      room,
    );
  for (const xPosition4 of [-4.7, 4.7]) {
    sceneKit.box(
      { p: [xPosition4, 5.87, 3.8], s: [2.8, 1, 2] },
      aluminium,
      room,
    );
    for (let zPosition4 = 3; zPosition4 < 4.7; zPosition4 += 0.17)
      sceneKit.box(
        { p: [xPosition4, 6.39, zPosition4], s: [2.55, 0.035, 0.055] },
        graphite,
        room,
      );
    sceneKit.box(
      { p: [xPosition4, 5.64, 1.3], s: [0.85, 0.45, 3.1] },
      inset,
      room,
    );
  }
  sceneKit.box({ p: [-1.5, 5.47, 4.4], s: [1.6, 0.22, 2.2] }, paint, room);
  sceneKit.box({ p: [0, -6.9, 0.15], s: [17, 13.4, 15.4] }, wall, room);
  for (const yPosition2 of [-2.6, -5.8, -9]) {
    for (const zPosition5 of [-7.62, 7.92]) {
      sceneKit.box(
        { p: [0, yPosition2 - 1.3, zPosition5], s: [17.3, 0.18, 0.3] },
        aluminium,
        room,
      );
      for (let xPosition5 = -6.6; xPosition5 < 7; xPosition5 += 2.2) {
        sceneKit.box(
          { p: [xPosition5, yPosition2, zPosition5], s: [1.65, 1.7, 0.08] },
          graphite,
          room,
        );
        sceneKit.box(
          {
            p: [
              xPosition5,
              yPosition2,
              zPosition5 + Math.sign(zPosition5) * 0.05,
            ],
            s: [1.42, 1.45, 0.04],
          },
          inset,
          room,
        );
      }
    }
    for (const xPosition6 of [-8.52, 8.52])
      for (let zPosition6 = -5.7; zPosition6 < 7; zPosition6 += 2.3)
        sceneKit.box(
          { p: [xPosition6, yPosition2, zPosition6], s: [0.08, 1.6, 1.55] },
          inset,
          room,
        );
  }
  for (let index = 0; index < 9; index++)
    sceneKit.box(
      {
        p: [
          randomBetween(-3.7, 4.8),
          randomBetween(0.03, 0.18),
          randomBetween(-7.6, -6.2),
        ],
        s: [
          randomBetween(0.2, 0.7),
          randomBetween(0.12, 0.3),
          randomBetween(0.25, 0.7),
        ],
        r: [randomBetween(0, 1), randomBetween(0, 3), randomBetween(0, 1)],
      },
      sceneKit.concrete,
      room,
    );
  for (const xPosition7 of [-5.8, 5.8])
    sceneKit.box(
      { p: [xPosition7, 0.008, 0], s: [0.055, 0.008, 12] },
      ochre,
      room,
    );
  sceneKit.box({ p: [0, 0.012, -5.8], s: [7.4, 0.015, 0.3] }, graphite, room);
  for (let xPosition8 = -3.5; xPosition8 < 3.6; xPosition8 += 0.18)
    sceneKit.box(
      { p: [xPosition8, 0.022, -5.8], s: [0.055, 0.008, 0.28] },
      aluminium,
      room,
    );
  for (const xPosition9 of [-3.25, 0, 3.25]) {
    sceneKit.box(
      { p: [xPosition9, 0.78, -1.7], s: [2.6, 0.13, 1.35] },
      paint,
      room,
    );
    sceneKit.box(
      { p: [xPosition9, 0.69, -1.7], s: [2.42, 0.07, 1.24] },
      graphite,
      room,
    );
    for (const deltaX of [-1.1, 1.1]) {
      sceneKit.box(
        { p: [xPosition9 + deltaX, 0.35, -1.7], s: [0.1, 0.7, 1.12] },
        aluminium,
        room,
      );
      sceneKit.box(
        { p: [xPosition9 + deltaX, 0.05, -1.7], s: [0.32, 0.08, 1.28] },
        graphite,
        room,
      );
    }
    sceneKit.box(
      { p: [xPosition9, 0.45, -2.18], s: [2.2, 0.36, 0.22] },
      inset,
      room,
    );
    sceneKit.box(
      { p: [xPosition9, 1.24, -2.08], s: [1.62, 0.89, 0.13], r: [-0.12, 0, 0] },
      graphite,
      room,
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.PlaneGeometry(1.44, 0.72)),
      screenMat,
      { p: [xPosition9, 1.26, -1.997], r: [-0.12, 0, 0] },
      room,
    );
    sceneKit.box(
      { p: [xPosition9, 0.97, -2.13], s: [0.12, 0.3, 0.15] },
      aluminium,
      room,
    );
    sceneKit.box(
      {
        p: [xPosition9, 0.865, -1.47],
        s: [0.98, 0.045, 0.32],
        r: [0.06, 0, 0],
      },
      graphite,
      room,
    );
    for (let row = 0; row < 3; row++)
      for (let key = 0; key < 11; key++)
        sceneKit.box(
          {
            p: [
              xPosition9 - 0.44 + key * 0.081,
              0.895 + row * 0.005,
              -1.58 + row * 0.08,
            ],
            s: [0.056, 0.018, 0.055],
          },
          aluminium,
          room,
        );
    sceneKit.box(
      { p: [xPosition9 + 0.77, 0.877, -1.45], s: [0.2, 0.04, 0.28] },
      graphite,
      room,
    );
    sceneKit.box(
      { p: [xPosition9 - 0.77, 0.88, -1.43], s: [0.18, 0.055, 0.18] },
      red,
      room,
    );
    cyl(0.045, 0.035, [xPosition9 - 0.77, 0.93, -1.43], ochre);
    sceneKit.label(
      `RX / 0${Math.round((xPosition9 + 3.25) / 3.25) + 1}`,
      { p: [xPosition9 - 0.72, 0.67, -0.985] },
      0.8,
      '#b9c2b7',
      room,
    );
  } // The middle console's screen switches to the chip's last transmission.
  const readoutScreen = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(1.44, 0.72)),
    readoutMat,
    { p: [0, 1.26, -1.993], r: [-0.12, 0, 0] },
    room,
  );
  readoutScreen.visible = false;

  // Furniture establishes human scale without adding another interaction.
  for (const xPosition10 of [-3.25, 3.25]) {
    cyl(0.32, 0.08, [xPosition10, 0.53, -0.25], graphite);
    cyl(0.055, 0.5, [xPosition10, 0.25, -0.25], aluminium);
    for (let index2 = 0; index2 < 4; index2++) {
      const firstValue = (index2 * Math.PI) / 2;
      link(
        sceneKit,
        room,
        new THREE.Vector3(xPosition10, 0.09, -0.25),
        new THREE.Vector3(
          xPosition10 + Math.cos(firstValue) * 0.4,
          0.09,
          -0.25 + Math.sin(firstValue) * 0.4,
        ),
        0.035,
        graphite,
      );
    }
  }
  sceneKit.box({ p: [4.8, 0.65, 3.6], s: [1.05, 0.07, 0.65] }, aluminium, room);
  sceneKit.box({ p: [4.8, 0.25, 3.6], s: [1.05, 0.07, 0.65] }, graphite, room);
  for (const xPosition11 of [4.36, 5.24])
    for (const zPosition7 of [3.36, 3.84])
      sceneKit.box(
        { p: [xPosition11, 0.42, zPosition7], s: [0.045, 0.8, 0.045] },
        aluminium,
        room,
      );
  sceneKit.box(
    { p: [4.7, 0.71, 3.6], s: [0.35, 0.06, 0.45], r: [0, 0.2, 0] },
    paint,
    room,
  );

  // Open-faced racks have rack units, ventilation slots, handles and service labels.
  for (let index3 = 0; index3 < 4; index3++) {
    const zPosition8 = -4.7 + index3 * 1.35;
    sceneKit.box(
      { p: [-7.4, 1.35, zPosition8], s: [1.18, 2.7, 1.12] },
      graphite,
      room,
    );
    for (const deltaZ2 of [-0.49, 0.49])
      sceneKit.box(
        { p: [-6.785, 1.4, zPosition8 + deltaZ2], s: [0.04, 2.5, 0.035] },
        aluminium,
        room,
      );
    for (let radius2 = 0; radius2 < 7; radius2++) {
      const yPosition3 = 0.32 + radius2 * 0.32;
      sceneKit.box(
        { p: [-6.78, yPosition3, zPosition8], s: [0.055, 0.265, 0.91] },
        inset,
        room,
      );
      for (let sampleValue = 0; sampleValue < 8; sampleValue++)
        sceneKit.box(
          {
            p: [-6.744, yPosition3, zPosition8 - 0.3 + sampleValue * 0.075],
            s: [0.009, 0.09, 0.025],
          },
          rubber,
          room,
        );
      sceneKit.box(
        {
          p: [-6.73, yPosition3 + 0.08, zPosition8 + 0.34],
          s: [0.015, 0.04, 0.04],
        },
        ledMat,
        room,
      );
    }
    sceneKit.label(
      `RELAY / 0${index3 + 1}`,
      { p: [-6.72, 2.56, zPosition8], r: [0, Math.PI / 2, 0] },
      0.88,
      '#b9c2b7',
      room,
    );
  }

  // Recessed breaker cabinet: real switches, a copper bus and physical service fascia.
  sceneKit.box({ p: [7.74, 1.56, 0.4], s: [0.5, 2.28, 1.82] }, aluminium, room);
  sceneKit.box(
    { p: [7.47, 1.55, 0.4], s: [0.055, 1.94, 1.51] },
    graphite,
    room,
  );
  for (const zPosition9 of [-0.36, 1.16])
    sceneKit.box(
      { p: [7.42, 1.55, zPosition9], s: [0.11, 2.12, 0.08] },
      paint,
      room,
    );
  for (const yPosition4 of [0.52, 2.59])
    sceneKit.box(
      { p: [7.42, yPosition4, 0.4], s: [0.11, 0.075, 1.6] },
      paint,
      room,
    );
  sceneKit.box({ p: [7.36, 1.45, -0.13], s: [0.04, 1.65, 0.045] }, ochre, room);
  const breakers: THREE.Group[] = [];
  for (let index4 = 0; index4 < 4; index4++) {
    const yPosition5 = 2.18 - index4 * 0.39;
    sceneKit.box(
      { p: [7.36, yPosition5, 0.42], s: [0.12, 0.31, 0.73] },
      inset,
      room,
    );
    sceneKit.box(
      { p: [7.28, yPosition5, 0.42], s: [0.06, 0.25, 0.24] },
      paint,
      room,
    );
    const switchGroup = new THREE.Group();
    switchGroup.position.set(7.23, yPosition5, 0.42);
    sceneKit.root.add(switchGroup);
    sceneKit.box(
      { p: [-0.07, 0, 0], s: [0.17, 0.06, 0.18] },
      graphite,
      switchGroup,
    );
    breakers.push(switchGroup);
    sceneKit.label(
      ['12 A / CONSOLE', '18 A / RECEIVER', '15 A / LIGHTS', '22 A / HVAC'][
        index4
      ],
      { p: [7.265, yPosition5, 0.87], r: [0, -Math.PI / 2, 0] },
      0.57,
      '#bac6b8',
      room,
    );
  }
  sceneKit.label(
    'DC DISTRIBUTION / 40 A',
    { p: [7.32, 2.77, 0.4], r: [0, -Math.PI / 2, 0] },
    1.9,
    '#d7c095',
    room,
  );
  sceneKit.label(
    'ISOLATE BEFORE SERVICE',
    { p: [7.32, 0.34, 0.4], r: [0, -Math.PI / 2, 0] },
    1.6,
    '#c5ad7a',
    room,
  );
  const door = new THREE.Group();
  door.position.set(7.48, 1.55, -0.47);
  door.rotation.y = 0.55;
  room.add(door);
  sceneKit.box({ p: [0, 0, -0.84], s: [0.055, 2.14, 1.68] }, paint, door);
  sceneKit.box(
    { p: [-0.055, 0, -1.47], s: [0.065, 0.35, 0.07] },
    graphite,
    door,
  );
  sceneKit.box(
    { p: [-0.04, 0.28, -0.84], s: [0.012, 0.59, 0.86] },
    ochre,
    door,
  );
  sceneKit.label(
    '40 A / DC',
    { p: [-0.052, 0.28, -0.84], r: [0, -Math.PI / 2, 0] },
    0.75,
    '#25342f',
    door,
  );

  sceneKit.box(
    { p: [7.74, 1.62, 2.83], s: [0.48, 1.48, 1.85] },
    aluminium,
    room,
  );
  sceneKit.box({ p: [7.48, 1.62, 2.83], s: [0.05, 1.3, 1.68] }, graphite, room);
  const leads: THREE.Mesh[] = [],
    leadColors = ['#d1a965', '#89babb', '#a8bd8e'];
  for (let index5 = 0; index5 < 3; index5++) {
    const yPosition6 = 2.05 - index5 * 0.38;
    for (const zPosition10 of [2.21, 3.4]) {
      cyl(0.07, 0.08, [7.415, yPosition6, zPosition10], ochre, [
        0,
        0,
        Math.PI / 2,
      ]);
      cyl(0.037, 0.085, [7.395, yPosition6, zPosition10], rubber, [
        0,
        0,
        Math.PI / 2,
      ]);
    }
    sceneKit.label(
      ['RF / 12 GHz', 'IF / 1.2 GHz', 'BASEBAND'][index5],
      { p: [7.39, yPosition6 + 0.12, 2.83], r: [0, -Math.PI / 2, 0] },
      0.8,
      '#b4c6ba',
      room,
    );
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(7.35, yPosition6, 2.21),
      new THREE.Vector3(7.02, yPosition6 - 0.14, 2.35),
      new THREE.Vector3(6.95, yPosition6 - 0.23, 2.83),
      new THREE.Vector3(7.35, yPosition6, 3.4),
    ]);
    const lead = sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.TubeGeometry(curve, 20, 0.027, 6)),
      sceneKit.standard(leadColors[index5], 0.62, 0.1),
      { p: [0, 0, 0] },
    );
    lead.visible = false;
    leads.push(lead);
  }
  sceneKit.label(
    'SIGNAL PATCH / RX',
    { p: [7.39, 2.51, 2.83], r: [0, -Math.PI / 2, 0] },
    1.8,
    '#b9c2b7',
    room,
  );
  for (const zPosition11 of [0.4, 2.83]) {
    const points = [
      new THREE.Vector3(7.8, 2.8, zPosition11),
      new THREE.Vector3(7.8, 3.6, zPosition11),
      new THREE.Vector3(7.8, 3.8, zPosition11 - 0.2),
      new THREE.Vector3(7.8, 3.8, -5.8),
    ];
    sceneKit.mesh(
      sceneKit.ownGeometry(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points, false, 'centripetal'),
          32,
          0.048,
          8,
        ),
      ),
      aluminium,
      { p: [0, 0, 0] },
      room,
    );
  }
  for (const xPosition12 of [-5.6, 5.9]) {
    sceneKit.box(
      { p: [xPosition12, 4.55, 0.4], s: [0.44, 0.07, 12.2] },
      aluminium,
      room,
    );
    for (let zPosition12 = -5.5; zPosition12 < 6.5; zPosition12 += 0.5)
      sceneKit.box(
        { p: [xPosition12, 4.61, zPosition12], s: [0.5, 0.07, 0.04] },
        graphite,
        room,
      );
    for (const deltaX2 of [-0.12, 0, 0.12])
      link(
        sceneKit,
        room,
        new THREE.Vector3(xPosition12 + deltaX2, 4.62, -5.5),
        new THREE.Vector3(xPosition12 + deltaX2, 4.62, 6.4),
        0.022,
        rubber,
      );
  }
  for (const [xPosition13, zPosition13] of [
    [-4.6, -2.5],
    [5.7, 1.3],
    [-4.6, 2.8],
  ]) {
    sceneKit.box(
      { p: [xPosition13, 4.82, zPosition13], s: [1.7, 0.11, 0.4] },
      graphite,
      room,
    );
    sceneKit.box(
      { p: [xPosition13, 4.75, zPosition13], s: [1.5, 0.015, 0.26] },
      panelMat,
      room,
    );
  }
  sceneKit.box({ p: [-5.8, 2.4, -6.54], s: [2.4, 0.42, 0.05] }, graphite, room);
  sceneKit.label(
    'NORTH RELAY / 06',
    { p: [-5.8, 2.4, -6.5] },
    2.15,
    '#c5b484',
    room,
  );
  sceneKit.box({ p: [-5.7, 1.15, -6.52], s: [1.8, 1.6, 0.05] }, inset, room);
  for (let index6 = 0; index6 < 6; index6++)
    sceneKit.box(
      { p: [-5.7, 0.62 + index6 * 0.19, -6.47], s: [1.48, 0.055, 0.03] },
      graphite,
      room,
    );
  sceneKit.box({ p: [7.8, 3.05, 0.4], s: [0.17, 0.13, 0.68] }, graphite, room);
  sceneKit.box(
    { p: [7.69, 3.05, 0.4], s: [0.025, 0.055, 0.54] },
    glowMat,
    room,
  );
  batchSolids(room, sceneKit);

  // Adjacent occupied blocks surround the terrace in every direction, including behind the dish.
  const neighborhood = new THREE.Group();
  sceneKit.root.add(neighborhood);
  sceneKit.box({ p: [0, -14.1, 10], s: [90, 0.5, 110] }, inset, neighborhood);
  // Storey-scaled facades, roof plant and tiered caps from the city dressing kit (instanced), in
  // a mix of tones so the blocks round the terrace don't read as one box repeated.
  const dress = new Dressing(sceneKit),
    cm = cityMaterials(sceneKit),
    nRandom = seeded(5151);
  const tones = [
    sceneKit.standard('#4a5862', 0.9, 0.08),
    sceneKit.standard('#6d6a66', 0.9, 0.06),
    sceneKit.standard('#3b4852', 0.9, 0.1),
    sceneKit.standard('#7a6354', 0.9, 0.05),
  ];
  // The first eight surround the back of the building; the last five stand out past the yard,
  // either side of the outbound trace and below it, so the exterior shots look into a district.
  for (const [xPosition14, zPosition14, width, height2, depth] of [
    [-21, 1, 14, 24, 19],
    [23, 6, 15, 31, 22],
    [-20, 30, 17, 35, 15],
    [5, 38, 16, 24, 16],
    [29, 37, 17, 42, 19],
    [-34, 59, 22, 44, 22],
    [0, 68, 21, 52, 19],
    [34, 69, 19, 38, 22],
    [24, -30, 14, 30, 14],
    [-30, -34, 14, 30, 16],
    [32, -58, 16, 40, 16],
    [-38, -68, 18, 42, 18],
    [12, -90, 16, 28, 14],
  ]) {
    const frame = buildingFrame(xPosition14, zPosition14, 0, 0, -14),
      index7 = Math.floor(nRandom() * tones.length);
    sceneKit.box(
      {
        p: [xPosition14, height2 / 2 - 14, zPosition14],
        s: [width, height2, depth],
      },
      tones[index7],
      neighborhood,
    );
    // The lower storeys sit below the terrace; the facades start a storey under its edge.
    dressFacade(
      dress,
      cm,
      frame,
      width,
      height2,
      depth,
      ['+x', '-x', '+z', '-z'],
      nRandom,
      { from: 8, lit: 0.12 },
    );
    dressRoof(dress, cm, frame, width, height2, depth, nRandom, {
      tower: height2 > 40,
      sign: height2 < 30,
    });
  }
  batchSolids(neighborhood, sceneKit);
  dress.build(neighborhood);
  // The backdrop's towers only have windows on the face its first chapter looks at; from the
  // terrace their sides read as blank slabs. Give those faces storeys too, in this scene only.
  const skin = new Dressing(sceneKit);
  city.group.updateMatrixWorld(true);
  city.group.traverse((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      sceneObject.name === 'static-merged' &&
      (sceneObject.material as THREE.MeshBasicMaterial).map
    )
      skinMergedBoxes(skin, cm, sceneObject, city.group, nRandom, {
        storey: 1.5,
        from: 1.1,
        minHeight: 10,
      });
  });
  skin.build(city.group);

  const receiver = createReceiver(sceneKit, sceneKit.root);
  const apron = new THREE.Group();
  sceneKit.root.add(apron);
  sceneKit.box({ p: [1.6, -0.17, -13.3], s: [10, 0.3, 13] }, floorMat, apron);
  for (const xPosition15 of [-3.3, 6.5]) {
    sceneKit.box(
      { p: [xPosition15, 0.15, -13.3], s: [0.18, 0.55, 13] },
      wall,
      apron,
    );
    for (const zPosition15 of [-8, -11, -14, -17, -19])
      cyl(
        0.04,
        0.85,
        [xPosition15, 0.77, zPosition15],
        aluminium,
        undefined,
        apron,
      );
    link(
      sceneKit,
      apron,
      new THREE.Vector3(xPosition15, 1.18, -7.8),
      new THREE.Vector3(xPosition15, 1.18, -19.4),
      0.035,
      aluminium,
    );
  }
  sceneKit.box(
    { p: [-2.1, 0.58, -17.8], s: [1.5, 1.16, 1.6] },
    graphite,
    apron,
  );
  for (let zPosition16 = -18.3; zPosition16 < -17.2; zPosition16 += 0.13)
    sceneKit.box(
      { p: [-2.1, 1.18, zPosition16], s: [1.3, 0.03, 0.055] },
      aluminium,
      apron,
    );
  batchSolids(apron, sceneKit);

  // Recorded fixes occupy the city itself; extrapolation continues past the final recorded point.
  const fixes = SIGNAL_FIXES.map((points2, index8) => {
    const group = new THREE.Group();
    group.name = `signal-fix-${index8 + 1}`;
    group.position.set(...points2);
    sceneKit.root.add(group);
    const pinMat = sceneKit.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: '#e4c78f',
        toneMapped: false,
        fog: false,
      }),
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.SphereGeometry(0.28, 10, 8)),
      pinMat,
      { p: [0, 0, 0] },
      group,
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.TorusGeometry(0.62, 0.035, 6, 32)),
      pinMat,
      { p: [0, 0, 0] },
      group,
    );
    group.visible = false;
    return group;
  });
  const recordedMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: '#bfcdaa',
      toneMapped: false,
      fog: false,
    }),
  );
  const recorded = SIGNAL_FIXES.slice(1).map((points2, index8) => {
    const mesh = link(
      sceneKit,
      sceneKit.root,
      new THREE.Vector3(...SIGNAL_FIXES[index8]),
      new THREE.Vector3(...points2),
      0.035,
      recordedMat,
      6,
    );
    mesh.visible = false;
    return mesh;
  });
  const traceMat = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uReveal: { value: 0 } },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 vUv;uniform float uTime;uniform float uReveal;void main(){if(vUv.x>uReveal)discard;float pulse=.5+.5*sin((vUv.x*30.-uTime*3.));gl_FragColor=vec4(vec3(1.,.56,.34)*(.6+pulse*.8),.82);}',
    }),
  );
  const tracePath = new THREE.CatmullRomCurve3([
    ...SIGNAL_FIXES.map((points2) => new THREE.Vector3(...points2)),
    new THREE.Vector3(-12, 34, -118),
  ]);
  const trace = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.TubeGeometry(tracePath, 96, 0.075, 6)),
    traceMat,
    { p: [0, 0, 0] },
  );
  trace.name = 'outbound-signal-trajectory';
  trace.visible = false;
  const boundary = sceneKit.haze(
    { p: [-12, 34, -119], s: [26, 26, 1] },
    '#d8a264',
    0,
  );

  // Four scene lights total. Floor pools add depth without extra shadow passes.
  const hemi = new THREE.HemisphereLight('#b3c7c2', '#1d2723', 0.85);
  sceneKit.root.add(hemi);
  const sky = new THREE.DirectionalLight('#a5c4da', 1.65);
  sky.position.set(-4, 12, -10);
  sceneKit.root.add(sky);
  const practical = new THREE.PointLight('#dd9d62', 8, 10, 1.7);
  practical.position.set(6.5, 3.2, 0.6);
  sceneKit.root.add(practical);
  const consoleGlow = new THREE.PointLight('#9bbfc2', 0.4, 7, 1.8);
  consoleGlow.position.set(0, 2, -0.6);
  sceneKit.root.add(consoleGlow);
  const warmPool = sceneKit.haze(
    { p: [6.1, 0.025, 0.8], s: [4.3, 4.3, 1], r: [-Math.PI / 2, 0, 0] },
    '#ce9b68',
    0.12,
  );
  const coolPool = sceneKit.haze(
    { p: [0, 0.027, -1.1], s: [5.2, 3.6, 1], r: [-Math.PI / 2, 0, 0] },
    '#81b3b6',
    0.025,
  );
  let reveal = 0;
  const viewDirection = new THREE.Vector3();
  return {
    root: sceneKit.root,
    update(
      timeSeconds: number,
      deltaSeconds: number,
      state: {
        powered: boolean;
        leads: number;
        snr: number;
        az: number;
        el: number;
        strength: number;
        traced: boolean;
        breakers: boolean[];
        traceCount?: number;
        readout?: boolean;
      },
      camera?: THREE.Camera,
    ) {
      readoutMat.opacity = THREE.MathUtils.damp(
        readoutMat.opacity,
        state.readout && state.powered ? 1 : 0,
        3,
        deltaSeconds,
      );
      readoutScreen.visible = readoutMat.opacity > 0.01;
      if (camera) {
        camera.getWorldDirection(viewDirection);
        const exterior =
          camera.position.z < -5.8 ||
          camera.position.y > 4.9 ||
          viewDirection.z < -0.65;
        city.group.visible =
          neighborhood.visible =
          receiver.root.visible =
          apron.visible =
            exterior;
      }
      const on = state.powered ? 1 : 0;
      panelMat.color.set(on ? '#d5d8bd' : '#343d39');
      practical.intensity = THREE.MathUtils.damp(
        practical.intensity,
        on ? 15 : 8,
        3,
        deltaSeconds,
      );
      consoleGlow.intensity = THREE.MathUtils.damp(
        consoleGlow.intensity,
        on ? 5 : 0.4,
        3,
        deltaSeconds,
      );
      screenMat.color.setScalar(
        on ? 0.62 + 0.38 * Math.min(1, state.strength / 100) : 0.025,
      );
      ledMat.color.set(on ? '#a8c69d' : '#253831');
      breakers.forEach((group, index8) => {
        group.rotation.z = THREE.MathUtils.damp(
          group.rotation.z,
          state.breakers[index8] ? 0.45 : -0.45,
          12,
          deltaSeconds,
        );
      });
      leads.forEach((material, index8) => {
        material.visible = index8 < state.leads;
      });
      receiver.update(state.az, state.el, deltaSeconds);
      const count = state.traced ? 4 : (state.traceCount ?? 0);
      fixes.forEach((fix, index8) => {
        fix.visible = index8 < count;
      });
      recorded.forEach((segment, index8) => {
        segment.visible = index8 + 1 < count;
      });
      reveal = THREE.MathUtils.damp(
        reveal,
        state.traced ? 1 : 0,
        1.2,
        deltaSeconds,
      );
      trace.visible = reveal > 0.01;
      traceMat.uniforms.uReveal.value = reveal;
      traceMat.uniforms.uTime.value = timeSeconds;
      boundary.visible = reveal > 0.01;
      (boundary.material as THREE.ShaderMaterial).uniforms.opacity.value =
        reveal * 0.38;
      (warmPool.material as THREE.ShaderMaterial).uniforms.opacity.value = on
        ? 0.16
        : 0.1;
      (coolPool.material as THREE.ShaderMaterial).uniforms.opacity.value = on
        ? 0.1
        : 0.025;
    },
    dispose() {
      city.dispose();
      floorMap.dispose();
      screenMap.dispose();
      readoutMap.dispose();
      sceneKit.dispose();
    },
  };
}
/**
 * Data contract used by regulator fitting and telemetry.
 */
export type Facility = ReturnType<typeof createFacility>;
