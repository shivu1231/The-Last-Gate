import * as THREE from 'three';
import { createHarbourWorld } from '../recovery/HarbourWorld';
import { createLimiter, LIMITER_FEED } from '../phase4/limiter';
import {
  configureLaterArmour,
  createSurfaceContact,
  REGULATOR_WORLD_SCALE,
} from '../characters/LaterBaymax';
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
  model.position.y += contact.correction(ground);
  model.updateMatrixWorld(true);
  district.group.traverse((object) => {
    if (!('isPointLight' in object)) return;
    for (let parent = object.parent; parent; parent = parent.parent)
      if (parent === bay.root) return;
    object.visible = false;
  });
  const body = new THREE.Box3()
    .setFromObject(armoured?.root ?? model, true)
    .getCenter(new THREE.Vector3());
  const arm = new THREE.Group();
  arm.name = 'baymax-output-test-arm';
  arm.position.set(1.02, 2.26, 0.02);
  model.add(arm);
  model.updateMatrixWorld(true);
  const armMeshes: THREE.Mesh[] = [];
  model.traverse((sceneObject) => {
    if (sceneObject instanceof THREE.Mesh) armMeshes.push(sceneObject);
  });
  for (const mesh of armMeshes) {
    const position = mesh.position;
    const upper =
      Math.abs(position.x - 1.12) < 0.06 && Math.abs(position.y - 1.7) < 0.06;
    const fore =
      Math.abs(position.x - 1.23) < 0.06 && Math.abs(position.y - 0.82) < 0.06;
    const hand =
      Math.abs(position.x - 1.25) < 0.06 && Math.abs(position.y - 0.35) < 0.06;
    const finger =
      position.x > 1 &&
      position.x < 1.5 &&
      Math.abs(position.y - 0.29) < 0.03 &&
      position.z > 0.7;
    if (upper || fore || hand || finger) arm.attach(mesh);
  }

  // His eyes and head: the only things that change when he comes back up.
  const eyes: THREE.MeshBasicMaterial[] = [];
  let head: THREE.Object3D | null = null;
  model.traverse((sceneObject) => {
    if (sceneObject.name === 'dormant-head') head = sceneObject;
    if (
      sceneObject instanceof THREE.Mesh &&
      sceneObject.name.startsWith('dormant-eye')
    ) {
      const material = (
        sceneObject.material as THREE.MeshBasicMaterial
      ).clone();
      material.toneMapped = false;
      sceneObject.material = material;
      eyes.push(material);
    }
  });
  const headBase = head
    ? (head as THREE.Object3D).rotation.clone()
    : new THREE.Euler();
  // His body axis (hips → head) and the side facing the lane: the camera and the limiter work from there.
  const headWorld =
    armoured?.headWorld() ??
    (head
      ? (head as THREE.Object3D).getWorldPosition(new THREE.Vector3())
      : body.clone().add(new THREE.Vector3(0, 0, -1)));
  const axis = headWorld.clone().sub(body).setY(0).normalize();
  const side = new THREE.Vector3(-axis.z, 0, axis.x);
  if (side.x > 0) side.negate();
  const red = new THREE.PointLight('#ff2a1c', 0, 6, 1.8);
  red.position.copy(body).add(new THREE.Vector3(-0.6, 1.2, 0.4));
  district.group.add(red);

  // The same finish as Phase 6: worn paint rather than a glossy clear coat (this suit instance only).
  armoured?.root.traverse((sceneObject) => {
    if (!(sceneObject instanceof THREE.Mesh)) return;
    for (const mesh2 of Array.isArray(sceneObject.material)
      ? sceneObject.material
      : [sceneObject.material])
      if (mesh2 instanceof THREE.MeshPhysicalMaterial && !mesh2.transparent) {
        mesh2.clearcoat = Math.min(mesh2.clearcoat, 0.1);
        mesh2.clearcoatRoughness = 0.55;
        mesh2.roughness = Math.max(
          mesh2.roughness,
          mesh2.metalness > 0.7 ? 0.36 : 0.5,
        );
      }
  });
  const limiter = createLimiter();
  limiter.scale.setScalar(REGULATOR_WORLD_SCALE);
  const staged = body
    .clone()
    .addScaledVector(side, 2.6)
    .addScaledVector(axis, -0.4)
    .setY(ground);
  limiter.position.copy(staged);
  limiter.rotation.y = 0.5;
  district.group.add(limiter);
  // The limiter's mount (tracker N-04): flat on his right chest plate, face out, long side
  // across his chest. Kept relative to the chest bone so it moves with him once fitted.
  const tmpP = new THREE.Vector3(),
    redEye = new THREE.Color('#ff2414'),
    tmpM = new THREE.Matrix4();
  const mountLocal = new THREE.Matrix4(),
    mountPos = new THREE.Vector3(),
    mountQ = new THREE.Quaternion(),
    mountS = new THREE.Vector3(),
    mountN = new THREE.Vector3();
  const stagedQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0.5, 0),
  );
  const spot = armoured?.chestFrame(0, -0.45) ?? null;
  let regulatorMount: ReturnType<typeof createRegulatorMount> | null = null;
  if (spot) {
    const normalVector = spot.n;
    const mw = new THREE.Matrix4()
      .makeBasis(spot.z, spot.x, normalVector)
      .setPosition(spot.point.clone().addScaledVector(normalVector, 0.16))
      .scale(limiter.scale.clone());
    mountLocal.copy(spot.bone.matrixWorld).invert().multiply(mw);
    mw.decompose(limiter.position, limiter.quaternion, limiter.scale);
    limiter.updateWorldMatrix(true, true);
    regulatorMount = createRegulatorMount(limiter, armoured!.root);
    regulatorMount.setFitted(0);
    limiter.position.copy(staged);
    limiter.quaternion.copy(stagedQ);
  }
  // The feed: once the unit is home, its heavy black lead runs from the main gland into the rim of
  // his chest bay ("in line with his main feed"), drawn out along its length, then the plug seats.
  const feedMat = new THREE.MeshStandardMaterial({
    color: '#15171a',
    roughness: 0.62,
    metalness: 0.15,
  });
  const plugMat = new THREE.MeshStandardMaterial({
    color: '#c9762e',
    roughness: 0.45,
    metalness: 0.4,
  });
  let feed: { tube: THREE.Mesh; plug: THREE.Mesh; count: number } | null = null;
  const buildFeed = () => {
    if (!spot) return;
    const bone = spot.bone;
    bone.updateWorldMatrix(true, true);
    limiter.updateMatrixWorld(true);
    const normalVector2 = new THREE.Vector3(0, 0, 1).transformDirection(
        limiter.matrixWorld,
      ),
      along = new THREE.Vector3(1, 0, 0).transformDirection(
        limiter.matrixWorld,
      );
    const startPoint =
        regulatorMount?.feedWorld() ??
        limiter.localToWorld(LIMITER_FEED.clone()),
      vector = bay.root.getWorldPosition(new THREE.Vector3());
    const rim = bay.root.getWorldScale(new THREE.Vector3()).x * 0.235;
    const to = startPoint.clone().sub(vector);
    to.addScaledVector(normalVector2, -to.dot(normalVector2)).normalize();
    const endPoint = vector
      .clone()
      .addScaledVector(to, rim * 0.98)
      .addScaledVector(normalVector2, 0.01);
    const lift = Math.max(0.05, startPoint.distanceTo(endPoint) * 0.22);
    const points = [
      startPoint,
      startPoint
        .clone()
        .addScaledVector(along, 0.05)
        .addScaledVector(normalVector2, lift * 0.5),
      startPoint
        .clone()
        .lerp(endPoint, 0.5)
        .addScaledVector(normalVector2, lift),
      endPoint.clone().addScaledVector(normalVector2, lift * 0.4),
      endPoint,
    ].map((vector2) => bone.worldToLocal(vector2.clone()));
    const sc = bone.getWorldScale(new THREE.Vector3()).x;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        32,
        0.016 / sc,
        8,
      ),
      feedMat,
    );
    const plug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026 / sc, 0.022 / sc, 0.05 / sc, 12),
      plugMat,
    );
    plug.position.copy(points[4]);
    plug.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      points[4].clone().sub(points[3]).normalize(),
    );
    bone.add(tube, plug);
    feed = { tube, plug, count: tube.geometry.index!.count };
  };
  let shake = 0,
    clunk = 0,
    contacted = false,
    seatHit = 0,
    seated = false;
  const baseY = model.position.y,
    baseRotZ = model.rotation.z;
  const hipsP5 = model.children.filter((sceneObject) =>
      sceneObject.name.startsWith('hip-'),
    ),
    hipBase = hipsP5.map((sceneObject) => sceneObject.rotation.x);
  const headQ = new THREE.Quaternion(),
    headRestInv = new THREE.Quaternion().setFromEuler(headBase).invert(),
    legE = new THREE.Euler();
  const legQ = (sceneObject: THREE.Object3D | undefined) =>
    sceneObject
      ? new THREE.Quaternion().setFromEuler(
          legE.set(sceneObject.rotation.x - 1.42, 0, sceneObject.rotation.z),
        )
      : undefined;
  const work = new THREE.SpotLight('#ffd1a0', 42, 12, 0.8, 0.7, 2);
  work.position
    .copy(body)
    .addScaledVector(side, 2.5)
    .addScaledVector(axis, -0.7);
  work.position.y = body.y + 4;
  work.target.position.copy(body);
  district.group.add(work, work.target);
  const ss = (xPosition: number, startValue: number, endValue: number) =>
      THREE.MathUtils.smoothstep(xPosition, startValue, endValue),
    pulse = (xPosition: number, startValue: number, endValue: number) =>
      Math.sin(
        Math.PI *
          THREE.MathUtils.clamp(
            (xPosition - startValue) / (endValue - startValue),
            0,
            1,
          ),
      );
  return {
    district,
    model,
    bay,
    body,
    side,
    axis,
    /** fitted: 0 staged → 1 on his flank. power: 0 dormant → 1 running against the limit. */
    update(
      timeSeconds: number,
      deltaSeconds: number,
      scaleFactor: { fitted: number; power: number; held: boolean },
    ) {
      district.update(timeSeconds, deltaSeconds, false);
      // Unit-only fitting over 4.8 seconds: lift, align, seat at 2.7s, then connect at 4.1s.
      const factor = scaleFactor.fitted,
        ss2 = THREE.MathUtils.smootherstep;
      regulatorMount?.setFitted(ss2(factor, 0.48, 0.57));
      const lift = ss2(factor, 0, 0.18),
        carry = ss2(factor, 0.12, 0.5),
        push = Math.pow(THREE.MathUtils.clamp((factor - 0.5) / 0.07, 0, 1), 2);
      if (spot)
        tmpM
          .copy(spot.bone.matrixWorld)
          .multiply(mountLocal)
          .decompose(mountPos, mountQ, mountS);
      mountN.set(0, 0, 1).applyQuaternion(mountQ);
      tmpP
        .copy(mountPos)
        .addScaledVector(mountN, 0.32)
        .sub(staged)
        .multiplyScalar(carry)
        .add(staged);
      tmpP.y += lift * 0.45 * (1 - carry) + Math.sin(Math.PI * carry) * 0.3;
      limiter.position.copy(tmpP).lerp(mountPos, push);
      // Seated: a small rebound off the plate, then still.
      const settle = THREE.MathUtils.clamp((factor - 0.57) / 0.1, 0, 1);
      limiter.position.addScaledVector(
        mountN,
        Math.sin(Math.PI * settle) * Math.exp(-settle * 3) * 0.012,
      );
      limiter.quaternion.copy(stagedQ).slerp(mountQ, ss2(factor, 0.28, 0.52));
      // Picked up by one end: it hangs tilted while it's carried and levels out over the plate.
      limiter.rotateZ(
        Math.sin(Math.PI * Math.min(1, lift * (1 - ss2(factor, 0.35, 0.52)))) *
          0.28 *
          (1 - push),
      );
      limiter.cables.visible = factor < 0.02;
      if (!seated && factor >= 0.57) {
        seated = true;
        seatHit = 1;
      }
      if (factor < 0.5) seated = false;
      // The feed: drawn out .7 → .86, the plug seats at .86.
      if (factor >= 0.57 && !feed) buildFeed();
      if (feed) {
        const blendFactor = ss2(factor, 0.68, 0.86);
        feed.tube.visible = factor > 0.68;
        feed.tube.geometry.setDrawRange(
          0,
          Math.floor((feed.count * blendFactor) / 3) * 3,
        );
        feed.plug.visible = factor >= 0.86;
      }
      // The lamp: dark, amber while it latches, green once the feed is in.
      limiter.led.color.set(
        scaleFactor.power > 0.05
          ? '#ffb15a'
          : factor >= 0.86
            ? '#7dffa6'
            : factor >= 0.57
              ? Math.sin(timeSeconds * 18) > 0
                ? '#ffb15a'
                : '#2a3a33'
              : '#2a3a33',
      );
      // The needle climbs with the load and stops short of the red: that's the limit holding.
      limiter.setGauge(
        scaleFactor.fitted > 0.99
          ? 0.1 +
              Math.min(scaleFactor.power, 1) * 0.32 +
              Math.sin(timeSeconds * 9) * 0.006 * scaleFactor.power
          : 0.05,
      );
      // Powered against the limit: eyes go red, the head turns toward Hiro, the body strains and settles.
      const progress = scaleFactor.power;
      eyes.forEach((material) =>
        material.color
          .set('#0b0f11')
          .lerp(redEye, progress)
          .multiplyScalar(1 + progress * 0.6),
      );
      red.intensity = progress * (1.6 + 0.5 * Math.sin(timeSeconds * 2.3));
      // The power-up against the limit (tracker PW-05). Power arrives as a twitch; he rolls toward
      // Hiro, lifts his head, kicks and reaches; the reach hits the limiter's ceiling with a clunk and
      // shudders there. Held, he sags back and keeps testing it, always stopping at the same height.
      const LIMIT = 0.55;
      const twitch =
        pulse(progress, 0.04, 0.12) * Math.sin(timeSeconds * 40) * 0.06;
      const wantReach = ss(progress, 0.12, 0.62),
        reach = Math.min(wantReach, LIMIT);
      const press = Math.max(0, wantReach - LIMIT) / (1 - LIMIT);
      if (!scaleFactor.held && press > 0.02 && !contacted) {
        contacted = true;
        clunk = 1;
      }
      if (progress < 0.05) contacted = false;
      clunk = Math.max(0, clunk - deltaSeconds * 2.2);
      const test = scaleFactor.held
        ? Math.pow(Math.max(0, Math.sin(timeSeconds * 2.4)), 8)
        : 0;
      const holdSag = scaleFactor.held ? 0.72 + 0.28 * test : 1;
      const tremble =
        (press * 0.9 + clunk + test * 0.7) * Math.sin(timeSeconds * 38) * 0.03;
      arm.rotation.z = THREE.MathUtils.damp(
        arm.rotation.z,
        0.78 * reach * holdSag + twitch + tremble - clunk * 0.06,
        6,
        deltaSeconds,
      );
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        -0.3 * reach * holdSag + tremble * 0.5,
        6,
        deltaSeconds,
      );
      // Body: rolls up onto his side toward Hiro as he tries to rise, held down at the limit.
      const rise = Math.min(ss(progress, 0.15, 0.55), 0.6) * holdSag;
      model.rotation.z =
        baseRotZ +
        0.07 * rise +
        Math.sin(timeSeconds * 31) * 0.006 * (press + clunk) +
        Math.sin(timeSeconds * 11) * 0.01 * shake;
      // The unit going home is felt through him: a short knock down into the apron, then it fades.
      seatHit = Math.max(0, seatHit - deltaSeconds * 4);
      model.position.y =
        baseY +
        0.045 * rise +
        clunk * 0.02 +
        Math.sin(timeSeconds * 17) * 0.005 * shake -
        Math.sin(Math.PI * seatHit) * 0.012;
      shake = THREE.MathUtils.damp(
        shake,
        scaleFactor.held ? test : Math.min(1, press + clunk),
        6,
        deltaSeconds,
      );
      // Head lifts off the apron toward Hiro, pushing forward at the limit.
      if (head)
        (head as THREE.Object3D).rotation.set(
          headBase.x - 0.24 * rise - 0.05 * press,
          headBase.y + 0.42 * ss(progress, 0.1, 0.5),
          headBase.z * (1 - progress) + tremble * 0.4,
        );
      // One leg kicks as he first tries to get his feet under him.
      hipsP5.forEach((sceneObject, index) => {
        sceneObject.rotation.x =
          hipBase[index] +
          (index === 0 ? -0.22 : -0.1) *
            pulse(progress, 0.25, 0.5) *
            (scaleFactor.held ? 0 : 1);
      });
      // The limiter takes the load: it buzzes and its lamp flares on contact and each renewed push.
      if (scaleFactor.fitted > 0.99)
        limiter.position.addScaledVector(
          mountN,
          Math.sin(timeSeconds * 57) * 0.005 * (press + clunk + test),
        );
      if (clunk > 0.5 || test > 0.6) limiter.led.color.set('#fff1c4');
      // The suit follows this rig: his reaching arm (+x pivot = the suit's left), the leg kick, the head.
      if (armoured)
        armoured.drive({
          armL: arm.quaternion,
          legL: legQ(
            hipsP5.find((sceneObject) => sceneObject.name === 'hip-right'),
          ),
          legR: legQ(
            hipsP5.find((sceneObject) => sceneObject.name === 'hip-left'),
          ),
          head: head
            ? headQ
                .setFromEuler((head as THREE.Object3D).rotation)
                .multiply(headRestInv)
            : undefined,
        });
      model.updateMatrixWorld(true);
      model.position.y += contact.correction(ground);
      model.updateMatrixWorld(true);
      // Re-read the live chest mount after his response and ground correction, so the unit never lags.
      if (spot && factor >= 0.57) {
        tmpM
          .copy(spot.bone.matrixWorld)
          .multiply(mountLocal)
          .decompose(mountPos, mountQ, mountS);
        limiter.position
          .copy(mountPos)
          .addScaledVector(
            mountN,
            Math.sin(timeSeconds * 57) * 0.005 * (press + clunk + test),
          );
        limiter.quaternion.copy(mountQ);
      }
      // His bay stays shut here (tracker T-02): the limiter only goes on his chest plate.
      bay.update({
        t: timeSeconds,
        open: 0,
        seated: 1,
        red: 0.9,
        seamGlow: 0.15 + progress * 0.35,
      });
    },
    dispose() {
      regulatorMount?.dispose();
      limiter.dispose();
      feedMat.dispose();
      plugMat.dispose();
      if (feed) {
        feed.tube.geometry.dispose();
        feed.plug.geometry.dispose();
      }
      eyes.forEach((material) => material.dispose());
      disposeArmourCores?.();
      bay.dispose();
      district.dispose();
    },
  };
}
/**
 * Data contract used by regulator fitting and telemetry.
 */
export type Bay = Awaited<ReturnType<typeof createBay>>;
