import * as T from 'three';
import gsap from 'gsap';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { edgeWear, grain, grime, paint, scratches, seeded, wornPaint } from '../phase4/canvasTex';

/**
 * Hiro's own controller for the PR-6: a handheld remote he built to pair with the regulator in
 * Baymax's back. Same family as the PR-6 itself (worn grey paint chipped to bare metal, gunmetal
 * end caps with bolts, a small analogue OUTPUT gauge, a red/black chevron panel) with one guarded
 * toggle: flip the red cover up, push the bat forward and the limit is on.
 *
 * Built in metres, about 15 cm long: long axis on Z (the tip, with its stub aerial, toward -Z),
 * face up (+Y), origin at the middle of the grip.
 *
 * createFirstPersonHands() is the pair of hands that hold it, for a camera at Hiro's eye.
 */
export type LimiterController = {
  root: T.Object3D;
  /** Snap to on (limit on: guard up, bat forward, needle at 35 %, lamp lit) or off. */
  setOn(on: boolean): void;
  isOn(): boolean;
  /** The animated parts, 0..1. press() drives these; set them directly for a custom move. */
  state: { guard: number; toggle: number; lamp: number; gauge: number };
  /** Lamp pulse and needle jitter. Optional: setOn/press already pose everything. */
  update(t: number): void;
  /** World position of the guard's lip and of the toggle bat (where a thumb or finger goes). */
  guardWorld(out?: T.Vector3): T.Vector3;
  toggleWorld(out?: T.Vector3): T.Vector3;
  dispose(): void;
};

/** Output when limited, as the dial reads it. */
const LIMIT = .35;

function gaugeFace() {
  return paint(256, 256, (x, w) => {
    const c = w / 2, r = seeded(14);
    x.fillStyle = '#e6dfcb'; x.fillRect(0, 0, w, w);
    grain(x, w, w, r, 1800, .08); grime(x, w, w, r, 3, '60,48,30', .16);
    x.translate(c, c);
    x.strokeStyle = '#b3201c'; x.lineWidth = 14; x.beginPath(); x.arc(0, 0, 96, -Math.PI / 2 + .62, -Math.PI / 2 + 2.36); x.stroke();
    x.strokeStyle = '#1b1a18'; x.fillStyle = '#1b1a18'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i <= 20; i++) {
      const a = (-135 + i * 13.5) * Math.PI / 180, major = i % 5 === 0, r1 = major ? 80 : 90;
      x.lineWidth = major ? 4.5 : 2; x.beginPath(); x.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1); x.lineTo(Math.sin(a) * 104, -Math.cos(a) * 104); x.stroke();
    }
    x.font = '700 22px "IBM Plex Mono", monospace'; x.fillText('OUT', 0, 44);
    x.font = '600 26px "Space Grotesk", Arial, sans-serif'; x.fillText('0', -62, 58); x.fillText('10', 64, 58);
    x.beginPath(); x.arc(0, 0, 120, 0, Math.PI * 2); x.lineWidth = 12; x.strokeStyle = '#2a2826'; x.stroke();
  });
}
function chevrons() {
  return paint(256, 128, (x, w, h) => {
    const r = seeded(31);
    x.fillStyle = '#141414'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c4231c';
    for (let i = 0; i < 4; i++) { const x0 = 18 + i * 60; x.beginPath(); x.moveTo(x0, 16); x.lineTo(x0 + 36, 64); x.lineTo(x0, 112); x.lineTo(x0 + 22, 112); x.lineTo(x0 + 58, 64); x.lineTo(x0 + 22, 16); x.closePath(); x.fill(); }
    grain(x, w, h, r, 2000, .22); scratches(x, w, h, r, 14, '220,210,200', .5); edgeWear(x, w, h, r, '#8d8a84', 8, .8);
  });
}
function label() {
  return paint(256, 64, (x, w, h) => {
    const r = seeded(9);
    x.fillStyle = '#d9d2bf'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#26241f'; x.fillRect(0, 0, 70, h);
    x.fillStyle = '#d9d2bf'; x.font = '700 30px "Space Grotesk", Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('PR-6', 6, 33);
    x.fillStyle = '#26241f'; x.font = '600 21px "IBM Plex Mono", monospace'; x.fillText('LINK · LIMIT', 82, 22); x.fillText('HH-01  ·  H.H.', 82, 46);
    grain(x, w, h, r, 1500, .12); scratches(x, w, h, r, 10, '120,110,90', .5);
  });
}

