import * as T from 'three';
import { edgeWear, grain, grime, paint, scratches, seeded, wornPaint } from './canvasTex';

/**
 * The power regulator Hiro finds in Bay 6: "modifies output to create a temporary window."
 * A long, battered service unit in three body segments of slightly different heights, with bolted
 * end caps, heavy connectors and cable glands at both ends, an analogue output gauge on a dark face
 * plate, a red/black chevron warning panel and a printed spec plate. Paint is chipped back to
 * bare metal along every edge.
 *
 * Built in metres (about 1.1 m long including connectors), long axis on X, front face toward +Z,
 * resting on y = 0. Each call builds its own geometry and materials; dispose() frees them.
 */
export type Limiter = T.Group & {
  /** The gauge needle's pivot; setGauge drives it. */
  needle: T.Object3D;
  /** Status lamp beside the spec plate. */
  led: T.MeshBasicMaterial;
  /** The trailing yellow and black cables, so a scene can hide them. */
  cables: T.Group;
  /** 0 → 1 across the dial's sweep. */
  setGauge(value: number): void;
  dispose(): void;
};

export const LIMITER_LENGTH = 1.12;
/** Where the heavy black feed leaves the main cable gland (right-hand end), in the unit's own frame: x .56, y FOOT + .13. */
export const LIMITER_FEED = new T.Vector3(.56, .146, 0);

function gaugeFace() {
  return paint(512, 512, (x, w) => {
    const c = w / 2, r = seeded(41);
    x.fillStyle = '#e6dfcb'; x.fillRect(0, 0, w, w);
    grain(x, w, w, r, 5000, .08); grime(x, w, w, r, 5, '60,48,30', .14);
    x.translate(c, c);
    // Red band over the top of the scale: the unlimited end.
    x.strokeStyle = '#b3201c'; x.lineWidth = 22; x.beginPath(); x.arc(0, 0, 196, -Math.PI / 2 + .62, -Math.PI / 2 + 2.36); x.stroke();
    x.strokeStyle = '#1b1a18'; x.fillStyle = '#1b1a18'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i <= 50; i++) {
      const a = (-135 + i * 5.4) * Math.PI / 180, major = i % 5 === 0, r1 = major ? 168 : 182;
      x.lineWidth = major ? 6 : 2.5; x.beginPath(); x.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1); x.lineTo(Math.sin(a) * 206, -Math.cos(a) * 206); x.stroke();
      if (major) { x.font = '600 34px "Space Grotesk", Arial, sans-serif'; x.fillText(String(i / 5), Math.sin(a) * 136, -Math.cos(a) * 136); }
    }
    x.font = '600 30px "IBM Plex Mono", monospace'; x.fillText('OUTPUT', 0, 70);
    x.font = '22px "IBM Plex Mono", monospace'; x.fillStyle = '#5a554b'; x.fillText('×10 %', 0, 104);
    x.beginPath(); x.arc(0, 0, 238, 0, Math.PI * 2); x.lineWidth = 16; x.strokeStyle = '#2a2826'; x.stroke();
  });
}

function chevronPanel() {
  return paint(256, 384, (x, w, h) => {
    const r = seeded(52);
    x.fillStyle = '#141414'; x.fillRect(0, 0, w, h);
    // Three stacked chevrons pointing along the unit, like a flow arrow.
    x.fillStyle = '#c4231c';
    for (let i = 0; i < 3; i++) {
      const y0 = 40 + i * 108;
      x.beginPath(); x.moveTo(36, y0); x.lineTo(150, y0 + 46); x.lineTo(36, y0 + 92); x.lineTo(36, y0 + 62); x.lineTo(92, y0 + 46); x.lineTo(36, y0 + 30); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(126, y0); x.lineTo(226, y0 + 46); x.lineTo(126, y0 + 92); x.closePath(); x.fill();
    }
    grain(x, w, h, r, 4000, .22); scratches(x, w, h, r, 26, '220,210,200', .5); edgeWear(x, w, h, r, '#8d8a84', 14, .8);
  });
}

function specPlate() {
  return paint(512, 320, (x, w, h) => {
    const r = seeded(63);
    x.fillStyle = '#d9d2bf'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#26241f'; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = '#26241f'; x.fillRect(14, 14, w - 28, 62);
    x.fillStyle = '#d9d2bf'; x.font = '700 40px "Space Grotesk", Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('POWER REGULATOR', 32, 46);
    x.fillStyle = '#26241f'; x.font = '500 25px "IBM Plex Mono", monospace';
    ['TYPE  PR-6 · SERVICE', 'IN    48 V DC  12 A', 'OUT   ADJ 0–100 %', 'HOLD  90 s WINDOW', 'BAY 6  ·  SN 0614'].forEach((line, i) => x.fillText(line, 32, 106 + i * 40));
    // Barcode strip.
    for (let i = 0; i < 46; i++) if (r() > .4) x.fillRect(372 + i * 2.6, 112, 1.6 + r() * 1.6, 120);
    grain(x, w, h, r, 6000, .12); grime(x, w, h, r, 6, '40,30,20', .2); scratches(x, w, h, r, 24, '120,110,90', .5);
  });
}

