import * as T from 'three';
import { createStreetImpacts } from './StreetImpacts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit, seeded, type Pose } from '../phase2/SceneKit';
import { createPortalDimension } from '../environment/PortalDimension.js';
import { Dressing, cityMaterials, buildingFrame, dressFacade, dressRoof, roadBreakup, skyline as farSkyline, utilityLines } from '../environment/CityDressing';

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
export const FRAME = new T.Vector3(0, 3.4, -92);
export const FRAME_R = 3.3;
export const DECK = { x: -3.55, y: 2.6, z: -90.2 };
/** The walkway through the ring: up from the paving to WALK_Y, flat through the frame. */
export const WALK_Y = 1, WALK_HALF = 1.55, RAMP_FROM = -87, RAMP_TO = -90.4, WALK_END = -93.6;
export const rampY = (z: number) => z > RAMP_FROM ? 0 : z > RAMP_TO ? WALK_Y * (RAMP_FROM - z) / (RAMP_FROM - RAMP_TO) : WALK_Y;
/** The gate's reader, on its pedestal to the right of the walkway. */
export const PEDESTAL = new T.Vector3(2.75, 0, -88.6);
/** The work deck's ladder, at its far (left) end, away from the walkway. */
export const LADDER_X = -4.9;
export const LANDING = new T.Vector3(-2.2, 0, -85.2);
export const ROUTE = new T.CatmullRomCurve3([
  [0, EYE, 6], [.9, EYE, -6], [-.8, EYE, -18], [-.4, EYE, -30], [1, EYE, -42], [.2, EYE, -54], [-.6, EYE, -66], [-1.2, EYE, -76],
].map(([x, y, z]) => new T.Vector3(x, y, z)), false, 'centripetal');
export const ROUTE_LENGTH = ROUTE.getLength();

/** Ring segments, outermost first: radius and where each one's two contacts sit (deg, clockwise from the top). */
export const RINGS = [
  { r: 2.95, in: 0, out: 140 },
  { r: 2.6, in: 0, out: 100 },
  { r: 2.25, in: 0, out: 80 },
];
/** The frame's own contacts: the feed at the top and the return the last segment must reach. */
export const FEED_AT = 0, RETURN_AT = 320;

/** How much of the feed reaches each junction: [feed→outer, outer→middle, middle→inner, inner→frame]. */
export function ringLive(angles: number[]) {
  const gap = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  // Made within 1.5°; otherwise the reading falls off over 60°, so it can be followed by eye.
  const couple = (d: number) => d < 1.5 ? 1 : Math.max(0, 1 - d / 60) * .8;
  const live = [0, 0, 0, 0];
  let at = FEED_AT, upstream = 1;
  RINGS.forEach((ring, i) => {
    live[i] = upstream * couple(gap(angles[i] + ring.in, at));
    upstream = live[i] >= 1 ? 1 : 0;
    at = angles[i] + ring.out;
  });
  live[3] = upstream * couple(gap(at, RETURN_AT));
  return live;
}

const PORTAL_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
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

function crackTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d')!;
  const rnd = seeded(808);
  x.strokeStyle = 'rgba(8,14,20,.95)'; x.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let px = 256, py = 256, a = i / 14 * Math.PI * 2 + rnd() * .3, w = 7;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 9; s++) { a += (rnd() - .5) * .7; const len = 14 + rnd() * 22; px += Math.cos(a) * len; py += Math.sin(a) * len; x.lineWidth = w; x.lineTo(px, py); w *= .78; }
    x.stroke();
  }
  // A crushed centre and a ring of broken edges.
  const grd = x.createRadialGradient(256, 256, 0, 256, 256, 90); grd.addColorStop(0, 'rgba(5,9,12,.85)'); grd.addColorStop(1, 'rgba(5,9,12,0)');
  x.fillStyle = grd; x.fillRect(0, 0, 512, 512);
  x.lineWidth = 2.5; for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 60 + rnd() * 40; x.beginPath(); x.arc(256, 256, r, a, a + .25 + rnd() * .3); x.stroke(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
}