export function createLimiterController(): LimiterController {
  const geos = new Set<T.BufferGeometry>(), mats = new Set<T.Material>(), texes = new Set<T.Texture>();
  const g = <G extends T.BufferGeometry>(x: G) => (geos.add(x), x);
  const tex = (t: T.Texture) => (texes.add(t), t);
  const std = (o: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(o); mats.add(m); return m; };
  const root = new T.Group(); root.name = 'limiter-controller';
  const add = (geo: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = root, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(g(geo), m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh;
  };

  const paintTex = tex(wornPaint('#a59f92', 61, { rustSpots: 6, scratchCount: 70, size: 256 }));
  const darkTex = tex(wornPaint('#3b3a38', 62, { metal: '#a9a8a2', rustSpots: 2, scratchCount: 50, size: 256 }));
  const plateTex = tex(paint(128, 128, (x, w, h) => { const r = seeded(63); x.fillStyle = '#202224'; x.fillRect(0, 0, w, h); grain(x, w, h, r, 1500, .14); scratches(x, w, h, r, 20, '180,180,175', .35); edgeWear(x, w, h, r, '#7d7f80', 6, .7); }));
  const housing = std({ map: paintTex, bumpMap: paintTex, bumpScale: .4, roughness: .6, metalness: .35 });
  const gunmetal = std({ map: darkTex, bumpMap: darkTex, bumpScale: .4, roughness: .5, metalness: .6 });
  const plate = std({ map: plateTex, roughness: .48, metalness: .45 });
  const steel = std({ color: '#b3b6b6', roughness: .3, metalness: .92 });
  const darkSteel = std({ color: '#3d4144', roughness: .42, metalness: .85 });
  const rubber = std({ color: '#161718', roughness: .85, metalness: 0 });
  const red = std({ color: '#b51d18', roughness: .38, metalness: .25 });
  const face = std({ map: tex(gaugeFace()), roughness: .55 });
  const chev = std({ map: tex(chevrons()), roughness: .5, metalness: .2 });
  const sticker = std({ map: tex(label()), roughness: .6, metalness: .05 });
  const glass = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .05, metalness: .1, transparent: true, opacity: .16, depthWrite: false }); mats.add(glass);
  const lampMat = new T.MeshBasicMaterial({ color: '#2a2f2a', toneMapped: false }); mats.add(lampMat);
  const lensMat = new T.MeshBasicMaterial({ color: '#4a1210', toneMapped: false }); mats.add(lensMat);

  // Body: a rounded slab, chamfered paint worn through on the long top edges.
  const W = .062, L = .15, H = .026;
  const slab = (w: number, l: number, r: number, h: number) => {
    const s = new T.Shape(), x = -w / 2, y = -l / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + l - r); s.quadraticCurveTo(x + w, y + l, x + w - r, y + l);
    s.lineTo(x + r, y + l); s.quadraticCurveTo(x, y + l, x, y + l - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const geo = new T.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2, curveSegments: 5 });
    geo.rotateX(Math.PI / 2); geo.translate(0, h / 2, 0); return geo;
  };
  add(slab(W, L, .01, H), housing, 0, 0, 0);
  for (const s of [-1, 1]) add(new T.BoxGeometry(.003, .004, L - .03), steel, s * (W / 2 - .001), H / 2 + .0005, 0, root, 0, 0, s * .8);
  // Rubber grips down both sides.
  for (const s of [-1, 1]) add(new T.BoxGeometry(.005, H * .5, .08), rubber, s * (W / 2 + .0012), -.004, .022);
  // End caps, bolted. The tip carries a stub aerial and the link lens; the tail a lanyard loop.
  add(new T.BoxGeometry(W + .004, H + .004, .016), gunmetal, 0, 0, -L / 2 - .004);
  add(new T.BoxGeometry(W + .004, H + .004, .014), gunmetal, 0, 0, L / 2 + .003);
  for (const z of [-L / 2 - .004, L / 2 + .003]) for (const x of [-.022, .022]) add(new T.CylinderGeometry(.0028, .0028, .002, 6), steel, x, H / 2 + .003, z);
  add(new T.CylinderGeometry(.0042, .005, .028, 10), rubber, .021, H / 2 + .012, -L / 2 - .002);
  add(new T.SphereGeometry(.0052, 10, 8), rubber, .021, H / 2 + .027, -L / 2 - .002);
  add(new T.SphereGeometry(.0065, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lensMat, -.012, 0, -L / 2 - .012, root, -Math.PI / 2);
  add(new T.TorusGeometry(.007, .0018, 6, 16), steel, 0, 0, L / 2 + .014, root, Math.PI / 2);

  // Face plate.
  const top = H / 2 + .001;
  add(slab(.04, .084, .006, .0016), plate, 0, top, -.016);
  // Gauge: steel bezel, face, needle, glass.
  const gauge = new T.Group(); gauge.position.set(.003, top + .001, -.042); root.add(gauge);
  add(new T.CylinderGeometry(.0195, .0205, .005, 28), darkSteel, 0, .002, 0, gauge);
  add(new T.TorusGeometry(.0178, .0022, 8, 28), steel, 0, .0048, 0, gauge, Math.PI / 2);
  add(new T.CircleGeometry(.0172, 28), face, 0, .0047, 0, gauge, -Math.PI / 2);
  add(new T.CircleGeometry(.0172, 28), glass, 0, .0058, 0, gauge, -Math.PI / 2);
  const needle = new T.Group(); needle.position.y = .0052; gauge.add(needle);
  add(new T.BoxGeometry(.0013, .0006, .0145), red, 0, 0, -.006, needle);
  add(new T.CylinderGeometry(.0018, .0018, .0012, 10), darkSteel, 0, .0004, 0, needle);
  // Chevron panel near the tail, the sticker beside it.
  add(new T.PlaneGeometry(.026, .02), chev, .0, top + .0014, .042, root, -Math.PI / 2, 0, Math.PI / 2);
  add(new T.PlaneGeometry(.048, .012), sticker, 0, top + .0014, .0635, root, -Math.PI / 2);

  // The guarded toggle, toward the tip: a steel collar and bat on a pivot, the red cover hinged
  // on its tip-side edge so a thumb from the grip can get under its lip and flick it up.
  const sw = new T.Group(); sw.position.set(.002, top, .008); root.add(sw);
  add(new T.BoxGeometry(.026, .004, .03), darkSteel, 0, .002, 0, sw);
  add(new T.CylinderGeometry(.0055, .0055, .005, 16), steel, 0, .0055, 0, sw);
  const bat = new T.Group(); bat.position.y = .007; sw.add(bat);
  add(new T.CylinderGeometry(.0022, .0032, .017, 10), steel, 0, .0085, 0, bat);
  add(new T.SphereGeometry(.0034, 10, 8), steel, 0, .017, 0, bat);
  const guard = new T.Group(); guard.position.set(0, .004, -.016); sw.add(guard);
  add(new T.CylinderGeometry(.0024, .0024, .03, 10), steel, 0, 0, 0, guard, 0, 0, Math.PI / 2);
  // The cover: an open-bottomed box (top and two sides) so it reads as a hollow cap over the bat.
  add(new T.BoxGeometry(.026, .0022, .031), red, 0, .022, .0155, guard);
  for (const s of [-1, 1]) add(new T.BoxGeometry(.0022, .021, .031), red, s * .012, .0115, .0155, guard);
  add(new T.BoxGeometry(.026, .021, .0022), red, 0, .0115, .03, guard);
  const lip = add(new T.BoxGeometry(.014, .003, .005), red, 0, .007, .033, guard);
  // Two white stripes on the cover.
  const stripe = std({ color: '#ece7dc', roughness: .5 });
  for (const x of [-.006, .006]) add(new T.BoxGeometry(.0025, .0005, .028), stripe, x, .0233, .0155, guard);
  // Status lamp beside the switch.
  add(new T.CylinderGeometry(.0042, .0042, .003, 14), darkSteel, .021, top + .0015, -.012);
  add(new T.SphereGeometry(.0032, 12, 8), lampMat, .021, top + .003, -.012);
  root.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });

  const state = { guard: 0, toggle: 0, lamp: 0, gauge: 1 };
  let jitter = 0;
  const apply = () => {
    guard.rotation.x = -state.guard * 1.95;
    bat.rotation.x = T.MathUtils.lerp(.5, -.5, state.toggle);
    needle.rotation.y = -(-135 + T.MathUtils.clamp(state.gauge + jitter, 0, 1) * 270) * Math.PI / 180;
  };
  const ctl: LimiterController = {
    root, state,
    setOn(on) { gsap.killTweensOf(state); Object.assign(state, on ? { guard: 1, toggle: 1, lamp: 1, gauge: LIMIT } : { guard: 0, toggle: 0, lamp: 0, gauge: 1 }); apply(); },
    isOn: () => state.toggle > .5,
    update(t) {
      jitter = Math.sin(t * 23) * Math.sin(t * 7.1) * .012 * (state.toggle > .5 ? .5 : 1);
      apply();
      lampMat.color.set(state.lamp > .5 ? '#ffb347' : '#2a2f2a').multiplyScalar(state.lamp > .5 ? 1.5 + .35 * Math.sin(t * 5) : 1);
    },
    guardWorld: (out = new T.Vector3()) => lip.getWorldPosition(out),
    toggleWorld: (out = new T.Vector3()) => bat.localToWorld(out.set(0, .017, 0)),
    dispose() { gsap.killTweensOf(state); root.removeFromParent(); geos.forEach(x => x.dispose()); mats.forEach(m => m.dispose()); texes.forEach(t => t.dispose()); },
  };
  ctl.setOn(false);
  return ctl;
}

