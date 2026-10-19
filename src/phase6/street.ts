import * as THREE from 'three';
import { createStreetImpacts } from './StreetImpacts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { createPortalDimension } from '../environment/PortalDimension.js';
import {
  Dressing,
  cityMaterials,
  buildingFrame,
  dressFacade,
  dressRoof,
  roadBreakup,
  skyline as farSkyline,
  utilityLines,
} from '../environment/CityDressing';

/**
 * Deeper into the same city: a service street running from the relay's yard to the old portal
 * site, a plaza where the first gate was built. The frame is dead, ringed in scaffolding, with a
 * work deck on its left; three ring segments on its face carry power from the feed at the top
 * round to the frame. A reader on a pedestal to its right listens for a signal and the frame opens
 * onto where that signal goes. Powered, it locks onto the strongest one nearby: Baymax's combat
 * chip, which is from this side, so the frame folds back on itself. With the chip pulled the
 * reader is clear, and a capture cartridge played into it tunes the frame. A steel walkway the old
 * crew left runs up over the ring's lower lip, so a load can be taken straight through.
 *
 * Same look as Phases 4 and 5: slate blocks, cyan haze, warm practicals, the displaced skyline.
 */
export const EYE = 1.62;
export const FRAME = new THREE.Vector3(0, 3.4, -92);
export const FRAME_R = 3.3;
export const DECK = { x: -3.55, y: 2.6, z: -90.2 };
/** The walkway through the ring: up from the paving to WALK_Y, flat through the frame. */
export const WALK_Y = 1,
  WALK_HALF = 1.55,
  RAMP_FROM = -87,
  RAMP_TO = -90.4,
  WALK_END = -93.6;
export const rampY = (zPosition: number) =>
  zPosition > RAMP_FROM
    ? 0
    : zPosition > RAMP_TO
      ? (WALK_Y * (RAMP_FROM - zPosition)) / (RAMP_FROM - RAMP_TO)
      : WALK_Y;
/** The gate's reader, on its pedestal to the right of the walkway. */
export const PEDESTAL = new THREE.Vector3(2.75, 0, -88.6);
/** The work deck's ladder, at its far (left) end, away from the walkway. */
export const LADDER_X = -4.9;
export const LANDING = new THREE.Vector3(-2.2, 0, -85.2);
export const ROUTE = new THREE.CatmullRomCurve3(
  [
    [0, EYE, 6],
    [0.9, EYE, -6],
    [-0.8, EYE, -18],
    [-0.4, EYE, -30],
    [1, EYE, -42],
    [0.2, EYE, -54],
    [-0.6, EYE, -66],
    [-1.2, EYE, -76],
  ].map(
    ([xPosition, yPosition, zPosition]) =>
      new THREE.Vector3(xPosition, yPosition, zPosition),
  ),
  false,
  'centripetal',
);
export const ROUTE_LENGTH = ROUTE.getLength();

/** Ring segments, outermost first: radius and where each one's two contacts sit (deg, clockwise from the top). */
export const RINGS = [
  { r: 2.95, in: 0, out: 140 },
  { r: 2.6, in: 0, out: 100 },
  { r: 2.25, in: 0, out: 80 },
];
/** The frame's own contacts: the feed at the top and the return the last segment must reach. */
export const FEED_AT = 0,
  RETURN_AT = 320;

/** How much of the feed reaches each junction: [feed→outer, outer→middle, middle→inner, inner→frame]. */
export function ringLive(angles: number[]) {
  const gap = (firstValue: number, secondValue: number) =>
    Math.abs(((((firstValue - secondValue) % 360) + 540) % 360) - 180);
  // Made within 1.5°; otherwise the reading falls off over 60°, so it can be followed by eye.
  const couple = (depth: number) =>
    depth < 1.5 ? 1 : Math.max(0, 1 - depth / 60) * 0.8;
  const live = [0, 0, 0, 0];
  let at = FEED_AT,
    upstream = 1;
  RINGS.forEach((ring, index) => {
    live[index] = upstream * couple(gap(angles[index] + ring.in, at));
    upstream = live[index] >= 1 ? 1 : 0;
    at = angles[index] + ring.out;
  });
  live[3] = upstream * couple(gap(at, RETURN_AT));
  return live;
}

const PORTAL_VS =
  'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
// The open gate: the far side seen through it (rendered each frame into uView), held in a slow
// dusk-purple swirl that blooms out from the socket.
const PORTAL_FS = `varying vec2 vUv;uniform sampler2D uView;uniform vec2 uRes;uniform float uOpen;uniform float uTime;uniform float uFlash;
void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
float edge=uOpen;if(r>edge)discard;
float swirl=sin(a*5.+r*9.-uTime*1.6)*.5+.5;float ripple=sin(r*22.-uTime*4.)*.004*(1.-r);
vec2 suv=gl_FragCoord.xy/uRes+vec2(cos(a),sin(a))*ripple;
vec3 view=texture2D(uView,suv).rgb;
vec3 dusk=vec3(.357,.294,.541);vec3 glow=vec3(.85,.78,1.);
float rim=smoothstep(edge-.32,edge,r);
float clear=smoothstep(.95,.2,r/max(edge,.001))*smoothstep(.15,.8,uOpen);
vec3 col=mix(dusk*(.7+swirl*.6),view,clear*.92);
col+=glow*rim*(.8+swirl*.5)+dusk*(1.-clear)*.4;
col=mix(col,vec3(.06,.045,.11),uFlash*.85);
gl_FragColor=vec4(col,1.);}`;

/**
 * Paint the road-impact crack mask used by the street effects.
 */
function crackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const drawingContext = canvas.getContext('2d')!;
  const random = seeded(808);
  drawingContext.strokeStyle = 'rgba(8,14,20,.95)';
  drawingContext.lineCap = 'round';
  for (let index = 0; index < 14; index++) {
    let px = 256,
      py = 256,
      firstValue = (index / 14) * Math.PI * 2 + random() * 0.3,
      width = 7;
    drawingContext.beginPath();
    drawingContext.moveTo(px, py);
    for (let scaleFactor = 0; scaleFactor < 9; scaleFactor++) {
      firstValue += (random() - 0.5) * 0.7;
      const len = 14 + random() * 22;
      px += Math.cos(firstValue) * len;
      py += Math.sin(firstValue) * len;
      drawingContext.lineWidth = width;
      drawingContext.lineTo(px, py);
      width *= 0.78;
    }
    drawingContext.stroke();
  }
  // A crushed centre and a ring of broken edges.
  const grd = drawingContext.createRadialGradient(256, 256, 0, 256, 256, 90);
  grd.addColorStop(0, 'rgba(5,9,12,.85)');
  grd.addColorStop(1, 'rgba(5,9,12,0)');
  drawingContext.fillStyle = grd;
  drawingContext.fillRect(0, 0, 512, 512);
  drawingContext.lineWidth = 2.5;
  for (let index2 = 0; index2 < 26; index2++) {
    const firstValue2 = random() * Math.PI * 2,
      radius = 60 + random() * 40;
    drawingContext.beginPath();
    drawingContext.arc(
      256,
      256,
      radius,
      firstValue2,
      firstValue2 + 0.25 + random() * 0.3,
    );
    drawingContext.stroke();
  }
  const timeSeconds = new THREE.CanvasTexture(canvas);
  timeSeconds.colorSpace = THREE.SRGBColorSpace;
  return timeSeconds;
}