export function createStreet() {
  const k = new SceneKit('phase6-street');
  const random = seeded(6606), rand = (a: number, b: number) => a + random() * (b - a);
  const skyline = createPortalDimension();
  skyline.group.position.set(4, -6, -200); skyline.group.scale.setScalar(1.35);
  skyline.group.traverse(o => { o.castShadow = false; });
  k.root.add(skyline.group);

  // --- The street: lane, heaved slabs, kerbs, the same slate blocks with window rows.
  const streetFrom = k.root.children.length;
  // Storey-scaled facades, roofs, wires, broken asphalt and the far skyline are instanced by the
  // city dressing kit (one draw per piece and material), built once at the end of this function.
  const dress = new Dressing(k), cm = cityMaterials(k);
  k.box({ p: [0, -.3, -34], s: [13, .6, 92] }, k.edge);
  k.box({ p: [0, .01, -34], s: [12.4, .04, 91.4] }, cm.asphalt);
  const marks: Pose[] = []; for (let i = 0; i < 24; i++) marks.push({ p: [.1, .04, 6 - i * 3.3], s: [.1, .02, 1.4] });
  k.instances(marks, k.metal);
  for (const [x, z, rx, rz] of [[-3.9, -10, .12, .1], [4, -24, -.12, -.15], [-4.3, -39, .1, -.08], [3.7, -52, -.15, .12], [-3.6, -63, .08, .1]]) k.box({ p: [x, .1, z], s: [3.2, .22, 3.6], r: [rx, rand(-.3, .3), rz] }, k.concrete);
  for (const side of [-1, 1]) for (let z = 4; z > -72; z -= 5.5) if (random() > .25) k.box({ p: [side * 5.9, .32, z], s: [.45, .65, rand(2.2, 4)], r: [0, 0, side * rand(0, .05)] }, k.ivory);
  const cracks: { x: number; y: number; z: number; side: number }[] = [];
  // Tracker Q-07: more facade colours than ivory and slate, darker trim, warm awnings and neon.
  const tones = [k.standard('#4a5a66', .9, .08), k.standard('#8a9294', .85, .06), k.standard('#5b6670', .88, .1), k.standard('#6f6964', .9, .06), k.standard('#3c4a55', .9, .1), k.standard('#776154', .9, .05)];
  const trim = k.standard('#26343e', .8, .3);
  const awnings = [k.standard('#9c3f2c', .85, .05), k.standard('#2f6c78', .85, .05), k.standard('#b08436', .85, .05)];
  const neon = [k.basic('#ff5a8a', 1.5), k.basic('#7fe6ff', 1.3), k.basic('#ffc062', 1.4)];
  const block = (x: number, z: number, w: number, h: number, d: number, side: number, back = false) => {
    // Every piece is placed in the block's own frame, so a leaning building carries its windows with it.
    const ry = side * rand(-.06, .06), tilt = side * rand(-.05, .07), r: [number, number, number] = [0, ry, tilt];
    const frame = new T.Object3D(); frame.position.set(x, 0, z); frame.rotation.set(0, ry, tilt); frame.updateMatrix();
    const L = (lx: number, ly: number, lz: number) => new T.Vector3(lx, ly, lz).applyMatrix4(frame.matrix).toArray() as [number, number, number];
    const tone = tones[Math.floor(random() * tones.length)];
    k.box({ p: L(0, h / 2 - .05, 0), s: [w, h, d], r }, tone);
    const sx = -side * (w / 2 + .02);
    // Storey-height windows, floor bands, AC units and balconies on the street face and both ends;
    // roofs carry a parapet, tanks, plant, a mast or a sign. The tallest back blocks get tiered caps.
    const bf = buildingFrame(x, z, ry, tilt);
    dressFacade(dress, cm, bf, w, h, d, [side > 0 ? '-x' : '+x', '+z', '-z'], random, { from: back ? 1.2 : 4.2 });
    dressRoof(dress, cm, bf, w, h, d, random, { tower: back && h > 26, sign: !back && random() > .7 });
    // Pilasters between the bays.
    for (const c of [-.5, -1 / 6, 1 / 6, .5]) k.box({ p: L(sx - side * .08, h / 2, c * d * .97), s: [.14, h, .2], r }, trim);
    if (back) return;
    // Shopfront: a dark band, ledges, sometimes an awning or a neon blade sign.
    k.box({ p: L(sx - side * .02, 1.6, 0), s: [.08, 3.2, d * .96], r }, k.dark);
    for (const y of [3.4, h * .62]) k.box({ p: L(-side * (w / 2 + .12), y, 0), s: [.24, .14, d * 1.02], r }, k.metal);
    if (random() > .4) k.box({ p: L(sx - side * .55, 3.05, rand(-d / 6, d / 6)), s: [1.1, .08, d * .6], r: [0, ry, tilt + side * .28] }, awnings[Math.floor(random() * awnings.length)]);
    if (random() > .5) k.box({ p: L(sx - side * .4, rand(4.6, 7.2), rand(-d / 3, d / 3)), s: [.1, rand(1.6, 2.8), .45], r }, neon[Math.floor(random() * neon.length)]);
    if (random() > .55) cracks.push({ x: x + sx - side * .03, y: rand(4, h - 1), z: z + rand(-d / 3, d / 3), side });
    // A storey or two sheared off the roof and hanging askew: smaller than the block, in its colour.
    if (random() > .72) k.box({ p: L(0, h + rand(1, 2.2), rand(-1, 1)), s: [w * .7, rand(1.6, 2.6), d * .7], r: [rand(-.15, .15), ry + rand(-.4, .4), tilt + rand(-.2, .2)] }, tone);
  };
  for (const side of [-1, 1]) for (let z = 8; z > -74; z -= rand(6.5, 8.5)) { const w = rand(4, 6.5); block(side * (7.4 + w / 2 + rand(0, 1.2)), z, w, rand(8, 19), rand(5, 7), side); }
  // A taller back row, so the skyline steps up in layers instead of ending at one roofline.
  for (const side of [-1, 1]) for (let z = 4; z > -80; z -= rand(8, 11)) { const w = rand(5, 8); block(side * (17 + w / 2 + rand(0, 3)), z, w, rand(18, 32), rand(6, 8), side, true); }
  // Asphalt repairs, manholes, cracks and standing water down the lane; poles and wires on the left kerb.
  roadBreakup(dress, cm, random, { x: [-5.2, 5.2], z: [-73, 7], y: .03, count: 46 });
  utilityLines(dress, cm, random, [[-6.9, 2], [-6.9, -13], [-6.9, -26], [-6.9, -41], [-6.9, -52], [-6.9, -66]], { across: 7.4 });
  // Cyan cracks: jagged slivers on the facades, one shared material that pulses.
  const crackGlow = k.ownMaterial(new T.MeshBasicMaterial({ color: '#7fe6ff', transparent: true, opacity: .8, toneMapped: false, side: T.DoubleSide }));
  const slivers: T.BufferGeometry[] = [], at = new T.Object3D();
  for (const c of cracks) for (let j = 0; j < 4; j++) {
    at.position.set(c.x, c.y + j * .55 * (j % 2 ? 1 : -1), c.z + j * .25); at.rotation.set(0, Math.PI / 2, rand(-.7, .7)); at.scale.set(1, rand(.6, 1.5), 1); at.updateMatrix();
    slivers.push(new T.PlaneGeometry(.12, 1).applyMatrix4(at.matrix));
  }
  if (slivers.length) { const geo = mergeGeometries(slivers, false); slivers.forEach(g => g.dispose()); if (geo) k.root.add(new T.Mesh(k.ownGeometry(geo), crackGlow)); }
  // Cables strung across the street, sagging; two snapped ones hanging live, sparking.
  const cableMat = k.ownMaterial(new T.MeshStandardMaterial({ color: '#15191c', roughness: .8 }));
  for (const [z, y] of [[-6, 7.5], [-17, 9], [-29, 6.8], [-44, 8.4], [-61, 7.2]]) {
    const curve = new T.CatmullRomCurve3([new T.Vector3(-7.4, y, z), new T.Vector3(0, y - rand(1.2, 2.2), z + rand(-.6, .6)), new T.Vector3(7.4, y + rand(-.6, .6), z + rand(-1, 1))]);
    k.mesh(k.ownGeometry(new T.TubeGeometry(curve, 24, .035, 5)), cableMat, { p: [0, 0, 0] });
  }
  const sparks: T.Mesh[] = [];
  for (const [x, z] of [[-7.2, -24], [7.2, -48]]) {
    const curve = new T.CatmullRomCurve3([new T.Vector3(x, 8, z), new T.Vector3(x * .8, 5, z + .3), new T.Vector3(x * .72, 2.6, z - .2)]);
    k.mesh(k.ownGeometry(new T.TubeGeometry(curve, 16, .03, 5)), cableMat, { p: [0, 0, 0] });
    sparks.push(k.mesh(k.ownGeometry(new T.SphereGeometry(.09, 8, 6)), k.basic('#d9f6ff', 3), { p: [x * .72, 2.55, z - .2] }));
  }
  for (let i = 0; i < 10; i++) k.box({ p: [rand(-9, 9), rand(9, 18), rand(-70, 4)], s: [rand(.6, 2.4), rand(.3, 1), rand(.6, 2)], r: [rand(0, 3), rand(0, 3), rand(0, 3)] }, k.concrete);
  // Signs toward the old gate.
  // Posts on the kerb line and boards hung high and short of the lane, so nothing tall walks through them.
  const signs: [string, number, number, string][] = [['旧ゲート跡 GATE SITE  →  400 m', -5.4, -12, '#8fe9ff'], ['立入禁止 / NO ENTRY', 5.4, -33, '#ff9a63'], ['GATE SITE  ゲート  →  90 m', -5.4, -56, '#8fe9ff']];
  for (const [text, x, z, color] of signs) {
    k.box({ p: [x, 2.45, z], s: [.12, 4.9, .12] }, k.metal);
    k.box({ p: [x - Math.sign(x) * 1.6, 4.65, z], s: [3.3, .55, .08] }, k.dark);
    k.label(text, { p: [x - Math.sign(x) * 1.6 + .2, 4.62, z + .05] }, 3.5, color);
  }
  const lamps: T.Vector3[] = [];
  for (const [x, z, live] of [[5.3, -4, true], [-5.3, -20, false], [5.3, -38, true], [-5.3, -58, true], [5.3, -70, false]] as [number, number, boolean][]) {
    k.box({ p: [x, 2.6, z], s: [.14, 5.2, .14], r: [0, 0, Math.sign(x) * .04] }, k.metal);
    k.box({ p: [x - Math.sign(x) * .6, 5.15, z], s: [1.3, .1, .1] }, k.metal);
    k.mesh(new T.SphereGeometry(.13, 12, 10), live ? k.basic('#ffc062', 1.6) : k.dark, { p: [x - Math.sign(x) * 1.2, 5.05, z] });
    if (live) lamps.push(new T.Vector3(x - Math.sign(x) * 1.2, 4.9, z));
  }

  // Tracker PW-08: the run's city never moves, so its hundreds of boxes merge into one mesh per
  // material (a few dozen draw calls instead of several hundred). Sparks and cracks stay separate.
  {
    const batches = new Map<T.Material, T.BufferGeometry[]>(), merged: T.Mesh[] = [];
    k.root.updateMatrixWorld(true);
    for (const o of k.root.children.slice(streetFrom)) {
      if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || Array.isArray(o.material) || o.material.transparent || sparks.includes(o)) continue;
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      const list = batches.get(o.material) ?? []; list.push(g); batches.set(o.material, list); merged.push(o);
    }
    for (const [material, list] of batches) {
      const geo = mergeGeometries(list, false); list.forEach(g => g.dispose());
      if (!geo) continue;
      const mesh = new T.Mesh(k.ownGeometry(geo), material); mesh.castShadow = mesh.receiveShadow = true; k.root.add(mesh);
    }
    merged.forEach(o => o.removeFromParent());
  }
  // --- The plaza: wider paving, broken blocks around its edge, barriers across the old perimeter.
  k.box({ p: [0, -.3, -94], s: [36, .6, 34] }, k.edge);
  k.box({ p: [0, .015, -94], s: [35.4, .04, 33.4] }, k.concrete);
  const tiles: Pose[] = []; for (let x = -16; x <= 16; x += 2.2) for (let z = -79; z > -110; z -= 2.2) if (random() > .2) tiles.push({ p: [x + rand(-.05, .05), .045, z], s: [2.1, .02, 2.1], r: [0, rand(-.02, .02), 0] });
  k.instances(tiles, k.edge);
  for (const side of [-1, 1]) for (let z = -80; z > -108; z -= rand(7, 9)) { const w = rand(5, 7); block(side * (18 + w / 2), z, w, rand(10, 22), rand(6, 8), side); }
  for (let x = -14; x <= 14; x += 7) block(x + rand(-1, 1), -114 - rand(0, 3), rand(5, 7), rand(12, 24), 6, 1);
  for (const [x, z, r] of [[-9, -80, .3], [9.5, -81, -.2], [-12, -98, .1], [12, -100, -.4]]) { k.box({ p: [x, .55, z], s: [2.6, 1.1, .5], r: [0, r, 0] }, k.ivory); k.box({ p: [x, 1.15, z], s: [2.6, .1, .55], r: [0, r, 0] }, k.basic('#b18b5d', .9)); }
  k.label('PORTAL RESEARCH SITE · 旧ゲート', { p: [-9, 1.6, -79.7] }, 4, '#e8cf9c');
  roadBreakup(dress, cm, random, { x: [-15, 15], z: [-108, -80], y: .056, count: 26 });
  // Far city: towers in bands past the plaza and behind the street's start, fading into the fog.
  const far = [k.standard('#2b3945', .9, .1), k.standard('#34404a', .9, .1), k.standard('#3d3a40', .9, .08)];
  farSkyline(dress, cm, random, { x: [-60, 60], z: [-150, -125], count: 14, h: [28, 58], tones: far });
  farSkyline(dress, cm, random, { x: [-34, 34], z: [22, 46], count: 9, h: [18, 40], facing: -1, tones: far });
  dress.build();
  k.haze({ p: [0, 9, -122], s: [120, 30, 1] }, '#4a7a96', .16);
  k.haze({ p: [0, 7, 18], s: [80, 24, 1] }, '#4a7a96', .12);

  // --- The frame: a heavy ring standing in a cradle, the feed cable climbing to its crown.
  const frame = new T.Group(); frame.position.copy(FRAME); k.root.add(frame);
  const frameMat = k.standard('#40525e', .55, .6);
  const frameGlow = k.ownMaterial(new T.MeshStandardMaterial({ color: '#3a4a56', roughness: .4, metalness: .6, emissive: '#5B4B8A', emissiveIntensity: 0 }));
  k.mesh(k.ownGeometry(new T.TorusGeometry(FRAME_R, .32, 20, 96)), frameGlow, { p: [0, 0, 0] }, frame);
  k.mesh(k.ownGeometry(new T.TorusGeometry(FRAME_R + .38, .09, 10, 96)), frameMat, { p: [0, 0, -.18] }, frame);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.box({ p: [Math.sin(a) * (FRAME_R + .05), Math.cos(a) * (FRAME_R + .05), .18], s: [.34, .5, .2], r: [0, 0, -a] }, k.dark, frame); }
  for (const side of [-1, 1]) {
    k.box({ p: [side * 2.3, -FRAME_R + .3, -.1], s: [1.6, 1, 1.6], r: [0, 0, side * .5] }, k.concrete, frame);
    k.box({ p: [side * 3.4, -FRAME_R + .6, 0], s: [.9, 1.6, 1.3] }, k.metal, frame);
  }
  // Feed: a cable from the plaza edge up the back of the ring into the top contact.
  const feedCurve = new T.CatmullRomCurve3([new T.Vector3(10, .06, -100), new T.Vector3(4, .08, -94), new T.Vector3(2.2, 2.2, -92.6), new T.Vector3(.4, FRAME.y + FRAME_R + .3, -92.5), new T.Vector3(0, FRAME.y + FRAME_R + .1, -92.1)]);
  k.mesh(k.ownGeometry(new T.TubeGeometry(feedCurve, 60, .07, 8)), k.dark, { p: [0, 0, 0] });
  const feedLamp = k.ownMaterial(new T.MeshBasicMaterial({ color: '#ffb066', toneMapped: false }));
  k.mesh(k.ownGeometry(new T.BoxGeometry(.32, .22, .16)), feedLamp, { p: [0, FRAME_R - .12, .34] }, frame);
  // Spokes from the ring to the hub, set back so the segments turn in front of them.
  const spokes: T.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const m = k.box({ p: [Math.sin(a) * FRAME_R / 2, Math.cos(a) * FRAME_R / 2, -.12], s: [.12, FRAME_R - .2, .1], r: [0, 0, -a] }, k.metal, frame); spokes.push(m); }
  // The hub, where the spokes meet. Its face is the emitter: dark glass that lights with whatever the reader plays.
  const hub = new T.Group(); hub.position.z = .05; frame.add(hub);
  k.mesh(k.ownGeometry(new T.CylinderGeometry(.42, .46, .3, 32)), k.dark, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] }, hub);
  const lens = k.ownMaterial(new T.MeshBasicMaterial({ color: '#05080b', toneMapped: false }));
  k.mesh(k.ownGeometry(new T.CircleGeometry(.3, 32)), lens, { p: [0, 0, .152] }, hub);
  const socketRim = k.ownMaterial(new T.MeshBasicMaterial({ color: '#1a2026', toneMapped: false }));
  const rimGeo = k.ownGeometry(new T.TorusGeometry(.4, .02, 8, 48));
  k.mesh(rimGeo, socketRim, { p: [0, 0, .155] }, hub);

  // Ring segments: each a near-full ring with a break, carrying an in and an out contact.
  const segments = RINGS.map((ring, i) => {
    const g = new T.Group(); g.position.z = .34 + i * .05; frame.add(g);
    // The break sits on the unused side, between the out contact and the in contact.
    const gap = ring.out + (360 - ring.out) / 2;
    k.mesh(k.ownGeometry(new T.TorusGeometry(ring.r, .07, 10, 96, Math.PI * 2 - .35)), frameMat, { p: [0, 0, 0], r: [0, 0, (100 - gap) * Math.PI / 180] }, g);
    const contactMats = [0, 1].map(() => k.ownMaterial(new T.MeshBasicMaterial({ color: '#7a4a24', toneMapped: false })));
    [ring.in, ring.out].forEach((deg, j) => {
      const a = deg * Math.PI / 180;
      k.box({ p: [Math.sin(a) * ring.r, Math.cos(a) * ring.r, .03], s: [.2, .16, .14], r: [0, 0, -a] }, contactMats[j], g);
    });
    return { g, contactMats };
  });
  const feedLight = new T.PointLight('#ffb066', 0, 5, 2); feedLight.position.set(0, FRAME_R, .8); frame.add(feedLight);

  // Scaffolding: a full tower behind the ring, and in front only the bay that carries the work
  // deck on the left, so the opening itself stays clear. A ladder runs up the deck's inner end.
  const scaff = k.standard('#7d8b92', .5, .55), plank = k.standard('#6a5848', .85, .05);
  // The front bay stops well short of the walkway, and its ladder is at the far end.
  const BACK = -94.6, FRONT = -89.4, DL = -5.2, DR = -1.9;
  for (const x of [-5.4, -3.6, -1.6, 1.6, 3.6, 5.4]) k.box({ p: [x, 4.3, BACK], s: [.07, 8.6, .07] }, scaff);
  for (const y of [1.2, 2.6, 4.6, 6.6, 8.2]) k.box({ p: [0, y, BACK], s: [11, .06, .06] }, scaff);
  for (const [x, y] of [[-4.5, 3.6], [-2.6, 5.6], [2.6, 3.6], [4.5, 5.6]]) k.box({ p: [x, y, BACK], s: [2.2, .05, .05], r: [0, 0, x < 0 ? .78 : -.78] }, scaff);
  for (const x of [-5.4, 5.4]) { k.box({ p: [x, 4.3, -92], s: [.07, 8.6, .07] }, scaff); for (const y of [2.6, 6.6]) k.box({ p: [x, y, -92], s: [.06, .06, 5.2] }, scaff); }
  for (const x of [DL, DR]) k.box({ p: [x, (DECK.y + 1) / 2, FRONT], s: [.07, DECK.y + 1, .07] }, scaff);
  for (const y of [1.2, DECK.y - .05]) k.box({ p: [(DL + DR) / 2, y, FRONT], s: [DR - DL, .06, .06] }, scaff);
  k.box({ p: [(DL + DR) / 2, DECK.y + .95, FRONT], s: [DR - DL, .05, .05] }, scaff);
  for (const x of [DL, DR]) k.box({ p: [x, DECK.y / 2, -91.3], s: [.07, DECK.y, .07] }, scaff);
  k.box({ p: [DECK.x, DECK.y - .05, -90.3], s: [DR - DL + .1, .1, 1.9] }, plank);
  k.box({ p: [3.6, 6.55, -93.4], s: [3.4, .1, 1.6] }, plank);
  for (let y = .3; y < DECK.y; y += .35) k.box({ p: [LADDER_X, y, FRONT + .05], s: [.5, .04, .04] }, scaff);
  for (const x of [LADDER_X - .25, LADDER_X + .25]) k.box({ p: [x, DECK.y / 2, FRONT + .05], s: [.05, DECK.y + .9, .05] }, scaff);

  // The walkway: a ramp up from the paving, then a plate across the lower lip of the ring.
  const steel = k.standard('#5d6a70', .45, .7), tread = k.standard('#2b3236', .8, .3);
  const rampLen = Math.hypot(RAMP_FROM - RAMP_TO, WALK_Y), rampTilt = Math.atan2(WALK_Y, RAMP_FROM - RAMP_TO);
  k.box({ p: [0, WALK_Y / 2 - .05, (RAMP_FROM + RAMP_TO) / 2], s: [WALK_HALF * 2, .1, rampLen], r: [rampTilt, 0, 0] }, steel);
  k.box({ p: [0, WALK_Y - .05, (RAMP_TO + WALK_END) / 2], s: [WALK_HALF * 2, .1, RAMP_TO - WALK_END] }, steel);
  const treads: Pose[] = [];
  for (let z = RAMP_FROM - .25; z > WALK_END + .1; z -= .45) treads.push({ p: [0, rampY(z) + .006, z], s: [WALK_HALF * 2 - .2, .012, .07], r: [z > RAMP_TO ? rampTilt : 0, 0, 0] });
  k.instances(treads, tread);
  for (const x of [-WALK_HALF + .1, WALK_HALF - .1]) for (const z of [-88.6, RAMP_TO, -92.9]) k.box({ p: [x, rampY(z) / 2, z], s: [.1, rampY(z), .1] }, steel);
  for (const x of [-WALK_HALF, WALK_HALF]) k.box({ p: [x, WALK_Y + .03, (RAMP_TO + WALK_END) / 2], s: [.05, .06, RAMP_TO - WALK_END] }, k.basic('#c9a24a', .7));

  // The reader: a waist-high pedestal with a slanted face, a cartridge slot and a small screen.
  const ped = new T.Group(); ped.position.copy(PEDESTAL); k.root.add(ped);
  k.box({ p: [0, .5, 0], s: [.34, 1, .3] }, k.metal, ped);
  k.box({ p: [0, .03, 0], s: [.6, .06, .5] }, k.dark, ped);
  const head = new T.Group(); head.position.set(0, 1.04, .02); head.rotation.x = .55; ped.add(head);
  k.box({ p: [0, 0, 0], s: [.5, .08, .36] }, k.dark, head);
  const readerScreen = k.ownMaterial(new T.MeshBasicMaterial({ color: '#16211c', toneMapped: false }));
  k.mesh(k.ownGeometry(new T.PlaneGeometry(.3, .12)), readerScreen, { p: [0, .041, -.09], r: [-Math.PI / 2, 0, 0] }, head);
  k.mesh(k.ownGeometry(new T.PlaneGeometry(.14, .024)), k.ownMaterial(new T.MeshBasicMaterial({ color: '#030506' })), { p: [0, .041, .08], r: [-Math.PI / 2, 0, 0] }, head);
  const readerLamp = k.ownMaterial(new T.MeshBasicMaterial({ color: '#3a2a20', toneMapped: false }));
  k.mesh(k.ownGeometry(new T.CircleGeometry(.012, 12)), readerLamp, { p: [.17, .041, .08], r: [-Math.PI / 2, 0, 0] }, head);
  k.label('READER  旧ゲート', { p: [0, .042, .145], r: [-Math.PI / 2, 0, 0] }, .32, '#c5b484', head);
  const slot = new T.Object3D(); slot.position.set(0, .046, .08); head.add(slot);
  // Its cable runs along the paving to the frame's cradle.
  k.mesh(k.ownGeometry(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(PEDESTAL.x, .05, PEDESTAL.z - .12), new T.Vector3(2.95, .05, -90.4), new T.Vector3(3.3, .3, -91.6)]), 20, .035, 6)), k.dark, { p: [0, 0, 0] });

  // Debris for the chase: chunks that come off the blocks, fall, bounce once and settle.
  const chunkGeo = k.ownGeometry(new T.DodecahedronGeometry(1, 0));
  const chunks = Array.from({ length: 8 }, () => {
    const m = k.mesh(chunkGeo, k.concrete, { p: [0, -50, 0] }); m.visible = false;
    return { m, v: new T.Vector3(), spin: new T.Vector3(), size: 1, live: false, bounced: false, land: null as null | ((at: T.Vector3) => void) };
  });
  let nextChunk = 0;
  // One warm light that follows the nearest working street lamp, and stutters.
  const lampLight = new T.PointLight('#ffb35e', 0, 16, 1.6); k.root.add(lampLight);
  // Work lights clamped to the scaffold.
  const worklight = k.basic('#ffd9a1', 1.4);
  for (const [x, y, z] of [[-5.3, 4.8, -91.9], [5.3, 6.9, -91.9]]) k.mesh(k.ownGeometry(new T.BoxGeometry(.3, .2, .16)), worklight, { p: [x, y, z] });
  // The existing scaffold lamps light the work, rather than only glowing themselves.
  // Tight, unshadowed cones keep the warm recovery area distinct from the cool gate rim.
  const recoveryLight = new T.SpotLight('#ffd1a0', 72, 17, .68, .85, 2);
  recoveryLight.position.set(-5.3, 4.8, -91.9); recoveryLight.target.position.set(LANDING.x, .7, LANDING.z);
  const gateRim = new T.SpotLight('#9ebfdb', 55, 17, .72, .9, 2);
  gateRim.position.set(5.3, 6.9, -91.9); gateRim.target.position.set(PEDESTAL.x, 1, PEDESTAL.z);
  k.root.add(recoveryLight, recoveryLight.target, gateRim, gateRim.target);

  // --- The fall: cracked paving and lifted tiles, dust thrown out from the impact.
  const crackMat = k.ownMaterial(new T.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  k.mesh(k.ownGeometry(new T.PlaneGeometry(5.2, 5.2)), crackMat, { p: [LANDING.x, .07, LANDING.z], r: [-Math.PI / 2, 0, .4] });
  const heaved: T.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + .3, r = 1.9 + random() * .5; const m = k.box({ p: [LANDING.x + Math.cos(a) * r, .04, LANDING.z + Math.sin(a) * r], s: [.9, .1, .7], r: [0, a, 0] }, k.concrete); m.visible = false; heaved.push(m); }
  const DUST = 220;
  const dustPos = new Float32Array(DUST * 3), dustVel = new Float32Array(DUST * 3);
  const dustGeo = k.ownGeometry(new T.BufferGeometry()); dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
  const dotTex = dotTexture();
  const dustMat = k.ownMaterial(new T.PointsMaterial({ color: '#9fb6c4', size: .55, map: dotTex, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
  const dust = new T.Points(dustGeo, dustMat); dust.frustumCulled = false; k.root.add(dust);
  let dustAge = 99, dustLift = 0;
  const kickDust = (at: T.Vector3, strength: number, lift = 0) => {
    dustAge = 0; dustLift = lift;
    for (let i = 0; i < DUST; i++) {
      const a = random() * Math.PI * 2, s = (.6 + random() * 1.6) * strength;
      dustPos.set([at.x + Math.cos(a) * .4, .1 + random() * .3, at.z + Math.sin(a) * .4], i * 3);
      dustVel.set([Math.cos(a) * s * 2.2, (.4 + random() * 1.2) * strength, Math.sin(a) * s * 2.2], i * 3);
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  // --- The open gate.
  const portalMat = k.ownMaterial(new T.ShaderMaterial({ vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, uniforms: { uView: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uOpen: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } }, side: T.DoubleSide }));
  const portal = k.mesh(k.ownGeometry(new T.CircleGeometry(FRAME_R - .2, 96)), portalMat, { p: [0, 0, .02] }, frame);
  portal.visible = false;
  const portalLight = new T.PointLight('#9a86e0', 0, 26, 1.6); portalLight.position.set(0, 0, 2.5); frame.add(portalLight);

  const purple = new T.Color('#5B4B8A'), copper = new T.Color('#7a4a24'), hot = new T.Color('#ffc58a');

  const lockRed = new T.Color('#ff3a2c');
  const impacts = createStreetImpacts(k.root, (at, wall) => kickDust(at.clone().setY(0), wall ? .45 : .8, .15));
  return {
    fire: impacts.fire,
    impact: impacts.impact,
    root: k.root, lamps, portalMat, frame, hub,
    /** The reader's cartridge slot in world space, and how it sits (for seating the cartridge). */
    readerWorld: (out = new T.Vector3()) => slot.getWorldPosition(out),
    readerQuat: (out = new T.Quaternion()) => slot.getWorldQuaternion(out),
    kickDust,
    /** Drops a chunk from `from` with a push; `onLand` fires where it first hits the paving. */
    debris(from: T.Vector3, push: T.Vector3, size: number, onLand?: (at: T.Vector3) => void) {
      const c = chunks[nextChunk++ % chunks.length];
      c.m.position.copy(from); c.v.copy(push); c.size = size; c.m.scale.set(size, size * .7, size * .9);
      c.spin.set(rand(-4, 4), rand(-4, 4), rand(-4, 4)); c.live = true; c.bounced = false; c.land = onLand ?? null; c.m.visible = true;
    },
    update(t: number, dt: number, s: { angles: number[]; live: number[]; powered: number; open: number; flash: number; cracked: number; socket: number; lock?: number; eye?: T.Vector3; dread?: number }) {
      impacts.update(dt);
      skyline.update(t, dt, false, 0, 'approaching');
      // Debris: falls, bounces once, settles where it lands.
      for (const c of chunks) {
        if (!c.live) continue;
        c.v.y -= 15 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
        const floor = c.size * .55;
        if (c.m.position.y <= floor) {
          c.m.position.y = floor;
          if (!c.bounced) { c.bounced = true; c.v.set(c.v.x * .35, Math.abs(c.v.y) * .22, c.v.z * .35); c.spin.multiplyScalar(.4); c.land?.(c.m.position.clone()); kickDust(c.m.position.clone().setY(0), .35 + c.size * .25); }
          else { c.live = false; }
        }
      }
      crackGlow.opacity = .45 + .35 * Math.sin(t * 2.3) * Math.sin(t * .7 + 1);
      sparks.forEach((sp, i) => { sp.visible = Math.sin(t * (31 + i * 7)) * Math.sin(t * (5 + i)) > .55; sp.scale.setScalar(.6 + Math.random() * .8); });
      // The street lamp nearest the eye, live and stuttering, harder as he closes.
      if (s.eye && lamps.length) {
        let best = lamps[0]; for (const l of lamps) if (l.distanceToSquared(s.eye) < best.distanceToSquared(s.eye)) best = l;
        lampLight.position.copy(best);
        const d = s.dread ?? 0, stutter = Math.sin(t * 23) * Math.sin(t * 7.3 + 1) > .55 - d * .5 ? .15 : 1;
        lampLight.intensity = 7 * stutter * (1 - d * .3);
      } else lampLight.intensity = 0;
      // Segments turn with their angle; contacts go from cold copper to live as current reaches them.
      segments.forEach((seg, i) => {
        seg.g.rotation.z = -s.angles[i] * Math.PI / 180;
        // Open: each ring slides out to the rim and leaves the opening clear.
        seg.g.scale.setScalar(T.MathUtils.lerp(1, (FRAME_R - .27 + i * .03) / RINGS[i].r, s.open));
        seg.contactMats.forEach((m, j) => {
          const k2 = s.live[i] >= 1 ? (j === 0 || s.live[i + 1] >= 1 ? 1 : .55 + .45 * Math.sin(t * 5)) : j === 0 ? s.live[i] : 0;
          m.color.copy(copper).lerp(hot, Math.min(1, k2)).multiplyScalar(1 + k2 * (1.2 + .3 * Math.sin(t * 30 + i)));
        });
      });
      feedLamp.color.set('#ffb066').multiplyScalar(1.2 + .3 * Math.sin(t * 2));
      feedLight.intensity = 1.5 + s.live[0] * 2;
      // Powered: the ring hums dusk purple. The socket only lights once the chip is in it.
      frameGlow.emissiveIntensity = s.powered * (.55 + .2 * Math.sin(t * 3.1)) + s.open * .8;
      // Locked onto the combat chip, the hub beats red in the chip's own rhythm (baymax.ts: sin(t·4)).
      const lock = s.socket ? 0 : (s.lock ?? 0), beat = lock * Math.max(0, .35 + .65 * Math.sin(t * 4));
      socketRim.color.copy(purple).multiplyScalar(s.socket * (1.6 + .5 * Math.sin(t * 5))).addScalar(s.socket ? 0 : .1);
      if (!s.socket) socketRim.color.set('#1a2026').lerp(lockRed, beat);
      lens.color.copy(purple).multiplyScalar(s.socket * (1.2 + .8 * Math.sin(t * 7))).addScalar(s.socket ? 0 : .02);
      if (!s.socket && beat > 0) lens.color.lerp(lockRed, beat * .6);
      // The hub rides up the top spoke into the crown as the gate opens.
      hub.position.y = s.open * (FRAME_R - .62); hub.scale.setScalar(1 - s.open * .35);
      readerScreen.color.set(s.socket ? '#c0d0ac' : '#16211c').multiplyScalar(s.socket ? .9 + .15 * Math.sin(t * 9) : 1);
      readerLamp.color.set(s.socket ? '#c9dca8' : s.powered ? '#cbb48c' : '#3a2a20').multiplyScalar(s.powered && !s.socket ? .8 + .5 * Math.sin(t * 4) : 1.2);
      if (beat > 0) { readerScreen.color.lerp(lockRed, beat * .7); readerLamp.color.copy(lockRed).multiplyScalar(.6 + 1.4 * beat); }
      spokes.forEach((m, i) => { m.scale.y = 1 - s.open * .98; m.position.setLength((FRAME_R / 2) * (1 + s.open * .9)); m.visible = s.open < .97; void i; });
      portal.visible = s.open > .001;
      portalMat.uniforms.uOpen.value = s.open; portalMat.uniforms.uTime.value = t; portalMat.uniforms.uFlash.value = s.flash;
      portalLight.intensity = s.powered * 2 + s.open * 26 + s.flash * 30;
      crackMat.opacity = s.cracked;
      heaved.forEach((m, i) => { m.visible = s.cracked > .05; m.rotation.x = s.cracked * (.18 + (i % 3) * .07); m.position.y = .04 + s.cracked * .06; });
      // Dust: drifts out, slows, settles and fades.
      if (dustAge < 9) {
        dustAge += dt;
        for (let i = 0; i < DUST; i++) {
          const o = i * 3, drag = Math.exp(-dt * 1.6);
          dustVel[o] *= drag; dustVel[o + 2] *= drag; dustVel[o + 1] = dustVel[o + 1] * drag - dt * (.3 - dustLift * .5);
          dustPos[o] += dustVel[o] * dt; dustPos[o + 1] = Math.max(.05, dustPos[o + 1] + dustVel[o + 1] * dt); dustPos[o + 2] += dustVel[o + 2] * dt;
        }
        dustGeo.attributes.position.needsUpdate = true;
        dustMat.opacity = Math.min(1, dustAge * 6) * Math.max(0, 1 - dustAge / 9) * .55;
        dustMat.size = .5 + dustAge * .35;
      } else dustMat.opacity = 0;
    },
    dispose() { impacts.dispose(); skyline.dispose(); dotTex.dispose(); (crackMat.map as T.Texture).dispose(); k.dispose(); },
  };
}
export type Street = ReturnType<typeof createStreet>;

/**
 * The relay's capture cartridge: the drive Hiro pulled from RX/06 with the healthcare chip's last
 * transmission on it. Thumb-sized, ribbed grip, a sage label and gold contacts at the end that
 * goes in (-Z). `glow` lights its status lamp while it plays.
 */
export function createCartridge() {
  const root = new T.Group(); root.name = 'capture-cartridge';
  const own: { dispose(): void }[] = [];
  const add = (geo: T.BufferGeometry, mat: T.Material, p: [number, number, number], parent: T.Object3D = root) => { own.push(geo, mat); const m = new T.Mesh(geo, mat); m.position.set(...p); parent.add(m); return m; };
  add(new T.BoxGeometry(.06, .014, .085), new T.MeshStandardMaterial({ color: '#2b3336', roughness: .5, metalness: .3 }), [0, 0, 0]);
  add(new T.BoxGeometry(.062, .016, .022), new T.MeshStandardMaterial({ color: '#1b2124', roughness: .9 }), [0, 0, .034]);
  add(new T.PlaneGeometry(.044, .034), new T.MeshBasicMaterial({ color: '#c0d0ac', toneMapped: false }), [0, .0072, -.006]).rotation.x = -Math.PI / 2;
  add(new T.PlaneGeometry(.03, .004), new T.MeshBasicMaterial({ color: '#1f2a24' }), [0, .0074, -.01]).rotation.x = -Math.PI / 2;
  add(new T.BoxGeometry(.04, .004, .008), new T.MeshStandardMaterial({ color: '#d4b25c', roughness: .3, metalness: .9 }), [0, 0, -.044]);
  const glow = new T.MeshBasicMaterial({ color: '#2a332c', toneMapped: false });
  add(new T.SphereGeometry(.0035, 8, 6), glow, [.022, .008, .03]);
  return { root, glow, dispose() { own.forEach(x => x.dispose()); glow.dispose(); root.removeFromParent(); } };
}