// ─────────────────────────────────────────────────────────────── first-person hands

export type HandSide = 'left' | 'right';
/**
 * Named hand shapes a scene can ask for with FirstPersonHands.pose():
 * - hold: the left hand's grip on the remote (its default; solved against the remote's body).
 * - relaxed: loose, half-curled; the right hand's default at rest.
 * - open: flat and a little spread, reaching; the right hand's default at full reach.
 * - point: index out, the rest curled; for a switch, a button, a touch on a panel.
 * - pinch: thumb and index tips together; for a chip or a small part.
 * - grip: a closed wrap round something about 3 cm thick (the cartridge, a handle, a rail).
 * - press: flat palm, fingers together; pushing on a plate, a hatch, Baymax's chest.
 * - hook: fingers bent hard at the middle joints; hauling on an edge or a strap.
 */
export type HandPose = 'hold' | 'relaxed' | 'open' | 'point' | 'pinch' | 'grip' | 'press' | 'hook';

export type FirstPersonHands = {
  /** Parent it to the camera (the camera must be in the scene). Camera at Hiro's eye, -Z forward. */
  root: T.Object3D;
  /** Held in the left hand. */
  controller: LimiterController;
  /**
   * Every frame. walk 0..1 = speed (0 stand, 1 sprint); gait = step phase in radians (one footfall
   * per PI); raise 0..1 = controller lifted into view; reach 0..1 = right hand forward (pull a chip,
   * slot a cartridge, grip Baymax's hand).
   */
  update(t: number, dt: number, s: { walk: number; gait: number; raise: number; reach: number }): void;
  /**
   * The thumb works the guarded switch and toggles the controller: if it is off, flick the cover up
   * and push the bat forward; if it is on, pull the bat back and knock the cover shut. onClick fires
   * the moment the bat lands, onDone once the hand has settled. rate scales the speed. Returns the
   * timeline (pause or seek it for a still).
   */
  press(onClick: () => void, onDone: () => void, rate?: number): gsap.core.Timeline;
  /**
   * Shape a hand into a named pose; it blends there over about a fifth of a second. null hands it
   * back to its default (left: holding the remote; right: relaxed, opening as it reaches).
   */
  pose(side: HandSide, name: HandPose | null): void;
  /**
   * The right hand reaches for a world point so its grip point (rightSocket) lands on it, blended in
   * by k 0..1 over the usual reach. Clamped to arm's length. null lets go.
   */
  track(point: T.Vector3 | null, k?: number): void;
  /** The grip point in the right hand; it follows the pose (between the pinch, inside the grip...). Parent a held object here. */
  rightSocket: T.Object3D;
  dispose(): void;
};

