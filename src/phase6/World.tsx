import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as T from 'three';
import { reducedMotion } from '../config/experience';
import { createBaymax, BAYMAX_SCALE as BS, type Baymax } from './baymax';
import { createHiro } from './hiro';
import { createFirstPersonHands, createLimiterController, type FirstPersonHands } from '../characters/RegulatorController';
import { FirstPerson } from './fp';
import { createRelay, BAYMAX_YARD, BAYMAX_REACH_Z } from './relay';
import { RECORDER } from './relay';
import { createStreet, createCartridge, ringLive, rampY, ROUTE, ROUTE_LENGTH, FRAME, DECK, LANDING, PEDESTAL, LADDER_X, WALK_Y, type Street } from './street';
import { createHome, directHome, HOME_GATE, HOME_BAYMAX, CARE_CHIP_AT, FETCH_PICK, FETCH_END, type Home } from './home';
import { useP6, go, now, setOf, isInsert, atLeast, type Stage, type SetName } from './store';
import type { PhaseSixAudio } from './audio';
import { SceneQuality } from '../presentation/SceneQuality';
import { haulProgress, haulEffort } from './haulMotion';

/**
 * The 3D side of Phase 6: one Canvas, three sets (relay, street + gate site, home). Everything up to
 * the crossing is seen through Hiro's eyes: a first-person rig walks, runs, climbs and kneels where
 * each moment needs him, his hands hold his own regulator remote, and the switch moments are his
 * thumb on it. Every frame reads the stage and how long it has run, poses Baymax and moves Hiro.
 * Home, after the crossing, goes back to a camera that can see the two of them.
 */

export type Hints = { grab: RefObject<HTMLDivElement | null>; drop: RefObject<HTMLDivElement | null> };
/** Effects the World drives directly on the page: the crossing warp and the near-miss flash. */
export type Fx = { warp: RefObject<SVGFEDisplacementMapElement | null>; world: RefObject<HTMLDivElement | null>; hurt: RefObject<HTMLDivElement | null>; crossingCover: RefObject<HTMLDivElement | null> };
/** Live numbers shared with the page: the run's input, and what the readouts show. */
export type RunState = {
  p: number; speed: number; forward: boolean; pointer: T.Vector2; impulse: number;
  /** Metres between Baymax and Hiro, how close that feels (0…1), and both on the plan (x, z). */
  gap: number; dread: number; hiro: [number, number]; bay: [number, number];
  /** Times a swing came close or debris came down, for the readout. */
  misses: number;
};

const ease = (x: number) => T.MathUtils.smoothstep(x, 0, 1);
const span = (e: number, a: number, b: number) => ease((e - a) / (b - a));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const backOut = (x: number) => { x = clamp01(x); const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const RED = new T.Color('#ff2414'), DARK = new T.Color('#0b0f11'), CARE = new T.Color('#f4f8ff');
const v3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
/** Hovering at the deck: root height that puts his eyes level with Hiro's on it. */
const HOVER_Y = 1.45;
/** The wake's last step brings him this far in from where he lands, and the limited walk carries on from there. */
const WAKE_STEP = .5;
/** He hovers this far back from where he falls; the lurch and the slide carry him onto LANDING. */
const HOVER_BACK = 1.2;
const CHASE_SKY = new T.Color('#05090e'), CITY_SKY = new T.Color('#0a1622');

/** Where Hiro stands for each piece of the gate site. */
const GATE_SPOT = v3(-.6, 0, -83.8);
const DECK_SPOT = v3(DECK.x + .7, DECK.y, DECK.z + .45);
const READER_SPOT = v3(PEDESTAL.x - .1, 0, PEDESTAL.z + 1.02);
// Same eye position as telemetry's final rail, outside the roof and east of the receiver.
const RELAY_SPOT = v3(5, 0, -8.8);
/** The wake's dive: high behind the relay, down west of the receiver tower, then low under the dish into the yard. */
const WAKE_PATH = new T.CubicBezierCurve3(v3(BAYMAX_YARD.x - 9, 17, BAYMAX_YARD.z - 26), v3(BAYMAX_YARD.x - 8.1, 12, BAYMAX_YARD.z - 6.5), v3(BAYMAX_YARD.x - 5.1, 1.6, BAYMAX_YARD.z - .1), BAYMAX_YARD.clone());
/** Lying on his back (yaw π) his feet are 1.81 m toward the gate from his root, his head 2.76 m back (at full shell size). */
const FEET = 1.81 * BS, LIE_CENTRE = .47 * BS, LIE_LENGTH = 4.57 * BS;
/** Hauling: how far ahead of his feet Hiro walks, and the root position at which Hiro's eye crosses the surface. */
const LEAD = .95 * BS, CROSS_ROOT_Z = FRAME.z + FEET + LEAD;
/** Home: seconds of first person after the crossing (Baymax comes through, the gate closes) before the wide shot. */
export const EMERGE = 5.2;
/** Carry: up on Baymax, Hiro looks back at the gate beating with the chip, then the chip can come out. */
export const CLUE_AT = 4.3, CLUE_END = 6;
const HOME_CROSS_ROOT_Z = CROSS_ROOT_Z - FRAME.z + HOME_GATE.z;
/** The home gate sits a little off the ground; things come out at walkway height and settle. */
const homeFloor = (z: number) => z > HOME_GATE.z ? WALK_Y : Math.max(0, WALK_Y - (HOME_GATE.z - z) * .7);

/** A point along a polyline by arc length, 0…1. */
function along(points: T.Vector3[], k: number, out = new T.Vector3()) {
  const lens = points.slice(1).map((p, i) => p.distanceTo(points[i])), total = lens.reduce((a, b) => a + b, 0);
  let d = clamp01(k) * total;
  for (let i = 0; i < lens.length; i++) { if (d <= lens[i] || i === lens.length - 1) return out.copy(points[i]).lerp(points[i + 1], lens[i] ? Math.min(1, d / lens[i]) : 1); d -= lens[i]; }
  return out.copy(points[points.length - 1]);
}
/** Haul rhythm: braced short pulls, k 0…1 over `tugs` pulls. */
const tugged = haulProgress;

/**
 * The haul: both of Hiro's hands on Baymax's ankles, his right on Baymax's left boot and his left on
 * the right one, each hooked over the collar between the sole and the boot with the fingers curled
 * down into the ankle's crease. Where the collar's top is is found once on the boot itself and kept in
 * the boot's frame, so the hand rides with the leg as he slides. Every frame (after the camera's last
 * move) each hand is set on that spot, knuckles up and the back of the hand toward Hiro's eye, its
 * forearm running back to his shoulder; the remote stays in his pocket. `k` 0..1 blends in from
 * wherever the hands were.
 */
type HandRig = { root: T.Group; palm: T.Group; fingers: T.Group[][]; thumb: T.Group[] };
function createAnkleGrip(hands: FirstPersonHands) {
  const d = (hands as unknown as { debug: { left: HandRig; right: HandRig; leftMount: T.Group; rightMount: T.Group } }).debug;
  const grips = ([[d.right, d.rightMount, 'L', 'R', 1], [d.left, d.leftMount, 'R', 'L', -1]] as const).map(([hand, mount, leg, other, out]) => {
    const [sleeve, cuff] = hand.root.children;
    return { hand, mount, leg, other, out, sleeve, cuff, rest: { len: sleeve.scale.y, z: sleeve.position.z, palm: hand.palm.quaternion.clone(), girth: sleeve.scale.x, cuff: cuff.scale.x }, at: new T.Vector3(), found: false };
  });
  const ankle = new T.Vector3(), knee = new T.Vector3(), other = new T.Vector3(), up = new T.Vector3(), shin = new T.Vector3(), inward = new T.Vector3(),
    p = new T.Vector3(), shoulder = new T.Vector3(), fwd = new T.Vector3(), side = new T.Vector3(), wrist = new T.Vector3(), F = new T.Vector3(),
    X = new T.Vector3(), Y = new T.Vector3(), Z = new T.Vector3(), M = new T.Matrix4(), P = new T.Matrix4(), rel = new T.Matrix4(), inv = new T.Matrix4(),
    pos = new T.Vector3(), q = new T.Quaternion(), qr = new T.Quaternion(), scl = new T.Vector3(), ray = new T.Raycaster(), DOWN = new T.Vector3(0, -1, 0), WORLD_UP = new T.Vector3(0, 1, 0);
  // The hand pitched a little knuckles-up off the collar, so its back faces up and toward Hiro.
  const PITCH = .22, HOOK = [1.02, 1.06, 1.1, 1.14];
  let on = false;
  return (baymax: Baymax, camera: T.Camera, k: number, feet: T.Vector3, eye: number) => {
    if (k <= 0) {
      if (on) { on = false; hands.controller.root.visible = true; for (const g of grips) { g.sleeve.scale.set(g.rest.girth, g.rest.len, g.rest.girth); g.sleeve.position.z = g.rest.z; g.cuff.scale.set(g.rest.cuff, g.cuff.scale.y, g.rest.cuff); g.hand.palm.quaternion.copy(g.rest.palm); g.found = false; } }
      return;
    }
    on = true; hands.controller.root.visible = false;
    camera.updateMatrixWorld(true); baymax.root.updateMatrixWorld(true);
    up.copy(WORLD_UP).applyQuaternion(baymax.root.getWorldQuaternion(q));
    fwd.subVectors(baymax.root.position, feet).setY(0).normalize(); side.crossVectors(fwd, WORLD_UP);
    inv.copy(hands.root.matrixWorld).invert();
    for (const g of grips) {
      const boot = baymax.boot(g.leg);
      baymax.ankleWorld(g.leg, ankle); baymax.kneeWorld(g.leg, knee);
      shin.subVectors(ankle, knee).normalize();
      if (!g.found) {
        // Find the spot once: a ray down onto the top of the collar, a little in from its middle.
        baymax.ankleWorld(g.other, other);
        inward.subVectors(other, ankle); inward.addScaledVector(shin, -inward.dot(shin)).addScaledVector(up, -inward.dot(up)).normalize();
        p.copy(ankle).addScaledVector(shin, .02).addScaledVector(inward, .09);
        ray.set(p.clone().addScaledVector(WORLD_UP, 1), DOWN);
        const hit = ray.intersectObjects(boot.meshes, false)[0];
        if (hit) p.copy(hit.point); else p.addScaledVector(up, .23);
        boot.bone.updateWorldMatrix(true, false); g.at.copy(p).applyMatrix4(P.copy(boot.bone.matrixWorld).invert()); g.found = true;
      }
      p.copy(g.at).applyMatrix4(boot.bone.matrixWorld);
      // Shoulders low and wide of the eye, as a first-person arm is carried, so the forearm comes up
      // from the bottom corner and never hides the hand.
      shoulder.copy(feet).addScaledVector(WORLD_UP, eye - .52).addScaledVector(side, g.out * .26).addScaledVector(fwd, -.02);
      // The hand: fingers on along his shin away from Hiro, knuckles just above the crease's edge.
      F.copy(shin).multiplyScalar(-Math.cos(PITCH)).addScaledVector(up, Math.sin(PITCH));
      Y.copy(up).multiplyScalar(Math.cos(PITCH)).addScaledVector(shin, Math.sin(PITCH));
      Z.copy(F).negate(); X.crossVectors(Y, Z); P.makeBasis(X, Y, Z);
      wrist.copy(p).addScaledVector(up, .036).addScaledVector(F, -.075);
      // The wrist into a forearm that runs straight back to the shoulder.
      Z.subVectors(shoulder, wrist).normalize(); X.crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X);
      M.makeBasis(X, Y, Z).setPosition(wrist);
      g.hand.palm.quaternion.slerpQuaternions(g.rest.palm, qr.setFromRotationMatrix(M).invert().multiply(q.setFromRotationMatrix(P)), k);
      // The hand hangs in its mount through a fixed offset (the left one through the remote's grip): solve the mount.
      rel.identity(); for (let o: T.Object3D = g.hand.root; o !== g.mount; o = o.parent!) { o.updateMatrix(); rel.premultiply(o.matrix); }
      M.multiply(rel.invert()).premultiply(inv).decompose(pos, q, scl);
      g.mount.position.lerp(pos, k); g.mount.quaternion.slerp(q, k); g.mount.visible = true;
      // Fingers curled down over the edge into the crease, the thumb tucked down along its side.
      g.hand.fingers.forEach((f, i) => { const c = HOOK[i]; f[0].rotation.x = T.MathUtils.lerp(f[0].rotation.x, -c * .95, k); f[1].rotation.x = T.MathUtils.lerp(f[1].rotation.x, -c * 1.05, k); f[2].rotation.x = T.MathUtils.lerp(f[2].rotation.x, -c * .7, k); });
      const [t0, t1, t2] = g.hand.thumb;
      t0.rotation.x = T.MathUtils.lerp(t0.rotation.x, -.75, k); t0.rotation.y = T.MathUtils.lerp(t0.rotation.y, 0, k); t1.rotation.x = T.MathUtils.lerp(t1.rotation.x, -.45, k); t2.rotation.x = T.MathUtils.lerp(t2.rotation.x, -.35, k);
      // The sleeve reaches back to his shoulder (out of frame under the camera), snug at the wrist.
      const len = T.MathUtils.lerp(g.rest.len, (wrist.distanceTo(shoulder) - .04) / .32, k), girth = T.MathUtils.lerp(g.rest.girth, .8, k);
      g.sleeve.scale.set(girth, len, girth); g.sleeve.position.z = .04 + .16 * len;
      g.cuff.scale.set(girth * 1.05, g.cuff.scale.y, girth * 1.05);
    }
  };
}

