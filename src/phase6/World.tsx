import { takePreparedHome, takePreparedStreet, takePreparedRelay } from './preparedEnvironments';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { reducedMotion } from '../config/experience';
import { createBaymax, BAYMAX_SCALE as BS, type Baymax } from './baymax';
import { createHiro } from './hiro';
import {
  createFirstPersonHands,
  createLimiterController,
  type FirstPersonHands,
} from '../characters/RegulatorController';
import { FirstPerson } from './fp';
import { createRelay, BAYMAX_YARD, BAYMAX_REACH_Z } from './relay';
import { RECORDER } from './relay';
import {
  createStreet,
  createCartridge,
  ringLive,
  rampY,
  ROUTE,
  ROUTE_LENGTH,
  FRAME,
  DECK,
  LANDING,
  PEDESTAL,
  LADDER_X,
  WALK_Y,
  type Street,
} from './street';
import {
  createHome,
  directHome,
  HOME_GATE,
  HOME_BAYMAX,
  CARE_CHIP_AT,
  FETCH_PICK,
  FETCH_END,
  type Home,
} from './home';
import {
  useP6,
  go,
  now,
  setOf,
  isInsert,
  atLeast,
  type Stage,
  type WorldSetName,
} from './store';
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

export type Hints = {
  grab: RefObject<HTMLDivElement | null>;
  drop: RefObject<HTMLDivElement | null>;
};
/** Effects the World drives directly on the page: the crossing warp and the near-miss flash. */
export type Fx = {
  warp: RefObject<SVGFEDisplacementMapElement | null>;
  world: RefObject<HTMLDivElement | null>;
  hurt: RefObject<HTMLDivElement | null>;
  crossingCover: RefObject<HTMLDivElement | null>;
};
/** Live numbers shared with the page: the run's input, and what the readouts show. */
export type RunState = {
  p: number;
  speed: number;
  forward: boolean;
  pointer: THREE.Vector2;
  impulse: number;
  /** Metres between Baymax and Hiro, how close that feels (0…1), and both on the plan (x, z). */
  gap: number;
  dread: number;
  hiro: [number, number];
  bay: [number, number];
  /** Times a swing came close or debris came down, for the readout. */
  misses: number;
};

const ease = (xPosition: number) => THREE.MathUtils.smoothstep(xPosition, 0, 1);
const span = (easedProgress: number, startValue: number, endValue: number) =>
  ease((easedProgress - startValue) / (endValue - startValue));
const clamp01 = (xPosition: number) => Math.min(1, Math.max(0, xPosition));
const backOut = (xPosition: number) => {
  xPosition = clamp01(xPosition);
  const context = 2.2;
  return (
    1 +
    (context + 1) * Math.pow(xPosition - 1, 3) +
    context * Math.pow(xPosition - 1, 2)
  );
};
const RED = new THREE.Color('#ff2414'),
  DARK = new THREE.Color('#0b0f11'),
  CARE = new THREE.Color('#f4f8ff');
const tertiaryVector = (
  xPosition: number,
  yPosition: number,
  zPosition: number,
) => new THREE.Vector3(xPosition, yPosition, zPosition);
/** Hovering at the deck: root height that puts his eyes level with Hiro's on it. */
const HOVER_Y = 1.45;
/** The wake's last step brings him this far in from where he lands, and the limited walk carries on from there. */
const WAKE_STEP = 0.5;
/** He hovers this far back from where he falls; the lurch and the slide carry him onto LANDING. */
const HOVER_BACK = 1.2;
const CHASE_SKY = new THREE.Color('#05090e'),
  CITY_SKY = new THREE.Color('#0a1622');

/** Where Hiro stands for each piece of the gate site. */
const GATE_SPOT = tertiaryVector(-0.6, 0, -83.8);
const DECK_SPOT = tertiaryVector(DECK.x + 0.7, DECK.y, DECK.z + 0.45);
const READER_SPOT = tertiaryVector(PEDESTAL.x - 0.1, 0, PEDESTAL.z + 1.02);
// Same eye position as telemetry's final rail, outside the roof and east of the receiver.
const RELAY_SPOT = tertiaryVector(5, 0, -8.8);
/** The wake's dive: high behind the relay, down west of the receiver tower, then low under the dish into the yard. */
const WAKE_PATH = new THREE.CubicBezierCurve3(
  tertiaryVector(BAYMAX_YARD.x - 9, 17, BAYMAX_YARD.z - 26),
  tertiaryVector(BAYMAX_YARD.x - 8.1, 12, BAYMAX_YARD.z - 6.5),
  tertiaryVector(BAYMAX_YARD.x - 5.1, 1.6, BAYMAX_YARD.z - 0.1),
  BAYMAX_YARD.clone(),
);
/** Lying on his back (yaw π) his feet are 1.81 m toward the gate from his root, his head 2.76 m back (at full shell size). */
const FEET = 1.81 * BS,
  LIE_CENTRE = 0.47 * BS,
  LIE_LENGTH = 4.57 * BS;
/** Hauling: how far ahead of his feet Hiro walks, and the root position at which Hiro's eye crosses the surface. */
const LEAD = 0.95 * BS,
  CROSS_ROOT_Z = FRAME.z + FEET + LEAD;
/** Home: seconds of first person after the crossing (Baymax comes through, the gate closes) before the wide shot. */
export const EMERGE = 5.2;
/** Carry: up on Baymax, Hiro looks back at the gate beating with the chip, then the chip can come out. */
export const CLUE_AT = 4.3,
  CLUE_END = 6;
const HOME_CROSS_ROOT_Z = CROSS_ROOT_Z - FRAME.z + HOME_GATE.z;
/** The home gate sits a little off the ground; things come out at walkway height and settle. */
const homeFloor = (zPosition: number) =>
  zPosition > HOME_GATE.z
    ? WALK_Y
    : Math.max(0, WALK_Y - (HOME_GATE.z - zPosition) * 0.7);