/**
 * Left-thumb poses (base pitch, base yaw, bend), solved against the controller as it sits in the
 * hand: resting on the face beside the switch, tucked under the guard's lip, the flick, on the bat
 * (off / on). Each puts the pad on its target and keeps the thumb out of the body; the blends press()
 * runs between them do the same.
 */
// Solved for GRIP below: pads land within ~3 mm of the lip and the bat, rest lies on the face by the chevrons.
const THUMB = {
  rest: { tx: -2.1, ty: .68, tb: .74 }, under: { tx: -1.94, ty: .94, tb: .44 }, lip: { tx: -1.94, ty: .94, tb: .42 },
  flick: { tx: -1.61, ty: .88, tb: .2 }, tog: { tx: -1.77, ty: .89, tb: .28 }, togOn: { tx: -1.35, ty: 1.03, tb: .36 },
};

/**
 * Where the left hand sits on the remote, in the remote's frame (face +Y, tip -Z): the palm under its
 * back and rolled up onto the left edge, the fingers run diagonally along the back toward the tip,
 * the wrist off the lower left so the forearm leaves the bottom-left corner of the frame. Solved so
 * the palm just touches the body and the thumb can reach the guard's lip and the bat.
 */
const GRIP = { roll: .7, yaw: 1, at: [-.0584, -.0084, .03] as [number, number, number] };

/** Per finger (index → little) the curl at each joint in radians, then spread, then the thumb (base pitch, base yaw, middle, tip). */
type Shape = { f: [number, number, number][]; spread: number; thumb: [number, number, number, number]; at: [number, number, number] };
const curled = (c: number[]): [number, number, number][] => c.map(x => [x * 1.15, x * 1.4, x]);
/** In right-hand terms; the left mirrors the yaws. `at` is the grip point in the palm's frame. */
const SHAPES: Record<Exclude<HandPose, 'hold'>, Shape> = {
  relaxed: { f: curled([.55, .62, .7, .78]), spread: 0, thumb: [-.2, -.2, .3, .25], at: [0, -.035, -.07] },
  open: { f: curled([.15, .2, .26, .33]), spread: 1, thumb: [-.1, -.4, .3, .25], at: [0, -.03, -.08] },
  point: { f: [[.04, .06, .04], [1.15, 1.55, 1.0], [1.2, 1.6, 1.0], [1.25, 1.55, .95]], spread: .2, thumb: [.93, -1.24, .67, .59], at: [-.025, -.006, -.145] },
  pinch: { f: [[.62, .72, .4], [.85, 1.05, .7], [1.0, 1.25, .8], [1.1, 1.35, .85]], spread: -.2, thumb: [-.12, -.91, .05, .04], at: [-.022, -.054, -.094] },
  grip: { f: [[1.0, 1.25, .85], [1.05, 1.3, .9], [1.1, 1.35, .9], [1.15, 1.4, .9]], spread: -.3, thumb: [.84, -1.09, .84, .74], at: [-.004, -.027, -.071] },
  press: { f: [[.02, .03, .02], [.0, .02, .02], [.02, .03, .02], [.05, .06, .04]], spread: .15, thumb: [-.3, -.3, .12, .08], at: [0, -.02, -.07] },
  hook: { f: [[.25, 1.6, .9], [.25, 1.65, .9], [.28, 1.65, .9], [.3, 1.6, .85]], spread: -.2, thumb: [.36, -.64, 0, 0], at: [0, -.03, -.11] },
};
/** The left hand's hold on the remote, finger by finger: each joint closed until it meets the body (see GRIP). */
const HOLD: [number, number, number][] = [[.19, .01, 1.29], [.45, 0, .87], [.61, 0, 0], [.8, 0, 0]];

type Hand = { root: T.Group; fingers: T.Group[][]; thumb: T.Group[]; palm: T.Group };
type Own = { g: <G extends T.BufferGeometry>(x: G) => G; skin: T.Material; skinDark: T.Material; nail: T.Material; sleeve: T.Material; cuff: T.Material };

/**
 * The palm: one smooth, slightly cupped slab instead of a cluster of balls, wider at the knuckles than
 * at the heel, the back domed a little and thicker toward the wrist. Spans z -.002 (heel) to -.076
 * (knuckles) in the hand's frame.
 */
function palmGeometry(g: Own['g']) {
  const geo = new T.SphereGeometry(1, 32, 20), p = geo.attributes.position, v = new T.Vector3();
  const sp = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.z + 1) / 2; // 0 at the knuckles (-z), 1 at the heel
    const hx = T.MathUtils.lerp(.0365, .03, t * t), hy = T.MathUtils.lerp(.0105, .0135, t), hz = .037;
    let x = sp(v.x, .55) * hx, y = sp(v.y, .7) * hy;
    const z = sp(v.z, .5) * hz - .039;
    const across = 1 - Math.min(1, (x / hx) ** 2);
    if (y > 0) y += .0035 * across * (1 - t * .5); // domed back
    else y += .0022 * across * Math.sin(Math.PI * t); // cupped palm
    // The little-finger edge drops a touch lower than the index edge, the way a hand rests.
    y -= x * .06;
    x *= 1 + .05 * Math.sin(Math.PI * t);
    p.setXYZ(i, x, y, z);
  }
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const merged = mergeVertices(geo); geo.dispose(); merged.computeVertexNormals();
  return g(merged);
}

