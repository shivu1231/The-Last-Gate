import * as T from 'three';
import { createHarbourWorld } from '../recovery/HarbourWorld';
import { createLimiter, LIMITER_FEED } from '../phase4/limiter';
import { configureLaterArmour, createSurfaceContact, REGULATOR_WORLD_SCALE } from '../characters/LaterBaymax';
import { createRegulatorMount } from '../characters/RegulatorMount';

/**
 * Back at the harbour bay: the same district and the same Baymax pose as the landing and the
 * engineering board (on his apron, clear of the debris), plus the power regulator Hiro found in
 * Bay 6 (Phase 4's createLimiter), lifted off the apron and fitted below the chip bay,
 * where it stays for the rest of the story. Its gauge and lamp show the load.
 */
export async function createBay() {
  const { district, baymax: model, bay, armoured } = await createHarbourWorld();
  district.group.add(model);
  const ground = -1.02;
  const disposeArmourCores = armoured ? configureLaterArmour(armoured) : null;
  model.updateMatrixWorld(true);
  const contact = createSurfaceContact(armoured?.root ?? model);
  model.position.y += contact.correction(ground); model.updateMatrixWorld(true);
  district.group.traverse(object => {
    if (!('isPointLight' in object)) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (parent === bay.root) return;
    object.visible = false;
  });
  const body = new T.Box3().setFromObject(armoured?.root ?? model, true).getCenter(new T.Vector3());
  const arm = new T.Group(); arm.name = 'baymax-output-test-arm'; arm.position.set(1.02, 2.26, .02); model.add(arm); model.updateMatrixWorld(true);
  const armMeshes: T.Mesh[] = []; model.traverse(o => { if (o instanceof T.Mesh) armMeshes.push(o); });
  for (const mesh of armMeshes) {
    const p = mesh.position;
    const upper = Math.abs(p.x - 1.12) < .06 && Math.abs(p.y - 1.7) < .06;
    const fore = Math.abs(p.x - 1.23) < .06 && Math.abs(p.y - .82) < .06;
    const hand = Math.abs(p.x - 1.25) < .06 && Math.abs(p.y - .35) < .06;
    const finger = p.x > 1 && p.x < 1.5 && Math.abs(p.y - .29) < .03 && p.z > .7;
    if (upper || fore || hand || finger) arm.attach(mesh);
  }

  // His eyes and head: the only things that change when he comes back up.
  const eyes: T.MeshBasicMaterial[] = []; let head: T.Object3D | null = null;
  model.traverse(o => {
    if (o.name === 'dormant-head') head = o;
    if (o instanceof T.Mesh && o.name.startsWith('dormant-eye')) { const m = (o.material as T.MeshBasicMaterial).clone(); m.toneMapped = false; o.material = m; eyes.push(m); }
  });
  const headBase = head ? (head as T.Object3D).rotation.clone() : new T.Euler();
  // His body axis (hips → head) and the side facing the lane: the camera and the limiter work from there.
  const headWorld = armoured?.headWorld() ?? (head ? (head as T.Object3D).getWorldPosition(new T.Vector3()) : body.clone().add(new T.Vector3(0, 0, -1)));
  const axis = headWorld.clone().sub(body).setY(0).normalize();
  const side = new T.Vector3(-axis.z, 0, axis.x); if (side.x > 0) side.negate();
  const red = new T.PointLight('#ff2a1c', 0, 6, 1.8); red.position.copy(body).add(new T.Vector3(-.6, 1.2, .4)); district.group.add(red);

  // The same finish as Phase 6: worn paint rather than a glossy clear coat (this suit instance only).
  armoured?.root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshPhysicalMaterial && !m.transparent) {
      m.clearcoat = Math.min(m.clearcoat, .1); m.clearcoatRoughness = .55; m.roughness = Math.max(m.roughness, m.metalness > .7 ? .36 : .5);
    }
  });
  const limiter = createLimiter();
  limiter.scale.setScalar(REGULATOR_WORLD_SCALE);
  const staged = body.clone().addScaledVector(side, 2.6).addScaledVector(axis, -.4).setY(ground);
  limiter.position.copy(staged); limiter.rotation.y = .5; district.group.add(limiter);
  // The limiter's mount (tracker N-04): flat on his right chest plate, face out, long side
  // across his chest. Kept relative to the chest bone so it moves with him once fitted.
  const tmpP = new T.Vector3(), redEye = new T.Color('#ff2414'), tmpM = new T.Matrix4();
  const mountLocal = new T.Matrix4(), mountPos = new T.Vector3(), mountQ = new T.Quaternion(), mountS = new T.Vector3(), mountN = new T.Vector3();
  const stagedQ = new T.Quaternion().setFromEuler(new T.Euler(0, .5, 0));
  const spot = armoured?.chestFrame(0, -.45) ?? null;
  let regulatorMount: ReturnType<typeof createRegulatorMount> | null = null;
  if (spot) {
    const n = spot.n;
    const mw = new T.Matrix4().makeBasis(spot.z, spot.x, n)
      .setPosition(spot.point.clone().addScaledVector(n, .16)).scale(limiter.scale.clone());
    mountLocal.copy(spot.bone.matrixWorld).invert().multiply(mw);
    mw.decompose(limiter.position, limiter.quaternion, limiter.scale); limiter.updateWorldMatrix(true, true);
    regulatorMount = createRegulatorMount(limiter, armoured!.root); regulatorMount.setFitted(0);
    limiter.position.copy(staged); limiter.quaternion.copy(stagedQ);
  }
  // The feed: once the unit is home, its heavy black lead runs from the main gland into the rim of
  // his chest bay ("in line with his main feed"), drawn out along its length, then the plug seats.
  const feedMat = new T.MeshStandardMaterial({ color: '#15171a', roughness: .62, metalness: .15 });
  const plugMat = new T.MeshStandardMaterial({ color: '#c9762e', roughness: .45, metalness: .4 });
  let feed: { tube: T.Mesh; plug: T.Mesh; count: number } | null = null;
  const buildFeed = () => {
    if (!spot) return;
    const bone = spot.bone; bone.updateWorldMatrix(true, true); limiter.updateMatrixWorld(true);
    const n = new T.Vector3(0, 0, 1).transformDirection(limiter.matrixWorld), along = new T.Vector3(1, 0, 0).transformDirection(limiter.matrixWorld);
    const a = regulatorMount?.feedWorld() ?? limiter.localToWorld(LIMITER_FEED.clone()), c = bay.root.getWorldPosition(new T.Vector3());
    const rim = bay.root.getWorldScale(new T.Vector3()).x * .235;
    const to = a.clone().sub(c); to.addScaledVector(n, -to.dot(n)).normalize();
    const b = c.clone().addScaledVector(to, rim * .98).addScaledVector(n, .01);
    const lift = Math.max(.05, a.distanceTo(b) * .22);
    const pts = [a, a.clone().addScaledVector(along, .05).addScaledVector(n, lift * .5), a.clone().lerp(b, .5).addScaledVector(n, lift), b.clone().addScaledVector(n, lift * .4), b].map(q => bone.worldToLocal(q.clone()));
    const sc = bone.getWorldScale(new T.Vector3()).x;
    const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 32, .016 / sc, 8), feedMat);
    const plug = new T.Mesh(new T.CylinderGeometry(.026 / sc, .022 / sc, .05 / sc, 12), plugMat);
    plug.position.copy(pts[4]); plug.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), pts[4].clone().sub(pts[3]).normalize());
    bone.add(tube, plug);
    feed = { tube, plug, count: tube.geometry.index!.count };
  };
  let shake = 0, clunk = 0, contacted = false, seatHit = 0, seated = false; const baseY = model.position.y, baseRotZ = model.rotation.z;
  const hipsP5 = model.children.filter(c => c.name.startsWith('hip-')), hipBase = hipsP5.map(h => h.rotation.x);
  const headQ = new T.Quaternion(), headRestInv = new T.Quaternion().setFromEuler(headBase).invert(), legE = new T.Euler();
  const legQ = (h: T.Object3D | undefined) => h ? new T.Quaternion().setFromEuler(legE.set(h.rotation.x - 1.42, 0, h.rotation.z)) : undefined;
  const work = new T.SpotLight('#ffd1a0', 42, 12, .8, .7, 2);
  work.position.copy(body).addScaledVector(side, 2.5).addScaledVector(axis, -.7); work.position.y = body.y + 4;
  work.target.position.copy(body); district.group.add(work, work.target);
  const ss = (x: number, a: number, b: number) => T.MathUtils.smoothstep(x, a, b), pulse = (x: number, a: number, b: number) => Math.sin(Math.PI * T.MathUtils.clamp((x - a) / (b - a), 0, 1));
  return {
    district, model, bay, body, side, axis,
    /** fitted: 0 staged → 1 on his flank. power: 0 dormant → 1 running against the limit. */
    update(t: number, dt: number, s: { fitted: number; power: number; held: boolean }) {
      district.update(t, dt, false);
      // Unit-only fitting over 4.8 seconds: lift, align, seat at 2.7s, then connect at 4.1s.
      const f = s.fitted, ss2 = T.MathUtils.smootherstep;
      regulatorMount?.setFitted(ss2(f, .48, .57));
      const lift = ss2(f, 0, .18), carry = ss2(f, .12, .5), push = Math.pow(T.MathUtils.clamp((f - .5) / .07, 0, 1), 2);
      if (spot) tmpM.copy(spot.bone.matrixWorld).multiply(mountLocal).decompose(mountPos, mountQ, mountS);
      mountN.set(0, 0, 1).applyQuaternion(mountQ);
      tmpP.copy(mountPos).addScaledVector(mountN, .32).sub(staged).multiplyScalar(carry).add(staged);
      tmpP.y += lift * .45 * (1 - carry) + Math.sin(Math.PI * carry) * .3;
      limiter.position.copy(tmpP).lerp(mountPos, push);
      // Seated: a small rebound off the plate, then still.
      const settle = T.MathUtils.clamp((f - .57) / .1, 0, 1);
      limiter.position.addScaledVector(mountN, Math.sin(Math.PI * settle) * Math.exp(-settle * 3) * .012);
      limiter.quaternion.copy(stagedQ).slerp(mountQ, ss2(f, .28, .52));
      // Picked up by one end: it hangs tilted while it's carried and levels out over the plate.
      limiter.rotateZ(Math.sin(Math.PI * Math.min(1, lift * (1 - ss2(f, .35, .52)))) * .28 * (1 - push));
      limiter.cables.visible = f < .02;
      if (!seated && f >= .57) { seated = true; seatHit = 1; }
      if (f < .5) seated = false;
      // The feed: drawn out .7 → .86, the plug seats at .86.
      if (f >= .57 && !feed) buildFeed();
      if (feed) {
        const k = ss2(f, .68, .86);
        feed.tube.visible = f > .68; feed.tube.geometry.setDrawRange(0, Math.floor(feed.count * k / 3) * 3);
        feed.plug.visible = f >= .86;
      }
      // The lamp: dark, amber while it latches, green once the feed is in.
      limiter.led.color.set(s.power > .05 ? '#ffb15a' : f >= .86 ? '#7dffa6' : f >= .57 ? (Math.sin(t * 18) > 0 ? '#ffb15a' : '#2a3a33') : '#2a3a33');
      // The needle climbs with the load and stops short of the red: that's the limit holding.
      limiter.setGauge(s.fitted > .99 ? .1 + Math.min(s.power, 1) * .32 + Math.sin(t * 9) * .006 * s.power : .05);
      // Powered against the limit: eyes go red, the head turns toward Hiro, the body strains and settles.
      const p = s.power;
      eyes.forEach(m => m.color.set('#0b0f11').lerp(redEye, p).multiplyScalar(1 + p * .6));
      red.intensity = p * (1.6 + .5 * Math.sin(t * 2.3));
      // The power-up against the limit (tracker PW-05). Power arrives as a twitch; he rolls toward
      // Hiro, lifts his head, kicks and reaches; the reach hits the limiter's ceiling with a clunk and
      // shudders there. Held, he sags back and keeps testing it, always stopping at the same height.
      const LIMIT = .55;
      const twitch = pulse(p, .04, .12) * Math.sin(t * 40) * .06;
      const wantReach = ss(p, .12, .62), reach = Math.min(wantReach, LIMIT);
      const press = Math.max(0, wantReach - LIMIT) / (1 - LIMIT);
      if (!s.held && press > .02 && !contacted) { contacted = true; clunk = 1; }
      if (p < .05) contacted = false;
      clunk = Math.max(0, clunk - dt * 2.2);
      const test = s.held ? Math.pow(Math.max(0, Math.sin(t * 2.4)), 8) : 0;
      const holdSag = s.held ? .72 + .28 * test : 1;
      const tremble = (press * .9 + clunk + test * .7) * Math.sin(t * 38) * .03;
      arm.rotation.z = T.MathUtils.damp(arm.rotation.z, .78 * reach * holdSag + twitch + tremble - clunk * .06, 6, dt);
      arm.rotation.x = T.MathUtils.damp(arm.rotation.x, -.3 * reach * holdSag + tremble * .5, 6, dt);
      // Body: rolls up onto his side toward Hiro as he tries to rise, held down at the limit.
      const rise = Math.min(ss(p, .15, .55), .6) * holdSag;
      model.rotation.z = baseRotZ + .07 * rise + Math.sin(t * 31) * .006 * (press + clunk) + Math.sin(t * 11) * .01 * shake;
      // The unit going home is felt through him: a short knock down into the apron, then it fades.
      seatHit = Math.max(0, seatHit - dt * 4);
      model.position.y = baseY + .045 * rise + clunk * .02 + Math.sin(t * 17) * .005 * shake - Math.sin(Math.PI * seatHit) * .012;
      shake = T.MathUtils.damp(shake, s.held ? test : Math.min(1, press + clunk), 6, dt);
      // Head lifts off the apron toward Hiro, pushing forward at the limit.
      if (head) (head as T.Object3D).rotation.set(headBase.x - .24 * rise - .05 * press, headBase.y + .42 * ss(p, .1, .5), headBase.z * (1 - p) + tremble * .4);
      // One leg kicks as he first tries to get his feet under him.
      hipsP5.forEach((h, i) => { h.rotation.x = hipBase[i] + (i === 0 ? -.22 : -.1) * pulse(p, .25, .5) * (s.held ? 0 : 1); });
      // The limiter takes the load: it buzzes and its lamp flares on contact and each renewed push.
      if (s.fitted > .99) limiter.position.addScaledVector(mountN, Math.sin(t * 57) * .005 * (press + clunk + test));
      if (clunk > .5 || test > .6) limiter.led.color.set('#fff1c4');
      // The suit follows this rig: his reaching arm (+x pivot = the suit's left), the leg kick, the head.
      if (armoured) armoured.drive({
        armL: arm.quaternion,
        legL: legQ(hipsP5.find(h => h.name === 'hip-right')), legR: legQ(hipsP5.find(h => h.name === 'hip-left')),
        head: head ? headQ.setFromEuler((head as T.Object3D).rotation).multiply(headRestInv) : undefined,
      });
      model.updateMatrixWorld(true); model.position.y += contact.correction(ground); model.updateMatrixWorld(true);
      // Re-read the live chest mount after his response and ground correction, so the unit never lags.
      if (spot && f >= .57) {
        tmpM.copy(spot.bone.matrixWorld).multiply(mountLocal).decompose(mountPos, mountQ, mountS);
        limiter.position.copy(mountPos).addScaledVector(mountN, Math.sin(t * 57) * .005 * (press + clunk + test));
        limiter.quaternion.copy(mountQ);
      }
      // His bay stays shut here (tracker T-02): the limiter only goes on his chest plate.
      bay.update({ t, open: 0, seated: 1, red: .9, seamGlow: .15 + p * .35 });
    },
    dispose() {
      regulatorMount?.dispose(); limiter.dispose(); feedMat.dispose(); plugMat.dispose();
      if (feed) { feed.tube.geometry.dispose(); feed.plug.geometry.dispose(); }
      eyes.forEach(m => m.dispose()); disposeArmourCores?.(); bay.dispose(); district.dispose();
    },
  };
}
export type Bay = Awaited<ReturnType<typeof createBay>>;
