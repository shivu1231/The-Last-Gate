import * as T from 'three';
import { BayKit, type V3 } from './bayKit';
import { edgeWear, grain, grime, hazard, paint, rust, scratches, seeded, sign, wornPaint } from './canvasTex';
import { createLimiter, type Limiter } from './limiter';

/**
 * Bay 6, inside: the robotics maintenance hall at the end of the walk. Same world as every earlier
 * phase (slate architecture, cyan haze through high glazing, warm work lights, the displaced city
 * hanging beyond the back windows), dressed as a working bay abandoned mid-shift: an empty robot
 * cradle under a gantry crane, a tool wall and benches on the left, pallet racking on the right, a
 * mezzanine with a control booth at the back. The live street cable from the walk comes in under
 * the door and runs to the corner under the stairs, where crates hide a steel case. The power
 * regulator is inside it, still on charge.
 *
 * Hall: x −11…11, z 0 (door) … −34 (back wall), roof trusses at 8.6 m. Units are metres.
 */

export const EYE = 1.62;
export type View = { pos: V3; look: V3 };
export const VIEWS = {
  gate: { pos: [4.7, EYE, -.75], look: [1.5, 2.1, -11] },
  hub: { pos: [.4, EYE, -4.6], look: [-.5, 2.4, -18] },
  cradle: { pos: [5.4, EYE, -8.6], look: [2, 2.1, -15.4] },
  bench: { pos: [-7.3, EYE, -9.9], look: [-10.2, 1.05, -11.7] },
  toolwall: { pos: [-6.9, EYE, -15.3], look: [-11, 2.05, -17.2] },
  crates: { pos: [-5.6, EYE, -24.4], look: [-8.4, .7, -27.3] },
  box: { pos: [-7.75, 1.2, -26.5], look: [-9.3, .28, -27.4] },
} satisfies Record<string, View>;
/** Where Hiro walks when he follows the cable: from the benches, down the left aisle, to the stairs. */
export const CABLE_WALK: V3[] = [[-7.3, EYE, -9.9], [-6.5, EYE, -13], [-6.3, EYE, -18], [-6.1, EYE, -22], [-5.6, EYE, -24.4]];

/** The live street cable: in under the door, along the benches, to the case under the stairs. */
export const CABLE_PATH: V3[] = [[3.4, .05, 9], [3.3, .05, 4], [3.1, .05, .4], [2.6, .05, -1.4], [.2, .05, -3.6], [-4.4, .05, -5.7], [-7.4, .05, -7.4], [-8.6, .05, -10.6], [-8.4, .05, -15], [-8.2, .05, -19.6], [-7.7, .05, -23.4], [-7.6, .05, -26.2], [-8.3, .08, -26.7], [-8.9, .22, -26.75]];

export type BayState = { cleared: number; latches: [boolean, boolean]; lid: boolean; lift: number; charge: number };

const BOX_POS = new T.Vector3(-9.3, 0, -27.4);