/**
 * One hand in its own frame: wrist at the origin, fingers along -Z, palm facing -Y, back of the
 * hand +Y; the thumb on +X for a left hand, -X for a right. The hoodie sleeve runs back along +Z.
 * Contract kept for the scenes that drive it directly (phase 6's haul): root.children[0] is the
 * sleeve (a lathe authored .32 long on its local Y), [1] the cuff; palm, fingers[4][3], thumb[3].
 */
function buildHand(side: -1 | 1, own: Own): Hand {
  const { g, skin, skinDark, nail, sleeve, cuff } = own;
  const root = new T.Group();
  const sphere = g(new T.SphereGeometry(1, 16, 12));
  // A finger segment along -Z, capped at both ends, a touch flatter than it is wide.
  const seg = (len: number, r0: number, r1: number) => {
    const pts: T.Vector2[] = [];
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI / 2; pts.push(new T.Vector2(Math.max(.0001, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
    for (let i = 1; i <= 5; i++) { const a = i / 5 * Math.PI / 2; pts.push(new T.Vector2(Math.max(.0001, Math.cos(a) * r0), Math.sin(a) * r0)); }
    const geo = g(new T.LatheGeometry(pts, 14)); geo.rotateX(Math.PI / 2); geo.scale(1, .88, 1); return geo; // lathe +Y (base) → +Z, its -len tip → -Z
  };
  // Hoodie sleeve: soft fabric that bunches toward the cuff (a lathe with a few folds), over a
  // ribbed cuff that sits snug on the wrist. Scaled on y by the haul to reach back to the shoulder,
  // so the profile is authored along a unit-ish length (.32).
  const sleeveProfile: T.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const v = i / 20, fold = Math.sin(v * Math.PI * 4.2) * .0028 * (1 - v) * (1 - v);
    sleeveProfile.push(new T.Vector2(.044 + v * .01 + fold + Math.sin(v * Math.PI) * .004, (v - .5) * .32));
  }
  const slGeo = g(new T.LatheGeometry(sleeveProfile, 22)); slGeo.scale(1, 1, .86);
  const sl = new T.Mesh(slGeo, sleeve); sl.rotation.x = Math.PI / 2; sl.position.z = .2; root.add(sl);
  const cf = new T.Mesh(g(new T.CylinderGeometry(.037, .041, .045, 22)), cuff); cf.rotation.x = Math.PI / 2; cf.position.z = .036; cf.scale.set(1, 1, .86); root.add(cf);
  // Rib lines round the cuff (children of the cuff, so they follow it when the haul resizes it).
  // One merged mesh for the four ribs (one draw instead of four).
  const ribs = [.018, .029, .04, .051].map(z => new T.TorusGeometry(.0385, .0017, 5, 22).rotateX(Math.PI / 2).translate(0, z - .036, 0));
  cf.add(new T.Mesh(g(mergeGeometries(ribs)), cuff)); ribs.forEach(x => x.dispose());

  const palm = new T.Group(); root.add(palm);
  // Wrist: narrower than the palm and oval, running into the cuff.
  const wrist = new T.Mesh(g(new T.CylinderGeometry(.025, .027, .05, 18)), skin); wrist.rotation.x = Math.PI / 2; wrist.scale.set(1.2, 1, .74); wrist.position.z = .014; palm.add(wrist);
  palm.add(new T.Mesh(palmGeometry(g), skin));
  // Thenar pad at the thumb's root, on the palm side.
  const pad = new T.Mesh(sphere, skin); pad.scale.set(.016, .013, .026); pad.position.set(side * .022, -.006, -.024); pad.rotation.y = side * .35; palm.add(pad);
  // Fingers: index, middle, ring, little; three tapering segments each, a nail on the last.
  const fingers: T.Group[][] = [];
  const specs: [number, number, number[]][] = [[.025, .0082, [.034, .023, .019]], [.0085, .0086, [.037, .026, .02]], [-.0085, .0081, [.035, .024, .019]], [-.024, .007, [.028, .019, .016]]];
  for (const [x0, r, lens] of specs) {
    const joints: T.Group[] = [];
    let parent: T.Object3D = palm, z = -.075 + Math.abs(x0) * .32;
    lens.forEach((len, i) => {
      const j = new T.Group(); j.position.set(i === 0 ? side * x0 : 0, i === 0 ? .001 : 0, z); parent.add(j);
      const r0 = r * (1 - i * .09), r1 = r * (1 - (i + 1) * .09) * (i === 2 ? .92 : 1);
      j.add(new T.Mesh(seg(len, r0, r1), skin));
      // A soft knuckle on the back of each first joint (same skin, just a slightly warmer tone).
      if (i === 0) { const k = new T.Mesh(sphere, skinDark); k.scale.set(r * .95, r * .62, r * .95); k.position.set(0, r * .38, .001); j.add(k); }
      if (i === 2) { const n = new T.Mesh(sphere, nail); n.scale.set(r1 * .78, r1 * .26, len * .36); n.position.set(0, r1 * .74, -len * .6); j.add(n); }
      joints.push(j); parent = j; z = -len;
    });
    fingers.push(joints);
  }
  // Thumb: from the heel of the palm, angled out and forward; the first segment is the fleshy base.
  const thumbBase = new T.Group(); thumbBase.position.set(side * .03, -.007, -.016); thumbBase.rotation.set(0, side * -.7, side * .5); palm.add(thumbBase);
  const thumb: T.Group[] = [];
  {
    let parent: T.Object3D = thumbBase, z = 0;
    ([[.04, .0122, .0108], [.029, .0104, .0095], [.023, .0093, .0078]] as const).forEach(([len, r0, r1], i) => {
      const j = new T.Group(); j.position.z = z; parent.add(j);
      j.add(new T.Mesh(seg(len, r0, r1), skin));
      if (i === 2) { const n = new T.Mesh(sphere, nail); n.scale.set(.0066, .0024, .0085); n.position.set(0, .0071, -len * .58); j.add(n); }
      thumb.push(j); parent = j; z = -len;
    });
  }
  return { root, fingers, thumb, palm };
}

/** The grip's transform in the remote's frame (see GRIP). */
function gripTransform(obj: T.Object3D, gp = GRIP) {
  const n = new T.Vector3(Math.sin(gp.roll), Math.cos(gp.roll), 0);
  const f = new T.Vector3(Math.cos(gp.yaw), 0, -Math.sin(gp.yaw)); f.addScaledVector(n, -f.dot(n)).normalize();
  const Y = n.clone().negate(), Z = f.clone().negate(), X = new T.Vector3().crossVectors(Y, Z);
  obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
  obj.position.fromArray(gp.at);
}

/** Set a hand's joints from a shape (yaws mirrored for the left hand). */
function applyShape(h: Hand, side: -1 | 1, f: [number, number, number][], spread: number, th: [number, number, number, number]) {
  h.fingers.forEach((j, i) => { j[0].rotation.set(-f[i][0], side * (i - 1.5) * spread * .1, 0); j[1].rotation.x = -f[i][1]; j[2].rotation.x = -f[i][2]; });
  h.thumb[0].rotation.set(th[0], -side * th[1], 0); h.thumb[1].rotation.x = -th[2]; h.thumb[2].rotation.x = -th[3];
}

/** A shape being blended toward: its current values and where they are going. */
type Blend = { f: [number, number, number][]; spread: number; thumb: [number, number, number, number]; at: T.Vector3 };
const blendOf = (s: Shape): Blend => ({ f: s.f.map(x => [...x] as [number, number, number]), spread: s.spread, thumb: [...s.thumb], at: new T.Vector3().fromArray(s.at) });
function damp(b: Blend, to: Shape, k: number) {
  b.f.forEach((x, i) => { for (let j = 0; j < 3; j++) x[j] += (to.f[i][j] - x[j]) * k; });
  b.spread += (to.spread - b.spread) * k;
  for (let j = 0; j < 4; j++) b.thumb[j] += (to.thumb[j] - b.thumb[j]) * k;
  b.at.x += (to.at[0] - b.at.x) * k; b.at.y += (to.at[1] - b.at.y) * k; b.at.z += (to.at[2] - b.at.z) * k;
}
/** The right hand's default: relaxed, opening as it reaches (q 0..1). */
function reachShape(q: number, out: Shape) {
  const c0 = [.55, .62, .7, .78], dc = [.4, .42, .44, .45];
  for (let i = 0; i < 4; i++) { const c = c0[i] - q * dc[i]; out.f[i][0] = c * 1.15; out.f[i][1] = c * 1.4; out.f[i][2] = c; }
  out.spread = q; out.thumb[0] = -.2 + q * .1; out.thumb[1] = -.2 - q * .2; out.thumb[2] = .3; out.thumb[3] = .25;
  for (let j = 0; j < 3; j++) out.at[j] = T.MathUtils.lerp(SHAPES.relaxed.at[j], SHAPES.open.at[j], q);
  return out;
}

export function createFirstPersonHands(controller: LimiterController = createLimiterController()): FirstPersonHands {
  const geos: T.BufferGeometry[] = [], mats: T.Material[] = [];
  const g = <G extends T.BufferGeometry>(x: G) => { geos.push(x); return x; };
  const std = (o: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(o); mats.push(m); return m; };
  const phys = (o: T.MeshPhysicalMaterialParameters) => { const m = new T.MeshPhysicalMaterial(o); mats.push(m); return m; };
  const knit = paint(128, 128, (x, w, h) => { const r = seeded(77); x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x.fillStyle = y % 8 ? '#8c8c8c' : '#747474'; x.fillRect(0, y, w, 2); } grain(x, w, h, r, 2500, .25); }, false);
  knit.wrapS = knit.wrapT = T.RepeatWrapping; knit.repeat.set(6, 3);
  const own: Own = {
    g,
    // Skin: a warm, slightly muted tan with a soft sheen, so the form reads under any set's light
    // without going orange or plastic under the filmic tone map.
    skin: phys({ color: '#c99b7f', roughness: .58, sheen: .35, sheenRoughness: .55, sheenColor: new T.Color('#f0b8a0') }),
    skinDark: phys({ color: '#c08f74', roughness: .62, sheen: .3, sheenRoughness: .55, sheenColor: new T.Color('#eaa894') }),
    nail: std({ color: '#e3c3b2', roughness: .3 }),
    // Hoodie fabric: a knit bump so it reads as cloth, not a painted tube.
    sleeve: std({ color: '#4d5d72', roughness: .95, bumpMap: knit, bumpScale: 1.4 }), cuff: std({ color: '#404e60', roughness: .98, bumpMap: knit, bumpScale: 2 }),
  };
  const root = new T.Group(); root.name = 'first-person-hands';
  // A soft key so the hands read whatever the set's lighting (it only reaches a metre).
  const key = new T.PointLight('#fff1e2', .9, 1.2, 2); key.position.set(.15, .25, .1); root.add(key);

  const left = buildHand(1, own), right = buildHand(-1, own);
  // Each hand hangs from a mount that does the big moves (raise, reach, sway).
  const leftMount = new T.Group(), rightMount = new T.Group(); root.add(leftMount, rightMount);
  // Left: the controller sits in the mount, face tilted up toward the eye, held the way a thick
  // remote is held: across the palm, fingers round its far edge, thumb free on the face (GRIP).
  const held = new T.Group(); leftMount.add(held);
  held.add(controller.root); controller.root.position.set(0, 0, 0); controller.root.rotation.set(0, 0, 0);
  held.add(left.root);
  gripTransform(left.root);
  rightMount.add(right.root);
  // Right: palm down, a little turned in; it opens as it reaches.
  right.root.rotation.set(-.2, -.25, -.15);
  const rightSocket = new T.Group(); rightSocket.name = 'right-hand-socket'; right.palm.add(rightSocket);
  root.traverse(o => { o.frustumCulled = false; if (o instanceof T.Mesh) o.renderOrder = 2; });

  // Animated values; press() tweens these.
  const s = { ...THUMB.rest, tilt: 0, nudge: 0 };
  const sm = { walk: 0, raise: 0, reach: 0, track: 0 };
  const want: Record<HandSide, HandPose | null> = { left: null, right: null };
  const tmpShape: Shape = { f: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], spread: 0, thumb: [0, 0, 0, 0], at: [0, 0, 0] };
  // The left hand's hold, its thumb rewritten each frame from s (which press() drives).
  const holdShape: Shape = { f: HOLD, spread: -.15, thumb: [THUMB.rest.tx, -THUMB.rest.ty, THUMB.rest.tb * .8, THUMB.rest.tb * .7], at: [0, 0, 0] };
  const rightBlend = blendOf(reachShape(0, tmpShape));
  const leftBlend = blendOf(holdShape);
  const tracked = { on: false, point: new T.Vector3(), k: 1 };
  // Weight: the hands trail the head a little when it turns and settle back with a small overshoot.
  const lag = { x: 0, y: 0, vx: 0, vy: 0 }, prevQ = new T.Quaternion(), curQ = new T.Quaternion(), dq = new T.Quaternion();
  let hasPrev = false;
  let timeline: gsap.core.Timeline | null = null;
  const v = new T.Vector3(), d = new T.Vector3(), off = new T.Vector3(), shoulder = new T.Vector3(.2, -.32, .05), inv = new T.Matrix4();

  const hands: FirstPersonHands = {
    root, controller, rightSocket,
    update(t, dt, inp) {
      const k = 1 - Math.exp(-dt * 10);
      sm.walk += (inp.walk - sm.walk) * k; sm.raise += (inp.raise - sm.raise) * (1 - Math.exp(-dt * 6)); sm.reach += (inp.reach - sm.reach) * (1 - Math.exp(-dt * 7));
      sm.track += ((tracked.on ? tracked.k : 0) - sm.track) * (1 - Math.exp(-dt * 8));
      const w = sm.walk, ph = inp.gait;
      // Head-turn lag: angular speed of the rig → a spring the mounts ride on. A cut resets it.
      root.getWorldQuaternion(curQ);
      if (hasPrev && dt > 0) {
        dq.copy(prevQ).invert().multiply(curQ);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
        if (ang > .35) { lag.x = lag.y = lag.vx = lag.vy = 0; } else {
          const sgn = dq.w < 0 ? -1 : 1, sn = Math.sqrt(Math.max(1e-9, 1 - dq.w * dq.w));
          const yawRate = sgn * dq.y / sn * ang / dt, pitchRate = sgn * dq.x / sn * ang / dt;
          const tx = T.MathUtils.clamp(yawRate * .01, -.025, .025), ty = T.MathUtils.clamp(-pitchRate * .01, -.02, .02);
          // A stiff, slightly under-damped spring: trails, then settles with a little give.
          const kS = 140, kD = 16, h = Math.min(dt, 1 / 30);
          lag.vx += ((tx - lag.x) * kS - lag.vx * kD) * h; lag.x += lag.vx * h;
          lag.vy += ((ty - lag.y) * kS - lag.vy * kD) * h; lag.y += lag.vy * h;
        }
      }
      prevQ.copy(curQ); hasPrev = true;
      const breathe = Math.sin(t * 1.6) * .004 * (1 - w);
      // Walk: a dip on each footfall, a sway side to side, and a pump with the run.
      const bob = -Math.abs(Math.cos(ph)) * .016 * w, sway = Math.sin(ph) * .014 * w, pump = Math.sin(ph) * .05 * w * w;
      // Left hand + controller: lowered out of shot ↔ raised in front, a little left of centre. The
      // remote's weight shows as a slight lag behind the right hand.
      const r = sm.raise;
      leftMount.position.set(T.MathUtils.lerp(-.2, -.085, r) + sway + lag.x, T.MathUtils.lerp(-.5, -.105, r) + bob + breathe + lag.y, T.MathUtils.lerp(-.25, -.36, r) + pump);
      leftMount.rotation.set(T.MathUtils.lerp(-.9, .8, r) + s.tilt + Math.sin(ph) * .05 * w - lag.y * 2, T.MathUtils.lerp(.4, .15, r) + lag.x * 2, .12 + Math.sin(ph) * .06 * w + s.nudge);
      // Right hand: out of shot ↔ forward and down, open. Reaching, the forearm comes in from the lower
      // right like a real arm, so the sleeve runs off the bottom corner of the frame.
      const q = sm.reach;
      rightMount.position.set(T.MathUtils.lerp(.24, .14, q) - sway * .8 + lag.x * .8, T.MathUtils.lerp(-.5, -.19, q) + bob + breathe + lag.y * .8, T.MathUtils.lerp(-.22, -.46, q) - pump);
      rightMount.rotation.set(T.MathUtils.lerp(-.8, .4, q) - Math.sin(ph) * .05 * w, T.MathUtils.lerp(-.3, .55, q), T.MathUtils.lerp(0, .35, q) - Math.sin(ph) * .06 * w);
      // Fingers ease toward the asked-for pose, or the defaults.
      const kp = 1 - Math.exp(-dt * 14);
      damp(rightBlend, want.right ? (want.right === 'hold' ? SHAPES.grip : SHAPES[want.right]) : reachShape(q, tmpShape), kp);
      applyShape(right, -1, rightBlend.f, rightBlend.spread, rightBlend.thumb);
      rightSocket.position.copy(rightBlend.at);
      // Tracking: move the mount so the socket lands on the point (clamped to arm's length).
      if (sm.track > .001) {
        root.updateMatrixWorld(true);
        inv.copy(root.matrixWorld).invert();
        v.copy(tracked.point).applyMatrix4(inv);
        d.subVectors(v, shoulder); const len = d.length();
        if (len > .62) v.copy(shoulder).addScaledVector(d, .62 / len);
        // Socket's offset in the mount's frame, with the mount's current rotation.
        rightSocket.updateWorldMatrix(true, false);
        rightSocket.getWorldPosition(off).applyMatrix4(inv).sub(rightMount.position);
        rightMount.position.lerp(v.sub(off), sm.track);
      }
      rightMount.visible = q > .01 || w > .3 || sm.track > .01 || want.right !== null; leftMount.visible = r > .01 || w > .3;
      // Left: holding the remote (the thumb from s, which press() drives), or a named pose.
      if (want.left && want.left !== 'hold') damp(leftBlend, SHAPES[want.left], kp);
      else {
        // The thumb follows press() exactly (no lag on a timed beat); the fingers settle back in.
        const th = holdShape.thumb; th[0] = s.tx; th[1] = -s.ty; th[2] = s.tb * .8; th[3] = s.tb * .7;
        damp(leftBlend, holdShape, kp); for (let j = 0; j < 4; j++) leftBlend.thumb[j] = th[j];
      }
      applyShape(left, 1, leftBlend.f, leftBlend.spread, leftBlend.thumb);
      controller.update(t);
    },
    press(onClick, onDone, rate = 1) {
      timeline?.kill();
      const c = controller.state, on = controller.isOn();
      const tl = gsap.timeline({ onComplete: onDone, defaults: { lazy: false } }); timeline = tl;
      const to = (k: keyof typeof THUMB, duration: number, ease = 'power2.inOut', extra: Record<string, number> = {}) => ({ ...THUMB[k], ...extra, duration, ease });
      if (!on) {
        // Thumb slides up under the lip, flicks the cover open past its stop, then pushes the bat.
        tl.to(s, to('under', .3, 'power2.out', { tilt: .05 }))
          .to(s, to('lip', .12, 'power2.in'))
          .to(s, to('flick', .12, 'power2.out'))
          .to(c, { guard: 1, duration: .26, ease: 'back.out(2.6)' }, '<')
          .to(s, to('tog', .16, 'power2.inOut', { nudge: .02 }))
          .to(s, to('togOn', .08, 'power3.in', { tilt: .09 }))
          .to(c, { toggle: 1, duration: .07, ease: 'back.out(3)' }, '<.02')
          .call(() => { c.lamp = 1; onClick(); })
          .to(c, { gauge: LIMIT, duration: 1.1, ease: 'power3.inOut' })
          .to(s, to('rest', .4, 'power2.inOut', { tilt: 0, nudge: 0 }), '<.12');
      } else {
        // Thumb hooks the bat back, rises over the open cover and presses it shut from on top (never
        // under its lip, where the closing cover would land on it), then goes back to the face.
        tl.to(s, to('togOn', .28, 'power2.out', { tilt: .05 }))
          .to(s, to('tog', .09, 'power3.in', { tilt: .08 }))
          .to(c, { toggle: 0, duration: .07, ease: 'back.out(3)' }, '<.02')
          .call(() => { c.lamp = 0; onClick(); })
          .to(c, { gauge: 1, duration: .8, ease: 'power2.out' })
          .to(s, to('flick', .14, 'power2.out'), '<')
          .to(s, to('lip', .14, 'power2.in', { tilt: .06 }))
          .to(c, { guard: 0, duration: .2, ease: 'bounce.out' }, '<.06')
          .to(s, to('rest', .32, 'power2.inOut', { tilt: 0, nudge: 0 }));
      }
      tl.timeScale(rate);
      return tl;
    },
    pose(side, name) { want[side] = name; },
    track(point, k = 1) { tracked.on = !!point; if (point) tracked.point.copy(point); tracked.k = T.MathUtils.clamp(k, 0, 1); },
    dispose() { timeline?.kill(); controller.dispose(); geos.forEach(x => x.dispose()); mats.forEach(m => m.dispose()); knit.dispose(); root.removeFromParent(); },
  };
  (hands as unknown as { debug: unknown }).debug = { left, right, held, leftMount, rightMount, s, hold: HOLD, thumbPoses: THUMB, grip: GRIP, shapes: SHAPES, gripTransform, applyShape };
  return hands;
}