/** A point along a polyline by arc length, 0…1. */
function along(
  points: THREE.Vector3[],
  blendFactor: number,
  out = new THREE.Vector3(),
) {
  const lens = points
      .slice(1)
      .map((point, index) => point.distanceTo(points[index])),
    total = lens.reduce(
      (firstValue, secondValue) => firstValue + secondValue,
      0,
    );
  let depth = clamp01(blendFactor) * total;
  for (let index2 = 0; index2 < lens.length; index2++) {
    if (depth <= lens[index2] || index2 === lens.length - 1)
      return out
        .copy(points[index2])
        .lerp(
          points[index2 + 1],
          lens[index2] ? Math.min(1, depth / lens[index2]) : 1,
        );
    depth -= lens[index2];
  }
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
type HandRig = {
  root: THREE.Group;
  palm: THREE.Group;
  fingers: THREE.Group[][];
  thumb: THREE.Group[];
};
/**
 * Build ankle grip for the final pursuit and restoration.
 */
function createAnkleGrip(hands: FirstPersonHands) {
  const group = (
    hands as unknown as {
      debug: {
        left: HandRig;
        right: HandRig;
        leftMount: THREE.Group;
        rightMount: THREE.Group;
      };
    }
  ).debug;
  const grips = (
    [
      [group.right, group.rightMount, 'L', 'R', 1],
      [group.left, group.leftMount, 'R', 'L', -1],
    ] as const
  ).map(([hand, mount, leg, other, out]) => {
    const [sleeve, cuff] = hand.root.children;
    return {
      hand,
      mount,
      leg,
      other,
      out,
      sleeve,
      cuff,
      rest: {
        len: sleeve.scale.y,
        z: sleeve.position.z,
        palm: hand.palm.quaternion.clone(),
        girth: sleeve.scale.x,
        cuff: cuff.scale.x,
      },
      at: new THREE.Vector3(),
      found: false,
    };
  });
  const ankle = new THREE.Vector3(),
    knee = new THREE.Vector3(),
    other = new THREE.Vector3(),
    up = new THREE.Vector3(),
    shin = new THREE.Vector3(),
    inward = new THREE.Vector3(),
    point = new THREE.Vector3(),
    shoulder = new THREE.Vector3(),
    fwd = new THREE.Vector3(),
    side = new THREE.Vector3(),
    wrist = new THREE.Vector3(),
    vector = new THREE.Vector3(),
    vector2 = new THREE.Vector3(),
    vector3 = new THREE.Vector3(),
    vector4 = new THREE.Vector3(),
    transformMatrix = new THREE.Matrix4(),
    transformMatrix2 = new THREE.Matrix4(),
    rel = new THREE.Matrix4(),
    transformMatrix3 = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    rotationQuaternion = new THREE.Quaternion(),
    qr = new THREE.Quaternion(),
    scl = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    DOWN = new THREE.Vector3(0, -1, 0),
    WORLD_UP = new THREE.Vector3(0, 1, 0);
  // The hand pitched a little knuckles-up off the collar, so its back faces up and toward Hiro.
  const PITCH = 0.22,
    HOOK = [1.02, 1.06, 1.1, 1.14];
  let on = false;
  return (
    baymax: Baymax,
    camera: THREE.Camera,
    blendFactor: number,
    feet: THREE.Vector3,
    eye: number,
  ) => {
    if (blendFactor <= 0) {
      if (on) {
        on = false;
        hands.controller.root.visible = true;
        for (const vector5 of grips) {
          vector5.sleeve.scale.set(
            vector5.rest.girth,
            vector5.rest.len,
            vector5.rest.girth,
          );
          vector5.sleeve.position.z = vector5.rest.z;
          vector5.cuff.scale.set(
            vector5.rest.cuff,
            vector5.cuff.scale.y,
            vector5.rest.cuff,
          );
          vector5.hand.palm.quaternion.copy(vector5.rest.palm);
          vector5.found = false;
        }
      }
      return;
    }
    on = true;
    hands.controller.root.visible = false;
    camera.updateMatrixWorld(true);
    baymax.root.updateMatrixWorld(true);
    up.copy(WORLD_UP).applyQuaternion(
      baymax.root.getWorldQuaternion(rotationQuaternion),
    );
    fwd.subVectors(baymax.root.position, feet).setY(0).normalize();
    side.crossVectors(fwd, WORLD_UP);
    transformMatrix3.copy(hands.root.matrixWorld).invert();
    for (const vector6 of grips) {
      const boot = baymax.boot(vector6.leg);
      baymax.ankleWorld(vector6.leg, ankle);
      baymax.kneeWorld(vector6.leg, knee);
      shin.subVectors(ankle, knee).normalize();
      if (!vector6.found) {
        // Find the spot once: a ray down onto the top of the collar, a little in from its middle.
        baymax.ankleWorld(vector6.other, other);
        inward.subVectors(other, ankle);
        inward
          .addScaledVector(shin, -inward.dot(shin))
          .addScaledVector(up, -inward.dot(up))
          .normalize();
        point
          .copy(ankle)
          .addScaledVector(shin, 0.02)
          .addScaledVector(inward, 0.09);
        ray.set(point.clone().addScaledVector(WORLD_UP, 1), DOWN);
        const hit = ray.intersectObjects(boot.meshes, false)[0];
        if (hit) point.copy(hit.point);
        else point.addScaledVector(up, 0.23);
        boot.bone.updateWorldMatrix(true, false);
        vector6.at
          .copy(point)
          .applyMatrix4(transformMatrix2.copy(boot.bone.matrixWorld).invert());
        vector6.found = true;
      }
      point.copy(vector6.at).applyMatrix4(boot.bone.matrixWorld);
      // Shoulders low and wide of the eye, as a first-person arm is carried, so the forearm comes up
      // from the bottom corner and never hides the hand.
      shoulder
        .copy(feet)
        .addScaledVector(WORLD_UP, eye - 0.52)
        .addScaledVector(side, vector6.out * 0.26)
        .addScaledVector(fwd, -0.02);
      // The hand: fingers on along his shin away from Hiro, knuckles just above the crease's edge.
      vector
        .copy(shin)
        .multiplyScalar(-Math.cos(PITCH))
        .addScaledVector(up, Math.sin(PITCH));
      vector3
        .copy(up)
        .multiplyScalar(Math.cos(PITCH))
        .addScaledVector(shin, Math.sin(PITCH));
      vector4.copy(vector).negate();
      vector2.crossVectors(vector3, vector4);
      transformMatrix2.makeBasis(vector2, vector3, vector4);
      wrist
        .copy(point)
        .addScaledVector(up, 0.036)
        .addScaledVector(vector, -0.075);
      // The wrist into a forearm that runs straight back to the shoulder.
      vector4.subVectors(shoulder, wrist).normalize();
      vector2.crossVectors(vector3, vector4).normalize();
      vector3.crossVectors(vector4, vector2);
      transformMatrix.makeBasis(vector2, vector3, vector4).setPosition(wrist);
      vector6.hand.palm.quaternion.slerpQuaternions(
        vector6.rest.palm,
        qr
          .setFromRotationMatrix(transformMatrix)
          .invert()
          .multiply(rotationQuaternion.setFromRotationMatrix(transformMatrix2)),
        blendFactor,
      );
      // The hand hangs in its mount through a fixed offset (the left one through the remote's grip): solve the mount.
      rel.identity();
      for (
        let sceneObject: THREE.Object3D = vector6.hand.root;
        sceneObject !== vector6.mount;
        sceneObject = sceneObject.parent!
      ) {
        sceneObject.updateMatrix();
        rel.premultiply(sceneObject.matrix);
      }
      transformMatrix
        .multiply(rel.invert())
        .premultiply(transformMatrix3)
        .decompose(position, rotationQuaternion, scl);
      vector6.mount.position.lerp(position, blendFactor);
      vector6.mount.quaternion.slerp(rotationQuaternion, blendFactor);
      vector6.mount.visible = true;
      // Fingers curled down over the edge into the crease, the thumb tucked down along its side.
      vector6.hand.fingers.forEach((group2, index) => {
        const componentValue = HOOK[index];
        group2[0].rotation.x = THREE.MathUtils.lerp(
          group2[0].rotation.x,
          -componentValue * 0.95,
          blendFactor,
        );
        group2[1].rotation.x = THREE.MathUtils.lerp(
          group2[1].rotation.x,
          -componentValue * 1.05,
          blendFactor,
        );
        group2[2].rotation.x = THREE.MathUtils.lerp(
          group2[2].rotation.x,
          -componentValue * 0.7,
          blendFactor,
        );
      });
      const [t0, t1, t2] = vector6.hand.thumb;
      t0.rotation.x = THREE.MathUtils.lerp(t0.rotation.x, -0.75, blendFactor);
      t0.rotation.y = THREE.MathUtils.lerp(t0.rotation.y, 0, blendFactor);
      t1.rotation.x = THREE.MathUtils.lerp(t1.rotation.x, -0.45, blendFactor);
      t2.rotation.x = THREE.MathUtils.lerp(t2.rotation.x, -0.35, blendFactor);
      // The sleeve reaches back to his shoulder (out of frame under the camera), snug at the wrist.
      const len = THREE.MathUtils.lerp(
          vector6.rest.len,
          (wrist.distanceTo(shoulder) - 0.04) / 0.32,
          blendFactor,
        ),
        girth = THREE.MathUtils.lerp(vector6.rest.girth, 0.8, blendFactor);
      vector6.sleeve.scale.set(girth, len, girth);
      vector6.sleeve.position.z = 0.04 + 0.16 * len;
      vector6.cuff.scale.set(girth * 1.05, vector6.cuff.scale.y, girth * 1.05);
    }
  };
}

/**
 * Mount this chapter's world and advance its authored rendering and interaction state.
 */
export function World({
  audio,
  hints,
  fx,
  run,
  onReady,
  onError,
}: {
  audio: PhaseSixAudio;
  hints: Hints;
  fx: Fx;
  run: RefObject<RunState>;
  onReady: () => void;
  onError: () => void;
}) {
  const { scene, camera, gl, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const stage = useP6((state) => state.stage);
  const set: WorldSetName = setOf(stage);
  const [baymax, setBaymax] = useState<Baymax | null>(null);
  const [compiled, setCompiled] = useState(false);
  const hiro = useMemo(createHiro, []);
  const hands = useMemo(
    () => createFirstPersonHands(createLimiterController()),
    [],
  );
  const fp = useMemo(() => new FirstPerson(), []);
  const haul = useMemo(() => createAnkleGrip(hands), [hands]);
  const cart = useMemo(createCartridge, []);
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as Window & { __lastGateWorld?: unknown }).__lastGateWorld = {
        baymax,
        hiro,
        hands,
        fp,
        camera,
        T: THREE,
        gl,
        scene,
      };
  }, [baymax, hiro, hands, fp, camera, gl, scene]);
  const home = useMemo<Home>(takePreparedHome, []);
  const env = useRef<{
    name: WorldSetName;
    relay?: ReturnType<typeof createRelay>;
    street?: Street;
  } | null>(null);
  const homeScene = useMemo(() => {
    const state = new THREE.Scene();
    state.background = home.background;
    state.fog = home.fog;
    return state;
  }, [home]);
  const target = useMemo(
    () =>
      new THREE.WebGLRenderTarget(4, 4, { colorSpace: THREE.SRGBColorSpace }),
    [],
  );
  const homeCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  // His eyes light what he looks at: a red spot from the head, and a soft glow on the head itself.
  const eyeLight = useMemo(() => {
    const light = new THREE.SpotLight('#ff2a18', 0, 34, 0.42, 0.55, 1.4);
    light.target.position.set(0, 0, 1);
    return light;
  }, []);
  const eyeGlow = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const drawingContext = canvas.getContext('2d')!;
    const group = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    group.addColorStop(0, 'rgba(255,60,40,1)');
    group.addColorStop(0.35, 'rgba(255,30,20,.35)');
    group.addColorStop(1, 'rgba(255,0,0,0)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(0, 0, 64, 64);
    const sceneObject = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        color: '#ff3a24',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    sceneObject.scale.setScalar(1.6 * BS);
    sceneObject.renderOrder = 6;
    return sceneObject;
  }, []);
  // Ground contact for Baymax on sets without a shadow map: a soft dark footprint on the floor under
  // his live bounds that thins as he rises, so landings, the drop and the lying pose all sit down.
  const contact = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const drawingContext = canvas.getContext('2d')!;
    const gradient = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,.72)');
    gradient.addColorStop(0.8, 'rgba(0,0,0,.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    drawingContext.fillStyle = gradient;
    drawingContext.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map,
        color: '#05080b',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    mesh.visible = false;
    return mesh;
  }, []);
  const contactBounds = useMemo(() => new THREE.Box3(), []),
    contactCenter = useMemo(() => new THREE.Vector3(), []),
    contactSize = useMemo(() => new THREE.Vector3(), []);
  // The reader's lock, made visible: a thin red trace from the gate's hub to whatever it has locked onto
  // (his combat chip). It reaches out when the gate powers, and beats with the chip while his bay is open.
  const lockBeam = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
    geometry.translate(0, 0.5, 0);
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: '#ff3a2c',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const material2 = new THREE.Mesh(geometry, material);
    material2.frustumCulled = false;
    material2.visible = false;
    material2.renderOrder = 4;
    return material2;
  }, []);
  // Coming through the far side: only the part of him already through is drawn.
  const crossing = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4),
    [],
  );

  // Tracker R-05: before the cover lifts, start compiling the prebuilt street's programs (with everything
  // in it shown, his suit fully on, the street's lights counted). compileAsync links them in the background
  // while the relay plays, so nothing is built or linked as the chase starts.
  const warmStreet = async (him: THREE.Object3D) => {
    const st = preStreet.current,
      relayRoot = env.current?.relay?.root;
    if (!st || !relayRoot) return;
    relayRoot.visible = false;
    scene.add(st.root);
    homeScene.add(home.root);
    // Everything hidden for now (debris, dust, sparks) is counted for the compile too.
    const hidden: THREE.Object3D[] = [];
    for (const sc of [
      st.root,
      homeScene,
      ...scene.children.filter(
        (sceneObject) => sceneObject !== relayRoot && sceneObject !== st.root,
      ),
    ])
      sc.traverse((sceneObject) => {
        if (!sceneObject.visible) {
          sceneObject.visible = true;
          hidden.push(sceneObject);
        }
      });
    const texture = gl.getRenderTarget(),
      scissor = gl.getScissorTest(),
      oldScissor = gl.getScissor(new THREE.Vector4());
    const others: THREE.Object3D[] = [],
      culled: THREE.Object3D[] = [];
    try {
      gl.setRenderTarget(null);
      await gl.compileAsync(scene, camera);
      gl.setRenderTarget(target);
      await gl.compileAsync(homeScene, homeCam);
      gl.render(homeScene, homeCam);
      // His materials clip at the gate, which compileAsync can't key: draw him alone, one pixel, for real.
      scene.traverse((sceneObject) => {
        if ((sceneObject as THREE.Mesh).isMesh && sceneObject.visible) {
          let mine = false;
          for (
            let sceneObject2: THREE.Object3D | null = sceneObject;
            sceneObject2;
            sceneObject2 = sceneObject2.parent
          )
            if (sceneObject2 === him) {
              mine = true;
              break;
            }
          if (!mine) {
            sceneObject.visible = false;
            others.push(sceneObject);
          } else if (sceneObject.frustumCulled) {
            sceneObject.frustumCulled = false;
            culled.push(sceneObject);
          }
        }
      });
      gl.setRenderTarget(null);
      gl.setScissorTest(true);
      gl.setScissor(0, 0, 1, 1);
      gl.render(scene, camera);
      gl.setScissorTest(scissor);
    } finally {
      others.forEach((sceneObject) => {
        sceneObject.visible = true;
      });
      culled.forEach((sceneObject) => {
        sceneObject.frustumCulled = true;
      });
      gl.setScissor(oldScissor);
      gl.setScissorTest(scissor);
      gl.setRenderTarget(texture);
      hidden.forEach((sceneObject) => {
        sceneObject.visible = false;
      });
      st.root.removeFromParent();
      home.root.removeFromParent();
      relayRoot.visible = true;
    }
  };

  // Shared actors, made once for the phase. The camera joins the scene so the hands can ride on it.
  useEffect(() => {
    let alive = true,
      made: Baymax | null = null;
    createBaymax()
      .then(async (group) => {
        if (!alive) {
          group.dispose();
          return;
        }
        made = group;
        mem.current.headH = group.headHeight;
        group.root.traverse((sceneObject) => {
          if (sceneObject instanceof THREE.Mesh)
            (Array.isArray(sceneObject.material)
              ? sceneObject.material
              : [sceneObject.material]
            ).forEach((mesh) => {
              mesh.clippingPlanes = [crossing];
            });
        });
        scene.add(group.root);
        await warmStreet(group.root);
        if (!alive) return;
        if (useP6.getState().stage === 'wake') useP6.setState({ since: now() });
        setBaymax(group);
        setCompiled(true);
      })
      .catch(() => {
        if (alive) onError();
      });
    gl.localClippingEnabled = true;
    scene.add(
      camera,
      hiro.root,
      eyeLight,
      eyeLight.target,
      eyeGlow,
      lockBeam,
      contact,
    );
    camera.add(hands.root, cart.root);
    return () => {
      alive = false;
      if (made) made.dispose();
      hiro.dispose();
      hands.dispose();
      cart.dispose();
      home.dispose();
      target.dispose();
      scene.remove(camera, eyeLight, eyeLight.target, eyeGlow, lockBeam, contact);
      contact.geometry.dispose();
      contact.material.map?.dispose();
      contact.material.dispose();
      eyeGlow.material.map?.dispose();
      eyeGlow.material.dispose();
      lockBeam.geometry.dispose();
      (lockBeam.material as THREE.Material).dispose();
    };
  }, [
    scene,
    camera,
    gl,
    hiro,
    hands,
    cart,
    home,
    target,
    eyeLight,
    eyeGlow,
    lockBeam,
    contact,
    crossing,
    onError,
  ]);

  // Sets: build the one in use, drop the last one. The home group lives in its own scene (seen
  // through the gate) until the crossing, then joins the main scene.
  // Tracker R-05: the street is built and its programs compiled while the relay loads (its lights
  // change the light count, which would otherwise recompile every material as the chase starts).
  const preStreet = useRef<Street | null>(null);
  useEffect(
    () => () => {
      preStreet.current?.dispose();
      preStreet.current = null;
    },
    [],
  );
  useEffect(() => {
    const group: NonNullable<typeof env.current> = { name: set };
    if (set === 'relay') {
      group.relay = takePreparedRelay();
      scene.add(group.relay.root);
      scene.background = new THREE.Color('#081320');
      scene.fog = new THREE.Fog('#14293b', 14, 150);
      if (!preStreet.current) preStreet.current = takePreparedStreet();
    }
    if (set === 'street') {
      group.street = preStreet.current ?? takePreparedStreet();
      preStreet.current = null;
      scene.add(group.street.root);
      homeScene.add(home.root);
      scene.background = new THREE.Color('#0a1622');
      scene.fog = new THREE.Fog('#1a3146', 18, 190);
    }
    if (set === 'home') {
      scene.add(home.root);
      scene.background = home.background;
      scene.fog = home.fog;
    }
    env.current = group;
    return () => {
      group.relay?.dispose();
      group.street?.dispose();
      home.root.removeFromParent();
      env.current = null;
    };
  }, [set, scene, home, homeScene]);

  // Lights the sets share: a cool moonlit key, a low sky fill that keeps forms readable without
  // flattening them, and a cold back-rim from the far end of the street that separates Baymax and
  // the gate machinery from the dark facades. The home set brings its own.
  const lights = useMemo(() => {
    const group = new THREE.Group();
    group.add(new THREE.HemisphereLight('#8eb0cc', '#0b1219', 0.74));
    const key = new THREE.DirectionalLight('#c4d8e8', 2.05);
    key.position.set(-8, 16, 6);
    group.add(key);
    const rim = new THREE.DirectionalLight('#9cc4e6', 1.15);
    rim.position.set(9, 7, -24);
    group.add(rim);
    return group;
  }, []);
  useEffect(() => {
    scene.add(lights);
    return () => {
      scene.remove(lights);
    };
  }, [scene, lights]);
  useEffect(() => {
    lights.visible = set !== 'home';
  }, [set, lights]);

  // Drags: the actual combat chip out of his chest and into the reader, then the healthcare chip into his chest.
  const drag = useRef({
    active: false,
    pos: new THREE.Vector3(),
    plane: new THREE.Plane(),
    returning: 0,
    from: new THREE.Vector3(),
    seatAt: 0,
    seatFrom: new THREE.Vector3(),
    seatQ: new THREE.Quaternion(),
  });
  useEffect(() => {
    const el = gl.domElement,
      ray = new THREE.Raycaster(),
      ndc = new THREE.Vector2(),
      hit = new THREE.Vector3();
    const screen = (point: THREE.Vector3) => {
      const vector = point.clone().project(cam);
      return new THREE.Vector2(
        ((vector.x + 1) / 2) * el.clientWidth,
        ((1 - vector.y) / 2) * el.clientHeight,
      );
    };
    type What = 'take' | 'chip' | 'cart';
    const what = (): What | null => {
      const state = useP6.getState(),
        easedProgress = now() - state.since;
      if (state.stage === 'limited' && !state.took && easedProgress > 9.6)
        return 'take';
      if (
        state.stage === 'carry' &&
        state.chip === 'bay' &&
        easedProgress > CLUE_END
      )
        return 'chip';
      if (
        state.stage === 'carry' &&
        state.chip === 'out' &&
        state.cart === 'hand' &&
        now() - state.pulledAt > 4.2
      )
        return 'cart';
      return null;
    };
    const source = (width: What) =>
      width === 'take'
        ? cart.root.getWorldPosition(new THREE.Vector3())
        : width === 'chip'
          ? baymax?.dockWorld()
          : baymax?.combatChip.getWorldPosition(new THREE.Vector3());
    const dest = (width: What) =>
      width === 'cart' ? env.current?.street?.readerWorld() : null;
    const local = (event: PointerEvent) => {
      const result = el.getBoundingClientRect();
      return new THREE.Vector2(
        event.clientX - result.left,
        event.clientY - result.top,
      );
    };
    let holding: What | null = null;
    const down = (event: PointerEvent) => {
      const width = what();
      if (!width || event.button !== 0) return;
      const from = source(width);
      if (!from) return;
      if (screen(from).distanceTo(local(event)) > 80) return;
      // The capture: a click lifts it out of the recorder and into his pocket.
      if (width === 'take') {
        audio.unlock();
        audio.snap();
        useP6.setState({ took: true });
        return;
      }
      audio.unlock();
      holding = width;
      drag.current.active = true;
      drag.current.returning = 0;
      drag.current.pos.copy(from);
      drag.current.from.copy(from);
      // Carry on a plane facing the camera, through the midpoint of the piece and where it goes
      // (the chip comes up toward Hiro, so its plane sits just above the bay).
      const to = dest(width) ?? from.clone().lerp(camera.position, 0.35),
        mid = from.clone().lerp(to, 0.5),
        normalVector = new THREE.Vector3();
      cam.getWorldDirection(normalVector);
      drag.current.plane.setFromNormalAndCoplanarPoint(
        normalVector.negate(),
        mid,
      );
      useP6.setState(width === 'chip' ? { chip: 'held' } : { cart: 'held' });
      el.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag.current.active) {
        const width = what(),
          from = width && source(width);
        el.style.cursor =
          from && screen(from).distanceTo(local(event)) < 80 ? 'grab' : '';
        return;
      }
      el.style.cursor = 'grabbing';
      const screenVector = local(event);
      ndc.set(
        (screenVector.x / el.clientWidth) * 2 - 1,
        -((screenVector.y / el.clientHeight) * 2 - 1),
      );
      ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(drag.current.plane, hit))
        drag.current.pos.copy(hit);
    };
    const up = (event: PointerEvent) => {
      if (!drag.current.active || !holding) return;
      drag.current.active = false;
      el.style.cursor = '';
      const width = holding;
      holding = null;
      if (width === 'chip') {
        // Pulled clear of the dock: it's out, and dark.
        if (screen(drag.current.from).distanceTo(local(event)) > 110) {
          useP6.setState({ chip: 'out', pulledAt: now() });
          audio.snap();
        } else {
          drag.current.returning = 1;
          useP6.setState({ chip: 'bay' });
        }
        return;
      }
      const to = dest(width);
      if (to && screen(to).distanceTo(local(event)) < 90) {
        drag.current.seatAt = now();
        baymax!.combatChip.getWorldPosition(drag.current.seatFrom);
        baymax!.combatChip.getWorldQuaternion(drag.current.seatQ);
        useP6.setState({ cart: 'slot' });
      } else {
        drag.current.returning = 1;
        useP6.setState({ cart: 'hand' });
      }
    };
    const cancel = () => {
      if (!drag.current.active || !holding) return;
      const width = holding;
      holding = null;
      drag.current.active = false;
      drag.current.returning = 1;
      el.style.cursor = '';
      useP6.setState(width === 'chip' ? { chip: 'bay' } : { cart: 'hand' });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [gl, cam, camera, baymax, audio, cart]);

  // Tracker R-07: the healthcare chip goes in the way the combat chip did in Phase 1. Hold on the chip
  // to take it, hold on his chest to open the bay, then guide the chip into the socket (or hold E).
  const care = useRef({
    target: null as 'chip' | 'chest' | null,
    at: 0,
    key: false,
    keyAt: 0,
    aim: null as THREE.Vector2 | null,
    guide: new THREE.Vector3(),
    open: 0,
    progress: 0,
  });
  useEffect(() => {
    const el = gl.domElement,
      vector = care.current;
    const at = (event: PointerEvent) => {
      const result = el.getBoundingClientRect();
      return new THREE.Vector2(
        event.clientX - result.left,
        event.clientY - result.top,
      );
    };
    const screen = (point: THREE.Vector3) => {
      const vector2 = point.clone().project(cam);
      return new THREE.Vector2(
        ((vector2.x + 1) / 2) * el.clientWidth,
        ((1 - vector2.y) / 2) * el.clientHeight,
      );
    };
    const live = () => {
      const state = useP6.getState();
      return state.stage === 'home' && now() - state.since > EMERGE + 2.4
        ? state
        : null;
    };
    const down = (event: PointerEvent) => {
      const state = live();
      if (!state || event.button !== 0 || !baymax) return;
      const screenPoint = at(event);
      if (
        state.care === 'ground' &&
        screen(home.care.chip.getWorldPosition(new THREE.Vector3())).distanceTo(
          screenPoint,
        ) < 90
      ) {
        audio.unlock();
        vector.target = 'chip';
        vector.at = now();
      } else if (
        state.care === 'hand' &&
        screen(baymax.dockWorld()).distanceTo(screenPoint) < 120
      ) {
        audio.unlock();
        vector.target = 'chest';
        vector.at = now();
      }
    };
    const up = () => {
      vector.target = null;
    };
    const move = (event: PointerEvent) => {
      vector.aim = at(event);
    };
    const kd = (event: KeyboardEvent) => {
      if (event.code === 'KeyE' && live() && !vector.key) {
        audio.unlock();
        vector.key = true;
        vector.keyAt = now();
      }
    };
    const ku = (event: KeyboardEvent) => {
      if (event.code === 'KeyE') vector.key = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [gl, cam, baymax, home, audio]);

  // Memory that outlives a stage: where Baymax has got to on the street, step timing, shake, chase events.
  const mem = useRef({
    trail: 0.28,
    stepAt: 0,
    shake: 0,
    landed: false,
    lastStage: '' as Stage | '',
    bayAt: new THREE.Vector3(),
    lift: 0,
    glance: 0,
    headH: 3.1,
    swingAt: -9,
    swung: false,
    wakeFx: 0,
    wakeSince: -1,
    readyIn: 0,
    falls: 0,
    warped: false,
    thirdShot: '',
    pressed: '' as Stage | '',
    idle: 0,
    escSince: -1,
    lat: 0,
    chase: {
      mode: 'stalk' as 'stalk' | 'burst' | 'lunge' | 'stutter',
      at: 0,
      dur: 1.2,
      from: 0,
      to: 0,
      side: 1,
      n: 0,
      scrape: false,
      done: false,
      landed: false,
    },
  });
  const look = useMemo(() => new THREE.Vector3(), []);
  const feet = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const scratchVector = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!baymax || !env.current || env.current.name !== set) return;
    const deltaSeconds = Math.min(delta, 0.05),
      elapsedSeconds = clock.elapsedTime,
      vector = mem.current,
      state = run.current!;
    // The scene counts as shown once its first frames have drawn (tracker T-03): the first one or two
    // can stall for seconds on a cold GPU, and the cover stays up over them.
    let state2 = useP6.getState();
    // The wake's fly-in runs on the frames it draws (tracker T-03): a stalled frame right after the
    // load (shaders, uploads) moves the clock on by one capped step, not by the whole stall.
    if (state2.stage === 'wake' && delta > 0.05 && now() - state2.since < 8) {
      const since = state2.since + (delta - deltaSeconds),
        same = vector.wakeSince === state2.since;
      useP6.setState({ since });
      state2 = useP6.getState();
      if (same) vector.wakeSince = since;
    }
    const easedProgress = now() - state2.since;
    const pose = baymax.pose,
      pose2 = hiro.pose;
    const enter = vector.lastStage !== state2.stage;
    // Each start of the run (and each retry after he catches Hiro) begins it from the top.
    if (state2.stage === 'wake' && vector.wakeSince !== state2.since) {
      vector.wakeSince = state2.since;
      vector.wakeFx = 0;
    }
    if (state2.stage === 'escape' && vector.escSince !== state2.since) {
      vector.escSince = state2.since;
      state.p = 0;
      state.speed = 0;
      vector.trail = -0.05;
      vector.falls = 0;
      vector.swingAt = -9;
      state.misses = 0;
      vector.idle = 0;
      vector.lat = 0;
      Object.assign(vector.chase, {
        mode: 'stalk',
        at: elapsedSeconds,
        dur: 1.4,
        n: 0,
        side: 1,
        landed: false,
        done: false,
      });
    }
    if (enter) {
      hands.controller.setOn(state2.regulator);
      if (state2.stage === 'drop') vector.landed = false;
      if (state2.stage === 'gate') vector.trail = Math.max(vector.trail, 0.4);
      if (state2.stage === 'bloom') vector.warped = false;
      if (state2.stage === 'wake') vector.wakeFx = 0;
      // The switch moments: his thumb on his own remote, the scene still in front of him.
      if (isInsert(state2.stage) && vector.pressed !== state2.stage) {
        vector.pressed = state2.stage;
        const mode =
          state2.stage === 'switchOff'
            ? 'off'
            : state2.stage === 'switchOn2'
              ? 'onFast'
              : 'on';
        const next: Stage =
          state2.stage === 'switchOn1'
            ? 'limited'
            : state2.stage === 'switchOff'
              ? 'flyin'
              : 'drop';
        hands.press(
          () => {
            audio.click();
            useP6.setState({ regulator: mode !== 'off' });
          },
          () => {
            if (useP6.getState().stage === state2.stage) go(next);
          },
          mode === 'onFast' ? 1.6 : 1.1,
        );
      }
      if (!isInsert(state2.stage)) vector.pressed = '';
    }
    // Defaults each frame; the stage below sets what it needs.
    Object.assign(pose, {
      armour: 1,
      overhead: 0,
      limiterOn: state2.regulator ? 1 : 0,
      getUp: 0,
      sit: 0,
      lie: 0,
      lean: 0.08,
      guard: 1,
      punch: 0,
      hold: 0,
      stride: 0,
      dangle: 0,
      thrust: 0,
      sputter: 0,
      open: 0,
      chipGlow: 0,
      chipInBay: state2.chip === 'bay',
      careSeated: state2.care === 'seated',
      eyeGlow: 1,
    });
    pose.tension = set === 'home' ? 0 : state2.regulator ? 0.4 : 1;
    pose.sluggish = state2.regulator && set !== 'home' ? 1 : 0;
    pose.eyes.copy(RED);
    pose.head[0] = pose.head[1] = pose.head[2] = 0;
    baymax.root.rotation.x = 0;
    crossing.constant = 1e4;
    Object.assign(pose2, {
      walk: 0,
      stride: 0,
      lean: 0,
      haul: 0,
      kneel: 0,
      reach: 0,
      look: 0,
    });
    hiro.root.visible = false;
    lockBeam.visible = false;
    let first = true,
      eye = 1.56,
      fov = 62,
      raise = 0.3,
      reach = 0,
      freeLook = 0.12,
      lookRate = 5,
      place = false;
    let jet = 0,
      hum = 0,
      dread = 0,
      near = 0,
      warp = 0,
      crossingFade = 0,
      grip = 0;
    const head = () => baymax.headWorld(scratchVector).clone();

    if (set === 'relay') {
      env.current.relay!.update(elapsedSeconds, deltaSeconds);
      baymax.root.position.copy(BAYMAX_YARD);
      pose.yaw = 0;
      feet.copy(RELAY_SPOT);
      look.copy(head());
      fov = 66;
      if (state2.stage === 'wake') {
        // Tracker R-03/S-05: he comes in hunting (the clock restarts as the cover lifts, so this is seen).
        // A red glow over the dish, then he drops out of the sky, jets roaring and eyes burning, and
        // slams down in the yard: a deep crouch with a fist to the ground, a held beat, then he
        // rises heavily, eyes flaring, and takes a step at Hiro. Hiro backs off. The camera keeps
        // his whole body in frame from the landing on, feet included.
        const fly = span(easedProgress, 1, 3.3),
          land = easedProgress >= 3.3;
        // The receiver's dish hangs over the yard (y 5.7–9.8, just west of the landing), so a straight
        // dive put him through it and the tower's front leg. He drops steeply west of the tower
        // instead, then swoops in low under the dish to land: one cubic, altitude included.
        const arc = ease(fly);
        if (!land) {
          WAKE_PATH.getPoint(arc, baymax.root.position);
          const heading = WAKE_PATH.getTangent(
            Math.min(arc, 0.999),
            scratchVector,
          );
          const towardHiro = Math.atan2(
            feet.x - baymax.root.position.x,
            feet.z - baymax.root.position.z,
          );
          pose.yaw = THREE.MathUtils.lerp(
            Math.atan2(heading.x, heading.z),
            towardHiro,
            span(arc, 0.62, 1),
          );
          // Thrust flares as he pulls out of the dive, so he decelerates into the landing.
          pose.thrust = 0.85 + 0.15 * span(easedProgress, 2.5, 3.2);
          jet = 0.9;
          pose.dangle = 0.7 * (1 - span(easedProgress, 2.9, 3.28));
          pose.lean = 0.6 - span(easedProgress, 2.5, 3.25) * 0.55;
          pose.guard = 0.3;
          if (easedProgress > 2.3 && vector.wakeFx < 1) {
            vector.wakeFx = 1;
            audio.whoosh();
          }
        } else {
          // The landing: a hard crouch, fist down; the hold; the rise; the stance locks; one step in.
          const hold = span(easedProgress, 3.3, 3.45),
            rise = span(easedProgress, 4.05, 5.5),
            step = span(easedProgress, 5.7, 6.5);
          if (easedProgress - deltaSeconds < 3.3) baymax.impact(1.2);
          pose.sit = 0.72 * hold * (1 - rise);
          pose.lean = (0.42 * (1 - rise) + 0.08) * hold + 0.06 * step;
          pose.punch = -0.45 * hold * (1 - span(easedProgress, 3.9, 4.5));
          pose.guard = Math.max(
            0.2 * (1 - span(easedProgress, 3.4, 3.8)),
            backOut((easedProgress - 5.1) / 0.6),
          );
          // The step: one heavy stride at Hiro, stopping well short.
          if (easedProgress > 5.7 && easedProgress < 6.5) {
            pose.stride = 0.9;
            pose.gait = step * Math.PI;
          }
          baymax.root.position.z = BAYMAX_YARD.z + ease(step) * WAKE_STEP;
          if (vector.wakeFx < 2) {
            vector.wakeFx = 2;
            vector.shake = Math.max(vector.shake, reducedMotion ? 0 : 0.8);
            audio.impact();
          }
          if (vector.wakeFx < 3 && easedProgress > 6.35) {
            vector.wakeFx = 3;
            vector.shake = Math.max(vector.shake, reducedMotion ? 0 : 0.3);
            audio.step(0.9);
          }
        }
        // Eyes: burning on the way down, dim in the crouch, then flaring as he looks up at Hiro.
        const flare = Math.sin(Math.PI * span(easedProgress, 4.4, 5.3));
        pose.eyes.copy(RED);
        pose.eyeGlow = land
          ? 0.55 + 0.45 * span(easedProgress, 4.2, 4.7) + flare * 0.5
          : 0.6 + 0.4 * fly;
        // Head: down in the crouch, coming up last, onto Hiro.
        pose.head[0] = land
          ? 0.38 * (1 - span(easedProgress, 4.3, 5.2))
          : (1 - pose.guard) * 0.2;
        pose.head[1] = span(easedProgress, 4.6, 5.4) * 0.1;
        const retreat = span(easedProgress, 5.2, 7);
        feet.x += retreat * 0.8;
        feet.z += retreat * 0.2;
        // Eyes up to the sky and the glow, then down with him to the yard; framed on his middle so his legs and feet stay in shot.
        look
          .copy(head())
          .lerp(
            tertiaryVector(
              baymax.root.position.x,
              1.15,
              baymax.root.position.z,
            ),
            span(easedProgress, 3.2, 3.9) *
              (1 - span(easedProgress, 4.6, 5.6) * 0.45),
          );
        lookRate = 4.5;
        if (easedProgress > 5.12 && easedProgress < 5.2) {
          vector.shake = Math.max(vector.shake, 0.35);
          audio.servo();
        }
        dread =
          0.3 +
          span(easedProgress, 1, 3.4) * 0.35 +
          span(easedProgress, 5.6, 6.5) * 0.15;
      } else if (state2.stage === 'limited') {
        feet.x += 0.8;
        feet.z += 0.2;
        // Keep his boots in frame while he strains against the limiter.
        look
          .copy(head())
          .lerp(
            tertiaryVector(
              baymax.root.position.x,
              1.45,
              baymax.root.position.z,
            ),
            0.55,
          );
        // Back through the actual opening as his limited punch comes in, then turn to the
        // recorder. Stay outside the roof during the hover and never walk through the rear wall.
        if (easedProgress > 6.4)
          along(
            [
              tertiaryVector(5.8, 0, -8.6),
              tertiaryVector(3.6, 0, -8.4),
              tertiaryVector(2.9, 0, -6.2),
              tertiaryVector(2.55, 0, -3.1),
            ],
            span(easedProgress, 6.4, 9.6),
            feet,
          );
        // Each full move falls short. Thrusters starve, the walk is heavy, the punch stops early.
        const fly =
          span(easedProgress, 0.8, 2.2) * (1 - span(easedProgress, 2.6, 3.2));
        pose.thrust = easedProgress > 0.8 && easedProgress < 3.2 ? 0.75 : 0;
        pose.sputter = 1;
        jet = pose.thrust * 0.7;
        pose.dangle = fly;
        baymax.root.position.y =
          fly * 1 + Math.sin(elapsedSeconds * 9) * 0.05 * fly;
        if (easedProgress > 3.2 && easedProgress < 3.26) {
          vector.shake = 0.35;
          audio.step(1);
        }
        // A few heavy steps toward the relay, stopping in the yard, short of the back wall.
        const walk = clamp01((easedProgress - 3.6) / 3.4);
        baymax.root.position.z =
          BAYMAX_YARD.z +
          WAKE_STEP +
          ease(walk) * (BAYMAX_REACH_Z - BAYMAX_YARD.z - WAKE_STEP);
        if (easedProgress > 3.6 && easedProgress < 7) {
          pose.stride = 0.9;
          pose.lean = 0.16;
          const ph = ((easedProgress - 3.6) / 0.85) * Math.PI;
          pose.gait = ph;
          if (Math.floor(ph / Math.PI) !== Math.floor(vector.stepAt)) {
            audio.step(0.85);
            vector.shake = Math.max(vector.shake, 0.16);
          }
          vector.stepAt = ph / Math.PI;
        }
        // Wind up, a slow drive, stop short with the arm shaking, then pull back.
        pose.punch =
          easedProgress < 7
            ? 0
            : easedProgress < 7.6
              ? -0.3 * span(easedProgress, 7, 7.6)
              : easedProgress < 8.7
                ? -0.3 +
                  1.05 *
                    Math.sin(
                      (Math.PI / 2) * clamp01((easedProgress - 7.6) / 1.1),
                    )
                : 0.75 * (1 - span(easedProgress, 8.9, 9.7));
        if (easedProgress > 8.4 && easedProgress < 8.9)
          pose.punch += Math.sin(elapsedSeconds * 60) * 0.02;
        if (easedProgress > 7.6 && easedProgress < 7.66) audio.servo();
        pose.lean =
          easedProgress > 7.4 && easedProgress < 9.2 ? 0.2 : pose.lean;
        dread = 0.45 + span(easedProgress, 3.6, 8.4) * 0.3;
        near = 0.3;
        // Before he goes: the capture, still in the recorder beside him.
        if (easedProgress > 9.6 && !state2.took) {
          look.set(RECORDER.x, 1.05, RECORDER.z);
          lookRate = 3;
          reach = 0.45;
        }
      } else {
        feet.x += 0.8;
        feet.z += 0.2;
        baymax.root.position.z = BAYMAX_YARD.z + WAKE_STEP;
        pose.guard = 1;
        dread = 0.4;
      }
      pose.head[1] += 0.12;
      if (state2.stage !== 'wake' || easedProgress >= 3.3)
        pose.yaw = Math.atan2(
          feet.x - baymax.root.position.x,
          feet.z - baymax.root.position.z,
        );
      raise =
        state2.stage === 'wake' ? 0.2 + span(easedProgress, 3.4, 5) * 0.2 : 0.4;
    }

    if (set === 'street') {
      const st = env.current.street!;
      const powered = atLeast(state2.stage, 'powered') ? 1 : 0;
      const live = ringLive(state2.angles);
      let open = 0,
        flash = 0;
      const socket =
        state2.cart === 'slot' &&
        (state2.stage === 'bloom' || now() - drag.current.seatAt >= 0.7)
          ? 1
          : 0;
      hum = powered
        ? 1
        : live.reduce(
            (firstValue, secondValue) => firstValue + secondValue,
            0,
          ) * 0.15;

      // Baymax down the street: coming on, slowly, the whole time the frame is being worked.
      const onTrail = (progress: number) => {
        const vector2 = ROUTE.getPointAt(clamp01(progress));
        const ahead = ROUTE.getPointAt(clamp01(progress + 0.01));
        baymax.root.position.set(vector2.x, 0, vector2.z);
        pose.yaw = Math.atan2(ahead.x - vector2.x, ahead.z - vector2.z);
      };
      const trudge = (speed: number) => {
        pose.stride = 0.85;
        pose.gait += deltaSeconds * speed * 3.6;
        const step = Math.floor(pose.gait / Math.PI);
        if (step !== vector.stepAt) {
          vector.stepAt = step;
          const depth = baymax.root.position.distanceTo(camera.position);
          audio.step(Math.min(1, 9 / depth));
          if (depth < 16)
            vector.shake = Math.max(
              vector.shake,
              0.28 * (1 - depth / 16) + 0.05,
            );
        }
      };

      if (state2.stage === 'escape') {
        if (state2.caught) {
          state.forward = false;
          state.impulse = 0;
          state.speed = 0;
        }
        const goal = state.forward ? 4.2 : 0;
        state.speed = THREE.MathUtils.damp(
          state.speed,
          goal + state.impulse * 3.5,
          3,
          deltaSeconds,
        );
        state.impulse = Math.max(0, state.impulse - deltaSeconds * 2.2);
        state.p = clamp01(
          state.p + (state.speed * deltaSeconds) / ROUTE_LENGTH,
        );
        // The pursuit runs in beats rather than one flat follow: a heavy stalk, a short thruster
        // burst that eats the gap (sometimes clipping a building on the way), a lunge that only just
        // misses, and the regulator catching him: jets cough, he sags and loses a second. He gains
        // when Hiro stops; he never quite reaches him while Hiro keeps running.
        const scalarValue = ROUTE_LENGTH,
          ch = vector.chase,
          MIN_GAP = 3.6;
        let gap = (state.p - vector.trail) * scalarValue;
        const ce = elapsedSeconds - ch.at;
        const begin = (mode: typeof ch.mode, durationSeconds: number) => {
          ch.mode = mode;
          ch.at = elapsedSeconds;
          ch.dur = durationSeconds;
          ch.from = vector.trail;
          ch.done = false;
        };
        if (!state2.caught && ce > ch.dur) {
          if (ch.mode === 'burst' || ch.mode === 'lunge') {
            ch.n++;
            if (ch.n % 2 === 0) {
              begin('stutter', 1);
              baymax.jolt(0.8);
              audio.falter();
              vector.shake = Math.max(vector.shake, 0.15);
            } else begin('stalk', 0.7);
          } else if (gap < 5 && elapsedSeconds - vector.swingAt > 2.2) {
            begin('lunge', 1.1);
            baymax.lunge(1);
            vector.swingAt = elapsedSeconds;
            vector.swung = false;
            audio.servo();
          } else if (
            gap > 8 ||
            (gap > 5.5 && ch.mode === 'stalk' && ch.n % 3 !== 2)
          ) {
            begin('burst', THREE.MathUtils.clamp(0.9 + gap * 0.04, 1, 1.5));
            ch.side = -ch.side;
            ch.scrape = ch.n % 3 === 1;
            ch.to = Math.min(
              state.p - (MIN_GAP + 0.6) / scalarValue,
              vector.trail +
                Math.max(3, gap - MIN_GAP - 1.2 + state.speed * 0.5) /
                  scalarValue,
            );
            audio.ignite();
          } else begin('stalk', 0.8 + (ch.n % 3) * 0.3);
          if (ch.mode === 'stalk') ch.n++;
        }
        const blendFactor = clamp01((elapsedSeconds - ch.at) / ch.dur);
        let lift = 0,
          lat = 0;
        if (ch.mode === 'stalk' || state2.caught) {
          const bSpeed = gap > 11 ? 4.4 : gap > MIN_GAP + 0.4 ? 3.3 : 0;
          vector.trail = Math.min(
            state.p - MIN_GAP / scalarValue,
            vector.trail + (bSpeed * deltaSeconds) / scalarValue,
          );
          if (bSpeed > 0) trudge(bSpeed / 2);
          else pose.stride = 0.25;
          pose.lean = 0.22;
          pose.guard = 0.8;
          lat = THREE.MathUtils.damp(vector.lat, 0, 2.5, deltaSeconds);
        } else if (ch.mode === 'burst') {
          // Crouch and lean into it, then a low arc on the jets: slow off the ground, fast through
          // the middle, braking hard into the landing. An arc out to one side reads as a chase, not a slide.
          const wind = 0.2,
            factor = clamp01((blendFactor - wind) / (1 - wind)),
            arc = Math.sin(Math.PI * factor);
          vector.trail = Math.min(
            state.p - MIN_GAP / scalarValue,
            THREE.MathUtils.lerp(
              ch.from,
              ch.to,
              THREE.MathUtils.smootherstep(factor, 0, 1),
            ),
          );
          lift = arc * 1.25;
          lat = ch.side * (ch.scrape ? 3.9 : 1.5) * arc;
          pose.sit =
            0.32 *
            Math.sin(Math.PI * clamp01(blendFactor / wind)) *
            (factor > 0 ? 0 : 1);
          pose.dangle = arc * 0.9;
          pose.lean = 0.18 + arc * 0.38;
          pose.guard = 0.6 + 0.3 * (1 - arc);
          // The regulator starves the jets halfway: a cough and a dip, then they catch again.
          const cough = factor > 0.48 && factor < 0.6 ? 1 : 0;
          pose.thrust =
            factor > 0 && factor < 0.92 ? (cough ? 0.18 : 0.9) : 0.15;
          pose.sputter = 1;
          jet = pose.thrust;
          lift -= cough * 0.25;
          if (ch.scrape && !ch.done && factor > 0.45) {
            // Clipping the facade: chunks come off where his shoulder meets the wall, sparks of dust at its foot.
            ch.done = true;
            const at = baymax.root.position.clone(),
              wall = tertiaryVector(ch.side * 6.4, 3.4 + lift, at.z);
            st.impact(wall, true);
            st.debris(
              wall,
              tertiaryVector(-ch.side * 2.2, 1.2, -1.2),
              0.42,
              (hit) => {
                const depth = hit.distanceTo(camera.position);
                audio.crash(Math.min(1, 7 / depth));
                vector.shake = Math.max(vector.shake, Math.min(0.7, 5 / depth));
              },
            );
            st.debris(
              wall.clone().add(tertiaryVector(0, 0.8, 0.5)),
              tertiaryVector(-ch.side * 1.6, 0.6, -0.6),
              0.2,
            );
            st.kickDust(wall.clone().setY(0), 0.6, 0.3);
            audio.crash(0.6);
            vector.shake = Math.max(vector.shake, 0.3);
            state.misses++;
          }
          if (factor >= 1 && !ch.landed) {
            ch.landed = true;
            const depth2 = baymax.root.position.distanceTo(camera.position);
            audio.step(Math.min(1, 9 / depth2));
            vector.shake = Math.max(
              vector.shake,
              0.45 * Math.min(1, 10 / depth2),
            );
            st.kickDust(baymax.root.position.clone().setY(0), 0.7);
          }
          if (factor < 1) ch.landed = false;
        } else if (ch.mode === 'lunge') {
          // A surge forward with the swing, passing just off Hiro's shoulder.
          vector.trail = Math.min(
            state.p - (MIN_GAP - 0.9) / scalarValue,
            ch.from +
              (1.4 * Math.sin((Math.PI / 2) * clamp01(blendFactor / 0.55))) /
                scalarValue,
          );
          lat = THREE.MathUtils.damp(
            vector.lat,
            ch.side * 0.7,
            4,
            deltaSeconds,
          );
          pose.stride = 0.6;
          pose.gait += deltaSeconds * 4;
          pose.thrust = blendFactor > 0.15 && blendFactor < 0.5 ? 0.6 : 0;
          jet = pose.thrust;
        } else {
          // Stutter: the limit bites. The jets choke, the arms drop, he rocks back and twitches, losing ground.
          pose.sputter = 1;
          pose.thrust = Math.sin(elapsedSeconds * 37) > 0.6 ? 0.25 : 0;
          jet = pose.thrust;
          pose.guard = 0.3 + 0.25 * blendFactor;
          pose.lean = -0.06 + 0.2 * blendFactor;
          pose.stride = 0;
          pose.head[2] =
            Math.sin(elapsedSeconds * 23) * 0.07 * (1 - blendFactor);
          pose.eyeGlow =
            0.45 +
            (Math.sin(elapsedSeconds * 31) > 0 ? 0.55 : 0.1) *
              (1 - blendFactor * 0.5);
          lat = THREE.MathUtils.damp(vector.lat, 0, 2, deltaSeconds);
        }
        vector.lat = lat;
        gap = (state.p - vector.trail) * scalarValue;
        onTrail(Math.max(0, vector.trail));
        if (vector.trail < 0)
          baymax.root.position.z =
            ROUTE.getPointAt(0).z - vector.trail * scalarValue;
        baymax.root.position.x += lat;
        baymax.root.position.y = lift;
        // He faces Hiro, not the road: the body turns, the head leads.
        {
          const hp = ROUTE.getPointAt(state.p);
          pose.yaw = Math.atan2(
            hp.x - baymax.root.position.x,
            hp.z - baymax.root.position.z,
          );
        }
        // Close enough, he swings. It always just misses: Hiro is already moving or the arm stops short.
        const sw = elapsedSeconds - vector.swingAt;
        if (sw < 1.1) {
          pose.punch =
            sw < 0.35
              ? -0.35 * span(sw, 0, 0.35)
              : sw < 0.6
                ? -0.35 + 1.4 * span(sw, 0.35, 0.6)
                : 1.05 * (1 - span(sw, 0.6, 1.1));
          pose.lean = 0.3;
          if (!vector.swung && sw > 0.5) {
            vector.swung = true;
            audio.whoosh();
            vector.shake = Math.max(vector.shake, 0.55);
            state.misses++;
            if (fx.hurt.current && !reducedMotion) {
              fx.hurt.current.classList.remove('on');
              void fx.hurt.current.offsetWidth;
              fx.hurt.current.classList.add('on');
            }
          }
        }
        // One facade collapse, then a travelling near-miss into the paving: distinct hazards.
        const FALLS = [0.24, 0.62];
        if (vector.falls < FALLS.length && state.p > FALLS[vector.falls]) {
          const side = vector.falls % 2 ? 1 : -1,
            lead = 5.6 + state.speed * 0.4;
          const land = ROUTE.getPointAt(
            Math.min(1, state.p + lead / ROUTE_LENGTH),
          )
            .setY(0)
            .add(
              tertiaryVector(side * (1.5 + (vector.falls % 3) * 0.45), 0, 0),
            );
          const from = tertiaryVector(side * 7.6, 13.5, land.z + 1.5),
            fall = Math.sqrt((2 * 13) / 15);
          const push = tertiaryVector(
            (land.x - from.x) / fall,
            0,
            (land.z - from.z) / fall,
          );
          if (vector.falls === 0) {
            st.debris(from, push, 0.55, (at) => {
              const depth = at.distanceTo(camera.position);
              audio.crash(Math.min(1, 6 / depth));
              vector.shake = Math.max(vector.shake, Math.min(0.65, 4 / depth));
              state.misses++;
            });
            st.debris(
              from.clone().add(tertiaryVector(0, 1.2, -0.6)),
              push.clone().multiplyScalar(1.08),
              0.22,
            );
          } else {
            st.fire(baymax.fistWorld(new THREE.Vector3()), land);
            audio.whoosh();
            state.misses++;
          }
          vector.falls++;
        }
        const position = ROUTE.getPointAt(state.p);
        feet.set(position.x, 0, position.z);
        const ahead = ROUTE.getPointAt(Math.min(1, state.p + 0.05));
        look
          .copy(ahead)
          .lerp(FRAME, THREE.MathUtils.smoothstep(state.p, 0.75, 1));
        // Glances back over the shoulder at fixed points on the run, and whenever he swings.
        const scalarValue2 = Math.max(
          [0.24, 0.48, 0.72].reduce(
            (acc, at) =>
              Math.max(acc, Math.sin(Math.PI * clamp01((state.p - at) / 0.06))),
            0,
          ),
          sw < 1.2 ? Math.sin(Math.PI * clamp01(sw / 1.2)) * 0.8 : 0,
        );
        vector.glance = THREE.MathUtils.damp(
          vector.glance,
          scalarValue2 * 0.8,
          3.8,
          deltaSeconds,
        );
        if (vector.glance > 0.01)
          look.copy(
            FirstPerson.blend(
              fp.eyeAt(),
              look.clone(),
              baymax.headWorld(scratchVector).clone().setY(2.5),
              vector.glance,
            ),
          );
        freeLook = 0.9 * (1 - vector.glance);
        lookRate = 7;
        fov = 66 + (reducedMotion ? 0 : Math.min(1, vector.shake) * 1.5);
        raise = 0;
        dread = clamp01(1 - (gap - MIN_GAP) / 12);
        near = dread;
        state.gap = gap;
        // Stand still with him on your back and he gets you: the run stops and offers a retry.
        if (!state2.caught) {
          vector.idle =
            gap < MIN_GAP + 0.5 && state.speed < 0.8
              ? vector.idle + deltaSeconds
              : Math.max(0, vector.idle - deltaSeconds * 2);
          if (vector.idle > 1.8) {
            useP6.setState({ caught: true });
            vector.shake = reducedMotion ? 0 : 1;
            audio.crash(1);
            if (fx.hurt.current && !reducedMotion) {
              fx.hurt.current.classList.remove('on');
              void fx.hurt.current.offsetWidth;
              fx.hurt.current.classList.add('on');
            }
          }
        }
        // Caught: he turns to see him, fist drawn back.
        if (state2.caught) {
          dread = 1;
          pose.punch = 0.9;
          look.copy(head());
          freeLook = 0;
          lookRate = 6;
        } else if (state.p > 0.985) go('gate');
      } else if (state2.stage === 'gate' || state2.stage === 'powered') {
        vector.trail = Math.min(0.62, vector.trail + deltaSeconds * 0.0035);
        onTrail(vector.trail);
        trudge(0.6);
        feet.copy(GATE_SPOT);
        look.set(0, FRAME.y + 0.1, FRAME.z);
        freeLook = 0.1;
        raise = 0.15;
        if (state2.stage === 'powered') {
          // It tries: a seam opens in the middle of the ring, flickers, and folds shut. The reader
          // has locked onto something from this side, so there's nowhere for it to open onto.
          // The rings and spokes strain part-way out and snap back.
          const seam =
            Math.sin(Math.PI * span(easedProgress, 0.25, 1.8)) ** 1.5;
          open = seam * 0.3 * (0.85 + 0.15 * Math.sin(elapsedSeconds * 40));
          flash = seam * (0.5 + 0.5 * Math.sin(elapsedSeconds * 31)) * 0.35;
          if (easedProgress > 0.25 && easedProgress - deltaSeconds <= 0.25)
            audio.falter();
          if (easedProgress > 0.9 && easedProgress < 1.6)
            vector.shake = Math.max(vector.shake, 0.18);
          // A last look at it humming, then across to the ladder, up, and out onto the deck.
          const path = [
            GATE_SPOT,
            tertiaryVector(LADDER_X + 0.3, 0, -88.5),
            tertiaryVector(LADDER_X, 0, -88.85),
            tertiaryVector(LADDER_X, DECK.y, -88.85),
            tertiaryVector(LADDER_X + 0.4, DECK.y, -89.7),
            DECK_SPOT,
          ];
          const blendFactor2 =
            easedProgress < 1.2
              ? 0
              : easedProgress < 3.6
                ? span(easedProgress, 1.2, 3.6) * 0.52
                : easedProgress < 5.4
                  ? 0.52 + span(easedProgress, 3.6, 5.4) * 0.2
                  : 0.72 + span(easedProgress, 5.4, 6.4) * 0.28;
          along(path, blendFactor2, feet);
          if (easedProgress > 1.2 && easedProgress < 3.6)
            look.set(LADDER_X, 1.6, -89.2);
          else if (easedProgress >= 3.6 && easedProgress < 5.4)
            look.set(LADDER_X, DECK.y + 1.4, -89.6);
          else if (easedProgress >= 5.4)
            look
              .copy(head())
              .lerp(
                tertiaryVector(0, FRAME.y, FRAME.z),
                1 - span(easedProgress, 5.4, 6.4),
              );
          lookRate = 3;
          if (easedProgress > 6.6) go('choice');
        }
        dread = 0.2;
      } else if (state2.stage === 'choice' || state2.stage === 'switchOff') {
        vector.trail = Math.min(0.62, vector.trail + deltaSeconds * 0.0035);
        onTrail(vector.trail);
        trudge(0.6);
        feet.copy(DECK_SPOT);
        look.copy(head()).setY(2.4);
        raise =
          state2.stage === 'switchOff'
            ? 1
            : 0.35 + span(easedProgress, 2.4, 3) * 0.3;
        dread = 0.3;
      } else if (
        state2.stage === 'flyin' ||
        state2.stage === 'faceoff' ||
        state2.stage === 'switchOn2'
      ) {
        // Full power: up above the roofs, down the street, and stop face to face with Hiro.
        const hover = tertiaryVector(
          LANDING.x,
          HOVER_Y,
          LANDING.z + HOVER_BACK,
        );
        feet.copy(DECK_SPOT);
        const start = ROUTE.getPointAt(clamp01(vector.trail)).setY(0);
        if (state2.stage === 'flyin') {
          if (easedProgress < 0.05) vector.bayAt.copy(start);
          const rise = span(easedProgress, 0.7, 2.3),
            travel = span(easedProgress, 2.2, 5.2);
          const up = vector.bayAt.clone().setY(rise * 9);
          const vector3 = up.clone().add(tertiaryVector(0, 3, -12)),
            vector4 = hover.clone().add(tertiaryVector(0, 4, 9));
          const vector5 =
            travel > 0
              ? new THREE.CubicBezierCurve3(
                  up,
                  vector3,
                  vector4,
                  hover,
                ).getPoint(travel)
              : up;
          baymax.root.position.copy(vector5);
          pose.yaw = Math.PI;
          pose.dangle = 1;
          pose.lean = 0.35 * Math.sin(Math.PI * travel) + 0.05;
          pose.guard = 1 - 0.6 * Math.sin(Math.PI * travel);
          pose.thrust = span(easedProgress, 0.1, 0.7);
          jet = pose.thrust;
          if (easedProgress > 0.1 && easedProgress < 0.16) {
            audio.ignite();
            vector.shake = 0.25;
          }
          look.copy(head());
          lookRate = 4;
          // He pulls up hard in front of the deck: Hiro flinches back a step.
          feet.z = DECK_SPOT.z - span(easedProgress, 4.6, 5.3) * 0.35;
          if (travel > 0.97 && vector.lift === 0) {
            vector.lift = 1;
            st.kickDust(hover.clone().setY(0), 0.7, 1);
            vector.shake = 0.5;
          }
          dread = 0.5 + travel * 0.5;
          near = travel;
          if (easedProgress > 6.2) go('faceoff');
        } else {
          // Hovering on full thrust, never still: a slow drift on two rhythms, the jets pulsing him up
          // and down, and every few seconds a feint at the deck (a surge in, fists tight, then back).
          const cyc = (easedProgress % 3.4) / 3.4,
            feint = Math.sin(Math.PI * clamp01((cyc - 0.55) / 0.3)) ** 2;
          const pulseY =
            Math.sin(elapsedSeconds * 2.2) * 0.06 +
            Math.max(0, Math.sin(elapsedSeconds * 5.3)) * 0.03;
          baymax.root.position
            .copy(hover)
            .add(
              tertiaryVector(
                Math.sin(elapsedSeconds * 0.9) * 0.12 +
                  Math.sin(elapsedSeconds * 0.37) * 0.07,
                pulseY - feint * 0.05,
                -feint * 0.55,
              ),
            );
          const toHiro = Math.atan2(
            DECK_SPOT.x - baymax.root.position.x,
            DECK_SPOT.z - baymax.root.position.z,
          );
          pose.yaw = toHiro + Math.sin(elapsedSeconds * 0.7) * 0.05;
          pose.dangle = 0.3 + feint * 0.15;
          pose.lean =
            0.05 + Math.sin(elapsedSeconds * 1.3) * 0.04 + feint * 0.22;
          pose.guard = 0.45 + feint * 0.45;
          pose.head[0] = feint * 0.1;
          pose.thrust =
            0.92 + 0.08 * Math.sin(elapsedSeconds * 7) + feint * 0.1;
          jet = pose.thrust;
          vector.lift = 1;
          if (feint > 0.9 && vector.wakeFx !== 9) {
            vector.wakeFx = 9;
            audio.servo();
            vector.shake = Math.max(vector.shake, 0.12);
          }
          if (feint < 0.1 && vector.wakeFx === 9) vector.wakeFx = 8;
          // The limit bites (switchOn2, once the bat lands): the jets choke and he jolts.
          if (state2.stage === 'switchOn2' && state2.regulator) {
            pose.sputter = 1;
            pose.thrust = Math.sin(elapsedSeconds * 41) > 0.2 ? 0.5 : 0.1;
            jet = pose.thrust;
            pose.guard = 0.3;
            pose.lean = -0.08;
            baymax.root.position.y -= 0.12;
          }
          feet.z = DECK_SPOT.z - 0.35;
          // Aim at his chest, not his eyes, so his legs and jets stay in frame below the subtitle.
          look.copy(head());
          look.y -= 1.35 * BS;
          raise = state2.stage === 'switchOn2' ? 1 : 0.55;
          dread = 0.9;
          near = 1;
        }
        fov = 68;
      } else if (state2.stage === 'drop') {
        // Thrusters out. The jets choke, he lurches at the deck one last time and his reach falls
        // short; then he drops, tipping onto his back as he falls, hits the paving hard, bounces and
        // slides to a stop where he lies for the rest of the gate site.
        const CHOKE = 0.35,
          group = 11.5,
          y0 = HOVER_Y - 0.12 + 0.12,
          vy0 = 0.7;
        const tLand =
          CHOKE + (vy0 + Math.sqrt(vy0 * vy0 + 2 * group * y0)) / group;
        const fe = Math.max(0, easedProgress - CHOKE);
        const yPosition =
          easedProgress < CHOKE
            ? HOVER_Y - 0.12 + 0.12 * span(easedProgress, 0, CHOKE)
            : easedProgress < tLand
              ? Math.max(0, y0 + vy0 * fe - 0.5 * group * fe * fe)
              : Math.max(
                  0,
                  Math.sin(
                    Math.min(1, (easedProgress - tLand) / 0.28) * Math.PI,
                  ) * 0.09,
                );
        const fall = clamp01((easedProgress - CHOKE) / (tLand - CHOKE));
        const lurch = span(easedProgress, 0, CHOKE + 0.2),
          slide =
            easedProgress > tLand
              ? 1 - Math.exp(-(easedProgress - tLand) * 5)
              : 0;
        baymax.root.position.set(
          LANDING.x,
          yPosition,
          LANDING.z +
            HOVER_BACK * (1 - lurch * 0.55) -
            HOVER_BACK * 0.45 * slide,
        );
        pose.yaw = Math.PI;
        pose.dangle = (1 - fall) * (easedProgress < CHOKE ? 0.4 : 1);
        pose.lie =
          easedProgress < tLand
            ? THREE.MathUtils.smoothstep(fall, 0.1, 1) * 0.9
            : 1;
        pose.guard = 0.4 * (1 - fall);
        pose.punch =
          0.7 * Math.sin(Math.PI * clamp01(easedProgress / (CHOKE + 0.25)));
        pose.thrust =
          easedProgress < CHOKE
            ? (Math.sin(elapsedSeconds * 47) > 0 ? 0.55 : 0.12) *
              (1 - easedProgress / CHOKE)
            : 0;
        pose.sputter = 1;
        jet = pose.thrust;
        if (easedProgress > 0.02 && easedProgress - deltaSeconds <= 0.02)
          audio.falter();
        if (easedProgress > 0.12 && easedProgress - deltaSeconds <= 0.12) {
          st.fire(
            baymax.fistWorld(new THREE.Vector3()),
            tertiaryVector(-6, 0.03, LANDING.z - 2),
          );
          audio.whoosh();
        }
        pose.eyes.copy(RED).lerp(DARK, span(easedProgress, 1.2, 3));
        pose.eyeGlow = 1 - span(easedProgress, 1.2, 3);
        pose.open = clamp01((easedProgress - 4) / 2.5) * 4.6;
        pose.chipGlow = span(easedProgress, 5.8, 7.4);
        // The landing shakes the gate's field: a flare and a flicker across the ring.
        if (vector.landed) {
          const blendFactor3 = Math.exp(-(easedProgress - tLand) * 2.2);
          flash = blendFactor3 * 0.45;
          open =
            blendFactor3 * 0.16 * (0.8 + 0.2 * Math.sin(elapsedSeconds * 40));
        }
        if (!vector.landed && easedProgress >= tLand) {
          vector.landed = true;
          vector.shake = reducedMotion ? 0 : 1;
          audio.impact();
          st.kickDust(LANDING, 1.4);
        }
        feet.copy(DECK_SPOT);
        feet.z -= 0.35;
        // Lean past the deck's right-hand rail for the impact, then return before
        // climbing down to the chest. The railing stays physically in the set.
        feet.x +=
          1.25 *
          span(easedProgress, 0, 0.55) *
          (1 - span(easedProgress, 3.6, 4.5));
        // Leaning over the deck rail to see him, then down to his chest as it opens.
        feet.z += span(easedProgress, 2, 3.5) * 0.35;
        look
          .copy(baymax.root.position)
          .setY(easedProgress < tLand ? yPosition + 2.6 * BS : 0.7)
          .lerp(
            baymax.chestWorld(scratchVector),
            span(easedProgress, 3.2, 5.2),
          );
        lookRate = 3;
        raise = 0.2;
        if (easedProgress > 7.4) go('carry');
      } else if (state2.stage === 'carry') {
        baymax.root.position.copy(LANDING);
        pose.yaw = Math.PI;
        pose.lie = 1;
        pose.guard = 0;
        pose.eyes.copy(DARK);
        pose.eyeGlow = 0;
        pose.open = 4.6;
        pose.chipGlow = state2.chip === 'bay' ? 1 : 0;
        // Approach outside the shoulder, then look down into the upward-facing socket.
        const R0 = LANDING,
          chest = baymax.chestWorld(scratchVector).clone(),
          onHim = tertiaryVector(chest.x - 0.75, 0, chest.z - 0.35),
          approach = tertiaryVector(chest.x - 2.4, 0, chest.z - 1.1);
        raise = 0;
        freeLook = 0;
        if (state2.chip !== 'out') {
          // Down the ladder, across to him, and up onto him to get at the bay.
          const path = [
            DECK_SPOT,
            tertiaryVector(LADDER_X + 0.4, DECK.y, -89.7),
            tertiaryVector(LADDER_X, DECK.y, -88.85),
            tertiaryVector(LADDER_X, 0, -88.85),
            approach,
            onHim,
          ];
          const blendFactor4 =
            easedProgress < 0.8
              ? span(easedProgress, 0, 0.8) * 0.14
              : easedProgress < 2.3
                ? 0.14 + span(easedProgress, 0.8, 2.3) * 0.2
                : easedProgress < 4.3
                  ? 0.34 + span(easedProgress, 2.3, 4.3) * 0.52
                  : 0.86 + span(easedProgress, 4.3, 5.2) * 0.14;
          along(path, blendFactor4, feet);
          look.copy(
            easedProgress < 0.8
              ? tertiaryVector(LADDER_X, DECK.y, -88)
              : easedProgress < 2.3
                ? tertiaryVector(LADDER_X, 0.4, -87.6)
                : baymax.dockWorld(scratchVector),
          );
          eye = THREE.MathUtils.lerp(
            1.56,
            chest.y + 0.55,
            span(easedProgress, 4.4, 5.2),
          );
          lookRate = 3.5;
          reach =
            state2.chip === 'held' ? 1 : easedProgress > CLUE_END ? 0.4 : 0;
          fov = 62 - span(easedProgress, 4.4, 5.2) * 4;
          if (easedProgress > 5.2) look.copy(baymax.dockWorld(scratchVector));
          // The clue: up on him, a look back at the gate, its hub and reader beating red in the
          // chip's rhythm, then back down to the chip.
          const clue = Math.sin(
            Math.PI * clamp01((easedProgress - CLUE_AT) / (CLUE_END - CLUE_AT)),
          );
          if (clue > 0)
            look.copy(
              FirstPerson.blend(
                fp.eyeAt(),
                look.clone(),
                tertiaryVector(0, FRAME.y - 0.9, FRAME.z),
                clue * 0.95,
              ),
            );
        } else {
          // Carry the removed combat chip from Baymax to the reader.
          const scalarValue3 = now() - state2.pulledAt;
          const path = [
            onHim,
            approach,
            tertiaryVector(R0.x + 0.3, 0, R0.z - 2.6),
            READER_SPOT,
          ];
          along(
            path,
            scalarValue3 < 0.7
              ? 0
              : scalarValue3 < 1.5
                ? span(scalarValue3, 0.7, 1.5) * 0.3
                : 0.3 + span(scalarValue3, 1.5, 4.2) * 0.7,
            feet,
          );
          eye = THREE.MathUtils.lerp(
            chest.y + 0.55,
            1.56,
            span(scalarValue3, 0.5, 1.3),
          );
          lookRate = 3;
          look
            .copy(
              scalarValue3 < 1.5
                ? baymax.dockWorld(scratchVector)
                : st.readerWorld(),
            )
            .lerp(
              st.readerWorld().add(tertiaryVector(0, 0.05, 0)),
              span(scalarValue3, 1.6, 4),
            );
          if (scalarValue3 > 4.2)
            look.set(PEDESTAL.x - 0.25, 0.95, PEDESTAL.z - 1.6);
          reach = state2.cart === 'held' ? 1 : scalarValue3 > 2.4 ? 0.55 : 0;
        }
      } else if (state2.stage === 'bloom') {
        baymax.root.position.copy(LANDING);
        pose.yaw = Math.PI;
        pose.lie = 1;
        pose.guard = 0;
        pose.eyes.copy(DARK);
        pose.eyeGlow = 0;
        pose.open = 4.6;
        pose.chipInBay = false;
        pose.overhead = span(easedProgress, 7.4, 8.4);
        open = 1 - Math.pow(1 - span(easedProgress, 0.9, 3.6), 3);
        if (easedProgress > 0.9 && easedProgress < 0.96) audio.bloom();
        feet.copy(READER_SPOT);
        if (easedProgress < 5) {
          look.set(0, FRAME.y - 0.1, FRAME.z);
          lookRate = 2.5;
          reach = 0.3 * (1 - span(easedProgress, 0.6, 1.4));
        } else if (easedProgress < 7.6) {
          // Turn round to him and walk to his feet.
          along(
            [
              READER_SPOT,
              tertiaryVector(1.4, 0, -87.4),
              tertiaryVector(LANDING.x * 0.85, 0, LANDING.z - FEET - LEAD),
            ],
            span(easedProgress, 5.3, 7.6),
            feet,
          );
          look
            .copy(baymax.root.position)
            .setY(0.9)
            .lerp(
              tertiaryVector(LANDING.x, 0.4, LANDING.z - FEET),
              span(easedProgress, 6.6, 7.6),
            );
          lookRate = 3;
        } else {
          // He takes him by the feet and hauls him back: across onto the walkway's line, then
          // straight up it, through the middle of the ring, a braced pull at a time.
          const blendFactor5 = tugged((easedProgress - 8.3) / 10, 10);
          const vector6 = tertiaryVector(LANDING.x, 0, LANDING.z),
            vector7 = tertiaryVector(0, 0, LANDING.z - 1.1),
            cameraAnchor = tertiaryVector(0, 0, CROSS_ROOT_Z - 1.2);
          const root = along([vector6, vector7, cameraAnchor], blendFactor5);
          const cz = root.z + LIE_CENTRE,
            fz = root.z - FEET,
            hz = root.z + LIE_LENGTH - FEET;
          baymax.root.position.set(root.x, rampY(cz), root.z);
          baymax.root.rotation.x = Math.atan2(
            rampY(fz) - rampY(hz),
            LIE_LENGTH,
          );
          // Leaning in, both hands go onto his ankles and stay there for the whole haul.
          grip = span(easedProgress, 7.6, 8.3);
          feet.set(root.x * 0.85, 0, fz - LEAD);
          feet.y = rampY(feet.z);
          eye = 1.56 - grip * 0.03;
          reach = span(easedProgress, 7.6, 8.2) * 0.5;
          look.set(root.x, baymax.root.position.y + 0.6, root.z + 1.3);
          lookRate = 4;
          // One look over his shoulder at the open gate, then back to Baymax.
          const glance = Math.sin(
            Math.PI * clamp01((easedProgress - 12.8) / 1.8),
          );
          if (glance > 0)
            look.copy(
              FirstPerson.blend(
                fp.eyeAt(),
                look.clone(),
                tertiaryVector(0, FRAME.y, FRAME.z - 3),
                glance * 0.9,
              ),
            );
          const pull = Math.floor(clamp01((easedProgress - 8.3) / 10) * 10);
          if (pull !== vector.stepAt && easedProgress > 8.3) {
            vector.stepAt = pull;
            audio.step(0.4);
            vector.shake = Math.max(vector.shake, reducedMotion ? 0 : 0.12);
          }
          // Each tug: a dip and a jolt through his arms, then the brace for the next one.
          const tug = haulEffort((easedProgress - 8.3) / 10, 10);
          if (easedProgress > 8.3) eye -= 0.035 * tug;
          // The surface: the warp grows as his eye reaches it.
          warp = span(-feet.z, -(FRAME.z + 1.25), -FRAME.z);
          if (warp > 0.3 && !vector.warped) {
            vector.warped = true;
            audio.warp();
          }
          if (fp.feet.z <= FRAME.z + 0.02 && easedProgress > 9) go('home');
        }
        crossingFade = span(warp, 0.55, 0.92);
        if (easedProgress > 19.5) {
          crossingFade = 1;
          go('home');
        }
        flash = span(warp, 0.6, 1);
        renderGate(st, open);
      }
      // Extraction and reader seating use the actual card from his dock. Its final transform
      // is applied after the actor and hands update, so neither can move away from the grip.
      pose.chipInBay = state2.chip === 'bay' && drag.current.returning === 0;
      cart.root.visible = false;
      // What the reader is locked onto: Baymax's combat chip. Faint while he's down the street,
      // stronger as he closes, and beating with the chip once his bay is open. Pulled, it lets go.
      const lock =
        !powered || socket
          ? 0
          : state2.stage === 'drop'
            ? Math.max(0.45, pose.chipGlow)
            : state2.stage === 'carry'
              ? state2.chip === 'bay'
                ? 1
                : state2.chip === 'held'
                  ? 0.5
                  : 0
              : state2.stage === 'flyin' ||
                  state2.stage === 'faceoff' ||
                  state2.stage === 'switchOn2'
                ? 0.45
                : state2.stage === 'powered'
                  ? span(easedProgress, 1.2, 2.2) * 0.3
                  : 0.3;
      // The trace: out from the hub to his chest as it locks (powered), then beating with the chip.
      {
        const reach =
          state2.stage === 'powered'
            ? span(easedProgress, 0.9, 1.5) *
              (1 - span(easedProgress, 2.1, 2.5))
            : state2.stage === 'drop' || state2.stage === 'carry'
              ? lock
              : 0;
        const beat = 0.55 + 0.45 * Math.sin(elapsedSeconds * 4);
        lockBeam.visible = reach > 0.01 && !socket;
        if (lockBeam.visible) {
          const from = st.hub.getWorldPosition(new THREE.Vector3()),
            to = baymax.chestWorld(new THREE.Vector3());
          lockBeam.position.copy(from);
          lockBeam.lookAt(to);
          lockBeam.scale.set(
            1,
            1,
            from.distanceTo(to) *
              (state2.stage === 'powered'
                ? THREE.MathUtils.smootherstep(
                    span(easedProgress, 0.9, 1.5),
                    0,
                    1,
                  )
                : 1),
          );
          (lockBeam.material as THREE.MeshBasicMaterial).opacity =
            reach * (state2.stage === 'powered' ? 0.9 : 0.35 * beat);
          if (
            state2.stage === 'powered' &&
            easedProgress > 1.5 &&
            easedProgress - deltaSeconds <= 1.5
          ) {
            audio.contact();
            vector.shake = Math.max(vector.shake, 0.2);
          }
        }
      }
      st.update(elapsedSeconds, deltaSeconds, {
        angles: state2.angles,
        live,
        powered,
        open,
        flash,
        cracked:
          atLeast(state2.stage, 'carry') ||
          (state2.stage === 'drop' && vector.landed)
            ? 1
            : 0,
        socket,
        lock,
        eye: camera.position,
        dread,
      });
      if (state2.stage !== 'flyin')
        vector.lift =
          state2.stage === 'faceoff' || state2.stage === 'switchOn2' ? 1 : 0;
      if (state2.stage !== 'escape')
        state.gap = baymax.root.position.distanceTo(fp.feet);
    } else cart.root.visible = false;

    if (set === 'home') {
      const he = easedProgress - EMERGE - 0.4;
      const gate =
        state2.stage === 'home'
          ? 1 - span(easedProgress, EMERGE - 1.4, EMERGE + 0.6)
          : 0;
      home.update(elapsedSeconds, deltaSeconds, {
        gate,
        careBlink: state2.care === 'seated' ? 0 : 1,
      });
      baymax.root.position.copy(HOME_BAYMAX);
      pose.yaw = Math.PI;
      pose.lie = 1;
      pose.guard = 0;
      pose.eyes.copy(DARK);
      pose.eyeGlow = 0;
      pose.open = 4.6;
      pose.chipInBay = false;
      pose.overhead = 1 - span(easedProgress, EMERGE - 1, EMERGE + 0.5);
      if (state2.stage === 'home' && he < 0) {
        // Through. The rest of him comes out of the gate after Hiro, slides off its lip onto the
        // ground, and the gate closes behind him.
        const blendFactor6 = tugged(easedProgress / (EMERGE - 1.2), 6);
        const root = tertiaryVector(0, 0, HOME_CROSS_ROOT_Z).lerp(
          HOME_BAYMAX,
          blendFactor6,
        );
        const fz = root.z - FEET,
          hz = root.z + LIE_LENGTH - FEET;
        baymax.root.position.set(
          root.x,
          homeFloor(root.z + LIE_CENTRE),
          root.z,
        );
        baymax.root.rotation.x = Math.atan2(
          homeFloor(fz) - homeFloor(hz),
          LIE_LENGTH,
        );
        crossing.normal.set(0, 0, -1);
        crossing.constant = HOME_GATE.z;
        // Still hauling by his ankles until he's clear of the gate, then letting go.
        grip = 1 - span(easedProgress, EMERGE - 1.6, EMERGE - 0.8);
        feet.set(root.x * 0.85, 0, Math.min(HOME_GATE.z - 0.05, fz - LEAD));
        feet.y = homeFloor(feet.z);
        eye = 1.46;
        reach = grip;
        look
          .set(root.x, baymax.root.position.y + 0.6, root.z + 1.3)
          .lerp(
            tertiaryVector(HOME_GATE.x, HOME_GATE.y - 1, HOME_GATE.z),
            span(easedProgress, EMERGE - 2, EMERGE - 0.6) * 0.6,
          );
        lookRate = 3.5;
        raise = 0;
        warp = 1 - span(easedProgress, 0.1, 1.1);
        crossingFade = 1 - span(easedProgress, 0.2, 0.9);
        if (easedProgress > 0.1 && easedProgress < 1.3) pose.chipGlow = 0;
      } else {
        first = false;
        hiro.root.visible = true;
        // The healthcare chip (tracker R-07). Holds: on the chip, then on his chest (E works for both).
        const vector8 = care.current,
          HOLD = 0.8;
        const holding =
          vector8.target ??
          (vector8.key && (state2.care === 'ground' || state2.care === 'hand')
            ? state2.care === 'ground'
              ? 'chip'
              : 'chest'
            : null);
        vector8.progress =
          holding && state2.stage === 'home'
            ? clamp01(
                (now() - (vector8.target ? vector8.at : vector8.keyAt)) / HOLD,
              )
            : 0;
        if (holding && vector8.progress >= 1) {
          vector8.target = null;
          vector8.key = false;
          vector8.progress = 0;
          // He gets up and goes over to the bin for it (home.ts directs the walk).
          if (holding === 'chip' && state2.care === 'ground')
            useP6.setState({ care: 'fetch', fetchAt: now() });
          else if (holding === 'chest' && state2.care === 'hand') {
            useP6.setState({ care: 'open' });
            audio.servo();
            hiro.handWorld(vector8.guide);
          }
        }
        if (state2.care === 'fetch') {
          const factor2 = now() - state2.fetchAt;
          if (factor2 >= FETCH_PICK && factor2 - deltaSeconds < FETCH_PICK)
            audio.snap();
          if (factor2 >= FETCH_END) useP6.setState({ care: 'hand' });
        }
        // The bay opens as it did in Phase 1, and stays open until the boot closes it.
        vector8.open = THREE.MathUtils.clamp(
          vector8.open +
            (state2.care === 'open' || state2.care === 'seated'
              ? deltaSeconds * 2.6
              : -deltaSeconds * 4),
          0,
          4.6,
        );
        // Guiding: the chip follows the pointer on a plane through the socket; near it, it's drawn in and seats.
        if (
          state2.stage === 'home' &&
          state2.care === 'open' &&
          vector8.open > 4
        ) {
          const dock = baymax.dockWorld(new THREE.Vector3()),
            want = vector8.guide.clone();
          if (vector8.key) want.copy(dock);
          else if (vector8.aim) {
            const normalVector = new THREE.Vector3();
            cam.getWorldDirection(normalVector);
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              normalVector.negate(),
              dock,
            );
            const ray = new THREE.Raycaster();
            ray.setFromCamera(
              new THREE.Vector2(
                (vector8.aim.x / size.width) * 2 - 1,
                -((vector8.aim.y / size.height) * 2 - 1),
              ),
              cam,
            );
            ray.ray.intersectPlane(plane, want);
          }
          vector8.guide.lerp(
            want,
            1 - Math.exp(-deltaSeconds * (vector8.key ? 2.5 : 12)),
          );
          const depth3 = vector8.guide.distanceTo(dock);
          if (depth3 < 0.35)
            vector8.guide.lerp(dock, 1 - Math.exp(-deltaSeconds * 8));
          if (depth3 < 0.05) {
            useP6.setState({ care: 'seated' });
            audio.seat();
            go('seated');
          }
        }
        drag.current.pos.copy(vector8.guide);
        const homeShot = directHome(
          home,
          { baymax, hiro },
          {
            stage: state2.stage,
            e: state2.stage === 'home' ? Math.max(0, he) : easedProgress,
            t: elapsedSeconds,
            dt: deltaSeconds,
            care: state2.care,
            fetch: state2.care === 'fetch' ? now() - state2.fetchAt : -1,
            dragPos: drag.current.pos,
            returning: drag.current.returning,
            camera,
            bayOpen: care.current.open,
          },
          {
            chime: () => audio.chime(),
            step: (level) => audio.step(level),
            done: () => go('end'),
          },
          camPos,
          look,
        );
        fov = homeShot.fov;
      }
    }

    // ---------- everything after this is shared
    function renderGate(st: Street, open: number) {
      if (open <= 0) return;
      // The far side, seen from where the camera stands relative to this gate.
      const width = Math.max(
          2,
          Math.floor(size.width * gl.getPixelRatio() * 0.6),
        ),
        height = Math.max(
          2,
          Math.floor(size.height * gl.getPixelRatio() * 0.6),
        );
      if (target.width !== width || target.height !== height)
        target.setSize(width, height);
      homeCam.copy(cam);
      homeCam.position.copy(camera.position).sub(FRAME).add(HOME_GATE);
      home.update(elapsedSeconds, deltaSeconds, { gate: 0, careBlink: 1 });
      const texture = gl.getRenderTarget();
      gl.setRenderTarget(target);
      gl.render(homeScene, homeCam);
      gl.setRenderTarget(texture);
      st.portalMat.uniforms.uView.value = target.texture;
      st.portalMat.uniforms.uRes.value.set(
        size.width * gl.getPixelRatio(),
        size.height * gl.getPixelRatio(),
      );
    }

    if (set === 'relay') {
      const inRec = state2.stage === 'limited' && !state2.took;
      cart.root.visible = inRec;
      cart.root.scale.setScalar(inRec ? 1.9 : 1);
      if (inRec) {
        if (cart.root.parent !== scene) scene.add(cart.root);
        cart.root.position.set(RECORDER.x, 1.06, RECORDER.z);
        cart.root.rotation.set(-Math.PI / 2 + 0.3, 0, 0.4);
        cart.glow.color
          .set('#ffb066')
          .multiplyScalar(1 + 0.6 * Math.sin(elapsedSeconds * 4));
      }
    }
    baymax.update(
      elapsedSeconds,
      state2.stage === 'bloom'
        ? (_x, zPosition) => rampY(zPosition)
        : set === 'home' &&
            state2.stage === 'home' &&
            easedProgress < EMERGE + 0.4
          ? (_x, zPosition) => homeFloor(zPosition)
          : undefined,
    );
    if (set === 'street' || set === 'home') {
      contactBounds.setFromObject(baymax.root);
      contactBounds.getCenter(contactCenter);
      contactBounds.getSize(contactSize);
      const ground =
        set === 'home'
          ? state2.stage === 'home' && easedProgress < EMERGE + 0.4
            ? homeFloor(contactCenter.z)
            : 0.03
          : rampY(contactCenter.z);
      const lift = Math.max(0, contactBounds.min.y - ground);
      const strength =
        baymax.root.visible && !contactBounds.isEmpty()
          ? 0.62 * clamp01(1 - lift / 2.4)
          : 0;
      contact.visible = strength > 0.01;
      contact.material.opacity = strength;
      contact.position.set(contactCenter.x, ground + 0.02, contactCenter.z);
      contact.scale.set(
        contactSize.x * (1.32 + lift * 0.3),
        contactSize.z * (1.32 + lift * 0.3),
        1,
      );
    } else contact.visible = false;
    hiro.update();
    if (grip > 0) {
      // Fit Hiro to the live boots, not the old white-shell foot-length estimate. A crouched,
      // short backward step keeps the wrists within reach while the load advances in pulls.
      const anchor = baymax
        .ankleWorld('L', scratchVector)
        .clone()
        .add(baymax.ankleWorld('R'))
        .multiplyScalar(0.5);
      const heldFeet = tertiaryVector(anchor.x, 0, anchor.z - 0.58);
      if (set === 'home') heldFeet.z = Math.min(HOME_GATE.z - 0.05, heldFeet.z);
      heldFeet.y = set === 'home' ? homeFloor(heldFeet.z) : rampY(heldFeet.z);
      feet.lerp(heldFeet, grip);
      eye = THREE.MathUtils.lerp(
        eye,
        1.12 - haulEffort((easedProgress - 8.3) / 10, 10) * 0.035,
        grip,
      );
      if (state2.stage === 'bloom') {
        warp = span(-feet.z, -(FRAME.z + 1.25), -FRAME.z);
        crossingFade = span(warp, 0.55, 0.92);
      }
    }
    // His eyes: a red spot thrown where he faces, and a glow on the head, while they burn red.
    const red =
      pose.eyeGlow *
      (pose.eyes.r > 0.5 && pose.eyes.g < 0.4 ? 1 : 0) *
      (set === 'home' ? 0 : 1);
    baymax.headWorld(scratchVector);
    eyeGlow.position
      .copy(scratchVector)
      .add(
        tertiaryVector(
          Math.sin(pose.yaw) * 0.55 * BS,
          0,
          Math.cos(pose.yaw) * 0.55 * BS,
        ),
      );
    eyeGlow.visible = red > 0.02;
    (eyeGlow.material as THREE.SpriteMaterial).opacity =
      red * (0.55 + 0.2 * Math.sin(elapsedSeconds * 9)) * (0.6 + dread * 0.6);
    eyeLight.position.copy(eyeGlow.position);
    eyeLight.target.position.copy(
      set === 'street' || set === 'relay' ? camera.position : scratchVector,
    );
    eyeLight.intensity =
      red * (set === 'street' && state2.stage === 'escape' ? 70 : 28);
    audio.set({
      jet: jet || pose.thrust,
      sputter: pose.sputter > 0 && pose.thrust > 0 ? 1 : 0,
      hum: set === 'street' ? hum : 0,
      air: set === 'home' ? 0 : 1,
      calm: set === 'home' ? 1 : 0,
      dread,
      near,
    });
    // The chase is darker: the city light drops and the fog closes in.
    const chase = state2.stage === 'escape' ? 1 : 0;
    // The old portal site is the darkest set: almost dead on arrival, and some light returns once
    // Hiro restores the rings. The portal's own light carries the rest when it opens.
    const site =
      set === 'street' && atLeast(state2.stage, 'gate')
        ? atLeast(state2.stage, 'powered')
          ? 0.55
          : 0.8
        : 0;
    (lights.children[0] as THREE.HemisphereLight).intensity =
      THREE.MathUtils.damp(
        (lights.children[0] as THREE.HemisphereLight).intensity,
        0.74 - chase * 0.46 - site * 0.4,
        2,
        deltaSeconds,
      );
    (lights.children[1] as THREE.DirectionalLight).intensity =
      THREE.MathUtils.damp(
        (lights.children[1] as THREE.DirectionalLight).intensity,
        2.05 - chase * 1.7 - site,
        2,
        deltaSeconds,
      );
    // The back-rim stays partly on in the chase: Baymax moves through edge light, not flat fill.
    (lights.children[2] as THREE.DirectionalLight).intensity =
      THREE.MathUtils.damp(
        (lights.children[2] as THREE.DirectionalLight).intensity,
        1.15 - chase * 0.55,
        2,
        deltaSeconds,
      );
    if (set === 'street' && scene.fog instanceof THREE.Fog) {
      scene.fog.far = THREE.MathUtils.damp(
        scene.fog.far,
        chase ? 85 : 190,
        2,
        deltaSeconds,
      );
      scene.fog.near = chase ? 6 : 18;
      scene.fog.color.set(chase ? '#08111a' : '#1a3146');
      scene.background = chase ? CHASE_SKY : CITY_SKY;
    }

    // Camera: Hiro's eyes, or (home, after the crossing) a camera that drifts within each shot.
    hands.root.visible = first;
    if (first) {
      // A jump of more than a stride is a cut (a new set, a dev skip): place him, don't walk him.
      if (fp.feet.distanceTo(feet) > 1.2 || vector.thirdShot) place = true;
      if (place) fp.place(feet);
      else fp.feet.copy(feet);
      fp.update(cam, deltaSeconds, elapsedSeconds, {
        look,
        eye,
        lookRate,
        steady:
          state2.stage === 'carry' &&
          state2.chip !== 'out' &&
          easedProgress > 5.2,
        pointer: state.pointer,
        freeLook: reducedMotion ? 0 : freeLook,
        onStep: (side, speed) => {
          audio.footstep(side, speed);
        },
      });
      if (state2.stage === 'carry') {
        const draggingCard =
          state2.chip === 'held' ||
          (state2.chip === 'out' && state2.cart === 'held');
        const carryingCard = state2.chip === 'out' && state2.cart === 'hand';
        hands.pose('right', draggingCard || carryingCard ? 'pinch' : null);
        hands.track(draggingCard ? drag.current.pos : null);
        if (carryingCard) reach = 1;
      } else if (grip === 0) {
        hands.pose('right', null);
        hands.track(null);
      }
      hands.update(elapsedSeconds, deltaSeconds, {
        walk: clamp01(fp.speed / 4.2),
        gait: fp.gait,
        raise,
        reach,
      });
      vector.thirdShot = '';
    } else {
      const shot =
        state2.stage === 'boot' || state2.stage === 'end'
          ? state2.stage
          : 'home';
      const cut = shot !== vector.thirdShot;
      vector.thirdShot = shot;
      camera.position.lerp(
        camPos,
        cut || reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 2.4),
      );
      if (cut) cam.userData.look = look.clone();
      const vector9 =
        (cam.userData.look as THREE.Vector3 | undefined) ?? look.clone();
      vector9.lerp(look, cut ? 1 : 1 - Math.exp(-deltaSeconds * 3));
      cam.userData.look = vector9;
      camera.lookAt(vector9);
    }
    if (!first && cam.aspect < 16 / 9)
      fov = THREE.MathUtils.radToDeg(
        2 *
          Math.atan(
            (Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (16 / 9)) /
              cam.aspect,
          ),
      );
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = place
        ? fov
        : THREE.MathUtils.damp(cam.fov, fov, 3, deltaSeconds);
      cam.updateProjectionMatrix();
    }
    // Shake: hard on the fall, on near misses and debris, small on each of his footfalls near Hiro.
    vector.shake = Math.max(0, vector.shake - deltaSeconds * 1.6);
    if (vector.shake > 0 && !reducedMotion) {
      const firstValue2 = vector.shake * vector.shake * 0.1;
      camera.position.add(
        tertiaryVector(
          Math.sin(elapsedSeconds * 61) * firstValue2,
          Math.sin(elapsedSeconds * 73 + 1) * firstValue2,
          Math.sin(elapsedSeconds * 57 + 2) * firstValue2 * 0.5,
        ),
      );
      camera.rotateZ(Math.sin(elapsedSeconds * 47) * firstValue2 * 0.3);
    }
    haul(baymax, camera, first ? grip : 0, fp.feet, fp.eye);
    // One physical combat card: dock -> Hiro's pinch -> reader. Reparenting preserves the
    // live world transform; the last centimetres into the reader are mechanically authored.
    const card = baymax.combatChip,
      stReader = env.current.street;
    if (
      set === 'street' &&
      (state2.stage === 'carry' || state2.stage === 'bloom')
    ) {
      const returnToBay = state2.chip === 'bay' && drag.current.returning > 0;
      if (state2.chip === 'bay' && !returnToBay) {
        if (card.parent !== baymax.dock) baymax.dock.add(card);
        card.position.set(0, 0, 0.004);
        card.quaternion.identity();
        card.scale.setScalar(1);
      } else if (state2.chip === 'out' && state2.cart === 'hand') {
        if (card.parent !== hands.rightSocket) hands.rightSocket.attach(card);
        card.position.lerp(
          tertiaryVector(0.055, 0.065, 0),
          1 - Math.exp(-deltaSeconds * 9),
        );
        const gripQ = hands.rightSocket
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(camera.quaternion);
        card.quaternion.slerp(gripQ, 1 - Math.exp(-deltaSeconds * 9));
        card.scale.setScalar(BS);
        card.visible = true;
        drag.current.returning = Math.max(
          0,
          drag.current.returning - deltaSeconds * 3,
        );
      } else {
        if (card.parent !== scene) scene.attach(card);
        card.scale.setScalar(BS);
        card.visible = true;
        if (state2.cart === 'slot' && stReader) {
          const rotationQuaternion = stReader.readerQuat(),
            normalVector2 = tertiaryVector(0, 1, 0).applyQuaternion(
              rotationQuaternion,
            );
          const seat = stReader
            .readerWorld()
            .addScaledVector(normalVector2, 0.073);
          const age =
            state2.stage === 'bloom'
              ? 1
              : clamp01((now() - drag.current.seatAt) / 0.72);
          card.position.lerpVectors(
            drag.current.seatFrom,
            seat.clone().addScaledVector(normalVector2, 0.12),
            span(age, 0, 0.62),
          );
          card.position.lerp(seat, span(age, 0.62, 1));
          card.quaternion.slerpQuaternions(
            drag.current.seatQ,
            rotationQuaternion,
            ease(age),
          );
          if (state2.stage === 'carry' && age >= 1) {
            audio.seat();
            go('bloom');
          }
        } else if (returnToBay) {
          card.position.lerp(
            baymax.dockWorld(),
            1 - Math.exp(-deltaSeconds * 12),
          );
          card.quaternion.slerp(
            baymax.dock.getWorldQuaternion(new THREE.Quaternion()),
            1 - Math.exp(-deltaSeconds * 12),
          );
          if (card.position.distanceTo(baymax.dockWorld()) < 0.006)
            drag.current.returning = 0;
        } else {
          card.position.lerp(
            drag.current.pos,
            1 - Math.exp(-deltaSeconds * 20),
          );
          card.quaternion.slerp(
            state2.cart === 'held' && stReader
              ? stReader.readerQuat()
              : camera.quaternion,
            1 - Math.exp(-deltaSeconds * 7),
          );
        }
      }
    } else if (card.parent !== baymax.dock) card.visible = false;
    // The crossing: the page warps around the surface.
    if (fx.warp.current)
      fx.warp.current.setAttribute(
        'scale',
        String(reducedMotion ? 0 : warp * 38),
      );
    if (fx.world.current)
      fx.world.current.classList.toggle(
        'p6-warping',
        warp > 0.01 && !reducedMotion,
      );
    if (fx.crossingCover.current)
      fx.crossingCover.current.style.opacity = String(crossingFade);
    state.dread = dread;
    state.hiro = [fp.feet.x, fp.feet.z];
    state.bay = [baymax.root.position.x, baymax.root.position.z];
    if (set === 'relay') state.gap = baymax.root.position.distanceTo(fp.feet);
    // Hints for the drags, placed over the piece and where it goes.
    const hint = (
      el: HTMLDivElement | null,
      point: THREE.Vector3 | null | undefined,
      on: boolean,
    ) => {
      if (!el) return;
      if (!point) {
        el.style.opacity = '0';
        return;
      }
      const vector2 = point.clone().project(camera);
      el.style.opacity = on && vector2.z < 1 ? '1' : '0';
      el.style.transform = `translate(${((vector2.x + 1) / 2) * size.width}px, ${((1 - vector2.y) / 2) * size.height}px)`;
    };
    const st = env.current.street;
    const taking =
      state2.stage === 'limited' && !state2.took && easedProgress > 9.6;
    const pulling = state2.stage === 'carry' && state2.chip !== 'out',
      slotting =
        state2.stage === 'carry' &&
        state2.chip === 'out' &&
        now() - state2.pulledAt > 4.2,
      homing = state2.stage === 'home' && easedProgress > EMERGE + 2.2;
    hint(
      hints.grab.current,
      taking
        ? cart.root.getWorldPosition(new THREE.Vector3())
        : pulling
          ? baymax.dockWorld()
          : slotting
            ? card.getWorldPosition(new THREE.Vector3())
            : homing
              ? home.care.chip.getWorldPosition(new THREE.Vector3())
              : null,
      taking ||
        (pulling && state2.chip === 'bay' && easedProgress > CLUE_END) ||
        (slotting && state2.cart === 'hand') ||
        (homing && state2.care === 'ground'),
    );
    hint(
      hints.drop.current,
      slotting ? st?.readerWorld() : homing ? baymax.dockWorld() : null,
      (slotting && state2.cart === 'held') ||
        (homing && (state2.care === 'hand' || state2.care === 'open')),
    );
    // The hold steps show their progress in the ring and say what to do (as in Phase 1).
    for (const el of [hints.grab.current, hints.drop.current])
      el?.style.setProperty(
        '--hold',
        homing ? care.current.progress.toFixed(3) : '0',
      );
    if (hints.grab.current)
      hints.grab.current.dataset.label =
        homing && state2.care === 'ground' ? 'CLICK + HOLD' : '';
    if (hints.drop.current)
      hints.drop.current.dataset.label = homing
        ? state2.care === 'hand'
          ? 'CLICK + HOLD'
          : state2.care === 'open'
            ? 'GUIDE IT IN · OR HOLD E'
            : ''
        : '';
    vector.lastStage = state2.stage;
  });

  return (
    <SceneQuality
      ready={compiled}
      // Home is the relief: a touch more open than the corrupted street.
      exposure={set === 'home' ? 1.03 : 1}
      manageDpr={false}
      onReady={onReady}
      onError={onError}
    />
  );
}