function knurl(radius: number, length: number) {
  // A connector collar with knurled ridges, lying along X.
  const g = new T.CylinderGeometry(radius, radius, length, 28, 1);
  const p = g.attributes.position as T.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + (Math.floor((a / Math.PI + 1) * 14) % 2) * .06;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals(); g.rotateZ(Math.PI / 2); return g;
}

export function createLimiter(): Limiter {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
  const own = <G extends T.BufferGeometry>(g: G) => (geometries.add(g), g);
  const tex = (t: T.Texture) => (textures.add(t), t);
  const std = (o: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(o); materials.add(m); return m; };

  const root = new T.Group() as Limiter; root.name = 'power-regulator';
  const add = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = root, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(own(g), m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };

  const paintA = tex(wornPaint('#a59f92', 11, { rustSpots: 12, scratchCount: 110 }));
  const paintB = tex(wornPaint('#99938a', 23, { rustSpots: 14, scratchCount: 90 }));
  const paintDark = tex(wornPaint('#3b3a38', 37, { metal: '#a9a8a2', rustSpots: 4, scratchCount: 80 }));
  const plateTex = tex(paint(256, 256, (x, w, h) => { const r = seeded(77); x.fillStyle = '#202224'; x.fillRect(0, 0, w, h); grain(x, w, h, r, 3000, .14); scratches(x, w, h, r, 40, '180,180,175', .35); edgeWear(x, w, h, r, '#7d7f80', 10, .7); }));
  const housing = std({ map: paintA, bumpMap: paintA, bumpScale: .6, roughness: .62, metalness: .35 });
  const housing2 = std({ map: paintB, bumpMap: paintB, bumpScale: .6, roughness: .66, metalness: .32 });
  const gunmetal = std({ map: paintDark, bumpMap: paintDark, bumpScale: .5, roughness: .5, metalness: .6 });
  const plate = std({ map: plateTex, roughness: .48, metalness: .45 });
  const steel = std({ color: '#a7aaaa', roughness: .32, metalness: .92 });
  const darkSteel = std({ color: '#3d4144', roughness: .42, metalness: .85 });
  const bare = std({ color: '#cfccc4', roughness: .3, metalness: .95 });
  const rubber = std({ color: '#141516', roughness: .82, metalness: 0 });
  const yellow = std({ color: '#e0b21c', roughness: .42, metalness: .05 });
  const red = std({ color: '#b51d18', roughness: .4, metalness: .2 });
  const face = std({ map: tex(gaugeFace()), roughness: .55, metalness: 0 });
  const chevron = std({ map: tex(chevronPanel()), roughness: .5, metalness: .25 });
  const spec = std({ map: tex(specPlate()), roughness: .6, metalness: .1 });
  const glass = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .05, metalness: .1, transparent: true, opacity: .14, depthWrite: false }); materials.add(glass);
  const led = new T.MeshBasicMaterial({ color: '#2a3a33', toneMapped: false }); materials.add(led);

  const bolt = (x: number, y: number, z: number, axis: 'x' | 'y' | 'z', r = .009, parent: T.Object3D = root) => {
    const g = new T.CylinderGeometry(r, r, r * .9, 6);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
    add(g, steel, x, y, z, parent);
  };
  /** A bevel strip along a top edge: bare metal where the paint is worn through. */
  const bevel = (x: number, y: number, z: number, len: number, w = .016) => add(new T.BoxGeometry(len, w, w), bare, x, y, z, root, Math.PI / 4);

  const FOOT = .016;
  // ── Body segments: left module, main gauge housing, spec module. Heights step slightly.
  type Seg = { x0: number; x1: number; h: number; d: number; mat: T.Material };
  const segs: Seg[] = [
    { x0: -.40, x1: -.185, h: .215, d: .205, mat: gunmetal },
    { x0: -.18, x1: .205, h: .255, d: .232, mat: housing },
    { x0: .21, x1: .40, h: .228, d: .214, mat: housing2 },
  ];
  for (const s of segs) {
    const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
    add(new T.BoxGeometry(w, s.h, s.d), s.mat, cx, FOOT + s.h / 2, 0);
    bevel(cx, FOOT + s.h, s.d / 2, w - .01); bevel(cx, FOOT + s.h, -s.d / 2, w - .01);
    bevel(cx, FOOT, s.d / 2, w - .01, .012);
  }
  // Seams between segments: dark gaskets with a ring of bolts.
  for (const x of [-.1825, .2075]) {
    add(new T.BoxGeometry(.008, .2, .2), rubber, x, FOOT + .11, 0);
    for (const y of [.05, .2]) for (const z of [-.09, .09]) bolt(x + (x < 0 ? .008 : -.008), FOOT + y, z * 1.24, 'z', .007);
  }
  // Skid feet.
  for (const x of [-.33, .33]) for (const z of [-.08, .08]) add(new T.CylinderGeometry(.018, .022, FOOT, 12), rubber, x, FOOT / 2, z);

  // ── Main housing front: dark face plate, gauge, chevron panel.
  const frontZ = .232 / 2;
  add(new T.BoxGeometry(.33, .2, .012), plate, .012, FOOT + .128, frontZ + .006);
  for (const [x, y] of [[-.145, .04], [.17, .04], [-.145, .215], [.17, .215]]) bolt(x, FOOT + y, frontZ + .014, 'z');
  const gauge = new T.Group(); gauge.position.set(-.06, FOOT + .13, frontZ + .012); root.add(gauge);
  add(new T.CylinderGeometry(.079, .084, .03, 40).rotateX(Math.PI / 2), darkSteel, 0, 0, .015, gauge);
  add(new T.TorusGeometry(.072, .009, 12, 48), steel, 0, 0, .031, gauge);
  add(new T.CircleGeometry(.07, 48), face, 0, 0, .0305, gauge);
  add(new T.CircleGeometry(.07, 48), glass, 0, 0, .036, gauge).castShadow = false;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; bolt(Math.cos(a) * .088, Math.sin(a) * .088, .004, 'z', .006, gauge); }
  const needle = new T.Group(); needle.position.z = .033; gauge.add(needle);
  add(new T.BoxGeometry(.0045, .058, .002), red, 0, .022, 0, needle);
  add(new T.BoxGeometry(.006, .016, .002), red, 0, -.008, 0, needle);
  add(new T.CylinderGeometry(.007, .007, .006, 16).rotateX(Math.PI / 2), darkSteel, 0, 0, .002, needle);
  // Chevron warning panel on a raised black plate.
  add(new T.BoxGeometry(.088, .15, .01), rubber, .095, FOOT + .13, frontZ + .016);
  add(new T.PlaneGeometry(.08, .142), chevron, .095, FOOT + .13, frontZ + .0215);
  for (const y of [.062, .198]) bolt(.095, FOOT + y, frontZ + .024, 'z', .006);
  // A dent and a gouge on the housing, the knocks it took.
  add(new T.SphereGeometry(.03, 10, 8), housing, .15, FOOT + .24, frontZ - .012).scale.set(1.4, .5, .5);

  // ── Left module: hatch, toggle guard, small hazard strip.
  const lx = -.2925, lFront = .205 / 2;
  add(new T.BoxGeometry(.15, .1, .008), plate, lx, FOOT + .12, lFront + .004);
  for (const [x, y] of [[-.065, .08], [.065, .08], [-.065, .16], [.065, .16]]) bolt(lx + x, FOOT + y, lFront + .01, 'z', .006);
  const guard = new T.Group(); guard.position.set(lx + .03, FOOT + .12, lFront + .012); root.add(guard);
  add(new T.BoxGeometry(.04, .045, .02), red, 0, 0, .01, guard);
  add(new T.CylinderGeometry(.005, .005, .03, 10).rotateX(Math.PI / 2), steel, -.045, 0, .015, guard);
  for (let i = 0; i < 4; i++) add(new T.BoxGeometry(.034, .006, .002), i % 2 ? rubber : yellow, lx - .04, FOOT + .045 + i * .007, lFront + .009);

  // ── Spec module: printed plate, rivets, vent slots, status lamp.
  const sx = .305, sFront = .214 / 2;
  add(new T.PlaneGeometry(.15, .094), spec, sx, FOOT + .1, sFront + .002);
  for (const [x, y] of [[-.07, .058], [.07, .058], [-.07, .142], [.07, .142]]) add(new T.SphereGeometry(.004, 8, 6), steel, sx + x, FOOT + y, sFront + .003);
  for (let i = 0; i < 6; i++) add(new T.BoxGeometry(.016, .004, .004), rubber, sx - .05 + i * .02, FOOT + .19, sFront + .001);
  add(new T.CylinderGeometry(.011, .011, .01, 16).rotateX(Math.PI / 2), darkSteel, sx + .062, FOOT + .19, sFront + .004);
  add(new T.SphereGeometry(.0075, 12, 8), led, sx + .062, FOOT + .19, sFront + .009);

  // ── Top spine: a stepped rib along the back with bolts, and a carry bar.
  add(new T.BoxGeometry(.72, .024, .05), gunmetal, 0, FOOT + .255 + .012, -.06);
  for (let i = 0; i < 8; i++) bolt(-.33 + i * .094, FOOT + .282, -.06, 'y', .007);
  for (const x of [-.12, .14]) add(new T.BoxGeometry(.02, .05, .02), darkSteel, x, FOOT + .29, .03);
  add(new T.CylinderGeometry(.009, .009, .28, 12).rotateZ(Math.PI / 2), steel, .01, FOOT + .315, .03);

  // ── End caps, bolted, with connectors and cable glands.
  const caps: [number, number][] = [[-1, -.43], [1, .43]];
  for (const [side, x] of caps) {
    add(new T.BoxGeometry(.06, .19, .19), darkSteel, x, FOOT + .11, 0);
    add(new T.BoxGeometry(.064, .17, .17), plate, x + side * .002, FOOT + .11, 0);
    for (const y of [.03, .19]) for (const z of [-.08, .08]) bolt(x + side * .033, FOOT + y, z, 'x', .009);
  }
  // Left: one heavy round connector and a small signal plug.
  add(knurl(.05, .03), steel, -.475, FOOT + .13, 0);
  add(new T.CylinderGeometry(.042, .042, .05, 24).rotateZ(Math.PI / 2), darkSteel, -.51, FOOT + .13, 0);
  add(new T.CylinderGeometry(.03, .036, .04, 20).rotateZ(Math.PI / 2), rubber, -.55, FOOT + .13, 0);
  add(new T.CylinderGeometry(.018, .018, .04, 16).rotateZ(Math.PI / 2), steel, -.475, FOOT + .05, .05);
  // Right: a cable gland (hex nut + taper) for the main feed, and a second, smaller gland.
  add(new T.CylinderGeometry(.052, .052, .03, 6).rotateZ(Math.PI / 2), steel, .475, FOOT + .13, 0);
  add(knurl(.042, .03), darkSteel, .505, FOOT + .13, 0);
  add(new T.CylinderGeometry(.024, .04, .05, 20).rotateZ(Math.PI / 2), rubber, .54, FOOT + .13, 0);
  add(new T.CylinderGeometry(.024, .024, .022, 6).rotateZ(Math.PI / 2), steel, .472, FOOT + .05, -.05);
  add(new T.CylinderGeometry(.012, .018, .03, 14).rotateZ(Math.PI / 2), rubber, .495, FOOT + .05, -.05);

  // ── Trailing cables: yellow from both ends, the heavy black feed from the right.
  const cables = new T.Group(); root.add(cables);
  const curve = (pts: [number, number, number][]) => new T.CatmullRomCurve3(pts.map(p => new T.Vector3(...p)));
  const tube = (c: T.Curve<T.Vector3>, r: number, m: T.Material) => add(new T.TubeGeometry(c, 64, r, 10), m, 0, 0, 0, cables);
  const lead = curve([[-.57, FOOT + .13, 0], [-.63, FOOT + .12, .01], [-.7, FOOT + .05, .06], [-.72, .012, .16], [-.62, .012, .24], [-.52, .012, .2]]);
  tube(lead, .011, yellow);
  tube(curve([[-.49, FOOT + .05, .05], [-.55, FOOT + .03, .09], [-.6, .009, .14], [-.68, .009, .1]]), .006, rubber);
  tube(curve([[.56, FOOT + .13, 0], [.63, FOOT + .11, -.01], [.69, .03, -.04], [.78, .02, -.12], [.86, .02, -.08]]), .02, rubber);
  tube(curve([[.51, FOOT + .05, -.05], [.57, FOOT + .04, -.08], [.62, .01, -.14], [.58, .01, -.24], [.5, .01, -.26], [.44, .01, -.22]]), .009, yellow);
  // Black bands printed along the yellow lead.
  for (const t of [.25, .5, .75]) {
    const p = lead.getPointAt(t), band = add(new T.CylinderGeometry(.0118, .0118, .012, 12), rubber, p.x, p.y, p.z, cables);
    band.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), lead.getTangentAt(t));
  }

  root.needle = needle; root.led = led; root.cables = cables;
  root.setGauge = (v: number) => { needle.rotation.z = -(-135 + T.MathUtils.clamp(v, 0, 1) * 270) * Math.PI / 180; };
  root.setGauge(.08);
  root.dispose = () => { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); };
  return root;
}