export function World({ audio, hints, fx, run, onReady, onError }: { audio: PhaseSixAudio; hints: Hints; fx: Fx; run: RefObject<RunState>; onReady: () => void; onError: () => void }) {
  const { scene, camera, gl, size } = useThree();
  const cam = camera as T.PerspectiveCamera;
  const stage = useP6(s => s.stage);
  const set: SetName = setOf(stage);
  const [baymax, setBaymax] = useState<Baymax | null>(null);
  const [compiled, setCompiled] = useState(false);
  const hiro = useMemo(createHiro, []);
  const hands = useMemo(() => createFirstPersonHands(createLimiterController()), []);
  const fp = useMemo(() => new FirstPerson(), []);
  const haul = useMemo(() => createAnkleGrip(hands), [hands]);
  const cart = useMemo(createCartridge, []);
  useEffect(() => { if (import.meta.env.DEV) (window as Window & { __lastGateWorld?: unknown }).__lastGateWorld = { baymax, hiro, hands, fp, camera, T, gl, scene }; }, [baymax, hiro, hands, fp, camera, gl, scene]);
  const home = useMemo<Home>(createHome, []);
  const env = useRef<{ name: SetName; relay?: ReturnType<typeof createRelay>; street?: Street } | null>(null);
  const homeScene = useMemo(() => { const s = new T.Scene(); s.background = home.background; s.fog = home.fog; return s; }, [home]);
  const target = useMemo(() => new T.WebGLRenderTarget(4, 4, { colorSpace: T.SRGBColorSpace }), []);
  const homeCam = useMemo(() => new T.PerspectiveCamera(), []);
  // His eyes light what he looks at: a red spot from the head, and a soft glow on the head itself.
  const eyeLight = useMemo(() => { const l = new T.SpotLight('#ff2a18', 0, 34, .42, .55, 1.4); l.target.position.set(0, 0, 1); return l; }, []);
  const eyeGlow = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,60,40,1)'); g.addColorStop(.35, 'rgba(255,30,20,.35)'); g.addColorStop(1, 'rgba(255,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), color: '#ff3a24', transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    s.scale.setScalar(1.6 * BS); s.renderOrder = 6; return s;
  }, []);
  // The reader's lock, made visible: a thin red trace from the gate's hub to whatever it has locked onto
  // (his combat chip). It reaches out when the gate powers, and beats with the chip while his bay is open.
  const lockBeam = useMemo(() => {
    const geo = new T.CylinderGeometry(.018, .018, 1, 6, 1, true); geo.translate(0, .5, 0); geo.rotateX(Math.PI / 2);
    const mat = new T.MeshBasicMaterial({ color: '#ff3a2c', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    const b = new T.Mesh(geo, mat); b.frustumCulled = false; b.visible = false; b.renderOrder = 4; return b;
  }, []);
  // Coming through the far side: only the part of him already through is drawn.
  const crossing = useMemo(() => new T.Plane(new T.Vector3(0, 0, -1), 1e4), []);

  // Tracker R-05: before the cover lifts, start compiling the prebuilt street's programs (with everything
  // in it shown, his suit fully on, the street's lights counted). compileAsync links them in the background
  // while the relay plays, so nothing is built or linked as the chase starts.
  const warmStreet = async (him: T.Object3D) => {
    const st = preStreet.current, relayRoot = env.current?.relay?.root;
    if (!st || !relayRoot) return;
    relayRoot.visible = false; scene.add(st.root); homeScene.add(home.root);
    // Everything hidden for now (debris, dust, sparks) is counted for the compile too.
    const hidden: T.Object3D[] = [];
    for (const sc of [st.root, homeScene, ...scene.children.filter(c => c !== relayRoot && c !== st.root)]) sc.traverse(o => { if (!o.visible) { o.visible = true; hidden.push(o); } });
    const prev = gl.getRenderTarget(), scissor = gl.getScissorTest(), oldScissor = gl.getScissor(new T.Vector4());
    const others: T.Object3D[] = [], culled: T.Object3D[] = [];
    try {
      gl.setRenderTarget(null); await gl.compileAsync(scene, camera);
      gl.setRenderTarget(target); await gl.compileAsync(homeScene, homeCam);
      gl.render(homeScene, homeCam);
      // His materials clip at the gate, which compileAsync can't key: draw him alone, one pixel, for real.
      scene.traverse(o => { if ((o as T.Mesh).isMesh && o.visible) { let mine = false; for (let x: T.Object3D | null = o; x; x = x.parent) if (x === him) { mine = true; break; } if (!mine) { o.visible = false; others.push(o); } else if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } } });
      gl.setRenderTarget(null); gl.setScissorTest(true); gl.setScissor(0, 0, 1, 1); gl.render(scene, camera); gl.setScissorTest(scissor);
    } finally {
      others.forEach(o => { o.visible = true; }); culled.forEach(o => { o.frustumCulled = true; });
      gl.setScissor(oldScissor); gl.setScissorTest(scissor);
      gl.setRenderTarget(prev); hidden.forEach(o => { o.visible = false; });
      st.root.removeFromParent(); home.root.removeFromParent(); relayRoot.visible = true;
    }
  };

  // Shared actors, made once for the phase. The camera joins the scene so the hands can ride on it.
  useEffect(() => {
    let alive = true, made: Baymax | null = null;
    createBaymax().then(async b => {
      if (!alive) { b.dispose(); return; }
      made = b; mem.current.headH = b.headHeight;
      b.root.traverse(o => { if (o instanceof T.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = [crossing]; }); });
      scene.add(b.root); await warmStreet(b.root);
      if (!alive) return;
      if (useP6.getState().stage === 'wake') useP6.setState({ since: now() });
      setBaymax(b); setCompiled(true);
    }).catch(() => { if (alive) onError(); });
    gl.localClippingEnabled = true;
    scene.add(camera, hiro.root, eyeLight, eyeLight.target, eyeGlow, lockBeam);
    camera.add(hands.root, cart.root);
    return () => {
      alive = false; if (made) made.dispose();
      hiro.dispose(); hands.dispose(); cart.dispose(); home.dispose(); target.dispose();
      scene.remove(camera, eyeLight, eyeLight.target, eyeGlow, lockBeam); eyeGlow.material.map?.dispose(); eyeGlow.material.dispose(); lockBeam.geometry.dispose(); (lockBeam.material as T.Material).dispose();
    };
  }, [scene, camera, gl, hiro, hands, cart, home, target, eyeLight, eyeGlow, lockBeam, crossing, onError]);

  // Sets: build the one in use, drop the last one. The home group lives in its own scene (seen
  // through the gate) until the crossing, then joins the main scene.
  // Tracker R-05: the street is built and its programs compiled while the relay loads (its lights
  // change the light count, which would otherwise recompile every material as the chase starts).
  const preStreet = useRef<Street | null>(null);
  useEffect(() => () => { preStreet.current?.dispose(); preStreet.current = null; }, []);
  useEffect(() => {
    const e: NonNullable<typeof env.current> = { name: set };
    if (set === 'relay') {
      e.relay = createRelay(); scene.add(e.relay.root); scene.background = new T.Color('#081320'); scene.fog = new T.Fog('#14293b', 14, 150);
      if (!preStreet.current) preStreet.current = createStreet();
    }
    if (set === 'street') { e.street = preStreet.current ?? createStreet(); preStreet.current = null; scene.add(e.street.root); homeScene.add(home.root); scene.background = new T.Color('#0a1622'); scene.fog = new T.Fog('#1a3146', 18, 190); }
    if (set === 'home') { scene.add(home.root); scene.background = home.background; scene.fog = home.fog; }
    env.current = e;
    return () => { e.relay?.dispose(); e.street?.dispose(); home.root.removeFromParent(); env.current = null; };
  }, [set, scene, home, homeScene]);

  // Lights the sets share: a cool key and fill for the city; the home set brings its own.
  const lights = useMemo(() => {
    const g = new T.Group();
    g.add(new T.HemisphereLight('#9ec6e4', '#0a1420', 1.3));
    const key = new T.DirectionalLight('#bcd9ec', 1.7); key.position.set(-8, 16, 6); g.add(key);
    return g;
  }, []);
  useEffect(() => { scene.add(lights); return () => { scene.remove(lights); }; }, [scene, lights]);
  useEffect(() => { lights.visible = set !== 'home'; }, [set, lights]);

  // Drags: the actual combat chip out of his chest and into the reader, then the healthcare chip into his chest.
  const drag = useRef({ active: false, pos: new T.Vector3(), plane: new T.Plane(), returning: 0, from: new T.Vector3(), seatAt: 0, seatFrom: new T.Vector3(), seatQ: new T.Quaternion() });
  useEffect(() => {
    const el = gl.domElement, ray = new T.Raycaster(), ndc = new T.Vector2(), hit = new T.Vector3();
    const screen = (p: T.Vector3) => { const q = p.clone().project(cam); return new T.Vector2((q.x + 1) / 2 * el.clientWidth, (1 - q.y) / 2 * el.clientHeight); };
    type What = 'take' | 'chip' | 'cart';
    const what = (): What | null => {
      const s = useP6.getState(), e = now() - s.since;
      if (s.stage === 'limited' && !s.took && e > 9.6) return 'take';
      if (s.stage === 'carry' && s.chip === 'bay' && e > CLUE_END) return 'chip';
      if (s.stage === 'carry' && s.chip === 'out' && s.cart === 'hand' && now() - s.pulledAt > 4.2) return 'cart';
      return null;
    };
    const source = (w: What) => w === 'take' ? cart.root.getWorldPosition(new T.Vector3()) : w === 'chip' ? baymax?.dockWorld() : baymax?.combatChip.getWorldPosition(new T.Vector3());
    const dest = (w: What) => w === 'cart' ? env.current?.street?.readerWorld() : null;
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return new T.Vector2(e.clientX - r.left, e.clientY - r.top); };
    let holding: What | null = null;
    const down = (e: PointerEvent) => {
      const w = what(); if (!w || e.button !== 0) return;
      const from = source(w); if (!from) return;
      if (screen(from).distanceTo(local(e)) > 80) return;
      // The capture: a click lifts it out of the recorder and into his pocket.
      if (w === 'take') { audio.unlock(); audio.snap(); useP6.setState({ took: true }); return; }
      audio.unlock(); holding = w;
      drag.current.active = true; drag.current.returning = 0; drag.current.pos.copy(from); drag.current.from.copy(from);
      // Carry on a plane facing the camera, through the midpoint of the piece and where it goes
      // (the chip comes up toward Hiro, so its plane sits just above the bay).
      const to = dest(w) ?? from.clone().lerp(camera.position, .35), mid = from.clone().lerp(to, .5), n = new T.Vector3(); cam.getWorldDirection(n);
      drag.current.plane.setFromNormalAndCoplanarPoint(n.negate(), mid);
      useP6.setState(w === 'chip' ? { chip: 'held' } : { cart: 'held' });
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag.current.active) { const w = what(), from = w && source(w); el.style.cursor = from && screen(from).distanceTo(local(e)) < 80 ? 'grab' : ''; return; }
      el.style.cursor = 'grabbing';
      const l = local(e); ndc.set(l.x / el.clientWidth * 2 - 1, -(l.y / el.clientHeight * 2 - 1)); ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(drag.current.plane, hit)) drag.current.pos.copy(hit);
    };
    const up = (e: PointerEvent) => {
      if (!drag.current.active || !holding) return;
      drag.current.active = false; el.style.cursor = '';
      const w = holding; holding = null;
      if (w === 'chip') {
        // Pulled clear of the dock: it's out, and dark.
        if (screen(drag.current.from).distanceTo(local(e)) > 110) { useP6.setState({ chip: 'out', pulledAt: now() }); audio.snap(); }
        else { drag.current.returning = 1; useP6.setState({ chip: 'bay' }); }
        return;
      }
      const to = dest(w);
      if (to && screen(to).distanceTo(local(e)) < 90) {
        drag.current.seatAt = now();
        baymax!.combatChip.getWorldPosition(drag.current.seatFrom); baymax!.combatChip.getWorldQuaternion(drag.current.seatQ);
        useP6.setState({ cart: 'slot' });
      } else { drag.current.returning = 1; useP6.setState({ cart: 'hand' }); }
    };
    const cancel = () => {
      if (!drag.current.active || !holding) return;
      const w = holding; holding = null;
      drag.current.active = false; drag.current.returning = 1; el.style.cursor = '';
      useP6.setState(w === 'chip' ? { chip: 'bay' } : { cart: 'hand' });
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, [gl, cam, camera, baymax, audio, cart]);

  // Tracker R-07: the healthcare chip goes in the way the combat chip did in Phase 1. Hold on the chip
  // to take it, hold on his chest to open the bay, then guide the chip into the socket (or hold E).
  const care = useRef({ target: null as 'chip' | 'chest' | null, at: 0, key: false, keyAt: 0, aim: null as T.Vector2 | null, guide: new T.Vector3(), open: 0, progress: 0 });
  useEffect(() => {
    const el = gl.domElement, c = care.current;
    const at = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return new T.Vector2(e.clientX - r.left, e.clientY - r.top); };
    const screen = (p: T.Vector3) => { const q = p.clone().project(cam); return new T.Vector2((q.x + 1) / 2 * el.clientWidth, (1 - q.y) / 2 * el.clientHeight); };
    const live = () => { const s = useP6.getState(); return s.stage === 'home' && now() - s.since > EMERGE + 2.4 ? s : null; };
    const down = (e: PointerEvent) => {
      const s = live(); if (!s || e.button !== 0 || !baymax) return; const p = at(e);
      if (s.care === 'ground' && screen(home.care.chip.getWorldPosition(new T.Vector3())).distanceTo(p) < 90) { audio.unlock(); c.target = 'chip'; c.at = now(); }
      else if (s.care === 'hand' && screen(baymax.dockWorld()).distanceTo(p) < 120) { audio.unlock(); c.target = 'chest'; c.at = now(); }
    };
    const up = () => { c.target = null; };
    const move = (e: PointerEvent) => { c.aim = at(e); };
    const kd = (e: KeyboardEvent) => { if (e.code === 'KeyE' && live() && !c.key) { audio.unlock(); c.key = true; c.keyAt = now(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'KeyE') c.key = false; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [gl, cam, baymax, home, audio]);

  // Memory that outlives a stage: where Baymax has got to on the street, step timing, shake, chase events.
  const mem = useRef({ trail: .28, stepAt: 0, shake: 0, landed: false, lastStage: '' as Stage | '', bayAt: new T.Vector3(), lift: 0, glance: 0, headH: 3.1, swingAt: -9, swung: false, wakeFx: 0, wakeSince: -1, readyIn: 0, falls: 0, warped: false, thirdShot: '', pressed: '' as Stage | '', idle: 0, escSince: -1, lat: 0,
    chase: { mode: 'stalk' as 'stalk' | 'burst' | 'lunge' | 'stutter', at: 0, dur: 1.2, from: 0, to: 0, side: 1, n: 0, scrape: false, done: false, landed: false } });
  const look = useMemo(() => new T.Vector3(), []);
  const feet = useMemo(() => new T.Vector3(), []);
  const camPos = useMemo(() => new T.Vector3(), []);
  const tmp = useMemo(() => new T.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!baymax || !env.current || env.current.name !== set) return;
    const dt = Math.min(delta, .05), t = clock.elapsedTime, m = mem.current, r = run.current!;
    // The scene counts as shown once its first frames have drawn (tracker T-03): the first one or two
    // can stall for seconds on a cold GPU, and the cover stays up over them.
    let s = useP6.getState();
    // The wake's fly-in runs on the frames it draws (tracker T-03): a stalled frame right after the
    // load (shaders, uploads) moves the clock on by one capped step, not by the whole stall.
    if (s.stage === 'wake' && delta > .05 && now() - s.since < 8) {
      const since = s.since + (delta - dt), same = m.wakeSince === s.since;
      useP6.setState({ since }); s = useP6.getState(); if (same) m.wakeSince = since;
    }
    const e = now() - s.since;
    const P = baymax.pose, H = hiro.pose;
    const enter = m.lastStage !== s.stage;
    // Each start of the run (and each retry after he catches Hiro) begins it from the top.
    if (s.stage === 'wake' && m.wakeSince !== s.since) { m.wakeSince = s.since; m.wakeFx = 0; }
    if (s.stage === 'escape' && m.escSince !== s.since) { m.escSince = s.since; r.p = 0; r.speed = 0; m.trail = -.05; m.falls = 0; m.swingAt = -9; r.misses = 0; m.idle = 0; m.lat = 0; Object.assign(m.chase, { mode: 'stalk', at: t, dur: 1.4, n: 0, side: 1, landed: false, done: false }); }
    if (enter) {
      hands.controller.setOn(s.regulator);
      if (s.stage === 'drop') m.landed = false;
      if (s.stage === 'gate') m.trail = Math.max(m.trail, .4);
      if (s.stage === 'bloom') m.warped = false;
      if (s.stage === 'wake') m.wakeFx = 0;
      // The switch moments: his thumb on his own remote, the scene still in front of him.
      if (isInsert(s.stage) && m.pressed !== s.stage) {
        m.pressed = s.stage;
        const mode = s.stage === 'switchOff' ? 'off' : s.stage === 'switchOn2' ? 'onFast' : 'on';
        const next: Stage = s.stage === 'switchOn1' ? 'limited' : s.stage === 'switchOff' ? 'flyin' : 'drop';
        hands.press(() => { audio.click(); useP6.setState({ regulator: mode !== 'off' }); }, () => { if (useP6.getState().stage === s.stage) go(next); }, mode === 'onFast' ? 1.6 : 1.1);
      }
      if (!isInsert(s.stage)) m.pressed = '';
    }
    // Defaults each frame; the stage below sets what it needs.
    Object.assign(P, { armour: 1, overhead: 0, limiterOn: s.regulator ? 1 : 0, getUp: 0, sit: 0, lie: 0, lean: .08, guard: 1, punch: 0, hold: 0, stride: 0, dangle: 0, thrust: 0, sputter: 0, open: 0, chipGlow: 0, chipInBay: s.chip === 'bay', careSeated: s.care === 'seated', eyeGlow: 1 });
    P.tension = set === 'home' ? 0 : s.regulator ? .4 : 1;
    P.sluggish = s.regulator && set !== 'home' ? 1 : 0;
    P.eyes.copy(RED); P.head[0] = P.head[1] = P.head[2] = 0;
    baymax.root.rotation.x = 0; crossing.constant = 1e4;
    Object.assign(H, { walk: 0, stride: 0, lean: 0, haul: 0, kneel: 0, reach: 0, look: 0 });
    hiro.root.visible = false; lockBeam.visible = false;
    let first = true, eye = 1.56, fov = 62, raise = .3, reach = 0, freeLook = .12, lookRate = 5, place = false;
    let jet = 0, hum = 0, dread = 0, near = 0, warp = 0, crossingFade = 0, grip = 0;
    const head = () => baymax.headWorld(tmp).clone();

    if (set === 'relay') {
      env.current.relay!.update(t, dt);
      baymax.root.position.copy(BAYMAX_YARD); P.yaw = 0;
      feet.copy(RELAY_SPOT); look.copy(head());
      fov = 66;
      if (s.stage === 'wake') {
        // Tracker R-03/S-05: he comes in hunting (the clock restarts as the cover lifts, so this is seen).
        // A red glow over the dish, then he drops out of the sky, jets roaring and eyes burning, and
        // slams down in the yard: a deep crouch with a fist to the ground, a held beat, then he
        // rises heavily, eyes flaring, and takes a step at Hiro. Hiro backs off. The camera keeps
        // his whole body in frame from the landing on, feet included.
        const fly = span(e, 1, 3.3), land = e >= 3.3;
        // The receiver's dish hangs over the yard (y 5.7–9.8, just west of the landing), so a straight
        // dive put him through it and the tower's front leg. He drops steeply west of the tower
        // instead, then swoops in low under the dish to land: one cubic, altitude included.
        const arc = ease(fly);
        if (!land) {
          WAKE_PATH.getPoint(arc, baymax.root.position);
          const heading = WAKE_PATH.getTangent(Math.min(arc, .999), tmp);
          const towardHiro = Math.atan2(feet.x - baymax.root.position.x, feet.z - baymax.root.position.z);
          P.yaw = T.MathUtils.lerp(Math.atan2(heading.x, heading.z), towardHiro, span(arc, .62, 1));
          // Thrust flares as he pulls out of the dive, so he decelerates into the landing.
          P.thrust = .85 + .15 * span(e, 2.5, 3.2); jet = .9; P.dangle = .7 * (1 - span(e, 2.9, 3.28)); P.lean = .6 - span(e, 2.5, 3.25) * .55; P.guard = .3;
          if (e > 2.3 && m.wakeFx < 1) { m.wakeFx = 1; audio.whoosh(); }
        } else {
          // The landing: a hard crouch, fist down; the hold; the rise; the stance locks; one step in.
          const hold = span(e, 3.3, 3.45), rise = span(e, 4.05, 5.5), step = span(e, 5.7, 6.5);
          if (e - dt < 3.3) baymax.impact(1.2);
          P.sit = .72 * hold * (1 - rise); P.lean = (.42 * (1 - rise) + .08) * hold + .06 * step;
          P.punch = -.45 * hold * (1 - span(e, 3.9, 4.5));
          P.guard = Math.max(.2 * (1 - span(e, 3.4, 3.8)), backOut((e - 5.1) / .6));
          // The step: one heavy stride at Hiro, stopping well short.
          if (e > 5.7 && e < 6.5) { P.stride = .9; P.gait = step * Math.PI; }
          baymax.root.position.z = BAYMAX_YARD.z + ease(step) * WAKE_STEP;
          if (m.wakeFx < 2) { m.wakeFx = 2; m.shake = Math.max(m.shake, reducedMotion ? 0 : .8); audio.impact(); }
          if (m.wakeFx < 3 && e > 6.35) { m.wakeFx = 3; m.shake = Math.max(m.shake, reducedMotion ? 0 : .3); audio.step(.9); }
        }
        // Eyes: burning on the way down, dim in the crouch, then flaring as he looks up at Hiro.
        const flare = Math.sin(Math.PI * span(e, 4.4, 5.3));
        P.eyes.copy(RED); P.eyeGlow = land ? .55 + .45 * span(e, 4.2, 4.7) + flare * .5 : .6 + .4 * fly;
        // Head: down in the crouch, coming up last, onto Hiro.
        P.head[0] = land ? .38 * (1 - span(e, 4.3, 5.2)) : (1 - P.guard) * .2; P.head[1] = span(e, 4.6, 5.4) * .1;
        const retreat = span(e, 5.2, 7);
        feet.x += retreat * .8; feet.z += retreat * .2;
        // Eyes up to the sky and the glow, then down with him to the yard; framed on his middle so his legs and feet stay in shot.
        look.copy(head()).lerp(v3(baymax.root.position.x, 1.15, baymax.root.position.z), span(e, 3.2, 3.9) * (1 - span(e, 4.6, 5.6) * .45)); lookRate = 4.5;
        if (e > 5.12 && e < 5.2) { m.shake = Math.max(m.shake, .35); audio.servo(); }
        dread = .3 + span(e, 1, 3.4) * .35 + span(e, 5.6, 6.5) * .15;
      } else if (s.stage === 'limited') {
        feet.x += .8; feet.z += .2;
        // Keep his boots in frame while he strains against the limiter.
        look.copy(head()).lerp(v3(baymax.root.position.x, 1.45, baymax.root.position.z), .55);
        // Back through the actual opening as his limited punch comes in, then turn to the
        // recorder. Stay outside the roof during the hover and never walk through the rear wall.
        if (e > 6.4) along([v3(5.8, 0, -8.6), v3(3.6, 0, -8.4), v3(2.9, 0, -6.2), v3(2.55, 0, -3.1)], span(e, 6.4, 9.6), feet);
        // Each full move falls short. Thrusters starve, the walk is heavy, the punch stops early.
        const fly = span(e, .8, 2.2) * (1 - span(e, 2.6, 3.2));
        P.thrust = e > .8 && e < 3.2 ? .75 : 0; P.sputter = 1; jet = P.thrust * .7;
        P.dangle = fly; baymax.root.position.y = fly * 1 + Math.sin(t * 9) * .05 * fly;
        if (e > 3.2 && e < 3.26) { m.shake = .35; audio.step(1); }
        // A few heavy steps toward the relay, stopping in the yard, short of the back wall.
        const walk = clamp01((e - 3.6) / 3.4);
        baymax.root.position.z = BAYMAX_YARD.z + WAKE_STEP + ease(walk) * (BAYMAX_REACH_Z - BAYMAX_YARD.z - WAKE_STEP);
        if (e > 3.6 && e < 7) { P.stride = .9; P.lean = .16; const ph = (e - 3.6) / .85 * Math.PI; P.gait = ph; if (Math.floor(ph / Math.PI) !== Math.floor(m.stepAt)) { audio.step(.85); m.shake = Math.max(m.shake, .16); } m.stepAt = ph / Math.PI; }
        // Wind up, a slow drive, stop short with the arm shaking, then pull back.
        P.punch = e < 7 ? 0 : e < 7.6 ? -.3 * span(e, 7, 7.6) : e < 8.7 ? -.3 + 1.05 * Math.sin(Math.PI / 2 * clamp01((e - 7.6) / 1.1)) : .75 * (1 - span(e, 8.9, 9.7));
        if (e > 8.4 && e < 8.9) P.punch += Math.sin(t * 60) * .02;
        if (e > 7.6 && e < 7.66) audio.servo();
        P.lean = e > 7.4 && e < 9.2 ? .2 : P.lean;
        dread = .45 + span(e, 3.6, 8.4) * .3; near = .3;
        // Before he goes: the capture, still in the recorder beside him.
        if (e > 9.6 && !s.took) { look.set(RECORDER.x, 1.05, RECORDER.z); lookRate = 3; reach = .45; }
      } else { feet.x += .8; feet.z += .2; baymax.root.position.z = BAYMAX_YARD.z + WAKE_STEP; P.guard = 1; dread = .4; }
      P.head[1] += .12;
        if (s.stage !== 'wake' || e >= 3.3)
          P.yaw = Math.atan2(feet.x - baymax.root.position.x, feet.z - baymax.root.position.z);
        raise = s.stage === 'wake' ? .2 + span(e, 3.4, 5) * .2 : .4;
    }

    if (set === 'street') {
      const st = env.current.street!;
      const powered = atLeast(s.stage, 'powered') ? 1 : 0;
      const live = ringLive(s.angles);
      let open = 0, flash = 0;
      const socket = s.cart === 'slot' && (s.stage === 'bloom' || now() - drag.current.seatAt >= .7) ? 1 : 0;
      hum = powered ? 1 : live.reduce((a, b) => a + b, 0) * .15;

      // Baymax down the street: coming on, slowly, the whole time the frame is being worked.
      const onTrail = (p: number) => { const q = ROUTE.getPointAt(clamp01(p)); const ahead = ROUTE.getPointAt(clamp01(p + .01)); baymax.root.position.set(q.x, 0, q.z); P.yaw = Math.atan2(ahead.x - q.x, ahead.z - q.z); };
      const trudge = (speed: number) => {
        P.stride = .85; P.gait += dt * speed * 3.6; const step = Math.floor(P.gait / Math.PI);
        if (step !== m.stepAt) { m.stepAt = step; const d = baymax.root.position.distanceTo(camera.position); audio.step(Math.min(1, 9 / d)); if (d < 16) m.shake = Math.max(m.shake, .28 * (1 - d / 16) + .05); }
      };

      if (s.stage === 'escape') {
        if (s.caught) { r.forward = false; r.impulse = 0; r.speed = 0; }
        const goal = r.forward ? 4.2 : 0;
        r.speed = T.MathUtils.damp(r.speed, goal + r.impulse * 3.5, 3, dt); r.impulse = Math.max(0, r.impulse - dt * 2.2);
        r.p = clamp01(r.p + r.speed * dt / ROUTE_LENGTH);
        // The pursuit runs in beats rather than one flat follow: a heavy stalk, a short thruster
        // burst that eats the gap (sometimes clipping a building on the way), a lunge that only just
        // misses, and the regulator catching him: jets cough, he sags and loses a second. He gains
        // when Hiro stops; he never quite reaches him while Hiro keeps running.
        const L = ROUTE_LENGTH, ch = m.chase, MIN_GAP = 3.6;
        let gap = (r.p - m.trail) * L;
        const ce = t - ch.at;
        const begin = (mode: typeof ch.mode, dur: number) => { ch.mode = mode; ch.at = t; ch.dur = dur; ch.from = m.trail; ch.done = false; };
        if (!s.caught && ce > ch.dur) {
          if (ch.mode === 'burst' || ch.mode === 'lunge') { ch.n++; if (ch.n % 2 === 0) { begin('stutter', 1); baymax.jolt(.8); audio.falter(); m.shake = Math.max(m.shake, .15); } else begin('stalk', .7); }
          else if (gap < 5 && t - m.swingAt > 2.2) { begin('lunge', 1.1); baymax.lunge(1); m.swingAt = t; m.swung = false; audio.servo(); }
          else if (gap > 8 || (gap > 5.5 && ch.mode === 'stalk' && ch.n % 3 !== 2)) {
            begin('burst', T.MathUtils.clamp(.9 + gap * .04, 1, 1.5)); ch.side = -ch.side; ch.scrape = ch.n % 3 === 1;
            ch.to = Math.min(r.p - (MIN_GAP + .6) / L, m.trail + Math.max(3, gap - MIN_GAP - 1.2 + r.speed * .5) / L);
            audio.ignite();
          } else begin('stalk', .8 + (ch.n % 3) * .3);
          if (ch.mode === 'stalk') ch.n++;
        }
        const k = clamp01((t - ch.at) / ch.dur);
        let lift = 0, lat = 0;
        if (ch.mode === 'stalk' || s.caught) {
          const bSpeed = gap > 11 ? 4.4 : gap > MIN_GAP + .4 ? 3.3 : 0;
          m.trail = Math.min(r.p - MIN_GAP / L, m.trail + bSpeed * dt / L);
          if (bSpeed > 0) trudge(bSpeed / 2); else P.stride = .25;
          P.lean = .22; P.guard = .8; lat = T.MathUtils.damp(m.lat, 0, 2.5, dt);
        } else if (ch.mode === 'burst') {
          // Crouch and lean into it, then a low arc on the jets: slow off the ground, fast through
          // the middle, braking hard into the landing. An arc out to one side reads as a chase, not a slide.
          const wind = .2, f = clamp01((k - wind) / (1 - wind)), arc = Math.sin(Math.PI * f);
          m.trail = Math.min(r.p - MIN_GAP / L, T.MathUtils.lerp(ch.from, ch.to, T.MathUtils.smootherstep(f, 0, 1)));
          lift = arc * 1.25; lat = ch.side * (ch.scrape ? 3.9 : 1.5) * arc;
          P.sit = .32 * Math.sin(Math.PI * clamp01(k / wind)) * (f > 0 ? 0 : 1);
          P.dangle = arc * .9; P.lean = .18 + arc * .38; P.guard = .6 + .3 * (1 - arc);
          // The regulator starves the jets halfway: a cough and a dip, then they catch again.
          const cough = f > .48 && f < .6 ? 1 : 0;
          P.thrust = f > 0 && f < .92 ? (cough ? .18 : .9) : .15; P.sputter = 1; jet = P.thrust; lift -= cough * .25;
          if (ch.scrape && !ch.done && f > .45) {
            // Clipping the facade: chunks come off where his shoulder meets the wall, sparks of dust at its foot.
            ch.done = true;
            const at = baymax.root.position.clone(), wall = v3(ch.side * 6.4, 3.4 + lift, at.z);
            st.impact(wall, true);
            st.debris(wall, v3(-ch.side * 2.2, 1.2, -1.2), .42, hit => { const d = hit.distanceTo(camera.position); audio.crash(Math.min(1, 7 / d)); m.shake = Math.max(m.shake, Math.min(.7, 5 / d)); });
            st.debris(wall.clone().add(v3(0, .8, .5)), v3(-ch.side * 1.6, .6, -.6), .2);
            st.kickDust(wall.clone().setY(0), .6, .3); audio.crash(.6); m.shake = Math.max(m.shake, .3); r.misses++;
          }
          if (f >= 1 && !ch.landed) { ch.landed = true; const d = baymax.root.position.distanceTo(camera.position); audio.step(Math.min(1, 9 / d)); m.shake = Math.max(m.shake, .45 * Math.min(1, 10 / d)); st.kickDust(baymax.root.position.clone().setY(0), .7); }
          if (f < 1) ch.landed = false;
        } else if (ch.mode === 'lunge') {
          // A surge forward with the swing, passing just off Hiro's shoulder.
          m.trail = Math.min(r.p - (MIN_GAP - .9) / L, ch.from + 1.4 * Math.sin(Math.PI / 2 * clamp01(k / .55)) / L);
          lat = T.MathUtils.damp(m.lat, ch.side * .7, 4, dt); P.stride = .6; P.gait += dt * 4;
          P.thrust = k > .15 && k < .5 ? .6 : 0; jet = P.thrust;
        } else {
          // Stutter: the limit bites. The jets choke, the arms drop, he rocks back and twitches, losing ground.
          P.sputter = 1; P.thrust = Math.sin(t * 37) > .6 ? .25 : 0; jet = P.thrust;
          P.guard = .3 + .25 * k; P.lean = -.06 + .2 * k; P.stride = 0;
          P.head[2] = Math.sin(t * 23) * .07 * (1 - k); P.eyeGlow = .45 + (Math.sin(t * 31) > 0 ? .55 : .1) * (1 - k * .5);
          lat = T.MathUtils.damp(m.lat, 0, 2, dt);
        }
        m.lat = lat; gap = (r.p - m.trail) * L;
        onTrail(Math.max(0, m.trail)); if (m.trail < 0) baymax.root.position.z = ROUTE.getPointAt(0).z - m.trail * L;
        baymax.root.position.x += lat; baymax.root.position.y = lift;
        // He faces Hiro, not the road: the body turns, the head leads.
        { const hp = ROUTE.getPointAt(r.p); P.yaw = Math.atan2(hp.x - baymax.root.position.x, hp.z - baymax.root.position.z); }
        // Close enough, he swings. It always just misses: Hiro is already moving or the arm stops short.
        const sw = t - m.swingAt;
        if (sw < 1.1) {
          P.punch = sw < .35 ? -.35 * span(sw, 0, .35) : sw < .6 ? -.35 + 1.4 * span(sw, .35, .6) : 1.05 * (1 - span(sw, .6, 1.1));
          P.lean = .3;
          if (!m.swung && sw > .5) { m.swung = true; audio.whoosh(); m.shake = Math.max(m.shake, .55); r.misses++; if (fx.hurt.current && !reducedMotion) { fx.hurt.current.classList.remove('on'); void fx.hurt.current.offsetWidth; fx.hurt.current.classList.add('on'); } }
        }
        // One facade collapse, then a travelling near-miss into the paving: distinct hazards.
        const FALLS = [.24, .62];
        if (m.falls < FALLS.length && r.p > FALLS[m.falls]) {
          const side = m.falls % 2 ? 1 : -1, lead = 5.6 + r.speed * .4;
          const land = ROUTE.getPointAt(Math.min(1, r.p + lead / ROUTE_LENGTH)).setY(0).add(v3(side * (1.5 + (m.falls % 3) * .45), 0, 0));
          const from = v3(side * 7.6, 13.5, land.z + 1.5), fall = Math.sqrt(2 * 13 / 15);
          const push = v3((land.x - from.x) / fall, 0, (land.z - from.z) / fall);
          if (m.falls === 0) {
            st.debris(from, push, .55, at => { const d = at.distanceTo(camera.position); audio.crash(Math.min(1, 6 / d)); m.shake = Math.max(m.shake, Math.min(.65, 4 / d)); r.misses++; });
            st.debris(from.clone().add(v3(0, 1.2, -.6)), push.clone().multiplyScalar(1.08), .22);
          } else {
            st.fire(baymax.fistWorld(new T.Vector3()), land); audio.whoosh(); r.misses++;
          }
          m.falls++;
        }
        const pos = ROUTE.getPointAt(r.p); feet.set(pos.x, 0, pos.z);
        const ahead = ROUTE.getPointAt(Math.min(1, r.p + .05));
        look.copy(ahead).lerp(FRAME, T.MathUtils.smoothstep(r.p, .75, 1));
        // Glances back over the shoulder at fixed points on the run, and whenever he swings.
        const g = Math.max([.24, .48, .72].reduce((acc, at) => Math.max(acc, Math.sin(Math.PI * clamp01((r.p - at) / .06))), 0), sw < 1.2 ? Math.sin(Math.PI * clamp01(sw / 1.2)) * .8 : 0);
        m.glance = T.MathUtils.damp(m.glance, g * .8, 3.8, dt);
        if (m.glance > .01) look.copy(FirstPerson.blend(fp.eyeAt(), look.clone(), baymax.headWorld(tmp).clone().setY(2.5), m.glance));
        freeLook = .9 * (1 - m.glance); lookRate = 7; fov = 66 + (reducedMotion ? 0 : Math.min(1, m.shake) * 1.5); raise = 0;
        dread = clamp01(1 - (gap - MIN_GAP) / 12); near = dread;
        r.gap = gap;
        // Stand still with him on your back and he gets you: the run stops and offers a retry.
        if (!s.caught) {
          m.idle = gap < MIN_GAP + .5 && r.speed < .8 ? m.idle + dt : Math.max(0, m.idle - dt * 2);
          if (m.idle > 1.8) {
            useP6.setState({ caught: true }); m.shake = reducedMotion ? 0 : 1; audio.crash(1);
            if (fx.hurt.current && !reducedMotion) { fx.hurt.current.classList.remove('on'); void fx.hurt.current.offsetWidth; fx.hurt.current.classList.add('on'); }
          }
        }
        // Caught: he turns to see him, fist drawn back.
        if (s.caught) { dread = 1; P.punch = .9; look.copy(head()); freeLook = 0; lookRate = 6; }
        else if (r.p > .985) go('gate');
      } else if (s.stage === 'gate' || s.stage === 'powered') {
        m.trail = Math.min(.62, m.trail + dt * .0035); onTrail(m.trail); trudge(.6);
        feet.copy(GATE_SPOT); look.set(0, FRAME.y + .1, FRAME.z); freeLook = .1; raise = .15;
        if (s.stage === 'powered') {
          // It tries: a seam opens in the middle of the ring, flickers, and folds shut. The reader
          // has locked onto something from this side, so there's nowhere for it to open onto.
          // The rings and spokes strain part-way out and snap back.
          const seam = Math.sin(Math.PI * span(e, .25, 1.8)) ** 1.5;
          open = seam * .3 * (.85 + .15 * Math.sin(t * 40)); flash = seam * (.5 + .5 * Math.sin(t * 31)) * .35;
          if (e > .25 && e - dt <= .25) audio.falter();
          if (e > .9 && e < 1.6) m.shake = Math.max(m.shake, .18);
          // A last look at it humming, then across to the ladder, up, and out onto the deck.
          const path = [GATE_SPOT, v3(LADDER_X + .3, 0, -88.5), v3(LADDER_X, 0, -88.85), v3(LADDER_X, DECK.y, -88.85), v3(LADDER_X + .4, DECK.y, -89.7), DECK_SPOT];
          const k = e < 1.2 ? 0 : e < 3.6 ? span(e, 1.2, 3.6) * .52 : e < 5.4 ? .52 + span(e, 3.6, 5.4) * .2 : .72 + span(e, 5.4, 6.4) * .28;
          along(path, k, feet);
          if (e > 1.2 && e < 3.6) look.set(LADDER_X, 1.6, -89.2);
          else if (e >= 3.6 && e < 5.4) look.set(LADDER_X, DECK.y + 1.4, -89.6);
          else if (e >= 5.4) look.copy(head()).lerp(v3(0, FRAME.y, FRAME.z), 1 - span(e, 5.4, 6.4));
          lookRate = 3; if (e > 6.6) go('choice');
        }
        dread = .2;
      } else if (s.stage === 'choice' || s.stage === 'switchOff') {
        m.trail = Math.min(.62, m.trail + dt * .0035); onTrail(m.trail); trudge(.6);
        feet.copy(DECK_SPOT); look.copy(head()).setY(2.4);
        raise = s.stage === 'switchOff' ? 1 : .35 + span(e, 2.4, 3) * .3; dread = .3;
      } else if (s.stage === 'flyin' || s.stage === 'faceoff' || s.stage === 'switchOn2') {
        // Full power: up above the roofs, down the street, and stop face to face with Hiro.
        const hover = v3(LANDING.x, HOVER_Y, LANDING.z + HOVER_BACK);
        feet.copy(DECK_SPOT);
        const start = ROUTE.getPointAt(clamp01(m.trail)).setY(0);
        if (s.stage === 'flyin') {
          if (e < .05) m.bayAt.copy(start);
          const rise = span(e, .7, 2.3), travel = span(e, 2.2, 5.2);
          const up = m.bayAt.clone().setY(rise * 9);
          const c1 = up.clone().add(v3(0, 3, -12)), c2 = hover.clone().add(v3(0, 4, 9));
          const q = travel > 0 ? new T.CubicBezierCurve3(up, c1, c2, hover).getPoint(travel) : up;
          baymax.root.position.copy(q);
          P.yaw = Math.PI; P.dangle = 1; P.lean = .35 * Math.sin(Math.PI * travel) + .05; P.guard = 1 - .6 * Math.sin(Math.PI * travel);
          P.thrust = span(e, .1, .7); jet = P.thrust;
          if (e > .1 && e < .16) { audio.ignite(); m.shake = .25; }
          look.copy(head()); lookRate = 4;
          // He pulls up hard in front of the deck: Hiro flinches back a step.
          feet.z = DECK_SPOT.z - span(e, 4.6, 5.3) * .35;
          if (travel > .97 && m.lift === 0) { m.lift = 1; st.kickDust(hover.clone().setY(0), .7, 1); m.shake = .5; }
          dread = .5 + travel * .5; near = travel;
          if (e > 6.2) go('faceoff');
        } else {
          // Hovering on full thrust, never still: a slow drift on two rhythms, the jets pulsing him up
          // and down, and every few seconds a feint at the deck (a surge in, fists tight, then back).
          const cyc = (e % 3.4) / 3.4, feint = Math.sin(Math.PI * clamp01((cyc - .55) / .3)) ** 2;
          const pulseY = Math.sin(t * 2.2) * .06 + Math.max(0, Math.sin(t * 5.3)) * .03;
          baymax.root.position.copy(hover).add(v3(Math.sin(t * .9) * .12 + Math.sin(t * .37) * .07, pulseY - feint * .05, -feint * .55));
          const toHiro = Math.atan2(DECK_SPOT.x - baymax.root.position.x, DECK_SPOT.z - baymax.root.position.z);
          P.yaw = toHiro + Math.sin(t * .7) * .05; P.dangle = .3 + feint * .15; P.lean = .05 + Math.sin(t * 1.3) * .04 + feint * .22;
          P.guard = .45 + feint * .45; P.head[0] = feint * .1; P.thrust = .92 + .08 * Math.sin(t * 7) + feint * .1; jet = P.thrust; m.lift = 1;
          if (feint > .9 && m.wakeFx !== 9) { m.wakeFx = 9; audio.servo(); m.shake = Math.max(m.shake, .12); }
          if (feint < .1 && m.wakeFx === 9) m.wakeFx = 8;
          // The limit bites (switchOn2, once the bat lands): the jets choke and he jolts.
          if (s.stage === 'switchOn2' && s.regulator) { P.sputter = 1; P.thrust = Math.sin(t * 41) > .2 ? .5 : .1; jet = P.thrust; P.guard = .3; P.lean = -.08; baymax.root.position.y -= .12; }
          feet.z = DECK_SPOT.z - .35;
          // Aim at his chest, not his eyes, so his legs and jets stay in frame below the subtitle.
          look.copy(head()); look.y -= 1.35 * BS; raise = s.stage === 'switchOn2' ? 1 : .55; dread = .9; near = 1;
        }
        fov = 68;
      } else if (s.stage === 'drop') {
        // Thrusters out. The jets choke, he lurches at the deck one last time and his reach falls
        // short; then he drops, tipping onto his back as he falls, hits the paving hard, bounces and
        // slides to a stop where he lies for the rest of the gate site.
        const CHOKE = .35, g = 11.5, y0 = HOVER_Y - .12 + .12, vy0 = .7;
        const tLand = CHOKE + (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * y0)) / g;
        const fe = Math.max(0, e - CHOKE);
        const y = e < CHOKE ? HOVER_Y - .12 + .12 * span(e, 0, CHOKE) : e < tLand ? Math.max(0, y0 + vy0 * fe - .5 * g * fe * fe) : Math.max(0, Math.sin(Math.min(1, (e - tLand) / .28) * Math.PI) * .09);
        const fall = clamp01((e - CHOKE) / (tLand - CHOKE));
        const lurch = span(e, 0, CHOKE + .2), slide = e > tLand ? 1 - Math.exp(-(e - tLand) * 5) : 0;
        baymax.root.position.set(LANDING.x, y, LANDING.z + HOVER_BACK * (1 - lurch * .55) - HOVER_BACK * .45 * slide);
        P.yaw = Math.PI; P.dangle = (1 - fall) * (e < CHOKE ? .4 : 1); P.lie = e < tLand ? T.MathUtils.smoothstep(fall, .1, 1) * .9 : 1;
        P.guard = .4 * (1 - fall); P.punch = .7 * Math.sin(Math.PI * clamp01(e / (CHOKE + .25)));
        P.thrust = e < CHOKE ? (Math.sin(t * 47) > 0 ? .55 : .12) * (1 - e / CHOKE) : 0; P.sputter = 1; jet = P.thrust;
        if (e > .02 && e - dt <= .02) audio.falter();
        if (e > .12 && e - dt <= .12) { st.fire(baymax.fistWorld(new T.Vector3()), v3(-6, .03, LANDING.z - 2)); audio.whoosh(); }
        P.eyes.copy(RED).lerp(DARK, span(e, 1.2, 3)); P.eyeGlow = 1 - span(e, 1.2, 3);
        P.open = clamp01((e - 4) / 2.5) * 4.6; P.chipGlow = span(e, 5.8, 7.4);
        // The landing shakes the gate's field: a flare and a flicker across the ring.
        if (m.landed) { const k = Math.exp(-(e - tLand) * 2.2); flash = k * .45; open = k * .16 * (.8 + .2 * Math.sin(t * 40)); }
        if (!m.landed && e >= tLand) { m.landed = true; m.shake = reducedMotion ? 0 : 1; audio.impact(); st.kickDust(LANDING, 1.4); }
        feet.copy(DECK_SPOT); feet.z -= .35;
        // Lean past the deck's right-hand rail for the impact, then return before
        // climbing down to the chest. The railing stays physically in the set.
        feet.x += 1.25 * span(e, 0, .55) * (1 - span(e, 3.6, 4.5));
        // Leaning over the deck rail to see him, then down to his chest as it opens.
        feet.z += span(e, 2, 3.5) * .35;
        look.copy(baymax.root.position).setY(e < tLand ? y + 2.6 * BS : .7).lerp(baymax.chestWorld(tmp), span(e, 3.2, 5.2));
        lookRate = 3; raise = .2;
        if (e > 7.4) go('carry');
      } else if (s.stage === 'carry') {
        baymax.root.position.copy(LANDING); P.yaw = Math.PI; P.lie = 1; P.guard = 0; P.eyes.copy(DARK); P.eyeGlow = 0;
        P.open = 4.6; P.chipGlow = s.chip === 'bay' ? 1 : 0;
        // Approach outside the shoulder, then look down into the upward-facing socket.
        const R0 = LANDING, chest = baymax.chestWorld(tmp).clone(), onHim = v3(chest.x - .75, 0, chest.z - .35), approach = v3(chest.x - 2.4, 0, chest.z - 1.1);
        raise = 0; freeLook = 0;
        if (s.chip !== 'out') {
          // Down the ladder, across to him, and up onto him to get at the bay.
          const path = [DECK_SPOT, v3(LADDER_X + .4, DECK.y, -89.7), v3(LADDER_X, DECK.y, -88.85), v3(LADDER_X, 0, -88.85), approach, onHim];
          const k = e < .8 ? span(e, 0, .8) * .14 : e < 2.3 ? .14 + span(e, .8, 2.3) * .2 : e < 4.3 ? .34 + span(e, 2.3, 4.3) * .52 : .86 + span(e, 4.3, 5.2) * .14;
          along(path, k, feet);
          look.copy(e < .8 ? v3(LADDER_X, DECK.y, -88) : e < 2.3 ? v3(LADDER_X, .4, -87.6) : baymax.dockWorld(tmp));
          eye = T.MathUtils.lerp(1.56, chest.y + .55, span(e, 4.4, 5.2)); lookRate = 3.5; reach = s.chip === 'held' ? 1 : e > CLUE_END ? .4 : 0;
          fov = 62 - span(e, 4.4, 5.2) * 4;
          if (e > 5.2) look.copy(baymax.dockWorld(tmp));
          // The clue: up on him, a look back at the gate, its hub and reader beating red in the
          // chip's rhythm, then back down to the chip.
          const clue = Math.sin(Math.PI * clamp01((e - CLUE_AT) / (CLUE_END - CLUE_AT)));
          if (clue > 0) look.copy(FirstPerson.blend(fp.eyeAt(), look.clone(), v3(0, FRAME.y - .9, FRAME.z), clue * .95));
        } else {
          // Carry the removed combat chip from Baymax to the reader.
          const k2 = now() - s.pulledAt;
          const path = [onHim, approach, v3(R0.x + .3, 0, R0.z - 2.6), READER_SPOT];
          along(path, k2 < .7 ? 0 : k2 < 1.5 ? span(k2, .7, 1.5) * .3 : .3 + span(k2, 1.5, 4.2) * .7, feet);
          eye = T.MathUtils.lerp(chest.y + .55, 1.56, span(k2, .5, 1.3)); lookRate = 3;
          look.copy(k2 < 1.5 ? baymax.dockWorld(tmp) : st.readerWorld()).lerp(st.readerWorld().add(v3(0, .05, 0)), span(k2, 1.6, 4));
          if (k2 > 4.2) look.set(PEDESTAL.x - .25, .95, PEDESTAL.z - 1.6);
          reach = s.cart === 'held' ? 1 : k2 > 2.4 ? .55 : 0;
        }
      } else if (s.stage === 'bloom') {
        baymax.root.position.copy(LANDING); P.yaw = Math.PI; P.lie = 1; P.guard = 0; P.eyes.copy(DARK); P.eyeGlow = 0; P.open = 4.6; P.chipInBay = false; P.overhead = span(e, 7.4, 8.4);
        open = 1 - Math.pow(1 - span(e, .9, 3.6), 3);
        if (e > .9 && e < .96) audio.bloom();
        feet.copy(READER_SPOT);
        if (e < 5) { look.set(0, FRAME.y - .1, FRAME.z); lookRate = 2.5; reach = .3 * (1 - span(e, .6, 1.4)); }
        else if (e < 7.6) {
          // Turn round to him and walk to his feet.
          along([READER_SPOT, v3(1.4, 0, -87.4), v3(LANDING.x * .85, 0, LANDING.z - FEET - LEAD)], span(e, 5.3, 7.6), feet);
          look.copy(baymax.root.position).setY(.9).lerp(v3(LANDING.x, .4, LANDING.z - FEET), span(e, 6.6, 7.6)); lookRate = 3;
        } else {
          // He takes him by the feet and hauls him back: across onto the walkway's line, then
          // straight up it, through the middle of the ring, a braced pull at a time.
          const k = tugged((e - 8.3) / 10, 10);
          const A = v3(LANDING.x, 0, LANDING.z), B = v3(0, 0, LANDING.z - 1.1), C = v3(0, 0, CROSS_ROOT_Z - 1.2);
          const root = along([A, B, C], k);
          const cz = root.z + LIE_CENTRE, fz = root.z - FEET, hz = root.z + LIE_LENGTH - FEET;
          baymax.root.position.set(root.x, rampY(cz), root.z);
          baymax.root.rotation.x = Math.atan2(rampY(fz) - rampY(hz), LIE_LENGTH);
          // Leaning in, both hands go onto his ankles and stay there for the whole haul.
          grip = span(e, 7.6, 8.3);
          feet.set(root.x * .85, 0, fz - LEAD); feet.y = rampY(feet.z);
          eye = 1.56 - grip * .03; reach = span(e, 7.6, 8.2) * .5;
          look.set(root.x, baymax.root.position.y + .6, root.z + 1.3); lookRate = 4;
          // One look over his shoulder at the open gate, then back to Baymax.
          const glance = Math.sin(Math.PI * clamp01((e - 12.8) / 1.8));
          if (glance > 0) look.copy(FirstPerson.blend(fp.eyeAt(), look.clone(), v3(0, FRAME.y, FRAME.z - 3), glance * .9));
          const pull = Math.floor(clamp01((e - 8.3) / 10) * 10);
          if (pull !== m.stepAt && e > 8.3) { m.stepAt = pull; audio.step(.4); m.shake = Math.max(m.shake, reducedMotion ? 0 : .12); }
          // Each tug: a dip and a jolt through his arms, then the brace for the next one.
          const tug = haulEffort((e - 8.3) / 10, 10);
          if (e > 8.3) eye -= .035 * tug;
          // The surface: the warp grows as his eye reaches it.
          warp = span(-(feet.z), -(FRAME.z + 1.25), -FRAME.z);
          if (warp > .3 && !m.warped) { m.warped = true; audio.warp(); }
          if (fp.feet.z <= FRAME.z + .02 && e > 9) go('home');
        }
        crossingFade = span(warp, .55, .92);
        if (e > 19.5) { crossingFade = 1; go('home'); }
        flash = span(warp, .6, 1);
        renderGate(st, open);
      }
      // Extraction and reader seating use the actual card from his dock. Its final transform
      // is applied after the actor and hands update, so neither can move away from the grip.
      P.chipInBay = s.chip === 'bay' && drag.current.returning === 0;
      cart.root.visible = false;
      // What the reader is locked onto: Baymax's combat chip. Faint while he's down the street,
      // stronger as he closes, and beating with the chip once his bay is open. Pulled, it lets go.
      const lock = !powered || socket ? 0
        : s.stage === 'drop' ? Math.max(.45, P.chipGlow)
        : s.stage === 'carry' ? (s.chip === 'bay' ? 1 : s.chip === 'held' ? .5 : 0)
        : s.stage === 'flyin' || s.stage === 'faceoff' || s.stage === 'switchOn2' ? .45
        : s.stage === 'powered' ? span(e, 1.2, 2.2) * .3 : .3;
      // The trace: out from the hub to his chest as it locks (powered), then beating with the chip.
      {
        const reach = s.stage === 'powered' ? span(e, .9, 1.5) * (1 - span(e, 2.1, 2.5)) : s.stage === 'drop' || s.stage === 'carry' ? lock : 0;
        const beat = .55 + .45 * Math.sin(t * 4);
        lockBeam.visible = reach > .01 && !socket;
        if (lockBeam.visible) {
          const from = st.hub.getWorldPosition(new T.Vector3()), to = baymax.chestWorld(new T.Vector3());
          lockBeam.position.copy(from); lockBeam.lookAt(to);
          lockBeam.scale.set(1, 1, from.distanceTo(to) * (s.stage === 'powered' ? T.MathUtils.smootherstep(span(e, .9, 1.5), 0, 1) : 1));
          (lockBeam.material as T.MeshBasicMaterial).opacity = reach * (s.stage === 'powered' ? .9 : .35 * beat);
          if (s.stage === 'powered' && e > 1.5 && e - dt <= 1.5) { audio.contact(); m.shake = Math.max(m.shake, .2); }
        }
      }
      st.update(t, dt, { angles: s.angles, live, powered, open, flash, cracked: atLeast(s.stage, 'carry') || (s.stage === 'drop' && m.landed) ? 1 : 0, socket, lock, eye: camera.position, dread });
      if (s.stage !== 'flyin') m.lift = s.stage === 'faceoff' || s.stage === 'switchOn2' ? 1 : 0;
      if (s.stage !== 'escape') r.gap = baymax.root.position.distanceTo(fp.feet);
    } else cart.root.visible = false;

    if (set === 'home') {
      const he = e - EMERGE - .4;
      const gate = s.stage === 'home' ? 1 - span(e, EMERGE - 1.4, EMERGE + .6) : 0;
      home.update(t, dt, { gate, careBlink: s.care === 'seated' ? 0 : 1 });
      baymax.root.position.copy(HOME_BAYMAX); P.yaw = Math.PI; P.lie = 1; P.guard = 0; P.eyes.copy(DARK); P.eyeGlow = 0; P.open = 4.6; P.chipInBay = false; P.overhead = 1 - span(e, EMERGE - 1, EMERGE + .5);
      if (s.stage === 'home' && he < 0) {
        // Through. The rest of him comes out of the gate after Hiro, slides off its lip onto the
        // ground, and the gate closes behind him.
        const k = tugged(e / (EMERGE - 1.2), 6);
        const root = v3(0, 0, HOME_CROSS_ROOT_Z).lerp(HOME_BAYMAX, k);
        const fz = root.z - FEET, hz = root.z + LIE_LENGTH - FEET;
        baymax.root.position.set(root.x, homeFloor(root.z + LIE_CENTRE), root.z);
        baymax.root.rotation.x = Math.atan2(homeFloor(fz) - homeFloor(hz), LIE_LENGTH);
        crossing.normal.set(0, 0, -1); crossing.constant = HOME_GATE.z;
        // Still hauling by his ankles until he's clear of the gate, then letting go.
        grip = 1 - span(e, EMERGE - 1.6, EMERGE - .8);
        feet.set(root.x * .85, 0, Math.min(HOME_GATE.z - .05, fz - LEAD)); feet.y = homeFloor(feet.z);
        eye = 1.46; reach = grip;
        look.set(root.x, baymax.root.position.y + .6, root.z + 1.3).lerp(v3(HOME_GATE.x, HOME_GATE.y - 1, HOME_GATE.z), span(e, EMERGE - 2, EMERGE - .6) * .6);
        lookRate = 3.5; raise = 0;
        warp = 1 - span(e, .1, 1.1);
        crossingFade = 1 - span(e, .2, .9);
        if (e > .1 && e < 1.3) P.chipGlow = 0;
      } else {
        first = false;
        hiro.root.visible = true;
        // The healthcare chip (tracker R-07). Holds: on the chip, then on his chest (E works for both).
        const c = care.current, HOLD = .8;
        const holding = c.target ?? (c.key && (s.care === 'ground' || s.care === 'hand') ? (s.care === 'ground' ? 'chip' : 'chest') : null);
        c.progress = holding && s.stage === 'home' ? clamp01((now() - (c.target ? c.at : c.keyAt)) / HOLD) : 0;
        if (holding && c.progress >= 1) {
          c.target = null; c.key = false; c.progress = 0;
          // He gets up and goes over to the bin for it (home.ts directs the walk).
          if (holding === 'chip' && s.care === 'ground') useP6.setState({ care: 'fetch', fetchAt: now() });
          else if (holding === 'chest' && s.care === 'hand') { useP6.setState({ care: 'open' }); audio.servo(); hiro.handWorld(c.guide); }
        }
        if (s.care === 'fetch') {
          const f = now() - s.fetchAt;
          if (f >= FETCH_PICK && f - dt < FETCH_PICK) audio.snap();
          if (f >= FETCH_END) useP6.setState({ care: 'hand' });
        }
        // The bay opens as it did in Phase 1, and stays open until the boot closes it.
        c.open = T.MathUtils.clamp(c.open + (s.care === 'open' || s.care === 'seated' ? dt * 2.6 : -dt * 4), 0, 4.6);
        // Guiding: the chip follows the pointer on a plane through the socket; near it, it's drawn in and seats.
        if (s.stage === 'home' && s.care === 'open' && c.open > 4) {
          const dock = baymax.dockWorld(new T.Vector3()), want = c.guide.clone();
          if (c.key) want.copy(dock);
          else if (c.aim) {
            const n = new T.Vector3(); cam.getWorldDirection(n); const plane = new T.Plane().setFromNormalAndCoplanarPoint(n.negate(), dock);
            const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(c.aim.x / size.width * 2 - 1, -(c.aim.y / size.height * 2 - 1)), cam);
            ray.ray.intersectPlane(plane, want);
          }
          c.guide.lerp(want, 1 - Math.exp(-dt * (c.key ? 2.5 : 12)));
          const d = c.guide.distanceTo(dock);
          if (d < .35) c.guide.lerp(dock, 1 - Math.exp(-dt * 8));
          if (d < .05) { useP6.setState({ care: 'seated' }); audio.seat(); go('seated'); }
        }
        drag.current.pos.copy(c.guide);
        const homeShot = directHome(home, { baymax, hiro }, {
          stage: s.stage, e: s.stage === 'home' ? Math.max(0, he) : e, t, dt,
          care: s.care, fetch: s.care === 'fetch' ? now() - s.fetchAt : -1, dragPos: drag.current.pos, returning: drag.current.returning, camera, bayOpen: care.current.open,
        }, { chime: () => audio.chime(), step: level => audio.step(level), done: () => go('end') }, camPos, look);
        fov = homeShot.fov;
      }
    }

    // ---------- everything after this is shared
    function renderGate(st: Street, open: number) {
      if (open <= 0) return;
      // The far side, seen from where the camera stands relative to this gate.
      const w = Math.max(2, Math.floor(size.width * gl.getPixelRatio() * .6)), h = Math.max(2, Math.floor(size.height * gl.getPixelRatio() * .6));
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      homeCam.copy(cam); homeCam.position.copy(camera.position).sub(FRAME).add(HOME_GATE);
      home.update(t, dt, { gate: 0, careBlink: 1 });
      const prev = gl.getRenderTarget(); gl.setRenderTarget(target); gl.render(homeScene, homeCam); gl.setRenderTarget(prev);
      st.portalMat.uniforms.uView.value = target.texture;
      st.portalMat.uniforms.uRes.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    }

    if (set === 'relay') {
      const inRec = s.stage === 'limited' && !s.took;
      cart.root.visible = inRec; cart.root.scale.setScalar(inRec ? 1.9 : 1);
      if (inRec) {
        if (cart.root.parent !== scene) scene.add(cart.root);
        cart.root.position.set(RECORDER.x, 1.06, RECORDER.z); cart.root.rotation.set(-Math.PI / 2 + .3, 0, .4);
        cart.glow.color.set('#ffb066').multiplyScalar(1 + .6 * Math.sin(t * 4));
      }
    }
    baymax.update(t, s.stage === 'bloom' ? (_x, z) => rampY(z) : set === 'home' && s.stage === 'home' && e < EMERGE + .4 ? (_x, z) => homeFloor(z) : undefined); hiro.update();
    if (grip > 0) {
      // Fit Hiro to the live boots, not the old white-shell foot-length estimate. A crouched,
      // short backward step keeps the wrists within reach while the load advances in pulls.
      const anchor = baymax.ankleWorld('L', tmp).clone().add(baymax.ankleWorld('R')).multiplyScalar(.5);
      const heldFeet = v3(anchor.x, 0, anchor.z - .58);
      if (set === 'home') heldFeet.z = Math.min(HOME_GATE.z - .05, heldFeet.z);
      heldFeet.y = set === 'home' ? homeFloor(heldFeet.z) : rampY(heldFeet.z);
      feet.lerp(heldFeet, grip); eye = T.MathUtils.lerp(eye, 1.12 - haulEffort((e - 8.3) / 10, 10) * .035, grip);
      if (s.stage === 'bloom') { warp = span(-feet.z, -(FRAME.z + 1.25), -FRAME.z); crossingFade = span(warp, .55, .92); }
    }
    // His eyes: a red spot thrown where he faces, and a glow on the head, while they burn red.
    const red = P.eyeGlow * (P.eyes.r > .5 && P.eyes.g < .4 ? 1 : 0) * (set === 'home' ? 0 : 1);
    baymax.headWorld(tmp); eyeGlow.position.copy(tmp).add(v3(Math.sin(P.yaw) * .55 * BS, 0, Math.cos(P.yaw) * .55 * BS)); eyeGlow.visible = red > .02;
    (eyeGlow.material as T.SpriteMaterial).opacity = red * (.55 + .2 * Math.sin(t * 9)) * (.6 + dread * .6);
    eyeLight.position.copy(eyeGlow.position); eyeLight.target.position.copy(set === 'street' || set === 'relay' ? camera.position : tmp);
    eyeLight.intensity = red * (set === 'street' && s.stage === 'escape' ? 70 : 28);
    audio.set({ jet: jet || P.thrust, sputter: P.sputter > 0 && P.thrust > 0 ? 1 : 0, hum: set === 'street' ? hum : 0, air: set === 'home' ? 0 : 1, calm: set === 'home' ? 1 : 0, dread, near });
    // The chase is darker: the city light drops and the fog closes in.
    const chase = s.stage === 'escape' ? 1 : 0;
    (lights.children[0] as T.HemisphereLight).intensity = T.MathUtils.damp((lights.children[0] as T.HemisphereLight).intensity, 1.3 - chase * .95, 2, dt);
    (lights.children[1] as T.DirectionalLight).intensity = T.MathUtils.damp((lights.children[1] as T.DirectionalLight).intensity, 1.7 - chase * 1.4, 2, dt);
    if (set === 'street' && scene.fog instanceof T.Fog) { scene.fog.far = T.MathUtils.damp(scene.fog.far, chase ? 85 : 190, 2, dt); scene.fog.near = chase ? 6 : 18; scene.fog.color.set(chase ? '#08111a' : '#1a3146'); scene.background = chase ? CHASE_SKY : CITY_SKY; }

    // Camera: Hiro's eyes, or (home, after the crossing) a camera that drifts within each shot.
    hands.root.visible = first;
    if (first) {
      // A jump of more than a stride is a cut (a new set, a dev skip): place him, don't walk him.
      if (fp.feet.distanceTo(feet) > 1.2 || m.thirdShot) place = true;
      if (place) fp.place(feet); else fp.feet.copy(feet);
      fp.update(cam, dt, t, { look, eye, lookRate, steady: s.stage === 'carry' && s.chip !== 'out' && e > 5.2, pointer: r.pointer, freeLook: reducedMotion ? 0 : freeLook, onStep: (side, speed) => { audio.footstep(side, speed); } });
      if (s.stage === 'carry') {
        const draggingCard = s.chip === 'held' || s.chip === 'out' && s.cart === 'held';
        const carryingCard = s.chip === 'out' && s.cart === 'hand';
        hands.pose('right', draggingCard || carryingCard ? 'pinch' : null);
        hands.track(draggingCard ? drag.current.pos : null);
        if (carryingCard) reach = 1;
      } else if (grip === 0) { hands.pose('right', null); hands.track(null); }
      hands.update(t, dt, { walk: clamp01(fp.speed / 4.2), gait: fp.gait, raise, reach });
      m.thirdShot = '';
    } else {
      const shot = s.stage === 'boot' || s.stage === 'end' ? s.stage : 'home';
      const cut = shot !== m.thirdShot; m.thirdShot = shot;
      camera.position.lerp(camPos, cut || reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4));
      if (cut) cam.userData.look = look.clone();
      const l = (cam.userData.look as T.Vector3 | undefined) ?? look.clone(); l.lerp(look, cut ? 1 : 1 - Math.exp(-dt * 3)); cam.userData.look = l;
      camera.lookAt(l);
    }
    if (!first && cam.aspect < 16 / 9) fov = T.MathUtils.radToDeg(2 * Math.atan(Math.tan(T.MathUtils.degToRad(fov) / 2) * (16 / 9) / cam.aspect));
    if (Math.abs(cam.fov - fov) > .01) { cam.fov = place ? fov : T.MathUtils.damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
    // Shake: hard on the fall, on near misses and debris, small on each of his footfalls near Hiro.
    m.shake = Math.max(0, m.shake - dt * 1.6);
    if (m.shake > 0 && !reducedMotion) { const a = m.shake * m.shake * .1; camera.position.add(v3(Math.sin(t * 61) * a, Math.sin(t * 73 + 1) * a, Math.sin(t * 57 + 2) * a * .5)); camera.rotateZ(Math.sin(t * 47) * a * .3); }
    haul(baymax, camera, first ? grip : 0, fp.feet, fp.eye);
    // One physical combat card: dock -> Hiro's pinch -> reader. Reparenting preserves the
    // live world transform; the last centimetres into the reader are mechanically authored.
    const card = baymax.combatChip, stReader = env.current.street;
    if (set === 'street' && (s.stage === 'carry' || s.stage === 'bloom')) {
      const returnToBay = s.chip === 'bay' && drag.current.returning > 0;
      if (s.chip === 'bay' && !returnToBay) {
        if (card.parent !== baymax.dock) baymax.dock.add(card);
        card.position.set(0, 0, .004); card.quaternion.identity(); card.scale.setScalar(1);
      } else if (s.chip === 'out' && s.cart === 'hand') {
        if (card.parent !== hands.rightSocket) hands.rightSocket.attach(card);
        card.position.lerp(v3(.055, .065, 0), 1 - Math.exp(-dt * 9));
        const gripQ = hands.rightSocket.getWorldQuaternion(new T.Quaternion()).invert().multiply(camera.quaternion);
        card.quaternion.slerp(gripQ, 1 - Math.exp(-dt * 9));
        card.scale.setScalar(BS); card.visible = true;
        drag.current.returning = Math.max(0, drag.current.returning - dt * 3);
      } else {
        if (card.parent !== scene) scene.attach(card);
        card.scale.setScalar(BS); card.visible = true;
        if (s.cart === 'slot' && stReader) {
          const q = stReader.readerQuat(), n = v3(0, 1, 0).applyQuaternion(q);
          const seat = stReader.readerWorld().addScaledVector(n, .073);
          const age = s.stage === 'bloom' ? 1 : clamp01((now() - drag.current.seatAt) / .72);
          card.position.lerpVectors(drag.current.seatFrom, seat.clone().addScaledVector(n, .12), span(age, 0, .62));
          card.position.lerp(seat, span(age, .62, 1));
          card.quaternion.slerpQuaternions(drag.current.seatQ, q, ease(age));
          if (s.stage === 'carry' && age >= 1) { audio.seat(); go('bloom'); }
        } else if (returnToBay) {
          card.position.lerp(baymax.dockWorld(), 1 - Math.exp(-dt * 12));
          card.quaternion.slerp(baymax.dock.getWorldQuaternion(new T.Quaternion()), 1 - Math.exp(-dt * 12));
          if (card.position.distanceTo(baymax.dockWorld()) < .006) drag.current.returning = 0;
        } else {
          card.position.lerp(drag.current.pos, 1 - Math.exp(-dt * 20));
          card.quaternion.slerp(s.cart === 'held' && stReader ? stReader.readerQuat() : camera.quaternion, 1 - Math.exp(-dt * 7));
        }
      }
    } else if (card.parent !== baymax.dock) card.visible = false;
    // The crossing: the page warps around the surface.
    if (fx.warp.current) fx.warp.current.setAttribute('scale', String(reducedMotion ? 0 : warp * 38));
    if (fx.world.current) fx.world.current.classList.toggle('p6-warping', warp > .01 && !reducedMotion);
    if (fx.crossingCover.current) fx.crossingCover.current.style.opacity = String(crossingFade);
    r.dread = dread; r.hiro = [fp.feet.x, fp.feet.z]; r.bay = [baymax.root.position.x, baymax.root.position.z];
    if (set === 'relay') r.gap = baymax.root.position.distanceTo(fp.feet);
    // Hints for the drags, placed over the piece and where it goes.
    const hint = (el: HTMLDivElement | null, p: T.Vector3 | null | undefined, on: boolean) => {
      if (!el) return;
      if (!p) { el.style.opacity = '0'; return; }
      const q = p.clone().project(camera); el.style.opacity = on && q.z < 1 ? '1' : '0';
      el.style.transform = `translate(${(q.x + 1) / 2 * size.width}px, ${(1 - q.y) / 2 * size.height}px)`;
    };
    const st = env.current.street;
    const taking = s.stage === 'limited' && !s.took && e > 9.6;
    const pulling = s.stage === 'carry' && s.chip !== 'out', slotting = s.stage === 'carry' && s.chip === 'out' && now() - s.pulledAt > 4.2, homing = s.stage === 'home' && e > EMERGE + 2.2;
    hint(hints.grab.current, taking ? cart.root.getWorldPosition(new T.Vector3()) : pulling ? baymax.dockWorld() : slotting ? card.getWorldPosition(new T.Vector3()) : homing ? home.care.chip.getWorldPosition(new T.Vector3()) : null, taking || (pulling && s.chip === 'bay' && e > CLUE_END) || (slotting && s.cart === 'hand') || (homing && s.care === 'ground'));
    hint(hints.drop.current, slotting ? st?.readerWorld() : homing ? baymax.dockWorld() : null, (slotting && s.cart === 'held') || (homing && (s.care === 'hand' || s.care === 'open')));
    // The hold steps show their progress in the ring and say what to do (as in Phase 1).
    for (const el of [hints.grab.current, hints.drop.current]) el?.style.setProperty('--hold', homing ? care.current.progress.toFixed(3) : '0');
    if (hints.grab.current) hints.grab.current.dataset.label = homing && s.care === 'ground' ? 'CLICK + HOLD' : '';
    if (hints.drop.current) hints.drop.current.dataset.label = homing ? s.care === 'hand' ? 'CLICK + HOLD' : s.care === 'open' ? 'GUIDE IT IN · OR HOLD E' : '' : '';
    m.lastStage = s.stage;
  });

  return <SceneQuality ready={compiled} manageDpr={false} onReady={onReady} onError={onError} />;
}