/**
 * Paint a soft radial particle mask.
 */
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const drawingContext = canvas.getContext('2d')!;
  const group = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  group.addColorStop(0, 'rgba(255,255,255,1)');
  group.addColorStop(0.5, 'rgba(255,255,255,.35)');
  group.addColorStop(1, 'rgba(255,255,255,0)');
  drawingContext.fillStyle = group;
  drawingContext.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Build the Phase 6 street, portal infrastructure and interaction targets.
 */
export function createStreet() {
  const sceneKit = new SceneKit('phase6-street');
  const random = seeded(6606),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  const skyline = createPortalDimension();
  skyline.group.position.set(4, -6, -200);
  skyline.group.scale.setScalar(1.35);
  skyline.group.traverse((sceneObject) => {
    sceneObject.castShadow = false;
  });
  sceneKit.root.add(skyline.group);

  // --- The street: lane, heaved slabs, kerbs, the same slate blocks with window rows.
  const streetFrom = sceneKit.root.children.length;
  // Storey-scaled facades, roofs, wires, broken asphalt and the far skyline are instanced by the
  // city dressing kit (one draw per piece and material), built once at the end of this function.
  const dress = new Dressing(sceneKit),
    cm = cityMaterials(sceneKit);
  sceneKit.box({ p: [0, -0.3, -34], s: [13, 0.6, 92] }, sceneKit.edge);
  sceneKit.box({ p: [0, 0.01, -34], s: [12.4, 0.04, 91.4] }, cm.asphalt);
  const marks: ScenePlacement[] = [];
  for (let index = 0; index < 24; index++)
    marks.push({ p: [0.1, 0.04, 6 - index * 3.3], s: [0.1, 0.02, 1.4] });
  sceneKit.instances(marks, sceneKit.metal);
  for (const [xPosition, zPosition, rotationX, rotationZ] of [
    [-3.9, -10, 0.12, 0.1],
    [4, -24, -0.12, -0.15],
    [-4.3, -39, 0.1, -0.08],
    [3.7, -52, -0.15, 0.12],
    [-3.6, -63, 0.08, 0.1],
  ])
    sceneKit.box(
      {
        p: [xPosition, 0.1, zPosition],
        s: [3.2, 0.22, 3.6],
        r: [rotationX, randomBetween(-0.3, 0.3), rotationZ],
      },
      sceneKit.concrete,
    );
  for (const side of [-1, 1])
    for (let zPosition2 = 4; zPosition2 > -72; zPosition2 -= 5.5)
      if (random() > 0.25)
        sceneKit.box(
          {
            p: [side * 5.9, 0.32, zPosition2],
            s: [0.45, 0.65, randomBetween(2.2, 4)],
            r: [0, 0, side * randomBetween(0, 0.05)],
          },
          sceneKit.ivory,
        );
  const cracks: { x: number; y: number; z: number; side: number }[] = [];
  // Tracker Q-07: more facade colours than ivory and slate, darker trim, warm awnings and neon.
  const tones = [
    sceneKit.standard('#4a5a66', 0.9, 0.08),
    sceneKit.standard('#8a9294', 0.85, 0.06),
    sceneKit.standard('#5b6670', 0.88, 0.1),
    sceneKit.standard('#6f6964', 0.9, 0.06),
    sceneKit.standard('#3c4a55', 0.9, 0.1),
    sceneKit.standard('#776154', 0.9, 0.05),
  ];
  const trim = sceneKit.standard('#26343e', 0.8, 0.3);
  const awnings = [
    sceneKit.standard('#9c3f2c', 0.85, 0.05),
    sceneKit.standard('#2f6c78', 0.85, 0.05),
    sceneKit.standard('#b08436', 0.85, 0.05),
  ];
  const neon = [
    sceneKit.basic('#ff5a8a', 1.5),
    sceneKit.basic('#7fe6ff', 1.3),
    sceneKit.basic('#ffc062', 1.4),
  ];
  const block = (
    xPosition2: number,
    zPosition3: number,
    width: number,
    height: number,
    depth: number,
    side: number,
    back = false,
  ) => {
    // Every piece is placed in the block's own frame, so a leaning building carries its windows with it.
    const rotationY = side * randomBetween(-0.06, 0.06),
      tilt = side * randomBetween(-0.05, 0.07),
      entries: [number, number, number] = [0, rotationY, tilt];
    const frame = new THREE.Object3D();
    frame.position.set(xPosition2, 0, zPosition3);
    frame.rotation.set(0, rotationY, tilt);
    frame.updateMatrix();
    const vector = (localX: number, localY: number, localZ: number) =>
      new THREE.Vector3(localX, localY, localZ)
        .applyMatrix4(frame.matrix)
        .toArray() as [number, number, number];
    const tone = tones[Math.floor(random() * tones.length)];
    sceneKit.box(
      {
        p: vector(0, height / 2 - 0.05, 0),
        s: [width, height, depth],
        r: entries,
      },
      tone,
    );
    const scaleX = -side * (width / 2 + 0.02);
    // Storey-height windows, floor bands, AC units and balconies on the street face and both ends;
    // roofs carry a parapet, tanks, plant, a mast or a sign. The tallest back blocks get tiered caps.
    const bf = buildingFrame(xPosition2, zPosition3, rotationY, tilt);
    dressFacade(
      dress,
      cm,
      bf,
      width,
      height,
      depth,
      [side > 0 ? '-x' : '+x', '+z', '-z'],
      random,
      { from: back ? 1.2 : 4.2 },
    );
    dressRoof(dress, cm, bf, width, height, depth, random, {
      tower: back && height > 26,
      sign: !back && random() > 0.7,
    });
    // Pilasters between the bays.
    for (const componentValue of [-0.5, -1 / 6, 1 / 6, 0.5])
      sceneKit.box(
        {
          p: vector(
            scaleX - side * 0.08,
            height / 2,
            componentValue * depth * 0.97,
          ),
          s: [0.14, height, 0.2],
          r: entries,
        },
        trim,
      );
    if (back) return;
    // Shopfront: a dark band, ledges, sometimes an awning or a neon blade sign.
    sceneKit.box(
      {
        p: vector(scaleX - side * 0.02, 1.6, 0),
        s: [0.08, 3.2, depth * 0.96],
        r: entries,
      },
      sceneKit.dark,
    );
    for (const yPosition of [3.4, height * 0.62])
      sceneKit.box(
        {
          p: vector(-side * (width / 2 + 0.12), yPosition, 0),
          s: [0.24, 0.14, depth * 1.02],
          r: entries,
        },
        sceneKit.metal,
      );
    if (random() > 0.4)
      sceneKit.box(
        {
          p: vector(
            scaleX - side * 0.55,
            3.05,
            randomBetween(-depth / 6, depth / 6),
          ),
          s: [1.1, 0.08, depth * 0.6],
          r: [0, rotationY, tilt + side * 0.28],
        },
        awnings[Math.floor(random() * awnings.length)],
      );
    if (random() > 0.5)
      sceneKit.box(
        {
          p: vector(
            scaleX - side * 0.4,
            randomBetween(4.6, 7.2),
            randomBetween(-depth / 3, depth / 3),
          ),
          s: [0.1, randomBetween(1.6, 2.8), 0.45],
          r: entries,
        },
        neon[Math.floor(random() * neon.length)],
      );
    if (random() > 0.55)
      cracks.push({
        x: xPosition2 + scaleX - side * 0.03,
        y: randomBetween(4, height - 1),
        z: zPosition3 + randomBetween(-depth / 3, depth / 3),
        side,
      });
    // A storey or two sheared off the roof and hanging askew: smaller than the block, in its colour.
    if (random() > 0.72)
      sceneKit.box(
        {
          p: vector(0, height + randomBetween(1, 2.2), randomBetween(-1, 1)),
          s: [width * 0.7, randomBetween(1.6, 2.6), depth * 0.7],
          r: [
            randomBetween(-0.15, 0.15),
            rotationY + randomBetween(-0.4, 0.4),
            tilt + randomBetween(-0.2, 0.2),
          ],
        },
        tone,
      );
  };
  for (const side of [-1, 1])
    for (
      let zPosition4 = 8;
      zPosition4 > -74;
      zPosition4 -= randomBetween(6.5, 8.5)
    ) {
      const width2 = randomBetween(4, 6.5);
      block(
        side * (7.4 + width2 / 2 + randomBetween(0, 1.2)),
        zPosition4,
        width2,
        randomBetween(8, 19),
        randomBetween(5, 7),
        side,
      );
    }
  // A taller back row, so the skyline steps up in layers instead of ending at one roofline.
  for (const side of [-1, 1])
    for (
      let zPosition5 = 4;
      zPosition5 > -80;
      zPosition5 -= randomBetween(8, 11)
    ) {
      const width3 = randomBetween(5, 8);
      block(
        side * (17 + width3 / 2 + randomBetween(0, 3)),
        zPosition5,
        width3,
        randomBetween(18, 32),
        randomBetween(6, 8),
        side,
        true,
      );
    }
  // Asphalt repairs, manholes, cracks and standing water down the lane; poles and wires on the left kerb.
  roadBreakup(dress, cm, random, {
    x: [-5.2, 5.2],
    z: [-73, 7],
    y: 0.03,
    count: 46,
  });
  utilityLines(
    dress,
    cm,
    random,
    [
      [-6.9, 2],
      [-6.9, -13],
      [-6.9, -26],
      [-6.9, -41],
      [-6.9, -52],
      [-6.9, -66],
    ],
    { across: 7.4 },
  );
  // Cyan cracks: jagged slivers on the facades, one shared material that pulses.
  const crackGlow = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      color: '#7fe6ff',
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  const slivers: THREE.BufferGeometry[] = [],
    at = new THREE.Object3D();
  for (const componentValue2 of cracks)
    for (let segmentIndex = 0; segmentIndex < 4; segmentIndex++) {
      at.position.set(
        componentValue2.x,
        componentValue2.y + segmentIndex * 0.55 * (segmentIndex % 2 ? 1 : -1),
        componentValue2.z + segmentIndex * 0.25,
      );
      at.rotation.set(0, Math.PI / 2, randomBetween(-0.7, 0.7));
      at.scale.set(1, randomBetween(0.6, 1.5), 1);
      at.updateMatrix();
      slivers.push(new THREE.PlaneGeometry(0.12, 1).applyMatrix4(at.matrix));
    }
  if (slivers.length) {
    const geometry = mergeGeometries(slivers, false);
    slivers.forEach((geometry2) => geometry2.dispose());
    if (geometry)
      sceneKit.root.add(
        new THREE.Mesh(sceneKit.ownGeometry(geometry), crackGlow),
      );
  }
  // Cables strung across the street, sagging; two snapped ones hanging live, sparking.
  const cableMat = sceneKit.ownMaterial(
    new THREE.MeshStandardMaterial({ color: '#15191c', roughness: 0.8 }),
  );
  for (const [zPosition6, yPosition2] of [
    [-6, 7.5],
    [-17, 9],
    [-29, 6.8],
    [-44, 8.4],
    [-61, 7.2],
  ]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-7.4, yPosition2, zPosition6),
      new THREE.Vector3(
        0,
        yPosition2 - randomBetween(1.2, 2.2),
        zPosition6 + randomBetween(-0.6, 0.6),
      ),
      new THREE.Vector3(
        7.4,
        yPosition2 + randomBetween(-0.6, 0.6),
        zPosition6 + randomBetween(-1, 1),
      ),
    ]);
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.TubeGeometry(curve, 24, 0.035, 5)),
      cableMat,
      { p: [0, 0, 0] },
    );
  }
  const sparks: THREE.Mesh[] = [];
  for (const [xPosition3, zPosition7] of [
    [-7.2, -24],
    [7.2, -48],
  ]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xPosition3, 8, zPosition7),
      new THREE.Vector3(xPosition3 * 0.8, 5, zPosition7 + 0.3),
      new THREE.Vector3(xPosition3 * 0.72, 2.6, zPosition7 - 0.2),
    ]);
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.TubeGeometry(curve, 16, 0.03, 5)),
      cableMat,
      { p: [0, 0, 0] },
    );
    sparks.push(
      sceneKit.mesh(
        sceneKit.ownGeometry(new THREE.SphereGeometry(0.09, 8, 6)),
        sceneKit.basic('#d9f6ff', 3),
        { p: [xPosition3 * 0.72, 2.55, zPosition7 - 0.2] },
      ),
    );
  }
  for (let index2 = 0; index2 < 10; index2++)
    sceneKit.box(
      {
        p: [randomBetween(-9, 9), randomBetween(9, 18), randomBetween(-70, 4)],
        s: [
          randomBetween(0.6, 2.4),
          randomBetween(0.3, 1),
          randomBetween(0.6, 2),
        ],
        r: [randomBetween(0, 3), randomBetween(0, 3), randomBetween(0, 3)],
      },
      sceneKit.concrete,
    );
  // Signs toward the old gate.
  // Posts on the kerb line and boards hung high and short of the lane, so nothing tall walks through them.
  const signs: [string, number, number, string][] = [
    ['旧ゲート跡 GATE SITE  →  400 m', -5.4, -12, '#8fe9ff'],
    ['立入禁止 / NO ENTRY', 5.4, -33, '#ff9a63'],
    ['GATE SITE  ゲート  →  90 m', -5.4, -56, '#8fe9ff'],
  ];
  for (const [text, xPosition4, zPosition8, color] of signs) {
    sceneKit.box(
      { p: [xPosition4, 2.45, zPosition8], s: [0.12, 4.9, 0.12] },
      sceneKit.metal,
    );
    sceneKit.box(
      {
        p: [xPosition4 - Math.sign(xPosition4) * 1.6, 4.65, zPosition8],
        s: [3.3, 0.55, 0.08],
      },
      sceneKit.dark,
    );
    sceneKit.label(
      text,
      {
        p: [
          xPosition4 - Math.sign(xPosition4) * 1.6 + 0.2,
          4.62,
          zPosition8 + 0.05,
        ],
      },
      3.5,
      color,
    );
  }
  const lamps: THREE.Vector3[] = [];
  for (const [xPosition5, zPosition9, live] of [
    [5.3, -4, true],
    [-5.3, -20, false],
    [5.3, -38, true],
    [-5.3, -58, true],
    [5.3, -70, false],
  ] as [number, number, boolean][]) {
    sceneKit.box(
      {
        p: [xPosition5, 2.6, zPosition9],
        s: [0.14, 5.2, 0.14],
        r: [0, 0, Math.sign(xPosition5) * 0.04],
      },
      sceneKit.metal,
    );
    sceneKit.box(
      {
        p: [xPosition5 - Math.sign(xPosition5) * 0.6, 5.15, zPosition9],
        s: [1.3, 0.1, 0.1],
      },
      sceneKit.metal,
    );
    sceneKit.mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      live ? sceneKit.basic('#ffc062', 1.6) : sceneKit.dark,
      { p: [xPosition5 - Math.sign(xPosition5) * 1.2, 5.05, zPosition9] },
    );
    if (live)
      lamps.push(
        new THREE.Vector3(
          xPosition5 - Math.sign(xPosition5) * 1.2,
          4.9,
          zPosition9,
        ),
      );
  }

  // Tracker PW-08: the run's city never moves, so its hundreds of boxes merge into one mesh per
  // material (a few dozen draw calls instead of several hundred). Sparks and cracks stay separate.
  {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>(),
      merged: THREE.Mesh[] = [];
    sceneKit.root.updateMatrixWorld(true);
    for (const sceneObject2 of sceneKit.root.children.slice(streetFrom)) {
      if (
        !(sceneObject2 instanceof THREE.Mesh) ||
        sceneObject2 instanceof THREE.InstancedMesh ||
        Array.isArray(sceneObject2.material) ||
        sceneObject2.material.transparent ||
        sparks.includes(sceneObject2)
      )
        continue;
      let group = sceneObject2.geometry
        .clone()
        .applyMatrix4(sceneObject2.matrixWorld);
      if (group.index) {
        const node = group.toNonIndexed();
        group.dispose();
        group = node;
      }
      for (const name of Object.keys(group.attributes))
        if (!['position', 'normal', 'uv'].includes(name))
          group.deleteAttribute(name);
      if (!group.getAttribute('uv'))
        group.setAttribute(
          'uv',
          new THREE.BufferAttribute(
            new Float32Array(group.getAttribute('position').count * 2),
            2,
          ),
        );
      const list = batches.get(sceneObject2.material) ?? [];
      list.push(group);
      batches.set(sceneObject2.material, list);
      merged.push(sceneObject2);
    }
    for (const [material, list] of batches) {
      const geometry3 = mergeGeometries(list, false);
      list.forEach((geometry2) => geometry2.dispose());
      if (!geometry3) continue;
      const mesh = new THREE.Mesh(sceneKit.ownGeometry(geometry3), material);
      mesh.castShadow = mesh.receiveShadow = true;
      sceneKit.root.add(mesh);
    }
    merged.forEach((material2) => material2.removeFromParent());
  }
  // --- The plaza: wider paving, broken blocks around its edge, barriers across the old perimeter.
  sceneKit.box({ p: [0, -0.3, -94], s: [36, 0.6, 34] }, sceneKit.edge);
  sceneKit.box(
    { p: [0, 0.015, -94], s: [35.4, 0.04, 33.4] },
    sceneKit.concrete,
  );
  const tiles: ScenePlacement[] = [];
  for (let xPosition6 = -16; xPosition6 <= 16; xPosition6 += 2.2)
    for (let zPosition10 = -79; zPosition10 > -110; zPosition10 -= 2.2)
      if (random() > 0.2)
        tiles.push({
          p: [xPosition6 + randomBetween(-0.05, 0.05), 0.045, zPosition10],
          s: [2.1, 0.02, 2.1],
          r: [0, randomBetween(-0.02, 0.02), 0],
        });
  sceneKit.instances(tiles, sceneKit.edge);
  for (const side of [-1, 1])
    for (
      let zPosition11 = -80;
      zPosition11 > -108;
      zPosition11 -= randomBetween(7, 9)
    ) {
      const width4 = randomBetween(5, 7);
      block(
        side * (18 + width4 / 2),
        zPosition11,
        width4,
        randomBetween(10, 22),
        randomBetween(6, 8),
        side,
      );
    }
  for (let xPosition7 = -14; xPosition7 <= 14; xPosition7 += 7)
    block(
      xPosition7 + randomBetween(-1, 1),
      -114 - randomBetween(0, 3),
      randomBetween(5, 7),
      randomBetween(12, 24),
      6,
      1,
    );
  for (const [xPosition8, zPosition12, radius] of [
    [-9, -80, 0.3],
    [9.5, -81, -0.2],
    [-12, -98, 0.1],
    [12, -100, -0.4],
  ]) {
    sceneKit.box(
      {
        p: [xPosition8, 0.55, zPosition12],
        s: [2.6, 1.1, 0.5],
        r: [0, radius, 0],
      },
      sceneKit.ivory,
    );
    sceneKit.box(
      {
        p: [xPosition8, 1.15, zPosition12],
        s: [2.6, 0.1, 0.55],
        r: [0, radius, 0],
      },
      sceneKit.basic('#b18b5d', 0.9),
    );
  }
  sceneKit.label(
    'PORTAL RESEARCH SITE · 旧ゲート',
    { p: [-9, 1.6, -79.7] },
    4,
    '#e8cf9c',
  );
  roadBreakup(dress, cm, random, {
    x: [-15, 15],
    z: [-108, -80],
    y: 0.056,
    count: 26,
  });
  // Far city: towers in bands past the plaza and behind the street's start, fading into the fog.
  const far = [
    sceneKit.standard('#2b3945', 0.9, 0.1),
    sceneKit.standard('#34404a', 0.9, 0.1),
    sceneKit.standard('#3d3a40', 0.9, 0.08),
  ];
  farSkyline(dress, cm, random, {
    x: [-60, 60],
    z: [-150, -125],
    count: 14,
    h: [28, 58],
    tones: far,
  });
  farSkyline(dress, cm, random, {
    x: [-34, 34],
    z: [22, 46],
    count: 9,
    h: [18, 40],
    facing: -1,
    tones: far,
  });
  dress.build();
  sceneKit.haze({ p: [0, 9, -122], s: [120, 30, 1] }, '#4a7a96', 0.16);
  sceneKit.haze({ p: [0, 7, 18], s: [80, 24, 1] }, '#4a7a96', 0.12);

  // --- The frame: a heavy ring standing in a cradle, the feed cable climbing to its crown.
  const frame = new THREE.Group();
  frame.position.copy(FRAME);
  sceneKit.root.add(frame);
  const frameMat = sceneKit.standard('#40525e', 0.55, 0.6);
  const frameGlow = sceneKit.ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#3a4a56',
      roughness: 0.4,
      metalness: 0.6,
      emissive: '#5B4B8A',
      emissiveIntensity: 0,
    }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.TorusGeometry(FRAME_R, 0.32, 20, 96)),
    frameGlow,
    { p: [0, 0, 0] },
    frame,
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.TorusGeometry(FRAME_R + 0.38, 0.09, 10, 96)),
    frameMat,
    { p: [0, 0, -0.18] },
    frame,
  );
  for (let index3 = 0; index3 < 16; index3++) {
    const firstValue = (index3 / 16) * Math.PI * 2;
    sceneKit.box(
      {
        p: [
          Math.sin(firstValue) * (FRAME_R + 0.05),
          Math.cos(firstValue) * (FRAME_R + 0.05),
          0.18,
        ],
        s: [0.34, 0.5, 0.2],
        r: [0, 0, -firstValue],
      },
      sceneKit.dark,
      frame,
    );
  }
  for (const side of [-1, 1]) {
    sceneKit.box(
      {
        p: [side * 2.3, -FRAME_R + 0.3, -0.1],
        s: [1.6, 1, 1.6],
        r: [0, 0, side * 0.5],
      },
      sceneKit.concrete,
      frame,
    );
    sceneKit.box(
      { p: [side * 3.4, -FRAME_R + 0.6, 0], s: [0.9, 1.6, 1.3] },
      sceneKit.metal,
      frame,
    );
  }
  // Feed: a cable from the plaza edge up the back of the ring into the top contact.
  const feedCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(10, 0.06, -100),
    new THREE.Vector3(4, 0.08, -94),
    new THREE.Vector3(2.2, 2.2, -92.6),
    new THREE.Vector3(0.4, FRAME.y + FRAME_R + 0.3, -92.5),
    new THREE.Vector3(0, FRAME.y + FRAME_R + 0.1, -92.1),
  ]);
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.TubeGeometry(feedCurve, 60, 0.07, 8)),
    sceneKit.dark,
    { p: [0, 0, 0] },
  );
  const feedLamp = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#ffb066', toneMapped: false }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.BoxGeometry(0.32, 0.22, 0.16)),
    feedLamp,
    { p: [0, FRAME_R - 0.12, 0.34] },
    frame,
  );
  // Spokes from the ring to the hub, set back so the segments turn in front of them.
  const spokes: THREE.Mesh[] = [];
  for (let index4 = 0; index4 < 4; index4++) {
    const firstValue2 = Math.PI / 4 + (index4 * Math.PI) / 2;
    const material3 = sceneKit.box(
      {
        p: [
          (Math.sin(firstValue2) * FRAME_R) / 2,
          (Math.cos(firstValue2) * FRAME_R) / 2,
          -0.12,
        ],
        s: [0.12, FRAME_R - 0.2, 0.1],
        r: [0, 0, -firstValue2],
      },
      sceneKit.metal,
      frame,
    );
    spokes.push(material3);
  }
  // The hub, where the spokes meet. Its face is the emitter: dark glass that lights with whatever the reader plays.
  const hub = new THREE.Group();
  hub.position.z = 0.05;
  frame.add(hub);
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CylinderGeometry(0.42, 0.46, 0.3, 32)),
    sceneKit.dark,
    { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
    hub,
  );
  const lens = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#05080b', toneMapped: false }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CircleGeometry(0.3, 32)),
    lens,
    { p: [0, 0, 0.152] },
    hub,
  );
  const socketRim = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#1a2026', toneMapped: false }),
  );
  const rimGeo = sceneKit.ownGeometry(
    new THREE.TorusGeometry(0.4, 0.02, 8, 48),
  );
  sceneKit.mesh(rimGeo, socketRim, { p: [0, 0, 0.155] }, hub);

  // Ring segments: each a near-full ring with a break, carrying an in and an out contact.
  const segments = RINGS.map((ring, index5) => {
    const group2 = new THREE.Group();
    group2.position.z = 0.34 + index5 * 0.05;
    frame.add(group2);
    // The break sits on the unused side, between the out contact and the in contact.
    const gap = ring.out + (360 - ring.out) / 2;
    sceneKit.mesh(
      sceneKit.ownGeometry(
        new THREE.TorusGeometry(ring.r, 0.07, 10, 96, Math.PI * 2 - 0.35),
      ),
      frameMat,
      { p: [0, 0, 0], r: [0, 0, ((100 - gap) * Math.PI) / 180] },
      group2,
    );
    const contactMats = [0, 1].map(() =>
      sceneKit.ownMaterial(
        new THREE.MeshBasicMaterial({ color: '#7a4a24', toneMapped: false }),
      ),
    );
    [ring.in, ring.out].forEach((deg, segmentIndex2) => {
      const firstValue3 = (deg * Math.PI) / 180;
      sceneKit.box(
        {
          p: [
            Math.sin(firstValue3) * ring.r,
            Math.cos(firstValue3) * ring.r,
            0.03,
          ],
          s: [0.2, 0.16, 0.14],
          r: [0, 0, -firstValue3],
        },
        contactMats[segmentIndex2],
        group2,
      );
    });
    return { g: group2, contactMats };
  });
  const feedLight = new THREE.PointLight('#ffb066', 0, 5, 2);
  feedLight.position.set(0, FRAME_R, 0.8);
  frame.add(feedLight);

  // Scaffolding: a full tower behind the ring, and in front only the bay that carries the work
  // deck on the left, so the opening itself stays clear. A ladder runs up the deck's inner end.
  const scaff = sceneKit.standard('#7d8b92', 0.5, 0.55),
    plank = sceneKit.standard('#6a5848', 0.85, 0.05);
  // The front bay stops well short of the walkway, and its ladder is at the far end.
  const BACK = -94.6,
    FRONT = -89.4,
    DL = -5.2,
    DR = -1.9;
  for (const xPosition9 of [-5.4, -3.6, -1.6, 1.6, 3.6, 5.4])
    sceneKit.box({ p: [xPosition9, 4.3, BACK], s: [0.07, 8.6, 0.07] }, scaff);
  for (const yPosition3 of [1.2, 2.6, 4.6, 6.6, 8.2])
    sceneKit.box({ p: [0, yPosition3, BACK], s: [11, 0.06, 0.06] }, scaff);
  for (const [xPosition10, yPosition4] of [
    [-4.5, 3.6],
    [-2.6, 5.6],
    [2.6, 3.6],
    [4.5, 5.6],
  ])
    sceneKit.box(
      {
        p: [xPosition10, yPosition4, BACK],
        s: [2.2, 0.05, 0.05],
        r: [0, 0, xPosition10 < 0 ? 0.78 : -0.78],
      },
      scaff,
    );
  for (const xPosition11 of [-5.4, 5.4]) {
    sceneKit.box({ p: [xPosition11, 4.3, -92], s: [0.07, 8.6, 0.07] }, scaff);
    for (const yPosition5 of [2.6, 6.6])
      sceneKit.box(
        { p: [xPosition11, yPosition5, -92], s: [0.06, 0.06, 5.2] },
        scaff,
      );
  }
  for (const xPosition12 of [DL, DR])
    sceneKit.box(
      {
        p: [xPosition12, (DECK.y + 1) / 2, FRONT],
        s: [0.07, DECK.y + 1, 0.07],
      },
      scaff,
    );
  for (const yPosition6 of [1.2, DECK.y - 0.05])
    sceneKit.box(
      { p: [(DL + DR) / 2, yPosition6, FRONT], s: [DR - DL, 0.06, 0.06] },
      scaff,
    );
  sceneKit.box(
    { p: [(DL + DR) / 2, DECK.y + 0.95, FRONT], s: [DR - DL, 0.05, 0.05] },
    scaff,
  );
  for (const xPosition13 of [DL, DR])
    sceneKit.box(
      { p: [xPosition13, DECK.y / 2, -91.3], s: [0.07, DECK.y, 0.07] },
      scaff,
    );
  sceneKit.box(
    { p: [DECK.x, DECK.y - 0.05, -90.3], s: [DR - DL + 0.1, 0.1, 1.9] },
    plank,
  );
  sceneKit.box({ p: [3.6, 6.55, -93.4], s: [3.4, 0.1, 1.6] }, plank);
  for (let yPosition7 = 0.3; yPosition7 < DECK.y; yPosition7 += 0.35)
    sceneKit.box(
      { p: [LADDER_X, yPosition7, FRONT + 0.05], s: [0.5, 0.04, 0.04] },
      scaff,
    );
  for (const xPosition14 of [LADDER_X - 0.25, LADDER_X + 0.25])
    sceneKit.box(
      {
        p: [xPosition14, DECK.y / 2, FRONT + 0.05],
        s: [0.05, DECK.y + 0.9, 0.05],
      },
      scaff,
    );

  // The walkway: a ramp up from the paving, then a plate across the lower lip of the ring.
  const steel = sceneKit.standard('#5d6a70', 0.45, 0.7),
    tread = sceneKit.standard('#2b3236', 0.8, 0.3);
  const rampLen = Math.hypot(RAMP_FROM - RAMP_TO, WALK_Y),
    rampTilt = Math.atan2(WALK_Y, RAMP_FROM - RAMP_TO);
  sceneKit.box(
    {
      p: [0, WALK_Y / 2 - 0.05, (RAMP_FROM + RAMP_TO) / 2],
      s: [WALK_HALF * 2, 0.1, rampLen],
      r: [rampTilt, 0, 0],
    },
    steel,
  );
  sceneKit.box(
    {
      p: [0, WALK_Y - 0.05, (RAMP_TO + WALK_END) / 2],
      s: [WALK_HALF * 2, 0.1, RAMP_TO - WALK_END],
    },
    steel,
  );
  const treads: ScenePlacement[] = [];
  for (
    let zPosition13 = RAMP_FROM - 0.25;
    zPosition13 > WALK_END + 0.1;
    zPosition13 -= 0.45
  )
    treads.push({
      p: [0, rampY(zPosition13) + 0.006, zPosition13],
      s: [WALK_HALF * 2 - 0.2, 0.012, 0.07],
      r: [zPosition13 > RAMP_TO ? rampTilt : 0, 0, 0],
    });
  sceneKit.instances(treads, tread);
  for (const xPosition15 of [-WALK_HALF + 0.1, WALK_HALF - 0.1])
    for (const zPosition14 of [-88.6, RAMP_TO, -92.9])
      sceneKit.box(
        {
          p: [xPosition15, rampY(zPosition14) / 2, zPosition14],
          s: [0.1, rampY(zPosition14), 0.1],
        },
        steel,
      );
  for (const xPosition16 of [-WALK_HALF, WALK_HALF])
    sceneKit.box(
      {
        p: [xPosition16, WALK_Y + 0.03, (RAMP_TO + WALK_END) / 2],
        s: [0.05, 0.06, RAMP_TO - WALK_END],
      },
      sceneKit.basic('#c9a24a', 0.7),
    );

  // The reader: a waist-high pedestal with a slanted face, a cartridge slot and a small screen.
  const ped = new THREE.Group();
  ped.position.copy(PEDESTAL);
  sceneKit.root.add(ped);
  sceneKit.box({ p: [0, 0.5, 0], s: [0.34, 1, 0.3] }, sceneKit.metal, ped);
  sceneKit.box({ p: [0, 0.03, 0], s: [0.6, 0.06, 0.5] }, sceneKit.dark, ped);
  const head = new THREE.Group();
  head.position.set(0, 1.04, 0.02);
  head.rotation.x = 0.55;
  ped.add(head);
  sceneKit.box({ p: [0, 0, 0], s: [0.5, 0.08, 0.36] }, sceneKit.dark, head);
  const readerScreen = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#16211c', toneMapped: false }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(0.3, 0.12)),
    readerScreen,
    { p: [0, 0.041, -0.09], r: [-Math.PI / 2, 0, 0] },
    head,
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(0.14, 0.024)),
    sceneKit.ownMaterial(new THREE.MeshBasicMaterial({ color: '#030506' })),
    { p: [0, 0.041, 0.08], r: [-Math.PI / 2, 0, 0] },
    head,
  );
  const readerLamp = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({ color: '#3a2a20', toneMapped: false }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CircleGeometry(0.012, 12)),
    readerLamp,
    { p: [0.17, 0.041, 0.08], r: [-Math.PI / 2, 0, 0] },
    head,
  );
  sceneKit.label(
    'READER  旧ゲート',
    { p: [0, 0.042, 0.145], r: [-Math.PI / 2, 0, 0] },
    0.32,
    '#c5b484',
    head,
  );
  const slot = new THREE.Object3D();
  slot.position.set(0, 0.046, 0.08);
  head.add(slot);
  // Its cable runs along the paving to the frame's cradle.
  sceneKit.mesh(
    sceneKit.ownGeometry(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(PEDESTAL.x, 0.05, PEDESTAL.z - 0.12),
          new THREE.Vector3(2.95, 0.05, -90.4),
          new THREE.Vector3(3.3, 0.3, -91.6),
        ]),
        20,
        0.035,
        6,
      ),
    ),
    sceneKit.dark,
    { p: [0, 0, 0] },
  );

  // Debris for the chase: chunks that come off the blocks, fall, bounce once and settle.
  const chunkGeo = sceneKit.ownGeometry(new THREE.DodecahedronGeometry(1, 0));
  const chunks = Array.from({ length: 8 }, () => {
    const material2 = sceneKit.mesh(chunkGeo, sceneKit.concrete, {
      p: [0, -50, 0],
    });
    material2.visible = false;
    return {
      m: material2,
      v: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      size: 1,
      live: false,
      bounced: false,
      land: null as null | ((at: THREE.Vector3) => void),
    };
  });
  let nextChunk = 0;
  // One warm light that follows the nearest working street lamp, and stutters.
  const lampLight = new THREE.PointLight('#ffb35e', 0, 16, 1.6);
  sceneKit.root.add(lampLight);
  // Work lights clamped to the scaffold.
  const worklight = sceneKit.basic('#ffd9a1', 1.4);
  for (const [xPosition17, yPosition8, zPosition15] of [
    [-5.3, 4.8, -91.9],
    [5.3, 6.9, -91.9],
  ])
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.BoxGeometry(0.3, 0.2, 0.16)),
      worklight,
      { p: [xPosition17, yPosition8, zPosition15] },
    );
  // The existing scaffold lamps light the work, rather than only glowing themselves.
  // Tight, unshadowed cones keep the warm recovery area distinct from the cool gate rim.
  const recoveryLight = new THREE.SpotLight('#ffd1a0', 72, 17, 0.68, 0.85, 2);
  recoveryLight.position.set(-5.3, 4.8, -91.9);
  recoveryLight.target.position.set(LANDING.x, 0.7, LANDING.z);
  const gateRim = new THREE.SpotLight('#9ebfdb', 55, 17, 0.72, 0.9, 2);
  gateRim.position.set(5.3, 6.9, -91.9);
  gateRim.target.position.set(PEDESTAL.x, 1, PEDESTAL.z);
  sceneKit.root.add(
    recoveryLight,
    recoveryLight.target,
    gateRim,
    gateRim.target,
  );

  // --- The fall: cracked paving and lifted tiles, dust thrown out from the impact.
  const crackMat = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      map: crackTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(5.2, 5.2)),
    crackMat,
    { p: [LANDING.x, 0.07, LANDING.z], r: [-Math.PI / 2, 0, 0.4] },
  );
  const heaved: THREE.Mesh[] = [];
  for (let index6 = 0; index6 < 7; index6++) {
    const firstValue4 = (index6 / 7) * Math.PI * 2 + 0.3,
      radius2 = 1.9 + random() * 0.5;
    const material4 = sceneKit.box(
      {
        p: [
          LANDING.x + Math.cos(firstValue4) * radius2,
          0.04,
          LANDING.z + Math.sin(firstValue4) * radius2,
        ],
        s: [0.9, 0.1, 0.7],
        r: [0, firstValue4, 0],
      },
      sceneKit.concrete,
    );
    material4.visible = false;
    heaved.push(material4);
  }
  const DUST = 220;
  const dustPos = new Float32Array(DUST * 3),
    dustVel = new Float32Array(DUST * 3);
  const dustGeo = sceneKit.ownGeometry(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dotTex = dotTexture();
  const dustMat = sceneKit.ownMaterial(
    new THREE.PointsMaterial({
      color: '#9fb6c4',
      size: 0.55,
      map: dotTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  sceneKit.root.add(dust);
  let dustAge = 99,
    dustLift = 0;
  const kickDust = (at: THREE.Vector3, strength: number, lift = 0) => {
    dustAge = 0;
    dustLift = lift;
    for (let index5 = 0; index5 < DUST; index5++) {
      const firstValue3 = random() * Math.PI * 2,
        scaleFactor = (0.6 + random() * 1.6) * strength;
      dustPos.set(
        [
          at.x + Math.cos(firstValue3) * 0.4,
          0.1 + random() * 0.3,
          at.z + Math.sin(firstValue3) * 0.4,
        ],
        index5 * 3,
      );
      dustVel.set(
        [
          Math.cos(firstValue3) * scaleFactor * 2.2,
          (0.4 + random() * 1.2) * strength,
          Math.sin(firstValue3) * scaleFactor * 2.2,
        ],
        index5 * 3,
      );
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  // --- The open gate.
  const portalMat = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      vertexShader: PORTAL_VS,
      fragmentShader: PORTAL_FS,
      uniforms: {
        uView: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uOpen: { value: 0 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
      },
      side: THREE.DoubleSide,
    }),
  );
  const portal = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.CircleGeometry(FRAME_R - 0.2, 96)),
    portalMat,
    { p: [0, 0, 0.02] },
    frame,
  );
  portal.visible = false;
  const portalLight = new THREE.PointLight('#9a86e0', 0, 26, 1.6);
  portalLight.position.set(0, 0, 2.5);
  frame.add(portalLight);

  const purple = new THREE.Color('#5B4B8A'),
    copper = new THREE.Color('#7a4a24'),
    hot = new THREE.Color('#ffc58a');

  const lockRed = new THREE.Color('#ff3a2c');
  const impacts = createStreetImpacts(sceneKit.root, (at, wall) =>
    kickDust(at.clone().setY(0), wall ? 0.45 : 0.8, 0.15),
  );
  return {
    fire: impacts.fire,
    impact: impacts.impact,
    root: sceneKit.root,
    lamps,
    portalMat,
    frame,
    hub,
    /** The reader's cartridge slot in world space, and how it sits (for seating the cartridge). */
    readerWorld: (out = new THREE.Vector3()) => slot.getWorldPosition(out),
    readerQuat: (out = new THREE.Quaternion()) => slot.getWorldQuaternion(out),
    kickDust,
    /** Drops a chunk from `from` with a push; `onLand` fires where it first hits the paving. */
    debris(
      from: THREE.Vector3,
      push: THREE.Vector3,
      size: number,
      onLand?: (at: THREE.Vector3) => void,
    ) {
      const vector = chunks[nextChunk++ % chunks.length];
      vector.m.position.copy(from);
      vector.v.copy(push);
      vector.size = size;
      vector.m.scale.set(size, size * 0.7, size * 0.9);
      vector.spin.set(
        randomBetween(-4, 4),
        randomBetween(-4, 4),
        randomBetween(-4, 4),
      );
      vector.live = true;
      vector.bounced = false;
      vector.land = onLand ?? null;
      vector.m.visible = true;
    },
    update(
      timeSeconds: number,
      deltaSeconds: number,
      state: {
        angles: number[];
        live: number[];
        powered: number;
        open: number;
        flash: number;
        cracked: number;
        socket: number;
        lock?: number;
        eye?: THREE.Vector3;
        dread?: number;
      },
    ) {
      impacts.update(deltaSeconds);
      skyline.update(timeSeconds, deltaSeconds, false, 0, 'approaching');
      // Debris: falls, bounces once, settles where it lands.
      for (const vector of chunks) {
        if (!vector.live) continue;
        vector.v.y -= 15 * deltaSeconds;
        vector.m.position.addScaledVector(vector.v, deltaSeconds);
        vector.m.rotation.x += vector.spin.x * deltaSeconds;
        vector.m.rotation.y += vector.spin.y * deltaSeconds;
        vector.m.rotation.z += vector.spin.z * deltaSeconds;
        const floor = vector.size * 0.55;
        if (vector.m.position.y <= floor) {
          vector.m.position.y = floor;
          if (!vector.bounced) {
            vector.bounced = true;
            vector.v.set(
              vector.v.x * 0.35,
              Math.abs(vector.v.y) * 0.22,
              vector.v.z * 0.35,
            );
            vector.spin.multiplyScalar(0.4);
            vector.land?.(vector.m.position.clone());
            kickDust(
              vector.m.position.clone().setY(0),
              0.35 + vector.size * 0.25,
            );
          } else {
            vector.live = false;
          }
        }
      }
      crackGlow.opacity =
        0.45 +
        0.35 * Math.sin(timeSeconds * 2.3) * Math.sin(timeSeconds * 0.7 + 1);
      sparks.forEach((sp, index5) => {
        sp.visible =
          Math.sin(timeSeconds * (31 + index5 * 7)) *
            Math.sin(timeSeconds * (5 + index5)) >
          0.55;
        sp.scale.setScalar(0.6 + Math.random() * 0.8);
      });
      // The street lamp nearest the eye, live and stuttering, harder as he closes.
      if (state.eye && lamps.length) {
        let best = lamps[0];
        for (const vector2 of lamps)
          if (
            vector2.distanceToSquared(state.eye) <
            best.distanceToSquared(state.eye)
          )
            best = vector2;
        lampLight.position.copy(best);
        const depth = state.dread ?? 0,
          stutter =
            Math.sin(timeSeconds * 23) * Math.sin(timeSeconds * 7.3 + 1) >
            0.55 - depth * 0.5
              ? 0.15
              : 1;
        lampLight.intensity = 7 * stutter * (1 - depth * 0.3);
      } else lampLight.intensity = 0;
      // Segments turn with their angle; contacts go from cold copper to live as current reaches them.
      segments.forEach((seg, index5) => {
        seg.g.rotation.z = (-state.angles[index5] * Math.PI) / 180;
        // Open: each ring slides out to the rim and leaves the opening clear.
        seg.g.scale.setScalar(
          THREE.MathUtils.lerp(
            1,
            (FRAME_R - 0.27 + index5 * 0.03) / RINGS[index5].r,
            state.open,
          ),
        );
        seg.contactMats.forEach((material2, segmentIndex2) => {
          const scalarValue =
            state.live[index5] >= 1
              ? segmentIndex2 === 0 || state.live[index5 + 1] >= 1
                ? 1
                : 0.55 + 0.45 * Math.sin(timeSeconds * 5)
              : segmentIndex2 === 0
                ? state.live[index5]
                : 0;
          material2.color
            .copy(copper)
            .lerp(hot, Math.min(1, scalarValue))
            .multiplyScalar(
              1 +
                scalarValue * (1.2 + 0.3 * Math.sin(timeSeconds * 30 + index5)),
            );
        });
      });
      feedLamp.color
        .set('#ffb066')
        .multiplyScalar(1.2 + 0.3 * Math.sin(timeSeconds * 2));
      feedLight.intensity = 1.5 + state.live[0] * 2;
      // Powered: the ring hums dusk purple. The socket only lights once the chip is in it.
      frameGlow.emissiveIntensity =
        state.powered * (0.55 + 0.2 * Math.sin(timeSeconds * 3.1)) +
        state.open * 0.8;
      // Locked onto the combat chip, the hub beats red in the chip's own rhythm (baymax.ts: sin(t·4)).
      const lock = state.socket ? 0 : (state.lock ?? 0),
        beat = lock * Math.max(0, 0.35 + 0.65 * Math.sin(timeSeconds * 4));
      socketRim.color
        .copy(purple)
        .multiplyScalar(state.socket * (1.6 + 0.5 * Math.sin(timeSeconds * 5)))
        .addScalar(state.socket ? 0 : 0.1);
      if (!state.socket) socketRim.color.set('#1a2026').lerp(lockRed, beat);
      lens.color
        .copy(purple)
        .multiplyScalar(state.socket * (1.2 + 0.8 * Math.sin(timeSeconds * 7)))
        .addScalar(state.socket ? 0 : 0.02);
      if (!state.socket && beat > 0) lens.color.lerp(lockRed, beat * 0.6);
      // The hub rides up the top spoke into the crown as the gate opens.
      hub.position.y = state.open * (FRAME_R - 0.62);
      hub.scale.setScalar(1 - state.open * 0.35);
      readerScreen.color
        .set(state.socket ? '#c0d0ac' : '#16211c')
        .multiplyScalar(
          state.socket ? 0.9 + 0.15 * Math.sin(timeSeconds * 9) : 1,
        );
      readerLamp.color
        .set(state.socket ? '#c9dca8' : state.powered ? '#cbb48c' : '#3a2a20')
        .multiplyScalar(
          state.powered && !state.socket
            ? 0.8 + 0.5 * Math.sin(timeSeconds * 4)
            : 1.2,
        );
      if (beat > 0) {
        readerScreen.color.lerp(lockRed, beat * 0.7);
        readerLamp.color.copy(lockRed).multiplyScalar(0.6 + 1.4 * beat);
      }
      spokes.forEach((material2, index5) => {
        material2.scale.y = 1 - state.open * 0.98;
        material2.position.setLength((FRAME_R / 2) * (1 + state.open * 0.9));
        material2.visible = state.open < 0.97;
        void index5;
      });
      portal.visible = state.open > 0.001;
      portalMat.uniforms.uOpen.value = state.open;
      portalMat.uniforms.uTime.value = timeSeconds;
      portalMat.uniforms.uFlash.value = state.flash;
      portalLight.intensity =
        state.powered * 2 + state.open * 26 + state.flash * 30;
      crackMat.opacity = state.cracked;
      heaved.forEach((material2, index5) => {
        material2.visible = state.cracked > 0.05;
        material2.rotation.x = state.cracked * (0.18 + (index5 % 3) * 0.07);
        material2.position.y = 0.04 + state.cracked * 0.06;
      });
      // Dust: drifts out, slows, settles and fades.
      if (dustAge < 9) {
        dustAge += deltaSeconds;
        for (let index7 = 0; index7 < DUST; index7++) {
          const elementIndex = index7 * 3,
            drag = Math.exp(-deltaSeconds * 1.6);
          dustVel[elementIndex] *= drag;
          dustVel[elementIndex + 2] *= drag;
          dustVel[elementIndex + 1] =
            dustVel[elementIndex + 1] * drag -
            deltaSeconds * (0.3 - dustLift * 0.5);
          dustPos[elementIndex] += dustVel[elementIndex] * deltaSeconds;
          dustPos[elementIndex + 1] = Math.max(
            0.05,
            dustPos[elementIndex + 1] +
              dustVel[elementIndex + 1] * deltaSeconds,
          );
          dustPos[elementIndex + 2] += dustVel[elementIndex + 2] * deltaSeconds;
        }
        dustGeo.attributes.position.needsUpdate = true;
        dustMat.opacity =
          Math.min(1, dustAge * 6) * Math.max(0, 1 - dustAge / 9) * 0.55;
        dustMat.size = 0.5 + dustAge * 0.35;
      } else dustMat.opacity = 0;
    },
    dispose() {
      impacts.dispose();
      skyline.dispose();
      dotTex.dispose();
      (crackMat.map as THREE.Texture).dispose();
      sceneKit.dispose();
    },
  };
}
/**
 * Data contract used by the final pursuit and restoration.
 */
export type Street = ReturnType<typeof createStreet>;

/**
 * The relay's capture cartridge: the drive Hiro pulled from RX/06 with the healthcare chip's last
 * transmission on it. Thumb-sized, ribbed grip, a sage label and gold contacts at the end that
 * goes in (-Z). `glow` lights its status lamp while it plays.
 */
export function createCartridge() {
  const root = new THREE.Group();
  root.name = 'capture-cartridge';
  const own: { dispose(): void }[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    points: [number, number, number],
    parent: THREE.Object3D = root,
  ) => {
    own.push(geometry, material);
    const material2 = new THREE.Mesh(geometry, material);
    material2.position.set(...points);
    parent.add(material2);
    return material2;
  };
  add(
    new THREE.BoxGeometry(0.06, 0.014, 0.085),
    new THREE.MeshStandardMaterial({
      color: '#2b3336',
      roughness: 0.5,
      metalness: 0.3,
    }),
    [0, 0, 0],
  );
  add(
    new THREE.BoxGeometry(0.062, 0.016, 0.022),
    new THREE.MeshStandardMaterial({ color: '#1b2124', roughness: 0.9 }),
    [0, 0, 0.034],
  );
  add(
    new THREE.PlaneGeometry(0.044, 0.034),
    new THREE.MeshBasicMaterial({ color: '#c0d0ac', toneMapped: false }),
    [0, 0.0072, -0.006],
  ).rotation.x = -Math.PI / 2;
  add(
    new THREE.PlaneGeometry(0.03, 0.004),
    new THREE.MeshBasicMaterial({ color: '#1f2a24' }),
    [0, 0.0074, -0.01],
  ).rotation.x = -Math.PI / 2;
  add(
    new THREE.BoxGeometry(0.04, 0.004, 0.008),
    new THREE.MeshStandardMaterial({
      color: '#d4b25c',
      roughness: 0.3,
      metalness: 0.9,
    }),
    [0, 0, -0.044],
  );
  const glow = new THREE.MeshBasicMaterial({
    color: '#2a332c',
    toneMapped: false,
  });
  add(new THREE.SphereGeometry(0.0035, 8, 6), glow, [0.022, 0.008, 0.03]);
  return {
    root,
    glow,
    dispose() {
      own.forEach((xPosition) => xPosition.dispose());
      glow.dispose();
      root.removeFromParent();
    },
  };
}