export function createServiceBay() {
  const k = new BayKit('bay-6');
  const r = seeded(6606), rand = (a: number, b: number) => a + r() * (b - a), pick = <X,>(xs: X[]) => xs[Math.floor(r() * xs.length)];

  // ── Surfaces ───────────────────────────────────────────────────────────────────────────────
  const concreteTex = k.tex(paint(1024, 1024, (x, w, h) => {
    const q = seeded(11);
    x.fillStyle = '#4a545c'; x.fillRect(0, 0, w, h);
    grime(x, w, h, q, 40, '30,36,42', .3); grime(x, w, h, q, 30, '120,130,138', .12);
    grain(x, w, h, q, 60000, .16);
    // Hairline cracks and the slab joint along the tile border.
    x.strokeStyle = 'rgba(24,28,32,.55)'; x.lineWidth = 1.3;
    for (let i = 0; i < 14; i++) { x.beginPath(); let px = q() * w, py = q() * h; x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += (q() - .5) * 90; py += (q() - .5) * 90; x.lineTo(px, py); } x.stroke(); }
    x.fillStyle = 'rgba(18,22,26,.9)'; x.fillRect(0, 0, w, 5); x.fillRect(0, 0, 5, h);
    // Oil drips and tyre scuffs.
    for (let i = 0; i < 9; i++) { const cx = q() * w, cy = q() * h, rr = 10 + q() * 50, g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(12,12,14,.55)'); g.addColorStop(1, 'rgba(12,12,14,0)'); x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
  }));
  const floorMat = k.std({ map: k.repeat(concreteTex, 5, 8), bumpMap: k.repeat(concreteTex, 5, 8), bumpScale: 1.2, roughness: .86, metalness: .04 });
  const cladTex = k.tex(paint(512, 512, (x, w, h) => {
    const q = seeded(21);
    x.fillStyle = '#3d4b59'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 32) { const g = x.createLinearGradient(i, 0, i + 32, 0); g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(.35, 'rgba(0,0,0,.22)'); g.addColorStop(.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.08)'); x.fillStyle = g; x.fillRect(i, 0, 32, h); }
    grain(x, w, h, q, 12000, .1);
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(14,18,22,${.08 + q() * .18})`; x.fillRect(q() * w, 0, 2 + q() * 6, h * (.2 + q() * .8)); }
    rust(x, w, h, q, 6);
  }));
  const plinthTex = k.tex(paint(512, 256, (x, w, h) => { const q = seeded(31); x.fillStyle = '#4a545c'; x.fillRect(0, 0, w, h); grain(x, w, h, q, 9000, .16); grime(x, w, h, q, 12, '20,24,28', .3); const g = x.createLinearGradient(0, h * .5, 0, h); g.addColorStop(0, 'rgba(10,12,14,0)'); g.addColorStop(1, 'rgba(10,12,14,.5)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  const treadTex = k.tex(paint(128, 128, (x, w, h) => {
    const q = seeded(41); x.fillStyle = '#6e767b'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.save(); x.translate(i * 32 + 16, j * 32 + 16); x.rotate((i + j) % 2 ? .78 : -.78); x.fillStyle = 'rgba(200,205,208,.5)'; x.fillRect(-9, -2.5, 18, 5); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-9, 2.5, 18, 1.5); x.restore(); }
    grain(x, w, h, q, 900, .2);
  }));
  const tread = k.std({ map: treadTex, bumpMap: treadTex, bumpScale: 2, roughness: .45, metalness: .85 });
  tread.map!.wrapS = tread.map!.wrapT = T.RepeatWrapping;
  const clad = k.std({ map: cladTex, bumpMap: cladTex, bumpScale: 1.5, roughness: .62, metalness: .5 });
  cladTex.wrapS = cladTex.wrapT = T.RepeatWrapping;
  const plinth = k.std({ map: plinthTex, roughness: .9, metalness: .02 }); plinthTex.wrapS = plinthTex.wrapT = T.RepeatWrapping;

  const worn = (base: string, seed: number, o: T.MeshStandardMaterialParameters = {}, metal = '#c9c6bd') => { const t = k.tex(wornPaint(base, seed, { metal, size: 256 })); return k.std({ map: t, bumpMap: t, bumpScale: .8, roughness: .6, metalness: .45, ...o }); };
  const steel = worn('#4c5c6a', 51), steelDark = worn('#27323c', 52, { roughness: .5 }), slate = worn('#3a4857', 53);
  const craneYellow = worn('#c49a24', 54, { metalness: .35 }, '#8c8a84'), rackYellow = worn('#b88f2a', 55, { metalness: .35 }, '#7b7a75');
  const rackBlue = worn('#33536a', 56), chestRed = worn('#7c2722', 57, { metalness: .5 }), chestTeal = worn('#2b5a64', 58, { metalness: .5 });
  const caseGreen = worn('#3f4b44', 59, { metalness: .55 }), panelGrey = worn('#7b858a', 60, { metalness: .4 });
  const chrome = k.std({ color: '#b9c0c4', roughness: .26, metalness: .95 });
  const iron = k.std({ color: '#2a2f33', roughness: .55, metalness: .8 });
  const rubber = k.std({ color: '#141618', roughness: .85, metalness: 0 });
  const padRubber = k.std({ color: '#22262a', roughness: .9, metalness: 0 });
  const woodTex = (seed: number, label: string) => k.tex(paint(256, 256, (x, w, h) => {
    const q = seeded(seed); x.fillStyle = '#8a6a46'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(${q() > .5 ? '255,230,190' : '40,24,10'},${.06 + q() * .1})`; x.fillRect(0, i * 64, w, 64); x.fillStyle = 'rgba(30,18,8,.6)'; x.fillRect(0, i * 64, w, 3); }
    for (let i = 0; i < 160; i++) { x.strokeStyle = `rgba(60,38,18,${q() * .25})`; x.lineWidth = 1; x.beginPath(); const y = q() * h; x.moveTo(0, y); x.bezierCurveTo(w * .3, y + (q() - .5) * 6, w * .7, y + (q() - .5) * 6, w, y + (q() - .5) * 4); x.stroke(); }
    x.fillStyle = 'rgba(22,22,22,.72)'; x.font = '700 30px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText(label, w / 2, h * .55);
    x.font = '16px "IBM Plex Mono", monospace'; x.fillText('▲ THIS WAY UP', w / 2, h * .72);
    edgeWear(x, w, h, q, 'rgba(50,32,16,.8)', 10, .6); grime(x, w, h, q, 6);
  }));
  const crates = ['B6-0413', 'ロボ部品', 'SERVO ×4', 'B6-0688'].map((l, i) => k.std({ map: woodTex(70 + i, l), roughness: .85, metalness: 0 }));
  const glass = k.flat(k.own(new T.MeshStandardMaterial({ color: '#7fb6d4', roughness: .08, metalness: .2, transparent: true, opacity: .16, depthWrite: false })));
  const skyGlass = k.flat(k.glow('#2f6c8f', .8));
  const warmBar = k.flat(k.glow('#ffd59a', 2.2)), coolBar = k.flat(k.glow('#bfeaff', 1.6));
  const hazardMat = k.std({ map: k.tex(hazard(512, 64)), roughness: .7, metalness: .1 });
  const hazardTile = k.repeat(hazardMat.map!, 1, 1);
  const hazardFloor = k.flat(k.std({ map: hazardTile, roughness: .8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
  const lineYellow = k.flat(k.std({ color: '#c99a26', roughness: .85, polygonOffset: true, polygonOffsetFactor: -2 }));

  // ── Floor, walls, roof ─────────────────────────────────────────────────────────────────────
  k.mesh(new T.PlaneGeometry(22, 34), floorMat, [0, 0, -17], k.root, [-Math.PI / 2, 0, 0]).castShadow = false;
  // Outside apron, so the first frames (still at the gate) have ground under them.
  k.box(plinth, [0, -.15, 7], [30, .3, 14], undefined, 3);
  // Painted lanes, the cradle bay box and the big bay number.
  for (const x of [-5.2, 5.2]) k.box(lineYellow, [x, .006, -12], [.12, .012, 22]);
  k.box(lineYellow, [0, .006, -1.2], [10.5, .012, .12]);
  for (const [px, pz, sx, sz] of [[2, -11.6, 6.6, .3], [2, -18.4, 6.6, .3], [-1.15, -15, .3, 7.1], [5.15, -15, .3, 7.1]] as const) k.box(hazardFloor, [px, .008, pz], [sx, .012, sz]);
  const numberMat = k.flat(k.std({ map: k.tex(sign([['06', .9]], { w: 512, h: 512, bg: 'rgba(0,0,0,0)', fg: 'rgba(222,214,192,.72)', worn: 1.6, seed: 9 })), transparent: true, roughness: .9, polygonOffset: true, polygonOffsetFactor: -3 }));
  k.plane(numberMat, [-2.2, .01, -6.2], 3.6, 3.6, [-Math.PI / 2, 0, 0]);
  // Drain channel across the floor.
  for (let i = 0; i < 26; i++) k.box(iron, [-6.5 + i * .5, .004, -20.3], [.42, .01, .32]);
  // Oil stains under the cradle and the racks.
  const stain = k.flat(k.std({ map: k.tex(paint(256, 256, x => { const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(8,8,9,.7)'); g.addColorStop(.5, 'rgba(8,8,9,.3)'); g.addColorStop(1, 'rgba(8,8,9,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); })), transparent: true, depthWrite: false, roughness: .2, metalness: .2, polygonOffset: true, polygonOffsetFactor: -4 }));
  for (const [x, z, s] of [[2.4, -14.5, 3.2], [1, -16.6, 1.8], [8.6, -9, 1.6], [-8.8, -12.4, 1.4], [-4, -3, 1.1], [6, -27, 2.2]]) k.plane(stain, [x, .012, z], s, s * rand(.6, 1), [-Math.PI / 2, 0, rand(0, 3)]);

  // Side walls: concrete plinth, ribbed cladding, H-columns, girts, a clerestory band.
  for (const side of [-1, 1]) {
    const x = side * 11.15;
    k.box(plinth, [x, .7, -17], [.3, 1.4, 34], undefined, 2.4);
    k.box(clad, [x, 4.1, -17], [.2, 5.4, 34], undefined, 3);
    k.box(clad, [x, 9.3, -17], [.2, 1.4, 34], undefined, 3);
    k.box(skyGlass, [x - side * .02, 7.8, -17], [.12, 1.6, 33.6]);
    for (let z = -.6; z > -34; z -= 2.2) k.box(steelDark, [x - side * .02, 7.8, z], [.16, 1.62, .08]);
    for (const y of [1.45, 6.85, 8.7]) k.box(steel, [x - side * .15, y, -17], [.14, .2, 34]);
    for (let z = -2.2; z > -34; z -= 4.2) {
      k.box(steel, [x - side * .2, 4.6, z], [.32, 9.2, .06]); k.box(steel, [x - side * .2, 4.6, z - .16], [.32, 9.2, .06]); k.box(steel, [x - side * .2, 4.6, z - .08], [.06, 9.2, .32]);
      k.box(steel, [x - side * .55, 7.05, z - .08], [.7, .4, .3]); // crane runway corbel
      for (const y of [.5, 8.2]) for (const dz of [-.12, 0]) k.cyl(chrome, [x - side * .37, y, z + dz - .02], .02, .06, 'x', 6);
    }
  }
  // Back wall: plinth, cladding, and a band of windows onto the displaced city.
  k.box(plinth, [0, .7, -34.15], [22, 1.4, .3], undefined, 2.4);
  k.box(clad, [0, 3.7, -34.15], [22, 4.6, .2], undefined, 3);
  k.box(clad, [0, 9.6, -34.15], [22, .8, .2], undefined, 3);
  k.box(glass, [0, 7.6, -34.1], [21.6, 3.2, .04]);
  for (let x = -10.8; x <= 10.81; x += 1.8) k.box(steelDark, [x, 7.6, -34.05], [.09, 3.25, .12]);
  for (const y of [6.02, 7.6, 9.18]) k.box(steelDark, [0, y, -34.05], [21.8, .09, .12]);
  // Front wall around the roller door; the door is jammed part-open.
  for (const side of [-1, 1]) { k.box(plinth, [side * 7.1, .7, .15], [8, 1.4, .3], undefined, 2.4); k.box(clad, [side * 7.1, 5.2, .15], [8, 7.6, .2], undefined, 3); k.box(steel, [side * 3.15, 2.2, .1], [.3, 4.4, .45]); }
  k.box(clad, [0, 7.2, .15], [6.2, 5.6, .2], undefined, 3);
  k.box(steelDark, [0, 4.75, -.1], [6.6, .7, .7]);  // door drum housing
  // The shutter is down (Hiro came in by the side door); the street cable squeezes under it.
  for (let y = .12; y < 4.3; y += .21) k.box(slate, [0, y + .1, .02], [5.95, .19, .06]);
  k.box(hazardMat, [0, .1, -.02], [5.95, .12, .08]);
  // The side door from inside, swung shut behind him: frame, push bar, a line of light at the sill.
  k.box(steelDark, [4.7, 1.08, -.02], [1.08, 2.18, .1]);
  k.box(panelGrey, [4.7, 1.04, -.08], [.92, 2.04, .05]);
  k.box(chrome, [4.7, 1.0, -.16], [.7, .05, .06]);
  k.box(k.flat(k.glow('#ffcf8f', 1.6)), [4.7, 1.5, -.11], [.36, .5, .01]);
  k.box(k.flat(k.glow('#ffb46a', 1.4)), [4.7, .012, -.2], [.9, .01, .14]);
  k.plane(k.std({ map: k.tex(sign([['非常口 · EXIT', .5]], { w: 512, h: 128, bg: '#1f6b3a', fg: '#ffffff' })), roughness: .6 }), [4.7, 2.42, -.08], .6, .15, [0, Math.PI, 0]);
  k.plane(k.std({ map: k.tex(sign([['BAY 6 · ロボ整備', .34], ['ROBOTICS MAINTENANCE', .22]], { w: 1024, h: 256, bg: '#1d2732', fg: '#e8cf9c', worn: .8 })), roughness: .7 }), [0, 5.9, .27], 5.4, 1.35);

  // Roof: trusses every 4.2 m, purlins, roof deck, three skylights (one broken through).
  for (let z = -2.2; z > -34; z -= 4.2) {
    k.box(steel, [0, 8.7, z], [22, .16, .14]); k.box(steel, [0, 9.9, z], [22, .16, .14]);
    for (let x = -10.5; x < 10.5; x += 1.5) { k.beam(steel, [x, 8.7, z], [x + .75, 9.9, z], .07); k.beam(steel, [x + .75, 9.9, z], [x + 1.5, 8.7, z], .07); }
  }
  for (let x = -10; x <= 10; x += 2) k.box(steelDark, [x, 10.05, -17], [.12, .14, 34]);
  const deck = k.std({ color: '#1d2833', roughness: .8, metalness: .4 });
  for (const [x0, x1] of [[-11, -6.6], [-3.6, 2.2], [5.2, 11]]) k.box(deck, [(x0 + x1) / 2, 10.2, -17], [x1 - x0, .1, 34]);
  for (const [x0, x1] of [[-6.6, -3.6], [2.2, 5.2]]) {
    k.box(steelDark, [(x0 + x1) / 2, 10.15, -17], [x1 - x0, .06, 34]);
    for (let z = -1; z > -34; z -= 2.1) {
      // The skylight over the back left is blown out by the displacement; its panes are missing.
      const broken = x0 < 0 && z < -19 && z > -30;
      if (!broken || r() > .65) k.box(skyGlass, [(x0 + x1) / 2, 10.12, z - 1.05], [x1 - x0 - .1, .03, 2]);
      k.box(steelDark, [(x0 + x1) / 2, 10.13, z], [x1 - x0, .08, .08]);
    }
  }
  k.box(deck, [-5.1, 10.2, -10], [3, .1, 18]); // decked-over half of the left skylight

  // Hanging LED bars on chains, in two rows over the aisles.
  const lampBars: T.Mesh[] = [];
  for (const x of [-4.2, 6.8]) for (let z = -4; z > -32; z -= 5.6) {
    k.box(steelDark, [x, 6.9, z], [.3, .12, 2.4]);
    for (const dz of [-1, 1]) k.box(iron, [x, 7.8, z + dz], [.02, 1.8, .02]);
    const bar = k.mesh(new T.BoxGeometry(.18, .03, 2.25), x < 0 && z < -26 ? k.flat(k.glow('#ffd59a', 2.2)) : warmBar, [x, 6.83, z]); lampBars.push(bar);
  }
  const flickerBar = lampBars.find(b => b.position.x < 0 && b.position.z < -26)!;

  // Cable trays along both walls at 6 m, carrying bundles that drop to the panels and benches.
  const trayCables = [k.std({ color: '#151719', roughness: .7 }), k.std({ color: '#2a3c4a', roughness: .6 }), k.std({ color: '#5b2b24', roughness: .6 })];
  for (const side of [-1, 1]) {
    const x = side * 10.55;
    for (const dx of [-.22, .22]) k.box(chrome, [x + dx, 6.1, -17], [.04, .12, 33.5]);
    for (let z = -.5; z > -34; z -= .45) k.box(chrome, [x, 6.06, z], [.46, .03, .04]);
    for (let i = 0; i < 4; i++) k.box(trayCables[i % 3], [x - .15 + i * .1, 6.14, -17], [.06, .06, 33.4]);
    for (let z = -3; z > -34; z -= 6) k.beam(steelDark, [side * 11.05, 6.4, z], [x, 6.04, z], .05);
  }

  // ── Gantry crane over the cradle ───────────────────────────────────────────────────────────
  for (const side of [-1, 1]) { k.box(steel, [side * 10.4, 7.35, -17], [.3, .3, 34]); k.box(chrome, [side * 10.4, 7.52, -17], [.08, .05, 34]); }
  const BZ = -14.6;
  k.box(craneYellow, [0, 7.75, BZ], [20.4, .7, .5]); k.box(craneYellow, [0, 7.75, BZ - .9], [20.4, .7, .5]);
  for (const side of [-1, 1]) { k.box(craneYellow, [side * 10.1, 7.65, BZ - .45], [.7, .55, 2.6]); for (const dz of [-1, 1]) k.cyl(iron, [side * 10.4, 7.55, BZ - .45 + dz], .16, .2, 'x', 16); }
  for (let x = -9.6; x < 9.6; x += 1.2) k.box(hazardMat, [x + .6, 7.75, BZ + .26], [1.2, .14, .02]);
  k.plane(k.std({ map: k.tex(sign([['5 t', .7]], { w: 256, h: 256, bg: '#c49a24', fg: '#16171a' })), roughness: .7 }), [-6, 7.75, BZ + .27], .55, .55);
  const TX = 2;
  k.box(steelDark, [TX, 8.2, BZ - .45], [1.4, .5, 1.9]); k.cyl(iron, [TX, 7.95, BZ - .45], .32, 1.1, 'x', 20);
  for (let i = 0; i < 14; i++) k.put(new T.TorusGeometry(.05, .014, 6, 12), iron, [TX, 7.6 - i * .085, BZ - .45], [0, i % 2 ? Math.PI / 2 : 0, 0]);
  k.box(craneYellow, [TX, 6.25, BZ - .45], [.42, .5, .28]); k.cyl(chrome, [TX, 6.25, BZ - .45], .12, .32, 'z', 16);
  k.put(new T.TorusGeometry(.17, .05, 10, 20, Math.PI * 1.4), iron, [TX, 5.75, BZ - .45], [0, 0, -Math.PI * .2]);
  k.box(rubber, [TX + .4, 5.5, BZ - .45], [.1, .18, .06]); // pendant controller
  k.beam(rubber, [TX + .4, 7.95, BZ - .45], [TX + .4, 5.6, BZ - .45], .015);
  // Festoon cable loops along the runway.
  for (let z = -2; z > -32; z -= 2) k.sag(trayCables[0], [9.8, 7.3, z], [9.8, 7.3, z - 2], .45, .03);

  // ── The cradle: a robot service stand, empty ───────────────────────────────────────────────
  const CX = 2, CZ = -15;
  k.box(tread, [CX, .18, CZ], [5.6, .36, 6.2], undefined, .8);
  k.box(hazardMat, [CX, .37, CZ + 3.11], [5.6, .02, .14]);
  for (const sz of [-1, 1]) k.box(steelDark, [CX, .18, CZ + sz * 3.12], [5.7, .38, .1]);
  for (const sx of [-1, 1]) k.box(steelDark, [CX + sx * 2.82, .18, CZ], [.1, .38, 6.3]);
  // Two masts and a crossbeam.
  for (const sx of [-1, 1]) {
    const mx = CX + sx * 2.35;
    k.box(steel, [mx, 2.9, CZ - 1.6], [.42, 5.1, .42], undefined);
    k.box(steelDark, [mx, .62, CZ - 1.6], [.8, .14, .8]);
    for (let y = .9; y < 5.2; y += .45) k.box(steelDark, [mx - sx * .22, y, CZ - 1.6], [.02, .08, .3]);
    // Padded support arms reaching in, upper and lower, with hydraulic rams.
    for (const [y, reach] of [[1.4, 1.05], [2.75, .9]]) {
      k.box(slate, [mx - sx * reach / 2, y, CZ - 1.4], [reach, .22, .3]);
      k.box(padRubber, [mx - sx * (reach + .08), y, CZ - 1.4], [.16, .5, .5]);
      k.cyl(chrome, [mx - sx * .3, y - .25, CZ - 1.4], .035, .42, 'y', 10);
      k.cyl(iron, [mx - sx * .3, y - .48, CZ - 1.4], .06, .3, 'y', 12);
    }
  }
  k.box(steel, [CX, 5.35, CZ - 1.6], [5.2, .36, .42]);
  k.box(hazardMat, [CX, 5.35, CZ - 1.38], [5.1, .12, .02]);
  // Back frame with a padded backrest.
  k.box(steel, [CX, 2.5, CZ - 2.8], [3.6, .2, .2]); k.box(steel, [CX, 1.1, CZ - 2.8], [3.6, .2, .2]);
  for (const sx of [-1.7, 1.7]) k.box(steel, [CX + sx, 1.8, CZ - 2.8], [.2, 1.6, .2]);
  k.box(padRubber, [CX, 1.8, CZ - 2.62], [2.4, 1.1, .18]);
  // Service umbilicals dropping from the crossbeam, ending in dangling connectors.
  for (let i = 0; i < 7; i++) {
    const x = CX - 1.8 + i * .6, len = rand(1.6, 2.6), sway = rand(-.3, .3);
    k.tube(trayCables[i % 3], [[x, 5.2, CZ - 1.6], [x + sway * .4, 4.2, CZ - 1.2], [x + sway, 5.2 - len, CZ - .9]], .035, 24, 6);
    k.cyl(chrome, [x + sway, 5.2 - len - .07, CZ - .9], .055, .14, 'y', 10);
  }
  // Two articulated service arms parked on the masts, tool heads down.
  for (const sx of [-1, 1]) {
    const base: V3 = [CX + sx * 2.1, 4.1, CZ - 1.3], elbow: V3 = [CX + sx * 1.2, 4.55, CZ - .4], wrist: V3 = [CX + sx * .75, 3.4, CZ + .2];
    k.cyl(steelDark, base, .2, .3, 'x', 16); k.beam(slate, base, elbow, .18); k.cyl(steelDark, elbow, .15, .26, 'x', 16); k.beam(slate, elbow, wrist, .14);
    k.cyl(iron, wrist, .1, .22, 'y', 12); k.cyl(chrome, [wrist[0], wrist[1] - .22, wrist[2]], .03, .28, 'y', 8);
    k.tube(trayCables[0], [[base[0], base[1] + .15, base[2]], [elbow[0], elbow[1] + .18, elbow[2]], [wrist[0], wrist[1] + .15, wrist[2]]], .025, 20, 6);
  }
  // Diagnostic monitor on a swing arm: nobody in the stand.
  const scanTex = k.tex(paint(512, 320, (x, w, h) => {
    x.fillStyle = '#071a24'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(120,220,255,.12)'; for (let i = 0; i < w; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let i = 0; i < h; i += 24) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = 'rgba(140,230,255,.55)'; x.setLineDash([8, 6]); x.lineWidth = 3; x.beginPath(); x.ellipse(w * .32, h * .38, 46, 40, 0, 0, 7); x.stroke(); x.beginPath(); x.ellipse(w * .32, h * .72, 80, 70, 0, Math.PI, 0); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#9fe6ff'; x.font = '600 30px "IBM Plex Mono", monospace'; x.fillText('STAND 6', w * .58, 70);
    x.font = '22px "IBM Plex Mono", monospace'; x.fillStyle = 'rgba(159,230,255,.7)'; ['NO UNIT', 'LAST JOB  03:12', 'PWR REG  ON CHARGE'].forEach((t, i) => x.fillText(t, w * .58, 120 + i * 36));
    x.fillStyle = '#ffb35c'; x.fillText('● STANDBY', w * .58, 270);
  }));
  const screen = k.flat(k.own(new T.MeshBasicMaterial({ map: scanTex, toneMapped: false })));
  k.box(steelDark, [CX + 3.3, 1.2, CZ + 2.4], [.12, 2.4, .12]); k.box(steelDark, [CX + 3.3, .05, CZ + 2.4], [.6, .1, .6]);
  k.beam(steel, [CX + 3.3, 2.3, CZ + 2.4], [CX + 2.8, 2.35, CZ + 3.1], .07);
  k.box(iron, [CX + 2.8, 2.3, CZ + 3.15], [.86, .56, .06], [0, .45, 0]);
  k.plane(screen, [CX + 2.8 + Math.sin(.45) * .035, 2.3, CZ + 3.15 + Math.cos(.45) * .035], .8, .5, [0, .45, 0]);

  // ── Left wall: shadow boards, benches, chests, panels ──────────────────────────────────────
  const boardTex = (seed: number) => k.tex(paint(1024, 640, (x, w, h) => {
    const q = seeded(seed); x.fillStyle = '#c4bca7'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(40,36,30,.55)'; for (let i = 12; i < w; i += 24) for (let j = 12; j < h; j += 24) { x.beginPath(); x.arc(i, j, 3, 0, 7); x.fill(); }
    // Painted tool outlines. Most are empty: someone left with the tools.
    x.fillStyle = 'rgba(30,34,38,.82)';
    for (let i = 0; i < 26; i++) {
      const cx = 60 + (i % 9) * 110 + q() * 20, cy = 90 + Math.floor(i / 9) * 190 + q() * 30, kind = Math.floor(q() * 4);
      x.save(); x.translate(cx, cy); x.rotate((q() - .5) * .3);
      if (kind === 0) { x.fillRect(-7, -60, 14, 100); x.beginPath(); x.arc(0, -68, 20, 0, 7); x.fill(); }
      else if (kind === 1) { x.fillRect(-10, -20, 20, 70); x.fillRect(-4, -70, 8, 50); }
      else if (kind === 2) { x.fillRect(-30, -10, 60, 30); x.fillRect(-8, 20, 16, 40); }
      else { x.beginPath(); x.arc(0, 0, 32, 0, 7); x.fill(); x.fillStyle = '#c4bca7'; x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill(); x.fillStyle = 'rgba(30,34,38,.82)'; }
      x.restore();
    }
    grain(x, w, h, q, 30000, .12); grime(x, w, h, q, 22, '40,34,26', .25); edgeWear(x, w, h, q, '#8b8478', 14, .5);
  }));
  const boards = [k.std({ map: boardTex(81), roughness: .85 }), k.std({ map: boardTex(82), roughness: .85 }), k.std({ map: boardTex(83), roughness: .85 })];
  boards.forEach((m, i) => {
    const z = -8 - i * 4.4;
    k.box(steelDark, [-10.92, 2.2, z], [.08, 2.6, 4.3]);
    k.plane(m, [-10.86, 2.2, z], 4.1, 2.5, [0, Math.PI / 2, 0]);
    // The tools that stayed: wrenches, drivers, mallets and coils hung on the board.
    for (let t = 0; t < 9; t++) {
      const tz = z - 1.8 + rand(0, 3.6), ty = rand(1.3, 3.2), kind = Math.floor(r() * 3);
      if (kind === 0) { k.box(chrome, [-10.8, ty, tz], [.03, .42, .05], [rand(-.2, .2), 0, 0]); k.cyl(chrome, [-10.8, ty + .24, tz], .055, .03, 'x', 10); }
      else if (kind === 1) { k.cyl(pick([chestRed, rubber, craneYellow]), [-10.8, ty, tz], .03, .18, 'y', 8); k.cyl(chrome, [-10.8, ty + .2, tz], .008, .22, 'y', 6); }
      else k.put(new T.TorusGeometry(.12, .02, 6, 16), pick([trayCables[1], trayCables[2], craneYellow]), [-10.8, ty, tz], [0, Math.PI / 2, 0]);
    }
    k.box(steelDark, [-10.7, 3.85, z], [.5, .7, 4.2]); // wall cabinet above
    for (let d = 0; d < 3; d++) k.box(chrome, [-10.44, 3.85, z - 1.4 + d * 1.4], [.03, .03, .4]);
  });
  // Three benches: steel frame, worn timber top, drawers, a vice, and the clutter of a stopped job.
  const timber = k.std({ map: k.tex(paint(512, 128, (x, w, h) => { const q = seeded(91); x.fillStyle = '#6b5136'; x.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(30,18,8,${q() * .3})`; x.beginPath(); const y = q() * h; x.moveTo(0, y); x.lineTo(w, y + (q() - .5) * 5); x.stroke(); } grime(x, w, h, q, 18, '15,10,6', .4); scratches(x, w, h, q, 60, '200,170,130', .3); })), roughness: .7 });
  for (let i = 0; i < 3; i++) {
    const z = -7.9 - i * 4.4;
    k.box(timber, [-10.05, .98, z], [1, .07, 3.8]);
    for (const dz of [-1.8, 1.8]) for (const dx of [-.42, .42]) k.box(steelDark, [-10.05 + dx, .48, z + dz], [.06, .94, .06]);
    k.box(steelDark, [-10.05, .2, z], [.96, .04, 3.7]);
    k.box(panelGrey, [-10.05, .62, z - 1.1], [.9, .6, 1.2]);
    for (let d = 0; d < 3; d++) { k.box(steelDark, [-9.59, .78 - d * .18, z - 1.1], [.02, .14, 1.1]); k.box(chrome, [-9.57, .78 - d * .18, z - 1.1], [.02, .025, .3]); }
    // Vice at the bench end.
    k.box(iron, [-9.75, 1.12, z + 1.5], [.22, .2, .3]); k.box(iron, [-9.75, 1.12, z + 1.22], [.22, .2, .08]); k.cyl(chrome, [-9.75, 1.12, z + 1.05], .015, .3, 'z', 8);
    // Parts trays and loose hardware.
    for (let p = 0; p < 4; p++) k.box(pick([chestTeal, slate, panelGrey]), [-10.2 + rand(-.2, .2), 1.05, z - .4 + p * .34], [.3, .08, .28]);
    for (let p = 0; p < 12; p++) k.cyl(pick([chrome, iron]), [-10.05 + rand(-.4, .4), 1.03, z + rand(-1.6, 1.6)], rand(.008, .02), rand(.01, .05), 'y', 6);
    // A servo motor and a gearbox half taken apart.
    k.cyl(steel, [-10.1, 1.12, z + .5], .1, .22, 'x', 16); k.cyl(chrome, [-9.93, 1.12, z + .5], .02, .14, 'x', 8);
    k.put(new T.TorusGeometry(.1, .025, 6, 18), chrome, [-10.25, 1.03, z + .95], [Math.PI / 2, 0, 0]);
    // Under-bench storage bins.
    for (let b = 0; b < 4; b++) k.box(pick([chestTeal, craneYellow, slate]), [-10.1, .32, z + .2 + b * .4], [.6, .2, .34]);
  }
  // Bench lamps and monitors: the middle bench still has power.
  for (let i = 0; i < 3; i++) {
    const z = -7.9 - i * 4.4;
    k.beam(steelDark, [-10.4, 1.02, z + .9], [-10.3, 1.7, z + .9], .025); k.beam(steelDark, [-10.3, 1.7, z + .9], [-9.95, 1.62, z + .7], .025);
    k.put(new T.ConeGeometry(.1, .14, 14, 1, true), steelDark, [-9.92, 1.56, z + .68], [0, 0, .5]);
    k.box(iron, [-10.45, 1.32, z - .6], [.06, .5, .8], [0, 0, -.12]);
  }
  const monitorTex = k.tex(paint(512, 320, (x, w, h) => {
    x.fillStyle = '#061620'; x.fillRect(0, 0, w, h); x.fillStyle = '#8fdcf7'; x.font = '600 26px "IBM Plex Mono", monospace'; x.fillText('B6 SERVICE LOG', 24, 44);
    x.font = '20px "IBM Plex Mono", monospace'; x.fillStyle = 'rgba(143,220,247,.75)';
    ['03:02  STAND 6 CLEARED', '03:05  CRANE PARKED', '03:09  PR-6 TO CHARGE', '03:10  CASE UNDER STAIRS', '03:12  EVACUATE BAY'].forEach((t, i) => x.fillText(t, 24, 96 + i * 38));
    x.fillStyle = '#ffb35c'; x.fillRect(24, 286, 140, 6);
  }));
  const monitor = k.flat(k.own(new T.MeshBasicMaterial({ map: monitorTex, toneMapped: false })));
  k.plane(monitor, [-10.41, 1.34, -12.9], .74, .46, [0, Math.PI / 2 - .12, 0]);
  const deadScreen = k.flat(k.std({ color: '#0b1014', roughness: .15, metalness: .6 }));
  for (const z of [-8.5, -17.3]) k.plane(deadScreen, [-10.41, 1.34, z], .74, .46, [0, Math.PI / 2 - .12, 0]);
  // The job card, pinned under the lamp on the middle bench.
  const cardTex = k.tex(paint(512, 360, (x, w, h) => {
    const q = seeded(97); x.fillStyle = '#efe7d2'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, 40);
    x.fillStyle = '#efe7d2'; x.font = '700 26px "Space Grotesk", Arial'; x.fillText('JOB CARD · BAY 6', 18, 29);
    x.fillStyle = '#2a2e33'; x.font = '24px "IBM Plex Mono", monospace'; ['UNIT  PR-6 regulator', 'STATUS  on charge', 'NOTE  do not unplug!', '       spare is boxed'].forEach((t, i) => x.fillText(t, 18, 90 + i * 44));
    x.strokeStyle = '#2a2e33'; x.lineWidth = 3; x.beginPath(); x.moveTo(300, 280); x.bezierCurveTo(340, 250, 380, 320, 470, 270); x.stroke();
    grain(x, w, h, q, 9000, .08); grime(x, w, h, q, 8, '60,40,20', .25);
  }));
  k.plane(k.flat(k.std({ map: cardTex, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 })), [-9.95, 1.017, -11.75], .32, .23, [-Math.PI / 2, 0, -1.4]);
  // Rolling tool chests and a wall electrical cluster near the door.
  for (const [z, m] of [[-5.6, chestRed], [-19.6, chestTeal]] as [number, T.Material][]) {
    k.box(m, [-10.3, .6, z], [.75, 1.1, 1.3]); k.box(m, [-10.3, 1.32, z], [.72, .32, 1.25]);
    for (let d = 0; d < 6; d++) k.box(chrome, [-9.91, .2 + d * .17, z], [.02, .02, .6]);
    for (const dz of [-.55, .55]) k.cyl(rubber, [-10.3, .06, z + dz], .06, .06, 'x', 10);
  }
  for (let i = 0; i < 4; i++) {
    const x = -9.4 + i * .95;
    k.box(panelGrey, [x, 2.2, -.12], [.8, 1.2, .26]); k.box(hazardMat, [x, 2.86, -.24], [.3, .08, .01]);
    k.box(steelDark, [x, 4.1, -.08], [.07, 2.6, .07]); // conduit up to the tray
  }
  k.box(panelGrey, [-5.2, 1.6, -.14], [1.5, 2, .3]);
  k.cyl(chestRed, [-3.75, .82, -.22], .09, .5, 'y', 14); k.cyl(rubber, [-3.75, 1.12, -.22], .03, .1, 'y', 8);
  k.plane(k.std({ map: k.tex(sign([['消火器', .4], ['FIRE', .3]], { w: 256, h: 256, bg: '#a51d1d', fg: '#fff' })), roughness: .8 }), [-3.75, 1.55, -.06], .3, .3);
  // Lockers between the benches and the stairs.
  for (let i = 0; i < 6; i++) {
    const z = -20.8 - i * .52;
    k.box(rackBlue, [-10.8, 1, z], [.5, 2, .5]);
    k.box(steelDark, [-10.54, 1.62, z], [.02, .05, .3]); k.box(chrome, [-10.53, 1.1, z + .16], [.02, .14, .03]);
    if (i === 3) k.box(rackBlue, [-10.25, 1, z - .1], [.03, 1.95, .48], [0, .9, 0]); // a door left hanging open
  }

  // ── Right wall: pallet racking with crates, drums and boxed robot parts ───────────────────
  for (let z = -4; z >= -24; z -= 2.85) for (const dx of [-.55, .55]) {
    k.box(rackBlue, [10.2 + dx, 2.7, z], [.09, 5.4, .09]);
    for (let y = .3; y < 5.3; y += .7) k.beam(rackBlue, [10.2 + dx, y, z], [10.2 + dx, y + .7, z], .02);
  }
  for (let z = -4; z >= -24; z -= 2.85) for (let y = .3; y < 5.3; y += .7) k.beam(rackBlue, [9.65, y, z], [10.75, y + .35, z], .02);
  for (const y of [1.6, 3.2, 4.8]) for (const dx of [-.55, .55]) k.box(rackYellow, [10.2 + dx, y, -14], [.07, .14, 20]);
  for (let bay = 0; bay < 7; bay++) {
    const z = -5.43 - bay * 2.85;
    for (const y of [0, 1.67, 3.27, 4.87]) {
      if (r() < .12) continue;
      k.box(timber, [10.2, y + .07, z], [1.1, .12, 1.25]);
      const kind = r();
      if (kind < .45) { const h = rand(.5, 1.1), w = rand(.8, 1.1); k.box(pick(crates), [10.2, y + .13 + h / 2, z + rand(-.1, .1)], [1, h, w], [0, rand(-.06, .06), 0]); if (r() > .5) k.box(pick(crates), [10.1, y + .13 + h + .25, z], [.6, .5, .6], [0, rand(-.3, .3), 0]); }
      else if (kind < .7) for (const dz of [-.3, .3]) k.cyl(pick([rackBlue, chestTeal, panelGrey]), [10.2, y + .13 + .45, z + dz], .28, .9, 'y', 18);
      else if (kind < .88) for (let b = 0; b < 6; b++) k.box(pick([slate, panelGrey, craneYellow]), [10.15 + (b % 2) * .3 - .15, y + .25 + Math.floor(b / 2) * .25, z - .4 + (b % 3) * .4], [.28, .22, .36]);
      else { k.put(new T.SphereGeometry(.42, 18, 12), k.std({ color: '#d9dcdc', roughness: .35, metalness: .05, transparent: true, opacity: .78 }), [10.2, y + .55, z], undefined, [1, .85, 1]); }
    }
  }
  k.plane(k.std({ map: k.tex(sign([['ラック B', .34], ['SPARES · KEEP AISLE CLEAR', .2]], { w: 1024, h: 256, bg: '#1d2732', fg: '#e8e2d0', worn: .6 })), roughness: .7 }), [9.55, 5.55, -14], 3.2, .8, [0, -Math.PI / 2, 0]);
  // On the floor: a pallet jack, drums and a spare robot arm on trestles.
  k.box(craneYellow, [8.2, .12, -6.6], [.55, .14, 1.2]); k.beam(steelDark, [8.2, .2, -6], [8.2, 1.15, -5.6], .05); k.box(rubber, [8.2, 1.18, -5.55], [.4, .06, .06]);
  for (const [x, z] of [[8.4, -24.6], [7.8, -25.2], [8.6, -25.5]]) { k.cyl(rackBlue, [x, .45, z], .29, .9, 'y', 18); k.cyl(chrome, [x, .91, z], .3, .02, 'y', 18); }
  for (const z of [-19.6, -22.2]) { k.beam(steelDark, [7.4, 0, z], [7.7, .75, z], .05); k.beam(steelDark, [8, 0, z], [7.7, .75, z], .05); k.box(steelDark, [7.7, .77, z], [.6, .05, .1]); }
  const armWhite = k.std({ color: '#d7d9d6', roughness: .42, metalness: .1 });
  k.cyl(armWhite, [7.7, 1.05, -20.9], .26, 2.2, 'z', 22, .22); k.put(new T.SphereGeometry(.3, 20, 14), steelDark, [7.7, 1.05, -19.75]); k.cyl(armWhite, [7.7, 1.05, -23], .2, 1.6, 'z', 20, .16);
  k.box(hazardMat, [7.7, 1.33, -21.4], [.06, .02, .6]);

  // ── Back: mezzanine, stairs, control booth, charging docks ────────────────────────────────
  k.box(tread, [0, 3.35, -32.1], [22, .14, 4], undefined, .8);
  k.box(steel, [0, 3.18, -30.15], [22, .3, .2]);
  for (const x of [-6, -1, 4, 9]) k.box(steel, [x, 1.6, -30.25], [.28, 3.2, .28]);
  for (let x = -8.3; x <= 11; x += 1.2) k.box(craneYellow, [x, 3.95, -30.12], [.05, 1.1, .05]);
  for (const y of [4.45, 3.95]) k.box(craneYellow, [1.35, y, -30.12], [19.3, .05, .05]);
  k.box(craneYellow, [1.35, 3.5, -30.1], [19.3, .14, .02]);
  // Stairs up the left side; the space under them is where the case hides.
  const SX = -9.2, S0 = -24, S1 = -30, steps = 18;
  for (let i = 0; i < steps; i++) { const t = (i + .5) / steps; k.box(tread, [SX, 3.35 * (i + 1) / steps, S0 + (S1 - S0) * t], [1.3, .05, .3], undefined, .8); }
  for (const dx of [-.67, .67]) {
    k.beam(steel, [SX + dx, 0, S0], [SX + dx, 3.35, S1], .06, .25);
    for (const t of [0, .25, .5, .75, 1]) k.box(craneYellow, [SX + dx, 3.35 * t + .5, S0 + (S1 - S0) * t], [.04, 1, .04]);
    k.beam(craneYellow, [SX + dx, 1, S0], [SX + dx, 4.35, S1], .045);
  }
  k.plane(k.std({ map: k.tex(sign([['NO STEP · 立入注意', .4]], { w: 512, h: 128, bg: '#c49a24', fg: '#16171a' })), roughness: .7 }), [SX + .7, .85, S0 - .7], .9, .22, [0, Math.PI / 2, 0]);
  // Control booth on the mezzanine, lit from inside.
  const booth = slate;
  k.box(booth, [7.2, 4.9, -32.6], [6.6, .05, 2.8]); k.box(booth, [7.2, 6.4, -32.6], [6.6, .1, 2.8]);
  for (const x of [3.9, 10.5]) k.box(booth, [x, 5.15, -32.6], [.1, 2.5, 2.8]);
  k.box(booth, [7.2, 3.95, -31.2], [6.6, 1, .1]);
  k.box(k.flat(k.glow('#ffcf8f', .55)), [7.2, 5.2, -33.9], [6.4, 2.4, .05]);
  k.box(glass, [7.2, 5.2, -31.2], [6.4, 1.5, .03]);
  for (let x = 4.1; x < 10.5; x += 1.6) k.box(steelDark, [x, 5.2, -31.18], [.06, 1.55, .06]);
  k.box(iron, [7.2, 4.65, -32], [5, .5, .6]); for (let i = 0; i < 5; i++) k.box(k.flat(k.glow(i === 2 ? '#ff7a5c' : '#7fe0ff', 1.2)), [5.4 + i * .9, 4.92, -31.85], [.3, .02, .14]);
  k.box(steelDark, [9.6, 6.75, -33], [1.2, .6, .9]); // AC unit
  k.plane(k.std({ map: k.tex(sign([['BAY 06', .5], ['ロボット整備 · ROBOTICS MAINTENANCE', .15]], { w: 1024, h: 384, bg: '#283746', fg: '#e8e2d0', worn: 1.2 })), roughness: .7 }), [-4.2, 5.2, -34.02], 6.2, 2.3);
  // Charging docks under the mezzanine: tall cabinets, cyan status strips, coiled leads.
  const dockGlow = k.flat(k.glow('#57d2ff', 1.8)), dockDim = k.flat(k.glow('#1d4a5c', 1));
  for (let i = 0; i < 4; i++) {
    const x = -4.6 + i * 2.6;
    k.box(panelGrey, [x, 1.25, -33.55], [1.3, 2.5, .8]);
    k.box(steelDark, [x, 1.25, -33.14], [1.1, 2.2, .02]);
    k.box(i === 1 ? dockDim : dockGlow, [x - .4, 1.9, -33.12], [.06, .9, .02]);
    k.put(new T.TorusGeometry(.26, .04, 8, 22), trayCables[i % 3], [x + .25, 1, -33.08]);
    k.plane(k.std({ map: k.tex(sign([[`DOCK ${i + 1}`, .5]], { w: 256, h: 128, bg: '#1d2732', fg: '#9fe6ff' })), roughness: .7 }), [x + .1, 2.15, -33.12], .5, .25);
  }

  // ── Entrance clutter and signs ─────────────────────────────────────────────────────────────
  for (const x of [-3.6, 3.6]) for (const z of [-1, -2.6]) { k.cyl(craneYellow, [x, .55, z], .1, 1.1, 'y', 14); k.cyl(hazardMat, [x, .9, z], .102, .14, 'y', 14); }
  k.plane(k.std({ map: k.tex(sign([['CAUTION', .34], ['OVERHEAD CRANE · 頭上注意', .2]], { w: 1024, h: 320, bg: '#c49a24', fg: '#16171a', worn: .8 })), roughness: .7, side: T.DoubleSide }), [2, 6.2, -6.4], 3, .94);
  for (const dx of [-1.3, 1.3]) k.box(iron, [2 + dx, 7.3, -6.4], [.02, 1.6, .02]);
  k.plane(k.std({ map: k.tex(sign([['ヘルメット着用', .3], ['HARD HATS ON', .26]], { w: 512, h: 384, bg: '#2d5b8a', fg: '#fff', worn: .5 })), roughness: .7 }), [10.95, 2.4, -2.4], .8, .6, [0, -Math.PI / 2, 0]);
  // A ladder against the racks, cable spools, a toppled bin.
  for (const dz of [-.22, .22]) k.beam(craneYellow, [9.35, 0, -2.6 + dz], [9.05, 3.4, -2.4 + dz], .05);
  for (let i = 1; i < 11; i++) k.beam(chrome, [9.35 - i * .028, i * .3, -2.82], [9.35 - i * .028, i * .3, -2.38], .025);
  for (const [x, z, rr] of [[6.6, -3.2, .5], [7.4, -3.4, .38], [-1.4, -31.6, .45]]) { k.cyl(timber, [x, rr, z], rr, .12, 'z', 20); k.cyl(timber, [x, rr, z - .5], rr, .12, 'z', 20); k.cyl(trayCables[0], [x, rr, z - .25], rr * .75, .4, 'z', 18); }
  k.cyl(slate, [-6.2, .3, -14.6], .3, .6, 'z', 14); k.box(crates[1], [-5.6, .03, -14.3], [.4, .06, .3], [0, .6, 0]);
  // Debris from the displacement: ceiling panels down, papers, fragments.
  k.box(deck, [-4.4, .1, -24.2], [2.6, .05, 1.8], [.18, .3, .06]);
  k.box(deck, [-3.9, .45, -25.4], [2, .05, 1.4], [.5, -.4, .3]);
  const paper = k.flat(k.std({ color: '#a9a598', roughness: .9, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  for (let i = 0; i < 16; i++) k.plane(paper, [rand(-8, 8), .015, rand(-28, -2)], .21, .29, [-Math.PI / 2, 0, rand(0, 6)]);
  for (let i = 0; i < 36; i++) { const s = rand(.03, .11); k.box(pick([plinth, slate, iron]), [rand(-9, 9), s / 3, rand(-30, -2)], [s * rand(1, 2), s * .6, s], [rand(-.3, .3), rand(0, 3), rand(-.3, .3)]); }

  // ── The live cable, the case, the crates ───────────────────────────────────────────────────
  const cableMat = k.flat(k.own(new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float uTime;uniform float uHot;void main(){float band=pow(max(0.,sin((vUv.x*38.-uTime*1.8)*3.14159)),18.);vec3 base=vec3(.05,.07,.08);vec3 hot=vec3(1.,.66,.32);gl_FragColor=vec4(base+hot*(.16+band*1.7)*uHot,1.);}',
  })));
  k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(CABLE_PATH.map(p => new T.Vector3(...p))), 500, .045, 8), cableMat, [0, 0, 0]);
  // Cable clips holding it to the floor.
  const clipCurve = new T.CatmullRomCurve3(CABLE_PATH.map(p => new T.Vector3(...p)));
  for (let t = .12; t < .9; t += .045) { const p = clipCurve.getPointAt(t), d = clipCurve.getTangentAt(t); k.box(iron, [p.x, .06, p.z], [.16, .05, .06], [0, Math.atan2(d.x, d.z), 0]); }

  // The case: a steel service case under the stairs, long side facing the hall.
  const box = new T.Group(); box.position.copy(BOX_POS); box.name = 'case';
  const caseTex = k.tex(paint(512, 256, (x, w, h) => {
    const q = seeded(101); x.fillStyle = '#3f4b44'; x.fillRect(0, 0, w, h); grain(x, w, h, q, 9000, .14); grime(x, w, h, q, 10); scratches(x, w, h, q, 70); rust(x, w, h, q, 5);
    x.fillStyle = 'rgba(222,214,192,.85)'; x.font = '700 46px "IBM Plex Mono", monospace'; x.fillText('B6 · SPARE', 140, 118);
    x.font = '22px "IBM Plex Mono", monospace'; x.fillText('KEEP ON CHARGE · 充電中', 140, 156);
    x.fillStyle = '#d9a91e'; x.fillRect(30, 90, 80, 80); x.fillStyle = '#16171a'; x.font = '700 64px Arial'; x.fillText('⚡', 40, 152);
    edgeWear(x, w, h, q, '#a9aaa4', 16, .9);
  }));
  const caseFront = k.std({ map: caseTex, roughness: .55, metalness: .55 });
  const L = 1.36, H = .4, D = .62, LID = .14;
  const shell = new T.Group(); box.add(shell);
  // Lower shell, front face printed, ribs and corner guards.
  // Open-topped: a floor and four walls, so the foam and the regulator sit inside.
  const WALL = .03;
  k.mesh(new T.BoxGeometry(D, WALL, L), caseGreen, [0, .02 + WALL / 2, 0], shell);
  for (const x of [-D / 2 + WALL / 2, D / 2 - WALL / 2]) k.mesh(new T.BoxGeometry(WALL, H, L), caseGreen, [x, H / 2 + .02, 0], shell);
  for (const z of [-L / 2 + WALL / 2, L / 2 - WALL / 2]) k.mesh(new T.BoxGeometry(D - WALL * 2, H, WALL), caseGreen, [0, H / 2 + .02, z], shell);
  k.mesh(new T.PlaneGeometry(L - .1, H - .08), caseFront, [D / 2 + .003, H / 2 + .02, 0], shell, [0, Math.PI / 2, 0]);
  for (const z of [-L / 2 + .02, L / 2 - .02]) for (const x of [-D / 2 + .02, D / 2 - .02]) k.mesh(new T.BoxGeometry(.07, H + .02, .07), steelDark, [x, H / 2 + .02, z], shell);
  for (const z of [-.25, .25]) k.mesh(new T.BoxGeometry(D + .02, .03, .05), steelDark, [0, H - .02, z], shell);
  for (const z of [-L / 2 - .04, L / 2 + .04]) { k.mesh(new T.TorusGeometry(.08, .016, 8, 16, Math.PI), chrome, [0, H * .7, z], shell, [0, Math.PI / 2, 0]); }
  for (const z of [-.5, .5]) for (const x of [-.22, .22]) k.mesh(new T.CylinderGeometry(.03, .03, .02, 10), rubber, [x, .01, z], shell);
  // Foam bed, cut to the regulator's shape, and the charging socket the cable feeds.
  const foam = k.std({ map: k.tex(paint(256, 256, (x, w, h) => { const q = seeded(111); x.fillStyle = '#26292c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const g = q() > .5 ? 255 : 0; x.fillStyle = `rgba(${g},${g},${g},.07)`; x.beginPath(); x.arc(q() * w, q() * h, 1 + q() * 2, 0, 7); x.fill(); } })), roughness: 1, metalness: 0 });
  k.mesh(new T.BoxGeometry(D - WALL * 2, H - .12, L - WALL * 2), foam, [0, .05 + (H - .12) / 2, 0], shell);
  for (const x of [-.24, .24]) k.mesh(new T.BoxGeometry(.08, .1, L - .1), foam, [x, H - .07, 0], shell);
  k.mesh(new T.CylinderGeometry(.04, .04, .06, 14).rotateX(Math.PI / 2), steelDark, [D / 2 - .1, H * .55, L / 2 + .02], shell);
  const caseLed = k.flat(k.own(new T.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false })));
  k.mesh(new T.SphereGeometry(.014, 10, 8), caseLed, [D / 2 + .01, H - .08, L / 2 - .14], shell);
  // Two over-centre latches on the front.
  const latches: T.Group[] = [];
  for (const z of [-.38, .38]) {
    const latch = new T.Group(); latch.position.set(D / 2 + .02, H - .02, z); latch.userData.part = latches.length === 0 ? 'latch0' : 'latch1'; box.add(latch);
    k.mesh(new T.BoxGeometry(.03, .14, .1), chrome, [0, -.06, 0], latch);
    k.mesh(new T.BoxGeometry(.02, .04, .07), craneYellow, [.016, -.12, 0], latch);
    k.mesh(new T.BoxGeometry(.03, .05, .14), steelDark, [-.005, -.17, 0], box).position.set(D / 2 + .01, H - .2, z);
    latches.push(latch);
  }
  // Lid, hinged along the back edge, foam lined.
  const lid = new T.Group(); lid.position.set(-D / 2, H + .02, 0); lid.userData.part = 'lid'; box.add(lid);
  k.mesh(new T.BoxGeometry(D, LID, L), caseGreen, [D / 2, LID / 2, 0], lid);
  k.mesh(new T.PlaneGeometry(L - .1, LID - .04), k.std({ map: wornPaintTex(k, '#3f4b44', 121), roughness: .55, metalness: .55 }), [D + .003, LID / 2, 0], lid, [0, Math.PI / 2, 0]);
  for (const z of [-.42, 0, .42]) k.mesh(new T.BoxGeometry(D - .1, .025, .06), steelDark, [D / 2, LID + .012, z], lid);
  k.mesh(new T.BoxGeometry(D - .08, .03, L - .08), foam, [D / 2, -.015, 0], lid);
  for (const z of [-.45, 0, .45]) k.mesh(new T.CylinderGeometry(.025, .025, .14, 12).rotateX(Math.PI / 2), chrome, [0, 0, z], lid);
  const caseGlow = new T.PointLight('#9fe6ff', 0, 2.6, 2); caseGlow.position.set(0, H + .25, 0); box.add(caseGlow);
  k.root.add(box);

  // The regulator, lying face up in the foam.
  const limiter: Limiter = createLimiter();
  limiter.cables.visible = false;
  const restPos = new T.Vector3(BOX_POS.x + .15, H - .1, BOX_POS.z), restQuat = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, Math.PI / 2, 'YXZ'));
  limiter.scale.setScalar(1.08); limiter.position.copy(restPos); limiter.quaternion.copy(restQuat); k.root.add(limiter);

  // Crates stacked in front of the case, with a tarp over the top crate.
  const crateGroup = new T.Group(); crateGroup.name = 'crates'; k.root.add(crateGroup);
  type Crate = { mesh: T.Object3D; from: T.Vector3; to: T.Vector3; fromR: T.Euler; toR: T.Euler; delay: number };
  const crateList: Crate[] = [];
  const addCrate = (p: V3, s: V3, ry: number, to: V3, toR: V3, delay: number, m = pick(crates)) => {
    const c = k.mesh(new T.BoxGeometry(...s), m, p, crateGroup, [0, ry, 0]);
    for (const dy of [-s[1] / 2 + .04, s[1] / 2 - .04]) k.mesh(new T.BoxGeometry(s[0] + .01, .05, s[2] + .01), steelDark, [0, dy, 0], c);
    crateList.push({ mesh: c, from: c.position.clone(), to: new T.Vector3(...to), fromR: c.rotation.clone(), toR: new T.Euler(...toR), delay });
  };
  addCrate([-8.25, .4, -27.15], [.8, .8, .9], .1, [-8.6, .4, -25.0], [0, .7, 0], 0);
  addCrate([-8.2, .38, -28.15], [.75, .76, .8], -.12, [-7.9, .38, -29.7], [0, -.6, 0], .12);
  addCrate([-8.85, .36, -26.2], [.72, .72, .72], .35, [-9.4, .36, -25.0], [0, -.4, 0], .22);
  addCrate([-8.2, 1.08, -27.55], [.7, .6, .75], .25, [-6.9, .3, -29.1], [0, 1.2, Math.PI / 2], .3);
  // A tarp thrown over the case behind them.
  const tarp = k.mesh(new T.BoxGeometry(.8, .04, 1.6), k.std({ color: '#2e4a5c', roughness: .85 }), [-9.3, .6, -27.4], crateGroup, [0, 0, .08]);
  for (const side of [-1, 1]) k.mesh(new T.BoxGeometry(.04, .42, 1.6), tarp.material as T.Material, [side * .41, -.2, 0], tarp, [0, 0, side * -.12]);
  crateList.push({ mesh: tarp, from: tarp.position.clone(), to: new T.Vector3(-10.3, .05, -25.6), fromR: tarp.rotation.clone(), toR: new T.Euler(0, .6, 0), delay: .45 });
  crateGroup.userData.part = 'crates';

  k.finish();

  // ── Atmosphere: shafts of light, haze, dust ───────────────────────────────────────────────
  const shaftMat = k.own(new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { color: { value: new T.Color('#9fd6f2') }, opacity: { value: .085 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 color;uniform float opacity;uniform float uTime;void main(){float edge=smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x);float fall=pow(vUv.y,1.4);float n=.75+.25*sin(vUv.x*31.+uTime*.3)*sin(vUv.x*13.-uTime*.2);gl_FragColor=vec4(color,edge*fall*opacity*n);}',
  }));
  for (const [x, z, w] of [[-5.1, -22.5, 2.6], [-5.1, -26.8, 2.6], [3.7, -9, 2.4], [3.7, -19, 2.4], [3.7, -27, 2.2]]) {
    const shaft = k.mesh(new T.PlaneGeometry(w, 10.4), shaftMat, [x - .9, 5.1, z], k.root, [0, 0, -.16]); shaft.castShadow = shaft.receiveShadow = false;
    const shaft2 = k.mesh(new T.PlaneGeometry(w, 10.4), shaftMat, [x - .9, 5.1, z], k.root, [0, Math.PI / 2, -.16]); shaft2.castShadow = shaft2.receiveShadow = false;
  }
  const hazeMat = (color: string, opacity: number) => k.own(new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { color: { value: new T.Color(color) }, opacity: { value: opacity } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec2 vUv;uniform vec3 color;uniform float opacity;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),2.2);gl_FragColor=vec4(color,a*opacity);}' }));
  for (const [p, s, c, o] of [[[0, 6.5, -33.6], [22, 6, 1], '#4fa3cf', .22], [[-9.6, 1.7, -11.6], [2.6, 1.6, 1], '#ffb46a', .16], [[2, 3.4, -14], [8, 6, 1], '#88c6e6', .07], [[-8.4, .9, -27], [2.4, 1.6, 1], '#ffb46a', .12], [[0, 2.4, .6], [7, 4.2, 1], '#ffb066', .18]] as [V3, V3, string, number][]) {
    const h = k.mesh(new T.PlaneGeometry(1, 1), hazeMat(c, o), p, k.root); h.scale.set(...s); h.castShadow = h.receiveShadow = false;
  }
  const DUST = 900, dustGeo = k.geo(new T.BufferGeometry()), dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = rand(-10, 10); dp[i * 3 + 1] = rand(.2, 9); dp[i * 3 + 2] = rand(-33, -1); ds[i] = r(); }
  dustGeo.setAttribute('position', new T.BufferAttribute(dp, 3)); dustGeo.setAttribute('seed', new T.BufferAttribute(ds, 1));
  const dustMat = k.own(new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: 'attribute float seed;uniform float uTime;varying float vA;void main(){vec3 p=position;p.x+=sin(uTime*.12+seed*40.)*.4;p.y+=sin(uTime*.08+seed*20.)*.3;p.z+=cos(uTime*.1+seed*30.)*.4;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(1.5+seed*2.5)*(14./-mv.z);vA=.25+.5*seed;}',
    fragmentShader: 'varying float vA;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(c));gl_FragColor=vec4(vec3(1.,.93,.82),a*vA*.55);}',
  }));
  const dust = new T.Points(dustGeo, dustMat); dust.frustumCulled = false; k.root.add(dust);

  // Beyond the back windows: the glow over the displaced city, behind its skyline.
  const skyTex = k.tex(paint(16, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060d16'); g.addColorStop(.45, '#14324c'); g.addColorStop(.7, '#3d86ad'); g.addColorStop(.82, '#7cc4e4'); g.addColorStop(1, '#16314a'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  const sky = k.mesh(new T.PlaneGeometry(420, 150), k.flat(k.own(new T.MeshBasicMaterial({ map: skyTex, fog: false, toneMapped: false, depthWrite: false }))), [0, 30, -170]);
  sky.renderOrder = -1;

  // Fragments of the displaced city hanging under the broken skylight, turning slowly.
  const fragments: T.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const f = k.mesh(new T.BoxGeometry(rand(.3, .9), rand(.08, .3), rand(.3, .8)), pick([deck, plinth, slate]), [rand(-7, -3.5), rand(6.4, 8.6), rand(-29, -20)], k.root, [rand(0, 3), rand(0, 3), rand(0, 3)]); fragments.push(f); }

  // ── Lights ─────────────────────────────────────────────────────────────────────────────────
  const lights = new T.Group(); k.root.add(lights);
  const hemi = new T.HemisphereLight('#7aa0c0', '#0c1218', .62); lights.add(hemi);
  const moon = new T.DirectionalLight('#a9d4ef', 2.3); moon.position.set(6, 16, -8); moon.target.position.set(-2, 0, -18); lights.add(moon, moon.target);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -.0004; moon.shadow.normalBias = .03;
  Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 50 });
  const spot = new T.SpotLight('#ffd9a8', 85, 16, .55, .65, 1.6); spot.position.set(2, 8.4, -12); spot.target.position.set(2, 0, -15.5); lights.add(spot, spot.target);
  const benchLamp = new T.PointLight('#ffb867', 9, 6.5, 1.6); benchLamp.position.set(-9.9, 1.6, -11.6); lights.add(benchLamp);
  const corner = new T.PointLight('#ffb867', 4, 6, 1.6); corner.position.set(-7.4, 2.1, -26.4); lights.add(corner);
  const boothLight = new T.PointLight('#ffcf8f', 6, 9, 1.6); boothLight.position.set(7.2, 5.4, -32.4); lights.add(boothLight);

  // ── Animation ──────────────────────────────────────────────────────────────────────────────
  const anim = { cleared: 0, latch: [0, 0], lid: 0, lift: 0 };
  const hold = new T.Vector3(), holdQ = new T.Quaternion(), tmpQ = new T.Quaternion(), tilt = new T.Quaternion().setFromEuler(new T.Euler(.32, -.42, .06));
  const ease = (t: number) => t * t * (3 - 2 * t);
  let shadowTick = 0; const shadowWas = [0, 0, 0, 0, 0];

  return {
    root: k.root, box, crates: crateGroup, limiter,
    anchors: {
      cradle: new T.Vector3(CX, 3.2, CZ - 1.4), jobcard: new T.Vector3(-9.95, 1.12, -11.75), toolwall: new T.Vector3(-10.8, 2.6, -16.6),
      cable: new T.Vector3(-8.5, .2, -12.6), crates: new T.Vector3(-8.2, 1.5, -27.4), latch0: new T.Vector3(), latch1: new T.Vector3(), lid: new T.Vector3(), regulator: new T.Vector3(),
    },
    /** Whether the shadow map needs redrawing this frame (set by update). */
    shadowsDirty: true,
    /** Moves the animated parts toward the state; `camera` places the regulator in Hiro's hands. */
    update(t: number, dt: number, s: BayState, camera: T.Camera) {
      cableMat.uniforms.uTime.value = t; shaftMat.uniforms.uTime.value = t; dustMat.uniforms.uTime.value = t;
      cableMat.uniforms.uHot.value = 1 - s.lift * .7;
      const d = (rate: number) => 1 - Math.exp(-dt * rate);
      const was = shadowWas; was[0] = anim.cleared; was[1] = anim.latch[0]; was[2] = anim.latch[1]; was[3] = anim.lid; was[4] = anim.lift;
      anim.cleared += ((s.cleared) - anim.cleared) * d(2.2);
      anim.latch[0] += ((s.latches[0] ? 1 : 0) - anim.latch[0]) * d(9);
      anim.latch[1] += ((s.latches[1] ? 1 : 0) - anim.latch[1]) * d(9);
      anim.lid += ((s.lid ? 1 : 0) - anim.lid) * d(2.4);
      anim.lift += (s.lift - anim.lift) * d(3);
      // Shadows only change when a caster moves: crates, latches, lid, or the regulator (which rides
      // with the camera once lifted). The fragments under the skylight turn a few milliradians a
      // second, well under a shadow texel per redraw at one frame in eight.
      const moved = Math.abs(anim.cleared - was[0]) + Math.abs(anim.latch[0] - was[1]) + Math.abs(anim.latch[1] - was[2]) + Math.abs(anim.lid - was[3]) + Math.abs(anim.lift - was[4]) > 1e-5;
      this.shadowsDirty = moved || anim.lift > 1e-3 || ++shadowTick % 8 === 0;
      for (const c of crateList) {
        const q = ease(T.MathUtils.clamp((anim.cleared - c.delay) / (1 - c.delay), 0, 1));
        c.mesh.position.lerpVectors(c.from, c.to, q); c.mesh.position.y += Math.sin(Math.PI * q) * .25;
        c.mesh.rotation.set(T.MathUtils.lerp(c.fromR.x, c.toR.x, q), T.MathUtils.lerp(c.fromR.y, c.toR.y, q), T.MathUtils.lerp(c.fromR.z, c.toR.z, q));
      }
      latches.forEach((l, i) => { l.rotation.z = anim.latch[i] * 1.9; });
      lid.rotation.z = ease(anim.lid) * 1.95;
      caseGlow.intensity = ease(anim.lid) * 1.8 * (1 - anim.lift);
      caseLed.color.set(s.lid ? '#7dffa6' : Math.sin(t * 3) > 0 ? '#ffb35c' : '#3a2410');
      // Regulator: in the foam, or held up in front of Hiro, turning slightly in his hands.
      const q = ease(anim.lift);
      camera.updateMatrixWorld();
      hold.set(-.16, -.1, -1.5).applyMatrix4(camera.matrixWorld);
      holdQ.copy(camera.quaternion).multiply(tilt).multiply(tmpQ.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.sin(t * .6) * .12));
      limiter.position.lerpVectors(restPos, hold, q); limiter.position.y += Math.sin(Math.PI * q) * .25;
      limiter.quaternion.slerpQuaternions(restQuat, holdQ, q);
      limiter.scale.setScalar(T.MathUtils.lerp(1.08, 1, q));
      limiter.cables.visible = q > .35;
      limiter.setGauge(T.MathUtils.lerp(.08, .55 + Math.sin(t * 2.1) * .03 + Math.sin(t * 7.3) * .01, Math.max(s.charge, q)));
      limiter.led.color.set(q > .5 ? '#7dffa6' : s.lid ? '#ffb35c' : '#2a3a33');
      // Practicals: one bar at the back flickers; the corner light breathes; fragments drift.
      const f = Math.sin(t * 23) * Math.sin(t * 7.1) > .55 || Math.sin(t * 1.3) > .96 ? .15 : 1;
      (flickerBar.material as T.MeshBasicMaterial).color.set('#ffd59a').multiplyScalar(2.2 * f);
      corner.intensity = (3.6 + Math.sin(t * 1.7) * .4) * f + caseGlow.intensity * .2;
      fragments.forEach((m, i) => { m.rotation.x += dt * .05 * (i % 2 ? 1 : -1); m.rotation.y += dt * .04; m.position.y += Math.sin(t * .5 + i) * dt * .02; });
      // Interaction anchors, for the screen pins.
      latches[0].getWorldPosition(this.anchors.latch0); latches[1].getWorldPosition(this.anchors.latch1);
      this.anchors.lid.copy(BOX_POS).add(new T.Vector3(.1, H + .25, 0));
      this.anchors.regulator.copy(restPos).setY(H + .2);
    },
    dispose() { limiter.dispose(); k.dispose(); },
  };
}

function wornPaintTex(k: BayKit, base: string, seed: number) {
  return k.tex(paint(512, 128, (x, w, h) => { const q = seeded(seed); x.fillStyle = base; x.fillRect(0, 0, w, h); grain(x, w, h, q, 5000, .14); scratches(x, w, h, q, 40); grime(x, w, h, q, 6); edgeWear(x, w, h, q, '#a9aaa4', 10, .8); }));
}

export type ServiceBay = ReturnType<typeof createServiceBay>;

// The bay takes most of a second to build, so the walk starts it while its fade-out plays.
let prepared: ServiceBay | null = null;
export function prepareServiceBay() { prepared ??= createServiceBay(); }
export function takeServiceBay() { const bay = prepared ?? createServiceBay(); prepared = null; return bay; }
